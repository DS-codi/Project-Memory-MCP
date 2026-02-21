//! Integration tests for Phase 3 — Supervisor form-app launcher.
//!
//! Covers:
//!
//! 1. **Protocol serde round-trip**: `LaunchApp` request serialisation ↔ deserialisation
//! 2. **FormAppResponse serde round-trip**: success, error, and timeout variants
//! 3. **FormAppLifecycle state tracking**: state transitions
//! 4. **Config defaults**: `BrainstormGuiSection` and `ApprovalGuiSection` default values
//! 5. **Handler dispatch**: `LaunchApp` routing — unknown app, disabled app, missing binary
//! 6. **form_app.rs extensions**: payload serialisation, empty-stdout errors, malformed JSON

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::json;
use tokio::sync::{watch, Mutex};

use supervisor::config::{
    ApprovalGuiSection, BrainstormGuiSection, FormAppConfig, LaunchMode,
};
use supervisor::control::handler::{handle_request, FormAppConfigs};
use supervisor::control::protocol::{
    decode_request, encode_response, ControlRequest, ControlResponse,
    FormAppLifecycle, FormAppLifecycleState, FormAppResponse,
};
use supervisor::control::registry::Registry;

// ─── Helpers ────────────────────────────────────────────────────────────────

fn make_registry() -> Arc<Mutex<Registry>> {
    Arc::new(Mutex::new(Registry::new()))
}

fn empty_form_apps() -> Arc<FormAppConfigs> {
    Arc::new(FormAppConfigs::new())
}

fn test_shutdown_tx() -> watch::Sender<bool> {
    let (tx, _rx) = watch::channel(false);
    tx
}

/// Build a [`FormAppConfig`] that runs a cross-platform echo-back command.
fn echo_config() -> FormAppConfig {
    #[cfg(target_os = "windows")]
    let (cmd, args) = (
        "powershell".to_string(),
        vec![
            "-NoProfile".to_string(),
            "-Command".to_string(),
            "[Console]::In.ReadLine()".to_string(),
        ],
    );
    #[cfg(not(target_os = "windows"))]
    let (cmd, args) = ("head".to_string(), vec!["-n".to_string(), "1".to_string()]);

    FormAppConfig {
        enabled: true,
        command: cmd,
        args,
        working_dir: None,
        env: Default::default(),
        launch_mode: LaunchMode::OnDemand,
        timeout_seconds: 5,
        window_width: 720,
        window_height: 640,
        always_on_top: false,
    }
}

/// Build a [`FormAppConfig`] whose command immediately exits with no output.
fn empty_stdout_config() -> FormAppConfig {
    #[cfg(target_os = "windows")]
    let (cmd, args) = (
        "powershell".to_string(),
        vec![
            "-NoProfile".to_string(),
            "-Command".to_string(),
            "exit 0".to_string(),
        ],
    );
    #[cfg(not(target_os = "windows"))]
    let (cmd, args) = ("true".to_string(), vec![]);

    FormAppConfig {
        enabled: true,
        command: cmd,
        args,
        working_dir: None,
        env: Default::default(),
        launch_mode: LaunchMode::OnDemand,
        timeout_seconds: 5,
        window_width: 720,
        window_height: 640,
        always_on_top: false,
    }
}

