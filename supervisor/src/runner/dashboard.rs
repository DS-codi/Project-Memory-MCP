//! DashboardRunner — manages the dashboard web-app process.
//!
//! The dashboard depends on MCP for **feature completeness** but NOT for
//! process survival.  When MCP becomes unavailable, the runner transitions to
//! `Degraded` state (keeping the child process alive); when MCP recovers, it
//! returns to `Running`.  The process is only killed on an explicit `stop()`.
//!
//! The `requires_mcp` config flag disables this degraded-state logic entirely
//! (useful for dev environments where MCP is not running).

use std::process::Stdio;
use std::time::Duration;

use anyhow::Context as _;
use async_trait::async_trait;

use crate::config::DashboardSection;
use crate::control::registry::ServiceStatus;
use crate::runner::{HealthStatus, ServiceRunner};

// ---------------------------------------------------------------------------
// Internal state machine
// ---------------------------------------------------------------------------

enum DashboardState {
    /// Process is not running.
    Stopped,
    /// Process is running and MCP is available (or `requires_mcp = false`).
    Running {
        child: tokio::process::Child,
        pid: u32,
    },
    /// Process is running but MCP is currently unavailable.
    /// The process is intentionally kept alive — this is not an error state.
    Degraded {
        child: tokio::process::Child,
        pid: u32,
    },
}

// ---------------------------------------------------------------------------
// DashboardRunner
// ---------------------------------------------------------------------------

/// Manages the lifecycle of the dashboard process and its MCP-dependency state.
pub struct DashboardRunner {
    config: DashboardSection,
    /// Timeout used for HTTP health probes (milliseconds).
    health_timeout_ms: u64,
    state: DashboardState,
}

impl DashboardRunner {
    /// Create a new `DashboardRunner` from the `[dashboard]` config section.
    ///
    /// `health_timeout_ms` controls how long `health_probe` waits for the
    /// dashboard's `/health` endpoint to respond.
    pub fn new(config: DashboardSection, health_timeout_ms: u64) -> Self {
        Self {
            config,
            health_timeout_ms,
            state: DashboardState::Stopped,
        }
    }

    // -----------------------------------------------------------------------
    // Extra public API
    // -----------------------------------------------------------------------

    /// Notify the runner about MCP connectivity changes.
    ///
    /// * `available = false` — transitions `Running` → `Degraded` (process stays alive).
    /// * `available = true`  — transitions `Degraded` → `Running`.
    ///
    /// This is a no-op when `config.requires_mcp = false` or when the process
    /// is `Stopped`.
    pub fn set_mcp_available(&mut self, available: bool) {
        if !self.config.requires_mcp {
            return;
        }

        // We need to temporarily move out of self.state to reassign a new
        // variant that borrows the same child.  Use a replace pattern.
        let current = std::mem::replace(&mut self.state, DashboardState::Stopped);

        self.state = match (current, available) {
            (DashboardState::Running { child, pid }, false) => {
                DashboardState::Degraded { child, pid }
            }
            (DashboardState::Degraded { child, pid }, true) => {
                DashboardState::Running { child, pid }
            }
            // All other transitions are identity (no change).
            (other, _) => other,
        };
    }

    /// Returns `true` when the process is alive but in the degraded state.
    pub fn is_degraded(&self) -> bool {
        matches!(self.state, DashboardState::Degraded { .. })
    }

    /// Returns the OS PID of the running process, or `None` if stopped.
    pub fn pid(&self) -> Option<u32> {
        match &self.state {
            DashboardState::Running { pid, .. } | DashboardState::Degraded { pid, .. } => {
                Some(*pid)
            }
            DashboardState::Stopped => None,
        }
    }
}

// ---------------------------------------------------------------------------
// ServiceRunner implementation
// ---------------------------------------------------------------------------

#[async_trait]
impl ServiceRunner for DashboardRunner {
    /// Spawn the dashboard process from `config.command` / `args`.
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
            .with_context(|| format!("failed to spawn dashboard process: {}", self.config.command))?;

        let pid = child
            .id()
            .ok_or_else(|| anyhow::anyhow!("spawned dashboard process has no PID"))?;

        // Assign to the supervisor job object so the OS kills this process
        // automatically if the supervisor exits or crashes.
        crate::runner::job_object::adopt(pid);

