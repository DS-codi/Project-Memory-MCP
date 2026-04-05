//! Settings panel — provider settings + allowlist management.
//!
//! Shown as a right-hand overlay when `OpenProviderSettings` or `OpenAllowlist`
//! is triggered.  The two sections were separate drawers in the QML version; here
//! they are separate `view_*` functions dispatched by `ActiveOverlay`.

use iced::widget::{button, checkbox, column, container, row, scrollable, text, text_input, Column};
use iced::{Alignment, Color, Element, Length};
use crate::app_state::{AppState, Message};
use crate::types::ActiveOverlay;
use crate::ui::theme;

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

pub fn view(state: &AppState) -> Element<'_, Message> {
    match &state.active_overlay {
        ActiveOverlay::Allowlist         => view_allowlist(state),
        ActiveOverlay::ProviderSettings  => view_provider_settings(state),
        _                                => column![].into(),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: key-present indicator row
// ─────────────────────────────────────────────────────────────────────────────

/// Returns a small label + status pill for an API-key slot.
/// Both the label and status strings are `'static`, so the element is too.
fn key_indicator(present: bool, label: &'static str) -> Element<'static, Message> {
    row![
        text(label)
            .size(12)
            .color(theme::TEXT_SECONDARY),
        text(if present { "✔ set" } else { "not set" })
            .size(11)
            .color(if present { theme::CLR_RUNNING } else { theme::CLR_LISTENING }),
    ]
    .spacing(8)
    .align_y(Alignment::Center)
    .into()
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider settings
// ─────────────────────────────────────────────────────────────────────────────

fn view_provider_settings(state: &AppState) -> Element<'_, Message> {
    // ── Header ────────────────────────────────────────────────────────────────
    let header = row![
        text("Provider Settings").size(14).color(theme::TEXT_PRIMARY),
        iced::widget::Space::with_width(Length::Fill),
        button(text("✕").size(12))
            .padding([2, 6])
            .on_press(Message::CloseProviderSettings)
            .style(|_t: &iced::Theme, _s| iced::widget::button::Style {
                background: Some(iced::Background::Color(Color::TRANSPARENT)),
                text_color: theme::TEXT_SECONDARY,
                ..Default::default()
            }),
    ]
    .align_y(Alignment::Center);

    // ── Gemini API key section ────────────────────────────────────────────────
    let gemini_section = column![
        text("Gemini API Key").size(12).color(theme::TEXT_SECONDARY),
        key_indicator(state.gemini_key_present, "Gemini:"),
        row![
            text_input("Enter API key...", &state.gemini_key_input)
                .on_input(Message::GeminiKeyInputChanged)
                .password()
                .size(12)
                .width(Length::Fill),
            button(text("Set").size(11))
                .padding([4, 10])
                .on_press(Message::SetGeminiApiKey(state.gemini_key_input.clone()))
                .style(|_t: &iced::Theme, _s| iced::widget::button::Style {
                    background: Some(iced::Background::Color(theme::CLR_BLUE)),
                    border: iced::Border { radius: 3.0.into(), ..Default::default() },
                    text_color: Color::WHITE,
                    ..Default::default()
                }),
            button(text("Clear").size(11))
                .padding([4, 10])
                .on_press(Message::ClearGeminiApiKey)
                .style(|_t: &iced::Theme, _s| iced::widget::button::Style {
                    background: Some(iced::Background::Color(theme::BG_INPUT)),
                    border: iced::Border { radius: 3.0.into(), ..Default::default() },
                    text_color: theme::TEXT_SECONDARY,
                    ..Default::default()
                }),
        ]
        .spacing(6)
        .align_y(Alignment::Center),
    ]
    .spacing(6);

    // ── Other provider status ─────────────────────────────────────────────────
    let copilot_status = key_indicator(state.copilot_key_present, "Copilot:");
    let claude_status  = key_indicator(state.claude_key_present,  "Claude:");

    // ── Behaviour toggles ─────────────────────────────────────────────────────
    let toggles = column![
        checkbox(
            "Approval provider chooser",
            state.approval_provider_chooser_enabled,
        )
        .on_toggle(Message::ProviderChooserEnabledToggled)
        .text_size(12),
        checkbox(
            "Autonomy mode selector",
            state.autonomy_mode_selector_visible,
        )
        .on_toggle(Message::AutonomySelectorVisibleToggled)
        .text_size(12),
        checkbox(
            "Run commands in window",
            state.run_commands_in_window,
        )
        .on_toggle(Message::RunCommandsInWindowToggled)
        .text_size(12),
        checkbox(
            "Start with Windows",
            state.start_with_windows,
        )
        .on_toggle(Message::SetStartWithWindows)
        .text_size(12),
    ]
    .spacing(8);

    // ── Compose ───────────────────────────────────────────────────────────────
    container(
        scrollable(
            column![
                header,
                iced::widget::Rule::horizontal(1),
                gemini_section,
                copilot_status,
                claude_status,
                iced::widget::Rule::horizontal(1),
                text("Settings").size(13).color(theme::TEXT_SECONDARY),
                toggles,
            ]
            .spacing(10)
            .padding(12),
        ),
    )
    .width(360)
    .height(Length::Fill)
    .style(|_t: &iced::Theme| iced::widget::container::Style {
        background: Some(iced::Background::Color(theme::BG_PANEL)),
        border: iced::Border {
            color: theme::BORDER_SUBTLE,
            width: 1.0,
            ..Default::default()
        },
        ..Default::default()
    })
    .into()
}

// ─────────────────────────────────────────────────────────────────────────────
// Allowlist
// ─────────────────────────────────────────────────────────────────────────────

fn view_allowlist(state: &AppState) -> Element<'_, Message> {
    // ── Header ────────────────────────────────────────────────────────────────
    let header = row![
        text("Allowlist").size(14).color(theme::TEXT_PRIMARY),
        iced::widget::Space::with_width(Length::Fill),
        button(text("✕").size(12))
            .padding([2, 6])
            .on_press(Message::CloseAllowlist)
            .style(|_t: &iced::Theme, _s| iced::widget::button::Style {
                background: Some(iced::Background::Color(Color::TRANSPARENT)),
                text_color: theme::TEXT_SECONDARY,
                ..Default::default()
            }),
    ]
    .align_y(Alignment::Center);

    // ── Filter input ──────────────────────────────────────────────────────────
    let filter_row = row![
        text("Filter:").size(11).color(theme::TEXT_SECONDARY),
        text_input("Search patterns...", &state.allowlist_filter)
            .on_input(Message::AllowlistFilterChanged)
            .size(12)
            .width(Length::Fill),
    ]
    .spacing(6)
    .align_y(Alignment::Center);

    // ── Pattern list ──────────────────────────────────────────────────────────
    let filter_lc = state.allowlist_filter.to_lowercase();

    let pattern_items: Vec<Element<Message>> = state
        .allowlist_patterns
        .iter()
        .filter(|p| {
            state.allowlist_filter.is_empty()
                || p.pattern.to_lowercase().contains(&filter_lc)
        })
        .map(|p| {
            let pattern_clone = p.pattern.clone();
            let is_builtin    = p.is_builtin;

            let action: Element<Message> = if is_builtin {
                text("built-in")
                    .size(10)
                    .color(theme::TEXT_MUTED)
                    .into()
            } else {
                button(text("✕").size(10))
                    .padding([1, 4])
                    .on_press(Message::RemoveAllowlistPattern(pattern_clone))
                    .style(|_t: &iced::Theme, _s| iced::widget::button::Style {
                        background: Some(iced::Background::Color(theme::BG_INPUT)),
                        text_color: theme::CLR_ERROR,
                        ..Default::default()
                    })
                    .into()
            };

            row![
                text(p.pattern.clone())
                    .size(11)
                    .color(theme::TEXT_PRIMARY)
                    .font(iced::Font::MONOSPACE)
                    .width(Length::Fill),
                action,
            ]
            .align_y(Alignment::Center)
            .spacing(6)
            .into()
        })
        .collect();

    let list = scrollable(
        Column::with_children(pattern_items)
            .spacing(4)
            .padding([4, 0]),
    )
    .height(Length::Fixed(200.0));

    // ── Add-pattern row ───────────────────────────────────────────────────────
    let add_row = row![
        text_input("Add pattern...", &state.allowlist_input)
            .on_input(Message::AllowlistPatternInputChanged)
            .size(12)
            .width(Length::Fill)
            .font(iced::Font::MONOSPACE),
        button(text("Add").size(11))
            .padding([4, 10])
            .on_press(Message::AddAllowlistPattern(state.allowlist_input.clone()))
            .style(|_t: &iced::Theme, _s| iced::widget::button::Style {
                background: Some(iced::Background::Color(theme::CLR_BLUE)),
                border: iced::Border { radius: 3.0.into(), ..Default::default() },
                text_color: Color::WHITE,
                ..Default::default()
            }),
    ]
    .spacing(6)
    .align_y(Alignment::Center);

    // ── Proposed-pattern section (shown when a pattern is being previewed) ────
    let proposed_section: Element<Message> = if !state.proposed_allowlist_pattern.is_empty() {
        column![
            text("Proposed pattern:").size(11).color(theme::TEXT_SECONDARY),
            row![
                button(
                    text(state.proposed_exact_pattern.clone())
                        .size(10)
                        .font(iced::Font::MONOSPACE),
                )
                .padding([3, 8])
                .on_press(Message::SelectExactProposedPattern)
                .style(|_t: &iced::Theme, _s| iced::widget::button::Style {
                    background: Some(iced::Background::Color(theme::BG_INPUT)),
                    border: iced::Border { radius: 3.0.into(), ..Default::default() },
                    text_color: theme::TEXT_PRIMARY,
                    ..Default::default()
                }),
                button(
                    text(state.proposed_general_pattern.clone())
                        .size(10)
                        .font(iced::Font::MONOSPACE),
                )
                .padding([3, 8])
                .on_press(Message::SelectGeneralProposedPattern)
                .style(|_t: &iced::Theme, _s| iced::widget::button::Style {
                    background: Some(iced::Background::Color(theme::BG_INPUT)),
                    border: iced::Border { radius: 3.0.into(), ..Default::default() },
                    text_color: theme::TEXT_PRIMARY,
                    ..Default::default()
                }),
            ]
            .spacing(6),
            text(state.proposed_risk_hint.clone())
                .size(10)
                .color(theme::CLR_YELLOW),
            row![
                button(text("Confirm").size(11))
                    .padding([4, 10])
                    .on_press(Message::ConfirmProposedPattern)
                    .style(|_t: &iced::Theme, _s| iced::widget::button::Style {
                        background: Some(iced::Background::Color(theme::CLR_APPROVE)),
                        border: iced::Border { radius: 3.0.into(), ..Default::default() },
                        text_color: Color::WHITE,
                        ..Default::default()
                    }),
                button(text("Cancel").size(11))
                    .padding([4, 10])
                    .on_press(Message::CancelProposedPattern),
            ]
            .spacing(6),
        ]
        .spacing(4)
        .into()
    } else {
        column![].into()
    };

    // ── Status / error line ───────────────────────────────────────────────────
    let status: Element<Message> = if !state.allowlist_last_error.is_empty() {
        text(state.allowlist_last_error.clone())
            .size(10)
            .color(theme::CLR_ERROR)
            .into()
    } else if !state.allowlist_last_op.is_empty() {
        text(state.allowlist_last_op.clone())
            .size(10)
            .color(theme::CLR_RUNNING)
            .into()
    } else {
        column![].into()
    };

    // ── Compose ───────────────────────────────────────────────────────────────
    container(
        column![
            header,
            filter_row,
            iced::widget::Rule::horizontal(1),
            list,
            add_row,
            proposed_section,
            status,
        ]
        .spacing(8)
        .padding(12),
    )
    .width(360)
    .height(Length::Fill)
    .style(|_t: &iced::Theme| iced::widget::container::Style {
        background: Some(iced::Background::Color(theme::BG_PANEL)),
        border: iced::Border {
            color: theme::BORDER_SUBTLE,
            width: 1.0,
            ..Default::default()
        },
        ..Default::default()
    })
    .into()
}
