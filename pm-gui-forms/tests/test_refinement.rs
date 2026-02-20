//! Tests for Phase 5 Round-Trip Refinement protocol types:
//! QuestionDiff, RefinementSession, FormRefinementRequest,
//! FormRefinementResponse, and FormResponse.refinement_session embedding.

use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

use pm_gui_forms::protocol::{
    FormResponse, FormStatus, FormType, Question, ResponseMetadata, RefinementSession, QuestionDiff,
    FormRefinementRequest, FormRefinementResponse, RefinementEntry,
};
use pm_gui_forms::protocol::FormResponseTag;

// Note: FormRefinementRequestTag / FormRefinementResponseTag are not part of the
// public re-export surface.  Tests that need a populated FormRefinementRequest or
// FormRefinementResponse construct them via JSON deserialization (which is also the
// realistic production path) rather than struct literals.

// ── Helpers ──────────────────────────────────────────────────────

fn sample_json_options() -> Vec<serde_json::Value> {
    vec![
        json!({ "id": "opt_a", "label": "Option A", "recommended": false }),
        json!({ "id": "opt_b", "label": "Option B", "recommended": true }),
    ]
}

fn sample_question_diff(question_id: &str) -> QuestionDiff {
    QuestionDiff {
        question_id: question_id.into(),
        original_options: sample_json_options(),
        refined_options: vec![
            json!({ "id": "opt_a", "label": "Option A (revised)", "recommended": true }),
            json!({ "id": "opt_c", "label": "Option C (new)", "recommended": false }),
        ],
        refined_at: Utc::now(),
    }
}

fn sample_refinement_session(rounds: u32) -> RefinementSession {
    let diffs: Vec<QuestionDiff> = (0..rounds)
        .map(|i| sample_question_diff(&format!("q_{i}")))
        .collect();
    RefinementSession {
        round_trip_count: rounds,
        question_diffs: diffs,
        started_at: Utc::now(),
        last_refined_at: if rounds > 0 { Some(Utc::now()) } else { None },
    }
}

fn sample_response_metadata(refinement_count: u32) -> ResponseMetadata {
    ResponseMetadata {
        plan_id: "plan_abc".into(),
        workspace_id: "ws_xyz".into(),
        session_id: "sess_001".into(),
        completed_at: Some(Utc::now()),
        duration_ms: 9000,
        auto_filled_count: 0,
        refinement_count,
    }
}

fn sample_form_response(refinement_session: Option<RefinementSession>) -> FormResponse {
    FormResponse {
        message_type: FormResponseTag,
        version: 1,
        request_id: Uuid::new_v4(),
        form_type: FormType::Brainstorm,
        status: FormStatus::Completed,
        metadata: sample_response_metadata(
            refinement_session.as_ref().map_or(0, |s| s.round_trip_count),
        ),
        answers: vec![],
        refinement_requests: vec![],
        refinement_session,
    }
}

/// Construct a FormRefinementRequest through JSON deserialization.
/// Tag types are pub(crate) and not accessible from integration tests;
/// JSON deserialization is the correct external path.
fn make_refinement_request_json(
    original_request_id: &str,
    question_ids: &[&str],
) -> FormRefinementRequest {
    serde_json::from_value(json!({
        "type": "form_refinement_request",
        "version": 1,
        "request_id": "11111111-2222-3333-4444-555555555555",
        "original_request_id": original_request_id,
        "form_type": "brainstorm",
        "question_ids": question_ids,
        "user_feedback": question_ids.iter().map(|id| json!({
            "question_id": id,
            "feedback": "Please revise this question"
        })).collect::<Vec<_>>(),
        "current_answers": []
    }))
    .expect("make_refinement_request_json: JSON should parse")
}

/// Construct a FormRefinementResponse through JSON deserialization.
fn make_refinement_response_json(
    request_id: &str,
    original_request_id: &str,
) -> FormRefinementResponse {
    serde_json::from_value(json!({
        "type": "form_refinement_response",
        "version": 1,
        "request_id": request_id,
        "original_request_id": original_request_id,
        "updated_questions": []
    }))
    .expect("make_refinement_response_json: JSON should parse")
}


// ═══════════════════════════════════════════════════════════════════
// QuestionDiff
// ═══════════════════════════════════════════════════════════════════

#[test]
fn question_diff_round_trip_json() {
    let diff = sample_question_diff("q_arch");
    let json_str = serde_json::to_string(&diff).unwrap();
    let parsed: QuestionDiff = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.question_id, "q_arch");
    assert_eq!(parsed.original_options.len(), 2);
    assert_eq!(parsed.refined_options.len(), 2);
}

