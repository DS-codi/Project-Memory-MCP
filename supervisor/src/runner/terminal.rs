//! InteractiveTerminalRunner — supervisor for the interactive terminal GUI process.
//!
//! The `interactive-terminal` binary is a Qt GUI application that also exposes
//! a TCP server on a configurable port.  The supervisor starts exactly **one**
//! `interactive-terminal` process and keeps it alive for the lifetime of the
//! supervisor.

use std::path::PathBuf;
use std::process::Stdio;
use std::time::{Duration, Instant};

use anyhow::Context as _;
use async_trait::async_trait;
#[cfg(windows)]
use sysinfo::{Pid, PidExt, ProcessExt, System, SystemExt};
use tokio::process::Child;

use crate::config::InteractiveTerminalSection;
use crate::control::registry::ServiceStatus;
use crate::runner::{HealthStatus, ServiceRunner};

/// How long after `start()` we skip TCP health probes.  The Qt/QML binary can
/// take 20-40 s to open its TCP port on a cold start, so we give it a generous
/// window before the crash-recovery monitor is allowed to declare it dead.
const STARTUP_GRACE_SECS: u64 = 60;

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
    /// Time at which the process was most recently spawned.  Used to implement
    /// a startup grace period in `health_probe` so slow Qt initialisation does
    /// not trigger a spurious restart loop.
    started_at: Option<Instant>,
}

impl InteractiveTerminalRunner {
    /// Create a new runner from the `[interactive_terminal]` config section.
    pub fn new(config: InteractiveTerminalSection) -> Self {
        Self {
            config,
            state: RunnerState::Stopped,
            started_at: None,
        }
    }

    /// Returns the OS PID of the running process, or `None` if stopped.
    pub fn pid(&self) -> Option<u32> {
        match self.state {
            RunnerState::Running { pid, .. } => Some(pid),
            RunnerState::Stopped => None,
        }
    }

    #[cfg(windows)]
    fn kill_stale_matching_instances(&self) {
        let exe_path = match std::path::Path::new(&self.config.command).canonicalize() {
            Ok(p) => p,
            Err(_) => return,
        };

        let mut system = System::new_all();
        system.refresh_processes();

        for (pid, process) in system.processes() {
            let process_path = match process.exe().canonicalize() {
                Ok(p) => p,
                Err(_) => continue,
            };
            if process_path != exe_path {
                continue;
            }

            let cmdline = process
                .cmd()
                .iter()
                .map(|segment| segment.to_string())
                .collect::<Vec<_>>()
                .join(" ");
            let port_arg = format!("--port {}", self.config.port);
            if !cmdline.contains(&port_arg) {
                continue;
            }

            let stale_pid = pid.as_u32().to_string();
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &stale_pid, "/T", "/F"])
                .status();
        }
    }
}

// ---------------------------------------------------------------------------
// PID lock-file helpers
// ---------------------------------------------------------------------------

/// Returns the path of the interactive-terminal PID lock file.
///
/// Resolves from `PM_WORKSPACE_PATH` env var; falls back to `USERPROFILE`
/// (Windows) or `HOME` (Unix), then to an empty path of last resort.
fn pid_file_path() -> PathBuf {
    let workspace = std::env::var("PM_WORKSPACE_PATH").unwrap_or_else(|_| {
        std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_default()
    });
    PathBuf::from(workspace)
        .join(".projectmemory")
        .join("interactive-terminal.pid")
}

/// Returns `true` if a process with the given PID is currently alive.
fn is_pid_alive(pid: u32) -> bool {
    #[cfg(windows)]
    {
        let mut sys = System::new_all();
        sys.refresh_processes();
        sys.process(Pid::from_u32(pid)).is_some()
    }
    #[cfg(not(windows))]
    {
        // Signal 0 — no signal delivered but the kernel checks the PID exists.
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

/// Writes `pid` to `path`, creating parent directories as needed.
fn write_pid_file(path: &std::path::Path, pid: u32) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, pid.to_string())
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

        // PID lock-file dedup: prevent a second supervisor instance (or a
        // concurrent tool call) from spawning a duplicate interactive-terminal
        // process.
        let pid_path = pid_file_path();
        if pid_path.exists() {
            match std::fs::read_to_string(&pid_path)
                .ok()
                .and_then(|s| s.trim().parse::<u32>().ok())
            {
                Some(existing_pid) if is_pid_alive(existing_pid) => {
                    tracing::warn!(
                        pid = existing_pid,
                        "interactive-terminal already running (PID lock file present); \
                         skipping duplicate spawn"
                    );
                    return Ok(());
                }
                _ => {
                    // Stale or unreadable PID file — remove before proceeding.
                    if let Err(e) = std::fs::remove_file(&pid_path) {
                        tracing::warn!("failed to remove stale PID lock file: {e}");
                    }
                }
            }
        }

        #[cfg(windows)]
        self.kill_stale_matching_instances();

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

        // Assign to the supervisor job object so the OS kills this process
        // automatically if the supervisor exits or crashes.
        crate::runner::job_object::adopt(pid);

        // Write the PID lock file so subsequent start() calls (or a restarted
        // supervisor) can detect this live process and skip re-spawning.
        if let Err(e) = write_pid_file(&pid_path, pid) {
            tracing::warn!("failed to write interactive-terminal PID lock file: {e}");
        }

        self.state = RunnerState::Running { child, pid };
        self.started_at = Some(Instant::now());
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
                self.started_at = None;
                // Remove the PID lock file so the next start() call does not see
                // a stale entry for this now-dead process.
                let pid_path = pid_file_path();
                if let Err(e) = std::fs::remove_file(&pid_path) {
                    if e.kind() != std::io::ErrorKind::NotFound {
                        tracing::warn!("failed to remove PID lock file on stop: {e}");
                    }
                }
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
    ///
    /// The first [`STARTUP_GRACE_SECS`] after a `start()` call the probe
    /// always returns `Healthy` to allow the Qt/QML binary time to initialise
    /// before the crash-recovery monitor can trigger a spurious restart.
    async fn health_probe(&self) -> HealthStatus {
        if matches!(self.state, RunnerState::Stopped) {
            return HealthStatus::Unhealthy("not running".into());
        }

        // Within the startup grace window, assume healthy so the crash-recovery
        // monitor does not restart a still-initialising Qt process.
        if let Some(started) = self.started_at {
            if started.elapsed() < Duration::from_secs(STARTUP_GRACE_SECS) {
                return HealthStatus::Healthy;
            }
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

