//! Saved commands drawer — sidebar listing named commands with execute/delete actions.

use iced::widget::{button, column, container, row, scrollable, text, text_input, Column};
use iced::{Alignment, Color, Element, Length};
use crate::app_state::{AppState, Message};
use crate::ui::theme;

pub fn view(state: &AppState) -> Element<'_, Message> {
    let header = row![
        text("Saved Commands").size(14).color(theme::TEXT_PRIMARY),
        iced::widget::Space::with_width(Length::Fill),
        button(text("✕").size(12))
            .padding([2, 6])
            .on_press(Message::CloseSavedCommands)
            .style(|_t: &iced::Theme, _s| iced::widget::button::Style {
                background: Some(iced::Background::Color(Color::TRANSPARENT)),
                text_color: theme::TEXT_SECONDARY,
                ..Default::default()
            }),
    ]
    .align_y(Alignment::Center);

    // List of saved commands
    let items: Vec<Element<Message>> = state.saved_commands.iter().map(|cmd| {
        let id_exec = cmd.id.clone();
        let id_del  = cmd.id.clone();
        container(
            row![
                column![
                    text(cmd.name.clone()).size(12).color(theme::TEXT_PRIMARY),
                    text(cmd.command.clone())
                        .size(10)
                        .color(theme::TEXT_MUTED)
                        .font(iced::Font::MONOSPACE),
                ]
                .spacing(2)
                .width(Length::Fill),
                button(text("Run").size(11))
                    .padding([3, 8])
                    .on_press(Message::ExecuteSavedCommand(id_exec))
                    .style(|_t: &iced::Theme, _s| iced::widget::button::Style {
                        background: Some(iced::Background::Color(theme::CLR_APPROVE)),
                        border: iced::Border {
                            radius: 3.0.into(),
                            ..Default::default()
                        },
                        text_color: Color::WHITE,
                        ..Default::default()
                    }),
                button(text("✕").size(11))
                    .padding([3, 6])
                    .on_press(Message::DeleteSavedCommand(id_del))
                    .style(|_t: &iced::Theme, _s| iced::widget::button::Style {
                        background: Some(iced::Background::Color(theme::BG_INPUT)),
                        border: iced::Border {
                            radius: 3.0.into(),
                            ..Default::default()
                        },
                        text_color: theme::TEXT_SECONDARY,
                        ..Default::default()
                    }),
            ]
            .spacing(6)
            .align_y(Alignment::Center)
            .padding([6, 8]),
        )
        .width(Length::Fill)
        .style(|_t: &iced::Theme| iced::widget::container::Style {
            background: Some(iced::Background::Color(theme::BG_CARD)),
            border: iced::Border {
                color: theme::BORDER_SUBTLE,
                width: 1.0,
                radius: 4.0.into(),
            },
            ..Default::default()
        })
        .into()
    })
    .collect();

    let list: Element<Message> = if items.is_empty() {
        column![
            text("No saved commands").size(12).color(theme::TEXT_MUTED)
        ]
        .into()
    } else {
        scrollable(Column::with_children(items).spacing(6))
            .height(Length::Fixed(300.0))
            .into()
    };

    // ── Save new command form ─────────────────────────────────────────────────
    let save_form = column![
        text("Save new command").size(12).color(theme::TEXT_SECONDARY),
        text_input("Name...", &state.saved_cmd_name_input)
            .on_input(Message::SavedCommandNameInputChanged)
            .size(12)
            .width(Length::Fill),
        text_input("Command...", &state.saved_cmd_input)
            .on_input(Message::SavedCommandInputChanged)
            .size(12)
            .width(Length::Fill)
            .font(iced::Font::MONOSPACE),
        button(text("Save").size(12))
            .padding([5, 16])
            .on_press(Message::SaveNewCommand {
                name:    state.saved_cmd_name_input.clone(),
                command: state.saved_cmd_input.clone(),
            })
            .style(|_t: &iced::Theme, _s| iced::widget::button::Style {
                background: Some(iced::Background::Color(theme::CLR_BLUE)),
                border: iced::Border {
                    radius: 4.0.into(),
                    ..Default::default()
                },
                text_color: Color::WHITE,
                ..Default::default()
            }),
    ]
    .spacing(6);

    container(
        column![
            header,
            iced::widget::Rule::horizontal(1),
            list,
            iced::widget::Rule::horizontal(1),
            save_form,
        ]
        .spacing(10)
        .padding(12),
    )
    .width(320)
    .height(Length::Fill)
    .style(|_t: &iced::Theme| iced::widget::container::Style {
        background: Some(iced::Background::Color(theme::BG_PANEL)),
        border: iced::Border {
            color:  theme::BORDER_SUBTLE,
            width:  1.0,
            radius: 0.0.into(),
        },
        ..Default::default()
    })
    .into()
}
