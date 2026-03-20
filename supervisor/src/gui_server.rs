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

use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex, RwLock};

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::json;

use crate::chatbot::{ChatMessage, ChatRequest, chat_loop};
use crate::config::{ChatbotProvider, ChatbotSection};
use crate::control::handler::FormAppConfigs;
use crate::control::protocol::FormAppResponse;
use crate::runner::form_app::{continue_form_app, launch_form_app};

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct GuiServerState {
    pub form_apps: Arc<FormAppConfigs>,
    pub chatbot_config: Arc<RwLock<ChatbotSection>>,
    pub chatbot_state_path: std::path::PathBuf,
    pub mcp_base_url: String,
    /// Live per-request tool-call logs: request_id → growing list of tool names.
    pub chat_live_logs: Arc<RwLock<HashMap<String, Arc<StdMutex<Vec<String>>>>>>,
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

pub fn build_router(state: GuiServerState, api_key: Option<String>) -> Router {
    let key_state = Arc::new(api_key);

    // Protected routes — require X-PM-API-Key header.
    let protected = Router::new()
        .route("/gui/launch", post(launch_handler))
        .route("/gui/continue", post(continue_handler))
        .route("/runtime/recent", get(runtime_recent_handler))
        .route("/runtime/capture", get(runtime_capture_get_handler))
        .route("/runtime/capture", post(runtime_capture_set_handler))
        .route("/chatbot/chat", post(chatbot_chat_handler))
        .route("/chatbot/config", get(chatbot_config_get_handler).post(chatbot_config_set_handler))
        .route("/chatbot/status/:id", get(chatbot_status_handler))
        .layer(axum::middleware::from_fn_with_state(
            key_state,
            crate::auth_middleware::require_api_key,
        ));

    // Public routes — no auth required.
    Router::new()
        .route("/gui/ping", get(ping_handler))
        // Terminal launch routes are local-only (127.0.0.1) so no key needed.
        .route("/terminal/launch-claude", post(terminal_launch_claude_handler))
        .merge(protected)
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
pub async fn start(
    bind_address: &str,
    port: u16,
    form_apps: Arc<FormAppConfigs>,
    chatbot_config: Arc<RwLock<ChatbotSection>>,
    chatbot_state_path: std::path::PathBuf,
    mcp_base_url: String,
    api_key: Option<String>,
) -> anyhow::Result<()> {
    let addr = format!("{bind_address}:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    eprintln!("[supervisor] GUI HTTP server listening on http://{addr}");
    let state = GuiServerState {
        form_apps,
        chatbot_config,
        chatbot_state_path,
        mcp_base_url,
        chat_live_logs: Arc::new(RwLock::new(HashMap::new())),
    };
    axum::serve(listener, build_router(state, api_key)).await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Chatbot handlers
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct ChatbotChatRequest {
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub workspace_id: Option<String>,
    /// Client-generated request ID used to poll `/chatbot/status/{id}` for
    /// live tool-call progress while the request is in flight.
    #[serde(default)]
    pub request_id: Option<String>,
}

async fn chatbot_chat_handler(
    State(state): State<GuiServerState>,
    Json(body): Json<ChatbotChatRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    use uuid::Uuid;

    let config = state.chatbot_config.read().unwrap().clone();
    let request_id = body.request_id
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    // Create a live log entry so the status endpoint can read it while in-flight.
    let live_log = Arc::new(StdMutex::new(Vec::<String>::new()));
    {
        let mut store = state.chat_live_logs.write().unwrap();
        store.insert(request_id.clone(), Arc::clone(&live_log));
    }

    let req = ChatRequest {
        messages:     body.messages,
        workspace_id: body.workspace_id,
        mcp_base_url: state.mcp_base_url.clone(),
        config,
        live_log:     Some(live_log),
    };
    let result = chat_loop(req).await;

    // Remove the live log now that the request is done.
    {
        let mut store = state.chat_live_logs.write().unwrap();
        store.remove(&request_id);
    }

    match result {
        Ok(resp)  => (StatusCode::OK, Json(serde_json::to_value(resp).unwrap_or(json!({})))),
        Err(e)    => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
    }
}

/// Returns the tool calls made so far for an in-flight chat request.
/// Returns `in_progress: false` when the request has already completed
/// (the log entry is removed on completion).
async fn chatbot_status_handler(
    Path(request_id): Path<String>,
    State(state): State<GuiServerState>,
) -> Json<serde_json::Value> {
    let store = state.chat_live_logs.read().unwrap();
    match store.get(&request_id) {
        Some(log) => {
            let calls = log.lock().unwrap().clone();
            Json(json!({ "tool_calls_so_far": calls, "in_progress": true }))
        }
        None => Json(json!({ "tool_calls_so_far": [], "in_progress": false })),
    }
}

async fn chatbot_config_get_handler(
    State(state): State<GuiServerState>,
) -> Json<serde_json::Value> {
    let cfg = state.chatbot_config.read().unwrap();
    // A key is "configured" if the user stored one, OR if a well-known env var
    // provides credentials for the active provider (so the warning is suppressed).
    let key_configured = !cfg.api_key.is_empty() || match cfg.provider {
        ChatbotProvider::Gemini  => std::env::var("GEMINI_API_KEY").is_ok()
                                 || std::env::var("GOOGLE_API_KEY").is_ok(),
        ChatbotProvider::Copilot => std::env::var("GH_TOKEN").is_ok()
                                 || std::env::var("GITHUB_TOKEN").is_ok(),
        ChatbotProvider::Claude  => std::env::var("ANTHROPIC_API_KEY").is_ok(),
    };
    Json(json!({
        "provider":       format!("{:?}", cfg.provider).to_lowercase(),
        "model":          cfg.model,
        "api_key":        cfg.api_key,
        "key_configured": key_configured
    }))
}

#[derive(Debug, Deserialize)]
struct ChatbotConfigUpdate {
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    api_key: Option<String>,
}

async fn chatbot_config_set_handler(
    State(state): State<GuiServerState>,
    Json(body): Json<ChatbotConfigUpdate>,
) -> Json<serde_json::Value> {
    let mut cfg = state.chatbot_config.write().unwrap();
    if let Some(p) = body.provider {
        cfg.provider = match p.as_str() {
            "copilot" => ChatbotProvider::Copilot,
            "claude"  => ChatbotProvider::Claude,
            _         => ChatbotProvider::Gemini,
        };
    }
    if let Some(m) = body.model   { cfg.model   = m.trim().to_string(); }
    if let Some(k) = body.api_key { cfg.api_key = k.trim().to_string(); }
    let snapshot = cfg.clone();
    let save_path = state.chatbot_state_path.clone();
    drop(cfg); // release write lock before file I/O
    crate::config::save_chatbot_state(&save_path, &snapshot);
    let key_configured = !snapshot.api_key.is_empty() || match snapshot.provider {
        ChatbotProvider::Gemini  => std::env::var("GEMINI_API_KEY").is_ok()
                                 || std::env::var("GOOGLE_API_KEY").is_ok(),
        ChatbotProvider::Copilot => std::env::var("GH_TOKEN").is_ok()
                                 || std::env::var("GITHUB_TOKEN").is_ok(),
        ChatbotProvider::Claude  => std::env::var("ANTHROPIC_API_KEY").is_ok(),
    };
    Json(json!({ "ok": true, "key_configured": key_configured }))
}

// ---------------------------------------------------------------------------
// Terminal CLI launch handler
// ---------------------------------------------------------------------------

/// Body for `POST /terminal/launch-claude`.
#[derive(Debug, Deserialize)]
struct TerminalLaunchClaudeRequest {
    /// Workspace ID — used to look up the workspace path for `cwd`.
    #[serde(default)]
    pub workspace_id: Option<String>,
    /// Optional plan ID passed as context to the session.
    #[serde(default)]
    pub plan_id: Option<String>,
}

/// Launch a Claude CLI interactive terminal session.
///
/// Forwards a `spawn_cli_session` request (provider = "claude") to the MCP
/// server's `memory_terminal` tool.  The `claude` CLI authenticates via the
/// user's local OAuth credentials — no API key is required.
async fn terminal_launch_claude_handler(
    State(state): State<GuiServerState>,
    Json(body): Json<TerminalLaunchClaudeRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "ok": false, "error": format!("Failed to build HTTP client: {e}") })),
            );
        }
    };

    let mut tool_args = json!({
        "action": "spawn_cli_session",
        "provider": "claude"
    });
    if let Some(ws) = &body.workspace_id {
        if !ws.is_empty() {
            tool_args["workspace_id"] = json!(ws);
        }
    }
    if let Some(plan) = &body.plan_id {
        if !plan.is_empty() {
            tool_args["context"] = json!({ "plan_id": plan });
        }
    }

    let url = format!("{}/admin/mcp_call", state.mcp_base_url);
    let resp = client
        .post(&url)
        .json(&json!({ "name": "memory_terminal", "arguments": tool_args }))
        .send()
        .await;

    match resp {
        Ok(r) if r.status().is_success() => {
            (StatusCode::OK, Json(json!({ "ok": true })))
        }
        Ok(r) => {
            let status = r.status();
            let text = r.text().await.unwrap_or_default();
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "ok": false, "error": format!("MCP error ({status}): {text}") })),
            )
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "ok": false, "error": format!("Failed to reach MCP server: {e}") })),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::util::ServiceExt;

    use crate::config::FormAppConfig;

    fn form_apps_with(entries: Vec<(&str, FormAppConfig)>) -> Arc<FormAppConfigs> {
        let mut form_apps = FormAppConfigs::new();
        for (name, cfg) in entries {
            form_apps.insert(name.to_string(), cfg);
        }
        Arc::new(form_apps)
    }

    fn make_state(form_apps: Arc<FormAppConfigs>) -> GuiServerState {
        use std::collections::HashMap;
        GuiServerState {
            form_apps,
            chatbot_config: Arc::new(RwLock::new(crate::config::ChatbotSection::default())),
            chatbot_state_path: std::path::PathBuf::from(std::env::temp_dir()).join("chatbot_state_test.json"),
            mcp_base_url: "http://127.0.0.1:3000".to_string(),
            chat_live_logs: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    async fn response_json(response: axum::response::Response) -> serde_json::Value {
        let body = response
            .into_body()
            .collect()
            .await
            .expect("collect response body")
            .to_bytes();
        serde_json::from_slice(&body).expect("response body is valid JSON")
    }

    fn post_json(uri: &str, payload: serde_json::Value) -> Request<Body> {
        Request::builder()
            .method("POST")
            .uri(uri)
            .header("content-type", "application/json")
            .body(Body::from(payload.to_string()))
            .expect("request")
    }

    #[tokio::test]
    async fn ping_lists_only_enabled_apps() {
        let mut enabled = FormAppConfig::default();
        enabled.enabled = true;
        let mut disabled = FormAppConfig::default();
        disabled.enabled = false;

        let app = build_router(make_state(form_apps_with(vec![
            ("approval_gui", enabled),
            ("brainstorm_gui", disabled),
        ])), None);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/gui/ping")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::OK);
        let json = response_json(response).await;
        assert_eq!(json["available"], true);

        let apps = json["apps"].as_array().expect("apps array");
        assert!(apps.iter().any(|v| v == "approval_gui"));
        assert!(!apps.iter().any(|v| v == "brainstorm_gui"));
    }

    #[tokio::test]
    async fn launch_unknown_app_returns_structured_not_found_error() {
        let app = build_router(make_state(form_apps_with(vec![])), None);

        let response = app
            .oneshot(post_json(
                "/gui/launch",
                serde_json::json!({ "app_name": "unknown_gui", "payload": {"x": 1} }),
            ))
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let json = response_json(response).await;
        assert_eq!(json["ok"], false);
        assert!(
            json["error"]
                .as_str()
                .expect("error string")
                .contains("unknown form app")
        );
        assert_eq!(json["data"]["app_name"], "unknown_gui");
        assert_eq!(json["data"]["success"], false);
        assert_eq!(json["data"]["timed_out"], false);
    }

    #[tokio::test]
    async fn launch_disabled_app_returns_structured_bad_request_error() {
        let mut cfg = FormAppConfig::default();
        cfg.enabled = false;
        cfg.command = "echo".to_string();

        let app = build_router(make_state(form_apps_with(vec![("approval_gui", cfg)])), None);
        let response = app
            .oneshot(post_json(
                "/gui/launch",
                serde_json::json!({ "app_name": "approval_gui", "payload": {} }),
            ))
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let json = response_json(response).await;
        assert_eq!(json["ok"], false);
        assert!(
            json["error"]
                .as_str()
                .expect("error string")
                .contains("disabled")
        );
        assert_eq!(json["data"]["app_name"], "approval_gui");
        assert_eq!(json["data"]["success"], false);
    }

    #[tokio::test]
    async fn launch_spawn_failure_returns_structured_internal_error() {
        let cfg = FormAppConfig {
            enabled: true,
            command: "this-binary-does-not-exist-29387".to_string(),
            ..FormAppConfig::default()
        };

        let app = build_router(make_state(form_apps_with(vec![("approval_gui", cfg)])), None);
        let response = app
            .oneshot(post_json(
                "/gui/launch",
                serde_json::json!({ "app_name": "approval_gui", "payload": {"request": "x"} }),
            ))
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        let json = response_json(response).await;
        assert_eq!(json["ok"], false);
        assert!(
            json["error"]
                .as_str()
                .expect("error string")
                .contains("failed to spawn")
        );
        assert_eq!(json["data"]["app_name"], "approval_gui");
        assert_eq!(json["data"]["success"], false);
        assert_eq!(json["data"]["timed_out"], false);
    }

    #[tokio::test]
    async fn continue_unknown_session_returns_structured_internal_error() {
        let app = build_router(make_state(form_apps_with(vec![])), None);
        let response = app
            .oneshot(post_json(
                "/gui/continue",
                serde_json::json!({ "session_id": "missing-session", "payload": {"step": 2} }),
            ))
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        let json = response_json(response).await;
        assert_eq!(json["ok"], false);
        assert!(
            json["data"]["error"]
                .as_str()
                .expect("error string")
                .contains("session not found")
        );
    }
}
