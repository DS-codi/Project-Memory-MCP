/// ServiceIcon — per-service canvas icons ported from main.qml's iconDelegate Canvas blocks.
/// Each icon is drawn at 32×32 in a 512×512 coordinate space (scale 32/512) or 24×24 (scale 32/24).

use iced::{
    widget::canvas::{self, Fill, Frame, LineCap, LineJoin, Path, Stroke},
    Color, Element, Length, Point, Size,
};
use std::f32::consts::PI;

#[derive(Debug, Clone, PartialEq)]
pub enum ServiceIconKind {
    McpServer,
    CliMcpServer,
    Terminal,
    Dashboard,
    FallbackApi,
}

#[derive(Debug, Clone)]
pub struct ServiceIconCanvas {
    pub kind:  ServiceIconKind,
    pub color: Color,
}

impl<Message> canvas::Program<Message> for ServiceIconCanvas {
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
        match self.kind {
            ServiceIconKind::McpServer    => draw_mcp(&mut frame, self.color),
            ServiceIconKind::CliMcpServer => draw_cli_mcp(&mut frame, self.color),
            ServiceIconKind::Terminal     => draw_terminal(&mut frame, self.color),
            ServiceIconKind::Dashboard    => draw_dashboard(&mut frame, self.color),
            ServiceIconKind::FallbackApi  => draw_fallback(&mut frame, self.color),
        }
        vec![frame.into_geometry()]
    }
}

/// 32×32 canvas widget displaying the service icon.
pub fn view<'a, Message: 'a>(kind: ServiceIconKind, color: Color) -> Element<'a, Message>
where
    Message: Clone,
{
    canvas::Canvas::new(ServiceIconCanvas { kind, color })
        .width(Length::Fixed(32.0))
        .height(Length::Fixed(32.0))
        .into()
}

// ── MCP Server ────────────────────────────────────────────────────────────────
// Scale: 32/512 = 0.0625.  Full ring + lightning bolt.
fn draw_mcp(frame: &mut Frame, color: Color) {
    let s = 32.0_f32 / 512.0;

    // Ring
    let ring = Path::circle(Point::new(256.0 * s, 256.0 * s), 144.0 * s);
    frame.stroke(&ring, Stroke::default().with_color(color).with_width(28.0 * s));

    // Lightning bolt polygon
    let bolt = Path::new(|b| {
        b.move_to(Point::new(320.0 * s, 40.0 * s));
        b.line_to(Point::new(120.0 * s, 280.0 * s));
        b.line_to(Point::new(260.0 * s, 280.0 * s));
        b.line_to(Point::new(160.0 * s, 480.0 * s));
        b.line_to(Point::new(440.0 * s, 200.0 * s));
        b.line_to(Point::new(280.0 * s, 200.0 * s));
        b.close();
    });
    frame.fill(&bolt, color);
}

// ── CLI MCP Server ────────────────────────────────────────────────────────────
// Scale: 32/512.  Chevron >, underscore cursor, small bolt.
fn draw_cli_mcp(frame: &mut Frame, color: Color) {
    let s = 32.0_f32 / 512.0;
    let w = 36.0 * s;

    // Chevron >
    let chevron = Path::new(|b| {
        b.move_to(Point::new(80.0 * s, 140.0 * s));
        b.line_to(Point::new(220.0 * s, 256.0 * s));
        b.line_to(Point::new(80.0 * s, 372.0 * s));
    });
    frame.stroke(
        &chevron,
        Stroke::default()
            .with_color(color)
            .with_width(w)
            .with_line_cap(LineCap::Round)
            .with_line_join(LineJoin::Round),
    );

    // Underscore _
    let underscore = Path::new(|b| {
        b.move_to(Point::new(240.0 * s, 372.0 * s));
        b.line_to(Point::new(420.0 * s, 372.0 * s));
    });
    frame.stroke(
        &underscore,
        Stroke::default()
            .with_color(color)
            .with_width(w)
            .with_line_cap(LineCap::Round),
    );

    // Small bolt (alpha 0.85)
    let dim = Color { a: color.a * 0.85, ..color };
    let bolt = Path::new(|b| {
        b.move_to(Point::new(370.0 * s, 60.0 * s));
        b.line_to(Point::new(300.0 * s, 185.0 * s));
        b.line_to(Point::new(345.0 * s, 185.0 * s));
        b.line_to(Point::new(285.0 * s, 320.0 * s));
        b.line_to(Point::new(440.0 * s, 175.0 * s));
        b.line_to(Point::new(385.0 * s, 175.0 * s));
        b.close();
    });
    frame.fill(&bolt, dim);
}

