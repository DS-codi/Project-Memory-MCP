/// SessionsPanel — active agent sessions list.
/// Ported from supervisor/qml/SessionsPanel.qml.
/// Backend: polls /sessions/live every 5 s.

use iced::{
    widget::{button, column, container, row, scrollable, text, Space, Column},
    Alignment, Background, Border, Color, Element, Length, Padding,
};

use crate::app_state::AppState;
use super::theme;

pub fn view<'a, Message>(state: &'a AppState, on_stop: impl Fn(String) -> Message + 'a)
    -> Element<'a, Message>
where
    Message: Clone + 'a,
{
    let is_polling = state.mcp.port > 0;
    let count = state.sessions.len() as i32;

    // Live dot
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

    let title_row = row![
        text("ACTIVE SESSIONS")
            .size(10)
            .color(theme::TEXT_SECONDARY)
            .width(Length::Fill),
        live_dot,
        count_badge,
    ]
    .spacing(6)
    .align_y(Alignment::Center)
    .width(Length::Fill);

    let col_header = row![
        text("SESSION ID").size(10).color(theme::TEXT_SECONDARY).width(Length::Fixed(120.0)),
        text("AGENT").size(10).color(theme::TEXT_SECONDARY).width(Length::Fill),
        text("STATUS").size(10).color(theme::TEXT_SECONDARY).width(Length::Fixed(60.0)),
        text("ACTIONS").size(10).color(theme::TEXT_SECONDARY).width(Length::Fixed(65.0)),
    ]
    .spacing(0)
    .width(Length::Fill);

    let divider = container(Space::new(Length::Fill, 1.0))
        .width(Length::Fill)
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(theme::BORDER_SUBTLE)),
            ..Default::default()
        });

    let mut session_rows: Column<Message> = Column::new().spacing(2).width(Length::Fill);

    if state.sessions.is_empty() {
        session_rows = session_rows.push(
            container(
                text("No active sessions")
                    .size(11)
                    .color(theme::TEXT_SECONDARY),
            )
            .padding(Padding::from([8, 0]))
            .width(Length::Fill)
            .align_x(iced::alignment::Horizontal::Center),
        );
    } else {
        for s in &state.sessions {
            let short_id = &s.session_id[..s.session_id.len().min(14)];
            let key = s.session_key.clone();

            // ACTIVE badge: bg #0e2318, text #3fb950, radius 9
            let active_badge = container(
                text("ACTIVE")
                    .size(9)
                    .color(Color::from_rgb8(0x3f, 0xb9, 0x50)),
            )
            .width(Length::Fixed(60.0))
            .padding(Padding::from([1, 4]))
            .style(|_| iced::widget::container::Style {
                background: Some(Background::Color(Color::from_rgb8(0x0e, 0x23, 0x18))),
                border: Border {
                    radius: 9.0.into(),
                    ..Default::default()
                },
                ..Default::default()
            });

            let r = row![
                // Session ID: TEXT_ACCENT colour (matches QML textAccent = #58a6ff)
                text(short_id.to_owned())
                    .size(10)
                    .color(theme::TEXT_ACCENT)
                    .width(Length::Fixed(120.0)),
                text(s.agent_type.clone())
                    .size(11)
                    .color(theme::TEXT_PRIMARY)
                    .width(Length::Fill),
                active_badge,
                button(text("Stop").size(9))
                    .on_press(on_stop(key))
                    .width(Length::Fixed(65.0)),
            ]
            .spacing(0)
            .align_y(Alignment::Center)
            .height(28.0);

            session_rows = session_rows.push(r);
        }
    }

    let list = scrollable(session_rows).height(Length::Fill);

    container(
        column![
            title_row,
            col_header,
            divider,
            list,
        ]
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
