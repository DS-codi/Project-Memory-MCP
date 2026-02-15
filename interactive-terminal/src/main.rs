#![windows_subsystem = "windows"]

mod command_executor;
mod cxxqt_bridge;
mod host_bridge_listener;
mod protocol;
mod saved_commands;
mod saved_commands_repository;
mod session;
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
}

fn main() {
    let args = Args::parse();

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

    #[cfg(windows)]
    std::env::set_var("QT_QPA_PLATFORM", "windows:darkmode=2");

    let mut app = QGuiApplication::new();
    let mut engine = QQmlApplicationEngine::new();

    if let Some(engine) = engine.as_mut() {
        engine.load(&QUrl::from("qrc:/qt/qml/com/projectmemory/terminal/main.qml"));
    }

    if let Some(app) = app.as_mut() {
        app.exec();
    }
}
