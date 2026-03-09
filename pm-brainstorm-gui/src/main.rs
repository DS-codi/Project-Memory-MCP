#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cxxqt_bridge;

use cxx_qt_lib::{QGuiApplication, QQmlApplicationEngine, QUrl};

#[cfg(windows)]
unsafe extern "C" {
    fn set_app_icon();
}

fn env_flag_enabled(name: &str) -> bool {
    std::env::var(name)
        .map(|value| {
            let normalized = value.trim();
            normalized == "1"
                || normalized.eq_ignore_ascii_case("true")
                || normalized.eq_ignore_ascii_case("yes")
                || normalized.eq_ignore_ascii_case("on")
        })
        .unwrap_or(false)
}

fn configure_qt_logging() {
    std::env::set_var("QT_FORCE_STDERR_LOGGING", "1");

    if env_flag_enabled("PM_QT_DEBUG_PLUGINS") {
        std::env::set_var("QT_DEBUG_PLUGINS", "1");
    }

    if env_flag_enabled("PM_QML_IMPORT_TRACE") {
        std::env::set_var("QML_IMPORT_TRACE", "1");
    }
}

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

    // Keep QML diagnostics visible and allow optional deep plugin/import tracing.
    configure_qt_logging();

    #[cfg(windows)]
    {
        std::env::set_var("QT_QPA_PLATFORM", "windows:darkmode=2");
        std::env::set_var("QT_QUICK_CONTROLS_STYLE", "Material");
    }

    let mut app = QGuiApplication::new();

    #[cfg(windows)]
    unsafe {
        // Reinforce window/taskbar icon from QRC/runtime paths after app init.
        set_app_icon();
    }

    let mut engine = QQmlApplicationEngine::new();

    if let Some(engine) = engine.as_mut() {
        engine.load(&QUrl::from(
            "qrc:/qt/qml/com/projectmemory/brainstorm/qml/main.qml",
        ));
    }

    if let Some(app) = app.as_mut() {
        app.exec();
    }
}
