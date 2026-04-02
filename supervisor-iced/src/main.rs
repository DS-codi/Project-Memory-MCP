/// supervisor-iced — Project Memory Supervisor ported from QML/CxxQt to iced.
///
/// Architecture:
///   • AppState  — central state struct (replaces all CxxQt qproperty bindings)
///   • Message   — all user events + async results
///   • update()  — state mutation driven by messages
///   • view()    — pure functional layout from AppState
///
/// Backend async work (HTTP polling, service control) is done via iced Tasks
/// that wrap reqwest calls, identical to the Tokio work done in the CxxQt bridge.

mod app_state;
mod backend;
mod ui;
mod tray;

use tray::TrayAction;

// ─────────────────────────────────────────────────────────────────────────────
// Global tray receiver — populated once in main() before iced starts.
// ─────────────────────────────────────────────────────────────────────────────
static TRAY_RX: std::sync::OnceLock<
    std::sync::Mutex<std::sync::mpsc::Receiver<TrayAction>>,
> = std::sync::OnceLock::new();

use app_state::{AppState, ServiceStatus, ActivityEntry, SessionEntry,
                PlanEntry, WorkspaceEntry, ChatMessage, Overlay};

use iced::{
    widget::{button, column, container, row, scrollable, text, Space},
    Alignment, Background, Border, Color, Element, Length, Task, Theme,
};
use serde::Deserialize;
use notify_rust::Notification;
use clap::Parser;
use std::path::PathBuf;

// ─────────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────────
#[derive(Parser, Debug)]
#[command(name = "supervisor-iced", about = "Project Memory Supervisor")]
struct Args {
    /// Path to supervisor.toml config file
    #[arg(long, default_value_os_t = backend::config::default_config_path())]
    config: PathBuf,
}

// ─────────────────────────────────────────────────────────────────────────────
// Message
// ─────────────────────────────────────────────────────────────────────────────
#[derive(Debug, Clone)]
pub enum Message {
    // ── Tick / polling results ────────────────────────────────────────────────
    StatusTick,
    StatusUpdated(Result<StatusPayload, String>),
    ActivityLoaded(Result<Vec<ActivityEntry>, String>),
    SessionsLoaded(Result<Vec<SessionEntry>, String>),

    // ── Plans panel ───────────────────────────────────────────────────────────
    PlansPanelToggle,
    PlansWorkspaceSelected(String),
    PlansRefresh,
    PlansTabActive,
    PlansTabAll,
    PlanToggle(String),
    PlansLoaded(Result<Vec<PlanEntry>, String>),
    PlansWorkspacesLoaded(Result<Vec<WorkspaceEntry>, String>),
    OpenInDashboard(String, String),
    LaunchAgent(String, String),

    // ── Sprints panel ─────────────────────────────────────────────────────────
    SprintSelected(String),
    SprintsRefresh,
    SprintsLoaded(Result<Vec<app_state::SprintEntry>, String>),
    GoalsLoaded(Result<Vec<app_state::GoalEntry>, String>),
    ToggleGoal(String, String, bool),

    // ── Sessions panel ────────────────────────────────────────────────────────
    StopSession(String),

    // ── Cartographer ──────────────────────────────────────────────────────────
    CartoWorkspaceSelected(String),
    CartoRefresh,
    CartoScan,
    CartoScanResult(Result<String, String>),
    CartoWorkspacesLoaded(Result<Vec<WorkspaceEntry>, String>),

    // ── Plans panel (extra) ───────────────────────────────────────────────────
    PlansMainTabPlans,
    PlansMainTabSprints,
    PlansOpenInIde,
    PlansCreatePlan,

    // ── Event broadcast ───────────────────────────────────────────────────────
    ToggleBroadcast,

    // ── Chatbot panel ─────────────────────────────────────────────────────────
    ChatToggle,
    ChatInputChanged(String),
    ChatSend,
    ChatClear,
    ChatShowSettings,
    ChatApiKeyChanged(String),
    ChatSaveSettings,
    ChatReplyReceived(Result<String, String>),

    // ── Service actions ───────────────────────────────────────────────────────
    RestartService(String),
    StartService(String),
    StopService(String),
    OpenDashboard,
    OpenTerminal,

    // ── Overlays ──────────────────────────────────────────────────────────────
    ShowSettings,
    CloseSettings,
    ShowAbout,
    CloseAbout,
    ShowPairingDialog,
    ClosePairingDialog,
    RefreshPairingQr,
    PairingQrGenerated(Option<String>),

    // ── Settings category navigation ──────────────────────────────────────────
    SettingsCategorySelected(usize),

    // ── Config editor ─────────────────────────────────────────────────────────
    OpenRawConfigEditor,
    ConfigEditorTextChanged(String),
    SaveConfig,
    ConfigSaved(Result<(), String>),

    // ── Shutdown ──────────────────────────────────────────────────────────────
    ShowShutdownDialog,
    CancelShutdown,
    ConfirmShutdown,

    // ── Animation ─────────────────────────────────────────────────────────────
    /// 16 ms tick that advances all active animations.
    AnimationTick,

    // ── System tray ───────────────────────────────────────────────────────────
    /// Poll the tray receiver channel (fires every 200 ms).
    TrayPoll,
    TrayShow,
    MinimizeToTray,
    TrayRestartServices,
    TrayQuit,

    // ── Window lifecycle ──────────────────────────────────────────────────────
    /// User pressed the OS window-close button — intercepted to hide-to-tray.
    WindowCloseRequested(iced::window::Id),

    // ── Chat pop-out window ───────────────────────────────────────────────────
    OpenChatPopout,
    ChatPopoutOpened(iced::window::Id),
    /// User clicked "pop-in" in the collapsed inline placeholder.
    ChatPopoutClosed,

    // ── Misc ──────────────────────────────────────────────────────────────────
    Noop,
}

// ─────────────────────────────────────────────────────────────────────────────
// Async payload types (deserialized from HTTP responses)
// ─────────────────────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Deserialize, Default)]
pub struct StatusPayload {
    pub mcp_status:       Option<String>,
    pub terminal_status:  Option<String>,
    pub dashboard_status: Option<String>,
    pub fallback_status:  Option<String>,
    pub cli_mcp_status:   Option<String>,
    pub mcp_port:         Option<i32>,
    pub mcp_pid:          Option<i32>,
    pub mcp_uptime_secs:  Option<i32>,
    pub mcp_runtime:      Option<String>,
    pub terminal_port:    Option<i32>,
    pub terminal_pid:     Option<i32>,
    pub terminal_uptime_secs: Option<i32>,
    pub terminal_runtime: Option<String>,
    pub dashboard_port:   Option<i32>,
    pub dashboard_pid:    Option<i32>,
    pub dashboard_uptime_secs: Option<i32>,
    pub dashboard_runtime: Option<String>,
    pub total_mcp_connections: Option<i32>,
    pub active_mcp_instances:  Option<i32>,
    pub mcp_instance_distribution: Option<String>,
    pub event_subscriber_count: Option<i32>,
    pub event_broadcast_enabled: Option<bool>,
    pub events_total_emitted: Option<i32>,
    pub action_feedback: Option<String>,
    pub focused_workspace_path: Option<String>,
    pub custom_services_json: Option<String>,
    pub gui_auth_key:       Option<String>,
    pub supervisor_version: Option<String>,
}

