//! On-demand form-app launcher.
//!
//! Spawns a GUI binary (e.g. `pm-brainstorm-gui`, `pm-approval-gui`) as a
//! child process, pipes a [`FormRequest`] JSON payload to its stdin via
//! NDJSON, and reads the [`FormResponse`] from stdout.
//!
//! Timeouts are enforced: if the child does not produce a response within
//! the configured duration the process is killed and a timed-out
//! [`FormAppResponse`] is returned.

use std::process::Stdio;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;

use crate::config::FormAppConfig;
use crate::control::protocol::{
    FormAppLifecycle, FormAppLifecycleState, FormAppResponse,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Launch a form-app process, send a request on stdin, and wait for the
/// response on stdout.
///
/// # Arguments
///
/// * `config`           – resolved [`FormAppConfig`] for the target app.
/// * `app_name`         – human-readable app name (used in responses / logs).
/// * `payload`          – the full `FormRequest` JSON value to send.
/// * `timeout_override` – optional per-request timeout (seconds). Falls back
///                        to `config.timeout_seconds`.
///
/// # Returns
///
/// A [`FormAppResponse`] summarising the outcome (success, error, or timeout).
pub async fn launch_form_app(
    config: &FormAppConfig,
    app_name: &str,
    payload: &serde_json::Value,
    timeout_override: Option<u64>,
) -> FormAppResponse {
    let timeout_secs = timeout_override.unwrap_or(config.timeout_seconds);
    let start = Instant::now();
    let started_at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    // -- Build command -------------------------------------------------------
    let mut cmd = Command::new(&config.command);
    cmd.args(&config.args);

    if let Some(ref cwd) = config.working_dir {
        cmd.current_dir(cwd);
    }
    for (k, v) in &config.env {
        cmd.env(k, v);
    }

    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // -- Spawn ---------------------------------------------------------------
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return FormAppResponse {
                app_name: app_name.to_string(),
                success: false,
                response_payload: None,
                error: Some(format!("failed to spawn {app_name}: {e}")),
                elapsed_ms: start.elapsed().as_millis() as u64,
                timed_out: false,
            };
        }
    };

    let pid = child.id();

    let mut lifecycle = FormAppLifecycle {
        app_name: app_name.to_string(),
        pid,
        state: FormAppLifecycleState::Running,
        started_at_ms,
        timeout_seconds: timeout_secs,
    };

    // -- Write request to stdin ----------------------------------------------
    let write_result = write_request_to_stdin(&mut child, payload).await;
    if let Err(e) = write_result {
        kill_child(&mut child).await;
        lifecycle.state = FormAppLifecycleState::Failed(e.clone());
        return FormAppResponse {
            app_name: app_name.to_string(),
            success: false,
            response_payload: None,
            error: Some(e),
            elapsed_ms: start.elapsed().as_millis() as u64,
            timed_out: false,
        };
    }

    // -- Read response from stdout with timeout ------------------------------
    let deadline = Duration::from_secs(timeout_secs);
    match timeout(deadline, read_response_from_stdout(&mut child)).await {
        // Response received in time.
        Ok(Ok(response_value)) => {
            lifecycle.state = FormAppLifecycleState::Completed;
            // Wait for the child to exit cleanly.
            let _ = child.wait().await;
            FormAppResponse {
                app_name: app_name.to_string(),
                success: true,
                response_payload: Some(response_value),
                error: None,
                elapsed_ms: start.elapsed().as_millis() as u64,
                timed_out: false,
            }
        }
        // Read error (child crashed, invalid JSON, etc.).
        Ok(Err(e)) => {
            lifecycle.state = FormAppLifecycleState::Failed(e.clone());
            kill_child(&mut child).await;
            FormAppResponse {
                app_name: app_name.to_string(),
                success: false,
                response_payload: None,
                error: Some(e),
                elapsed_ms: start.elapsed().as_millis() as u64,
                timed_out: false,
            }
        }
        // Timeout expired.
        Err(_) => {
            lifecycle.state = FormAppLifecycleState::TimedOut;
            kill_child(&mut child).await;
            FormAppResponse {
                app_name: app_name.to_string(),
                success: false,
                response_payload: None,
                error: Some(format!(
                    "{app_name} timed out after {timeout_secs}s"
                )),
                elapsed_ms: start.elapsed().as_millis() as u64,
                timed_out: true,
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Write the `FormRequest` JSON payload to the child's stdin (NDJSON: one
/// line of JSON followed by `\n`), then close the write end.
async fn write_request_to_stdin(
    child: &mut tokio::process::Child,
    payload: &serde_json::Value,
) -> Result<(), String> {
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "child stdin not captured".to_string())?;

    let json = serde_json::to_string(payload)
        .map_err(|e| format!("failed to serialize payload: {e}"))?;

    stdin
        .write_all(json.as_bytes())
        .await
        .map_err(|e| format!("stdin write error: {e}"))?;

    stdin
        .write_all(b"\n")
        .await
        .map_err(|e| format!("stdin newline write error: {e}"))?;

    stdin
        .flush()
        .await
        .map_err(|e| format!("stdin flush error: {e}"))?;

    // Drop stdin to signal EOF to the child.
    drop(stdin);
    Ok(())
}

/// Read a single NDJSON line from the child's stdout and parse it as JSON.
async fn read_response_from_stdout(
    child: &mut tokio::process::Child,
) -> Result<serde_json::Value, String> {
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "child stdout not captured".to_string())?;

    let mut reader = BufReader::new(stdout);
    let mut line = String::new();

    let bytes_read = reader
        .read_line(&mut line)
        .await
        .map_err(|e| format!("stdout read error: {e}"))?;

    if bytes_read == 0 {
        return Err("child closed stdout without sending a response".to_string());
    }

    let value: serde_json::Value = serde_json::from_str(line.trim())
        .map_err(|e| format!("invalid JSON from child stdout: {e}"))?;

    Ok(value)
}

/// Best-effort kill of the child process.
async fn kill_child(child: &mut tokio::process::Child) {
    let _ = child.kill().await;
    let _ = child.wait().await;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::FormAppConfig;

    /// Helper: build a config that runs a cross-platform echo-style command.
    fn echo_config() -> FormAppConfig {
        // Use a tiny inline program that reads one line from stdin and echoes
        // it back to stdout. On Windows we can use PowerShell; on Unix, cat.
        #[cfg(target_os = "windows")]
        let (cmd, args) = (
            "powershell".to_string(),
            vec![
                "-NoProfile".to_string(),
                "-Command".to_string(),
                "[Console]::In.ReadLine()".to_string(),
            ],
        );
        #[cfg(not(target_os = "windows"))]
        let (cmd, args) = ("head".to_string(), vec!["-n".to_string(), "1".to_string()]);

        FormAppConfig {
            enabled: true,
            command: cmd,
            args,
            working_dir: None,
            env: Default::default(),
            launch_mode: crate::config::LaunchMode::OnDemand,
            timeout_seconds: 5,
            window_width: 720,
            window_height: 640,
            always_on_top: false,
        }
    }

    #[tokio::test]
    async fn launch_missing_binary_returns_error() {
        let cfg = FormAppConfig {
            command: "this-binary-does-not-exist-29387".to_string(),
            ..echo_config()
        };
        let payload = serde_json::json!({"type": "form_request"});
        let resp = launch_form_app(&cfg, "test-app", &payload, None).await;
        assert!(!resp.success);
        assert!(!resp.timed_out);
        assert!(resp.error.unwrap().contains("failed to spawn"));
    }

    #[tokio::test]
    async fn launch_echo_returns_payload() {
        let cfg = echo_config();
        let payload = serde_json::json!({"type": "form_response", "ok": true});
        let resp = launch_form_app(&cfg, "echo-app", &payload, None).await;
        assert!(
            resp.success,
            "expected success, got error: {:?}",
            resp.error
        );
        assert!(resp.response_payload.is_some());
        assert!(!resp.timed_out);
    }

    #[tokio::test]
    async fn launch_timeout_kills_process() {
        // Use a command that sleeps forever so we can test timeout.
        #[cfg(target_os = "windows")]
        let cfg = FormAppConfig {
            command: "powershell".to_string(),
            args: vec![
                "-NoProfile".to_string(),
                "-Command".to_string(),
                "Start-Sleep -Seconds 60".to_string(),
            ],
            timeout_seconds: 1,
            ..echo_config()
        };
        #[cfg(not(target_os = "windows"))]
        let cfg = FormAppConfig {
            command: "sleep".to_string(),
            args: vec!["60".to_string()],
            timeout_seconds: 1,
            ..echo_config()
        };

        let payload = serde_json::json!({"type": "form_request"});
        let resp = launch_form_app(&cfg, "slow-app", &payload, Some(1)).await;
        assert!(!resp.success);
        assert!(resp.timed_out);
        assert!(resp.error.unwrap().contains("timed out"));
    }
}
