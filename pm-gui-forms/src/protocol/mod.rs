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

pub use answers::{Answer, AnswerValue};
pub use approval::{ApprovalRequest, ApprovalResponse, ApprovalStepContext, ApprovalUrgency};
pub use brainstorm::{BrainstormRequest, BrainstormResponse};
pub use config::{FallbackMode, TimeoutAction, TimeoutConfig, WindowConfig};
pub use envelope::{FormMetadata, FormRequest, FormResponse, FormResponseTag, FormStatus, FormType, ResponseMetadata, RefinementRequestEntry};
pub use questions::{
    ConfirmRejectQuestion, CountdownTimerQuestion, FreeTextQuestion, Question,
    RadioOption, RadioSelectQuestion,
};
pub use refinement::{FormRefinementRequest, FormRefinementResponse, RefinementEntry, RefinementSession, QuestionDiff};
