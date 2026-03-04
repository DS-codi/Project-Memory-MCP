//! Provider-specific launch command builders for super-subagent CLI sessions.
//!
//! Each builder produces a [`LaunchCommand`] that describes the program,
//! arguments, and environment variables needed to start an interactive AI
//! provider session.  The caller in `approve_command` converts a
//! `LaunchCommand` into a `CommandRequest` that is dispatched through the
//! existing ConPTY / pty-host abstraction via `command_tx` — matching the same
//! execution path as every other terminal command.  **No process is spawned
//! directly here.**
//!
//! ## Temp-file lifecycle
//! When a context pack is serialised to disk (`context_pack_path` is `Some`),
//! the caller is responsible for cleaning up the file after the launched
//! process has started.  A reasonable approach is to schedule deletion via a
//! background task after a short delay.

use crate::protocol::ContextPack;
use std::collections::HashMap;
use std::io::Write as _;
use std::path::PathBuf;

// ─── LaunchOptions ────────────────────────────────────────────────────────────

/// Autonomy budget limits for an autonomous agent session.
///
/// When any field is `Some`, the corresponding env var is injected into the
/// launched CLI process so the session can self-cap its resource usage.
#[derive(Debug, Clone, Default)]
pub struct AutonomyBudget {
    /// Maximum number of shell commands the session may execute.
    pub max_commands: Option<u32>,
    /// Maximum wall-clock seconds before session is flagged for review.
    pub max_duration_secs: Option<u64>,
    /// Maximum number of unique files the session may write.
    pub max_files: Option<u32>,
}

/// Evaluate the risk tier for a launch request.
///
/// - Tier 1 (Low)   : `autonomy_mode` is `"guided"` or empty.
/// - Tier 2 (Medium): `autonomy_mode` is `"autonomous"` AND `autonomy_budget` is `Some`
///   (at least one cap is set — narrow/bounded scope).
/// - Tier 3 (High)  : `autonomy_mode` is `"autonomous"` AND `autonomy_budget` is `None`
///   (no limits — unrestricted/broad scope).
pub fn evaluate_risk_tier(autonomy_mode: &str, budget: Option<&AutonomyBudget>) -> u8 {
    let mode = autonomy_mode.trim().to_ascii_lowercase();
    if mode != "autonomous" {
        return 1;
    }
    // Autonomous mode: tier depends on whether any budget cap is set
    match budget {
        Some(b)
            if b.max_commands.is_some()
                || b.max_duration_secs.is_some()
                || b.max_files.is_some() =>
        {
            2
        }
        _ => 3,
    }
}

/// Generate a human-readable trusted-scope confirmation statement for a
/// given risk tier.  Returns an empty string for tier 1 (no gate required).
pub fn approval_trusted_scope_text_for_tier(tier: u8) -> String {
    match tier {
        3 => "I confirm this autonomous agent may operate across the full workspace without \
              command, time, or file restrictions."
            .to_string(),
        2 => "I confirm this autonomous agent may access files and run commands within \
              this workspace (within the stated budget limits)."
            .to_string(),
        _ => String::new(),
    }
}

/// Additional options controlling session lifecycle and output format for an
/// agent launch.  Passed alongside the standard context-pack and autonomy
/// parameters to [`build_gemini_launch`], [`build_copilot_launch`], and
/// [`build_launch_command`].
#[derive(Debug, Clone, Default)]
pub struct LaunchOptions {
    /// Session lifecycle mode.
    /// Valid values: `"new"` (default) | `"resume"`.
    pub session_mode: String,
    /// Session ID to resume.  Required when `session_mode = "resume"`.
    /// Ignored for Copilot (which does not support resume).
    pub resume_session_id: Option<String>,
    /// Output format requested for this session.
    /// Valid values: `"text"` (default) | `"json"` | `"stream-json"`.
    /// Gemini supports `"json"` and `"stream-json"` natively via
    /// `--output_format`.  Copilot falls back to `"text"` with a warning.
    pub output_format: String,
    /// Whether the user has confirmed trusted-scope access for this launch.
    /// Required to be `true` when [`evaluate_risk_tier`] returns 2 or 3.
    /// Validated in [`build_launch_command`] — launches with `risk_tier >= 2`
    /// and `trusted_scope_confirmed = false` are rejected with `Err`.
    pub trusted_scope_confirmed: bool,
    /// Optional autonomy budget caps for autonomous-mode sessions.
    /// When `Some`, budget env vars (`PM_BUDGET_*`) are injected into the
    /// launched process.
    pub autonomy_budget: Option<AutonomyBudget>,
    /// Whether to pass `--screen-reader` to the Gemini CLI at launch.
    ///
    /// `--screen-reader` disables animations, reduces visual decorations, and
    /// suppresses rich terminal output that is unnecessary for agent sessions.
    /// Defaults to `false`; the GUI approval dialog exposes a checkbox
    /// (checked by default, i.e. opt-out) that sets this flag.
    /// Ignored for Copilot — see [`build_copilot_launch`] for details.
    pub screen_reader: bool,
}

// ─── LaunchCommand ────────────────────────────────────────────────────────────

