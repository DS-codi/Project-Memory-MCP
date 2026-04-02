/// SettingsPanel — full-window settings overlay with 5-category sidebar.
/// Ported from supervisor/qml/SettingsPanel.qml.

use iced::{
    widget::{button, column, container, row, scrollable, text, Space, Column},
    Alignment, Background, Border, Color, Element, Length, Padding,
};

use crate::app_state::AppState;
use super::theme;

#[derive(Debug, Clone, Default)]
pub struct SettingsState {
    pub visible:    bool,
    pub active_cat: usize,  // 0=General 1=Services 2=Reconnect 3=Approval 4=VS Code
}

const CATEGORIES: [&str; 5] = ["General", "Services", "Reconnect", "Approval", "VS Code"];

pub fn view<'a, Message>(
    _state:       &'a AppState,
    ss:           &SettingsState,
    on_close:     Message,
    _on_save:     Message,
    on_edit_raw:  Message,
    on_cat_select: impl Fn(usize) -> Message + 'a,
) -> Element<'a, Message>
where
    Message: Clone + 'a,
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
        0 => settings_general(),
        1 => settings_services(),
        2 => settings_reconnect(),
        3 => settings_approval(),
        4 => settings_vscode(),
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

    let panel_col = column![header, body]
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
fn section_label<'a, Message: 'a>(label: &'a str) -> Element<'a, Message> {
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
fn setting_row<'a, Message: Clone + 'a>(
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

fn placeholder_ctrl<'a, Message: 'a>() -> Element<'a, Message> {
    container(Space::new(120.0, 26.0))
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(Color::from_rgb8(0x1c, 0x21, 0x28))),
            border: Border { color: theme::BORDER_SUBTLE, width: 1.0, radius: 4.0.into() },
            ..Default::default()
        })
        .into()
}

// ── 0: General ───────────────────────────────────────────────────────────────
fn settings_general<'a, Message: Clone + 'a>() -> Element<'a, Message> {
    column![
        section_label("SUPERVISOR"),
        setting_row("Log Level",    "Minimum log verbosity",        placeholder_ctrl()),
        setting_row("Bind Address", "HTTP bind address (e.g. 127.0.0.1:3456)", placeholder_ctrl()),
    ]
    .spacing(0)
    .padding(Padding { top: 12.0, left: 16.0, right: 16.0, bottom: 8.0 })
    .width(Length::Fill)
    .into()
}

// ── 1: Services ──────────────────────────────────────────────────────────────
fn settings_services<'a, Message: Clone + 'a>() -> Element<'a, Message> {
    column![
        section_label("MCP SERVER"),
        setting_row("Enabled",              "Manage the MCP server process",         placeholder_ctrl()),
        setting_row("Port",                 "TCP port for the MCP proxy (default 3457)", placeholder_ctrl()),
        setting_row("Health Timeout",       "HTTP health probe timeout (ms)",        placeholder_ctrl()),
        section_label("INSTANCE POOL"),
        setting_row("Min Instances",        "Minimum MCP instances kept running",    placeholder_ctrl()),
        setting_row("Max Instances",        "Hard cap on simultaneous MCP instances",placeholder_ctrl()),
        setting_row("Max Conns / Instance", "Threshold that triggers pool scale-up", placeholder_ctrl()),
        section_label("INTERACTIVE TERMINAL"),
        setting_row("Enabled",              "Manage the terminal process",           placeholder_ctrl()),
        setting_row("Port",                 "TCP port (default 3458)",               placeholder_ctrl()),
        section_label("DASHBOARD"),
        setting_row("Enabled",              "Manage the dashboard process",          placeholder_ctrl()),
        setting_row("Port",                 "TCP port (default 3459)",               placeholder_ctrl()),
        setting_row("Requires MCP",         "Block dashboard if MCP is offline",     placeholder_ctrl()),
        section_label("EVENTS"),
        setting_row("Enabled",              "Enable the event broadcast system",     placeholder_ctrl()),
    ]
    .spacing(0)
    .padding(Padding { top: 12.0, left: 16.0, right: 16.0, bottom: 8.0 })
    .width(Length::Fill)
    .into()
}

