//! Typed wrapper for approval-gate form requests and responses.
//!
//! Provides sensible defaults (60 s timeout, approve on timeout,
//! always-on-top, 500×350 window).

use std::fmt;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::answers::{
    Answer, AnswerValue, ApprovalAnswerValidationError, ApprovalDecisionPayloadV2,
    ApprovalDecisionState,
};
use super::config::{FallbackMode, TimeoutAction, TimeoutConfig, WindowConfig};
use super::envelope::{
    ApprovalContractV2, ApprovalMode, ApprovalRequestShape, ApprovalResponseShape, FormMetadata,
    FormRequest, FormRequestTag, FormResponse, FormStatus, FormType,
};
use super::questions::{
    ApprovalQuestionSetV2, ApprovalQuestionValidationError, Question,
};

// ── Approval-specific context types ────────────────────────────

/// Visual indicator for the urgency of the approval decision.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalUrgency {
    Low,
    Medium,
    High,
    Critical,
}

/// Structured context about the gated plan step, serialized into
/// [`FormRequest::context`] for the QML renderer to display.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalStepContext {
    pub plan_title: String,
    pub phase: String,
    pub step_task: String,
    pub step_index: u32,
    pub urgency: ApprovalUrgency,
}

/// V2 approval request context containing explicit mode and shape metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ApprovalRequestContextV2 {
    #[serde(flatten)]
    pub step: ApprovalStepContext,
    pub contract: ApprovalContractV2,
}

// ── Builder ────────────────────────────────────────────────────

/// Builder / typed wrapper around [`FormRequest`] for approval-gate forms.
pub struct ApprovalRequest;

impl ApprovalRequest {
    fn base_request(metadata: FormMetadata, questions: Vec<Question>) -> FormRequest {
        FormRequest {
            message_type: FormRequestTag,
            version: 1,
            request_id: Uuid::new_v4(),
            form_type: FormType::Approval,
            metadata,
            timeout: TimeoutConfig {
                duration_seconds: 60,
                on_timeout: TimeoutAction::Approve,
                fallback_mode: FallbackMode::None,
            },
            window: WindowConfig {
                always_on_top: true,
                width: 500,
                height: 350,
                title: "Approval Required".to_string(),
            },
            questions,
            context: None,
        }
    }

    /// Create a new approval-gate [`FormRequest`] with default settings.
    ///
    /// Defaults:
    /// - timeout: **60 s**, on-timeout: **approve**, fallback: **none**
    /// - window: **500×350**, **always-on-top**
    pub fn new(metadata: FormMetadata, questions: Vec<Question>) -> FormRequest {
        Self::base_request(metadata, questions)
    }

    /// Create an approval-gate [`FormRequest`] with step context.
    ///
    /// The context is serialized as `serde_json::Value` into the
    /// [`FormRequest::context`] field for the QML dialog to render.
    pub fn with_context(
        metadata: FormMetadata,
        questions: Vec<Question>,
        step_context: ApprovalStepContext,
    ) -> FormRequest {
        let mut req = Self::base_request(metadata, questions);
        let context = serde_json::to_value(&step_context).ok();
        req.context = context;
        req
    }

    /// Create an approval-gate [`FormRequest`] with explicit v2 mode/shape contract.
    ///
    /// This compatibility helper preserves legacy API behaviour and does not fail
    /// request construction when contract validation fails.
    /// For deterministic validation failures, use [`Self::with_contract_v2_context_checked`].
    pub fn with_contract_v2_context(
        metadata: FormMetadata,
        questions: Vec<Question>,
        step_context: ApprovalStepContext,
        contract: ApprovalContractV2,
    ) -> FormRequest {
        let mut req = Self::base_request(metadata, questions);
        let v2_context = ApprovalRequestContextV2 {
            step: step_context,
            contract,
        };
        req.context = serde_json::to_value(v2_context).ok();
        req
    }

