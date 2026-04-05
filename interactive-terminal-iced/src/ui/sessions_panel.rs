//! Session tabs bar — horizontal row of clickable session tabs.
//! Mirrors the QML sessionTabsList with Gemini styling support.

use iced::widget::{button, container, row, scrollable, text, Row};
use iced::{Alignment, Color, Element, Length};
use crate::app_state::{AppState, Message};
use crate::types::SessionTab;
use crate::ui::theme;

pub fn view(state: &AppState) -> Element<'_, Message> {
    if state.session_tabs.is_empty() {
        return container(
            text("No sessions").size(11).color(theme::TEXT_MUTED),
        )
        .padding([0, 12])
        .height(38.0)
        .center_y(Length::Shrink)
        .into();
    }

    let tabs: Vec<Element<Message>> = state
        .session_tabs
        .iter()
        .map(|tab| view_tab(tab))
        .collect();

    container(
        scrollable(
            Row::with_children(tabs)
                .spacing(6)
                .padding([3, 8])
                .align_y(Alignment::Center),
        )
        .direction(scrollable::Direction::Horizontal(
            scrollable::Scrollbar::new().width(3).scroller_width(3),
        ))
        .width(Length::Fill),
    )
    .height(38.0)
    .width(Length::Fill)
    .style(|_t| iced::widget::container::Style {
        background: Some(iced::Background::Color(theme::BG_PANEL)),
        ..Default::default()
    })
    .into()
}

fn view_tab(tab: &SessionTab) -> Element<'_, Message> {
    let is_gemini = tab.is_gemini;
    let is_active = tab.is_active;

    let bg = if is_gemini {
        if is_active {
            theme::TAB_GEMINI_BG
        } else {
            Color { r: 0.067, g: 0.043, b: 0.125, a: 1.0 }
        }
    } else if is_active {
        theme::TAB_ACTIVE_BG
    } else {
        theme::TAB_INACTIVE_BG
    };

    let text_color = if is_gemini {
        if is_active { theme::TAB_GEMINI_TEXT } else { theme::TAB_GEMINI_BORDER }
    } else if is_active {
        theme::TEXT_PRIMARY
    } else {
        theme::TEXT_SECONDARY
    };

    let label = {
        let base = if is_gemini {
            format!("✦ {}", tab.label)
        } else {
            tab.label.clone()
        };
        if tab.pending_count > 0 {
            format!("{} ({})", base, tab.pending_count)
        } else {
            base
        }
    };

    let session_id = tab.session_id.clone();
    let session_id_close = tab.session_id.clone();
    let can_close = tab.can_close;

    let tab_button = button(
        row![
            text(label).size(12).color(text_color),
            if can_close {
                button(text("×").size(13).color(theme::TEXT_SECONDARY))
                    .padding([0, 4])
                    .style(|_t, s| iced::widget::button::Style {
                        background: Some(iced::Background::Color(
                            if matches!(s, iced::widget::button::Status::Hovered) {
                                Color { r: 0.5, g: 0.1, b: 0.1, a: 1.0 }
                            } else {
                                Color::TRANSPARENT
                            },
                        )),
                        border: iced::Border {
                            radius: 3.0.into(),
                            ..Default::default()
                        },
                        text_color: theme::TEXT_SECONDARY,
                        ..Default::default()
                    })
                    .on_press(Message::CloseSession(session_id_close))
                    .into()
            } else {
                iced::widget::Space::with_width(0).into()
            },
        ]
        .spacing(2)
        .align_y(Alignment::Center),
    )
    .padding([4, 10])
    .on_press(Message::SwitchSession(session_id))
    .style(move |_t, _s| {
        let border_color = if is_gemini {
            if is_active {
                theme::TAB_GEMINI_BORDER
            } else {
                Color { r: 0.231, g: 0.122, b: 0.431, a: 1.0 }
            }
        } else if is_active {
            theme::BORDER_ACTIVE
        } else {
            theme::BORDER_SUBTLE
        };
        iced::widget::button::Style {
            background: Some(iced::Background::Color(bg)),
            border: iced::Border {
                color: border_color,
                width: 1.0,
                radius: 4.0.into(),
            },
            text_color,
            ..Default::default()
        }
    });

    container(tab_button).height(32.0).into()
}
