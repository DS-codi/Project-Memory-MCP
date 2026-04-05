//! HTTP upstream client — forwards JSON-RPC calls to the supervisor's MCP server.

use anyhow::{bail, Result};
use futures_util::StreamExt as _;
use reqwest::Client;
use serde_json::{json, Value};
use std::time::{Duration, Instant};

use crate::log::clog;

const CONNECT_TIMEOUT_MS: u64  = 500;
const CALL_TIMEOUT_SECS:  u64  = 10;   // was 60 — shorter so freezes are obvious
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
/// Per-call results are intentionally not logged here; the reconnect loop
/// in main.rs logs state transitions (connected/disconnected) instead.
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
    let method = request["method"].as_str().unwrap_or("?");
    let tool   = request["params"]["name"].as_str().unwrap_or("");
    let label  = if tool.is_empty() { method.to_string() } else { format!("{method}({tool})") };
    clog!("[upstream] → {label} sid={}", session_id.unwrap_or("none"));
    let t0 = Instant::now();

    let mut builder = client
        .post(mcp_url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream")
        .json(request);

    if let Some(sid) = session_id {
        builder = builder.header("Mcp-Session-Id", sid);
    }

    let response = builder.send().await.map_err(|e| {
        clog!("[upstream] ✗ send failed after {}ms: {e}", t0.elapsed().as_millis());
        e
    })?;
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

    // 202 Accepted — server acknowledged a notification but sends no body.
    if status == 202 {
        clog!("[upstream] ✓ {label} 202 Accepted (no body) in {}ms", t0.elapsed().as_millis());
        return Ok((Value::Null, new_session));
    }

    if !status.is_success() {
        clog!("[upstream] ✗ {label} HTTP {status} after {}ms", t0.elapsed().as_millis());
        bail!("upstream returned HTTP {}", status);
    }

    clog!("[upstream] ← {label} HTTP {status} content-type={content_type} after {}ms — reading body", t0.elapsed().as_millis());

    if content_type.contains("text/event-stream") {
        // Stream line-by-line and return as soon as the first data: event arrives.
        // DO NOT use response.text() — it reads the entire body, which blocks until
        // the server closes the SSE stream (which it may never do for long-lived
        // connections), causing every tool call to hang for up to CALL_TIMEOUT_SECS.
        let result = read_first_sse_event(response).await.map_err(|e| {
            clog!("[upstream] ✗ SSE read failed for {label} after {}ms: {e}", t0.elapsed().as_millis());
            e
        })?;
        clog!("[upstream] ✓ {label} (SSE) completed in {}ms", t0.elapsed().as_millis());
        Ok((result, new_session))
    } else {
        let result: Value = response.json().await.map_err(|e| {
            clog!("[upstream] ✗ JSON read failed for {label} after {}ms: {e}", t0.elapsed().as_millis());
            e
        })?;
        clog!("[upstream] ✓ {label} (JSON) completed in {}ms", t0.elapsed().as_millis());
        Ok((result, new_session))
    }
}

/// Read an SSE response body chunk-by-chunk and return as soon as the first
/// non-empty `data:` line is found — without waiting for the stream to close.
async fn read_first_sse_event(response: reqwest::Response) -> Result<Value> {
    let mut stream = response.bytes_stream();
    let mut buf = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        buf.push_str(&String::from_utf8_lossy(&chunk));

        // Scan complete lines accumulated so far.
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim_end_matches('\r').to_string();
            buf = buf[pos + 1..].to_string();
            if let Some(data) = line.strip_prefix("data:") {
                let data = data.trim();
                if !data.is_empty() && data != "[DONE]" {
                    return Ok(serde_json::from_str(data)?);
                }
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