/// Fully resolved description of a CLI session to launch.
///
/// Produced by [`build_gemini_launch`] and [`build_copilot_launch`].
/// Converted to a `CommandRequest` (and dispatched via `command_tx`) by the
/// `approve_command` handler in `cxxqt_bridge/invokables.rs`.
#[derive(Debug, Clone)]
pub struct LaunchCommand {
    /// Executable name or full path (e.g. `"gemini.cmd"`, `"gh"`).
    pub program: String,
    /// Command-line arguments to pass after the program name.
    pub args: Vec<String>,
    /// Extra environment variables to inject (merged with the process env).
    pub env: HashMap<String, String>,
    /// Path to a temporary context-pack JSON file, if written.
    /// The caller should schedule deletion after the process has started.
    pub context_pack_path: Option<PathBuf>,
    /// Human-readable label suitable for use as the session tab title.
    pub session_label: String,
    /// Normalised provider token (`"gemini"` or `"copilot"`).
    pub provider: String,
}

// ─── Gemini builder ──────────────────────────────────────────────────────────

/// Build a [`LaunchCommand`] for an interactive Google Gemini CLI session.
///
/// If a stored Gemini API key is found in the tray settings it is injected
/// via `GEMINI_API_KEY` and `GOOGLE_API_KEY`.
///
/// If `context_pack` is supplied and is non-empty the pack is serialised to a
/// temporary JSON file, and the path is reported in
/// [`LaunchCommand::context_pack_path`] so the caller can pass it to the CLI
/// (e.g. as `GEMINI_CONTEXT_FILE` env var for a custom wrapper) and schedule
/// deletion after launch.
///
/// When `options.session_mode = "resume"` and `options.resume_session_id` is
/// `Some(id)`, the resume ID is embedded in the context-pack JSON under
/// `session_resume.session_id` (no native Gemini CLI flag; read by wrappers).
/// When the resume session ID is absent a warning is emitted and the session
/// falls back to `"new"`.
///
/// When `options.output_format` is `"json"` or `"stream-json"`, the
/// corresponding `--output_format` flag is appended to the CLI args.
///
/// # Errors
/// Returns `Err` if the temp-file write fails when a context pack is provided.
pub fn build_gemini_launch(
    context_pack: Option<&ContextPack>,
    autonomy_mode: &str,
    requesting_agent: Option<&str>,
    plan_short_id: Option<&str>,
    options: &LaunchOptions,
) -> Result<LaunchCommand, String> {
    // Platform-specific binary name
    #[cfg(target_os = "windows")]
    let program = "gemini.cmd".to_string();
    #[cfg(not(target_os = "windows"))]
    let program = "gemini".to_string();

    let mut args: Vec<String> = Vec::new();
    let mut env: HashMap<String, String> = HashMap::new();
    let mut context_pack_path: Option<PathBuf> = None;

    // Inject stored API key if available.
    //
    // Both `GEMINI_API_KEY` and `GOOGLE_API_KEY` are set so the Gemini CLI and
    // the Google AI SDK (which reads the latter) both authenticate correctly.
    // The injection is guarded: the key is only inserted when it is present in
    // tray settings *and* non-empty after whitespace trimming.  No key is ever
    // injected as an empty string.  The key is read from the JSON settings file
    // at `%APPDATA%\ProjectMemory\interactive-terminal\tray-settings.json`
    // via `crate::system_tray::load_gemini_api_key()`.
    if let Some(key) = crate::system_tray::load_gemini_api_key() {
        if !key.trim().is_empty() {
            env.insert("GEMINI_API_KEY".to_string(), key.clone());
            env.insert("GOOGLE_API_KEY".to_string(), key);
        }
    }

    // Always suppress NPM update notifier noise
    env.insert("NPM_CONFIG_UPDATE_NOTIFIER".to_string(), "false".to_string());

    // Note autonomy mode for the CLI wrapper / log
    if !autonomy_mode.is_empty() {
        env.insert(
            "PM_AGENT_AUTONOMY_MODE".to_string(),
            autonomy_mode.to_string(),
        );
    }

    // ── Session mode ─────────────────────────────────────────────────────────
    // For "resume": embed session_id in ContextPack JSON under session_resume.
    // There is no native Gemini CLI flag; the GEMINI_CONTEXT_FILE wrapper reads it.
    let effective_session_mode =
        if options.session_mode.trim().eq_ignore_ascii_case("resume") {
            "resume"
        } else {
            "new"
        };

    // Build an owned ContextPack that may have session_resume injected, then
    // resolve which pack reference to use (owned or original).
    let owned_pack_with_resume: Option<ContextPack> = if effective_session_mode == "resume" {
        match &options.resume_session_id {
            Some(sid) if !sid.trim().is_empty() => {
                let mut pack = context_pack.cloned().unwrap_or_default();
                pack.session_resume = Some(crate::protocol::SessionResume {
                    session_id: sid.clone(),
                });
                Some(pack)
            }
            _ => {
                eprintln!(
                    "[PM][launch_builder] session_mode=resume but resume_session_id is empty \
                     or absent; falling back to new session"
                );
                None
            }
        }
    } else {
        None
    };
    let resolved_pack: Option<&ContextPack> = if owned_pack_with_resume.is_some() {
        owned_pack_with_resume.as_ref()
    } else {
        context_pack
    };

    // ── Output format ────────────────────────────────────────────────────────
    // Gemini supports --output_format natively.
    let effective_output_format = match options.output_format.trim() {
        "json" => "json",
        "stream-json" => "stream-json",
        _ => "text",
    };
    if effective_output_format != "text" {
        args.push("--output_format".to_string());
        args.push(effective_output_format.to_string());
    }

    // ── Screen-reader / load-reduction flags ─────────────────────────────────
    // --screen-reader disables rich terminal decorations and animations that
    // are unnecessary (and slow) for agent sessions.  Controlled by the
    // approval-dialog checkbox (default: checked / opt-out).
    if options.screen_reader {
        args.push("--screen-reader".to_string());
    }

    // Serialise context pack to a temp file if supplied
    if let Some(pack) = resolved_pack {
        match write_context_pack_to_tempfile(pack) {
            Ok(path) => {
                env.insert(
                    "GEMINI_CONTEXT_FILE".to_string(),
                    path.to_string_lossy().to_string(),
                );
                context_pack_path = Some(path);
            }
            Err(err) => {
                return Err(format!(
                    "Failed to write Gemini context-pack temp file: {err}"
                ));
            }
        }
    }

    let agent_tag = requesting_agent.unwrap_or("agent");
    let plan_tag = plan_short_id.unwrap_or("");
    let session_label = if plan_tag.is_empty() {
        format!("Gemini \u{2014} {agent_tag}")
    } else {
        format!("Gemini \u{2014} {agent_tag} \u{2014} {plan_tag}")
    };

    // Inject autonomy budget env vars when caps are set
    if let Some(budget) = &options.autonomy_budget {
        if let Some(n) = budget.max_commands {
            env.insert("PM_BUDGET_MAX_COMMANDS".to_string(), n.to_string());
        }
        if let Some(n) = budget.max_duration_secs {
            env.insert("PM_BUDGET_MAX_DURATION_SECS".to_string(), n.to_string());
        }
        if let Some(n) = budget.max_files {
            env.insert("PM_BUDGET_MAX_FILES".to_string(), n.to_string());
        }
    }

    Ok(LaunchCommand {
        program,
        args,
        env,
        context_pack_path,
        session_label,
        provider: "gemini".to_string(),
    })
}

