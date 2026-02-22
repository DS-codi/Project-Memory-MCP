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
    /// Channel for requesting a service restart from QML.
    /// Set by main.rs after the Tokio runtime and service channels are ready.
    pub restart_tx: Option<tokio::sync::mpsc::Sender<String>>,
    /// Absolute path to the supervisor config file.
    /// Set by main.rs after config is loaded so `openConfig` can open it.
    pub config_path: Option<String>,
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
            restart_tx: None,
            config_path: None,
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

    pub fn restart_service(self: Pin<&mut Self>, service: &QString) {
        let service_name = service.to_string();
        if let Some(tx) = self.rust().restart_tx.as_ref() {
            let _ = tx.try_send(service_name);
        }
    }

    pub fn open_config(self: Pin<&mut Self>) {
        if let Some(path) = self.rust().config_path.as_deref() {
            let _ = std::process::Command::new("cmd")
                .args(["/C", "start", "", path])
                .spawn();
        }
    }
}