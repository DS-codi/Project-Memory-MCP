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
    /// App name associated with this long-lived refinement session.
    app_name: String,
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

fn response_requests_continuation(response: &serde_json::Value) -> bool {
    response
        .get("status")
        .and_then(|s| s.as_str())
        .map(|status| {
            matches!(status, "refinement_requested" | "continuation_requested" | "continue_requested")
        })
        .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// Per-app serialising queue
// ---------------------------------------------------------------------------

/// One `Mutex<()>` per registered app name.  Acquiring it serialises
/// concurrent `launch_form_app` calls for the same GUI — only one window
/// instance is ever alive at a time.  A second caller waits here until the
/// current launch completes (success, timeout, or error) before spawning.
type AppLockMap = HashMap<String, Arc<Mutex<()>>>;
static APP_LOCKS: OnceLock<Arc<Mutex<AppLockMap>>> = OnceLock::new();

fn app_lock_map() -> Arc<Mutex<AppLockMap>> {
    APP_LOCKS
        .get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
        .clone()
}

async fn get_or_create_app_lock(app_name: &str) -> Arc<Mutex<()>> {
    let registry = app_lock_map();
    let mut map = registry.lock().await;
    map.entry(app_name.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(())))
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
    // Serialise concurrent launches for the same app — wait for any running
    // instance to finish before spawning a new window.  The guard is held
    // for the entire lifetime of this call and released on drop.
    let app_lock = get_or_create_app_lock(app_name).await;
    let _app_guard = app_lock.lock().await;

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
            return FormAppResponse::failure(
                app_name,
                format!("failed to spawn {app_name}: {e}"),
                start.elapsed().as_millis() as u64,
                false,
            );
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
            return FormAppResponse::failure(
                app_name,
                "child stdin not captured",
                start.elapsed().as_millis() as u64,
                false,
            );
        }
    };
    let stdout = match child.stdout.take() {
        Some(s) => s,
        None => {
            kill_child(&mut child).await;
            return FormAppResponse::failure(
                app_name,
                "child stdout not captured",
                start.elapsed().as_millis() as u64,
                false,
            );
        }
    };
    let mut reader = BufReader::new(stdout);

    // -- Write request to stdin (keep stdin alive for potential refinement) --
    let stdin = match write_payload_keep_stdin(stdin, payload).await {
        Ok(s) => s,
        Err(e) => {
            kill_child(&mut child).await;
            lifecycle.state = FormAppLifecycleState::Failed(e.clone());
            return FormAppResponse::failure(
                app_name,
                e,
                start.elapsed().as_millis() as u64,
                false,
            );
        }
    };

    // -- Read response from stdout with timeout ------------------------------
    let deadline = Duration::from_secs(timeout_secs);
    match timeout(deadline, read_ndjson_line(&mut reader)).await {
        // Response received in time.
        Ok(Ok(response_value)) => {
            let should_continue = response_requests_continuation(&response_value);

            if should_continue {
                // Keep the child alive and store the session.
                let session_id = Uuid::new_v4().to_string();
                sessions().lock().await.insert(
                    session_id.clone(),
                    FormSession {
                        app_name: app_name.to_string(),
                        child,
                        stdin,
                        stdout: reader,
                        timeout_seconds: timeout_secs,
                        started_at: start,
                    },
                );
                lifecycle.state = FormAppLifecycleState::Running; // still alive
                return FormAppResponse::continuation_pending(
                    app_name,
                    response_value,
                    start.elapsed().as_millis() as u64,
                    session_id,
                );
            }

            // Normal completion — drop stdin (signals EOF to child).
            drop(stdin);
            lifecycle.state = FormAppLifecycleState::Completed;
            let _ = child.wait().await;
            FormAppResponse::success(app_name, response_value, start.elapsed().as_millis() as u64)
        }
        // Read error (child crashed, invalid JSON, etc.).
        Ok(Err(e)) => {
            drop(stdin);
            lifecycle.state = FormAppLifecycleState::Failed(e.clone());
            kill_child(&mut child).await;
            FormAppResponse::failure(app_name, e, start.elapsed().as_millis() as u64, false)
        }
        // Timeout expired.
        Err(_) => {
            drop(stdin);
            lifecycle.state = FormAppLifecycleState::TimedOut;
            kill_child(&mut child).await;
            FormAppResponse::failure(
                app_name,
                format!("{app_name} timed out after {timeout_secs}s"),
                start.elapsed().as_millis() as u64,
                true,
            )
        }
    }
}

/// Send a `FormRefinementResponse` to a paused GUI session and read the
/// next `FormResponse` from its stdout.
///
/// ## Session lifecycle
/// - The session is removed from the registry regardless of outcome.
/// - If the next response requests continuation, the **same** session_id is
///   retained and the session is re-inserted under that identity.
pub async fn continue_form_app(
    session_id: &str,
    refinement_payload: &serde_json::Value,
    timeout_override: Option<u64>,
) -> FormAppResponse {
    continue_form_app_internal(session_id, refinement_payload, timeout_override).await
}

