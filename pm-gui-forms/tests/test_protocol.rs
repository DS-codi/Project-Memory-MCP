//! Integration tests for FormRequest / FormResponse payload parsing and
//! response serialization, covering all 4 question types and answer variants.

use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

use pm_gui_forms::protocol::{
    Answer, AnswerValue, ConfirmRejectQuestion, CountdownTimerQuestion, FormMetadata,
    FormRequest, FormResponse, FormStatus, FormType, FreeTextQuestion, Question, RadioOption,
    RadioSelectQuestion, ResponseMetadata, TimeoutAction, TimeoutConfig, WindowConfig,
};
use pm_gui_forms::protocol::{ConfirmRejectAction, TimerResult};
use pm_gui_forms::protocol::{FormRequestTag, FormResponseTag, RefinementRequestEntry};

// ── Helpers ──────────────────────────────────────────────────────

fn sample_metadata() -> FormMetadata {
    FormMetadata {
        plan_id: "plan_abc123".into(),
        workspace_id: "ws_xyz".into(),
        session_id: "sess_001".into(),
        agent: "Brainstorm".into(),
        title: "Architecture Decision".into(),
        description: Some("Choose the right architecture".into()),
    }
}

fn sample_timeout() -> TimeoutConfig {
    TimeoutConfig {
        duration_seconds: 120,
        on_timeout: TimeoutAction::AutoFill,
        fallback_mode: pm_gui_forms::protocol::FallbackMode::Chat,
    }
}

fn sample_window() -> WindowConfig {
    WindowConfig {
        always_on_top: false,
        width: 900,
        height: 700,
        title: "Test Window".into(),
    }
}

fn sample_radio_question() -> Question {
    Question::RadioSelect(RadioSelectQuestion {
        id: "q_arch".into(),
        label: "Select architecture".into(),
        description: Some("Pick one approach".into()),
        required: true,
        options: vec![
            RadioOption {
                id: "opt_mono".into(),
                label: "Monolith".into(),
                description: Some("Single deployment unit".into()),
                pros: vec!["Simple deployment".into()],
                cons: vec!["Hard to scale".into()],
                recommended: false,
            },
            RadioOption {
                id: "opt_micro".into(),
                label: "Microservices".into(),
                description: None,
                pros: vec!["Independent scaling".into()],
                cons: vec!["Network complexity".into()],
                recommended: true,
            },
        ],
        allow_free_text: true,
        free_text_placeholder: Some("Or describe your own…".into()),
    })
}

fn sample_free_text_question() -> Question {
    Question::FreeText(FreeTextQuestion {
        id: "q_notes".into(),
        label: "Additional notes".into(),
        description: None,
        required: false,
        placeholder: Some("Type here…".into()),
        default_value: Some("N/A".into()),
        max_length: 500,
    })
}

fn sample_confirm_reject_question() -> Question {
    Question::ConfirmReject(ConfirmRejectQuestion {
        id: "q_approve".into(),
        label: "Approve this plan?".into(),
        description: Some("Review and approve".into()),
        required: true,
        approve_label: "Yes".into(),
        reject_label: "No".into(),
        allow_notes: true,
        notes_placeholder: Some("Reason…".into()),
    })
}

fn sample_countdown_question() -> Question {
    Question::CountdownTimer(CountdownTimerQuestion {
        id: "q_timer".into(),
        label: "Time remaining: {remaining}s".into(),
        duration_seconds: 60,
        on_timeout: TimeoutAction::Approve,
        pause_on_interaction: true,
    })
}

fn sample_form_request() -> FormRequest {
    FormRequest {
        message_type: FormRequestTag,
        version: 1,
        request_id: Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap(),
        form_type: FormType::Brainstorm,
        metadata: sample_metadata(),
        timeout: sample_timeout(),
        window: sample_window(),
        questions: vec![
            sample_radio_question(),
            sample_free_text_question(),
            sample_confirm_reject_question(),
            sample_countdown_question(),
        ],
        context: None,
    }
}

// ── FormRequest Parsing ──────────────────────────────────────────

#[test]
fn form_request_round_trip_json() {
    let request = sample_form_request();
    let json_str = serde_json::to_string_pretty(&request).unwrap();
    let parsed: FormRequest = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.version, 1);
    assert_eq!(parsed.form_type, FormType::Brainstorm);
    assert_eq!(parsed.request_id.to_string(), "550e8400-e29b-41d4-a716-446655440000");
    assert_eq!(parsed.questions.len(), 4);
}

