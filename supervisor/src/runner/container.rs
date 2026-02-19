//! ContainerRunner — launches and manages a Podman container for the MCP service.
//!
//! Implements [`ServiceRunner`] by driving the Podman CLI via
//! `tokio::process::Command`; no Podman SDK is required.  The runner also
//! supports endpoint discovery by querying Podman labels and port mappings.

use std::time::Duration;

use async_trait::async_trait;

use crate::config::ContainerRunnerConfig;
use crate::control::registry::ServiceStatus;
use crate::runner::{HealthStatus, ServiceRunner};

// ---------------------------------------------------------------------------
// ContainerRunner
// ---------------------------------------------------------------------------

/// Manages the lifecycle of a Podman (or Docker-compatible) container for the
/// MCP service.
pub struct ContainerRunner {
    config: ContainerRunnerConfig,
    health_timeout_ms: u64,
    /// Host-side port parsed from the first entry in `config.ports`; falls
    /// back to `3000` if the entry cannot be parsed.
    port: u16,
    running: bool,
}

impl ContainerRunner {
    /// Construct a `ContainerRunner` from the container sub-config and shared
    /// health-timeout setting.
    pub fn new(config: ContainerRunnerConfig, health_timeout_ms: u64) -> Self {
        let port = parse_host_port(config.ports.first().map(String::as_str)).unwrap_or(3000);
        Self {
            config,
            health_timeout_ms,
            port,
            running: false,
        }
    }

    /// The host-side port this runner is expected to be reachable on.
    pub fn port(&self) -> u16 {
        self.port
    }
}

// ---------------------------------------------------------------------------
// Helper — parse host port from "host:container" mapping string
// ---------------------------------------------------------------------------

