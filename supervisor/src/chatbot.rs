//! AI chatbot module — handles communication with Gemini, GitHub Models, and
//! Anthropic Claude, including MCP tool-calling loops for plan/workspace management.

use std::error::Error as _;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::config::{ChatbotProvider, ChatbotSection};

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatRequest {
    pub messages:     Vec<ChatMessage>,
    pub workspace_id: Option<String>,
    pub mcp_base_url: String,
    pub config:       ChatbotSection,
    /// Shared live tool-call log; pushed to as each tool executes.
    /// `None` when caller does not need progressive tracking.
    #[serde(skip)]
    pub live_log: Option<Arc<StdMutex<Vec<String>>>>,
}

#[derive(Debug, Serialize)]
pub struct ChatResponse {
    pub reply:           String,
    pub tool_calls_made: Vec<String>,
}

// ---------------------------------------------------------------------------
// MCP tool execution
// ---------------------------------------------------------------------------

async fn execute_mcp_tool(
    client: &Client,
    mcp_base_url: &str,
    tool_name: &str,
    args: Value,
) -> Result<Value, String> {
    let url = format!("{}/admin/mcp_call", mcp_base_url);
    let body = json!({ "name": tool_name, "arguments": args });
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("MCP call failed: {text}"));
    }
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json.get("result").cloned().unwrap_or(json))
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

fn tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "list_workspaces",
            "description": "List all registered Project Memory workspaces.",
            "parameters": { "type": "object", "properties": {}, "required": [] }
        }),
        json!({
            "name": "list_plans",
            "description": "List all active plans in a workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": { "type": "string", "description": "The workspace ID" }
                },
                "required": ["workspace_id"]
            }
        }),
        json!({
            "name": "get_plan",
            "description": "Get the full state of a specific plan including all steps, goals, and progress.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": { "type": "string" },
                    "plan_id":      { "type": "string" }
                },
                "required": ["workspace_id", "plan_id"]
            }
        }),
        json!({
            "name": "get_workspace_info",
            "description": "Get detailed information about a workspace including plan summary.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": { "type": "string" }
                },
                "required": ["workspace_id"]
            }
        }),
        json!({
            "name": "get_active_sessions",
            "description": "Get currently active agent sessions.",
            "parameters": { "type": "object", "properties": {}, "required": [] }
        }),
        json!({
            "name": "add_plan_note",
            "description": "Add a note to a plan.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": { "type": "string" },
                    "plan_id":      { "type": "string" },
                    "note":         { "type": "string" },
                    "note_type":    { "type": "string", "enum": ["info", "warning", "instruction"] }
                },
                "required": ["workspace_id", "plan_id", "note"]
            }
        }),
        json!({
            "name": "set_plan_priority",
            "description": "Update the priority of a plan.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": { "type": "string" },
                    "plan_id":      { "type": "string" },
                    "priority":     { "type": "string", "enum": ["low", "medium", "high", "critical"] }
                },
                "required": ["workspace_id", "plan_id", "priority"]
            }
        }),
        json!({
            "name": "update_step_status",
            "description": "Update the status of a specific plan step.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": { "type": "string" },
                    "plan_id":      { "type": "string" },
                    "step_index":   { "type": "integer" },
                    "status":       { "type": "string", "enum": ["pending", "active", "done", "blocked"] },
                    "notes":        { "type": "string" }
                },
                "required": ["workspace_id", "plan_id", "step_index", "status"]
            }
        }),
        // ── Plan cleanup / consolidation tools ────────────────────────────
        json!({
            "name": "archive_plan",
            "description": "Archive a completed or superseded plan. Prefer this over delete_plan for any plan with historical value (done work, replaced plans, finished goals).",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": { "type": "string" },
                    "plan_id":      { "type": "string" }
                },
                "required": ["workspace_id", "plan_id"]
            }
        }),
        json!({
            "name": "list_archived_plans",
            "description": "List all archived plans in a workspace. Use during audits to understand historical work and spot superseded duplicates still marked active.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": { "type": "string" }
                },
                "required": ["workspace_id"]
            }
        }),
        json!({
            "name": "create_program",
            "description": "Create an integrated program — a named container that groups multiple related plans together under a single overarching goal.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": { "type": "string" },
                    "title":        { "type": "string", "description": "Short program title" },
                    "description":  { "type": "string", "description": "What this program encompasses" }
                },
                "required": ["workspace_id", "title", "description"]
            }
        }),
        json!({
            "name": "add_plan_to_program",
            "description": "Link an existing plan to a program as a child plan.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": { "type": "string" },
                    "program_id":   { "type": "string", "description": "The program's plan ID" },
                    "plan_id":      { "type": "string", "description": "The plan to add" }
                },
                "required": ["workspace_id", "program_id", "plan_id"]
            }
        }),
        json!({
            "name": "upgrade_to_program",
            "description": "Upgrade an existing plan to an integrated program. The original plan becomes the first child plan. Use when a plan has grown to encompass multiple distinct sub-goals.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": { "type": "string" },
                    "plan_id":      { "type": "string" }
                },
                "required": ["workspace_id", "plan_id"]
            }
        }),
        json!({
            "name": "list_program_plans",
            "description": "List all child plans within a program.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": { "type": "string" },
                    "program_id":   { "type": "string" }
                },
                "required": ["workspace_id", "program_id"]
            }
        }),
        json!({
            "name": "consolidate_steps",
            "description": "Merge multiple adjacent steps in a plan into a single step. Use to simplify bloated or overly granular plans where steps share a logical unit of work.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id":       { "type": "string" },
                    "plan_id":            { "type": "string" },
                    "step_indices":       { "type": "array", "items": { "type": "integer" }, "description": "0-based indices of the steps to merge" },
                    "consolidated_task":  { "type": "string", "description": "New task description for the merged step" }
                },
                "required": ["workspace_id", "plan_id", "step_indices", "consolidated_task"]
            }
        }),
        json!({
            "name": "delete_plan",
            "description": "Permanently delete a plan. Use ONLY for clearly erroneous, accidental duplicate, or empty placeholder plans. For completed or superseded work use archive_plan instead. Always confirm with the user before calling this.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workspace_id": { "type": "string" },
                    "plan_id":      { "type": "string" }
                },
                "required": ["workspace_id", "plan_id"]
            }
        }),
    ]
}