// ─────────────────────────────────────────────────────────────────────────────
// init
// ─────────────────────────────────────────────────────────────────────────────
fn init() -> (AppState, Task<Message>) {
    // In daemon mode there is no implicit main window — open it ourselves.
    let (main_id, open_task_raw) = iced::window::open(
        iced::window::Settings {
            size:     iced::Size { width: 1080.0, height: 960.0 },
            min_size: Some(iced::Size { width: 640.0, height: 620.0 }),
            ..Default::default()
        },
    );
    let open_task: Task<Message> = open_task_raw.discard();

    let state = AppState {
        window_visible:           true,
        supervisor_version:       env!("CARGO_PKG_VERSION").to_owned(),
        main_window_id:           Some(main_id),
        // Both sidebars start fully collapsed.
        plans_panel_width:        44.0,
        plans_panel_width_target: 44.0,
        chat_panel_width:         44.0,
        chat_panel_width_target:  44.0,
        ..Default::default()
    };

    (state, Task::batch([
        open_task,
        Task::done(Message::StatusTick),
        Task::done(Message::TrayPoll),
    ]))
}

// ─────────────────────────────────────────────────────────────────────────────
// update
// ─────────────────────────────────────────────────────────────────────────────
fn update(state: &mut AppState, msg: Message) -> Task<Message> {
    match msg {
        // ── Status polling ────────────────────────────────────────────────────
        Message::StatusTick => {
            // Poll /api/supervisor-status on the fallback REST API (port 3465)
            return Task::perform(
                async {
                    fetch_status().await
                },
                Message::StatusUpdated,
            );
        }

        Message::StatusUpdated(Ok(p)) => {
            apply_status_payload(state, &p);
            // Schedule next poll in 3 seconds via a timer subscription (simplified:
            // re-trigger via a one-shot sleep task)
            return Task::perform(
                async {
                    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                    Message::StatusTick
                },
                |m| m,
            );
        }
        Message::StatusUpdated(Err(_)) => {
            return Task::perform(
                async {
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    Message::StatusTick
                },
                |m| m,
            );
        }

        // ── Activity feed ─────────────────────────────────────────────────────
        Message::ActivityLoaded(Ok(entries)) => {
            // Fire a desktop notification when a focused_workspace_generated event
            // arrives while the window is hidden (Phase 2b).
            if !state.window_visible && !entries.is_empty() {
                let key = format!("{}{}", entries[0].agent, entries[0].event);
                if key != state.last_activity_key
                    && entries[0].event.contains("focused_workspace_generated")
                {
                    state.last_activity_key = key;
                    let _ = Notification::new()
                        .summary("Project Memory Supervisor")
                        .body("Focused workspace generated")
                        .show();
                }
            }
            state.activity = entries;
        }
        Message::ActivityLoaded(Err(_)) => {}

        // ── Sessions ──────────────────────────────────────────────────────────
        Message::SessionsLoaded(Ok(sessions)) => {
            state.sessions = sessions;
        }
        Message::SessionsLoaded(Err(_)) => {}

        Message::StopSession(key) => {
            let mcp_base = state.mcp_base_url();
            return Task::perform(
                async move { stop_session(&mcp_base, &key).await },
                |_| Message::Noop,
            );
        }

        // ── Plans panel ───────────────────────────────────────────────────────
        Message::PlansPanelToggle => {
            state.plans_panel_expanded = !state.plans_panel_expanded;
            state.plans_panel_width_target = if state.plans_panel_expanded { 460.0 } else { 44.0 };
            state.animation_running = true;
            if state.plans_panel_expanded && state.plans_workspaces.is_empty() {
                let base = state.mcp_base_url();
                return Task::perform(
                    async move { fetch_workspaces(&base).await },
                    Message::PlansWorkspacesLoaded,
                );
            }
        }

        Message::PlansWorkspaceSelected(name) => {
            if let Some(idx) = state.plans_workspaces.iter().position(|w| w.name == name) {
                state.plans_workspace_index = idx;
            }
            let base = state.mcp_base_url();
            let ws_id = state.plans_workspaces
                .get(state.plans_workspace_index)
                .map(|w| w.id.clone())
                .unwrap_or_default();
            let tab = state.plans_tab;
            return Task::perform(
                async move { fetch_plans(&base, &ws_id, tab).await },
                Message::PlansLoaded,
            );
        }

        Message::PlansRefresh => {
            let base = state.mcp_base_url();
            let ws_id = state.plans_workspaces
                .get(state.plans_workspace_index)
                .map(|w| w.id.clone())
                .unwrap_or_default();
            let tab = state.plans_tab;
            return Task::perform(
                async move { fetch_plans(&base, &ws_id, tab).await },
                Message::PlansLoaded,
            );
        }

        Message::PlansTabActive => {
            state.plans_tab = 0;
            return update(state, Message::PlansRefresh);
        }

        Message::PlansTabAll => {
            state.plans_tab = 1;
            return update(state, Message::PlansRefresh);
        }

        Message::PlanToggle(plan_id) => {
            if let Some(p) = state.plans.iter_mut().find(|p| p.plan_id == plan_id) {
                p.expanded = !p.expanded;
                p.expanded_height_target = if p.expanded { 180.0 } else { 0.0 };
                state.animation_running = true;
            }
        }

        Message::PlansLoaded(Ok(plans)) => {
            state.plans = plans;
        }
        Message::PlansLoaded(Err(_)) => {}

        Message::PlansWorkspacesLoaded(Ok(workspaces)) => {
            state.plans_workspaces = workspaces.clone();
            state.carto_workspaces = workspaces;
            if !state.plans_workspaces.is_empty() {
                return update(state, Message::PlansRefresh);
            }
        }
        Message::PlansWorkspacesLoaded(Err(_)) => {}

        Message::OpenInDashboard(ws_id, plan_id) => {
            let url = format!(
                "{}/workspace/{}/plan/{}",
                state.dash_base_url(),
                ws_id,
                plan_id
            );
            let _ = open::that(url);
        }

        Message::LaunchAgent(ws_id, plan_id) => {
            let base = format!("http://127.0.0.1:{}", state.mcp.port);
            return Task::perform(
                async move { launch_agent(&base, &ws_id, &plan_id).await },
                |_| Message::Noop,
            );
        }

        // ── Sprints ───────────────────────────────────────────────────────────
        Message::SprintSelected(sprint_id) => {
            if state.selected_sprint_id == sprint_id {
                state.selected_sprint_id.clear();
                state.sprint_goals.clear();
            } else {
                state.selected_sprint_id = sprint_id.clone();
                let base = state.dash_base_url();
                return Task::perform(
                    async move { fetch_goals(&base, &sprint_id).await },
                    Message::GoalsLoaded,
                );
            }
        }

        Message::SprintsRefresh => {
            let base = state.dash_base_url();
            let ws_id = state.plans_workspaces
                .get(state.plans_workspace_index)
                .map(|w| w.id.clone())
                .unwrap_or_default();
            return Task::perform(
                async move { fetch_sprints(&base, &ws_id).await },
                Message::SprintsLoaded,
            );
        }

        Message::SprintsLoaded(Ok(sprints)) => {
            state.sprints = sprints;
        }
        Message::SprintsLoaded(Err(_)) => {}

        Message::GoalsLoaded(Ok(goals)) => {
            state.sprint_goals = goals;
        }
        Message::GoalsLoaded(Err(_)) => {}

        Message::ToggleGoal(sprint_id, goal_id, completed) => {
            let base = state.dash_base_url();
            return Task::perform(
                async move { toggle_goal(&base, &sprint_id, &goal_id, completed).await },
                |_| Message::SprintsRefresh,
            );
        }

        // ── Cartographer ──────────────────────────────────────────────────────
        Message::CartoWorkspaceSelected(name) => {
            if let Some(idx) = state.carto_workspaces.iter().position(|w| w.name == name) {
                state.carto_workspace_index = idx;
            }
        }

        Message::CartoRefresh => {
            let base = state.mcp_base_url();
            return Task::perform(
                async move { fetch_workspaces(&base).await },
                Message::CartoWorkspacesLoaded,
            );
        }

        Message::CartoWorkspacesLoaded(Ok(ws)) => {
            state.carto_workspaces = ws;
        }
        Message::CartoWorkspacesLoaded(Err(_)) => {}

        Message::CartoScan => {
            let base = state.mcp_base_url();
            let ws_id = state.carto_workspaces
                .get(state.carto_workspace_index)
                .map(|w| w.id.clone())
                .unwrap_or_default();
            state.carto_status = "Scanning…".to_owned();
            return Task::perform(
                async move { run_cartographer(&base, &ws_id).await },
                Message::CartoScanResult,
            );
        }

        Message::CartoScanResult(Ok(msg)) => {
            state.carto_status = msg;
        }
        Message::CartoScanResult(Err(e)) => {
            state.carto_status = format!("Error: {}", e);
        }

        // ── Chatbot ───────────────────────────────────────────────────────────
        Message::ChatToggle => {
            state.chat_expanded = !state.chat_expanded;
            state.chat_panel_width_target = if state.chat_expanded { 380.0 } else { 44.0 };
            state.animation_running = true;
        }

        Message::ChatInputChanged(s) => {
            state.chat_input = s;
        }

        Message::ChatSend => {
            if state.chat_busy || state.chat_input.trim().is_empty() {
                return Task::none();
            }
            let content = state.chat_input.trim().to_owned();
            state.chat_messages.push(ChatMessage {
                role: "user".to_owned(),
                content: content.clone(),
                is_tool_call: false,
            });
            state.chat_input.clear();
            state.chat_busy = true;

            let gui_base = format!("http://127.0.0.1:3464");
            let auth_key = state.gui_auth_key.clone();
            let ws_id = state.chat_workspaces
                .get(state.chat_workspace_index)
                .map(|w| w.id.clone());
            let history: Vec<(String, String)> = state.chat_messages
                .iter()
                .filter(|m| !m.is_tool_call)
                .map(|m| (m.role.clone(), m.content.clone()))
                .collect();

            return Task::perform(
                async move {
                    send_chat_message(&gui_base, &auth_key, ws_id.as_deref(), &history).await
                },
                Message::ChatReplyReceived,
            );
        }

        Message::ChatReplyReceived(Ok(reply)) => {
            state.chat_busy = false;
            state.chat_messages.push(ChatMessage {
                role: "assistant".to_owned(),
                content: reply,
                is_tool_call: false,
            });
        }
        Message::ChatReplyReceived(Err(e)) => {
            state.chat_busy = false;
            state.chat_messages.push(ChatMessage {
                role: "assistant".to_owned(),
                content: format!("Error: {}", e),
                is_tool_call: false,
            });
        }

        Message::ChatClear => {
            state.chat_messages.clear();
            state.chat_input.clear();
        }

        Message::ChatShowSettings => {
            state.chat_show_settings = !state.chat_show_settings;
        }

        Message::ChatApiKeyChanged(s) => {
            state.chat_api_key_input = s;
        }

        Message::ChatSaveSettings => {
            if !state.chat_api_key_input.trim().is_empty() {
                state.chat_key_configured = true;
            }
            state.chat_show_settings = false;
        }

        // ── Plans extras ──────────────────────────────────────────────────────
        Message::PlansMainTabPlans => {
            state.plans_main_tab = 0;
        }
        Message::PlansMainTabSprints => {
            state.plans_main_tab = 1;
            if state.sprints.is_empty() {
                return update(state, Message::SprintsRefresh);
            }
        }
        Message::PlansOpenInIde => {
            if let Some(ws) = state.plans_workspaces.get(state.plans_workspace_index) {
                let _ = open::that(ws.id.clone());
            }
        }
        Message::PlansCreatePlan => {}

        // ── Event broadcast ───────────────────────────────────────────────────
        Message::ToggleBroadcast => {
            // Optimistic toggle — backend will correct on next poll
            state.event_broadcast_enabled = !state.event_broadcast_enabled;
        }

        // ── Service actions ───────────────────────────────────────────────────
        Message::RestartService(name) => {
            let port: u16 = 3465;
            return Task::perform(
                async move { service_action(port, &name, "restart").await },
                |_| Message::Noop,
            );
        }
        Message::StartService(name) => {
            let port: u16 = 3465;
            return Task::perform(
                async move { service_action(port, &name, "start").await },
                |_| Message::Noop,
            );
        }
        Message::StopService(name) => {
            let port: u16 = 3465;
            return Task::perform(
                async move { service_action(port, &name, "stop").await },
                |_| Message::Noop,
            );
        }

        Message::OpenDashboard => {
            let url = state.dashboard_url.clone();
            let _ = open::that(url);
        }
        Message::OpenTerminal => {
            let url = state.terminal_url.clone();
            let _ = open::that(url);
        }

        // ── Overlays ──────────────────────────────────────────────────────────
        Message::ShowSettings => {
            state.overlay = Overlay::Settings;
        }
        Message::CloseSettings => {
            state.overlay = Overlay::None;
        }
        Message::ShowAbout => {
            state.overlay = Overlay::About;
        }
        Message::CloseAbout => {
            state.overlay = Overlay::None;
        }
        Message::ShowPairingDialog => {
            state.overlay = Overlay::PairingDialog;
            return update(state, Message::RefreshPairingQr);
        }
        Message::ClosePairingDialog => {
            state.overlay = Overlay::None;
        }
        Message::RefreshPairingQr => {
            let key = state.pairing_api_key.clone();
            let mcp_port = state.mcp.port;
            return Task::perform(
                async move {
                    let data = format!("http://127.0.0.1:{}/pair?key={}", mcp_port, key);
                    ui::pairing_dialog::generate_qr_svg(&data)
                },
                Message::PairingQrGenerated,
            );
        }
        Message::PairingQrGenerated(svg) => {
            state.pairing_qr_svg = svg.unwrap_or_default();
        }

        Message::SettingsCategorySelected(cat) => {
            state.settings_active_cat = cat;
        }

        // ── Config editor ─────────────────────────────────────────────────────
        Message::OpenRawConfigEditor => {
            state.overlay = Overlay::ConfigEditor;
        }
        Message::ConfigEditorTextChanged(s) => {
            state.config_editor_text = s;
        }
        Message::SaveConfig => {
            let port: u16 = 3465;
            let toml = state.config_editor_text.clone();
            return Task::perform(
                async move { save_config(port, &toml).await },
                Message::ConfigSaved,
            );
        }
        Message::ConfigSaved(Ok(())) => {
            state.overlay = Overlay::None;
            state.config_editor_error.clear();
        }
        Message::ConfigSaved(Err(e)) => {
            state.config_editor_error = e;
        }

        // ── Shutdown ──────────────────────────────────────────────────────────
        Message::ShowShutdownDialog => {
            state.shutdown_dialog_visible = true;
        }
        Message::CancelShutdown => {
            state.shutdown_dialog_visible = false;
        }
        Message::ConfirmShutdown => {
            let port: u16 = 3465;
            return Task::perform(
                async move { service_action(port, "supervisor", "stop").await },
                |_| Message::Noop,
            );
        }

        // ── Animation tick ────────────────────────────────────────────────────
        Message::AnimationTick => {
            const EASE: f32 = 0.25; // fraction of remaining distance moved per 16 ms frame

            let mut still_moving = false;

            macro_rules! lerp_f32 {
                ($cur:expr, $tgt:expr) => {{
                    let d = $tgt - $cur;
                    if d.abs() < 0.5 {
                        $cur = $tgt;
                    } else {
                        $cur += d * EASE;
                        still_moving = true;
                    }
                }};
            }

            lerp_f32!(state.plans_panel_width, state.plans_panel_width_target);
            lerp_f32!(state.chat_panel_width,  state.chat_panel_width_target);

            for plan in &mut state.plans {
                lerp_f32!(plan.expanded_height, plan.expanded_height_target);
            }

            state.animation_running = still_moving;
        }

        // ── Tray polling ──────────────────────────────────────────────────────
        Message::TrayPoll => {
            let mut pending: Vec<Task<Message>> = Vec::new();

            if let Some(rx_mutex) = TRAY_RX.get() {
                if let Ok(rx) = rx_mutex.try_lock() {
                    while let Ok(action) = rx.try_recv() {
                        let msg = match action {
                            TrayAction::Show           => Message::TrayShow,
                            TrayAction::Minimize       => Message::MinimizeToTray,
                            TrayAction::RestartServices => Message::TrayRestartServices,
                            TrayAction::Quit           => Message::TrayQuit,
                        };
                        pending.push(Task::done(msg));
                    }
                }
            }

            // Schedule next poll in 200 ms.
            pending.push(Task::perform(
                async { tokio::time::sleep(std::time::Duration::from_millis(200)).await; },
                |_| Message::TrayPoll,
            ));

            return Task::batch(pending);
        }

        Message::TrayShow => {
            state.window_visible = true;
            if let Some(id) = state.main_window_id {
                return iced::window::change_mode(id, iced::window::Mode::Windowed);
            }
        }

        Message::MinimizeToTray => {
            state.window_visible = false;
            if let Some(id) = state.main_window_id {
                return iced::window::change_mode(id, iced::window::Mode::Hidden);
            }
        }

        Message::TrayRestartServices => {
            let port: u16 = 3465;
            return Task::perform(
                async move { service_action(port, "all", "restart").await },
                |_| Message::Noop,
            );
        }

        Message::TrayQuit => {
            // Flag so the close-request interceptor lets it through.
            state.quitting = true;
            if let Some(id) = state.main_window_id {
                return iced::window::close(id);
            }
        }

        // ── Window close interception ─────────────────────────────────────────
        Message::WindowCloseRequested(id) => {
            if state.main_window_id == Some(id) {
                if state.quitting {
                    return iced::window::close(id);
                }
                // Hide to tray instead of exiting.
                state.window_visible = false;
                return iced::window::change_mode(id, iced::window::Mode::Hidden);
            }
            // Chat pop-out closed by user.
            if Some(id) == state.chat_popout_window_id {
                state.chat_popped_out = false;
                state.chat_popout_window_id = None;
                // Restore inline panel to whatever chat_expanded says.
                state.chat_panel_width_target = if state.chat_expanded { 380.0 } else { 44.0 };
                state.animation_running = true;
                return iced::window::close(id);
            }
        }

        // ── Chat pop-out window ───────────────────────────────────────────────
        Message::OpenChatPopout => {
            if state.chat_popped_out {
                // Already open — bring it to the foreground if possible.
                return Task::none();
            }
            state.chat_popped_out = true;
            // Collapse the inline panel.
            state.chat_panel_width_target = 44.0;
            state.animation_running = true;

            let settings = iced::window::Settings {
                size:     iced::Size { width: 480.0, height: 720.0 },
                resizable: true,
                ..Default::default()
            };
            let (id, open_task) = iced::window::open(settings);
            state.chat_popout_window_id = Some(id);
            return open_task.discard();
        }

        Message::ChatPopoutOpened(_) => {
            // ID is captured synchronously in OpenChatPopout; this variant is kept for
            // compatibility but has no effect.
        }

        Message::ChatPopoutClosed => {
            if let Some(id) = state.chat_popout_window_id.take() {
                state.chat_popped_out = false;
                state.chat_panel_width_target = if state.chat_expanded { 380.0 } else { 44.0 };
                state.animation_running = true;
                return iced::window::close(id);
            }
        }

        Message::Noop => {}
    }

    Task::none()
}

