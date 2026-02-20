//! Integration tests for typed wrappers (BrainstormRequest, ApprovalRequest)
//! and the refinement protocol round-trip serialization.

use serde_json::Value;
use uuid::Uuid;

use pm_gui_forms::protocol::{
    Answer, AnswerValue, ApprovalRequest, ApprovalResponse, BrainstormRequest, BrainstormResponse,
    ConfirmRejectQuestion, CountdownTimerQuestion, FormMetadata, FormRefinementRequest,
    FormRefinementResponse, FormResponse, FormStatus, FormType, FreeTextQuestion, Question,
    RadioOption, RadioSelectQuestion, RefinementEntry, TimeoutAction, TimeoutConfig, WindowConfig,
};
use pm_gui_forms::protocol::{ConfirmRejectAction, TimerResult};
use pm_gui_forms::protocol::{FormResponseTag, ResponseMetadata};
use pm_gui_forms::protocol::{FormRefinementRequestTag, FormRefinementResponseTag};

// ── Helpers ──────────────────────────────────────────────────────

fn test_metadata() -> FormMetadata {
    FormMetadata {
        plan_id: "plan_test".into(),
        workspace_id: "ws_test".into(),
        session_id: "sess_test".into(),
        agent: "TestAgent".into(),
        title: "Test Form".into(),
        description: None,
    }
}

fn test_questions() -> Vec<Question> {
    vec![
        Question::RadioSelect(RadioSelectQuestion {
            id: "q1".into(),
            label: "Pick one".into(),
            description: None,
            required: true,
            options: vec![
                RadioOption {
                    id: "a".into(),
                    label: "Option A".into(),
                    description: None,
                    pros: vec![],
                    cons: vec![],
                    recommended: true,
                },
                RadioOption {
                    id: "b".into(),
                    label: "Option B".into(),
                    description: None,
                    pros: vec![],
                    cons: vec![],
                    recommended: false,
                },
            ],
            allow_free_text: false,
            free_text_placeholder: None,
        }),
        Question::FreeText(FreeTextQuestion {
            id: "q2".into(),
            label: "Notes".into(),
            description: None,
            required: false,
            placeholder: None,
            default_value: None,
            max_length: 2000,
        }),
    ]
}

fn mock_form_response(form_type: FormType, status: FormStatus) -> FormResponse {
    FormResponse {
        message_type: FormResponseTag,
        version: 1,
        request_id: Uuid::new_v4(),
        form_type,
        status,
        metadata: ResponseMetadata {
            plan_id: "plan_test".into(),
            workspace_id: "ws_test".into(),
            session_id: "sess_test".into(),
            completed_at: None,
            duration_ms: 5000,
            auto_filled_count: 0,
            refinement_count: 0,
        },
        answers: vec![],
        refinement_requests: vec![],
        refinement_session: None,
    }
}

// ── BrainstormRequest Tests ──────────────────────────────────────

#[test]
fn brainstorm_request_creates_correct_form_type() {
    let req = BrainstormRequest::new(test_metadata(), test_questions());
    assert_eq!(req.form_type, FormType::Brainstorm);
}

#[test]
fn brainstorm_request_has_protocol_version_1() {
    let req = BrainstormRequest::new(test_metadata(), test_questions());
    assert_eq!(req.version, 1);
}

#[test]
fn brainstorm_request_has_300s_timeout() {
    let req = BrainstormRequest::new(test_metadata(), test_questions());
    assert_eq!(req.timeout.duration_seconds, 300);
}

#[test]
fn brainstorm_request_timeout_action_is_auto_fill() {
    let req = BrainstormRequest::new(test_metadata(), test_questions());
    assert_eq!(req.timeout.on_timeout, TimeoutAction::AutoFill);
}

#[test]
fn brainstorm_request_fallback_is_chat() {
    let req = BrainstormRequest::new(test_metadata(), test_questions());
    assert_eq!(
        req.timeout.fallback_mode,
        pm_gui_forms::protocol::FallbackMode::Chat
    );
}

