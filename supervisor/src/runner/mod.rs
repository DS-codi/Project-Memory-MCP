//! Runner trait and supporting types for service lifecycle management.
//!
//! Every managed service adapter implements [`ServiceRunner`], giving the
//! supervisor a uniform API for starting, stopping, and health-checking any
//! kind of service — local Node processes, Podman containers, interactive
//! terminals, and the dashboard.

pub mod backoff;
pub mod container;
pub mod dashboard;
pub mod node;
pub mod state_machine;
pub mod terminal;

use async_trait::async_trait;

use crate::control::registry::ServiceStatus;

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
    use crate::control::registry::ServiceStatus;

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
}
