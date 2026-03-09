//! Answer types returned by the user.

use std::fmt;

use serde::{Deserialize, Serialize};

use super::envelope::{ApprovalMode, ApprovalResponseShape};

/// Deterministic failure reasons for approval answer validation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalAnswerValidationFailure {
    UnsupportedAnswerType,
    ModeMismatch,
    MissingAction,
    MissingSelectedOption,
    MissingSessionId,
    MissingSessionDecisions,
    InvalidDecisionState,
    EmptyItemId,
    UnexpectedField,
}

/// Validation error emitted when approval answer payload shape is unsupported.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ApprovalAnswerValidationError {
    pub failure: ApprovalAnswerValidationFailure,
    pub detail: String,
}

impl ApprovalAnswerValidationError {
    fn new(failure: ApprovalAnswerValidationFailure, detail: impl Into<String>) -> Self {
        Self {
            failure,
            detail: detail.into(),
        }
    }
}

impl fmt::Display for ApprovalAnswerValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.failure, self.detail)
    }
}

impl std::error::Error for ApprovalAnswerValidationError {}

/// Deterministic decision state for v2 approval payloads.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalDecisionState {
    Approve,
    Reject,
    Defer,
    NoDecision,
    Invalid,
}

/// Per-item decision entry used by multi-approval sessions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ApprovalSessionItemDecisionV2 {
    pub item_id: String,
    pub decision: ApprovalDecisionState,
    /// Selected option id for multiple-choice decisions.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected: Option<String>,
    /// Optional notes for this decision.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

impl ApprovalSessionItemDecisionV2 {
    /// Validates one multi-session item decision payload.
    pub fn validate(&self) -> Result<(), ApprovalAnswerValidationError> {
        if self.item_id.trim().is_empty() {
            return Err(ApprovalAnswerValidationError::new(
                ApprovalAnswerValidationFailure::EmptyItemId,
                "approval_session_item_decision_v2.item_id must not be empty",
            ));
        }

        if matches!(self.decision, ApprovalDecisionState::Invalid) {
            return Err(ApprovalAnswerValidationError::new(
                ApprovalAnswerValidationFailure::InvalidDecisionState,
                format!(
                    "approval_session_item_decision_v2 '{}' uses unsupported decision state 'invalid'",
                    self.item_id
                ),
            ));
        }

        if let Some(selected) = self.selected.as_ref() {
            if selected.trim().is_empty() {
                return Err(ApprovalAnswerValidationError::new(
                    ApprovalAnswerValidationFailure::MissingSelectedOption,
                    format!(
                        "approval_session_item_decision_v2 '{}' has an empty selected option id",
                        self.item_id
                    ),
                ));
            }
        }

        Ok(())
    }
}

/// Aggregate submission payload emitted by GUI flows for multi-approval sessions.
///
/// This shape is intentionally lightweight for UI emitters. It is converted into
/// [`ApprovalDecisionPayloadV2`] for protocol validation and downstream handling.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ApprovalSessionSubmissionV2 {
    #[serde(default = "default_multi_approval_mode")]
    pub mode: ApprovalMode,
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub decisions: Vec<ApprovalSessionItemDecisionV2>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

impl ApprovalSessionSubmissionV2 {
    /// Convert the aggregate GUI submission payload into a strict v2 decision payload.
    pub fn into_decision_payload(self) -> Result<ApprovalDecisionPayloadV2, ApprovalAnswerValidationError> {
        if self.mode != ApprovalMode::MultiApprovalSession {
            return Err(ApprovalAnswerValidationError::new(
                ApprovalAnswerValidationFailure::ModeMismatch,
                format!(
                    "approval_session_submission_v2 requires mode 'multi_approval_session', got '{}'",
                    approval_mode_name(self.mode)
                ),
            ));
        }

        ApprovalDecisionPayloadV2::from_multi_session_decisions(
            self.session_id,
            self.decisions,
            self.notes,
        )
    }
}

