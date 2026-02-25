//! Axum SSE handler for `GET /supervisor/events`.
//!
//! Clients subscribe by issuing a plain GET request.  The supervisor responds
//! with a `text/event-stream` that pushes [`StampedEvent`] JSON objects, one
//! per SSE `data:` frame.
//!
//! If the request carries a `Last-Event-Id` header, all buffered events with
//! `id > Last-Event-Id` are replayed before entering the live broadcast.
//!
//! Each event carries its `id:` field so the browser (or reconnecting client)
//! can track the last-seen event automatically.
//!
//! ## Access logging
//!
//! On connect the client's IP address is extracted from `X-Forwarded-For` /
//! `X-Real-IP` (with a plain-IP fallback) and logged via `tracing`.  A
//! [`DisconnectGuard`] held inside the stream state ensures the disconnect
//! is logged with the connection duration even when axum drops the stream
//! without an explicit close path.

use std::time::{Duration, Instant};

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{sse::Event, IntoResponse, Sse},
};
use futures_util::stream::Stream;
use tokio::sync::broadcast;

use super::{EventsHandle, StampedEvent};

// ---------------------------------------------------------------------------
// Disconnect guard — logs duration when the stream is dropped
// ---------------------------------------------------------------------------

/// RAII guard that emits a `tracing::info!` disconnect log when dropped.
///
/// Placed inside the `unfold` state tuple so it is destroyed exactly once,
/// when axum tears down the response stream after the client disconnects.
struct DisconnectGuard {
    client_ip:    String,
    connect_time: Instant,
}

impl Drop for DisconnectGuard {
    fn drop(&mut self) {
        tracing::info!(
            "[events/sse] client disconnected ip={} duration={}s",
            self.client_ip,
            self.connect_time.elapsed().as_secs(),
        );
    }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/// `GET /supervisor/events`
///
/// Returns 503 when `events.enabled = false` in the supervisor configuration.
pub async fn events_sse_handler(
    State(handle): State<EventsHandle>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if !handle.config.enabled {
        return (StatusCode::SERVICE_UNAVAILABLE, "events channel disabled")
            .into_response();
    }

    // ── Access logging: extract client IP ────────────────────────────────
    let client_ip = headers
        .get("x-forwarded-for")
        .or_else(|| headers.get("x-real-ip"))
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or(s).trim().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let connect_time = Instant::now();
    tracing::info!("[events/sse] client connected ip={client_ip}");

    let guard = DisconnectGuard { client_ip, connect_time };

    // Parse Last-Event-Id for replay.
    let last_id: Option<u64> = headers
        .get("last-event-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok());

    // Collect replay backlog *before* subscribing to the live channel so we
    // don't introduce a gap between replay and live events.
    let backlog: Vec<StampedEvent> = if let Some(since) = last_id {
        handle.replay_since(since).await
    } else {
        vec![]
    };

    // Subscribe to the live broadcast channel.
    let rx = handle.tx.subscribe();

    let heartbeat_secs = handle.config.heartbeat_interval;
    let stream = event_stream(backlog, rx, guard);

    Sse::new(stream)
        .keep_alive(
            axum::response::sse::KeepAlive::new()
                .interval(Duration::from_secs(heartbeat_secs))
                .text("ping"),
        )
        .into_response()
}

// ---------------------------------------------------------------------------
// Stream implementation
// ---------------------------------------------------------------------------

/// Produces an SSE stream that first replays `backlog` events, then follows
/// the live `broadcast::Receiver<StampedEvent>`.
///
/// `guard` is held in the state tuple and dropped (logging the disconnect)
/// when the returned stream is dropped by axum.
fn event_stream(
    backlog: Vec<StampedEvent>,
    rx: broadcast::Receiver<StampedEvent>,
    guard: DisconnectGuard,
) -> impl Stream<Item = Result<Event, std::convert::Infallible>> {
    futures_util::stream::unfold(
        (backlog, rx, guard),
        |(mut backlog, mut rx, guard)| async move {
            // --- Phase 1: drain the replay backlog ---
            if !backlog.is_empty() {
                let stamped = backlog.remove(0);
                return Some((Ok(encode_event(&stamped)), (backlog, rx, guard)));
            }

            // --- Phase 2: live broadcast ---
            loop {
                match rx.recv().await {
                    Ok(stamped) => {
                        return Some((Ok(encode_event(&stamped)), (vec![], rx, guard)));
                    }
                    // Lagged: the receiver fell behind; skip the missed events
                    // and continue.  The `Last-Event-Id` mechanism on the
                    // *next* reconnect will handle gaps.
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!(
                            "[events/sse] subscriber lagged by {n} events — skipping forward"
                        );
                        continue;
                    }
                    // Channel closed (supervisor is shutting down).
                    Err(broadcast::error::RecvError::Closed) => return None,
                }
            }
        },
    )
}

/// Serialise a [`StampedEvent`] into an axum SSE [`Event`].
fn encode_event(stamped: &StampedEvent) -> Event {
    let data = serde_json::to_string(stamped).unwrap_or_default();
    Event::default()
        .id(stamped.id.to_string())
        .data(data)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use axum::{Router, body::Body, routing::get};
    use axum::http::Request;
    use tower::ServiceExt as _;

    use super::super::{DataChangeEvent, EventsConfig, EventsHandle};
    use super::events_sse_handler;

    /// Verify the SSE endpoint returns 200 and emits a well-formed event frame
    /// when the handle broadcasts a [`DataChangeEvent::Test`].
    #[tokio::test]
    async fn sse_endpoint_returns_200_and_streams_event() {
        use http_body_util::BodyExt as _;

        let handle = EventsHandle::new(EventsConfig {
            enabled: true,
            ..Default::default()
        });

        let app = Router::new()
            .route("/supervisor/events", get(events_sse_handler))
            .with_state(handle.clone());

        // Emit an event shortly after the request is handled so the stream
        // has a chance to subscribe before the data arrives.
        let emit_handle = handle.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(20)).await;
            emit_handle
                .emit(DataChangeEvent::Test { message: "hello from test".into() })
                .await;
        });

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/supervisor/events")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), 200);

        // The SSE stream is infinite — read frames until we find the event data
        // or hit a 2-second timeout.  We collect at most a few frames to avoid
        // hanging the test suite on the keep-alive pings.
        let mut body = response.into_body();
        let found = tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                match body.frame().await {
                    Some(Ok(frame)) if frame.is_data() => {
                        let bytes = frame.into_data().unwrap_or_default();
                        let text = String::from_utf8_lossy(&bytes);
                        if text.contains("hello from test") {
                            return true;
                        }
                    }
                    Some(Ok(_)) => {}  // trailers or other frames — ignore
                    Some(Err(_)) | None => return false,
                }
            }
        })
        .await
        .unwrap_or(false);

        assert!(found, "SSE stream did not emit expected 'hello from test' event within 2 s");
    }

    /// Verify the endpoint returns 503 when the events channel is disabled.
    #[tokio::test]
    async fn sse_endpoint_returns_503_when_disabled() {
        let handle = EventsHandle::new(EventsConfig {
            enabled: false,
            ..Default::default()
        });

        let app = Router::new()
            .route("/supervisor/events", get(events_sse_handler))
            .with_state(handle);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/supervisor/events")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), 503);
    }
}
