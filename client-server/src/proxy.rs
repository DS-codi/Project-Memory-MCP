//! Core proxy routing: dispatch incoming MCP tool calls to local handlers or upstream.

use crate::client_detect::{from_initialize_params, ClientProfile};
use crate::db;
use crate::local_tools;
use crate::clog;
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

// ─────────────────────────────────────────────────────────────────────────────

pub struct Proxy {
    upstream_url:          String,
    upstream_connected:    Arc<AtomicBool>,
    last_connected_secs:   Arc<AtomicU64>,
    session_id:            Mutex<Option<String>>,
    cached_tools:          Mutex<Option<Vec<Value>>>,
    client_profile:        Mutex<ClientProfile>,
    started_at:            Instant,
    db:                    Mutex<Connection>,
    http:                  Client,
    /// True after the first session_start call has been fired to upstream.
    session_init_done:     AtomicBool,
    /// True after priority_instructions have been injected into a response.
    instructions_surfaced: AtomicBool,
    /// Buffered priority_instructions from session_start, waiting to be injected.
    pending_instructions:  Mutex<Option<Value>>,
    /// Proxy-local session ID sent as _session_id to session_start.
    proxy_session_id:      String,
}

impl Proxy {
    /// Create a new Proxy.  Opens the local database immediately.
    pub fn new(upstream_url: String, http: Client) -> Result<Self> {
        let db = db::open()?;
        // Generate a stable proxy-local session ID for this process lifetime.
        let proxy_session_id = {
            let secs = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            format!("proxy-{secs:x}")
        };
        Ok(Proxy {
            upstream_url,
            upstream_connected:    Arc::new(AtomicBool::new(false)),
            last_connected_secs:   Arc::new(AtomicU64::new(0)),
            session_id:            Mutex::new(None),
            cached_tools:          Mutex::new(None),
            client_profile:        Mutex::new(ClientProfile::default()),
            started_at:            Instant::now(),
            db:                    Mutex::new(db),
            http,
            session_init_done:     AtomicBool::new(false),
            instructions_surfaced: AtomicBool::new(false),
            pending_instructions:  Mutex::new(None),
            proxy_session_id,
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
                Err(e) => {
                    clog!("[proxy] tools/list forward failed: {e}");
                    self.mark_upstream_disconnected();
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

        // Session init: on the first real tool call with a workspace_id, fire
        // memory_session(action: session_start) to fetch priority instructions.
        if connected && !self.session_init_done.load(Ordering::Relaxed) {
            let workspace_id = args["workspace_id"].as_str()
                .or_else(|| args["workspace_path"].as_str());
            if workspace_id.is_some() {
                self.session_init_done.store(true, Ordering::Relaxed);
                let client_type_str = {
                    let profile = self.client_profile.lock().unwrap();
                    match &profile.client_type {
                        crate::client_detect::ClientType::ClaudeCli  => "cli",
                        crate::client_detect::ClientType::VsCode     => "vscode",
                        crate::client_detect::ClientType::Unknown(_) => "unknown",
                    }
                    .to_string()
                };
                let init_req = json!({
                    "jsonrpc": "2.0",
                    "id": 0,
                    "method": "tools/call",
                    "params": {
                        "name": "memory_session",
                        "arguments": {
                            "action": "session_start",
                            "workspace_id": workspace_id,
                            "_session_id": self.proxy_session_id,
                            "_client_type": client_type_str
                        }
                    }
                });
                let session = self.session_id.lock().unwrap().clone();
                if let Ok((resp, new_sid)) = upstream::forward(
                    &self.http, &self.upstream_url, session.as_deref(), &init_req,
                ).await {
                    self.update_session(new_sid);
                    // Extract priority_instructions from session_start result.
                    let instructions = resp["result"]["content"][0]["text"]
                        .as_str()
                        .and_then(|s| serde_json::from_str::<Value>(s).ok())
                        .and_then(|v| {
                            let instrs = v.pointer("/data/data/priority_instructions")
                                .cloned()
                                .unwrap_or(Value::Null);
                            if instrs.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
                                Some(instrs)
                            } else {
                                None
                            }
                        });
                    if let Some(instrs) = instructions {
                        *self.pending_instructions.lock().unwrap() = Some(instrs);
                    }
                }
            }
        }

        if connected {
            // Forward to upstream for ALL tool calls (single source of truth).
            let session = self.session_id.lock().unwrap().clone();
            match upstream::forward(&self.http, &self.upstream_url, session.as_deref(), req).await {
                Ok((resp, new_sid)) => {
                    self.update_session(new_sid);
                    let mut result = extract_tool_result(resp);
                    // Inject pending priority_instructions once into the first response.
                    self.maybe_inject_instructions(&mut result);
                    return json_result(id, result);
                }
                Err(e) => {
                    clog!("[proxy] forward failed for {name}: {e}");
                    self.mark_upstream_disconnected();
                    // Fall through to local handling if local-capable.
                }
            }
        }

        // Supervisor is down (or upstream call failed).
        if LOCAL_CAPABLE.contains(&name.as_str()) {
            let result = self.dispatch_local(&name, &args);
            return json_result(id, result);
        }

        // Upstream-only tool — supervisor not reachable.
        json_result(id, json!({
            "content": [{
                "type": "text",
                "text": format!(
                    "'{name}' requires the Project Memory supervisor, which is not currently reachable.\n\
                     The supervisor will reconnect automatically. \
                     Use 'runtime_mode' to check status, or 'memory_plan'/'memory_steps'/'memory_workspace'/'memory_instructions' \
                     for operations that work without the supervisor."
                )
            }],
            "isError": true
        }))
    }

    /// If priority_instructions are pending and haven't been surfaced yet,
    /// inject them as a `priority_instructions` field into the tool result content.
    fn maybe_inject_instructions(&self, result: &mut Value) {
        if self.instructions_surfaced.load(Ordering::Relaxed) {
            return;
        }
        let pending = self.pending_instructions.lock().unwrap().take();
        if let Some(instrs) = pending {
            self.instructions_surfaced.store(true, Ordering::Relaxed);
            // Parse the first content[0].text JSON and inject the field, or
            // append a new content item with the instructions.
            if let Some(content) = result.get_mut("content").and_then(|c| c.as_array_mut()) {
                if let Some(first) = content.first_mut() {
                    if let Some(text) = first["text"].as_str() {
                        if let Ok(mut parsed) = serde_json::from_str::<Value>(text) {
                            parsed["priority_instructions"] = instrs;
                            first["text"] = Value::String(
                                serde_json::to_string(&parsed).unwrap_or_default()
                            );
                            return;
                        }
                    }
                }
                // Fallback: append a separate content item.
                content.push(json!({
                    "type": "text",
                    "text": serde_json::to_string(&json!({
                        "priority_instructions": instrs,
                        "notice": "PRIORITY: These workspace instructions must be followed for all work in this session."
                    })).unwrap_or_default()
                }));
            }
        }
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
            Err(e) => {
                self.mark_upstream_disconnected();
                json_error(id, -32603, &e.to_string())
            }
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
                "error": format!("action '{other}' is not supported by the local handler; start the supervisor for full access"),
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
                "error": format!("action '{other}' is not supported by the local handler; start the supervisor for full access"),
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
                "error": format!("action '{other}' is not supported by the local handler; start the supervisor for full access"),
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
                "error": format!("action '{other}' is not supported by the local handler; start the supervisor for full access"),
                "available_actions": ["list", "get", "get_section", "search", "list_workspace"]
            })),
        };

        text_result(result)
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /// Return the cached upstream connection state.
    ///
    /// When already known-connected, no network call is made — the background
    /// reconnect loop and call-failure detection keep the flag accurate.
    /// When known-disconnected, a real health check is done so the proxy can
    /// detect when the supervisor comes back online mid-session.
    async fn ping_upstream(&self) -> bool {
        if self.upstream_connected.load(Ordering::Relaxed) {
            // Fast path: already connected, no HTTP call needed.
            return true;
        }

        // Slow path: not connected — check if supervisor is back.
        let base_url = self.upstream_url.trim_end_matches("/mcp").to_string();
        let now_connected = upstream::health_check(&self.http, &base_url).await;

        if now_connected {
            self.upstream_connected.store(true, Ordering::Relaxed);
            let secs = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            self.last_connected_secs.store(secs, Ordering::Relaxed);
            // Re-establish MCP session with the upstream.
            let init_req = upstream::make_initialize_request();
            let session  = self.session_id.lock().unwrap().clone();
            if let Ok((_, new_sid)) = upstream::forward(
                &self.http, &self.upstream_url, session.as_deref(), &init_req,
            ).await {
                self.update_session(new_sid);
            }
            clog!("[proxy] upstream reconnected, session established");
        }

        now_connected
    }

    /// Mark the upstream as disconnected (called when a forward call fails).
    fn mark_upstream_disconnected(&self) {
        if self.upstream_connected.swap(false, Ordering::Relaxed) {
            clog!("[proxy] upstream marked disconnected after call failure");
        }
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

    tools.push(json!({
        "name": "memory_workspace",
        "description": "Register, list, and query workspaces. Actions: register, list, info, reindex, merge, link, set_display_name, inject_cli_mcp, and more.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action":           { "type": "string" },
                "workspace_id":     { "type": "string" },
                "workspace_path":   { "type": "string" },
                "path":             { "type": "string" },
                "name":             { "type": "string" },
                "all_workspaces":   { "type": "boolean" },
                "cli_mcp_port":     { "type": "number" }
            },
            "required": ["action"]
        }
    }));
    tools.push(json!({
        "name": "memory_plan",
        "description": "Create and manage implementation plans. Actions: create, list, get, update, archive, find, add_note, confirm, set_goals, and more.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action":       { "type": "string" },
                "workspace_id": { "type": "string" },
                "plan_id":      { "type": "string" },
                "title":        { "type": "string" },
                "description":  { "type": "string" },
                "status":       { "type": "string" },
                "category":     { "type": "string" },
                "priority":     { "type": "string" },
                "goals":        { "type": "array", "items": { "type": "string" } }
            },
            "required": ["action"]
        }
    }));
    tools.push(json!({
        "name": "memory_steps",
        "description": "Manage plan steps — add, update status, reorder, and track progress. Actions: add, list, next, update, batch_update, insert, delete, reorder, move, sort.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action":             { "type": "string" },
                "plan_id":            { "type": "string" },
                "step_id":            { "type": "string" },
                "phase":              { "type": "string" },
                "task":               { "type": "string" },
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
        "description": "Store and retrieve instruction files for agents. Actions: list, get, get_section, search, list_workspace, assign_priority.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action":       { "type": "string" },
                "filename":     { "type": "string" },
                "heading":      { "type": "string" },
                "query":        { "type": "string" },
                "workspace_id": { "type": "string" },
                "content":      { "type": "string" },
                "applies_to":   { "type": "string" }
            },
            "required": ["action"]
        }
    }));
    tools.push(json!({
        "name": "memory_context",
        "description": "Store and retrieve research findings, decisions, and architectural notes across sessions.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action":       { "type": "string" },
                "workspace_id": { "type": "string" },
                "key":          { "type": "string" },
                "content":      { "type": "string" },
                "category":     { "type": "string" }
            },
            "required": ["action"]
        }
    }));
    tools.push(json!({
        "name": "memory_session",
        "description": "Prepare and track agent sessions, surface relevant context on startup.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action":       { "type": "string" },
                "workspace_id": { "type": "string" },
                "agent_type":   { "type": "string" },
                "session_id":   { "type": "string" }
            },
            "required": ["action"]
        }
    }));
    tools.push(json!({
        "name": "memory_agent",
        "description": "Agent lifecycle management, skills, and instruction dispatch.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action":       { "type": "string" },
                "workspace_id": { "type": "string" },
                "agent_id":     { "type": "string" }
            },
            "required": ["action"]
        }
    }));
    tools.push(json!({
        "name": "memory_filesystem",
        "description": "Track file operations and workspace file changes.",
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
        "name": "memory_terminal",
        "description": "Terminal session context and command history tracking.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action":     { "type": "string" },
                "session_id": { "type": "string" }
            },
            "required": ["action"]
        }
    }));
    tools.push(json!({
        "name": "memory_brainstorm",
        "description": "Structured brainstorming sessions with idea capture and organisation.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action":       { "type": "string" },
                "workspace_id": { "type": "string" },
                "topic":        { "type": "string" }
            },
            "required": ["action"]
        }
    }));
    tools.push(json!({
        "name": "memory_cartographer",
        "description": "Codebase exploration and mapping — index and query project structure.",
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
        "name": "memory_sprint",
        "description": "Sprint and goal tracking — create and manage short-horizon delivery goals.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action":       { "type": "string" },
                "workspace_id": { "type": "string" },
                "sprint_id":    { "type": "string" }
            },
            "required": ["action"]
        }
    }));

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
