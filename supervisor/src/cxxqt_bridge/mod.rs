pub mod initialize;
pub use initialize::SUPERVISOR_QT;
pub use initialize::SHUTDOWN_TX;

use cxx_qt::CxxQtType;
use cxx_qt_lib::QString;
use std::pin::Pin;

#[cfg(windows)]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    FindWindowW, SetForegroundWindow, ShowWindow, SW_RESTORE,
};

#[cfg(windows)]
fn show_existing_interactive_terminal_window() -> bool {
    let mut title: Vec<u16> = "Interactive Terminal".encode_utf16().collect();
    title.push(0);

    let hwnd = unsafe { FindWindowW(std::ptr::null(), title.as_ptr()) };
    if hwnd.is_null() {
        return false;
    }

    unsafe {
        ShowWindow(hwnd, SW_RESTORE);
        SetForegroundWindow(hwnd);
    }
    true
}

#[cxx_qt::bridge]
pub mod ffi {
    unsafe extern "C++" {
        include!("cxx-qt-lib/qstring.h");
        type QString = cxx_qt_lib::QString;
    }

    unsafe extern "RustQt" {
        #[qobject]
        #[qml_element]
        #[qproperty(bool, window_visible, cxx_name = "windowVisible")]
        #[qproperty(QString, status_text, cxx_name = "statusText")]
        #[qproperty(QString, tray_icon_url, cxx_name = "trayIconUrl")]
        #[qproperty(QString, mcp_status, cxx_name = "mcpStatus")]
        #[qproperty(QString, terminal_status, cxx_name = "terminalStatus")]
        #[qproperty(QString, dashboard_status, cxx_name = "dashboardStatus")]
        #[qproperty(QString, fallback_status, cxx_name = "fallbackStatus")]
        #[qproperty(QString, dashboard_url, cxx_name = "dashboardUrl")]
        #[qproperty(QString, terminal_url, cxx_name = "terminalUrl")]
        #[qproperty(i32, total_mcp_connections, cxx_name = "totalMcpConnections")]
        #[qproperty(i32, active_mcp_instances, cxx_name = "activeMcpInstances")]
        #[qproperty(QString, mcp_instance_distribution, cxx_name = "mcpInstanceDistribution")]
        #[qproperty(i32, event_subscriber_count, cxx_name = "eventSubscriberCount")]
        #[qproperty(bool, event_broadcast_enabled, cxx_name = "eventBroadcastEnabled")]
        #[qproperty(i32, events_total_emitted, cxx_name = "eventsTotalEmitted")]
        #[qproperty(QString, action_feedback, cxx_name = "actionFeedback")]
        #[qproperty(QString, config_editor_error, cxx_name = "configEditorError")]
        #[qproperty(bool, quitting)]
        // Per-service enrichment: port, runtime label, OS PID, uptime seconds
        #[qproperty(i32, mcp_port, cxx_name = "mcpPort")]
        #[qproperty(QString, mcp_runtime, cxx_name = "mcpRuntime")]
        #[qproperty(i32, mcp_pid, cxx_name = "mcpPid")]
        #[qproperty(i32, mcp_uptime_secs, cxx_name = "mcpUptimeSecs")]
        #[qproperty(i32, terminal_port, cxx_name = "terminalPort")]
        #[qproperty(QString, terminal_runtime, cxx_name = "terminalRuntime")]
        #[qproperty(i32, terminal_pid, cxx_name = "terminalPid")]
        #[qproperty(i32, terminal_uptime_secs, cxx_name = "terminalUptimeSecs")]
        #[qproperty(i32, dashboard_port, cxx_name = "dashboardPort")]
        #[qproperty(QString, dashboard_runtime, cxx_name = "dashboardRuntime")]
        #[qproperty(i32, dashboard_pid, cxx_name = "dashboardPid")]
        #[qproperty(i32, dashboard_uptime_secs, cxx_name = "dashboardUptimeSecs")]
        type SupervisorGuiBridge = super::SupervisorGuiBridgeRust;

        #[qinvokable]
        #[cxx_name = "showWindow"]
        fn show_window(self: Pin<&mut SupervisorGuiBridge>);

        #[qinvokable]
        #[cxx_name = "hideWindow"]
        fn hide_window(self: Pin<&mut SupervisorGuiBridge>);

        /// Graceful quit: signals the Tokio runtime to stop all child services
        /// before the process exits.  Use instead of Qt.quit() from QML so
        /// that child processes (Node, Vite, etc.) are always terminated.
        #[qinvokable]
        #[cxx_name = "quitSupervisor"]
        fn quit_supervisor(self: Pin<&mut SupervisorGuiBridge>);

        /// Open the dashboard URL in the system default browser.
        #[qinvokable]
        #[cxx_name = "openDashboard"]
        fn open_dashboard(self: Pin<&mut SupervisorGuiBridge>);

        /// Open the terminal URL in the system default browser.
        #[qinvokable]
        #[cxx_name = "openTerminal"]
        fn open_terminal(self: Pin<&mut SupervisorGuiBridge>);

        /// Send a restart request for the named service into the restart channel.
        #[qinvokable]
        #[cxx_name = "restartService"]
        fn restart_service(self: Pin<&mut SupervisorGuiBridge>, service: &QString);

        /// Send a stop request for the named service into the restart channel.
        #[qinvokable]
        #[cxx_name = "stopService"]
        fn stop_service(self: Pin<&mut SupervisorGuiBridge>, service: &QString);

        /// Send a start request for the named service into the restart channel.
        #[qinvokable]
        #[cxx_name = "startService"]
        fn start_service(self: Pin<&mut SupervisorGuiBridge>, service: &QString);

        /// Open the supervisor config file in the system default editor.
        #[qinvokable]
        #[cxx_name = "openConfig"]
        fn open_config(self: Pin<&mut SupervisorGuiBridge>);

        /// Load the raw TOML text of the config file into the in-app editor.
        /// Sets `configEditorError` on failure; returns the raw TOML on success.
        #[qinvokable]
        #[cxx_name = "loadConfigToml"]
        fn load_config_toml(self: Pin<&mut SupervisorGuiBridge>) -> QString;

        /// Validate and save new TOML content back to the config file.
        /// Returns `true` on success; sets `configEditorError` and returns `false` on failure.
        #[qinvokable]
        #[cxx_name = "saveConfigToml"]
        fn save_config_toml(self: Pin<&mut SupervisorGuiBridge>, content: &QString) -> bool;

        /// Load supervisor.toml serialised as JSON for the structured settings panel.
        #[qinvokable]
        #[cxx_name = "loadSettingsJson"]
        fn load_settings_json(self: Pin<&mut SupervisorGuiBridge>) -> QString;

        /// Apply a JSON delta onto supervisor.toml, preserving any un-shown fields.
        /// Returns `true` on success; sets `configEditorError` and returns `false` on failure.
        #[qinvokable]
        #[cxx_name = "saveSettingsJson"]
        fn save_settings_json(self: Pin<&mut SupervisorGuiBridge>, json: &QString) -> bool;

        /// Read VS Code user settings.json and return `projectMemory.*` / `supervisor.*`
        /// keys as a flat JSON object.  Returns `"{}"` when VS Code is not detected.
        #[qinvokable]
        #[cxx_name = "loadVscodeSettingsJson"]
        fn load_vscode_settings_json(self: Pin<&mut SupervisorGuiBridge>) -> QString;

        /// Merge a flat JSON object into VS Code user settings.json.
        /// Best-effort: returns `false` on hard I/O errors, sets `configEditorError`.
        #[qinvokable]
        #[cxx_name = "saveVscodeSettingsJson"]
        fn save_vscode_settings_json(self: Pin<&mut SupervisorGuiBridge>, json: &QString) -> bool;
    }