#[test]
fn form_request_type_tag_serializes_correctly() {
    let request = sample_form_request();
    let val: Value = serde_json::to_value(&request).unwrap();
    assert_eq!(val["type"], "form_request");
}

#[test]
fn form_request_type_tag_rejects_wrong_value() {
    let request = sample_form_request();
    let mut val: Value = serde_json::to_value(&request).unwrap();
    val["type"] = json!("wrong_type");
    let result = serde_json::from_value::<FormRequest>(val);
    assert!(result.is_err());
}

#[test]
fn form_request_metadata_round_trip() {
    let request = sample_form_request();
    let json_str = serde_json::to_string(&request).unwrap();
    let parsed: FormRequest = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.metadata.plan_id, "plan_abc123");
    assert_eq!(parsed.metadata.workspace_id, "ws_xyz");
    assert_eq!(parsed.metadata.session_id, "sess_001");
    assert_eq!(parsed.metadata.agent, "Brainstorm");
    assert_eq!(parsed.metadata.title, "Architecture Decision");
    assert_eq!(parsed.metadata.description.as_deref(), Some("Choose the right architecture"));
}

// ── Question Type Parsing ────────────────────────────────────────

#[test]
fn radio_select_question_parses_from_json() {
    let json_str = r#"{
        "type": "radio_select",
        "id": "q1",
        "label": "Pick one",
        "required": true,
        "options": [
            { "id": "a", "label": "Option A", "recommended": true },
            { "id": "b", "label": "Option B", "recommended": false }
        ],
        "allow_free_text": false
    }"#;
    let q: Question = serde_json::from_str(json_str).unwrap();
    match q {
        Question::RadioSelect(rs) => {
            assert_eq!(rs.id, "q1");
            assert_eq!(rs.options.len(), 2);
            assert!(rs.options[0].recommended);
            assert!(!rs.allow_free_text);
        }
        _ => panic!("Expected RadioSelect variant"),
    }
}

#[test]
fn free_text_question_parses_from_json() {
    let json_str = r#"{
        "type": "free_text",
        "id": "q2",
        "label": "Describe your approach",
        "required": false,
        "max_length": 1000
    }"#;
    let q: Question = serde_json::from_str(json_str).unwrap();
    match q {
        Question::FreeText(ft) => {
            assert_eq!(ft.id, "q2");
            assert!(!ft.required);
            assert_eq!(ft.max_length, 1000);
            assert!(ft.placeholder.is_none());
        }
        _ => panic!("Expected FreeText variant"),
    }
}

#[test]
fn free_text_question_uses_default_max_length() {
    let json_str = r#"{
        "type": "free_text",
        "id": "q_default",
        "label": "Notes"
    }"#;
    let q: Question = serde_json::from_str(json_str).unwrap();
    match q {
        Question::FreeText(ft) => {
            assert_eq!(ft.max_length, 2000); // default_max_length
        }
        _ => panic!("Expected FreeText variant"),
    }
}

#[test]
fn confirm_reject_question_parses_from_json() {
    let json_str = r#"{
        "type": "confirm_reject",
        "id": "q3",
        "label": "Approve?"
    }"#;
    let q: Question = serde_json::from_str(json_str).unwrap();
    match q {
        Question::ConfirmReject(cr) => {
            assert_eq!(cr.id, "q3");
            assert!(cr.required); // default_true
            assert_eq!(cr.approve_label, "Approve"); // default_approve_label
            assert_eq!(cr.reject_label, "Reject"); // default_reject_label
            assert!(cr.allow_notes); // default_true
        }
        _ => panic!("Expected ConfirmReject variant"),
    }
}

#[test]
fn countdown_timer_question_parses_from_json() {
    let json_str = r#"{
        "type": "countdown_timer",
        "id": "q4",
        "label": "{remaining}s left",
        "duration_seconds": 90,
        "on_timeout": "defer"
    }"#;
    let q: Question = serde_json::from_str(json_str).unwrap();
    match q {
        Question::CountdownTimer(ct) => {
            assert_eq!(ct.id, "q4");
            assert_eq!(ct.duration_seconds, 90);
            assert_eq!(ct.on_timeout, TimeoutAction::Defer);
            assert!(ct.pause_on_interaction); // default_true
        }
        _ => panic!("Expected CountdownTimer variant"),
    }
}