const SYSTEM_PROMPT: &str = "\
You are the Project Memory AI Assistant embedded in the supervisor dashboard. \
Your role is to help manage AI agent plans, workspaces, and sessions.\n\n\
CAPABILITIES:\n\
1. MANAGE PLANS — query plans, update step statuses, add notes, set priority\n\
2. DETERMINE PRIORITY — rank plans by urgency, blocked state, and goal alignment\n\
3. REVIEW PLANS — summarise progress, highlight blockers, suggest next steps\n\
4. REVIEW WORKSPACES — report workspace health, identify stale/abandoned plans\n\
5. CONSOLIDATE PLANS — merge related plans into programs, simplify bloated step lists\n\
6. CLEAN UP WORKSPACES — archive superseded/completed plans, delete duplicates, group related plans into programs\n\n\
RULES:\n\
- For read actions: call list_workspaces and list_plans (plus list_archived_plans when auditing) before making recommendations.\n\
- When ranking priority: consider the priority field, number of blocked steps, days since last activity, stated goals.\n\
- For write actions (add_note, update_step_status, set_plan_priority, archive_plan, create_program, add_plan_to_program, consolidate_steps): execute when clearly requested.\n\
- For destructive actions (delete_plan): always confirm the specific plan with the user BEFORE calling the tool.\n\
- For bulk cleanup proposals: present the full proposal first, then execute each action after the user confirms.\n\
- Be concise. Format plan reviews as bullet lists. Flag blockers with ⚠️.\n\
- Step indices in plans are 0-based but displayed as 1-based to users.\n\n\
CLEANUP WORKFLOW — when asked to clean up or audit a workspace:\n\
1. Call list_plans + list_archived_plans to get the full picture.\n\
2. For each active plan, call get_plan to read steps, goals, notes, and last activity.\n\
3. Classify each plan into one of: ACTIVE (in-progress work), DONE (all steps done, not archived), STALE (no recent activity, goal unclear), SUPERSEDED (replaced by a newer plan), DUPLICATE (same goal as another plan), RELATED (shares goal with 1+ other plans → program candidate).\n\
4. Present a prioritised cleanup proposal to the user listing every planned action before executing anything.\n\
5. Execute confirmed actions in this order: archive_plan for DONE/SUPERSEDED → create_program/add_plan_to_program for RELATED groups → delete_plan for confirmed DUPLICATE/empty plans.\n\n\
PROGRAM GROUPING RULES:\n\
- Suggest grouping when 2+ active plans share a feature area, system component, or overarching goal.\n\
- Use upgrade_to_program when one plan is the clear parent and others are sub-tasks of it.\n\
- Use create_program + add_plan_to_program when there is no natural parent plan.\n\
- After grouping, add a note to each child plan describing its relationship to the program.\n\n\
ARCHIVE vs DELETE:\n\
- archive_plan: completed work, replaced plans, historical milestones — anything with past value.\n\
- delete_plan: accidental duplicates, empty placeholders with no steps, notes, or sessions. Always confirm before deleting.\n\n\
STEP CONSOLIDATION:\n\
- Use consolidate_steps when a plan has many fine-grained steps added incrementally that now appear redundant.\n\
- Only consolidate steps that share a logical unit of work and the same assignee/phase.";

