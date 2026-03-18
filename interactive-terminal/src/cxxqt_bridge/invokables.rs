use crate::cxxqt_bridge::ffi;
use crate::cxxqt_bridge::{
    monotonic_millis, terminal_profile_from_key, terminal_profile_to_key, timestamp_now,
};
use crate::protocol::{CommandRequest, CommandResponse, Message, ResponseStatus};
use cxx_qt::CxxQtType;
use cxx_qt_lib::QString;
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::pin::Pin;
use std::process::Command;
use std::process::Stdio;

const GEMINI_SENTINEL_TOKEN: &str = "{{stored}}";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct ApprovalProviderPrefillPolicy {
    pub(crate) prefilled_provider: String,
    pub(crate) provider_prefill_source: String,
    pub(crate) provider_selection_required: bool,
    pub(crate) provider_chooser_visible: bool,
}

fn normalize_provider_for_prefill(value: &str) -> &'static str {
    let normalized = value.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "gemini" | "gemini.cmd" => "gemini",
        "copilot" | "copilot.cmd" => "copilot",
        "claude" | "claude.cmd" => "claude",
        _ => "",
    }
}

pub(crate) fn resolve_approval_provider_prefill_policy(
    provider_policy_applies: bool,
    preferred_provider: &str,
    chooser_enabled: bool,
) -> ApprovalProviderPrefillPolicy {
    if !provider_policy_applies {
        return ApprovalProviderPrefillPolicy {
            prefilled_provider: String::new(),
            provider_prefill_source: "none".to_string(),
            provider_selection_required: false,
            provider_chooser_visible: false,
        };
    }

    let normalized_preferred = normalize_provider_for_prefill(preferred_provider);
    if !normalized_preferred.is_empty() {
        return ApprovalProviderPrefillPolicy {
            prefilled_provider: normalized_preferred.to_string(),
            provider_prefill_source: "default".to_string(),
            provider_selection_required: false,
            provider_chooser_visible: chooser_enabled,
        };
    }

    ApprovalProviderPrefillPolicy {
        prefilled_provider: String::new(),
        provider_prefill_source: "none".to_string(),
        provider_selection_required: true,
        provider_chooser_visible: true,
    }
}

#[cfg(target_os = "windows")]
fn gemini_tab_launch_command() -> &'static str {
    // Prefer command-resolution through Get-Command so the launch works for
    // npm-installed shims (`gemini.cmd`, `gemini.ps1`, etc.).
    "if (Get-Command gemini -ErrorAction SilentlyContinue) { gemini } elseif (Get-Command gemini.cmd -ErrorAction SilentlyContinue) { gemini.cmd } else { Write-Error 'Gemini CLI not found in PATH (expected gemini).'; }"
}

#[cfg(not(target_os = "windows"))]
fn gemini_tab_launch_command() -> &'static str {
    "gemini"
}

#[cfg(target_os = "windows")]
fn copilot_tab_launch_command() -> &'static str {
    // Primary path: standalone `copilot` CLI. Fallback path: `gh copilot`.
    "if (Get-Command copilot.cmd -ErrorAction SilentlyContinue) { copilot.cmd } elseif (Get-Command copilot -ErrorAction SilentlyContinue) { copilot } elseif (Get-Command gh -ErrorAction SilentlyContinue) { Write-Warning 'Standalone copilot CLI not found; falling back to non-interactive gh copilot suggest.'; gh copilot suggest --target shell } else { Write-Error 'Copilot CLI not found in PATH (expected copilot or gh).'; }"
}

#[cfg(not(target_os = "windows"))]
fn copilot_tab_launch_command() -> &'static str {
    "copilot"
}

#[cfg(target_os = "windows")]
fn claude_tab_launch_command() -> &'static str {
    // Prefer command-resolution through Get-Command so it works for npm-installed shims.
    "if (Get-Command claude -ErrorAction SilentlyContinue) { claude } elseif (Get-Command claude.cmd -ErrorAction SilentlyContinue) { claude.cmd } else { Write-Error 'Claude CLI not found in PATH (expected claude from @anthropic-ai/claude-code).'; }"
}

#[cfg(not(target_os = "windows"))]
fn claude_tab_launch_command() -> &'static str {
    "claude"
}

