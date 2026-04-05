// animations.rs — AnimStyle enum, BannerRenderer (static, no tachyonfx).
// Drop-in replacement for pm-cli/src/animations.rs with the same public API.

use ratatui::{
    layout::Rect,
    style::{Color, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};
use std::time::Duration;

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
            AnimStyle::Wave    => AnimStyle::Pulse,
            AnimStyle::Pulse   => AnimStyle::Scan,
            AnimStyle::Scan    => AnimStyle::Sparkle,
            AnimStyle::Sparkle => AnimStyle::Wave,
        }
    }
    pub fn prev(self) -> Self {
        match self {
            AnimStyle::Wave    => AnimStyle::Sparkle,
            AnimStyle::Pulse   => AnimStyle::Wave,
            AnimStyle::Scan    => AnimStyle::Pulse,
            AnimStyle::Sparkle => AnimStyle::Scan,
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            AnimStyle::Wave    => "Wave",
            AnimStyle::Pulse   => "Pulse",
            AnimStyle::Scan    => "Scan",
            AnimStyle::Sparkle => "Sparkle",
        }
    }
}

// ─── BannerRenderer ──────────────────────────────────────────────────────────

/// Static banner renderer — same API as the tachyonfx version but renders
/// with a fixed colour per frame. `elapsed` is accepted for API compatibility.
pub struct BannerRenderer {
    style: AnimStyle,
}

impl BannerRenderer {
    pub fn new(style: AnimStyle) -> Self {
        Self { style }
    }

    pub fn set_style(&mut self, style: AnimStyle) {
        self.style = style;
    }

    pub fn render(&mut self, f: &mut Frame, elapsed: Duration) {
        self.render_with_base(f, elapsed, Color::White);
    }

    pub fn render_with_palette(&mut self, f: &mut Frame, elapsed: Duration, palette: &[Color; 6]) {
        self.render_with_base(f, elapsed, palette[0]);
    }

    fn render_with_base(&mut self, f: &mut Frame, _elapsed: Duration, base: Color) {
        let area = f.area();
        let banner_h = BANNER.len() as u16;
        let banner_area = Rect::new(0, 0, area.width, area.height.min(banner_h));

        let lines: Vec<Line> = BANNER
            .iter()
            .map(|&s| Line::from(Span::styled(s, Style::default().fg(base))))
            .collect();
        f.render_widget(Paragraph::new(lines), banner_area);
    }
}
