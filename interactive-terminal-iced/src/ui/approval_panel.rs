//! Approval panel — command card list and approval dialog modal.
//!
//! Two concerns:
//! 1. **Command card list** — scrollable list of all pending commands.
//! 2. **Approval dialog** — full modal form shown when `ActiveOverlay::ApprovalDialog` is set.

use iced::alignment::{Horizontal, Vertical};
use iced::widget::{
    button, checkbox, column, container, row, scrollable, text, text_input, Column, Row,
};
use iced::{Alignment, Color, Element, Length};

use crate::app_state::{AppState, Message};
use crate::types::{ActiveOverlay, AutonomyMode, CliProvider, PendingCommand, RiskTier};
use crate::ui::theme;

// ═══════════════════════════════════════════════════════════════════════════════
// Public entry point
// ═══════════════════════════════════════════════════════════════════════════════

/// Main entry point — returns either the approval dialog modal or the card list.
pub fn view(state: &AppState) -> Element<'_, Message> {
    if matches!(state.active_overlay, ActiveOverlay::ApprovalDialog) {
        view_approval_dialog(state)
    } else {
        view_command_cards(state)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Command card list
// ═══════════════════════════════════════════════════════════════════════════════

/// Scrollable list of pending command cards.
fn view_command_cards(state: &AppState) -> Element<'_, Message> {
    if state.pending_commands.is_empty() {
        return container(
            text("No pending commands")
                .size(14)
                .color(theme::TEXT_SECONDARY),
        )
        .width(Length::Fill)
        .height(Length::Fill)
        .align_x(Horizontal::Center)
        .align_y(Vertical::Center)
        .into();
    }

    let cards: Vec<Element<Message>> = state
        .pending_commands
        .iter()
        .map(|cmd| view_command_card(cmd))
        .collect();

    scrollable(
        Column::with_children(cards)
            .spacing(8)
            .padding(12)
            .width(Length::Fill),
    )
    .width(Length::Fill)
    .height(Length::Fill)
    .into()
}

/// Single pending command card (mirrors CommandCard.qml).
fn view_command_card(cmd: &PendingCommand) -> Element<'_, Message> {
    // Command text box
    let cmd_text = container(
        text(&cmd.command_text)
            .size(13)
            .font(iced::Font::MONOSPACE)
            .color(theme::TEXT_PRIMARY),
    )
    .padding([6, 10])
    .width(Length::Fill)
    .style(|_theme| iced::widget::container::Style {
        background: Some(iced::Background::Color(theme::BG_WINDOW)),
        border: iced::Border {
            color: theme::BORDER_SUBTLE,
            width: 1.0,
            radius: 4.0.into(),
        },
        ..Default::default()
    });

    // Working directory row
    let dir_row = row![
        text("Dir:").size(11).color(theme::TEXT_SECONDARY),
        text(&cmd.working_directory).size(11).color(theme::TEXT_MUTED),
    ]
    .spacing(6);

    // Optional context info
    let ctx: Element<Message> = if !cmd.context_info.is_empty() {
        text(&cmd.context_info)
            .size(11)
            .color(theme::TEXT_SECONDARY)
            .into()
    } else {
        // zero-height spacer
        text("").size(1).into()
    };

    // Allowlist badge (replaces risk-tier badge — PendingCommand has no risk_tier field)
    let allowlist_badge: Element<Message> = if cmd.is_allowlisted {
        container(text("Allowlisted").size(10).color(Color::WHITE))
            .padding([2, 6])
            .style(|_theme| iced::widget::container::Style {
                background: Some(iced::Background::Color(theme::RISK_LOW)),
                border: iced::Border {
                    radius: 4.0.into(),
                    ..Default::default()
                },
                ..Default::default()
            })
            .into()
    } else {
        container(text("Pending").size(10).color(Color::WHITE))
            .padding([2, 6])
            .style(|_theme| iced::widget::container::Style {
                background: Some(iced::Background::Color(theme::RISK_MEDIUM)),
                border: iced::Border {
                    radius: 4.0.into(),
                    ..Default::default()
                },
                ..Default::default()
            })
            .into()
    };

    let request_id_approve = cmd.request_id.clone();
    let approve_btn = button(text("Approve").size(12).color(Color::WHITE))
        .padding([6, 16])
        .style(|_theme, status| {
            let bg = if matches!(status, iced::widget::button::Status::Hovered) {
                Color {
                    r: 0.05,
                    g: 0.65,
                    b: 0.25,
                    a: 1.0,
                }
            } else {
                theme::CLR_APPROVE
            };
            iced::widget::button::Style {
                background: Some(iced::Background::Color(bg)),
                border: iced::Border {
                    radius: 4.0.into(),
                    ..Default::default()
                },
                text_color: Color::WHITE,
                ..Default::default()
            }
        })
        .on_press(Message::ApproveCommand {
            request_id: request_id_approve,
        });

    let decline_btn = button(text("Decline").size(12).color(Color::WHITE))
        .padding([6, 16])
        .style(|_theme, status| {
            let bg = if matches!(status, iced::widget::button::Status::Hovered) {
                Color {
                    r: 0.85,
                    g: 0.15,
                    b: 0.15,
                    a: 1.0,
                }
            } else {
                theme::CLR_DECLINE
            };
            iced::widget::button::Style {
                background: Some(iced::Background::Color(bg)),
                border: iced::Border {
                    radius: 4.0.into(),
                    ..Default::default()
                },
                text_color: Color::WHITE,
                ..Default::default()
            }
        })
        .on_press(Message::ApprovalShowDeclinePrompt);

    let btn_row = row![
        allowlist_badge,
        iced::widget::Space::with_width(Length::Fill),
        approve_btn,
        decline_btn,
    ]
    .spacing(8)
    .align_y(Alignment::Center);

    container(
        column![cmd_text, dir_row, ctx, btn_row,]
            .spacing(6)
            .padding(12),
    )
    .width(Length::Fill)
    .style(|_theme| iced::widget::container::Style {
        background: Some(iced::Background::Color(theme::BG_CARD)),
        border: iced::Border {
            color: theme::BORDER_SUBTLE,
            width: 1.0,
            radius: 6.0.into(),
        },
        ..Default::default()
    })
    .into()
}

