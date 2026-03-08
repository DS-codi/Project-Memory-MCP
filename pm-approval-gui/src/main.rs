#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cxxqt_bridge;

use cxx_qt_lib::{QGuiApplication, QQmlApplicationEngine, QUrl};

fn main() {
    // The CxxQt Initialize impl calls tokio::spawn to read stdin on a background
    // task.  Without an active tokio runtime this panics immediately when the
    // FormApp QObject is created (before any window appears).  In release mode
    // windows_subsystem = "windows" swallows the panic silently.
    //
    // We build the runtime here and hold the enter() guard for the lifetime of
    // the Qt event loop so that tokio::spawn always finds a current runtime.
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("Failed to create tokio runtime");
    let _rt_guard = rt.enter();

    // ── Qt logging: route to stderr so errors are visible in a terminal.
    // On Windows, Qt sends all log output (including fatal QML errors) to
    // OutputDebugString by default — completely invisible without a debugger.
    // Setting this env var BEFORE QGuiApplication::new() redirects everything
    // to stderr so QML load failures, type errors, etc. are always printed.
    std::env::set_var("QT_FORCE_STDERR_LOGGING", "1");

    #[cfg(windows)]
    {
        std::env::set_var("QT_QPA_PLATFORM", "windows:darkmode=2");
        std::env::set_var("QT_QUICK_CONTROLS_STYLE", "Material");
    }

    let mut app = QGuiApplication::new();
    let mut engine = QQmlApplicationEngine::new();

    if let Some(engine) = engine.as_mut() {
        engine.load(&QUrl::from(
            "qrc:/qt/qml/com/projectmemory/approval/qml/main.qml",
        ));
    }

    if let Some(app) = app.as_mut() {
        app.exec();
    }
}
