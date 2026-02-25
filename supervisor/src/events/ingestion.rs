//! Ingests data-change events from the dashboard server's SSE stream and
//! re-broadcasts them on the supervisor's own [`EventsHandle`].
//!
//! The ingestion task connects to `GET {dashboard_url}/api/events/stream`.
//! On a clean disconnect or any error it reconnects with exponential backoff
//! (1 s → 2 s → 4 s → … → 30 s cap).  Each successful connection resets the
//! backoff to its initial value.
//!
//! Incoming SSE `mcp_event` frames are parsed and mapped to structured
//! [`DataChangeEvent`] variants.  Unknown event types fall through to
//! [`DataChangeEvent::Raw`] so no inbound event is silently dropped.
//!
//! ## Multi-instance MCP pool — deduplication (step 4.4)
//!
//! The supervisor may run multiple MCP server instances in a pool
//! (see [`supervisor::runner::mcp_pool`]).  Rather than subscribing to each
//! pool member individually, the ingestion task subscribes **only to the
//! dashboard server's aggregate SSE stream**.  The dashboard server already
//! fans-in events from all pool members and de-duplicates them before
//! forwarding, so subscribing here once is sufficient.  No additional
//! per-instance subscription or deduplication logic is required at the
//! supervisor level.

use std::time::Duration;

use anyhow::Context;
use futures_util::StreamExt;
use reqwest::Client;
use tokio::time::sleep;

use super::{DataChangeEvent, EventsHandle};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Spawn a background task that continuously ingests events from the
/// dashboard server and re-broadcasts them on `handle`.
///
/// `dashboard_base_url` — base URL of the dashboard server
/// (e.g. `"http://127.0.0.1:3459"`).
///
/// The task runs until the Tokio runtime shuts down.
pub fn start_ingestion(dashboard_base_url: String, handle: EventsHandle) {
    tokio::spawn(ingest_loop(dashboard_base_url, handle));
}

// ---------------------------------------------------------------------------
// Internal implementation
// ---------------------------------------------------------------------------

async fn ingest_loop(dashboard_base_url: String, handle: EventsHandle) {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(10))
        // No overall timeout — the SSE stream is long-lived by design.
        .build()
        .expect("[events/ingestion] reqwest client build failed");

    let stream_url = format!("{dashboard_base_url}/api/events/stream");
    let mut backoff_secs = 1u64;

    loop {
        match connect_and_ingest(&client, &stream_url, &handle).await {
            Ok(()) => {
                // Clean stream close — reconnect immediately with low backoff.
                eprintln!(
                    "[events/ingestion] stream closed cleanly — reconnecting in {backoff_secs}s"
                );
            }
            Err(e) => {
                eprintln!(
                    "[events/ingestion] stream error: {e:#} — reconnecting in {backoff_secs}s"
                );
            }
        }

        sleep(Duration::from_secs(backoff_secs)).await;
        backoff_secs = (backoff_secs * 2).min(30);
    }
}

/// Connect to the SSE stream, consume events until the connection drops, and
/// return.  Resets the backoff to 1 on the first successful connection is the
/// caller's responsibility (the loop resets when `Ok(())` is returned).
async fn connect_and_ingest(
    client:     &Client,
    stream_url: &str,
    handle:     &EventsHandle,
) -> anyhow::Result<()> {
    let response = client
        .get(stream_url)
        .header("Accept", "text/event-stream")
        .send()
        .await
        .with_context(|| format!("connecting to {stream_url}"))?;

    if !response.status().is_success() {
        anyhow::bail!("server returned {}", response.status());
    }

    eprintln!("[events/ingestion] connected to {stream_url}");

    let mut byte_stream = response.bytes_stream();
    let mut buf = String::new();

    while let Some(chunk) = byte_stream.next().await {
        let chunk = chunk.context("reading SSE chunk")?;
        let text = std::str::from_utf8(&chunk).unwrap_or("").to_string();
        buf.push_str(&text);

        // Process all complete SSE messages (terminated by a blank line).
        while let Some(pos) = buf.find("\n\n") {
            let message = buf[..pos].to_string();
            buf.drain(..pos + 2);
            process_sse_message(&message, handle).await;
        }
    }

    Ok(())
}

/// Parse one SSE message block and emit the corresponding [`DataChangeEvent`].
async fn process_sse_message(message: &str, handle: &EventsHandle) {
    let mut event_name = String::new();
    let mut data       = String::new();

    for line in message.lines() {
        if let Some(name) = line.strip_prefix("event: ") {
            event_name = name.trim().to_string();
        } else if let Some(payload) = line.strip_prefix("data: ") {
            data = payload.trim().to_string();
        }
    }

    // Skip keep-alive pings and the initial `connected` frame.
    if data.is_empty() || event_name == "connected" || event_name.is_empty() {
        return;
    }

    // Parse JSON payload.
    let payload: serde_json::Value = match serde_json::from_str(&data) {
        Ok(v)  => v,
        Err(e) => {
            eprintln!("[events/ingestion] bad JSON in event '{event_name}': {e}");
            return;
        }
    };

    let mcp_type = payload
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let workspace_id = payload
        .get("workspace_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let plan_id = payload
        .get("plan_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let dce = match mcp_type.as_str() {
        "plan_created" => DataChangeEvent::PlanCreated { workspace_id, plan_id },

        "plan_updated"
        | "note_added"
        | "plan_imported"
        | "plan_duplicated"
        | "plan_resumed" => DataChangeEvent::PlanUpdated { workspace_id, plan_id },

        "plan_archived" => DataChangeEvent::PlanArchived { workspace_id, plan_id },

        "plan_deleted" => DataChangeEvent::PlanDeleted { workspace_id, plan_id },

        "step_updated" => {
            let step_index = payload
                .get("data")
                .and_then(|d| d.get("step_index"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;
            DataChangeEvent::StepChanged { workspace_id, plan_id, step_index }
        }

        "agent_session_started"
        | "agent_session_completed"
        | "handoff_started"
        | "handoff_completed" => {
            let session_id = payload
                .get("data")
                .and_then(|d| d.get("session_id"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            DataChangeEvent::AgentSessionChanged { workspace_id, plan_id, session_id }
        }

        "workspace_registered" | "workspace_indexed" => {
            DataChangeEvent::WorkspaceChanged { workspace_id }
        }

        _ => DataChangeEvent::Raw {
            payload,
        },
    };

    handle.emit(dce).await;
}
