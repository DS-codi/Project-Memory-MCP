pub mod initialize;
pub use initialize::SUPERVISOR_QT;
pub use initialize::SHUTDOWN_TX;

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
    }

    impl cxx_qt::Initialize for SupervisorGuiBridge {}
    impl cxx_qt::Threading for SupervisorGuiBridge {}
}

pub struct SupervisorGuiBridgeRust {
    pub window_visible: bool,
    pub status_text: QString,
    pub tray_icon_url: QString,
}

impl Default for SupervisorGuiBridgeRust {
    fn default() -> Self {
        Self {
            window_visible: false,
            status_text: QString::from("Supervisor starting"),
            tray_icon_url: QString::default(),
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
}