#[test]
fn question_tag_based_discrimination_works() {
    let questions = vec![
        sample_radio_question(),
        sample_free_text_question(),
        sample_confirm_reject_question(),
        sample_countdown_question(),
    ];

    let json_str = serde_json::to_string(&questions).unwrap();
    let parsed: Vec<Question> = serde_json::from_str(&json_str).unwrap();

    assert!(matches!(&parsed[0], Question::RadioSelect(_)));
    assert!(matches!(&parsed[1], Question::FreeText(_)));
    assert!(matches!(&parsed[2], Question::ConfirmReject(_)));
    assert!(matches!(&parsed[3], Question::CountdownTimer(_)));
}

#[test]
fn radio_option_skips_empty_pros_cons() {
    let opt = RadioOption {
        id: "a".into(),
        label: "A".into(),
        description: None,
        pros: vec![],
        cons: vec![],
        recommended: false,
    };
    let val: Value = serde_json::to_value(&opt).unwrap();
    assert!(val.get("pros").is_none(), "empty pros should be skipped");
    assert!(val.get("cons").is_none(), "empty cons should be skipped");
    assert!(val.get("description").is_none(), "None description should be skipped");
}

// ── FormResponse Serialization ───────────────────────────────────

fn sample_response_metadata() -> ResponseMetadata {
    ResponseMetadata {
        plan_id: "plan_abc123".into(),
        workspace_id: "ws_xyz".into(),
        session_id: "sess_001".into(),
        completed_at: Some(Utc::now()),
        duration_ms: 12345,
        auto_filled_count: 0,
        refinement_count: 0,
    }
}

#[test]
fn form_response_round_trip_json() {
    let response = FormResponse {
        message_type: FormResponseTag,
        version: 1,
        request_id: Uuid::new_v4(),
        form_type: FormType::Brainstorm,
        status: FormStatus::Completed,
        metadata: sample_response_metadata(),
        answers: vec![
            Answer {
                question_id: "q_arch".into(),
                value: AnswerValue::RadioSelectAnswer {
                    selected: "opt_micro".into(),
                    free_text: None,
                },
                auto_filled: false,
                marked_for_refinement: false,
            },
            Answer {
                question_id: "q_notes".into(),
                value: AnswerValue::FreeTextAnswer {
                    value: "Looks good".into(),
                },
                auto_filled: false,
                marked_for_refinement: false,
            },
        ],
        refinement_requests: vec![],
        refinement_session: None,
    };

    let json_str = serde_json::to_string_pretty(&response).unwrap();
    let parsed: FormResponse = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.version, 1);
    assert_eq!(parsed.status, FormStatus::Completed);
    assert_eq!(parsed.answers.len(), 2);
}

#[test]
fn form_response_type_tag_serializes_correctly() {
    let response = FormResponse {
        message_type: FormResponseTag,
        version: 1,
        request_id: Uuid::new_v4(),
        form_type: FormType::Approval,
        status: FormStatus::Cancelled,
        metadata: sample_response_metadata(),
        answers: vec![],
        refinement_requests: vec![],
        refinement_session: None,
    };
    let val: Value = serde_json::to_value(&response).unwrap();
    assert_eq!(val["type"], "form_response");
}

#[test]
fn form_response_type_tag_rejects_wrong_value() {
    let response = FormResponse {
        message_type: FormResponseTag,
        version: 1,
        request_id: Uuid::new_v4(),
        form_type: FormType::Brainstorm,
        status: FormStatus::Completed,
        metadata: sample_response_metadata(),
        answers: vec![],
        refinement_requests: vec![],
        refinement_session: None,
    };
    let mut val: Value = serde_json::to_value(&response).unwrap();
    val["type"] = json!("not_form_response");
    let result = serde_json::from_value::<FormResponse>(val);
    assert!(result.is_err());
}

#[test]
fn form_response_skips_empty_refinement_requests() {
    let response = FormResponse {
        message_type: FormResponseTag,
        version: 1,
        request_id: Uuid::new_v4(),
        form_type: FormType::Brainstorm,
        status: FormStatus::Completed,
        metadata: sample_response_metadata(),
        answers: vec![],
        refinement_requests: vec![],
        refinement_session: None,
    };
    let val: Value = serde_json::to_value(&response).unwrap();
    assert!(
        val.get("refinement_requests").is_none(),
        "empty refinement_requests should be skipped"
    );
}