    /// Create an approval-gate [`FormRequest`] with explicit v2 mode/shape contract,
    /// rejecting unsupported mode/shape combinations deterministically.
    pub fn with_contract_v2_context_checked(
        metadata: FormMetadata,
        questions: Vec<Question>,
        step_context: ApprovalStepContext,
        contract: ApprovalContractV2,
    ) -> Result<FormRequest, ApprovalProtocolValidationError> {
        contract.validate_request_questions(&questions)?;

        let mut req = Self::base_request(metadata, questions);
        let v2_context = ApprovalRequestContextV2 {
            step: step_context,
            contract,
        };
        req.context = Some(serde_json::to_value(v2_context).map_err(|error| {
            ApprovalProtocolValidationError::new(
                ApprovalProtocolValidationFailure::InvalidQuestionSet,
                format!("Failed to serialize approval request v2 context: {error}"),
            )
        })?);
        Ok(req)
    }

    /// Validates approval request questions against a v2 contract.
    pub fn validate_contract_v2_request(
        contract: &ApprovalContractV2,
        questions: &[Question],
    ) -> Result<(), ApprovalProtocolValidationError> {
        contract.validate_request_questions(questions)
    }

    /// Validates an explicit multi-item approval question-set payload against a v2 contract.
    pub fn validate_contract_v2_question_set(
        contract: &ApprovalContractV2,
        question_set: &ApprovalQuestionSetV2,
    ) -> Result<(), ApprovalProtocolValidationError> {
        contract.validate_request_question_set(question_set)
    }

    /// Convenience builder for common v2 approval contract presets.
    pub fn contract_v2(mode: ApprovalMode) -> ApprovalContractV2 {
        match mode {
            ApprovalMode::Binary => ApprovalContractV2 {
                mode,
                request_shape: ApprovalRequestShape::ConfirmRejectQuestion,
                response_shape: ApprovalResponseShape::ConfirmRejectAnswer,
                session: None,
            },
            ApprovalMode::MultipleChoice => ApprovalContractV2 {
                mode,
                request_shape: ApprovalRequestShape::RadioSelectQuestion,
                response_shape: ApprovalResponseShape::RadioSelectAnswer,
                session: None,
            },
            ApprovalMode::MultiApprovalSession => ApprovalContractV2 {
                mode,
                request_shape: ApprovalRequestShape::MultiApprovalQuestionSet,
                response_shape: ApprovalResponseShape::ApprovalDecisionV2,
                session: None,
            },
        }
    }
}

/// Typed wrapper around [`FormResponse`] for approval forms.
#[derive(Debug, Clone)]
pub struct ApprovalResponse(pub FormResponse);

/// Deterministic routing outcomes shared across approval layers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalRoutingOutcome {
    Approved,
    Rejected,
    Timeout,
    Deferred,
    FallbackToChat,
    Error,
}

/// Optional reason code for non-approved compatibility outcomes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalFailureReason {
    MissingDecision,
    UnknownMode,
    MalformedAnswer,
    PartialSessionCompletion,
    ResponseStatusUnexpected,
    RequestTimedOut,
}

/// Deterministic contract validation failure categories for approval mode handling.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalProtocolValidationFailure {
    UnsupportedContractShape,
    InvalidContractSession,
    MissingApprovalQuestion,
    MissingApprovalAnswer,
    UnexpectedApprovalQuestionShape,
    UnexpectedApprovalAnswerShape,
    InvalidQuestionSet,
    InvalidAnswerPayload,
}

/// Validation error for mode-aware approval request/response contracts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ApprovalProtocolValidationError {
    pub failure: ApprovalProtocolValidationFailure,
    pub detail: String,
}

impl ApprovalProtocolValidationError {
    fn new(failure: ApprovalProtocolValidationFailure, detail: impl Into<String>) -> Self {
        Self {
            failure,
            detail: detail.into(),
        }
    }
}

impl fmt::Display for ApprovalProtocolValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.failure, self.detail)
    }
}

impl std::error::Error for ApprovalProtocolValidationError {}

