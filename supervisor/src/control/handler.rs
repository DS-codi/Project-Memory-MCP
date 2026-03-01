//! Control-plane request handler.
//!
//! [`handle_request`] dispatches a decoded [`ControlRequest`] to the
//! appropriate [`Registry`] operation and produces a [`ControlResponse`].

use std::sync::Arc;

use serde_json::json;
use tokio::sync::Mutex;

use crate::config::FormAppConfig;
use crate::control::mcp_admin;
use crate::control::mcp_runtime::McpSubprocessRuntime;
use crate::control::protocol::{ControlRequest, ControlResponse};
use crate::control::registry::{Registry, ServiceStatus};
use crate::runner::form_app::{continue_form_app, launch_form_app};

fn deprecated_pool_response(command: &str) -> ControlResponse {
    ControlResponse::ok(json!({
        "supported": false,
        "deprecated": true,
        "reason": "instance_pool_removed",
        "command": command,
        "runtime_mode": "native_supervisor",
    }))
}

/// Resolved form-app configuration map, keyed by app name.
///
/// Callers construct this from [`SupervisorConfig`] at startup and share it
/// with the handler via `Arc`.
pub type FormAppConfigs = std::collections::HashMap<String, FormAppConfig>;

/// Dispatch one control-plane request and return its response.
///
/// The registry is protected by an async mutex so multiple inflight requests
/// can be handled concurrently without data races.
///
/// `form_apps` provides the resolved executable config for each on-demand
/// GUI app so that `LaunchApp` can spawn the correct binary.
///
/// `mcp_base_url` is the base URL of the *primary* MCP instance (e.g.
/// `"http://127.0.0.1:3460"`). Used by `CloseMcpConnection` to call the admin
/// API.  When `None` the command returns an error rather than panicking.
pub async fn handle_request(
    req: ControlRequest,
    registry: Arc<Mutex<Registry>>,
    form_apps: Arc<FormAppConfigs>,
    shutdown_tx: tokio::sync::watch::Sender<bool>,
) -> ControlResponse {
    handle_request_with_options(
        req,
        registry,
        form_apps,
        shutdown_tx,
        None,
        None,
        None,
        None,
    )
    .await
}

pub async fn handle_request_with_options(
    req: ControlRequest,
    registry: Arc<Mutex<Registry>>,
    form_apps: Arc<FormAppConfigs>,
    shutdown_tx: tokio::sync::watch::Sender<bool>,
    mcp_base_url: Option<String>,
    events_handle: Option<crate::events::EventsHandle>,
    events_url: Option<String>,
    restart_tx: Option<tokio::sync::mpsc::Sender<String>>,
) -> ControlResponse {
    handle_request_with_runtime(
        req,
        registry,
        form_apps,
        shutdown_tx,
        mcp_base_url,
        events_handle,
        events_url,
        restart_tx,
        None,
    )
    .await
}