#[test]
fn form_response_with_refinement_requests() {
    let response = FormResponse {
        message_type: FormResponseTag,
        version: 1,
        request_id: Uuid::new_v4(),
        form_type: FormType::Brainstorm,
        status: FormStatus::RefinementRequested,
        metadata: sample_response_metadata(),
        answers: vec![],
        refinement_requests: vec![RefinementRequestEntry {
            question_id: "q_arch".into(),
            feedback: "Need more detail on option B".into(),
        }],
        refinement_session: None,
    };
    let json_str = serde_json::to_string(&response).unwrap();
    let parsed: FormResponse = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.status, FormStatus::RefinementRequested);
    assert_eq!(parsed.refinement_requests.len(), 1);
    assert_eq!(parsed.refinement_requests[0].question_id, "q_arch");
}

// ── AnswerValue Serialization ────────────────────────────────────

#[test]
fn answer_value_radio_select_round_trip() {
    let val = AnswerValue::RadioSelectAnswer {
        selected: "opt_a".into(),
        free_text: Some("custom note".into()),
    };
    let json_str = serde_json::to_string(&val).unwrap();
    let parsed: AnswerValue = serde_json::from_str(&json_str).unwrap();

    match parsed {
        AnswerValue::RadioSelectAnswer { selected, free_text } => {
            assert_eq!(selected, "opt_a");
            assert_eq!(free_text.as_deref(), Some("custom note"));
        }
        _ => panic!("Expected RadioSelectAnswer"),
    }
}

#[test]
fn answer_value_radio_select_without_free_text() {
    let val = AnswerValue::RadioSelectAnswer {
        selected: "opt_b".into(),
        free_text: None,
    };
    let json_val: Value = serde_json::to_value(&val).unwrap();
    assert!(
        json_val.get("free_text").is_none(),
        "None free_text should be skipped"
    );
}

#[test]
fn answer_value_free_text_round_trip() {
    let val = AnswerValue::FreeTextAnswer {
        value: "Hello world".into(),
    };
    let json_str = serde_json::to_string(&val).unwrap();
    let parsed: AnswerValue = serde_json::from_str(&json_str).unwrap();

    match parsed {
        AnswerValue::FreeTextAnswer { value } => assert_eq!(value, "Hello world"),
        _ => panic!("Expected FreeTextAnswer"),
    }
}

#[test]
fn answer_value_confirm_approve_round_trip() {
    let val = AnswerValue::ConfirmRejectAnswer {
        action: ConfirmRejectAction::Approve,
        notes: Some("Looks good to me".into()),
    };
    let json_str = serde_json::to_string(&val).unwrap();
    let parsed: AnswerValue = serde_json::from_str(&json_str).unwrap();

    match parsed {
        AnswerValue::ConfirmRejectAnswer { action, notes } => {
            assert_eq!(action, ConfirmRejectAction::Approve);
            assert_eq!(notes.as_deref(), Some("Looks good to me"));
        }
        _ => panic!("Expected ConfirmRejectAnswer"),
    }
}

#[test]
fn answer_value_confirm_reject_round_trip() {
    let val = AnswerValue::ConfirmRejectAnswer {
        action: ConfirmRejectAction::Reject,
        notes: None,
    };
    let json_str = serde_json::to_string(&val).unwrap();

    // Verify the JSON has "reject" for the action field
    let json_val: Value = serde_json::from_str(&json_str).unwrap();
    assert_eq!(json_val["action"], "reject");

    let parsed: AnswerValue = serde_json::from_str(&json_str).unwrap();
    match parsed {
        AnswerValue::ConfirmRejectAnswer { action, notes } => {
            assert_eq!(action, ConfirmRejectAction::Reject);
            assert!(notes.is_none());
        }
        _ => panic!("Expected ConfirmRejectAnswer"),
    }
}

#[test]
fn answer_value_countdown_completed_round_trip() {
    let val = AnswerValue::CountdownTimerAnswer {
        result: TimerResult::Completed,
        elapsed_seconds: 45,
    };
    let json_str = serde_json::to_string(&val).unwrap();
    let parsed: AnswerValue = serde_json::from_str(&json_str).unwrap();

    match parsed {
        AnswerValue::CountdownTimerAnswer { result, elapsed_seconds } => {
            assert_eq!(result, TimerResult::Completed);
            assert_eq!(elapsed_seconds, 45);
        }
        _ => panic!("Expected CountdownTimerAnswer"),
    }
}

