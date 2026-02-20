//! Typed wrapper for approval-gate form requests and responses.
//!
//! Provides sensible defaults (60 s timeout, approve on timeout,
//! always-on-top, 500×350 window).

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::config::{FallbackMode, TimeoutAction, TimeoutConfig, WindowConfig};
use super::envelope::{
    FormMetadata, FormRequest, FormRequestTag, FormResponse, FormStatus, FormType,
};
use super::questions::Question;

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

// ── Builder ────────────────────────────────────────────────────

/// Builder / typed wrapper around [`FormRequest`] for approval-gate forms.
pub struct ApprovalRequest;

impl ApprovalRequest {
    /// Create a new approval-gate [`FormRequest`] with default settings.
    ///
    /// Defaults:
    /// - timeout: **60 s**, on-timeout: **approve**, fallback: **none**
    /// - window: **500×350**, **always-on-top**
    pub fn new(metadata: FormMetadata, questions: Vec<Question>) -> FormRequest {
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

    /// Create an approval-gate [`FormRequest`] with step context.
    ///
    /// The context is serialized as `serde_json::Value` into the
    /// [`FormRequest::context`] field for the QML dialog to render.
    pub fn with_context(
        metadata: FormMetadata,
        questions: Vec<Question>,
        step_context: ApprovalStepContext,
    ) -> FormRequest {
        let context = serde_json::to_value(&step_context).ok();
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
            context,
        }
    }
}

/// Typed wrapper around [`FormResponse`] for approval forms.
#[derive(Debug, Clone)]
pub struct ApprovalResponse(pub FormResponse);

impl ApprovalResponse {
    /// Unwrap into the inner [`FormResponse`].
    pub fn into_inner(self) -> FormResponse {
        self.0
    }

    /// Whether the approval was granted (completed or timed-out with auto-approve).
    pub fn is_approved(&self) -> bool {
        matches!(self.0.status, FormStatus::Completed | FormStatus::TimedOut)
    }

    /// Whether the user explicitly rejected.
    pub fn is_rejected(&self) -> bool {
        self.0.status == FormStatus::Cancelled
    }
}

impl From<FormResponse> for ApprovalResponse {
    fn from(resp: FormResponse) -> Self {
        Self(resp)
    }
}