/// Result of strict approval decision normalization.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ApprovalDecisionResolution {
    pub outcome: ApprovalRoutingOutcome,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure_reason: Option<ApprovalFailureReason>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl ApprovalDecisionResolution {
    fn approved() -> Self {
        Self {
            outcome: ApprovalRoutingOutcome::Approved,
            failure_reason: None,
            detail: None,
        }
    }

    fn rejected() -> Self {
        Self {
            outcome: ApprovalRoutingOutcome::Rejected,
            failure_reason: None,
            detail: None,
        }
    }

    fn timeout() -> Self {
        Self {
            outcome: ApprovalRoutingOutcome::Timeout,
            failure_reason: Some(ApprovalFailureReason::RequestTimedOut),
            detail: None,
        }
    }

    fn deferred(reason: Option<ApprovalFailureReason>, detail: Option<String>) -> Self {
        Self {
            outcome: ApprovalRoutingOutcome::Deferred,
            failure_reason: reason,
            detail,
        }
    }

    fn error(reason: ApprovalFailureReason, detail: impl Into<String>) -> Self {
        Self {
            outcome: ApprovalRoutingOutcome::Error,
            failure_reason: Some(reason),
            detail: Some(detail.into()),
        }
    }

    fn from_protocol_error(error: ApprovalProtocolValidationError) -> Self {
        match error.failure {
            ApprovalProtocolValidationFailure::MissingApprovalQuestion
            | ApprovalProtocolValidationFailure::MissingApprovalAnswer => Self::error(
                ApprovalFailureReason::MissingDecision,
                error.detail,
            ),
            ApprovalProtocolValidationFailure::UnsupportedContractShape => {
                Self::error(ApprovalFailureReason::UnknownMode, error.detail)
            }
            ApprovalProtocolValidationFailure::InvalidContractSession
            | ApprovalProtocolValidationFailure::UnexpectedApprovalQuestionShape
            | ApprovalProtocolValidationFailure::UnexpectedApprovalAnswerShape
            | ApprovalProtocolValidationFailure::InvalidQuestionSet
            | ApprovalProtocolValidationFailure::InvalidAnswerPayload => {
                Self::error(ApprovalFailureReason::MalformedAnswer, error.detail)
            }
        }
    }
}

impl ApprovalContractV2 {
    /// Validates core mode/request_shape/response_shape compatibility.
    pub fn validate_mode_shape(&self) -> Result<(), ApprovalProtocolValidationError> {
        let valid = match self.mode {
            ApprovalMode::Binary => {
                self.request_shape == ApprovalRequestShape::ConfirmRejectQuestion
                    && matches!(
                        self.response_shape,
                        ApprovalResponseShape::ConfirmRejectAnswer
                            | ApprovalResponseShape::ApprovalDecisionV2
                    )
            }
            ApprovalMode::MultipleChoice => {
                self.request_shape == ApprovalRequestShape::RadioSelectQuestion
                    && matches!(
                        self.response_shape,
                        ApprovalResponseShape::RadioSelectAnswer
                            | ApprovalResponseShape::ApprovalDecisionV2
                    )
            }
            ApprovalMode::MultiApprovalSession => {
                self.request_shape == ApprovalRequestShape::MultiApprovalQuestionSet
                    && self.response_shape == ApprovalResponseShape::ApprovalDecisionV2
            }
        };

        if !valid {
            return Err(ApprovalProtocolValidationError::new(
                ApprovalProtocolValidationFailure::UnsupportedContractShape,
                format!(
                    "Unsupported approval contract combination: mode='{}', request_shape='{}', response_shape='{}'",
                    mode_name(self.mode),
                    request_shape_name(self.request_shape),
                    response_shape_name(self.response_shape)
                ),
            ));
        }

        match self.mode {
            ApprovalMode::MultiApprovalSession => {
                let session = self.session.as_ref().ok_or_else(|| {
                    ApprovalProtocolValidationError::new(
                        ApprovalProtocolValidationFailure::InvalidContractSession,
                        "multi_approval_session contract requires session metadata",
                    )
                })?;

                if session.session_id.trim().is_empty() {
                    return Err(ApprovalProtocolValidationError::new(
                        ApprovalProtocolValidationFailure::InvalidContractSession,
                        "multi_approval_session contract session_id must not be empty",
                    ));
                }

                if session.require_all_responses && session.item_ids.is_empty() {
                    return Err(ApprovalProtocolValidationError::new(
                        ApprovalProtocolValidationFailure::InvalidContractSession,
                        "multi_approval_session contract with require_all_responses=true requires item_ids",
                    ));
                }

                for item_id in &session.item_ids {
                    if item_id.trim().is_empty() {
                        return Err(ApprovalProtocolValidationError::new(
                            ApprovalProtocolValidationFailure::InvalidContractSession,
                            "multi_approval_session contract item_ids must not contain empty values",
                        ));
                    }
                }
            }
            ApprovalMode::Binary | ApprovalMode::MultipleChoice => {
                if self.session.is_some() {
                    return Err(ApprovalProtocolValidationError::new(
                        ApprovalProtocolValidationFailure::InvalidContractSession,
                        format!(
                            "{} contract must not define session metadata",
                            mode_name(self.mode)
                        ),
                    ));
                }
            }
        }

        Ok(())
    }