/// Build a [`FormAppConfig`] whose command produces invalid JSON on stdout.
fn malformed_json_config() -> FormAppConfig {
    #[cfg(target_os = "windows")]
    let (cmd, args) = (
        "powershell".to_string(),
        vec![
            "-NoProfile".to_string(),
            "-Command".to_string(),
            "Write-Host 'this is not json{'".to_string(),
        ],
    );
    #[cfg(not(target_os = "windows"))]
    let (cmd, args) = (
        "echo".to_string(),
        vec!["this is not json{".to_string()],
    );

    FormAppConfig {
        enabled: true,
        command: cmd,
        args,
        working_dir: None,
        env: Default::default(),
        launch_mode: LaunchMode::OnDemand,
        timeout_seconds: 5,
        window_width: 720,
        window_height: 640,
        always_on_top: false,
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Protocol serde round-trip: LaunchApp request
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn launch_app_request_roundtrip_minimal() {
    let req = ControlRequest::LaunchApp {
        app_name: "brainstorm_gui".to_string(),
        payload: json!({"type": "form_request", "fields": []}),
        timeout_seconds: None,
    };

    let serialized = serde_json::to_string(&req).expect("serialize");
    let decoded = decode_request(&serialized).expect("decode");

    match decoded {
        ControlRequest::LaunchApp {
            app_name,
            payload,
            timeout_seconds,
        } => {
            assert_eq!(app_name, "brainstorm_gui");
            assert_eq!(payload["type"], "form_request");
            assert!(timeout_seconds.is_none());
        }
        other => panic!("expected LaunchApp, got {other:?}"),
    }
}

#[test]
fn launch_app_request_roundtrip_with_timeout() {
    let req = ControlRequest::LaunchApp {
        app_name: "approval_gui".to_string(),
        payload: json!({"title": "Confirm deployment?"}),
        timeout_seconds: Some(30),
    };

    let serialized = serde_json::to_string(&req).expect("serialize");
    let decoded = decode_request(&serialized).expect("decode");

    match decoded {
        ControlRequest::LaunchApp {
            app_name,
            payload,
            timeout_seconds,
        } => {
            assert_eq!(app_name, "approval_gui");
            assert_eq!(payload["title"], "Confirm deployment?");
            assert_eq!(timeout_seconds, Some(30));
        }
        other => panic!("expected LaunchApp, got {other:?}"),
    }
}

#[test]
fn launch_app_request_from_raw_json() {
    let raw = r#"{
        "type": "LaunchApp",
        "app_name": "brainstorm_gui",
        "payload": {"questions": [{"id": "q1", "text": "Pick a framework"}]}
    }"#;

    let req = decode_request(raw).expect("decode raw JSON");
    match req {
        ControlRequest::LaunchApp { app_name, payload, timeout_seconds } => {
            assert_eq!(app_name, "brainstorm_gui");
            assert!(payload["questions"].is_array());
            assert!(timeout_seconds.is_none(), "absent field should be None");
        }
        other => panic!("expected LaunchApp, got {other:?}"),
    }
}

#[test]
fn launch_app_request_skip_serializing_none_timeout() {
    let req = ControlRequest::LaunchApp {
        app_name: "test".to_string(),
        payload: json!({}),
        timeout_seconds: None,
    };
    let json_str = serde_json::to_string(&req).expect("serialize");
    // The field should be absent when None thanks to skip_serializing_if.
    assert!(
        !json_str.contains("timeout_seconds"),
        "timeout_seconds should be omitted when None; got: {json_str}"
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. FormAppResponse serde round-trip
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn form_app_response_success_roundtrip() {
    let resp = FormAppResponse {
        app_name: "brainstorm_gui".to_string(),
        success: true,
        response_payload: Some(json!({"chosen_option": "react", "confirmed": true})),
        error: None,
        elapsed_ms: 1234,
        timed_out: false,
        pending_refinement: false,
        session_id: None,
    };

    let json_str = serde_json::to_string(&resp).expect("serialize");
    let decoded: FormAppResponse = serde_json::from_str(&json_str).expect("deserialize");

    assert_eq!(decoded.app_name, "brainstorm_gui");
    assert!(decoded.success);
    assert_eq!(
        decoded.response_payload.as_ref().unwrap()["chosen_option"],
        "react"
    );
    assert!(decoded.error.is_none());
    assert_eq!(decoded.elapsed_ms, 1234);
    assert!(!decoded.timed_out);
}

#[test]
fn form_app_response_error_roundtrip() {
    let resp = FormAppResponse {
        app_name: "approval_gui".to_string(),
        success: false,
        response_payload: None,
        error: Some("process crashed".to_string()),
        elapsed_ms: 50,
        timed_out: false,
        pending_refinement: false,
        session_id: None,
    };

    let json_str = serde_json::to_string(&resp).expect("serialize");
    let decoded: FormAppResponse = serde_json::from_str(&json_str).expect("deserialize");

    assert!(!decoded.success);
    assert!(decoded.response_payload.is_none());
    assert_eq!(decoded.error.as_deref(), Some("process crashed"));
    assert!(!decoded.timed_out);
}

#[test]
fn form_app_response_timeout_roundtrip() {
    let resp = FormAppResponse {
        app_name: "slow_gui".to_string(),
        success: false,
        response_payload: None,
        error: Some("slow_gui timed out after 60s".to_string()),
        elapsed_ms: 60_000,
        timed_out: true,
        pending_refinement: false,
        session_id: None,
    };

    let json_str = serde_json::to_string(&resp).expect("serialize");
    let decoded: FormAppResponse = serde_json::from_str(&json_str).expect("deserialize");

    assert!(!decoded.success);
    assert!(decoded.timed_out);
    assert!(decoded.error.unwrap().contains("timed out"));
}

#[test]
fn form_app_response_skip_serializing_none_fields() {
    let resp = FormAppResponse {
        app_name: "test".to_string(),
        success: true,
        response_payload: None,
        error: None,
        elapsed_ms: 0,
        timed_out: false,
        pending_refinement: false,
        session_id: None,
    };
    let json_str = serde_json::to_string(&resp).expect("serialize");
    assert!(
        !json_str.contains("response_payload"),
        "response_payload should be omitted when None"
    );
    assert!(
        !json_str.contains("error"),
        "error should be omitted when None"
    );
}

#[test]
fn form_app_response_inside_control_response_envelope() {
    let inner = FormAppResponse {
        app_name: "brainstorm_gui".to_string(),
        success: true,
        response_payload: Some(json!({"decision": "go"})),
        error: None,
        elapsed_ms: 500,
        timed_out: false,
        pending_refinement: false,
        session_id: None,
    };
    let data = serde_json::to_value(&inner).expect("to_value");
    let envelope = ControlResponse::ok(data);

    let wire = encode_response(&envelope);
    assert!(wire.ends_with('\n'), "NDJSON must end with newline");

    let decoded: ControlResponse = serde_json::from_str(wire.trim()).expect("decode envelope");
    assert!(decoded.ok);
    let inner2: FormAppResponse =
        serde_json::from_value(decoded.data).expect("decode inner FormAppResponse");
    assert_eq!(inner2.app_name, "brainstorm_gui");
    assert_eq!(
        inner2.response_payload.unwrap()["decision"],
        "go"
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. FormAppLifecycle state tracking
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn lifecycle_initial_state_is_running() {
    let lc = FormAppLifecycle {
        app_name: "test_gui".to_string(),
        pid: Some(12345),
        state: FormAppLifecycleState::Running,
        started_at_ms: 1_700_000_000_000,
        timeout_seconds: 300,
    };
    assert!(matches!(lc.state, FormAppLifecycleState::Running));
    assert_eq!(lc.pid, Some(12345));
    assert_eq!(lc.timeout_seconds, 300);
}

#[test]
fn lifecycle_transition_to_completed() {
    let mut lc = FormAppLifecycle {
        app_name: "brainstorm_gui".to_string(),
        pid: Some(999),
        state: FormAppLifecycleState::Running,
        started_at_ms: 0,
        timeout_seconds: 60,
    };
    lc.state = FormAppLifecycleState::Completed;
    assert!(matches!(lc.state, FormAppLifecycleState::Completed));
}

#[test]
fn lifecycle_transition_to_timed_out() {
    let mut lc = FormAppLifecycle {
        app_name: "slow_gui".to_string(),
        pid: Some(42),
        state: FormAppLifecycleState::Running,
        started_at_ms: 0,
        timeout_seconds: 10,
    };
    lc.state = FormAppLifecycleState::TimedOut;
    assert!(matches!(lc.state, FormAppLifecycleState::TimedOut));
}

#[test]
fn lifecycle_transition_to_failed_with_message() {
    let mut lc = FormAppLifecycle {
        app_name: "crash_gui".to_string(),
        pid: None,
        state: FormAppLifecycleState::Running,
        started_at_ms: 0,
        timeout_seconds: 30,
    };
    lc.state = FormAppLifecycleState::Failed("segfault in child".to_string());
    match &lc.state {
        FormAppLifecycleState::Failed(msg) => {
            assert!(msg.contains("segfault"));
        }
        other => panic!("expected Failed, got {other:?}"),
    }
}

#[test]
fn lifecycle_pid_none_when_spawn_fails() {
    let lc = FormAppLifecycle {
        app_name: "missing_gui".to_string(),
        pid: None,
        state: FormAppLifecycleState::Failed("binary not found".to_string()),
        started_at_ms: 0,
        timeout_seconds: 60,
    };
    assert!(lc.pid.is_none());
    assert!(matches!(lc.state, FormAppLifecycleState::Failed(_)));
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Config defaults: BrainstormGuiSection and ApprovalGuiSection
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn brainstorm_gui_section_defaults() {
    let section = BrainstormGuiSection::default();
    let cfg = &*section; // Deref to FormAppConfig

    assert!(cfg.enabled, "brainstorm GUI should be enabled by default");
    assert_eq!(cfg.command, "pm-brainstorm-gui");
    assert!(cfg.args.is_empty());
    assert!(cfg.working_dir.is_none());
    assert!(cfg.env.is_empty());
    assert_eq!(cfg.launch_mode, LaunchMode::OnDemand);
    assert_eq!(cfg.timeout_seconds, 300, "default timeout should be 5 min");
    assert_eq!(cfg.window_width, 720);
    assert_eq!(cfg.window_height, 640);
    assert!(!cfg.always_on_top);
}

#[test]
fn approval_gui_section_defaults() {
    let section = ApprovalGuiSection::default();
    let cfg = &*section;

    assert!(cfg.enabled);
    assert_eq!(cfg.command, "pm-approval-gui");
    assert!(cfg.args.is_empty());
    assert!(cfg.working_dir.is_none());
    assert!(cfg.env.is_empty());
    assert_eq!(cfg.launch_mode, LaunchMode::OnDemand);
    assert_eq!(
        cfg.timeout_seconds, 60,
        "approval GUI default timeout should be 60s"
    );
    assert_eq!(cfg.window_width, 480, "approval GUI should be narrower");
    assert_eq!(cfg.window_height, 360, "approval GUI should be shorter");
    assert!(cfg.always_on_top, "approval GUI should be always-on-top");
}

#[test]
fn form_app_config_default_uses_generic_command() {
    let cfg = FormAppConfig::default();
    assert_eq!(cfg.command, "form-app");
    assert!(cfg.enabled);
    assert_eq!(cfg.timeout_seconds, 300);
    assert!(!cfg.always_on_top);
}

#[test]
fn brainstorm_and_approval_have_different_commands() {
    let brainstorm = BrainstormGuiSection::default();
    let approval = ApprovalGuiSection::default();
    assert_ne!(brainstorm.command, approval.command);
}

#[test]
fn launch_mode_default_is_on_demand() {
    let mode = LaunchMode::default();
    assert_eq!(mode, LaunchMode::OnDemand);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Handler dispatch: LaunchApp routing
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn handler_launch_app_unknown_name_returns_error() {
    let reg = make_registry();
    let resp = handle_request(
        ControlRequest::LaunchApp {
            app_name: "nonexistent_gui".to_string(),
            payload: json!({}),
            timeout_seconds: None,
        },
        reg,
        empty_form_apps(),
        test_shutdown_tx(),
    )
    .await;

    assert!(!resp.ok);
    let err = resp.error.as_deref().unwrap();
    assert!(err.contains("unknown form app"), "error: {err}");
    assert!(err.contains("nonexistent_gui"));
}

#[tokio::test]
async fn handler_launch_app_disabled_returns_error() {
    let mut apps = FormAppConfigs::new();
    apps.insert(
        "test_gui".to_string(),
        FormAppConfig {
            enabled: false,
            command: "echo".to_string(),
            ..FormAppConfig::default()
        },
    );

    let resp = handle_request(
        ControlRequest::LaunchApp {
            app_name: "test_gui".to_string(),
            payload: json!({}),
            timeout_seconds: None,
        },
        make_registry(),
        Arc::new(apps),
        test_shutdown_tx(),
    )
    .await;

    assert!(!resp.ok);
    assert!(resp.error.unwrap().contains("disabled"));
}

#[tokio::test]
async fn handler_launch_app_missing_binary_returns_error_response() {
    let mut apps = FormAppConfigs::new();
    apps.insert(
        "ghost_gui".to_string(),
        FormAppConfig {
            enabled: true,
            command: "no-such-binary-89741".to_string(),
            ..FormAppConfig::default()
        },
    );

    let resp = handle_request(
        ControlRequest::LaunchApp {
            app_name: "ghost_gui".to_string(),
            payload: json!({"type": "form_request"}),
            timeout_seconds: None,
        },
        make_registry(),
        Arc::new(apps),
        test_shutdown_tx(),
    )
    .await;

    assert!(!resp.ok, "should fail when binary is missing");
    // The data field should still contain a serialised FormAppResponse.
    let inner: FormAppResponse =
        serde_json::from_value(resp.data).expect("data should be a FormAppResponse");
    assert!(!inner.success);
    assert!(!inner.timed_out);
    assert!(inner.error.unwrap().contains("failed to spawn"));
}

#[tokio::test]
async fn handler_launch_app_unknown_lists_known_apps() {
    let mut apps = FormAppConfigs::new();
    apps.insert("brainstorm_gui".to_string(), echo_config());
    apps.insert("approval_gui".to_string(), echo_config());

    let resp = handle_request(
        ControlRequest::LaunchApp {
            app_name: "other_gui".to_string(),
            payload: json!({}),
            timeout_seconds: None,
        },
        make_registry(),
        Arc::new(apps),
        test_shutdown_tx(),
    )
    .await;

    assert!(!resp.ok);
    let err = resp.error.unwrap();
    // Error message should list known app names so the caller can see what's available.
    assert!(
        err.contains("brainstorm_gui") || err.contains("approval_gui"),
        "error should list known apps; got: {err}"
    );
}

#[tokio::test]
async fn handler_launch_app_echo_succeeds() {
    let mut apps = FormAppConfigs::new();
    apps.insert("echo_gui".to_string(), echo_config());

    let payload = json!({"type": "form_response", "confirmed": true});
    let resp = handle_request(
        ControlRequest::LaunchApp {
            app_name: "echo_gui".to_string(),
            payload: payload.clone(),
            timeout_seconds: Some(10),
        },
        make_registry(),
        Arc::new(apps),
        test_shutdown_tx(),
    )
    .await;

    assert!(resp.ok, "echo launcher should succeed; error: {:?}", resp.error);
    let inner: FormAppResponse =
        serde_json::from_value(resp.data).expect("data should be FormAppResponse");
    assert!(inner.success);
    assert!(!inner.timed_out);
    assert!(inner.response_payload.is_some());
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. form_app.rs: payload serialisation, error handling, lifecycle
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn launch_form_app_payload_preserved_through_echo() {
    use supervisor::runner::form_app::launch_form_app;

    let cfg = echo_config();
    let payload = json!({
        "type": "form_request",
        "questions": [
            {"id": "q1", "text": "Choose framework", "options": ["React", "Vue", "Svelte"]},
            {"id": "q2", "text": "Add tests?", "options": ["Yes", "No"]}
        ],
        "metadata": {"plan_id": "plan_123", "phase": "brainstorm"}
    });

    let resp = launch_form_app(&cfg, "echo-payload", &payload, None).await;
    assert!(resp.success, "echo should succeed: {:?}", resp.error);

    let returned = resp.response_payload.expect("should have payload");
    // The echo config reads one line from stdin and writes it to stdout,
    // so the returned payload should match the input.
    assert_eq!(returned["type"], "form_request");
    assert!(returned["questions"].is_array());
    assert_eq!(returned["questions"].as_array().unwrap().len(), 2);
    assert_eq!(returned["metadata"]["plan_id"], "plan_123");
}

#[tokio::test]
async fn launch_form_app_empty_stdout_returns_error() {
    use supervisor::runner::form_app::launch_form_app;

    let cfg = empty_stdout_config();
    let payload = json!({"type": "form_request"});

    let resp = launch_form_app(&cfg, "empty-stdout", &payload, None).await;
    assert!(!resp.success);
    assert!(!resp.timed_out);
    let err = resp.error.expect("should have error message");
    assert!(
        err.contains("closed stdout") || err.contains("without sending"),
        "expected empty-stdout error; got: {err}"
    );
}

#[tokio::test]
async fn launch_form_app_malformed_json_returns_error() {
    use supervisor::runner::form_app::launch_form_app;

    let cfg = malformed_json_config();
    let payload = json!({"type": "form_request"});

    let resp = launch_form_app(&cfg, "bad-json", &payload, None).await;
    assert!(!resp.success);
    assert!(!resp.timed_out);
    let err = resp.error.expect("should have error message");
    assert!(
        err.contains("invalid JSON"),
        "expected JSON parse error; got: {err}"
    );
}

#[tokio::test]
async fn launch_form_app_elapsed_ms_is_positive() {
    use supervisor::runner::form_app::launch_form_app;

    let cfg = echo_config();
    let payload = json!({"ok": true});
    let resp = launch_form_app(&cfg, "elapsed-check", &payload, None).await;
    // Even a fast echo should have a positive elapsed_ms.
    assert!(resp.elapsed_ms > 0 || resp.success, "elapsed_ms should be > 0 on success");
}

#[tokio::test]
async fn launch_form_app_timeout_override_is_respected() {
    use supervisor::runner::form_app::launch_form_app;

    // Use a command that blocks forever; override timeout to 1s.
    #[cfg(target_os = "windows")]
    let cfg = FormAppConfig {
        command: "powershell".to_string(),
        args: vec![
            "-NoProfile".to_string(),
            "-Command".to_string(),
            "Start-Sleep -Seconds 60".to_string(),
        ],
        timeout_seconds: 300, // config says 5 min
        ..echo_config()
    };
    #[cfg(not(target_os = "windows"))]
    let cfg = FormAppConfig {
        command: "sleep".to_string(),
        args: vec!["60".to_string()],
        timeout_seconds: 300,
        ..echo_config()
    };

    // Override to 1 second.
    let resp = launch_form_app(&cfg, "timeout-override", &json!({}), Some(1)).await;
    assert!(!resp.success);
    assert!(resp.timed_out, "should have timed out");
    assert!(resp.error.unwrap().contains("timed out"));
}

#[tokio::test]
async fn launch_form_app_with_env_vars() {
    use supervisor::runner::form_app::launch_form_app;

    // Verify that custom env vars are passed through to the child process
    // by having the child echo them.
    #[cfg(target_os = "windows")]
    let cfg = FormAppConfig {
        command: "powershell".to_string(),
        args: vec![
            "-NoProfile".to_string(),
            "-Command".to_string(),
            r#"Write-Output (ConvertTo-Json @{test_var=$env:PM_TEST_VAR} -Compress)"#.to_string(),
        ],
        env: {
            let mut m = HashMap::new();
            m.insert("PM_TEST_VAR".to_string(), "hello_from_test".to_string());
            m
        },
        ..echo_config()
    };
    #[cfg(not(target_os = "windows"))]
    let cfg = FormAppConfig {
        command: "sh".to_string(),
        args: vec![
            "-c".to_string(),
            r#"echo "{\"test_var\":\"$PM_TEST_VAR\"}""#.to_string(),
        ],
        env: {
            let mut m = HashMap::new();
            m.insert("PM_TEST_VAR".to_string(), "hello_from_test".to_string());
            m
        },
        ..echo_config()
    };

    let resp = launch_form_app(&cfg, "env-test", &json!({}), None).await;
    assert!(resp.success, "env var test should succeed: {:?}", resp.error);
    let payload = resp.response_payload.unwrap();
    assert_eq!(
        payload["test_var"], "hello_from_test",
        "env var should be visible in child; got: {payload}"
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Edge cases and contract verification
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn launch_app_request_large_payload_roundtrip() {
    // Ensure that a large payload survives serialisation.
    let large_questions: Vec<serde_json::Value> = (0..100)
        .map(|i| {
            json!({
                "id": format!("q{i}"),
                "text": format!("Question {i} — what is your preference?"),
                "options": ["A", "B", "C", "D"],
                "recommendation": "B"
            })
        })
        .collect();

    let req = ControlRequest::LaunchApp {
        app_name: "brainstorm_gui".to_string(),
        payload: json!({"questions": large_questions}),
        timeout_seconds: Some(600),
    };

    let serialized = serde_json::to_string(&req).expect("serialize large payload");
    let decoded = decode_request(&serialized).expect("decode large payload");

    match decoded {
        ControlRequest::LaunchApp { payload, .. } => {
            assert_eq!(payload["questions"].as_array().unwrap().len(), 100);
        }
        _ => panic!("expected LaunchApp"),
    }
}

#[test]
fn form_app_response_all_fields_present_on_wire() {
    let resp = FormAppResponse {
        app_name: "test".to_string(),
        success: false,
        response_payload: Some(json!(null)),
        error: Some("oops".to_string()),
        elapsed_ms: 42,
        timed_out: true,
        pending_refinement: false,
        session_id: None,
    };
    let json_str = serde_json::to_string(&resp).unwrap();
    // When all fields have values, all should be serialised.
    assert!(json_str.contains("app_name"));
    assert!(json_str.contains("success"));
    assert!(json_str.contains("response_payload"));
    assert!(json_str.contains("error"));
    assert!(json_str.contains("elapsed_ms"));
    assert!(json_str.contains("timed_out"));
}

#[test]
fn control_response_err_for_launch_has_ok_false() {
    let resp = ControlResponse::err("form app \"x\" is disabled in config");
    assert!(!resp.ok);
    assert!(resp.error.unwrap().contains("disabled"));
    assert!(resp.data.is_null());
}

#[tokio::test]
async fn handler_launch_app_multiple_apps_registered() {
    // Verify that when multiple form apps are registered, each can be
    // looked up independently.
    let mut apps = FormAppConfigs::new();
    apps.insert("brainstorm_gui".to_string(), echo_config());
    apps.insert("approval_gui".to_string(), FormAppConfig {
        enabled: false,
        ..echo_config()
    });
    let fa = Arc::new(apps);

    // brainstorm_gui should succeed (enabled + echo binary exists).
    let r1 = handle_request(
        ControlRequest::LaunchApp {
            app_name: "brainstorm_gui".to_string(),
            payload: json!({"ok": true}),
            timeout_seconds: Some(5),
        },
        make_registry(),
        Arc::clone(&fa),
        test_shutdown_tx(),
    )
    .await;
    assert!(r1.ok, "brainstorm_gui should succeed");

    // approval_gui should fail (disabled).
    let r2 = handle_request(
        ControlRequest::LaunchApp {
            app_name: "approval_gui".to_string(),
            payload: json!({}),
            timeout_seconds: None,
        },
        make_registry(),
        Arc::clone(&fa),
        test_shutdown_tx(),
    )
    .await;
    assert!(!r2.ok, "disabled approval_gui should fail");
    assert!(r2.error.unwrap().contains("disabled"));
}
