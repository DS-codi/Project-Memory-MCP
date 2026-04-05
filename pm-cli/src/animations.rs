// animations.rs — AnimStyle enum, BannerRenderer (tachyonfx-powered), banner/palette consts.

use ratatui::{
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};
use std::time::Duration;
use tachyonfx::fx::RepeatMode;
use tachyonfx::{fx, Effect, Interpolation};

// ─── Banner / Palette constants ───────────────────────────────────────────────

pub const BANNER: &[&str] = &[
    r"  ██████╗ ███╗   ███╗     ██████╗██╗     ██╗",
    r"  ██╔══██╗████╗ ████║    ██╔════╝██║     ██║",
    r"  ██████╔╝██╔████╔██║    ██║     ██║     ██║",
    r"  ██╔═══╝ ██║╚██╔╝██║    ██║     ██║     ██║",
    r"  ██║     ██║ ╚═╝ ██║    ╚██████╗███████╗██║",
    r"  ╚═╝     ╚═╝     ╚═╝     ╚═════╝╚══════╝╚═╝",
    r"  ─── Project Memory MCP  ·  command line launcher",
];

pub const PALETTE_DEFAULT: [Color; 6] = [
    Color::White,
    Color::Cyan,
    Color::Blue,
    Color::DarkGray,
    Color::Green,
    Color::LightGreen,
];
pub const PALETTE_SUCCESS: [Color; 6] = [
    Color::Green,
    Color::LightGreen,
    Color::Cyan,
    Color::Green,
    Color::LightGreen,
    Color::White,
];
pub const PALETTE_WARN: [Color; 6] = [
    Color::Yellow,
    Color::LightYellow,
    Color::White,
    Color::Yellow,
    Color::LightYellow,
    Color::DarkGray,
];
pub const PALETTE_ERROR: [Color; 6] = [
    Color::Red,
    Color::LightRed,
    Color::Yellow,
    Color::Red,
    Color::LightRed,
    Color::DarkGray,
];

// ─── Animation Style ─────────────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq)]
pub enum AnimStyle {
    Wave,
    Pulse,
    Scan,
    Sparkle,
}

impl AnimStyle {
    pub fn next(self) -> Self {
        match self {
            AnimStyle::Wave => AnimStyle::Pulse,
            AnimStyle::Pulse => AnimStyle::Scan,
            AnimStyle::Scan => AnimStyle::Sparkle,
            AnimStyle::Sparkle => AnimStyle::Wave,
        }
    }
    pub fn prev(self) -> Self {
        match self {
            AnimStyle::Wave => AnimStyle::Sparkle,
            AnimStyle::Pulse => AnimStyle::Wave,
            AnimStyle::Scan => AnimStyle::Pulse,
            AnimStyle::Sparkle => AnimStyle::Scan,
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            AnimStyle::Wave => "Wave",
            AnimStyle::Pulse => "Pulse",
            AnimStyle::Scan => "Scan",
            AnimStyle::Sparkle => "Sparkle",
        }
    }
}

// ─── Effect factory ───────────────────────────────────────────────────────────

fn make_effect(style: AnimStyle) -> Effect {
    match style {
        AnimStyle::Wave => fx::repeat(
            fx::hsl_shift(Some([0.0, 360.0, 0.0]), None, (3000, Interpolation::Linear)),
            RepeatMode::Forever,
        ),
        AnimStyle::Pulse => fx::repeat(
            fx::ping_pong(fx::fade_to(
                Color::Cyan,
                Color::Blue,
                (1000, Interpolation::SineInOut),
            )),
            RepeatMode::Forever,
        ),
        AnimStyle::Scan => fx::repeat(
            fx::ping_pong(fx::fade_to(
                Color::White,
                Color::DarkGray,
                (1500, Interpolation::Linear),
            )),
            RepeatMode::Forever,
        ),
        AnimStyle::Sparkle => fx::repeat(
            fx::fade_to(Color::White, Color::DarkGray, (500, Interpolation::CubicIn)),
            RepeatMode::Forever,
        ),
    }
}

// ─── BannerRenderer ──────────────────────────────────────────────────────────

/// Owns a tachyonfx `Effect` and applies it to the ASCII banner each frame.
///
/// Create one per screen. Call `set_style` when the user cycles the animation.
/// Call `render` or `render_with_palette` inside every `terminal.draw` closure,
/// passing the elapsed time since the previous frame.
pub struct BannerRenderer {
    effect: Effect,
}

impl BannerRenderer {
    pub fn new(style: AnimStyle) -> Self {
        Self {
            effect: make_effect(style),
        }
    }

    /// Replace the active effect when the user cycles the animation style.
    pub fn set_style(&mut self, style: AnimStyle) {
        self.effect = make_effect(style);
    }

    /// Render the banner with the default white base and apply the tachyonfx effect.
    pub fn render(&mut self, f: &mut Frame, elapsed: Duration) {
        self.render_with_base(f, elapsed, Color::White);
    }

    /// Render the banner using `palette[0]` as the base colour before applying the effect.
    /// Use this for state-coloured screens (success/warn/error).
    pub fn render_with_palette(&mut self, f: &mut Frame, elapsed: Duration, palette: &[Color; 6]) {
        self.render_with_base(f, elapsed, palette[0]);
    }

    fn render_with_base(&mut self, f: &mut Frame, elapsed: Duration, base: Color) {
        let area = f.area();
        let banner_h = BANNER.len() as u16;
        let banner_area = Rect::new(0, 0, area.width, area.height.min(banner_h));

        let lines: Vec<Line> = BANNER
            .iter()
            .map(|&s| Line::from(Span::styled(s, Style::default().fg(base))))
            .collect();
        f.render_widget(Paragraph::new(lines), banner_area);

        // Post-process the rendered cells with the tachyonfx effect.
        let _ = self.effect.process(elapsed.into(), f.buffer_mut(), banner_area);
    }
}
