//! Data-change event broadcast channel.
//!
//! The supervisor maintains a `tokio::sync::broadcast` channel of
//! [`StampedEvent`]s.  Any module can obtain the [`EventsHandle`] and call
//! [`EventsHandle::emit`] to push an event.
//!
//! The SSE endpoint (`/supervisor/events`, see [`sse`]) creates one
//! `broadcast::Receiver` per connected client; axum drops it when the client
//! disconnects, automatically decrementing `tx.receiver_count()`.
//!
//! A compact ring-buffer stores the last N events so clients that reconnect
//! with `Last-Event-Id` can catch up on missed events.

pub mod ingestion;
pub mod sse;

use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};

use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, RwLock};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Parsed from `[events]` in the supervisor TOML.
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct EventsConfig {
    /// Master switch.  When `false` the SSE endpoint returns 503.
    pub enabled: bool,
    /// `broadcast::channel` buffer capacity.  Slow consumers lag and skip
    /// forward; this does NOT affect memory proportional to subscribers.
    pub buffer_size: usize,
    /// SSE keep-alive ping interval (seconds).
    pub heartbeat_interval: u64,
    /// Ring-buffer capacity for `Last-Event-Id` replay on reconnect.
    pub replay_buffer_size: usize,
}

impl Default for EventsConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            buffer_size: 256,
            heartbeat_interval: 30,
            replay_buffer_size: 100,
        }
    }
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/// Monotonically-increasing event identifier.
pub type EventId = u64;

/// All data-change variants the supervisor can broadcast.
///
/// Variants map 1-to-1 with event types emitted by the MCP server's
/// `emitEvent()` call, plus a [`DataChangeEvent::Raw`] catch-all for unknown
/// or future types.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event_type", rename_all = "snake_case")]
pub enum DataChangeEvent {
    PlanCreated  { workspace_id: String, plan_id: String },
    PlanUpdated  { workspace_id: String, plan_id: String },
    PlanArchived { workspace_id: String, plan_id: String },
    PlanDeleted  { workspace_id: String, plan_id: String },
    StepChanged  { workspace_id: String, plan_id: String, step_index: u32 },
    AgentSessionChanged {
        workspace_id: String,
        plan_id:      String,
        session_id:   String,
    },
    WorkspaceChanged   { workspace_id: String },
    MetricsInvalidated { workspace_id: Option<String> },
    /// Raw pass-through for events ingested from the MCP / dashboard stream
    /// that don't match a known variant.  The full JSON payload (including the
    /// original `event_type` / `type` key) is preserved in `payload`.
    Raw { payload: serde_json::Value },
    /// Synthetic event emitted by the `EmitTestEvent` control command.
    Test { message: String },
}

// ---------------------------------------------------------------------------
// Stamped envelope
// ---------------------------------------------------------------------------

/// A [`DataChangeEvent`] decorated with a monotonic [`EventId`].
///
/// The ID is used as the SSE `id:` field, enabling `Last-Event-Id`-based
/// replay on reconnect.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StampedEvent {
    pub id:   EventId,
    pub data: DataChangeEvent,
}

// ---------------------------------------------------------------------------
// EventsHandle
// ---------------------------------------------------------------------------

/// Cheap-to-clone handle to the events infrastructure.
///
/// Cloning shares the same broadcast channel and replay buffer — callers in
/// different modules (proxy, handler, ingestion) all hold the same handle.
#[derive(Clone)]
pub struct EventsHandle {
    /// Broadcast sender.  Subscribe via `tx.subscribe()`.
    pub tx:     broadcast::Sender<StampedEvent>,
    /// Monotonically-increasing counter; next ID = fetch_add(1) + 1.
    counter:    Arc<AtomicU64>,
    pub config: EventsConfig,
    /// Ring buffer; protected by a read-write lock for concurrent replay reads.
    replay:     Arc<RwLock<std::collections::VecDeque<StampedEvent>>>,
}

impl EventsHandle {
    /// Create a new handle with the given configuration.
    pub fn new(config: EventsConfig) -> Self {
        let (tx, _) = broadcast::channel(config.buffer_size);
        Self {
            tx,
            counter: Arc::new(AtomicU64::new(0)),
            config,
            replay: Arc::new(RwLock::new(std::collections::VecDeque::new())),
        }
    }

    /// Emit a data-change event.
    ///
    /// The event is stamped with the next monotonic ID, appended to the replay
    /// ring buffer (evicting the oldest entry when full), and broadcast to all
    /// live subscribers.
    pub async fn emit(&self, event: DataChangeEvent) {
        let id = self.counter.fetch_add(1, Ordering::Relaxed) + 1;
        let stamped = StampedEvent { id, data: event };

        {
            let mut buf = self.replay.write().await;
            buf.push_back(stamped.clone());
            while buf.len() > self.config.replay_buffer_size {
                buf.pop_front();
            }
        }

        // Ignore send errors — zero subscribers is perfectly fine.
        let _ = self.tx.send(stamped);
    }

    /// Return all events with `id > since_id` from the replay ring buffer,
    /// oldest first, for `Last-Event-Id` reconnect replay.
    pub async fn replay_since(&self, since_id: EventId) -> Vec<StampedEvent> {
        self.replay
            .read()
            .await
            .iter()
            .filter(|e| e.id > since_id)
            .cloned()
            .collect()
    }

    /// Total events emitted since the supervisor started.
    pub fn events_emitted(&self) -> u64 {
        self.counter.load(Ordering::Relaxed)
    }

    /// Current number of live SSE subscribers.
    ///
    /// Uses the broadcast channel's own receiver count, which Tokio
    /// maintains automatically as receivers are created and dropped.
    pub fn subscriber_count(&self) -> usize {
        self.tx.receiver_count()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn emit_and_subscribe() {
        let handle = EventsHandle::new(EventsConfig::default());
        let mut rx = handle.tx.subscribe();

        handle
            .emit(DataChangeEvent::Test { message: "hello".into() })
            .await;

        let evt = rx.recv().await.expect("should receive event");
        assert_eq!(evt.id, 1);
        match &evt.data {
            DataChangeEvent::Test { message } => assert_eq!(message, "hello"),
            other => panic!("unexpected variant: {other:?}"),
        }
    }

    #[tokio::test]
    async fn replay_since() {
        let handle = EventsHandle::new(EventsConfig::default());

        for i in 0..5u64 {
            handle
                .emit(DataChangeEvent::Test { message: format!("msg-{i}") })
                .await;
        }

        let replayed = handle.replay_since(2).await;
        assert_eq!(replayed.len(), 3); // ids 3, 4, 5
        assert_eq!(replayed[0].id, 3);
    }

    #[tokio::test]
    async fn subscriber_count_reflects_receivers() {
        let handle = EventsHandle::new(EventsConfig::default());
        assert_eq!(handle.subscriber_count(), 0);

        let _rx1 = handle.tx.subscribe();
        let _rx2 = handle.tx.subscribe();
        assert_eq!(handle.subscriber_count(), 2);

        drop(_rx1);
        assert_eq!(handle.subscriber_count(), 1);
    }
}
