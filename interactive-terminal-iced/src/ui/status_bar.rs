//! Header bar and bottom action bar for interactive-terminal-iced.
//! Mirrors the QML header + bottom-bar layout from interactive-terminal/qml/main.qml lines 577-660.

use iced::widget::{button, container, row, text, text_input, Row};
use iced::{Alignment, Background, Border, Color, Element, Length};

use crate::app_state::{AppState, Message};
use crate::types::{CliProvider, ConnectionState};
use crate::ui::theme;

// ══════════════════════════════════════════════════════════════════════════════
// Helper: solid container style
// ══════════════════════════════════════════════════════════════════════════════

fn panel_style(bg: Color, border_color: Color) -> iced::widget::container::Style {
    iced::widget::container::Style {
        background: Some(Background::Color(bg)),
        border: Border {
            color: border_color,
            width: 1.0,
            radius: 0.0.into(),
        },
        ..Default::default()
    }
}

fn badge_style(bg: Color, radius: f32) -> iced::widget::container::Style {
    iced::widget::container::Style {
        background: Some(Background::Color(bg)),
        border: Border {
            radius: radius.into(),
            ..Default::default()
        },
        ..Default::default()
    }
}

fn action_btn_style(
    status: iced::widget::button::Status,
) -> iced::widget::button::Style {
    let bg = if matches!(status, iced::widget::button::Status::Hovered) {
        theme::BG_HOVER
    } else {
        theme::BG_CARD
    };
    iced::widget::button::Style {
        background: Some(Background::Color(bg)),
        border: Border {
            color: theme::BORDER_SUBTLE,
            width: 1.0,
            radius: 3.0.into(),
        },
        text_color: theme::TEXT_PRIMARY,
        ..Default::default()
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// view_header — top header bar
// ══════════════════════════════════════════════════════════════════════════════

/// Top header bar: connection dot · status · CPU/RAM · PTY badge · title · pending badge.
/// Mirrors the QML `Rectangle { Layout.preferredHeight: 36 ... }` block at line 577.
pub fn view_header(state: &AppState) -> Element<'_, Message> {
    // ── Connection dot ────────────────────────────────────────────────────────
    let dot_color = match state.connection_state {
        ConnectionState::Connected    => theme::CLR_CONNECTED,
        ConnectionState::Listening    => theme::CLR_LISTENING,
        ConnectionState::Disconnected => theme::CLR_ERROR,
    };
    let dot = container(iced::widget::Space::with_width(8))
        .width(10)
        .height(10)
        .style(move |_t: &iced::Theme| iced::widget::container::Style {
            background: Some(Background::Color(dot_color)),
            border: Border {
                color: Color { a: 0.376, ..dot_color },
                width: 2.0,
                radius: 5.0.into(),
            },
            ..Default::default()
        });

    // ── Status label ─────────────────────────────────────────────────────────
    let status_label = text(state.connection_state.status_text())
        .size(11)
        .color(theme::TEXT_SECONDARY);

    // ── CPU / RAM ─────────────────────────────────────────────────────────────
    let perf = text(format!(
        "CPU {:.1}% | RAM {:.1} MB",
        state.cpu_usage_percent, state.memory_usage_mb
    ))
    .size(11)
    .color(theme::TEXT_MUTED);

    // ── PTY mode badge ────────────────────────────────────────────────────────
    let is_pty_host = state.terminal_mode_label == "pty-host";
    let pty_bg   = if is_pty_host { theme::PTY_HOST_BG }   else { theme::BG_CARD };
    let pty_text_color = if is_pty_host { theme::CLR_BLUE } else { theme::TEXT_SECONDARY };
    let pty_mode_label = state.terminal_mode_label.clone();

    let pty_badge: Element<Message> = if !state.terminal_mode_label.is_empty() {
        container(
            text(format!("PTY: {}", pty_mode_label))
                .size(10)
                .color(pty_text_color),
        )
        .padding([2, 6])
        .style(move |_t: &iced::Theme| iced::widget::container::Style {
            background: Some(Background::Color(pty_bg)),
            border: Border {
                color: if is_pty_host { theme::CLR_BLUE } else { theme::BORDER_SUBTLE },
                width: 1.0,
                radius: 3.0.into(),
            },
            ..Default::default()
        })
        .into()
    } else {
        iced::widget::Space::with_width(0).into()
    };

    // ── App title (centred via flanking Fill spacers) ─────────────────────────
    let title = text("Interactive Terminal")
        .size(13)
        .color(theme::TEXT_PRIMARY);

    // ── Pending count badge ───────────────────────────────────────────────────
    let pending_count = state.pending_commands.len();
    let pending_badge: Element<Message> = if pending_count > 0 {
        container(
            text(pending_count.to_string())
                .size(10)
                .color(Color::WHITE),
        )
        .width(20)
        .height(20)
        .padding([2, 4])
        .style(|_t: &iced::Theme| badge_style(theme::CLR_ERROR, 10.0))
        .into()
    } else {
        iced::widget::Space::with_width(0).into()
    };

    // ── Compose row ───────────────────────────────────────────────────────────
    container(
        row![
            dot,
            status_label,
            perf,
            pty_badge,
            iced::widget::Space::with_width(Length::Fill),
            title,
            iced::widget::Space::with_width(Length::Fill),
            pending_badge,
        ]
        .spacing(8)
        .align_y(Alignment::Center)
        .padding([0, 12]),
    )
    .width(Length::Fill)
    .height(36)
    .style(|_t: &iced::Theme| panel_style(theme::BG_PANEL, theme::BORDER_SUBTLE))
    .into()
}

// ══════════════════════════════════════════════════════════════════════════════
// view_bottom_bar — bottom action bar
// ══════════════════════════════════════════════════════════════════════════════

/// Bottom bar: Copy All · Copy Last · Clear · Export Text · Export JSON · terminal profile label.
pub fn view_bottom_bar(state: &AppState) -> Element<'_, Message> {
    // Reusable small action button
    let mk_btn = |label: &'static str, msg: Message| -> Element<'static, Message> {
        button(text(label).size(11).color(theme::TEXT_PRIMARY))
            .padding([4, 10])
            .on_press(msg)
            .style(|_t: &iced::Theme, status| action_btn_style(status))
            .into()
    };

    // Profile label (right-aligned)
    let profile_row = container(
        row![
            text("Profile:").size(10).color(theme::TEXT_MUTED),
            text(state.current_terminal_profile.as_str())
                .size(11)
                .color(theme::TEXT_SECONDARY),
        ]
        .spacing(4)
        .align_y(Alignment::Center),
    )
    .padding([4, 8]);

    container(
        row![
            mk_btn("Copy All",    Message::CopyAllOutput),
            mk_btn("Copy Last",   Message::CopyLastOutput),
            mk_btn("Clear",       Message::ClearOutput),
            mk_btn("Export Text", Message::ExportOutputText),
            mk_btn("Export JSON", Message::ExportOutputJson),
            iced::widget::Space::with_width(Length::Fill),
            profile_row,
        ]
        .spacing(4)
        .align_y(Alignment::Center)
        .padding([3, 8]),
    )
    .width(Length::Fill)
    .height(34)
    .style(|_t: &iced::Theme| panel_style(theme::BG_PANEL, theme::BORDER_SUBTLE))
    .into()
}

