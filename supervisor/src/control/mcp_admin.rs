//! HTTP client for the MCP server's supervisor admin API.
//!
//! The MCP server exposes:
//!   GET  /admin/connections           — list active VS Code sessions
//!   DELETE /admin/connections/:id     — close a specific session
//!
//! These are called by the supervisor's poll loop and control handler.

use std::time::Duration;

use anyhow::Context;
use serde::Deserialize;

/// Connection entry as returned by `GET /admin/connections` on the MCP server.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteConnectionEntry {
    pub session_id: String,
    #[serde(rename = "type")]
    pub transport_type: String,
    pub connected_at: String,
    pub last_activity: Option<String>,
    #[serde(default)]
    pub call_count: u64,
    pub agent_type: Option<String>,
    pub workspace_id: Option<String>,
    pub plan_id: Option<String>,
}

/// Fetch the list of active connections from a running MCP instance.
///
/// `base_url` should be the root of the MCP HTTP server, e.g.
/// `"http://127.0.0.1:3460"`.  The function appends `/admin/connections`.
pub async fn fetch_mcp_connections(
    base_url: &str,
    timeout_ms: u64,
) -> anyhow::Result<Vec<RemoteConnectionEntry>> {
    let url = format!("{base_url}/admin/connections");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .context("failed to build reqwest client")?;

    let resp = client
        .get(&url)
        .send()
        .await
        .with_context(|| format!("GET {url} failed"))?;

    if !resp.status().is_success() {
        anyhow::bail!("GET {url} returned HTTP {}", resp.status());
    }

    resp.json::<Vec<RemoteConnectionEntry>>()
        .await
        .with_context(|| format!("failed to deserialise response from {url}"))
}

/// Ask a running MCP instance to close a specific session.
///
/// Returns `Ok(true)` if the session was found and closed, `Ok(false)` if it
/// was not found (404), and `Err` for other failures.
pub async fn close_mcp_connection(
    base_url: &str,
    session_id: &str,
    timeout_ms: u64,
) -> anyhow::Result<bool> {
    let url = format!("{base_url}/admin/connections/{session_id}");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .context("failed to build reqwest client")?;

    let resp = client
        .delete(&url)
        .send()
        .await
        .with_context(|| format!("DELETE {url} failed"))?;

    match resp.status().as_u16() {
        200..=299 => Ok(true),
        404 => Ok(false),
        other => anyhow::bail!("DELETE {url} returned HTTP {other}"),
    }
}
