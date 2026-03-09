//! Protocol types for the FormRequest/FormResponse wire protocol.
//!
//! All types use `#[serde(rename_all = "snake_case")]` and tag-based
//! discrimination so they serialize to clean JSON understood by both
//! Rust consumers and the Supervisor's Node.js layer.

pub(crate) mod answers;
mod approval;
mod brainstorm;
pub(crate) mod config;
pub(crate) mod envelope;
pub(crate) mod questions;
pub(crate) mod refinement;

pub use answers::{
    Answer, AnswerValue, ApprovalAnswerValidationError, ApprovalAnswerValidationFailure,
    ApprovalDecisionPayloadV2, ApprovalDecisionState, ApprovalSessionItemDecisionV2,
    ConfirmRejectAction, TimerResult,
};
pub use approval::{
    ApprovalDecisionResolution, ApprovalFailureReason, ApprovalProtocolValidationError,
    ApprovalProtocolValidationFailure, ApprovalRequest, ApprovalRequestContextV2,
    ApprovalResponse, ApprovalRoutingOutcome, ApprovalStepContext, ApprovalUrgency,
};
pub use brainstorm::{BrainstormRequest, BrainstormResponse};
pub use config::{FallbackMode, TimeoutAction, TimeoutConfig, WindowConfig};
pub use envelope::{
    ApprovalContractV2, ApprovalMode, ApprovalRequestShape, ApprovalResponseShape,
    ApprovalSessionContract, FormMetadata, FormRequest, FormRequestTag, FormResponse,
    FormResponseTag, FormStatus, FormType, RefinementRequestEntry, ResponseMetadata,
};
pub use questions::{
    ApprovalQuestionItem, ApprovalQuestionSetV2, ApprovalQuestionValidationError,
    ApprovalQuestionValidationFailure, ConfirmRejectQuestion, CountdownTimerQuestion,
    FreeTextQuestion, Question, RadioOption, RadioSelectQuestion,
};
pub use refinement::{FormRefinementRequest, FormRefinementRequestTag, FormRefinementResponse, FormRefinementResponseTag, RefinementEntry, RefinementSession, QuestionDiff};
