//! On-demand form-app launcher with refinement session support.
//!
//! Spawns a GUI binary (e.g. `pm-brainstorm-gui`, `pm-approval-gui`) as a
//! child process, pipes a [`FormRequest`] JSON payload to its stdin via
//! NDJSON, and reads the [`FormResponse`] from stdout.
//!
//! Timeouts are enforced: if the child does not produce a response within
//! the configured duration the process is killed and a timed-out
//! [`FormAppResponse`] is returned.
//!
//! **Refinement sessions**: When the GUI responds with
//! `status: "refinement_requested"`, the child process is kept alive and
//! a session token is stored in the global [`FORM_SESSIONS`] registry.
//! Call [`continue_form_app`] with that token to pipe a
//! `FormRefinementResponse` and read the next round's `FormResponse`.

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;
use tokio::time::timeout;
use uuid::Uuid;

use crate::config::FormAppConfig;
use crate::control::protocol::{
    FormAppLifecycle, FormAppLifecycleState, FormAppResponse,
};

// ---------------------------------------------------------------------------
// Refinement session registry
// ---------------------------------------------------------------------------

/// State for a GUI process that has paused at a `refinement_requested` response.
struct FormSession {
    /// Child process handle (stdin taken; stdout taken — stored separately).
    child: tokio::process::Child,
    /// The child's stdin — used to pipe subsequent payloads.
    stdin: tokio::process::ChildStdin,
    /// Buffered reader wrapping the child's stdout.
    stdout: BufReader<tokio::process::ChildStdout>,
    /// Configured timeout for subsequent rounds.
    timeout_seconds: u64,
    /// Wall-clock start time (for elapsed_ms calculation).
    started_at: Instant,
}

// Safety: tokio process handles, BufReader<ChildStdout>, and ChildStdin are all Send.
unsafe impl Send for FormSession {}

type SessionRegistry = Arc<Mutex<HashMap<String, FormSession>>>;

static FORM_SESSIONS: OnceLock<SessionRegistry> = OnceLock::new();

fn sessions() -> SessionRegistry {
    FORM_SESSIONS
        .get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
        .clone()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Launch a form-app process, send a request on stdin, and wait for the
/// response on stdout.
///
/// If the GUI responds with `status: "refinement_requested"`, the child
/// process is kept alive, a session is stored in the global registry, and
/// `FormAppResponse::pending_refinement` is set to `true` alongside a
/// `session_id` token.  Use [`continue_form_app`] to send the refinement
/// response and read the next round.
///
/// # Arguments
///
/// * `config`           – resolved [`FormAppConfig`] for the target app.
/// * `app_name`         – human-readable app name (used in responses / logs).
/// * `payload`          – the full `FormRequest` JSON value to send.
/// * `timeout_override` – optional per-request timeout (seconds). Falls back
///                        to `config.timeout_seconds`.
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
                pending_refinement: false,
                session_id: None,
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

    // -- Take stdio handles before passing child around ----------------------
    let stdin = match child.stdin.take() {
        Some(s) => s,
        None => {
            kill_child(&mut child).await;
            return FormAppResponse {
                app_name: app_name.to_string(),
                success: false,
                response_payload: None,
                error: Some("child stdin not captured".to_string()),
                elapsed_ms: start.elapsed().as_millis() as u64,
                timed_out: false,
                pending_refinement: false,
                session_id: None,
            };
        }
    };
    let stdout = match child.stdout.take() {
        Some(s) => s,
        None => {
            kill_child(&mut child).await;
            return FormAppResponse {
                app_name: app_name.to_string(),
                success: false,
                response_payload: None,
                error: Some("child stdout not captured".to_string()),
                elapsed_ms: start.elapsed().as_millis() as u64,
                timed_out: false,
                pending_refinement: false,
                session_id: None,
            };
        }
    };
    let mut reader = BufReader::new(stdout);

    // -- Write request to stdin (keep stdin alive for potential refinement) --
    let stdin = match write_payload_keep_stdin(stdin, payload).await {
        Ok(s) => s,
        Err(e) => {
            kill_child(&mut child).await;
            lifecycle.state = FormAppLifecycleState::Failed(e.clone());
            return FormAppResponse {
                app_name: app_name.to_string(),
                success: false,
                response_payload: None,
                error: Some(e),
                elapsed_ms: start.elapsed().as_millis() as u64,
                timed_out: false,
                pending_refinement: false,
                session_id: None,
            };
        }
    };

    // -- Read response from stdout with timeout ------------------------------
    let deadline = Duration::from_secs(timeout_secs);
    match timeout(deadline, read_ndjson_line(&mut reader)).await {
        // Response received in time.
        Ok(Ok(response_value)) => {
            let is_refinement = response_value
                .get("status")
                .and_then(|s| s.as_str())
                .map(|s| s == "refinement_requested")
                .unwrap_or(false);

            if is_refinement {
                // Keep the child alive and store the session.
                let session_id = Uuid::new_v4().to_string();
                sessions().lock().await.insert(
                    session_id.clone(),
                    FormSession {
                        child,
                        stdin,
                        stdout: reader,
                        timeout_seconds: timeout_secs,
                        started_at: start,
                    },
                );
                lifecycle.state = FormAppLifecycleState::Running; // still alive
                return FormAppResponse {
                    app_name: app_name.to_string(),
                    success: true,
                    response_payload: Some(response_value),
                    error: None,
                    elapsed_ms: start.elapsed().as_millis() as u64,
                    timed_out: false,
                    pending_refinement: true,
                    session_id: Some(session_id),
                };
            }

            // Normal completion — drop stdin (signals EOF to child).
            drop(stdin);
            lifecycle.state = FormAppLifecycleState::Completed;
            let _ = child.wait().await;
            FormAppResponse {
                app_name: app_name.to_string(),
                success: true,
                response_payload: Some(response_value),
                error: None,
                elapsed_ms: start.elapsed().as_millis() as u64,
                timed_out: false,
                pending_refinement: false,
                session_id: None,
            }
        }
        // Read error (child crashed, invalid JSON, etc.).
        Ok(Err(e)) => {
            drop(stdin);
            lifecycle.state = FormAppLifecycleState::Failed(e.clone());
            kill_child(&mut child).await;
            FormAppResponse {
                app_name: app_name.to_string(),
                success: false,
                response_payload: None,
                error: Some(e),
                elapsed_ms: start.elapsed().as_millis() as u64,
                timed_out: false,
                pending_refinement: false,
                session_id: None,
            }
        }
        // Timeout expired.
        Err(_) => {
            drop(stdin);
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
                pending_refinement: false,
                session_id: None,
            }
        }
    }
}

