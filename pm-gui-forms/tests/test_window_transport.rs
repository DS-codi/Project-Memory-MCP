//! Integration tests for window config helpers and NDJSON transport
//! encode/decode round-trips using mock readers/writers.

use uuid::Uuid;

use pm_gui_forms::protocol::{
    FormMetadata, FormRequest, FormResponse, FormStatus, FormType, Question,
    RadioOption, RadioSelectQuestion, TimeoutAction, TimeoutConfig, WindowConfig,
};
use pm_gui_forms::protocol::{FormRequestTag, FormResponseTag, ResponseMetadata};
use pm_gui_forms::transport::{ndjson_decode, ndjson_encode};
use pm_gui_forms::window::{default_window_config, merge_with_defaults};

// ══════════════════════════════════════════════════════════════════
// Window Config Tests
// ══════════════════════════════════════════════════════════════════

// ── default_window_config ────────────────────────────────────────

#[test]
fn default_config_brainstorm_not_always_on_top() {
    let cfg = default_window_config(FormType::Brainstorm);
    assert!(!cfg.always_on_top);
}

#[test]
fn default_config_brainstorm_size_900x700() {
    let cfg = default_window_config(FormType::Brainstorm);
    assert_eq!(cfg.width, 900);
    assert_eq!(cfg.height, 700);
}

#[test]
fn default_config_brainstorm_title() {
    let cfg = default_window_config(FormType::Brainstorm);
    assert_eq!(cfg.title, "Brainstorm");
}

#[test]
fn default_config_approval_always_on_top() {
    let cfg = default_window_config(FormType::Approval);
    assert!(cfg.always_on_top);
}

#[test]
fn default_config_approval_size_500x350() {
    let cfg = default_window_config(FormType::Approval);
    assert_eq!(cfg.width, 500);
    assert_eq!(cfg.height, 350);
}

#[test]
fn default_config_approval_title() {
    let cfg = default_window_config(FormType::Approval);
    assert_eq!(cfg.title, "Approval Required");
}

// ── merge_with_defaults ──────────────────────────────────────────

#[test]
fn merge_replaces_zero_width_with_default() {
    let user = WindowConfig {
        always_on_top: false,
        width: 0,
        height: 0,
        title: String::new(),
    };
    let merged = merge_with_defaults(&user, FormType::Brainstorm);
    assert_eq!(merged.width, 900);
    assert_eq!(merged.height, 700);
    assert_eq!(merged.title, "Brainstorm");
}

#[test]
fn merge_keeps_user_values_when_nonzero() {
    let user = WindowConfig {
        always_on_top: false,
        width: 1200,
        height: 800,
        title: "Custom Title".into(),
    };
    let merged = merge_with_defaults(&user, FormType::Brainstorm);
    assert_eq!(merged.width, 1200);
    assert_eq!(merged.height, 800);
    assert_eq!(merged.title, "Custom Title");
}

#[test]
fn merge_always_on_top_uses_or_logic() {
    // User: false, Default (approval): true → result should be true
    let user = WindowConfig {
        always_on_top: false,
        width: 500,
        height: 350,
        title: "My Approval".into(),
    };
    let merged = merge_with_defaults(&user, FormType::Approval);
    assert!(merged.always_on_top, "always_on_top should be true via OR with default");
}

#[test]
fn merge_always_on_top_user_true_brainstorm() {
    // User: true, Default (brainstorm): false → result should be true
    let user = WindowConfig {
        always_on_top: true,
        width: 900,
        height: 700,
        title: "Brainstorm".into(),
    };
    let merged = merge_with_defaults(&user, FormType::Brainstorm);
    assert!(merged.always_on_top, "user always_on_top=true should be kept");
}

#[test]
fn merge_partial_overrides() {
    // Only width is custom, rest should use defaults
    let user = WindowConfig {
        always_on_top: false,
        width: 1000,
        height: 0,
        title: String::new(),
    };
    let merged = merge_with_defaults(&user, FormType::Approval);
    assert_eq!(merged.width, 1000);
    assert_eq!(merged.height, 350); // default for approval
    assert_eq!(merged.title, "Approval Required"); // default for approval
    assert!(merged.always_on_top); // default for approval is true
}

// ── WindowConfig serde ───────────────────────────────────────────