    /// Validates top-level request questions against this approval contract.
    pub fn validate_request_questions(
        &self,
        questions: &[Question],
    ) -> Result<(), ApprovalProtocolValidationError> {
        self.validate_mode_shape()?;

        let mut approval_question_count = 0usize;

        for question in questions {
            let Some(shape) = question.approval_request_shape() else {
                continue;
            };

            if shape != self.request_shape {
                return Err(ApprovalProtocolValidationError::new(
                    ApprovalProtocolValidationFailure::UnexpectedApprovalQuestionShape,
                    format!(
                        "Expected approval question shape '{}' but received '{}'",
                        request_shape_name(self.request_shape),
                        request_shape_name(shape)
                    ),
                ));
            }

            question
                .validate_for_approval_mode(self.mode)
                .map_err(map_question_validation_error)?;
            approval_question_count += 1;
        }

        if approval_question_count == 0 {
            return Err(ApprovalProtocolValidationError::new(
                ApprovalProtocolValidationFailure::MissingApprovalQuestion,
                format!(
                    "No approval question found for request shape '{}'",
                    request_shape_name(self.request_shape)
                ),
            ));
        }

        if !matches!(self.mode, ApprovalMode::MultiApprovalSession) && approval_question_count != 1 {
            return Err(ApprovalProtocolValidationError::new(
                ApprovalProtocolValidationFailure::UnexpectedApprovalQuestionShape,
                format!(
                    "{} mode expects exactly one approval question, got {}",
                    mode_name(self.mode),
                    approval_question_count
                ),
            ));
        }

        Ok(())
    }

    /// Validates an explicit question-set payload for multi-item request handling.
    pub fn validate_request_question_set(
        &self,
        question_set: &ApprovalQuestionSetV2,
    ) -> Result<(), ApprovalProtocolValidationError> {
        self.validate_mode_shape()?;

        if self.request_shape != ApprovalRequestShape::MultiApprovalQuestionSet {
            return Err(ApprovalProtocolValidationError::new(
                ApprovalProtocolValidationFailure::UnexpectedApprovalQuestionShape,
                format!(
                    "request_question_set validation requires request_shape='multi_approval_question_set', got '{}'",
                    request_shape_name(self.request_shape)
                ),
            ));
        }

        if question_set.mode != self.mode {
            return Err(ApprovalProtocolValidationError::new(
                ApprovalProtocolValidationFailure::UnexpectedApprovalQuestionShape,
                format!(
                    "question_set mode '{}' does not match contract mode '{}'",
                    mode_name(question_set.mode),
                    mode_name(self.mode)
                ),
            ));
        }

        question_set
            .validate()
            .map_err(map_question_validation_error)?;

        if let Some(session) = self.session.as_ref() {
            for item in &question_set.items {
                if !session.item_ids.is_empty()
                    && !session.item_ids.iter().any(|known| known == &item.item_id)
                {
                    return Err(ApprovalProtocolValidationError::new(
                        ApprovalProtocolValidationFailure::InvalidQuestionSet,
                        format!(
                            "question_set contains unknown item_id '{}' not present in contract session.item_ids",
                            item.item_id
                        ),
                    ));
                }
            }
        }

        Ok(())
    }

