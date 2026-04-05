/// SprintsPanel — sprint list with expandable goals, create-sprint form, and add-goal form.
/// Ported from supervisor/qml/SprintsPanel.qml.

use iced::{
    widget::{button, checkbox, column, container, row, scrollable, text, text_input, tooltip, Column, Row},
    Alignment, Background, Border, Color, Element, Length, Padding,
};

use crate::app_state::AppState;
use super::theme;

const CLR_ERROR: Color = Color { r: 1.0, g: 0.42, b: 0.42, a: 1.0 };

/// Sprint list content without an outer panel shell.
/// Called by PlansPanel when the Sprints main-tab is active.
#[allow(clippy::too_many_arguments)]
pub fn view_embedded<'a, Message>(
    state: &'a AppState,
    on_sprint_select:      impl Fn(String) -> Message + 'a,
    on_refresh:            Message,
    on_toggle_goal:        impl Fn(String, String, bool) -> Message + 'a,
    // Create Sprint form
    on_title_changed:      impl Fn(String) -> Message + 'a,
    on_create:             Message,
    // Add Goal form
    on_goal_sprint_select: impl Fn(String) -> Message + 'a,
    on_goal_changed:       impl Fn(String) -> Message + 'a,
    on_add_goal:           Message,
    // Error dismissal
    on_dismiss_create_error: Message,
    on_dismiss_goal_error:   Message,
) -> Element<'a, Message>
where
    Message: Clone + 'a,
{
    // ── Create Sprint form ────────────────────────────────────────────────────
    let title_input = text_input("Sprint title…", &state.sprints_new_title)
        .on_input(on_title_changed)
        .size(12)
        .width(Length::Fill);

    let can_create = !state.sprints_creating && !state.sprints_new_title.trim().is_empty();
    let create_btn = button(text("Create Sprint").size(11))
        .on_press_maybe(if can_create { Some(on_create) } else { None });

    let mut create_row = Row::new().spacing(6).align_y(Alignment::Center).width(Length::Fill);
    create_row = create_row.push(create_btn);
    if state.sprints_creating {
        create_row = create_row.push(text("⟳").size(12).color(theme::TEXT_SECONDARY));
    }

    let mut create_col = column![title_input, create_row].spacing(4).width(Length::Fill);
    if let Some(err) = &state.sprints_create_error {
        create_col = create_col.push(
            row![
                text(err.clone()).size(11).color(CLR_ERROR).width(Length::Fill),
                button(text("✕").size(10))
                    .on_press(on_dismiss_create_error.clone())
                    .style(|_, _| iced::widget::button::Style {
                        background: None,
                        border: Border::default(),
                        text_color: theme::TEXT_SECONDARY,
                        ..Default::default()
                    })
                    .padding(Padding::from([0, 4])),
            ]
            .spacing(4)
            .align_y(Alignment::Center)
            .width(Length::Fill),
        );
    }

    let create_form = container(create_col.padding(Padding::from([6, 8])))
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

    // ── Header ────────────────────────────────────────────────────────────────
    let header = row![
        text("SPRINTS").size(11).color(theme::TEXT_PRIMARY).width(Length::Fill),
        tooltip(
            button(text("↻").size(14)).on_press(on_refresh),
            container(text("Refresh sprint list").size(11).color(theme::TEXT_PRIMARY))
                .padding(Padding::from([4, 8]))
                .style(|_| iced::widget::container::Style {
                    background: Some(Background::Color(Color::from_rgb8(0x1c, 0x21, 0x28))),
                    border: Border { color: theme::BORDER_SUBTLE, width: 1.0, radius: 4.0.into() },
                    ..Default::default()
                }),
            tooltip::Position::Bottom,
        ),
    ]
    .spacing(6)
    .align_y(Alignment::Center)
    .width(Length::Fill);

    let mut sprints_col: Column<Message> = Column::new().spacing(6).width(Length::Fill);

    // Sprints empty state — centred card
    if state.sprints.is_empty() {
        sprints_col = sprints_col.push(
            container(
                text(if state.plans_workspaces.is_empty() {
                    "Select a workspace above"
                } else {
                    "No sprints yet — create one below"
                })
                .size(12)
                .color(theme::TEXT_SECONDARY),
            )
            .padding(Padding::from([16, 0]))
            .width(Length::Fill)
            .align_x(iced::alignment::Horizontal::Center),
        );
    } else {
        for sprint in &state.sprints {
            let is_selected = sprint.sprint_id == state.selected_sprint_id;

            let status_color = match sprint.status.as_str() {
                "active"    => Color::from_rgb8(0x3f, 0xb9, 0x50),
                "completed" => theme::CLR_BLUE,
                "planned"   => Color::from_rgb8(0xd2, 0x99, 0x22),
                _           => theme::TEXT_SECONDARY,
            };
            let status_bg = match sprint.status.as_str() {
                "active"    => Color::from_rgb8(0x0e, 0x23, 0x18),
                "completed" => Color::from_rgb8(0x0d, 0x25, 0x47),
                "planned"   => Color::from_rgb8(0x1f, 0x1a, 0x0e),
                _           => Color::from_rgb8(0x21, 0x26, 0x2d),
            };

            let status_badge = container(
                text(sprint.status.to_uppercase()).size(9).color(status_color),
            )
            .padding(Padding::from([2, 6]))
            .style(move |_| iced::widget::container::Style {
                background: Some(Background::Color(status_bg)),
                border: Border { radius: 9.0.into(), ..Default::default() },
                ..Default::default()
            });

            let sid = sprint.sprint_id.clone();
            let sprint_row = button(
                row![
                    text(if is_selected { "−" } else { "+" }).size(11).color(theme::TEXT_SECONDARY),
                    text(sprint.name.clone()).size(13).color(theme::TEXT_PRIMARY).width(Length::Fill),
                    text(format!("{} goals", sprint.goal_count)).size(10).color(theme::TEXT_SECONDARY),
                    status_badge,
                ]
                .spacing(6)
                .align_y(Alignment::Center),
            )
            .on_press(on_sprint_select(sid))
            .width(Length::Fill)
            .style(move |_, status| {
                let hovered = matches!(status, iced::widget::button::Status::Hovered);
                iced::widget::button::Style {
                    background: Some(Background::Color(if is_selected {
                        Color::from_rgb8(0x1c, 0x21, 0x28)
                    } else if hovered {
                        Color::from_rgb8(0x14, 0x18, 0x1f)
                    } else {
                        Color::TRANSPARENT
                    })),
                    border: Border {
                        color: if is_selected { theme::CLR_BLUE } else { Color::TRANSPARENT },
                        width: if is_selected { 1.0 } else { 0.0 },
                        radius: 4.0.into(),
                    },
                    text_color: theme::TEXT_PRIMARY,
                    ..Default::default()
                }
            });

            let mut sprint_card = column![sprint_row].spacing(0).width(Length::Fill);

            if is_selected {
                let mut goals_col: Column<Message> = Column::new().spacing(6).width(Length::Fill);
                goals_col = goals_col.push(
                    text("GOALS").size(10).color(theme::TEXT_SECONDARY),
                );

                if state.sprint_goals.is_empty() {
                    goals_col = goals_col.push(
                        text("No goals defined").size(11).color(Color::from_rgb8(0x6e, 0x76, 0x81)),
                    );
                } else {
                    for goal in &state.sprint_goals {
                        let gid  = goal.goal_id.clone();
                        let sid2 = state.selected_sprint_id.clone();
                        let completed = goal.completed;
                        let toggle_msg = on_toggle_goal(sid2, gid, !completed);

                        let goal_text_color = if goal.completed {
                            Color::from_rgb8(0x3f, 0xb9, 0x50)
                        } else {
                            theme::TEXT_PRIMARY
                        };

                        goals_col = goals_col.push(
                            container(
                                row![
                                    checkbox("", goal.completed)
                                        .on_toggle(move |_| toggle_msg.clone()),
                                    text(goal.description.clone())
                                        .size(12)
                                        .color(goal_text_color)
                                        .width(Length::Fill),
                                ]
                                .spacing(8)
                                .align_y(Alignment::Center),
                            )
                            .padding(Padding::from([4, 8]))
                            .width(Length::Fill)
                            .style(move |_| iced::widget::container::Style {
                                background: Some(Background::Color(if completed {
                                    Color::from_rgb8(0x0a, 0x1f, 0x14)
                                } else {
                                    Color::from_rgb8(0x0d, 0x11, 0x17)
                                })),
                                border: Border {
                                    color: if completed {
                                        Color::from_rgb8(0x3f, 0xb9, 0x50)
                                    } else {
                                        theme::BORDER_SUBTLE
                                    },
                                    width: 1.0,
                                    radius: 4.0.into(),
                                },
                                ..Default::default()
                            }),
                        );
                    }
                }

                let expanded_area = container(goals_col.padding(Padding::from([10, 12])))
                    .width(Length::Fill)
                    .style(|_| iced::widget::container::Style {
                        background: Some(Background::Color(theme::BG_CARD)),
                        border: Border {
                            color: theme::CLR_BLUE,
                            width: 1.0,
                            ..Default::default()
                        },
                        ..Default::default()
                    });

                sprint_card = sprint_card.push(expanded_area);
            }

            sprints_col = sprints_col.push(sprint_card);
        }
    }

    let list = scrollable(sprints_col.padding(Padding::from([0, 8])))
        .height(Length::Fill)
        .width(Length::Fill);

    // ── Add Goal form ─────────────────────────────────────────────────────────
    let add_goal_label = text("ADD GOAL TO SPRINT").size(10).color(theme::TEXT_SECONDARY);

    // Sprint selector buttons
    let mut selector_row = Row::new().spacing(4).width(Length::Fill);
    if state.sprints.is_empty() {
        selector_row = selector_row.push(
            text("No sprints").size(11).color(theme::TEXT_SECONDARY),
        );
    } else {
        for sprint in &state.sprints {
            let sid = sprint.sprint_id.clone();
            let is_sel = state.sprints_selected_id.as_deref() == Some(sprint.sprint_id.as_str());
            let sel_msg = on_goal_sprint_select(sid);
            let btn = button(
                text(sprint.name.clone()).size(10),
            )
            .on_press(sel_msg)
            .style(move |_theme, status| {
                let hovered = matches!(status, iced::widget::button::Status::Hovered);
                iced::widget::button::Style {
                    background: Some(Background::Color(if is_sel {
                        Color::from_rgb8(0x0d, 0x25, 0x47)
                    } else if hovered {
                        Color::from_rgb8(0x1d, 0x24, 0x2e)
                    } else {
                        Color::from_rgb8(0x15, 0x1b, 0x23)
                    })),
                    text_color: if is_sel { theme::CLR_BLUE } else { theme::TEXT_SECONDARY },
                    border: Border {
                        color: if is_sel { theme::CLR_BLUE } else { theme::BORDER_SUBTLE },
                        width: 1.0,
                        radius: 4.0.into(),
                    },
                    ..Default::default()
                }
            })
            .padding(Padding::from([3, 7]));
            selector_row = selector_row.push(btn);
        }
    }

    let goal_input = text_input("Goal description…", &state.sprints_new_goal)
        .on_input(on_goal_changed)
        .size(12)
        .width(Length::Fill);

    let can_add = !state.sprints_adding_goal
        && state.sprints_selected_id.is_some()
        && !state.sprints_new_goal.trim().is_empty();
    let add_btn = button(text("Add Goal").size(11))
        .on_press_maybe(if can_add { Some(on_add_goal) } else { None });

    let mut add_row = Row::new().spacing(6).align_y(Alignment::Center).width(Length::Fill);
    add_row = add_row.push(add_btn);
    if state.sprints_adding_goal {
        add_row = add_row.push(text("⟳").size(12).color(theme::TEXT_SECONDARY));
    }

    let mut add_col = column![add_goal_label, selector_row, goal_input, add_row]
        .spacing(4)
        .width(Length::Fill);
    if let Some(err) = &state.sprints_add_goal_error {
        add_col = add_col.push(
            row![
                text(err.clone()).size(11).color(CLR_ERROR).width(Length::Fill),
                button(text("✕").size(10))
                    .on_press(on_dismiss_goal_error.clone())
                    .style(|_, _| iced::widget::button::Style {
                        background: None,
                        border: Border::default(),
                        text_color: theme::TEXT_SECONDARY,
                        ..Default::default()
                    })
                    .padding(Padding::from([0, 4])),
            ]
            .spacing(4)
            .align_y(Alignment::Center)
            .width(Length::Fill),
        );
    }

    let add_goal_form = container(add_col.padding(Padding::from([6, 8])))
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

    column![create_form, header, list, add_goal_form]
        .spacing(6)
        .width(Length::Fill)
        .height(Length::Fill)
        .into()
}
