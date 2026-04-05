use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::sync::mpsc as sync_mpsc;

use iced::window;

use crate::types::{
    ActiveOverlay, AllowlistPattern, ApprovalDialogState, CliProvider, ConnectionState,
    OutputFormat, PendingCommand, RiskTier, SavedCommand, SessionTab, TrayAction, WorkspaceEntry,
    AutonomyMode, ApprovalSessionMode,
};

// ─── Globals kept alive for the process lifetime ──────────────────────────────

/// Keep the TrayIcon alive so the tray entry persists until the app exits.
static TRAY_ICON: OnceLock<tray_icon::TrayIcon> = OnceLock::new();

/// Channel receiver used by `TrayPoll` to drain tray events without blocking.
static TRAY_RX: OnceLock<Mutex<sync_mpsc::Receiver<crate::types::TrayAction>>> = OnceLock::new();

// ─── OutgoingMessage (forward-declared here; backend_bridge fills in the body) ──

// Re-export so callers can use crate::app_state::OutgoingMessage
pub use crate::backend_bridge::OutgoingMessage;

// ═══════════════════════════════════════════════════════════════════════════════
// Message enum — every user action and backend event that can mutate AppState
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone)]
pub enum Message {
    // ── Backend events (TCP / protocol) ──────────────────────────────────────
    /// A new pending command has arrived from the MCP client
    CommandReceived(PendingCommand),
    /// A pending command was resolved (approved or declined)
    CommandCompleted { request_id: String, success: bool },
    /// The TCP connection state changed
    ConnectionChanged(ConnectionState),
    /// An agent session was launched and assigned a dedicated tab
    AgentSessionLaunched {
        session_id: String,
        label: String,
        provider: String,
    },
    /// A line of terminal output arrived for a session
    OutputChunk {
        session_id: String,
        line: String,
        is_stderr: bool,
    },
    /// The full list of session tabs was refreshed
    SessionTabsUpdated(Vec<SessionTab>),
    /// Available workspace paths were pushed from the backend
    WorkspaceListPush(Vec<WorkspaceEntry>),
    /// Saved commands were loaded for the current workspace
    SavedCommandsLoaded(Vec<SavedCommand>),
    /// Allowlist patterns were reloaded from disk
    AllowlistLoaded(Vec<AllowlistPattern>),
    /// A non-fatal backend error message
    BackendError(String),
    /// A crash was detected; show the crash alert overlay
    CrashAlert { message: String, log_path: String },
    /// A session tab was removed after kill
    KillSessionDone(String),

    // ── Tick / polling ────────────────────────────────────────────────────────
    /// Periodic status poll (CPU/memory/connection health)
    StatusTick,
    /// Tray event poll
    TrayPoll,
    /// Animation frame tick
    AnimationTick,
    /// A tray action was received
    TrayEvent(TrayAction),

    // ── Approval dialog ───────────────────────────────────────────────────────
    /// User clicked "Approve" in the approval dialog
    ApproveCommand { request_id: String },
    /// User clicked "Decline" in the approval dialog
    DeclineCommand { request_id: String },
    /// Provider radio changed in the approval dialog
    ApprovalProviderChanged(CliProvider),
    /// Autonomy mode changed
    ApprovalAutonomyModeChanged(AutonomyMode),
    /// Session mode changed (new / resume)
    ApprovalSessionModeChanged(ApprovalSessionMode),
    /// Resume session ID input changed
    ApprovalResumeSessionIdChanged(String),
    /// Output format changed
    ApprovalOutputFormatChanged(OutputFormat),
    /// Budget: max commands changed
    ApprovalBudgetMaxCommandsChanged(u32),
    /// Budget: max duration changed
    ApprovalBudgetMaxDurationChanged(u32),
    /// Budget: max files changed
    ApprovalBudgetMaxFilesChanged(u32),
    /// Trusted-scope checkbox toggled
    ApprovalTrustedScopeToggled(bool),
    /// Gemini screen-reader checkbox toggled
    ApprovalGeminiScreenReaderToggled(bool),
    /// Copilot minimal-UI checkbox toggled
    ApprovalCopilotMinimalUiToggled(bool),
    /// Decline reason text input changed
    ApprovalDeclineReasonChanged(String),
    /// Show the decline reason prompt
    ApprovalShowDeclinePrompt,
    /// Cancel the decline prompt (go back to approve/decline)
    ApprovalCancelDecline,
    /// Risk tier was computed by the backend
    ApprovalRiskTierComputed(RiskTier),

    // ── Session controls ──────────────────────────────────────────────────────
    /// Create a new session tab
    CreateSession,
    /// Switch to a session tab by id
    SwitchSession(String),
    /// Close a session tab by id
    CloseSession(String),
    /// Rename a session tab
    RenameSession { session_id: String, name: String },
    /// Session name input field changed
    SessionNameInputChanged(String),
    /// Workspace path changed for the current session
    WorkspacePathChanged(String),
    /// Venv path changed for the current session
    VenvPathChanged(String),
    /// Activate-venv checkbox toggled
    ActivateVenvToggled(bool),

