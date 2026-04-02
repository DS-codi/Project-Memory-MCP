/// McpProxyPanel — MCP proxy stats with sparkline.
/// Ported from supervisor/qml/McpProxyPanel.qml.

use iced::{
    widget::{canvas::{self, Frame, Path, Stroke}, column, container, row, text},
    Background, Border, Color, Element, Length, Point,
};

use crate::app_state::AppState;
use super::theme;

// ── Sparkline canvas ──────────────────────────────────────────────────────────
struct Sparkline {
    history: Vec<i32>,
}

impl<Message> canvas::Program<Message> for Sparkline {
    type State = ();

    fn draw(
        &self,
        _state: &(),
        renderer: &iced::Renderer,
        _theme: &iced::Theme,
        bounds: iced::Rectangle,
        _cursor: iced::mouse::Cursor,
    ) -> Vec<canvas::Geometry> {
        let w = bounds.width;
        let h = bounds.height;
        let mut frame = Frame::new(renderer, bounds.size());
        let stroke_color = Color::from_rgb8(0x58, 0xa6, 0xff);   // #58a6ff

        if self.history.len() < 2 {
            let path = Path::new(|b| {
                b.move_to(Point::new(0.0, h / 2.0));
                b.line_to(Point::new(w, h / 2.0));
            });
            frame.stroke(
                &path,
                Stroke::default()
                    .with_color(Color { a: 0.25, ..stroke_color })
                    .with_width(1.5),
            );
        } else {
            let max_val = self.history.iter().copied().max().unwrap_or(1).max(1) as f32;
            let n = self.history.len() as f32;

            // Filled area (alpha 0.15)
            let fill_path = Path::new(|b| {
                for (i, &val) in self.history.iter().enumerate() {
                    let px = i as f32 * w / (n - 1.0);
                    let py = (1.0 - val as f32 / max_val) * (h - 4.0) + 2.0;
                    if i == 0 { b.move_to(Point::new(px, py)); }
                    else       { b.line_to(Point::new(px, py)); }
                }
                // Close back along bottom
                b.line_to(Point::new(w, h));
                b.line_to(Point::new(0.0, h));
                b.close();
            });
            frame.fill(&fill_path, Color { a: 0.15, ..stroke_color });

            // Line
            let line = Path::new(|b| {
                for (i, &val) in self.history.iter().enumerate() {
                    let px = i as f32 * w / (n - 1.0);
                    let py = (1.0 - val as f32 / max_val) * (h - 4.0) + 2.0;
                    if i == 0 { b.move_to(Point::new(px, py)); }
                    else       { b.line_to(Point::new(px, py)); }
                }
            });
            frame.stroke(
                &line,
                Stroke::default().with_color(stroke_color).with_width(1.5),
            );
        }

        vec![frame.into_geometry()]
    }
}

pub fn view<'a, Message: Clone + 'a>(state: &'a AppState) -> Element<'a, Message> {
    // Counter helper — matches QML: number at size 22, label at size 9
    let counter = |val: i32, label: &'a str, value_color: Color| -> Element<'a, Message> {
        column![
            text(val.to_string()).size(22).color(value_color),
            text(label).size(9).color(theme::TEXT_SECONDARY),
        ]
        .spacing(2)
        .into()
    };

    let sparkline_canvas = canvas::Canvas::new(Sparkline {
        history: state.mcp_connection_history.clone(),
    })
    .width(Length::Fill)
    .height(Length::Fixed(32.0));

    // Sparkline inside a bg-terminal coloured container
    let sparkline_box = container(sparkline_canvas)
        .width(Length::Fill)
        .height(Length::Fixed(32.0))
        .style(|_| iced::widget::container::Style {
            background: Some(Background::Color(Color::from_rgb8(0x0d, 0x11, 0x17))),
            ..Default::default()
        });

    let mut stats_row = row![
        // Total connections: TEXT_ACCENT (blue), matches QML #58a6ff
        counter(state.total_mcp_connections, "total conns",   theme::TEXT_ACCENT),
        // Active instances: TEXT_PRIMARY
        counter(state.active_mcp_instances,  "active inst.",  theme::TEXT_PRIMARY),
        sparkline_box,
    ]
    .spacing(16)
    .align_y(iced::Alignment::Center)
    .width(Length::Fill);

    if !state.mcp_instance_distribution.is_empty() {
        stats_row = stats_row.push(
            text(state.mcp_instance_distribution.clone())
                .size(9)
                .color(theme::TEXT_SECONDARY)
                .width(Length::Fill),
        );
    }

    container(
        column![
            text("MCP PROXY").size(10).color(theme::TEXT_SECONDARY),
            stats_row,
        ]
        .spacing(6)
        .width(Length::Fill),
    )
    .padding(10)
    .width(Length::Fill)
    .height(Length::Fixed(100.0))
    .style(|_| iced::widget::container::Style {
        background: Some(Background::Color(theme::BG_PANEL)),
        border: Border {
            color: theme::BORDER_SUBTLE,
            width: 1.0,
            radius: 10.0.into(),
        },
        ..Default::default()
    })
    .into()
}