/// Explicit v2 approval decision payload.
///
/// This payload makes mode and decision shape explicit so unknown or malformed
/// payloads can be rejected without implying approval.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ApprovalDecisionPayloadV2 {
    pub mode: ApprovalMode,
    /// Binary decision field (`approve`/`reject`) for mode `binary`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<ConfirmRejectAction>,
    /// Multiple-choice selected option id for mode `multiple_choice`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected: Option<String>,
    /// Multi-approval session id for mode `multi_approval_session`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    /// Per-item decisions for mode `multi_approval_session`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub decisions: Vec<ApprovalSessionItemDecisionV2>,
    /// Optional top-level notes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

impl ApprovalDecisionPayloadV2 {
    /// Construct a validated multi-session approval payload.
    pub fn from_multi_session_decisions(
        session_id: impl Into<String>,
        decisions: Vec<ApprovalSessionItemDecisionV2>,
        notes: Option<String>,
    ) -> Result<Self, ApprovalAnswerValidationError> {
        let payload = Self {
            mode: ApprovalMode::MultiApprovalSession,
            action: None,
            selected: None,
            session_id: Some(session_id.into()),
            decisions,
            notes,
        };
        payload.validate()?;
        Ok(payload)
    }

    /// Parse and validate `approval_decision_v2` JSON payload text.
    pub fn parse_json(raw: &str) -> Result<Self, ApprovalAnswerValidationError> {
        let payload = serde_json::from_str::<Self>(raw).map_err(|error| {
            ApprovalAnswerValidationError::new(
                ApprovalAnswerValidationFailure::UnsupportedAnswerType,
                format!("invalid approval_decision_v2 payload JSON: {error}"),
            )
        })?;

        payload.validate()?;
        Ok(payload)
    }

    /// Parse aggregate GUI session JSON into a strict v2 decision payload.
    ///
    /// Accepts either:
    /// - full `approval_decision_v2` JSON, or
    /// - compact `approval_session_submission_v2` JSON.
    pub fn parse_multi_session_submission_json(
        raw: &str,
    ) -> Result<Self, ApprovalAnswerValidationError> {
        if let Ok(payload) = Self::parse_json(raw) {
            if payload.mode == ApprovalMode::MultiApprovalSession {
                return Ok(payload);
            }

            return Err(ApprovalAnswerValidationError::new(
                ApprovalAnswerValidationFailure::ModeMismatch,
                format!(
                    "multi-session parser expected mode 'multi_approval_session', got '{}'",
                    approval_mode_name(payload.mode)
                ),
            ));
        }

        let aggregate = serde_json::from_str::<ApprovalSessionSubmissionV2>(raw).map_err(|error| {
            ApprovalAnswerValidationError::new(
                ApprovalAnswerValidationFailure::UnsupportedAnswerType,
                format!("invalid approval_session_submission_v2 payload JSON: {error}"),
            )
        })?;

        aggregate.into_decision_payload()
    }

    /// Serialize a validated decision payload for transport.
    pub fn to_json(&self) -> Result<String, ApprovalAnswerValidationError> {
        self.validate()?;
        serde_json::to_string(self).map_err(|error| {
            ApprovalAnswerValidationError::new(
                ApprovalAnswerValidationFailure::UnsupportedAnswerType,
                format!("failed to serialize approval_decision_v2 payload: {error}"),
            )
        })
    }

    /// Returns the response shape represented by this payload.
    pub fn response_shape(&self) -> ApprovalResponseShape {
        ApprovalResponseShape::ApprovalDecisionV2
    }

