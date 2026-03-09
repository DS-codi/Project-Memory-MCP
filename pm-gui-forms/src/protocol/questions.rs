//! Question types for forms.
//!
//! Each variant is a serde-tagged enum discriminated on `"type"`.

use std::fmt;

use serde::{Deserialize, Serialize};

use super::config::TimeoutAction;
use super::envelope::{ApprovalMode, ApprovalRequestShape};

/// Deterministic failure reasons for approval question validation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalQuestionValidationFailure {
    MissingQuestionItems,
    TooManyQuestionItems,
    EmptyItemId,
    EmptyQuestionId,
    MissingRadioOptions,
    EmptyRadioOptionId,
    UnsupportedQuestionType,
}

/// Validation error emitted when approval question payload shape is unsupported.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ApprovalQuestionValidationError {
    pub failure: ApprovalQuestionValidationFailure,
    pub detail: String,
}

impl ApprovalQuestionValidationError {
    fn new(failure: ApprovalQuestionValidationFailure, detail: impl Into<String>) -> Self {
        Self {
            failure,
            detail: detail.into(),
        }
    }
}

impl fmt::Display for ApprovalQuestionValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.failure, self.detail)
    }
}

impl std::error::Error for ApprovalQuestionValidationError {}

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

impl Question {
    /// Returns the approval request shape represented by this question, when applicable.
    pub fn approval_request_shape(&self) -> Option<ApprovalRequestShape> {
        match self {
            Question::ConfirmReject(_) => Some(ApprovalRequestShape::ConfirmRejectQuestion),
            Question::RadioSelect(_) => Some(ApprovalRequestShape::RadioSelectQuestion),
            Question::FreeText(_) | Question::CountdownTimer(_) => None,
        }
    }

    /// Returns the question id independent of variant shape.
    pub fn question_id(&self) -> &str {
        match self {
            Question::RadioSelect(question) => &question.id,
            Question::FreeText(question) => &question.id,
            Question::ConfirmReject(question) => &question.id,
            Question::CountdownTimer(question) => &question.id,
        }
    }

    /// Validates whether this question is supported for the provided approval mode.
    pub fn validate_for_approval_mode(
        &self,
        mode: ApprovalMode,
    ) -> Result<(), ApprovalQuestionValidationError> {
        let question_id = self.question_id().trim();
        if question_id.is_empty() {
            return Err(ApprovalQuestionValidationError::new(
                ApprovalQuestionValidationFailure::EmptyQuestionId,
                "Approval question id must not be empty",
            ));
        }

        match mode {
            ApprovalMode::Binary => match self {
                Question::ConfirmReject(_) => Ok(()),
                _ => Err(ApprovalQuestionValidationError::new(
                    ApprovalQuestionValidationFailure::UnsupportedQuestionType,
                    format!(
                        "Binary approval mode only supports confirm_reject questions, got {}",
                        question_type_name(self)
                    ),
                )),
            },
            ApprovalMode::MultipleChoice => match self {
                Question::RadioSelect(question) => validate_radio_select(question),
                _ => Err(ApprovalQuestionValidationError::new(
                    ApprovalQuestionValidationFailure::UnsupportedQuestionType,
                    format!(
                        "Multiple-choice approval mode only supports radio_select questions, got {}",
                        question_type_name(self)
                    ),
                )),
            },
            ApprovalMode::MultiApprovalSession => match self {
                Question::ConfirmReject(_) => Ok(()),
                Question::RadioSelect(question) => validate_radio_select(question),
                _ => Err(ApprovalQuestionValidationError::new(
                    ApprovalQuestionValidationFailure::UnsupportedQuestionType,
                    format!(
                        "Multi-approval session mode supports confirm_reject or radio_select questions, got {}",
                        question_type_name(self)
                    ),
                )),
            },
        }
    }
}

/// One approval prompt item in a multi-approval session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ApprovalQuestionItem {
    pub item_id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Item-local decision question.
    pub question: Question,
}

/// Explicit request payload for v2 approval modes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ApprovalQuestionSetV2 {
    pub mode: ApprovalMode,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<ApprovalQuestionItem>,
}

impl ApprovalQuestionSetV2 {
    /// Validates mode-aware approval question-set shape constraints.
    pub fn validate(&self) -> Result<(), ApprovalQuestionValidationError> {
        if self.items.is_empty() {
            return Err(ApprovalQuestionValidationError::new(
                ApprovalQuestionValidationFailure::MissingQuestionItems,
                "approval_question_set_v2.items must contain at least one item",
            ));
        }

        if !matches!(self.mode, ApprovalMode::MultiApprovalSession) && self.items.len() != 1 {
            return Err(ApprovalQuestionValidationError::new(
                ApprovalQuestionValidationFailure::TooManyQuestionItems,
                format!(
                    "{} mode expects exactly one question item, got {}",
                    approval_mode_name(self.mode),
                    self.items.len()
                ),
            ));
        }

        for item in &self.items {
            if item.item_id.trim().is_empty() {
                return Err(ApprovalQuestionValidationError::new(
                    ApprovalQuestionValidationFailure::EmptyItemId,
                    "approval question item_id must not be empty",
                ));
            }

            item.question.validate_for_approval_mode(self.mode)?;
        }

        Ok(())
    }
}

fn question_type_name(question: &Question) -> &'static str {
    match question {
        Question::RadioSelect(_) => "radio_select",
        Question::FreeText(_) => "free_text",
        Question::ConfirmReject(_) => "confirm_reject",
        Question::CountdownTimer(_) => "countdown_timer",
    }
}

fn approval_mode_name(mode: ApprovalMode) -> &'static str {
    match mode {
        ApprovalMode::Binary => "binary",
        ApprovalMode::MultipleChoice => "multiple_choice",
        ApprovalMode::MultiApprovalSession => "multi_approval_session",
    }
}

fn validate_radio_select(question: &RadioSelectQuestion) -> Result<(), ApprovalQuestionValidationError> {
    if question.options.is_empty() {
        return Err(ApprovalQuestionValidationError::new(
            ApprovalQuestionValidationFailure::MissingRadioOptions,
            format!(
                "radio_select question '{}' must contain at least one option",
                question.id
            ),
        ));
    }

    for option in &question.options {
        if option.id.trim().is_empty() {
            return Err(ApprovalQuestionValidationError::new(
                ApprovalQuestionValidationFailure::EmptyRadioOptionId,
                format!(
                    "radio_select question '{}' contains an option with empty id",
                    question.id
                ),
            ));
        }
    }

    Ok(())
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
