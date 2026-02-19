//! NodeRunner — spawns a local Node.js MCP server process and health-probes it.

use std::process::Stdio;
use std::time::Duration;

use anyhow::Context as _;
use async_trait::async_trait;
use tokio::process::Child;

use crate::config::NodeRunnerConfig;
use crate::control::registry::ServiceStatus;
use crate::runner::{HealthStatus, ServiceRunner};

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

enum RunnerInternalState {
    Stopped,
    Running { child: Child, pid: u32 },
}

// ---------------------------------------------------------------------------
// NodeRunner
// ---------------------------------------------------------------------------

/// Manages the lifecycle of a local Node.js MCP server process.
pub struct NodeRunner {
    config: NodeRunnerConfig,
    health_timeout_ms: u64,
    port: u16,
    state: RunnerInternalState,
}

impl NodeRunner {
    /// Create a new `NodeRunner` from the node sub-config plus shared MCP settings.
    pub fn new(config: NodeRunnerConfig, health_timeout_ms: u64, port: u16) -> Self {
        Self {
            config,
            health_timeout_ms,
            port,
            state: RunnerInternalState::Stopped,
        }
    }

    /// Returns the OS PID of the running process, or `None` if stopped.
    pub fn pid(&self) -> Option<u32> {
        match self.state {
            RunnerInternalState::Running { pid, .. } => Some(pid),
            RunnerInternalState::Stopped => None,
        }
    }
}

// ---------------------------------------------------------------------------
// ServiceRunner implementation
// ---------------------------------------------------------------------------

#[async_trait]
impl ServiceRunner for NodeRunner {
    /// Spawn the Node.js process.
    ///
    /// Builds a [`tokio::process::Command`] from the runner config, attaches
    /// piped stdout/stderr, and stores the running child + pid.
    async fn start(&mut self) -> anyhow::Result<()> {
        let mut cmd = tokio::process::Command::new(&self.config.command);
        cmd.args(&self.config.args);
        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        if let Some(ref dir) = self.config.working_dir {
            cmd.current_dir(dir);
        }

        cmd.envs(&self.config.env);

        let child = cmd
            .spawn()
            .with_context(|| format!("failed to spawn node process: {}", self.config.command))?;

        let pid = child
            .id()
            .ok_or_else(|| anyhow::anyhow!("spawned process has no PID"))?;

        self.state = RunnerInternalState::Running { child, pid };
        Ok(())
    }

    /// Kill the Node.js process if it is running.
    async fn stop(&mut self) -> anyhow::Result<()> {
        match self.state {
            RunnerInternalState::Running { ref mut child, .. } => {
                child.kill().await.context("failed to kill node process")?;
                self.state = RunnerInternalState::Stopped;
            }
            RunnerInternalState::Stopped => {}
        }
        Ok(())
    }

    /// Return the cached service status without performing any I/O.
    async fn status(&self) -> ServiceStatus {
        match self.state {
            RunnerInternalState::Running { .. } => ServiceStatus::Running,
            RunnerInternalState::Stopped => ServiceStatus::Stopped,
        }
    }

    /// Probe `GET http://127.0.0.1:{port}/health` within `health_timeout_ms`.
    ///
    /// Returns [`HealthStatus::Healthy`] for any 2xx response, or
    /// [`HealthStatus::Unhealthy`] with the error reason string otherwise.
    async fn health_probe(&self) -> HealthStatus {
        if matches!(self.state, RunnerInternalState::Stopped) {
            return HealthStatus::Unhealthy("not running".into());
        }

        let url = format!("http://127.0.0.1:{}/health", self.port);
        let timeout = Duration::from_millis(self.health_timeout_ms);

        let client = match reqwest::Client::builder().timeout(timeout).build() {
            Ok(c) => c,
            Err(e) => {
                return HealthStatus::Unhealthy(format!("failed to build HTTP client: {e}"))
            }
        };

        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => HealthStatus::Healthy,
            Ok(resp) => HealthStatus::Unhealthy(format!("HTTP {}", resp.status())),
            Err(e) => HealthStatus::Unhealthy(e.to_string()),
        }
    }

    /// Returns `http://127.0.0.1:{port}`.
    async fn discover_endpoint(&self) -> anyhow::Result<String> {
        Ok(format!("http://127.0.0.1:{}", self.port))
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::control::registry::ServiceStatus;
    use crate::runner::HealthStatus;

    /// A freshly constructed NodeRunner must be in the Stopped state with no PID.
    #[tokio::test]
    async fn node_runner_new_defaults() {
        let runner = NodeRunner::new(NodeRunnerConfig::default(), 1500, 3000);
        assert!(runner.pid().is_none(), "pid should be None when Stopped");
        assert!(
            matches!(runner.status().await, ServiceStatus::Stopped),
            "status should be Stopped after construction"
        );
    }

    /// discover_endpoint() must return the correctly formatted URL for the
    /// configured port without performing any I/O.
    #[tokio::test]
    async fn node_runner_discover_endpoint_format() {
        let runner = NodeRunner::new(NodeRunnerConfig::default(), 1500, 3000);
        let endpoint = runner
            .discover_endpoint()
            .await
            .expect("discover_endpoint should not fail");
        assert_eq!(endpoint, "http://127.0.0.1:3000");
    }

    /// Calling stop() on an already-Stopped runner must be a no-op that
    /// returns Ok(()) without panicking.
    #[tokio::test]
    async fn node_runner_stop_when_stopped_is_noop() {
        let mut runner = NodeRunner::new(NodeRunnerConfig::default(), 1500, 3000);
        let result = runner.stop().await;
        assert!(result.is_ok(), "stop() on a stopped runner should return Ok(())");
        // Status must remain Stopped.
        assert!(matches!(runner.status().await, ServiceStatus::Stopped));
    }

    /// health_probe() on a stopped runner must return Unhealthy with a reason
    /// that explains the process is not running.
    #[tokio::test]
    async fn node_runner_health_probe_when_stopped() {
        let runner = NodeRunner::new(NodeRunnerConfig::default(), 1500, 3000);
        match runner.health_probe().await {
            HealthStatus::Unhealthy(reason) => {
                assert!(
                    reason.contains("not running"),
                    "expected 'not running' in Unhealthy reason, got: {reason:?}"
                );
            }
            HealthStatus::Healthy => panic!("expected Unhealthy for a stopped runner"),
        }
    }
}
