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
    pub(crate) current_workspace_path: QString,
    pub(crate) current_venv_path: QString,
    pub(crate) current_activate_venv: bool,
    pub(crate) current_allowlisted: bool,
    pub(crate) start_with_windows: bool,
    pub(crate) cpu_usage_percent: f64,
    pub(crate) memory_usage_mb: f64,
    pub(crate) pending_commands_json: QString,
    pub(crate) session_tabs_json: QString,
    pub(crate) tray_icon_url: QString,
    pub(crate) state: Arc<Mutex<AppState>>,
}

pub struct AppState {
    pub pending_commands_by_session: HashMap<String, Vec<CommandRequest>>,
    pub session_display_names: HashMap<String, String>,
    pub session_context_by_id: HashMap<String, SessionRuntimeContext>,
    pub selected_session_id: String,
    pub saved_commands_ui_workspace_id: String,
    pub saved_commands_by_workspace: HashMap<String, WorkspaceSavedCommands>,
    pub saved_commands_repository: SavedCommandsRepository,
    pub response_tx: Option<tokio::sync::mpsc::Sender<crate::protocol::Message>>,
    pub command_tx: Option<tokio::sync::mpsc::Sender<CommandRequest>>,
    pub output_tracker: OutputTracker,
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
        let state = Arc::new(Mutex::new(AppState {
            pending_commands_by_session: HashMap::from([("default".to_string(), Vec::new())]),
            session_display_names: HashMap::from([("default".to_string(), "default".to_string())]),
            session_context_by_id: HashMap::new(),
            selected_session_id: "default".to_string(),
            saved_commands_ui_workspace_id: String::new(),
            saved_commands_by_workspace: HashMap::new(),
            saved_commands_repository: SavedCommandsRepository::from_env_or_default(),
            response_tx: None,
            command_tx: None,
            output_tracker: OutputTracker::default(),
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
            current_terminal_profile: QString::from("system"),
            current_workspace_path: QString::default(),
            current_venv_path: QString::default(),
            current_activate_venv: false,
            current_allowlisted: false,
            start_with_windows: false,
            cpu_usage_percent: 0.0,
            memory_usage_mb: 0.0,
            pending_commands_json: QString::from("[]"),
            session_tabs_json,
            tray_icon_url: resolve_tray_icon_url(),
            state,
        }
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
