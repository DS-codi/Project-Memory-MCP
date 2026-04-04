/// SprintsPanel — sprint list with expandable goals.
/// Ported from supervisor/qml/SprintsPanel.qml.

use iced::{
    widget::{button, checkbox, column, container, row, scrollable, text, Column},
    Alignment, Background, Border, Color, Element, Length, Padding,
};

use crate::app_state::AppState;
use super::theme;

/// Sprint list content without an outer panel shell.
/// Called by PlansPanel when the Sprints main-tab is active.
pub fn view_embedded<'a, Message>(
    state: &'a AppState,
    on_sprint_select:  impl Fn(String) -> Message + 'a,
    on_refresh:        Message,
    on_toggle_goal:    impl Fn(String, String, bool) -> Message + 'a,
) -> Element<'a, Message>
where
    Message: Clone + 'a,
{
    let header = row![
        text("SPRINTS").size(11).color(theme::TEXT_PRIMARY).width(Length::Fill),
        button(text("↻").size(14)).on_press(on_refresh),
    ]
    .spacing(6)
    .align_y(Alignment::Center)
    .width(Length::Fill);

    let mut sprints_col: Column<Message> = Column::new().spacing(6).width(Length::Fill);

    if state.sprints.is_empty() {
        sprints_col = sprints_col.push(
            text(if state.plans_workspaces.is_empty() {
                "Select a workspace"
            } else {
                "No sprints"
            })
            .size(12)
            .color(theme::TEXT_SECONDARY),
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
                    text(if is_selected { "-" } else { "+" }).size(11).color(theme::TEXT_SECONDARY),
                    text(sprint.name.clone()).size(13).color(theme::TEXT_PRIMARY).width(Length::Fill),
                    text(format!("{} goals", sprint.goal_count)).size(10).color(theme::TEXT_SECONDARY),
                    status_badge,
                ]
                .spacing(6)
                .align_y(Alignment::Center),
            )
            .on_press(on_sprint_select(sid))
            .width(Length::Fill);

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

    column![header, list]
        .spacing(6)
        .width(Length::Fill)
        .height(Length::Fill)
        .into()
}