#[test]
fn window_config_serializes_round_trip() {
    let cfg = WindowConfig {
        always_on_top: true,
        width: 800,
        height: 600,
        title: "Test".into(),
    };
    let json_str = serde_json::to_string(&cfg).unwrap();
    let parsed: WindowConfig = serde_json::from_str(&json_str).unwrap();
    assert_eq!(parsed.width, 800);
    assert_eq!(parsed.height, 600);
    assert!(parsed.always_on_top);
    assert_eq!(parsed.title, "Test");
}

#[test]
fn window_config_defaults_from_json() {
    // Minimal JSON — width/height should fall back to defaults (900, 700)
    let json_str = r#"{ "title": "Minimal" }"#;
    let parsed: WindowConfig = serde_json::from_str(json_str).unwrap();
    assert_eq!(parsed.width, 900); // default_width
    assert_eq!(parsed.height, 700); // default_height
    assert!(!parsed.always_on_top); // default false
}

// ══════════════════════════════════════════════════════════════════
// NDJSON Transport Tests
// ══════════════════════════════════════════════════════════════════

// ── Helpers ──────────────────────────────────────────────────────

fn sample_form_request() -> FormRequest {
    FormRequest {
        message_type: FormRequestTag,
        version: 1,
        request_id: Uuid::parse_str("a1b2c3d4-e5f6-7890-abcd-ef1234567890").unwrap(),
        form_type: FormType::Brainstorm,
        metadata: FormMetadata {
            plan_id: "plan_test".into(),
            workspace_id: "ws_test".into(),
            session_id: "sess_test".into(),
            agent: "TestAgent".into(),
            title: "Test".into(),
            description: None,
        },
        timeout: TimeoutConfig {
            duration_seconds: 120,
            on_timeout: TimeoutAction::AutoFill,
            fallback_mode: pm_gui_forms::protocol::FallbackMode::Chat,
        },
        window: WindowConfig {
            always_on_top: false,
            width: 900,
            height: 700,
            title: "Test".into(),
        },
        questions: vec![Question::RadioSelect(RadioSelectQuestion {
            id: "q1".into(),
            label: "Pick".into(),
            description: None,
            required: true,
            options: vec![RadioOption {
                id: "a".into(),
                label: "A".into(),
                description: None,
                pros: vec![],
                cons: vec![],
                recommended: true,
            }],
            allow_free_text: false,
            free_text_placeholder: None,
        })],
        context: None,
    }
}

