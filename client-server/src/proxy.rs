//! Core proxy routing: dispatch incoming MCP tool calls to local handlers or upstream.

use crate::client_detect::{from_initialize_params, ClientProfile};
use crate::db;
use crate::local_tools;
use crate::upstream;
use anyhow::Result;
use reqwest::Client;
use rusqlite::Connection;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

// ── Tools that are always handled locally ────────────────────────────────────

const ALWAYS_LOCAL: &[&str] = &["runtime_mode", "ping"];

// ── Tools the proxy can handle locally when supervisor is down ────────────────
// (These are also forwarded to upstream when it is reachable.)

const LOCAL_CAPABLE: &[&str] = &[
    "memory_workspace",
    "memory_plan",
    "memory_steps",
    "memory_instructions",
];

// ── All upstream-managed tool names (for degraded-mode tool list) ─────────────

const UPSTREAM_ONLY_NAMES: &[&str] = &[
    "memory_context",
    "memory_session",
    "memory_agent",
    "memory_filesystem",
    "memory_terminal",
    "memory_brainstorm",
    "memory_cartographer",
    "memory_sprint",
];

// ─────────────────────────────────────────────────────────────────────────────

pub struct Proxy {
    upstream_url:        String,
    upstream_connected:  Arc<AtomicBool>,
    last_connected_secs: Arc<AtomicU64>,
    session_id:          Mutex<Option<String>>,
    cached_tools:        Mutex<Option<Vec<Value>>>,
    client_profile:      Mutex<ClientProfile>,
    started_at:          Instant,
    db:                  Mutex<Connection>,
    http:                Client,
}

impl Proxy {
    /// Create a new Proxy.  Opens the local database immediately.
    pub fn new(upstream_url: String, http: Client) -> Result<Self> {
        let db = db::open()?;
        Ok(Proxy {
            upstream_url,
            upstream_connected:  Arc::new(AtomicBool::new(false)),
            last_connected_secs: Arc::new(AtomicU64::new(0)),
            session_id:          Mutex::new(None),
            cached_tools:        Mutex::new(None),
            client_profile:      Mutex::new(ClientProfile::default()),
            started_at:          Instant::now(),
            db:                  Mutex::new(db),
            http,
        })
    }

