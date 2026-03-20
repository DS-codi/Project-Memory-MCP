//! ConfiguredProcessRunner — manages arbitrary command-based custom services.

use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use anyhow::Context as _;
use async_trait::async_trait;
use tokio::process::Child;
use tokio::time::{Instant, sleep};

use crate::config::{RestartPolicy, ServerDefinition};
use crate::control::registry::ServiceStatus;
use crate::runner::{HealthStatus, ServiceRunner};

enum RunnerInternalState {
    Stopped,
    Running { child: Child, pid: u32 },
}

pub struct ConfiguredProcessRunner {
    service_name: String,
    command: String,
    args: Vec<String>,
    working_dir: Option<std::path::PathBuf>,
    env: std::collections::HashMap<String, String>,
    port: Option<u16>,
    restart_policy: RestartPolicy,
    startup_timeout_ms: u64,
    state: RunnerInternalState,
}

impl ConfiguredProcessRunner {
    pub fn new(cfg: ServerDefinition) -> Self {
        Self {
            service_name: cfg.name.trim().to_string(),
            command: cfg.command,
            args: cfg.args,
            working_dir: cfg.working_dir,
            env: cfg.env,
            port: cfg.port,
            restart_policy: cfg.restart_policy,
            startup_timeout_ms: 30_000,
            state: RunnerInternalState::Stopped,
        }
    }

    pub fn service_name(&self) -> &str {
        &self.service_name
    }

    pub fn port(&self) -> Option<u16> {
        self.port
    }

    pub fn restart_policy(&self) -> RestartPolicy {
        self.restart_policy.clone()
    }

    pub fn pid(&self) -> Option<u32> {
        match self.state {
            RunnerInternalState::Running { pid, .. } => Some(pid),
            RunnerInternalState::Stopped => None,
        }
    }

    pub fn runtime_label(&self) -> &'static str {
        let executable_name = Path::new(&self.command)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or(&self.command)
            .to_ascii_lowercase();

        if matches!(executable_name.as_str(), "node" | "npm" | "npx" | "pnpm" | "yarn") {
            "Node"
        } else {
            "Process"
        }
    }

    async fn wait_for_startup_ready(&mut self) -> anyhow::Result<()> {
        let Some(port) = self.port else {
            return Ok(());
        };

        let deadline = Instant::now() + Duration::from_millis(self.startup_timeout_ms.max(500));

        loop {
            match self.state {
                RunnerInternalState::Running { ref mut child, .. } => {
                    if let Some(status) = child
                        .try_wait()
                        .context("failed to inspect custom service during startup")?
                    {
                        self.state = RunnerInternalState::Stopped;
                        anyhow::bail!(
                            "process exited before port {} became ready (code={:?}, success={})",
                            port,
                            status.code(),
                            status.success()
                        );
                    }
                }
                RunnerInternalState::Stopped => anyhow::bail!("process stopped before becoming ready"),
            }

            if probe_tcp(port).await {
                return Ok(());
            }

            if Instant::now() >= deadline {
                anyhow::bail!(
                    "service {} did not become ready on tcp://127.0.0.1:{} within {} ms",
                    self.service_name,
                    port,
                    self.startup_timeout_ms.max(500)
                );
            }

            sleep(Duration::from_millis(100)).await;
        }
    }

    pub fn is_process_dead(&mut self) -> bool {
        match self.state {
            RunnerInternalState::Running { ref mut child, .. } => {
                matches!(child.try_wait(), Ok(Some(_)))
            }
            RunnerInternalState::Stopped => true,
        }
    }

    pub fn mark_stopped(&mut self) {
        self.state = RunnerInternalState::Stopped;
    }
}

#[async_trait]
impl ServiceRunner for ConfiguredProcessRunner {
    async fn start(&mut self) -> anyhow::Result<()> {
        let mut cmd = tokio::process::Command::new(&self.command);
        cmd.args(&self.args);
        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        if let Some(ref dir) = self.working_dir {
            cmd.current_dir(dir);
        }

        cmd.envs(&self.env);

        let mut child = cmd.spawn().with_context(|| {
            format!(
                "failed to spawn configured service {} using {}",
                self.service_name, self.command
            )
        })?;

        let pid = child
            .id()
            .ok_or_else(|| anyhow::anyhow!("spawned process has no PID"))?;

        if let Some(stdout) = child.stdout.take() {
            crate::runtime_output::spawn_pipe_reader(self.service_name.clone(), "stdout", stdout);
        }
        if let Some(stderr) = child.stderr.take() {
            crate::runtime_output::spawn_pipe_reader(self.service_name.clone(), "stderr", stderr);
        }

        if let Some(port) = self.port {
            crate::runtime_output::emit(
                &self.service_name,
                "status",
                format!("started pid={pid} port={port}"),
            );
        } else {
            crate::runtime_output::emit(
                &self.service_name,
                "status",
                format!("started pid={pid}"),
            );
        }

        crate::runner::job_object::adopt(pid);

        self.state = RunnerInternalState::Running { child, pid };
        if let Err(error) = self.wait_for_startup_ready().await {
            crate::runtime_output::emit(
                &self.service_name,
                "status",
                format!("startup readiness failed: {error}"),
            );
            let _ = self.stop().await;
            return Err(error);
        }

        if let Some(port) = self.port {
            crate::runtime_output::emit(
                &self.service_name,
                "status",
                format!("startup ready on tcp://127.0.0.1:{port}"),
            );
        }

        Ok(())
    }

