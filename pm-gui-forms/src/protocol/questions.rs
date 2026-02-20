//! Question types for forms.
//!
//! Each variant is a serde-tagged enum discriminated on `"type"`.

use serde::{Deserialize, Serialize};

use super::config::TimeoutAction;

/// A single option within a [`RadioSelectQuestion`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RadioOption {
    /// Unique identifier for this option.
    pub id: String,
    /// Short label displayed to the user.
    pub label: String,
    /// Longer description of the option.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Arguments in favour.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub pros: Vec<String>,
    /// Arguments against.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cons: Vec<String>,
    /// Whether the agent recommends this option.
    #[serde(default)]
    pub recommended: bool,
}

/// Pick one option from a list, optionally with free-text override.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RadioSelectQuestion {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default = "default_true")]
    pub required: bool,
    pub options: Vec<RadioOption>,
    #[serde(default = "default_true")]
    pub allow_free_text: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub free_text_placeholder: Option<String>,
}

/// Free-form text input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct FreeTextQuestion {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub required: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_value: Option<String>,
    #[serde(default = "default_max_length")]
    pub max_length: u32,
}

/// Binary approve / reject decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ConfirmRejectQuestion {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default = "default_true")]
    pub required: bool,
    #[serde(default = "default_approve_label")]
    pub approve_label: String,
    #[serde(default = "default_reject_label")]
    pub reject_label: String,
    #[serde(default = "default_true")]
    pub allow_notes: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes_placeholder: Option<String>,
}

/// Visual countdown timer bound to the form-level timeout.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct CountdownTimerQuestion {
    pub id: String,
    /// Label text; may include `{remaining}` placeholder for seconds.
    pub label: String,
    /// Duration in seconds (typically mirrors [`TimeoutConfig::duration_seconds`]).
    pub duration_seconds: u32,
    /// What happens when the timer expires.
    pub on_timeout: TimeoutAction,
    /// Whether user interaction pauses the countdown.
    #[serde(default = "default_true")]
    pub pause_on_interaction: bool,
}

/// Serde-tagged question enum.
///
/// Discriminated on the `"type"` field:
/// ```json
/// { "type": "radio_select", "id": "q1", ... }
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Question {
    RadioSelect(RadioSelectQuestion),
    FreeText(FreeTextQuestion),
    ConfirmReject(ConfirmRejectQuestion),
    CountdownTimer(CountdownTimerQuestion),
}

// ── Default helpers ──────────────────────────────────────────────

fn default_true() -> bool {
    true
}

fn default_max_length() -> u32 {
    2000
}

fn default_approve_label() -> String {
    "Approve".to_string()
}

fn default_reject_label() -> String {
    "Reject".to_string()
}
