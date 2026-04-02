/// PlansPanel — collapsible left sidebar with Plans tab + Sprints tab.
/// Ported from supervisor/qml/PlansPanel.qml.

use iced::{
    widget::{button, column, container, pick_list, row, scrollable, text, Space, Column},
    Alignment, Background, Border, Color, Element, Length, Padding,
};

use crate::app_state::AppState;
use super::{theme, sprints_panel};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────
#[allow(clippy::too_many_arguments)]
pub fn view<'a, Message>(
    state:               &'a AppState,
    // Panel control
    on_toggle:           Message,
    // Workspace picker
    on_workspace_select: impl Fn(String) -> Message + 'a,
    on_refresh:          Message,
    // Main tabs (Plans / Sprints)
    on_main_tab_plans:   Message,
    on_main_tab_sprints: Message,
    // Plans sub-tabs
    on_tab_active:       Message,
    on_tab_all:          Message,
    // Plan interaction
    on_plan_toggle:      impl Fn(String) -> Message + 'a,
    on_open_in_dashboard: impl Fn(String, String) -> Message + 'a,
    on_launch_agent:     impl Fn(String, String) -> Message + 'a,
    on_open_in_ide:      Message,
    on_create_plan:      Message,
    // Sprints (used when Sprints tab is active)
    on_sprint_select:    impl Fn(String) -> Message + 'a,
    on_sprints_refresh:  Message,
    on_toggle_goal:      impl Fn(String, String, bool) -> Message + 'a,
) -> Element<'a, Message>
where
    Message: Clone + 'a,
{
    // ── Collapsed strip (44 px) ───────────────────────────────────────────────
    if !state.plans_panel_expanded {
        return container(
            column![
                button(text("►").size(14)).on_press(on_toggle),
                text("PLANS")
                    .size(9)
                    .color(theme::TEXT_SECONDARY),
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

    // ── Workspace picker ──────────────────────────────────────────────────────
    let workspace_names: Vec<String> = state
        .plans_workspaces
        .iter()
        .map(|w| w.name.clone())
        .collect();
    let selected_name = state
        .plans_workspaces
        .get(state.plans_workspace_index)
        .map(|w| w.name.clone());

    let ws_pick = pick_list(workspace_names, selected_name, move |name: String| {
        on_workspace_select(name)
    })
    .width(Length::Fixed(160.0));

    // ── Panel header row ──────────────────────────────────────────────────────
    let title_str = if state.plans_main_tab == 0 { "PLANS" } else { "SPRINTS" };
    let panel_header = row![
        text(title_str)
            .size(11)
            .color(theme::TEXT_PRIMARY)
            .width(Length::Fill),
        ws_pick,
        button(text("↻").size(14)).on_press(on_refresh.clone()),
        button(text("◄").size(14)).on_press(on_toggle),
    ]
    .spacing(6)
    .align_y(Alignment::Center)
    .width(Length::Fill);

    // ── Main tab bar: Plans / Sprints ─────────────────────────────────────────
    fn tab_btn_style(active: bool) -> impl Fn(&iced::Theme, iced::widget::button::Status) -> iced::widget::button::Style {
        move |_theme, _status| {
            iced::widget::button::Style {
                background: Some(Background::Color(if active {
                    Color::from_rgb8(0x1c, 0x21, 0x28)
                } else {
                    Color::TRANSPARENT
                })),
                text_color: if active { theme::TEXT_PRIMARY } else { theme::TEXT_SECONDARY },
                border: Border {
                    color: if active { theme::CLR_BLUE } else { Color::TRANSPARENT },
                    width: if active { 0.0 } else { 0.0 },
                    radius: 4.0.into(),
                },
                ..Default::default()
            }
        }
    }

    let main_tabs = row![
        button(text("Plans").size(11))
            .on_press(on_main_tab_plans)
            .style(tab_btn_style(state.plans_main_tab == 0))
            .padding(Padding::from([4, 8])),
        button(text("Sprints").size(11))
            .on_press(on_main_tab_sprints)
            .style(tab_btn_style(state.plans_main_tab == 1))
            .padding(Padding::from([4, 8])),
    ]
    .spacing(2)
    .width(Length::Fill);

    // ── Content: Plans or Sprints ─────────────────────────────────────────────
    let content: Element<'a, Message> = if state.plans_main_tab == 1 {
        // Sprints tab
        sprints_panel::view_embedded(
            state,
            on_sprint_select,
            on_sprints_refresh,
            on_toggle_goal,
        )
    } else {
        // Plans tab
        plans_content(
            state,
            on_tab_active,
            on_tab_all,
            on_plan_toggle,
            on_open_in_dashboard,
            on_launch_agent,
            on_open_in_ide,
            on_create_plan,
        )
    };

    // ── Outer panel ───────────────────────────────────────────────────────────
    container(
        column![panel_header, main_tabs, content]
            .spacing(0)
            .width(Length::Fill)
            .height(Length::Fill),
    )
    .padding(Padding { top: 10.0, right: 6.0, bottom: 8.0, left: 10.0 })
    .width(Length::Fixed(460.0))
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

// ─────────────────────────────────────────────────────────────────────────────
// Plans content (sub-tabs Active / All + plan list)
// ─────────────────────────────────────────────────────────────────────────────
fn plans_content<'a, Message>(
    state:               &'a AppState,
    on_tab_active:       Message,
    on_tab_all:          Message,
    on_plan_toggle:      impl Fn(String) -> Message + 'a,
    on_open_in_dashboard: impl Fn(String, String) -> Message + 'a,
    on_launch_agent:     impl Fn(String, String) -> Message + 'a,
    on_open_in_ide:      Message,
    on_create_plan:      Message,
) -> Element<'a, Message>
where
    Message: Clone + 'a,
{
    // ── Toolbar ───────────────────────────────────────────────────────────────
    let toolbar = row![
        button(text("Open in IDE").size(10))
            .on_press(on_open_in_ide)
            .padding(Padding::from([4, 10])),
        button(text("Create Plan").size(10))
            .on_press(on_create_plan)
            .padding(Padding::from([4, 10])),
        Space::new(Length::Fill, 0.0),
        // Provider indicator
        container(
            text(if state.plans_provider == 1 { "Claude CLI" } else { "Gemini" }).size(9).color(theme::TEXT_ACCENT),
        )
        .padding(Padding::from([2, 6]))
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(Color::from_rgb8(0x0d, 0x11, 0x17))),
            border: Border { color: theme::BORDER_SUBTLE, width: 1.0, radius: 4.0.into() },
            ..Default::default()
        }),
    ]
    .spacing(5)
    .align_y(Alignment::Center)
    .width(Length::Fill);

    // ── Sub-tab bar: Active / All Plans ───────────────────────────────────────
    let tabs = row![
        button(text("Active").size(11))
            .on_press(on_tab_active)
            .padding(Padding::from([3, 8])),
        button(text("All Plans").size(11))
            .on_press(on_tab_all)
            .padding(Padding::from([3, 8])),
    ]
    .spacing(0)
    .width(Length::Fill);

    // ── Plan list ─────────────────────────────────────────────────────────────
    let mut plans_col: Column<Message> = Column::new().spacing(6).width(Length::Fill);

    if state.plans.is_empty() {
        plans_col = plans_col.push(
            container(
                text(if state.plans_tab == 0 { "No active plans" } else { "No plans" })
                    .size(12)
                    .color(theme::TEXT_SECONDARY),
            )
            .padding(Padding::from([20, 0]))
            .width(Length::Fill)
            .align_x(iced::alignment::Horizontal::Center),
        );
    } else {
        for plan in &state.plans {
            let status_color = match plan.status.as_str() {
                "active"  => Color::from_rgb8(0x3f, 0xb9, 0x50),
                "paused"  => Color::from_rgb8(0xd2, 0x99, 0x22),
                "blocked" => Color::from_rgb8(0xf8, 0x51, 0x49),
                _         => theme::TEXT_SECONDARY,
            };
            let status_bg = match plan.status.as_str() {
                "active"  => Color::from_rgb8(0x0e, 0x23, 0x18),
                "paused"  => Color::from_rgb8(0x1f, 0x1a, 0x0e),
                "blocked" => Color::from_rgb8(0x2d, 0x0f, 0x0f),
                _         => Color::from_rgb8(0x21, 0x26, 0x2d),
            };

            let steps_label = if plan.steps_total > 0 {
                format!("{}/{}", plan.steps_done, plan.steps_total)
            } else {
                String::new()
            };

            let status_badge = container(
                text(plan.status.to_uppercase())
                    .size(10)
                    .color(status_color),
            )
            .padding(Padding::from([2, 6]))
            .style(move |_| iced::widget::container::Style {
                background: Some(Background::Color(status_bg)),
                border: Border { radius: 9.0.into(), ..Default::default() },
                ..Default::default()
            });

            // Progress bar (3 px high)
            let progress_bar: Option<Element<'a, Message>> = if plan.steps_total > 0 {
                let ratio = plan.steps_done as f32 / plan.steps_total as f32;
                let bar = container(Space::new(Length::Fill, 0.0))
                    .height(Length::Fixed(3.0));
                let filled = container(Space::new(Length::Fill, 0.0))
                    .width(Length::FillPortion((ratio * 100.0) as u16))
                    .height(Length::Fixed(3.0))
                    .style(|_| iced::widget::container::Style {
                        background: Some(Background::Color(theme::CLR_BLUE)),
                        ..Default::default()
                    });
                Some(
                    container(
                        row![
                            filled,
                            bar,
                        ]
                        .width(Length::Fill),
                    )
                    .width(Length::Fill)
                    .height(Length::Fixed(3.0))
                    .style(|_| iced::widget::container::Style {
                        background: Some(Background::Color(theme::BORDER_SUBTLE)),
                        border: Border { radius: 2.0.into(), ..Default::default() },
                        ..Default::default()
                    })
                    .into(),
                )
            } else {
                None
            };

            let header_inner = {
                let mut r = column![
                    row![
                        text(if plan.expanded { "−" } else { "+" })
                            .size(11).color(theme::TEXT_SECONDARY).width(Length::Fixed(12.0)),
                        text(plan.title.clone())
                            .size(13).color(theme::TEXT_PRIMARY).width(Length::Fill),
                        text(steps_label.clone()).size(11).color(theme::TEXT_SECONDARY),
                        status_badge,
                    ]
                    .spacing(6).align_y(Alignment::Center).width(Length::Fill),
                ]
                .spacing(4)
                .width(Length::Fill);
                if let Some(pb) = progress_bar {
                    r = r.push(pb);
                }
                r
            };

            let plan_toggle_msg = on_plan_toggle(plan.plan_id.clone());
            let card_header = button(header_inner)
                .on_press(plan_toggle_msg)
                .padding(Padding::from([7, 10]))
                .width(Length::Fill)
                .style(move |_, _| iced::widget::button::Style {
                    background: Some(Background::Color(
                        if plan.expanded { Color::from_rgb8(0x1c, 0x21, 0x28) }
                        else             { Color::from_rgb8(0x0d, 0x11, 0x17) }
                    )),
                    border: Border {
                        color: if plan.expanded { theme::CLR_BLUE } else { theme::BORDER_SUBTLE },
                        width: 1.0,
                        radius: if plan.expanded { 0.0.into() } else { 6.0.into() },
                    },
                    text_color: theme::TEXT_PRIMARY,
                    ..Default::default()
                });

            let mut card_col = column![card_header].spacing(0).width(Length::Fill);

            if plan.expanded {
                let mut detail: Column<Message> = Column::new().spacing(8).width(Length::Fill);

                // Category + recommended agent
                if !plan.category.is_empty() || !plan.recommended.is_empty() {
                    let cat_row = row![
                        text(plan.category.to_uppercase())
                            .size(10)
                            .color(theme::TEXT_ACCENT),
                        text(format!("  ·  {}", plan.recommended))
                            .size(10)
                            .color(theme::TEXT_SECONDARY),
                    ]
                    .spacing(0);
                    detail = detail.push(cat_row);
                }

                // Next/active step
                if !plan.next_step_task.is_empty() {
                    let step_status_color = if plan.next_step_status == "active" {
                        Color::from_rgb8(0x3f, 0xb9, 0x50)
                    } else {
                        Color::from_rgb8(0xd2, 0x99, 0x22)
                    };
                    let step_label = if plan.next_step_status == "active" { "IN PROGRESS" } else { "NEXT STEP" };

                    detail = detail.push(
                        column![
                            row![
                                text(step_label).size(9).color(step_status_color),
                                text(format!(" · {}", plan.next_step_phase))
                                    .size(9)
                                    .color(Color::from_rgb8(0x6e, 0x76, 0x81)),
                            ]
                            .spacing(0)
                            .align_y(Alignment::Center),
                            text(plan.next_step_task.clone())
                                .size(13)
                                .color(Color::from_rgb8(0xe6, 0xed, 0xf3))
                                .width(Length::Fill),
                            text(plan.next_step_agent.clone())
                                .size(10)
                                .color(theme::TEXT_ACCENT),
                        ]
                        .spacing(4),
                    );
                } else if plan.steps_total > 0 {
                    detail = detail.push(
                        text("All steps complete").size(11).color(theme::CLR_RUNNING),
                    );
                } else {
                    detail = detail.push(
                        text("No steps defined")
                            .size(11)
                            .color(Color::from_rgb8(0x6e, 0x76, 0x81)),
                    );
                }

                let ws_id = plan.workspace_id.clone();
                let p_id  = plan.plan_id.clone();
                let ws2   = ws_id.clone();
                let p2    = p_id.clone();

                // "Open in Dashboard" button
                let open_btn = container(
                    button(text("Open in Dashboard").size(13).color(theme::TEXT_PRIMARY))
                        .on_press(on_open_in_dashboard(ws_id, p_id))
                        .width(Length::Fill)
                        .style(|_, _| iced::widget::button::Style {
                            background: Some(Background::Color(Color::from_rgb8(0x0d, 0x25, 0x47))),
                            border: Border { color: theme::CLR_BLUE, width: 1.0, radius: 6.0.into() },
                            text_color: theme::TEXT_PRIMARY,
                            ..Default::default()
                        }),
                )
                .width(Length::Fill);
                detail = detail.push(open_btn);

                // Secondary action buttons: Copy Details | Launch Agent
                let provider_label = if state.plans_provider == 1 { "Launch Claude CLI" } else { "Launch Agent" };
                let launch_color = if state.plans_provider == 1 {
                    Color::from_rgb8(0xd9, 0x77, 0x06)
                } else {
                    Color::from_rgb8(0xa3, 0x71, 0xf7)
                };

                let secondary_row = row![
                    button(text("Copy Details").size(12).color(theme::CLR_RUNNING))
                        .width(Length::Fill)
                        .padding(Padding::from([4, 0]))
                        .style(|_, _| iced::widget::button::Style {
                            background: Some(Background::Color(Color::from_rgb8(0x09, 0x17, 0x10))),
                            border: Border { color: theme::CLR_RUNNING, width: 1.0, radius: 6.0.into() },
                            text_color: theme::CLR_RUNNING,
                            ..Default::default()
                        }),
                    button(text(provider_label).size(12).color(launch_color))
                        .on_press(on_launch_agent(ws2, p2))
                        .width(Length::Fill)
                        .padding(Padding::from([4, 0]))
                        .style(move |_, _| iced::widget::button::Style {
                            background: Some(Background::Color(Color::from_rgb8(0x0f, 0x08, 0x20))),
                            border: Border { color: Color::from_rgb8(0x89, 0x57, 0xe5), width: 1.0, radius: 6.0.into() },
                            text_color: launch_color,
                            ..Default::default()
                        }),
                ]
                .spacing(6);
                detail = detail.push(secondary_row);

                let expanded_area = container(detail.padding(Padding::from([10, 12])))
                    .width(Length::Fill)
                    .style(|_| iced::widget::container::Style {
                        background: Some(Background::Color(Color::from_rgb8(0x1c, 0x21, 0x28))),
                        border: Border {
                            color: theme::CLR_BLUE,
                            width: 1.0,
                            ..Default::default()
                        },
                        ..Default::default()
                    });
                card_col = card_col.push(expanded_area);
            }

            plans_col = plans_col.push(card_col);
        }
    }

    let list = scrollable(plans_col.padding(Padding::from([0, 8])))
        .height(Length::Fill)
        .width(Length::Fill);

    column![toolbar, tabs, list]
        .spacing(4)
        .width(Length::Fill)
        .height(Length::Fill)
        .into()
}