/// Send a `FormRefinementResponse` to a paused GUI session and read the
/// next `FormResponse` from its stdout.
///
/// ## Session lifecycle
/// - The session is removed from the registry regardless of outcome.
/// - If the next response is again `refinement_requested`, a **new**
///   session_id is issued and the session is re-inserted.
pub async fn continue_form_app(
    session_id: &str,
    refinement_payload: &serde_json::Value,
    timeout_override: Option<u64>,
) -> FormAppResponse {
    // Remove the session from the registry.
    let session = {
        let sessions_arc = sessions();
        let mut reg = sessions_arc.lock().await;
        reg.remove(session_id)
    };

    let Some(mut session) = session else {
        return FormAppResponse {
            app_name: "unknown".to_string(),
            success: false,
            response_payload: None,
            error: Some(format!("session not found: {session_id}")),
            elapsed_ms: 0,
            timed_out: false,
            pending_refinement: false,
            session_id: None,
        };
    };

    let timeout_secs = timeout_override.unwrap_or(session.timeout_seconds);

    // Write the FormRefinementResponse to the GUI's stdin.
    let stdin = match write_payload_keep_stdin(session.stdin, refinement_payload).await {
        Ok(s) => s,
        Err(e) => {
            kill_child(&mut session.child).await;
            return FormAppResponse {
                app_name: "brainstorm_gui".to_string(),
                success: false,
                response_payload: None,
                error: Some(e),
                elapsed_ms: session.started_at.elapsed().as_millis() as u64,
                timed_out: false,
                pending_refinement: false,
                session_id: None,
            };
        }
    };

    // Read the next FormResponse with timeout.
    let deadline = Duration::from_secs(timeout_secs);
    match timeout(deadline, read_ndjson_line(&mut session.stdout)).await {
        Ok(Ok(response_value)) => {
            let is_refinement = response_value
                .get("status")
                .and_then(|s| s.as_str())
                .map(|s| s == "refinement_requested")
                .unwrap_or(false);

            if is_refinement {
                // Another refinement round — re-register session.
                let new_session_id = Uuid::new_v4().to_string();
                sessions().lock().await.insert(
                    new_session_id.clone(),
                    FormSession { stdin, ..session },
                );
                return FormAppResponse {
                    app_name: "brainstorm_gui".to_string(),
                    success: true,
                    response_payload: Some(response_value),
                    error: None,
                    elapsed_ms: session.started_at.elapsed().as_millis() as u64,
                    timed_out: false,
                    pending_refinement: true,
                    session_id: Some(new_session_id),
                };
            }

            // Final response — clean up.
            drop(stdin);
            let _ = session.child.wait().await;
            FormAppResponse {
                app_name: "brainstorm_gui".to_string(),
                success: true,
                response_payload: Some(response_value),
                error: None,
                elapsed_ms: session.started_at.elapsed().as_millis() as u64,
                timed_out: false,
                pending_refinement: false,
                session_id: None,
            }
        }
        Ok(Err(e)) => {
            drop(stdin);
            kill_child(&mut session.child).await;
            FormAppResponse {
                app_name: "brainstorm_gui".to_string(),
                success: false,
                response_payload: None,
                error: Some(e),
                elapsed_ms: session.started_at.elapsed().as_millis() as u64,
                timed_out: false,
                pending_refinement: false,
                session_id: None,
            }
        }
        Err(_) => {
            drop(stdin);
            kill_child(&mut session.child).await;
            FormAppResponse {
                app_name: "brainstorm_gui".to_string(),
                success: false,
                response_payload: None,
                error: Some(format!("session timed out after {timeout_secs}s during refinement")),
                elapsed_ms: session.started_at.elapsed().as_millis() as u64,
                timed_out: true,
                pending_refinement: false,
                session_id: None,
            }
        }
    }
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Write a JSON payload to the child's stdin as NDJSON (one line terminated
/// by `\n`), flush — but **keep stdin open** so subsequent payloads can be
/// written.  Returns the `ChildStdin` handle so the caller retains
/// ownership.
async fn write_payload_keep_stdin(
    mut stdin: tokio::process::ChildStdin,
    payload: &serde_json::Value,
) -> Result<tokio::process::ChildStdin, String> {
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

    Ok(stdin)
}

/// Read a single NDJSON line from a `BufReader<ChildStdout>` and parse it
/// as a `serde_json::Value`.
async fn read_ndjson_line(
    reader: &mut BufReader<tokio::process::ChildStdout>,
) -> Result<serde_json::Value, String> {
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
