//! Typed wrapper for brainstorm form requests and responses.
//!
//! Provides sensible defaults (300 s timeout, auto-fill, 900×700 window).

use uuid::Uuid;

use super::config::{FallbackMode, TimeoutAction, TimeoutConfig, WindowConfig};
use super::envelope::{
    FormMetadata, FormRequest, FormRequestTag, FormResponse, FormType,
};
use super::questions::Question;

/// Builder / typed wrapper around [`FormRequest`] for brainstorm forms.
pub struct BrainstormRequest;

impl BrainstormRequest {
    /// Create a new brainstorm [`FormRequest`] with default brainstorm settings.
    ///
    /// Defaults:
    /// - timeout: **300 s**, on-timeout: **auto-fill**, fallback: **chat**
    /// - window: **900×700**, not always-on-top
    pub fn new(metadata: FormMetadata, questions: Vec<Question>) -> FormRequest {
        FormRequest {
            message_type: FormRequestTag,
            version: 1,
            request_id: Uuid::new_v4(),
            form_type: FormType::Brainstorm,
            metadata,
            timeout: TimeoutConfig {
                duration_seconds: 300,
                on_timeout: TimeoutAction::AutoFill,
                fallback_mode: FallbackMode::Chat,
            },
            window: WindowConfig {
                always_on_top: false,
                width: 900,
                height: 700,
                title: "Brainstorm".to_string(),
            },
            questions,
            context: None,
        }
    }
}

/// Typed wrapper around [`FormResponse`] for brainstorm forms.
///
/// Currently a transparent newtype — exists for documentation clarity
/// and future brainstorm-specific helpers.
#[derive(Debug, Clone)]
pub struct BrainstormResponse(pub FormResponse);

impl BrainstormResponse {
    /// Unwrap into the inner [`FormResponse`].
    pub fn into_inner(self) -> FormResponse {
        self.0
    }

    /// Whether the user requested refinement.
    pub fn is_refinement_requested(&self) -> bool {
        self.0.status == super::envelope::FormStatus::RefinementRequested
    }
}

impl From<FormResponse> for BrainstormResponse {
    fn from(resp: FormResponse) -> Self {
        Self(resp)
    }
}
