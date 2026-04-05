//! Terminal panel — layout anchor for the wry WebView2 xterm.js window.
//!
//! The actual terminal is rendered by a separate wry WebView OS window
//! (see webview_host.rs). This iced widget provides:
//!   - A dark background fill so the area looks correct when WebView isn't shown
//!   - A "no active session" placeholder
//!   - Status info when a session is active

use iced::widget::{column, container, text};
use iced::{Element, Length};
use crate::app_state::{AppState, Message};
use crate::types::ConnectionState;
use crate::ui::theme;

pub fn view(state: &AppState) -> Element<'_, Message> {
    let has_session = !state.current_session_id.is_empty();
    let is_connected = state.connection_state == ConnectionState::Connected;

    let content: Element<Message> = if !is_connected {
        column![
            text("⬤  Not connected to pm-cli").size(13).color(theme::CLR_ERROR),
            text(format!("Listening on port {}...", state.terminal_ws_port))
                .size(11)
                .color(theme::TEXT_SECONDARY),
        ]
        .spacing(8)
        .into()
    } else if !has_session {
        column![
            text("No active terminal session").size(14).color(theme::TEXT_SECONDARY),
            text("Click \"New Tab\" to create a session, or launch a CLI above.")
                .size(11)
                .color(theme::TEXT_MUTED),
        ]
        .spacing(6)
        .into()
    } else {
        // Session is active — WebView window should be visible.
        // Show minimal info; the actual terminal is the wry OS window.
        column![
            text(format!("Terminal: {}", state.current_session_id))
                .size(11)
                .color(theme::TEXT_MUTED),
            text(format!("http://127.0.0.1:{}/", state.terminal_ws_port))
                .size(10)
                .color(theme::TEXT_MUTED),
        ]
        .spacing(4)
        .into()
    };

    container(content)
        .width(Length::Fill)
        .height(Length::Fill)
        .center_x(Length::Fill)
        .center_y(Length::Fill)
        .style(|_theme| iced::widget::container::Style {
            background: Some(iced::Background::Color(theme::TERM_BG)),
            ..Default::default()
        })
        .into()
}