pub async fn handle_request_with_runtime(
    req: ControlRequest,
    registry: Arc<Mutex<Registry>>,
    form_apps: Arc<FormAppConfigs>,
    shutdown_tx: tokio::sync::watch::Sender<bool>,
    mcp_base_url: Option<String>,
    events_handle: Option<crate::events::EventsHandle>,
    events_url: Option<String>,
    restart_tx: Option<tokio::sync::mpsc::Sender<String>>,
    mcp_runtime: Option<Arc<McpSubprocessRuntime>>,
) -> ControlResponse {
    match req {
        // ---------------------------------------------------------------
        // Status — snapshot of all service states
        // ---------------------------------------------------------------
        ControlRequest::Status => {
            let reg = registry.lock().await;
            let states = reg.service_states();
            match serde_json::to_value(&states) {
                Ok(data) => ControlResponse::ok(data),
                Err(e) => ControlResponse::err(format!("serialisation error: {e}")),
            }
        }

        // ---------------------------------------------------------------
        // Start — for interactive_terminal: on-demand launch with
        // idempotency guard (Running/Starting → return success immediately).
        // For other services: update registry status only (legacy behaviour).
        // ---------------------------------------------------------------
        ControlRequest::Start { service } => {
            if service == "interactive_terminal" {
                // Check current status — avoid spawning a duplicate process.
                let current_status = {
                    let reg = registry.lock().await;
                    reg.service_states()
                        .into_iter()
                        .find(|s| s.name == service)
                        .map(|s| s.status)
                };
                match current_status {
                    Some(ServiceStatus::Running) | Some(ServiceStatus::Starting) => {
                        // Already running or in the process of starting — idempotent.
                        return ControlResponse::ok(
                            json!({ "service": service, "status": "already_running" }),
                        );
                    }
                    _ => {
                        // Not running — dispatch via restart channel so the main
                        // loop calls terminal_runner.start() on the correct task.
                        if let Some(ref tx) = restart_tx {
                            match tx.send(service.clone()).await {
                                Ok(()) => {
                                    let mut reg = registry.lock().await;
                                    reg.set_service_status(&service, ServiceStatus::Starting);
                                    return ControlResponse::ok(
                                        json!({ "service": service, "status": "starting" }),
                                    );
                                }
                                Err(e) => {
                                    return ControlResponse::err(format!(
                                        "on-demand launch dispatch failed: {e}"
                                    ));
                                }
                            }
                        }
                        // No restart channel (e.g. unit-test context) — fall through
                        // to the legacy registry-only update.
                        let mut reg = registry.lock().await;
                        reg.set_service_status(&service, ServiceStatus::Starting);
                        ControlResponse::ok(json!({ "service": service, "status": "starting" }))
                    }
                }
            } else {
                let mut reg = registry.lock().await;
                reg.set_service_status(&service, ServiceStatus::Starting);
                ControlResponse::ok(json!({ "service": service, "status": "starting" }))
            }
        }

        // ---------------------------------------------------------------
        // Stop
        // ---------------------------------------------------------------
        ControlRequest::Stop { service } => {
            let mut reg = registry.lock().await;
            reg.set_service_status(&service, ServiceStatus::Stopping);
            ControlResponse::ok(json!({ "service": service, "status": "stopping" }))
        }

        // ---------------------------------------------------------------
        // Restart — dispatch to the main loop so stop()+start() are called
        // on the actual runner.  Falls back to a registry-only update when
        // no restart channel is available (e.g. unit tests).
        // ---------------------------------------------------------------
        ControlRequest::Restart { service } => {
            if let Some(ref tx) = restart_tx {
                match tx.send(service.clone()).await {
                    Ok(()) => ControlResponse::ok(json!({ "service": service, "status": "starting" })),
                    Err(e) => ControlResponse::err(format!("restart dispatch failed: {e}")),
                }
            } else {
                let mut reg = registry.lock().await;
                reg.set_service_status(&service, ServiceStatus::Stopping);
                reg.set_service_status(&service, ServiceStatus::Starting);
                ControlResponse::ok(json!({ "service": service, "status": "starting" }))
            }
        }

        // ---------------------------------------------------------------
        // SetBackend — switch active backend
        // ---------------------------------------------------------------
        ControlRequest::SetBackend { backend } => {
            let backend_name = format!("{backend:?}").to_lowercase();
            let mut reg = registry.lock().await;
            reg.set_backend(backend);
            ControlResponse::ok(json!({ "active_backend": backend_name }))
        }

        // ---------------------------------------------------------------
        // ListClients
        // ---------------------------------------------------------------
        ControlRequest::ListClients => {
            let reg = registry.lock().await;
            let clients = reg.list_clients();
            match serde_json::to_value(&clients) {
                Ok(data) => ControlResponse::ok(data),
                Err(e) => ControlResponse::err(format!("serialisation error: {e}")),
            }
        }

        // ---------------------------------------------------------------
        // AttachClient
        // ---------------------------------------------------------------
        ControlRequest::AttachClient { pid, window_id } => {
            let mut reg = registry.lock().await;
            let client_id = reg.attach_client(pid, window_id);
            ControlResponse::ok(json!({ "client_id": client_id }))
        }

        // ---------------------------------------------------------------
        // DetachClient
        // ---------------------------------------------------------------
        ControlRequest::DetachClient { client_id } => {
            let mut reg = registry.lock().await;
            if reg.detach_client(&client_id) {
                ControlResponse::ok(json!({ "client_id": client_id, "detached": true }))
            } else {
                ControlResponse::err(format!("client not found: {client_id}"))
            }
        }

        // ---------------------------------------------------------------
        // WhoAmI — acknowledge the client identity probe
        // ---------------------------------------------------------------
        ControlRequest::WhoAmI(req) => {
            // The client has sent its identity.  The supervisor echoes it back
            // so the caller can confirm the round-trip.  Active endpoint
            // validation (sending WhoAmIRequest to the MCP server and calling
            // validate_handshake) is performed by the handshake initiator in
            // `crate::control::handshake`, not in this dispatch path.
            eprintln!("[supervisor] WhoAmI request received from client: {}", req.client);
            ControlResponse::ok(json!({
                "message": "WhoAmI received",
                "client": req.client,
                "client_version": req.client_version
            }))
        }

        // ---------------------------------------------------------------
        // ServiceHealth — per-service health snapshot
        // ---------------------------------------------------------------
        ControlRequest::ServiceHealth { service } => {
            let reg = registry.lock().await;
            match reg.service_health(&service) {
                Some(health) => match serde_json::to_value(&health) {
                    Ok(mut data) => {
                        if data.get("name").is_none() {
                            data["name"] = json!(service);
                        }
                        ControlResponse::ok(data)
                    }
                    Err(e) => ControlResponse::err(format!("serialisation error: {e}")),
                },
                None => ControlResponse::err(format!("unknown service: {service}")),
            }
        }

        // ---------------------------------------------------------------
        // StateEvents — last N state-transition events for a service
        // ---------------------------------------------------------------
        ControlRequest::StateEvents { service, limit } => {
            let reg = registry.lock().await;
            let events = reg.state_events(&service, limit.unwrap_or(50));
            match serde_json::to_value(&events) {
                Ok(data) => ControlResponse::ok(data),
                Err(e) => ControlResponse::err(format!("serialisation error: {e}")),
            }
        }

        // ---------------------------------------------------------------
        // HealthSnapshot — aggregate + per-child status for minimal GUI
        // ---------------------------------------------------------------
        ControlRequest::HealthSnapshot => {
            let reg = registry.lock().await;
            match serde_json::to_value(reg.health_snapshot()) {
                Ok(data) => ControlResponse::ok(data),
                Err(e) => ControlResponse::err(format!("serialisation error: {e}")),
            }
        }

        // ---------------------------------------------------------------
        // SetHealthWindowVisibility
        // ---------------------------------------------------------------
        ControlRequest::SetHealthWindowVisibility { visible } => {
            let mut reg = registry.lock().await;
            reg.set_health_window_visible(visible);
            ControlResponse::ok(json!({ "health_window_visible": visible }))
        }

        // ---------------------------------------------------------------
        // ShutdownSupervisor — signal graceful shutdown in main runtime
        // ---------------------------------------------------------------
        ControlRequest::ShutdownSupervisor => {
            let _ = shutdown_tx.send(true);
            ControlResponse::ok(json!({ "shutdown": "requested" }))
        }

        // ---------------------------------------------------------------
        // UpgradeMcp — zero-downtime MCP upgrade: drain → stop → start
        // ---------------------------------------------------------------
        ControlRequest::UpgradeMcp => {
            if mcp_runtime.is_some() {
                return ControlResponse::ok(json!({
                    "upgrade": "noop",
                    "service": "mcp",
                    "runtime_mode": "native_supervisor",
                    "note": "instance pool removed; runtime remains supervisor-native",
                }));
            }
            let mut reg = registry.lock().await;
            reg.set_upgrade_pending(true);
            reg.set_service_status("mcp", ServiceStatus::Stopping);
            reg.set_service_status("mcp", ServiceStatus::Starting);
            ControlResponse::ok(json!({ "upgrade": "initiated", "service": "mcp" }))
        }

        // ---------------------------------------------------------------
        // ListMcpConnections — all tracked VS Code ↔ MCP sessions
        // ---------------------------------------------------------------
        ControlRequest::ListMcpConnections => {
            if let Some(runtime) = &mcp_runtime {
                if !runtime.is_enabled() {
                    let reg = registry.lock().await;
                    let conns = reg.list_mcp_connections();
                    return match serde_json::to_value(&conns) {
                        Ok(data) => ControlResponse::ok(data),
                        Err(e) => ControlResponse::err(format!("serialisation error: {e}")),
                    };
                }
                let sessions = runtime.list_sessions().await;
                return ControlResponse::ok(json!({
                    "runtime_mode": "native_supervisor",
                    "sessions": sessions,
                }));
            }
            let reg = registry.lock().await;
            let conns = reg.list_mcp_connections();
            match serde_json::to_value(&conns) {
                Ok(data) => ControlResponse::ok(data),
                Err(e) => ControlResponse::err(format!("serialisation error: {e}")),
            }
        }

        // ---------------------------------------------------------------
        // CloseMcpConnection — close one VS Code session
        // ---------------------------------------------------------------
        ControlRequest::CloseMcpConnection { session_id } => {
            if let Some(runtime) = &mcp_runtime {
                if runtime.is_enabled() {
                    return match runtime.cancel_session(&session_id).await {
                        Ok(data) => ControlResponse::ok(json!({
                            "runtime_mode": "native_supervisor",
                            "cancelled": true,
                            "session_id": session_id,
                            "result": data,
                        })),
                        Err(e) => {
                            ControlResponse::err(format!("failed to cancel runtime session: {e}"))
                        }
                    };
                }
            }

            let base_url = match &mcp_base_url {
                Some(u) => u.clone(),
                None => return ControlResponse::err("mcp_base_url not configured"),
            };
            match mcp_admin::close_mcp_connection(&base_url, &session_id, 3000).await {
                Ok(true) => {
                    let mut reg = registry.lock().await;
                    reg.deregister_mcp_connection(&session_id);
                    ControlResponse::ok(json!({ "closed": true, "session_id": session_id }))
                }
                Ok(false) => ControlResponse::err(format!("session not found: {session_id}")),
                Err(e) => ControlResponse::err(format!("failed to close session: {e}")),
            }
        }

        // ---------------------------------------------------------------
        // ListMcpInstances — list instance ports known to the pool
        // ---------------------------------------------------------------
        ControlRequest::ListMcpInstances => {
            if mcp_runtime.is_some() {
                return deprecated_pool_response("ListMcpInstances");
            }

            let reg = registry.lock().await;
            let conns = reg.list_mcp_connections();
            let mut by_port: std::collections::HashMap<u16, usize> = std::collections::HashMap::new();
            for c in &conns {
                *by_port.entry(c.instance_port).or_insert(0) += 1;
            }
            let instances: Vec<serde_json::Value> = by_port
                .into_iter()
                .map(|(port, count)| json!({ "port": port, "connection_count": count }))
                .collect();
            ControlResponse::ok(serde_json::Value::Array(instances))
        }

        // ---------------------------------------------------------------
        // ScaleUpMcp — manual pool scale-up trigger
        // ---------------------------------------------------------------
        ControlRequest::ScaleUpMcp => {
            if mcp_runtime.is_some() {
                return deprecated_pool_response("ScaleUpMcp");
            }

            ControlResponse::ok(json!({ "scale_up": "requested" }))
        }

        ControlRequest::SetMcpRuntimePolicy {
            enabled,
            wave_cohorts,
            hard_stop_gate,
        } => {
            let Some(runtime) = &mcp_runtime else {
                return ControlResponse::err(
                    "mcp runtime policy unavailable (MCP node runtime not configured)",
                );
            };

            let policy = runtime
                .set_policy(enabled, wave_cohorts, hard_stop_gate)
                .await;

            ControlResponse::ok(json!({
                "runtime_mode": "native_supervisor",
                "policy": policy,
            }))
        }

        // ---------------------------------------------------------------
        // McpRuntimeExec — execute payload through supervisor subprocess runtime
        // ---------------------------------------------------------------
        ControlRequest::McpRuntimeExec { payload, timeout_ms } => {
            let Some(runtime) = mcp_runtime else {
                return ControlResponse {
                    ok: false,
                    error: Some(
                        "mcp runtime mode is disabled (set PM_SUPERVISOR_MCP_SUBPROCESS_RUNTIME=1)"
                            .to_string(),
                    ),
                    data: json!({
                        "runtime_mode": "native_supervisor",
                        "error_envelope": {
                            "error_class": "runtime_precondition",
                            "reason": "runtime_disabled",
                            "required_env": {
                                "PM_SUPERVISOR_MCP_SUBPROCESS_RUNTIME": "1",
                                "PM_SUPERVISOR_MCP_SUBPROCESS_WAVE_COHORTS": "wave1",
                                "PM_SUPERVISOR_MCP_SUBPROCESS_HARD_STOP_GATE": "1"
                            },
                            "wave1_validation": {
                                "cohort": "wave1",
                                "hard_stop_gate_required": true
                            }
                        }
                    }),
                };
            };

            if !runtime.is_enabled() {
                return ControlResponse {
                    ok: false,
                    error: Some(
                        "mcp runtime mode is disabled (enable with SetMcpRuntimePolicy)"
                            .to_string(),
                    ),
                    data: json!({
                        "runtime_mode": "native_supervisor",
                        "error_envelope": {
                            "error_class": "runtime_precondition",
                            "reason": "runtime_disabled",
                            "required_control": {
                                "type": "SetMcpRuntimePolicy",
                                "enabled": true,
                                "wave_cohorts": ["wave1"],
                                "hard_stop_gate": true
                            },
                        }
                    }),
                };
            }

            match runtime.execute(&payload, timeout_ms).await {
                Ok(data) => ControlResponse::ok(json!({
                    "runtime_mode": "native_supervisor",
                    "execution": data,
                    "telemetry": runtime.telemetry_snapshot(),
                })),
                Err(e) => {
                    let error_message = format!("mcp runtime execution failed: {e}");
                    let error_envelope = e.envelope();
                    let failure_log_path = crate::control::runtime::failure_log::append_failed_tool_call(
                        &payload,
                        &error_message,
                        &error_envelope,
                    )
                    .await;

                    let mut response_data = json!({
                        "runtime_mode": "native_supervisor",
                        "error_envelope": error_envelope,
                        "telemetry": runtime.telemetry_snapshot(),
                    });

                    match failure_log_path {
                        Ok(path) => {
                            response_data["failure_log_path"] = json!(path.to_string_lossy().to_string());
                        }
                        Err(err) => {
                            tracing::warn!(error = %err, "failed to write runtime failure log");
                        }
                    }

                    ControlResponse {
                        ok: false,
                        error: Some(error_message),
                        data: response_data,
                    }
                }
            }
        }

        // ---------------------------------------------------------------
        // ContinueApp — pipe a refinement response into a paused session
        // ---------------------------------------------------------------
        ControlRequest::ContinueApp {
            session_id,
            payload,
            timeout_seconds,
        } => {
            let resp = continue_form_app(&session_id, &payload, timeout_seconds).await;
            match serde_json::to_value(&resp) {
                Ok(data) => {
                    if resp.success {
                        ControlResponse::ok(data)
                    } else {
                        ControlResponse {
                            ok: false,
                            error: resp.error.clone(),
                            data,
                        }
                    }
                }
                Err(e) => ControlResponse::err(format!("serialisation error: {e}")),
            }
        }

        // ---------------------------------------------------------------
        // LaunchApp — on-demand form-app lifecycle
        // ---------------------------------------------------------------
        ControlRequest::LaunchApp {
            app_name,
            payload,
            timeout_seconds,
        } => {
            let cfg = match form_apps.get(&app_name) {
                Some(c) if c.enabled => c,
                Some(_) => {
                    return ControlResponse::err(format!(
                        "form app \"{app_name}\" is disabled in config"
                    ));
                }
                None => {
                    return ControlResponse::err(format!(
                        "unknown form app: \"{app_name}\". \
                         Known apps: {:?}",
                        form_apps.keys().collect::<Vec<_>>()
                    ));
                }
            };

            let resp = launch_form_app(cfg, &app_name, &payload, timeout_seconds).await;
            match serde_json::to_value(&resp) {
                Ok(data) => {
                    if resp.success {
                        ControlResponse::ok(data)
                    } else {
                        ControlResponse {
                            ok: false,
                            error: resp.error.clone(),
                            data,
                        }
                    }
                }
                Err(e) => ControlResponse::err(format!("serialisation error: {e}")),
            }
        }

        // ---------------------------------------------------------------
        // Events — broadcast channel commands
        // ---------------------------------------------------------------
        ControlRequest::SubscribeEvents => ControlResponse::ok(json!({
            "events_url": events_url,
            "note": "Connect to the events_url for an SSE stream."
        })),

        ControlRequest::EventStats => {
            let (enabled, subscriber_count, events_emitted) = match &events_handle {
                Some(h) => (true, h.subscriber_count(), h.events_emitted()),
                None => (false, 0, 0),
            };
            let runtime_telemetry = mcp_runtime
                .as_ref()
                .map(|runtime| runtime.telemetry_snapshot())
                .unwrap_or(serde_json::Value::Null);
            ControlResponse::ok(json!({
                "enabled": enabled,
                "subscriber_count": subscriber_count,
                "events_emitted": events_emitted,
                "events_url": events_url,
                "runtime_telemetry": runtime_telemetry,
            }))
        }

        ControlRequest::EmitTestEvent { message } => match &events_handle {
            Some(h) => {
                h.emit(crate::events::DataChangeEvent::Test { message }).await;
                ControlResponse::ok(json!({ "emitted": true }))
            }
            None => ControlResponse::err("events channel is not initialised".to_string()),
        },
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::control::protocol::BackendKind;
    use crate::control::mcp_runtime::{McpSubprocessRuntime, McpSubprocessRuntimeConfig};
    use crate::control::registry::Registry;

    async fn handle_request(
        req: ControlRequest,
        registry: Arc<Mutex<Registry>>,
        form_apps: Arc<FormAppConfigs>,
        shutdown_tx: tokio::sync::watch::Sender<bool>,
        mcp_base_url: Option<String>,
        events_handle: Option<crate::events::EventsHandle>,
        events_url: Option<String>,
        restart_tx: Option<tokio::sync::mpsc::Sender<String>>,
    ) -> ControlResponse {
        super::handle_request_with_options(
            req,
            registry,
            form_apps,
            shutdown_tx,
            mcp_base_url,
            events_handle,
            events_url,
            restart_tx,
        )
        .await
    }

    fn make_registry() -> Arc<Mutex<Registry>> {
        Arc::new(Mutex::new(Registry::new()))
    }

    fn empty_form_apps() -> Arc<FormAppConfigs> {
        Arc::new(FormAppConfigs::new())
    }

    fn shutdown_channel() -> tokio::sync::watch::Sender<bool> {
        let (tx, _rx) = tokio::sync::watch::channel(false);
        tx
    }

    fn make_runtime() -> Arc<McpSubprocessRuntime> {
        Arc::new(McpSubprocessRuntime::new(McpSubprocessRuntimeConfig {
            command: "noop".to_string(),
            args: Vec::new(),
            working_dir: None,
            env: std::collections::HashMap::new(),
            runtime_enabled: true,
            max_concurrency: 2,
            queue_limit: 8,
            queue_wait_timeout_ms: 100,
            per_session_inflight_limit: 2,
            default_timeout_ms: 500,
            enabled_wave_cohorts: vec!["wave1".to_string()],
            hard_stop_gate: true,
        }))
    }

    fn make_failing_runtime(working_dir: Option<PathBuf>) -> Arc<McpSubprocessRuntime> {
        Arc::new(McpSubprocessRuntime::new(McpSubprocessRuntimeConfig {
            command: "__pm_missing_runtime_command__".to_string(),
            args: Vec::new(),
            working_dir,
            env: std::collections::HashMap::new(),
            runtime_enabled: true,
            max_concurrency: 2,
            queue_limit: 8,
            queue_wait_timeout_ms: 100,
            per_session_inflight_limit: 2,
            default_timeout_ms: 200,
            enabled_wave_cohorts: vec!["wave1".to_string()],
            hard_stop_gate: true,
        }))
    }

    #[tokio::test]
    async fn status_returns_three_services() {
        let reg = make_registry();
        let resp = handle_request(ControlRequest::Status, reg, empty_form_apps(), shutdown_channel(), None, None, None, None).await;
        assert!(resp.ok);
        let arr = resp.data.as_array().expect("data should be array");
        assert_eq!(arr.len(), 3);
    }

    #[tokio::test]
    async fn start_service_transitions_to_starting() {
        let reg = make_registry();
        let resp = handle_request(
            ControlRequest::Start { service: "mcp".to_string() },
            Arc::clone(&reg),
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
        )
        .await;
        assert!(resp.ok);
        assert_eq!(resp.data["status"], "starting");
        // Verify registry was updated.
        let locked = reg.lock().await;
        let state = locked.service_states().into_iter().find(|s| s.name == "mcp").unwrap();
        assert!(matches!(state.status, ServiceStatus::Starting));
    }

    #[tokio::test]
    async fn stop_service_transitions_to_stopping() {
        let reg = make_registry();
        let resp = handle_request(
            ControlRequest::Stop { service: "dashboard".to_string() },
            Arc::clone(&reg),
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
        )
        .await;
        assert!(resp.ok);
        assert_eq!(resp.data["status"], "stopping");
    }

    #[tokio::test]
    async fn restart_leaves_service_in_starting() {
        let reg = make_registry();
        let resp = handle_request(
            ControlRequest::Restart { service: "mcp".to_string() },
            Arc::clone(&reg),
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
        )
        .await;
        assert!(resp.ok);
        assert_eq!(resp.data["status"], "starting");
    }

    #[tokio::test]
    async fn set_backend_container() {
        let reg = make_registry();
        let resp = handle_request(
            ControlRequest::SetBackend { backend: BackendKind::Container },
            Arc::clone(&reg),
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
        )
        .await;
        assert!(resp.ok);
        assert_eq!(resp.data["active_backend"], "container");
    }

    #[tokio::test]
    async fn attach_and_list_clients() {
        let reg = make_registry();
        let fa = empty_form_apps();
        let attach_resp = handle_request(
            ControlRequest::AttachClient { pid: 999, window_id: "win-1".to_string() },
            Arc::clone(&reg),
            Arc::clone(&fa),
            shutdown_channel(),
            None,
            None,
            None,
            None,
        )
        .await;
        assert!(attach_resp.ok);
        let client_id = attach_resp.data["client_id"].as_str().unwrap().to_string();

        let list_resp = handle_request(ControlRequest::ListClients, Arc::clone(&reg), fa, shutdown_channel(), None, None, None, None).await;
        assert!(list_resp.ok);
        let arr = list_resp.data.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["client_id"], client_id);
    }

    #[tokio::test]
    async fn detach_existing_client_succeeds() {
        let reg = make_registry();
        let fa = empty_form_apps();
        handle_request(
            ControlRequest::AttachClient { pid: 1, window_id: "w".to_string() },
            Arc::clone(&reg),
            Arc::clone(&fa),
            shutdown_channel(),
            None,
            None,
            None,
            None,
        )
        .await;
        let resp = handle_request(
            ControlRequest::DetachClient { client_id: "client-1".to_string() },
            Arc::clone(&reg),
            fa,
            shutdown_channel(),
            None,
            None,
            None,
            None,
        )
        .await;
        assert!(resp.ok);
    }

    #[tokio::test]
    async fn detach_unknown_client_returns_error() {
        let reg = make_registry();
        let resp = handle_request(
            ControlRequest::DetachClient { client_id: "client-99".to_string() },
            reg,
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
        )
        .await;
        assert!(!resp.ok);
        assert!(resp.error.unwrap().contains("client not found"));
    }

    #[tokio::test]
    async fn whoami_echoes_client_identity() {
        use crate::control::protocol::WhoAmIRequest;
        let reg = make_registry();
        let resp = handle_request(
            ControlRequest::WhoAmI(WhoAmIRequest {
                request_id: "r1".to_string(),
                client: "vscode".to_string(),
                client_version: "1.0.0".to_string(),
            }),
            reg,
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
        )
        .await;
        assert!(resp.ok);
        assert_eq!(resp.data["client"], "vscode");
        assert_eq!(resp.data["client_version"], "1.0.0");
        assert_eq!(resp.data["message"], "WhoAmI received");
    }

    #[tokio::test]
    async fn upgrade_mcp_returns_ok_with_upgrade_field() {
        let reg = make_registry();
        let resp = handle_request(ControlRequest::UpgradeMcp, Arc::clone(&reg), empty_form_apps(), shutdown_channel(), None, None, None, None).await;
        assert!(resp.ok, "upgrade_mcp should return ok");
        assert_eq!(resp.data["upgrade"], "initiated");
        assert_eq!(resp.data["service"], "mcp");
    }

    #[tokio::test]
    async fn upgrade_mcp_sets_upgrade_pending_and_mcp_starting() {
        let reg = make_registry();
        handle_request(ControlRequest::UpgradeMcp, Arc::clone(&reg), empty_form_apps(), shutdown_channel(), None, None, None, None).await;
        let locked = reg.lock().await;
        assert!(locked.is_upgrade_pending(), "upgrade_pending should be true after UpgradeMcp");
        let mcp_state = locked.service_states().into_iter().find(|s| s.name == "mcp").unwrap();
        assert!(
            matches!(mcp_state.status, ServiceStatus::Starting),
            "mcp service should be in Starting after upgrade command"
        );
    }

    #[tokio::test]
    async fn launch_app_unknown_name_returns_error() {
        let reg = make_registry();
        let resp = handle_request(
            ControlRequest::LaunchApp {
                app_name: "nonexistent_gui".to_string(),
                payload: serde_json::json!({}),
                timeout_seconds: None,
            },
            reg,
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
        )
        .await;
        assert!(!resp.ok);
        assert!(resp.error.unwrap().contains("unknown form app"));
    }

    #[tokio::test]
    async fn launch_app_disabled_returns_error() {
        let mut apps = FormAppConfigs::new();
        apps.insert("test_gui".to_string(), FormAppConfig {
            enabled: false,
            command: "echo".to_string(),
            ..FormAppConfig::default()
        });
        let reg = make_registry();
        let resp = handle_request(
            ControlRequest::LaunchApp {
                app_name: "test_gui".to_string(),
                payload: serde_json::json!({}),
                timeout_seconds: None,
            },
            reg,
            Arc::new(apps),
            shutdown_channel(),
            None,
            None,
            None,
            None,
        )
        .await;
        assert!(!resp.ok);
        assert!(resp.error.unwrap().contains("disabled"));
    }

    #[tokio::test]
    async fn mcp_runtime_exec_returns_error_when_runtime_not_enabled() {
        let reg = make_registry();
        let resp = handle_request(
            ControlRequest::McpRuntimeExec {
                payload: serde_json::json!({ "method": "ping" }),
                timeout_ms: Some(1000),
            },
            reg,
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
        )
        .await;

        assert!(!resp.ok);
        assert!(resp.error.unwrap().contains("disabled"));
        assert_eq!(resp.data["runtime_mode"], "native_supervisor");
        assert_eq!(resp.data["error_envelope"]["error_class"], "runtime_precondition");
        assert_eq!(resp.data["error_envelope"]["reason"], "runtime_disabled");
        assert_eq!(resp.data["error_envelope"]["required_env"]["PM_SUPERVISOR_MCP_SUBPROCESS_RUNTIME"], "1");
        assert_eq!(resp.data["error_envelope"]["required_env"]["PM_SUPERVISOR_MCP_SUBPROCESS_WAVE_COHORTS"], "wave1");
        assert_eq!(resp.data["error_envelope"]["required_env"]["PM_SUPERVISOR_MCP_SUBPROCESS_HARD_STOP_GATE"], "1");
    }

    #[tokio::test]
    async fn list_mcp_instances_returns_deprecated_response_in_native_runtime_mode() {
        let reg = make_registry();
        let runtime = make_runtime();

        let resp = super::handle_request_with_runtime(
            ControlRequest::ListMcpInstances,
            reg,
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
            Some(runtime),
        )
        .await;

        assert!(resp.ok);
        assert_eq!(resp.data["deprecated"], true);
        assert_eq!(resp.data["reason"], "instance_pool_removed");
    }

    #[tokio::test]
    async fn scale_up_mcp_returns_deprecated_response_in_native_runtime_mode() {
        let reg = make_registry();
        let runtime = make_runtime();

        let resp = super::handle_request_with_runtime(
            ControlRequest::ScaleUpMcp,
            reg,
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
            Some(runtime),
        )
        .await;

        assert!(resp.ok);
        assert_eq!(resp.data["deprecated"], true);
        assert_eq!(resp.data["command"], "ScaleUpMcp");
    }

    #[tokio::test]
    async fn list_mcp_connections_returns_runtime_sessions_in_native_runtime_mode() {
        let reg = make_registry();
        let runtime = make_runtime();

        let _ = runtime
            .execute(&serde_json::json!({ "runtime": { "op": "init" } }), Some(50))
            .await
            .expect("init runtime session");

        let resp = super::handle_request_with_runtime(
            ControlRequest::ListMcpConnections,
            reg,
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
            Some(runtime),
        )
        .await;

        assert!(resp.ok);
        assert_eq!(resp.data["runtime_mode"], "native_supervisor");
        assert!(resp.data["sessions"].is_array());
    }

    #[tokio::test]
    async fn set_runtime_policy_updates_runtime_enabled_state() {
        let reg = make_registry();
        let runtime = make_runtime();

        let disable = super::handle_request_with_runtime(
            ControlRequest::SetMcpRuntimePolicy {
                enabled: Some(false),
                wave_cohorts: Some(vec!["wave2".to_string()]),
                hard_stop_gate: Some(false),
            },
            Arc::clone(&reg),
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
            Some(Arc::clone(&runtime)),
        )
        .await;

        assert!(disable.ok);
        assert_eq!(disable.data["runtime_mode"], "native_supervisor");
        assert_eq!(disable.data["policy"]["runtime_enabled"], false);
        assert_eq!(disable.data["policy"]["wave_cohorts"][0], "wave2");
        assert_eq!(disable.data["policy"]["hard_stop_gate"], false);

        let exec_when_disabled = super::handle_request_with_runtime(
            ControlRequest::McpRuntimeExec {
                payload: serde_json::json!({ "runtime": { "op": "execute", "wave_cohort": "wave2" } }),
                timeout_ms: Some(100),
            },
            reg,
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
            Some(runtime),
        )
        .await;

        assert!(!exec_when_disabled.ok);
        assert_eq!(exec_when_disabled.data["error_envelope"]["error_class"], "runtime_precondition");
        assert_eq!(exec_when_disabled.data["error_envelope"]["reason"], "runtime_disabled");
        assert_eq!(exec_when_disabled.data["error_envelope"]["required_control"]["type"], "SetMcpRuntimePolicy");
    }

    #[tokio::test]
    async fn mcp_runtime_exec_failure_is_persisted_to_projectmemory_file() {
        let temp = tempfile::tempdir().expect("tempdir");
        let workspace_root = temp.path().join("workspace");
        let nested_cwd = workspace_root.join("server");
        std::fs::create_dir_all(&nested_cwd).expect("create nested cwd");

        let reg = make_registry();
        let runtime = make_failing_runtime(Some(nested_cwd.clone()));

        let response = super::handle_request_with_runtime(
            ControlRequest::McpRuntimeExec {
                payload: serde_json::json!({
                    "action": "execute",
                    "runtime": {
                        "op": "execute",
                        "wave_cohort": "wave1",
                        "cwd": nested_cwd.to_string_lossy().to_string(),
                        "workspace_id": "ws_test"
                    },
                    "correlation": {
                        "request_id": "req_123"
                    }
                }),
                timeout_ms: Some(200),
            },
            reg,
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
            Some(runtime),
        )
        .await;

        assert!(!response.ok);
        let failure_log_path = response
            .data
            .get("failure_log_path")
            .and_then(|v| v.as_str())
            .expect("failure_log_path should be present");

        let expected_path = workspace_root
            .join(".projectmemory")
            .join("tool-call-failures.ndjson");
        assert_eq!(std::path::Path::new(failure_log_path), expected_path);

        let content = std::fs::read_to_string(&expected_path).expect("read failure log");
        let line = content.lines().last().expect("one logged line");
        let entry: serde_json::Value = serde_json::from_str(line).expect("valid json line");

        assert_eq!(entry["workspace_id"], "ws_test");
        assert_eq!(entry["request_id"], "req_123");
        assert_eq!(entry["runtime_op"], "execute");
        assert_eq!(entry["error"]["envelope"]["error_class"], "subprocess_failure");
    }

    #[tokio::test]
    async fn deprecated_pool_commands_stay_deprecated_even_when_runtime_policy_disabled() {
        let reg = make_registry();
        let runtime = make_runtime();

        let _ = super::handle_request_with_runtime(
            ControlRequest::SetMcpRuntimePolicy {
                enabled: Some(false),
                wave_cohorts: None,
                hard_stop_gate: None,
            },
            Arc::clone(&reg),
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
            Some(Arc::clone(&runtime)),
        )
        .await;

        let list_instances = super::handle_request_with_runtime(
            ControlRequest::ListMcpInstances,
            Arc::clone(&reg),
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
            Some(Arc::clone(&runtime)),
        )
        .await;

        let scale_up = super::handle_request_with_runtime(
            ControlRequest::ScaleUpMcp,
            reg,
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
            Some(runtime),
        )
        .await;

        assert!(list_instances.ok);
        assert_eq!(list_instances.data["deprecated"], true);
        assert_eq!(list_instances.data["runtime_mode"], "native_supervisor");

        assert!(scale_up.ok);
        assert_eq!(scale_up.data["deprecated"], true);
        assert_eq!(scale_up.data["runtime_mode"], "native_supervisor");
    }

    #[tokio::test]
    async fn event_stats_includes_runtime_telemetry() {
        let reg = make_registry();
        let runtime = make_runtime();

        let _ = runtime
            .execute(&serde_json::json!({ "runtime": { "op": "init" } }), Some(50))
            .await
            .expect("init runtime session");

        let resp = super::handle_request_with_runtime(
            ControlRequest::EventStats,
            reg,
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
            Some(runtime),
        )
        .await;

        assert!(resp.ok);
        assert!(resp.data["runtime_telemetry"].is_object());
        assert!(resp.data["runtime_telemetry"]["started_total"].is_number());
    }

    #[tokio::test]
    async fn deprecated_pool_commands_return_deterministic_native_supervisor_envelopes() {
        let reg = make_registry();
        let runtime = make_runtime();

        let list_instances = super::handle_request_with_runtime(
            ControlRequest::ListMcpInstances,
            Arc::clone(&reg),
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
            Some(Arc::clone(&runtime)),
        )
        .await;

        let scale_up = super::handle_request_with_runtime(
            ControlRequest::ScaleUpMcp,
            reg,
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
            Some(runtime),
        )
        .await;

        for (response, expected_command) in [
            (list_instances, "ListMcpInstances"),
            (scale_up, "ScaleUpMcp"),
        ] {
            assert!(response.ok);
            assert_eq!(response.data["supported"], false);
            assert_eq!(response.data["deprecated"], true);
            assert_eq!(response.data["reason"], "instance_pool_removed");
            assert_eq!(response.data["runtime_mode"], "native_supervisor");
            assert_eq!(response.data["command"], expected_command);
        }
    }

    #[tokio::test]
    async fn retained_control_commands_keep_stable_response_envelope_shape() {
        let reg = make_registry();

        let status = handle_request(
            ControlRequest::Status,
            Arc::clone(&reg),
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
        )
        .await;

        let whoami = handle_request(
            ControlRequest::WhoAmI(crate::control::protocol::WhoAmIRequest {
                request_id: "req-contract".to_string(),
                client: "mcp-server".to_string(),
                client_version: "1.2.3".to_string(),
            }),
            Arc::clone(&reg),
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
        )
        .await;

        let service_health = handle_request(
            ControlRequest::ServiceHealth {
                service: "mcp".to_string(),
            },
            reg,
            empty_form_apps(),
            shutdown_channel(),
            None,
            None,
            None,
            None,
        )
        .await;

        for response in [&status, &whoami, &service_health] {
            assert!(response.ok);
            assert!(response.error.is_none());
        }

        assert!(status.data.is_array());
        assert_eq!(whoami.data["message"], "WhoAmI received");
        assert_eq!(whoami.data["client"], "mcp-server");
        assert_eq!(whoami.data["client_version"], "1.2.3");
        assert!(service_health.data.is_object());
        assert_eq!(service_health.data["name"], "mcp");
    }
}