    /// Validates approval answers against this mode/shape contract.
    pub fn validate_response_answers(
        &self,
        answers: &[Answer],
    ) -> Result<(), ApprovalProtocolValidationError> {
        self.validate_mode_shape()?;

        let mut approval_answer_count = 0usize;

        for answer in answers {
            let Some(shape) = answer.value.approval_response_shape() else {
                continue;
            };

            if shape != self.response_shape {
                return Err(ApprovalProtocolValidationError::new(
                    ApprovalProtocolValidationFailure::UnexpectedApprovalAnswerShape,
                    format!(
                        "Expected approval answer shape '{}' but received '{}'",
                        response_shape_name(self.response_shape),
                        response_shape_name(shape)
                    ),
                ));
            }

            answer
                .validate_for_approval_mode(self.mode)
                .map_err(map_answer_validation_error)?;

            if matches!(self.mode, ApprovalMode::MultiApprovalSession)
                && matches!(self.response_shape, ApprovalResponseShape::ApprovalDecisionV2)
            {
                if let AnswerValue::ApprovalDecisionV2 { decision } = &answer.value {
                    if let Some(session) = self.session.as_ref() {
                        for item in &decision.decisions {
                            if !session.item_ids.is_empty()
                                && !session.item_ids.iter().any(|known| known == &item.item_id)
                            {
                                return Err(ApprovalProtocolValidationError::new(
                                    ApprovalProtocolValidationFailure::InvalidAnswerPayload,
                                    format!(
                                        "multi_approval_session answer contains unknown item_id '{}' not present in contract session.item_ids",
                                        item.item_id
                                    ),
                                ));
                            }
                        }
                    }
                }
            }

            approval_answer_count += 1;
        }

        if approval_answer_count == 0 {
            return Err(ApprovalProtocolValidationError::new(
                ApprovalProtocolValidationFailure::MissingApprovalAnswer,
                format!(
                    "No approval answer found for response shape '{}'",
                    response_shape_name(self.response_shape)
                ),
            ));
        }

        if approval_answer_count != 1 {
            return Err(ApprovalProtocolValidationError::new(
                ApprovalProtocolValidationFailure::UnexpectedApprovalAnswerShape,
                format!(
                    "Approval response expects exactly one approval answer, got {}",
                    approval_answer_count
                ),
            ));
        }

        Ok(())
    }
}

impl ApprovalResponse {
    /// Unwrap into the inner [`FormResponse`].
    pub fn into_inner(self) -> FormResponse {
        self.0
    }

    /// Whether the approval was granted by an explicit decision payload.
    pub fn is_approved(&self) -> bool {
        self.resolve_outcome_v2_strict().outcome == ApprovalRoutingOutcome::Approved
    }

    /// Strict, deterministic approval outcome resolution used for cross-layer compatibility.
    ///
    /// Matrix highlights:
    /// - Legacy `confirm_reject` and `confirm_reject_answer` remain compatible.
    /// - Missing/malformed decision payloads are never treated as approval.
    /// - Partial multi-session decisions map to `deferred`.
    /// - Unknown mode values are rejected at deserialization boundaries and should be surfaced
    ///   upstream as malformed payloads.
    pub fn resolve_outcome_v2_strict(&self) -> ApprovalDecisionResolution {
        match self.0.status {
            FormStatus::Completed => {
                for answer in &self.0.answers {
                    match &answer.value {
                        AnswerValue::ConfirmRejectAnswer { action, .. } => {
                            return match action {
                                super::answers::ConfirmRejectAction::Approve => {
                                    ApprovalDecisionResolution::approved()
                                }
                                super::answers::ConfirmRejectAction::Reject => {
                                    ApprovalDecisionResolution::rejected()
                                }
                            }
                        }
                        AnswerValue::RadioSelectAnswer { selected, .. } => {
                            return if !selected.trim().is_empty() {
                                ApprovalDecisionResolution::approved()
                            } else {
                                ApprovalDecisionResolution::error(
                                    ApprovalFailureReason::MissingDecision,
                                    "radio_select_answer is missing selected option",
                                )
                            }
                        }
                        AnswerValue::ApprovalDecisionV2 { decision } => {
                            if let Err(error) = decision.validate() {
                                return ApprovalDecisionResolution::error(
                                    ApprovalFailureReason::MalformedAnswer,
                                    format!(
                                        "Invalid approval_decision_v2 payload for mode '{}': {error}",
                                        mode_name(decision.mode)
                                    ),
                                );
                            }

                            return resolve_decision_payload_v2(decision);
                        }
                        _ => {}
                    }
                }

                ApprovalDecisionResolution::error(
                    ApprovalFailureReason::MissingDecision,
                    "No confirm_reject or approval_decision_v2 answer found",
                )
            }
            FormStatus::TimedOut => ApprovalDecisionResolution::timeout(),
            FormStatus::Cancelled => ApprovalDecisionResolution::rejected(),
            FormStatus::Deferred => ApprovalDecisionResolution::deferred(None, None),
            FormStatus::RefinementRequested => ApprovalDecisionResolution::error(
                ApprovalFailureReason::ResponseStatusUnexpected,
                "approval response status refinement_requested is not terminal",
            ),
        }
    }

