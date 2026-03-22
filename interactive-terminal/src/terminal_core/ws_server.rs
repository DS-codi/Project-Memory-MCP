use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::io::Write;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc, Mutex};
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message;

use super::framing::WsMessage;

#[cfg(windows)]
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};

// ─── Constants ────────────────────────────────────────────────────────────────

/// Timeout for the first Auth message from the client (seconds).
const AUTH_TIMEOUT_SECS: u64 = 5;

/// Heartbeat interval sent by the server to connected clients (seconds).
const HEARTBEAT_INTERVAL_SECS: u64 = 30;

// ─── Session registry ─────────────────────────────────────────────────────────

/// Represents an active (or recently disconnected) PTY session.
pub struct ActiveSession {
    /// Broadcasts PTY stdout bytes to all tasks subscribed for this session.
    pub output_tx: broadcast::Sender<Vec<u8>>,
    /// Shared write half of the PTY stdin so both the WS message loop and
    /// future reconnect handlers can write without re-locking the registry.
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    /// PTY master handle — used for resize operations (Windows only).
    #[cfg(windows)]
    pub pty_master: Box<dyn MasterPty + Send>,
    /// Wall-clock time of the last byte sent or received on this session.
    pub last_active: Instant,
    /// Timer task that kills the PTY after `session_timeout` seconds.
    /// Stored so it can be aborted on reconnect.
    pub disconnect_timer: Option<JoinHandle<()>>,
    /// Last applied resize dimensions — used to coalesce duplicate resize
    /// events that arrive when xterm.js fires ResizeObserver and ws.onopen
    /// in rapid succession.
    pub last_resize: Option<(u16, u16)>,
}

type SessionRegistry = Arc<Mutex<HashMap<String, ActiveSession>>>;

// ─── Session ID generation ────────────────────────────────────────────────────

fn generate_session_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    // Combine micros + nanos for low-collision IDs within a single process.
    let extra = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros() as u32;
    format!("sess_{:x}{:x}", extra, nanos)
}

// ─── PTY creation (Windows) ───────────────────────────────────────────────────

#[cfg(windows)]
struct PtyHandles {
    output_tx: broadcast::Sender<Vec<u8>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Box<dyn MasterPty + Send>,
}

#[cfg(windows)]
fn create_pty_session() -> Result<PtyHandles, Box<dyn std::error::Error + Send + Sync>> {
    use std::io::Read;

    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: 40,
        cols: 220,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let shell = std::env::var("TERMINAL_SHELL").unwrap_or_else(|_| "powershell.exe".into());
    let cmd = CommandBuilder::new(&shell);
    let _child = pair.slave.spawn_command(cmd)?;
    drop(pair.slave);

    let writer = pair.master.take_writer()?;
    let mut reader = pair.master.try_clone_reader()?;

    let (output_tx, _) = broadcast::channel::<Vec<u8>>(256);
    let tx_clone = output_tx.clone();

    tokio::task::spawn_blocking(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let _ = tx_clone.send(buf[..n].to_vec());
                }
            }
        }
    });

    Ok(PtyHandles {
        output_tx,
        writer: Arc::new(Mutex::new(writer)),
        master: pair.master,
    })
}

#[cfg(not(windows))]
fn create_pty_session() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    Err("PTY sessions are only supported on Windows".into())
}

// ─── Server struct ────────────────────────────────────────────────────────────

