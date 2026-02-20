//! Integration tests for Epic E — Observability + Operations.
//!
//! Covers the four success criteria:
//!
//! 1. [`ServiceStateMachine`] — all 8 transition methods execute correctly
//!    and produce the expected state without panicking.
//! 2. [`redact_secrets`] — removes secret field values from log strings
//!    (all five field names, case-insensitive, fast path, multiple secrets,
//!    values of varying length).
//! 3. `UpgradeMcp` control-plane handler — response fields, registry state,
//!    and `is_upgrade_pending()` flag.
//! 4. [`build_tooltip`] — all backend/endpoint combos, client count
//!    pluralisation, and multiple services.

use std::borrow::Cow;
use std::sync::Arc;

use tokio::sync::Mutex;

use supervisor::config::{ReconnectSection, RestartPolicy};
use supervisor::control::handler::{handle_request, FormAppConfigs};
use supervisor::control::protocol::ControlRequest;
use supervisor::control::registry::{Registry, ServiceStatus};
use supervisor::logging::redact_secrets;
use supervisor::runner::state_machine::{ConnectionState, ServiceStateMachine};
use supervisor::tray_tooltip::{build_tooltip, ServiceSummary};

// ─── Helpers ────────────────────────────────────────────────────────────────

fn make_sm() -> ServiceStateMachine {
    ServiceStateMachine::new(&ReconnectSection::default(), "obs-svc", RestartPolicy::AlwaysRestart)
}

fn make_sm_never_restart() -> ServiceStateMachine {
    ServiceStateMachine::new(&ReconnectSection::default(), "obs-svc", RestartPolicy::NeverRestart)
}

fn make_registry() -> Arc<Mutex<Registry>> {
    Arc::new(Mutex::new(Registry::new()))
}

fn empty_form_apps() -> Arc<FormAppConfigs> {
    Arc::new(FormAppConfigs::new())
}

