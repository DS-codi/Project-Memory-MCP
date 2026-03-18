//! mDNS-SD service advertisement for LAN discovery by the mobile app.
//!
//! Registers a `_projectmemory._tcp.local.` service with TXT records
//! `http_port=<value>` and `ws_port=<value>` so the mobile app can discover
//! the supervisor on the local network without a manually entered IP address.

use mdns_sd::{ServiceDaemon, ServiceInfo};
use std::collections::HashMap;

/// Advertise the supervisor over mDNS-SD on the local network.
///
/// This is a fire-and-forget registration: the `ServiceDaemon` is
/// intentionally leaked after registering so it keeps the advertisements
/// alive for the entire process lifetime.
pub async fn start(http_port: u16, ws_port: u16) -> anyhow::Result<()> {
    let mdns = ServiceDaemon::new()?;

    // Build a fully-qualified host name — mDNS requires a trailing dot.
    let raw_hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "localhost".to_string());
    let host_name = if raw_hostname.ends_with('.') {
        raw_hostname
    } else {
        format!("{}.", raw_hostname)
    };

    let mut properties = HashMap::new();
    properties.insert("http_port".to_string(), http_port.to_string());
    properties.insert("ws_port".to_string(), ws_port.to_string());

    let service_info = ServiceInfo::new(
        "_projectmemory._tcp.local.",
        "project-memory",
        &host_name,
        "", // empty → mdns-sd resolves the host IP automatically
        http_port,
        Some(properties),
    )?;

    mdns.register(service_info)?;

    tracing::info!(
        "mDNS: broadcasting _projectmemory._tcp.local. on http:{} ws:{}",
        http_port,
        ws_port
    );

    // Leak the daemon intentionally — it must remain alive to keep
    // the mDNS announcements going.  The OS reclaims all resources on exit.
    std::mem::forget(mdns);
    Ok(())
}