/// Combined HTTP + WebSocket server on a single port.
///
/// Protocol (JSON envelope framing):
/// - First client message: `{"type":"auth","key":"...","session_id":"..."}` within 5 s.
///   - Empty or absent `session_id` → new PTY session created.
///   - Known `session_id` → reconnects to existing PTY (cancels expiry timer).
/// - PTY output: `{"type":"data","session_id":"...","payload":"<base64>"}`.
/// - Resize: `{"type":"resize","cols":80,"rows":24}`.
/// - Server heartbeat every 30 s; client should echo back.
pub struct TerminalWsServer {
    pub port: u16,
    pub api_key: Option<Arc<String>>,
    pub session_timeout: u64,
    pub sessions: SessionRegistry,
    /// Legacy broadcast channel — PTY output injected externally (Pass 1 compat).
    pub output_tx: broadcast::Sender<Vec<u8>>,
    /// Legacy input channel — keyboard bytes sent to external PTY (Pass 1 compat).
    pub input_tx: mpsc::Sender<Vec<u8>>,
    /// Rolling scrollback buffer shared with all new WebSocket clients (capped ~8 KB).
    /// Accumulated by a background subscriber started in `serve()`.
    pub scrollback: Arc<Mutex<Vec<u8>>>,
    /// Broadcast channel for thinking/reasoning content extracted from CLI output.
    /// Clients receive `{"type":"thinking","payload":"<base64>"}` frames on this channel.
    pub thinking_tx: broadcast::Sender<Vec<u8>>,
}

impl TerminalWsServer {
    pub fn new(
        port: u16,
        api_key: Option<String>,
        session_timeout: u64,
        input_tx: mpsc::Sender<Vec<u8>>,
    ) -> (Self, broadcast::Sender<Vec<u8>>, broadcast::Sender<Vec<u8>>) {
        let (output_tx, _) = broadcast::channel(256);
        let (thinking_tx, _) = broadcast::channel(256);
        let server = Self {
            port,
            api_key: api_key.map(Arc::new),
            session_timeout,
            sessions: Arc::new(Mutex::new(HashMap::new())),
            output_tx: output_tx.clone(),
            input_tx,
            scrollback: Arc::new(Mutex::new(Vec::new())),
            thinking_tx: thinking_tx.clone(),
        };
        (server, output_tx, thinking_tx)
    }

    pub async fn serve(self) {
        let host = crate::TERMINAL_HOST
            .get()
            .map(|s| s.as_str())
            .unwrap_or("127.0.0.1");
        let addr = format!("{}:{}", host, self.port);
        let listener = match TcpListener::bind(&addr).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[TerminalWsServer] Failed to bind {addr}: {e}");
                return;
            }
        };

        eprintln!("[TerminalWsServer] Listening on {addr}");

        let output_tx = Arc::new(self.output_tx);
        let input_tx = Arc::new(self.input_tx);
        let api_key = self.api_key;
        let sessions = self.sessions;
        let session_timeout = self.session_timeout;
        let thinking_tx = Arc::new(self.thinking_tx);

        // Accumulate PTY output into a rolling scrollback buffer so new WebSocket
        // clients can receive output that was emitted before they connected.
        let scrollback = self.scrollback.clone();
        let mut sb_rx = output_tx.subscribe();
        tokio::spawn(async move {
            const MAX_SCROLLBACK: usize = 8192;
            while let Ok(data) = sb_rx.recv().await {
                let mut buf = scrollback.lock().await;
                buf.extend_from_slice(&data);
                if buf.len() > MAX_SCROLLBACK {
                    let excess = buf.len() - MAX_SCROLLBACK;
                    buf.drain(..excess);
                }
            }
        });
        let scrollback = self.scrollback.clone();

        loop {
            match listener.accept().await {
                Ok((stream, _peer)) => {
                    tokio::spawn(handle_connection(
                        stream,
                        output_tx.clone(),
                        input_tx.clone(),
                        api_key.clone(),
                        sessions.clone(),
                        session_timeout,
                        scrollback.clone(),
                        thinking_tx.clone(),
                    ));
                }
                Err(e) => eprintln!("[TerminalWsServer] accept error: {e}"),
            }
        }
    }
}

// ─── Connection dispatcher ────────────────────────────────────────────────────

