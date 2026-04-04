//! Runner trait and supporting types for service lifecycle management.
//!
//! Every managed service adapter implements [`ServiceRunner`], giving the
//! supervisor a uniform API for starting, stopping, and health-checking any
//! kind of service — local Node processes, Podman containers, interactive
//! terminals, and the dashboard.

pub mod backoff;
pub mod job_object;
pub mod node_runner;
pub mod state_machine;

use async_trait::async_trait;

// ---------------------------------------------------------------------------
// Service status
// ---------------------------------------------------------------------------

/// Observable lifecycle state of a managed service.
#[derive(Debug, Clone, PartialEq)]
pub enum ServiceStatus {
    /// The service process / container is running and accepting work.
    Running,
    /// The service is not running (cleanly stopped or never started).
    Stopped,
    /// A start operation is in progress; the service is not yet ready.
    Starting,
    /// The service encountered an unrecoverable error.  The `String` carries
    /// a human-readable reason (e.g. "exit code 1", "image pull failed").
    Failed(String),
}

// ---------------------------------------------------------------------------
// Health status
// ---------------------------------------------------------------------------

/// Result of a single health probe against a running service endpoint.
#[derive(Debug, Clone, PartialEq)]
pub enum HealthStatus {
    /// The service responded successfully within the configured timeout.
    Healthy,
    /// The service is unreachable or returned an error.  The `String` carries
    /// a human-readable reason (e.g. "connection refused", "timeout", HTTP
    /// status code).
    Unhealthy(String),
}

// ---------------------------------------------------------------------------
// ServiceRunner trait
// ---------------------------------------------------------------------------

/// Unified lifecycle API shared by all service runner adapters.
///
/// Implementors are responsible for one concrete service (e.g. the MCP Node
/// process, a Podman container).  The supervisor drives the shared connection
/// state machine (`Disconnected → Probing → Connecting → Verifying →
/// Connected → Reconnecting`) by calling these methods.
///
/// All methods are `async` so that implementors can perform I/O (process
/// spawning, HTTP probes, container inspection) without blocking the async
/// executor.
#[async_trait]
pub trait ServiceRunner: Send + Sync {
    /// Spawn / launch the service.
    ///
    /// Returns `Ok(())` once the service has been successfully started (the
    /// process/container is running).  Returns `Err` if launch fails
    /// permanently (e.g. binary not found, image pull failure).
    async fn start(&mut self) -> anyhow::Result<()>;

    /// Stop the service gracefully, then forcefully if needed.
    ///
    /// Returns `Ok(())` once the service has stopped.
    async fn stop(&mut self) -> anyhow::Result<()>;

    /// Restart the service using a graceful stop followed by a start.
    ///
    /// Implementors can override this when restart semantics need custom
    /// behavior, but the default lifecycle is stop-then-start.
    async fn restart(&mut self) -> anyhow::Result<()> {
        self.stop().await?;
        self.start().await
    }

    /// Return the current [`ServiceStatus`] of the service without blocking.
    ///
    /// Implementors should return a cached/last-known status; this method
    /// must not perform network I/O.
    async fn status(&self) -> ServiceStatus;

    /// Perform a single health probe against the service's discovered endpoint.
    ///
    /// Typically an HTTP GET to `discover_endpoint()` that must succeed within
    /// the configured `health_timeout_ms`.  Returns [`HealthStatus::Healthy`]
    /// on success or [`HealthStatus::Unhealthy`] with a reason on failure.
    async fn health_probe(&self) -> HealthStatus;

    /// Resolve the endpoint address/URL for this service.
    ///
    /// For a Node process this may be `http://127.0.0.1:<port>`.  For a
    /// container it involves inspecting Podman labels/port mappings.
    ///
    /// Returns `Err` if the endpoint cannot be determined (e.g. service not
    /// yet started, label missing).
    async fn discover_endpoint(&self) -> anyhow::Result<String>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // ServiceStatus enum tests
    // -----------------------------------------------------------------------

    #[test]
    fn service_status_variants_eq() {
        assert_eq!(ServiceStatus::Running, ServiceStatus::Running);
        assert_eq!(ServiceStatus::Stopped, ServiceStatus::Stopped);
        assert_eq!(ServiceStatus::Starting, ServiceStatus::Starting);
        assert_eq!(
            ServiceStatus::Failed("err".into()),
            ServiceStatus::Failed("err".into())
        );
    }

    #[test]
    fn service_status_failed_message() {
        let status = ServiceStatus::Failed("exit code 1".into());
        match status {
            ServiceStatus::Failed(msg) => assert_eq!(msg, "exit code 1"),
            other => panic!("expected Failed, got {:?}", other),
        }
    }

    #[test]
    fn service_status_clone() {
        let original = ServiceStatus::Failed("x".into());
        let cloned = original.clone();
        assert_eq!(original, cloned);
    }

    // -----------------------------------------------------------------------
    // HealthStatus enum tests
    // -----------------------------------------------------------------------

    #[test]
    fn health_status_healthy_variant() {
        assert_eq!(HealthStatus::Healthy, HealthStatus::Healthy);
    }

    #[test]
    fn health_status_unhealthy_variant() {
        assert_ne!(HealthStatus::Unhealthy("err".into()), HealthStatus::Healthy);
    }

    #[test]
    fn health_status_unhealthy_message() {
        let status = HealthStatus::Unhealthy("timeout".into());
        match status {
            HealthStatus::Unhealthy(msg) => assert_eq!(msg, "timeout"),
            HealthStatus::Healthy => panic!("expected Unhealthy, got Healthy"),
        }
    }

    #[test]
    fn health_status_clone() {
        let original = HealthStatus::Unhealthy("x".into());
        let cloned = original.clone();
        assert_eq!(original, cloned);
    }

    // -----------------------------------------------------------------------
    // ServiceRunner trait object dispatch
    // -----------------------------------------------------------------------

    struct MockRunner;

    #[async_trait]
    impl ServiceRunner for MockRunner {
        async fn start(&mut self) -> anyhow::Result<()> {
            Ok(())
        }

        async fn stop(&mut self) -> anyhow::Result<()> {
            Ok(())
        }

        async fn status(&self) -> ServiceStatus {
            ServiceStatus::Stopped
        }

        async fn health_probe(&self) -> HealthStatus {
            HealthStatus::Healthy
        }

        async fn discover_endpoint(&self) -> anyhow::Result<String> {
            Ok("http://127.0.0.1:3000".to_string())
        }
    }

    #[tokio::test]
    async fn mock_runner_implements_trait() {
        let mut runner: Box<dyn ServiceRunner> = Box::new(MockRunner);

        runner.start().await.expect("start should succeed");
        runner.stop().await.expect("stop should succeed");

        let s = runner.status().await;
        assert!(matches!(s, ServiceStatus::Stopped));

        let h = runner.health_probe().await;
        assert_eq!(h, HealthStatus::Healthy);

        let ep = runner
            .discover_endpoint()
            .await
            .expect("endpoint should resolve");
        assert_eq!(ep, "http://127.0.0.1:3000");
    }

    #[tokio::test]
    async fn default_restart_calls_stop_then_start() {
        // MockRunner is stateless — restart simply completes without error,
        // which verifies that the default blanket impl compiles and runs.
        let mut runner = MockRunner;
        runner.restart().await.expect("restart should succeed");
    }
}
