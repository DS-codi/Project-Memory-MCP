/// SettingsPanel — full-window settings overlay with 5-category sidebar.
/// Ported from supervisor/qml/SettingsPanel.qml.

use iced::{
    widget::{button, column, container, pick_list, row, scrollable, text, text_input, toggler, Space, Column},
    Alignment, Background, Border, Color, Element, Length, Padding,
};

use crate::app_state::AppState;
use crate::Message;
use super::theme;

#[derive(Debug, Clone, Default)]
pub struct SettingsState {
    pub visible:    bool,
    pub active_cat: usize,  // 0=General 1=Services 2=Reconnect 3=Approval 4=VS Code
}

const CATEGORIES: [&str; 5] = ["General", "Services", "Reconnect", "Approval", "VS Code"];

pub fn view<'a>(
    state:        &'a AppState,
    ss:           &SettingsState,
    on_close:     Message,
    on_save:      Message,
    on_edit_raw:  Message,
    on_cat_select: impl Fn(usize) -> Message + 'a,
) -> Element<'a, Message>
{
    if !ss.visible {
        return Space::new(0.0, 0.0).into();
    }

    let active = ss.active_cat;

    // ── Header ───────────────────────────────────────────────────────────────
    let header = row![
        text("⚙  Settings")
            .size(18)
            .color(theme::TEXT_PRIMARY)
            .width(Length::Fill),
        button(text("Edit TOML").size(12))
            .on_press(on_edit_raw)
            .style(|_, _| iced::widget::button::Style {
                background: None,
                text_color: theme::TEXT_ACCENT,
                border: Border { color: theme::CLR_BLUE, width: 1.0, radius: 4.0.into() },
                ..Default::default()
            }),
        button(text("Close").size(12)).on_press(on_close),
    ]
    .spacing(8)
    .align_y(Alignment::Center)
    .width(Length::Fill);

    // ── Sidebar ──────────────────────────────────────────────────────────────
    let mut sidebar_col: Column<Message> = Column::new().spacing(2).width(Length::Fill);
    for (i, &label) in CATEGORIES.iter().enumerate() {
        let is_active = i == active;
        let cat_btn = button(text(label).size(13).color(if is_active {
            theme::TEXT_PRIMARY
        } else {
            theme::TEXT_SECONDARY
        }))
        .on_press(on_cat_select(i))
        .width(Length::Fill)
        .style(move |_, _| iced::widget::button::Style {
            background: Some(Background::Color(if is_active {
                Color::from_rgb8(0x1c, 0x21, 0x28)
            } else {
                Color::TRANSPARENT
            })),
            text_color: if is_active { theme::TEXT_PRIMARY } else { theme::TEXT_SECONDARY },
            border: Border {
                color: if is_active { theme::CLR_BLUE } else { Color::TRANSPARENT },
                width: if is_active { 1.0 } else { 0.0 },
                radius: 4.0.into(),
            },
            ..Default::default()
        })
        .padding(Padding::from([8, 10]));
        sidebar_col = sidebar_col.push(cat_btn);
    }

    let sidebar = container(sidebar_col.padding(6))
        .width(Length::Fixed(150.0))
        .height(Length::Fill)
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(Color::from_rgb8(0x0f, 0x13, 0x19))),
            border: Border { color: theme::BORDER_SUBTLE, width: 1.0, radius: 6.0.into() },
            ..Default::default()
        });

    // ── Content area ─────────────────────────────────────────────────────────
    let content_inner: Element<'a, Message> = match active {
        0 => settings_general(state),
        1 => settings_services(state),
        2 => settings_reconnect(state),
        3 => settings_approval(state),
        4 => settings_vscode(state),
        _ => Space::new(0.0, 0.0).into(),
    };

    let content_area = container(
        scrollable(content_inner)
            .height(Length::Fill)
            .width(Length::Fill),
    )
    .width(Length::Fill)
    .height(Length::Fill)
    .style(|_| iced::widget::container::Style {
        background: Some(Background::Color(Color::from_rgb8(0x0f, 0x13, 0x19))),
        border: Border { color: theme::BORDER_SUBTLE, width: 1.0, radius: 6.0.into() },
        ..Default::default()
    });

    let body = row![sidebar, content_area]
        .spacing(10)
        .width(Length::Fill)
        .height(Length::Fill);

    // ── Save row ──────────────────────────────────────────────────────────────
    let status_elem: Element<'_, Message> = if let Some(err) = &state.settings_save_error {
        row![
            text(err.as_str()).size(12).color(Color::from_rgb(0.8, 0.2, 0.2)).width(Length::Fill),
            button(text("✕").size(10))
                .on_press(Message::SettingsDismissError)
                .style(|_, _| iced::widget::button::Style {
                    background: None,
                    border: Border::default(),
                    text_color: theme::TEXT_SECONDARY,
                    ..Default::default()
                })
                .padding(Padding::from([0, 4])),
        ]
        .spacing(4)
        .align_y(Alignment::Center)
        .width(Length::Fill)
        .into()
    } else if state.settings_dirty {
        text("Unsaved changes").size(12).color(Color::from_rgb(0.8, 0.6, 0.0)).into()
    } else if state.settings_loading {
        text("⟳ Loading…").size(12).color(theme::TEXT_SECONDARY).into()
    } else {
        Space::new(0.0, 0.0).into()
    };

    let save_row = row![
        button(text("Save Settings").size(13)).on_press(on_save),
        status_elem,
    ]
    .spacing(12)
    .align_y(Alignment::Center)
    .width(Length::Fill);

    let panel_col = column![header, body, save_row]
        .spacing(10)
        .padding(16)
        .width(Length::Fill)
        .height(Length::Fill);

    container(panel_col)
        .width(Length::Fill)
        .height(Length::Fill)
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(Color::from_rgb8(0x0d, 0x11, 0x17))),
            ..Default::default()
        })
        .into()
}

