//! client-proxy — stdio MCP proxy for Project Memory
//!
//! Reads JSON-RPC messages (one per line) from stdin, dispatches them through
//! [`Proxy`], and writes responses to stdout.  All diagnostic output goes to
//! stderr so it never pollutes the MCP stream.
//!
//! Upstream URL resolution order (highest priority first):
//!   1. `PM_MCP_URL` environment variable (explicit override)
//!   2. `%APPDATA%/ProjectMemory/ports.json` written by the supervisor at startup
//!   3. Hard-coded default `http://127.0.0.1:3466/mcp`

mod client_detect;
mod db;
mod log;
mod local_tools;
mod proxy;
mod upstream;

use anyhow::Result;
use log::clog;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

const DEFAULT_MCP_URL: &str = "http://127.0.0.1:3466/mcp";

/// Try to discover the upstream MCP URL from the supervisor's ports.json manifest.
///
/// The supervisor writes `%APPDATA%/ProjectMemory/ports.json` (Windows) or
/// `~/.local/share/ProjectMemory/ports.json` (other platforms) when it starts,
/// and removes it on clean shutdown.  The file contains a `services.mcp_proxy`
/// field with the port the MCP HTTP server is bound to.
fn discover_mcp_url_from_ports_manifest() -> Option<String> {
    #[cfg(windows)]
    let base = std::env::var("APPDATA").ok()?;
    #[cfg(not(windows))]
    let base = {
        let home = std::env::var("HOME").ok()?;
        format!("{home}/.local/share")
    };

    let ports_path = std::path::PathBuf::from(&base)
        .join("ProjectMemory")
        .join("ports.json");

    let content = std::fs::read_to_string(&ports_path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    let port = json["services"]["mcp_proxy"].as_u64()?;

    eprintln!(
        "[client-proxy] discovered MCP port {} from {}",
        port,
        ports_path.display()
    );
    Some(format!("http://127.0.0.1:{port}/mcp"))
}

#[tokio::main]
async fn main() -> Result<()> {
    // Init log file before anything else.
    let log_path = log::log_path();
    log::init(&log_path);

    // Upstream URL: PM_MCP_URL env var > ports.json manifest > default.
    let (mcp_url, url_source) = if let Ok(v) = std::env::var("PM_MCP_URL") {
        (v, "PM_MCP_URL env")
    } else if let Some(v) = discover_mcp_url_from_ports_manifest() {
        (v, "ports.json")
    } else {
        (DEFAULT_MCP_URL.to_string(), "default")
    };

    let http  = upstream::build_client();
    let proxy = Arc::new(proxy::Proxy::new(mcp_url.clone(), http.clone())?);

    clog!("[client-proxy] started — upstream: {mcp_url} (source: {url_source})");
    clog!("[client-proxy] db: {}", db::db_path().display());
    clog!("[client-proxy] log: {}", log_path.display());

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
                clog!("[client-proxy] parse error: {e}");
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
                clog!("[client-proxy] write error: {e}");
                break;
            }
            stdout.flush().await.ok();
        }
    }

    clog!("[client-proxy] stdin closed, exiting");
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
        tokio::time::sleep(Duration::from_secs(30)).await;
        let now = upstream::health_check(&http, &base_url).await;
        if now != last {
            flag.store(now, Ordering::Relaxed);
            clog!(
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