    // ── Provider / launch ─────────────────────────────────────────────────────
    /// Launch the selected CLI provider in the current tab
    LaunchCli,
    /// Change the preferred provider
    ProviderChanged(CliProvider),
    /// Set the Gemini API key
    SetGeminiApiKey(String),
    /// Clear the stored Gemini API key
    ClearGeminiApiKey,
    /// Gemini key input field changed
    GeminiKeyInputChanged(String),
    /// Set the Claude API key
    SetClaudeApiKey(String),
    /// Clear the stored Claude API key
    ClearClaudeApiKey,

    // ── Saved commands ────────────────────────────────────────────────────────
    /// Open the saved commands panel for the current workspace
    OpenSavedCommands,
    /// Close the saved commands panel
    CloseSavedCommands,
    /// Execute a saved command by id
    ExecuteSavedCommand(String),
    /// Delete a saved command by id
    DeleteSavedCommand(String),
    /// Save a new command
    SaveNewCommand { name: String, command: String },
    /// Saved command name input field changed
    SavedCommandNameInputChanged(String),
    /// Saved command body input field changed
    SavedCommandInputChanged(String),

    // ── Allowlist ─────────────────────────────────────────────────────────────
    /// Open the allowlist panel
    OpenAllowlist,
    /// Close the allowlist panel
    CloseAllowlist,
    /// Filter text changed in the allowlist search box
    AllowlistFilterChanged(String),
    /// Add a pattern to the allowlist
    AddAllowlistPattern(String),
    /// Remove a pattern from the allowlist
    RemoveAllowlistPattern(String),
    /// Derive proposed patterns from a saved command string
    DeriveAllowlistPattern(String),
    /// Allowlist pattern input field changed
    AllowlistPatternInputChanged(String),
    /// Confirm the currently proposed pattern
    ConfirmProposedPattern,
    /// Cancel the currently proposed pattern
    CancelProposedPattern,
    /// Select the exact (low-risk) proposed pattern
    SelectExactProposedPattern,
    /// Select the generalised (wider) proposed pattern
    SelectGeneralProposedPattern,

    // ── Provider settings ─────────────────────────────────────────────────────
    /// Open the provider settings panel
    OpenProviderSettings,
    /// Close the provider settings panel
    CloseProviderSettings,
    /// Default terminal profile changed
    DefaultTerminalProfileChanged(String),
    /// Toggle start-with-Windows autorun
    SetStartWithWindows(bool),
    /// Toggle whether commands run in-window
    RunCommandsInWindowToggled(bool),
    /// Toggle provider chooser visibility in the approval dialog
    ProviderChooserEnabledToggled(bool),
    /// Toggle autonomy selector visibility in the approval dialog
    AutonomySelectorVisibleToggled(bool),

    // ── Bottom bar / output ───────────────────────────────────────────────────
    /// Copy all terminal output for the current session to the clipboard
    CopyAllOutput,
    /// Copy just the last command's output to the clipboard
    CopyLastOutput,
    /// Clear terminal output for the current session
    ClearOutput,
    /// Export terminal output as plain text to a directory
    ExportOutputText,
    /// Export terminal output as JSON to a directory
    ExportOutputJson,
    /// Terminal profile changed for the current session
    TerminalProfileChanged(String),

    // ── Window / tray ─────────────────────────────────────────────────────────
    /// Show the main window (from tray)
    TrayShow,
    /// Toggle start-with-Windows from tray context menu
    TrayToggleStartWithWindows,
    /// Quit the application from the tray menu
    TrayQuit,
    /// The OS sent a close request for a window
    WindowCloseRequested(window::Id),
    /// Minimise to tray without quitting
    MinimizeToTray,

    // ── Misc ──────────────────────────────────────────────────────────────────
    /// Dismiss the crash alert overlay
    DismissCrashAlert,
    /// No-op; used as a placeholder when routing returns nothing meaningful
    Noop,
}

// ═══════════════════════════════════════════════════════════════════════════════
// AppState struct
// ═══════════════════════════════════════════════════════════════════════════════

pub struct AppState {
    // ── Window ───────────────────────────────────────────────────────────────
    pub main_window_id: Option<window::Id>,
    pub window_visible: bool,
    pub quitting: bool,

    // ── Connection ───────────────────────────────────────────────────────────
    pub connection_state: ConnectionState,
    pub terminal_ws_port: u16,
    pub terminal_mode_label: String,

    // ── Pending commands ─────────────────────────────────────────────────────
    pub pending_commands: Vec<PendingCommand>,
    pub current_request_id: String,

