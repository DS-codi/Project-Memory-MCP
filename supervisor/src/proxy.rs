//! HTTP reverse proxy — the public face of the MCP pool.
//!
//! VS Code (and any other client) connects to this proxy on the primary MCP
//! port (e.g. 3457).  The proxy:
//!
//! 1. Routes `POST /mcp` requests to the current supervisor dispatch target.
//! 2. Preserves MCP transport headers/body and streams chunked/SSE responses.
//! 3. Proxies `/sse`, `/messages`, `/health`, `/sessions/*`, and
//!    `/admin/*` to the primary instance (port `base_port`).
//! 4. Serves a pub/sub Server-Sent Events heartbeat on
//!    `GET /supervisor/heartbeat` that all VS Code instances subscribe to
//!    instead of doing individual health polls.
//!
//! The proxy runs as a plain `axum` HTTP server inside a `tokio::spawn`.

use std::sync::Arc;
use std::time::Duration;

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{HeaderMap, Method, StatusCode};
use axum::response::{Response, Sse};
use axum::response::sse::Event;
use axum::routing::{any, get};
use axum::Router;
use bytes::Bytes;
use tokio::sync::broadcast;

use crate::events::{sse::events_sse_handler, EventsHandle};

// ---------------------------------------------------------------------------
// Heartbeat event
// ---------------------------------------------------------------------------

/// Snapshot broadcast to all subscribers every 10 s.
#[derive(Clone, serde::Serialize)]
pub struct HeartbeatEvent {
    pub timestamp_ms: u64,
    pub mcp_proxy_port: u16,
    pub pool_base_port: u16,
    pub pool_instances: usize,
    pub mcp_healthy: bool,
}

/// Channel capacity — we only need to buffer a handful of ticks.
const HEARTBEAT_CAPACITY: usize = 4;

// ---------------------------------------------------------------------------
// Shared proxy state
// ---------------------------------------------------------------------------

/// Shared state injected into every axum handler.
#[derive(Clone)]
pub struct ProxyState {
    /// Callback that returns the current supervisor-native dispatch port.
    pub dispatch_port: Arc<dyn Fn() -> u16 + Send + Sync>,
    /// HTTP client used to forward requests to backends.
    pub client: reqwest::Client,
    /// Base port — used for endpoints that are not session-specific.
    pub base_port: u16,
    /// Broadcast sender for heartbeat SSE events.
    pub heartbeat_tx: broadcast::Sender<HeartbeatEvent>,
    /// Optional events broadcast handle.  Present when `events.enabled = true`.
    pub events_handle: Option<EventsHandle>,
}

// ---------------------------------------------------------------------------
// Generic forward helper
// ---------------------------------------------------------------------------

