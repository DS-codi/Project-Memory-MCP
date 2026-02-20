//! Answer types returned by the user.

use serde::{Deserialize, Serialize};

/// The concrete value of an answer, discriminated by question type.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AnswerValue {
    /// Answer to a `radio_select` question.
    RadioSelectAnswer {
        /// The `id` of the selected [`RadioOption`](super::RadioOption).
        selected: String,
        /// Optional free-text override or annotation.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        free_text: Option<String>,
    },
    /// Answer to a `free_text` question.
    FreeTextAnswer {
        value: String,
    },
    /// Answer to a `confirm_reject` question.
    ConfirmRejectAnswer {
        /// `"approve"` or `"reject"`.
        action: ConfirmRejectAction,
        /// Optional notes explaining the decision.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        notes: Option<String>,
    },
    /// Answer to a `countdown_timer` question.
    CountdownTimerAnswer {
        /// Whether the user completed in time or the timer expired.
        result: TimerResult,
        /// How many seconds elapsed before completion or timeout.
        elapsed_seconds: u32,
    },
}

/// Possible actions for a confirm/reject answer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfirmRejectAction {
    Approve,
    Reject,
}

/// Result of a countdown timer question.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimerResult {
    Completed,
    TimedOut,
}

/// A single answer bundled with metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Answer {
    /// References [`Question`](super::Question) by its `id`.
    pub question_id: String,
    /// The typed answer value.
    pub value: AnswerValue,
    /// Whether this answer was auto-filled due to timeout.
    #[serde(default)]
    pub auto_filled: bool,
    /// Whether the user flagged this answer for refinement.
    #[serde(default)]
    pub marked_for_refinement: bool,
}