    impl cxx_qt::Initialize for SupervisorGuiBridge {}
    impl cxx_qt::Threading for SupervisorGuiBridge {}
}

pub struct SupervisorGuiBridgeRust {
    pub window_visible: bool,
    pub status_text: QString,
    pub tray_icon_url: QString,
    /// Per-service status strings pushed from the Tokio runtime.
    pub mcp_status: QString,
    pub terminal_status: QString,
    pub dashboard_status: QString,
    pub fallback_status: QString,
    /// URLs pushed from main.rs after config loads.
    pub dashboard_url: QString,
    pub terminal_url: QString,
    /// MCP proxy-monitoring counters/summary pushed from runtime.
    pub total_mcp_connections: i32,
    pub active_mcp_instances: i32,
    pub mcp_instance_distribution: QString,
    /// Event broadcast channel stats pushed from runtime.
    pub event_subscriber_count: i32,
    pub event_broadcast_enabled: bool,
    pub events_total_emitted: i32,
    /// Last user-action result from QML invokables (restart/open errors, etc.).
    pub action_feedback: QString,
    /// Channel for requesting a service restart from QML.
    /// Set by main.rs after the Tokio runtime and service channels are ready.
    pub restart_tx: Option<tokio::sync::mpsc::Sender<String>>,
    /// Absolute path to the supervisor config file.
    /// Set by main.rs after config is loaded so `openConfig` can open it.
    pub config_path: Option<String>,
    /// Error message from the last `loadConfigToml` / `saveConfigToml` call.
    pub config_editor_error: QString,
    /// Set to `true` just before the process exits so QML can hide the system
    /// tray icon (calling NIM_DELETE) before `std::process::exit` is reached.
    pub quitting: bool,
    // Per-service enrichment
    pub mcp_port: i32,
    pub mcp_runtime: QString,
    pub mcp_pid: i32,
    pub mcp_uptime_secs: i32,
    pub terminal_port: i32,
    pub terminal_runtime: QString,
    pub terminal_pid: i32,
    pub terminal_uptime_secs: i32,
    pub dashboard_port: i32,
    pub dashboard_runtime: QString,
    pub dashboard_pid: i32,
    pub dashboard_uptime_secs: i32,
}

