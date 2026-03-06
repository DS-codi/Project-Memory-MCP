#![allow(dead_code)]

use std::pin::Pin;

pub(crate) mod completed_outputs;
mod helpers;
mod initialize;
mod invokables;
#[cfg(feature = "pty-host")]
pub mod pty_host_client;
mod runtime_tasks;
mod saved_commands_state;
mod allowlist_state;
mod session_runtime;
mod state;
mod window_focus;

#[cxx_qt::bridge]
pub mod ffi {
    unsafe extern "C++" {
        include!("cxx-qt-lib/qstring.h");
        type QString = cxx_qt_lib::QString;
    }

    unsafe extern "RustQt" {
        #[qobject]
        #[qml_element]
        #[qproperty(QString, command_text, cxx_name = "commandText")]
        #[qproperty(QString, working_directory, cxx_name = "workingDirectory")]
        #[qproperty(QString, context_info, cxx_name = "contextInfo")]
        #[qproperty(QString, status_text, cxx_name = "statusText")]
        #[qproperty(QString, output_text, cxx_name = "outputText")]
        #[qproperty(bool, is_connected, cxx_name = "isConnected")]
        #[qproperty(i32, pending_count, cxx_name = "pendingCount")]
        #[qproperty(QString, current_request_id, cxx_name = "currentRequestId")]
        #[qproperty(QString, current_session_id, cxx_name = "currentSessionId")]
        #[qproperty(QString, current_terminal_profile, cxx_name = "currentTerminalProfile")]
        #[qproperty(QString, current_default_terminal_profile, cxx_name = "currentDefaultTerminalProfile")]
        #[qproperty(QString, current_workspace_path, cxx_name = "currentWorkspacePath")]
        #[qproperty(QString, current_venv_path, cxx_name = "currentVenvPath")]
        #[qproperty(bool, current_activate_venv, cxx_name = "currentActivateVenv")]
        #[qproperty(bool, current_allowlisted, cxx_name = "currentAllowlisted")]
        #[qproperty(bool, start_with_windows, cxx_name = "startWithWindows")]
        #[qproperty(bool, start_visible, cxx_name = "startVisible")]
        #[qproperty(bool, run_commands_in_window, cxx_name = "runCommandsInWindow")]
        #[qproperty(bool, gemini_key_present, cxx_name = "geminiKeyPresent")]
        #[qproperty(bool, copilot_key_present, cxx_name = "copilotKeyPresent")]
        #[qproperty(bool, gemini_injection_requested, cxx_name = "geminiInjectionRequested")]
        #[qproperty(QString, preferred_cli_provider, cxx_name = "preferredCliProvider")]
        #[qproperty(bool, approval_provider_chooser_enabled, cxx_name = "approvalProviderChooserEnabled")]
        #[qproperty(bool, autonomy_mode_selector_visible, cxx_name = "autonomyModeSelectorVisible")]
        #[qproperty(f64, cpu_usage_percent, cxx_name = "cpuUsagePercent")]
        #[qproperty(f64, memory_usage_mb, cxx_name = "memoryUsageMb")]
        #[qproperty(QString, pending_commands_json, cxx_name = "pendingCommandsJson")]
        #[qproperty(QString, available_workspaces_json, cxx_name = "availableWorkspacesJson")]
        #[qproperty(QString, session_tabs_json, cxx_name = "sessionTabsJson")]
        #[qproperty(QString, tray_icon_url, cxx_name = "trayIconUrl")]
        #[qproperty(i32, terminal_ws_port, cxx_name = "terminalWsPort")]
        /// Compile-time label: "pty-host" when the pty-host feature is active,
        /// "in-process" otherwise. Read-only after init; displayed in the header bar.
        #[qproperty(QString, terminal_mode_label, cxx_name = "terminalModeLabel")]
        // ── Allowlist management (Phase 4.5) ──────────────────────────────────
        #[qproperty(QString, allowlist_patterns_json, cxx_name = "allowlistPatternsJson")]
        #[qproperty(QString, allowlist_filter, cxx_name = "allowlistFilter")]
        #[qproperty(QString, allowlist_last_error, cxx_name = "allowlistLastError")]
        #[qproperty(QString, allowlist_last_op, cxx_name = "allowlistLastOp")]
        #[qproperty(QString, proposed_allowlist_pattern, cxx_name = "proposedAllowlistPattern")]
        #[qproperty(QString, proposed_from_command, cxx_name = "proposedFromCommand")]
        #[qproperty(QString, proposed_exact_pattern, cxx_name = "proposedExactPattern")]
        #[qproperty(QString, proposed_general_pattern, cxx_name = "proposedGeneralPattern")]
        #[qproperty(QString, proposed_risk_hint, cxx_name = "proposedRiskHint")]
        // ── Approval-time session lifecycle + output format (Steps 27–28) ─────
        /// Session mode selected at approval time: "new" | "resume".
        #[qproperty(QString, approval_session_mode, cxx_name = "approvalSessionMode")]
        /// Resume session ID entered at approval time (only meaningful when
        /// approval_session_mode = "resume").
        #[qproperty(QString, approval_resume_session_id, cxx_name = "approvalResumeSessionId")]
        /// Output format selected at approval time: "text" | "json" | "stream-json".
        #[qproperty(QString, approval_output_format, cxx_name = "approvalOutputFormat")]
        // ── Risk-aware approval policy (Steps 29–31) ─────────────────────────
        /// Risk tier evaluated for the pending launch: 1 (Low) | 2 (Medium) | 3 (High).
        #[qproperty(u32, approval_risk_tier, cxx_name = "approvalRiskTier")]
        /// Whether the user has confirmed trusted-scope access for tier >= 2 launches.
        #[qproperty(bool, approval_trusted_scope_confirmed, cxx_name = "approvalTrustedScopeConfirmed")]
        /// Trusted-scope acknowledgement text (generated per tier).
        #[qproperty(QString, approval_trusted_scope_text, cxx_name = "approvalTrustedScopeText")]
        /// Autonomy budget — max commands (0 = unlimited).
        #[qproperty(u32, approval_budget_max_commands, cxx_name = "approvalBudgetMaxCommands")]
        /// Autonomy budget — max duration in seconds (0 = unlimited).
        #[qproperty(u32, approval_budget_max_duration_secs, cxx_name = "approvalBudgetMaxDurationSecs")]
        /// Autonomy budget — max files (0 = unlimited).
        #[qproperty(u32, approval_budget_max_files, cxx_name = "approvalBudgetMaxFiles")]
        // ── CLI load-reduction flags (Phase 3) ────────────────────────────────────
        /// Whether to pass `--screen-reader` to Gemini CLI at launch (default: true).
        /// Exposed in the approval dialog as an opt-out checkbox.
        #[qproperty(bool, approval_gemini_screen_reader, cxx_name = "approvalGeminiScreenReader")]
        /// Whether to request minimal UI mode for Copilot CLI at launch (default: true).
        /// Reserved for forward compatibility; no CLI flag is currently emitted.
        #[qproperty(bool, approval_copilot_minimal_ui, cxx_name = "approvalCopilotMinimalUi")]
        type TerminalApp = super::TerminalAppRust;

        #[qsignal]
        #[cxx_name = "commandReceived"]
        fn command_received(self: Pin<&mut TerminalApp>, id: QString);

        #[qsignal]
        #[cxx_name = "commandCompleted"]
        fn command_completed(self: Pin<&mut TerminalApp>, id: QString, success: bool);

        #[qsignal]
        #[cxx_name = "connectionStatusChanged"]
        fn connection_status_changed(self: Pin<&mut TerminalApp>, connected: bool);

        /// Emitted when an approved super-subagent launch has been routed to
        /// a dedicated tagged tab (step 11).
        ///
        /// QML can connect to this signal to scroll to / highlight the new tab,
        /// or to show a status toast.
        #[qsignal]
        #[cxx_name = "agentSessionLaunched"]
        fn agent_session_launched(
            self: Pin<&mut TerminalApp>,
            session_id: QString,
            label: QString,
            provider: QString,
        );

        #[qinvokable]
        #[cxx_name = "approveCommand"]
        fn approve_command(self: Pin<&mut TerminalApp>, id: QString, autonomy_mode: QString);

        #[qinvokable]
        #[cxx_name = "declineCommand"]
        fn decline_command(self: Pin<&mut TerminalApp>, id: QString, reason: QString);

        #[qinvokable]
        #[cxx_name = "clearOutput"]
        fn clear_output(self: Pin<&mut TerminalApp>);

        #[qinvokable]
        #[cxx_name = "createSession"]
        fn create_session(self: Pin<&mut TerminalApp>) -> QString;

        #[qinvokable]
        #[cxx_name = "switchSession"]
        fn switch_session(self: Pin<&mut TerminalApp>, session_id: QString) -> bool;

        #[qinvokable]
        #[cxx_name = "closeSession"]
        fn close_session(self: Pin<&mut TerminalApp>, session_id: QString) -> bool;

        #[qinvokable]
        #[cxx_name = "renameSession"]
        fn rename_session(
            self: Pin<&mut TerminalApp>,
            session_id: QString,
            display_name: QString,
        ) -> bool;

        #[qinvokable]
        #[cxx_name = "setSessionTerminalProfile"]
        fn set_session_terminal_profile(self: Pin<&mut TerminalApp>, profile: QString) -> bool;

        #[qinvokable]
        #[cxx_name = "setDefaultTerminalProfile"]
        fn set_default_terminal_profile(self: Pin<&mut TerminalApp>, profile: QString) -> bool;

        #[qinvokable]
        #[cxx_name = "setSessionWorkspacePath"]
        fn set_session_workspace_path(self: Pin<&mut TerminalApp>, workspace_path: QString);

        #[qinvokable]
        #[cxx_name = "setSessionVenvPath"]
        fn set_session_venv_path(self: Pin<&mut TerminalApp>, venv_path: QString);

        #[qinvokable]
        #[cxx_name = "setSessionActivateVenv"]
        fn set_session_activate_venv(self: Pin<&mut TerminalApp>, activate: bool);

        #[qinvokable]
        #[cxx_name = "setStartWithWindowsEnabled"]
        fn set_start_with_windows_enabled(self: Pin<&mut TerminalApp>, enabled: bool) -> bool;

        #[qinvokable]
        #[cxx_name = "setGeminiApiKey"]
        fn set_gemini_api_key(self: Pin<&mut TerminalApp>, api_key: QString) -> bool;

        #[qinvokable]
        #[cxx_name = "clearGeminiApiKey"]
        fn clear_gemini_api_key(self: Pin<&mut TerminalApp>) -> bool;

        #[qinvokable]
        #[cxx_name = "launchGeminiSession"]
        fn launch_gemini_session(self: Pin<&mut TerminalApp>) -> bool;

        #[qinvokable]
        #[cxx_name = "launchGeminiInTab"]
        fn launch_gemini_in_tab(self: Pin<&mut TerminalApp>) -> bool;

        #[qinvokable]
        #[cxx_name = "launchCopilotInTab"]
        fn launch_copilot_in_tab(self: Pin<&mut TerminalApp>) -> bool;

        #[qinvokable]
        #[cxx_name = "openSavedCommands"]
        fn open_saved_commands(self: Pin<&mut TerminalApp>, workspace_id: QString) -> bool;

        #[qinvokable]
        #[cxx_name = "savedCommandsJson"]
        fn saved_commands_json(self: &TerminalApp) -> QString;

        #[qinvokable]
        #[cxx_name = "savedCommandsWorkspaceId"]
        fn saved_commands_workspace_id(self: &TerminalApp) -> QString;

        #[qinvokable]
        #[cxx_name = "reopenSavedCommands"]
        fn reopen_saved_commands(self: Pin<&mut TerminalApp>) -> bool;

        #[qinvokable]
        #[cxx_name = "saveSavedCommand"]
        fn save_saved_command(
            self: Pin<&mut TerminalApp>,
            name: QString,
            command: QString,
        ) -> bool;

        #[qinvokable]
        #[cxx_name = "deleteSavedCommand"]
        fn delete_saved_command(self: Pin<&mut TerminalApp>, command_id: QString) -> bool;

        #[qinvokable]
        #[cxx_name = "executeSavedCommand"]
        fn execute_saved_command(self: Pin<&mut TerminalApp>, command_id: QString) -> bool;

        #[qinvokable]
        #[cxx_name = "runCommand"]
        fn run_command(self: Pin<&mut TerminalApp>, command: QString) -> bool;

        #[qinvokable]
        #[cxx_name = "showSessionStartup"]
        fn show_session_startup(self: Pin<&mut TerminalApp>);

        #[qinvokable]
        #[cxx_name = "exportOutputText"]
        fn export_output_text(self: Pin<&mut TerminalApp>, directory: QString) -> bool;

        #[qinvokable]
        #[cxx_name = "exportOutputJson"]
        fn export_output_json(self: Pin<&mut TerminalApp>, directory: QString) -> bool;

        #[qinvokable]
        #[cxx_name = "copyCurrentOutput"]
        fn copy_current_output(self: Pin<&mut TerminalApp>) -> bool;

        #[qinvokable]
        #[cxx_name = "copyLastCommandOutput"]
        fn copy_last_command_output(self: Pin<&mut TerminalApp>) -> bool;

        #[qinvokable]
        #[cxx_name = "approvalProviderPrefillPolicy"]
        fn approval_provider_prefill_policy(
            self: &TerminalApp,
            provider_policy_applies: bool,
            preferred_provider: QString,
        ) -> QString;

        // ── Allowlist management (Phase 4.5) ──────────────────────────────────

        /// Reload allowlist patterns from disk and update `allowlistPatternsJson`.
        #[qinvokable]
        #[cxx_name = "refreshAllowlist"]
        fn refresh_allowlist(self: Pin<&mut TerminalApp>);

        /// Add a pattern to the allowlist. Returns true on success.
        #[qinvokable]
        #[cxx_name = "addAllowlistPattern"]
        fn add_allowlist_pattern(self: Pin<&mut TerminalApp>, pattern: QString) -> bool;

        /// Remove a pattern from the allowlist. Returns true on success.
        #[qinvokable]
        #[cxx_name = "removeAllowlistPattern"]
        fn remove_allowlist_pattern(self: Pin<&mut TerminalApp>, pattern: QString) -> bool;

        /// Derive exact + generalized patterns from a saved command and set the
        /// `proposedExactPattern`, `proposedGeneralPattern`, `proposedRiskHint`,
        /// `proposedAllowlistPattern` (defaults to exact), and `proposedFromCommand`.
        #[qinvokable]
        #[cxx_name = "deriveAllowlistPattern"]
        fn derive_allowlist_pattern(self: Pin<&mut TerminalApp>, command: QString);

        /// Confirm adding the currently selected `proposedAllowlistPattern`. Returns true on success.
        #[qinvokable]
        #[cxx_name = "confirmAddProposedPattern"]
        fn confirm_add_proposed_pattern(self: Pin<&mut TerminalApp>) -> bool;

        /// Cancel the pending allowlist proposal.
        #[qinvokable]
        #[cxx_name = "cancelProposedPattern"]
        fn cancel_proposed_pattern(self: Pin<&mut TerminalApp>);

        /// Select the exact (low-risk) pattern as the active proposal.
        #[qinvokable]
        #[cxx_name = "selectExactProposedPattern"]
        fn select_exact_proposed_pattern(self: Pin<&mut TerminalApp>);

        /// Select the generalized (wider) pattern as the active proposal.
        #[qinvokable]
        #[cxx_name = "selectGeneralProposedPattern"]
        fn select_general_proposed_pattern(self: Pin<&mut TerminalApp>);

        // ── Approval-time session lifecycle + output format (Steps 27–28) ─────
        // The approval_* Q_PROPERTYs expose auto-generated WRITE setters to QML.
        // QML sets them with direct property assignment:
        //   terminalApp.approvalSessionMode = "resume"
        // No separate invokable setter is needed or permitted (it would collide
        // with the auto-generated set_approval_* Rust function).

        // ── Risk-aware approval policy invokables (Steps 29–31) ──────────────

        /// Compute the risk tier from the given autonomy mode and the current
        /// bridge budget properties (approvalBudgetMaxCommands, etc.).
        /// Sets `approvalRiskTier` and `approvalTrustedScopeText` on the bridge
        /// and returns the tier (1 = Low, 2 = Medium, 3 = High).
        #[qinvokable]
        #[cxx_name = "computeApprovalRiskTier"]
        fn compute_approval_risk_tier(self: Pin<&mut TerminalApp>, autonomy_mode: QString) -> u32;
    }

    impl cxx_qt::Initialize for TerminalApp {}
    impl cxx_qt::Threading for TerminalApp {}
}

pub(crate) use helpers::{
    default_workspace_path, monotonic_millis, saved_command_to_record, terminal_profile_from_key,
    terminal_profile_to_key, timestamp_now,
};
pub(crate) use session_runtime::{
    AgentSessionMeta, AppState, SessionLifecycleState, SessionRuntimeContext, SessionTabView,
    TerminalAppRust, UseSavedCommandResult,
};

#[cfg(test)]
mod tests;