// ── Section heading helper ────────────────────────────────────────────────────
fn section_label<'a>(label: &'a str) -> Element<'a, Message> {
    column![
        text(label)
            .size(10)
            .color(theme::TEXT_SECONDARY),
        container(Space::new(Length::Fill, 1.0))
            .width(Length::Fill)
            .style(|_| iced::widget::container::Style {
                background: Some(Background::Color(theme::BORDER_SUBTLE)),
                ..Default::default()
            }),
    ]
    .spacing(4)
    .width(Length::Fill)
    .into()
}

// ── Settings row helper ───────────────────────────────────────────────────────
fn setting_row<'a>(
    label: &'a str,
    hint:  &'a str,
    ctrl:  Element<'a, Message>,
) -> Element<'a, Message> {
    row![
        text(label)
            .size(13)
            .color(theme::TEXT_PRIMARY)
            .width(Length::Fixed(180.0)),
        ctrl,
        text(hint)
            .size(11)
            .color(theme::TEXT_SECONDARY)
            .width(Length::Fill),
    ]
    .spacing(8)
    .align_y(Alignment::Center)
    .height(44.0)
    .into()
}

/// Styled single-line text input for settings fields.
/// The `value` lifetime is intentionally decoupled from `'a` since iced's
/// TextInput copies the value into its internal `Value` type on construction.
fn settings_input<'a>(
    placeholder: &'a str,
    value: &str,
    on_input: impl Fn(String) -> Message + 'a,
) -> Element<'a, Message> {
    text_input(placeholder, value)
        .on_input(on_input)
        .size(13)
        .width(Length::Fixed(160.0))
        .into()
}

// Keep the placeholder_ctrl helper to avoid breaking any external callers,
// but it is no longer used internally.
#[allow(dead_code)]
fn placeholder_ctrl<'a>() -> Element<'a, Message> {
    container(Space::new(120.0, 26.0))
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(Color::from_rgb8(0x1c, 0x21, 0x28))),
            border: Border { color: theme::BORDER_SUBTLE, width: 1.0, radius: 4.0.into() },
            ..Default::default()
        })
        .into()
}

// ── 0: General ───────────────────────────────────────────────────────────────
const LOG_LEVELS: &[&str] = &["trace", "debug", "info", "warn", "error"];