    // ── Current session ───────────────────────────────────────────────────────
    pub current_session_id: String,
    pub current_terminal_profile: String,
    pub current_default_terminal_profile: String,
    pub current_workspace_path: String,
    pub current_venv_path: String,
    pub current_activate_venv: bool,
    pub current_allowlisted: bool,

    // ── Session tabs ──────────────────────────────────────────────────────────
    pub session_tabs: Vec<SessionTab>,

    // ── Terminal output (per session, capped ring buffer as Vec<String>) ──────
    pub terminal_output: HashMap<String, Vec<String>>,

    // ── Available workspaces (for dropdowns) ──────────────────────────────────
    pub available_workspaces: Vec<WorkspaceEntry>,

    // ── Provider state ────────────────────────────────────────────────────────
    pub preferred_cli_provider: CliProvider,
    pub gemini_key_present: bool,
    pub copilot_key_present: bool,
    pub claude_key_present: bool,
    /// Transient text in the "Enter Gemini API key" input field
    pub gemini_key_input: String,
    pub approval_provider_chooser_enabled: bool,
    pub autonomy_mode_selector_visible: bool,
    pub run_commands_in_window: bool,

    // ── Approval dialog state ─────────────────────────────────────────────────
    pub approval_dialog: ApprovalDialogState,

    // ── Saved commands ────────────────────────────────────────────────────────
    pub saved_commands: Vec<SavedCommand>,
    pub saved_commands_workspace_id: String,
    pub saved_cmd_name_input: String,
    pub saved_cmd_input: String,

    // ── Allowlist ─────────────────────────────────────────────────────────────
    pub allowlist_patterns: Vec<AllowlistPattern>,
    pub allowlist_filter: String,
    pub allowlist_input: String,
    pub allowlist_last_op: String,
    pub allowlist_last_error: String,
    pub proposed_exact_pattern: String,
    pub proposed_general_pattern: String,
    pub proposed_risk_hint: String,
    pub proposed_allowlist_pattern: String,

    // ── System / settings ─────────────────────────────────────────────────────
    pub start_with_windows: bool,
    pub cpu_usage_percent: f64,
    pub memory_usage_mb: f64,

    // ── Session rename / path inputs ──────────────────────────────────────────
    pub session_name_input: String,
    pub workspace_path_input: String,
    pub venv_path_input: String,

    // ── Overlay state ─────────────────────────────────────────────────────────
    pub active_overlay: ActiveOverlay,

    // ── Animation ─────────────────────────────────────────────────────────────
    pub animation_running: bool,