// ─── Copilot CLI builder ─────────────────────────────────────────────────────

/// Build a [`LaunchCommand`] for an interactive GitHub Copilot CLI session.
///
/// Targets `gh copilot suggest --target shell`, which is the most broadly
/// interactive Copilot CLI entrypoint.  The `gh` binary routed from PATH.
///
/// When a context pack with step notes is supplied, the step notes are
/// injected as the initial prompt string (positional argument to
/// `gh copilot suggest`) so the first interaction is pre-seeded.
///
/// **Session resume is not supported by Copilot.**  When
/// `options.session_mode = "resume"`, this function returns
/// `Err("Copilot does not support session resume")`.
///
/// **Structured output is not supported by Copilot.**  When
/// `options.output_format` is `"json"` or `"stream-json"`, the function falls
/// back to `"text"`, emits a warning log, and injects
/// `PM_REQUESTED_OUTPUT_FORMAT` so callers can detect the mismatch.
///
/// # Errors
/// Returns `Err` on context-pack temp-file write failure or when session
/// resume is requested.
pub fn build_copilot_launch(
    context_pack: Option<&ContextPack>,
    autonomy_mode: &str,
    requesting_agent: Option<&str>,
    plan_short_id: Option<&str>,
    options: &LaunchOptions,
) -> Result<LaunchCommand, String> {
    // ── Session mode ─────────────────────────────────────────────────────────
    if options.session_mode.trim().eq_ignore_ascii_case("resume") {
        return Err("Copilot does not support session resume".to_string());
    }

    let program = "gh".to_string();

    // ── Screen-reader / load-reduction flags ─────────────────────────────────
    // The `gh copilot` CLI (v1.x) does not expose equivalent load-reduction
    // flags such as `--screen-reader`, `--no-interactive-hints`, or
    // `--disable-animations`.  The `options.screen_reader` field is read by
    // `build_gemini_launch` but intentionally ignored here to avoid passing
    // invalid arguments.  `approval_copilot_minimal_ui` is surfaced as a
    // user-facing checkbox in the approval dialog for forward compatibility;
    // no CLI flag is emitted at this time.
    // Copilot CLI has no equivalent screen-reader flag as of v1.x.
    let mut args: Vec<String> = vec![
        "copilot".to_string(),
        "suggest".to_string(),
        "--target".to_string(),
        "shell".to_string(),
    ];
    let mut env: HashMap<String, String> = HashMap::new();
    let mut context_pack_path: Option<PathBuf> = None;

    // Pre-seed initial prompt with step notes if available
    if let Some(pack) = context_pack {
        if let Some(notes) = &pack.step_notes {
            let truncated = if notes.len() > 512 {
                format!("{}…", &notes[..512])
            } else {
                notes.clone()
            };
            args.push(truncated);
        }

        // Write full context pack to a temp file for reference
        match write_context_pack_to_tempfile(pack) {
            Ok(path) => {
                env.insert(
                    "PM_COPILOT_CONTEXT_FILE".to_string(),
                    path.to_string_lossy().to_string(),
                );
                context_pack_path = Some(path);
            }
            Err(err) => {
                return Err(format!(
                    "Failed to write Copilot context-pack temp file: {err}"
                ));
            }
        }
    }

    if !autonomy_mode.is_empty() {
        env.insert(
            "PM_AGENT_AUTONOMY_MODE".to_string(),
            autonomy_mode.to_string(),
        );
    }

    // ── Output format ────────────────────────────────────────────────────────
    // Copilot does not support structured output natively.
    // Inject PM_REQUESTED_OUTPUT_FORMAT so callers can detect the mismatch.
    let effective_output_format = match options.output_format.trim() {
        "json" | "stream-json" => options.output_format.trim(),
        _ => "text",
    };
    if effective_output_format != "text" {
        eprintln!(
            "[PM][launch_builder] output_format '{}' not natively supported by copilot, \
             falling back to text",
            effective_output_format
        );
        env.insert(
            "PM_REQUESTED_OUTPUT_FORMAT".to_string(),
            effective_output_format.to_string(),
        );
    }

    let agent_tag = requesting_agent.unwrap_or("agent");
    let plan_tag = plan_short_id.unwrap_or("");
    let session_label = if plan_tag.is_empty() {
        format!("Copilot \u{2014} {agent_tag}")
    } else {
        format!("Copilot \u{2014} {agent_tag} \u{2014} {plan_tag}")
    };

    // Inject autonomy budget env vars when caps are set
    if let Some(budget) = &options.autonomy_budget {
        if let Some(n) = budget.max_commands {
            env.insert("PM_BUDGET_MAX_COMMANDS".to_string(), n.to_string());
        }
        if let Some(n) = budget.max_duration_secs {
            env.insert("PM_BUDGET_MAX_DURATION_SECS".to_string(), n.to_string());
        }
        if let Some(n) = budget.max_files {
            env.insert("PM_BUDGET_MAX_FILES".to_string(), n.to_string());
        }
    }

    Ok(LaunchCommand {
        program,
        args,
        env,
        context_pack_path,
        session_label,
        provider: "copilot".to_string(),
    })
}