#[test]
fn brainstorm_request_window_not_always_on_top() {
    let req = BrainstormRequest::new(test_metadata(), test_questions());
    assert!(!req.window.always_on_top);
}

#[test]
fn brainstorm_request_window_size_900x700() {
    let req = BrainstormRequest::new(test_metadata(), test_questions());
    assert_eq!(req.window.width, 900);
    assert_eq!(req.window.height, 700);
}

#[test]
fn brainstorm_request_window_title() {
    let req = BrainstormRequest::new(test_metadata(), test_questions());
    assert_eq!(req.window.title, "Brainstorm");
}

#[test]
fn brainstorm_request_preserves_questions() {
    let questions = test_questions();
    let req = BrainstormRequest::new(test_metadata(), questions);
    assert_eq!(req.questions.len(), 2);
    match &req.questions[0] {
        Question::RadioSelect(rs) => assert_eq!(rs.id, "q1"),
        _ => panic!("Expected RadioSelect"),
    }
}

#[test]
fn brainstorm_request_preserves_metadata() {
    let req = BrainstormRequest::new(test_metadata(), test_questions());
    assert_eq!(req.metadata.plan_id, "plan_test");
    assert_eq!(req.metadata.agent, "TestAgent");
}

#[test]
fn brainstorm_request_serializes_to_valid_json() {
    let req = BrainstormRequest::new(test_metadata(), test_questions());
    let json_str = serde_json::to_string(&req).unwrap();
    let val: Value = serde_json::from_str(&json_str).unwrap();
    assert_eq!(val["type"], "form_request");
    assert_eq!(val["form_type"], "brainstorm");
}

// ── BrainstormResponse Tests ─────────────────────────────────────

#[test]
fn brainstorm_response_from_form_response() {
    let resp = mock_form_response(FormType::Brainstorm, FormStatus::Completed);
    let br: BrainstormResponse = resp.into();
    assert!(!br.is_refinement_requested());
}

#[test]
fn brainstorm_response_detects_refinement_requested() {
    let resp = mock_form_response(FormType::Brainstorm, FormStatus::RefinementRequested);
    let br: BrainstormResponse = resp.into();
    assert!(br.is_refinement_requested());
}

#[test]
fn brainstorm_response_into_inner() {
    let resp = mock_form_response(FormType::Brainstorm, FormStatus::Completed);
    let original_id = resp.request_id;
    let br: BrainstormResponse = resp.into();
    let inner = br.into_inner();
    assert_eq!(inner.request_id, original_id);
}

// ── ApprovalRequest Tests ────────────────────────────────────────

#[test]
fn approval_request_creates_correct_form_type() {
    let req = ApprovalRequest::new(test_metadata(), test_questions());
    assert_eq!(req.form_type, FormType::Approval);
}

#[test]
fn approval_request_has_60s_timeout() {
    let req = ApprovalRequest::new(test_metadata(), test_questions());
    assert_eq!(req.timeout.duration_seconds, 60);
}

#[test]
fn approval_request_timeout_action_is_approve() {
    let req = ApprovalRequest::new(test_metadata(), test_questions());
    assert_eq!(req.timeout.on_timeout, TimeoutAction::Approve);
}

#[test]
fn approval_request_fallback_is_none() {
    let req = ApprovalRequest::new(test_metadata(), test_questions());
    assert_eq!(
        req.timeout.fallback_mode,
        pm_gui_forms::protocol::FallbackMode::None
    );
}

#[test]
fn approval_request_window_always_on_top() {
    let req = ApprovalRequest::new(test_metadata(), test_questions());
    assert!(req.window.always_on_top);
}

#[test]
fn approval_request_window_size_500x350() {
    let req = ApprovalRequest::new(test_metadata(), test_questions());
    assert_eq!(req.window.width, 500);
    assert_eq!(req.window.height, 350);
}

#[test]
fn approval_request_window_title() {
    let req = ApprovalRequest::new(test_metadata(), test_questions());
    assert_eq!(req.window.title, "Approval Required");
}

