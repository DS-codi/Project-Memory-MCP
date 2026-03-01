#![allow(dead_code)]

use std::pin::Pin;

pub(crate) mod completed_outputs;
mod helpers;
mod initialize;
mod invokables;
mod runtime_tasks;
mod saved_commands_state;
mod session_runtime;
mod state;

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
        #[qproperty(bool, gemini_injection_requested, cxx_name = "geminiInjectionRequested")]
        #[qproperty(f64, cpu_usage_percent, cxx_name = "cpuUsagePercent")]
        #[qproperty(f64, memory_usage_mb, cxx_name = "memoryUsageMb")]
        #[qproperty(QString, pending_commands_json, cxx_name = "pendingCommandsJson")]
        #[qproperty(QString, session_tabs_json, cxx_name = "sessionTabsJson")]
        #[qproperty(QString, tray_icon_url, cxx_name = "trayIconUrl")]
        #[qproperty(i32, terminal_ws_port, cxx_name = "terminalWsPort")]
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

        #[qinvokable]
        #[cxx_name = "approveCommand"]
        fn approve_command(self: Pin<&mut TerminalApp>, id: QString);

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
    }

    impl cxx_qt::Initialize for TerminalApp {}
    impl cxx_qt::Threading for TerminalApp {}
}

pub(crate) use helpers::{
    monotonic_millis, saved_command_to_record, terminal_profile_from_key, terminal_profile_to_key,
    timestamp_now,
};
pub(crate) use session_runtime::{
    AppState, SessionRuntimeContext, SessionTabView, TerminalAppRust, UseSavedCommandResult,
};

#[cfg(test)]
mod tests;