// ── Interactive Terminal ──────────────────────────────────────────────────────
// Scale: 32/512.  Frame rect, header tint, chevron prompt, text bars.
fn draw_terminal(frame: &mut Frame, color: Color) {
    let s = 32.0_f32 / 512.0;

    // Outer frame rect
    let outer = Path::rectangle(
        Point::new(56.0 * s, 112.0 * s),
        Size::new(400.0 * s, 288.0 * s),
    );
    frame.stroke(&outer, Stroke::default().with_color(color).with_width(28.0 * s));

    // Title-bar fill (alpha 0.4)
    let hdr = Color { a: color.a * 0.4, ..color };
    frame.fill_rectangle(
        Point::new(56.0 * s, 112.0 * s),
        Size::new(400.0 * s, 68.0 * s),
        hdr,
    );

    // Prompt chevron >
    let prompt = Path::new(|b| {
        b.move_to(Point::new(100.0 * s, 224.0 * s));
        b.line_to(Point::new(148.0 * s, 272.0 * s));
        b.line_to(Point::new(100.0 * s, 320.0 * s));
    });
    frame.stroke(
        &prompt,
        Stroke::default()
            .with_color(color)
            .with_width(26.0 * s)
            .with_line_join(LineJoin::Miter),
    );

    // Text-line bars
    frame.fill_rectangle(
        Point::new(180.0 * s, 296.0 * s),
        Size::new(80.0 * s, 22.0 * s),
        color,
    );
    frame.fill_rectangle(
        Point::new(100.0 * s, 350.0 * s),
        Size::new(160.0 * s, 22.0 * s),
        color,
    );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
// Scale: 32/24.  Four filled rectangles forming a 2×2 dashboard grid.
fn draw_dashboard(frame: &mut Frame, color: Color) {
    let s = 32.0_f32 / 24.0;

    frame.fill_rectangle(Point::new(3.0 * s, 3.0 * s),  Size::new(7.0 * s, 9.0 * s), color);
    frame.fill_rectangle(Point::new(14.0 * s, 3.0 * s), Size::new(7.0 * s, 5.0 * s), color);
    frame.fill_rectangle(Point::new(14.0 * s, 12.0 * s), Size::new(7.0 * s, 9.0 * s), color);
    frame.fill_rectangle(Point::new(3.0 * s, 16.0 * s), Size::new(7.0 * s, 5.0 * s), color);
}

// ── Fallback API ──────────────────────────────────────────────────────────────
// Scale: 32/512.  Clipboard rect, top tab, check mark.
fn draw_fallback(frame: &mut Frame, color: Color) {
    let s = 32.0_f32 / 512.0;

    // Clipboard body
    let body = Path::rectangle(
        Point::new(108.0 * s, 88.0 * s),
        Size::new(296.0 * s, 344.0 * s),
    );
    frame.stroke(&body, Stroke::default().with_color(color).with_width(30.0 * s));

    // Clipboard top tab
    frame.fill_rectangle(
        Point::new(180.0 * s, 56.0 * s),
        Size::new(152.0 * s, 60.0 * s),
        color,
    );

    // Check mark ✓
    let check = Path::new(|b| {
        b.move_to(Point::new(140.0 * s, 300.0 * s));
        b.line_to(Point::new(240.0 * s, 400.0 * s));
        b.line_to(Point::new(460.0 * s, 170.0 * s));
    });
    frame.stroke(
        &check,
        Stroke::default()
            .with_color(color)
            .with_width(40.0 * s)
            .with_line_cap(LineCap::Square)
            .with_line_join(LineJoin::Miter),
    );
}