fn build_chat_http_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .use_native_tls()
        .user_agent("ProjectMemorySupervisor/0.1")
        .build()
        .map_err(|e| format!("Failed to create chatbot HTTP client: {e}"))
}

fn build_gemini_retry_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .http1_only()
        .use_native_tls()
        .user_agent("ProjectMemorySupervisor/0.1")
        .build()
        .map_err(|e| format!("Failed to create Gemini retry HTTP client: {e}"))
}

fn format_reqwest_error(prefix: &str, url: &str, error: &reqwest::Error) -> String {
    let mut message = format!("{prefix} for url ({url}): {error}");
    let mut source = error.source();
    while let Some(err) = source {
        message.push_str(": ");
        message.push_str(&err.to_string());
        source = err.source();
    }
    message
}

// ---------------------------------------------------------------------------
// Provider implementations
// ---------------------------------------------------------------------------

async fn call_gemini(
    client: &Client,
    api_key: &str,
    model: &str,
    messages: &[ChatMessage],
    tools: &[Value],
) -> Result<(String, Vec<(String, Value)>, Option<String>), String> {
    let effective_model = if model.trim().is_empty() { "gemini-2.0-flash" } else { model.trim() };
    let trimmed_api_key = api_key.trim();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        effective_model, trimmed_api_key
    );

    let mut contents: Vec<Value> = Vec::new();
    let mut system_instruction: Option<Value> = None;

    for msg in messages {
        match msg.role.as_str() {
            "system" => {
                system_instruction = Some(json!({
                    "parts": [{ "text": msg.content }]
                }));
            }
            "user" => {
                contents.push(json!({ "role": "user", "parts": [{ "text": msg.content }] }));
            }
            "assistant" | "model" => {
                contents.push(json!({ "role": "model", "parts": [{ "text": msg.content }] }));
            }
            // Verbatim replay of the model turn — preserves thought_signature and all parts
            "gemini_model_raw" => {
                if let Ok(content) = serde_json::from_str::<Value>(&msg.content) {
                    contents.push(content);
                }
            }
            // All tool responses for one round grouped into a single user turn
            "gemini_tool_responses" => {
                if let Ok(responses) = serde_json::from_str::<Vec<(String, String)>>(&msg.content) {
                    let parts: Vec<Value> = responses.iter().map(|(name, result_json)| {
                        json!({
                            "functionResponse": {
                                "name": name,
                                "response": { "content": result_json }
                            }
                        })
                    }).collect();
                    contents.push(json!({ "role": "user", "parts": parts }));
                }
            }
            "tool" => {
                // Legacy single-response fallback
                contents.push(json!({
                    "role": "user",
                    "parts": [{
                        "functionResponse": {
                            "name": msg.name.clone().unwrap_or_default(),
                            "response": { "content": msg.content }
                        }
                    }]
                }));
            }
            _ => {}
        }
    }

    let function_declarations: Vec<Value> = tools.iter().map(|t| {
        json!({
            "name": t["name"],
            "description": t["description"],
            "parameters": t["parameters"]
        })
    }).collect();

    let mut body = json!({
        "contents": contents,
        "tools": [{ "functionDeclarations": function_declarations }],
        "generationConfig": { "temperature": 0.3 }
    });
    if let Some(sys) = system_instruction {
        body["systemInstruction"] = sys;
    }

    let resp = match client.post(&url).json(&body).send().await {
        Ok(resp) => resp,
        Err(primary_error) => {
            let retry_client = build_gemini_retry_client()?;
            match retry_client.post(&url).json(&body).send().await {
                Ok(resp) => resp,
                Err(retry_error) => {
                    return Err(format!(
                        "Gemini request failed for model `{}`. Initial attempt: {}. Retry attempt: {}",
                        effective_model,
                        format_reqwest_error("error sending request", &url, &primary_error),
                        format_reqwest_error("error sending request", &url, &retry_error),
                    ));
                }
            }
        }
    };
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Gemini API error for model `{}` ({}): {}",
            effective_model,
            status,
            text,
        ));
    }
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;

    let model_content = json["candidates"][0]["content"].clone();
    let parts = model_content["parts"].as_array().cloned().unwrap_or_default();

    // Collect ALL function calls across all parts
    let mut function_calls: Vec<(String, Value)> = Vec::new();
    let mut text_buf = String::new();
    for part in &parts {
        if let Some(fc) = part.get("functionCall") {
            let name = fc["name"].as_str().unwrap_or("").to_string();
            let args = fc["args"].clone();
            function_calls.push((name, args));
        } else if let Some(t) = part["text"].as_str() {
            text_buf.push_str(t);
        }
    }

    if !function_calls.is_empty() {
        // Serialize complete model content for verbatim replay (preserves thought_signature)
        let raw = serde_json::to_string(&model_content).unwrap_or_default();
        return Ok((String::new(), function_calls, Some(raw)));
    }
    Ok((text_buf, vec![], None))
}

