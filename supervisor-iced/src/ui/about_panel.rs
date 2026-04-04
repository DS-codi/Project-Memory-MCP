/// AboutPanel — version info, service port map, REST API quick-reference.
/// Ported from supervisor/qml/AboutPanel.qml.

use iced::{
    widget::{button, column, container, row, scrollable, text, Space, Column},
    Alignment, Background, Border, Color, Element, Length, Padding,
};

use crate::app_state::AppState;
use super::theme;

struct ServiceRow {
    name:    &'static str,
    port_fn: fn(&AppState) -> i32,
    runtime: &'static str,
}

const SERVICE_ROWS: &[ServiceRow] = &[
    ServiceRow { name: "MCP Server",          port_fn: |s| s.mcp.port,       runtime: "node dist/index.js" },
    ServiceRow { name: "CLI MCP Server",       port_fn: |_| 3466,             runtime: "node dist/index-cli.js" },
    ServiceRow { name: "Interactive Terminal", port_fn: |s| s.terminal.port,  runtime: "interactive-terminal.exe" },
    ServiceRow { name: "Dashboard",            port_fn: |s| s.dashboard.port, runtime: "node dist/index.js" },
    ServiceRow { name: "Fallback REST API",    port_fn: |_| 3465,             runtime: "node dist/fallback-rest-main.js" },
    ServiceRow { name: "Supervisor GUI",       port_fn: |_| 3464,             runtime: "supervisor-iced.exe (Rust/iced)" },
];

const API_ROUTES: &[&str] = &[
    "GET  /api/fallback/health                        — server health check",
    "GET  /api/fallback/services                      — all service statuses",
    "GET  /api/fallback/services/:svc/health          — per-service health",
    "POST /api/fallback/services/:svc/start           — start a service",
    "POST /api/fallback/services/:svc/stop            — stop a service",
    "POST /api/fallback/services/:svc/restart         — restart a service",
    "POST /api/fallback/services/mcp/upgrade          — zero-downtime MCP upgrade",
    "POST /api/fallback/services/:svc/build-restart   — rebuild + restart",
    "POST /api/fallback/services/supervisor/upgrade   — full supervisor upgrade",
    "GET  /api/fallback/runtime/recent                — recent stdout/stderr",
    "GET  /api/fallback/workspaces                    — list workspaces",
    "POST /api/fallback/gui/launch                    — launch a form-app GUI",
];

const NOTES: &[&str] = &[
    "• Closing the window minimises to the system tray — the supervisor keeps running.",
    "• Right-click the tray icon for quick restart shortcuts.",
    "• The Fallback REST API (port 3465) remains reachable even when the GUI is minimised.",
    "• Upgrade reports are shown here once and then cleared on dismiss.",
    "• Config file: %APPDATA%\\ProjectMemory\\supervisor.toml",
    "• Ports manifest (live): %APPDATA%\\ProjectMemory\\ports.json",
];

fn card<'a, Message: Clone + 'a>(inner: Column<'a, Message>) -> Element<'a, Message> {
    container(inner.padding(Padding::from(12u16)))
        .width(Length::Fill)
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(theme::BG_CARD)),
            border: Border {
                color: theme::BORDER_SUBTLE,
                width: 1.0,
                radius: 6.0.into(),
            },
            ..Default::default()
        })
        .into()
}

pub fn view<'a, Message>(
    state: &'a AppState,
    on_close: Message,
) -> Element<'a, Message>
where
    Message: Clone + 'a,
{
    // Version card
    let version_card = card(column![
        text("VERSION").size(10).color(theme::TEXT_SECONDARY),
        text(format!(
            "Project Memory Supervisor v{}",
            if state.supervisor_version.is_empty() { "—" } else { &state.supervisor_version }
        ))
        .size(15)
        .color(theme::TEXT_ACCENT),
        text("Runtime: Rust + iced").size(12).color(theme::TEXT_SECONDARY),
    ].spacing(6));

    // Service port map card
    let mut port_table: Column<Message> = Column::new().spacing(6).width(Length::Fill);
    port_table = port_table.push(text("MANAGED SERVICES").size(10).color(theme::TEXT_SECONDARY));
    port_table = port_table.push(
        row![
            text("Service").size(11).color(theme::TEXT_SECONDARY).width(Length::Fixed(200.0)),
            text("Port").size(11).color(theme::TEXT_SECONDARY).width(Length::Fixed(70.0)),
            text("Runtime").size(11).color(theme::TEXT_SECONDARY).width(Length::Fill),
        ]
        .width(Length::Fill),
    );
    port_table = port_table.push(
        container(Space::new(Length::Fill, 1.0))
            .width(Length::Fill)
            .style(|_| iced::widget::container::Style {
                background: Some(Background::Color(theme::BORDER_SUBTLE)),
                ..Default::default()
            }),
    );

    for svc in SERVICE_ROWS {
        let port = (svc.port_fn)(state);
        let port_str = if port > 0 { port.to_string() } else { "—".to_owned() };
        port_table = port_table.push(
            row![
                text(svc.name).size(12).color(theme::TEXT_PRIMARY).width(Length::Fixed(200.0)),
                text(port_str).size(12).color(theme::TEXT_ACCENT).width(Length::Fixed(70.0)),
                text(svc.runtime).size(11).color(theme::TEXT_SECONDARY).width(Length::Fill),
            ]
            .width(Length::Fill),
        );
    }
    let services_card = card(port_table);

    // REST API card
    let mut api_col: Column<Message> = Column::new().spacing(4).width(Length::Fill);
    api_col = api_col.push(
        text("FALLBACK REST API — port 3465").size(10).color(theme::TEXT_SECONDARY),
    );
    for route in API_ROUTES {
        api_col = api_col.push(text(*route).size(11).color(theme::TEXT_PRIMARY));
    }
    let api_card = card(api_col);

    // Notes card
    let mut notes_col: Column<Message> = Column::new().spacing(6).width(Length::Fill);
    notes_col = notes_col.push(text("NOTES").size(10).color(theme::TEXT_SECONDARY));
    for note in NOTES {
        notes_col = notes_col.push(
            text(*note).size(12).color(theme::TEXT_PRIMARY).width(Length::Fill),
        );
    }
    let notes_card = card(notes_col);

    let body = scrollable(
        column![version_card, services_card, api_card, notes_card]
            .spacing(16)
            .width(Length::Fill)
            .padding(0),
    )
    .height(Length::Fill)
    .width(Length::Fill);

    let header = row![
        text("About Project Memory Supervisor")
            .size(20)
            .color(theme::TEXT_PRIMARY)
            .width(Length::Fill),
        button(text("Close").size(12)).on_press(on_close),
    ]
    .align_y(Alignment::Center)
    .width(Length::Fill);

    container(
        column![header, body].spacing(16).padding(24).width(Length::Fill).height(Length::Fill),
    )
    .width(Length::Fill)
    .height(Length::Fill)
    .style(|_| iced::widget::container::Style {
        background: Some(Background::Color(Color::from_rgb8(0x0f, 0x13, 0x19))),
        ..Default::default()
    })
    .into()
}
