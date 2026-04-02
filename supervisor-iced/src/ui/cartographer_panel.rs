/// CartographerPanel — workspace selector + Scan Project button.
/// Ported from supervisor/qml/CartographerPanel.qml.

use iced::{
    widget::{button, column, container, pick_list, row, text, Space},
    Background, Border, Color, Element, Length,
};

use crate::app_state::AppState;
use super::theme;

pub fn view<'a, Message>(
    state: &'a AppState,
    on_workspace_select: impl Fn(String) -> Message + 'a,
    on_refresh:   Message,
    on_scan:      Message,
) -> Element<'a, Message>
where
    Message: Clone + 'a,
{
    let workspace_names: Vec<String> = state
        .carto_workspaces
        .iter()
        .map(|w| w.name.clone())
        .collect();

    let selected_name = state
        .carto_workspaces
        .get(state.carto_workspace_index)
        .map(|w| w.name.clone());

    let pick = pick_list(
        workspace_names.clone(),
        selected_name.clone(),
        move |name: String| {
            on_workspace_select(name)
        },
    )
    .width(Length::Fill);

    let refresh_btn = button(text("↻").size(14))
        .on_press(on_refresh);

    let ws_row = row![pick, refresh_btn]
        .spacing(8)
        .align_y(iced::Alignment::Center)
        .width(Length::Fill);

    let mcp_running = matches!(
        state.mcp.status,
        crate::app_state::ServiceStatus::Running
    );
    let can_scan = !state.carto_workspaces.is_empty() && mcp_running;

    let scan_btn = button(text("Scan Project").size(13))
        .on_press_maybe(if can_scan { Some(on_scan) } else { None })
        .width(Length::Fill);

    let status_color = if state.carto_status.starts_with("Scan") {
        theme::CLR_RUNNING
    } else if state.carto_status.starts_with("Error")
        || state.carto_status.starts_with("HTTP")
    {
        theme::CLR_STOPPED
    } else {
        theme::TEXT_SECONDARY
    };

    let status_label = text(state.carto_status.clone())
        .size(11)
        .color(status_color)
        .width(Length::Fill);

    let mut inner = column![
        row![
            text("WORKSPACE CARTOGRAPHER")
                .size(10)
                .color(theme::TEXT_SECONDARY),
        ]
        .width(Length::Fill),
        ws_row,
        scan_btn,
        status_label,
    ]
    .spacing(8)
    .width(Length::Fill);

    if state.carto_stats_visible {
        let divider = container(Space::new(Length::Fill, 1.0))
            .width(Length::Fill)
            .style(|_| iced::widget::container::Style {
                background: Some(Background::Color(theme::BORDER_SUBTLE)),
                ..Default::default()
            });

        inner = inner.push(divider);
        inner = inner.push(
            text(state.carto_files_label.clone())
                .size(11)
                .color(theme::CLR_RUNNING),
        );
        inner = inner.push(
            text(state.carto_when_label.clone())
                .size(10)
                .color(theme::TEXT_SECONDARY),
        );
    }

    container(inner)
        .padding(10)
        .width(Length::Fill)
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(theme::BG_PANEL)),
            border: Border {
                color: theme::BORDER_SUBTLE,
                width: 1.0,
                radius: 10.0.into(),
            },
            ..Default::default()
        })
        .into()
}
