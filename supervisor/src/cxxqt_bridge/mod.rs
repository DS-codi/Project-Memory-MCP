pub mod initialize;
pub use initialize::SUPERVISOR_QT;
pub use initialize::SHUTDOWN_TX;

use cxx_qt::CxxQtType;
use cxx_qt_lib::QString;
use std::pin::Pin;

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
        }
    }
}

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
        let url = self.terminal_url().to_string();
        if !url.is_empty() {
            let _ = std::process::Command::new("cmd")
                .args(["/C", "start", "", &url])
                .spawn();
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
}