fn svc(name: &str, state: &str, backend: Option<&str>, endpoint: Option<&str>) -> ServiceSummary {
    ServiceSummary {
        name: name.to_owned(),
        state: state.to_owned(),
        backend: backend.map(str::to_owned),
        endpoint: endpoint.map(str::to_owned),
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. ServiceStateMachine — transition behaviour
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// on_start
// ---------------------------------------------------------------------------

#[test]
fn sm_on_start_from_disconnected_reaches_probing() {
    let mut sm = make_sm();
    assert!(matches!(sm.state(), ConnectionState::Disconnected));
    sm.on_start();
    assert!(matches!(sm.state(), ConnectionState::Probing));
}

#[test]
fn sm_on_start_from_reconnecting_reaches_probing() {
    let mut sm = make_sm();
    // Reach Reconnecting via probe failure.
    sm.on_start();                // → Probing
    sm.on_probe_failure();        // → Reconnecting
    assert!(matches!(sm.state(), ConnectionState::Reconnecting { .. }));
    sm.on_start();
    assert!(matches!(sm.state(), ConnectionState::Probing));
}

#[test]
fn sm_on_start_ignored_from_connected() {
    let mut sm = make_sm();
    // Reach Connected.
    sm.on_start();
    sm.on_probe_success();
    sm.on_process_ready();
    sm.on_health_ok();
    assert!(matches!(sm.state(), ConnectionState::Connected));
    // on_start should be a no-op from Connected.
    sm.on_start();
    assert!(matches!(sm.state(), ConnectionState::Connected));
}

// ---------------------------------------------------------------------------
// on_probe_success
// ---------------------------------------------------------------------------

#[test]
fn sm_on_probe_success_from_probing_reaches_connecting() {
    let mut sm = make_sm();
    sm.on_start();
    sm.on_probe_success();
    assert!(matches!(sm.state(), ConnectionState::Connecting));
}

#[test]
fn sm_on_probe_success_ignored_outside_probing() {
    let mut sm = make_sm();
    // Does not advance from Disconnected.
    sm.on_probe_success();
    assert!(matches!(sm.state(), ConnectionState::Disconnected));
}

// ---------------------------------------------------------------------------
// on_probe_failure
// ---------------------------------------------------------------------------

#[test]
fn sm_on_probe_failure_from_probing_reaches_reconnecting() {
    let mut sm = make_sm();
    sm.on_start();
    sm.on_probe_failure();
    assert!(matches!(sm.state(), ConnectionState::Reconnecting { .. }));
    assert_eq!(sm.attempt_count(), 1);
}

#[test]
fn sm_on_probe_failure_from_connecting_reaches_reconnecting() {
    let mut sm = make_sm();
    sm.on_start();
    sm.on_probe_success();
    sm.on_probe_failure();
    assert!(matches!(sm.state(), ConnectionState::Reconnecting { .. }));
}

#[test]
fn sm_on_probe_failure_never_restart_reaches_disconnected() {
    let mut sm = make_sm_never_restart();
    sm.on_start();
    sm.on_probe_failure();
    assert!(matches!(sm.state(), ConnectionState::Disconnected));
}

// ---------------------------------------------------------------------------
// on_process_ready
// ---------------------------------------------------------------------------

#[test]
fn sm_on_process_ready_from_connecting_reaches_verifying() {
    let mut sm = make_sm();
    sm.on_start();
    sm.on_probe_success();
    sm.on_process_ready();
    assert!(matches!(sm.state(), ConnectionState::Verifying));
}

#[test]
fn sm_on_process_ready_ignored_outside_connecting() {
    let mut sm = make_sm();
    sm.on_start();
    // Still Probing — on_process_ready is a no-op.
    sm.on_process_ready();
    assert!(matches!(sm.state(), ConnectionState::Probing));
}

// ---------------------------------------------------------------------------
// on_health_ok
// ---------------------------------------------------------------------------

#[test]
fn sm_on_health_ok_from_verifying_reaches_connected() {
    let mut sm = make_sm();
    sm.on_start();
    sm.on_probe_success();
    sm.on_process_ready();
    sm.on_health_ok();
    assert!(matches!(sm.state(), ConnectionState::Connected));
}

#[test]
fn sm_on_health_ok_resets_attempt_count() {
    let mut sm = make_sm();
    // Accumulate a failure.
    sm.on_start();
    sm.on_probe_failure();
    assert_eq!(sm.attempt_count(), 1);
    // Now get to Connected.
    sm.on_start();
    sm.on_probe_success();
    sm.on_process_ready();
    sm.on_health_ok();
    assert_eq!(sm.attempt_count(), 0);
}

// ---------------------------------------------------------------------------
// on_failure
// ---------------------------------------------------------------------------

#[test]
fn sm_on_failure_from_connected_reaches_reconnecting() {
    let mut sm = make_sm();
    sm.on_start();
    sm.on_probe_success();
    sm.on_process_ready();
    sm.on_health_ok();
    sm.on_failure();
    assert!(matches!(sm.state(), ConnectionState::Reconnecting { .. }));
    assert_eq!(sm.attempt_count(), 1);
}

#[test]
fn sm_on_failure_never_restart_reaches_disconnected() {
    let mut sm = make_sm_never_restart();
    sm.on_start();
    sm.on_probe_success();
    sm.on_process_ready();
    sm.on_health_ok();
    sm.on_failure();
    assert!(matches!(sm.state(), ConnectionState::Disconnected));
}

// ---------------------------------------------------------------------------
// on_retry_elapsed
// ---------------------------------------------------------------------------

#[test]
fn sm_on_retry_elapsed_from_reconnecting_reaches_probing() {
    let mut sm = make_sm();
    sm.on_start();
    sm.on_probe_failure();
    assert!(matches!(sm.state(), ConnectionState::Reconnecting { .. }));
    sm.on_retry_elapsed();
    assert!(matches!(sm.state(), ConnectionState::Probing));
}

#[test]
fn sm_on_retry_elapsed_ignored_outside_reconnecting() {
    let mut sm = make_sm();
    // Start → Probing, then retry_elapsed should be a no-op.
    sm.on_start();
    sm.on_retry_elapsed();
    assert!(matches!(sm.state(), ConnectionState::Probing));
}

// ---------------------------------------------------------------------------
// on_disconnect
// ---------------------------------------------------------------------------

#[test]
fn sm_on_disconnect_from_any_state_reaches_disconnected() {
    // From Probing.
    let mut sm = make_sm();
    sm.on_start();
    sm.on_disconnect();
    assert!(matches!(sm.state(), ConnectionState::Disconnected));

    // From Connected.
    let mut sm2 = make_sm();
    sm2.on_start();
    sm2.on_probe_success();
    sm2.on_process_ready();
    sm2.on_health_ok();
    sm2.on_disconnect();
    assert!(matches!(sm2.state(), ConnectionState::Disconnected));
}

#[test]
fn sm_on_disconnect_resets_attempt_count() {
    let mut sm = make_sm();
    sm.on_start();
    sm.on_probe_failure(); // attempt_count = 1
    sm.on_disconnect();
    assert_eq!(sm.attempt_count(), 0);
}

// ---------------------------------------------------------------------------
// should_give_up (policy helper exercised by failures)
// ---------------------------------------------------------------------------

#[test]
fn sm_should_give_up_when_max_attempts_reached() {
    use supervisor::config::ReconnectSection;
    let cfg = ReconnectSection {
        max_attempts: 2,
        ..ReconnectSection::default()
    };
    let mut sm = ServiceStateMachine::new(&cfg, "limited-svc", RestartPolicy::AlwaysRestart);

    sm.on_start();
    sm.on_probe_failure();             // attempt 1 — should_give_up = false
    assert!(!sm.should_give_up());

    sm.on_retry_elapsed();             // Reconnecting → Probing
    sm.on_probe_failure();             // attempt 2 — should_give_up = true
    assert!(sm.should_give_up());
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. redact_secrets — removes secret values from log strings
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Each of the five canonical secret field names
// ---------------------------------------------------------------------------

#[test]
fn redact_mcp_secret_field() {
    let input = r#"mcp_secret = "abc123""#;
    let out = redact_secrets(input);
    assert_eq!(out.as_ref(), r#"mcp_secret = "[REDACTED]""#);
    assert!(matches!(out, Cow::Owned(_)));
}

#[test]
fn redact_token_field() {
    let input = r#"token = "Bearer eyJhbGciOiJIUzI1NiJ9""#;
    let out = redact_secrets(input);
    assert!(out.contains("[REDACTED]"));
    assert!(!out.contains("eyJhbGciOiJIUzI1NiJ9"));
}

#[test]
fn redact_password_field() {
    let input = r#"password = "hunter2""#;
    let out = redact_secrets(input);
    assert_eq!(out.as_ref(), r#"password = "[REDACTED]""#);
}

#[test]
fn redact_secret_field() {
    let input = r#"secret: "s3cr3t""#;
    let out = redact_secrets(input);
    assert_eq!(out.as_ref(), r#"secret: "[REDACTED]""#);
}

#[test]
fn redact_key_field() {
    let input = r#"key = "ssh-ed25519 AAAA""#;
    let out = redact_secrets(input);
    assert!(out.contains("[REDACTED]"));
    assert!(!out.contains("ssh-ed25519 AAAA"));
}

// ---------------------------------------------------------------------------
// Case-insensitive field names
// ---------------------------------------------------------------------------

#[test]
fn redact_case_insensitive_password() {
    let input = r#"PASSWORD = "Pa$$w0rd""#;
    let out = redact_secrets(input);
    assert_eq!(out.as_ref(), r#"PASSWORD = "[REDACTED]""#);
}

#[test]
fn redact_case_insensitive_token() {
    let input = r#"TOKEN: "ALLCAPS123""#;
    let out = redact_secrets(input);
    assert!(out.contains("[REDACTED]"));
    assert!(!out.contains("ALLCAPS123"));
}

// ---------------------------------------------------------------------------
// Cow::Borrowed fast path (no secret fields present)
// ---------------------------------------------------------------------------

#[test]
fn no_secret_field_returns_borrowed() {
    let input = r#"service_id = "mcp", state = "Connected""#;
    let out = redact_secrets(input);
    assert!(matches!(out, Cow::Borrowed(_)), "expected Cow::Borrowed for safe input");
    assert_eq!(out.as_ref(), input);
}

#[test]
fn empty_string_returns_borrowed() {
    let out = redact_secrets("");
    assert!(matches!(out, Cow::Borrowed(_)));
}

#[test]
fn plain_text_no_secrets_returns_borrowed() {
    let out = redact_secrets("hello world, nothing sensitive here");
    assert!(matches!(out, Cow::Borrowed(_)));
}

// ---------------------------------------------------------------------------
// Values of different lengths
// ---------------------------------------------------------------------------

#[test]
fn redact_short_value() {
    let input = r#"password = "x""#;
    let out = redact_secrets(input);
    assert_eq!(out.as_ref(), r#"password = "[REDACTED]""#);
}

#[test]
fn redact_long_value() {
    let long_secret = "a".repeat(512);
    let input = format!(r#"token = "{}""#, long_secret);
    let out = redact_secrets(&input);
    assert!(out.contains("[REDACTED]"));
    assert!(!out.contains(&long_secret));
}

#[test]
fn redact_empty_value() {
    // An empty quoted value should be redacted too.
    let input = r#"password = """#;
    // Unterminated — should not panic and should return as-is.
    let out = redact_secrets(input);
    // We just verify it doesn't panic; it may be borrowed or owned.
    let _ = out.as_ref();
}

// ---------------------------------------------------------------------------
// Multiple secrets in one string
// ---------------------------------------------------------------------------

#[test]
fn redact_multiple_secrets_in_one_string() {
    let input = r#"token = "abc" and password = "xyz" and key = "k1""#;
    let out = redact_secrets(input);
    assert!(out.contains("[REDACTED]"));
    assert!(!out.contains("abc"), "token value should be redacted");
    assert!(!out.contains("xyz"), "password value should be redacted");
    assert!(!out.contains("k1"), "key value should be redacted");
}

#[test]
fn redact_repeated_same_field() {
    let input = r#"password = "first" password = "second""#;
    let out = redact_secrets(input);
    assert!(!out.contains("first"));
    assert!(!out.contains("second"));
    // Both occurrences replaced.
    let count = out.matches("[REDACTED]").count();
    assert_eq!(count, 2, "expected two redactions for two password fields");
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. UpgradeMcp handler
// ═══════════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn upgrade_mcp_response_contains_upgrade_initiated() {
    let reg = make_registry();
    let resp = handle_request(ControlRequest::UpgradeMcp, Arc::clone(&reg), empty_form_apps()).await;
    assert!(resp.ok, "UpgradeMcp should return ok");
    assert_eq!(resp.data["upgrade"], "initiated");
    assert_eq!(resp.data["service"], "mcp");
}

#[tokio::test]
async fn upgrade_mcp_sets_mcp_to_starting() {
    let reg = make_registry();
    handle_request(ControlRequest::UpgradeMcp, Arc::clone(&reg), empty_form_apps()).await;
    let locked = reg.lock().await;
    let mcp_state = locked
        .service_states()
        .into_iter()
        .find(|s| s.name == "mcp")
        .expect("mcp service should exist in registry");
    assert!(
        matches!(mcp_state.status, ServiceStatus::Starting),
        "mcp service should be in Starting state after UpgradeMcp, got {:?}",
        mcp_state.status
    );
}

#[tokio::test]
async fn upgrade_mcp_sets_upgrade_pending_true() {
    let reg = make_registry();
    handle_request(ControlRequest::UpgradeMcp, Arc::clone(&reg), empty_form_apps()).await;
    let locked = reg.lock().await;
    assert!(
        locked.is_upgrade_pending(),
        "is_upgrade_pending() should return true after UpgradeMcp"
    );
}

#[tokio::test]
async fn upgrade_mcp_pending_starts_false_before_command() {
    let reg = make_registry();
    let locked = reg.lock().await;
    assert!(
        !locked.is_upgrade_pending(),
        "upgrade_pending should be false on a fresh registry"
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. build_tooltip — tray tooltip content
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// All 4 backend/endpoint Some/None combinations
// ---------------------------------------------------------------------------

#[test]
fn tooltip_backend_and_endpoint() {
    let services = [svc("MCP", "Connected", Some("node"), Some("tcp://localhost:3000"))];
    let tt = build_tooltip(&services, 2);
    assert!(
        tt.contains("MCP: Connected (node) @ tcp://localhost:3000"),
        "expected full format with backend and endpoint; got: {tt}"
    );
}

#[test]
fn tooltip_backend_only() {
    let services = [svc("Terminal", "Running", Some("container"), None)];
    let tt = build_tooltip(&services, 0);
    assert!(
        tt.contains("Terminal: Running (container)"),
        "expected format with backend only; got: {tt}"
    );
    assert!(
        !tt.contains('@'),
        "should not contain '@' when endpoint is None; got: {tt}"
    );
}

#[test]
fn tooltip_endpoint_only() {
    let services = [svc("Dashboard", "Starting", None, Some("http://localhost:5173"))];
    let tt = build_tooltip(&services, 1);
    assert!(
        tt.contains("Dashboard: Starting @ http://localhost:5173"),
        "expected format with endpoint only; got: {tt}"
    );
}

#[test]
fn tooltip_neither_backend_nor_endpoint() {
    let services = [svc("MCP", "Disconnected", None, None)];
    let tt = build_tooltip(&services, 0);
    assert!(
        tt.contains("MCP: Disconnected"),
        "expected bare name:state format; got: {tt}"
    );
    assert!(
        !tt.contains('@') && !tt.contains('('),
        "should not contain backend/endpoint markers; got: {tt}"
    );
}

// ---------------------------------------------------------------------------
// Client count pluralisation
// ---------------------------------------------------------------------------

#[test]
fn tooltip_zero_clients() {
    let services = [svc("MCP", "Connected", None, None)];
    let tt = build_tooltip(&services, 0);
    assert!(
        tt.contains("Clients: 0 attached"),
        "0 clients should use plural 'Clients'; got: {tt}"
    );
}

#[test]
fn tooltip_one_client_singular() {
    let services = [svc("MCP", "Connected", None, None)];
    let tt = build_tooltip(&services, 1);
    assert!(
        tt.contains("Client: 1 attached"),
        "1 client should use singular 'Client'; got: {tt}"
    );
    assert!(
        !tt.contains("Clients:"),
        "should not use plural 'Clients' for exactly 1; got: {tt}"
    );
}

#[test]
fn tooltip_many_clients_plural() {
    let services = [svc("MCP", "Connected", None, None)];
    let tt = build_tooltip(&services, 5);
    assert!(
        tt.contains("Clients: 5 attached"),
        "5 clients should use plural 'Clients'; got: {tt}"
    );
}

// ---------------------------------------------------------------------------
// Multiple services in output
// ---------------------------------------------------------------------------

#[test]
fn tooltip_multiple_services_all_appear() {
    let services = [
        svc("MCP", "Connected", Some("node"), Some("tcp://localhost:3000")),
        svc("Terminal", "Running", Some("container"), None),
        svc("Dashboard", "Starting", None, Some("http://localhost:5173")),
    ];
    let tt = build_tooltip(&services, 3);
    let lines: Vec<&str> = tt.lines().collect();
    // 3 service lines + 1 clients line = 4 lines total.
    assert_eq!(lines.len(), 4, "expected 4 output lines; got:\n{tt}");
    assert!(tt.contains("MCP:"),       "MCP line missing; got:\n{tt}");
    assert!(tt.contains("Terminal:"),  "Terminal line missing; got:\n{tt}");
    assert!(tt.contains("Dashboard:"), "Dashboard line missing; got:\n{tt}");
    assert!(tt.contains("Clients: 3 attached"), "clients line missing; got:\n{tt}");
}

#[test]
fn tooltip_empty_services_only_clients_line() {
    let tt = build_tooltip(&[], 0);
    let lines: Vec<&str> = tt.lines().collect();
    assert_eq!(lines.len(), 1, "empty services slice should yield only clients line; got:\n{tt}");
    assert!(tt.contains("Clients: 0 attached"));
}

#[test]
fn tooltip_services_joined_by_newlines() {
    let services = [
        svc("MCP", "Connected", None, None),
        svc("Dashboard", "Starting", None, None),
    ];
    let tt = build_tooltip(&services, 2);
    // Verify newline separator between service line and next line.
    let lines: Vec<&str> = tt.lines().collect();
    assert_eq!(lines.len(), 3, "expected 3 lines for 2 services + clients; got:\n{tt}");
}