    /// Strict mode-aware decision evaluation against an explicit v2 contract.
    ///
    /// Unsupported mode/shape combinations are rejected deterministically with
    /// `ApprovalRoutingOutcome::Error` and a non-empty failure reason.
    pub fn resolve_outcome_for_contract_v2_strict(
        &self,
        contract: &ApprovalContractV2,
    ) -> ApprovalDecisionResolution {
        if let Err(error) = contract.validate_mode_shape() {
            return ApprovalDecisionResolution::from_protocol_error(error);
        }

        match self.0.status {
            FormStatus::Completed => {
                if let Err(error) = contract.validate_response_answers(&self.0.answers) {
                    return ApprovalDecisionResolution::from_protocol_error(error);
                }

                for answer in &self.0.answers {
                    if answer.value.approval_response_shape().is_none() {
                        continue;
                    }

                    return match (&answer.value, contract.mode) {
                        (AnswerValue::ConfirmRejectAnswer { action, .. }, ApprovalMode::Binary) => {
                            match action {
                                super::answers::ConfirmRejectAction::Approve => {
                                    ApprovalDecisionResolution::approved()
                                }
                                super::answers::ConfirmRejectAction::Reject => {
                                    ApprovalDecisionResolution::rejected()
                                }
                            }
                        }
                        (AnswerValue::RadioSelectAnswer { selected, .. }, ApprovalMode::MultipleChoice) => {
                            if selected.trim().is_empty() {
                                ApprovalDecisionResolution::error(
                                    ApprovalFailureReason::MissingDecision,
                                    "multiple_choice radio_select_answer is missing selected option",
                                )
                            } else {
                                ApprovalDecisionResolution::approved()
                            }
                        }
                        (AnswerValue::ApprovalDecisionV2 { decision }, _) => {
                            resolve_decision_payload_v2(decision)
                        }
                        (unexpected, expected_mode) => ApprovalDecisionResolution::error(
                            ApprovalFailureReason::MalformedAnswer,
                            format!(
                                "Unexpected approval answer '{}' for contract mode '{}'",
                                response_shape_name(
                                    unexpected
                                        .approval_response_shape()
                                        .unwrap_or(ApprovalResponseShape::ApprovalDecisionV2),
                                ),
                                mode_name(expected_mode)
                            ),
                        ),
                    };
                }

                ApprovalDecisionResolution::error(
                    ApprovalFailureReason::MissingDecision,
                    "No approval answer found after contract validation",
                )
            }
            FormStatus::TimedOut => ApprovalDecisionResolution::timeout(),
            FormStatus::Cancelled => ApprovalDecisionResolution::rejected(),
            FormStatus::Deferred => ApprovalDecisionResolution::deferred(None, None),
            FormStatus::RefinementRequested => ApprovalDecisionResolution::error(
                ApprovalFailureReason::ResponseStatusUnexpected,
                "approval response status refinement_requested is not terminal",
            ),
        }
    }

    /// Strict v2 decision evaluation.
    ///
    /// Returns `true` only when an explicit approval decision is present.
    /// Missing, malformed, unknown, or non-approval decision payloads return `false`.
    pub fn is_approved_v2_strict(&self) -> bool {
        self.resolve_outcome_v2_strict().outcome == ApprovalRoutingOutcome::Approved
    }

