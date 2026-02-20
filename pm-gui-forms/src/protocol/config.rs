//! Window and timeout configuration types.

use serde::{Deserialize, Serialize};

/// Action taken when the form timeout expires.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimeoutAction {
    /// Auto-fill answers (radio: pick recommended; free-text: use default; confirm: approve).
    AutoFill,
    /// Treat as approved.
    Approve,
    /// Treat as rejected.
    Reject,
    /// Defer — no automatic action, plan pauses.
    Defer,
}

/// Fallback mode when the GUI binary is unavailable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FallbackMode {
    /// Fall back to chat-based interaction.
    Chat,
    /// No fallback — fail the request.
    None,
}

/// Timeout configuration for a form.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TimeoutConfig {
    /// Total allowed seconds before timeout fires.
    pub duration_seconds: u32,
    /// What happens when the timer expires.
    pub on_timeout: TimeoutAction,
    /// Fallback behaviour when the GUI process cannot be launched.
    pub fallback_mode: FallbackMode,
}

/// Window configuration controlling size and flags of the GUI window.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct WindowConfig {
    /// Whether the window stays on top of all other windows.
    #[serde(default)]
    pub always_on_top: bool,
    /// Window width in logical pixels.
    #[serde(default = "default_width")]
    pub width: u32,
    /// Window height in logical pixels.
    #[serde(default = "default_height")]
    pub height: u32,
    /// Title for the window title-bar.
    pub title: String,
}

fn default_width() -> u32 {
    900
}

fn default_height() -> u32 {
    700
}
