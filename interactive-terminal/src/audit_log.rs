//! Structured JSONL audit logging for super-subagent launch lifecycle events.
//!
//! Entries are appended to `{workspace_path}/logs/agent_launch_audit.jsonl`
//! (one JSON object per line).  All writes are best-effort and non-blocking:
//! any I/O error is printed to stderr but does not propagate.

use crate::protocol::{context_pack_from_context_json, ContextPack};
use serde::Serialize;
use std::io::Write as _;
use std::path::{Path, PathBuf};

// ─── Event / field types ─────────────────────────────────────────────────────

/// Summary of a context pack included in an audit entry.
#[derive(Debug, Serialize)]
pub struct ContextPackSummary {
    pub has_step_notes: bool,
    pub file_count: usize,
    pub has_custom_instructions: bool,
}

impl ContextPackSummary {
    pub fn from_pack(pack: &ContextPack) -> Self {
        Self {
            has_step_notes: pack
                .step_notes
                .as_deref()
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false),
            file_count: pack.relevant_files.len(),
            has_custom_instructions: pack
                .custom_instructions
                .as_deref()
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false),
        }
    }
}

/// All supported lifecycle event kinds.
#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LaunchEvent {
    LaunchRequested,
    LaunchApproved,
    LaunchDenied,
    LaunchCancelled,
    LaunchStarted,
    /// Agent CLI session exited cleanly (exit_code == Some(0)).
    SessionCompleted,
    /// Agent CLI session exited with a non-zero code, was killed, or returned no exit code.
    SessionExited,
}

/// A single structured audit entry.
#[derive(Debug, Serialize)]
pub struct AuditEntry {
    /// ISO-8601 UTC timestamp.
    pub timestamp: String,
    /// Lifecycle event kind.
    pub event: LaunchEvent,
    /// Normalised provider token, e.g. `"gemini"` or `"copilot"`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Autonomy mode selected by the user.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub autonomy_mode: Option<String>,
    /// Requesting agent type, e.g. `"Executor"`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requesting_agent: Option<String>,
    /// Plan ID from the context pack.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_id: Option<String>,
    /// Session ID from the context pack.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    /// Summary of the context pack, if available.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_pack_summary: Option<ContextPackSummary>,
    /// Terminal session ID for the launched session (available after `launch_started`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_session_id: Option<String>,
    /// Risk tier inferred from the request context.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risk_tier: Option<String>,
    /// Human-readable denial reason, if applicable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Process exit code — only set for `session_completed` / `session_exited` events.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
}

// ─── Write helpers ────────────────────────────────────────────────────────────

/// Return the audit log path for a given workspace root.
///
/// Creates the `logs/` directory if it does not yet exist.
fn audit_log_path(workspace_path: &str) -> Option<PathBuf> {
    if workspace_path.trim().is_empty() {
        return None;
    }

    let logs_dir = Path::new(workspace_path.trim()).join("logs");
    if let Err(err) = std::fs::create_dir_all(&logs_dir) {
        eprintln!("[audit_log] failed to create logs directory {logs_dir:?}: {err}");
        return None;
    }

    Some(logs_dir.join("agent_launch_audit.jsonl"))
}

/// Append a single `AuditEntry` to the JSONL file.
///
/// Best-effort: errors are logged to stderr and silently swallowed.
pub fn write_entry(workspace_path: &str, entry: &AuditEntry) {
    let Some(path) = audit_log_path(workspace_path) else {
        return;
    };

    match serde_json::to_string(entry) {
        Err(err) => {
            eprintln!("[audit_log] failed to serialize audit entry: {err}");
        }
        Ok(line) => {
            match std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&path)
            {
                Err(err) => {
                    eprintln!("[audit_log] failed to open audit log {path:?}: {err}");
                }
                Ok(mut file) => {
                    if let Err(err) = writeln!(file, "{line}") {
                        eprintln!("[audit_log] failed to write audit entry: {err}");
                    }
                }
            }
        }
    }
}

// ─── ISO-8601 timestamp helper ────────────────────────────────────────────────

fn iso_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Format as YYYY-MM-DDTHH:MM:SSZ using integer arithmetic (no chrono dep).
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let days = secs / 86400;

    // Approximate calendar date from days-since-epoch
    let (year, month, day) = days_to_ymd(days);
    format!("{year:04}-{month:02}-{day:02}T{h:02}:{m:02}:{s:02}Z")
}

fn days_to_ymd(mut days: u64) -> (u32, u32, u32) {
    // Simple Gregorian calendar computation
    let year_400_days: u64 = 365 * 400 + 97;
    let year_100_days: u64 = 365 * 100 + 24;
    let year_4_days: u64 = 365 * 4 + 1;

    days += 719468; // offset from Unix epoch to proleptic Gregorian epoch

    let era = days / year_400_days;
    let doe = days % year_400_days;
    let yoe = (doe - doe / (year_4_days - 1) + doe / year_100_days - doe / (year_400_days - 1))
        / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    (y as u32, m as u32, d as u32)
}

// ─── Friendly emitter functions ───────────────────────────────────────────────

/// Emit a `launch_requested` event when a super-subagent command is enqueued
/// for GUI approval.
pub fn emit_launch_requested(workspace_path: &str, context_json: &str, provider: &str) {
    let pack = context_pack_from_context_json(context_json);
    let summary = pack.as_ref().map(ContextPackSummary::from_pack);
    let requesting_agent = pack.as_ref().and_then(|p| p.requesting_agent.clone());
    let plan_id = pack.as_ref().and_then(|p| p.plan_id.clone());
    let session_id = pack.as_ref().and_then(|p| p.session_id.clone());

    write_entry(
        workspace_path,
        &AuditEntry {
            timestamp: iso_now(),
            event: LaunchEvent::LaunchRequested,
            provider: Some(provider.to_string()).filter(|s| !s.is_empty()),
            autonomy_mode: None,
            requesting_agent,
            plan_id,
            session_id,
            context_pack_summary: summary,
            terminal_session_id: None,
            risk_tier: None,
            reason: None,
            exit_code: None,
        },
    );
}