// ─────────────────────────────────────────────────────────────────────────────
// subscription
// ─────────────────────────────────────────────────────────────────────────────
fn subscription(state: &AppState) -> iced::Subscription<Message> {
    let mut subs: Vec<iced::Subscription<Message>> = Vec::new();

    // 16 ms animation tick — only subscribed while something is moving.
    if state.animation_running {
        subs.push(
            iced::time::every(std::time::Duration::from_millis(16))
                .map(|_| Message::AnimationTick),
        );
    }

    // Intercept window-close requests (hide-to-tray instead of exit).
    subs.push(
        iced::window::close_requests().map(Message::WindowCloseRequested),
    );

    iced::Subscription::batch(subs)
}

// ─────────────────────────────────────────────────────────────────────────────
// view  (multi-window — called once per open window)
// ─────────────────────────────────────────────────────────────────────────────
fn view(state: &AppState, window: iced::window::Id) -> Element<'_, Message> {
    // ── Chat pop-out window ───────────────────────────────────────────────────
    if state.chat_popout_window_id == Some(window) {
        use ui::{chatbot_panel, theme};

        let chat = chatbot_panel::view(
            state,
            true, // standalone
            Message::Noop,
            |s| Message::ChatInputChanged(s),
            Message::ChatSend,
            Message::ChatClear,
            Message::ChatShowSettings,
            |s| Message::ChatApiKeyChanged(s),
            Message::ChatSaveSettings,
            Message::Noop, // no pop-out button inside the popout
        );

        return iced::widget::container(chat)
            .width(Length::Fill)
            .height(Length::Fill)
            .style(|_| iced::widget::container::Style {
                background: Some(Background::Color(theme::BG_WINDOW)),
                ..Default::default()
            })
            .into();
    }

    // ── Main window view ──────────────────────────────────────────────────────
    view_main(state)
}