/// Extract the host-side port number from a port-mapping string like
/// `"3000:3000"` or `"127.0.0.1:3000:3000"`.
///
/// Returns `None` on any parse failure.
fn parse_host_port(mapping: Option<&str>) -> Option<u16> {
    let mapping = mapping?;
    // Split on ':' — the host port is the last component before the
    // container port, i.e. the second-to-last field (or the first if there
    // are only two fields).
    let parts: Vec<&str> = mapping.split(':').collect();
    match parts.as_slice() {
        // "3000:3000" → host=3000
        [host, _container] => host.parse().ok(),
        // "127.0.0.1:3000:3000" → host=3000
        [_ip, host, _container] => host.parse().ok(),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// ServiceRunner implementation
// ---------------------------------------------------------------------------

#[async_trait]
impl ServiceRunner for ContainerRunner {
    /// Launch the container with `{engine} run --detach --name … --publish …
    /// --label … {image}`.
    async fn start(&mut self) -> anyhow::Result<()> {
        let mut args: Vec<String> = vec![
            "run".into(),
            "--detach".into(),
            "--name".into(),
            self.config.container_name.clone(),
        ];

        // --publish host:container  for each port mapping
        for port_mapping in &self.config.ports {
            args.push("--publish".into());
            args.push(port_mapping.clone());
        }

        // --label key=value  for each label
        for (k, v) in &self.config.labels {
            args.push("--label".into());
            args.push(format!("{k}={v}"));
        }

        args.push(self.config.image.clone());

        let output = tokio::process::Command::new(&self.config.engine)
            .args(&args)
            .output()
            .await
            .map_err(|e| anyhow::anyhow!("failed to run '{}': {e}", self.config.engine))?;

        if output.status.success() {
            self.running = true;
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(anyhow::anyhow!(
                "container start failed (exit {}): {}",
                output.status,
                stderr.trim()
            ))
        }
    }

    /// Stop the container with `{engine} stop {container_name}`.
    async fn stop(&mut self) -> anyhow::Result<()> {
        if !self.running {
            return Ok(());
        }

        let output = tokio::process::Command::new(&self.config.engine)
            .args(["stop", &self.config.container_name])
            .output()
            .await
            .map_err(|e| anyhow::anyhow!("failed to run '{}': {e}", self.config.engine))?;

        self.running = false;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(anyhow::anyhow!(
                "container stop failed (exit {}): {}",
                output.status,
                stderr.trim()
            ))
        }
    }

    /// Inspect the container's live state via
    /// `{engine} inspect --format {{.State.Status}} {container_name}`.
    ///
    /// Returns [`ServiceStatus::Running`] only when the output is `"running"`.
    async fn status(&self) -> ServiceStatus {
        let result = tokio::process::Command::new(&self.config.engine)
            .args([
                "inspect",
                "--format",
                "{{.State.Status}}",
                &self.config.container_name,
            ])
            .output()
            .await;

        match result {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if stdout.trim() == "running" {
                    ServiceStatus::Running
                } else {
                    ServiceStatus::Stopped
                }
            }
            _ => ServiceStatus::Stopped,
        }
    }

    /// Probe `GET http://127.0.0.1:{port}/health` within `health_timeout_ms`.
    async fn health_probe(&self) -> HealthStatus {
        if !self.running {
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

    /// Discover the endpoint by scanning Podman's label index.
    ///
    /// Runs `{engine} ps --filter label=project-memory.mcp=true --format json`
    /// and parses the resulting JSON array.  Each element is expected to have
    /// a `Ports` field like `"0.0.0.0:3000->3000/tcp"`.  The first numeric
    /// host port found is used; falls back to `http://127.0.0.1:{self.port}`
    /// on any failure or empty result.
    async fn discover_endpoint(&self) -> anyhow::Result<String> {
        let output = tokio::process::Command::new(&self.config.engine)
            .args([
                "ps",
                "--filter",
                "label=project-memory.mcp=true",
                "--format",
                "json",
            ])
            .output()
            .await;

        let fallback = format!("http://127.0.0.1:{}", self.port);

        let output = match output {
            Ok(o) if o.status.success() => o,
            _ => return Ok(fallback),
        };

        let json_str = String::from_utf8_lossy(&output.stdout);
        let json_str = json_str.trim();

        if json_str.is_empty() || json_str == "null" || json_str == "[]" {
            return Ok(fallback);
        }

        // podman ps --format json returns an array of objects.
        let containers: serde_json::Value = match serde_json::from_str(json_str) {
            Ok(v) => v,
            Err(_) => return Ok(fallback),
        };

        let array = match containers.as_array() {
            Some(a) if !a.is_empty() => a,
            _ => return Ok(fallback),
        };

        // Try each container for a parseable Ports entry.
        for container in array {
            if let Some(port) = extract_mapped_port(container) {
                return Ok(format!("http://127.0.0.1:{port}"));
            }
        }

        Ok(fallback)
    }
}

// ---------------------------------------------------------------------------
// Helper — extract mapped host port from a container JSON object
// ---------------------------------------------------------------------------

/// Parse the `Ports` field from a `podman ps --format json` container object.
///
/// The field can appear in two forms:
/// - A string: `"0.0.0.0:3000->3000/tcp"`
/// - An array of objects with `hostPort`/`containerPort` integer fields
///   (Podman v4+ format).
///
/// Returns the first parseable host port as a `u16`, or `None`.
fn extract_mapped_port(container: &serde_json::Value) -> Option<u16> {
    let ports = container.get("Ports")?;

    // ── String form: "0.0.0.0:3000->3000/tcp, ..." ──────────────────────
    if let Some(s) = ports.as_str() {
        // Handle comma-separated multiple mappings; pick the first.
        let first = s.split(',').next()?;
        // "0.0.0.0:3000->3000/tcp"
        //   → split on "->" → ["0.0.0.0:3000", "3000/tcp"]
        let host_part = first.split("->").next()?;
        // "0.0.0.0:3000" → split on ":" → last segment is port
        let port_str = host_part.split(':').next_back()?;
        return port_str.trim().parse().ok();
    }

    // ── Array form: [{"hostPort": 3000, "containerPort": 3000, ...}, …] ──
    if let Some(arr) = ports.as_array() {
        for entry in arr {
            if let Some(hp) = entry.get("hostPort").and_then(|v| v.as_u64()) {
                if let Ok(port) = u16::try_from(hp) {
                    return Some(port);
                }
            }
        }
    }

    None
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ContainerRunnerConfig;
    use crate::runner::HealthStatus;

    fn default_runner() -> ContainerRunner {
        ContainerRunner::new(ContainerRunnerConfig::default(), 1500)
    }

    // ── parse_host_port ─────────────────────────────────────────────────────

    #[test]
    fn parse_host_port_simple() {
        assert_eq!(parse_host_port(Some("3000:3000")), Some(3000u16));
    }

    #[test]
    fn parse_host_port_with_ip() {
        assert_eq!(parse_host_port(Some("127.0.0.1:4000:3000")), Some(4000u16));
    }

    #[test]
    fn parse_host_port_none() {
        assert_eq!(parse_host_port(None), None);
    }

    #[test]
    fn parse_host_port_invalid() {
        assert_eq!(parse_host_port(Some("notaport")), None);
    }

    // ── ContainerRunner construction ─────────────────────────────────────────

    #[test]
    fn new_parses_port_from_config() {
        let runner = default_runner();
        // Default config has "3000:3000"
        assert_eq!(runner.port(), 3000);
    }

    #[test]
    fn new_custom_port_mapping() {
        let mut cfg = ContainerRunnerConfig::default();
        cfg.ports = vec!["8080:3000".to_string()];
        let runner = ContainerRunner::new(cfg, 1500);
        assert_eq!(runner.port(), 8080);
    }

    #[test]
    fn new_empty_ports_fallback() {
        let mut cfg = ContainerRunnerConfig::default();
        cfg.ports = vec![];
        let runner = ContainerRunner::new(cfg, 1500);
        assert_eq!(runner.port(), 3000, "empty ports should fall back to 3000");
    }

    // ── health_probe when stopped ────────────────────────────────────────────

    #[tokio::test]
    async fn health_probe_when_stopped() {
        let runner = default_runner();
        match runner.health_probe().await {
            HealthStatus::Unhealthy(reason) => {
                assert!(
                    reason.contains("not running"),
                    "expected 'not running' in reason, got: {reason:?}"
                );
            }
            HealthStatus::Healthy => panic!("expected Unhealthy for a stopped runner"),
        }
    }

    // ── status cached value ──────────────────────────────────────────────────

    #[tokio::test]
    async fn status_stopped_when_not_running() {
        // No real Podman available in CI; the inspect command will fail and
        // the runner should return Stopped rather than panic.
        let runner = default_runner();
        // status() calls Podman CLI; if unavailable it returns Stopped.
        // We only assert it doesn't panic.
        let _ = runner.status().await;
    }

    // ── extract_mapped_port ──────────────────────────────────────────────────

    #[test]
    fn extract_mapped_port_string_form() {
        let container = serde_json::json!({
            "Ports": "0.0.0.0:3000->3000/tcp"
        });
        assert_eq!(extract_mapped_port(&container), Some(3000u16));
    }

    #[test]
    fn extract_mapped_port_multiple_string_form() {
        let container = serde_json::json!({
            "Ports": "0.0.0.0:8080->80/tcp, 0.0.0.0:3000->3000/tcp"
        });
        // Should pick the first entry
        assert_eq!(extract_mapped_port(&container), Some(8080u16));
    }

    #[test]
    fn extract_mapped_port_array_form() {
        let container = serde_json::json!({
            "Ports": [
                { "hostPort": 4500, "containerPort": 3000 }
            ]
        });
        assert_eq!(extract_mapped_port(&container), Some(4500u16));
    }

    #[test]
    fn extract_mapped_port_missing() {
        let container = serde_json::json!({ "Name": "foo" });
        assert_eq!(extract_mapped_port(&container), None);
    }

    // ── discover_endpoint fallback ───────────────────────────────────────────

    #[tokio::test]
    async fn discover_endpoint_fallback_when_podman_unavailable() {
        // With no real Podman, the command should fail and the fallback URL
        // should be returned based on the parsed config port.
        let mut cfg = ContainerRunnerConfig::default();
        cfg.engine = "podman-does-not-exist-binary".to_string();
        let runner = ContainerRunner::new(cfg, 1500);
        let endpoint = runner.discover_endpoint().await.expect("should not Err");
        assert_eq!(endpoint, "http://127.0.0.1:3000");
    }

    // ── Phase 3 spec: ContainerRunner defaults ───────────────────────────────

    /// A freshly constructed `ContainerRunner` should have port 3000 and start
    /// in a stopped state (health_probe returns Unhealthy).
    #[tokio::test]
    async fn container_runner_new_defaults() {
        let runner = default_runner();
        // Port must be derived from the default "3000:3000" mapping.
        assert_eq!(runner.port(), 3000, "default port should be 3000");
        // Internal `running` flag is false on construction; health_probe must
        // reflect the stopped state without touching the container engine.
        match runner.health_probe().await {
            HealthStatus::Unhealthy(_) => {} // expected — not running
            HealthStatus::Healthy => panic!("freshly constructed runner must not report Healthy"),
        }
    }

    // ── Phase 3 spec: stop() is a no-op when not running ────────────────────

    /// `stop()` called on a runner that was never started must return `Ok(())`
    /// without invoking the container engine (short-circuit on `!running`).
    ///
    /// NOTE: This test specifies the desired behaviour.  Once
    /// `ContainerRunner::stop()` is updated to add
    /// `if !self.running { return Ok(()); }` the test will pass.
    #[tokio::test]
    async fn container_runner_stop_when_stopped_noop() {
        let mut runner = default_runner();
        // runner.running == false; stop() must be a no-op.
        let result = runner.stop().await;
        assert!(
            result.is_ok(),
            "stop() on a never-started runner must return Ok(()), got: {result:?}"
        );
    }

    // ── Phase 3 spec: ContainerRunnerConfig defaults ─────────────────────────

    /// `ContainerRunnerConfig::default()` must set engine="podman" and
    /// image="project-memory-mcp:latest" (and matching container_name/ports).
    #[test]
    fn container_runner_config_defaults() {
        let cfg = ContainerRunnerConfig::default();
        assert_eq!(cfg.engine, "podman", "default engine should be 'podman'");
        assert_eq!(
            cfg.image, "project-memory-mcp:latest",
            "default image should be 'project-memory-mcp:latest'"
        );
        assert_eq!(
            cfg.container_name, "project-memory-mcp",
            "default container_name should be 'project-memory-mcp'"
        );
        assert_eq!(
            cfg.ports,
            vec!["3000:3000".to_string()],
            "default ports should be ['3000:3000']"
        );
    }
}
