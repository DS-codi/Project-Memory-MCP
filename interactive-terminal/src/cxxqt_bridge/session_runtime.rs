use crate::cxxqt_bridge::completed_outputs::OutputTracker;
use crate::cxxqt_bridge::default_workspace_path;
use crate::protocol::CommandRequest;
use crate::protocol::TerminalProfile;
use crate::saved_commands::WorkspaceSavedCommands;
use crate::saved_commands_repository::SavedCommandsRepository;
use cxx_qt_lib::QString;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub struct TerminalAppRust {
    pub(crate) command_text: QString,
    pub(crate) working_directory: QString,
    pub(crate) context_info: QString,
    pub(crate) status_text: QString,
    pub(crate) output_text: QString,
    pub(crate) is_connected: bool,
    pub(crate) pending_count: i32,
    pub(crate) current_request_id: QString,
    pub(crate) current_session_id: QString,
    pub(crate) current_terminal_profile: QString,
    pub(crate) current_default_terminal_profile: QString,
    pub(crate) current_workspace_path: QString,
    pub(crate) current_venv_path: QString,
    pub(crate) current_activate_venv: bool,
    pub(crate) current_allowlisted: bool,
    pub(crate) start_with_windows: bool,
    pub(crate) start_visible: bool,
    pub(crate) run_commands_in_window: bool,
    pub(crate) gemini_key_present: bool,
    /// Whether a GitHub Copilot auth configuration was detected at startup.
    /// Currently always `true` — the Copilot button is always visible since
    /// detecting the exact auth state requires calling external binaries, which
    /// is too slow for startup. Future: check ~/.config/gh/hosts.yml existence.
    pub(crate) copilot_key_present: bool,
    pub(crate) gemini_injection_requested: bool,
    pub(crate) preferred_cli_provider: QString,
    pub(crate) approval_provider_chooser_enabled: bool,
    pub(crate) autonomy_mode_selector_visible: bool,
    pub(crate) cpu_usage_percent: f64,
    pub(crate) memory_usage_mb: f64,
    pub(crate) pending_commands_json: QString,
    pub(crate) available_workspaces_json: QString,
    pub(crate) session_tabs_json: QString,
    pub(crate) tray_icon_url: QString,
    pub(crate) terminal_ws_port: i32,
    /// Compile-time PTY mode label surfaced to QML ("pty-host" or "in-process").
    pub(crate) terminal_mode_label: QString,
    // ── Allowlist management (Phase 4.5) ──────────────────────────────────
    /// JSON array of current allowlist patterns.
    pub(crate) allowlist_patterns_json: QString,
    /// Filter string for the allowlist panel search box.
    pub(crate) allowlist_filter: QString,
    /// Human-readable result of the last allowlist operation.
    pub(crate) allowlist_last_error: QString,
    /// Short operation label: "added", "removed", "duplicate", "not_found", "".
    pub(crate) allowlist_last_op: QString,
    /// Proposed pattern pending user confirmation (exact choice).
    pub(crate) proposed_allowlist_pattern: QString,
    /// Source command that triggered the current proposal.
    pub(crate) proposed_from_command: QString,
    /// Exact (low-risk) pattern for the proposal preview.
    pub(crate) proposed_exact_pattern: QString,
    /// Generalized (wider) pattern for the proposal preview.
    pub(crate) proposed_general_pattern: QString,
    /// Risk hint for the generalized pattern: "low", "medium", or "high".
    pub(crate) proposed_risk_hint: QString,
    // ── Approval-time session lifecycle + output format (Steps 27–28) ────
    /// Session mode to apply at the next agent launch approval: "new" | "resume".
    pub(crate) approval_session_mode: QString,
    /// Session ID to resume (only used when approval_session_mode = "resume").
    pub(crate) approval_resume_session_id: QString,
    /// Output format requested for the next launch: "text" | "json" | "stream-json".
    pub(crate) approval_output_format: QString,
    // ── Risk-aware approval policy (Steps 29–31) ─────────────────────────
    /// Risk tier evaluated for the pending launch: 1 (Low), 2 (Medium), 3 (High).
    pub(crate) approval_risk_tier: u32,
    /// Whether the user has confirmed trusted-scope access for medium/high-risk launches.
    pub(crate) approval_trusted_scope_confirmed: bool,
    /// Text of the trusted-scope statement the user is asked to acknowledge.
    pub(crate) approval_trusted_scope_text: QString,
    /// Autonomy budget — max commands (0 = unlimited).
    pub(crate) approval_budget_max_commands: u32,
    /// Autonomy budget — max duration in seconds (0 = unlimited).
    pub(crate) approval_budget_max_duration_secs: u32,
    /// Autonomy budget — max files (0 = unlimited).
    pub(crate) approval_budget_max_files: u32,
    // ── CLI load-reduction flags (Phase 3) ─────────────────────────────────
    /// Whether the user wants `--screen-reader` passed to Gemini CLI (default: true).
    pub(crate) approval_gemini_screen_reader: bool,
    /// Whether the user wants minimal-UI mode for Copilot CLI (default: true).
    /// Reserved for forward compatibility; no CLI flag is emitted as of v1.x.
    pub(crate) approval_copilot_minimal_ui: bool,
    pub(crate) state: Arc<Mutex<AppState>>,
}

