use crate::cxxqt_bridge::ffi;
use cxx_qt::Threading;
use cxx_qt_lib::QString;
use std::pin::Pin;
use std::sync::OnceLock;

/// Qt thread handle for the supervisor bridge, set during
/// `Initialize::initialize()`.  The async supervisor runtime (running on a
/// background Tokio thread) reads this to push property updates — e.g.
/// showing / hiding the window — back to the Qt object on the main thread.
pub static SUPERVISOR_QT: OnceLock<cxx_qt::CxxQtThread<ffi::SupervisorGuiBridge>> =
    OnceLock::new();

/// Shutdown sender registered in `supervisor_main()` once the Tokio watch
/// channel is created.  The QML `quitSupervisor()` invokable sends `true`
/// here so the Tokio event loop performs a graceful service shutdown before
/// the process exits.
pub static SHUTDOWN_TX: OnceLock<tokio::sync::watch::Sender<bool>> = OnceLock::new();

/// Resolve a `file:///` URL for a supervisor tray icon, searching next to the
/// running executable so the path is correct whether we are running from
/// `target/release/` or an installed location.
fn resolve_tray_icon_url() -> QString {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    let Some(dir) = exe_dir else {
        return QString::default();
    };

    // Prefer green (healthy) icon; fall back to purple then generic name.
    for name in &[
        "supervisor_green.ico",
        "supervisor_purple.ico",
        "supervisor_blue.ico",
        "supervisor_red.ico",
    ] {
        let candidate = dir.join(name);
        if candidate.exists() {
            // Build a file:/// URL with forward slashes (Qt requirement).
            let path_str = candidate.to_string_lossy().replace('\\', "/");
            return QString::from(&format!("file:///{}", path_str));
        }
    }

    // Dev fallback: icons live in <workspace>/supervisor/assets/icons/
    let dev_candidate = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("assets")
        .join("icons")
        .join("supervisor_green.ico");
    if dev_candidate.exists() {
        let path_str = dev_candidate.to_string_lossy().replace('\\', "/");
        return QString::from(&format!("file:///{}", path_str));
    }

    QString::default()
}

impl cxx_qt::Initialize for ffi::SupervisorGuiBridge {
    /// Called by the CxxQt runtime when the QObject is first constructed.
    /// Stores the Qt-thread handle so the async supervisor logic can push
    /// updates, then sets initial property values.
    fn initialize(mut self: Pin<&mut Self>) {
        // Store the thread handle first — the background Tokio thread may
        // already be spin-waiting for this to appear.
        let _ = SUPERVISOR_QT.set(self.qt_thread());

        self.as_mut()
            .set_status_text(QString::from("Supervisor starting…"));
        self.as_mut().set_window_visible(false);
        self.as_mut().set_tray_icon_url(resolve_tray_icon_url());
    }
}