    /// Whether the user explicitly rejected.
    pub fn is_rejected(&self) -> bool {
        self.0.status == FormStatus::Cancelled
    }
}

fn resolve_decision_payload_v2(decision: &ApprovalDecisionPayloadV2) -> ApprovalDecisionResolution {
    match decision.mode {
        ApprovalMode::Binary => match decision.action {
            Some(super::answers::ConfirmRejectAction::Approve) => {
                ApprovalDecisionResolution::approved()
            }
            Some(super::answers::ConfirmRejectAction::Reject) => {
                ApprovalDecisionResolution::rejected()
            }
            None => ApprovalDecisionResolution::error(
                ApprovalFailureReason::MissingDecision,
                "Binary approval_decision_v2 is missing action",
            ),
        },
        ApprovalMode::MultipleChoice => {
            if decision
                .selected
                .as_ref()
                .map(|v| !v.trim().is_empty())
                .unwrap_or(false)
            {
                ApprovalDecisionResolution::approved()
            } else {
                ApprovalDecisionResolution::error(
                    ApprovalFailureReason::MissingDecision,
                    "Multiple-choice approval_decision_v2 is missing selected option",
                )
            }
        }
        ApprovalMode::MultiApprovalSession => {
            if decision.decisions.is_empty() {
                return ApprovalDecisionResolution::deferred(
                    Some(ApprovalFailureReason::PartialSessionCompletion),
                    Some("Multi-approval session contains no item decisions".to_string()),
                );
            }

            let mut has_reject = false;
            let mut has_deferred = false;

            for item in &decision.decisions {
                match item.decision {
                    ApprovalDecisionState::Approve => {}
                    ApprovalDecisionState::Reject => {
                        has_reject = true;
                    }
                    ApprovalDecisionState::Defer | ApprovalDecisionState::NoDecision => {
                        has_deferred = true;
                    }
                    ApprovalDecisionState::Invalid => {
                        return ApprovalDecisionResolution::error(
                            ApprovalFailureReason::MalformedAnswer,
                            "Multi-approval session contains invalid decision state",
                        );
                    }
                }
            }

            if has_reject {
                return ApprovalDecisionResolution::rejected();
            }

            if has_deferred {
                return ApprovalDecisionResolution::deferred(
                    Some(ApprovalFailureReason::PartialSessionCompletion),
                    Some("Multi-approval session is partially complete or deferred".to_string()),
                );
            }

            ApprovalDecisionResolution::approved()
        }
    }
}

fn map_question_validation_error(
    error: ApprovalQuestionValidationError,
) -> ApprovalProtocolValidationError {
    ApprovalProtocolValidationError::new(
        ApprovalProtocolValidationFailure::InvalidQuestionSet,
        error.to_string(),
    )
}

fn map_answer_validation_error(error: ApprovalAnswerValidationError) -> ApprovalProtocolValidationError {
    ApprovalProtocolValidationError::new(
        ApprovalProtocolValidationFailure::InvalidAnswerPayload,
        error.to_string(),
    )
}

fn mode_name(mode: ApprovalMode) -> &'static str {
    match mode {
        ApprovalMode::Binary => "binary",
        ApprovalMode::MultipleChoice => "multiple_choice",
        ApprovalMode::MultiApprovalSession => "multi_approval_session",
    }
}

fn request_shape_name(shape: ApprovalRequestShape) -> &'static str {
    match shape {
        ApprovalRequestShape::ConfirmRejectQuestion => "confirm_reject_question",
        ApprovalRequestShape::RadioSelectQuestion => "radio_select_question",
        ApprovalRequestShape::MultiApprovalQuestionSet => "multi_approval_question_set",
    }
}

fn response_shape_name(shape: ApprovalResponseShape) -> &'static str {
    match shape {
        ApprovalResponseShape::ConfirmRejectAnswer => "confirm_reject_answer",
        ApprovalResponseShape::RadioSelectAnswer => "radio_select_answer",
        ApprovalResponseShape::ApprovalDecisionV2 => "approval_decision_v2",
    }
}

impl From<FormResponse> for ApprovalResponse {
    fn from(resp: FormResponse) -> Self {
        Self(resp)
    }
}