    /// Shared upstream-connected flag (cloned into the background reconnect task).
    pub fn connected_flag(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.upstream_connected)
    }

    /// Shared last-connected timestamp (seconds since epoch) for the reconnect task to update.
    pub fn last_connected_arc(&self) -> Arc<AtomicU64> {
        Arc::clone(&self.last_connected_secs)
    }
    /// Handle a single JSON-RPC request and return the response `Value`.
    pub async fn handle(&self, req: &Value) -> Value {
        let id     = req.get("id").cloned().unwrap_or(Value::Null);
        let method = req["method"].as_str().unwrap_or("");

        match method {
            "initialize"              => self.handle_initialize(req, id).await,
            "tools/list"              => self.handle_tools_list(id).await,
            "tools/call"              => self.handle_tools_call(req, id).await,
            "notifications/initialized" => Value::Null, // no response for notifications
            _                         => self.forward_raw(req, id).await,
        }
    }

    // ── initialize ────────────────────────────────────────────────────────────

    async fn handle_initialize(&self, req: &Value, id: Value) -> Value {
        if let Some(params) = req.get("params") {
            let profile = from_initialize_params(params);
            *self.client_profile.lock().unwrap() = profile;
        }

        // Try to connect to the upstream in the background.
        let _ = self.ping_upstream().await;

        json_result(id, json!({
            "protocolVersion": "2024-11-05",
            "capabilities": { "tools": {} },
            "serverInfo": {
                "name":    "client-proxy",
                "version": env!("CARGO_PKG_VERSION")
            }
        }))
    }

    // ── tools/list ────────────────────────────────────────────────────────────

    async fn handle_tools_list(&self, id: Value) -> Value {
        let connected = self.ping_upstream().await;

        let mut tools: Vec<Value>;

        if connected {
            // Forward to upstream and cache the result.
            let list_req = json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/list",
                "params": {}
            });
            let session = self.session_id.lock().unwrap().clone();
            match upstream::forward(&self.http, &self.upstream_url, session.as_deref(), &list_req).await {
                Ok((resp, new_sid)) => {
                    self.update_session(new_sid);
                    tools = resp["result"]["tools"]
                        .as_array()
                        .cloned()
                        .unwrap_or_default();
                    *self.cached_tools.lock().unwrap() = Some(tools.clone());
                }
                Err(_) => {
                    tools = self.degraded_tool_list();
                }
            }
        } else {
            tools = self.degraded_tool_list();
        }

        // Always inject our always-local tools if not already present.
        inject_local_tools(&mut tools);

        json_result(id, json!({ "tools": tools }))
    }

    // ── tools/call ────────────────────────────────────────────────────────────

    async fn handle_tools_call(&self, req: &Value, id: Value) -> Value {
        let name = req["params"]["name"].as_str().unwrap_or("").to_string();
        let args = req["params"]["arguments"].clone();

        // Always-local tools.
        if ALWAYS_LOCAL.contains(&name.as_str()) {
            let result = self.dispatch_local(&name, &args);
            return json_result(id, result);
        }

        // Ping upstream before routing.
        let connected = self.ping_upstream().await;

        if connected {
            // Forward to upstream for ALL tool calls (single source of truth).
            let session = self.session_id.lock().unwrap().clone();
            match upstream::forward(&self.http, &self.upstream_url, session.as_deref(), req).await {
                Ok((resp, new_sid)) => {
                    self.update_session(new_sid);
                    return extract_tool_result(resp);
                }
                Err(e) => {
                    eprintln!("[client-proxy] upstream forward error for {name}: {e}");
                    // Fall through to local handling if local-capable.
                }
            }
        }

        // Supervisor is down (or upstream call failed).
        if LOCAL_CAPABLE.contains(&name.as_str()) {
            let result = self.dispatch_local(&name, &args);
            return json_result(id, result);
        }

        // Upstream-only tool — return informative error.
        json_result(id, json!({
            "content": [{
                "type": "text",
                "text": format!(
                    "Project Memory supervisor is down — '{name}' is unavailable.\n\
                     Use 'runtime_mode' to check connection status, or 'memory_plan'/'memory_steps' \
                     to continue working with your current plan while the supervisor restarts."
                )
            }],
            "isError": true
        }))
    }

    // ── fallback: forward arbitrary methods ──────────────────────────────────

    async fn forward_raw(&self, req: &Value, id: Value) -> Value {
        let connected = self.ping_upstream().await;
        if !connected {
            return json_error(id, -32603, "Supervisor is unreachable");
        }
        let session = self.session_id.lock().unwrap().clone();
        match upstream::forward(&self.http, &self.upstream_url, session.as_deref(), req).await {
            Ok((resp, new_sid)) => {
                self.update_session(new_sid);
                resp
            }
            Err(e) => json_error(id, -32603, &e.to_string()),
        }
    }

    // ── local dispatch ────────────────────────────────────────────────────────

    fn dispatch_local(&self, name: &str, args: &Value) -> Value {
        match name {
            "ping" => local_tools::handle_ping(),

            "runtime_mode" => {
                let last = self.last_connected_secs.load(Ordering::Relaxed);
                let last_opt = if last == 0 { None } else { Some(last) };
                let profile  = self.client_profile.lock().unwrap().clone();
                local_tools::handle_runtime_mode(
                    &self.upstream_connected,
                    &self.started_at,
                    &profile,
                    &self.upstream_url,
                    last_opt,
                )
            }

            "memory_workspace" => self.handle_local_workspace(args),
            "memory_plan"      => self.handle_local_plan(args),
            "memory_steps"     => self.handle_local_steps(args),
            "memory_instructions" => self.handle_local_instructions(args),

            _ => json!({
                "content": [{ "type": "text", "text": format!("No local handler for '{name}'") }],
                "isError": true
            }),
        }
    }

    // ── memory_workspace (local) ──────────────────────────────────────────────

    fn handle_local_workspace(&self, args: &Value) -> Value {
        let action = args["action"].as_str().unwrap_or("list");
        let db = self.db.lock().unwrap();

        let result: Result<Value, anyhow::Error> = match action {
            "list" => {
                db::workspace::list_workspaces(&db).map(|rows| json!({ "workspaces": rows }))
            }
            "info" => {
                let ws_id = args["workspace_id"].as_str().unwrap_or("");
                let path  = args["path"].as_str().unwrap_or("");
                if !ws_id.is_empty() {
                    db::workspace::get_workspace(&db, ws_id)
                        .map(|w| w.unwrap_or(Value::Null))
                } else if !path.is_empty() {
                    db::workspace::get_workspace_by_path(&db, path)
                        .map(|w| w.unwrap_or(Value::Null))
                } else {
                    Ok(json!({ "error": "workspace_id or path required" }))
                }
            }
            other => Ok(json!({
                "error": format!("action '{other}' not available in degraded mode"),
                "available_actions": ["list", "info"]
            })),
        };

        text_result(result)
    }

    // ── memory_plan (local) ───────────────────────────────────────────────────

    fn handle_local_plan(&self, args: &Value) -> Value {
        let action = args["action"].as_str().unwrap_or("list");
        let db = self.db.lock().unwrap();

        let result: Result<Value, anyhow::Error> = match action {
            "list" => {
                let ws_id  = args["workspace_id"].as_str().unwrap_or("");
                let status = args["status"].as_str();
                db::plan::list_plans(&db, ws_id, status).map(|rows| json!({ "plans": rows }))
            }
            "get" => {
                let plan_id = args["plan_id"].as_str().unwrap_or("");
                db::plan::get_plan(&db, plan_id).map(|p| p.unwrap_or(Value::Null))
            }
            other => Ok(json!({
                "error": format!("action '{other}' not available in degraded mode"),
                "available_actions": ["list", "get"]
            })),
        };

        text_result(result)
    }

    // ── memory_steps (local) ──────────────────────────────────────────────────

    fn handle_local_steps(&self, args: &Value) -> Value {
        let action = args["action"].as_str().unwrap_or("next");
        let db = self.db.lock().unwrap();

        let result: Result<Value, anyhow::Error> = match action {
            "list" => {
                let plan_id = args["plan_id"].as_str().unwrap_or("");
                db::steps::get_all_steps(&db, plan_id).map(|steps| json!({ "steps": steps }))
            }
            "next" => {
                let plan_id = args["plan_id"].as_str().unwrap_or("");
                db::steps::get_next_pending(&db, plan_id).map(|s| s.unwrap_or(Value::Null))
            }
            "update" => {
                let step_id = args["step_id"].as_str().unwrap_or("");
                let status  = args["status"].as_str();
                let notes   = args.get("notes").map(|n| n.as_str());
                let agent   = args["completed_by_agent"].as_str();
                db::steps::update_step(&db, step_id, status, notes, agent)
                    .map(|_| json!({ "updated": step_id }))
            }
            "batch_update" => {
                let updates_val = args["updates"].as_array().cloned().unwrap_or_default();
                let updates: Vec<db::steps::BatchUpdate> = updates_val
                    .iter()
                    .filter_map(|u| {
                        Some(db::steps::BatchUpdate {
                            id:     u["id"].as_str()?.to_string(),
                            status: u["status"].as_str().map(|s| s.to_string()),
                            notes:  u.get("notes").map(|n| n.as_str().map(|s| s.to_string())),
                        })
                    })
                    .collect();
                let count = updates.len();
                db::steps::batch_update_steps(&db, &updates)
                    .map(|_| json!({ "updated": count }))
            }
            other => Ok(json!({
                "error": format!("action '{other}' not available in degraded mode"),
                "available_actions": ["list", "next", "update", "batch_update"]
            })),
        };

        text_result(result)
    }

    // ── memory_instructions (local) ───────────────────────────────────────────

    fn handle_local_instructions(&self, args: &Value) -> Value {
        let action = args["action"].as_str().unwrap_or("list");
        let db = self.db.lock().unwrap();

        let result: Result<Value, anyhow::Error> = match action {
            "list" => db::instructions::list_instructions(&db)
                .map(|rows| json!({ "instructions": rows })),
            "get" => {
                let filename = args["filename"].as_str().unwrap_or("");
                db::instructions::get_instruction(&db, filename)
                    .map(|i| i.unwrap_or(Value::Null))
            }
            "get_section" => {
                let filename = args["filename"].as_str().unwrap_or("");
                let heading  = args["heading"].as_str().unwrap_or("");
                db::instructions::get_section(&db, filename, heading)
                    .map(|s| json!({ "section": s }))
            }
            "search" => {
                let query = args["query"].as_str().unwrap_or("");
                db::instructions::search_instructions(&db, query)
                    .map(|rows| json!({ "results": rows }))
            }
            "list_workspace" => {
                let ws_id = args["workspace_id"].as_str().unwrap_or("");
                db::instructions::list_workspace_instructions(&db, ws_id)
                    .map(|rows| json!({ "instructions": rows }))
            }
            other => Ok(json!({
                "error": format!("action '{other}' not available in degraded mode"),
                "available_actions": ["list", "get", "get_section", "search", "list_workspace"]
            })),
        };

        text_result(result)
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /// Ping the upstream and update the connected flag. Returns current state.
    async fn ping_upstream(&self) -> bool {
        let base_url = self.upstream_url.trim_end_matches("/mcp").to_string();
        let was_connected = self.upstream_connected.load(Ordering::Relaxed);
        let now_connected = upstream::health_check(&self.http, &base_url).await;

        if now_connected != was_connected {
            self.upstream_connected.store(now_connected, Ordering::Relaxed);
            if now_connected {
                // Freshly reconnected — establish a session with the upstream.
                let init_req = upstream::make_initialize_request();
                let session  = self.session_id.lock().unwrap().clone();
                if let Ok((_, new_sid)) = upstream::forward(
                    &self.http, &self.upstream_url, session.as_deref(), &init_req,
                ).await {
                    self.update_session(new_sid);
                }
                eprintln!("[client-proxy] upstream reconnected");
            } else {
                eprintln!("[client-proxy] upstream disconnected");
            }
        }

        if now_connected {
            let secs = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            self.last_connected_secs.store(secs, Ordering::Relaxed);
        }

        now_connected
    }

    fn update_session(&self, new_sid: Option<String>) {
        if let Some(sid) = new_sid {
            *self.session_id.lock().unwrap() = Some(sid);
        }
    }

    /// Return a degraded tool list: cached upstream tools (if any) + always-local.
    fn degraded_tool_list(&self) -> Vec<Value> {
        let cached = self.cached_tools.lock().unwrap().clone();
        if let Some(tools) = cached {
            return tools;
        }
        // No cache — return minimal static list.
        static_tool_list()
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/// Inject always-local tools into a tool list if they're not already present.
fn inject_local_tools(tools: &mut Vec<Value>) {
    let existing: std::collections::HashSet<String> = tools
        .iter()
        .filter_map(|t| t["name"].as_str().map(|s| s.to_string()))
        .collect();

    for def in local_tool_definitions() {
        let name = def["name"].as_str().unwrap_or("").to_string();
        if !existing.contains(&name) {
            tools.push(def);
        }
    }
}

fn local_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "runtime_mode",
            "description": "Check client-proxy and upstream supervisor connection status. Always available.",
            "inputSchema": { "type": "object", "properties": {}, "required": [] }
        }),
        json!({
            "name": "ping",
            "description": "Health check — always returns pong.",
            "inputSchema": { "type": "object", "properties": {}, "required": [] }
        }),
    ]
}