fn sample_form_response() -> FormResponse {
    FormResponse {
        message_type: FormResponseTag,
        version: 1,
        request_id: Uuid::parse_str("a1b2c3d4-e5f6-7890-abcd-ef1234567890").unwrap(),
        form_type: FormType::Brainstorm,
        status: FormStatus::Completed,
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

// ── ndjson_encode / ndjson_decode round-trips ────────────────────

#[tokio::test]
async fn ndjson_encode_decode_form_request_round_trip() {
    let request = sample_form_request();

    // Encode into a buffer
    let mut buf: Vec<u8> = Vec::new();
    ndjson_encode(&mut buf, &request).await.unwrap();

    // The buffer should contain valid JSON + newline
    let encoded = String::from_utf8(buf.clone()).unwrap();
    assert!(encoded.ends_with('\n'), "NDJSON should end with newline");

    // Decode from the buffer
    let mut reader = tokio::io::BufReader::new(buf.as_slice());
    let decoded: FormRequest = ndjson_decode(&mut reader).await.unwrap();

    assert_eq!(decoded.version, 1);
    assert_eq!(decoded.form_type, FormType::Brainstorm);
    assert_eq!(
        decoded.request_id.to_string(),
        "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    );
    assert_eq!(decoded.questions.len(), 1);
}

#[tokio::test]
async fn ndjson_encode_decode_form_response_round_trip() {
    let response = sample_form_response();

    let mut buf: Vec<u8> = Vec::new();
    ndjson_encode(&mut buf, &response).await.unwrap();

    let mut reader = tokio::io::BufReader::new(buf.as_slice());
    let decoded: FormResponse = ndjson_decode(&mut reader).await.unwrap();

    assert_eq!(decoded.version, 1);
    assert_eq!(decoded.status, FormStatus::Completed);
    assert_eq!(
        decoded.request_id.to_string(),
        "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    );
}

#[tokio::test]
async fn ndjson_encode_produces_single_line() {
    let request = sample_form_request();

    let mut buf: Vec<u8> = Vec::new();
    ndjson_encode(&mut buf, &request).await.unwrap();

    let encoded = String::from_utf8(buf).unwrap();
    let lines: Vec<&str> = encoded.trim().split('\n').collect();
    assert_eq!(lines.len(), 1, "NDJSON should be a single line");
}

#[tokio::test]
async fn ndjson_decode_returns_eof_on_empty_input() {
    let buf: Vec<u8> = Vec::new();
    let mut reader = tokio::io::BufReader::new(buf.as_slice());
    let result: Result<FormRequest, _> = ndjson_decode(&mut reader).await;
    assert!(result.is_err(), "should return error on empty input");
}

#[tokio::test]
async fn ndjson_decode_fails_on_invalid_json() {
    let buf = b"this is not json\n".to_vec();
    let mut reader = tokio::io::BufReader::new(buf.as_slice());
    let result: Result<FormRequest, _> = ndjson_decode(&mut reader).await;
    assert!(result.is_err(), "should fail on invalid JSON");
}

#[tokio::test]
async fn ndjson_multiple_messages_sequential() {
    // Encode two messages into the same buffer
    let req = sample_form_request();
    let resp = sample_form_response();

    let mut buf: Vec<u8> = Vec::new();
    ndjson_encode(&mut buf, &req).await.unwrap();
    ndjson_encode(&mut buf, &resp).await.unwrap();

    // Decode sequentially
    let mut reader = tokio::io::BufReader::new(buf.as_slice());
    let decoded_req: FormRequest = ndjson_decode(&mut reader).await.unwrap();
    let decoded_resp: FormResponse = ndjson_decode(&mut reader).await.unwrap();

    assert_eq!(decoded_req.form_type, FormType::Brainstorm);
    assert_eq!(decoded_resp.status, FormStatus::Completed);
}

#[tokio::test]
async fn ndjson_encode_decode_refinement_request_round_trip() {
    use pm_gui_forms::protocol::{FormRefinementRequest, RefinementEntry};
    use pm_gui_forms::protocol::FormRefinementRequestTag;

    let req = FormRefinementRequest {
        message_type: FormRefinementRequestTag,
        version: 1,
        request_id: Uuid::new_v4(),
        original_request_id: Uuid::new_v4(),
        form_type: FormType::Brainstorm,
        question_ids: vec!["q1".into()],
        user_feedback: vec![RefinementEntry {
            question_id: "q1".into(),
            feedback: "More detail".into(),
        }],
        current_answers: vec![],
    };

    let mut buf: Vec<u8> = Vec::new();
    ndjson_encode(&mut buf, &req).await.unwrap();

    let mut reader = tokio::io::BufReader::new(buf.as_slice());
    let decoded: FormRefinementRequest = ndjson_decode(&mut reader).await.unwrap();

    assert_eq!(decoded.question_ids.len(), 1);
    assert_eq!(decoded.user_feedback[0].feedback, "More detail");
}

#[tokio::test]
async fn ndjson_encode_decode_refinement_response_round_trip() {
    use pm_gui_forms::protocol::{FormRefinementResponse, FreeTextQuestion};
    use pm_gui_forms::protocol::FormRefinementResponseTag;

    let resp = FormRefinementResponse {
        message_type: FormRefinementResponseTag,
        version: 1,
        request_id: Uuid::new_v4(),
        original_request_id: Uuid::new_v4(),
        updated_questions: vec![Question::FreeText(FreeTextQuestion {
            id: "q1".into(),
            label: "Updated".into(),
            description: None,
            required: true,
            placeholder: None,
            default_value: None,
            max_length: 2000,
        })],
    };

    let mut buf: Vec<u8> = Vec::new();
    ndjson_encode(&mut buf, &resp).await.unwrap();

    let mut reader = tokio::io::BufReader::new(buf.as_slice());
    let decoded: FormRefinementResponse = ndjson_decode(&mut reader).await.unwrap();

    assert_eq!(decoded.updated_questions.len(), 1);
}

// ── TimeoutConfig serde ──────────────────────────────────────────

#[test]
fn timeout_config_round_trip() {
    let cfg = TimeoutConfig {
        duration_seconds: 300,
        on_timeout: TimeoutAction::AutoFill,
        fallback_mode: pm_gui_forms::protocol::FallbackMode::Chat,
    };
    let json_str = serde_json::to_string(&cfg).unwrap();
    let parsed: TimeoutConfig = serde_json::from_str(&json_str).unwrap();
    assert_eq!(parsed.duration_seconds, 300);
    assert_eq!(parsed.on_timeout, TimeoutAction::AutoFill);
}