    // ── Backend tx (for sending responses back over the TCP bridge) ───────────
    /// Not serialisable — wrapped in Option so Default can skip it.
    pub outgoing_tx: Option<tokio::sync::mpsc::UnboundedSender<OutgoingMessage>>,
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default impl
// ═══════════════════════════════════════════════════════════════════════════════

impl Default for AppState {
    fn default() -> Self {
        Self {
            // Window
            main_window_id: None,
            window_visible: true,
            quitting: false,

            // Connection
            connection_state: ConnectionState::default(),
            terminal_ws_port: 0,
            terminal_mode_label: String::from("pty-host"),

            // Pending commands
            pending_commands: Vec::new(),
            current_request_id: String::new(),

            // Current session
            current_session_id: String::new(),
            current_terminal_profile: String::new(),
            current_default_terminal_profile: String::new(),
            current_workspace_path: String::new(),
            current_venv_path: String::new(),
            current_activate_venv: false,
            current_allowlisted: false,

            // Session tabs
            session_tabs: Vec::new(),

            // Terminal output
            terminal_output: HashMap::new(),

            // Available workspaces
            available_workspaces: Vec::new(),

            // Provider state
            preferred_cli_provider: CliProvider::default(),
            gemini_key_present: false,
            copilot_key_present: false,
            claude_key_present: false,
            gemini_key_input: String::new(),
            approval_provider_chooser_enabled: true,
            autonomy_mode_selector_visible: true,
            run_commands_in_window: false,

            // Approval dialog
            approval_dialog: ApprovalDialogState::default(),

            // Saved commands
            saved_commands: Vec::new(),
            saved_commands_workspace_id: String::new(),
            saved_cmd_name_input: String::new(),
            saved_cmd_input: String::new(),

            // Allowlist
            allowlist_patterns: Vec::new(),
            allowlist_filter: String::new(),
            allowlist_input: String::new(),
            allowlist_last_op: String::new(),
            allowlist_last_error: String::new(),
            proposed_exact_pattern: String::new(),
            proposed_general_pattern: String::new(),
            proposed_risk_hint: String::new(),
            proposed_allowlist_pattern: String::new(),

            // System / settings
            start_with_windows: false,
            cpu_usage_percent: 0.0,
            memory_usage_mb: 0.0,

            // Session rename / path inputs
            session_name_input: String::new(),
            workspace_path_input: String::new(),
            venv_path_input: String::new(),

            // Overlay
            active_overlay: ActiveOverlay::default(),

            // Animation
            animation_running: false,

            // Backend tx
            outgoing_tx: None,
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Free-function stubs — init / update / view / subscription
// ═══════════════════════════════════════════════════════════════════════════════

pub fn init(port: u16, host: String) -> (AppState, iced::Task<Message>) {
    let mut state = AppState::default();
    state.terminal_ws_port = port;

    // Start the TCP backend bridge — returns the sender for outgoing messages.
    let outgoing_tx = crate::backend_bridge::start(host, port);
    state.outgoing_tx = Some(outgoing_tx);

    // Start the WebView host window (Windows-only; compiled away on other platforms).
    #[cfg(windows)]
    crate::webview_host::start(port, "Interactive Terminal");

    // Initialise the system tray icon and wire its events to a sync channel.
    let (tray_tx, tray_rx) = sync_mpsc::sync_channel::<crate::types::TrayAction>(32);
    TRAY_RX.set(Mutex::new(tray_rx)).ok();
    let icon = crate::tray::init_tray(tray_tx, state.start_with_windows);
    TRAY_ICON.set(icon).ok();

    // Kick off the two recurring poll tasks.
    let poll_task = iced::Task::perform(
        tokio::time::sleep(std::time::Duration::from_millis(50)),
        |_| Message::StatusTick,
    );
    let tray_task = iced::Task::perform(
        tokio::time::sleep(std::time::Duration::from_millis(200)),
        |_| Message::TrayPoll,
    );
    (state, iced::Task::batch(vec![poll_task, tray_task]))
}

pub fn update(state: &mut AppState, msg: Message) -> iced::Task<Message> {
    match msg {
        Message::Noop => iced::Task::none(),

        Message::ConnectionChanged(conn) => {
            state.connection_state = conn;
            iced::Task::none()
        }

        Message::SessionTabsUpdated(tabs) => {
            state.session_tabs = tabs;
            iced::Task::none()
        }

        Message::CommandReceived(cmd) => {
            state.current_request_id = cmd.request_id.clone();
            state.pending_commands.push(cmd);
            state.active_overlay = ActiveOverlay::ApprovalDialog;
            iced::Task::none()
        }

        Message::CommandCompleted { request_id, .. } => {
            state
                .pending_commands
                .retain(|c| c.request_id != request_id);
            if state.pending_commands.is_empty() {
                state.active_overlay = ActiveOverlay::None;
            }
            iced::Task::none()
        }

        Message::OutputChunk {
            session_id, line, ..
        } => {
            let buf = state
                .terminal_output
                .entry(session_id)
                .or_insert_with(Vec::new);
            buf.push(line);
            // Trim to 2 000 lines to prevent unbounded growth
            if buf.len() > 2_000 {
                let drain_to = buf.len() - 2_000;
                buf.drain(..drain_to);
            }
            iced::Task::none()
        }

        Message::WorkspaceListPush(workspaces) => {
            state.available_workspaces = workspaces;
            iced::Task::none()
        }

        Message::SavedCommandsLoaded(cmds) => {
            state.saved_commands = cmds;
            iced::Task::none()
        }

        Message::AllowlistLoaded(patterns) => {
            state.allowlist_patterns = patterns;
            iced::Task::none()
        }

        Message::BackendError(err) => {
            tracing::warn!("Backend error: {}", err);
            iced::Task::none()
        }

        Message::CrashAlert { message, log_path } => {
            state.active_overlay = ActiveOverlay::CrashAlert { message, log_path };
            iced::Task::none()
        }

        Message::DismissCrashAlert => {
            state.active_overlay = ActiveOverlay::None;
            iced::Task::none()
        }

        Message::KillSessionDone(session_id) => {
            state.session_tabs.retain(|t| t.session_id != session_id);
            state.terminal_output.remove(&session_id);
            iced::Task::none()
        }

        Message::AgentSessionLaunched {
            session_id,
            label,
            provider,
        } => {
            tracing::info!(
                "Agent session launched: {} ({}) via {}",
                session_id,
                label,
                provider
            );
            iced::Task::none()
        }

        // ── Approval dialog ──────────────────────────────────────────────────
        Message::ApprovalProviderChanged(p) => {
            state.approval_dialog.provider = p;
            iced::Task::none()
        }
        Message::ApprovalAutonomyModeChanged(m) => {
            state.approval_dialog.autonomy_mode = m;
            iced::Task::none()
        }
        Message::ApprovalSessionModeChanged(m) => {
            state.approval_dialog.session_mode = m;
            iced::Task::none()
        }
        Message::ApprovalResumeSessionIdChanged(id) => {
            state.approval_dialog.resume_session_id = id;
            iced::Task::none()
        }
        Message::ApprovalOutputFormatChanged(fmt) => {
            state.approval_dialog.output_format = fmt;
            iced::Task::none()
        }
        Message::ApprovalBudgetMaxCommandsChanged(n) => {
            state.approval_dialog.budget_max_commands = n;
            iced::Task::none()
        }
        Message::ApprovalBudgetMaxDurationChanged(n) => {
            state.approval_dialog.budget_max_duration_secs = n;
            iced::Task::none()
        }
        Message::ApprovalBudgetMaxFilesChanged(n) => {
            state.approval_dialog.budget_max_files = n;
            iced::Task::none()
        }
        Message::ApprovalTrustedScopeToggled(v) => {
            state.approval_dialog.trusted_scope_confirmed = v;
            iced::Task::none()
        }
        Message::ApprovalGeminiScreenReaderToggled(v) => {
            state.approval_dialog.gemini_screen_reader = v;
            iced::Task::none()
        }
        Message::ApprovalCopilotMinimalUiToggled(v) => {
            state.approval_dialog.copilot_minimal_ui = v;
            iced::Task::none()
        }
        Message::ApprovalDeclineReasonChanged(s) => {
            state.approval_dialog.decline_reason = s;
            iced::Task::none()
        }
        Message::ApprovalShowDeclinePrompt => {
            state.approval_dialog.showing_decline_prompt = true;
            iced::Task::none()
        }
        Message::ApprovalCancelDecline => {
            state.approval_dialog.showing_decline_prompt = false;
            iced::Task::none()
        }
        Message::ApprovalRiskTierComputed(tier) => {
            state.approval_dialog.risk_tier = tier;
            iced::Task::none()
        }
        Message::ApproveCommand { request_id } => {
            if let Some(tx) = &state.outgoing_tx {
                let d = &state.approval_dialog;
                let _ = tx.send(crate::backend_bridge::OutgoingMessage::Approve {
                    request_id: request_id.clone(),
                    autonomy_mode: d.autonomy_mode.as_str().to_string(),
                    provider: d.provider.as_str().to_string(),
                    session_mode: d.session_mode.as_str().to_string(),
                    resume_session_id: if d.resume_session_id.is_empty() {
                        None
                    } else {
                        Some(d.resume_session_id.clone())
                    },
                    output_format: d.output_format.as_str().to_string(),
                    budget_max_commands: d.budget_max_commands,
                    budget_max_duration_secs: d.budget_max_duration_secs,
                    budget_max_files: d.budget_max_files,
                    gemini_screen_reader: d.gemini_screen_reader,
                    copilot_minimal_ui: d.copilot_minimal_ui,
                });
            }
            state.pending_commands.retain(|c| c.request_id != request_id);
            if state.pending_commands.is_empty() {
                state.active_overlay = ActiveOverlay::None;
            } else {
                state.current_request_id = state.pending_commands[0].request_id.clone();
            }
            iced::Task::none()
        }
        Message::DeclineCommand { request_id } => {
            if let Some(tx) = &state.outgoing_tx {
                let reason = state.approval_dialog.decline_reason.clone();
                let _ = tx.send(crate::backend_bridge::OutgoingMessage::Decline {
                    request_id: request_id.clone(),
                    reason,
                });
            }
            state.pending_commands.retain(|c| c.request_id != request_id);
            if state.pending_commands.is_empty() {
                state.active_overlay = ActiveOverlay::None;
            } else {
                state.current_request_id = state.pending_commands[0].request_id.clone();
            }
            iced::Task::none()
        }

        // ── Session controls ─────────────────────────────────────────────────
        Message::CreateSession => iced::Task::none(),
        Message::SwitchSession(id) => {
            state.current_session_id = id;
            iced::Task::none()
        }
        Message::CloseSession(_id) => iced::Task::none(),
        Message::RenameSession { .. } => iced::Task::none(),
        Message::SessionNameInputChanged(s) => {
            state.session_name_input = s;
            iced::Task::none()
        }
        Message::WorkspacePathChanged(s) => {
            state.current_workspace_path = s.clone();
            state.workspace_path_input = s;
            iced::Task::none()
        }
        Message::VenvPathChanged(s) => {
            state.current_venv_path = s.clone();
            state.venv_path_input = s;
            iced::Task::none()
        }
        Message::ActivateVenvToggled(v) => {
            state.current_activate_venv = v;
            iced::Task::none()
        }

        // ── Provider / launch ────────────────────────────────────────────────
        Message::LaunchCli => iced::Task::none(),
        Message::ProviderChanged(p) => {
            state.preferred_cli_provider = p;
            iced::Task::none()
        }
        Message::SetGeminiApiKey(_) => iced::Task::none(),
        Message::ClearGeminiApiKey => {
            state.gemini_key_present = false;
            state.gemini_key_input.clear();
            iced::Task::none()
        }
        Message::GeminiKeyInputChanged(s) => {
            state.gemini_key_input = s;
            iced::Task::none()
        }
        Message::SetClaudeApiKey(_) => iced::Task::none(),
        Message::ClearClaudeApiKey => {
            state.claude_key_present = false;
            iced::Task::none()
        }

        // ── Saved commands ───────────────────────────────────────────────────
        Message::OpenSavedCommands => {
            state.active_overlay = ActiveOverlay::SavedCommands;
            iced::Task::none()
        }
        Message::CloseSavedCommands => {
            state.active_overlay = ActiveOverlay::None;
            iced::Task::none()
        }
        Message::ExecuteSavedCommand(_) => iced::Task::none(),
        Message::DeleteSavedCommand(id) => {
            state.saved_commands.retain(|c| c.id != id);
            iced::Task::none()
        }
        Message::SaveNewCommand { .. } => iced::Task::none(),
        Message::SavedCommandNameInputChanged(s) => {
            state.saved_cmd_name_input = s;
            iced::Task::none()
        }
        Message::SavedCommandInputChanged(s) => {
            state.saved_cmd_input = s;
            iced::Task::none()
        }

        // ── Allowlist ────────────────────────────────────────────────────────
        Message::OpenAllowlist => {
            state.active_overlay = ActiveOverlay::Allowlist;
            iced::Task::none()
        }
        Message::CloseAllowlist => {
            state.active_overlay = ActiveOverlay::None;
            iced::Task::none()
        }
        Message::AllowlistFilterChanged(s) => {
            state.allowlist_filter = s;
            iced::Task::none()
        }
        Message::AddAllowlistPattern(_) => iced::Task::none(),
        Message::RemoveAllowlistPattern(pat) => {
            state.allowlist_patterns.retain(|p| p.pattern != pat);
            iced::Task::none()
        }
        Message::DeriveAllowlistPattern(_) => iced::Task::none(),
        Message::AllowlistPatternInputChanged(s) => {
            state.allowlist_input = s;
            iced::Task::none()
        }
        Message::ConfirmProposedPattern => iced::Task::none(),
        Message::CancelProposedPattern => {
            state.proposed_allowlist_pattern.clear();
            state.proposed_exact_pattern.clear();
            state.proposed_general_pattern.clear();
            state.proposed_risk_hint.clear();
            iced::Task::none()
        }
        Message::SelectExactProposedPattern => {
            state.proposed_allowlist_pattern = state.proposed_exact_pattern.clone();
            iced::Task::none()
        }
        Message::SelectGeneralProposedPattern => {
            state.proposed_allowlist_pattern = state.proposed_general_pattern.clone();
            iced::Task::none()
        }

        // ── Provider settings ────────────────────────────────────────────────
        Message::OpenProviderSettings => {
            state.active_overlay = ActiveOverlay::ProviderSettings;
            iced::Task::none()
        }
        Message::CloseProviderSettings => {
            state.active_overlay = ActiveOverlay::None;
            iced::Task::none()
        }
        Message::DefaultTerminalProfileChanged(p) => {
            state.current_default_terminal_profile = p;
            iced::Task::none()
        }
        Message::SetStartWithWindows(v) => {
            state.start_with_windows = v;
            iced::Task::none()
        }
        Message::RunCommandsInWindowToggled(v) => {
            state.run_commands_in_window = v;
            iced::Task::none()
        }
        Message::ProviderChooserEnabledToggled(v) => {
            state.approval_provider_chooser_enabled = v;
            iced::Task::none()
        }
        Message::AutonomySelectorVisibleToggled(v) => {
            state.autonomy_mode_selector_visible = v;
            iced::Task::none()
        }

        // ── Bottom bar / output ──────────────────────────────────────────────
        Message::CopyAllOutput => iced::Task::none(),
        Message::CopyLastOutput => iced::Task::none(),
        Message::ClearOutput => {
            if !state.current_session_id.is_empty() {
                state.terminal_output.remove(&state.current_session_id);
            }
            iced::Task::none()
        }
        Message::ExportOutputText => iced::Task::none(),
        Message::ExportOutputJson => iced::Task::none(),
        Message::TerminalProfileChanged(p) => {
            state.current_terminal_profile = p;
            iced::Task::none()
        }

        // ── Window / tray ────────────────────────────────────────────────────
        Message::TrayShow => {
            state.window_visible = true;
            if let Some(id) = state.main_window_id {
                return iced::window::change_mode(id, iced::window::Mode::Windowed);
            }
            iced::Task::none()
        }
        Message::TrayToggleStartWithWindows => {
            state.start_with_windows = !state.start_with_windows;
            iced::Task::none()
        }
        Message::TrayQuit => {
            state.quitting = true;
            iced::exit()
        }
        Message::WindowCloseRequested(_id) => {
            // Minimise to tray on close rather than quitting
            state.window_visible = false;
            if let Some(id) = state.main_window_id {
                return iced::window::change_mode(id, iced::window::Mode::Hidden);
            }
            iced::Task::none()
        }
        Message::MinimizeToTray => {
            state.window_visible = false;
            if let Some(id) = state.main_window_id {
                return iced::window::change_mode(id, iced::window::Mode::Hidden);
            }
            iced::Task::none()
        }

        // ── Tick / polling ───────────────────────────────────────────────────
        Message::StatusTick => {
            use crate::backend_bridge::BackendEvent;

            // Drain all pending backend events and process them.
            let events = crate::backend_bridge::drain_events();
            let mut extra_tasks: Vec<iced::Task<Message>> = Vec::new();

            for event in events {
                match event {
                    BackendEvent::Connected => {
                        state.connection_state = ConnectionState::Connected;
                    }
                    BackendEvent::Disconnected => {
                        state.connection_state = ConnectionState::Listening;
                    }
                    BackendEvent::Message(json) => {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&json) {
                            let type_str = val["type"].as_str().unwrap_or("").to_string();
                            match type_str.as_str() {
                                "CommandRequest" => {
                                    if let Ok(cmd) =
                                        serde_json::from_value::<PendingCommand>(val)
                                    {
                                        let t = update(state, Message::CommandReceived(cmd));
                                        extra_tasks.push(t);
                                    }
                                }
                                "CommandCompleted" => {
                                    let request_id =
                                        val["requestId"].as_str().unwrap_or("").to_string();
                                    let success = val["success"].as_bool().unwrap_or(true);
                                    let t = update(
                                        state,
                                        Message::CommandCompleted { request_id, success },
                                    );
                                    extra_tasks.push(t);
                                }
                                "SessionLaunched" => {
                                    let session_id =
                                        val["sessionId"].as_str().unwrap_or("").to_string();
                                    let label =
                                        val["label"].as_str().unwrap_or("").to_string();
                                    let provider =
                                        val["provider"].as_str().unwrap_or("").to_string();
                                    let t = update(
                                        state,
                                        Message::AgentSessionLaunched {
                                            session_id,
                                            label,
                                            provider,
                                        },
                                    );
                                    extra_tasks.push(t);
                                }
                                "OutputChunk" => {
                                    let session_id =
                                        val["sessionId"].as_str().unwrap_or("").to_string();
                                    let line =
                                        val["line"].as_str().unwrap_or("").to_string();
                                    let is_stderr =
                                        val["isStderr"].as_bool().unwrap_or(false);
                                    let t = update(
                                        state,
                                        Message::OutputChunk {
                                            session_id,
                                            line,
                                            is_stderr,
                                        },
                                    );
                                    extra_tasks.push(t);
                                }
                                "SavedCommandsLoaded" => {
                                    if let Some(arr) = val["commands"].as_array() {
                                        if let Ok(cmds) = serde_json::from_value::<
                                            Vec<SavedCommand>,
                                        >(
                                            serde_json::Value::Array(arr.clone()),
                                        ) {
                                            let t = update(
                                                state,
                                                Message::SavedCommandsLoaded(cmds),
                                            );
                                            extra_tasks.push(t);
                                        }
                                    }
                                }
                                "AllowlistLoaded" => {
                                    if let Some(arr) = val["patterns"].as_array() {
                                        let patterns = arr
                                            .iter()
                                            .filter_map(|v| {
                                                v.as_str().map(|s| AllowlistPattern {
                                                    pattern: s.to_string(),
                                                    is_builtin: false,
                                                })
                                            })
                                            .collect();
                                        let t = update(
                                            state,
                                            Message::AllowlistLoaded(patterns),
                                        );
                                        extra_tasks.push(t);
                                    }
                                }
                                "WorkspaceList" => {
                                    if let Some(arr) = val["workspaces"].as_array() {
                                        if let Ok(ws) = serde_json::from_value::<
                                            Vec<WorkspaceEntry>,
                                        >(
                                            serde_json::Value::Array(arr.clone()),
                                        ) {
                                            let t = update(
                                                state,
                                                Message::WorkspaceListPush(ws),
                                            );
                                            extra_tasks.push(t);
                                        }
                                    }
                                }
                                "SessionTabsUpdated" => {
                                    if let Some(arr) = val["tabs"].as_array() {
                                        if let Ok(tabs) = serde_json::from_value::<
                                            Vec<SessionTab>,
                                        >(
                                            serde_json::Value::Array(arr.clone()),
                                        ) {
                                            let t = update(
                                                state,
                                                Message::SessionTabsUpdated(tabs),
                                            );
                                            extra_tasks.push(t);
                                        }
                                    }
                                }
                                "Error" => {
                                    let msg =
                                        val["message"].as_str().unwrap_or("unknown error").to_string();
                                    let t = update(state, Message::BackendError(msg));
                                    extra_tasks.push(t);
                                }
                                "Crash" => {
                                    let message =
                                        val["message"].as_str().unwrap_or("").to_string();
                                    let log_path =
                                        val["logPath"].as_str().unwrap_or("").to_string();
                                    let t = update(
                                        state,
                                        Message::CrashAlert { message, log_path },
                                    );
                                    extra_tasks.push(t);
                                }
                                "KillSessionDone" => {
                                    let session_id =
                                        val["sessionId"].as_str().unwrap_or("").to_string();
                                    let t = update(state, Message::KillSessionDone(session_id));
                                    extra_tasks.push(t);
                                }
                                _ => {
                                    tracing::debug!("Unhandled backend message type: {}", type_str);
                                }
                            }
                        }
                    }
                }
            }

            // Self-reschedule after 50 ms.
            extra_tasks.push(iced::Task::perform(
                tokio::time::sleep(std::time::Duration::from_millis(50)),
                |_| Message::StatusTick,
            ));
            iced::Task::batch(extra_tasks)
        }
        Message::TrayPoll => {
            // Drain tray events non-blockingly.
            if let Some(rx_mutex) = TRAY_RX.get() {
                if let Ok(rx) = rx_mutex.try_lock() {
                    while let Ok(action) = rx.try_recv() {
                        let _ = update(state, Message::TrayEvent(action));
                    }
                }
            }
            // Self-reschedule after 200 ms.
            iced::Task::perform(
                tokio::time::sleep(std::time::Duration::from_millis(200)),
                |_| Message::TrayPoll,
            )
        }
        Message::AnimationTick => iced::Task::none(),
        Message::TrayEvent(action) => match action {
            TrayAction::Show => update(state, Message::TrayShow),
            TrayAction::ToggleStartWithWindows => update(state, Message::TrayToggleStartWithWindows),
            TrayAction::Quit => update(state, Message::TrayQuit),
        },
    }
}

pub fn view(state: &AppState, _window: window::Id) -> iced::Element<'_, Message> {
    use iced::widget::{column, container, Stack};
    use iced::Length;
    use crate::ui;

    // ── Persistent chrome layers ──────────────────────────────────────────────
    let header   = ui::status_bar::view_header(state);
    let tabs     = ui::sessions_panel::view(state);
    let controls = ui::status_bar::view_session_controls(state);
    let terminal = ui::terminal_panel::view(state);
    let bottom   = ui::status_bar::view_bottom_bar(state);

    // Base layout: header / tab bar / controls / terminal / bottom bar
    let base: iced::Element<'_, Message> = column![
        header,
        tabs,
        controls,
        container(terminal)
            .width(Length::Fill)
            .height(Length::Fill),
        bottom,
    ]
    .width(Length::Fill)
    .height(Length::Fill)
    .into();

