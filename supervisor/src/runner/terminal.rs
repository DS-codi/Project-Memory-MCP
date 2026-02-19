//! InteractiveTerminalRunner — per-client terminal process lifecycle.
//!
//! One `tokio::process::Child` is maintained per VS Code window, keyed by
//! `client_id` (as registered in the client registry).  The `ServiceRunner`
//! trait methods operate on the pool as a whole; per-client operations are
//! exposed as additional public methods.

use std::collections::HashMap;
use std::process::Stdio;

use anyhow::Context as _;
use async_trait::async_trait;

use crate::config::InteractiveTerminalSection;
use crate::control::registry::ServiceStatus;
use crate::runner::{HealthStatus, ServiceRunner};

// ---------------------------------------------------------------------------
// InteractiveTerminalRunner
// ---------------------------------------------------------------------------

/// Manages a pool of interactive terminal processes — one per VS Code client.
pub struct InteractiveTerminalRunner {
    config: InteractiveTerminalSection,
    /// Map from `client_id` → running child process.
    clients: HashMap<String, tokio::process::Child>,
}

impl InteractiveTerminalRunner {
    /// Create a new runner from the `[interactive_terminal]` config section.
    pub fn new(config: InteractiveTerminalSection) -> Self {
        Self {
            config,
            clients: HashMap::new(),
        }
    }

    /// Returns the number of currently alive client processes.
    pub fn active_count(&self) -> usize {
        self.clients.len()
    }

    /// Spawn a terminal process for `client_id` if one does not already exist.
    ///
    /// Idempotent: if a process for `client_id` is already running, this is a
    /// no-op and returns `Ok(())`.
    pub async fn start_for_client(&mut self, client_id: &str) -> anyhow::Result<()> {
        if self.clients.contains_key(client_id) {
            return Ok(());
        }

        let mut cmd = tokio::process::Command::new(&self.config.command);
        cmd.args(&self.config.args);
        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        if let Some(ref dir) = self.config.working_dir {
            cmd.current_dir(dir);
        }

        cmd.envs(&self.config.env);

        let child = cmd.spawn().with_context(|| {
            format!(
                "failed to spawn interactive-terminal process for client {client_id}: {}",
                self.config.command
            )
        })?;

        self.clients.insert(client_id.to_string(), child);
        Ok(())
    }

    /// Kill and remove the terminal process for `client_id`.
    ///
    /// Idempotent: if no process exists for `client_id`, returns `Ok(())`.
    pub async fn stop_for_client(&mut self, client_id: &str) -> anyhow::Result<()> {
        if let Some(mut child) = self.clients.remove(client_id) {
            child
                .kill()
                .await
                .with_context(|| format!("failed to kill terminal process for client {client_id}"))?;
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// ServiceRunner implementation
// ---------------------------------------------------------------------------

#[async_trait]
impl ServiceRunner for InteractiveTerminalRunner {
    /// No-op: processes are managed individually via `start_for_client`.
    async fn start(&mut self) -> anyhow::Result<()> {
        Ok(())
    }

    /// Kill all active client processes and clear the pool.
    async fn stop(&mut self) -> anyhow::Result<()> {
        let client_ids: Vec<String> = self.clients.keys().cloned().collect();
        for id in client_ids {
            if let Some(mut child) = self.clients.remove(&id) {
                // Best-effort kill; log but do not fail on partial errors.
                let _ = child.kill().await;
            }
        }
        Ok(())
    }

    /// Return `Running` if at least one client process is active, `Stopped` otherwise.
    async fn status(&self) -> ServiceStatus {
        if self.clients.is_empty() {
            ServiceStatus::Stopped
        } else {
            ServiceStatus::Running
        }
    }

    /// Return `Healthy` if at least one client is active, `Unhealthy` otherwise.
    async fn health_probe(&self) -> HealthStatus {
        if self.clients.is_empty() {
            HealthStatus::Unhealthy("no clients".into())
        } else {
            HealthStatus::Healthy
        }
    }

    /// Returns the shared endpoint URL (`http://127.0.0.1:{port}`).
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
        assert_eq!(runner.active_count(), 0);
        assert!(matches!(runner.status().await, ServiceStatus::Stopped));
    }

    #[tokio::test]
    async fn new_runner_health_probe_unhealthy() {
        let runner = default_runner();
        match runner.health_probe().await {
            HealthStatus::Unhealthy(msg) => assert!(msg.contains("no clients")),
            HealthStatus::Healthy => panic!("expected Unhealthy with no clients"),
        }
    }

    #[tokio::test]
    async fn start_noop() {
        let mut runner = default_runner();
        runner.start().await.expect("start should be a no-op Ok(())");
        assert_eq!(runner.active_count(), 0);
    }

    #[tokio::test]
    async fn stop_for_client_unknown_is_noop() {
        let mut runner = default_runner();
        runner
            .stop_for_client("nonexistent")
            .await
            .expect("stop_for_client on unknown id should be Ok(())");
        assert_eq!(runner.active_count(), 0);
    }

    #[tokio::test]
    async fn stop_all_when_empty_is_noop() {
        let mut runner = default_runner();
        runner.stop().await.expect("stop() on empty pool should be Ok(())");
        assert!(matches!(runner.status().await, ServiceStatus::Stopped));
    }

    #[tokio::test]
    async fn discover_endpoint_format() {
        let runner = default_runner();
        let ep = runner
            .discover_endpoint()
            .await
            .expect("discover_endpoint should not fail");
        assert_eq!(ep, "http://127.0.0.1:3458");
    }

    // -----------------------------------------------------------------------
    // Phase 4 tests
    // -----------------------------------------------------------------------

    /// Fresh runner has no clients and reports `Stopped`.
    #[tokio::test]
    async fn terminal_runner_new_is_stopped() {
        let runner = default_runner();
        assert_eq!(runner.active_count(), 0);
        assert!(matches!(runner.status().await, ServiceStatus::Stopped));
    }

    /// `discover_endpoint()` returns the port URL derived from config.
    #[tokio::test]
    async fn terminal_runner_discover_endpoint() {
        let runner = default_runner();
        let ep = runner
            .discover_endpoint()
            .await
            .expect("discover_endpoint should succeed");
        let port = InteractiveTerminalSection::default().port;
        assert_eq!(ep, format!("http://127.0.0.1:{port}"));
    }

    /// `health_probe()` returns `Unhealthy("no clients")` when no clients
    /// are registered.
    #[tokio::test]
    async fn terminal_runner_health_probe_no_clients() {
        let runner = default_runner();
        match runner.health_probe().await {
            HealthStatus::Unhealthy(msg) => {
                assert!(msg.contains("no clients"), "message was: {msg}");
            }
            HealthStatus::Healthy => panic!("expected Unhealthy(\"no clients\") with empty pool"),
        }
    }
}