    async fn stop(&mut self) -> anyhow::Result<()> {
        match self.state {
            RunnerInternalState::Running { ref mut child, .. } => {
                match child.try_wait() {
                    Ok(Some(_)) => {}
                    Ok(None) => {
                        child.kill().await.with_context(|| {
                            format!("failed to kill configured service {}", self.service_name)
                        })?;
                    }
                    Err(error) => {
                        return Err(error).context(format!(
                            "failed to inspect configured service {} before stop",
                            self.service_name
                        ));
                    }
                }
                self.state = RunnerInternalState::Stopped;
                crate::runtime_output::emit(&self.service_name, "status", "stopped");
            }
            RunnerInternalState::Stopped => {}
        }
        Ok(())
    }

    async fn status(&self) -> ServiceStatus {
        match self.state {
            RunnerInternalState::Running { .. } => ServiceStatus::Running,
            RunnerInternalState::Stopped => ServiceStatus::Stopped,
        }
    }

    async fn health_probe(&self) -> HealthStatus {
        if matches!(self.state, RunnerInternalState::Stopped) {
            return HealthStatus::Unhealthy("not running".into());
        }

        match self.port {
            Some(port) => {
                if probe_tcp(port).await {
                    HealthStatus::Healthy
                } else {
                    HealthStatus::Unhealthy(format!(
                        "tcp://127.0.0.1:{port} is not reachable"
                    ))
                }
            }
            None => HealthStatus::Healthy,
        }
    }

    async fn discover_endpoint(&self) -> anyhow::Result<String> {
        if let Some(port) = self.port {
            Ok(format!("tcp://127.0.0.1:{port}"))
        } else {
            anyhow::bail!(
                "configured service {} has no declared port",
                self.service_name
            )
        }
    }
}

async fn probe_tcp(port: u16) -> bool {
    tokio::time::timeout(
        Duration::from_secs(3),
        tokio::net::TcpStream::connect(format!("127.0.0.1:{port}")),
    )
    .await
    .map(|result| result.is_ok())
    .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{RestartPolicy, ServerDefinition};

    fn make_runner(command: &str) -> ConfiguredProcessRunner {
        ConfiguredProcessRunner::new(ServerDefinition {
            name: "test-service".to_string(),
            command: command.to_string(),
            args: Vec::new(),
            working_dir: None,
            env: std::collections::HashMap::new(),
            port: None,
            restart_policy: RestartPolicy::AlwaysRestart,
        })
    }

    #[test]
    fn runtime_label_node_for_npm() {
        let runner = make_runner("npm");
        assert_eq!(runner.runtime_label(), "Node");
    }

    #[test]
    fn runtime_label_node_for_npx() {
        let runner = make_runner("npx");
        assert_eq!(runner.runtime_label(), "Node");
    }

    #[test]
    fn runtime_label_node_for_yarn() {
        let runner = make_runner("yarn");
        assert_eq!(runner.runtime_label(), "Node");
    }

    #[test]
    fn runtime_label_process_for_python() {
        let runner = make_runner("python");
        assert_eq!(runner.runtime_label(), "Process");
    }

    #[test]
    fn runtime_label_process_for_arbitrary_binary() {
        let runner = make_runner("my-server-binary");
        assert_eq!(runner.runtime_label(), "Process");
    }

    #[test]
    fn runtime_label_node_for_full_path_npm() {
        // runtime_label uses the file stem, so full paths should still resolve.
        let runner = make_runner("/usr/local/bin/npm");
        assert_eq!(runner.runtime_label(), "Node");
    }

    #[test]
    fn pid_is_none_when_stopped() {
        let runner = make_runner("npm");
        assert!(runner.pid().is_none());
    }

    #[test]
    fn is_process_dead_when_stopped() {
        let mut runner = make_runner("npm");
        assert!(runner.is_process_dead());
    }

    #[test]
    fn mark_stopped_clears_state() {
        let mut runner = make_runner("npm");
        // Already stopped; mark_stopped should be a no-op and not panic.
        runner.mark_stopped();
        assert!(runner.pid().is_none());
        assert!(runner.is_process_dead());
    }

    #[test]
    fn service_name_reflects_trimmed_config_name() {
        let runner = ConfiguredProcessRunner::new(ServerDefinition {
            name: "  mobile-app  ".to_string(),
            command: "npm".to_string(),
            args: Vec::new(),
            working_dir: None,
            env: std::collections::HashMap::new(),
            port: None,
            restart_policy: RestartPolicy::AlwaysRestart,
        });
        assert_eq!(runner.service_name(), "mobile-app");
    }

    #[test]
    fn port_is_accessible_from_config() {
        let runner = ConfiguredProcessRunner::new(ServerDefinition {
            name: "vite-app".to_string(),
            command: "npm".to_string(),
            args: vec!["run".to_string(), "dev".to_string()],
            working_dir: None,
            env: std::collections::HashMap::new(),
            port: Some(5173),
            restart_policy: RestartPolicy::AlwaysRestart,
        });
        assert_eq!(runner.port(), Some(5173));
    }

    #[test]
    fn port_is_none_when_unset() {
        let runner = make_runner("my-headless-server");
        assert!(runner.port().is_none());
    }
}