// ── ApprovalResponse Tests ───────────────────────────────────────

#[test]
fn approval_response_completed_is_approved() {
    let resp = mock_form_response(FormType::Approval, FormStatus::Completed);
    let ar: ApprovalResponse = resp.into();
    assert!(ar.is_approved());
    assert!(!ar.is_rejected());
}

#[test]
fn approval_response_timed_out_is_approved() {
    let resp = mock_form_response(FormType::Approval, FormStatus::TimedOut);
    let ar: ApprovalResponse = resp.into();
    assert!(ar.is_approved(), "Timed-out approval should count as approved");
    assert!(!ar.is_rejected());
}

#[test]
fn approval_response_cancelled_is_rejected() {
    let resp = mock_form_response(FormType::Approval, FormStatus::Cancelled);
    let ar: ApprovalResponse = resp.into();
    assert!(ar.is_rejected());
    assert!(!ar.is_approved());
}

#[test]
fn approval_response_deferred_is_neither() {
    let resp = mock_form_response(FormType::Approval, FormStatus::Deferred);
    let ar: ApprovalResponse = resp.into();
    assert!(!ar.is_approved());
    assert!(!ar.is_rejected());
}

#[test]
fn approval_response_into_inner() {
    let resp = mock_form_response(FormType::Approval, FormStatus::Completed);
    let original_id = resp.request_id;
    let ar: ApprovalResponse = resp.into();
    let inner = ar.into_inner();
    assert_eq!(inner.request_id, original_id);
}

// ── Refinement Protocol Tests ────────────────────────────────────

#[test]
fn refinement_request_round_trip() {
    let original_id = Uuid::new_v4();
    let request_id = Uuid::new_v4();

    let req = FormRefinementRequest {
        message_type: FormRefinementRequestTag,
        version: 1,
        request_id,
        original_request_id: original_id,
        form_type: FormType::Brainstorm,
        question_ids: vec!["q1".into(), "q3".into()],
        user_feedback: vec![
            RefinementEntry {
                question_id: "q1".into(),
                feedback: "Need more options for caching".into(),
            },
            RefinementEntry {
                question_id: "q3".into(),
                feedback: "Too vague, be more specific".into(),
            },
        ],
        current_answers: vec![Answer {
            question_id: "q1".into(),
            value: AnswerValue::RadioSelectAnswer {
                selected: "opt_a".into(),
                free_text: None,
            },
            auto_filled: false,
            marked_for_refinement: true,
        }],
    };

    let json_str = serde_json::to_string_pretty(&req).unwrap();
    let parsed: FormRefinementRequest = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.version, 1);
    assert_eq!(parsed.request_id, request_id);
    assert_eq!(parsed.original_request_id, original_id);
    assert_eq!(parsed.form_type, FormType::Brainstorm);
    assert_eq!(parsed.question_ids.len(), 2);
    assert_eq!(parsed.user_feedback.len(), 2);
    assert_eq!(parsed.current_answers.len(), 1);
}

#[test]
fn refinement_request_type_tag() {
    let req = FormRefinementRequest {
        message_type: FormRefinementRequestTag,
        version: 1,
        request_id: Uuid::new_v4(),
        original_request_id: Uuid::new_v4(),
        form_type: FormType::Brainstorm,
        question_ids: vec![],
        user_feedback: vec![],
        current_answers: vec![],
    };
    let val: Value = serde_json::to_value(&req).unwrap();
    assert_eq!(val["type"], "form_refinement_request");
}

#[test]
fn refinement_request_tag_rejects_wrong_value() {
    let req = FormRefinementRequest {
        message_type: FormRefinementRequestTag,
        version: 1,
        request_id: Uuid::new_v4(),
        original_request_id: Uuid::new_v4(),
        form_type: FormType::Brainstorm,
        question_ids: vec![],
        user_feedback: vec![],
        current_answers: vec![],
    };
    let mut val: Value = serde_json::to_value(&req).unwrap();
    val["type"] = serde_json::json!("wrong");
    let result = serde_json::from_value::<FormRefinementRequest>(val);
    assert!(result.is_err());
}