async fn call_copilot(
    client: &Client,
    api_key: &str,
    model: &str,
    messages: &[ChatMessage],
    tools: &[Value],
) -> Result<(String, Vec<(String, Value)>, Option<String>), String> {
    let effective_model = if model.is_empty() { "gpt-4o" } else { model };
    let url = "https://models.inference.ai.azure.com/chat/completions";

    let mut oai_messages: Vec<Value> = Vec::new();
    for m in messages.iter() {
        match m.role.as_str() {
            "function_call" => {
                let name = m.name.clone().unwrap_or_default();
                let id = m.tool_call_id.clone().unwrap_or_else(|| format!("call_{}", &name));
                oai_messages.push(json!({
                    "role": "assistant",
                    "content": serde_json::Value::Null,
                    "tool_calls": [{
                        "id": id,
                        "type": "function",
                        "function": { "name": name, "arguments": m.content.clone() }
                    }]
                }));
            }
            _ => {
                let mut obj = json!({ "role": m.role, "content": m.content });
                if let Some(id) = &m.tool_call_id { obj["tool_call_id"] = json!(id); }
                if let Some(n)  = &m.name        { obj["name"] = json!(n); }
                oai_messages.push(obj);
            }
        }
    }

    let oai_tools: Vec<Value> = tools.iter().map(|t| json!({
        "type": "function",
        "function": {
            "name":        t["name"],
            "description": t["description"],
            "parameters":  t["parameters"]
        }
    })).collect();

    let body = json!({
        "model": effective_model,
        "messages": oai_messages,
        "tools": oai_tools,
        "tool_choice": "auto",
        "temperature": 0.3
    });

    let resp = client
        .post(url)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Copilot API error: {text}"));
    }
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;

    let choice = &json["choices"][0]["message"];
    if let Some(tool_calls) = choice["tool_calls"].as_array() {
        if !tool_calls.is_empty() {
            let calls: Vec<(String, Value)> = tool_calls.iter().filter_map(|tc| {
                let name = tc["function"]["name"].as_str()?.to_string();
                let args_str = tc["function"]["arguments"].as_str().unwrap_or("{}");
                let args: Value = serde_json::from_str(args_str).unwrap_or(json!({}));
                Some((name, args))
            }).collect();
            return Ok((String::new(), calls, None));
        }
    }
    let text = choice["content"].as_str().unwrap_or("").to_string();
    Ok((text, vec![], None))
}

// ---------------------------------------------------------------------------
// Main chat loop
// ---------------------------------------------------------------------------

