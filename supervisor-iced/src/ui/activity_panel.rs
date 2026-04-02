/// ActivityPanel — recent agent activity feed.
/// Ported from supervisor/qml/ActivityPanel.qml.
/// Backend: polls /api/events?limit=15 on the dashboard server every 3 s.

use iced::{
    widget::{column, container, row, scrollable, text, Space, Column},
    Background, Border, Color, Element, Length, Padding,
};

use crate::app_state::AppState;
use super::theme;

/// Map QML-style event type strings to display colours.
fn event_color(event_type: &str) -> Color {
    if event_type.starts_with("plan_")    { return theme::CLR_RUNNING; }   // #3fb950
    if event_type.starts_with("session_") { return theme::TEXT_ACCENT; }   // #58a6ff
    if event_type.starts_with("step_") || event_type.starts_with("task_") {
        return Color::from_rgb8(0xe3, 0xb3, 0x41);   // #e3b341
    }
    if event_type.starts_with("error_")  { return theme::CLR_STOPPED; }    // #f85149
    // Legacy / catch-all keywords
    if event_type.contains("handoff")  { return theme::CLR_RUNNING; }
    if event_type.contains("complete") { return theme::TEXT_ACCENT; }
    if event_type.contains("error") || event_type.contains("blocked") {
        return theme::CLR_STOPPED;
    }
    if event_type.contains("active") { return theme::CLR_YELLOW; }
    theme::TEXT_PRIMARY
}

pub fn view<'a, Message: Clone + 'a>(state: &'a AppState) -> Element<'a, Message> {
    let count = state.activity.len() as i32;
    let is_polling = state.dashboard.port > 0;

    // Live dot: green when polling, red when not
    let dot_color = if is_polling { theme::CLR_RUNNING } else { theme::CLR_STOPPED };
    let live_dot = container(Space::new(8.0, 8.0))
        .style(move |_| iced::widget::container::Style {
            background: Some(Background::Color(dot_color)),
            border: Border { radius: 4.0.into(), ..Default::default() },
            ..Default::default()
        });

    // Count badge
    let count_badge = container(
        text(format!("[{}]", count)).size(10).color(theme::TEXT_ACCENT),
    )
    .padding(Padding::from([0, 6]))
    .style(|_| iced::widget::container::Style {
        background: Some(Background::Color(Color::from_rgb8(0x21, 0x26, 0x2d))),
        border: Border { radius: 9.0.into(), ..Default::default() },
        ..Default::default()
    });

    let header = row![
        text("RECENT ACTIVITY")
            .size(10)
            .color(theme::TEXT_SECONDARY)
            .width(Length::Fill),
        live_dot,
        count_badge,
    ]
    .spacing(6)
    .align_y(iced::Alignment::Center)
    .width(Length::Fill);

    let divider = container(Space::new(Length::Fill, 1.0))
        .width(Length::Fill)
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(theme::BORDER_SUBTLE)),
            ..Default::default()
        });

    let mut entries: Column<Message> = Column::new().spacing(3).width(Length::Fill);

    if state.activity.is_empty() {
        entries = entries.push(
            text("No recent activity")
                .size(11)
                .color(theme::TEXT_SECONDARY),
        );
    } else {
        for ev in &state.activity {
            let label = if ev.agent.is_empty() {
                format!("{} {}", ev.event, ev.time)
            } else {
                format!("[{}] {} {}", ev.agent, ev.event, ev.time)
            };
            entries = entries.push(
                text(label)
                    .size(11)
                    .color(event_color(&ev.event)),
            );
        }
    }

    let feed = container(
        scrollable(entries.width(Length::Fill)).height(Length::Fill),
    )
    .padding(Padding::from([4, 6]))
    .width(Length::Fill)
    .height(Length::Fill)
    .style(|_| iced::widget::container::Style {
        background: Some(Background::Color(Color::from_rgb8(0x0d, 0x11, 0x17))),
        border: Border {
            color: theme::BORDER_SUBTLE,
            width: 1.0,
            radius: 4.0.into(),
        },
        ..Default::default()
    });

    container(
        column![header, divider, feed]
            .spacing(6)
            .width(Length::Fill)
            .height(Length::Fill),
    )
    .padding(10)
    .width(Length::Fill)
    .height(Length::Fixed(200.0))
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