pub struct AppState {
    pub pending_commands_by_session: HashMap<String, Vec<CommandRequest>>,
    /// Session-scoped terminal output text shown in the GUI output panel.
    /// This prevents output from different sessions being mixed in one tab.
    pub session_output_by_id: HashMap<String, String>,
    // ── Allowlist management (Phase 4.5) ──────────────────────────────────
    /// In-memory allowlist patterns (loaded from disk on first refresh).
    pub allowlist_patterns: Vec<String>,
    /// Discovered data root for allowlist file persistence.
    pub allowlist_data_root: Option<PathBuf>,
    pub session_display_names: HashMap<String, String>,
    pub session_context_by_id: HashMap<String, SessionRuntimeContext>,
    pub session_lifecycle_by_id: HashMap<String, SessionLifecycleState>,
    pub default_terminal_profile: TerminalProfile,
    pub selected_session_id: String,
    pub saved_commands_ui_workspace_id: String,
    pub saved_commands_by_workspace: HashMap<String, WorkspaceSavedCommands>,
    pub saved_commands_repository: SavedCommandsRepository,
    pub response_tx: Option<tokio::sync::mpsc::Sender<crate::protocol::Message>>,
    pub command_tx: Option<tokio::sync::mpsc::Sender<CommandRequest>>,
    pub output_tracker: OutputTracker,
    /// Broadcast sender shared by the WS terminal server for live shell traffic.
    pub ws_terminal_tx: Option<tokio::sync::broadcast::Sender<Vec<u8>>>,
    /// Sessions that were started by the "Launch Gemini CLI" button.
    pub gemini_session_ids: HashSet<String>,
    /// Sessions that were started by the "Launch Copilot CLI" button.
    pub copilot_session_ids: HashSet<String>,
    // ─── Agent-session tracking (step 11) ──────────────────────────────────
    /// Session IDs that were started by an approved super-subagent launch.
    pub agent_session_ids: HashSet<String>,
    /// Rich metadata for each agent session, keyed by session ID.
    pub agent_session_meta: HashMap<String, AgentSessionMeta>,
    /// Workspace paths pushed from the MCP server (Project Memory DB).
    /// Used to pre-populate the workspace/venv path pickers in the GUI.
    pub known_workspace_paths: Vec<String>,
}

#[derive(Default, Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionLifecycleState {
    #[default]
    Inactive,
    Active,
    Closed,
}

