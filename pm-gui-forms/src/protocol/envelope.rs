//! FormRequest and FormResponse envelope types.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::answers::Answer;
use super::config::{TimeoutConfig, WindowConfig};
use super::questions::Question;
use super::refinement::RefinementSession;

/// Discriminator for which kind of form this is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FormType {
    Brainstorm,
    Approval,
}

/// Metadata shared across request and response envelopes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct FormMetadata {
    pub plan_id: String,
    pub workspace_id: String,
    pub session_id: String,
    pub agent: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// The inbound request sent from Supervisor → GUI on stdin.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct FormRequest {
    /// Always `"form_request"`.
    #[serde(rename = "type")]
    pub message_type: FormRequestTag,
    /// Protocol version (currently `1`).
    pub version: u32,
    /// Unique identifier for this request.
    pub request_id: Uuid,
    /// Which form variant.
    pub form_type: FormType,
    /// Contextual metadata.
    pub metadata: FormMetadata,
    /// Timeout configuration.
    pub timeout: TimeoutConfig,
    /// Window configuration.
    pub window: WindowConfig,
    /// Ordered list of questions to present.
    pub questions: Vec<Question>,
    /// Optional form-type-specific context (e.g. ApprovalStepContext for approval forms).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<serde_json::Value>,
}

/// Tag value that always serializes to `"form_request"`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FormRequestTag;

impl Serialize for FormRequestTag {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str("form_request")
    }
}

impl<'de> Deserialize<'de> for FormRequestTag {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        if s == "form_request" {
            Ok(FormRequestTag)
        } else {
            Err(serde::de::Error::custom(format!(
                "expected \"form_request\", got \"{}\"",
                s
            )))
        }
    }
}

/// Terminal status of a submitted (or timed-out / cancelled) form.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FormStatus {
    Completed,
    Cancelled,
    TimedOut,
    Deferred,
    RefinementRequested,
}

/// Metadata attached to a response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ResponseMetadata {
    pub plan_id: String,
    pub workspace_id: String,
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub duration_ms: u64,
    #[serde(default)]
    pub auto_filled_count: u32,
    /// How many refinement round-trips occurred before final submission.
    #[serde(default)]
    pub refinement_count: u32,
}

/// A user's feedback requesting re-evaluation of a specific question.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RefinementRequestEntry {
    pub question_id: String,
    pub feedback: String,
}

/// The outbound response sent from GUI → Supervisor on stdout.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct FormResponse {
    /// Always `"form_response"`.
    #[serde(rename = "type")]
    pub message_type: FormResponseTag,
    /// Protocol version (currently `1`).
    pub version: u32,
    /// Echoes [`FormRequest::request_id`].
    pub request_id: Uuid,
    /// Which form variant.
    pub form_type: FormType,
    /// Terminal status.
    pub status: FormStatus,
    /// Response metadata.
    pub metadata: ResponseMetadata,
    /// User's answers.
    pub answers: Vec<Answer>,
    /// Only present when `status == RefinementRequested`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub refinement_requests: Vec<RefinementRequestEntry>,
    /// Session tracking for refinement round-trips.
    /// Populated on final submission when one or more refinements occurred.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refinement_session: Option<RefinementSession>,
}

/// Tag value that always serializes to `"form_response"`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FormResponseTag;

impl Serialize for FormResponseTag {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str("form_response")
    }
}

impl<'de> Deserialize<'de> for FormResponseTag {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        if s == "form_response" {
            Ok(FormResponseTag)
        } else {
            Err(serde::de::Error::custom(format!(
                "expected \"form_response\", got \"{}\"",
                s
            )))
        }
    }
}
