//! Supervisor binary entry-point.
//!
//! Usage:
//!   supervisor [--config <path>] [--debug]

use clap::Parser;
use std::path::PathBuf;
use std::sync::Arc;
use supervisor::config;

/// Project Memory MCP Supervisor
#[derive(Parser, Debug)]
#[command(
    name = "supervisor",
    version,
    about = "Project Memory MCP Supervisor — manages MCP, interactive terminal, and dashboard services"
)]
struct Cli {
    /// Path to the supervisor TOML config file.
    /// Defaults to %APPDATA%/ProjectMemory/supervisor.toml on Windows.
    #[arg(long, value_name = "FILE")]
    config: Option<PathBuf>,

    /// Enable verbose debug output.
    #[arg(long)]
    debug: bool,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    let config_path = config::get_config_path(cli.config.as_ref());

    if cli.debug {
        eprintln!("[debug] loading config from: {}", config_path.display());
    }

    match config::load(&config_path) {
        Ok(cfg) => {
            println!("Supervisor starting...");
            if cli.debug {
                println!("[debug] resolved config: {cfg:#?}");
            }

            let pipe_name = cfg.supervisor.control_pipe.clone();
            let tcp_port = cfg.supervisor.control_tcp_port;
            let transport = cfg.supervisor.control_transport.clone();

            let registry = Arc::new(tokio::sync::Mutex::new(
                supervisor::control::registry::Registry::new(),
            ));

            let (tx, mut rx) =
                tokio::sync::mpsc::channel::<supervisor::control::protocol::ControlRequest>(64);

            // Spawn the appropriate transport listener.
            match transport {
                supervisor::config::ControlTransport::NamedPipe => {
                    let tx2 = tx.clone();
                    tokio::spawn(async move {
                        if let Err(e) =
                            supervisor::control::pipe::serve_named_pipe(&pipe_name, tx2).await
                        {
                            eprintln!("[supervisor] named pipe error: {e}");
                        }
                    });
                }
                supervisor::config::ControlTransport::Tcp => {
                    let addr = format!("127.0.0.1:{tcp_port}");
                    let tx2 = tx.clone();
                    tokio::spawn(async move {
                        if let Err(e) =
                            supervisor::control::tcp::serve_tcp(&addr, tx2).await
                        {
                            eprintln!("[supervisor] tcp control error: {e}");
                        }
                    });
                }
            }

            // Dispatch incoming control requests to the handler.
            let reg2 = Arc::clone(&registry);
            tokio::spawn(async move {
                while let Some(req) = rx.recv().await {
                    eprintln!("[supervisor] control request: {:?}", req);
                    let _resp =
                        supervisor::control::handler::handle_request(req, Arc::clone(&reg2)).await;
                }
            });

            println!("Supervisor control API started.");
            // Keep the main task alive until Ctrl-C.
            tokio::signal::ctrl_c().await.ok();
            println!("Supervisor shutting down.");
        }
        Err(e) => {
            eprintln!("error: failed to load config: {e}");
            std::process::exit(1);
        }
    }
}