fn view_main(state: &AppState) -> Element<'_, Message> {
    use ui::{
        service_card::{view as card_view, ServiceCardConfig},
        service_icon::ServiceIconKind,
        activity_panel, sessions_panel, mcp_proxy_panel, event_broadcast_panel,
        cartographer_panel, chatbot_panel, plans_panel, about_panel,
        settings_panel::{view as settings_view, SettingsState},
        pairing_dialog,
        theme,
    };

    // ── Header ────────────────────────────────────────────────────────────────
    let logo = container(
        text("pm").size(12).color(Color::WHITE),
    )
    .width(Length::Fixed(36.0))
    .height(Length::Fixed(36.0))
    .style(|_| iced::widget::container::Style {
        background: Some(Background::Color(Color::from_rgb8(0x11, 0x11, 0x11))),
        border: Border {
            color: Color::from_rgb8(0xff, 0xde, 0x59),
            width: 1.0,
            radius: 0.0.into(),
        },
        ..Default::default()
    });

    let header = row![
        logo,
        text("PROJECT MEMORY SUPERVISOR")
            .size(16)
            .color(theme::TEXT_PRIMARY),
        Space::new(Length::Fill, 0.0),
        button(text("Shut Down").size(12))
            .on_press(Message::ShowShutdownDialog),
    ]
    .spacing(10)
    .align_y(Alignment::Center)
    .width(Length::Fill);

    // ── MCP servers grid ──────────────────────────────────────────────────────
    let mcp_card = card_view(ServiceCardConfig {
        service_name:           "MCP Server",
        status:                 &state.mcp.status,
        accent_color:           Color::from_rgb8(0xff, 0x90, 0xe8),
        icon_kind:              ServiceIconKind::McpServer,
        icon_bg_color:          Color::from_rgb8(0x1a, 0x16, 0x28),
        info_line1:             format!("PID: {}   Port: {}", state.mcp.pid, state.mcp.port),
        info_line2:             format!("Runtime: {}   Up: {}s", state.mcp.runtime, state.mcp.uptime_secs),
        info_always:            "",
        offline_text:           "Service offline",
        primary_action_label:   "Restart",
        primary_action_enabled: true,
        on_primary_action:      Message::RestartService("mcp".to_owned()),
        secondary_action_label: Some("Manage"),
        secondary_action_enabled: true,
        on_secondary_action:    None::<Message>,
        show_runtime_strip:     false,
        runtime_strip_label:    "runtime",
        runtime_strip_value:    "--",
    });

    let cli_mcp_card = card_view(ServiceCardConfig {
        service_name:           "CLI MCP Server",
        status:                 &state.cli_mcp.status,
        accent_color:           Color::from_rgb8(0x26, 0xc6, 0xda),
        icon_kind:              ServiceIconKind::CliMcpServer,
        icon_bg_color:          Color::from_rgb8(0x0a, 0x1e, 0x25),
        info_line1:             "Port: 3466".to_owned(),
        info_line2:             "HTTP-only · CLI agents".to_owned(),
        info_always:            if !matches!(state.cli_mcp.status, ServiceStatus::Running) {
                                    "http://127.0.0.1:3466/mcp"
                                } else { "" },
        offline_text:           "Service offline",
        primary_action_label:   "Restart",
        primary_action_enabled: true,
        on_primary_action:      Message::RestartService("cli_mcp".to_owned()),
        secondary_action_label: None,
        secondary_action_enabled: false,
        on_secondary_action:    None::<Message>,
        show_runtime_strip:     false,
        runtime_strip_label:    "",
        runtime_strip_value:    "",
    });

    let mcp_grid = row![mcp_card, cli_mcp_card]
        .spacing(8)
        .width(Length::Fill);

    // ── Services grid ─────────────────────────────────────────────────────────
    let terminal_label = if matches!(state.terminal.status, ServiceStatus::Running) {
        "Stop"
    } else {
        "Start"
    };
    let terminal_on_primary = if matches!(state.terminal.status, ServiceStatus::Running) {
        Message::StopService("terminal".to_owned())
    } else {
        Message::StartService("terminal".to_owned())
    };
    let terminal_enabled = !matches!(
        state.terminal.status,
        ServiceStatus::Starting | ServiceStatus::Stopping
    );

    let terminal_card = card_view(ServiceCardConfig {
        service_name:           "Interactive Terminal",
        status:                 &state.terminal.status,
        accent_color:           Color::from_rgb8(0x38, 0xb6, 0xff),
        icon_kind:              ServiceIconKind::Terminal,
        icon_bg_color:          Color::from_rgb8(0x0d, 0x1f, 0x30),
        info_line1:             format!("PID: {}   Port: {}", state.terminal.pid, state.terminal.port),
        info_line2:             format!("Runtime: {}   Up: {}s", state.terminal.runtime, state.terminal.uptime_secs),
        info_always:            "",
        offline_text:           "",
        primary_action_label:   terminal_label,
        primary_action_enabled: terminal_enabled,
        on_primary_action:      terminal_on_primary,
        secondary_action_label: Some("Open"),
        secondary_action_enabled: !state.terminal_url.is_empty(),
        on_secondary_action:    Some(Message::OpenTerminal),
        show_runtime_strip:     true,
        runtime_strip_label:    "runtime",
        runtime_strip_value:    if matches!(state.terminal.status, ServiceStatus::Running) {
                                    &state.terminal.runtime
                                } else { "--" },
    });

    let dashboard_card = card_view(ServiceCardConfig {
        service_name:           "Dashboard",
        status:                 &state.dashboard.status,
        accent_color:           Color::from_rgb8(0x42, 0xa5, 0xf5),
        icon_kind:              ServiceIconKind::Dashboard,
        icon_bg_color:          Color::from_rgb8(0x0d, 0x1f, 0x2e),
        info_line1:             format!("PID: {}   Port: {}", state.dashboard.pid, state.dashboard.port),
        info_line2:             format!("Runtime: {}   Up: {}s", state.dashboard.runtime, state.dashboard.uptime_secs),
        info_always:            "",
        offline_text:           "Service offline",
        primary_action_label:   "Restart",
        primary_action_enabled: true,
        on_primary_action:      Message::RestartService("dashboard".to_owned()),
        secondary_action_label: Some("Visit"),
        secondary_action_enabled: !state.dashboard_url.is_empty(),
        on_secondary_action:    Some(Message::OpenDashboard),
        show_runtime_strip:     false,
        runtime_strip_label:    "",
        runtime_strip_value:    "",
    });

    let fallback_card = card_view(ServiceCardConfig {
        service_name:           "Fallback API",
        status:                 &state.fallback.status,
        accent_color:           Color::from_rgb8(0xef, 0x53, 0x50),
        icon_kind:              ServiceIconKind::FallbackApi,
        icon_bg_color:          Color::from_rgb8(0x2a, 0x0d, 0x0d),
        info_line1:             String::new(),
        info_line2:             String::new(),
        info_always:            "Proxy route: /api/fallback/*",
        offline_text:           "Service offline",
        primary_action_label:   "Restart",
        primary_action_enabled: true,
        on_primary_action:      Message::RestartService("fallback_api".to_owned()),
        secondary_action_label: None,
        secondary_action_enabled: false,
        on_secondary_action:    None::<Message>,
        show_runtime_strip:     false,
        runtime_strip_label:    "",
        runtime_strip_value:    "",
    });

    let services_grid = row![terminal_card, dashboard_card]
        .spacing(8)
        .width(Length::Fill);

    // Fallback sits alone in its own row for now (or could be 2-column)
    let services_row2 = row![fallback_card]
        .spacing(8)
        .width(Length::Fill);

    // ── Sessions + Activity row ───────────────────────────────────────────────
    let sessions = sessions_panel::view(state, |key| Message::StopSession(key));
    let activity = activity_panel::view(state);
    let sessions_activity = row![sessions, activity].spacing(8).width(Length::Fill);

    // ── Cartographer + Proxy + Events row ─────────────────────────────────────
    let carto = cartographer_panel::view(
        state,
        |name| Message::CartoWorkspaceSelected(name),
        Message::CartoRefresh,
        Message::CartoScan,
    );

    let proxy  = mcp_proxy_panel::view(state);
    let events = event_broadcast_panel::view(state, Message::ToggleBroadcast);

    let right_col = column![proxy, events].spacing(8).width(Length::Fill);
    let carto_row = row![carto, right_col].spacing(8).width(Length::Fill);

    // ── Action feedback ───────────────────────────────────────────────────────
    let feedback: Element<'_, Message> = if !state.action_feedback.is_empty() {
        text(state.action_feedback.clone())
            .size(11)
            .color(theme::TEXT_SECONDARY)
            .width(Length::Fill)
            .into()
    } else {
        Space::new(0.0, 0.0).into()
    };

    // ── Scrollable content column ─────────────────────────────────────────────
    let content = scrollable(
        column![
            text("MCP SERVERS").size(10).color(theme::TEXT_SECONDARY),
            mcp_grid,
            text("SERVICES").size(10).color(theme::TEXT_SECONDARY),
            services_grid,
            services_row2,
            sessions_activity,
            carto_row,
            feedback,
        ]
        .spacing(8)
        .width(Length::Fill),
    )
    .height(Length::Fill)
    .width(Length::Fill);

    // ── Plans panel (left sidebar) ────────────────────────────────────────────
    let plans = plans_panel::view(
        state,
        Message::PlansPanelToggle,
        |name| Message::PlansWorkspaceSelected(name),
        Message::PlansRefresh,
        Message::PlansMainTabPlans,
        Message::PlansMainTabSprints,
        Message::PlansTabActive,
        Message::PlansTabAll,
        |id| Message::PlanToggle(id),
        |ws, p| Message::OpenInDashboard(ws, p),
        |ws, p| Message::LaunchAgent(ws, p),
        Message::PlansOpenInIde,
        Message::PlansCreatePlan,
        |id| Message::SprintSelected(id),
        Message::SprintsRefresh,
        |sid, gid, done| Message::ToggleGoal(sid, gid, done),
    );

    // ── Chatbot panel (right sidebar) ─────────────────────────────────────────
    let chat = chatbot_panel::view(
        state,
        false, // sidebar mode
        Message::ChatToggle,
        |s| Message::ChatInputChanged(s),
        Message::ChatSend,
        Message::ChatClear,
        Message::ChatShowSettings,
        |s| Message::ChatApiKeyChanged(s),
        Message::ChatSaveSettings,
        Message::OpenChatPopout,
    );

    // ── Center area = plans | scroll | chat ───────────────────────────────────
    let main_area = row![plans, content, chat]
        .spacing(0)
        .width(Length::Fill)
        .height(Length::Fill);

    // ── Footer ────────────────────────────────────────────────────────────────
    let footer = row![
        Space::new(Length::Fill, 0.0),
        button(text("⚙  Settings").size(12)).on_press(Message::ShowSettings),
        button(text("Minimize to Tray").size(12)).on_press(Message::MinimizeToTray),
    ]
    .spacing(8)
    .align_y(Alignment::Center)
    .width(Length::Fill);

    // ── Root layout ───────────────────────────────────────────────────────────
    let root = container(
        column![header, main_area, footer]
            .spacing(8)
            .padding(12)
            .width(Length::Fill)
            .height(Length::Fill),
    )
    .width(Length::Fill)
    .height(Length::Fill)
    .style(|_| iced::widget::container::Style {
        background: Some(Background::Color(theme::BG_WINDOW)),
        ..Default::default()
    });

    // ── Overlay layer ─────────────────────────────────────────────────────────
    let settings_visible = matches!(&state.overlay, Overlay::Settings | Overlay::ConfigEditor);
    let ss = SettingsState {
        visible:    settings_visible,
        active_cat: state.settings_active_cat,
    };

    let mut z_stack: Vec<Element<'_, Message>> = vec![root.into()];

    match &state.overlay {
        Overlay::About => {
            z_stack.push(about_panel::view(state, Message::CloseAbout));
        }
        Overlay::PairingDialog => {
            z_stack.push(pairing_dialog::view(
                state,
                Message::ClosePairingDialog,
                Message::RefreshPairingQr,
            ));
        }
        Overlay::Settings | Overlay::ConfigEditor => {
            z_stack.push(settings_view(
                state,
                &ss,
                Message::CloseSettings,
                Message::SaveConfig,
                Message::OpenRawConfigEditor,
                |cat| Message::SettingsCategorySelected(cat),
            ));
        }
        Overlay::None => {}
    }

    // Shutdown confirmation dialog overlay
    if state.shutdown_dialog_visible {
        z_stack.push(shutdown_dialog());
    }

    // Use iced stack widget to layer elements — last element renders on top.
    if z_stack.len() == 1 {
        z_stack.pop().unwrap()
    } else {
        iced::widget::stack(z_stack).into()
    }
}

