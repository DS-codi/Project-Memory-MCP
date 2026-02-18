#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod build_check;
mod command_executor;
mod cxxqt_bridge;
mod host_bridge_listener;
mod output_persistence;
mod perf_monitor;
mod protocol;
mod saved_commands;
mod saved_commands_repository;
mod session;
mod system_tray;
mod tcp_server;

pub use tcp_server::TcpServer;

use clap::Parser;
use cxx_qt_lib::{QGuiApplication, QQmlApplicationEngine, QUrl};
use std::net::TcpListener;
use std::sync::Mutex;
use std::sync::OnceLock;

/// Default TCP port for the interactive terminal server.
const DEFAULT_PORT: u16 = 9100;
/// Default host bridge listener port for container bridge preflight/traffic.
const DEFAULT_HOST_BRIDGE_PORT: u16 = 45459;

/// Global server port, set at startup before the Qt event loop begins.
/// Read by `cxx_qt::Initialize` in the bridge when the TerminalApp QObject
/// is constructed by the QML engine.
pub static SERVER_PORT: OnceLock<u16> = OnceLock::new();

/// Pre-bound runtime listener to guarantee early port reservation at process startup.
///
/// `TcpServer::start` consumes this listener when the bridge runtime initializes.
pub static PREBOUND_RUNTIME_LISTENER: OnceLock<Mutex<Option<TcpListener>>> = OnceLock::new();

/// Heartbeat interval in seconds, set from CLI args at startup.
pub static HEARTBEAT_INTERVAL: OnceLock<u64> = OnceLock::new();

/// Idle timeout in seconds, set from CLI args at startup.
pub static IDLE_TIMEOUT: OnceLock<u64> = OnceLock::new();

pub fn prebind_runtime_listener(port: u16) -> std::io::Result<()> {
    let listener = TcpListener::bind(("127.0.0.1", port))?;
    let storage = PREBOUND_RUNTIME_LISTENER.get_or_init(|| Mutex::new(None));
    let mut guard = storage.lock().unwrap();
    *guard = Some(listener);
    Ok(())
}

