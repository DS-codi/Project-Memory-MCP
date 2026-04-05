/// SessionsLivePanel — sessions content panels.
/// components_tab_view: active sessions list (used as sub-tab in main view).
/// my_sessions_view: bookmark panels (Pinned Plans, Saved Commands, Bookmarked Directories).

use iced::{
    widget::{button, column, container, row, scrollable, text, text_input, Space, Column},
    Alignment, Background, Border, Color, Element, Length, Padding,
};

use crate::app_state::AppState;
use crate::Message;
use super::theme;

// ─────────────────────────────────────────────────────────────────────────────
// Components — active sessions list
// ─────────────────────────────────────────────────────────────────────────────

fn components_tab(state: &AppState) -> Element<'_, Message> {
    super::sessions_panel::view(state, |key| Message::StopSession(key))
}

/// Public entry point for the Active Sessions content, called from main.rs
/// when rendering the Components tab sessions widget (tab index 1).
pub fn components_tab_view(state: &AppState) -> Element<'_, Message> {
    components_tab(state)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1 — My Sessions
// ─────────────────────────────────────────────────────────────────────────────

pub fn my_sessions_view(state: &AppState) -> Element<'_, Message> {
    my_sessions_tab(state)
}

fn my_sessions_tab(state: &AppState) -> Element<'_, Message> {
    let pinned_panel  = bookmark_panel(
        "Pinned Plans",
        theme::TEXT_ACCENT,
        1,
        &state.bookmarks_pinned_plans,
        state.bookmarks_add_panel,
        &state.bookmarks_add_input,
        "Plan title or ID…",
    );
    let cmds_panel = bookmark_panel(
        "Saved Commands",
        theme::CLR_RUNNING,
        2,
        &state.bookmarks_saved_commands,
        state.bookmarks_add_panel,
        &state.bookmarks_add_input,
        "Command…",
    );
    let dirs_panel = bookmark_panel(
        "Bookmarked Directories",
        Color::from_rgb8(0xe5, 0xb8, 0x4b),
        3,
        &state.bookmarks_dirs,
        state.bookmarks_add_panel,
        &state.bookmarks_add_input,
        "Directory path…",
    );

    let body = column![pinned_panel, cmds_panel, dirs_panel]
        .spacing(8)
        .width(Length::Fill);

    container(scrollable(body).height(Length::Fill))
        .padding(Padding::from([8, 10]))
        .width(Length::Fill)
        .height(Length::Fill)
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(theme::BG_PANEL)),
            border: Border {
                color: theme::BORDER_SUBTLE,
                width: 1.0,
                radius: 8.0.into(),
            },
            ..Default::default()
        })
        .into()
}

// ─────────────────────────────────────────────────────────────────────────────
// Bookmark panel (reused for all three panels)
// ─────────────────────────────────────────────────────────────────────────────

fn bookmark_panel<'a>(
    title: &'static str,
    title_color: Color,
    panel_id: u8,
    items: &'a [String],
    add_panel: u8,
    add_input: &'a str,
    placeholder: &'static str,
) -> Element<'a, Message> {
    // Header: title + "+" button
    let add_btn = button(text("+").size(13).color(theme::TEXT_ACCENT))
        .on_press(Message::BookmarkStartAdd(panel_id))
        .style(|_, _| iced::widget::button::Style {
            background: None,
            border: Border::default(),
            ..Default::default()
        });

    let header = row![
        text(title).size(11).color(title_color).width(Length::Fill),
        add_btn,
    ]
    .align_y(Alignment::Center)
    .width(Length::Fill);

    // Item list
    let mut rows: Column<'a, Message> = Column::new().spacing(3).width(Length::Fill);

    if items.is_empty() && add_panel != panel_id {
        rows = rows.push(
            container(
                text("Nothing here yet")
                    .size(11)
                    .color(theme::TEXT_SECONDARY),
            )
            .padding(Padding::from([4, 0]))
            .width(Length::Fill)
            .align_x(iced::alignment::Horizontal::Center),
        );
    }

    for (idx, item) in items.iter().enumerate() {
        let display = if item.len() > 80 {
            format!("{}…", &item[..80])
        } else {
            item.clone()
        };

        let copy_btn = button(text("Copy").size(10).color(theme::TEXT_ACCENT))
            .on_press(Message::BookmarkCopy(item.clone()))
            .style(|_, status| {
                let hovered = matches!(status, iced::widget::button::Status::Hovered);
                iced::widget::button::Style {
                    background: if hovered {
                        Some(Background::Color(Color::from_rgb8(0x14, 0x18, 0x1f)))
                    } else {
                        None
                    },
                    border: Border { radius: 4.0.into(), ..Default::default() },
                    ..Default::default()
                }
            });

        let del_btn = button(text("×").size(13).color(theme::CLR_STOPPED))
            .on_press(Message::BookmarkDelete(panel_id, idx))
            .style(|_, _| iced::widget::button::Style {
                background: None,
                border: Border::default(),
                ..Default::default()
            });

        rows = rows.push(
            container(
                row![
                    text(display).size(10).color(theme::TEXT_PRIMARY).width(Length::Fill),
                    copy_btn,
                    del_btn,
                ]
                .spacing(4)
                .align_y(Alignment::Center)
                .width(Length::Fill),
            )
            .padding(Padding::from([3, 6]))
            .width(Length::Fill)
            .style(|_| iced::widget::container::Style {
                background: Some(Background::Color(Color::from_rgb8(0x0d, 0x13, 0x19))),
                border: Border { radius: 4.0.into(), ..Default::default() },
                ..Default::default()
            }),
        );
    }

    // Inline add row (shown when this panel is active)
    if add_panel == panel_id {
        let input = text_input(placeholder, add_input)
            .on_input(Message::BookmarkAddInputChanged)
            .on_submit(Message::BookmarkConfirmAdd)
            .size(11)
            .padding(Padding::from([4, 6]));

        let confirm_btn = button(text("Add").size(11).color(theme::CLR_RUNNING))
            .on_press(Message::BookmarkConfirmAdd)
            .style(|_, _| iced::widget::button::Style {
                background: Some(Background::Color(Color::from_rgb8(0x0e, 0x23, 0x18))),
                border: Border { radius: 4.0.into(), color: theme::CLR_RUNNING, width: 1.0 },
                ..Default::default()
            });

        let cancel_btn = button(text("Cancel").size(11).color(theme::TEXT_SECONDARY))
            .on_press(Message::BookmarkCancelAdd)
            .style(|_, _| iced::widget::button::Style {
                background: None,
                border: Border::default(),
                ..Default::default()
            });

        rows = rows.push(
            row![input, confirm_btn, cancel_btn]
                .spacing(4)
                .align_y(Alignment::Center)
                .width(Length::Fill),
        );
    }

    container(
        column![header, section_divider(), rows]
            .spacing(4)
            .width(Length::Fill),
    )
    .padding(Padding::from([6, 8]))
    .width(Length::Fill)
    .style(|_| iced::widget::container::Style {
        background: Some(Background::Color(theme::BG_CARD)),
        border: Border {
            color: theme::BORDER_SUBTLE,
            width: 1.0,
            radius: 8.0.into(),
        },
        ..Default::default()
    })
    .into()
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

fn section_divider<'a>() -> Element<'a, Message> {
    container(Space::new(Length::Fill, 1.0))
        .width(Length::Fill)
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(theme::BORDER_SUBTLE)),
            ..Default::default()
        })
        .into()
}