impl Default for SupervisorGuiBridgeRust {
    fn default() -> Self {
        Self {
            window_visible: false,
            status_text: QString::from("Supervisor starting"),
            tray_icon_url: QString::default(),
            mcp_status: QString::from("Starting\u{2026}"),
            terminal_status: QString::from("Starting\u{2026}"),
            dashboard_status: QString::from("Starting\u{2026}"),
            fallback_status: QString::from("Starting\u{2026}"),
            dashboard_url: QString::default(),
            terminal_url: QString::default(),
            total_mcp_connections: 0,
            active_mcp_instances: 0,
            mcp_instance_distribution: QString::default(),
            event_subscriber_count: 0,
            event_broadcast_enabled: false,
            events_total_emitted: 0,
            action_feedback: QString::default(),
            restart_tx: None,
            config_path: None,
            config_editor_error: QString::default(),
            quitting: false,
            mcp_port: 0,
            mcp_runtime: QString::from("Node"),
            mcp_pid: 0,
            mcp_uptime_secs: 0,
            terminal_port: 0,
            terminal_runtime: QString::from("Rust"),
            terminal_pid: 0,
            terminal_uptime_secs: 0,
            dashboard_port: 0,
            dashboard_runtime: QString::from("Node"),
            dashboard_pid: 0,
            dashboard_uptime_secs: 0,
        }
    }
}

// ── Settings helpers ───────────────────────────────────────────────────────────

/// Recursively merge JSON `source` delta onto `target` TOML value.
/// Table entries in `source` overwrite matching keys; all other keys are preserved.
fn merge_json_into_toml(target: &mut toml::Value, source: &serde_json::Value) {
    match (target, source) {
        (toml::Value::Table(t), serde_json::Value::Object(m)) => {
            for (key, val) in m {
                if let Some(existing) = t.get_mut(key) {
                    merge_json_into_toml(existing, val);
                } else if let Some(tv) = json_to_toml(val) {
                    t.insert(key.clone(), tv);
                }
            }
        }
        (target, source) => {
            if let Some(tv) = json_to_toml(source) {
                *target = tv;
            }
        }
    }
}

fn json_to_toml(v: &serde_json::Value) -> Option<toml::Value> {
    match v {
        serde_json::Value::Bool(b) => Some(toml::Value::Boolean(*b)),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Some(toml::Value::Integer(i))
            } else {
                n.as_f64().map(toml::Value::Float)
            }
        }
        serde_json::Value::String(s) => Some(toml::Value::String(s.clone())),
        serde_json::Value::Array(a) => {
            let items: Vec<toml::Value> = a.iter().filter_map(json_to_toml).collect();
            Some(toml::Value::Array(items))
        }
        serde_json::Value::Object(m) => {
            let mut table = toml::map::Map::new();
            for (k, v) in m {
                if let Some(tv) = json_to_toml(v) {
                    table.insert(k.clone(), tv);
                }
            }
            Some(toml::Value::Table(table))
        }
        serde_json::Value::Null => None,
    }
}