#[test]
fn question_diff_captures_original_vs_refined_options() {
    let diff = QuestionDiff {
        question_id: "q_test".into(),
        original_options: vec![json!({ "id": "orig_1", "label": "Original Option" })],
        refined_options: vec![json!({ "id": "refined_1", "label": "Refined Option" })],
        refined_at: Utc::now(),
    };

    let val: Value = serde_json::to_value(&diff).unwrap();

    let original = &val["original_options"][0];
    let refined = &val["refined_options"][0];

    assert_eq!(original["id"], "orig_1");
    assert_eq!(original["label"], "Original Option");
    assert_eq!(refined["id"], "refined_1");
    assert_eq!(refined["label"], "Refined Option");
}

#[test]
fn question_diff_original_and_refined_can_differ_in_count() {
    // Refinement can add or remove options
    let diff = QuestionDiff {
        question_id: "q_multi".into(),
        original_options: vec![
            json!({ "id": "a", "label": "A" }),
            json!({ "id": "b", "label": "B" }),
        ],
        refined_options: vec![
            json!({ "id": "a", "label": "A (revised)" }),
            json!({ "id": "b", "label": "B (revised)" }),
            json!({ "id": "c", "label": "C (new)" }),
        ],
        refined_at: Utc::now(),
    };

    let json_str = serde_json::to_string(&diff).unwrap();
    let parsed: QuestionDiff = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.original_options.len(), 2);
    assert_eq!(parsed.refined_options.len(), 3);
    assert_eq!(parsed.refined_options[2]["id"], "c");
}

#[test]
fn question_diff_refined_at_is_iso8601_string() {
    let diff = sample_question_diff("q1");
    let val: Value = serde_json::to_value(&diff).unwrap();

    assert!(val["refined_at"].is_string(), "refined_at should serialize as a string");
    let ts = val["refined_at"].as_str().unwrap();
    // RFC 3339 / ISO 8601 timestamps contain 'T'
    assert!(ts.contains('T'), "expected ISO 8601 format, got '{ts}'");
}

#[test]
fn question_diff_snake_case_field_names() {
    let diff = sample_question_diff("q_snake");
    let val: Value = serde_json::to_value(&diff).unwrap();

    assert!(val.get("question_id").is_some());
    assert!(val.get("original_options").is_some());
    assert!(val.get("refined_options").is_some());
    assert!(val.get("refined_at").is_some());
    // camelCase variants must not appear
    assert!(val.get("questionId").is_none());
    assert!(val.get("originalOptions").is_none());
}

// ═══════════════════════════════════════════════════════════════════
// RefinementSession — accumulation
// ═══════════════════════════════════════════════════════════════════

#[test]
fn refinement_session_zero_rounds_round_trip() {
    let session = RefinementSession {
        round_trip_count: 0,
        question_diffs: vec![],
        started_at: Utc::now(),
        last_refined_at: None,
    };

    let json_str = serde_json::to_string(&session).unwrap();
    let parsed: RefinementSession = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.round_trip_count, 0);
    assert!(parsed.question_diffs.is_empty());
    assert!(parsed.last_refined_at.is_none());
}

#[test]
fn refinement_session_last_refined_at_absent_when_none() {
    let session = RefinementSession {
        round_trip_count: 0,
        question_diffs: vec![],
        started_at: Utc::now(),
        last_refined_at: None,
    };

    let val: Value = serde_json::to_value(&session).unwrap();
    assert!(
        val.get("last_refined_at").is_none(),
        "last_refined_at should be absent when None (skip_serializing_if)"
    );
}

#[test]
fn refinement_session_one_round() {
    let session = sample_refinement_session(1);
    let json_str = serde_json::to_string(&session).unwrap();
    let parsed: RefinementSession = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.round_trip_count, 1);
    assert_eq!(parsed.question_diffs.len(), 1);
    assert_eq!(parsed.question_diffs[0].question_id, "q_0");
    assert!(parsed.last_refined_at.is_some());
}

#[test]
fn refinement_session_three_rounds_accumulate_all_diffs() {
    let session = sample_refinement_session(3);
    let json_str = serde_json::to_string(&session).unwrap();
    let parsed: RefinementSession = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.round_trip_count, 3);
    assert_eq!(parsed.question_diffs.len(), 3);

    // Each diff corresponds to a distinct question
    let ids: Vec<&str> = parsed
        .question_diffs
        .iter()
        .map(|d| d.question_id.as_str())
        .collect();
    assert_eq!(ids, vec!["q_0", "q_1", "q_2"]);
}