/// Forward an axum `Request` to `target_url`, stream the response back.
///
/// The response body is streamed via `unfold` so that SSE / chunked
/// responses used by the MCP streamable-http transport flow through
/// without being buffered in memory.
async fn forward(
    client: &reqwest::Client,
    method: Method,
    target_url: String,
    headers: &HeaderMap,
    body: Bytes,
) -> Result<Response<Body>, StatusCode> {
    let mut req_builder = client.request(method.clone(), &target_url);

    // Forward most headers (skip hop-by-hop and host).
    for (name, value) in headers.iter() {
        let n = name.as_str().to_lowercase();
        if matches!(
            n.as_str(),
            "host" | "connection" | "transfer-encoding" | "te" | "trailer" | "upgrade"
        ) {
            continue;
        }
        req_builder = req_builder.header(name.as_str(), value.as_bytes());
    }

    if !body.is_empty() {
        req_builder = req_builder.body(body);
    }

    let upstream = req_builder.send().await.map_err(|e| {
        eprintln!("[proxy] upstream error {target_url}: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let status = StatusCode::from_u16(upstream.status().as_u16())
        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

    // Collect response headers — strip hop-by-hop headers so the proxy's own
    // framing (Body::from_stream / chunked) is not double-encoded.
    let mut builder = Response::builder().status(status);
    for (name, value) in upstream.headers() {
        let n = name.as_str().to_lowercase();
        if matches!(
            n.as_str(),
            "connection" | "transfer-encoding" | "te" | "trailer" | "upgrade" | "keep-alive"
        ) {
            continue;
        }
        builder = builder.header(name.as_str(), value.as_bytes());
    }

    // Stream the body chunk-by-chunk so SSE / chunked transfer-encoded
    // responses are not buffered — MCP uses text/event-stream which never
    // terminates, so .bytes().await would hang forever.
    let stream = futures_util::stream::unfold(upstream, |mut resp| async move {
        match resp.chunk().await {
            Ok(Some(chunk)) => Some((Ok::<Bytes, std::io::Error>(chunk), resp)),
            Ok(None) => None,
            Err(e) => {
                eprintln!("[proxy] stream chunk error: {e}");
                Some((Err(std::io::Error::other(e.to_string())), resp))
            }
        }
    });

    builder
        .body(Body::from_stream(stream))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

// ---------------------------------------------------------------------------
// /mcp handler — session-aware routing
// ---------------------------------------------------------------------------

async fn mcp_handler(
    State(state): State<ProxyState>,
    req: Request,
) -> Result<Response<Body>, StatusCode> {
    let method = req.method().clone();
    let headers = req.headers().clone();

    let backend_port = (state.dispatch_port)();

    let target_url = format!("http://127.0.0.1:{backend_port}/mcp");
    let body = axum::body::to_bytes(req.into_body(), 16 * 1024 * 1024)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    forward(&state.client, method, target_url, &headers, body).await
}

// ---------------------------------------------------------------------------
// Heartbeat SSE handler
// ---------------------------------------------------------------------------

/// `GET /supervisor/heartbeat` — subscribe to the 10-second heartbeat stream.
///
/// Each VS Code instance connects once and receives periodic `HeartbeatEvent`
/// JSON blobs as SSE `data:` lines.  This replaces per-instance polling and
/// is far cheaper than individual health check HTTP requests.
async fn heartbeat_handler(
    State(state): State<ProxyState>,
) -> Sse<impl futures_util::Stream<Item = Result<Event, std::convert::Infallible>>> {
    let mut rx = state.heartbeat_tx.subscribe();

    let stream = futures_util::stream::unfold(rx, |mut rx| async move {
        // Wait for the next heartbeat tick (skip lagged messages).
        loop {
            match rx.recv().await {
                Ok(evt) => {
                    let data = serde_json::to_string(&evt).unwrap_or_default();
                    return Some((Ok(Event::default().data(data)), rx));
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => return None,
            }
        }
    });

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("ping"),
    )
}

// ---------------------------------------------------------------------------
// Generic passthrough handler (non-session endpoints)
// ---------------------------------------------------------------------------

async fn passthrough_handler(
    State(state): State<ProxyState>,
    req: Request,
) -> Result<Response<Body>, StatusCode> {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let headers = req.headers().clone();
    let path_and_query = uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("/");
    let target_url = format!("http://127.0.0.1:{}{}", state.base_port, path_and_query);
    let body = axum::body::to_bytes(req.into_body(), 16 * 1024 * 1024)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    forward(&state.client, method, target_url, &headers, body).await
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/// `GET /health` and `GET /api/health` — answered by the proxy itself.
///
/// This MUST NOT forward to the Node backend because the backend may be
/// occupied with a long-running tool call.  A 3 s timeout on this endpoint
/// (used by the VS Code extension's ConnectionManager) would then expire,
/// setting `isMcpConnected = false` and triggering spurious bridge reconnects.
async fn proxy_health_handler() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({
        "status": "ok",
        "server": "project-memory-proxy",
        "transport": "http"
    }))
}

/// Build the axum `Router` for the proxy.
pub fn build_router(state: ProxyState) -> Router {
    let mut router = Router::new()
        .route("/mcp", any(mcp_handler))
        // Proxy-local health endpoints — answered immediately without touching the
        // Node backend.  The VS Code extension's ConnectionManager checks these every
        // 30 s; if they forwarded to the backend they could time out under load and
        // falsely mark the MCP as disconnected.
        .route("/health", get(proxy_health_handler))
        .route("/api/health", get(proxy_health_handler))
        .route("/supervisor/heartbeat", get(heartbeat_handler))
        .fallback(passthrough_handler);

    // Mount the data-change events SSE endpoint when an events handle is present.
    if let Some(ref events_handle) = state.events_handle {
        router = router.route(
            "/supervisor/events",
            get(events_sse_handler).with_state(events_handle.clone()),
        );
    }

    router.with_state(state)
}

// ---------------------------------------------------------------------------
// Start function
// ---------------------------------------------------------------------------

/// Create a heartbeat broadcast channel.  The `Sender` should be stored and
/// driven by a background ticker (see `start_heartbeat_ticker`).  Pass the
/// same `Sender` to `start_proxy` so the SSE handler can subscribe.
pub fn heartbeat_channel() -> broadcast::Sender<HeartbeatEvent> {
    broadcast::channel(HEARTBEAT_CAPACITY).0
}

/// Spawn a background task that sends a `HeartbeatEvent` every `interval`.
///
/// `pool_instances_fn` is a cheap closure that reads the current number of
/// live pool instances (e.g. `|| pool.blocking_read().ports().len()`).
/// `mcp_port` is the proxy's public port forwarded to extensions.
pub fn start_heartbeat_ticker(
    tx: broadcast::Sender<HeartbeatEvent>,
    interval: Duration,
    mcp_proxy_port: u16,
    pool_base_port: u16,
    pool_instances_fn: Arc<dyn Fn() -> usize + Send + Sync>,
    mcp_healthy_fn: Arc<dyn Fn() -> bool + Send + Sync>,
) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(interval);
        loop {
            ticker.tick().await;
            let evt = HeartbeatEvent {
                timestamp_ms: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
                mcp_proxy_port,
                pool_base_port,
                pool_instances: (pool_instances_fn)(),
                mcp_healthy: (mcp_healthy_fn)(),
            };
            // Ignore send errors — no subscribers is fine.
            let _ = tx.send(evt);
        }
    });
}

/// Bind the proxy on `bind_addr` (e.g. `"127.0.0.1:3457"`).
///
/// `dispatch_port` is a closure returning the active supervisor-native MCP
/// dispatch port at call time.
pub async fn start_proxy(
    bind_addr: String,
    base_port: u16,
    dispatch_port: Arc<dyn Fn() -> u16 + Send + Sync>,
    heartbeat_tx: broadcast::Sender<HeartbeatEvent>,
    events_handle: Option<EventsHandle>,
) -> anyhow::Result<()> {
    let client = reqwest::Client::builder()
        // Short TCP connect timeout only — MCP tool calls and SSE streams are
        // long-lived so we must NOT set an overall request timeout.
        .connect_timeout(Duration::from_secs(10))
        // Don't follow redirects — forward them to the client.
        .redirect(reqwest::redirect::Policy::none())
        .build()?;

    let state = ProxyState {
        dispatch_port,
        client,
        base_port,
        heartbeat_tx,
        events_handle,
    };

    let app = build_router(state);
    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    eprintln!("[proxy] MCP proxy listening on {bind_addr} → dispatch base_port={base_port}");
    axum::serve(listener, app).await?;
    Ok(())
}