fn settings_general<'a>(state: &'a AppState) -> Element<'a, Message> {
    let log_options: Vec<String> = LOG_LEVELS.iter().map(|s| s.to_string()).collect();
    let log_selected = Some(state.settings_log_level.clone());

    column![
        section_label("SUPERVISOR"),
        setting_row(
            "Log Level",
            "Minimum log verbosity",
            pick_list(log_options, log_selected, Message::SettingsLogLevelChanged)
                .width(Length::Fixed(160.0))
                .into(),
        ),
        setting_row(
            "Bind Address",
            "HTTP bind address (e.g. 127.0.0.1:3456)",
            settings_input("127.0.0.1", &state.settings_bind_address,
                           Message::SettingsBindAddressChanged),
        ),
        section_label("UI"),
        setting_row(
            "Show AI Chatbot",
            "Show the AI chatbot sidebar panel",
            toggler(state.settings_show_chatbot)
                .on_toggle(Message::SettingsShowChatbotToggled)
                .into(),
        ),
    ]
    .spacing(0)
    .padding(Padding { top: 12.0, left: 16.0, right: 16.0, bottom: 8.0 })
    .width(Length::Fill)
    .into()
}

// ── 1: Services ──────────────────────────────────────────────────────────────
fn settings_services<'a>(state: &'a AppState) -> Element<'a, Message> {
    let mcp_port_s      = state.settings_mcp_port.to_string();
    let health_s        = state.settings_health_timeout.to_string();
    let max_inst_s      = state.settings_mcp_max_instances.to_string();
    let max_conns_s     = state.settings_mcp_max_conns.to_string();
    let inst_pool_s     = state.settings_instance_pool.to_string();
    let terminal_port_s = state.settings_terminal_port.to_string();
    let dash_port_s     = state.settings_dashboard_port.to_string();
    let events_port_s   = state.settings_events_port.to_string();

    column![
        section_label("MCP SERVER"),
        setting_row(
            "Enabled",
            "Manage the MCP server process",
            toggler(state.settings_mcp_enabled)
                .on_toggle(Message::SettingsMcpEnabledToggled)
                .into(),
        ),
        setting_row(
            "Port",
            "TCP port for the MCP proxy (default 3457)",
            settings_input("3457", &mcp_port_s, Message::SettingsMcpPortChanged),
        ),
        setting_row(
            "Health Timeout",
            "HTTP health probe timeout (ms)",
            settings_input("5000", &health_s, Message::SettingsHealthTimeoutChanged),
        ),
        section_label("INSTANCE POOL"),
        setting_row(
            "Min Instances",
            "Minimum MCP instances kept running",
            settings_input("1", &inst_pool_s, Message::SettingsInstancePoolChanged),
        ),
        setting_row(
            "Max Instances",
            "Hard cap on simultaneous MCP instances",
            settings_input("5", &max_inst_s, Message::SettingsMcpMaxInstancesChanged),
        ),
        setting_row(
            "Max Conns / Instance",
            "Threshold that triggers pool scale-up",
            settings_input("3", &max_conns_s, Message::SettingsMcpMaxConnsChanged),
        ),
        section_label("INTERACTIVE TERMINAL"),
        setting_row(
            "Enabled",
            "Manage the terminal process",
            toggler(state.settings_terminal_enabled)
                .on_toggle(Message::SettingsTerminalEnabledToggled)
                .into(),
        ),
        setting_row(
            "Port",
            "TCP port (default 3458)",
            settings_input("3458", &terminal_port_s, Message::SettingsTerminalPortChanged),
        ),
        section_label("DASHBOARD"),
        setting_row(
            "Enabled",
            "Manage the dashboard process",
            toggler(state.settings_dashboard_enabled)
                .on_toggle(Message::SettingsDashboardEnabledToggled)
                .into(),
        ),
        setting_row(
            "Port",
            "TCP port (default 3459)",
            settings_input("3459", &dash_port_s, Message::SettingsDashboardPortChanged),
        ),
        setting_row(
            "Requires MCP",
            "Block dashboard if MCP is offline",
            toggler(state.settings_dashboard_requires_mcp)
                .on_toggle(Message::SettingsDashboardRequiresMcpToggled)
                .into(),
        ),
        setting_row(
            "Dashboard Variant",
            "Which dashboard build to serve",
            pick_list(
                vec!["classic".to_string(), "solid".to_string()],
                Some(state.settings_dashboard_variant.clone()),
                Message::SettingsDashboardVariantChanged,
            )
            .width(Length::Fixed(160.0))
            .into(),
        ),
        section_label("EVENTS"),
        setting_row(
            "Enabled",
            "Enable the event broadcast system",
            toggler(state.settings_events_enabled)
                .on_toggle(Message::SettingsEventsEnabledToggled)
                .into(),
        ),
        setting_row(
            "Port",
            "TCP port for the events stream (default 3460)",
            settings_input("3460", &events_port_s, Message::SettingsEventsPortChanged),
        ),
    ]
    .spacing(0)
    .padding(Padding { top: 12.0, left: 16.0, right: 16.0, bottom: 8.0 })
    .width(Length::Fill)
    .into()
}