pub async fn chat_loop(req: ChatRequest) -> Result<ChatResponse, String> {
    let api_key = req.config.api_key.trim().to_string();
    let model = req.config.model.trim().to_string();

    if api_key.is_empty() {
        return Err("No API key configured. Please set an API key in the chatbot settings.".to_string());
    }

    let client = build_chat_http_client()?;
    let tools = tool_definitions();
    let mut tool_calls_made: Vec<String> = Vec::new();

    let system_content = match &req.workspace_id {
        Some(ws_id) if !ws_id.is_empty() => format!(
            "{}\n\nACTIVE WORKSPACE: The user has selected workspace `{}`.\n\
             Focus all responses on this workspace unless explicitly asked about another.\n\
             When listing or reviewing plans, use this workspace_id directly without calling list_workspaces first.",
            SYSTEM_PROMPT, ws_id
        ),
        _ => SYSTEM_PROMPT.to_string(),
    };

    let mut messages: Vec<ChatMessage> = vec![
        ChatMessage {
            role: "system".to_string(),
            content: system_content,
            tool_call_id: None,
            name: None,
        },
    ];
    messages.extend(req.messages.clone());

    for _round in 0..8 {
        let (text, calls, raw_model_content) = match req.config.provider {
            ChatbotProvider::Gemini  => call_gemini (&client, &api_key, &model, &messages, &tools).await?,
            ChatbotProvider::Copilot => call_copilot(&client, &api_key, &model, &messages, &tools).await?,
        };

        if calls.is_empty() {
            if text.is_empty() {
                // Model processed tools but returned no text — nudge for a summary
                messages.push(ChatMessage {
                    role: "user".to_string(),
                    content: "Please summarise the results above.".to_string(),
                    tool_call_id: None,
                    name: None,
                });
                continue;
            }
            return Ok(ChatResponse { reply: text, tool_calls_made });
        }

        if let Some(raw) = raw_model_content {
            // Gemini path: replay the exact model turn (preserves thought_signature)
            messages.push(ChatMessage {
                role: "gemini_model_raw".to_string(),
                content: raw,
                tool_call_id: None,
                name: None,
            });

            // Execute all tools and collect responses
            let mut grouped: Vec<(String, String)> = Vec::new();
            for (tool_name, args) in calls {
                tool_calls_made.push(tool_name.clone());
                let result = execute_chatbot_tool(&client, &req.mcp_base_url, &tool_name, args, req.live_log.as_ref()).await
                    .unwrap_or_else(|e| json!({ "error": e }));
                let result_json = serde_json::to_string(&result).unwrap_or_default();
                grouped.push((tool_name, result_json));
            }
            // Push all responses as a single grouped user turn
            messages.push(ChatMessage {
                role: "gemini_tool_responses".to_string(),
                content: serde_json::to_string(&grouped).unwrap_or_default(),
                tool_call_id: None,
                name: None,
            });
        } else {
            // Copilot path: individual function_call + tool messages
            for (tool_name, args) in calls {
                tool_calls_made.push(tool_name.clone());
                messages.push(ChatMessage {
                    role: "function_call".to_string(),
                    content: args.to_string(),
                    tool_call_id: Some(format!("call_{}", &tool_name)),
                    name: Some(tool_name.clone()),
                });
                let result = execute_chatbot_tool(&client, &req.mcp_base_url, &tool_name, args, req.live_log.as_ref()).await
                    .unwrap_or_else(|e| json!({ "error": e }));
                messages.push(ChatMessage {
                    role: "tool".to_string(),
                    content: serde_json::to_string(&result).unwrap_or_default(),
                    tool_call_id: Some(format!("call_{}", &tool_name)),
                    name: Some(tool_name),
                });
            }
        }
    }

    Err("Max tool-call rounds reached without a final response.".to_string())
}

/// Push a tool name to the live log if one is attached to this request.
fn record_live_tool(log: Option<&Arc<StdMutex<Vec<String>>>>, name: &str) {
    if let Some(log) = log {
        if let Ok(mut v) = log.lock() {
            v.push(name.to_string());
        }
    }
}