async fn continue_form_app_internal(
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
        return FormAppResponse::failure("unknown", format!("session not found: {session_id}"), 0, false);
    };

    let timeout_secs = timeout_override.unwrap_or(session.timeout_seconds);
    let app_name = session.app_name.clone();

    // Write the FormRefinementResponse to the GUI's stdin.
    let stdin = match write_payload_keep_stdin(session.stdin, refinement_payload).await {
        Ok(s) => s,
        Err(e) => {
            kill_child(&mut session.child).await;
            return FormAppResponse::failure(
                app_name.clone(),
                e,
                session.started_at.elapsed().as_millis() as u64,
                false,
            );
        }
    };

    // Read the next FormResponse with timeout.
    let deadline = Duration::from_secs(timeout_secs);
    match timeout(deadline, read_ndjson_line(&mut session.stdout)).await {
        Ok(Ok(response_value)) => {
            let should_continue = response_requests_continuation(&response_value);

            if should_continue {
                // Another continuation round — preserve the same session id.
                let elapsed_ms = session.started_at.elapsed().as_millis() as u64;
                sessions().lock().await.insert(
                    session_id.to_string(),
                    FormSession { stdin, ..session },
                );
                return FormAppResponse::continuation_pending(
                    app_name.clone(),
                    response_value,
                    elapsed_ms,
                    session_id.to_string(),
                );
            }

            // Final response — clean up.
            drop(stdin);
            let _ = session.child.wait().await;
            FormAppResponse::success(
                app_name.clone(),
                response_value,
                session.started_at.elapsed().as_millis() as u64,
            )
        }
        Ok(Err(e)) => {
            drop(stdin);
            kill_child(&mut session.child).await;
            FormAppResponse::failure(
                app_name.clone(),
                e,
                session.started_at.elapsed().as_millis() as u64,
                false,
            )
        }
        Err(_) => {
            drop(stdin);
            kill_child(&mut session.child).await;
            FormAppResponse::failure(
                app_name,
                format!("session timed out after {timeout_secs}s during refinement"),
                session.started_at.elapsed().as_millis() as u64,
                true,
            )
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

    fn refinement_loop_config() -> FormAppConfig {
        #[cfg(target_os = "windows")]
        let (cmd, args) = (
            "powershell".to_string(),
            vec![
                "-NoProfile".to_string(),
                "-Command".to_string(),
                "$null = [Console]::In.ReadLine(); [Console]::Out.WriteLine('{\"status\":\"refinement_requested\"}'); $null = [Console]::In.ReadLine(); [Console]::Out.WriteLine('{\"status\":\"refinement_requested\"}'); $null = [Console]::In.ReadLine(); [Console]::Out.WriteLine('{\"status\":\"approved\"}')".to_string(),
            ],
        );
        #[cfg(not(target_os = "windows"))]
        let (cmd, args) = (
            "sh".to_string(),
            vec![
                "-c".to_string(),
                "read _; echo '{\"status\":\"refinement_requested\"}'; read _; echo '{\"status\":\"refinement_requested\"}'; read _; echo '{\"status\":\"approved\"}'".to_string(),
            ],
        );

        FormAppConfig {
            command: cmd,
            args,
            timeout_seconds: 5,
            ..echo_config()
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

    #[tokio::test]
    async fn continuation_preserves_same_session_id_across_rounds() {
        let cfg = refinement_loop_config();

        let launch = launch_form_app(&cfg, "loop-app", &serde_json::json!({"round": 1}), None).await;
        assert!(launch.success);
        assert!(launch.pending_refinement);

        let session_id = launch.session_id.clone().expect("session id from launch");

        let round_two = continue_form_app(&session_id, &serde_json::json!({"round": 2}), None).await;
        assert!(round_two.success);
        assert!(round_two.pending_refinement);
        assert_eq!(round_two.session_id.as_deref(), Some(session_id.as_str()));

        let final_round = continue_form_app(&session_id, &serde_json::json!({"round": 3}), None).await;
        assert!(final_round.success);
        assert!(!final_round.pending_refinement);
    }

    #[test]
    fn continuation_status_aliases_are_all_recognized() {
        for status in [
            "refinement_requested",
            "continuation_requested",
            "continue_requested",
        ] {
            assert!(
                response_requests_continuation(&serde_json::json!({ "status": status })),
                "status should request continuation: {status}"
            );
        }

        assert!(!response_requests_continuation(&serde_json::json!({ "status": "approved" })));
        assert!(!response_requests_continuation(&serde_json::json!({ "status": null })));
        assert!(!response_requests_continuation(&serde_json::json!({})));
    }

    #[tokio::test]
    async fn continue_unknown_session_returns_structured_failure() {
        let resp = continue_form_app(
            "missing-session-id",
            &serde_json::json!({ "round": 2 }),
            None,
        )
        .await;

        assert!(!resp.success);
        assert!(!resp.timed_out);
        assert_eq!(resp.app_name, "unknown");
        assert!(
            resp.error
                .as_deref()
                .unwrap_or_default()
                .contains("session not found")
        );
    }
}
