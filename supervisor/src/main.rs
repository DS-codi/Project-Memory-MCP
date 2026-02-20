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
    // Initialise structured JSON logging.
    // Set RUST_LOG (e.g. `RUST_LOG=info,supervisor=debug`) to override the
    // default "info" filter at runtime.
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

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

            // Gap 2: initialise registry with the backend the user configured in supervisor.toml.
            let registry = Arc::new(tokio::sync::Mutex::new(
                supervisor::control::registry::Registry::with_backend(
                    cfg.mcp.backend.clone().into(),
                ),
            ));

            // Gap 3: lifecycle state registry driven by runners / state machines.
            // Epic D wires ServiceStateMachine transitions into this registry so
            // the control-API Status command reflects the true connection state.
            let _service_registry = supervisor::registry::ServiceRegistry::shared();

            // Gap 5: bidirectional channel — each envelope carries a oneshot reply sender
            // so transports can write the handler response back to the caller.
            let (tx, mut rx) =
                tokio::sync::mpsc::channel::<supervisor::control::RequestEnvelope>(64);

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

            // Build the form-app config map so the handler can spawn GUI apps.
            let mut form_apps = std::collections::HashMap::new();
            form_apps.insert("brainstorm_gui".to_string(), cfg.brainstorm_gui.0.clone());
            form_apps.insert("approval_gui".to_string(), cfg.approval_gui.0.clone());
            let form_apps = Arc::new(form_apps);

            // Dispatch incoming control requests to the handler and route the
            // response back through the oneshot reply channel.
            let reg2 = Arc::clone(&registry);
            let fa2 = Arc::clone(&form_apps);
            tokio::spawn(async move {
                while let Some((req, resp_tx)) = rx.recv().await {
                    eprintln!("[supervisor] control request: {:?}", req);
                    let resp = supervisor::control::handler::handle_request(
                        req,
                        Arc::clone(&reg2),
                        Arc::clone(&fa2),
                    )
                    .await;
                    let _ = resp_tx.send(resp);
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
