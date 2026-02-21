//! InteractiveTerminalRunner — supervisor for the interactive terminal GUI process.
//!
//! The `interactive-terminal` binary is a Qt GUI application that also exposes
//! a TCP server on a configurable port.  The supervisor starts exactly **one**
//! `interactive-terminal` process and keeps it alive for the lifetime of the
//! supervisor.

use std::process::Stdio;

use anyhow::Context as _;
use async_trait::async_trait;
use tokio::process::Child;

use crate::config::InteractiveTerminalSection;
use crate::control::registry::ServiceStatus;
use crate::runner::{HealthStatus, ServiceRunner};

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

enum RunnerState {
    Stopped,
    Running { child: Child, pid: u32 },
}

// ---------------------------------------------------------------------------
// InteractiveTerminalRunner
// ---------------------------------------------------------------------------

/// Manages the lifecycle of a single `interactive-terminal` GUI + TCP-server process.
pub struct InteractiveTerminalRunner {
    config: InteractiveTerminalSection,
    state: RunnerState,
}

impl InteractiveTerminalRunner {
    /// Create a new runner from the `[interactive_terminal]` config section.
    pub fn new(config: InteractiveTerminalSection) -> Self {
        Self {
            config,
            state: RunnerState::Stopped,
        }
    }

    /// Returns the OS PID of the running process, or `None` if stopped.
    pub fn pid(&self) -> Option<u32> {
        match self.state {
            RunnerState::Running { pid, .. } => Some(pid),
            RunnerState::Stopped => None,
        }
    }
}

// ---------------------------------------------------------------------------
// ServiceRunner implementation
// ---------------------------------------------------------------------------

#[async_trait]
impl ServiceRunner for InteractiveTerminalRunner {
    /// Spawn the `interactive-terminal` process.
    ///
    /// Passes `--port <port>` automatically unless the caller has already
    /// included `--port` in `config.args`.
    async fn start(&mut self) -> anyhow::Result<()> {
        if matches!(self.state, RunnerState::Running { .. }) {
            return Ok(()); // already running — idempotent
        }

        let mut cmd = tokio::process::Command::new(&self.config.command);

        // Inject --port if the user hasn't supplied it explicitly in args.
        let has_port_flag = self.config.args.windows(2).any(|w| w[0] == "--port");
        if !has_port_flag {
            cmd.arg("--port").arg(self.config.port.to_string());
        }

        cmd.args(&self.config.args);
        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        if let Some(ref dir) = self.config.working_dir {
            cmd.current_dir(dir);
        }

        cmd.envs(&self.config.env);

        let child = cmd.spawn().with_context(|| {
            format!(
                "failed to spawn interactive-terminal process: {}",
                self.config.command
            )
        })?;

        let pid = child
            .id()
            .ok_or_else(|| anyhow::anyhow!("spawned interactive-terminal process has no PID"))?;

        self.state = RunnerState::Running { child, pid };
        Ok(())
    }

    /// Kill the `interactive-terminal` process if it is running.
    async fn stop(&mut self) -> anyhow::Result<()> {
        match self.state {
            RunnerState::Running { ref mut child, .. } => {
                child
                    .kill()
                    .await
                    .context("failed to kill interactive-terminal process")?;
                self.state = RunnerState::Stopped;
            }
            RunnerState::Stopped => {}
        }
        Ok(())
    }

    /// Return the cached service status without performing any I/O.
    async fn status(&self) -> ServiceStatus {
        match self.state {
            RunnerState::Running { .. } => ServiceStatus::Running,
            RunnerState::Stopped => ServiceStatus::Stopped,
        }
    }

    /// Probe the TCP port to verify the server is accepting connections.
    ///
    /// Returns [`HealthStatus::Healthy`] on a successful TCP connect,
    /// [`HealthStatus::Unhealthy`] with a reason string otherwise.
    async fn health_probe(&self) -> HealthStatus {
        if matches!(self.state, RunnerState::Stopped) {
            return HealthStatus::Unhealthy("not running".into());
        }

        let addr = format!("127.0.0.1:{}", self.config.port);
        match tokio::net::TcpStream::connect(&addr).await {
            Ok(_) => HealthStatus::Healthy,
            Err(e) => HealthStatus::Unhealthy(format!("TCP connect to {addr} failed: {e}")),
        }
    }

    /// Returns the endpoint URL (`http://127.0.0.1:{port}`).
    async fn discover_endpoint(&self) -> anyhow::Result<String> {
        Ok(format!("http://127.0.0.1:{}", self.config.port))
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::InteractiveTerminalSection;
    use crate::control::registry::ServiceStatus;
    use crate::runner::HealthStatus;

    fn default_runner() -> InteractiveTerminalRunner {
        InteractiveTerminalRunner::new(InteractiveTerminalSection::default())
    }

    #[tokio::test]
    async fn new_runner_is_stopped() {
        let runner = default_runner();
        assert!(matches!(runner.status().await, ServiceStatus::Stopped));
        assert!(runner.pid().is_none());
    }

    #[tokio::test]
    async fn new_runner_health_probe_unhealthy() {
        let runner = default_runner();
        match runner.health_probe().await {
            HealthStatus::Unhealthy(msg) => assert!(msg.contains("not running")),
            HealthStatus::Healthy => panic!("expected Unhealthy when not started"),
        }
    }

    #[tokio::test]
    async fn stop_when_stopped_is_noop() {
        let mut runner = default_runner();
        runner
            .stop()
            .await
            .expect("stop() when already stopped should be Ok(())");
        assert!(matches!(runner.status().await, ServiceStatus::Stopped));
    }

    #[tokio::test]
    async fn discover_endpoint_format() {
        let runner = default_runner();
        let ep = runner
            .discover_endpoint()
            .await
            .expect("discover_endpoint should not fail");
        let port = InteractiveTerminalSection::default().port;
        assert_eq!(ep, format!("http://127.0.0.1:{port}"));
    }

    /// Verify that `--port` is auto-injected when absent from `config.args`.
    #[test]
    fn port_flag_injection_when_missing() {
        let cfg = InteractiveTerminalSection {
            args: vec!["--debug".to_string()],
            ..InteractiveTerminalSection::default()
        };
        let has_port = cfg.args.windows(2).any(|w| w[0] == "--port");
        assert!(!has_port, "args without --port should trigger auto-injection");
    }

    /// Verify that `--port` is NOT duplicated when already present.
    #[test]
    fn port_flag_not_duplicated_when_present() {
        let cfg = InteractiveTerminalSection {
            args: vec!["--port".to_string(), "9100".to_string()],
            ..InteractiveTerminalSection::default()
        };
        let has_port = cfg.args.windows(2).any(|w| w[0] == "--port");
        assert!(has_port, "args with --port should skip auto-injection");
    }
}