#[test]
fn refinement_session_last_refined_at_present_when_some() {
    let session = sample_refinement_session(2);
    let val: Value = serde_json::to_value(&session).unwrap();

    assert!(
        val.get("last_refined_at").is_some(),
        "last_refined_at should be present when Some"
    );
    let ts = val["last_refined_at"].as_str().unwrap();
    assert!(ts.contains('T'));
}

#[test]
fn refinement_session_five_rounds() {
    let session = sample_refinement_session(5);
    let json_str = serde_json::to_string(&session).unwrap();
    let parsed: RefinementSession = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.round_trip_count, 5);
    assert_eq!(parsed.question_diffs.len(), 5);
    assert!(parsed.last_refined_at.is_some());
}

#[test]
fn refinement_session_field_names_are_snake_case() {
    let session = sample_refinement_session(1);
    let val: Value = serde_json::to_value(&session).unwrap();

    assert!(val.get("round_trip_count").is_some());
    assert!(val.get("question_diffs").is_some());
    assert!(val.get("started_at").is_some());
    assert!(val.get("roundTripCount").is_none());
    assert!(val.get("questionDiffs").is_none());
}

// ═══════════════════════════════════════════════════════════════════
// FormResponse.refinement_session embedding
// ═══════════════════════════════════════════════════════════════════

#[test]
fn form_response_without_refinement_session_omits_field() {
    let response = sample_form_response(None);
    let val: Value = serde_json::to_value(&response).unwrap();

    assert!(
        val.get("refinement_session").is_none(),
        "refinement_session should be absent when None (skip_serializing_if)"
    );
}

#[test]
fn form_response_with_refinement_session_round_trip() {
    let session = sample_refinement_session(2);
    let response = sample_form_response(Some(session));

    let json_str = serde_json::to_string(&response).unwrap();
    let parsed: FormResponse = serde_json::from_str(&json_str).unwrap();

    let embedded = parsed
        .refinement_session
        .expect("refinement_session should be Some after round-trip");
    assert_eq!(embedded.round_trip_count, 2);
    assert_eq!(embedded.question_diffs.len(), 2);
}

#[test]
fn form_response_refinement_count_in_metadata_matches_session() {
    let session = sample_refinement_session(3);
    let response = sample_form_response(Some(session));

    // In-memory: metadata.refinement_count matches session round_trip_count
    assert_eq!(response.metadata.refinement_count, 3);

    // After serialization: both values survive the round-trip
    let json_str = serde_json::to_string(&response).unwrap();
    let val: Value = serde_json::from_str(&json_str).unwrap();
    assert_eq!(val["metadata"]["refinement_count"], 3);
}

#[test]
fn form_response_zero_refinements_metadata_count_is_zero() {
    let response = sample_form_response(None);
    assert_eq!(response.metadata.refinement_count, 0);

    let val: Value = serde_json::to_value(&response).unwrap();
    // refinement_count=0 serializes with #[serde(default)], so it may be present as 0
    let count = val["metadata"].get("refinement_count").and_then(|v| v.as_u64()).unwrap_or(0);
    assert_eq!(count, 0);
}

#[test]
fn form_response_refinement_session_contains_correct_question_ids() {
    let diffs = vec![
        QuestionDiff {
            question_id: "q_arch".into(),
            original_options: sample_json_options(),
            refined_options: sample_json_options(),
            refined_at: Utc::now(),
        },
        QuestionDiff {
            question_id: "q_approach".into(),
            original_options: vec![json!({ "id": "simple", "label": "Simple" })],
            refined_options: vec![json!({ "id": "simple", "label": "Simple (revised)" })],
            refined_at: Utc::now(),
        },
    ];
    let session = RefinementSession {
        round_trip_count: 2,
        question_diffs: diffs,
        started_at: Utc::now(),
        last_refined_at: Some(Utc::now()),
    };
    let response = sample_form_response(Some(session));

    let json_str = serde_json::to_string(&response).unwrap();
    let parsed: FormResponse = serde_json::from_str(&json_str).unwrap();

    let embedded = parsed.refinement_session.unwrap();
    let ids: Vec<&str> = embedded
        .question_diffs
        .iter()
        .map(|d| d.question_id.as_str())
        .collect();
    assert_eq!(ids, vec!["q_arch", "q_approach"]);
}

// ═══════════════════════════════════════════════════════════════════
// ResponseMetadata.refinement_count — backward compat
// ═══════════════════════════════════════════════════════════════════

