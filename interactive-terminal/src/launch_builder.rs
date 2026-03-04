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
/// # Errors
/// Returns `Err` if the temp-file write fails when a context pack is provided.
pub fn build_gemini_launch(
    context_pack: Option<&ContextPack>,
    autonomy_mode: &str,
    requesting_agent: Option<&str>,
    plan_short_id: Option<&str>,
) -> Result<LaunchCommand, String> {
    // Platform-specific binary name
    #[cfg(target_os = "windows")]
    let program = "gemini.cmd".to_string();
    #[cfg(not(target_os = "windows"))]
    let program = "gemini".to_string();

    let mut args: Vec<String> = Vec::new();
    let mut env: HashMap<String, String> = HashMap::new();
    let mut context_pack_path: Option<PathBuf> = None;

    // Inject stored API key if available
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

    // Serialise context pack to a temp file if supplied
    if let Some(pack) = context_pack {
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
        format!("Gemini — {agent_tag}")
    } else {
        format!("Gemini — {agent_tag} — {plan_tag}")
    };

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
/// # Errors
/// Returns `Err` on context-pack temp-file write failure.
pub fn build_copilot_launch(
    context_pack: Option<&ContextPack>,
    autonomy_mode: &str,
    requesting_agent: Option<&str>,
    plan_short_id: Option<&str>,
) -> Result<LaunchCommand, String> {
    let program = "gh".to_string();

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

    let agent_tag = requesting_agent.unwrap_or("agent");
    let plan_tag = plan_short_id.unwrap_or("");
    let session_label = if plan_tag.is_empty() {
        format!("Copilot — {agent_tag}")
    } else {
        format!("Copilot — {agent_tag} — {plan_tag}")
    };

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
) -> Result<LaunchCommand, String> {
    let normalized = normalize_provider_token(provider);
    match normalized.as_str() {
        "gemini" => build_gemini_launch(context_pack, autonomy_mode, requesting_agent, plan_short_id),
        "copilot" => build_copilot_launch(context_pack, autonomy_mode, requesting_agent, plan_short_id),
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
        }
    }

    #[test]
    fn gemini_launch_no_pack() {
        let cmd = build_gemini_launch(None, "guided", Some("Executor"), Some("plan_abc1"))
            .expect("build_gemini_launch should succeed with no context pack");

        assert_eq!(cmd.provider, "gemini");
        assert!(cmd.program.starts_with("gemini"));
        assert!(cmd.context_pack_path.is_none());
        assert_eq!(
            cmd.session_label,
            "Gemini — Executor — plan_abc1"
        );
        assert!(!cmd.env.contains_key("GEMINI_CONTEXT_FILE"));
    }

    #[test]
    fn gemini_launch_with_pack() {
        let pack = sample_context_pack();
        let cmd = build_gemini_launch(Some(&pack), "autonomous", Some("Executor"), Some("plan_abc1"))
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
        let cmd = build_copilot_launch(None, "guided", Some("Executor"), Some("plan_abc1"))
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
        let cmd = build_copilot_launch(Some(&pack), "guided", Some("Executor"), Some("plan_abc1"))
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
        let cmd = build_launch_command("gemini", None, "guided", Some("Tester"), None)
            .expect("dispatch gemini");
        assert_eq!(cmd.provider, "gemini");
    }

    #[test]
    fn dispatch_copilot() {
        let cmd = build_launch_command("copilot", None, "guided", Some("Tester"), None)
            .expect("dispatch copilot");
        assert_eq!(cmd.provider, "copilot");
    }

    #[test]
    fn dispatch_gemini_cmd_suffix() {
        let cmd = build_launch_command("gemini.cmd", None, "guided", Some("Tester"), None)
            .expect("dispatch gemini.cmd");
        assert_eq!(cmd.provider, "gemini");
    }

    #[test]
    fn dispatch_unknown_fails() {
        let result = build_launch_command("unknown_provider", None, "guided", None, None);
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
        let cmd = build_gemini_launch(None, "guided", Some("Executor"), None)
            .expect("guided gemini launch should succeed");
        assert_eq!(
            cmd.env.get("PM_AGENT_AUTONOMY_MODE").map(|s| s.as_str()),
            Some("guided"),
            "guided mode must be reflected in PM_AGENT_AUTONOMY_MODE"
        );
    }

    #[test]
    fn copilot_launch_autonomous_mode_sets_env() {
        let cmd = build_copilot_launch(None, "autonomous", Some("Executor"), None)
            .expect("autonomous copilot launch should succeed");
        assert_eq!(
            cmd.env.get("PM_AGENT_AUTONOMY_MODE").map(|s| s.as_str()),
            Some("autonomous"),
            "autonomous mode must be reflected in PM_AGENT_AUTONOMY_MODE"
        );
    }

    #[test]
    fn launch_empty_autonomy_mode_not_injected() {
        // When autonomy mode is empty, PM_AGENT_AUTONOMY_MODE must NOT appear
        // in the env map (caller didn't specify a mode).
        let gemini_cmd = build_gemini_launch(None, "", Some("Executor"), None)
            .expect("empty-mode gemini launch should succeed");
        assert!(
            !gemini_cmd.env.contains_key("PM_AGENT_AUTONOMY_MODE"),
            "empty autonomy mode must not inject PM_AGENT_AUTONOMY_MODE for gemini"
        );

        let copilot_cmd = build_copilot_launch(None, "", Some("Executor"), None)
            .expect("empty-mode copilot launch should succeed");
        assert!(
            !copilot_cmd.env.contains_key("PM_AGENT_AUTONOMY_MODE"),
            "empty autonomy mode must not inject PM_AGENT_AUTONOMY_MODE for copilot"
        );
    }

    #[test]
    fn dispatch_preserves_autonomy_mode_per_provider() {
        // Gemini autonomous
        let g_auto = build_launch_command("gemini", None, "autonomous", Some("Tester"), None)
            .expect("gemini autonomous dispatch");
        assert_eq!(g_auto.provider, "gemini");
        assert_eq!(
            g_auto.env.get("PM_AGENT_AUTONOMY_MODE").map(|s| s.as_str()),
            Some("autonomous")
        );

        // Copilot guided
        let c_guided = build_launch_command("copilot", None, "guided", Some("Tester"), None)
            .expect("copilot guided dispatch");
        assert_eq!(c_guided.provider, "copilot");
        assert_eq!(
            c_guided.env.get("PM_AGENT_AUTONOMY_MODE").map(|s| s.as_str()),
            Some("guided")
        );
    }

    #[test]
    fn gemini_session_label_without_plan_tag() {
        let cmd = build_gemini_launch(None, "guided", Some("Executor"), None)
            .expect("build should succeed");
        assert_eq!(cmd.session_label, "Gemini \u{2014} Executor");
    }

    #[test]
    fn copilot_session_label_with_plan_tag() {
        let cmd = build_copilot_launch(None, "guided", Some("Analyst"), Some("plan_xyz"))
            .expect("build should succeed");
        assert_eq!(cmd.session_label, "Copilot \u{2014} Analyst \u{2014} plan_xyz");
    }
}