// ── 2: Reconnect ─────────────────────────────────────────────────────────────
fn settings_reconnect<'a>(state: &'a AppState) -> Element<'a, Message> {
    let initial_s    = state.settings_reconnect_initial_delay.to_string();
    let max_delay_s  = state.settings_reconnect_max_delay.to_string();
    let max_att_s    = state.settings_reconnect_max_attempts.to_string();

    column![
        section_label("RECONNECT BACK-OFF"),
        setting_row(
            "Initial Delay",
            "First retry interval (ms)",
            settings_input("1000", &initial_s,
                           Message::SettingsReconnectInitialDelayChanged),
        ),
        setting_row(
            "Max Delay",
            "Maximum retry interval (ms)",
            settings_input("30000", &max_delay_s,
                           Message::SettingsReconnectMaxDelayChanged),
        ),
        setting_row(
            "Multiplier",
            "Back-off growth factor",
            settings_input("2.0", &state.settings_reconnect_multiplier,
                           Message::SettingsReconnectMultiplierChanged),
        ),
        setting_row(
            "Max Attempts",
            "0 = unlimited retries",
            settings_input("0", &max_att_s,
                           Message::SettingsReconnectMaxAttemptsChanged),
        ),
        setting_row(
            "Jitter Ratio",
            "Randomisation applied to delays",
            settings_input("0.2", &state.settings_reconnect_jitter_ratio,
                           Message::SettingsReconnectJitterRatioChanged),
        ),
    ]
    .spacing(0)
    .padding(Padding { top: 12.0, left: 16.0, right: 16.0, bottom: 8.0 })
    .width(Length::Fill)
    .into()
}

// ── 3: Approval ──────────────────────────────────────────────────────────────
const TIMEOUT_ACTIONS: &[&str] = &["approve", "deny"];

fn settings_approval<'a>(state: &'a AppState) -> Element<'a, Message> {
    let countdown_s     = state.settings_approval_countdown.to_string();
    let timeout_options: Vec<String> = TIMEOUT_ACTIONS.iter().map(|s| s.to_string()).collect();
    let timeout_sel     = Some(state.settings_timeout_action.clone());

    column![
        section_label("APPROVAL GATEWAY"),
        setting_row(
            "Countdown (secs)",
            "Default approval countdown timer",
            settings_input("60", &countdown_s,
                           Message::SettingsApprovalCountdownChanged),
        ),
        setting_row(
            "On Timeout",
            "Action when timer expires (approve/deny)",
            pick_list(timeout_options, timeout_sel, Message::SettingsTimeoutActionChanged)
                .width(Length::Fixed(160.0))
                .into(),
        ),
        setting_row(
            "Always on Top",
            "Keep approval dialog above other windows",
            toggler(state.settings_always_on_top)
                .on_toggle(Message::SettingsAlwaysOnTopToggled)
                .into(),
        ),
    ]
    .spacing(0)
    .padding(Padding { top: 12.0, left: 16.0, right: 16.0, bottom: 8.0 })
    .width(Length::Fill)
    .into()
}

// ── 4: VS Code ────────────────────────────────────────────────────────────────
const CONTAINER_MODES: &[&str]  = &["auto", "local", "container"];
const STARTUP_MODES:   &[&str]  = &["off", "prompt", "auto"];

