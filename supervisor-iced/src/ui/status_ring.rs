/// StatusRing — circular gauge reflecting a service status.
/// Full ring = Running, half ring = Error/Starting/Stopping, empty track = other.
/// Ported from supervisor/qml/StatusRing.qml.

use iced::{
    widget::canvas::{self, Frame, Path, Stroke},
    Color, Element, Length, Point,
};
use std::f32::consts::PI;

use crate::app_state::ServiceStatus;

#[derive(Debug, Clone)]
pub struct StatusRing {
    pub status:       ServiceStatus,
    pub accent_color: Color,
}

impl StatusRing {
    const TRACK_COLOR: Color = Color {
        r: 0.188, g: 0.212, b: 0.239, a: 1.0,
    };
    const SIZE: f32 = 38.0;
    const RADIUS: f32 = 14.0;
    const LINE_WIDTH: f32 = 3.0;
}

impl<Message> canvas::Program<Message> for StatusRing {
    type State = ();

    fn draw(
        &self,
        _state: &(),
        renderer: &iced::Renderer,
        _theme: &iced::Theme,
        bounds: iced::Rectangle,
        _cursor: iced::mouse::Cursor,
    ) -> Vec<canvas::Geometry> {
        let mut frame = Frame::new(renderer, bounds.size());
        let center = Point::new(Self::SIZE / 2.0, Self::SIZE / 2.0);

        // Background track
        let track = Path::circle(center, Self::RADIUS);
        frame.stroke(
            &track,
            Stroke::default()
                .with_color(Self::TRACK_COLOR)
                .with_width(Self::LINE_WIDTH),
        );

        // Filled arc
        match &self.status {
            ServiceStatus::Running => {
                // Full ring: -π/2 → 3π/2
                let arc = Path::new(|b| {
                    b.arc(canvas::path::Arc {
                        center,
                        radius: Self::RADIUS,
                        start_angle: iced::Radians(-PI / 2.0),
                        end_angle: iced::Radians(3.0 * PI / 2.0),
                    });
                });
                frame.stroke(
                    &arc,
                    Stroke::default()
                        .with_color(self.accent_color)
                        .with_width(Self::LINE_WIDTH),
                );
            }
            ServiceStatus::Error | ServiceStatus::Starting | ServiceStatus::Stopping => {
                // Half ring: -π/2 → π/2
                let arc = Path::new(|b| {
                    b.arc(canvas::path::Arc {
                        center,
                        radius: Self::RADIUS,
                        start_angle: iced::Radians(-PI / 2.0),
                        end_angle: iced::Radians(PI / 2.0),
                    });
                });
                frame.stroke(
                    &arc,
                    Stroke::default()
                        .with_color(self.accent_color)
                        .with_width(Self::LINE_WIDTH),
                );
            }
            // Stopped / Unknown → empty track only
            _ => {}
        }

        vec![frame.into_geometry()]
    }
}

pub fn view<'a, Message: 'a>(
    status: &ServiceStatus,
    accent_color: Color,
) -> Element<'a, Message>
where
    Message: Clone,
{
    canvas::Canvas::new(StatusRing {
        status:       status.clone(),
        accent_color,
    })
    .width(Length::Fixed(StatusRing::SIZE))
    .height(Length::Fixed(StatusRing::SIZE))
    .into()
}
