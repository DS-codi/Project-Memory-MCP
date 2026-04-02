/// EventBroadcastPanel — event relay stats + clickable pill toggle.
/// Ported from supervisor/qml/EventBroadcastPanel.qml.

use iced::{
    widget::{button, column, container, row, text, Space},
    Background, Border, Color, Element, Length, Padding,
};

use crate::app_state::AppState;
use super::theme;

pub fn view<'a, Message: Clone + 'a>(
    state: &'a AppState,
    on_toggle: Message,
) -> Element<'a, Message> {
    let enabled = state.event_broadcast_enabled;

    // Status label: "Broadcasting · N subscribers · N events" or "Disabled"
    let status_text = if enabled {
        format!(
            "Broadcasting · {} subscribers · {} events",
            state.event_subscriber_count,
            state.events_total_emitted
        )
    } else {
        "Disabled".to_owned()
    };
    let status_color = if enabled { theme::CLR_RUNNING } else { theme::TEXT_SECONDARY };

    let left_col = column![
        text("EVENT BROADCAST")
            .size(10)
            .color(theme::TEXT_SECONDARY),
        text(status_text)
            .size(10)
            .color(status_color),
    ]
    .spacing(4)
    .width(Length::Fill);

    // ── Pill toggle (clickable) ──────────────────────────────────────────────
    // Outer pill: 40×22, radius 11, green when enabled / #30363d when disabled.
    let pill_color = if enabled {
        Color::from_rgb8(0x3f, 0xb9, 0x50)
    } else {
        theme::BORDER_SUBTLE
    };

    // Knob position: x=20 when on, x=2 when off.
    let knob_x = if enabled { 20.0_f32 } else { 2.0_f32 };

    let knob = container(Space::new(18.0, 18.0))
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(Color::WHITE)),
            border: Border { radius: 9.0.into(), ..Default::default() },
            ..Default::default()
        });

    let pill_inner = row![
        Space::new(knob_x, 0.0),
        knob,
        Space::new(40.0 - 18.0 - knob_x, 0.0),
    ]
    .align_y(iced::Alignment::Center)
    .height(22.0);

    let pill = container(pill_inner)
        .width(Length::Fixed(40.0))
        .height(Length::Fixed(22.0))
        .style(move |_| iced::widget::container::Style {
            background: Some(Background::Color(pill_color)),
            border: Border { radius: 11.0.into(), ..Default::default() },
            ..Default::default()
        });

    // Wrap pill in a transparent button so it handles clicks
    let pill_btn = button(pill)
        .on_press(on_toggle)
        .padding(Padding::from(0u16))
        .style(|_, _| iced::widget::button::Style {
            background: None,
            border:     Border::default(),
            shadow:     iced::Shadow::default(),
            text_color: Color::WHITE,
        });

    container(
        row![left_col, pill_btn]
            .spacing(12)
            .align_y(iced::Alignment::Center)
            .width(Length::Fill),
    )
    .padding(10)
    .width(Length::Fill)
    .height(Length::Fixed(72.0))
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