// ══════════════════════════════════════════════════════════════════════════════
// view_session_controls — second row (workspace · venv · launch · saved cmds · allowlist)
// ══════════════════════════════════════════════════════════════════════════════

/// Second row: workspace path input · provider radio · Launch CLI · Provider Settings ·
/// Saved Commands · Allowlist · (spacer) · New Tab.
pub fn view_session_controls(state: &AppState) -> Element<'_, Message> {
    // ── Provider toggle buttons ───────────────────────────────────────────────
    let providers: &[(&str, CliProvider)] = &[
        ("Gemini",  CliProvider::Gemini),
        ("Copilot", CliProvider::Copilot),
        ("Claude",  CliProvider::Claude),
    ];
    let provider_btns: Vec<Element<Message>> = providers
        .iter()
        .map(|(label, p)| {
            let is_sel = state.preferred_cli_provider == *p;
            let p_clone = p.clone();
            button(text(*label).size(11).color(if is_sel { Color::WHITE } else { theme::TEXT_SECONDARY }))
                .padding([4, 8])
                .on_press(Message::ProviderChanged(p_clone))
                .style(move |_t: &iced::Theme, _s| iced::widget::button::Style {
                    background: Some(Background::Color(
                        if is_sel { theme::CLR_BLUE } else { theme::BG_INPUT },
                    )),
                    border: Border {
                        color: if is_sel { theme::CLR_BLUE } else { theme::BORDER_SUBTLE },
                        width: 1.0,
                        radius: 3.0.into(),
                    },
                    text_color: if is_sel { Color::WHITE } else { theme::TEXT_SECONDARY },
                    ..Default::default()
                })
                .into()
        })
        .collect();
    let provider_row = Row::with_children(provider_btns).spacing(3);

    // ── Workspace path input ──────────────────────────────────────────────────
    let workspace_input = text_input("Workspace path...", &state.current_workspace_path)
        .on_input(Message::WorkspacePathChanged)
        .size(12)
        .width(220);

    // ── Utility buttons ───────────────────────────────────────────────────────
    let mk_util = |label: &'static str, msg: Message| -> Element<'static, Message> {
        button(text(label).size(11).color(theme::TEXT_SECONDARY))
            .padding([5, 8])
            .on_press(msg)
            .style(|_t: &iced::Theme, status| action_btn_style(status))
            .into()
    };

    let launch_btn = button(
        text("Launch CLI").size(11).color(Color::WHITE),
    )
    .padding([5, 12])
    .on_press(Message::LaunchCli)
    .style(|_t: &iced::Theme, _s| iced::widget::button::Style {
        background: Some(Background::Color(theme::CLR_BLUE)),
        border: Border {
            radius: 3.0.into(),
            ..Default::default()
        },
        text_color: Color::WHITE,
        ..Default::default()
    });

    container(
        Row::new()
            .push(workspace_input)
            .push(iced::widget::Space::with_width(8))
            .push(provider_row)
            .push(iced::widget::Space::with_width(4))
            .push(launch_btn)
            .push(iced::widget::Space::with_width(4))
            .push(mk_util("Provider Settings", Message::OpenProviderSettings))
            .push(mk_util("Saved Commands",    Message::OpenSavedCommands))
            .push(mk_util("Allowlist",          Message::OpenAllowlist))
            .push(iced::widget::Space::with_width(Length::Fill))
            .push(mk_util("New Tab",            Message::CreateSession))
            .spacing(4)
            .align_y(Alignment::Center)
            .padding([4, 8]),
    )
    .width(Length::Fill)
    .height(42)
    .style(|_t: &iced::Theme| panel_style(theme::BG_PANEL, theme::BORDER_SUBTLE))
    .into()
}
