//! Standalone HTTP server that accepts GUI-launch requests from the MCP
//! container (or any caller that cannot access the Windows named pipe).
//!
//! Listens on a configurable TCP port (default: **3464**) and exposes three
//! endpoints:
//!
//! | Method | Path            | Purpose                                  |
//! |--------|-----------------|------------------------------------------|
//! | GET    | `/gui/ping`     | Availability check — returns app list    |
//! | POST   | `/gui/launch`   | Launch a form-app GUI subprocess         |
//! | POST   | `/gui/continue` | Continue a paused refinement session     |
//!
//! The request body for `/gui/launch` may include optional routing metadata
//! (`workspace_id`, `session_id`, `agent`) that is logged for observability
//! but does not affect the underlying `launch_form_app` call.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::json;

use crate::control::handler::FormAppConfigs;
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
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "ok": false,
                    "error": format!("form app \"{}\" is disabled in config", req.app_name)
                })),
            );
        }
        None => {
            let known: Vec<&String> = state.form_apps.keys().collect();
            return (
                StatusCode::NOT_FOUND,
                Json(json!({
                    "ok": false,
                    "error": format!(
                        "unknown form app \"{}\". known: {:?}",
                        req.app_name, known
                    )
                })),
            );
        }
    };

    let resp = launch_form_app(cfg, &req.app_name, &req.payload, req.timeout_seconds).await;
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

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn build_router(form_apps: Arc<FormAppConfigs>) -> Router {
    let state = GuiServerState { form_apps };

    Router::new()
        .route("/gui/ping", get(ping_handler))
        .route("/gui/launch", post(launch_handler))
        .route("/gui/continue", post(continue_handler))
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