#[derive(Default, Clone)]
pub struct SessionRuntimeContext {
    pub selected_terminal_profile: TerminalProfile,
    pub workspace_path: String,
    pub selected_venv_path: String,
    pub activate_venv: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SessionTabView {
    pub session_id: String,
    pub label: String,
    pub pending_count: i32,
    pub is_active: bool,
    pub can_close: bool,
    pub lifecycle_state: SessionLifecycleState,
    pub is_gemini: bool,
    // ─── Agent-session fields (step 11) ────────────────────────────────────
    /// Whether this tab was started by an approved super-subagent launch.
    pub is_agent_session: bool,
    /// Normalised provider token (`"gemini"` / `"copilot"`), if applicable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Agent type that requested the launch (e.g. `"Executor"`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requesting_agent: Option<String>,
    /// Plan/session linkage string (plan_id or session_id from the request).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_session_id: Option<String>,
}

/// Metadata stored in `AppState` for each agent-session tab (step 11).
#[derive(Debug, Clone)]
pub(crate) struct AgentSessionMeta {
    /// Normalised provider token (e.g. `"gemini"` or `"copilot"`).
    pub provider: String,
    /// Agent type that initiated the launch, if known.
    pub requesting_agent: Option<String>,
    /// Plan or session ID for cross-referencing with Project Memory.
    pub plan_session_id: Option<String>,
    /// Monotonic millisecond timestamp when the session was launched.
    pub launched_at_ms: u64,
}

#[derive(Debug)]
pub(crate) struct UseSavedCommandResult {
    pub command_entry: crate::protocol::SavedCommandRecord,
    pub queued_request: CommandRequest,
    pub targeted_session_id: String,
    pub pending_count: i32,
    pub pending_json: QString,
    pub selected_cmd: Option<CommandRequest>,
}

impl Default for TerminalAppRust {
    fn default() -> Self {
        let default_terminal_profile = default_terminal_profile_from_env();
        let default_workspace = default_workspace_path();
        let tray_settings = crate::system_tray::load_settings();
        let gemini_key_present = tray_settings
            .gemini_api_key
            .as_ref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false);

        let state = Arc::new(Mutex::new(AppState {
            pending_commands_by_session: HashMap::from([("default".to_string(), Vec::new())]),
            session_output_by_id: HashMap::from([("default".to_string(), String::new())]),
            session_display_names: HashMap::from([("default".to_string(), "default".to_string())]),
            session_context_by_id: HashMap::from([(
                "default".to_string(),
                SessionRuntimeContext {
                    selected_terminal_profile: default_terminal_profile.clone(),
                    workspace_path: default_workspace.clone(),
                    ..SessionRuntimeContext::default()
                },
            )]),
            session_lifecycle_by_id: HashMap::from([(
                "default".to_string(),
                SessionLifecycleState::Active,
            )]),
            default_terminal_profile: default_terminal_profile.clone(),
            selected_session_id: "default".to_string(),
            saved_commands_ui_workspace_id: String::new(),
            saved_commands_by_workspace: HashMap::new(),
            saved_commands_repository: SavedCommandsRepository::from_env_or_default(),
            response_tx: None,
            command_tx: None,
            output_tracker: OutputTracker::default(),
            ws_terminal_tx: None,
            gemini_session_ids: HashSet::new(),
            copilot_session_ids: HashSet::new(),
            agent_session_ids: HashSet::new(),
            agent_session_meta: HashMap::new(),
            allowlist_patterns: Vec::new(),
            allowlist_data_root: None,
            known_workspace_paths: Vec::new(),
        }));

        let session_tabs_json = {
            let s = state.lock().unwrap();
            s.session_tabs_to_json()
        };