    // ── Overlay layer — composited on top of the base ─────────────────────────
    match &state.active_overlay {
        ActiveOverlay::ApprovalDialog => {
            let overlay = ui::approval_panel::view(state);
            Stack::new()
                .push(base)
                .push(
                    container(overlay)
                        .width(Length::Fill)
                        .height(Length::Fill)
                        .center_x(Length::Fill)
                        .center_y(Length::Fill),
                )
                .into()
        }
        ActiveOverlay::SavedCommands => {
            let overlay = ui::saved_commands_panel::view(state);
            Stack::new()
                .push(base)
                .push(
                    container(overlay)
                        .width(Length::Fill)
                        .height(Length::Fill)
                        .align_x(iced::alignment::Horizontal::Right)
                        .padding(16),
                )
                .into()
        }
        ActiveOverlay::ProviderSettings | ActiveOverlay::Allowlist => {
            let overlay = ui::settings_panel::view(state);
            Stack::new()
                .push(base)
                .push(
                    container(overlay)
                        .width(Length::Fill)
                        .height(Length::Fill)
                        .align_x(iced::alignment::Horizontal::Right)
                        .padding(16),
                )
                .into()
        }
        ActiveOverlay::CrashAlert { message, log_path } => {
            let alert = column![
                iced::widget::text("Application Crash").size(20),
                iced::widget::text(message.as_str()),
                iced::widget::text(format!("Log: {}", log_path)).size(11),
                iced::widget::button("Dismiss").on_press(Message::DismissCrashAlert),
            ]
            .spacing(8)
            .padding(24);

            let panel = container(alert).style(|_t: &iced::Theme| iced::widget::container::Style {
                background: Some(iced::Background::Color(iced::Color::from_rgb(
                    0.08, 0.05, 0.05,
                ))),
                border: iced::Border {
                    color: iced::Color::from_rgb(0.93, 0.27, 0.27),
                    width: 2.0,
                    radius: 8.0.into(),
                },
                ..Default::default()
            });

            Stack::new()
                .push(base)
                .push(
                    container(panel)
                        .width(Length::Fill)
                        .height(Length::Fill)
                        .center_x(Length::Fill)
                        .center_y(Length::Fill),
                )
                .into()
        }
        ActiveOverlay::None => base,
    }
}

pub fn subscription(_state: &AppState) -> iced::Subscription<Message> {
    iced::window::close_requests().map(Message::WindowCloseRequested)
}
