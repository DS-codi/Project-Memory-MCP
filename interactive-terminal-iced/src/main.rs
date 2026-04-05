#![windows_subsystem = "windows"]

mod app_state;
mod backend_bridge;
mod tray;
mod types;
#[cfg(windows)]
mod webview_host;

// ── Backend modules (ported from interactive-terminal, CXX/QML stripped) ─────
mod audit_log;
mod command_executor;
mod integration;
mod launch_builder;
mod output_persistence;
mod protocol;
mod saved_commands;
mod saved_commands_repository;
mod session;
mod tcp_server;
mod terminal_core;

mod ui {
    pub mod approval_panel;
    pub mod saved_commands_panel;
    pub mod sessions_panel;
    pub mod settings_panel;
    pub mod status_bar;
    pub mod terminal_panel;
    pub mod theme;
}

use clap::Parser;

#[derive(Parser, Debug)]
#[command(name = "interactive-terminal-iced")]
struct Args {
    #[arg(long, default_value = "127.0.0.1")]
    host: String,
    #[arg(long, default_value_t = 9100)]
    port: u16,
    #[arg(long, default_value_t = false)]
    debug: bool,
    #[arg(long, default_value_t = true)]
    show: bool,
}

fn main() -> iced::Result {
    let args = Args::parse();

    tracing_subscriber::fmt()
        .with_max_level(if args.debug {
            tracing::Level::DEBUG
        } else {
            tracing::Level::INFO
        })
        .init();

    let host = args.host.clone();
    let port = args.port;

    iced::daemon(
        "Interactive Terminal",
        app_state::update,
        app_state::view,
    )
    .theme(|_state: &app_state::AppState, _window| iced::Theme::Dark)
    .subscription(app_state::subscription)
    .run_with(move || app_state::init(port, host))
}