/// Locate the VS Code user settings.json on Windows (checks both stable and Insiders).
/// Returns the stable path even when it does not exist yet (so saves can create it).
fn vscode_settings_path() -> Option<std::path::PathBuf> {
    let appdata = std::env::var("APPDATA").ok()?;
    let primary = std::path::PathBuf::from(&appdata)
        .join("Code").join("User").join("settings.json");
    if primary.exists() {
        return Some(primary);
    }
    let insiders = std::path::PathBuf::from(&appdata)
        .join("Code - Insiders").join("User").join("settings.json");
    if insiders.exists() {
        return Some(insiders);
    }
    // Return stable path so saves can create the file.
    Some(std::path::PathBuf::from(&appdata)
        .join("Code").join("User").join("settings.json"))
}

// ── Bridge implementation ───────────────────────────────────────────────────────

impl ffi::SupervisorGuiBridge {
    pub fn show_window(mut self: Pin<&mut Self>) {
        self.as_mut().set_window_visible(true);
    }

    pub fn hide_window(mut self: Pin<&mut Self>) {
        self.as_mut().set_window_visible(false);
    }

    pub fn quit_supervisor(self: Pin<&mut Self>) {
        if let Some(tx) = initialize::SHUTDOWN_TX.get() {
            // Signal the Tokio runtime; it will stop all child services and
            // then call std::process::exit(0) itself.
            let _ = tx.send(true);
        } else {
            // Shutdown channel not yet registered (config load failed) —
            // exit immediately rather than leaving orphaned child processes.
            std::process::exit(0);
        }
    }

    pub fn open_dashboard(self: Pin<&mut Self>) {
        let url = self.dashboard_url().to_string();
        if !url.is_empty() {
            let _ = std::process::Command::new("cmd")
                .args(["/C", "start", "", &url])
                .spawn();
        }
    }

    pub fn open_terminal(self: Pin<&mut Self>) {
        #[cfg(windows)]
        if show_existing_interactive_terminal_window() {
            return;
        }

        // Launch the interactive-terminal GUI — it lives next to this executable.
        if let Ok(mut path) = std::env::current_exe() {
            path.pop();
            #[cfg(windows)]
            path.push("interactive-terminal.exe");
            #[cfg(not(windows))]
            path.push("interactive-terminal");
            if path.exists() {
                let _ = std::process::Command::new(&path)
                    .arg("--show")
                    .spawn();
            }
        }
    }

    pub fn stop_service(mut self: Pin<&mut Self>, service: &QString) {
        let service_name = format!("stop:{}", service.to_string());
        if let Some(tx) = self.rust().restart_tx.as_ref() {
            match tx.try_send(service_name.clone()) {
                Ok(()) => {
                    self.as_mut().set_action_feedback(QString::from(
                        &format!("Stop requested: {}", &service_name[5..]),
                    ));
                }
                Err(_) => {
                    self.as_mut().set_action_feedback(QString::from(
                        "Stop request failed. Please try again.",
                    ));
                }
            }
        }
    }

    pub fn start_service(mut self: Pin<&mut Self>, service: &QString) {
        let service_name = format!("start:{}", service.to_string());
        if let Some(tx) = self.rust().restart_tx.as_ref() {
            match tx.try_send(service_name.clone()) {
                Ok(()) => {
                    self.as_mut().set_action_feedback(QString::from(
                        &format!("Start requested: {}", &service_name[6..]),
                    ));
                }
                Err(_) => {
                    self.as_mut().set_action_feedback(QString::from(
                        "Start request failed. Please try again.",
                    ));
                }
            }
        }
    }

    pub fn restart_service(mut self: Pin<&mut Self>, service: &QString) {
        let service_name = service.to_string();
        if let Some(tx) = self.rust().restart_tx.as_ref() {
            match tx.try_send(service_name.clone()) {
                Ok(()) => {
                    self.as_mut().set_action_feedback(QString::from(
                        &format!("Restart requested: {service_name}"),
                    ));
                }
                Err(tokio::sync::mpsc::error::TrySendError::Full(_)) => {
                    self.as_mut().set_action_feedback(QString::from(
                        "Restart request queue is busy. Please try again.",
                    ));
                }
                Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => {
                    self.as_mut().set_action_feedback(QString::from(
                        "Restart channel is unavailable. Supervisor may be shutting down.",
                    ));
                }
            }
        } else {
            self.as_mut().set_action_feedback(QString::from(
                "Restart channel is not initialized yet.",
            ));
        }
    }

