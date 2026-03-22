use std::pin::Pin;

pub(crate) type TerminalAppRust = super::TerminalAppRust;

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
        #[qproperty(QString, current_workspace_path, cxx_name = "currentWorkspacePath")]
        #[qproperty(QString, current_venv_path, cxx_name = "currentVenvPath")]
        #[qproperty(bool, current_activate_venv, cxx_name = "currentActivateVenv")]
        #[qproperty(bool, current_allowlisted, cxx_name = "currentAllowlisted")]
        #[qproperty(bool, start_with_windows, cxx_name = "startWithWindows")]
        #[qproperty(f64, cpu_usage_percent, cxx_name = "cpuUsagePercent")]
        #[qproperty(f64, memory_usage_mb, cxx_name = "memoryUsageMb")]
        #[qproperty(QString, pending_commands_json, cxx_name = "pendingCommandsJson")]
        #[qproperty(QString, session_tabs_json, cxx_name = "sessionTabsJson")]
        #[qproperty(QString, tray_icon_url, cxx_name = "trayIconUrl")]
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

        /// Emitted when the pty-host process disconnects or crashes unexpectedly.
        ///
        /// `message` — human-readable reason (e.g. "pty-host process disconnected").
        /// `log_path` — absolute path to the crash log file where the full event was written.
        #[qsignal]
        #[cxx_name = "crashAlert"]
        fn crash_alert(self: Pin<&mut TerminalApp>, message: QString, log_path: QString);

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
        fn rename_session(self: Pin<&mut TerminalApp>, session_id: QString, display_name: QString) -> bool;

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

        #[qinvokable]
        #[cxx_name = "refreshAllowlist"]
        fn refresh_allowlist(self: Pin<&mut TerminalApp>);

        #[qinvokable]
        #[cxx_name = "addAllowlistPattern"]
        fn add_allowlist_pattern(self: Pin<&mut TerminalApp>, pattern: QString);

        #[qinvokable]
        #[cxx_name = "removeAllowlistPattern"]
        fn remove_allowlist_pattern(self: Pin<&mut TerminalApp>, pattern: QString);

        #[qinvokable]
        #[cxx_name = "deriveAllowlistPattern"]
        fn derive_allowlist_pattern(self: Pin<&mut TerminalApp>, command: QString);

        #[qinvokable]
        #[cxx_name = "confirmAddProposedPattern"]
        fn confirm_add_proposed_pattern(self: Pin<&mut TerminalApp>);

        #[qinvokable]
        #[cxx_name = "cancelProposedPattern"]
        fn cancel_proposed_pattern(self: Pin<&mut TerminalApp>);

        #[qinvokable]
        #[cxx_name = "selectExactProposedPattern"]
        fn select_exact_proposed_pattern(self: Pin<&mut TerminalApp>);

        #[qinvokable]
        #[cxx_name = "selectGeneralProposedPattern"]
        fn select_general_proposed_pattern(self: Pin<&mut TerminalApp>);

        /// Compute the risk tier from the given autonomy mode and current bridge
        /// budget properties. Sets approvalRiskTier + approvalTrustedScopeText.
        /// Returns 1 (Low), 2 (Medium), or 3 (High).
        #[qinvokable]
        #[cxx_name = "computeApprovalRiskTier"]
        fn compute_approval_risk_tier(self: Pin<&mut TerminalApp>, autonomy_mode: QString) -> u32;
    }

    impl cxx_qt::Initialize for TerminalApp {}
    impl cxx_qt::Threading for TerminalApp {}
}