// ─── Provider dispatch ───────────────────────────────────────────────────────

/// Dispatch to the appropriate builder based on the `provider` string.
///
/// Accepted values (case-insensitive, `.cmd`/`.exe` suffix stripped):
/// `"gemini"`, `"copilot"`.
pub fn build_launch_command(
    provider: &str,
    context_pack: Option<&ContextPack>,
    autonomy_mode: &str,
    requesting_agent: Option<&str>,
    plan_short_id: Option<&str>,
    options: &LaunchOptions,
) -> Result<LaunchCommand, String> {
    let normalized = normalize_provider_token(provider);

    // ── Risk-aware approval gate ──────────────────────────────────────────
    // Compute risk tier from autonomy mode + budget and block if the user
    // has not confirmed trusted-scope access for medium/high-risk launches.
    let risk_tier = evaluate_risk_tier(autonomy_mode, options.autonomy_budget.as_ref());
    if risk_tier >= 2 && !options.trusted_scope_confirmed {
        return Err(format!(
            "Trusted-scope confirmation required for risk tier {risk_tier} launch \
             (autonomous mode with {}). \
             Check the trusted-scope confirmation checkbox in the approval dialog.",
            if risk_tier == 3 {
                "unrestricted scope — no autonomy budget set"
            } else {
                "bounded scope — autonomy budget is set"
            }
        ));
    }

    match normalized.as_str() {
        "gemini" => build_gemini_launch(context_pack, autonomy_mode, requesting_agent, plan_short_id, options),
        "copilot" => build_copilot_launch(context_pack, autonomy_mode, requesting_agent, plan_short_id, options),
        other => Err(format!("Unknown provider: \"{other}\"")),
    }
}