    pub fn open_config(self: Pin<&mut Self>) {
        if let Some(path) = self.rust().config_path.as_deref() {
            let _ = std::process::Command::new("cmd")
                .args(["/C", "start", "", path])
                .spawn();
        }
    }

    pub fn load_config_toml(mut self: Pin<&mut Self>) -> QString {
        let path = self.rust().config_path.clone();
        match path {
            None => {
                self.as_mut()
                    .set_config_editor_error(QString::from("Config path not set"));
                QString::default()
            }
            Some(p) => match std::fs::read_to_string(&p) {
                Ok(content) => {
                    self.as_mut().set_config_editor_error(QString::default());
                    QString::from(&content)
                }
                Err(e) => {
                    self.as_mut().set_config_editor_error(QString::from(
                        &format!("Failed to read config: {e}"),
                    ));
                    QString::default()
                }
            },
        }
    }

    pub fn save_config_toml(mut self: Pin<&mut Self>, content: &QString) -> bool {
        let text = content.to_string();
        // Validate the TOML is parseable before touching the file.
        if let Err(e) = toml::from_str::<crate::config::SupervisorConfig>(&text) {
            self.as_mut().set_config_editor_error(QString::from(
                &format!("Parse error: {e}"),
            ));
            return false;
        }
        let path = self.rust().config_path.clone();
        match path {
            None => {
                self.as_mut()
                    .set_config_editor_error(QString::from("Config path not set"));
                false
            }
            Some(p) => match std::fs::write(&p, &text) {
                Ok(()) => {
                    self.as_mut().set_config_editor_error(QString::default());
                    true
                }
                Err(e) => {
                    self.as_mut().set_config_editor_error(QString::from(
                        &format!("Failed to save config: {e}"),
                    ));
                    false
                }
            },
        }
    }

    /// Push port/runtime/pid/uptime for a named service.
    /// `service` must be "mcp", "terminal", or "dashboard".
    pub fn push_service_info(
        mut self: Pin<&mut Self>,
        service: &str,
        port: i32,
        runtime: &str,
        pid: i32,
        uptime_secs: i32,
    ) {
        match service {
            "mcp" => {
                self.as_mut().set_mcp_port(port);
                self.as_mut().set_mcp_runtime(QString::from(runtime));
                self.as_mut().set_mcp_pid(pid);
                self.as_mut().set_mcp_uptime_secs(uptime_secs);
            }
            "terminal" => {
                self.as_mut().set_terminal_port(port);
                self.as_mut().set_terminal_runtime(QString::from(runtime));
                self.as_mut().set_terminal_pid(pid);
                self.as_mut().set_terminal_uptime_secs(uptime_secs);
            }
            "dashboard" => {
                self.as_mut().set_dashboard_port(port);
                self.as_mut().set_dashboard_runtime(QString::from(runtime));
                self.as_mut().set_dashboard_pid(pid);
                self.as_mut().set_dashboard_uptime_secs(uptime_secs);
            }
            _ => {}
        }
    }