#[test]
fn answer_value_countdown_timed_out_round_trip() {
    let val = AnswerValue::CountdownTimerAnswer {
        result: TimerResult::TimedOut,
        elapsed_seconds: 60,
    };
    let json_str = serde_json::to_string(&val).unwrap();

    let json_val: Value = serde_json::from_str(&json_str).unwrap();
    assert_eq!(json_val["result"], "timed_out");

    let parsed: AnswerValue = serde_json::from_str(&json_str).unwrap();
    match parsed {
        AnswerValue::CountdownTimerAnswer { result, elapsed_seconds } => {
            assert_eq!(result, TimerResult::TimedOut);
            assert_eq!(elapsed_seconds, 60);
        }
        _ => panic!("Expected CountdownTimerAnswer"),
    }
}

// ── Answer struct ────────────────────────────────────────────────

#[test]
fn answer_with_auto_filled_flag() {
    let answer = Answer {
        question_id: "q1".into(),
        value: AnswerValue::FreeTextAnswer {
            value: "auto-generated".into(),
        },
        auto_filled: true,
        marked_for_refinement: false,
    };
    let json_str = serde_json::to_string(&answer).unwrap();
    let parsed: Answer = serde_json::from_str(&json_str).unwrap();

    assert_eq!(parsed.question_id, "q1");
    assert!(parsed.auto_filled);
    assert!(!parsed.marked_for_refinement);
}

#[test]
fn answer_with_refinement_flag() {
    let answer = Answer {
        question_id: "q2".into(),
        value: AnswerValue::RadioSelectAnswer {
            selected: "opt_x".into(),
            free_text: None,
        },
        auto_filled: false,
        marked_for_refinement: true,
    };
    let json_str = serde_json::to_string(&answer).unwrap();
    let parsed: Answer = serde_json::from_str(&json_str).unwrap();

    assert!(parsed.marked_for_refinement);
}

// ── FormStatus serialization ─────────────────────────────────────

#[test]
fn form_status_all_variants_round_trip() {
    let statuses = vec![
        FormStatus::Completed,
        FormStatus::Cancelled,
        FormStatus::TimedOut,
        FormStatus::Deferred,
        FormStatus::RefinementRequested,
    ];
    let expected_strings = vec![
        "completed",
        "cancelled",
        "timed_out",
        "deferred",
        "refinement_requested",
    ];

    for (status, expected) in statuses.iter().zip(expected_strings.iter()) {
        let json_str = serde_json::to_string(status).unwrap();
        assert_eq!(json_str, format!("\"{}\"", expected));
        let parsed: FormStatus = serde_json::from_str(&json_str).unwrap();
        assert_eq!(&parsed, status);
    }
}

// ── FormType serialization ───────────────────────────────────────

#[test]
fn form_type_brainstorm_serializes() {
    let json_str = serde_json::to_string(&FormType::Brainstorm).unwrap();
    assert_eq!(json_str, "\"brainstorm\"");
}

#[test]
fn form_type_approval_serializes() {
    let json_str = serde_json::to_string(&FormType::Approval).unwrap();
    assert_eq!(json_str, "\"approval\"");
}

// ── TimeoutAction / FallbackMode serialization ───────────────────

#[test]
fn timeout_action_all_variants_round_trip() {
    let actions = vec![
        TimeoutAction::AutoFill,
        TimeoutAction::Approve,
        TimeoutAction::Reject,
        TimeoutAction::Defer,
    ];
    for action in &actions {
        let json_str = serde_json::to_string(action).unwrap();
        let parsed: TimeoutAction = serde_json::from_str(&json_str).unwrap();
        assert_eq!(&parsed, action);
    }
}

#[test]
fn fallback_mode_round_trip() {
    use pm_gui_forms::protocol::FallbackMode;
    let modes = vec![FallbackMode::Chat, FallbackMode::None];
    let expected = vec!["\"chat\"", "\"none\""];
    for (mode, exp) in modes.iter().zip(expected.iter()) {
        let json_str = serde_json::to_string(mode).unwrap();
        assert_eq!(&json_str, exp);
        let parsed: FallbackMode = serde_json::from_str(&json_str).unwrap();
        assert_eq!(&parsed, mode);
    }
}
