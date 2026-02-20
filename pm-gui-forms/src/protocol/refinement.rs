//! Refinement protocol for round-trip question updates (brainstorm only).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::answers::Answer;
use super::envelope::FormType;
use super::questions::Question;

/// A single refinement entry mapping a question to user feedback.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RefinementEntry {
    pub question_id: String,
    pub feedback: String,
}

/// Request from Supervisor → Brainstorm agent for re-evaluation.
///
/// Constructed by the GUI when the user marks questions for refinement
/// and clicks "Request Refinement". The Supervisor forwards this to the
/// Brainstorm agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct FormRefinementRequest {
    /// Always `"form_refinement_request"`.
    #[serde(rename = "type")]
    pub message_type: FormRefinementRequestTag,
    /// Protocol version.
    pub version: u32,
    /// Unique ID for this refinement request.
    pub request_id: Uuid,
    /// The `request_id` of the original [`FormRequest`](super::FormRequest).
    pub original_request_id: Uuid,
    /// Always `brainstorm` for refinement.
    pub form_type: FormType,
    /// IDs of questions the user wants re-evaluated.
    pub question_ids: Vec<String>,
    /// Per-question user feedback.
    pub user_feedback: Vec<RefinementEntry>,
    /// Snapshot of all current answers at time of refinement request.
    pub current_answers: Vec<Answer>,
}

/// Response from Brainstorm agent with updated questions.
///
/// Sent back through Supervisor → GUI on stdin. The GUI replaces
/// the matching questions and re-renders.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct FormRefinementResponse {
    /// Always `"form_refinement_response"`.
    #[serde(rename = "type")]
    pub message_type: FormRefinementResponseTag,
    /// Protocol version.
    pub version: u32,
    /// Matches [`FormRefinementRequest::request_id`].
    pub request_id: Uuid,
    /// The original form request ID.
    pub original_request_id: Uuid,
    /// Replacement questions (only those that were refined).
    pub updated_questions: Vec<Question>,
}

// ── Tag types ────────────────────────────────────────────────────

/// Tag that always serializes to `"form_refinement_request"`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FormRefinementRequestTag;

impl Serialize for FormRefinementRequestTag {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str("form_refinement_request")
    }
}

impl<'de> Deserialize<'de> for FormRefinementRequestTag {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        if s == "form_refinement_request" {
            Ok(FormRefinementRequestTag)
        } else {
            Err(serde::de::Error::custom(format!(
                "expected \"form_refinement_request\", got \"{s}\""
            )))
        }
    }
}

/// Tag that always serializes to `"form_refinement_response"`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FormRefinementResponseTag;

impl Serialize for FormRefinementResponseTag {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str("form_refinement_response")
    }
}

impl<'de> Deserialize<'de> for FormRefinementResponseTag {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        if s == "form_refinement_response" {
            Ok(FormRefinementResponseTag)
        } else {
            Err(serde::de::Error::custom(format!(
                "expected \"form_refinement_response\", got \"{s}\""
            )))
        }
    }
}
// ── Refinement session tracking ──────────────────────────────────────────

/// Records the difference between original and refined options for a single question.
///
/// Stored in [`RefinementSession`] so the server can trace what changed across
/// each round-trip.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct QuestionDiff {
    /// The ID of the question that was refined.
    pub question_id: String,
    /// The original options/content before refinement (serialised as generic JSON
    /// to support any question type's field layout).
    pub original_options: Vec<serde_json::Value>,
    /// The replacement options/content after refinement.
    pub refined_options: Vec<serde_json::Value>,
    /// UTC timestamp when this refinement round-trip completed.
    pub refined_at: DateTime<Utc>,
}

/// Tracks the full history of refinement round-trips for a single form session.
///
/// Attached to the final [`FormResponse`](super::FormResponse) when a form is
/// submitted after one or more refinements so the server can inspect what was
/// changed and how many cycles were needed.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RefinementSession {
    /// Total number of completed refinement round-trips.
    pub round_trip_count: u32,
    /// Per-question diff records (one entry per (question, round-trip) pair).
    pub question_diffs: Vec<QuestionDiff>,
    /// UTC timestamp of the first refinement request.
    pub started_at: DateTime<Utc>,
    /// UTC timestamp of the most recent completed refinement.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_refined_at: Option<DateTime<Utc>>,
}