fn static_tool_list() -> Vec<Value> {
    let mut tools = local_tool_definitions();

    // Local-capable tools.
    tools.push(json!({
        "name": "memory_workspace",
        "description": "List workspaces or get workspace info. Actions: list, info (+ register/reindex when supervisor is online).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action":       { "type": "string" },
                "workspace_id": { "type": "string" },
                "path":         { "type": "string" }
            },
            "required": ["action"]
        }
    }));
    tools.push(json!({
        "name": "memory_plan",
        "description": "List or get plans. Actions: list, get (+ create/update/archive when supervisor is online).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action":       { "type": "string" },
                "workspace_id": { "type": "string" },
                "plan_id":      { "type": "string" },
                "status":       { "type": "string" }
            },
            "required": ["action"]
        }
    }));
    tools.push(json!({
        "name": "memory_steps",
        "description": "Update plan steps. Actions: next, update, batch_update (+ add/insert/reorder when supervisor is online).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action":             { "type": "string" },
                "plan_id":            { "type": "string" },
                "step_id":            { "type": "string" },
                "status":             { "type": "string", "enum": ["pending","active","done","blocked"] },
                "notes":              { "type": "string" },
                "completed_by_agent": { "type": "string" },
                "updates":            { "type": "array" }
            },
            "required": ["action"]
        }
    }));
    tools.push(json!({
        "name": "memory_instructions",
        "description": "Read instruction files. Actions: list, get, get_section, search, list_workspace.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action":       { "type": "string" },
                "filename":     { "type": "string" },
                "heading":      { "type": "string" },
                "query":        { "type": "string" },
                "workspace_id": { "type": "string" }
            },
            "required": ["action"]
        }
    }));

    // Upstream-only tools — included in the list so LLMs know about them.
    for name in UPSTREAM_ONLY_NAMES {
        tools.push(json!({
            "name": *name,
            "description": format!("{name} — requires supervisor (currently unavailable in degraded mode)."),
            "inputSchema": { "type": "object", "properties": {}, "required": [] }
        }));
    }

    tools
}

fn extract_tool_result(resp: Value) -> Value {
    // MCP tool call response is the full JSON-RPC response; unwrap to the result.
    if resp.get("result").is_some() {
        resp["result"].clone()
    } else if resp.get("error").is_some() {
        json!({
            "content": [{ "type": "text", "text": resp["error"]["message"].as_str().unwrap_or("upstream error") }],
            "isError": true
        })
    } else {
        resp
    }
}

fn text_result(r: Result<Value, anyhow::Error>) -> Value {
    match r {
        Ok(v)  => json!({ "content": [{ "type": "text", "text": serde_json::to_string_pretty(&v).unwrap_or_default() }] }),
        Err(e) => json!({ "content": [{ "type": "text", "text": e.to_string() }], "isError": true }),
    }
}

fn json_result(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn json_error(id: Value, code: i64, msg: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": msg } })
}