/// Emit a `launch_approved` event immediately before the CLI launch command
/// is dispatched.
pub fn emit_launch_approved(
    workspace_path: &str,
    context_json: &str,
    provider: &str,
    autonomy_mode: &str,
    terminal_session_id: &str,
) {
    let pack = context_pack_from_context_json(context_json);
    let summary = pack.as_ref().map(ContextPackSummary::from_pack);
    let requesting_agent = pack.as_ref().and_then(|p| p.requesting_agent.clone());
    let plan_id = pack.as_ref().and_then(|p| p.plan_id.clone());
    let session_id = pack.as_ref().and_then(|p| p.session_id.clone());

    write_entry(
        workspace_path,
        &AuditEntry {
            timestamp: iso_now(),
            event: LaunchEvent::LaunchApproved,
            provider: Some(provider.to_string()).filter(|s| !s.is_empty()),
            autonomy_mode: Some(autonomy_mode.to_string()).filter(|s| !s.is_empty()),
            requesting_agent,
            plan_id,
            session_id,
            context_pack_summary: summary,
            terminal_session_id: Some(terminal_session_id.to_string())
                .filter(|s| !s.is_empty()),
            risk_tier: None,
            reason: None,
            exit_code: None,
        },
    );
}

/// Emit a `launch_started` event once the CLI process is dispatched to the pty.
pub fn emit_launch_started(
    workspace_path: &str,
    provider: &str,
    terminal_session_id: &str,
    requesting_agent: Option<&str>,
    plan_id: Option<&str>,
) {
    write_entry(
        workspace_path,
        &AuditEntry {
            timestamp: iso_now(),
            event: LaunchEvent::LaunchStarted,
            provider: Some(provider.to_string()).filter(|s| !s.is_empty()),
            autonomy_mode: None,
            requesting_agent: requesting_agent.map(|s| s.to_string()),
            plan_id: plan_id.map(|s| s.to_string()),
            session_id: None,
            context_pack_summary: None,
            terminal_session_id: Some(terminal_session_id.to_string())
                .filter(|s| !s.is_empty()),
            risk_tier: None,
            reason: None,
            exit_code: None,
        },
    );
}

/// Emit a `launch_denied` event when the user explicitly declines a launch.
pub fn emit_launch_denied(
    workspace_path: &str,
    context_json: &str,
    provider: &str,
    reason: Option<&str>,
) {
    let pack = context_pack_from_context_json(context_json);
    let requesting_agent = pack.as_ref().and_then(|p| p.requesting_agent.clone());
    let plan_id = pack.as_ref().and_then(|p| p.plan_id.clone());
    let session_id = pack.as_ref().and_then(|p| p.session_id.clone());

    write_entry(
        workspace_path,
        &AuditEntry {
            timestamp: iso_now(),
            event: LaunchEvent::LaunchDenied,
            provider: Some(provider.to_string()).filter(|s| !s.is_empty()),
            autonomy_mode: None,
            requesting_agent,
            plan_id,
            session_id,
            context_pack_summary: None,
            terminal_session_id: None,
            risk_tier: None,
            reason: reason.map(|s| s.to_string()).filter(|s| !s.is_empty()),
            exit_code: None,
        },
    );
}

/// Emit a `session_completed` or `session_exited` event when a hosted agent CLI session ends.
///
/// Appends to the same `agent_launch_audit.jsonl` as the launch events, giving a
/// full lifecycle record for every agent session in one file.
///
/// - `session_completed` — exit code 0 (clean exit)
/// - `session_exited`    — any other outcome (non-zero, killed, or `None`)
pub fn emit_session_exited(
    workspace_path: &str,
    session_id: &str,
    exit_code: Option<i32>,
) {
    let event = if exit_code == Some(0) {
        LaunchEvent::SessionCompleted
    } else {
        LaunchEvent::SessionExited
    };
    if exit_code != Some(0) {
        eprintln!(
            "[agent_session] session {session_id} exited — code: {exit_code:?}"
        );
    }
    write_entry(
        workspace_path,
        &AuditEntry {
            timestamp: iso_now(),
            event,
            provider: None,
            autonomy_mode: None,
            requesting_agent: None,
            plan_id: None,
            session_id: Some(session_id.to_string()),
            context_pack_summary: None,
            terminal_session_id: Some(session_id.to_string()),
            risk_tier: None,
            reason: None,
            exit_code,
        },
    );
}

/// Emit a `launch_cancelled` event when the approval dialog is dismissed
/// without a decision (i.e., the reason is empty or indicates a cancel).
pub fn emit_launch_cancelled(
    workspace_path: &str,
    context_json: &str,
    provider: &str,
) {
    let pack = context_pack_from_context_json(context_json);
    let requesting_agent = pack.as_ref().and_then(|p| p.requesting_agent.clone());
    let plan_id = pack.as_ref().and_then(|p| p.plan_id.clone());
    let session_id = pack.as_ref().and_then(|p| p.session_id.clone());

    write_entry(
        workspace_path,
        &AuditEntry {
            timestamp: iso_now(),
            event: LaunchEvent::LaunchCancelled,
            provider: Some(provider.to_string()).filter(|s| !s.is_empty()),
            autonomy_mode: None,
            requesting_agent,
            plan_id,
            session_id,
            context_pack_summary: None,
            terminal_session_id: None,
            risk_tier: None,
            reason: None,
            exit_code: None,
        },
    );
}