async fn handle_connection(
    stream: TcpStream,
    output_tx: Arc<broadcast::Sender<Vec<u8>>>,
    input_tx: Arc<mpsc::Sender<Vec<u8>>>,
    api_key: Option<Arc<String>>,
    sessions: SessionRegistry,
    session_timeout: u64,
    scrollback: Arc<Mutex<Vec<u8>>>,
    thinking_tx: Arc<broadcast::Sender<Vec<u8>>>,
) {
    let mut peek_buf = [0u8; 512];
    let n = match stream.peek(&mut peek_buf).await {
        Ok(n) => n,
        Err(_) => return,
    };

    let header = String::from_utf8_lossy(&peek_buf[..n]);
    if header.to_ascii_lowercase().contains("upgrade: websocket") {
        handle_websocket(stream, output_tx, input_tx, api_key, sessions, session_timeout, scrollback, thinking_tx).await;
    } else {
        handle_http(stream).await;
    }
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

const TERMINAL_HTML: &str = include_str!("../../resources/terminal.html");

async fn handle_http(mut stream: TcpStream) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let mut req_buf = vec![0u8; 4096];
    let _ = stream.read(&mut req_buf).await;
    let body = TERMINAL_HTML.as_bytes();
    let header = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes()).await;
    let _ = stream.write_all(body).await;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn encode_msg(msg: &WsMessage) -> Message {
    Message::Text(
        serde_json::to_string(msg)
            .unwrap_or_else(|_| r#"{"type":"error","message":"encoding failed"}"#.into())
            .into(),
    )
}

fn validate_key(expected: &Option<Arc<String>>, provided: &str) -> bool {
    match expected {
        None => true,
        Some(k) => k.as_str() == provided,
    }
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

async fn handle_websocket(
    stream: TcpStream,
    legacy_output_tx: Arc<broadcast::Sender<Vec<u8>>>,
    legacy_input_tx: Arc<mpsc::Sender<Vec<u8>>>,
    api_key: Option<Arc<String>>,
    sessions: SessionRegistry,
    session_timeout: u64,
    scrollback: Arc<Mutex<Vec<u8>>>,
    legacy_thinking_tx: Arc<broadcast::Sender<Vec<u8>>>,
) {
    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("[TerminalWsServer] WS handshake error: {e}");
            return;
        }
    };

    let (mut ws_sink, mut ws_source) = ws_stream.split();

    // ── Local desktop connection (no api_key): legacy relay path ──────────────
    // Route through the existing session management in runtime_tasks.rs instead
    // of creating a new PTY. This preserves tab switching, output buffering,
    // shell profile (pwsh/powershell), and all other session state.
    if api_key.is_none() {
        let ws_sink = Arc::new(Mutex::new(ws_sink));

        // Subscribe to live output BEFORE sending scrollback so we don't miss
        // any bytes emitted between the replay and the task starting.
        let mut output_rx = legacy_output_tx.subscribe();

        // Replay buffered PTY output (initial shell banner, etc.) so the client
        // sees output that was emitted before this WebSocket connection existed.
        {
            let sb = scrollback.lock().await;
            if !sb.is_empty() {
                let payload = B64.encode(&*sb);
                let msg = encode_msg(&WsMessage::Data {
                    session_id: String::new(),
                    payload,
                });
                let _ = ws_sink.lock().await.send(msg).await;
            }
        }

        // PTY output → WebSocket client
        let output_sink = ws_sink.clone();
        let output_task = tokio::spawn(async move {
            while let Ok(data) = output_rx.recv().await {
                let payload = B64.encode(&data);
                let msg = encode_msg(&WsMessage::Data {
                    session_id: String::new(),
                    payload,
                });
                if output_sink.lock().await.send(msg).await.is_err() {
                    break;
                }
            }
        });

        // Thinking content → WebSocket client (side-panel frames)
        let mut thinking_rx = legacy_thinking_tx.subscribe();
        let thinking_sink = ws_sink.clone();
        let thinking_task = tokio::spawn(async move {
            while let Ok(data) = thinking_rx.recv().await {
                let payload = B64.encode(&data);
                let msg = encode_msg(&WsMessage::Thinking {
                    session_id: String::new(),
                    payload,
                });
                if thinking_sink.lock().await.send(msg).await.is_err() {
                    break;
                }
            }
        });

        // Heartbeat
        let hb_sink = ws_sink.clone();
        let heartbeat_task = tokio::spawn(async move {
            let mut interval =
                tokio::time::interval(Duration::from_secs(HEARTBEAT_INTERVAL_SECS));
            interval.tick().await; // skip immediate first tick
            loop {
                interval.tick().await;
                if hb_sink
                    .lock()
                    .await
                    .send(encode_msg(&WsMessage::Heartbeat))
                    .await
                    .is_err()
                {
                    break;
                }
            }
        });

        // WebSocket input → runtime_tasks.rs input pump
        while let Some(Ok(msg)) = ws_source.next().await {
            let text = match msg {
                Message::Text(t) => t,
                Message::Close(_) => break,
                _ => continue,
            };
            let parsed = match serde_json::from_str::<WsMessage>(&text) {
                Ok(m) => m,
                Err(_) => continue,
            };
            match parsed {
                WsMessage::Data { payload, .. } => {
                    let bytes = match B64.decode(&payload) {
                        Ok(b) => b,
                        Err(_) => payload.into_bytes(),
                    };
                    let _ = legacy_input_tx.send(bytes).await;
                }
                WsMessage::Resize { cols, rows } => {
                    // Forward resize to runtime_tasks.rs input pump so try_parse_resize_json
                    // can apply it to the ConPTY master.  Without this, the PTY keeps its
                    // initial dimensions and TUI apps (e.g. Gemini CLI) render at wrong
                    // column/row counts, producing invisible-text "black block" artifacts.
                    let resize_json =
                        format!("{{\"type\":\"resize\",\"cols\":{cols},\"rows\":{rows}}}");
                    let _ = legacy_input_tx.send(resize_json.into_bytes()).await;
                }
                WsMessage::Heartbeat => {}
                _ => {}
            }
        }

        output_task.abort();
        heartbeat_task.abort();
        thinking_task.abort();
        return;
    }

    // ── External connection (api_key set): auth + managed PTY sessions ────────

    let (authed, mut session_id) = {
        let auth_result = tokio::time::timeout(
            Duration::from_secs(AUTH_TIMEOUT_SECS),
            ws_source.next(),
        )
        .await;

        match auth_result {
            Ok(Some(Ok(Message::Text(text)))) => {
                match serde_json::from_str::<WsMessage>(&text) {
                    Ok(WsMessage::Auth { key, session_id }) => {
                        (validate_key(&api_key, &key), session_id)
                    }
                    _ => (false, String::new()),
                }
            }
            _ => (false, String::new()),
        }
    };

    if !authed {
        let _ = ws_sink
            .send(encode_msg(&WsMessage::Error {
                message: "unauthorized".into(),
            }))
            .await;
        return;
    }

    // ── Session attach or create ──────────────────────────────────────────────

    #[cfg(windows)]
    let (session_output_tx, writer_handle) = {
        let mut registry = sessions.lock().await;

        // Generate a new ID if the client did not supply one.
        if session_id.is_empty() {
            session_id = generate_session_id();
        }

        match registry.get_mut(&session_id) {
            Some(sess) => {
                // Cancel pending expiry timer and reattach.
                if let Some(timer) = sess.disconnect_timer.take() {
                    timer.abort();
                }
                sess.last_active = Instant::now();
                eprintln!("[TerminalWsServer] Reconnected to session {session_id}");
                (sess.output_tx.clone(), sess.writer.clone())
            }
            None => {
                match create_pty_session() {
                    Ok(handles) => {
                        let output_tx = handles.output_tx.clone();
                        let writer = handles.writer.clone();
                        registry.insert(
                            session_id.clone(),
                            ActiveSession {
                                output_tx: handles.output_tx,
                                writer: handles.writer,
                                pty_master: handles.master,
                                last_active: Instant::now(),
                                disconnect_timer: None,
                                last_resize: None,
                            },
                        );
                        eprintln!("[TerminalWsServer] Created new PTY session {session_id}");
                        (output_tx, writer)
                    }
                    Err(e) => {
                        eprintln!("[TerminalWsServer] PTY creation failed: {e}");
                        let _ = ws_sink
                            .send(encode_msg(&WsMessage::Error {
                                message: "pty_create_failed".into(),
                            }))
                            .await;
                        return;
                    }
                }
            }
        }
    };

    #[cfg(not(windows))]
    let (session_output_tx, writer_handle) = {
        let _ = ws_sink
            .send(encode_msg(&WsMessage::Error {
                message: "unsupported_platform".into(),
            }))
            .await;
        return;
    };

    // ── Shared WS sink ────────────────────────────────────────────────────────

    let ws_sink = Arc::new(Mutex::new(ws_sink));

    // ── Task: PTY output → client ─────────────────────────────────────────────

    let output_sink = ws_sink.clone();
    let mut output_rx = session_output_tx.subscribe();
    let session_id_out = session_id.clone();
    let output_task = tokio::spawn(async move {
        while let Ok(data) = output_rx.recv().await {
            let payload = B64.encode(&data);
            let msg = encode_msg(&WsMessage::Data {
                session_id: session_id_out.clone(),
                payload,
            });
            if output_sink.lock().await.send(msg).await.is_err() {
                break;
            }
        }
    });

    // ── Task: heartbeat every 30 s ────────────────────────────────────────────

    let hb_sink = ws_sink.clone();
    let heartbeat_task = tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(HEARTBEAT_INTERVAL_SECS));
        interval.tick().await; // skip the immediate first tick
        loop {
            interval.tick().await;
            if hb_sink
                .lock()
                .await
                .send(encode_msg(&WsMessage::Heartbeat))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    // ── Main loop: client → PTY ───────────────────────────────────────────────

    while let Some(Ok(msg)) = ws_source.next().await {
        let text = match msg {
            Message::Text(t) => t,
            Message::Close(_) => break,
            _ => continue,
        };

        let parsed = match serde_json::from_str::<WsMessage>(&text) {
            Ok(m) => m,
            Err(e) => {
                eprintln!("[TerminalWsServer] bad message: {e}");
                continue;
            }
        };

        match parsed {
            WsMessage::Data { payload, .. } => {
                let bytes = match B64.decode(&payload) {
                    Ok(b) => b,
                    Err(_) => payload.into_bytes(),
                };
                let mut w = writer_handle.lock().await;
                let _ = w.write_all(&bytes);
                let _ = w.flush();

                // Update last_active
                if let Ok(mut registry) = sessions.try_lock() {
                    if let Some(sess) = registry.get_mut(&session_id) {
                        sess.last_active = Instant::now();
                    }
                }
            }
            WsMessage::Resize { cols, rows } => {
                #[cfg(windows)]
                {
                    let mut registry = sessions.lock().await;
                    if let Some(sess) = registry.get_mut(&session_id) {
                        // Skip if dimensions haven't changed — prevents repeated TUI
                        // redraws when xterm.js fires ResizeObserver and ws.onopen
                        // in rapid succession with the same dimensions.
                        if sess.last_resize != Some((cols, rows)) {
                            let _ = sess.pty_master.resize(PtySize {
                                rows,
                                cols,
                                pixel_width: 0,
                                pixel_height: 0,
                            });
                            sess.last_resize = Some((cols, rows));
                        }
                        sess.last_active = Instant::now();
                    }
                }
                #[cfg(not(windows))]
                if let Ok(mut registry) = sessions.try_lock() {
                    if let Some(sess) = registry.get_mut(&session_id) {
                        sess.last_active = Instant::now();
                    }
                }
            }
            WsMessage::Heartbeat => {
                // Client echoed heartbeat — liveness confirmed, nothing to do.
            }
            _ => {
                eprintln!("[TerminalWsServer] unexpected client message type");
            }
        }
    }

    // ── Disconnect: arm expiry timer ──────────────────────────────────────────

    output_task.abort();
    heartbeat_task.abort();

    let sessions_clone = sessions.clone();
    let expiry_session_id = session_id.clone();
    let timer = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(session_timeout)).await;
        let mut registry = sessions_clone.lock().await;
        if registry.remove(&expiry_session_id).is_some() {
            eprintln!(
                "[TerminalWsServer] Session {expiry_session_id} expired — PTY killed"
            );
        }
    });

    let mut registry = sessions.lock().await;
    if let Some(sess) = registry.get_mut(&session_id) {
        sess.disconnect_timer = Some(timer);
    }
}