#[test]
fn response_metadata_refinement_count_defaults_to_zero_when_absent() {
    // Old payloads (pre-Phase-5) omit refinement_count; it should default to 0
    let json_without_refinement_count = r#"{
        "plan_id": "plan_legacy",
        "workspace_id": "ws_legacy",
        "session_id": "sess_legacy",
        "duration_ms": 0,
        "auto_filled_count": 0
    }"#;
    let meta: ResponseMetadata = serde_json::from_str(json_without_refinement_count).unwrap();
    assert_eq!(meta.refinement_count, 0);
}

#[test]
fn response_metadata_refinement_count_survives_round_trip() {
    let meta = sample_response_metadata(4);
    let json_str = serde_json::to_string(&meta).unwrap();
    let parsed: ResponseMetadata = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.refinement_count, 4);
}

// ═══════════════════════════════════════════════════════════════════
// FormRefinementRequest — tag and serialization
// ═══════════════════════════════════════════════════════════════════

#[test]
fn form_refinement_request_tag_serializes_to_correct_string() {
    let req = make_refinement_request_json(
        "550e8400-e29b-41d4-a716-446655440000",
        &["q_arch"],
    );
    let val: Value = serde_json::to_value(&req).unwrap();
    assert_eq!(val["type"], "form_refinement_request");
}

#[test]
fn form_refinement_request_wrong_tag_is_rejected() {
    let req = make_refinement_request_json(
        "550e8400-e29b-41d4-a716-446655440000",
        &[],
    );
    let mut val: Value = serde_json::to_value(&req).unwrap();
    val["type"] = json!("form_request"); // wrong tag
    let result = serde_json::from_value::<FormRefinementRequest>(val);
    assert!(
        result.is_err(),
        "should reject wrong type tag 'form_request'"
    );
}

#[test]
fn form_refinement_request_round_trip_preserves_all_fields() {
    let orig_id = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    let req = make_refinement_request_json(orig_id, &["q1", "q2"]);

    let json_str = serde_json::to_string(&req).unwrap();
    let parsed: FormRefinementRequest = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.version, 1);
    assert_eq!(parsed.original_request_id.to_string(), orig_id);
    assert_eq!(parsed.form_type, FormType::Brainstorm);
    assert_eq!(parsed.question_ids, vec!["q1", "q2"]);
    assert_eq!(parsed.user_feedback.len(), 2);
    assert_eq!(parsed.user_feedback[0].feedback, "Please revise this question");
}

#[test]
fn form_refinement_request_form_type_is_brainstorm() {
    let req = make_refinement_request_json(
        "550e8400-e29b-41d4-a716-446655440000",
        &["q_arch"],
    );
    let val: Value = serde_json::to_value(&req).unwrap();
    assert_eq!(val["form_type"], "brainstorm");
}

#[test]
fn form_refinement_request_user_feedback_entries_round_trip() {
    let req = make_refinement_request_json(
        "550e8400-e29b-41d4-a716-446655440000",
        &["q_arch", "q_approach"],
    );

    let json_str = serde_json::to_string(&req).unwrap();
    let parsed: FormRefinementRequest = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.user_feedback.len(), 2);
    assert_eq!(parsed.user_feedback[0].question_id, "q_arch");
    assert_eq!(
        parsed.user_feedback[0].feedback,
        "Please revise this question"
    );
}

#[test]
fn form_refinement_request_empty_fields_allowed() {
    let req = make_refinement_request_json(
        "00000000-0000-0000-0000-000000000001",
        &[],
    );

    let json_str = serde_json::to_string(&req).unwrap();
    let parsed: FormRefinementRequest = serde_json::from_str(&json_str).unwrap();

    assert!(parsed.question_ids.is_empty());
    assert!(parsed.user_feedback.is_empty());
    assert!(parsed.current_answers.is_empty());
}

// ═══════════════════════════════════════════════════════════════════
// FormRefinementResponse — tag and serialization
// ═══════════════════════════════════════════════════════════════════

#[test]
fn form_refinement_response_tag_serializes_to_correct_string() {
    let resp = make_refinement_response_json(
        "11111111-2222-3333-4444-555555555555",
        "550e8400-e29b-41d4-a716-446655440000",
    );
    let val: Value = serde_json::to_value(&resp).unwrap();
    assert_eq!(val["type"], "form_refinement_response");
}

#[test]
fn form_refinement_response_wrong_tag_is_rejected() {
    let resp = make_refinement_response_json(
        "11111111-2222-3333-4444-555555555555",
        "550e8400-e29b-41d4-a716-446655440000",
    );
    let mut val: Value = serde_json::to_value(&resp).unwrap();
    val["type"] = json!("form_response"); // wrong tag
    let result = serde_json::from_value::<FormRefinementResponse>(val);
    assert!(
        result.is_err(),
        "should reject wrong type tag 'form_response'"
    );
}

