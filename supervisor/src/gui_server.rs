//! Standalone HTTP server that accepts GUI-launch requests from the MCP
//! container (or any caller that cannot access the Windows named pipe).
//!
//! Listens on a configurable TCP port (default: **3464**) and exposes GUI and
//! runtime-output management endpoints:
//!
//! | Method | Path            | Purpose                                  |
//! |--------|-----------------|------------------------------------------|
//! | GET    | `/gui/ping`     | Availability check — returns app list    |
//! | POST   | `/gui/launch`   | Launch a form-app GUI subprocess         |
//! | POST   | `/gui/continue` | Continue a paused refinement session     |
//! | GET    | `/runtime/recent` | Recent per-component runtime output    |
//! | GET    | `/runtime/capture` | Runtime capture on/off state           |
//! | POST   | `/runtime/capture` | Runtime capture on/off toggle          |
//!
//! The request body for `/gui/launch` may include optional routing metadata
//! (`workspace_id`, `session_id`, `agent`) that is logged for observability
//! but does not affect the underlying `launch_form_app` call.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Query, State},
    http::StatusCode,
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::json;

use crate::control::handler::FormAppConfigs;
use crate::control::protocol::FormAppResponse;
use crate::runner::form_app::{continue_form_app, launch_form_app};

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct GuiServerState {
    pub form_apps: Arc<FormAppConfigs>,
}

// ---------------------------------------------------------------------------
// Request body types
// ---------------------------------------------------------------------------

/// Body for `POST /gui/launch`.
#[derive(Debug, Deserialize)]
pub struct LaunchRequest {
    /// Registered app name: `"brainstorm_gui"` or `"approval_gui"`.
    pub app_name: String,
    /// The full `FormRequest` JSON payload to pipe to the child process.
    pub payload: serde_json::Value,
    /// Optional per-request timeout override in seconds.
    #[serde(default)]
    pub timeout_seconds: Option<u64>,
    // ── Routing metadata (threaded through for observability / logs) ──────
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub agent: Option<String>,
}

/// Body for `POST /gui/continue`.
#[derive(Debug, Deserialize)]
pub struct ContinueRequest {
    /// Session token returned by a previous `/gui/launch` with
    /// `pending_refinement: true`.
    pub session_id: String,
    /// The `FormRefinementResponse` JSON to pipe to the GUI.
    pub payload: serde_json::Value,
    /// Optional per-continuation timeout override in seconds.
    #[serde(default)]
    pub timeout_seconds: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct RuntimeRecentQuery {
    #[serde(default)]
    pub component: Option<String>,
    #[serde(default)]
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct RuntimeCaptureRequest {
    pub enabled: bool,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn ping_handler(
    State(state): State<GuiServerState>,
) -> Json<serde_json::Value> {
    let apps: Vec<&str> = state
        .form_apps
        .iter()
        .filter(|(_, cfg)| cfg.enabled)
        .map(|(name, _)| name.as_str())
        .collect();

    Json(json!({
        "available": true,
        "apps": apps,
        "server": "project-memory-gui-server",
    }))
}

async fn launch_handler(
    State(state): State<GuiServerState>,
    Json(req): Json<LaunchRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    eprintln!(
        "[gui-server] launch: app={} workspace={:?} session={:?} agent={:?}",
        req.app_name, req.workspace_id, req.session_id, req.agent,
    );

    let cfg = match state.form_apps.get(&req.app_name) {
        Some(c) if c.enabled => c,
        Some(_) => {
            let resp = FormAppResponse::config_failure(
                req.app_name.clone(),
                format!("form app \"{}\" is disabled in config", req.app_name),
            );
            return launch_http_response(StatusCode::BAD_REQUEST, resp);
        }
        None => {
            let known: Vec<&String> = state.form_apps.keys().collect();
            let resp = FormAppResponse::config_failure(
                req.app_name.clone(),
                format!(
                    "unknown form app: \"{}\". Known apps: {:?}",
                    req.app_name, known
                ),
            );
            return launch_http_response(StatusCode::NOT_FOUND, resp);
        }
    };

    let resp = launch_form_app(cfg, &req.app_name, &req.payload, req.timeout_seconds).await;
    launch_http_response(
        if resp.success {
            StatusCode::OK
        } else {
            StatusCode::INTERNAL_SERVER_ERROR
        },
        resp,
    )
}

async fn continue_handler(
    State(_state): State<GuiServerState>,
    Json(req): Json<ContinueRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    eprintln!("[gui-server] continue: session={}", req.session_id);

    let resp = continue_form_app(&req.session_id, &req.payload, req.timeout_seconds).await;
    let status = if resp.success {
        StatusCode::OK
    } else {
        StatusCode::INTERNAL_SERVER_ERROR
    };

    match serde_json::to_value(&resp) {
        Ok(data) => (status, Json(json!({ "ok": resp.success, "data": data }))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "ok": false, "error": format!("serialisation error: {e}") })),
        ),
    }
}

