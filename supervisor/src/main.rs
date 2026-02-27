//! Supervisor binary entry-point.
//!
//! Usage:
//!   supervisor [--config <path>] [--debug]
//!
//! The binary always runs with the Qt QML GUI — Qt owns the main thread and
//! the entire async supervisor logic runs on a background Tokio thread.

use clap::Parser;
use cxx_qt::CxxQtType;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use supervisor::config;
use supervisor::config::McpBackend;
use supervisor::control::registry::ServiceStatus;
use supervisor::runner::ServiceRunner;
use supervisor::runner::container::ContainerRunner;
use supervisor::runner::dashboard::DashboardRunner;
use supervisor::runner::node::NodeRunner;
use supervisor::runner::terminal::InteractiveTerminalRunner;
use supervisor::tray_tooltip::{ServiceSummary, TrayAction, TrayComponent, TrayComponentAction};

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

fn supervisor_instance_name() -> String {
    std::env::var("PM_SUPERVISOR_INSTANCE_NAME")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "default".to_string())
}

fn supervisor_mutex_name() -> String {
    format!("Local\\ProjectMemorySupervisor_{}", supervisor_instance_name())
}

// ── Entry points ────────────────────────────────────────────────────────────

/// Supervisor entry point.  Qt owns the main thread; the entire async
/// supervisor logic runs on a background Tokio thread.
fn main() {
    // Detect --debug from raw args *before* any Qt or Tokio initialisation.
    let debug_mode = std::env::args().any(|a| a == "--debug");

    // On Windows, hide the console window that the OS created for us unless
    // the user explicitly asked for debug output.  We do this at the earliest
    // possible moment so there is no visible flash.
    #[cfg(windows)]
    if !debug_mode {
        // SAFETY: pure Win32 read + one ShowWindow call, no UB.
        extern "system" {
            fn GetConsoleWindow() -> *mut std::ffi::c_void;
            fn ShowWindow(hwnd: *mut std::ffi::c_void, nCmdShow: i32) -> i32;
        }
        unsafe {
            let hwnd = GetConsoleWindow();
            if !hwnd.is_null() {
                ShowWindow(hwnd, 0 /* SW_HIDE */);
            }
        }
    }

    // ── Single-instance guard ────────────────────────────────────────────────
    // Prevent multiple supervisor processes running side-by-side.  A named
    // Win32 mutex owned by the first instance acts as the lock; any subsequent
    // launch detects ERROR_ALREADY_EXISTS and aborts immediately.
    #[cfg(windows)]
    {
        extern "system" {
            fn CreateMutexW(
                lp_mutex_attributes: *mut std::ffi::c_void,
                b_initial_owner: i32,
                lp_name: *const u16,
            ) -> *mut std::ffi::c_void;
            fn GetLastError() -> u32;
        }
        const ERROR_ALREADY_EXISTS: u32 = 183;
        let mutex_name: Vec<u16> = supervisor_mutex_name()
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        // SAFETY: pure Win32 call; name is null-terminated UTF-16.
        let handle = unsafe { CreateMutexW(std::ptr::null_mut(), 1, mutex_name.as_ptr()) };
        if handle.is_null() || unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            eprintln!("[supervisor] another instance is already running — aborting.");
            std::process::exit(1);
        }
        // Intentionally leak the handle.  It must remain open for the entire
        // process lifetime to keep the mutex claimed.  The OS releases it when
        // the process exits.
        std::mem::forget(handle);
    }

    if debug_mode {
        eprintln!("[supervisor:debug] setting Qt env vars...");
    }

    #[cfg(windows)]
    std::env::set_var("QT_QPA_PLATFORM", "windows:darkmode=2");
    std::env::set_var("QT_QUICK_CONTROLS_STYLE", "Material");

    if debug_mode {
        std::env::set_var("QT_LOGGING_RULES", "qt.qml.*=true");
        eprintln!("[supervisor:debug] spawning background Tokio thread...");
    }

    std::thread::spawn(move || {
        if debug_mode {
            eprintln!("[supervisor:debug] background thread started, waiting for QML bridge...");
        }

        // Wait for Initialize::initialize() to deposit the qt_thread handle.
        let start = std::time::Instant::now();
        let deadline = start + std::time::Duration::from_secs(10);
        let mut last_report = start;
        loop {
            if supervisor::cxxqt_bridge::SUPERVISOR_QT.get().is_some() {
                if debug_mode {
                    eprintln!("[supervisor:debug] QML bridge ready after {:.2}s", start.elapsed().as_secs_f32());
                }
                break;
            }
            let now = std::time::Instant::now();
            if now > deadline {
                eprintln!("[supervisor] WARNING: timed out waiting for QML bridge — continuing anyway");
                break;
            }
            if debug_mode && now.duration_since(last_report) >= std::time::Duration::from_secs(2) {
                eprintln!("[supervisor:debug] still waiting for QML bridge... ({:.1}s elapsed)", start.elapsed().as_secs_f32());
                last_report = now;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        if debug_mode {
            eprintln!("[supervisor:debug] creating Tokio runtime...");
        }
        let rt = tokio::runtime::Runtime::new()
            .expect("failed to create tokio runtime");
        if debug_mode {
            eprintln!("[supervisor:debug] entering supervisor_main()...");
        }
        rt.block_on(supervisor_main());
    });

    // Qt owns the main thread.
    use cxx_qt_lib::{QGuiApplication, QQmlApplicationEngine, QUrl};
    if debug_mode {
        eprintln!("[supervisor:debug] creating QGuiApplication...");
    }
    let mut app = QGuiApplication::new();
    if debug_mode {
        eprintln!("[supervisor:debug] creating QQmlApplicationEngine...");
    }
    let mut engine = QQmlApplicationEngine::new();
    if let Some(engine) = engine.as_mut() {
        if debug_mode {
            eprintln!("[supervisor:debug] loading QML: qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml");
        }
        engine.load(&QUrl::from(
            "qrc:/qt/qml/com/projectmemory/supervisor/qml/main.qml",
        ));
        if debug_mode {
            eprintln!("[supervisor:debug] QML load call returned");
        }
    }
    if debug_mode {
        eprintln!("[supervisor:debug] entering Qt event loop (app.exec())...");
    }
    if let Some(app) = app.as_mut() {
        app.exec();
    }
    if debug_mode {
        eprintln!("[supervisor:debug] Qt event loop exited");
    }
}


// ── Async supervisor logic ────────────────────────────────────────────────────

async fn supervisor_main() {
    // Initialise the supervisor Job Object first — before any child processes
    // are spawned — so every Node.js process we create is automatically owned
    // by the supervisor and killed when it exits (even on a crash).
    supervisor::runner::job_object::init();

    // Initialise structured JSON logging.
    // Set RUST_LOG (e.g. `RUST_LOG=info,supervisor=debug`) to override the
    // default "info" filter at runtime.
    let cli = Cli::parse();

    // Initialise logging — human-readable at DEBUG level when --debug is set,
    // otherwise structured JSON at INFO (overridable via RUST_LOG).
    if cli.debug {
        tracing_subscriber::fmt()
            .with_target(true)
            .with_level(true)
            .with_env_filter(tracing_subscriber::EnvFilter::new("debug"))
            .init();
        eprintln!("[supervisor:debug] logging initialised at DEBUG level");
    } else {
        tracing_subscriber::fmt()
            .json()
            .with_env_filter(
                tracing_subscriber::EnvFilter::try_from_default_env()
                    .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
            )
            .init();
    }

    let config_path = config::get_config_path(cli.config.as_ref());

    if cli.debug {
        eprintln!("[debug] loading config from: {}", config_path.display());
    }

    match config::load(&config_path) {
        Ok(cfg) => {
            println!("Supervisor starting...");
            if cli.debug {
                eprintln!("[debug] resolved config: {cfg:#?}");
                eprintln!("[debug] control transport: {:?}, pipe: {}, tcp_port: {}",
                    cfg.supervisor.control_transport,
                    cfg.supervisor.control_pipe,
                    cfg.supervisor.control_tcp_port);
                eprintln!("[debug] mcp: backend={:?}, port={}, enabled={}",
                    cfg.mcp.backend, cfg.mcp.port, cfg.mcp.enabled);
                eprintln!("[debug] terminal: port={}, enabled={}",
                    cfg.interactive_terminal.port, cfg.interactive_terminal.enabled);
                eprintln!("[debug] dashboard: port={}, enabled={}",
                    cfg.dashboard.port, cfg.dashboard.enabled);
            }

            let subprocess_runtime_enabled = parse_env_flag(
                "PM_SUPERVISOR_MCP_SUBPROCESS_RUNTIME",
                false,
            );
            let subprocess_runtime_max_concurrency =
                parse_env_usize("PM_SUPERVISOR_MCP_SUBPROCESS_MAX_CONCURRENCY", 4).max(1);
            let subprocess_runtime_queue_limit =
                parse_env_usize("PM_SUPERVISOR_MCP_SUBPROCESS_QUEUE_LIMIT", 128).max(1);
            let subprocess_runtime_queue_wait_timeout_ms =
                parse_env_u64("PM_SUPERVISOR_MCP_SUBPROCESS_QUEUE_WAIT_TIMEOUT_MS", 5_000);
            let subprocess_runtime_per_session_limit =
                parse_env_usize("PM_SUPERVISOR_MCP_SUBPROCESS_PER_SESSION_LIMIT", 2).max(1);
            let subprocess_runtime_timeout_ms =
                parse_env_u64("PM_SUPERVISOR_MCP_SUBPROCESS_TIMEOUT_MS", 30_000);
            let subprocess_runtime_wave_cohorts = parse_env_csv(
                "PM_SUPERVISOR_MCP_SUBPROCESS_WAVE_COHORTS",
                &["wave1", "wave2", "wave3", "wave4"],
            );
            let subprocess_runtime_hard_stop_gate =
                parse_env_flag("PM_SUPERVISOR_MCP_SUBPROCESS_HARD_STOP_GATE", false);

            let mcp_subprocess_runtime = if cfg.mcp.enabled
                && matches!(cfg.mcp.backend, McpBackend::Node)
            {
                if subprocess_runtime_enabled {
                    println!(
                        "[supervisor] MCP subprocess runtime mode enabled (max_concurrency={}, queue_limit={}, queue_wait_timeout_ms={}, per_session_limit={}, timeout_ms={}, wave_cohorts={:?}, hard_stop_gate={})",
                        subprocess_runtime_max_concurrency,
                        subprocess_runtime_queue_limit,
                        subprocess_runtime_queue_wait_timeout_ms,
                        subprocess_runtime_per_session_limit,
                        subprocess_runtime_timeout_ms,
                        subprocess_runtime_wave_cohorts,
                        subprocess_runtime_hard_stop_gate
                    );
                } else {
                    println!(
                        "[supervisor] MCP subprocess runtime control available (disabled by policy; use SetMcpRuntimePolicy to enable in-process)"
                    );
                }
                Some(Arc::new(
                    supervisor::control::mcp_runtime::McpSubprocessRuntime::new(
                        supervisor::control::mcp_runtime::McpSubprocessRuntimeConfig {
                            command: cfg.mcp.node.command.clone(),
                            args: cfg.mcp.node.args.clone(),
                            working_dir: cfg.mcp.node.working_dir.clone(),
                            env: cfg.mcp.node.env.clone(),
                            runtime_enabled: subprocess_runtime_enabled,
                            max_concurrency: subprocess_runtime_max_concurrency,
                            queue_limit: subprocess_runtime_queue_limit,
                            queue_wait_timeout_ms: subprocess_runtime_queue_wait_timeout_ms,
                            per_session_inflight_limit: subprocess_runtime_per_session_limit,
                            default_timeout_ms: subprocess_runtime_timeout_ms,
                            enabled_wave_cohorts: subprocess_runtime_wave_cohorts.clone(),
                            hard_stop_gate: subprocess_runtime_hard_stop_gate,
                        },
                    ),
                ))
            } else {
                None
            };

            // ── Orphan cleanup ───────────────────────────────────────────────
            // Kill any processes from a previous supervisor run that are still
            // holding our ports.  This covers:
            //   • cfg.mcp.port          — the proxy / VS Code entry point
            //   • cfg.mcp.pool ports    — pool Node.js instances
            //   • cfg.dashboard.port    — dashboard Node.js server
            //   • cfg.interactive_terminal.port — terminal server
            {
                let mut ports_to_clear: Vec<u16> = vec![
                    cfg.mcp.port,
                    cfg.dashboard.port,
                    cfg.interactive_terminal.port,
                ];
                for i in 0..cfg.mcp.pool.max_instances {
                    ports_to_clear.push(cfg.mcp.pool.base_port + i);
                }
                println!("[supervisor] clearing orphan processes on ports: {ports_to_clear:?}");
                kill_orphans_on_ports(&ports_to_clear).await;
            }

            let pipe_name = cfg.supervisor.control_pipe.clone();
            let tcp_port = cfg.supervisor.control_tcp_port;
            let transport = cfg.supervisor.control_transport.clone();

            // ── Service runners ───────────────────────────────────────────────

            // MCP runner: Node.js process or Podman container depending on config.
            let mut mcp_runner: Box<dyn ServiceRunner> = match cfg.mcp.backend {
                McpBackend::Node => Box::new(NodeRunner::new(
                    cfg.mcp.node.clone(),
                    cfg.mcp.health_timeout_ms,
                    cfg.mcp.port,
                )),
                McpBackend::Container => Box::new(ContainerRunner::new(
                    cfg.mcp.container.clone(),
                    cfg.mcp.health_timeout_ms,
                )),
            };

            // Interactive terminal runner (single GUI + TCP-server process).
            let mut terminal_runner = InteractiveTerminalRunner::new(cfg.interactive_terminal.clone());

            // Dashboard runner.
            let mut dashboard_runner = DashboardRunner::new(
                cfg.dashboard.clone(),
                cfg.mcp.health_timeout_ms,
            );

            // Start-time tracking for per-service uptime reporting.
            let mut mcp_started_at: Option<std::time::Instant> = None;
            let mut terminal_started_at: Option<std::time::Instant> = None;
            let mut dashboard_started_at: Option<std::time::Instant> = None;

            // ── Control-plane channel + transport ────────────────────────────

            let registry = Arc::new(tokio::sync::Mutex::new(
                supervisor::control::registry::Registry::with_backend(
                    cfg.mcp.backend.clone().into(),
                ),
            ));

            let _service_registry = supervisor::registry::ServiceRegistry::shared();

            let tray_tooltip = supervisor::tray_tooltip::build_tooltip(
                &[
                    supervisor::tray_tooltip::ServiceSummary {
                        name: "MCP".to_string(),
                        state: "Starting".to_string(),
                        backend: Some(format!("{:?}", cfg.mcp.backend).to_lowercase()),
                        endpoint: Some(format!("tcp://127.0.0.1:{}", cfg.mcp.port)),
                    },
                    supervisor::tray_tooltip::ServiceSummary {
                        name: "Interactive Terminal".to_string(),
                        state: "Starting".to_string(),
                        backend: None,
                        endpoint: Some(format!("tcp://127.0.0.1:{}", cfg.interactive_terminal.port)),
                    },
                    supervisor::tray_tooltip::ServiceSummary {
                        name: "Dashboard".to_string(),
                        state: "Starting".to_string(),
                        backend: None,
                        endpoint: Some(format!("http://127.0.0.1:{}", cfg.dashboard.port)),
                    },
                ],
                0,
            );
            if cli.debug {
                eprintln!("[debug] installing tray lifecycle...");
            }
            let mut tray = supervisor::tray_tooltip::TrayLifecycle::install(&tray_tooltip);
            {
                let snapshot = {
                    let reg = registry.lock().await;
                    reg.health_snapshot()
                };
                tray.update_icon_for_health_snapshot(&snapshot);
            }

            let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(false);

            // Register the sender so the QML quitSupervisor() invokable can
            // trigger a graceful Tokio shutdown without calling Qt.quit() directly.
            let _ = supervisor::cxxqt_bridge::SHUTDOWN_TX.set(shutdown_tx.clone());

            let (restart_tx, mut restart_rx) = tokio::sync::mpsc::channel::<String>(32);
            let (mcp_health_tx, mut mcp_health_rx) =
                tokio::sync::mpsc::channel::<McpHealthSignal>(16);

            if let Some(qt) = supervisor::cxxqt_bridge::SUPERVISOR_QT.get() {
                let restart_tx_for_qt = restart_tx.clone();
                let dashboard_url = format!("http://127.0.0.1:{}", cfg.dashboard.port);
                let terminal_url = format!("http://127.0.0.1:{}", cfg.interactive_terminal.port);
                let resolved_config_path = config_path.to_string_lossy().into_owned();
                let _ = qt.queue(move |mut obj| {
                    obj.as_mut().set_dashboard_url(cxx_qt_lib::QString::from(&dashboard_url));
                    obj.as_mut().set_terminal_url(cxx_qt_lib::QString::from(&terminal_url));
                    obj.as_mut().rust_mut().restart_tx = Some(restart_tx_for_qt.clone());
                    obj.as_mut().rust_mut().config_path = Some(resolved_config_path.clone());
                });
            }

            let (restart_dispatch_tx, mut restart_dispatch_rx) = tokio::sync::mpsc::channel::<String>(32);
            tokio::spawn(async move {
                while let Some(service_name) = restart_rx.recv().await {
                    if restart_dispatch_tx.send(service_name).await.is_err() {
                        break;
                    }
                }
            });

            let (tx, mut rx) =
                tokio::sync::mpsc::channel::<supervisor::control::RequestEnvelope>(64);

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

            let mut form_apps = std::collections::HashMap::new();
            form_apps.insert("brainstorm_gui".to_string(), cfg.brainstorm_gui.0.clone());
            form_apps.insert("approval_gui".to_string(), cfg.approval_gui.0.clone());
            let form_apps = Arc::new(form_apps);

            // ── Events broadcast channel ─────────────────────────────────────
            let events_config = supervisor::events::EventsConfig {
                enabled: cfg.events.enabled,
                buffer_size: cfg.events.buffer_size,
                heartbeat_interval: cfg.events.heartbeat_interval,
                replay_buffer_size: cfg.events.replay_buffer_size,
            };
            let events_handle = supervisor::events::EventsHandle::new(events_config);
            let events_url = if cfg.events.enabled {
                Some(format!("http://127.0.0.1:{}/supervisor/events", cfg.mcp.port))
            } else {
                None
            };

            // Push initial events-channel state to the Qt bridge so the GUI
            // reflects the configured value even before any subscriber connects.
            {
                let enabled = cfg.events.enabled;
                if let Some(qt) = supervisor::cxxqt_bridge::SUPERVISOR_QT.get() {
                    let _ = qt.queue(move |mut obj| {
                        obj.as_mut().set_event_broadcast_enabled(enabled);
                    });
                }
            }

            let reg2 = Arc::clone(&registry);
            let fa2 = Arc::clone(&form_apps);
            let shutdown_tx2 = shutdown_tx.clone();
            let mcp_base_url_for_handler = if subprocess_runtime_enabled {
                None
            } else {
                Some(format!("http://127.0.0.1:{}", cfg.mcp.pool.base_port))
            };
            let events_handle2 = events_handle.clone();
            let events_url2 = events_url.clone();
            let restart_tx_for_handler = restart_tx.clone();
            let mcp_runtime_for_handler = mcp_subprocess_runtime.clone();
            tokio::spawn(async move {
                while let Some((req, resp_tx)) = rx.recv().await {
                    eprintln!("[supervisor] control request: {:?}", req);
                    let resp = supervisor::control::handler::handle_request_with_runtime(
                        req,
                        Arc::clone(&reg2),
                        Arc::clone(&fa2),
                        shutdown_tx2.clone(),
                        mcp_base_url_for_handler.clone(),
                        Some(events_handle2.clone()),
                        events_url2.clone(),
                        Some(restart_tx_for_handler.clone()),
                        mcp_runtime_for_handler.clone(),
                    )
                    .await;
                    let _ = resp_tx.send(resp);
                }
            });

            println!("Supervisor control API started.");

            // ── Start managed services ────────────────────────────────────────
            let mut mcp_pool_runtime: Option<
                Arc<tokio::sync::RwLock<supervisor::runner::mcp_pool::ManagedPool>>,
            > = None;

            if cfg.mcp.enabled {
                match cfg.mcp.backend {
                    // ── Node backend: pool + proxy own port cfg.mcp.port ──────
                    // The standalone mcp_runner is NOT started; the pool spawns
                    // the actual Node.js processes on base_port..base_port+n and
                    // the reverse proxy binds to cfg.mcp.port (3457) so VS Code
                    // sees a single endpoint.
                    McpBackend::Node => {
                        {
                            if mcp_subprocess_runtime.is_some() {
                                println!("[supervisor] MCP subprocess runtime control available (use McpRuntimeExec / SetMcpRuntimePolicy).");
                            }
                            use supervisor::runner::mcp_pool::ManagedPool;

                        println!("[supervisor] starting MCP pool + proxy (Node backend)...");
                        set_service_status(&registry, &mut tray, "mcp", ServiceStatus::Starting).await;

                        let pool_cfg = cfg.mcp.pool.clone();
                        let proxy_port = cfg.mcp.port; // VS Code connects here
                        let base_port = pool_cfg.base_port;

                        // Build and start the pool.
                        let pool = Arc::new(tokio::sync::RwLock::new(
                            ManagedPool::new(pool_cfg.clone(), cfg.mcp.node.clone(), cfg.mcp.health_timeout_ms),
                        ));
                        pool.write().await.init().await;
                        mcp_pool_runtime = Some(Arc::clone(&pool));
                        println!("[supervisor] MCP pool initialised ({} instance(s) on port(s) {}+)", pool_cfg.min_instances, base_port);
                        set_service_status(&registry, &mut tray, "mcp", ServiceStatus::Running).await;
                        set_service_health_ok(&registry, &mut tray, "mcp").await;
                        mcp_started_at = Some(std::time::Instant::now());
                        {
                            let mcp_port_val = cfg.mcp.port as i32;
                            if let Some(qt) = supervisor::cxxqt_bridge::SUPERVISOR_QT.get() {
                                let _ = qt.queue(move |mut obj| {
                                    obj.as_mut().push_service_info("mcp", mcp_port_val, "Node", 0, 0);
                                });
                            }
                        }

                        // ── Migration health check (one-shot, best-effort) ────
                        // The MCP server runs migrations automatically at startup; we verify
                        // here shortly after the pool is ready and log any anomalies.
                        let migration_check_url = format!("http://127.0.0.1:{base_port}");
                        let migration_health_timeout = cfg.mcp.health_timeout_ms;
                        tokio::spawn(async move {
                            // Give the first MCP instance a moment to finish its own startup migrations.
                            tokio::time::sleep(Duration::from_secs(3)).await;
                            match supervisor::control::mcp_admin::fetch_migration_status(
                                &migration_check_url,
                                migration_health_timeout,
                            ).await {
                                Ok(status) if status.healthy => {
                                    eprintln!("[migrations] All {} migration(s) applied. Schema is up-to-date.", status.migrations.len());
                                }
                                Ok(status) => {
                                    eprintln!("[migrations] WARNING: {} pending migration(s): {:?}", status.pending_count, status.pending);
                                    // Attempt to apply them.
                                    match supervisor::control::mcp_admin::run_migrations(
                                        &migration_check_url,
                                        migration_health_timeout,
                                    ).await {
                                        Ok(true)  => eprintln!("[migrations] Pending migrations applied successfully."),
                                        Ok(false) => eprintln!("[migrations] WARNING: Migration run reported errors — check MCP server logs."),
                                        Err(e)    => eprintln!("[migrations] ERROR triggering migration run: {e}"),
                                    }
                                }
                                Err(e) => {
                                    // Non-fatal: the MCP server handles its own migrations at startup.
                                    eprintln!("[migrations] Could not verify migration status (non-fatal): {e}");
                                }
                            }
                        });

                        // One broadcast channel; VS Code instances subscribe via
                        // GET /supervisor/heartbeat (SSE) instead of polling.
                        let heartbeat_tx = supervisor::proxy::heartbeat_channel();
                        let pool_for_hb = Arc::clone(&pool);
                        supervisor::proxy::start_heartbeat_ticker(
                            heartbeat_tx.clone(),
                            Duration::from_secs(10),
                            proxy_port,
                            base_port,
                            Arc::new(move || pool_for_hb.try_read().map(|g| g.ports().len()).unwrap_or(0)),
                            Arc::new(|| true), // placeholder — pool health is checked in poll loop
                        );

                        // Start the reverse proxy on the primary MCP port.
                        let proxy_bind = format!("127.0.0.1:{proxy_port}");
                        let events_for_proxy = events_handle.clone();
                        tokio::spawn(async move {
                            let dispatch_port_fn: Arc<dyn Fn() -> u16 + Send + Sync> = Arc::new(move || base_port);
                            if let Err(e) = supervisor::proxy::start_proxy(proxy_bind, base_port, dispatch_port_fn, heartbeat_tx, Some(events_for_proxy)).await {
                                eprintln!("[supervisor] proxy error: {e}");
                            }
                        });

                        // Start event ingestion from dashboard SSE stream.
                        if cfg.events.enabled && cfg.dashboard.enabled {
                            let dashboard_base = format!("http://127.0.0.1:{}", cfg.dashboard.port);
                            supervisor::events::ingestion::start_ingestion(dashboard_base, events_handle.clone());
                        }

                        // ── Poll loop: sync connections + auto-scale ──────────
                        let pool_for_poll = Arc::clone(&pool);
                        let reg_for_poll = Arc::clone(&registry);
                        let health_timeout = cfg.mcp.health_timeout_ms;
                        let events_handle_for_poll = events_handle.clone();
                        let mcp_health_tx_for_poll = mcp_health_tx.clone();
                        tokio::spawn(async move {
                            let mut tick = tokio::time::interval(Duration::from_secs(5));
                            let mut mcp_degraded = false;
                            loop {
                                tick.tick().await;

                                // Refresh health of all instances.
                                pool_for_poll.write().await.refresh_health().await;

                                // Collect connections from every instance.
                                let ports = pool_for_poll.read().await.ports();
                                let mut all_connections: Vec<supervisor::control::registry::McpConnectionEntry> = Vec::new();
                                let mut successful_fetches = 0usize;
                                let mut first_fetch_error: Option<String> = None;
                                for port in &ports {
                                    let base_url = format!("http://127.0.0.1:{port}");
                                    match supervisor::control::mcp_admin::fetch_mcp_connections(&base_url, health_timeout).await {
                                        Ok(remote) => {
                                            successful_fetches += 1;
                                            for rc in remote {
                                                all_connections.push(supervisor::control::registry::McpConnectionEntry {
                                                    session_id: rc.session_id,
                                                    transport_type: rc.transport_type,
                                                    connected_at: rc.connected_at,
                                                    last_activity: rc.last_activity,
                                                    call_count: rc.call_count,
                                                    linked_client_id: None,
                                                    instance_port: *port,
                                                });
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!("[poll] failed to fetch connections from :{port}: {e}");
                                            if first_fetch_error.is_none() {
                                                first_fetch_error = Some(e.to_string());
                                            }
                                        }
                                    }
                                }

                                if !ports.is_empty() {
                                    let any_instance_reachable = successful_fetches > 0;
                                    if !any_instance_reachable && !mcp_degraded {
                                        let message = first_fetch_error
                                            .unwrap_or_else(|| "all MCP instances unreachable".to_string());
                                        let _ = mcp_health_tx_for_poll
                                            .send(McpHealthSignal::Degraded(message))
                                            .await;
                                        mcp_degraded = true;
                                    } else if any_instance_reachable && mcp_degraded {
                                        let _ = mcp_health_tx_for_poll
                                            .send(McpHealthSignal::Recovered)
                                            .await;
                                        mcp_degraded = false;
                                    }
                                }

                                // Sync registry.
                                let (added, removed) = reg_for_poll.lock().await.sync_mcp_connections(all_connections.clone());
                                if added > 0 || removed > 0 {
                                    eprintln!("[poll] connections: +{added} -{removed} (total {})", all_connections.len());
                                }

                                // Auto-scale if needed.
                                let scaled = pool_for_poll.write().await.maybe_scale_up(&all_connections).await;
                                if scaled {
                                    eprintln!("[pool] scaled up to {} instance(s)", pool_for_poll.read().await.ports().len());
                                }

                                // ── Push MCP monitoring + event stats to the Qt GUI ────
                                {
                                    let total_conns = all_connections.len() as i32;
                                    let active_instances = ports.len() as i32;

                                    // Per-instance connection distribution string, e.g. "3457:2, 3458:1".
                                    let dist: String = {
                                        let mut counts: Vec<(u16, usize)> = ports.iter().map(|p| {
                                            let c = all_connections.iter().filter(|e| e.instance_port == *p).count();
                                            (*p, c)
                                        }).collect();
                                        counts.sort_by_key(|(p, _)| *p);
                                        counts.iter().map(|(p, c)| format!("{p}:{c}")).collect::<Vec<_>>().join(", ")
                                    };

                                    let sub_count = events_handle_for_poll.subscriber_count() as i32;
                                    let emitted = events_handle_for_poll.events_emitted() as i32;

                                    if let Some(qt) = supervisor::cxxqt_bridge::SUPERVISOR_QT.get() {
                                        let _ = qt.queue(move |mut obj| {
                                            obj.as_mut().set_total_mcp_connections(total_conns);
                                            obj.as_mut().set_active_mcp_instances(active_instances);
                                            obj.as_mut().set_mcp_instance_distribution(
                                                cxx_qt_lib::QString::from(&dist)
                                            );
                                            obj.as_mut().set_event_subscriber_count(sub_count);
                                            obj.as_mut().set_events_total_emitted(emitted);
                                        });
                                    }
                                }
                            }
                        });
                        }
                    }

                    // ── Container backend: standalone runner as before ─────────
                    McpBackend::Container => {
                        println!("[supervisor] starting MCP server (Container backend)...");
                        if cli.debug { eprintln!("[debug] calling mcp_runner.start() (backend=Container, port={})...", cfg.mcp.port); }
                        set_service_status(&registry, &mut tray, "mcp", ServiceStatus::Starting).await;
                        match mcp_runner.start().await {
                            Ok(()) => {
                                set_service_status(&registry, &mut tray, "mcp", ServiceStatus::Running).await;
                                set_service_health_ok(&registry, &mut tray, "mcp").await;
                                println!("[supervisor] MCP server started.");
                                if cli.debug { eprintln!("[debug] mcp_runner.start() returned Ok"); }
                            }
                            Err(e) => {
                                set_service_status(&registry, &mut tray, "mcp", ServiceStatus::Error(e.to_string())).await;
                                set_service_error(&registry, &mut tray, "mcp", e.to_string()).await;
                                eprintln!("[supervisor] failed to start MCP server: {e}");
                            }
                        }
                    }
                }
            } else {
                println!("[supervisor] MCP server disabled — skipping.");
                set_service_status(&registry, &mut tray, "mcp", ServiceStatus::Stopped).await;
            }

            // Interactive terminal starts on demand (via the `Start` control
            // command) rather than automatically at supervisor startup.  The
            // crash-recovery monitor is spawned by `handle_restart_command`
            // each time the terminal is (re)started.
            if cfg.interactive_terminal.enabled {
                println!("[supervisor] interactive terminal configured — waiting for on-demand launch.");
            } else {
                println!("[supervisor] interactive terminal disabled — skipping.");
            }
            set_service_status(&registry, &mut tray, "interactive_terminal", ServiceStatus::Stopped).await;

            if cfg.dashboard.enabled {
                println!("[supervisor] starting dashboard...");
                if cli.debug { eprintln!("[debug] calling dashboard_runner.start() (port={})...", cfg.dashboard.port); }
                set_service_status(&registry, &mut tray, "dashboard", ServiceStatus::Starting).await;
                match dashboard_runner.start().await {
                    Ok(()) => {
                        set_service_status(&registry, &mut tray, "dashboard", ServiceStatus::Running).await;
                        set_service_health_ok(&registry, &mut tray, "dashboard").await;
                        println!("[supervisor] dashboard started.");
                        if cli.debug { eprintln!("[debug] dashboard_runner.start() returned Ok"); }
                        dashboard_started_at = Some(std::time::Instant::now());
                        {
                            let dash_port_val = cfg.dashboard.port as i32;
                            let dash_pid_val = dashboard_runner.pid().unwrap_or(0) as i32;
                            if let Some(qt) = supervisor::cxxqt_bridge::SUPERVISOR_QT.get() {
                                let _ = qt.queue(move |mut obj| {
                                    obj.as_mut().push_service_info("dashboard", dash_port_val, "Node", dash_pid_val, 0);
                                });
                            }
                        }
                    }
                    Err(e) => {
                        set_service_status(&registry, &mut tray, "dashboard", ServiceStatus::Error(e.to_string())).await;
                        set_service_error(&registry, &mut tray, "dashboard", e.to_string()).await;
                        eprintln!("[supervisor] failed to start dashboard: {e}");
                    }
                }

                // ── Dashboard crash-recovery monitor ──────────────────────────
                // Polls TCP port every 5 s; restarts after 2 consecutive
                // failures so the supervisor always owns the dashboard process.
                // Uses TCP probe (not HTTP /health) because the dashboard
                // server does not expose a /health route.
                {
                    let restart_tx_dash = restart_tx.clone();
                    let dash_port = cfg.dashboard.port;
                    tokio::spawn(async move {
                        tokio::time::sleep(Duration::from_secs(30)).await;
                        let mut failures = 0u32;
                        let mut interval = tokio::time::interval(Duration::from_secs(5));
                        loop {
                            interval.tick().await;
                            if probe_tcp(dash_port).await {
                                failures = 0;
                            } else {
                                failures += 1;
                                eprintln!("[supervisor] dashboard health probe failed ({failures})");
                                if failures >= 2 {
                                    eprintln!("[supervisor] dashboard appears dead — requesting restart");
                                    failures = 0;
                                    let _ = restart_tx_dash.send("dashboard".to_string()).await;
                                    tokio::time::sleep(Duration::from_secs(90)).await;
                                    interval.reset();
                                }
                            }
                        }
                    });
                }
            } else {
                println!("[supervisor] dashboard disabled — skipping.");
                set_service_status(&registry, &mut tray, "dashboard", ServiceStatus::Stopped).await;
            }

            // ── Wait for shutdown ─────────────────────────────────────────────

            println!("[supervisor] all services started. Press Ctrl-C to stop.");
            let mut tray_poll_tick = tokio::time::interval(Duration::from_millis(150));
            let mut uptime_interval = tokio::time::interval(Duration::from_secs(30));
            loop {
                tokio::select! {
                    _ = tokio::signal::ctrl_c() => {
                        println!("[supervisor] ctrl-c received.");
                        break;
                    }
                    changed = shutdown_rx.changed() => {
                        if changed.is_ok() && *shutdown_rx.borrow() {
                            println!("[supervisor] shutdown requested via control API.");
                            break;
                        }
                    }
                    _ = tray_poll_tick.tick() => {
                        while let Some(action) = tray.poll_action() {
                            handle_tray_action(
                                action,
                                &registry,
                                &mut tray,
                                &mut *mcp_runner,
                                &mut terminal_runner,
                                &mut dashboard_runner,
                                shutdown_tx.clone(),
                            ).await;
                        }
                    }
                    restart_command = restart_dispatch_rx.recv() => {
                        if let Some(service_name) = restart_command {
                            let mcp_pool_for_restart = mcp_pool_runtime.as_ref().map(Arc::clone);
                            handle_restart_command(
                                &service_name,
                                &registry,
                                &mut tray,
                                &mut *mcp_runner,
                                &mut terminal_runner,
                                &mut dashboard_runner,
                                cfg.mcp.backend.clone(),
                                mcp_subprocess_runtime.is_some(),
                                mcp_pool_for_restart,
                                restart_tx.clone(),
                                cfg.interactive_terminal.port,
                            ).await;
                            // Update start-time tracking and push service info after restarts.
                            match service_name.trim().to_ascii_lowercase().as_str() {
                                "terminal" | "interactive_terminal" => {
                                    if terminal_runner.pid().is_some() {
                                        terminal_started_at = Some(std::time::Instant::now());
                                        {
                                            let term_port_val = cfg.interactive_terminal.port as i32;
                                            let term_pid_val = terminal_runner.pid().unwrap_or(0) as i32;
                                            if let Some(qt) = supervisor::cxxqt_bridge::SUPERVISOR_QT.get() {
                                                let _ = qt.queue(move |mut obj| {
                                                    obj.as_mut().push_service_info("terminal", term_port_val, "Rust", term_pid_val, 0);
                                                });
                                            }
                                        }
                                    }
                                }
                                "dashboard" => {
                                    if dashboard_runner.pid().is_some() {
                                        dashboard_started_at = Some(std::time::Instant::now());
                                        {
                                            let dash_port_val = cfg.dashboard.port as i32;
                                            let dash_pid_val = dashboard_runner.pid().unwrap_or(0) as i32;
                                            if let Some(qt) = supervisor::cxxqt_bridge::SUPERVISOR_QT.get() {
                                                let _ = qt.queue(move |mut obj| {
                                                    obj.as_mut().push_service_info("dashboard", dash_port_val, "Node", dash_pid_val, 0);
                                                });
                                            }
                                        }
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    mcp_health_signal = mcp_health_rx.recv() => {
                        if let Some(signal) = mcp_health_signal {
                            match signal {
                                McpHealthSignal::Degraded(error) => {
                                    set_service_status(&registry, &mut tray, "mcp", ServiceStatus::Error(error.clone())).await;
                                    set_service_error(&registry, &mut tray, "mcp", error).await;
                                }
                                McpHealthSignal::Recovered => {
                                    set_service_status(&registry, &mut tray, "mcp", ServiceStatus::Running).await;
                                    set_service_health_ok(&registry, &mut tray, "mcp").await;
                                }
                            }
                        }
                    }
                    _ = uptime_interval.tick() => {
                        {
                            let term_pid = terminal_runner.pid().unwrap_or(0) as i32;
                            let term_uptime = terminal_started_at
                                .map(|t| t.elapsed().as_secs() as i32)
                                .unwrap_or(0);
                            let dash_pid = dashboard_runner.pid().unwrap_or(0) as i32;
                            let dash_uptime = dashboard_started_at
                                .map(|t| t.elapsed().as_secs() as i32)
                                .unwrap_or(0);
                            let mcp_uptime = mcp_started_at
                                .map(|t| t.elapsed().as_secs() as i32)
                                .unwrap_or(0);
                            let term_port_val = cfg.interactive_terminal.port as i32;
                            let dash_port_val = cfg.dashboard.port as i32;
                            let mcp_port_val = cfg.mcp.port as i32;
                            if let Some(qt) = supervisor::cxxqt_bridge::SUPERVISOR_QT.get() {
                                let _ = qt.queue(move |mut obj| {
                                    if mcp_uptime > 0 {
                                        obj.as_mut().push_service_info("mcp", mcp_port_val, "Node", 0, mcp_uptime);
                                    }
                                    if term_pid != 0 {
                                        obj.as_mut().push_service_info("terminal", term_port_val, "Rust", term_pid, term_uptime);
                                    }
                                    if dash_pid != 0 {
                                        obj.as_mut().push_service_info("dashboard", dash_port_val, "Node", dash_pid, dash_uptime);
                                    }
                                });
                            }
                        }
                    }
                }
            }
            println!("[supervisor] shutting down...");

            // Stop services in reverse dependency order: dashboard first
            // (depends on MCP), then MCP, then terminal pool.
            if cfg.dashboard.enabled {
                set_service_status(&registry, &mut tray, "dashboard", ServiceStatus::Stopping).await;
                if let Err(e) = dashboard_runner.stop().await {
                    set_service_status(&registry, &mut tray, "dashboard", ServiceStatus::Error(e.to_string())).await;
                    set_service_error(&registry, &mut tray, "dashboard", e.to_string()).await;
                    eprintln!("[supervisor] error stopping dashboard: {e}");
                } else {
                    set_service_status(&registry, &mut tray, "dashboard", ServiceStatus::Stopped).await;
                    println!("[supervisor] dashboard stopped.");
                }
            }

            if cfg.mcp.enabled {
                set_service_status(&registry, &mut tray, "mcp", ServiceStatus::Stopping).await;
                if let Err(e) = mcp_runner.stop().await {
                    set_service_status(&registry, &mut tray, "mcp", ServiceStatus::Error(e.to_string())).await;
                    set_service_error(&registry, &mut tray, "mcp", e.to_string()).await;
                    eprintln!("[supervisor] error stopping MCP server: {e}");
                } else {
                    set_service_status(&registry, &mut tray, "mcp", ServiceStatus::Stopped).await;
                    println!("[supervisor] MCP server stopped.");
                }
            }

            if cfg.interactive_terminal.enabled {
                set_service_status(&registry, &mut tray, "interactive_terminal", ServiceStatus::Stopping).await;
                if let Err(e) = terminal_runner.stop().await {
                    set_service_status(&registry, &mut tray, "interactive_terminal", ServiceStatus::Error(e.to_string())).await;
                    set_service_error(&registry, &mut tray, "interactive_terminal", e.to_string()).await;
                    eprintln!("[supervisor] error stopping interactive terminal: {e}");
                } else {
                    set_service_status(&registry, &mut tray, "interactive_terminal", ServiceStatus::Stopped).await;
                    println!("[supervisor] interactive terminal stopped.");
                }
            }

            println!("Supervisor stopped.");

            // Signal Qt to hide the tray icon before the process exits.  This
            // allows Qt to call NIM_DELETE so the icon disappears immediately
            // rather than lingering until the user hovers over the tray area.
            {
                if let Some(qt) = supervisor::cxxqt_bridge::SUPERVISOR_QT.get() {
                    let _ = qt.queue(|mut obj| {
                        obj.as_mut().set_quitting(true);
                    });
                    // Yield briefly so the Qt event loop processes the property
                    // change and hides the icon before we terminate.
                    tokio::time::sleep(Duration::from_millis(200)).await;
                }
            }

            // Terminate the entire process now that all child services have
            // been stopped.  This also exits the Qt event loop on the main
            // thread, preventing orphaned node/vite/terminal processes.
            std::process::exit(0);
        }
        Err(e) => {
            eprintln!("error: failed to load config: {e}");
            std::process::exit(1);
        }
    }
}

/// Push a status-text update to the QML bridge.  The text is built from
/// the current registry snapshot so the GUI label always reflects what the
/// tray tooltip would show.
fn push_qt_status(snapshot: &supervisor::control::protocol::HealthSnapshot) {
    let lines: Vec<String> = snapshot
        .children
        .iter()
        .map(|c| {
            format!(
                "{}: {}",
                display_name_for_service(&c.service_name),
                display_state_for_service(&c.status)
            )
        })
        .collect();
    let text = if lines.is_empty() {
        "All services stopped".to_string()
    } else {
        lines.join("  ·  ")
    };

    let mut mcp_status = String::from("Stopped");
    let mut terminal_status = String::from("Stopped");
    let mut dashboard_status = String::from("Stopped");
    for child in &snapshot.children {
        let state = display_state_for_service(&child.status);
        match child.service_name.as_str() {
            "mcp" => mcp_status = state,
            "interactive_terminal" => terminal_status = state,
            "dashboard" => dashboard_status = state,
            _ => {}
        }
    }

    if let Some(qt) = supervisor::cxxqt_bridge::SUPERVISOR_QT.get() {
        let _ = qt.queue(move |mut obj| {
            obj.as_mut().set_status_text(cxx_qt_lib::QString::from(&text));
            obj.as_mut().set_mcp_status(cxx_qt_lib::QString::from(&mcp_status));
            obj.as_mut().set_terminal_status(cxx_qt_lib::QString::from(&terminal_status));
            obj.as_mut().set_dashboard_status(cxx_qt_lib::QString::from(&dashboard_status));
        });
    }
}


async fn set_service_status(
    registry: &Arc<tokio::sync::Mutex<supervisor::control::registry::Registry>>,
    tray: &mut supervisor::tray_tooltip::TrayLifecycle,
    service: &str,
    status: ServiceStatus,
) {
    let snapshot = {
        let mut reg = registry.lock().await;
        reg.set_service_status(service, status);
        reg.health_snapshot()
    };
    let tooltip = build_runtime_tooltip(&snapshot);
    tray.update_tooltip_text(&tooltip);
    tray.update_icon_for_health_snapshot(&snapshot);
    push_qt_status(&snapshot);
}

async fn set_service_error(
    registry: &Arc<tokio::sync::Mutex<supervisor::control::registry::Registry>>,
    tray: &mut supervisor::tray_tooltip::TrayLifecycle,
    service: &str,
    error: String,
) {
    let snapshot = {
        let mut reg = registry.lock().await;
        reg.set_service_error(service, error);
        reg.health_snapshot()
    };
    let tooltip = build_runtime_tooltip(&snapshot);
    tray.update_tooltip_text(&tooltip);
    tray.update_icon_for_health_snapshot(&snapshot);
    push_qt_status(&snapshot);
}

async fn set_service_health_ok(
    registry: &Arc<tokio::sync::Mutex<supervisor::control::registry::Registry>>,
    tray: &mut supervisor::tray_tooltip::TrayLifecycle,
    service: &str,
) {
    let snapshot = {
        let mut reg = registry.lock().await;
        reg.set_service_health_ok(service);
        reg.health_snapshot()
    };
    let tooltip = build_runtime_tooltip(&snapshot);
    tray.update_tooltip_text(&tooltip);
    tray.update_icon_for_health_snapshot(&snapshot);
    push_qt_status(&snapshot);
}

fn build_runtime_tooltip(snapshot: &supervisor::control::protocol::HealthSnapshot) -> String {
    let mut services: Vec<ServiceSummary> = snapshot
        .children
        .iter()
        .map(|child| ServiceSummary {
            name: display_name_for_service(&child.service_name).to_string(),
            state: display_state_for_service(&child.status),
            backend: None,
            endpoint: None,
        })
        .collect();
    services.sort_by(|a, b| a.name.cmp(&b.name));
    supervisor::tray_tooltip::build_tooltip(&services, 0)
}

fn display_name_for_service(service_name: &str) -> &'static str {
    match service_name {
        "mcp" => "MCP",
        "interactive_terminal" => "Interactive Terminal",
        "dashboard" => "Dashboard",
        _ => "Service",
    }
}

fn display_state_for_service(status: &str) -> String {
    if status == "starting" {
        return "Starting".to_string();
    }
    if status == "running" {
        return "Running".to_string();
    }
    if status == "stopping" {
        return "Stopping".to_string();
    }
    if status == "stopped" {
        return "Stopped".to_string();
    }
    if status.starts_with("error:") {
        return "Error".to_string();
    }
    status.to_string()
}

async fn handle_tray_action(
    action: TrayAction,
    registry: &Arc<tokio::sync::Mutex<supervisor::control::registry::Registry>>,
    tray: &mut supervisor::tray_tooltip::TrayLifecycle,
    mcp_runner: &mut dyn ServiceRunner,
    terminal_runner: &mut InteractiveTerminalRunner,
    dashboard_runner: &mut DashboardRunner,
    shutdown_tx: tokio::sync::watch::Sender<bool>,
) {
    match action {
        TrayAction::ShowSupervisorGui => {
            if let Some(qt) = supervisor::cxxqt_bridge::SUPERVISOR_QT.get() {
                let _ = qt.queue(|mut obj| {
                    obj.as_mut().set_window_visible(true);
                });
            }
            let snapshot = {
                let mut reg = registry.lock().await;
                reg.set_health_window_visible(true);
                reg.health_snapshot()
            };
            let tooltip = build_runtime_tooltip(&snapshot);
            tray.update_tooltip_text(&tooltip);
            println!("[supervisor] tray action: show supervisor GUI");
        }
        TrayAction::HideSupervisorGui => {
            if let Some(qt) = supervisor::cxxqt_bridge::SUPERVISOR_QT.get() {
                let _ = qt.queue(|mut obj| {
                    obj.as_mut().set_window_visible(false);
                });
            }
            let snapshot = {
                let mut reg = registry.lock().await;
                reg.set_health_window_visible(false);
                reg.health_snapshot()
            };
            let tooltip = build_runtime_tooltip(&snapshot);
            tray.update_tooltip_text(&tooltip);
            println!("[supervisor] tray action: hide supervisor GUI");
        }
        TrayAction::QuitSupervisor => {
            let _ = shutdown_tx.send(true);
            println!("[supervisor] tray action: quit supervisor");
        }
        TrayAction::Component { component, action } => {
            handle_component_action(component, action, registry, tray, mcp_runner, terminal_runner, dashboard_runner).await;
        }
    }
}

async fn handle_component_action(
    component: TrayComponent,
    action: TrayComponentAction,
    registry: &Arc<tokio::sync::Mutex<supervisor::control::registry::Registry>>,
    tray: &mut supervisor::tray_tooltip::TrayLifecycle,
    mcp_runner: &mut dyn ServiceRunner,
    terminal_runner: &mut InteractiveTerminalRunner,
    dashboard_runner: &mut DashboardRunner,
) {
    match (component, action) {
        (TrayComponent::Mcp, TrayComponentAction::Launch) => {
            set_service_status(registry, tray, "mcp", ServiceStatus::Starting).await;
            match mcp_runner.start().await {
                Ok(()) => {
                    set_service_status(registry, tray, "mcp", ServiceStatus::Running).await;
                    set_service_health_ok(registry, tray, "mcp").await;
                }
                Err(error) => {
                    set_service_status(registry, tray, "mcp", ServiceStatus::Error(error.to_string())).await;
                    set_service_error(registry, tray, "mcp", error.to_string()).await;
                }
            }
        }
        (TrayComponent::Mcp, TrayComponentAction::Restart) => {
            set_service_status(registry, tray, "mcp", ServiceStatus::Stopping).await;
            let _ = mcp_runner.stop().await;
            set_service_status(registry, tray, "mcp", ServiceStatus::Starting).await;
            match mcp_runner.start().await {
                Ok(()) => {
                    set_service_status(registry, tray, "mcp", ServiceStatus::Running).await;
                    set_service_health_ok(registry, tray, "mcp").await;
                }
                Err(error) => {
                    set_service_status(registry, tray, "mcp", ServiceStatus::Error(error.to_string())).await;
                    set_service_error(registry, tray, "mcp", error.to_string()).await;
                }
            }
        }
        (TrayComponent::Mcp, TrayComponentAction::Shutdown) => {
            set_service_status(registry, tray, "mcp", ServiceStatus::Stopping).await;
            match mcp_runner.stop().await {
                Ok(()) => set_service_status(registry, tray, "mcp", ServiceStatus::Stopped).await,
                Err(error) => {
                    set_service_status(registry, tray, "mcp", ServiceStatus::Error(error.to_string())).await;
                    set_service_error(registry, tray, "mcp", error.to_string()).await;
                }
            }
        }

        (TrayComponent::InteractiveTerminal, TrayComponentAction::Launch) => {
            set_service_status(registry, tray, "interactive_terminal", ServiceStatus::Starting).await;
            match terminal_runner.start().await {
                Ok(()) => {
                    set_service_status(registry, tray, "interactive_terminal", ServiceStatus::Running).await;
                    set_service_health_ok(registry, tray, "interactive_terminal").await;
                }
                Err(error) => {
                    set_service_status(registry, tray, "interactive_terminal", ServiceStatus::Error(error.to_string())).await;
                    set_service_error(registry, tray, "interactive_terminal", error.to_string()).await;
                }
            }
        }
        (TrayComponent::InteractiveTerminal, TrayComponentAction::Restart) => {
            set_service_status(registry, tray, "interactive_terminal", ServiceStatus::Stopping).await;
            let _ = terminal_runner.stop().await;
            set_service_status(registry, tray, "interactive_terminal", ServiceStatus::Starting).await;
            match terminal_runner.start().await {
                Ok(()) => {
                    set_service_status(registry, tray, "interactive_terminal", ServiceStatus::Running).await;
                    set_service_health_ok(registry, tray, "interactive_terminal").await;
                }
                Err(error) => {
                    set_service_status(registry, tray, "interactive_terminal", ServiceStatus::Error(error.to_string())).await;
                    set_service_error(registry, tray, "interactive_terminal", error.to_string()).await;
                }
            }
        }
        (TrayComponent::InteractiveTerminal, TrayComponentAction::Shutdown) => {
            set_service_status(registry, tray, "interactive_terminal", ServiceStatus::Stopping).await;
            match terminal_runner.stop().await {
                Ok(()) => set_service_status(registry, tray, "interactive_terminal", ServiceStatus::Stopped).await,
                Err(error) => {
                    set_service_status(registry, tray, "interactive_terminal", ServiceStatus::Error(error.to_string())).await;
                    set_service_error(registry, tray, "interactive_terminal", error.to_string()).await;
                }
            }
        }

        (TrayComponent::Dashboard, TrayComponentAction::Launch) => {
            set_service_status(registry, tray, "dashboard", ServiceStatus::Starting).await;
            match dashboard_runner.start().await {
                Ok(()) => {
                    set_service_status(registry, tray, "dashboard", ServiceStatus::Running).await;
                    set_service_health_ok(registry, tray, "dashboard").await;
                }
                Err(error) => {
                    set_service_status(registry, tray, "dashboard", ServiceStatus::Error(error.to_string())).await;
                    set_service_error(registry, tray, "dashboard", error.to_string()).await;
                }
            }
        }
        (TrayComponent::Dashboard, TrayComponentAction::Restart) => {
            set_service_status(registry, tray, "dashboard", ServiceStatus::Stopping).await;
            let _ = dashboard_runner.stop().await;
            set_service_status(registry, tray, "dashboard", ServiceStatus::Starting).await;
            match dashboard_runner.start().await {
                Ok(()) => {
                    set_service_status(registry, tray, "dashboard", ServiceStatus::Running).await;
                    set_service_health_ok(registry, tray, "dashboard").await;
                }
                Err(error) => {
                    set_service_status(registry, tray, "dashboard", ServiceStatus::Error(error.to_string())).await;
                    set_service_error(registry, tray, "dashboard", error.to_string()).await;
                }
            }
        }
        (TrayComponent::Dashboard, TrayComponentAction::Shutdown) => {
            set_service_status(registry, tray, "dashboard", ServiceStatus::Stopping).await;
            match dashboard_runner.stop().await {
                Ok(()) => set_service_status(registry, tray, "dashboard", ServiceStatus::Stopped).await,
                Err(error) => {
                    set_service_status(registry, tray, "dashboard", ServiceStatus::Error(error.to_string())).await;
                    set_service_error(registry, tray, "dashboard", error.to_string()).await;
                }
            }
        }
    }
}

async fn handle_restart_command(
    service_name: &str,
    registry: &Arc<tokio::sync::Mutex<supervisor::control::registry::Registry>>,
    tray: &mut supervisor::tray_tooltip::TrayLifecycle,
    mcp_runner: &mut dyn ServiceRunner,
    terminal_runner: &mut InteractiveTerminalRunner,
    dashboard_runner: &mut DashboardRunner,
    mcp_backend: McpBackend,
    mcp_subprocess_runtime_enabled: bool,
    mcp_pool_runtime: Option<Arc<tokio::sync::RwLock<supervisor::runner::mcp_pool::ManagedPool>>>,
    restart_tx: tokio::sync::mpsc::Sender<String>,
    term_port: u16,
) {
    match service_name.trim().to_ascii_lowercase().as_str() {
        "mcp" => {
            if matches!(mcp_backend, McpBackend::Node) {
                if let Some(pool) = mcp_pool_runtime {
                    set_service_status(
                        registry,
                        tray,
                        "mcp",
                        ServiceStatus::Stopping,
                    )
                    .await;
                    pool.write().await.stop_all().await;
                    set_service_status(
                        registry,
                        tray,
                        "mcp",
                        ServiceStatus::Starting,
                    )
                    .await;
                    pool.write().await.init().await;

                    if pool.read().await.ports().is_empty() {
                        let error = "MCP restart failed: pool did not start any instances".to_string();
                        set_service_status(
                            registry,
                            tray,
                            "mcp",
                            ServiceStatus::Error(error.clone()),
                        )
                        .await;
                        set_service_error(registry, tray, "mcp", error).await;
                    } else {
                        set_service_status(registry, tray, "mcp", ServiceStatus::Running).await;
                        set_service_health_ok(registry, tray, "mcp").await;
                    }
                    return;
                }

                if mcp_subprocess_runtime_enabled {
                    set_service_status(registry, tray, "mcp", ServiceStatus::Starting).await;
                    set_service_status(registry, tray, "mcp", ServiceStatus::Running).await;
                    set_service_health_ok(registry, tray, "mcp").await;
                    return;
                }
            }

            handle_component_action(
                TrayComponent::Mcp,
                TrayComponentAction::Restart,
                registry,
                tray,
                mcp_runner,
                terminal_runner,
                dashboard_runner,
            )
            .await;
        }
        "terminal" | "interactive_terminal" => {
            handle_component_action(
                TrayComponent::InteractiveTerminal,
                TrayComponentAction::Restart,
                registry,
                tray,
                mcp_runner,
                terminal_runner,
                dashboard_runner,
            )
            .await;
            // Spawn crash-recovery monitor after every (re)start so the
            // supervisor detects crashes regardless of whether the terminal
            // was started automatically or on demand.
            {
                let is_running = {
                    let reg = registry.lock().await;
                    reg.service_states()
                        .iter()
                        .find(|s| s.name == "interactive_terminal")
                        .map(|s| matches!(s.status, supervisor::control::registry::ServiceStatus::Running))
                        .unwrap_or(false)
                };
                if is_running {
                    let restart_tx_term = restart_tx.clone();
                    tokio::spawn(async move {
                        // Give the Qt/QML binary ample time to start before
                        // the first health probe fires.
                        tokio::time::sleep(Duration::from_secs(30)).await;
                        let mut failures = 0u32;
                        let mut interval = tokio::time::interval(Duration::from_secs(5));
                        loop {
                            interval.tick().await;
                            if probe_tcp(term_port).await {
                                failures = 0;
                            } else {
                                failures += 1;
                                eprintln!("[supervisor] terminal health probe failed ({failures})");
                                if failures >= 2 {
                                    eprintln!("[supervisor] terminal appears dead — requesting restart");
                                    failures = 0;
                                    let _ = restart_tx_term.send("terminal".to_string()).await;
                                    tokio::time::sleep(Duration::from_secs(90)).await;
                                    interval.reset();
                                }
                            }
                        }
                    });
                }
            }
        }
        "dashboard" => {
            handle_component_action(
                TrayComponent::Dashboard,
                TrayComponentAction::Restart,
                registry,
                tray,
                mcp_runner,
                terminal_runner,
                dashboard_runner,
            )
            .await;
        }
        other => {
            eprintln!("[supervisor] unknown restart service requested: {other}");
        }
    }
}

fn parse_env_flag(name: &str, default: bool) -> bool {
    match std::env::var(name) {
        Ok(v) => {
            let normalized = v.trim().to_ascii_lowercase();
            matches!(normalized.as_str(), "1" | "true" | "yes" | "on")
        }
        Err(_) => default,
    }
}

fn parse_env_usize(name: &str, default: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|v| v.trim().parse::<usize>().ok())
        .unwrap_or(default)
}

fn parse_env_u64(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .unwrap_or(default)
}

fn parse_env_csv(name: &str, default: &[&str]) -> Vec<String> {
    match std::env::var(name) {
        Ok(v) => {
            let parsed: Vec<String> = v
                .split(',')
                .map(|s| s.trim().to_ascii_lowercase())
                .filter(|s| !s.is_empty())
                .collect();
            if parsed.is_empty() {
                default.iter().map(|s| s.to_string()).collect()
            } else {
                parsed
            }
        }
        Err(_) => default.iter().map(|s| s.to_string()).collect(),
    }
}

enum McpHealthSignal {
    Degraded(String),
    Recovered,
}

// ── Orphan process cleanup ────────────────────────────────────────────────────

/// Kill every process that is already listening on one of `ports`.
///
/// Called once at the top of `supervisor_main()` — before any runners are
/// created — so that orphaned Node.js / dashboard processes left over from a
/// previous (crashed or force-killed) supervisor run do not block the new
/// instances from binding to the same ports.
async fn kill_orphans_on_ports(ports: &[u16]) {
    for &port in ports {
        if let Some(pid) = find_pid_for_port(port).await {
            kill_pid(pid, port);
        }
    }
}

#[cfg(windows)]
async fn find_pid_for_port(port: u16) -> Option<u32> {
    let output = tokio::process::Command::new("netstat")
        .args(["-ano", "-p", "tcp"])
        .output()
        .await
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if !line.to_ascii_uppercase().contains("LISTENING") {
            continue;
        }
        // Match ":<port> " — port at end of an address field, followed by whitespace.
        let needle = format!(":{port} ");
        if !line.contains(&needle) {
            continue;
        }
        if let Some(pid_str) = line.split_whitespace().last() {
            if let Ok(pid) = pid_str.parse::<u32>() {
                return Some(pid);
            }
        }
    }
    None
}

#[cfg(not(windows))]
async fn find_pid_for_port(port: u16) -> Option<u32> {
    let output = tokio::process::Command::new("lsof")
        .args(["-iTCP", &format!(":{port}"), "-sTCP:LISTEN", "-t"])
        .output()
        .await
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout.split_whitespace().next()?.parse::<u32>().ok()
}

fn kill_pid(pid: u32, port: u16) {
    #[cfg(windows)]
    {
        match std::process::Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output()
        {
            Ok(out) if out.status.success() => {
                println!("[supervisor] killed orphan PID {pid} (port {port})");
            }
            Ok(out) => {
                let msg = String::from_utf8_lossy(&out.stderr);
                eprintln!("[supervisor] could not kill orphan PID {pid} (port {port}): {msg}");
            }
            Err(e) => {
                eprintln!("[supervisor] error killing orphan PID {pid} (port {port}): {e}");
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output()
            .map(|out| {
                if out.status.success() {
                    println!("[supervisor] killed orphan PID {pid} (port {port})");
                } else {
                    eprintln!("[supervisor] could not kill orphan PID {pid} (port {port})");
                }
            });
    }
}

// ── Service health probes (used by crash-recovery monitor tasks) ─────────────

/// HTTP GET `http://127.0.0.1:{port}/health`.
/// Returns `true` for a 2xx response within `timeout_ms`.
async fn probe_http_health(port: u16, timeout_ms: u64) -> bool {
    let url = format!("http://127.0.0.1:{port}/health");
    let Ok(client) = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
    else {
        return false;
    };
    client
        .get(&url)
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// TCP connect to `127.0.0.1:{port}`.
/// Returns `true` if a connection is established within 3 seconds.
async fn probe_tcp(port: u16) -> bool {
    tokio::time::timeout(
        Duration::from_secs(3),
        tokio::net::TcpStream::connect(format!("127.0.0.1:{port}")),
    )
    .await
    .map(|r| r.is_ok())
    .unwrap_or(false)
}