pub fn take_prebound_runtime_listener(port: u16) -> Option<TcpListener> {
    let storage = PREBOUND_RUNTIME_LISTENER.get()?;
    let mut guard = storage.lock().unwrap();
    let listener = guard.take()?;

    match listener.local_addr() {
        Ok(addr) if addr.port() == port => Some(listener),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// CLI Arguments
// ---------------------------------------------------------------------------

#[derive(Parser, Debug)]
#[command(name = "interactive-terminal")]
#[command(about = "Interactive Terminal GUI for command approval")]
struct Args {
    /// TCP port to listen on
    #[arg(long, default_value_t = DEFAULT_PORT)]
    port: u16,

    /// Heartbeat interval in seconds
    #[arg(long, default_value_t = 5)]
    heartbeat_interval: u64,

    /// Idle timeout in seconds (exit after no activity)
    #[arg(long, default_value_t = 300)]
    idle_timeout: u64,

    /// Enable debug mode: allocates a console window (Windows) so stderr is visible
    #[arg(long)]
    debug: bool,
}

fn main() {
    let args = Args::parse();

    // Debug mode: allocate a console window on Windows so stderr/stdout are visible.
    // Triggered by --debug flag or INTERACTIVE_TERMINAL_DEBUG=1 env var.
    let debug_mode = args.debug
        || std::env::var("INTERACTIVE_TERMINAL_DEBUG")
            .map(|v| v == "1")
            .unwrap_or(false);

    if debug_mode {
        #[cfg(windows)]
        {
            // SAFETY: AllocConsole is a well-known Win32 API that is safe to call.
            // It attaches a console to a GUI process so stderr/stdout become visible.
            extern "system" {
                fn AllocConsole() -> i32;
            }
            unsafe {
                AllocConsole();
            }
        }
        eprintln!("Interactive Terminal debug mode enabled");
    }

    // Allow TERMINAL_PORT env var to override the CLI default.
    let port = std::env::var("TERMINAL_PORT")
        .ok()
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(args.port);

    let host_bridge_port = std::env::var("PM_INTERACTIVE_TERMINAL_HOST_PORT")
        .ok()
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(DEFAULT_HOST_BRIDGE_PORT);

    SERVER_PORT.set(port).expect("SERVER_PORT already set");
    HEARTBEAT_INTERVAL
        .set(args.heartbeat_interval)
        .expect("HEARTBEAT_INTERVAL already set");
    IDLE_TIMEOUT
        .set(args.idle_timeout)
        .expect("IDLE_TIMEOUT already set");

    prebind_runtime_listener(port)
        .unwrap_or_else(|error| panic!("Failed to prebind 127.0.0.1:{port}: {error}"));

    eprintln!("Interactive Terminal listening on 127.0.0.1:{port}");
    host_bridge_listener::spawn(host_bridge_port, port);

    // Verify Qt DLLs are deployed before trying to initialize Qt.
    build_check::verify_qt_runtime();

    #[cfg(windows)]
    std::env::set_var("QT_QPA_PLATFORM", "windows:darkmode=2");
    std::env::set_var("QT_QUICK_CONTROLS_STYLE", "Material");

    let mut app = QGuiApplication::new();
    let mut engine = QQmlApplicationEngine::new();

    if let Some(engine) = engine.as_mut() {
        engine.load(&QUrl::from("qrc:/qt/qml/com/projectmemory/terminal/qml/main.qml"));
    }

    // QML load diagnostic: root_objects() is not exposed in cxx-qt-lib 0.8,
    // so log a diagnostic that stderr consumers (--debug mode / AllocConsole)
    // can observe. The objectCreationFailed signal fires internally on failure.
    eprintln!(
        "QML engine load() completed. If the window does not appear, \
         check Qt deployment and bridge definition parity (ffi.rs vs mod.rs)."
    );

    if let Some(app) = app.as_mut() {
        app.exec();
    }
}

// ---------------------------------------------------------------------------
// Prebind listener tests — moved from tests/prebind_listener.rs to avoid
// integration-test linker errors with CxxQt.
//
// Because PREBOUND_RUNTIME_LISTENER is a process-global OnceLock we cannot
// test multiple prebind/take cycles in the same process. Instead we use a
// local re-implementation that mirrors the production logic with a fresh
// Mutex each time.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::net::TcpListener;

    mod local_prebind {
        use std::net::TcpListener;
        use std::sync::Mutex;

        pub struct PrebindSlot {
            inner: Mutex<Option<TcpListener>>,
        }

        impl PrebindSlot {
            pub fn new() -> Self {
                Self {
                    inner: Mutex::new(None),
                }
            }

            pub fn prebind(&self, port: u16) -> std::io::Result<u16> {
                let listener = TcpListener::bind(("127.0.0.1", port))?;
                let actual_port = listener.local_addr()?.port();
                let mut guard = self.inner.lock().unwrap();
                *guard = Some(listener);
                Ok(actual_port)
            }

            pub fn take(&self, port: u16) -> Option<TcpListener> {
                let mut guard = self.inner.lock().unwrap();
                let listener = guard.take()?;
                match listener.local_addr() {
                    Ok(addr) if addr.port() == port => Some(listener),
                    _ => None,
                }
            }
        }
    }

    #[test]
    fn prebind_binds_to_available_port() {
        let slot = local_prebind::PrebindSlot::new();
        let port = slot.prebind(0).expect("prebind to port 0 should succeed");
        assert_ne!(port, 0, "OS should assign a real port");

        let conflict = TcpListener::bind(("127.0.0.1", port));
        assert!(
            conflict.is_err(),
            "Port {} should already be bound by prebind",
            port
        );
    }

    #[test]
    fn take_returns_listener_for_matching_port() {
        let slot = local_prebind::PrebindSlot::new();
        let port = slot.prebind(0).expect("prebind should succeed");

        let listener = slot.take(port);
        assert!(
            listener.is_some(),
            "take() with matching port should return the listener"
        );

        let actual_addr = listener.unwrap().local_addr().unwrap();
        assert_eq!(actual_addr.port(), port);
    }

    #[test]
    fn take_returns_none_after_listener_taken() {
        let slot = local_prebind::PrebindSlot::new();
        let port = slot.prebind(0).expect("prebind should succeed");

        let first = slot.take(port);
        assert!(first.is_some(), "First take should return the listener");

        let second = slot.take(port);
        assert!(
            second.is_none(),
            "Second take should return None (one-shot semantics)"
        );
    }

    #[test]
    fn take_returns_none_for_wrong_port() {
        let slot = local_prebind::PrebindSlot::new();
        let port = slot.prebind(0).expect("prebind should succeed");

        let wrong_port = if port > 1 { port - 1 } else { port + 1 };
        let result = slot.take(wrong_port);
        assert!(
            result.is_none(),
            "take() with non-matching port should return None"
        );
    }

    #[test]
    fn take_returns_none_when_nothing_prebound() {
        let slot = local_prebind::PrebindSlot::new();
        let result = slot.take(9999);
        assert!(
            result.is_none(),
            "take() should return None when nothing was prebound"
        );
    }
}