#[test]
fn refinement_response_round_trip() {
    let request_id = Uuid::new_v4();
    let original_id = Uuid::new_v4();

    let resp = FormRefinementResponse {
        message_type: FormRefinementResponseTag,
        version: 1,
        request_id,
        original_request_id: original_id,
        updated_questions: vec![Question::FreeText(FreeTextQuestion {
            id: "q3".into(),
            label: "Refined: Describe caching strategy".into(),
            description: Some("Be specific about TTL and eviction".into()),
            required: true,
            placeholder: None,
            default_value: None,
            max_length: 2000,
        })],
    };

    let json_str = serde_json::to_string(&resp).unwrap();
    let parsed: FormRefinementResponse = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.request_id, request_id);
    assert_eq!(parsed.original_request_id, original_id);
    assert_eq!(parsed.updated_questions.len(), 1);
    match &parsed.updated_questions[0] {
        Question::FreeText(ft) => assert_eq!(ft.id, "q3"),
        _ => panic!("Expected FreeText question"),
    }
}

#[test]
fn refinement_response_type_tag() {
    let resp = FormRefinementResponse {
        message_type: FormRefinementResponseTag,
        version: 1,
        request_id: Uuid::new_v4(),
        original_request_id: Uuid::new_v4(),
        updated_questions: vec![],
    };
    let val: Value = serde_json::to_value(&resp).unwrap();
    assert_eq!(val["type"], "form_refinement_response");
}

#[test]
fn refinement_response_tag_rejects_wrong_value() {
    let resp = FormRefinementResponse {
        message_type: FormRefinementResponseTag,
        version: 1,
        request_id: Uuid::new_v4(),
        original_request_id: Uuid::new_v4(),
        updated_questions: vec![],
    };
    let mut val: Value = serde_json::to_value(&resp).unwrap();
    val["type"] = serde_json::json!("invalid");
    let result = serde_json::from_value::<FormRefinementResponse>(val);
    assert!(result.is_err());
}

#[test]
fn refinement_entry_round_trip() {
    let entry = RefinementEntry {
        question_id: "q_arch".into(),
        feedback: "Consider event-driven approach too".into(),
    };
    let json_str = serde_json::to_string(&entry).unwrap();
    let parsed: RefinementEntry = serde_json::from_str(&json_str).unwrap();
    assert_eq!(parsed.question_id, "q_arch");
    assert_eq!(parsed.feedback, "Consider event-driven approach too");
}

#[test]
fn refinement_request_with_multiple_answers_snapshot() {
    let req = FormRefinementRequest {
        message_type: FormRefinementRequestTag,
        version: 1,
        request_id: Uuid::new_v4(),
        original_request_id: Uuid::new_v4(),
        form_type: FormType::Brainstorm,
        question_ids: vec!["q1".into()],
        user_feedback: vec![RefinementEntry {
            question_id: "q1".into(),
            feedback: "Reconsider".into(),
        }],
        current_answers: vec![
            Answer {
                question_id: "q1".into(),
                value: AnswerValue::RadioSelectAnswer {
                    selected: "opt_a".into(),
                    free_text: None,
                },
                auto_filled: false,
                marked_for_refinement: true,
            },
            Answer {
                question_id: "q2".into(),
                value: AnswerValue::FreeTextAnswer {
                    value: "Some notes".into(),
                },
                auto_filled: false,
                marked_for_refinement: false,
            },
            Answer {
                question_id: "q3".into(),
                value: AnswerValue::ConfirmRejectAnswer {
                    action: ConfirmRejectAction::Approve,
                    notes: None,
                },
                auto_filled: true,
                marked_for_refinement: false,
            },
        ],
    };

    let json_str = serde_json::to_string(&req).unwrap();
    let parsed: FormRefinementRequest = serde_json::from_str(&json_str).unwrap();
    assert_eq!(parsed.current_answers.len(), 3);
    assert!(parsed.current_answers[2].auto_filled);
}