fn settings_vscode<'a>(state: &'a AppState) -> Element<'a, Message> {
    let mcp_port_s      = state.settings_vscode_mcp_port.to_string();
    let api_port_s      = state.settings_vscode_api_port.to_string();
    let detect_s        = state.settings_vscode_detect_timeout.to_string();
    let startup_s       = state.settings_vscode_startup_timeout.to_string();

    let container_opts: Vec<String> = CONTAINER_MODES.iter().map(|s| s.to_string()).collect();
    let container_sel   = Some(state.settings_vscode_container_mode.clone());
    let startup_opts: Vec<String>   = STARTUP_MODES.iter().map(|s| s.to_string()).collect();
    let startup_sel     = Some(state.settings_vscode_startup_mode.clone());

    column![
        section_label("SERVER PORTS"),
        setting_row(
            "MCP Port",
            "projectMemory.mcpPort",
            settings_input("3466", &mcp_port_s, Message::SettingsVscodeMcpPortChanged),
        ),
        setting_row(
            "Dashboard Port",
            "projectMemory.serverPort",
            settings_input("3465", &api_port_s, Message::SettingsVscodeApiPortChanged),
        ),
        section_label("PATHS"),
        setting_row(
            "Agents Root",
            "projectMemory.agentsRoot",
            settings_input("", &state.settings_vscode_agents_root,
                           Message::SettingsVscodeAgentsRootChanged),
        ),
        setting_row(
            "Skills Root",
            "projectMemory.skillsRoot",
            settings_input("", &state.settings_vscode_skills_root,
                           Message::SettingsVscodeSkillsRootChanged),
        ),
        setting_row(
            "Instructions Root",
            "projectMemory.instructionsRoot",
            settings_input("", &state.settings_vscode_instructions_root,
                           Message::SettingsVscodeInstructionsRootChanged),
        ),
        section_label("NOTIFICATIONS"),
        setting_row(
            "Enabled",
            "projectMemory.notifications.enabled",
            toggler(state.settings_vscode_notifications_enabled)
                .on_toggle(Message::SettingsVscodeNotificationsToggled)
                .into(),
        ),
        setting_row(
            "Agent Handoffs",
            "projectMemory.notifications.agentHandoffs",
            toggler(state.settings_vscode_agent_handoffs)
                .on_toggle(Message::SettingsVscodeAgentHandoffsToggled)
                .into(),
        ),
        setting_row(
            "Plan Complete",
            "projectMemory.notifications.planComplete",
            toggler(state.settings_vscode_plan_complete)
                .on_toggle(Message::SettingsVscodePlanCompleteToggled)
                .into(),
        ),
        setting_row(
            "Step Blocked",
            "projectMemory.notifications.stepBlocked",
            toggler(state.settings_vscode_step_blocked)
                .on_toggle(Message::SettingsVscodeStepBlockedToggled)
                .into(),
        ),
        section_label("DEPLOYMENT"),
        setting_row(
            "Auto-Deploy on Open",
            "projectMemory.autoDeployOnWorkspaceOpen",
            toggler(state.settings_vscode_auto_deploy)
                .on_toggle(Message::SettingsVscodeAutoDeployToggled)
                .into(),
        ),
        setting_row(
            "Auto-Deploy Skills",
            "projectMemory.autoDeploySkills — uses Auto-Deploy toggle",
            toggler(state.settings_vscode_auto_deploy)
                .on_toggle(Message::SettingsVscodeAutoDeployToggled)
                .into(),
        ),
        setting_row(
            "Container Mode",
            "auto / local / container",
            pick_list(container_opts, container_sel, Message::SettingsVscodeContainerModeChanged)
                .width(Length::Fixed(160.0))
                .into(),
        ),
        section_label("SUPERVISOR EXTENSION"),
        setting_row(
            "Startup Mode",
            "off / prompt / auto",
            pick_list(startup_opts, startup_sel, Message::SettingsVscodeStartupModeChanged)
                .width(Length::Fixed(160.0))
                .into(),
        ),
        setting_row(
            "Launcher Path",
            "supervisor.launcherPath",
            settings_input("", &state.settings_vscode_launcher_path,
                           Message::SettingsVscodeLauncherPathChanged),
        ),
        setting_row(
            "Detect Timeout (ms)",
            "supervisor.detectTimeoutMs",
            settings_input("5000", &detect_s, Message::SettingsVscodeDetectTimeoutChanged),
        ),
        setting_row(
            "Startup Timeout (ms)",
            "supervisor.startupTimeoutMs",
            settings_input("30000", &startup_s, Message::SettingsVscodeStartupTimeoutChanged),
        ),
    ]
    .spacing(0)
    .padding(Padding { top: 12.0, left: 16.0, right: 16.0, bottom: 8.0 })
    .width(Length::Fill)
    .into()
}