        Self {
            command_text: QString::default(),
            working_directory: QString::default(),
            context_info: QString::default(),
            status_text: QString::from("Initializing..."),
            output_text: QString::default(),
            is_connected: false,
            pending_count: 0,
            current_request_id: QString::default(),
            current_session_id: QString::from("default"),
            current_terminal_profile: QString::from(match default_terminal_profile {
                TerminalProfile::PowerShell => "powershell",
                TerminalProfile::Pwsh => "pwsh",
                TerminalProfile::Cmd => "cmd",
                TerminalProfile::Bash => "bash",
                TerminalProfile::System => "system",
            }),
            current_default_terminal_profile: QString::from(match default_terminal_profile {
                TerminalProfile::PowerShell => "powershell",
                TerminalProfile::Pwsh => "pwsh",
                TerminalProfile::Cmd => "cmd",
                TerminalProfile::Bash => "bash",
                TerminalProfile::System => "system",
            }),
            current_workspace_path: QString::from(&default_workspace),
            current_venv_path: QString::default(),
            current_activate_venv: false,
            current_allowlisted: false,
            start_with_windows: tray_settings.start_with_windows,
            start_visible: true,
            run_commands_in_window: false,
            gemini_key_present,
            // Copilot button is always shown; auth detection at startup would
            // require calling `gh auth status`, which is too slow.
            copilot_key_present: true,
            gemini_injection_requested: false,
            preferred_cli_provider: QString::from(
                tray_settings
                    .preferred_cli_provider
                    .as_ref()
                    .map(|provider| provider.as_str())
                    .unwrap_or(""),
            ),
            approval_provider_chooser_enabled: tray_settings.approval_provider_chooser_enabled,
            autonomy_mode_selector_visible: tray_settings.autonomy_mode_selector_visible,
            cpu_usage_percent: 0.0,
            memory_usage_mb: 0.0,
            pending_commands_json: QString::from("[]"),
            available_workspaces_json: QString::from("[]"),
            session_tabs_json,
            tray_icon_url: resolve_tray_icon_url(),
            terminal_ws_port: 0,
            terminal_mode_label: QString::from(""),
            // ── Allowlist management (Phase 4.5) ──────────────────────────────────
            allowlist_patterns_json: QString::from("[]"),
            allowlist_filter: QString::default(),
            allowlist_last_error: QString::default(),
            allowlist_last_op: QString::default(),
            proposed_allowlist_pattern: QString::default(),
            proposed_from_command: QString::default(),
            proposed_exact_pattern: QString::default(),
            proposed_general_pattern: QString::default(),
            proposed_risk_hint: QString::default(),
            approval_session_mode: QString::from("new"),
            approval_resume_session_id: QString::default(),
            approval_output_format: QString::from("text"),
            approval_risk_tier: 1,
            approval_trusted_scope_confirmed: false,
            approval_trusted_scope_text: QString::default(),
            approval_budget_max_commands: 0,
            approval_budget_max_duration_secs: 0,
            approval_budget_max_files: 0,
            // CLI load-reduction flags default to true (opt-out via unchecking)
            approval_gemini_screen_reader: true,
            approval_copilot_minimal_ui: true,
            state,
        }
    }
}

fn default_terminal_profile_from_env() -> TerminalProfile {
    let Some(value) = std::env::var("PM_DEFAULT_TERMINAL_PROFILE").ok() else {
        // On Windows default to PowerShell explicitly; other platforms use bash via System
        #[cfg(target_os = "windows")]
        return TerminalProfile::PowerShell;
        #[cfg(not(target_os = "windows"))]
        return TerminalProfile::System;
    };

    match value.trim().to_ascii_lowercase().as_str() {
        "powershell" => TerminalProfile::PowerShell,
        "pwsh" => TerminalProfile::Pwsh,
        "cmd" => TerminalProfile::Cmd,
        "bash" => TerminalProfile::Bash,
        _ => TerminalProfile::System,
    }
}

/// Resolve the tray icon as a `file:///` URL from the executable directory.
///
/// Search order:
/// 1. `<exe_dir>/itpm-icon.ico`  (deployed next to binary)
/// 2. `<exe_dir>/resources/itpm-icon.ico`  (deployed sub-folder)
/// 3. `<exe_dir>/../../resources/itpm-icon.ico`  (cargo dev layout)
fn resolve_tray_icon_url() -> QString {
    let exe_dir = match std::env::current_exe() {
        Ok(path) => match path.parent() {
            Some(dir) => dir.to_path_buf(),
            None => return QString::default(),
        },
        Err(_) => return QString::default(),
    };

    let candidates = [
        exe_dir.join("itpm-icon.ico"),
        exe_dir.join("itpm-icon.svg"),
        exe_dir.join("resources").join("itpm-icon.ico"),
        exe_dir.join("resources").join("itpm-icon.svg"),
        exe_dir
            .join("..")
            .join("..")
            .join("resources")
            .join("itpm-icon.ico"),
        exe_dir
            .join("..")
            .join("..")
            .join("resources")
            .join("itpm-icon.svg"),
    ];

    for candidate in &candidates {
        if candidate.exists() {
            let canonical = candidate
                .canonicalize()
                .unwrap_or_else(|_| candidate.clone());
            let mut path_str = canonical.display().to_string();
            // Strip Windows extended-length path prefix (\\?\) that canonicalize() adds
            if path_str.starts_with(r"\\?\") {
                path_str = path_str[4..].to_string();
            }
            let url = format!(
                "file:///{}",
                path_str.replace('\\', "/").trim_start_matches('/')
            );
            eprintln!("Tray icon resolved: {url}");
            return QString::from(&url);
        }
    }

    eprintln!(
        "WARNING: No tray icon found. Searched: {:?}",
        candidates
            .iter()
            .map(|c| c.display().to_string())
            .collect::<Vec<_>>()
    );
    QString::default()
}