// ═══════════════════════════════════════════════════════════════════════════════
// Approval dialog modal
// ═══════════════════════════════════════════════════════════════════════════════

/// Full approval dialog modal — rendered when `ActiveOverlay::ApprovalDialog`.
fn view_approval_dialog(state: &AppState) -> Element<'_, Message> {
    let d = &state.approval_dialog;

    // Decline prompt sub-view (takes priority over main dialog)
    if d.showing_decline_prompt {
        let decline_request_id = state
            .pending_commands
            .first()
            .map(|c| c.request_id.clone())
            .unwrap_or_default();

        return container(
            column![
                text("Decline reason (optional):")
                    .size(12)
                    .color(theme::TEXT_SECONDARY),
                text_input("Enter reason...", &d.decline_reason)
                    .on_input(Message::ApprovalDeclineReasonChanged)
                    .size(13)
                    .width(Length::Fill),
                row![
                    button(text("Confirm Decline").size(12))
                        .on_press(Message::DeclineCommand {
                            request_id: decline_request_id,
                        })
                        .padding([6, 12])
                        .style(|_t, _s| iced::widget::button::Style {
                            background: Some(iced::Background::Color(theme::CLR_DECLINE)),
                            border: iced::Border {
                                radius: 4.0.into(),
                                ..Default::default()
                            },
                            text_color: Color::WHITE,
                            ..Default::default()
                        }),
                    button(text("Cancel").size(12))
                        .on_press(Message::ApprovalCancelDecline)
                        .padding([6, 12])
                        .style(|_t, _s| iced::widget::button::Style {
                            background: Some(iced::Background::Color(theme::BG_INPUT)),
                            border: iced::Border {
                                color: theme::BORDER_SUBTLE,
                                width: 1.0,
                                radius: 4.0.into(),
                            },
                            text_color: theme::TEXT_PRIMARY,
                            ..Default::default()
                        }),
                ]
                .spacing(8),
            ]
            .spacing(8)
            .padding(16),
        )
        .width(Length::Fixed(500.0))
        .style(|_t| iced::widget::container::Style {
            background: Some(iced::Background::Color(theme::BG_CARD)),
            border: iced::Border {
                color: theme::BORDER_ACTIVE,
                width: 1.0,
                radius: 8.0.into(),
            },
            ..Default::default()
        })
        .into();
    }

    // ── Data for the main dialog ──────────────────────────────────────────────
    let cmd_opt = state.pending_commands.first();
    let cmd_text = cmd_opt.map(|c| c.command_text.as_str()).unwrap_or("");
    let cmd_dir = cmd_opt.map(|c| c.working_directory.as_str()).unwrap_or("");

    let risk_color = match d.risk_tier {
        RiskTier::Low => theme::RISK_LOW,
        RiskTier::Medium => theme::RISK_MEDIUM,
        RiskTier::High => theme::RISK_HIGH,
    };

    // ── Provider selector ─────────────────────────────────────────────────────
    let provider_section: Element<Message> = if state.approval_provider_chooser_enabled {
        let providers: &[(&str, CliProvider)] = &[
            ("Gemini", CliProvider::Gemini),
            ("Copilot", CliProvider::Copilot),
            ("Claude", CliProvider::Claude),
        ];
        let btns: Vec<Element<Message>> = providers
            .iter()
            .map(|(label, provider)| {
                let is_sel = d.provider == *provider;
                let p = provider.clone();
                button(text(*label).size(12))
                    .padding([4, 12])
                    .style(move |_theme, _status| iced::widget::button::Style {
                        background: Some(iced::Background::Color(if is_sel {
                            theme::CLR_BLUE
                        } else {
                            theme::BG_INPUT
                        })),
                        border: iced::Border {
                            color: theme::BORDER_SUBTLE,
                            width: 1.0,
                            radius: 4.0.into(),
                        },
                        text_color: theme::TEXT_PRIMARY,
                        ..Default::default()
                    })
                    .on_press(Message::ApprovalProviderChanged(p))
                    .into()
            })
            .collect();

        column![
            text("Provider").size(12).color(theme::TEXT_SECONDARY),
            Row::with_children(btns).spacing(6),
        ]
        .spacing(4)
        .into()
    } else {
        text("").size(1).into()
    };

    // ── Autonomy mode selector ─────────────────────────────────────────────────
    let autonomy_section: Element<Message> = if state.autonomy_mode_selector_visible {
        let guided_sel = d.autonomy_mode == AutonomyMode::Guided;
        column![
            text("Autonomy mode").size(12).color(theme::TEXT_SECONDARY),
            row![
                button(text("Guided").size(12))
                    .padding([4, 12])
                    .style(move |_t, _s| iced::widget::button::Style {
                        background: Some(iced::Background::Color(if guided_sel {
                            theme::CLR_BLUE
                        } else {
                            theme::BG_INPUT
                        })),
                        border: iced::Border {
                            color: theme::BORDER_SUBTLE,
                            width: 1.0,
                            radius: 4.0.into(),
                        },
                        text_color: theme::TEXT_PRIMARY,
                        ..Default::default()
                    })
                    .on_press(Message::ApprovalAutonomyModeChanged(AutonomyMode::Guided)),
                button(text("Autonomous").size(12))
                    .padding([4, 12])
                    .style(move |_t, _s| iced::widget::button::Style {
                        background: Some(iced::Background::Color(if !guided_sel {
                            theme::CLR_BLUE
                        } else {
                            theme::BG_INPUT
                        })),
                        border: iced::Border {
                            color: theme::BORDER_SUBTLE,
                            width: 1.0,
                            radius: 4.0.into(),
                        },
                        text_color: theme::TEXT_PRIMARY,
                        ..Default::default()
                    })
                    .on_press(Message::ApprovalAutonomyModeChanged(AutonomyMode::Autonomous)),
            ]
            .spacing(6),
        ]
        .spacing(4)
        .into()
    } else {
        text("").size(1).into()
    };

    // ── Budget fields (autonomous mode only) ──────────────────────────────────
    let budget_section: Element<Message> = if d.autonomy_mode == AutonomyMode::Autonomous {
        column![
            text("Budget").size(12).color(theme::TEXT_SECONDARY),
            row![
                text("Max commands:").size(11).color(theme::TEXT_SECONDARY),
                text_input("0", &d.budget_max_commands.to_string())
                    .on_input(|s| Message::ApprovalBudgetMaxCommandsChanged(
                        s.parse().unwrap_or(0)
                    ))
                    .width(Length::Fixed(60.0))
                    .size(12),
                text("Duration (s):").size(11).color(theme::TEXT_SECONDARY),
                text_input("0", &d.budget_max_duration_secs.to_string())
                    .on_input(|s| Message::ApprovalBudgetMaxDurationChanged(
                        s.parse().unwrap_or(0)
                    ))
                    .width(Length::Fixed(60.0))
                    .size(12),
                text("Max files:").size(11).color(theme::TEXT_SECONDARY),
                text_input("0", &d.budget_max_files.to_string())
                    .on_input(|s| Message::ApprovalBudgetMaxFilesChanged(
                        s.parse().unwrap_or(0)
                    ))
                    .width(Length::Fixed(60.0))
                    .size(12),
            ]
            .spacing(8)
            .align_y(Alignment::Center),
        ]
        .spacing(4)
        .into()
    } else {
        text("").size(1).into()
    };

    // ── Trusted scope (medium/high risk) ──────────────────────────────────────
    let trusted_section: Element<Message> = if d.risk_tier != RiskTier::Low {
        column![
            text(&d.trusted_scope_text)
                .size(11)
                .color(theme::TEXT_SECONDARY),
            checkbox("I confirm the trusted scope", d.trusted_scope_confirmed)
                .on_toggle(Message::ApprovalTrustedScopeToggled)
                .size(14)
                .text_size(12),
        ]
        .spacing(4)
        .into()
    } else {
        text("").size(1).into()
    };

    // ── Approve / Decline buttons ─────────────────────────────────────────────
    let can_approve = d.risk_tier == RiskTier::Low || d.trusted_scope_confirmed;
    let approve_request_id = state
        .pending_commands
        .first()
        .map(|c| c.request_id.clone())
        .unwrap_or_default();

    let approve_btn_base = button(text("Approve").size(13).color(Color::WHITE))
        .padding([8, 20])
        .style(move |_t, _s| iced::widget::button::Style {
            background: Some(iced::Background::Color(if can_approve {
                theme::CLR_APPROVE
            } else {
                Color {
                    r: 0.25,
                    g: 0.27,
                    b: 0.30,
                    a: 1.0,
                }
            })),
            border: iced::Border {
                radius: 4.0.into(),
                ..Default::default()
            },
            text_color: Color::WHITE,
            ..Default::default()
        });

    let approve_btn: Element<Message> = if can_approve {
        approve_btn_base
            .on_press(Message::ApproveCommand {
                request_id: approve_request_id,
            })
            .into()
    } else {
        approve_btn_base.into()
    };

    let decline_dialog_btn = button(text("Decline").size(13).color(Color::WHITE))
        .padding([8, 20])
        .on_press(Message::ApprovalShowDeclinePrompt)
        .style(|_t, _s| iced::widget::button::Style {
            background: Some(iced::Background::Color(theme::CLR_DECLINE)),
            border: iced::Border {
                radius: 4.0.into(),
                ..Default::default()
            },
            text_color: Color::WHITE,
            ..Default::default()
        });

    // ── Assemble main dialog ───────────────────────────────────────────────────
    container(
        scrollable(
            column![
                // Header row
                row![
                    text("Approve Command")
                        .size(15)
                        .color(theme::TEXT_PRIMARY),
                    iced::widget::Space::with_width(Length::Fill),
                    container(
                        text(d.risk_tier.label())
                            .size(10)
                            .color(Color::WHITE)
                    )
                    .padding([3, 8])
                    .style(move |_t| iced::widget::container::Style {
                        background: Some(iced::Background::Color(risk_color)),
                        border: iced::Border {
                            radius: 4.0.into(),
                            ..Default::default()
                        },
                        ..Default::default()
                    }),
                ]
                .align_y(Alignment::Center),
                // Command text
                text("Command:").size(11).color(theme::TEXT_SECONDARY),
                container(
                    text(cmd_text)
                        .size(12)
                        .font(iced::Font::MONOSPACE)
                        .color(theme::TEXT_PRIMARY),
                )
                .padding([6, 10])
                .width(Length::Fill)
                .style(|_t| iced::widget::container::Style {
                    background: Some(iced::Background::Color(theme::BG_WINDOW)),
                    border: iced::Border {
                        color: theme::BORDER_SUBTLE,
                        width: 1.0,
                        radius: 4.0.into(),
                    },
                    ..Default::default()
                }),
                text(format!("Dir: {}", cmd_dir))
                    .size(11)
                    .color(theme::TEXT_MUTED),
                provider_section,
                autonomy_section,
                budget_section,
                trusted_section,
                // Footer buttons
                row![approve_btn, decline_dialog_btn,].spacing(8),
            ]
            .spacing(10)
            .padding(16),
        )
        .height(Length::Shrink),
    )
    .width(Length::Fixed(520.0))
    .max_height(600)
    .style(|_t| iced::widget::container::Style {
        background: Some(iced::Background::Color(theme::BG_CARD)),
        border: iced::Border {
            color: theme::BORDER_ACTIVE,
            width: 1.0,
            radius: 8.0.into(),
        },
        ..Default::default()
    })
    .into()
}