impl ffi::TerminalApp {
    fn normalize_autonomy_mode(value: &str) -> &'static str {
        if value.trim().eq_ignore_ascii_case("autonomous") {
            "autonomous"
        } else {
            "guided"
        }
    }

    fn apply_approval_mode_to_context(context: &str, autonomy_mode: &str) -> String {
        let selected_mode = Self::normalize_autonomy_mode(autonomy_mode).to_string();

        let mut root = serde_json::from_str::<Value>(context)
            .ok()
            .and_then(|value| value.as_object().cloned())
            .unwrap_or_default();

        let mut source = root
            .remove("source")
            .and_then(|value| value.as_object().cloned())
            .unwrap_or_default();
        source.insert("mode".to_string(), Value::String(selected_mode.clone()));
        root.insert("source".to_string(), Value::Object(source));

        let mut approval = root
            .remove("approval")
            .and_then(|value| value.as_object().cloned())
            .unwrap_or_default();
        approval.insert(
            "selected_autonomy_mode".to_string(),
            Value::String(selected_mode),
        );
        root.insert("approval".to_string(), Value::Object(approval));

        serde_json::to_string(&Value::Object(root)).unwrap_or_else(|_| {
            format!(
                "{{\"source\":{{\"mode\":\"{}\"}},\"approval\":{{\"selected_autonomy_mode\":\"{}\"}}}}",
                Self::normalize_autonomy_mode(autonomy_mode),
                Self::normalize_autonomy_mode(autonomy_mode)
            )
        })
    }

    fn sanitize_output_for_clipboard(text: &str) -> String {
        let chars: Vec<char> = text.chars().collect();
        let mut cleaned = String::with_capacity(chars.len());
        let mut i = 0usize;

        while i < chars.len() {
            let ch = chars[i];

            if ch == '\u{1b}' {
                i += 1;
                if i >= chars.len() {
                    break;
                }

                match chars[i] {
                    '[' => {
                        i += 1;
                        while i < chars.len() {
                            let c = chars[i];
                            if ('@'..='~').contains(&c) {
                                i += 1;
                                break;
                            }
                            i += 1;
                        }
                    }
                    ']' => {
                        i += 1;
                        while i < chars.len() {
                            if chars[i] == '\u{7}' {
                                i += 1;
                                break;
                            }

                            if chars[i] == '\u{1b}'
                                && i + 1 < chars.len()
                                && chars[i + 1] == '\\'
                            {
                                i += 2;
                                break;
                            }

                            i += 1;
                        }
                    }
                    'P' | 'X' | '^' | '_' => {
                        i += 1;
                        while i < chars.len() {
                            if chars[i] == '\u{1b}'
                                && i + 1 < chars.len()
                                && chars[i + 1] == '\\'
                            {
                                i += 2;
                                break;
                            }
                            i += 1;
                        }
                    }
                    _ => {
                        i += 1;
                    }
                }

                continue;
            }

            if ch == '\r' {
                if i + 1 < chars.len() && chars[i + 1] == '\n' {
                    cleaned.push('\n');
                    i += 2;
                } else {
                    cleaned.push('\n');
                    i += 1;
                }
                continue;
            }

            if ch.is_control() && ch != '\n' && ch != '\t' {
                i += 1;
                continue;
            }

            cleaned.push(ch);
            i += 1;
        }

        cleaned
    }

    pub fn approval_provider_prefill_policy(
        self_ref: &Self,
        provider_policy_applies: bool,
        preferred_provider: QString,
    ) -> QString {
        let policy = resolve_approval_provider_prefill_policy(
            provider_policy_applies,
            &preferred_provider.to_string(),
            *self_ref.approval_provider_chooser_enabled(),
        );

        let json = serde_json::to_string(&policy).unwrap_or_else(|_| {
            "{\"prefilled_provider\":\"\",\"provider_prefill_source\":\"none\",\"provider_selection_required\":true,\"provider_chooser_visible\":true}".to_string()
        });

        QString::from(json)
    }

    /// Compute and set the approval risk tier from the given autonomy mode and
    /// the current bridge budget properties.
    ///
    /// Updates `approvalRiskTier` and `approvalTrustedScopeText` on the bridge
    /// and returns the tier (1 = Low, 2 = Medium, 3 = High).
    pub fn compute_approval_risk_tier(
        mut self: Pin<&mut Self>,
        autonomy_mode: QString,
    ) -> u32 {
        use crate::launch_builder::{
            approval_trusted_scope_text_for_tier, evaluate_risk_tier, AutonomyBudget,
        };

        let mode_str = autonomy_mode.to_string();

        let max_cmds = *self.as_ref().approval_budget_max_commands();
        let max_dur = *self.as_ref().approval_budget_max_duration_secs();
        let max_files = *self.as_ref().approval_budget_max_files();

        let budget = if max_cmds > 0 || max_dur > 0 || max_files > 0 {
            Some(AutonomyBudget {
                max_commands: if max_cmds > 0 { Some(max_cmds) } else { None },
                max_duration_secs: if max_dur > 0 { Some(max_dur as u64) } else { None },
                max_files: if max_files > 0 { Some(max_files) } else { None },
            })
        } else {
            None
        };

        let tier = evaluate_risk_tier(&mode_str, budget.as_ref()) as u32;
        let scope_text = approval_trusted_scope_text_for_tier(tier as u8);

        self.as_mut().set_approval_risk_tier(tier);
        self.as_mut()
            .set_approval_trusted_scope_text(QString::from(&scope_text));

        tier
    }

    fn copy_text_to_clipboard(text: &str) -> Result<(), String> {
        if text.trim().is_empty() {
            return Err("Nothing to copy".to_string());
        }

        #[cfg(target_os = "windows")]
        {
            let mut child = Command::new("cmd")
                .args(["/C", "clip"])
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|error| format!("Failed to launch clip: {error}"))?;

            if let Some(mut stdin) = child.stdin.take() {
                stdin
                    .write_all(text.as_bytes())
                    .map_err(|error| format!("Failed writing to clipboard stdin: {error}"))?;
            }

            let output = child
                .wait_with_output()
                .map_err(|error| format!("Failed waiting for clip: {error}"))?;

            if output.status.success() {
                return Ok(());
            }

            return Err(format!(
                "clip failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        #[cfg(target_os = "macos")]
        {
            let mut child = Command::new("pbcopy")
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|error| format!("Failed to launch pbcopy: {error}"))?;

            if let Some(mut stdin) = child.stdin.take() {
                stdin
                    .write_all(text.as_bytes())
                    .map_err(|error| format!("Failed writing to pbcopy stdin: {error}"))?;
            }

            let output = child
                .wait_with_output()
                .map_err(|error| format!("Failed waiting for pbcopy: {error}"))?;

            if output.status.success() {
                return Ok(());
            }

            return Err(format!(
                "pbcopy failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        #[cfg(all(unix, not(target_os = "macos")))]
        {
            let mut child = Command::new("sh")
                .args(["-c", "xclip -selection clipboard || xsel --clipboard --input"])
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|error| format!("Failed to launch xclip/xsel: {error}"))?;

            if let Some(mut stdin) = child.stdin.take() {
                stdin
                    .write_all(text.as_bytes())
                    .map_err(|error| format!("Failed writing clipboard stdin: {error}"))?;
            }

            let output = child
                .wait_with_output()
                .map_err(|error| format!("Failed waiting for xclip/xsel: {error}"))?;

            if output.status.success() {
                return Ok(());
            }

            return Err(format!(
                "xclip/xsel failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        #[allow(unreachable_code)]
        Err("Clipboard copy is not supported on this platform".to_string())
    }

    fn last_command_output_text(self_ref: &Self) -> String {
        let request_id = self_ref.current_request_id().to_string();
        if request_id.trim().is_empty() {
            return String::new();
        }

        let state_arc = self_ref.rust().state.clone();
        let state = state_arc.lock().unwrap();
        state
            .output_tracker
            .core
            .completed
            .get(&request_id)
            .map(|entry| {
                let mut text = String::new();
                if !entry.stdout.trim().is_empty() {
                    text.push_str(&entry.stdout);
                }
                if !entry.stderr.trim().is_empty() {
                    if !text.is_empty() {
                        text.push('\n');
                    }
                    text.push_str("[stderr]\n");
                    text.push_str(&entry.stderr);
                }
                text
            })
            .unwrap_or_default()
    }

    fn sanitize_filename_component(value: &str) -> String {
        let sanitized: String = value
            .chars()
            .map(|ch| {
                if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                    ch
                } else {
                    '_'
                }
            })
            .collect();
        if sanitized.trim_matches('_').is_empty() {
            "default".to_string()
        } else {
            sanitized
        }
    }

    fn resolve_export_directory(
        this: &Pin<&mut Self>,
        override_dir: &str,
    ) -> Result<PathBuf, String> {
        if !override_dir.trim().is_empty() {
            return Ok(PathBuf::from(override_dir.trim()));
        }

        let state_arc = this.rust().state.clone();
        let workspace_path = {
            let state = state_arc.lock().unwrap();
            state.selected_session_context().workspace_path
        };

        if !workspace_path.trim().is_empty() {
            return Ok(PathBuf::from(workspace_path.trim()));
        }

        std::env::current_dir().map_err(|err| format!("failed to resolve current directory: {err}"))
    }

    fn export_env_snapshot() -> BTreeMap<String, String> {
        let mut env = BTreeMap::new();
        let common_keys = [
            "COMPUTERNAME",
            "USERNAME",
            "USERPROFILE",
            "HOME",
            "SHELL",
            "COMSPEC",
            "TERM",
            "PATH",
            "PWD",
        ];

        for key in common_keys {
            if let Ok(value) = std::env::var(key) {
                env.insert(key.to_string(), value);
            }
        }

        for (key, value) in std::env::vars() {
            if key.starts_with("PM_") {
                env.insert(key, value);
            }
        }

        env
    }

    fn append_output_line(this: &mut Pin<&mut Self>, line: &str) {
        // Keep output scoped to the selected session so tabs do not mix output.
        let state_arc = this.rust().state.clone();
        let next = {
            let mut state = state_arc.lock().unwrap();
            let selected = state.selected_session_id.clone();
            state
                .append_output_line_for_session(&selected, line)
                .unwrap_or_default()
        };
        this.as_mut().set_output_text(QString::from(&next));
    }

    fn append_startup_banner(this: &mut Pin<&mut Self>, session_id: &str) {
        let state_arc = this.rust().state.clone();
        let context = {
            let state = state_arc.lock().unwrap();
            state.selected_session_context()
        };

        let profile = terminal_profile_to_key(&context.selected_terminal_profile);
        let workspace = if context.workspace_path.trim().is_empty() {
            "(workspace path not set)".to_string()
        } else {
            context.workspace_path
        };

        Self::append_output_line(
            this,
            &format!("[session:{session_id}] ready | profile={profile} | workspace={workspace}"),
        );
        Self::append_output_line(this, "Type a command in the shell panel and press Enter to run it.");
    }

    fn refresh_saved_commands_for_workspace(
        this: &mut Pin<&mut Self>,
        workspace_id: &str,
    ) -> Result<String, String> {
        let state_arc = this.rust().state.clone();
        let mut state = state_arc.lock().unwrap();
        state.saved_commands_ui_workspace_id = workspace_id.to_string();
        let commands = state.list_saved_commands(workspace_id)?;
        serde_json::to_string(&commands)
            .map_err(|err| format!("failed to serialize saved commands: {err}"))
    }

    fn sync_selected_session_context(this: &mut Pin<&mut Self>) {
        let state_arc = this.rust().state.clone();
        let (selected_session_id, context, default_profile, suggestions_json) = {
            let state = state_arc.lock().unwrap();
            let mut suggestions: Vec<String> = state
                .session_context_by_id
                .values()
                .flat_map(|ctx| [ctx.workspace_path.clone(), ctx.selected_venv_path.clone()])
                .filter(|value| !value.trim().is_empty())
                .collect();

            // Include workspace paths pushed from the Project Memory DB so the
            // pickers show all registered workspaces, not just active-session ones.
            for path in &state.known_workspace_paths {
                if !path.trim().is_empty() {
                    suggestions.push(path.clone());
                }
            }

            let default_workspace = crate::cxxqt_bridge::default_workspace_path();
            if !default_workspace.trim().is_empty() {
                suggestions.push(default_workspace);
            }

            if suggestions.is_empty() {
                suggestions.push(crate::cxxqt_bridge::default_workspace_path());
            }

            suggestions.sort();
            suggestions.dedup();
            let suggestions_json = serde_json::to_string(&suggestions).unwrap_or_else(|_| "[]".to_string());

            (
                state.selected_session_id.clone(),
                state.selected_session_context(),
                state.default_terminal_profile.clone(),
                suggestions_json,
            )
        };

        this.as_mut()
            .set_current_session_id(QString::from(&selected_session_id));
        this.as_mut()
            .set_current_terminal_profile(QString::from(terminal_profile_to_key(
                &context.selected_terminal_profile,
            )));
        this.as_mut()
            .set_current_default_terminal_profile(QString::from(terminal_profile_to_key(
                &default_profile,
            )));
        this.as_mut()
            .set_current_workspace_path(QString::from(&context.workspace_path));
        this.as_mut()
            .set_current_venv_path(QString::from(&context.selected_venv_path));
        this.as_mut()
            .set_current_activate_venv(context.activate_venv);
        this.as_mut()
            .set_available_workspaces_json(QString::from(&suggestions_json));
    }

    pub fn approve_command(mut self: Pin<&mut Self>, id: QString, autonomy_mode: QString) {
        let id_str = id.to_string();
        let autonomy_mode_str = autonomy_mode.to_string();

        let state_arc = self.rust().state.clone();

        // ── Step 11: Agent-launch detection ────────────────────────────────
        // Check whether the approved request is a super-subagent launch before
        // applying the normal approval routing. If so, we intercept the request,
        // create a dedicated tagged tab, dispatch the launch command via the
        // pty abstraction, and immediately send an approved response back to the
        // MCP TCP client instead of waiting for the interactive process to exit.
        let is_agent_launch = {
            let state = state_arc.lock().unwrap();
            let selected = state.selected_session_id.clone();
            state
                .pending_commands_by_session
                .get(&selected)
                .and_then(|q| q.iter().find(|c| c.id == id_str))
                .map(|c| {
                    let provider =
                        crate::launch_builder::normalize_provider_token(&c.command);
                    let is_provider =
                        matches!(provider.as_str(), "gemini" | "copilot");
                    let ctx_lower = c.context.to_ascii_lowercase();
                    let is_agent_ctx = ctx_lower.contains("agent_cli_launch")
                        || ctx_lower.contains("super_subagent")
                        || ctx_lower.contains("launch_kind")
                        || ctx_lower.contains("launch_type")
                        || ctx_lower.contains("\"intent\":\"agent")
                        || ctx_lower.contains("\"intent\": \"agent");
                    is_provider && is_agent_ctx
                })
                .unwrap_or(false)
        };

        if is_agent_launch {
            self.approve_agent_launch_in_tab(id_str, autonomy_mode_str);
            return;
        }

        let (next_cmd, count, json, tabs_json, selected_session_id, approved_cmd_for_echo, ws_tx) = {
            let mut state = state_arc.lock().unwrap();
            let selected_session = state.selected_session_id.clone();
            let queue = state
                .pending_commands_by_session
                .entry(selected_session)
                .or_default();

            let mut cmd = queue.iter().find(|c| c.id == id_str).cloned();
            queue.retain(|c| c.id != id_str);

            if let Some(cmd_mut) = cmd.as_mut() {
                cmd_mut.context = Self::apply_approval_mode_to_context(
                    &cmd_mut.context,
                    &autonomy_mode_str,
                );
            }

            if let (Some(tx), Some(cmd)) = (&state.command_tx, cmd.as_ref()) {
                let _ = tx.try_send(cmd.clone());
            }

            let next = state.selected_first_command();
            let count = state.selected_pending_count();
            let json = state.pending_commands_to_json();
            let tabs_json = state.session_tabs_to_json();
            let selected_session_id = state.selected_session_id.clone();
            let ws_tx = state.ws_terminal_tx.clone();
            (next, count, json, tabs_json, selected_session_id, cmd, ws_tx)
        };

        self.as_mut().set_pending_count(count);
        self.as_mut().set_pending_commands_json(json);
        self.as_mut().set_session_tabs_json(tabs_json);
        self.as_mut()
            .set_current_session_id(QString::from(&selected_session_id));
        self.as_mut()
            .set_status_text(QString::from("Executing command..."));
        self.as_mut().set_output_text(QString::default());

        if let (Some(cmd), Some(tx)) = (approved_cmd_for_echo.as_ref(), ws_tx.as_ref()) {
            let _ = tx.send(format!("{}\r\n", cmd.command).into_bytes());
        }

        Self::show_command(&mut self, next_cmd.as_ref());
    }

    /// Route an approved super-subagent launch into a dedicated tagged terminal
    /// tab (step 11).
    ///
    /// Creates a new session, sets its display label, dispatches the launch
    /// command through the pty abstraction, and immediately sends an
    /// `Approved` [`CommandResponse`] back to the waiting MCP TCP client.
    fn approve_agent_launch_in_tab(
        mut self: Pin<&mut Self>,
        id_str: String,
        autonomy_mode_str: String,
    ) {
        use crate::cxxqt_bridge::AgentSessionMeta;
        use crate::launch_builder::{build_launch_command, LaunchOptions};
        use crate::protocol::{
            context_pack_from_context_json, CommandRequest, CommandResponse, Message, ResponseStatus,
        };

        // ── Read approval-time bridge properties (Steps 27–31) ──────────────
        // These must be read *before* the state lock so we don't hold
        // two borrows simultaneously.
        let bridge_session_mode = self.as_ref().approval_session_mode().to_string();
        let bridge_resume_session_id = self.as_ref().approval_resume_session_id().to_string();
        let bridge_output_format = self.as_ref().approval_output_format().to_string();
        // Steps 29–31: risk/budget/trusted-scope
        let bridge_trusted_scope_confirmed = *self.as_ref().approval_trusted_scope_confirmed();
        let bridge_budget_max_commands = *self.as_ref().approval_budget_max_commands();
        let bridge_budget_max_duration_secs = *self.as_ref().approval_budget_max_duration_secs();
        let bridge_budget_max_files = *self.as_ref().approval_budget_max_files();
        // Phase 3: CLI load-reduction flags
        let bridge_gemini_screen_reader = *self.as_ref().approval_gemini_screen_reader();

        let state_arc = self.rust().state.clone();

        let (_approved_cmd, session_id, tabs_json, status_text, signal_args) = {
            let mut state = state_arc.lock().unwrap();
            let selected_session = state.selected_session_id.clone();
            let queue = state
                .pending_commands_by_session
                .entry(selected_session)
                .or_default();

            let cmd = queue.iter().find(|c| c.id == id_str).cloned();
            queue.retain(|c| c.id != id_str);

            let Some(mut cmd) = cmd else {
                let tabs_json = state.session_tabs_to_json();
                return drop((state, tabs_json)); // target not found; no-op
            };

            // Inject autonomy mode into context before routing
            cmd.context =
                Self::apply_approval_mode_to_context(&cmd.context, &autonomy_mode_str);

            // Extract context pack and provider info
            let context_pack = context_pack_from_context_json(&cmd.context);
            let requesting_agent = context_pack
                .as_ref()
                .and_then(|p| p.requesting_agent.as_deref());
            let plan_id = context_pack
                .as_ref()
                .and_then(|p| p.plan_id.as_deref());
            let plan_short_id: Option<String> = plan_id.map(|id| {
                let end = id.len().min(8);
                id[..end].to_string()
            });
            let provider = {
                use crate::launch_builder::normalize_provider_token;
                normalize_provider_token(&cmd.command)
            };

            // ── Build LaunchOptions from context JSON + bridge properties ─────────
            // Context JSON source.output_format and source.session_mode take
            // precedence over bridge defaults.  Bridge properties reflect the
            // user's approval-time selection (may have been pre-filled from the
            // context JSON by the QML syncApprovalDialog function).
            let ctx_val: serde_json::Value =
                serde_json::from_str(&cmd.context).unwrap_or_default();
            let ctx_source = ctx_val.get("source").and_then(|v| v.as_object());

            let ctx_output_format = ctx_source
                .and_then(|s| s.get("output_format"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            // Bridge value takes precedence if the user explicitly changed it
            // (i.e., it differs from the default "text").  Otherwise use
            // the context JSON value.
            let effective_output_format = if !bridge_output_format.is_empty()
                && bridge_output_format != "text"
            {
                bridge_output_format.clone()
            } else if !ctx_output_format.is_empty() && ctx_output_format != "text" {
                ctx_output_format
            } else {
                "text".to_string()
            };

            let effective_session_mode = if bridge_session_mode.trim() == "resume" {
                "resume".to_string()
            } else {
                "new".to_string()
            };

            let effective_resume_session_id = if effective_session_mode == "resume"
                && !bridge_resume_session_id.trim().is_empty()
            {
                Some(bridge_resume_session_id.clone())
            } else {
                None
            };

            let launch_opts = LaunchOptions {
                session_mode: effective_session_mode,
                resume_session_id: effective_resume_session_id,
                output_format: effective_output_format,
                trusted_scope_confirmed: bridge_trusted_scope_confirmed,
                // Pass --screen-reader only when explicitly enabled for Gemini.
                // Copilot has no equivalent launch flag as of CLI v1.x.
                screen_reader: provider == "gemini" && bridge_gemini_screen_reader,
                // Route to CLI MCP server (port 3466) instead of the main VS Code
                // MCP server (port 3457). No bridge property yet — defaults to false.
                use_cli_mcp: false,
                autonomy_budget: {
                    let cmds = if bridge_budget_max_commands > 0 {
                        Some(bridge_budget_max_commands)
                    } else {
                        None
                    };
                    let dur = if bridge_budget_max_duration_secs > 0 {
                        Some(bridge_budget_max_duration_secs as u64)
                    } else {
                        None
                    };
                    let files = if bridge_budget_max_files > 0 {
                        Some(bridge_budget_max_files)
                    } else {
                        None
                    };
                    if cmds.is_none() && dur.is_none() && files.is_none() {
                        None
                    } else {
                        Some(crate::launch_builder::AutonomyBudget {
                            max_commands: cmds,
                            max_duration_secs: dur,
                            max_files: files,
                        })
                    }
                },
            };

            // Build the CLI launch command
            let launch_result = build_launch_command(
                &provider,
                context_pack.as_ref(),
                &autonomy_mode_str,
                requesting_agent,
                plan_short_id.as_deref(),
                &launch_opts,
            );

            match launch_result {
                Err(err) => {
                    // Send decline so the MCP call unblocks with an error
                    let resp = Message::CommandResponse(CommandResponse {
                        id: cmd.id.clone(),
                        status: ResponseStatus::Declined,
                        output: None,
                        exit_code: None,
                        reason: Some(format!("Agent launch build failed: {err}")),
                        output_file_path: None,
                    });
                    state.send_response(resp);
                    let tabs_json = state.session_tabs_to_json();
                    return drop((state, tabs_json));
                }

                Ok(launch_cmd) => {
                    // Create a new dedicated session for this agent
                    let session_id = state.create_session();
                    // Label it with the descriptive tag (provider + agent + plan)
                    state
                        .session_display_names
                        .insert(session_id.clone(), launch_cmd.session_label.clone());
                    // Track as agent session
                    state.agent_session_ids.insert(session_id.clone());
                    state.register_provider_session(&session_id, &launch_cmd.provider);
                    // Update selected_session_id so exec_task routes through
                    // execute_command_via_ws_terminal (PTY path) rather than the
                    // PersistentShellManager fallback.  Without this update the
                    // routing condition `req.session_id == selected_session_id`
                    // is false and the command goes via the wrong path.
                    state.selected_session_id = session_id.clone();
                    state.agent_session_meta.insert(
                        session_id.clone(),
                        AgentSessionMeta {
                            provider: launch_cmd.provider.clone(),
                            requesting_agent: requesting_agent
                                .map(|s| s.to_string()),
                            plan_session_id: plan_id.map(|s| s.to_string()),
                            launched_at_ms: monotonic_millis() as u64,
                        },
                    );

                    // Build a CommandRequest that routes via the pty abstraction.
                    // Use cmd.id as the launch_request.id so the output tracker
                    // keys the entry under the same ID that the MCP server tracks
                    // in guiSessions (via CommandResponse.id = cmd.id).  This
                    // ensures read_output calls from the server can find the entry.
                    //
                    // Env precedence (highest last):
                    // 1) provider launch-builder defaults (`launch_cmd.env`)
                    // 2) server-supplied request env (`cmd.env`) including
                    //    spawn_cli_session auto MCP env and explicit user overrides.
                    let mut merged_launch_env = launch_cmd.env.clone();
                    for (key, value) in cmd.env.iter() {
                        merged_launch_env.insert(key.clone(), value.clone());
                    }

                    let launch_request = CommandRequest {
                        id: cmd.id.clone(),
                        command: launch_cmd.program.clone(),
                        working_directory: cmd.working_directory.clone(),
                        context: format!(
                            "[agent_launch] provider={} session={}",
                            launch_cmd.provider, session_id
                        ),
                        session_id: session_id.clone(),
                        terminal_profile: cmd.terminal_profile.clone(),
                        workspace_path: cmd.workspace_path.clone(),
                        venv_path: cmd.venv_path.clone(),
                        activate_venv: cmd.activate_venv,
                        timeout_seconds: 0, // interactive — no timeout
                        args: launch_cmd.args.clone(),
                        env: merged_launch_env,
                        workspace_id: cmd.workspace_id.clone(),
                        allowlisted: true,
                    };

                    // Dispatch through the pty abstraction (same path as run_command)
                    if let Some(tx) = &state.command_tx {
                        let _ = tx.try_send(launch_request);
                    }

                    // ── Audit: launch approved and process started ────────────────────────
                    crate::audit_log::emit_launch_approved(
                        &cmd.workspace_path,
                        &cmd.context,
                        &launch_cmd.provider,
                        &autonomy_mode_str,
                        &session_id,
                    );
                    crate::audit_log::emit_launch_started(
                        &cmd.workspace_path,
                        &launch_cmd.provider,
                        &session_id,
                        requesting_agent,
                        plan_id,
                    );

                    // Immediately acknowledge to the MCP TCP client so the
                    // waiting agent call unblocks
                    let out_msg = format!(
                        "Agent session launched in tab: '{}'",
                        launch_cmd.session_label
                    );
                    let resp = Message::CommandResponse(CommandResponse {
                        id: cmd.id.clone(),
                        status: ResponseStatus::Approved,
                        output: Some(out_msg.clone()),
                        exit_code: Some(0),
                        reason: None,
                        output_file_path: None,
                    });
                    state.send_response(resp);

                    let tabs_json = state.session_tabs_to_json();
                    let signal_args = (
                        session_id.clone(),
                        launch_cmd.session_label.clone(),
                        launch_cmd.provider.clone(),
                    );
                    let status_text = format!(
                        "Agent session started: {} ({})",
                        launch_cmd.session_label, launch_cmd.provider
                    );
                    (cmd, session_id, tabs_json, status_text, Some(signal_args))
                }
            }
        };

        // Update Qt properties on the UI thread
        self.as_mut().set_session_tabs_json(tabs_json);
        self.as_mut()
            .set_current_session_id(QString::from(&session_id));
        self.as_mut().set_status_text(QString::from(&status_text));

        // Emit agentSessionLaunched signal
        if let Some((sid, label, provider)) = signal_args {
            self.as_mut().agent_session_launched(
                QString::from(&sid),
                QString::from(&label),
                QString::from(&provider),
            );
        }
    }

    pub fn decline_command(mut self: Pin<&mut Self>, id: QString, reason: QString) {
        let id_str = id.to_string();
        let reason_str = reason.to_string();
        let normalized_reason = if reason_str.trim().is_empty() {
            None
        } else {
            Some(reason_str.clone())
        };

        let response = Message::CommandResponse(CommandResponse {
            id: id_str.clone(),
            status: ResponseStatus::Declined,
            output: None,
            exit_code: None,
            reason: normalized_reason.clone(),
            output_file_path: None,
        });

        let state_arc = self.rust().state.clone();

        // ── Audit: peek at command data before removal ────────────────────
        let declined_cmd_info = {
            let state = state_arc.lock().unwrap();
            let selected_session = state.selected_session_id.clone();
            state
                .pending_commands_by_session
                .get(&selected_session)
                .and_then(|q| q.iter().find(|c| c.id == id_str))
                .map(|c| (c.command.clone(), c.context.clone(), c.workspace_path.clone()))
        };

        let (next_cmd, count, json, tabs_json, selected_session_id) = {
            let mut state = state_arc.lock().unwrap();
            state.send_response(response);
            let selected_session = state.selected_session_id.clone();
            let queue = state
                .pending_commands_by_session
                .entry(selected_session)
                .or_default();
            queue.retain(|c| c.id != id_str);
            let next = state.selected_first_command();
            let count = state.selected_pending_count();
            let json = state.pending_commands_to_json();
            let tabs_json = state.session_tabs_to_json();
            let selected_session_id = state.selected_session_id.clone();
            (next, count, json, tabs_json, selected_session_id)
        };

        // ── Audit: emit launch_denied or launch_cancelled ─────────────────
        if let Some((command, context, workspace_path)) = declined_cmd_info {
            let provider = crate::launch_builder::normalize_provider_token(&command);
            if !provider.is_empty() {
                let ctx_lower = context.to_ascii_lowercase();
                let is_agent_ctx = ctx_lower.contains("agent_cli_launch")
                    || ctx_lower.contains("super_subagent")
                    || ctx_lower.contains("launch_kind")
                    || ctx_lower.contains("launch_type")
                    || ctx_lower.contains("\"intent\":\"agent")
                    || ctx_lower.contains("\"intent\": \"agent");
                if is_agent_ctx {
                    let reason_lower = reason_str.trim().to_ascii_lowercase();
                    if reason_lower.is_empty()
                        || reason_lower.contains("cancel")
                        || reason_lower.contains("dismiss")
                    {
                        crate::audit_log::emit_launch_cancelled(&workspace_path, &context, &provider);
                    } else {
                        crate::audit_log::emit_launch_denied(
                            &workspace_path,
                            &context,
                            &provider,
                            normalized_reason.as_deref(),
                        );
                    }
                }
            }
        }

        self.as_mut().set_pending_count(count);
        self.as_mut().set_pending_commands_json(json);
        self.as_mut().set_session_tabs_json(tabs_json);
        self.as_mut()
            .set_current_session_id(QString::from(&selected_session_id));
        self.as_mut()
            .set_status_text(QString::from("Command declined"));

        {
            let state_arc = self.rust().state.clone();
            let state = state_arc.lock().unwrap();
            if let Some(tx) = state.ws_terminal_tx.as_ref() {
                let _ = tx.send(b"(command declined)\r\n".to_vec());
            }
        }

        Self::show_command(&mut self, next_cmd.as_ref());
        self.as_mut().command_completed(id, false);
    }

    pub fn set_start_with_windows_enabled(mut self: Pin<&mut Self>, enabled: bool) -> bool {
        let port = *crate::SERVER_PORT.get().unwrap_or(&9100);
        if let Err(error) = crate::system_tray::set_start_with_windows(enabled, port) {
            self.as_mut().set_status_text(QString::from(&format!(
                "Failed to update startup setting: {error}"
            )));
            return false;
        }

        let mut settings = crate::system_tray::load_settings();
        settings.start_with_windows = enabled;
        if let Err(error) = crate::system_tray::save_settings(&settings) {
            self.as_mut().set_status_text(QString::from(&format!(
                "Startup setting changed but failed to persist config: {error}"
            )));
            self.as_mut().set_start_with_windows(enabled);
            return false;
        }

        self.as_mut().set_start_with_windows(enabled);
        self.as_mut().set_status_text(QString::from(if enabled {
            "Start with Windows enabled"
        } else {
            "Start with Windows disabled"
        }));
        true
    }

    pub fn set_gemini_api_key(mut self: Pin<&mut Self>, api_key: QString) -> bool {
        let api_key = api_key.to_string();
        match crate::system_tray::save_gemini_api_key(&api_key) {
            Ok(()) => {
                self.as_mut().set_gemini_key_present(true);
                self.as_mut().set_status_text(QString::from(
                    "Gemini API key saved to local settings",
                ));
                true
            }
            Err(error) => {
                self.as_mut()
                    .set_status_text(QString::from(&format!("Failed to save Gemini API key: {error}")));
                false
            }
        }
    }

    pub fn clear_gemini_api_key(mut self: Pin<&mut Self>) -> bool {
        match crate::system_tray::clear_gemini_api_key() {
            Ok(()) => {
                self.as_mut().set_gemini_key_present(false);
                self.as_mut().set_gemini_injection_requested(false);
                self.as_mut().set_status_text(QString::from(
                    "Gemini API key removed from local settings",
                ));
                true
            }
            Err(error) => {
                self.as_mut().set_status_text(QString::from(&format!(
                    "Failed to clear Gemini API key: {error}"
                )));
                false
            }
        }
    }

    pub fn set_preferred_cli_provider_invokable(
        mut self: Pin<&mut Self>,
        provider: QString,
    ) -> bool {
        let provider_text = provider.to_string();
        let trimmed = provider_text.trim();

        let parsed = if trimmed.is_empty() {
            None
        } else {
            match crate::system_tray::parse_preferred_cli_provider(trimmed) {
                Some(value) => Some(value),
                None => {
                    self.as_mut().set_status_text(QString::from(
                        "Invalid provider. Use 'gemini', 'copilot', or empty to clear.",
                    ));
                    return false;
                }
            }
        };

        let mut settings = crate::system_tray::load_settings();
        settings.preferred_cli_provider = parsed;
        if let Err(error) = crate::system_tray::save_settings(&settings) {
            self.as_mut().set_status_text(QString::from(&format!(
                "Failed to save preferred CLI provider: {error}"
            )));
            return false;
        }

        let provider_value = settings
            .preferred_cli_provider
            .as_ref()
            .map(|value| value.as_str())
            .unwrap_or("");
        self.as_mut()
            .set_preferred_cli_provider(QString::from(provider_value));
        self.as_mut().set_status_text(QString::from(if provider_value.is_empty() {
            "Preferred CLI provider cleared"
        } else {
            "Preferred CLI provider saved"
        }));
        true
    }

    pub fn set_approval_provider_chooser_enabled_invokable(
        mut self: Pin<&mut Self>,
        enabled: bool,
    ) -> bool {
        let mut settings = crate::system_tray::load_settings();
        settings.approval_provider_chooser_enabled = enabled;
        if let Err(error) = crate::system_tray::save_settings(&settings) {
            self.as_mut().set_status_text(QString::from(&format!(
                "Failed to save provider chooser setting: {error}"
            )));
            return false;
        }

        self.as_mut().set_approval_provider_chooser_enabled(enabled);
        self.as_mut().set_status_text(QString::from(if enabled {
            "Provider chooser override enabled"
        } else {
            "Provider chooser override disabled"
        }));
        true
    }

    pub fn set_autonomy_mode_selector_visible_invokable(
        mut self: Pin<&mut Self>,
        visible: bool,
    ) -> bool {
        let mut settings = crate::system_tray::load_settings();
        settings.autonomy_mode_selector_visible = visible;
        if let Err(error) = crate::system_tray::save_settings(&settings) {
            self.as_mut().set_status_text(QString::from(&format!(
                "Failed to save autonomy selector setting: {error}"
            )));
            return false;
        }

        self.as_mut().set_autonomy_mode_selector_visible(visible);
        self.as_mut().set_status_text(QString::from(if visible {
            "Autonomy mode selector enabled"
        } else {
            "Autonomy mode selector hidden"
        }));
        true
    }

    pub fn launch_gemini_session(mut self: Pin<&mut Self>) -> bool {
        if !*self.as_ref().gemini_key_present() {
            self.as_mut().set_status_text(QString::from(
                "No stored Gemini API key. Save a key in settings first.",
            ));
            return false;
        }

        let Some(stored_key) = crate::system_tray::load_gemini_api_key() else {
            self.as_mut().set_status_text(QString::from(
                "Stored Gemini API key not found. Save the key again and retry.",
            ));
            return false;
        };

        let workspace_path = {
            let state_arc = self.rust().state.clone();
            let state = state_arc.lock().unwrap();
            let selected = state.selected_session_context().workspace_path;
            if selected.trim().is_empty() {
                crate::cxxqt_bridge::default_workspace_path()
            } else {
                selected
            }
        };

        #[cfg(windows)]
        {
            let mut launch = Command::new("pwsh");
            launch
                .arg("-NoExit")
                .arg("-Command")
                .arg("if (-not [string]::IsNullOrWhiteSpace($env:PM_GEMINI_CWD)) { Set-Location -LiteralPath $env:PM_GEMINI_CWD }; gemini --screen-reader")
                .env("PM_GEMINI_CWD", &workspace_path)
                .env("GEMINI_API_KEY", &stored_key)
                .env("GOOGLE_API_KEY", &stored_key)
                .env("NPM_CONFIG_UPDATE_NOTIFIER", "false");

            match launch.spawn() {
                Ok(_) => {
                    self.as_mut().set_status_text(QString::from(
                        "Launched Gemini in a dedicated PowerShell window",
                    ));
                    Self::append_output_line(
                        &mut self,
                        "[gemini] launched in dedicated PowerShell window with stored key",
                    );
                    return true;
                }
                Err(error) => {
                    self.as_mut().set_status_text(QString::from(&format!(
                        "Failed to launch Gemini session: {error}"
                    )));
                    return false;
                }
            }
        }

        // Non-Windows fallback: inject key and run gemini inline
        #[allow(unreachable_code)]
        {
            self.as_mut().set_gemini_injection_requested(true);
            self.as_mut()
                .run_command(QString::from("gemini --screen-reader"))
        }
    }

    pub fn launch_gemini_in_tab(mut self: Pin<&mut Self>) -> bool {
        // Always open Gemini in a brand-new dedicated session.
        // Works with a stored API key (injected as GEMINI_API_KEY env var) or
        // on the free tier without a key — gemini CLI will use browser OAuth.
        let state_arc = self.rust().state.clone();
        let (session_id, count, json, tabs_json) = {
            let mut state = state_arc.lock().unwrap();
            let session_id = state.create_session();
            state.register_provider_session(&session_id, "gemini");
            let count = state.selected_pending_count();
            let json = state.pending_commands_to_json();
            let tabs_json = state.session_tabs_to_json();
            (session_id, count, json, tabs_json)
        };
        self.as_mut()
            .set_current_session_id(QString::from(&session_id));
        self.as_mut().set_pending_count(count);
        self.as_mut().set_pending_commands_json(json);
        self.as_mut().set_session_tabs_json(tabs_json);
        Self::append_startup_banner(&mut self, &session_id);
        Self::append_output_line(
            &mut self,
            "[gemini] launching Gemini CLI in the selected tab",
        );

        let previous_run_in_window = *self.as_ref().run_commands_in_window();
        self.as_mut().set_run_commands_in_window(false);
        self.as_mut().set_gemini_injection_requested(true);

        let launched = Self::run_command_impl(
            self.as_mut(),
            QString::from(gemini_tab_launch_command()),
            86400,
        );
        self.as_mut().set_run_commands_in_window(previous_run_in_window);

        launched
    }

    pub fn launch_copilot_in_tab(mut self: Pin<&mut Self>) -> bool {
        // Open Copilot CLI (GitHub Copilot in the CLI) in a brand-new dedicated session.
        // Prefers standalone `copilot` CLI; falls back to `gh copilot` when available.
        // No API key injection required — authentication is handled by the CLI.
        let state_arc = self.rust().state.clone();
        let (session_id, count, json, tabs_json) = {
            let mut state = state_arc.lock().unwrap();
            let session_id = state.create_session();
            state.register_provider_session(&session_id, "copilot");
            let count = state.selected_pending_count();
            let json = state.pending_commands_to_json();
            let tabs_json = state.session_tabs_to_json();
            (session_id, count, json, tabs_json)
        };
        self.as_mut()
            .set_current_session_id(QString::from(&session_id));
        self.as_mut().set_pending_count(count);
        self.as_mut().set_pending_commands_json(json);
        self.as_mut().set_session_tabs_json(tabs_json);
        Self::append_startup_banner(&mut self, &session_id);
        Self::append_output_line(
            &mut self,
            "[copilot] launching Copilot CLI in the selected tab",
        );

        let previous_run_in_window = *self.as_ref().run_commands_in_window();
        self.as_mut().set_run_commands_in_window(false);

        let launched = Self::run_command_impl(
            self.as_mut(),
            QString::from(copilot_tab_launch_command()),
            86400,
        );
        self.as_mut().set_run_commands_in_window(previous_run_in_window);

        launched
    }

    pub fn launch_claude_in_tab(mut self: Pin<&mut Self>) -> bool {
        // Open Claude CLI (Anthropic) in a brand-new dedicated session.
        // Injects ANTHROPIC_API_KEY if a stored key is available.
        let state_arc = self.rust().state.clone();
        let (session_id, count, json, tabs_json) = {
            let mut state = state_arc.lock().unwrap();
            let session_id = state.create_session();
            state.register_provider_session(&session_id, "claude");
            let count = state.selected_pending_count();
            let json = state.pending_commands_to_json();
            let tabs_json = state.session_tabs_to_json();
            (session_id, count, json, tabs_json)
        };
        self.as_mut()
            .set_current_session_id(QString::from(&session_id));
        self.as_mut().set_pending_count(count);
        self.as_mut().set_pending_commands_json(json);
        self.as_mut().set_session_tabs_json(tabs_json);
        Self::append_startup_banner(&mut self, &session_id);
        Self::append_output_line(
            &mut self,
            "[claude] launching Claude CLI in the selected tab",
        );

        let previous_run_in_window = *self.as_ref().run_commands_in_window();
        self.as_mut().set_run_commands_in_window(false);

        // Inject ANTHROPIC_API_KEY if a stored key is available.
        if let Some(stored_key) = crate::system_tray::load_claude_api_key() {
            std::env::set_var("ANTHROPIC_API_KEY", &stored_key);
        }

        let launched = Self::run_command_impl(
            self.as_mut(),
            QString::from(claude_tab_launch_command()),
            86400,
        );
        self.as_mut().set_run_commands_in_window(previous_run_in_window);

        launched
    }

    pub fn set_claude_api_key(mut self: Pin<&mut Self>, api_key: QString) -> bool {
        let api_key = api_key.to_string();
        match crate::system_tray::save_claude_api_key(&api_key) {
            Ok(()) => {
                self.as_mut().set_claude_key_present(true);
                self.as_mut().set_status_text(QString::from(
                    "Claude API key saved to local settings",
                ));
                true
            }
            Err(error) => {
                self.as_mut()
                    .set_status_text(QString::from(&format!("Failed to save Claude API key: {error}")));
                false
            }
        }
    }

    pub fn clear_claude_api_key(mut self: Pin<&mut Self>) -> bool {
        match crate::system_tray::clear_claude_api_key() {
            Ok(()) => {
                self.as_mut().set_claude_key_present(false);
                self.as_mut().set_status_text(QString::from(
                    "Claude API key removed from local settings",
                ));
                true
            }
            Err(error) => {
                self.as_mut().set_status_text(QString::from(&format!(
                    "Failed to clear Claude API key: {error}"
                )));
                false
            }
        }
    }

    pub fn clear_output(mut self: Pin<&mut Self>) {
        let state_arc = self.rust().state.clone();
        {
            let mut state = state_arc.lock().unwrap();
            state.clear_selected_session_output();
        }
        self.as_mut().set_output_text(QString::default());
    }

    pub fn copy_current_output(mut self: Pin<&mut Self>) -> bool {
        let output = Self::sanitize_output_for_clipboard(&self.as_ref().output_text().to_string());
        match Self::copy_text_to_clipboard(&output) {
            Ok(()) => {
                self.as_mut()
                    .set_status_text(QString::from("Copied current terminal output"));
                true
            }
            Err(error) => {
                self.as_mut().set_status_text(QString::from(&error));
                false
            }
        }
    }

    pub fn copy_last_command_output(mut self: Pin<&mut Self>) -> bool {
        let output = Self::sanitize_output_for_clipboard(&Self::last_command_output_text(&self.as_ref()));
        match Self::copy_text_to_clipboard(&output) {
            Ok(()) => {
                self.as_mut()
                    .set_status_text(QString::from("Copied last command output"));
                true
            }
            Err(error) => {
                self.as_mut().set_status_text(QString::from(&error));
                false
            }
        }
    }

    pub fn create_session(mut self: Pin<&mut Self>) -> QString {
        let state_arc = self.rust().state.clone();
        let (session_id, count, json, tabs_json, selected_cmd) = {
            let mut state = state_arc.lock().unwrap();
            let session_id = state.create_session();
            let selected_cmd = state.selected_first_command();
            let count = state.selected_pending_count();
            let json = state.pending_commands_to_json();
            let tabs_json = state.session_tabs_to_json();
            (session_id, count, json, tabs_json, selected_cmd)
        };

        self.as_mut()
            .set_current_session_id(QString::from(&session_id));
        self.as_mut().set_pending_count(count);
        self.as_mut().set_pending_commands_json(json);
        self.as_mut().set_session_tabs_json(tabs_json);
        self.as_mut()
            .set_status_text(QString::from(&format!("Created session: {session_id}")));
        Self::append_startup_banner(&mut self, &session_id);
        Self::show_command(&mut self, selected_cmd.as_ref());
        QString::from(&session_id)
    }

    pub fn show_session_startup(mut self: Pin<&mut Self>) {
        let state_arc = self.rust().state.clone();
        let selected_session_id = {
            let state = state_arc.lock().unwrap();
            state.selected_session_id.clone()
        };
        Self::append_startup_banner(&mut self, &selected_session_id);
    }

    pub fn switch_session(mut self: Pin<&mut Self>, session_id: QString) -> bool {
        let requested = session_id.to_string();
        let state_arc = self.rust().state.clone();
        let result = {
            let mut state = state_arc.lock().unwrap();
            state.switch_session(&requested).map(|_| {
                let selected_cmd = state.selected_first_command();
                let count = state.selected_pending_count();
                let json = state.pending_commands_to_json();
                let tabs_json = state.session_tabs_to_json();
                let selected_session_id = state.selected_session_id.clone();
                (selected_cmd, count, json, tabs_json, selected_session_id)
            })
        };

        match result {
            Ok((selected_cmd, count, json, tabs_json, selected_session_id)) => {
                self.as_mut()
                    .set_current_session_id(QString::from(&selected_session_id));
                self.as_mut().set_pending_count(count);
                self.as_mut().set_pending_commands_json(json);
                self.as_mut().set_session_tabs_json(tabs_json);
                self.as_mut().set_status_text(QString::from(&format!(
                    "Active session: {selected_session_id}"
                )));
                Self::show_command(&mut self, selected_cmd.as_ref());
                true
            }
            Err(err) => {
                self.as_mut().set_status_text(QString::from(&err));
                false
            }
        }
    }

    pub fn close_session(mut self: Pin<&mut Self>, session_id: QString) -> bool {
        let requested = session_id.to_string();
        let state_arc = self.rust().state.clone();
        let result = {
            let mut state = state_arc.lock().unwrap();
            state.close_session(&requested).map(|_| {
                let selected_cmd = state.selected_first_command();
                let count = state.selected_pending_count();
                let json = state.pending_commands_to_json();
                let tabs_json = state.session_tabs_to_json();
                let selected_session_id = state.selected_session_id.clone();
                (selected_cmd, count, json, tabs_json, selected_session_id)
            })
        };

        match result {
            Ok((selected_cmd, count, json, tabs_json, selected_session_id)) => {
                self.as_mut()
                    .set_current_session_id(QString::from(&selected_session_id));
                self.as_mut().set_pending_count(count);
                self.as_mut().set_pending_commands_json(json);
                self.as_mut().set_session_tabs_json(tabs_json);
                self.as_mut().set_status_text(QString::from(&format!(
                    "Closed session: {}",
                    requested.trim()
                )));
                Self::show_command(&mut self, selected_cmd.as_ref());
                true
            }
            Err(err) => {
                self.as_mut().set_status_text(QString::from(&err));
                false
            }
        }
    }

    pub fn rename_session(
        mut self: Pin<&mut Self>,
        session_id: QString,
        display_name: QString,
    ) -> bool {
        let target_id = session_id.to_string();
        let display_name = display_name.to_string();

        let state_arc = self.rust().state.clone();
        let result = {
            let mut state = state_arc.lock().unwrap();
            state
                .rename_session(&target_id, &display_name)
                .map(|_| state.session_tabs_to_json())
        };

        match result {
            Ok(tabs_json) => {
                self.as_mut().set_session_tabs_json(tabs_json);
                self.as_mut().set_status_text(QString::from(&format!(
                    "Renamed session {} to {}",
                    target_id.trim(),
                    display_name.trim()
                )));
                true
            }
            Err(err) => {
                self.as_mut().set_status_text(QString::from(&err));
                false
            }
        }
    }

    fn show_command(this: &mut Pin<&mut Self>, cmd: Option<&CommandRequest>) {
        if let Some(c) = cmd {
            this.as_mut().set_command_text(QString::from(&*c.command));
            this.as_mut()
                .set_working_directory(QString::from(&*c.working_directory));
            this.as_mut().set_context_info(QString::from(&*c.context));
            this.as_mut().set_current_request_id(QString::from(&*c.id));
            this.as_mut()
                .set_current_session_id(QString::from(&*c.session_id));
            this.as_mut()
                .set_current_terminal_profile(QString::from(terminal_profile_to_key(
                    &c.terminal_profile,
                )));
            this.as_mut()
                .set_current_workspace_path(QString::from(&*c.workspace_path));
            this.as_mut()
                .set_current_venv_path(QString::from(&*c.venv_path));
            this.as_mut().set_current_activate_venv(c.activate_venv);
            this.as_mut().set_current_allowlisted(c.allowlisted);
        } else {
            this.as_mut().set_command_text(QString::default());
            this.as_mut().set_working_directory(QString::default());
            this.as_mut().set_context_info(QString::default());
            this.as_mut().set_current_request_id(QString::default());
            this.as_mut().set_current_allowlisted(false);
            Self::sync_selected_session_context(this);
        }

        let state_arc = this.rust().state.clone();
        let session_output = {
            let state = state_arc.lock().unwrap();
            state.selected_session_output()
        };
        this.as_mut().set_output_text(QString::from(&session_output));
    }

    pub fn set_session_terminal_profile(mut self: Pin<&mut Self>, profile: QString) -> bool {
        let profile_str = profile.to_string();
        let Some(parsed) = terminal_profile_from_key(&profile_str) else {
            self.as_mut().set_status_text(QString::from(&format!(
                "Invalid terminal profile: {}",
                profile_str.trim()
            )));
            return false;
        };

        let state_arc = self.rust().state.clone();
        {
            let mut state = state_arc.lock().unwrap();
            state.set_selected_terminal_profile(parsed);
        }

        Self::sync_selected_session_context(&mut self);
        self.as_mut()
            .set_status_text(QString::from("Session terminal profile updated"));
        true
    }

    pub fn set_default_terminal_profile(mut self: Pin<&mut Self>, profile: QString) -> bool {
        let profile_str = profile.to_string();
        let Some(parsed) = terminal_profile_from_key(&profile_str) else {
            self.as_mut().set_status_text(QString::from(&format!(
                "Invalid default terminal profile: {}",
                profile_str.trim()
            )));
            return false;
        };

        let state_arc = self.rust().state.clone();
        {
            let mut state = state_arc.lock().unwrap();
            state.set_default_terminal_profile(parsed);
        }

        Self::sync_selected_session_context(&mut self);
        self.as_mut()
            .set_status_text(QString::from("Default terminal profile updated"));
        true
    }

    pub fn set_session_workspace_path(mut self: Pin<&mut Self>, workspace_path: QString) {
        let workspace = workspace_path.to_string();
        let trimmed = workspace.trim().to_string();

        // Reject relative paths — they produce wrong Set-Location paths at runtime
        // (e.g. the process CWD of the binary would be used as the base, which is
        // target/release/, not the user's workspace).  Empty string is allowed to
        // clear the workspace path.
        if !trimmed.is_empty() && !std::path::Path::new(&trimmed).is_absolute() {
            self.as_mut().set_status_text(QString::from(&format!(
                "Workspace path must be an absolute path (got: '{trimmed}')."
            )));
            return;
        }

        let state_arc = self.rust().state.clone();
        {
            let mut state = state_arc.lock().unwrap();
            state.set_selected_workspace_path(trimmed);
        }

        Self::sync_selected_session_context(&mut self);
        self.as_mut()
            .set_status_text(QString::from("Session workspace updated"));
    }

    pub fn set_session_venv_path(mut self: Pin<&mut Self>, venv_path: QString) {
        let venv = venv_path.to_string();
        let state_arc = self.rust().state.clone();
        {
            let mut state = state_arc.lock().unwrap();
            state.set_selected_venv_path(venv);
        }

        Self::sync_selected_session_context(&mut self);
        self.as_mut()
            .set_status_text(QString::from("Session venv updated"));
    }

    pub fn set_session_activate_venv(mut self: Pin<&mut Self>, activate: bool) {
        let state_arc = self.rust().state.clone();
        {
            let mut state = state_arc.lock().unwrap();
            state.set_selected_activate_venv(activate);
        }

        Self::sync_selected_session_context(&mut self);
        self.as_mut().set_status_text(QString::from(if activate {
            "Session venv activation enabled"
        } else {
            "Session venv activation disabled"
        }));
    }

    pub fn open_saved_commands(mut self: Pin<&mut Self>, workspace_id: QString) -> bool {
        let workspace = workspace_id.to_string();
        let workspace = workspace.trim();
        if workspace.is_empty() {
            self.as_mut().set_status_text(QString::from(
                "workspace_id is required to open saved commands",
            ));
            return false;
        }

        match Self::refresh_saved_commands_for_workspace(&mut self, workspace) {
            Ok(_) => {
                self.as_mut().set_status_text(QString::from(&format!(
                    "Loaded saved commands for workspace: {}",
                    workspace
                )));
                true
            }
            Err(err) => {
                self.as_mut().set_status_text(QString::from(&err));
                false
            }
        }
    }

    pub fn saved_commands_json(self: &Self) -> QString {
        let state_arc = self.rust().state.clone();
        let mut state = state_arc.lock().unwrap();
        let workspace_id = state.saved_commands_ui_workspace_id.clone();
        if workspace_id.trim().is_empty() {
            return QString::from("[]");
        }

        let commands = state.list_saved_commands(&workspace_id).unwrap_or_default();
        let json = serde_json::to_string(&commands).unwrap_or_else(|_| "[]".to_string());
        QString::from(&json)
    }

    pub fn saved_commands_workspace_id(self: &Self) -> QString {
        let state_arc = self.rust().state.clone();
        let state = state_arc.lock().unwrap();
        QString::from(&state.saved_commands_ui_workspace_id)
    }

    pub fn reopen_saved_commands(mut self: Pin<&mut Self>) -> bool {
        let workspace_id = self.as_ref().saved_commands_workspace_id().to_string();
        let workspace = workspace_id.trim();
        if workspace.is_empty() {
            self.as_mut().set_status_text(QString::from(
                "Set a workspace_id before reopening saved commands",
            ));
            return false;
        }

        match Self::refresh_saved_commands_for_workspace(&mut self, workspace) {
            Ok(_) => {
                self.as_mut().set_status_text(QString::from(&format!(
                    "Reopened saved commands for workspace: {}",
                    workspace
                )));
                true
            }
            Err(err) => {
                self.as_mut().set_status_text(QString::from(&err));
                false
            }
        }
    }

    pub fn save_saved_command(mut self: Pin<&mut Self>, name: QString, command: QString) -> bool {
        let name = name.to_string();
        let command = command.to_string();
        let name = name.trim();
        let command = command.trim();

        if name.is_empty() {
            self.as_mut()
                .set_status_text(QString::from("Saved command name is required"));
            return false;
        }

        if command.is_empty() {
            self.as_mut()
                .set_status_text(QString::from("Saved command text is required"));
            return false;
        }

        let workspace_id = self.as_ref().saved_commands_workspace_id().to_string();
        let workspace = workspace_id.trim();
        if workspace.is_empty() {
            self.as_mut().set_status_text(QString::from(
                "workspace_id is required before saving commands",
            ));
            return false;
        }

        let save_result = {
            let state_arc = self.rust().state.clone();
            let mut state = state_arc.lock().unwrap();
            state.save_saved_command(workspace, name, command)
        };

        match save_result {
            Ok(_) => {
                let _ = Self::refresh_saved_commands_for_workspace(&mut self, workspace);
                self.as_mut().set_status_text(QString::from(&format!(
                    "Saved command added for workspace: {}",
                    workspace
                )));
                true
            }
            Err(err) => {
                self.as_mut().set_status_text(QString::from(&err));
                false
            }
        }
    }

    pub fn delete_saved_command(mut self: Pin<&mut Self>, command_id: QString) -> bool {
        let command_id = command_id.to_string();
        let command_id = command_id.trim();
        if command_id.is_empty() {
            self.as_mut()
                .set_status_text(QString::from("command_id is required"));
            return false;
        }

        let workspace_id = self.as_ref().saved_commands_workspace_id().to_string();
        let workspace = workspace_id.trim();
        if workspace.is_empty() {
            self.as_mut().set_status_text(QString::from(
                "workspace_id is required before deleting commands",
            ));
            return false;
        }

        let delete_result = {
            let state_arc = self.rust().state.clone();
            let mut state = state_arc.lock().unwrap();
            state.delete_saved_command(workspace, command_id)
        };

        match delete_result {
            Ok(_) => {
                let _ = Self::refresh_saved_commands_for_workspace(&mut self, workspace);
                self.as_mut().set_status_text(QString::from(&format!(
                    "Saved command removed from workspace: {}",
                    workspace
                )));
                true
            }
            Err(err) => {
                self.as_mut().set_status_text(QString::from(&err));
                false
            }
        }
    }

    pub fn execute_saved_command(mut self: Pin<&mut Self>, command_id: QString) -> bool {
        let command_id = command_id.to_string();
        let command_id = command_id.trim();
        if command_id.is_empty() {
            self.as_mut()
                .set_status_text(QString::from("command_id is required"));
            return false;
        }

        let workspace_id = self.as_ref().saved_commands_workspace_id().to_string();
        let workspace = workspace_id.trim();
        if workspace.is_empty() {
            self.as_mut().set_status_text(QString::from(
                "workspace_id is required before executing saved commands",
            ));
            return false;
        }

        let use_result = {
            let state_arc = self.rust().state.clone();
            let mut state = state_arc.lock().unwrap();
            let selected_session_id = state.selected_session_id.clone();
            state.use_saved_command(workspace, command_id, &selected_session_id)
        };

        let use_result = match use_result {
            Ok(result) => result,
            Err(err) => {
                self.as_mut().set_status_text(QString::from(&err));
                return false;
            }
        };

        self.as_mut().set_pending_count(use_result.pending_count);
        self.as_mut()
            .set_pending_commands_json(use_result.pending_json.clone());

        let state_arc = self.rust().state.clone();
        let tabs_json = {
            let state = state_arc.lock().unwrap();
            state.session_tabs_to_json()
        };
        self.as_mut().set_session_tabs_json(tabs_json);

        if let Some(cmd) = use_result.selected_cmd.as_ref() {
            self.as_mut().set_command_text(QString::from(&*cmd.command));
            self.as_mut()
                .set_working_directory(QString::from(&*cmd.working_directory));
            self.as_mut().set_context_info(QString::from(&*cmd.context));
            self.as_mut()
                .set_current_request_id(QString::from(&*cmd.id));
            self.as_mut()
                .set_current_session_id(QString::from(&*cmd.session_id));
            self.as_mut()
                .set_current_terminal_profile(QString::from(terminal_profile_to_key(
                    &cmd.terminal_profile,
                )));
            self.as_mut()
                .set_current_workspace_path(QString::from(&*cmd.workspace_path));
            self.as_mut()
                .set_current_venv_path(QString::from(&*cmd.venv_path));
            self.as_mut().set_current_activate_venv(cmd.activate_venv);
        }

        let _ = Self::refresh_saved_commands_for_workspace(&mut self, workspace);

        self.as_mut().set_status_text(QString::from(&format!(
            "Saved command queued for selected session: {}",
            use_result.targeted_session_id
        )));
        self.as_mut()
            .command_received(QString::from(&use_result.queued_request.id));
        true
    }

    pub fn run_command(self: Pin<&mut Self>, command: QString) -> bool {
        Self::run_command_impl(self, command, 300)
    }

    fn run_command_impl(mut self: Pin<&mut Self>, command: QString, timeout_secs: u64) -> bool {
        let command_text = command.to_string();
        let command_text = command_text.trim();
        if command_text.is_empty() {
            self.as_mut()
                .set_status_text(QString::from("Enter a command before running"));
            return false;
        }

        let injection_requested = *self.as_ref().gemini_injection_requested();
        if injection_requested && !*self.as_ref().gemini_key_present() {
            // No stored key — clear the injection flag and let the command run without it.
            // The gemini CLI handles auth itself (browser OAuth on free tier).
            self.as_mut().set_gemini_injection_requested(false);
        }
        let injection_requested = *self.as_ref().gemini_injection_requested();

        if cfg!(windows) && *self.as_ref().run_commands_in_window() {
            let workspace_path = {
                let state_arc = self.rust().state.clone();
                let state = state_arc.lock().unwrap();
                let selected = state.selected_session_context().workspace_path;
                if selected.trim().is_empty() {
                    crate::cxxqt_bridge::default_workspace_path()
                } else {
                    selected
                }
            };

            let mut launch = Command::new("pwsh");
            launch
                .arg("-NoExit")
                .arg("-Command")
                .arg("if (-not [string]::IsNullOrWhiteSpace($env:PM_IT_CWD)) { Set-Location -LiteralPath $env:PM_IT_CWD }; if (-not [string]::IsNullOrWhiteSpace($env:PM_IT_CMD)) { Invoke-Expression $env:PM_IT_CMD }")
                .env("PM_IT_CWD", &workspace_path)
                .env("PM_IT_CMD", command_text)
                .env("NPM_CONFIG_UPDATE_NOTIFIER", "false");

            if injection_requested {
                if let Some(stored_key) = crate::system_tray::load_gemini_api_key() {
                    launch
                        .env("GEMINI_API_KEY", &stored_key)
                        .env("GOOGLE_API_KEY", &stored_key);
                }
            }

            match launch.spawn() {
                Ok(_) => {
                    self.as_mut().set_status_text(QString::from(
                        "Command launched in dedicated PowerShell window (legacy mode)",
                    ));
                    Self::append_output_line(
                        &mut self,
                        &format!("[window][legacy] launched: {command_text}"),
                    );
                    if injection_requested {
                        self.as_mut().set_gemini_injection_requested(false);
                        Self::append_output_line(
                            &mut self,
                            "[gemini] stored key injection requested for this command only",
                        );
                    }
                    return true;
                }
                Err(error) => {
                    self.as_mut().set_status_text(QString::from(&format!(
                        "Failed to launch command window: {error}"
                    )));
                    return false;
                }
            }
        }

        let state_arc = self.rust().state.clone();
        let (request, selected_session_id, profile_key, has_sender, has_session) = {
            let state = state_arc.lock().unwrap();
            let selected_session_id = state.selected_session_id.clone();
            let context = state.selected_session_context();

            let working_directory = if context.workspace_path.trim().is_empty() {
                crate::cxxqt_bridge::default_workspace_path()
            } else {
                context.workspace_path.clone()
            };

            let request = CommandRequest {
                id: format!("manual-{}", monotonic_millis()),
                command: command_text.to_string(),
                working_directory,
                context: "Manual command from Interactive Terminal".to_string(),
                session_id: selected_session_id.clone(),
                terminal_profile: context.selected_terminal_profile.clone(),
                workspace_path: context.workspace_path.clone(),
                venv_path: context.selected_venv_path.clone(),
                activate_venv: context.activate_venv,
                timeout_seconds: timeout_secs,
                args: Vec::new(),
                env: {
                    let mut env = std::collections::HashMap::new();
                    if injection_requested {
                        env.insert("PM_GEMINI_INJECT".to_string(), "1".to_string());
                        env.insert(
                            "GEMINI_API_KEY".to_string(),
                            GEMINI_SENTINEL_TOKEN.to_string(),
                        );
                    }
                    env
                },
                workspace_id: String::new(),
                allowlisted: true,
            };

            (
                request,
                selected_session_id,
                terminal_profile_to_key(&context.selected_terminal_profile).to_string(),
                state.command_tx.is_some(),
                state.has_session(&state.selected_session_id),
            )
        };

        if !has_session {
            let message = "No active terminal session. Create or select a session and retry.";
            self.as_mut().set_status_text(QString::from(message));
            Self::append_output_line(&mut self, message);
            return false;
        }

        if !has_sender {
            let message = "Command runtime is not ready yet. Wait for startup and retry.";
            self.as_mut().set_status_text(QString::from(message));
            Self::append_output_line(&mut self, message);
            return false;
        }

        let send_result = {
            let state = state_arc.lock().unwrap();
            state
                .command_tx
                .as_ref()
                .map(|tx| tx.try_send(request.clone()))
        };

        match send_result {
            Some(Ok(())) => {
                self.as_mut()
                    .set_current_request_id(QString::from(&request.id));
                self.as_mut()
                    .set_current_session_id(QString::from(&selected_session_id));
                self.as_mut()
                    .set_current_terminal_profile(QString::from(&profile_key));
                self.as_mut()
                    .set_working_directory(QString::from(&request.working_directory));
                self.as_mut().set_current_allowlisted(true);
                self.as_mut().set_status_text(QString::from(&format!(
                    "Running command in session {selected_session_id}"
                )));
                if injection_requested {
                    self.as_mut().set_gemini_injection_requested(false);
                }
                true
            }
            Some(Err(err)) => {
                let message = format!("Failed to queue command: {err}");
                self.as_mut().set_status_text(QString::from(&message));
                Self::append_output_line(&mut self, &message);
                false
            }
            None => {
                let message = "Command runtime is not ready yet. Wait for startup and retry.";
                self.as_mut().set_status_text(QString::from(message));
                Self::append_output_line(&mut self, message);
                false
            }
        }
    }

    pub fn export_output_text(mut self: Pin<&mut Self>, directory: QString) -> bool {
        let directory_text = directory.to_string();
        let output = self.as_ref().output_text().to_string();
        let session_id = self.as_ref().current_session_id().to_string();

        let export_dir = match Self::resolve_export_directory(&self, &directory_text) {
            Ok(dir) => dir,
            Err(err) => {
                self.as_mut().set_status_text(QString::from(&err));
                return false;
            }
        };

        if let Err(err) = fs::create_dir_all(&export_dir) {
            self.as_mut().set_status_text(QString::from(&format!(
                "Failed to create export directory: {err}"
            )));
            return false;
        }

        let filename = format!(
            "interactive-terminal-output-{}-{}.txt",
            Self::sanitize_filename_component(&session_id),
            monotonic_millis()
        );
        let file_path = export_dir.join(filename);

        if let Err(err) = fs::write(&file_path, output) {
            self.as_mut().set_status_text(QString::from(&format!(
                "Failed to export output text: {err}"
            )));
            return false;
        }

        self.as_mut().set_status_text(QString::from(&format!(
            "Output exported: {}",
            file_path.display()
        )));
        true
    }

    pub fn export_output_json(mut self: Pin<&mut Self>, directory: QString) -> bool {
        #[derive(Serialize)]
        struct OutputExportEnvelope {
            exported_at: String,
            export_format: String,
            session_id: String,
            request_id: String,
            terminal_profile: String,
            workspace_path: String,
            working_directory: String,
            venv_path: String,
            activate_venv: bool,
            connected: bool,
            status_text: String,
            env_info: BTreeMap<String, String>,
            output: String,
        }

        let directory_text = directory.to_string();
        let session_id = self.as_ref().current_session_id().to_string();
        let envelope = OutputExportEnvelope {
            exported_at: timestamp_now(),
            export_format: "interactive-terminal-output-v1".to_string(),
            session_id: session_id.clone(),
            request_id: self.as_ref().current_request_id().to_string(),
            terminal_profile: self.as_ref().current_terminal_profile().to_string(),
            workspace_path: self.as_ref().current_workspace_path().to_string(),
            working_directory: self.as_ref().working_directory().to_string(),
            venv_path: self.as_ref().current_venv_path().to_string(),
            activate_venv: *self.as_ref().current_activate_venv(),
            connected: *self.as_ref().is_connected(),
            status_text: self.as_ref().status_text().to_string(),
            env_info: Self::export_env_snapshot(),
            output: self.as_ref().output_text().to_string(),
        };

        let export_dir = match Self::resolve_export_directory(&self, &directory_text) {
            Ok(dir) => dir,
            Err(err) => {
                self.as_mut().set_status_text(QString::from(&err));
                return false;
            }
        };

        if let Err(err) = fs::create_dir_all(&export_dir) {
            self.as_mut().set_status_text(QString::from(&format!(
                "Failed to create export directory: {err}"
            )));
            return false;
        }

        let filename = format!(
            "interactive-terminal-output-{}-{}.json",
            Self::sanitize_filename_component(&session_id),
            monotonic_millis()
        );
        let file_path = export_dir.join(filename);

        let payload = match serde_json::to_string_pretty(&envelope) {
            Ok(value) => value,
            Err(err) => {
                self.as_mut().set_status_text(QString::from(&format!(
                    "Failed to serialize output JSON: {err}"
                )));
                return false;
            }
        };

        if let Err(err) = fs::write(&file_path, payload) {
            self.as_mut().set_status_text(QString::from(&format!(
                "Failed to export output JSON: {err}"
            )));
            return false;
        }

        self.as_mut().set_status_text(QString::from(&format!(
            "Output JSON exported: {}",
            file_path.display()
        )));
        true
    }

    // ── Allowlist management (Phase 4.5) ──────────────────────────────────

    /// Reload allowlist patterns from disk and update `allowlistPatternsJson`.
    pub fn refresh_allowlist(mut self: Pin<&mut Self>) {
        use cxx_qt::CxxQtType;

        let json = {
            let state_arc = self.rust().state.clone();
            let mut state = state_arc.lock().unwrap();
            state.refresh_allowlist();
            state.allowlist_patterns_to_json()
        };

        self.as_mut()
            .set_allowlist_patterns_json(QString::from(&json));
    }

    /// Add a pattern to the allowlist.  Returns true on success.
    pub fn add_allowlist_pattern(mut self: Pin<&mut Self>, pattern: QString) -> bool {
        use cxx_qt::CxxQtType;

        let pattern_str = pattern.to_string();
        let result = {
            let state_arc = self.rust().state.clone();
            let mut state = state_arc.lock().unwrap();
            state.add_allowlist_pattern(&pattern_str)
        };

        match result {
            Ok(()) => {
                let json = {
                    let state_arc = self.rust().state.clone();
                    let state = state_arc.lock().unwrap();
                    state.allowlist_patterns_to_json()
                };
                self.as_mut()
                    .set_allowlist_patterns_json(QString::from(&json));
                self.as_mut().set_allowlist_last_op(QString::from("added"));
                self.as_mut().set_allowlist_last_error(QString::default());
                true
            }
            Err(err) => {
                let op = if err.contains("already in") {
                    "duplicate"
                } else {
                    "error"
                };
                self.as_mut()
                    .set_allowlist_last_op(QString::from(op));
                self.as_mut()
                    .set_allowlist_last_error(QString::from(&err));
                false
            }
        }
    }

    /// Remove a pattern from the allowlist.  Returns true on success.
    pub fn remove_allowlist_pattern(mut self: Pin<&mut Self>, pattern: QString) -> bool {
        use cxx_qt::CxxQtType;

        let pattern_str = pattern.to_string();
        let result = {
            let state_arc = self.rust().state.clone();
            let mut state = state_arc.lock().unwrap();
            state.remove_allowlist_pattern(&pattern_str)
        };

        match result {
            Ok(()) => {
                let json = {
                    let state_arc = self.rust().state.clone();
                    let state = state_arc.lock().unwrap();
                    state.allowlist_patterns_to_json()
                };
                self.as_mut()
                    .set_allowlist_patterns_json(QString::from(&json));
                self.as_mut()
                    .set_allowlist_last_op(QString::from("removed"));
                self.as_mut().set_allowlist_last_error(QString::default());
                true
            }
            Err(err) => {
                let op = if err.contains("not found") {
                    "not_found"
                } else {
                    "error"
                };
                self.as_mut()
                    .set_allowlist_last_op(QString::from(op));
                self.as_mut()
                    .set_allowlist_last_error(QString::from(&err));
                false
            }
        }
    }

    /// Derive exact + generalized patterns from a command and populate
    /// the proposal bridge properties.
    pub fn derive_allowlist_pattern(mut self: Pin<&mut Self>, command: QString) {
        use crate::cxxqt_bridge::allowlist_state::derive_allowlist_patterns;

        let cmd_str = command.to_string();
        let (exact, general, risk) = derive_allowlist_patterns(&cmd_str);

        self.as_mut()
            .set_proposed_from_command(QString::from(&cmd_str));
        self.as_mut()
            .set_proposed_exact_pattern(QString::from(&exact));
        self.as_mut()
            .set_proposed_general_pattern(QString::from(&general));
        self.as_mut()
            .set_proposed_risk_hint(QString::from(risk));
        // Default selection: exact (least permissive).
        self.as_mut()
            .set_proposed_allowlist_pattern(QString::from(&exact));
    }

    /// Confirm adding the currently selected `proposedAllowlistPattern`.
    pub fn confirm_add_proposed_pattern(mut self: Pin<&mut Self>) -> bool {
        use cxx_qt::CxxQtType;

        let pattern = self.rust().proposed_allowlist_pattern.to_string();
        if pattern.trim().is_empty() {
            return false;
        }

        let ok = Self::add_allowlist_pattern(self.as_mut(), QString::from(&pattern));

        // Clear proposal state regardless.
        self.as_mut()
            .set_proposed_allowlist_pattern(QString::default());
        self.as_mut()
            .set_proposed_from_command(QString::default());
        self.as_mut()
            .set_proposed_exact_pattern(QString::default());
        self.as_mut()
            .set_proposed_general_pattern(QString::default());
        self.as_mut()
            .set_proposed_risk_hint(QString::default());

        ok
    }

    /// Cancel the pending allowlist proposal.
    pub fn cancel_proposed_pattern(mut self: Pin<&mut Self>) {
        self.as_mut()
            .set_proposed_allowlist_pattern(QString::default());
        self.as_mut()
            .set_proposed_from_command(QString::default());
        self.as_mut()
            .set_proposed_exact_pattern(QString::default());
        self.as_mut()
            .set_proposed_general_pattern(QString::default());
        self.as_mut()
            .set_proposed_risk_hint(QString::default());
    }

    /// Select the exact (low-risk) pattern as the active proposal.
    pub fn select_exact_proposed_pattern(mut self: Pin<&mut Self>) {
        use cxx_qt::CxxQtType;
        let exact = self.rust().proposed_exact_pattern.to_string();
        self.as_mut()
            .set_proposed_allowlist_pattern(QString::from(&exact));
    }

    /// Select the generalized (wider) pattern as the active proposal.
    pub fn select_general_proposed_pattern(mut self: Pin<&mut Self>) {
        use cxx_qt::CxxQtType;
        let general = self.rust().proposed_general_pattern.to_string();
        self.as_mut()
            .set_proposed_allowlist_pattern(QString::from(&general));
    }

}