fn launch_http_response(
    status: StatusCode,
    resp: FormAppResponse,
) -> (StatusCode, Json<serde_json::Value>) {
    match serde_json::to_value(&resp) {
        Ok(data) => {
            if resp.success {
                (status, Json(json!({ "ok": true, "data": data })))
            } else {
                (
                    status,
                    Json(json!({
                        "ok": false,
                        "error": resp.error.clone(),
                        "data": data,
                    })),
                )
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "ok": false, "error": format!("serialisation error: {e}") })),
        ),
    }
}

async fn runtime_recent_handler(
    Query(query): Query<RuntimeRecentQuery>,
) -> Json<serde_json::Value> {
    let capture_enabled = crate::runtime_output::is_enabled();
    let limit = query.limit.unwrap_or(200).clamp(1, 2_000);
    let items = crate::runtime_output::recent(query.component.as_deref(), limit);

    Json(json!({
        "ok": true,
        "data": {
            "capture_enabled": capture_enabled,
            "component": query.component,
            "limit": limit,
            "count": items.len(),
            "items": items,
        }
    }))
}

async fn runtime_capture_get_handler() -> Json<serde_json::Value> {
    Json(json!({
        "ok": true,
        "data": {
            "enabled": crate::runtime_output::is_enabled(),
        }
    }))
}

async fn runtime_capture_set_handler(
    Json(req): Json<RuntimeCaptureRequest>,
) -> Json<serde_json::Value> {
    crate::runtime_output::set_enabled(req.enabled);
    Json(json!({
        "ok": true,
        "data": {
            "enabled": crate::runtime_output::is_enabled(),
        }
    }))
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn build_router(form_apps: Arc<FormAppConfigs>) -> Router {
    let state = GuiServerState { form_apps };

    Router::new()
        .route("/gui/ping", get(ping_handler))
        .route("/gui/launch", post(launch_handler))
        .route("/gui/continue", post(continue_handler))
        .route("/runtime/recent", get(runtime_recent_handler))
        .route("/runtime/capture", get(runtime_capture_get_handler))
        .route("/runtime/capture", post(runtime_capture_set_handler))
        .with_state(state)
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/// Bind and serve the GUI HTTP server on `{bind_address}:{port}`.
///
/// Pass `bind_address = "0.0.0.0"` (the default) so the server is reachable
/// from Podman/Docker containers via `host.containers.internal`.  Pass
/// `"127.0.0.1"` to restrict to loopback only.
///
/// This is a long-running future; spawn it with `tokio::spawn`.
pub async fn start(bind_address: &str, port: u16, form_apps: Arc<FormAppConfigs>) -> anyhow::Result<()> {
    let addr = format!("{bind_address}:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    eprintln!("[supervisor] GUI HTTP server listening on http://{addr}");
    axum::serve(listener, build_router(form_apps)).await?;
    Ok(())
}