async fn execute_chatbot_tool(
    client: &Client,
    mcp_base_url: &str,
    tool_name: &str,
    args: Value,
    live_log: Option<&Arc<StdMutex<Vec<String>>>>,
) -> Result<Value, String> {
    record_live_tool(live_log, tool_name);
    match tool_name {
        "list_workspaces" => {
            execute_mcp_tool(client, mcp_base_url, "memory_workspace",
                json!({ "action": "list" })).await
        }
        "list_plans" => {
            let ws = args["workspace_id"].as_str().unwrap_or("");
            execute_mcp_tool(client, mcp_base_url, "memory_plan",
                json!({ "action": "list", "workspace_id": ws })).await
        }
        "get_plan" => {
            execute_mcp_tool(client, mcp_base_url, "memory_plan",
                json!({ "action": "get", "workspace_id": args["workspace_id"], "plan_id": args["plan_id"] })).await
        }
        "get_workspace_info" => {
            execute_mcp_tool(client, mcp_base_url, "memory_workspace",
                json!({ "action": "info", "workspace_id": args["workspace_id"] })).await
        }
        "get_active_sessions" => {
            let url = format!("{}/sessions/live", mcp_base_url);
            let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
            let json: Value = resp.json().await.map_err(|e| e.to_string())?;
            Ok(json)
        }
        "add_plan_note" => {
            let note_type = args["note_type"].as_str().unwrap_or("info");
            execute_mcp_tool(client, mcp_base_url, "memory_plan", json!({
                "action":       "add_note",
                "workspace_id": args["workspace_id"],
                "plan_id":      args["plan_id"],
                "note":         args["note"],
                "note_type":    note_type
            })).await
        }
        "set_plan_priority" => {
            let result = execute_mcp_tool(client, mcp_base_url, "memory_plan", json!({
                "action":       "set_plan_priority",
                "workspace_id": args["workspace_id"],
                "plan_id":      args["plan_id"],
                "priority":     args["priority"]
            })).await;
            match result {
                Ok(v)  => Ok(v),
                Err(_) => execute_mcp_tool(client, mcp_base_url, "memory_plan", json!({
                    "action":       "add_note",
                    "workspace_id": args["workspace_id"],
                    "plan_id":      args["plan_id"],
                    "note":         format!("Priority update requested: {}", args["priority"]),
                    "note_type":    "info"
                })).await,
            }
        }
        "update_step_status" => {
            let mut step_args = json!({
                "action":       "update",
                "workspace_id": args["workspace_id"],
                "plan_id":      args["plan_id"],
                "step_index":   args["step_index"],
                "status":       args["status"]
            });
            if let Some(notes) = args["notes"].as_str() {
                step_args["notes"] = json!(notes);
            }
            execute_mcp_tool(client, mcp_base_url, "memory_steps", step_args).await
        }
        "archive_plan" => {
            execute_mcp_tool(client, mcp_base_url, "memory_plan",
                json!({ "action": "archive", "workspace_id": args["workspace_id"], "plan_id": args["plan_id"] })).await
        }
        "list_archived_plans" => {
            let ws = args["workspace_id"].as_str().unwrap_or("");
            execute_mcp_tool(client, mcp_base_url, "memory_plan",
                json!({ "action": "list", "workspace_id": ws, "include_archived": true })).await
        }
        "create_program" => {
            execute_mcp_tool(client, mcp_base_url, "memory_plan", json!({
                "action":       "create_program",
                "workspace_id": args["workspace_id"],
                "title":        args["title"],
                "description":  args["description"]
            })).await
        }
        "add_plan_to_program" => {
            execute_mcp_tool(client, mcp_base_url, "memory_plan", json!({
                "action":       "add_plan_to_program",
                "workspace_id": args["workspace_id"],
                "program_id":   args["program_id"],
                "plan_id":      args["plan_id"]
            })).await
        }
        "upgrade_to_program" => {
            execute_mcp_tool(client, mcp_base_url, "memory_plan", json!({
                "action":       "upgrade_to_program",
                "workspace_id": args["workspace_id"],
                "plan_id":      args["plan_id"]
            })).await
        }
        "list_program_plans" => {
            execute_mcp_tool(client, mcp_base_url, "memory_plan", json!({
                "action":       "list_program_plans",
                "workspace_id": args["workspace_id"],
                "program_id":   args["program_id"]
            })).await
        }
        "consolidate_steps" => {
            execute_mcp_tool(client, mcp_base_url, "memory_plan", json!({
                "action":            "consolidate",
                "workspace_id":      args["workspace_id"],
                "plan_id":           args["plan_id"],
                "step_indices":      args["step_indices"],
                "consolidated_task": args["consolidated_task"]
            })).await
        }
        "delete_plan" => {
            execute_mcp_tool(client, mcp_base_url, "memory_plan", json!({
                "action":       "delete",
                "workspace_id": args["workspace_id"],
                "plan_id":      args["plan_id"],
                "confirm":      true
            })).await
        }
        unknown => Err(format!("Unknown chatbot tool: {unknown}"))
    }
}