fn shutdown_dialog<'a>() -> Element<'a, Message> {
    let dialog = container(
        column![
            text("Shut Down Supervisor?")
                .size(16)
                .color(ui::theme::TEXT_PRIMARY),
            Space::new(0.0, 8.0),
            text("This will stop all managed services and close the supervisor.")
                .size(13)
                .color(ui::theme::TEXT_PRIMARY)
                .width(Length::Fixed(360.0)),
            Space::new(0.0, 16.0),
            row![
                Space::new(Length::Fill, 0.0),
                button(text("Cancel").size(12)).on_press(Message::CancelShutdown),
                button(text("Shut Down").size(12)).on_press(Message::ConfirmShutdown),
            ]
            .spacing(8)
            .align_y(Alignment::Center),
        ]
        .padding(20),
    )
    .style(|_| iced::widget::container::Style {
        background: Some(Background::Color(ui::theme::BG_CARD)),
        border: Border {
            color: ui::theme::CLR_STOPPED,
            width: 1.0,
            radius: 4.0.into(),
        },
        ..Default::default()
    });

    container(dialog)
        .width(Length::Fill)
        .height(Length::Fill)
        .align_x(Alignment::Center)
        .align_y(Alignment::Center)
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(Color { r: 0.0, g: 0.0, b: 0.0, a: 0.6 })),
            ..Default::default()
        })
        .into()
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────
fn main() -> iced::Result {
    tracing_subscriber::fmt::init();

    // ── CLI args & config ─────────────────────────────────────────────────────
    let args = Args::parse();
    let _config = backend::config::load_config(&args.config)
        .unwrap_or_else(|e| {
            eprintln!("Warning: failed to load config from {:?}: {e}", args.config);
            backend::config::SupervisorConfig::default()
        });

    // ── Single-instance lock ──────────────────────────────────────────────────
    let lock_path = backend::lock::default_lock_path();
    let lock_result = backend::lock::try_acquire(&lock_path, std::time::Duration::from_secs(10))
        .expect("failed to acquire supervisor lock");
    let _lock_guard = match lock_result {
        backend::lock::LockResult::AlreadyRunning(pid) => {
            eprintln!("supervisor-iced is already running (PID {pid}). Exiting.");
            std::process::exit(1);
        }
        backend::lock::LockResult::Stale => {
            eprintln!("Warning: stale lock file found, proceeding anyway.");
            None
        }
        backend::lock::LockResult::Acquired(lock) => {
            // lock held for the lifetime of the process
            Some(lock)
        }
    };

    // ── System tray ───────────────────────────────────────────────────────────
    // Initialise before the iced event loop so the icon attaches to the main
    // thread (required by winit / Windows message pump).
    let (tray_tx, tray_rx) = std::sync::mpsc::sync_channel::<TrayAction>(64);
    TRAY_RX.set(std::sync::Mutex::new(tray_rx)).ok();
    // Keep the TrayIcon alive for the entire process lifetime.
    let _tray_icon = tray::init_tray(tray_tx);

    iced::daemon("Project Memory Supervisor", update, view)
        .theme(|_state: &AppState, _window| Theme::Dark)
        .subscription(subscription)
        .run_with(init)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: apply status payload to AppState
// ─────────────────────────────────────────────────────────────────────────────
fn apply_status_payload(state: &mut AppState, p: &StatusPayload) {
    if let Some(s) = &p.mcp_status       { state.mcp.status       = ServiceStatus::from_str(s); }
    if let Some(s) = &p.terminal_status  { state.terminal.status  = ServiceStatus::from_str(s); }
    if let Some(s) = &p.dashboard_status { state.dashboard.status = ServiceStatus::from_str(s); }
    if let Some(s) = &p.fallback_status  { state.fallback.status  = ServiceStatus::from_str(s); }
    if let Some(s) = &p.cli_mcp_status   { state.cli_mcp.status   = ServiceStatus::from_str(s); }

    macro_rules! opt_set {
        ($field:expr, $src:expr) => { if let Some(v) = $src { $field = v; } };
    }
    opt_set!(state.mcp.port,          p.mcp_port);
    opt_set!(state.mcp.pid,           p.mcp_pid);
    opt_set!(state.mcp.uptime_secs,   p.mcp_uptime_secs);
    if let Some(r) = &p.mcp_runtime   { state.mcp.runtime       = r.clone(); }
    opt_set!(state.terminal.port,     p.terminal_port);
    opt_set!(state.terminal.pid,      p.terminal_pid);
    opt_set!(state.terminal.uptime_secs, p.terminal_uptime_secs);
    if let Some(r) = &p.terminal_runtime { state.terminal.runtime = r.clone(); }
    opt_set!(state.dashboard.port,    p.dashboard_port);
    opt_set!(state.dashboard.pid,     p.dashboard_pid);
    opt_set!(state.dashboard.uptime_secs, p.dashboard_uptime_secs);
    if let Some(r) = &p.dashboard_runtime { state.dashboard.runtime = r.clone(); }

    if let Some(v) = p.total_mcp_connections {
        let prev = state.total_mcp_connections;
        state.total_mcp_connections = v;
        if prev != v {
            state.mcp_connection_history.push(v);
            if state.mcp_connection_history.len() > 40 {
                state.mcp_connection_history.remove(0);
            }
        }
    }
    opt_set!(state.active_mcp_instances, p.active_mcp_instances);
    if let Some(d) = &p.mcp_instance_distribution { state.mcp_instance_distribution = d.clone(); }
    opt_set!(state.event_subscriber_count, p.event_subscriber_count);
    opt_set!(state.event_broadcast_enabled, p.event_broadcast_enabled);
    opt_set!(state.events_total_emitted, p.events_total_emitted);
    if let Some(f) = &p.action_feedback { state.action_feedback = f.clone(); }
    if let Some(f) = &p.focused_workspace_path { state.focused_workspace_path = f.clone(); }
    if let Some(k) = &p.gui_auth_key { state.gui_auth_key = k.clone(); }
    if let Some(v) = &p.supervisor_version { state.supervisor_version = v.clone(); }
    if let Some(j) = &p.custom_services_json {
        state.custom_services_json = j.clone();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Async HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────
async fn fetch_status() -> Result<StatusPayload, String> {
    let url = "http://127.0.0.1:3465/api/fallback/services";
    let resp = reqwest::get(url).await.map_err(|e| e.to_string())?;
    let text = resp.text().await.map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

async fn fetch_workspaces(mcp_base: &str) -> Result<Vec<WorkspaceEntry>, String> {
    #[derive(Deserialize)]
    struct Resp { workspaces: Vec<WsItem> }
    #[derive(Deserialize)]
    struct WsItem { id: String, name: Option<String> }

    let url = format!("{}/admin/workspaces", mcp_base);
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let r: Resp = resp.json().await.map_err(|e| e.to_string())?;
    Ok(r.workspaces.into_iter().map(|w| WorkspaceEntry {
        id:   w.id.clone(),
        name: w.name.unwrap_or(w.id),
    }).collect())
}

async fn fetch_plans(mcp_base: &str, ws_id: &str, tab: usize) -> Result<Vec<PlanEntry>, String> {
    #[derive(Deserialize)]
    struct Resp { plans: Vec<Plan> }
    #[derive(Deserialize)]
    struct Plan {
        id: String, title: String, status: String,
        category: Option<String>,
        steps_done: Option<i32>, steps_total: Option<i32>,
        workspace_id: Option<String>,
        next_step_task: Option<String>,
        next_step_phase: Option<String>,
        next_step_agent: Option<String>,
        next_step_status: Option<String>,
        recommended_next_agent: Option<String>,
    }
    let filter = if tab == 0 { "&status=active" } else { "&status=all" };
    let url = format!("{}/admin/plans?workspace_id={}{}", mcp_base, ws_id, filter);
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let r: Resp = resp.json().await.map_err(|e| e.to_string())?;
    Ok(r.plans.into_iter().map(|p| PlanEntry {
        plan_id:          p.id,
        title:            p.title,
        status:           p.status,
        category:         p.category.unwrap_or_default(),
        steps_done:       p.steps_done.unwrap_or(0),
        steps_total:      p.steps_total.unwrap_or(0),
        workspace_id:     p.workspace_id.unwrap_or_default(),
        next_step_task:   p.next_step_task.unwrap_or_default(),
        next_step_phase:  p.next_step_phase.unwrap_or_default(),
        next_step_agent:  p.next_step_agent.unwrap_or_default(),
        next_step_status: p.next_step_status.unwrap_or_default(),
        recommended:              p.recommended_next_agent.unwrap_or_default(),
        expanded:                 false,
        expanded_height:          0.0,
        expanded_height_target:   0.0,
    }).collect())
}

async fn fetch_sprints(dash_base: &str, ws_id: &str) -> Result<Vec<app_state::SprintEntry>, String> {
    #[derive(Deserialize)]
    struct Sprint {
        id: Option<String>, sprint_id: Option<String>,
        name: Option<String>, title: Option<String>,
        status: Option<String>,
        start_date: Option<String>,
        end_date:   Option<String>,
        #[serde(default)]
        goals: Vec<serde_json::Value>,
        goal_count: Option<i32>,
    }
    let url = format!("{}/api/sprints/workspace/{}", dash_base, ws_id);
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let raw: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let arr = raw["sprints"].as_array()
        .or_else(|| raw.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(arr.into_iter().filter_map(|v| {
        let s: Sprint = serde_json::from_value(v).ok()?;
        Some(app_state::SprintEntry {
            sprint_id:  s.id.or(s.sprint_id).unwrap_or_default(),
            name:       s.name.or(s.title).unwrap_or_else(|| "Untitled Sprint".to_owned()),
            status:     s.status.unwrap_or_else(|| "active".to_owned()),
            start_date: s.start_date.unwrap_or_default(),
            end_date:   s.end_date.unwrap_or_default(),
            goal_count: s.goal_count.unwrap_or(s.goals.len() as i32),
        })
    }).collect())
}

async fn fetch_goals(dash_base: &str, sprint_id: &str) -> Result<Vec<app_state::GoalEntry>, String> {
    #[derive(Deserialize)]
    struct Goal {
        id: Option<String>, goal_id: Option<String>,
        description: Option<String>, title: Option<String>,
        completed: Option<bool>, status: Option<String>,
        plan_id: Option<String>,
    }
    let url = format!("{}/api/sprints/{}", dash_base, sprint_id);
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let raw: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let arr = raw["goals"].as_array().cloned().unwrap_or_default();
    Ok(arr.into_iter().filter_map(|v| {
        let g: Goal = serde_json::from_value(v).ok()?;
        let completed = g.completed.unwrap_or(g.status.as_deref() == Some("completed"));
        Some(app_state::GoalEntry {
            goal_id:     g.id.or(g.goal_id).unwrap_or_default(),
            description: g.description.or(g.title).unwrap_or_default(),
            completed,
            plan_id:     g.plan_id.unwrap_or_default(),
        })
    }).collect())
}

async fn toggle_goal(dash_base: &str, sprint_id: &str, goal_id: &str, completed: bool) -> Result<(), String> {
    let url = format!("{}/api/sprints/{}/goals/{}", dash_base, sprint_id, goal_id);
    let client = reqwest::Client::new();
    client.patch(&url)
        .json(&serde_json::json!({ "completed": completed }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn run_cartographer(mcp_base: &str, ws_id: &str) -> Result<String, String> {
    let url = format!("{}/admin/memory_cartographer", mcp_base);
    let client = reqwest::Client::new();
    let resp = client.post(&url)
        .json(&serde_json::json!({ "workspace_id": ws_id }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let raw: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    if raw["success"].as_bool().unwrap_or(false) {
        Ok("Scan complete".to_owned())
    } else {
        Err(raw["error"].as_str().unwrap_or("scan failed").to_owned())
    }
}

async fn stop_session(mcp_base: &str, session_key: &str) -> Result<(), String> {
    let url = format!("{}/sessions/stop", mcp_base);
    let client = reqwest::Client::new();
    client.post(&url)
        .json(&serde_json::json!({ "sessionKey": session_key }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn send_chat_message(
    gui_base: &str,
    auth_key: &str,
    ws_id: Option<&str>,
    history: &[(String, String)],
) -> Result<String, String> {
    let messages: Vec<_> = history.iter()
        .map(|(role, content)| serde_json::json!({ "role": role, "content": content }))
        .collect();
    let body = serde_json::json!({
        "messages":     messages,
        "workspace_id": ws_id,
    });
    let client = reqwest::Client::new();
    let mut req = client.post(format!("{}/chatbot/chat", gui_base))
        .json(&body);
    if !auth_key.is_empty() {
        req = req.header("X-PM-API-Key", auth_key);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let r: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(r["reply"].as_str().unwrap_or("(no reply)").to_owned())
}

async fn service_action(port: u16, service: &str, action: &str) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{}/api/fallback/services/{}/{}", port, service, action);
    let client = reqwest::Client::new();
    client.post(&url).send().await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn launch_agent(mcp_base: &str, ws_id: &str, plan_id: &str) -> Result<(), String> {
    let url = format!("{}/agent-session/launch", mcp_base);
    let client = reqwest::Client::new();
    client.post(&url)
        .json(&serde_json::json!({ "workspaceId": ws_id, "planId": plan_id }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn save_config(port: u16, toml_content: &str) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{}/api/fallback/config", port);
    let client = reqwest::Client::new();
    let resp = client.post(&url)
        .json(&serde_json::json!({ "content": toml_content }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("HTTP {}", resp.status()))
    }
}
