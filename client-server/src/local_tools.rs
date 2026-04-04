//! Tools always handled locally by the proxy (never forwarded upstream).

use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use crate::client_detect::ClientProfile;

pub fn handle_ping() -> Value {
    json!({ "content": [{ "type": "text", "text": "pong" }] })
}

pub fn handle_runtime_mode(
    connected: &Arc<AtomicBool>,
    started_at: &Instant,
    profile: &ClientProfile,
    upstream_url: &str,
    last_connected_secs: Option<u64>,
) -> Value {
    let is_connected = connected.load(Ordering::Relaxed);
    let uptime_secs  = started_at.elapsed().as_secs();

    let mode = json!({
        "connected":            is_connected,
        "upstream_url":         upstream_url,
        "uptime_secs":          uptime_secs,
        "last_connected_secs":  last_connected_secs,
        "degraded":             !is_connected,
        "client_type":          profile.client_type.as_str(),
        "client_name":          profile.client_name,
        "client_version":       profile.client_version,
        "tools_available":      true,
        "local_tools_only":     !is_connected,
    });

    json!({
        "content": [{
            "type": "text",
            "text": serde_json::to_string_pretty(&mode).unwrap_or_default()
        }]
    })
}
