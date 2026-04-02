/// ServiceCard — reusable per-service display card.
/// Ported from supervisor/qml/ServiceCard.qml.

use iced::{
    widget::{button, column, container, row, text, Row, Column},
    Alignment, Background, Border, Color, Element, Length, Padding,
};

use crate::app_state::ServiceStatus;
use super::{service_icon::ServiceIconKind, service_icon, status_ring, theme};

pub struct ServiceCardConfig<'a, Message> {
    pub service_name:          &'a str,
    pub status:                &'a ServiceStatus,
    pub accent_color:          Color,
    pub icon_kind:             ServiceIconKind,
    pub icon_bg_color:         Color,
    pub info_line1:            String,    // shown when Running (owned to allow format!)
    pub info_line2:            String,    // shown when Running (owned to allow format!)
    pub info_always:           &'a str,   // always shown
    pub offline_text:          &'a str,   // shown when not Running
    pub primary_action_label:  &'a str,
    pub primary_action_enabled: bool,
    pub on_primary_action:     Message,
    pub secondary_action_label: Option<&'a str>,
    pub secondary_action_enabled: bool,
    pub on_secondary_action:   Option<Message>,
    pub show_runtime_strip:    bool,
    pub runtime_strip_label:   &'a str,
    pub runtime_strip_value:   &'a str,
}

pub fn view<'a, Message>(cfg: ServiceCardConfig<'a, Message>) -> Element<'a, Message>
where
    Message: Clone + 'a,
{
    let status_color = cfg.status.color();

    // Status dot + label
    let status_dot = container(iced::widget::Space::new(7.0, 7.0))
        .style(move |_| iced::widget::container::Style {
            background: Some(Background::Color(status_color)),
            border: Border { radius: 3.5.into(), ..Default::default() },
            ..Default::default()
        });

    let status_indicator = row![
        status_dot,
        text(cfg.status.as_str()).size(11).color(status_color),
    ]
    .spacing(4)
    .align_y(Alignment::Center);

    // Icon box (28×28 with colored background, matching QML iconBgColor rectangle)
    let icon_bg = cfg.icon_bg_color;
    let icon_canvas = service_icon::view(cfg.icon_kind, cfg.accent_color);
    let icon_box = container(icon_canvas)
        .width(Length::Fixed(28.0))
        .height(Length::Fixed(28.0))
        .style(move |_| iced::widget::container::Style {
            background: Some(Background::Color(icon_bg)),
            border: Border { radius: 4.0.into(), ..Default::default() },
            ..Default::default()
        });

    // Header row: icon + service name + status indicator
    let header = row![
        icon_box,
        text(cfg.service_name)
            .size(12)
            .color(theme::TEXT_PRIMARY)
            .width(Length::Fill),
        status_indicator,
    ]
    .spacing(8)
    .align_y(Alignment::Center)
    .width(Length::Fill);

    // Info column
    let mut info_col = Column::new().spacing(3);
    let is_running = matches!(cfg.status, ServiceStatus::Running);

    if is_running && !cfg.info_line1.is_empty() {
        info_col = info_col.push(text(cfg.info_line1.clone()).size(11).color(theme::TEXT_SECONDARY));
    }
    if is_running && !cfg.info_line2.is_empty() {
        info_col = info_col.push(text(cfg.info_line2.clone()).size(11).color(theme::TEXT_SECONDARY));
    }
    if !cfg.info_always.is_empty() {
        info_col = info_col.push(text(cfg.info_always).size(11).color(theme::TEXT_SECONDARY));
    }
    if !is_running && !cfg.offline_text.is_empty() {
        info_col = info_col.push(text(cfg.offline_text).size(11).color(theme::TEXT_SECONDARY));
    }

    // Action buttons
    let mut buttons = Row::new().spacing(6).align_y(Alignment::Center);

    if let (Some(label), Some(msg)) = (cfg.secondary_action_label, cfg.on_secondary_action) {
        let btn = button(text(label).size(12))
            .on_press_maybe(if cfg.secondary_action_enabled { Some(msg) } else { None });
        buttons = buttons.push(btn);
    }

    let primary_btn = button(text(cfg.primary_action_label).size(12))
        .on_press_maybe(if cfg.primary_action_enabled { Some(cfg.on_primary_action) } else { None });
    buttons = buttons.push(primary_btn);

    // Body row: status ring + info + buttons
    let ring = status_ring::view(cfg.status, cfg.accent_color);
    let body = row![ring, info_col.width(Length::Fill), buttons]
        .spacing(8)
        .align_y(Alignment::Center)
        .width(Length::Fill);

    // Runtime strip (optional)
    let mut card_col = column![header, body].spacing(8).width(Length::Fill);

    if cfg.show_runtime_strip {
        let strip = container(
            row![
                text(cfg.runtime_strip_label).size(10).color(theme::TEXT_SECONDARY),
                text(cfg.runtime_strip_value).size(11).color(theme::TEXT_PRIMARY),
            ]
            .spacing(8)
            .align_y(Alignment::Center),
        )
        .padding(Padding::from([0u16, 8]))
        .width(Length::Fill)
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(Color::from_rgb8(0x0d, 0x11, 0x17))),
            border: Border {
                color: theme::BORDER_SUBTLE,
                width: 1.0,
                radius: 4.0.into(),
            },
            ..Default::default()
        });
        card_col = card_col.push(strip);
    }

    // Card background: #161b22 to match the original QML ServiceCard color
    container(card_col.padding(12))
        .width(Length::Fill)
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(Color::from_rgb8(0x16, 0x1b, 0x22))),
            border: Border {
                color: theme::BORDER_SUBTLE,
                width: 1.0,
                radius: 10.0.into(),
            },
            ..Default::default()
        })
        .into()
}
