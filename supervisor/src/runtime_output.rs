//! Runtime output event bus for managed supervisor components.
//!
//! This module keeps an in-memory ring buffer of recent output lines and
//! exposes a broadcast channel for live subscribers (SSE stream).

use std::collections::VecDeque;
use std::sync::{
    Mutex, OnceLock,
    atomic::{AtomicBool, Ordering},
};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::sync::broadcast;

const OUTPUT_CHANNEL_CAPACITY: usize = 512;
const OUTPUT_RING_LIMIT: usize = 2000;
const DEFAULT_CAPTURE_ENABLED: bool = true;

#[derive(Clone, Debug, Serialize)]
pub struct RuntimeOutputEvent {
    pub timestamp_ms: u64,
    pub component: String,
    pub stream: String,
    pub line: String,
}

static OUTPUT_TX: OnceLock<broadcast::Sender<RuntimeOutputEvent>> = OnceLock::new();
static OUTPUT_RING: OnceLock<Mutex<VecDeque<RuntimeOutputEvent>>> = OnceLock::new();
static CAPTURE_ENABLED: AtomicBool = AtomicBool::new(DEFAULT_CAPTURE_ENABLED);

fn output_tx() -> &'static broadcast::Sender<RuntimeOutputEvent> {
    OUTPUT_TX.get_or_init(|| broadcast::channel(OUTPUT_CHANNEL_CAPACITY).0)
}

fn output_ring() -> &'static Mutex<VecDeque<RuntimeOutputEvent>> {
    OUTPUT_RING.get_or_init(|| Mutex::new(VecDeque::with_capacity(OUTPUT_RING_LIMIT)))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn is_enabled() -> bool {
    CAPTURE_ENABLED.load(Ordering::Relaxed)
}

pub fn set_enabled(enabled: bool) {
    CAPTURE_ENABLED.store(enabled, Ordering::Relaxed);
    if !enabled {
        if let Ok(mut ring) = output_ring().lock() {
            ring.clear();
        }
    }
}

pub fn emit(component: &str, stream: &str, line: impl Into<String>) {
    if !is_enabled() {
        return;
    }

    let content = line.into();
    if content.trim().is_empty() {
        return;
    }

    let event = RuntimeOutputEvent {
        timestamp_ms: now_ms(),
        component: component.to_string(),
        stream: stream.to_string(),
        line: content,
    };

    if let Ok(mut ring) = output_ring().lock() {
        ring.push_back(event.clone());
        while ring.len() > OUTPUT_RING_LIMIT {
            ring.pop_front();
        }
    }

    let _ = output_tx().send(event);
}

pub fn subscribe() -> broadcast::Receiver<RuntimeOutputEvent> {
    output_tx().subscribe()
}

pub fn recent(component: Option<&str>, limit: usize) -> Vec<RuntimeOutputEvent> {
    if !is_enabled() {
        return Vec::new();
    }

    let capped_limit = limit.clamp(1, OUTPUT_RING_LIMIT);
    let filter = component
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty());

    let mut entries: Vec<RuntimeOutputEvent> = match output_ring().lock() {
        Ok(ring) => ring
            .iter()
            .filter(|event| match &filter {
                Some(component_name) => event.component.eq_ignore_ascii_case(component_name),
                None => true,
            })
            .cloned()
            .collect(),
        Err(_) => Vec::new(),
    };

    if entries.len() > capped_limit {
        entries = entries[entries.len() - capped_limit..].to_vec();
    }

    entries
}

pub fn spawn_pipe_reader<R>(component: String, stream: &str, reader: R)
where
    R: AsyncRead + Unpin + Send + 'static,
{
    let stream_name = stream.to_string();
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        loop {
            match lines.next_line().await {
                Ok(Some(line)) => {
                    if !is_enabled() {
                        continue;
                    }

                    emit(&component, &stream_name, line);
                }
                Ok(None) => break,
                Err(err) => {
                    if is_enabled() {
                        emit(
                            &component,
                            "status",
                            format!("runtime output read error ({stream_name}): {err}"),
                        );
                    }
                    break;
                }
            }
        }
    });
}