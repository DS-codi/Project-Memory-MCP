//! HTTP upstream client — forwards JSON-RPC calls to the supervisor's MCP server.

use anyhow::{bail, Result};
use reqwest::Client;
use serde_json::{json, Value};
use std::time::Duration;

const CONNECT_TIMEOUT_MS: u64  = 500;
const CALL_TIMEOUT_SECS:  u64  = 60;
const HEALTH_TIMEOUT_MS:  u64  = 400;

/// Build a shared reqwest Client.
pub fn build_client() -> Client {
    Client::builder()
        .connect_timeout(Duration::from_millis(CONNECT_TIMEOUT_MS))
        .timeout(Duration::from_secs(CALL_TIMEOUT_SECS))
        .build()
        .expect("failed to build reqwest client")
}

/// Quick health-check against the supervisor's `/health` endpoint.
/// Returns `true` if the supervisor is reachable.
pub async fn health_check(client: &Client, base_url: &str) -> bool {
    let url = format!("{}/health", base_url.trim_end_matches("/mcp"));
    client
        .get(&url)
        .timeout(Duration::from_millis(HEALTH_TIMEOUT_MS))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// Forward a single JSON-RPC request to the upstream and return the response body.
///
/// Returns `Err` only on network/transport failures; an upstream error response
/// is returned as `Ok(value)` so the proxy can pass it through transparently.
pub async fn forward(
    client: &Client,
    mcp_url: &str,
    session_id: Option<&str>,
    request: &Value,
) -> Result<(Value, Option<String>)> {
    let mut builder = client
        .post(mcp_url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream")
        .json(request);

    if let Some(sid) = session_id {
        builder = builder.header("Mcp-Session-Id", sid);
    }

    let response = builder.send().await?;
    let status   = response.status();

    // Capture new session ID if the server assigns one.
    let new_session = response
        .headers()
        .get("Mcp-Session-Id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    if !status.is_success() {
        bail!("upstream returned HTTP {}", status);
    }

    if content_type.contains("text/event-stream") {
        let body = response.text().await?;
        let result = parse_sse_first(&body)?;
        Ok((result, new_session))
    } else {
        let result: Value = response.json().await?;
        Ok((result, new_session))
    }
}

/// Extract the first `data:` payload from an SSE stream.
fn parse_sse_first(body: &str) -> Result<Value> {
    for line in body.lines() {
        let trimmed = line.trim();
        if let Some(data) = trimmed.strip_prefix("data:") {
            let data = data.trim();
            if !data.is_empty() && data != "[DONE]" {
                return Ok(serde_json::from_str(data)?);
            }
        }
    }
    bail!("no data event found in SSE response")
}

/// Build an `initialize` request to establish a session with the upstream.
pub fn make_initialize_request() -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": 0,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "client-proxy",
                "version": env!("CARGO_PKG_VERSION")
            }
        }
    })
}