    /// Validates mode-specific fields for v2 approval decision payloads.
    pub fn validate(&self) -> Result<(), ApprovalAnswerValidationError> {
        match self.mode {
            ApprovalMode::Binary => {
                if self.action.is_none() {
                    return Err(ApprovalAnswerValidationError::new(
                        ApprovalAnswerValidationFailure::MissingAction,
                        "binary approval_decision_v2 payload requires action",
                    ));
                }
                if self.selected.is_some() {
                    return Err(ApprovalAnswerValidationError::new(
                        ApprovalAnswerValidationFailure::UnexpectedField,
                        "binary approval_decision_v2 payload does not support selected",
                    ));
                }
                if self.session_id.is_some() {
                    return Err(ApprovalAnswerValidationError::new(
                        ApprovalAnswerValidationFailure::UnexpectedField,
                        "binary approval_decision_v2 payload does not support session_id",
                    ));
                }
                if !self.decisions.is_empty() {
                    return Err(ApprovalAnswerValidationError::new(
                        ApprovalAnswerValidationFailure::UnexpectedField,
                        "binary approval_decision_v2 payload does not support decisions",
                    ));
                }
            }
            ApprovalMode::MultipleChoice => {
                if self
                    .selected
                    .as_ref()
                    .map(|value| value.trim().is_empty())
                    .unwrap_or(true)
                {
                    return Err(ApprovalAnswerValidationError::new(
                        ApprovalAnswerValidationFailure::MissingSelectedOption,
                        "multiple_choice approval_decision_v2 payload requires selected option id",
                    ));
                }
                if self.action.is_some() {
                    return Err(ApprovalAnswerValidationError::new(
                        ApprovalAnswerValidationFailure::UnexpectedField,
                        "multiple_choice approval_decision_v2 payload does not support action",
                    ));
                }
                if self.session_id.is_some() {
                    return Err(ApprovalAnswerValidationError::new(
                        ApprovalAnswerValidationFailure::UnexpectedField,
                        "multiple_choice approval_decision_v2 payload does not support session_id",
                    ));
                }
                if !self.decisions.is_empty() {
                    return Err(ApprovalAnswerValidationError::new(
                        ApprovalAnswerValidationFailure::UnexpectedField,
                        "multiple_choice approval_decision_v2 payload does not support decisions",
                    ));
                }
            }
            ApprovalMode::MultiApprovalSession => {
                if self.action.is_some() {
                    return Err(ApprovalAnswerValidationError::new(
                        ApprovalAnswerValidationFailure::UnexpectedField,
                        "multi_approval_session approval_decision_v2 payload does not support action",
                    ));
                }
                if self.selected.is_some() {
                    return Err(ApprovalAnswerValidationError::new(
                        ApprovalAnswerValidationFailure::UnexpectedField,
                        "multi_approval_session approval_decision_v2 payload does not support selected",
                    ));
                }
                if self
                    .session_id
                    .as_ref()
                    .map(|value| value.trim().is_empty())
                    .unwrap_or(true)
                {
                    return Err(ApprovalAnswerValidationError::new(
                        ApprovalAnswerValidationFailure::MissingSessionId,
                        "multi_approval_session approval_decision_v2 payload requires session_id",
                    ));
                }
                if self.decisions.is_empty() {
                    return Err(ApprovalAnswerValidationError::new(
                        ApprovalAnswerValidationFailure::MissingSessionDecisions,
                        "multi_approval_session approval_decision_v2 payload requires at least one item decision",
                    ));
                }

                for decision in &self.decisions {
                    decision.validate()?;
                }
            }
        }

        Ok(())
    }
}

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
    #[serde(alias = "confirm_reject")]
    ConfirmRejectAnswer {
        /// `"approve"` or `"reject"`.
        action: ConfirmRejectAction,
        /// Optional notes explaining the decision.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        notes: Option<String>,
    },
    /// Explicit v2 approval decision payload.
    ApprovalDecisionV2 {
        decision: ApprovalDecisionPayloadV2,
    },
    /// Answer to a `countdown_timer` question.
    CountdownTimerAnswer {
        /// Whether the user completed in time or the timer expired.
        result: TimerResult,
        /// How many seconds elapsed before completion or timeout.
        elapsed_seconds: u32,
    },
}

impl AnswerValue {
    /// Returns the approval response shape represented by this answer value, when applicable.
    pub fn approval_response_shape(&self) -> Option<ApprovalResponseShape> {
        match self {
            AnswerValue::ConfirmRejectAnswer { .. } => Some(ApprovalResponseShape::ConfirmRejectAnswer),
            AnswerValue::RadioSelectAnswer { .. } => Some(ApprovalResponseShape::RadioSelectAnswer),
            AnswerValue::ApprovalDecisionV2 { decision } => Some(decision.response_shape()),
            AnswerValue::FreeTextAnswer { .. } | AnswerValue::CountdownTimerAnswer { .. } => None,
        }
    }