#[test]
fn form_refinement_response_round_trip_empty_questions() {
    let req_id = "11111111-2222-3333-4444-555555555555";
    let orig_id = "550e8400-e29b-41d4-a716-446655440000";

    let resp = make_refinement_response_json(req_id, orig_id);
    let json_str = serde_json::to_string(&resp).unwrap();
    let parsed: FormRefinementResponse = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.request_id.to_string(), req_id);
    assert_eq!(parsed.original_request_id.to_string(), orig_id);
    assert!(parsed.updated_questions.is_empty());
}

#[test]
fn form_refinement_response_round_trip_with_updated_questions() {
    let resp: FormRefinementResponse = serde_json::from_value(json!({
        "type": "form_refinement_response",
        "version": 1,
        "request_id": "11111111-2222-3333-4444-555555555555",
        "original_request_id": "550e8400-e29b-41d4-a716-446655440000",
        "updated_questions": [
            {
                "type": "radio_select",
                "id": "q_arch",
                "label": "Choose architecture (refined)",
                "required": true,
                "options": [
                    { "id": "opt_mono", "label": "Monolith (updated)", "recommended": true },
                    { "id": "opt_event", "label": "Event-driven (new)", "recommended": false }
                ],
                "allow_free_text": false
            }
        ]
    }))
    .unwrap();

    let json_str = serde_json::to_string(&resp).unwrap();
    let parsed: FormRefinementResponse = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.updated_questions.len(), 1);
    match &parsed.updated_questions[0] {
        Question::RadioSelect(rs) => {
            assert_eq!(rs.id, "q_arch");
            assert_eq!(rs.label, "Choose architecture (refined)");
            assert_eq!(rs.options.len(), 2);
            assert!(rs.options[0].recommended);
        }
        _ => panic!("Expected RadioSelect variant after round-trip"),
    }
}

#[test]
fn form_refinement_response_multiple_updated_questions() {
    let resp: FormRefinementResponse = serde_json::from_value(json!({
        "type": "form_refinement_response",
        "version": 1,
        "request_id": "11111111-2222-3333-4444-555555555555",
        "original_request_id": "550e8400-e29b-41d4-a716-446655440000",
        "updated_questions": [
            {
                "type": "radio_select",
                "id": "q_arch",
                "label": "Architecture",
                "required": true,
                "options": [{ "id": "opt_a", "label": "A", "recommended": true }],
                "allow_free_text": false
            },
            {
                "type": "radio_select",
                "id": "q_approach",
                "label": "Approach",
                "required": true,
                "options": [{ "id": "opt_tdd", "label": "TDD", "recommended": true }],
                "allow_free_text": false
            }
        ]
    }))
    .unwrap();

    let json_str = serde_json::to_string(&resp).unwrap();
    let parsed: FormRefinementResponse = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.updated_questions.len(), 2);
    match &parsed.updated_questions[1] {
        Question::RadioSelect(rs) => assert_eq!(rs.id, "q_approach"),
        _ => panic!("Expected RadioSelect"),
    }
}

#[test]
fn form_refinement_request_id_correlates_to_original_response_request_id() {
    // The refinement response.request_id should echo the refinement request.request_id,
    // and both share the same original_request_id (the original form's request_id).
    let orig_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    let refine_req_id = "11111111-2222-3333-4444-555555555555";

    let refinement_req = make_refinement_request_json(orig_id, &["q_arch"]);
    let refinement_resp = make_refinement_response_json(refine_req_id, orig_id);

    assert_eq!(refinement_resp.request_id.to_string(), refine_req_id);
    assert_eq!(refinement_req.request_id.to_string(), refine_req_id);
    assert_eq!(
        refinement_resp.original_request_id,
        refinement_req.original_request_id
    );
}

// ═══════════════════════════════════════════════════════════════════
// RefinementEntry
// ═══════════════════════════════════════════════════════════════════

#[test]
fn refinement_entry_round_trip() {
    let entry = RefinementEntry {
        question_id: "q_database".into(),
        feedback: "Consider adding a NoSQL option".into(),
    };

    let json_str = serde_json::to_string(&entry).unwrap();
    let parsed: RefinementEntry = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.question_id, "q_database");
    assert_eq!(parsed.feedback, "Consider adding a NoSQL option");
}

#[test]
fn refinement_entry_snake_case_fields() {
    let entry = RefinementEntry {
        question_id: "q_1".into(),
        feedback: "test".into(),
    };
    let val: Value = serde_json::to_value(&entry).unwrap();
    assert!(val.get("question_id").is_some());
    assert!(val.get("feedback").is_some());
    assert!(val.get("questionId").is_none());
}
