//! AI chatbot module — handles communication with Gemini and GitHub Models,
//! including MCP tool-calling loops for plan/workspace management.

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
    ]
}

const SYSTEM_PROMPT: &str = "\
You are the Project Memory AI Assistant embedded in the supervisor dashboard. \
Your role is to help manage AI agent plans, workspaces, and sessions.\n\n\
CAPABILITIES:\n\
1. MANAGE PLANS — query plans, update step statuses, add notes, set priority\n\
2. DETERMINE PRIORITY — rank plans by urgency, blocked state, and goal alignment\n\
3. REVIEW PLANS — summarise progress, highlight blockers, suggest next steps\n\
4. REVIEW WORKSPACES — report workspace health, identify stale/abandoned plans\n\n\
RULES:\n\
- Always call list_workspaces then list_plans before making recommendations about plans.\n\
- When ranking priority: consider the priority field, number of blocked steps, days since last activity, stated goals.\n\
- For write actions (add_note, update_step_status, set_plan_priority): execute when clearly requested.\n\
- Be concise. Format plan reviews as bullet lists. Flag blockers with ⚠️.\n\
- Step indices in plans are 0-based but displayed as 1-based to users.";

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
    let effective_model = if model.is_empty() { "gemini-2.0-flash" } else { model };
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        effective_model, api_key
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

    let resp = client.post(&url).json(&body).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Gemini API error: {text}"));
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
    if req.config.api_key.is_empty() {
        return Err("No API key configured. Please set an API key in the chatbot settings.".to_string());
    }

    let client = Client::new();
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
            ChatbotProvider::Gemini  => call_gemini (&client, &req.config.api_key, &req.config.model, &messages, &tools).await?,
            ChatbotProvider::Copilot => call_copilot(&client, &req.config.api_key, &req.config.model, &messages, &tools).await?,
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
                let result = execute_chatbot_tool(&client, &req.mcp_base_url, &tool_name, args).await
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
                let result = execute_chatbot_tool(&client, &req.mcp_base_url, &tool_name, args).await
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

async fn execute_chatbot_tool(
    client: &Client,
    mcp_base_url: &str,
    tool_name: &str,
    args: Value,
) -> Result<Value, String> {
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
        unknown => Err(format!("Unknown chatbot tool: {unknown}"))
    }
}
