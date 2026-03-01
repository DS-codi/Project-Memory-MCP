use clap::Parser;

mod ipc_server;
mod pty_backend;
mod pty_host_protocol;
mod pty_manager;

const DEFAULT_IPC_PORT: u16 = 9102;
const DEFAULT_HEARTBEAT_MS: u64 = 10_000;

#[derive(Parser, Debug)]
#[command(name = "pty-host")]
#[command(about = "Out-of-process PTY host for interactive-terminal")]
struct Args {
    /// TCP port for the IPC server (UI process connects here)
    #[arg(long, default_value_t = DEFAULT_IPC_PORT)]
    ipc_port: u16,

    /// Heartbeat interval in milliseconds
    #[arg(long, default_value_t = DEFAULT_HEARTBEAT_MS)]
    heartbeat_ms: u64,
}

#[tokio::main]
async fn main() {
    let args = Args::parse();

    eprintln!(
        "[pty-host] starting IPC server on port {} (heartbeat {}ms)",
        args.ipc_port, args.heartbeat_ms
    );

    let (event_tx, event_rx) = tokio::sync::mpsc::unbounded_channel();
    let manager = pty_manager::PtyManager::new(event_tx);

    let shutdown = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to listen for Ctrl-C");
    };

    tokio::select! {
        result = ipc_server::IpcServer::run(manager, event_rx, args.ipc_port, args.heartbeat_ms) => {
            if let Err(e) = result {
                eprintln!("[pty-host] IPC server error: {e}");
            }
        }
        _ = shutdown => {
            eprintln!("[pty-host] shutdown signal received, exiting");
        }
    }
}
