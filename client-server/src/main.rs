//! client-proxy — stdio MCP proxy for Project Memory
//!
//! Reads JSON-RPC messages (one per line) from stdin, dispatches them through
//! [`Proxy`], and writes responses to stdout.  All diagnostic output goes to
//! stderr so it never pollutes the MCP stream.
//!
//! Upstream URL defaults to `http://127.0.0.1:3466/mcp` and can be overridden
//! with the `PM_MCP_URL` environment variable.

mod client_detect;
mod db;
mod local_tools;
mod proxy;
mod upstream;

use anyhow::Result;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

const DEFAULT_MCP_URL: &str = "http://127.0.0.1:3466/mcp";

#[tokio::main]
async fn main() -> Result<()> {
    // Upstream URL from env or default.
    let mcp_url = std::env::var("PM_MCP_URL").unwrap_or_else(|_| DEFAULT_MCP_URL.to_string());

    let http  = upstream::build_client();
    let proxy = Arc::new(proxy::Proxy::new(mcp_url.clone(), http.clone())?);

    eprintln!("[client-proxy] started — upstream: {mcp_url}");
    eprintln!("[client-proxy] db: {}", db::db_path().display());

    // Background reconnect loop: health-check every 5 s, re-establish session when status changes.
    {
        let connected_flag   = proxy.connected_flag();
        let last_connected   = proxy.last_connected_arc();
        let http2 = http.clone();
        let url   = mcp_url.clone();
        tokio::spawn(async move {
            reconnect_loop(http2, url, connected_flag, last_connected).await;
        });
    }

    // ── Main stdio loop ───────────────────────────────────────────────────────

    let stdin  = BufReader::new(tokio::io::stdin());
    let mut stdout = tokio::io::stdout();
    let mut lines = stdin.lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }

        let request: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v)  => v,
            Err(e) => {
                eprintln!("[client-proxy] parse error: {e}");
                continue;
            }
        };

        // Notifications have no "id" field — handle silently, no response.
        let is_notification = request.get("id").is_none();

        let response = proxy.handle(&request).await;

        // Only write a response for requests (not notifications / null returns).
        if !is_notification && response != serde_json::Value::Null {
            let mut bytes = serde_json::to_vec(&response).unwrap_or_default();
            bytes.push(b'\n');
            if let Err(e) = stdout.write_all(&bytes).await {
                eprintln!("[client-proxy] write error: {e}");
                break;
            }
            stdout.flush().await.ok();
        }
    }

    eprintln!("[client-proxy] stdin closed, exiting");
    Ok(())
}

/// Periodically checks the upstream health endpoint and logs state changes.
async fn reconnect_loop(
    http: reqwest::Client,
    upstream_url: String,
    flag: Arc<std::sync::atomic::AtomicBool>,
    last_connected: Arc<std::sync::atomic::AtomicU64>,
) {
    use std::sync::atomic::Ordering;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    let base_url = upstream_url.trim_end_matches("/mcp").to_string();
    let mut last = flag.load(Ordering::Relaxed);

    loop {
        tokio::time::sleep(Duration::from_secs(5)).await;
        let now = upstream::health_check(&http, &base_url).await;
        if now != last {
            flag.store(now, Ordering::Relaxed);
            eprintln!(
                "[client-proxy] upstream {}",
                if now { "reconnected" } else { "disconnected" }
            );
            last = now;
        }
        if now {
            let secs = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            last_connected.store(secs, Ordering::Relaxed);
        }
    }
}
