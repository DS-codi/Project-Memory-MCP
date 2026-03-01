use crate::cxxqt_bridge::completed_outputs::OutputTracker;
use crate::protocol::CommandRequest;
use crate::protocol::TerminalProfile;
use crate::saved_commands::WorkspaceSavedCommands;
use crate::saved_commands_repository::SavedCommandsRepository;
use cxx_qt_lib::QString;
use serde::Serialize;
use std::collections::HashMap;
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
    pub(crate) gemini_injection_requested: bool,
    pub(crate) cpu_usage_percent: f64,
    pub(crate) memory_usage_mb: f64,
    pub(crate) pending_commands_json: QString,
    pub(crate) available_workspaces_json: QString,
    pub(crate) session_tabs_json: QString,
    pub(crate) tray_icon_url: QString,
    pub(crate) terminal_ws_port: i32,
    pub(crate) state: Arc<Mutex<AppState>>,
}

pub struct AppState {
    pub pending_commands_by_session: HashMap<String, Vec<CommandRequest>>,
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
        let tray_settings = crate::system_tray::load_settings();
        let gemini_key_present = tray_settings
            .gemini_api_key
            .as_ref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false);

        let state = Arc::new(Mutex::new(AppState {
            pending_commands_by_session: HashMap::from([("default".to_string(), Vec::new())]),
            session_display_names: HashMap::from([("default".to_string(), "default".to_string())]),
            session_context_by_id: HashMap::from([(
                "default".to_string(),
                SessionRuntimeContext {
                    selected_terminal_profile: default_terminal_profile.clone(),
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
            current_workspace_path: QString::default(),
            current_venv_path: QString::default(),
            current_activate_venv: false,
            current_allowlisted: false,
            start_with_windows: tray_settings.start_with_windows,
            start_visible: true,
            run_commands_in_window: false,
            gemini_key_present,
            gemini_injection_requested: false,
            cpu_usage_percent: 0.0,
            memory_usage_mb: 0.0,
            pending_commands_json: QString::from("[]"),
            available_workspaces_json: QString::from("[]"),
            session_tabs_json,
            tray_icon_url: resolve_tray_icon_url(),
            terminal_ws_port: 0,
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