    /// Validates whether this answer value is supported for the provided approval mode.
    pub fn validate_for_approval_mode(
        &self,
        mode: ApprovalMode,
    ) -> Result<(), ApprovalAnswerValidationError> {
        match (mode, self) {
            // Legacy compatibility: binary mode accepts confirm_reject_answer.
            (ApprovalMode::Binary, AnswerValue::ConfirmRejectAnswer { .. }) => Ok(()),
            (ApprovalMode::Binary, AnswerValue::ApprovalDecisionV2 { decision }) => {
                if decision.mode != ApprovalMode::Binary {
                    return Err(ApprovalAnswerValidationError::new(
                        ApprovalAnswerValidationFailure::ModeMismatch,
                        format!(
                            "binary mode cannot accept approval_decision_v2 payload with mode '{}'",
                            approval_mode_name(decision.mode)
                        ),
                    ));
                }
                decision.validate()
            }
            (ApprovalMode::MultipleChoice, AnswerValue::RadioSelectAnswer { selected, .. }) => {
                if selected.trim().is_empty() {
                    return Err(ApprovalAnswerValidationError::new(
                        ApprovalAnswerValidationFailure::MissingSelectedOption,
                        "multiple_choice radio_select_answer requires selected option id",
                    ));
                }
                Ok(())
            }
            (ApprovalMode::MultipleChoice, AnswerValue::ApprovalDecisionV2 { decision }) => {
                if decision.mode != ApprovalMode::MultipleChoice {
                    return Err(ApprovalAnswerValidationError::new(
                        ApprovalAnswerValidationFailure::ModeMismatch,
                        format!(
                            "multiple_choice mode cannot accept approval_decision_v2 payload with mode '{}'",
                            approval_mode_name(decision.mode)
                        ),
                    ));
                }
                decision.validate()
            }
            (ApprovalMode::MultiApprovalSession, AnswerValue::ApprovalDecisionV2 { decision }) => {
                if decision.mode != ApprovalMode::MultiApprovalSession {
                    return Err(ApprovalAnswerValidationError::new(
                        ApprovalAnswerValidationFailure::ModeMismatch,
                        format!(
                            "multi_approval_session mode cannot accept approval_decision_v2 payload with mode '{}'",
                            approval_mode_name(decision.mode)
                        ),
                    ));
                }
                decision.validate()
            }
            (expected_mode, _) => Err(ApprovalAnswerValidationError::new(
                ApprovalAnswerValidationFailure::UnsupportedAnswerType,
                format!(
                    "{} mode cannot accept '{}' answer payload",
                    approval_mode_name(expected_mode),
                    answer_type_name(self)
                ),
            )),
        }
    }
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

impl Answer {
    /// Validates that this answer can be consumed by the given approval mode.
    pub fn validate_for_approval_mode(
        &self,
        mode: ApprovalMode,
    ) -> Result<(), ApprovalAnswerValidationError> {
        if self.question_id.trim().is_empty() {
            return Err(ApprovalAnswerValidationError::new(
                ApprovalAnswerValidationFailure::EmptyItemId,
                "approval answer question_id must not be empty",
            ));
        }

        self.value.validate_for_approval_mode(mode)
    }
}

fn answer_type_name(value: &AnswerValue) -> &'static str {
    match value {
        AnswerValue::RadioSelectAnswer { .. } => "radio_select_answer",
        AnswerValue::FreeTextAnswer { .. } => "free_text_answer",
        AnswerValue::ConfirmRejectAnswer { .. } => "confirm_reject_answer",
        AnswerValue::ApprovalDecisionV2 { .. } => "approval_decision_v2",
        AnswerValue::CountdownTimerAnswer { .. } => "countdown_timer_answer",
    }
}

fn approval_mode_name(mode: ApprovalMode) -> &'static str {
    match mode {
        ApprovalMode::Binary => "binary",
        ApprovalMode::MultipleChoice => "multiple_choice",
        ApprovalMode::MultiApprovalSession => "multi_approval_session",
    }
}

fn default_multi_approval_mode() -> ApprovalMode {
    ApprovalMode::MultiApprovalSession
}