        self.state = DashboardState::Running { child, pid };
        Ok(())
    }

    /// Kill the dashboard process if it is running (regardless of degraded state).
    async fn stop(&mut self) -> anyhow::Result<()> {
        let current = std::mem::replace(&mut self.state, DashboardState::Stopped);
        match current {
            DashboardState::Running { mut child, .. }
            | DashboardState::Degraded { mut child, .. } => {
                child
                    .kill()
                    .await
                    .context("failed to kill dashboard process")?;
            }
            DashboardState::Stopped => {}
        }
        Ok(())
    }

    /// Return the cached service status (no I/O).
    ///
    /// Both `Running` and `Degraded` map to [`ServiceStatus::Running`] because
    /// the process is alive in both cases.
    async fn status(&self) -> ServiceStatus {
        match self.state {
            DashboardState::Running { .. } | DashboardState::Degraded { .. } => {
                ServiceStatus::Running
            }
            DashboardState::Stopped => ServiceStatus::Stopped,
        }
    }

    /// HTTP GET `http://127.0.0.1:{port}/health` within `health_timeout_ms`.
    ///
    /// Returns [`HealthStatus::Unhealthy`] immediately when stopped.  For both
    /// `Running` and `Degraded`, probes the HTTP endpoint — the degraded
    /// distinction is surfaced via [`is_degraded`](Self::is_degraded), not via
    /// health probe failure.
    async fn health_probe(&self) -> HealthStatus {
        if matches!(self.state, DashboardState::Stopped) {
            return HealthStatus::Unhealthy("not running".into());
        }

        let url = format!("http://127.0.0.1:{}/health", self.config.port);
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
        Ok(format!("http://127.0.0.1:{}", self.config.port))
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::DashboardSection;
    use crate::control::registry::ServiceStatus;
    use crate::runner::HealthStatus;

    fn default_runner() -> DashboardRunner {
        DashboardRunner::new(DashboardSection::default(), 1500)
    }

    #[tokio::test]
    async fn new_runner_is_stopped() {
        let runner = default_runner();
        assert!(runner.pid().is_none());
        assert!(!runner.is_degraded());
        assert!(matches!(runner.status().await, ServiceStatus::Stopped));
    }

    #[tokio::test]
    async fn health_probe_when_stopped_is_unhealthy() {
        let runner = default_runner();
        match runner.health_probe().await {
            HealthStatus::Unhealthy(msg) => assert!(msg.contains("not running")),
            HealthStatus::Healthy => panic!("expected Unhealthy for stopped runner"),
        }
    }

    #[tokio::test]
    async fn stop_when_already_stopped_is_noop() {
        let mut runner = default_runner();
        runner.stop().await.expect("stop() on stopped runner should be Ok(())");
        assert!(matches!(runner.status().await, ServiceStatus::Stopped));
    }

    #[tokio::test]
    async fn discover_endpoint_format() {
        let runner = default_runner();
        let ep = runner
            .discover_endpoint()
            .await
            .expect("discover_endpoint should not fail");
        assert_eq!(ep, format!("http://127.0.0.1:{}", DashboardSection::default().port));
    }

    /// `set_mcp_available(false)` on a Stopped runner must be a no-op
    /// (no panic, state remains Stopped).
    #[tokio::test]
    async fn set_mcp_unavailable_when_stopped_is_noop() {
        let mut runner = default_runner();
        runner.set_mcp_available(false);
        assert!(!runner.is_degraded());
        assert!(matches!(runner.status().await, ServiceStatus::Stopped));
    }

    /// When `requires_mcp = false`, `set_mcp_available` must be a no-op
    /// regardless of state.
    #[tokio::test]
    async fn set_mcp_noop_when_requires_mcp_false() {
        let config = DashboardSection {
            requires_mcp: false,
            ..DashboardSection::default()
        };
        let mut runner = DashboardRunner::new(config, 1500);
        // Even though state is Stopped, the flag must remain false.
        runner.set_mcp_available(false);
        assert!(!runner.is_degraded());
    }

    /// `DashboardSection` defaults must have requires_mcp=true and
    /// the correct platform-dependent command and port.
    #[test]
    fn dashboard_config_defaults() {
        let cfg = DashboardSection::default();
        #[cfg(target_os = "windows")]
        {
            assert_eq!(cfg.command, "cmd");
            assert_eq!(cfg.args[0], "/c");
            assert_eq!(cfg.args[1], "npx");
        }
        #[cfg(not(target_os = "windows"))]
        {
            assert_eq!(cfg.command, "npx");
            assert_eq!(cfg.args[0], "tsx");
        }
        assert!(cfg.requires_mcp);
        assert_eq!(cfg.port, 3001);
    }

    // -----------------------------------------------------------------------
    // Phase 4 tests
    // -----------------------------------------------------------------------

    /// Fresh runner reports `Stopped`, has no PID, and is not degraded.
    #[tokio::test]
    async fn dashboard_runner_new_is_stopped() {
        let runner = default_runner();
        assert!(matches!(runner.status().await, ServiceStatus::Stopped));
        assert_eq!(runner.pid(), None);
        assert!(!runner.is_degraded());
    }

    /// `set_mcp_available(false)` on a `Stopped` runner must be a no-op:
    /// no panic, state remains `Stopped`, `is_degraded()` stays `false`.
    #[tokio::test]
    async fn dashboard_runner_set_mcp_available_when_stopped_noop() {
        let mut runner = default_runner();
        runner.set_mcp_available(false);
        assert!(matches!(runner.status().await, ServiceStatus::Stopped));
        assert!(!runner.is_degraded());
    }

    /// When `requires_mcp = false`, `set_mcp_available(false)` leaves
    /// `is_degraded()` as `false` regardless of state.
    #[tokio::test]
    async fn dashboard_runner_requires_mcp_false_ignores_set_mcp() {
        let config = DashboardSection {
            requires_mcp: false,
            ..DashboardSection::default()
        };
        let mut runner = DashboardRunner::new(config, 1500);
        runner.set_mcp_available(false);
        assert!(!runner.is_degraded());
    }

    /// `discover_endpoint()` returns `http://127.0.0.1:{port}` from config.
    #[tokio::test]
    async fn dashboard_runner_discover_endpoint() {
        let runner = default_runner();
        let ep = runner
            .discover_endpoint()
            .await
            .expect("discover_endpoint should succeed");
        let port = DashboardSection::default().port;
        assert_eq!(ep, format!("http://127.0.0.1:{port}"));
    }
}