/// Normalise a raw provider token (strip path and known suffixes, lower-case).
pub fn normalize_provider_token(value: &str) -> String {
    let trimmed = value.trim().to_ascii_lowercase();
    if trimmed.is_empty() {
        return String::new();
    }
    let basename = trimmed
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(trimmed.as_str());
    basename
        .trim_end_matches(".cmd")
        .trim_end_matches(".exe")
        .to_string()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Serialise a [`ContextPack`] to a temporary JSON file.
///
/// The file is created in the system temp directory with a unique name.
/// Returns the path on success.
fn write_context_pack_to_tempfile(pack: &ContextPack) -> Result<PathBuf, String> {
    let json =
        serde_json::to_string_pretty(pack).map_err(|e| format!("JSON serialise error: {e}"))?;

    let file_name = format!(
        "pm-ctx-pack-{}.json",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );
    let path = std::env::temp_dir().join(file_name);

    let mut file = std::fs::File::create(&path)
        .map_err(|e| format!("Cannot create context-pack temp file: {e}"))?;
    file.write_all(json.as_bytes())
        .map_err(|e| format!("Cannot write context-pack temp file: {e}"))?;

    Ok(path)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{ContextPack, RelevantFile};

    fn sample_context_pack() -> ContextPack {
        ContextPack {
            step_notes: Some("Implement feature X in src/feature.ts".to_string()),
            relevant_files: vec![RelevantFile {
                path: "src/feature.ts".to_string(),
                snippet: Some("export function featureX() {}".to_string()),
            }],
            workspace_instructions: Some("Follow existing code style".to_string()),
            custom_instructions: Some("Focus on type safety".to_string()),
            requesting_agent: Some("Executor".to_string()),
            plan_id: Some("plan_abc12345_abcdefgh".to_string()),
            session_id: Some("sess_abc12345_abcdefgh".to_string()),
            session_resume: None,
        }
    }

    #[test]
    fn gemini_launch_no_pack() {
        let opts = LaunchOptions::default();
        let cmd = build_gemini_launch(None, "guided", Some("Executor"), Some("plan_abc1"), &opts)
            .expect("build_gemini_launch should succeed with no context pack");

        assert_eq!(cmd.provider, "gemini");
        assert!(cmd.program.starts_with("gemini"));
        assert!(cmd.context_pack_path.is_none());
        assert_eq!(cmd.session_label, "Gemini \u{2014} Executor \u{2014} plan_abc1");
        assert!(!cmd.env.contains_key("GEMINI_CONTEXT_FILE"));
    }

    #[test]
    fn gemini_launch_with_pack() {
        let pack = sample_context_pack();
        let opts = LaunchOptions::default();
        let cmd = build_gemini_launch(Some(&pack), "autonomous", Some("Executor"), Some("plan_abc1"), &opts)
            .expect("build_gemini_launch should succeed with context pack");

        assert_eq!(cmd.provider, "gemini");
        assert!(cmd.context_pack_path.is_some());
        assert!(cmd.env.contains_key("GEMINI_CONTEXT_FILE"));
        assert_eq!(cmd.env.get("PM_AGENT_AUTONOMY_MODE").map(|s| s.as_str()), Some("autonomous"));

        // Verify temp file was written and is valid JSON
        let path = cmd.context_pack_path.as_ref().unwrap();
        assert!(path.exists());
        let content = std::fs::read_to_string(path).unwrap();
        let parsed: ContextPack = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed.requesting_agent, Some("Executor".to_string()));
        assert_eq!(parsed.step_notes, Some("Implement feature X in src/feature.ts".to_string()));

        // Cleanup
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn copilot_launch_no_pack() {
        let opts = LaunchOptions::default();
        let cmd = build_copilot_launch(None, "guided", Some("Executor"), Some("plan_abc1"), &opts)
            .expect("build_copilot_launch should succeed with no context pack");

        assert_eq!(cmd.provider, "copilot");
        assert_eq!(cmd.program, "gh");
        assert!(cmd.args.contains(&"suggest".to_string()));
        assert!(cmd.args.contains(&"--target".to_string()));
        assert!(cmd.args.contains(&"shell".to_string()));
        assert!(cmd.context_pack_path.is_none());
    }

    #[test]
    fn copilot_launch_with_pack_injects_step_notes() {
        let pack = sample_context_pack();
        let opts = LaunchOptions::default();
        let cmd = build_copilot_launch(Some(&pack), "guided", Some("Executor"), Some("plan_abc1"), &opts)
            .expect("build_copilot_launch should succeed with context pack");

        // Step notes should appear as a trailing positional arg
        let notes_in_args = cmd.args.iter().any(|a| a.contains("Implement feature X"));
        assert!(notes_in_args, "step notes should be injected as initial prompt");

        // Context pack temp file should be written
        assert!(cmd.context_pack_path.is_some());
        assert!(cmd.env.contains_key("PM_COPILOT_CONTEXT_FILE"));

        // Cleanup
        if let Some(path) = &cmd.context_pack_path {
            let _ = std::fs::remove_file(path);
        }
    }

    #[test]
    fn dispatch_gemini() {
        let opts = LaunchOptions::default();
        let cmd = build_launch_command("gemini", None, "guided", Some("Tester"), None, &opts)
            .expect("dispatch gemini");
        assert_eq!(cmd.provider, "gemini");
    }

    #[test]
    fn dispatch_copilot() {
        let opts = LaunchOptions::default();
        let cmd = build_launch_command("copilot", None, "guided", Some("Tester"), None, &opts)
            .expect("dispatch copilot");
        assert_eq!(cmd.provider, "copilot");
    }

    #[test]
    fn dispatch_gemini_cmd_suffix() {
        let opts = LaunchOptions::default();
        let cmd = build_launch_command("gemini.cmd", None, "guided", Some("Tester"), None, &opts)
            .expect("dispatch gemini.cmd");
        assert_eq!(cmd.provider, "gemini");
    }

    #[test]
    fn dispatch_unknown_fails() {
        let opts = LaunchOptions::default();
        let result = build_launch_command("unknown_provider", None, "guided", None, None, &opts);
        assert!(result.is_err());
    }

    #[test]
    fn normalize_token_strips_suffix() {
        assert_eq!(normalize_provider_token("gemini.cmd"), "gemini");
        assert_eq!(normalize_provider_token("GEMINI.EXE"), "gemini");
        assert_eq!(normalize_provider_token("C:\\tools\\copilot.cmd"), "copilot");
        assert_eq!(normalize_provider_token(""), "");
    }

    #[test]
    fn context_pack_from_context_json_roundtrip() {
        use crate::protocol::context_pack_from_context_json;

        let pack = sample_context_pack();
        let envelope = serde_json::json!({
            "source": { "launch_kind": "agent_cli_launch" },
            "context_pack": &pack
        });
        let json = serde_json::to_string(&envelope).unwrap();
        let extracted = context_pack_from_context_json(&json).unwrap();
        assert_eq!(extracted.requesting_agent, pack.requesting_agent);
        assert_eq!(extracted.step_notes, pack.step_notes);
        assert_eq!(extracted.relevant_files.len(), 1);
    }

    // ── Scenario matrix: provider × mode × env propagation (Step 17) ─────────

    #[test]
    fn gemini_launch_guided_mode_sets_env() {
        let opts = LaunchOptions::default();
        let cmd = build_gemini_launch(None, "guided", Some("Executor"), None, &opts)
            .expect("guided gemini launch should succeed");
        assert_eq!(
            cmd.env.get("PM_AGENT_AUTONOMY_MODE").map(|s| s.as_str()),
            Some("guided"),
            "guided mode must be reflected in PM_AGENT_AUTONOMY_MODE"
        );
    }

    #[test]
    fn copilot_launch_autonomous_mode_sets_env() {
        let opts = LaunchOptions::default();
        let cmd = build_copilot_launch(None, "autonomous", Some("Executor"), None, &opts)
            .expect("autonomous copilot launch should succeed");
        assert_eq!(
            cmd.env.get("PM_AGENT_AUTONOMY_MODE").map(|s| s.as_str()),
            Some("autonomous"),
            "autonomous mode must be reflected in PM_AGENT_AUTONOMY_MODE"
        );
    }

    #[test]
    fn launch_empty_autonomy_mode_not_injected() {
        let opts = LaunchOptions::default();
        let gemini_cmd = build_gemini_launch(None, "", Some("Executor"), None, &opts)
            .expect("empty-mode gemini launch should succeed");
        assert!(
            !gemini_cmd.env.contains_key("PM_AGENT_AUTONOMY_MODE"),
            "empty autonomy mode must not inject PM_AGENT_AUTONOMY_MODE for gemini"
        );

        let copilot_cmd = build_copilot_launch(None, "", Some("Executor"), None, &opts)
            .expect("empty-mode copilot launch should succeed");
        assert!(
            !copilot_cmd.env.contains_key("PM_AGENT_AUTONOMY_MODE"),
            "empty autonomy mode must not inject PM_AGENT_AUTONOMY_MODE for copilot"
        );
    }

    #[test]
    fn dispatch_preserves_autonomy_mode_per_provider() {
        // Autonomous mode with trusted_scope_confirmed = true (required for tier 2/3)
        let opts_auto = LaunchOptions {
            trusted_scope_confirmed: true,
            ..LaunchOptions::default()
        };
        let g_auto = build_launch_command("gemini", None, "autonomous", Some("Tester"), None, &opts_auto)
            .expect("gemini autonomous dispatch with trusted scope confirmed");
        assert_eq!(g_auto.provider, "gemini");
        assert_eq!(
            g_auto.env.get("PM_AGENT_AUTONOMY_MODE").map(|s| s.as_str()),
            Some("autonomous")
        );

        let opts = LaunchOptions::default();
        let c_guided = build_launch_command("copilot", None, "guided", Some("Tester"), None, &opts)
            .expect("copilot guided dispatch");
        assert_eq!(c_guided.provider, "copilot");
        assert_eq!(
            c_guided.env.get("PM_AGENT_AUTONOMY_MODE").map(|s| s.as_str()),
            Some("guided")
        );
    }

    // ── Step 29: Risk tier evaluation ────────────────────────────────────────

    #[test]
    fn risk_tier_guided_is_low() {
        assert_eq!(evaluate_risk_tier("guided", None), 1);
        assert_eq!(evaluate_risk_tier("", None), 1);
        assert_eq!(evaluate_risk_tier("GUIDED", None), 1);
    }

    #[test]
    fn risk_tier_autonomous_no_budget_is_high() {
        assert_eq!(evaluate_risk_tier("autonomous", None), 3);
    }

    #[test]
    fn risk_tier_autonomous_with_budget_is_medium() {
        let budget = AutonomyBudget {
            max_commands: Some(50),
            max_duration_secs: None,
            max_files: None,
        };
        assert_eq!(evaluate_risk_tier("autonomous", Some(&budget)), 2);
    }

    #[test]
    fn risk_tier_autonomous_all_caps_is_medium() {
        let budget = AutonomyBudget {
            max_commands: Some(50),
            max_duration_secs: Some(3600),
            max_files: Some(20),
        };
        assert_eq!(evaluate_risk_tier("autonomous", Some(&budget)), 2);
    }

    #[test]
    fn risk_tier_autonomous_empty_budget_struct_is_high() {
        // A budget with all None fields is functionally equivalent to no budget
        let budget = AutonomyBudget {
            max_commands: None,
            max_duration_secs: None,
            max_files: None,
        };
        // All None → tier 3 (no actual caps set)
        assert_eq!(evaluate_risk_tier("autonomous", Some(&budget)), 3);
    }

    // ── Step 30: Trusted-scope gate ───────────────────────────────────────────

    #[test]
    fn build_launch_command_autonomous_no_trust_rejected() {
        // Tier 3 (autonomous, no budget) WITHOUT trusted scope confirmed → Err
        let opts = LaunchOptions {
            trusted_scope_confirmed: false,
            ..LaunchOptions::default()
        };
        let result = build_launch_command("gemini", None, "autonomous", Some("Tester"), None, &opts);
        assert!(result.is_err(), "should be rejected without trusted-scope confirmation");
        let err = result.unwrap_err();
        assert!(
            err.contains("Trusted-scope confirmation required"),
            "error message mismatch: {err}"
        );
    }

    #[test]
    fn build_launch_command_autonomous_with_trust_accepted() {
        // Tier 3 (autonomous, no budget) WITH trusted scope confirmed → Ok
        let opts = LaunchOptions {
            trusted_scope_confirmed: true,
            ..LaunchOptions::default()
        };
        let result = build_launch_command("gemini", None, "autonomous", Some("Tester"), None, &opts);
        assert!(result.is_ok(), "should succeed with trusted-scope confirmation: {:?}", result.err());
    }

    #[test]
    fn build_launch_command_guided_no_trust_accepted() {
        // Guided mode (tier 1) does NOT require trusted-scope — must succeed
        let opts = LaunchOptions {
            trusted_scope_confirmed: false,
            ..LaunchOptions::default()
        };
        let result = build_launch_command("gemini", None, "guided", Some("Tester"), None, &opts);
        assert!(result.is_ok(), "guided mode should not require trusted-scope: {:?}", result.err());
    }

    // ── Step 31: Autonomy budget env vars ────────────────────────────────────

    #[test]
    fn gemini_budget_env_vars_injected() {
        let budget = AutonomyBudget {
            max_commands: Some(100),
            max_duration_secs: Some(7200),
            max_files: Some(30),
        };
        let opts = LaunchOptions {
            autonomy_budget: Some(budget),
            trusted_scope_confirmed: true,
            ..LaunchOptions::default()
        };
        let cmd = build_gemini_launch(None, "autonomous", Some("Executor"), None, &opts)
            .expect("gemini launch with budget should succeed");
        assert_eq!(cmd.env.get("PM_BUDGET_MAX_COMMANDS").map(|s| s.as_str()), Some("100"));
        assert_eq!(cmd.env.get("PM_BUDGET_MAX_DURATION_SECS").map(|s| s.as_str()), Some("7200"));
        assert_eq!(cmd.env.get("PM_BUDGET_MAX_FILES").map(|s| s.as_str()), Some("30"));
    }

    #[test]
    fn copilot_budget_partial_env_vars_injected() {
        let budget = AutonomyBudget {
            max_commands: Some(50),
            max_duration_secs: None,
            max_files: None,
        };
        let opts = LaunchOptions {
            autonomy_budget: Some(budget),
            ..LaunchOptions::default()
        };
        let cmd = build_copilot_launch(None, "guided", Some("Executor"), None, &opts)
            .expect("copilot launch with partial budget should succeed");
        assert_eq!(cmd.env.get("PM_BUDGET_MAX_COMMANDS").map(|s| s.as_str()), Some("50"));
        assert!(!cmd.env.contains_key("PM_BUDGET_MAX_DURATION_SECS"), "absent budget field must not inject env var");
        assert!(!cmd.env.contains_key("PM_BUDGET_MAX_FILES"), "absent budget field must not inject env var");
    }

    #[test]
    fn no_budget_no_budget_env_vars() {
        let opts = LaunchOptions::default();
        let cmd = build_gemini_launch(None, "guided", Some("Executor"), None, &opts)
            .expect("gemini launch without budget");
        assert!(!cmd.env.contains_key("PM_BUDGET_MAX_COMMANDS"));
        assert!(!cmd.env.contains_key("PM_BUDGET_MAX_DURATION_SECS"));
        assert!(!cmd.env.contains_key("PM_BUDGET_MAX_FILES"));
    }

    #[test]
    fn gemini_session_label_without_plan_tag() {
        let opts = LaunchOptions::default();
        let cmd = build_gemini_launch(None, "guided", Some("Executor"), None, &opts)
            .expect("build should succeed");
        assert_eq!(cmd.session_label, "Gemini \u{2014} Executor");
    }

    #[test]
    fn copilot_session_label_with_plan_tag() {
        let opts = LaunchOptions::default();
        let cmd = build_copilot_launch(None, "guided", Some("Analyst"), Some("plan_xyz"), &opts)
            .expect("build should succeed");
        assert_eq!(cmd.session_label, "Copilot \u{2014} Analyst \u{2014} plan_xyz");
    }

    // ── Step 27: Session mode (new / resume) ─────────────────────────────────

    #[test]
    fn gemini_resume_with_session_id_embeds_in_pack() {
        let opts = LaunchOptions {
            session_mode: "resume".to_string(),
            resume_session_id: Some("sess_abc_resume123".to_string()),
            output_format: String::new(),
            ..LaunchOptions::default()
        };
        let cmd = build_gemini_launch(None, "guided", Some("Executor"), None, &opts)
            .expect("resume gemini launch should succeed");

        assert_eq!(cmd.provider, "gemini");
        // A context pack temp file must have been written (for session_resume)
        assert!(cmd.context_pack_path.is_some(), "context pack should be written for resume");
        assert!(cmd.env.contains_key("GEMINI_CONTEXT_FILE"));

        // The temp file should contain session_resume.session_id
        let path = cmd.context_pack_path.as_ref().unwrap();
        let content = std::fs::read_to_string(path).unwrap();
        let parsed: ContextPack = serde_json::from_str(&content).unwrap();
        assert!(parsed.session_resume.is_some());
        assert_eq!(
            parsed.session_resume.as_ref().map(|sr| sr.session_id.as_str()),
            Some("sess_abc_resume123")
        );

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn gemini_resume_without_session_id_falls_back_to_new() {
        let opts = LaunchOptions {
            session_mode: "resume".to_string(),
            resume_session_id: None,
            output_format: String::new(),
            ..LaunchOptions::default()
        };
        // Should succeed (fallback to new), not error
        let cmd = build_gemini_launch(None, "guided", Some("Executor"), None, &opts)
            .expect("resume without id should fall back to new session");
        assert_eq!(cmd.provider, "gemini");
        // No context pack for a bare fallback (no pack supplied, no session_resume)
        assert!(cmd.context_pack_path.is_none());
    }

    #[test]
    fn copilot_resume_returns_error() {
        let opts = LaunchOptions {
            session_mode: "resume".to_string(),
            resume_session_id: Some("sess_xyz".to_string()),
            output_format: String::new(),
            ..LaunchOptions::default()
        };
        let result = build_copilot_launch(None, "guided", Some("Executor"), None, &opts);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.contains("does not support session resume"),
            "error must mention 'does not support session resume', got: {err}"
        );
    }

    // ── Step 28: Output format ────────────────────────────────────────────────

    #[test]
    fn gemini_output_format_json_adds_flag() {
        let opts = LaunchOptions {
            session_mode: String::new(),
            resume_session_id: None,
            output_format: "json".to_string(),
            ..LaunchOptions::default()
        };
        let cmd = build_gemini_launch(None, "guided", Some("Executor"), None, &opts)
            .expect("gemini json output format launch");
        // args should contain --output_format json
        let idx = cmd.args.iter().position(|a| a == "--output_format");
        assert!(idx.is_some(), "--output_format flag must be present for json");
        assert_eq!(cmd.args.get(idx.unwrap() + 1).map(|s| s.as_str()), Some("json"));
    }

    #[test]
    fn gemini_output_format_stream_json_adds_flag() {
        let opts = LaunchOptions {
            session_mode: String::new(),
            resume_session_id: None,
            output_format: "stream-json".to_string(),
            ..LaunchOptions::default()
        };
        let cmd = build_gemini_launch(None, "guided", Some("Executor"), None, &opts)
            .expect("gemini stream-json output format launch");
        let idx = cmd.args.iter().position(|a| a == "--output_format");
        assert!(idx.is_some(), "--output_format flag must be present for stream-json");
        assert_eq!(cmd.args.get(idx.unwrap() + 1).map(|s| s.as_str()), Some("stream-json"));
    }

    #[test]
    fn gemini_output_format_text_no_flag() {
        let opts = LaunchOptions {
            session_mode: String::new(),
            resume_session_id: None,
            output_format: "text".to_string(),
            ..LaunchOptions::default()
        };
        let cmd = build_gemini_launch(None, "guided", Some("Executor"), None, &opts)
            .expect("gemini text output format launch");
        assert!(
            !cmd.args.contains(&"--output_format".to_string()),
            "no --output_format flag for text mode"
        );
    }

    #[test]
    fn copilot_output_format_json_injects_env_and_falls_back() {
        let opts = LaunchOptions {
            session_mode: String::new(),
            resume_session_id: None,
            output_format: "json".to_string(),
            ..LaunchOptions::default()
        };
        let cmd = build_copilot_launch(None, "guided", Some("Executor"), None, &opts)
            .expect("copilot json output format launch");
        // Must inject PM_REQUESTED_OUTPUT_FORMAT
        assert_eq!(
            cmd.env.get("PM_REQUESTED_OUTPUT_FORMAT").map(|s| s.as_str()),
            Some("json"),
            "PM_REQUESTED_OUTPUT_FORMAT must be set for copilot json fallback"
        );
        // Must not pass --output_format to CLI
        assert!(!cmd.args.contains(&"--output_format".to_string()));
    }

    #[test]
    fn copilot_output_format_text_no_env_injection() {
        let opts = LaunchOptions {
            session_mode: String::new(),
            resume_session_id: None,
            output_format: "text".to_string(),
            ..LaunchOptions::default()
        };
        let cmd = build_copilot_launch(None, "guided", Some("Executor"), None, &opts)
            .expect("copilot text output format launch");
        assert!(
            !cmd.env.contains_key("PM_REQUESTED_OUTPUT_FORMAT"),
            "no PM_REQUESTED_OUTPUT_FORMAT for text mode"
        );
    }

    // ── Step 12: Screen-reader flag & API key injection ───────────────────────

    #[test]
    fn build_gemini_launch_includes_screen_reader_when_enabled() {
        let opts = LaunchOptions {
            screen_reader: true,
            ..LaunchOptions::default()
        };
        let cmd = build_gemini_launch(None, "guided", Some("Tester"), None, &opts)
            .expect("build_gemini_launch should succeed with screen_reader=true");
        assert!(
            cmd.args.contains(&"--screen-reader".to_string()),
            "Expected --screen-reader in args but got: {:?}", cmd.args
        );
    }

    #[test]
    fn build_gemini_launch_excludes_screen_reader_when_disabled() {
        let opts = LaunchOptions {
            screen_reader: false,
            ..LaunchOptions::default()
        };
        let cmd = build_gemini_launch(None, "guided", Some("Tester"), None, &opts)
            .expect("build_gemini_launch should succeed with screen_reader=false");
        assert!(
            !cmd.args.contains(&"--screen-reader".to_string()),
            "Expected no --screen-reader but got: {:?}", cmd.args
        );
    }

    #[test]
    fn build_gemini_launch_gemini_api_key_env_not_empty_if_set() {
        // Verifies the invariant: GEMINI_API_KEY is only injected when non-empty,
        // and GEMINI_API_KEY and GOOGLE_API_KEY are always set together.
        // In CI / test environments without a key file the env will simply be absent
        // (not an empty string) — both outcomes are valid.
        let opts = LaunchOptions::default();
        let cmd = build_gemini_launch(None, "guided", None, None, &opts)
            .expect("build_gemini_launch should always succeed");
        if let Some(key) = cmd.env.get("GEMINI_API_KEY") {
            assert!(!key.trim().is_empty(), "GEMINI_API_KEY must not be empty if injected");
        }
        // Both env vars must be set together, never one without the other.
        assert_eq!(
            cmd.env.contains_key("GEMINI_API_KEY"),
            cmd.env.contains_key("GOOGLE_API_KEY"),
            "GEMINI_API_KEY and GOOGLE_API_KEY must be injected together"
        );
        if let (Some(gemini_key), Some(google_key)) = (
            cmd.env.get("GEMINI_API_KEY"),
            cmd.env.get("GOOGLE_API_KEY"),
        ) {
            assert_eq!(gemini_key, google_key, "GEMINI_API_KEY and GOOGLE_API_KEY must have the same value");
        }
    }

    #[test]
    fn build_copilot_launch_does_not_include_screen_reader() {
        // Even when screen_reader=true is set in LaunchOptions, Copilot CLI
        // (v1.x) has no equivalent flag — build_copilot_launch must not
        // forward --screen-reader to avoid passing an unknown argument.
        let opts = LaunchOptions {
            screen_reader: true,
            ..LaunchOptions::default()
        };
        let cmd = build_copilot_launch(None, "guided", Some("Tester"), None, &opts)
            .expect("build_copilot_launch should succeed");
        assert!(
            !cmd.args.contains(&"--screen-reader".to_string()),
            "Copilot CLI does not support --screen-reader; found in args: {:?}", cmd.args
        );
    }
}
