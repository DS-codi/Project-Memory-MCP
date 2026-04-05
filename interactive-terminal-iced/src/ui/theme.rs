//! Theme color constants and widget style helpers for interactive-terminal-iced.
//! Colors mirror supervisor-iced/src/ui/mod.rs where shared, with terminal-specific additions.

use iced::Color;

// ── Background layers ──────────────────────────────────────────────────────────
pub const BG_WINDOW: Color      = Color { r: 0.035, g: 0.051, b: 0.075, a: 1.0 }; // #090d14 — deepest window bg
pub const BG_PANEL: Color       = Color { r: 0.051, g: 0.067, b: 0.090, a: 1.0 }; // #0d1117 — main panel bg
pub const BG_CARD: Color        = Color { r: 0.075, g: 0.094, b: 0.122, a: 1.0 }; // #131822 — card / row bg
pub const BG_INPUT: Color       = Color { r: 0.094, g: 0.114, b: 0.145, a: 1.0 }; // #181d25 — input field bg
pub const BG_HOVER: Color       = Color { r: 0.106, g: 0.129, b: 0.165, a: 1.0 }; // #1b212a — hover state

// ── Borders ────────────────────────────────────────────────────────────────────
pub const BORDER_SUBTLE: Color  = Color { r: 0.122, g: 0.149, b: 0.188, a: 1.0 }; // #1f2637 — separator lines
pub const BORDER_ACTIVE: Color  = Color { r: 0.235, g: 0.329, b: 0.533, a: 1.0 }; // #3c548a — active/focused border

// ── Text ───────────────────────────────────────────────────────────────────────
pub const TEXT_PRIMARY: Color   = Color { r: 0.898, g: 0.906, b: 0.918, a: 1.0 }; // #e5e7eb
pub const TEXT_SECONDARY: Color = Color { r: 0.420, g: 0.447, b: 0.502, a: 1.0 }; // #6b7280
pub const TEXT_MUTED: Color     = Color { r: 0.278, g: 0.310, b: 0.361, a: 1.0 }; // #474f5c
pub const TEXT_ACCENT: Color    = Color { r: 0.259, g: 0.502, b: 0.957, a: 1.0 }; // #4280f4

// ── Connection status ──────────────────────────────────────────────────────────
pub const CLR_CONNECTED: Color  = Color { r: 0.133, g: 0.773, b: 0.369, a: 1.0 }; // #22c55e — green dot
pub const CLR_LISTENING: Color  = Color { r: 0.976, g: 0.451, b: 0.086, a: 1.0 }; // #f97316 — orange dot
pub const CLR_ERROR: Color      = Color { r: 0.937, g: 0.267, b: 0.267, a: 1.0 }; // #ef4444 — red dot

// ── Risk tiers ─────────────────────────────────────────────────────────────────
pub const RISK_LOW: Color       = Color { r: 0.133, g: 0.773, b: 0.369, a: 1.0 }; // green
pub const RISK_MEDIUM: Color    = Color { r: 1.000, g: 0.773, b: 0.000, a: 1.0 }; // yellow
pub const RISK_HIGH: Color      = Color { r: 0.937, g: 0.267, b: 0.267, a: 1.0 }; // red

// ── Approve / decline ──────────────────────────────────────────────────────────
pub const CLR_APPROVE: Color    = Color { r: 0.133, g: 0.773, b: 0.369, a: 1.0 }; // green button
pub const CLR_DECLINE: Color    = Color { r: 0.937, g: 0.267, b: 0.267, a: 1.0 }; // red button

// ── Session tabs ───────────────────────────────────────────────────────────────
pub const TAB_ACTIVE_BG: Color      = Color { r: 0.102, g: 0.133, b: 0.204, a: 1.0 }; // #1a2234 — active tab
pub const TAB_INACTIVE_BG: Color    = BG_PANEL;
pub const TAB_ACTIVE_ACCENT: Color  = Color { r: 0.231, g: 0.510, b: 0.847, a: 1.0 }; // #3b82d8 — blue accent bar
pub const TAB_GEMINI_BG: Color      = Color { r: 0.102, g: 0.063, b: 0.188, a: 1.0 }; // #1a1030 — purple tint
pub const TAB_GEMINI_BORDER: Color  = Color { r: 0.486, g: 0.227, b: 0.929, a: 1.0 }; // #7c3aed
pub const TAB_GEMINI_ACCENT: Color  = Color { r: 0.659, g: 0.333, b: 0.988, a: 1.0 }; // #a855f7
pub const TAB_GEMINI_TEXT: Color    = Color { r: 0.753, g: 0.518, b: 0.988, a: 1.0 }; // #c084fc

// ── Terminal output ────────────────────────────────────────────────────────────
pub const TERM_STDOUT: Color    = Color { r: 0.600, g: 0.933, b: 0.600, a: 1.0 }; // light green
pub const TERM_STDERR: Color    = Color { r: 0.980, g: 0.502, b: 0.447, a: 1.0 }; // light red/coral
pub const TERM_BG: Color        = Color { r: 0.035, g: 0.051, b: 0.075, a: 1.0 }; // same as BG_WINDOW

// ── Status / general ───────────────────────────────────────────────────────────
pub const CLR_RUNNING: Color    = Color { r: 0.133, g: 0.773, b: 0.369, a: 1.0 }; // green
pub const CLR_STOPPED: Color    = Color { r: 0.937, g: 0.267, b: 0.267, a: 1.0 }; // red
pub const CLR_YELLOW: Color     = Color { r: 1.000, g: 0.922, b: 0.231, a: 1.0 }; // amber warning
pub const CLR_BLUE: Color       = Color { r: 0.220, g: 0.545, b: 0.980, a: 1.0 }; // blue accent
pub const CLR_PURPLE: Color     = Color { r: 0.486, g: 0.227, b: 0.929, a: 1.0 }; // Gemini purple
pub const CLR_ORANGE: Color     = CLR_LISTENING;

// ── PTY mode badge ─────────────────────────────────────────────────────────────
pub const PTY_HOST_BG: Color    = Color { r: 0.114, g: 0.235, b: 0.467, a: 1.0 }; // blue tint
pub const PTY_INPROCESS_BG: Color = BG_CARD;