    pub fn load_settings_json(mut self: Pin<&mut Self>) -> QString {
        let path = match self.rust().config_path.clone() {
            None => {
                self.as_mut().set_config_editor_error(QString::from("Config path not set"));
                return QString::default();
            }
            Some(p) => p,
        };
        let raw = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(e) => {
                self.as_mut().set_config_editor_error(QString::from(&format!("Read error: {e}")));
                return QString::default();
            }
        };
        let val: toml::Value = match toml::from_str(&raw) {
            Ok(v) => v,
            Err(e) => {
                self.as_mut().set_config_editor_error(QString::from(&format!("Parse error: {e}")));
                return QString::default();
            }
        };
        match serde_json::to_string(&val) {
            Ok(json) => {
                self.as_mut().set_config_editor_error(QString::default());
                QString::from(&json)
            }
            Err(e) => {
                self.as_mut().set_config_editor_error(QString::from(&format!("JSON error: {e}")));
                QString::default()
            }
        }
    }

    pub fn save_settings_json(mut self: Pin<&mut Self>, json: &QString) -> bool {
        let json_val: serde_json::Value = match serde_json::from_str(&json.to_string()) {
            Ok(v) => v,
            Err(e) => {
                self.as_mut().set_config_editor_error(QString::from(&format!("JSON parse error: {e}")));
                return false;
            }
        };
        let path = match self.rust().config_path.clone() {
            None => {
                self.as_mut().set_config_editor_error(QString::from("Config path not set"));
                return false;
            }
            Some(p) => p,
        };
        let existing = std::fs::read_to_string(&path).unwrap_or_default();
        let mut toml_val: toml::Value = toml::from_str(&existing)
            .unwrap_or_else(|_| toml::Value::Table(toml::map::Map::new()));
        merge_json_into_toml(&mut toml_val, &json_val);
        let new_toml = match toml::to_string_pretty(&toml_val) {
            Ok(s) => s,
            Err(e) => {
                self.as_mut().set_config_editor_error(QString::from(&format!("Serialize error: {e}")));
                return false;
            }
        };
        if let Err(e) = toml::from_str::<crate::config::SupervisorConfig>(&new_toml) {
            self.as_mut().set_config_editor_error(QString::from(&format!("Validation error: {e}")));
            return false;
        }
        match std::fs::write(&path, &new_toml) {
            Ok(()) => {
                self.as_mut().set_config_editor_error(QString::default());
                true
            }
            Err(e) => {
                self.as_mut().set_config_editor_error(QString::from(&format!("Write error: {e}")));
                false
            }
        }
    }

    pub fn load_vscode_settings_json(self: Pin<&mut Self>) -> QString {
        let path = match vscode_settings_path() {
            None => return QString::from("{}"),
            Some(p) => p,
        };
        let raw = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(_) => return QString::from("{}"),
        };
        let all: serde_json::Value = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(_) => return QString::from("{}"),
        };
        let known_keys = [
            "projectMemory.mcpPort",
            "projectMemory.serverPort",
            "projectMemory.agentsRoot",
            "projectMemory.skillsRoot",
            "projectMemory.instructionsRoot",
            "projectMemory.notifications.enabled",
            "projectMemory.notifications.agentHandoffs",
            "projectMemory.notifications.planComplete",
            "projectMemory.notifications.stepBlocked",
            "projectMemory.dashboard.enabled",
            "projectMemory.autoDeployOnWorkspaceOpen",
            "projectMemory.autoDeploySkills",
            "projectMemory.containerMode",
            "supervisor.startupMode",
            "supervisor.launcherPath",
            "supervisor.detectTimeoutMs",
            "supervisor.startupTimeoutMs",
        ];
        let mut out = serde_json::Map::new();
        if let serde_json::Value::Object(map) = &all {
            for key in &known_keys {
                if let Some(val) = map.get(*key) {
                    out.insert((*key).to_string(), val.clone());
                }
            }
        }
        match serde_json::to_string(&serde_json::Value::Object(out)) {
            Ok(s) => QString::from(&s),
            Err(_) => QString::from("{}"),
        }
    }

    pub fn save_vscode_settings_json(mut self: Pin<&mut Self>, json: &QString) -> bool {
        let incoming: serde_json::Value = match serde_json::from_str(&json.to_string()) {
            Ok(v) => v,
            Err(e) => {
                self.as_mut().set_config_editor_error(QString::from(&format!("JSON parse error: {e}")));
                return false;
            }
        };
        let path = match vscode_settings_path() {
            None => {
                self.as_mut().set_config_editor_error(QString::from("VS Code settings not found"));
                return false;
            }
            Some(p) => p,
        };
        let raw = std::fs::read_to_string(&path).unwrap_or_default();
        let mut existing: serde_json::Value = serde_json::from_str(&raw)
            .unwrap_or_else(|_| serde_json::Value::Object(serde_json::Map::new()));
        if let (
            serde_json::Value::Object(eobj),
            serde_json::Value::Object(iobj),
        ) = (&mut existing, incoming)
        {
            for (k, v) in iobj {
                eobj.insert(k, v);
            }
        }
        let out = match serde_json::to_string_pretty(&existing) {
            Ok(s) => s,
            Err(e) => {
                self.as_mut().set_config_editor_error(QString::from(&format!("Serialize error: {e}")));
                return false;
            }
        };
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        match std::fs::write(&path, out) {
            Ok(()) => {
                self.as_mut().set_config_editor_error(QString::default());
                true
            }
            Err(e) => {
                self.as_mut().set_config_editor_error(QString::from(&format!("Write error: {e}")));
                false
            }
        }
    }
}