// ── 2: Reconnect ─────────────────────────────────────────────────────────────
fn settings_reconnect<'a, Message: Clone + 'a>() -> Element<'a, Message> {
    column![
        section_label("RECONNECT BACK-OFF"),
        setting_row("Initial Delay",  "First retry interval (ms)",         placeholder_ctrl()),
        setting_row("Max Delay",      "Maximum retry interval (ms)",       placeholder_ctrl()),
        setting_row("Multiplier",     "Back-off growth factor",            placeholder_ctrl()),
        setting_row("Max Attempts",   "0 = unlimited retries",             placeholder_ctrl()),
        setting_row("Jitter Ratio",   "Randomisation applied to delays",   placeholder_ctrl()),
    ]
    .spacing(0)
    .padding(Padding { top: 12.0, left: 16.0, right: 16.0, bottom: 8.0 })
    .width(Length::Fill)
    .into()
}

// ── 3: Approval ──────────────────────────────────────────────────────────────
fn settings_approval<'a, Message: Clone + 'a>() -> Element<'a, Message> {
    column![
        section_label("APPROVAL GATEWAY"),
        setting_row("Countdown (secs)",  "Default approval countdown timer",       placeholder_ctrl()),
        setting_row("On Timeout",        "Action when timer expires (approve/reject)", placeholder_ctrl()),
        setting_row("Always on Top",     "Keep approval dialog above other windows",   placeholder_ctrl()),
    ]
    .spacing(0)
    .padding(Padding { top: 12.0, left: 16.0, right: 16.0, bottom: 8.0 })
    .width(Length::Fill)
    .into()
}

// ── 4: VS Code ────────────────────────────────────────────────────────────────
fn settings_vscode<'a, Message: Clone + 'a>() -> Element<'a, Message> {
    column![
        section_label("SERVER PORTS"),
        setting_row("MCP Port",       "projectMemory.mcpPort",    placeholder_ctrl()),
        setting_row("Dashboard Port", "projectMemory.serverPort", placeholder_ctrl()),
        section_label("PATHS"),
        setting_row("Agents Root",       "projectMemory.agentsRoot",       placeholder_ctrl()),
        setting_row("Skills Root",       "projectMemory.skillsRoot",       placeholder_ctrl()),
        setting_row("Instructions Root", "projectMemory.instructionsRoot", placeholder_ctrl()),
        section_label("NOTIFICATIONS"),
        setting_row("Enabled",          "projectMemory.notifications.enabled",       placeholder_ctrl()),
        setting_row("Agent Handoffs",   "projectMemory.notifications.agentHandoffs", placeholder_ctrl()),
        setting_row("Plan Complete",    "projectMemory.notifications.planComplete",  placeholder_ctrl()),
        setting_row("Step Blocked",     "projectMemory.notifications.stepBlocked",   placeholder_ctrl()),
        section_label("DEPLOYMENT"),
        setting_row("Auto-Deploy on Open",  "projectMemory.autoDeployOnWorkspaceOpen", placeholder_ctrl()),
        setting_row("Auto-Deploy Skills",   "projectMemory.autoDeploySkills",          placeholder_ctrl()),
        setting_row("Container Mode",       "auto / local / container",                placeholder_ctrl()),
        section_label("SUPERVISOR EXTENSION"),
        setting_row("Startup Mode",        "off / prompt / auto",           placeholder_ctrl()),
        setting_row("Launcher Path",       "supervisor.launcherPath",       placeholder_ctrl()),
        setting_row("Detect Timeout (ms)", "supervisor.detectTimeoutMs",    placeholder_ctrl()),
        setting_row("Startup Timeout (ms)","supervisor.startupTimeoutMs",   placeholder_ctrl()),
    ]
    .spacing(0)
    .padding(Padding { top: 12.0, left: 16.0, right: 16.0, bottom: 8.0 })
    .width(Length::Fill)
    .into()
}
