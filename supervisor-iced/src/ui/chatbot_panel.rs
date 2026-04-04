/// ChatbotPanel — AI assistant sidebar.
/// Ported from supervisor/qml/ChatbotPanel.qml.

use iced::{
    widget::{button, column, container, row, scrollable, text, text_input, Space, Column},
    Alignment, Background, Border, Color, Element, Length, Padding,
};

use crate::app_state::AppState;
use super::theme;

pub fn view<'a, Message>(
    state: &'a AppState,
    // standalone=true → fills its OS window; false → sidebar, uses chat_panel_width
    standalone:         bool,
    on_toggle:          Message,
    on_input:           impl Fn(String) -> Message + 'a,
    on_send:            Message,
    on_clear:           Message,
    on_show_settings:   Message,
    on_api_key_input:   impl Fn(String) -> Message + 'a,
    on_save_settings:   Message,
    // Fired when the user clicks the ↗ pop-out or ↙ pop-in button.
    on_popout:          Message,
) -> Element<'a, Message>
where
    Message: Clone + 'a,
{
    // ── When popped-out and rendered inline: show 44px placeholder ────────────
    if state.chat_popped_out && !standalone {
        let key_dot_color = if state.chat_key_configured {
            theme::CLR_RUNNING
        } else {
            Color::from_rgb8(0xe3, 0xb3, 0x41)
        };
        let key_dot = container(Space::new(8.0, 8.0))
            .style(move |_| iced::widget::container::Style {
                background: Some(Background::Color(key_dot_color)),
                border: Border { radius: 4.0.into(), ..Default::default() },
                ..Default::default()
            });
        return container(
            column![
                button(text("↙").size(14)).on_press(on_popout),
                text("AI").size(11).color(theme::TEXT_ACCENT),
                key_dot,
            ]
            .spacing(14)
            .align_x(Alignment::Center),
        )
        .width(Length::Fixed(44.0))
        .height(Length::Fill)
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(theme::BG_PANEL)),
            border: Border {
                color: theme::BORDER_SUBTLE,
                width: 1.0,
                ..Default::default()
            },
            ..Default::default()
        })
        .into();
    }

    // ── Collapsed strip (44 px wide) ──────────────────────────────────────────
    if !state.chat_expanded && !standalone {
        let provider_color = if state.chat_provider == 1 {
            Color::from_rgb8(0x1f, 0x6f, 0xeb)
        } else {
            Color::from_rgb8(0x38, 0x8b, 0xfd)
        };
        let key_dot_color = if state.chat_key_configured {
            theme::CLR_RUNNING  // green
        } else {
            Color::from_rgb8(0xe3, 0xb3, 0x41)  // yellow
        };

        let provider_dot = container(Space::new(8.0, 8.0))
            .style(move |_| iced::widget::container::Style {
                background: Some(Background::Color(provider_color)),
                border: Border { radius: 4.0.into(), ..Default::default() },
                ..Default::default()
            });
        let key_dot = container(Space::new(8.0, 8.0))
            .style(move |_| iced::widget::container::Style {
                background: Some(Background::Color(key_dot_color)),
                border: Border { radius: 4.0.into(), ..Default::default() },
                ..Default::default()
            });

        return container(
            column![
                button(text("◄").size(14)).on_press(on_toggle),
                text("AI").size(11).color(theme::TEXT_ACCENT),
                provider_dot,
                key_dot,
            ]
            .spacing(14)
            .align_x(Alignment::Center),
        )
        .width(Length::Fixed(44.0))
        .height(Length::Fill)
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(theme::BG_PANEL)),
            border: Border {
                color: theme::BORDER_SUBTLE,
                width: 1.0,
                ..Default::default()
            },
            ..Default::default()
        })
        .into();
    }

    // ── Expanded panel ────────────────────────────────────────────────────────
    let provider_label = if state.chat_provider == 1 { "Copilot" } else { "Gemini" };
    let provider_color = if state.chat_provider == 1 {
        Color::from_rgb8(0x1f, 0x6f, 0xeb)
    } else {
        theme::CLR_BLUE
    };

    // Provider badge pill (height 18, radius 9)
    let provider_badge = container(text(provider_label).size(10).color(Color::WHITE))
        .padding(Padding::from([2, 5]))
        .style(move |_| iced::widget::container::Style {
            background: Some(Background::Color(provider_color)),
            border: Border { radius: 9.0.into(), ..Default::default() },
            ..Default::default()
        });

    // Busy indicator (text spinner substitute)
    let busy_widget: Element<'a, Message> = if state.chat_busy {
        text("…").size(14).color(theme::TEXT_SECONDARY).into()
    } else {
        Space::new(0.0, 0.0).into()
    };

    // Toggle button: hidden in standalone mode (no sidebar to collapse into).
    let toggle_btn: Element<'a, Message> = if standalone {
        Space::new(0.0, 0.0).into()
    } else {
        button(text("►").size(12)).on_press(on_toggle).into()
    };

    // Pop-out / pop-in button: ↗ opens new window; only shown when not standalone.
    let popout_btn: Element<'a, Message> = if standalone {
        Space::new(0.0, 0.0).into()
    } else {
        button(text("↗").size(13))
            .on_press(on_popout)
            .into()
    };

    let header = row![
        toggle_btn,
        text("[AI] AI ASSISTANT")
            .size(11)
            .color(theme::TEXT_PRIMARY)
            .width(Length::Fill),
        provider_badge,
        busy_widget,
        popout_btn,
        button(text("⚙").size(13)).on_press(on_show_settings),
        button(text("⎚").size(13))
            .on_press_maybe(if !state.chat_messages.is_empty() { Some(on_clear) } else { None }),
    ]
    .spacing(4)
    .align_y(Alignment::Center)
    .width(Length::Fill);

    let divider = container(Space::new(Length::Fill, 1.0))
        .width(Length::Fill)
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(theme::BORDER_SUBTLE)),
            ..Default::default()
        });

    // ── API key warning ───────────────────────────────────────────────────────
    let key_warning: Option<Element<'a, Message>> = if !state.chat_key_configured {
        Some(
            text("⚠ No API key configured — click ⚙ to add one")
                .size(10)
                .color(Color::from_rgb8(0xe3, 0xb3, 0x41))
                .into(),
        )
    } else {
        None
    };

    // ── Settings panel (94 px, shown when chat_show_settings) ─────────────────
    let settings_panel: Option<Element<'a, Message>> = if state.chat_show_settings {
        let api_row = row![
            text("API Key:").size(11).color(theme::TEXT_SECONDARY).width(Length::Fixed(56.0)),
            text_input(
                if state.chat_key_configured { "••••••••••••••••" } else { "Paste key here" },
                &state.chat_api_key_input,
            )
            .on_input(on_api_key_input)
            .size(11)
            .width(Length::Fill),
        ]
        .spacing(6)
        .align_y(Alignment::Center);

        let save_row = row![
            Space::new(Length::Fill, 0.0),
            button(text("Save").size(11)).on_press(on_save_settings),
        ]
        .align_y(Alignment::Center);

        Some(
            container(
                column![api_row, save_row]
                    .spacing(6)
                    .padding(Padding::from(8u16))
                    .width(Length::Fill),
            )
            .width(Length::Fill)
            .style(|_| iced::widget::container::Style {
                background: Some(Background::Color(Color::from_rgb8(0x0d, 0x11, 0x17))),
                border: Border {
                    color: theme::BORDER_SUBTLE,
                    width: 1.0,
                    radius: 6.0.into(),
                },
                ..Default::default()
            })
            .into(),
        )
    } else {
        None
    };

    // ── Chat messages ─────────────────────────────────────────────────────────
    let mut msg_col: Column<Message> = Column::new().spacing(6).width(Length::Fill);
    for msg in &state.chat_messages {
        if msg.is_tool_call {
            let chip = container(
                text(format!("▸ {}", msg.content))
                    .size(10)
                    .color(Color::from_rgb8(0x79, 0xc0, 0xff)),
            )
            .padding(Padding::from([2, 8]))
            .style(|_| iced::widget::container::Style {
                background: Some(Background::Color(Color::from_rgb8(0x21, 0x26, 0x2d))),
                border: Border {
                    color: theme::CLR_BLUE,
                    width: 1.0,
                    radius: 10.0.into(),
                },
                ..Default::default()
            });
            msg_col = msg_col.push(chip);
        } else {
            let is_user = msg.role == "user";
            let bubble_bg = if is_user {
                Color::from_rgb8(0x1f, 0x6f, 0xeb)   // user bubble blue
            } else {
                Color::from_rgb8(0x21, 0x26, 0x2d)   // assistant bubble dark
            };
            let bubble_border = if is_user { theme::CLR_BLUE } else { theme::BORDER_SUBTLE };

            let bubble = container(
                text(msg.content.clone())
                    .size(12)
                    .color(theme::TEXT_PRIMARY)
                    .width(Length::Fill),
            )
            .padding(8)
            .width(Length::Fill)
            .style(move |_| iced::widget::container::Style {
                background: Some(Background::Color(bubble_bg)),
                border: Border {
                    color: bubble_border,
                    width: 1.0,
                    radius: 8.0.into(),
                },
                ..Default::default()
            });
            msg_col = msg_col.push(bubble);
        }
    }

    let chat_scroll = scrollable(msg_col.width(Length::Fill))
        .height(Length::Fill)
        .width(Length::Fill);

    // ── Input row ─────────────────────────────────────────────────────────────
    let send_enabled = !state.chat_busy && !state.chat_input.trim().is_empty();
    let send_btn = button(text("↑ Send").size(11))
        .on_press_maybe(if send_enabled { Some(on_send) } else { None });

    let input_area = container(
        text_input("Ask the AI about your plans…", &state.chat_input)
            .on_input(on_input)
            .size(12)
            .width(Length::Fill),
    )
    .padding(Padding::from([6, 8]))
    .width(Length::Fill)
    .style(|_| iced::widget::container::Style {
        background: Some(Background::Color(Color::from_rgb8(0x0d, 0x11, 0x17))),
        border: Border {
            color: theme::BORDER_SUBTLE,
            width: 1.0,
            radius: 6.0.into(),
        },
        ..Default::default()
    });

    let input_row = row![input_area, send_btn]
        .spacing(6)
        .align_y(Alignment::End)
        .width(Length::Fill);

    // ── Assemble panel ────────────────────────────────────────────────────────
    let mut panel = column![header, divider].spacing(6);

    if let Some(w) = key_warning {
        panel = panel.push(w);
    }
    if let Some(s) = settings_panel {
        panel = panel.push(s);
    }

    panel = panel.push(chat_scroll).push(input_row);

    // Width: animated when sidebar, fills window when standalone.
    let outer_width = if standalone {
        Length::Fill
    } else {
        Length::Fixed(state.chat_panel_width.max(44.0))
    };

    container(panel.width(Length::Fill).height(Length::Fill))
        .padding(Padding { top: 8.0, right: 6.0, bottom: 8.0, left: 8.0 })
        .width(outer_width)
        .clip(true)
        .height(Length::Fill)
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(theme::BG_PANEL)),
            border: Border {
                color: theme::CLR_BLUE,
                width: 1.0,
                ..Default::default()
            },
            ..Default::default()
        })
        .into()
}
