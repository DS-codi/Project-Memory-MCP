use crate::protocol::{self, Message};
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, mpsc};
use tokio::time::Instant;

// ---------------------------------------------------------------------------
// Connection events
// ---------------------------------------------------------------------------

/// Events emitted by the TCP server about connection lifecycle.
#[derive(Debug, Clone)]
pub enum ConnectionEvent {
    /// A client connected from the given address.
    Connected(SocketAddr),
    /// The client disconnected normally (EOF or error).
    Disconnected,
    /// No heartbeat received within the timeout window.
    HeartbeatLost,
}

// ---------------------------------------------------------------------------
// TcpServer
// ---------------------------------------------------------------------------

/// Single-client TCP server for the Interactive Terminal.
///
/// Listens on `127.0.0.1:{port}`, accepts one connection at a time,
/// exchanges NDJSON [`Message`]s, and emits [`ConnectionEvent`]s.
pub struct TcpServer {
    port: u16,
    heartbeat_interval: Duration,

    // Public channels — the bridge layer consumes / produces through these.
    /// Receive incoming messages (CommandRequest, Heartbeat) from the MCP client.
    pub incoming_rx: mpsc::Receiver<Message>,
    /// Send outgoing messages (CommandResponse, Heartbeat) to the MCP client.
    pub outgoing_tx: mpsc::Sender<Message>,
    /// Broadcast sender for connection lifecycle events.
    pub event_tx: broadcast::Sender<ConnectionEvent>,

    // Internal halves kept for wiring into the accept loop.
    incoming_tx: mpsc::Sender<Message>,
    outgoing_rx: Option<mpsc::Receiver<Message>>,

    /// Shared flag so callers can query connection state.
    connected: Arc<AtomicBool>,
}

impl TcpServer {
    /// Create a new `TcpServer` bound to the given port with the specified
    /// heartbeat interval.  Use [`TcpServer::start`] to begin listening.
    pub fn new(port: u16, heartbeat_interval: Duration) -> Self {
        let (incoming_tx, incoming_rx) = mpsc::channel(32);
        let (outgoing_tx, outgoing_rx) = mpsc::channel(32);
        let (event_tx, _) = broadcast::channel(16);

        Self {
            port,
            heartbeat_interval,
            incoming_rx,
            outgoing_tx,
            event_tx,
            incoming_tx,
            outgoing_rx: Some(outgoing_rx),
            connected: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Returns `true` when a client is currently connected.
    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Relaxed)
    }

    /// Obtain a new subscriber for [`ConnectionEvent`]s.
    pub fn event_subscriber(&self) -> broadcast::Receiver<ConnectionEvent> {
        self.event_tx.subscribe()
    }

    /// Start the TCP listener.  This **must** be called from within a tokio
    /// runtime and will run indefinitely (until the process exits or the
    /// listener errors).
    pub async fn start(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let addr = format!("127.0.0.1:{}", self.port);
        let listener = if let Some(std_listener) = crate::take_prebound_runtime_listener(self.port) {
            std_listener.set_nonblocking(true)?;
            TcpListener::from_std(std_listener)?
        } else {
            TcpListener::bind(&addr).await?
        };
        eprintln!("Interactive Terminal listening on {}", addr);

        let incoming_tx = self.incoming_tx.clone();
        let outgoing_rx = self.outgoing_rx.take().expect("start() called more than once");
        let event_tx = self.event_tx.clone();
        let connected = self.connected.clone();
        let heartbeat_interval = self.heartbeat_interval;

        Self::accept_loop(
            listener,
            incoming_tx,
            outgoing_rx,
            event_tx,
            connected,
            heartbeat_interval,
        )
        .await;

        Ok(())
    }

    // -- internal ---------------------------------------------------------

    /// Accept loop — handles one connection at a time (single MCP client).
    async fn accept_loop(
        listener: TcpListener,
        incoming_tx: mpsc::Sender<Message>,
        mut outgoing_rx: mpsc::Receiver<Message>,
        event_tx: broadcast::Sender<ConnectionEvent>,
        connected: Arc<AtomicBool>,
        heartbeat_interval: Duration,
    ) {
        loop {
            match listener.accept().await {
                Ok((stream, addr)) => {
                    connected.store(true, Ordering::Relaxed);
                    let _ = event_tx.send(ConnectionEvent::Connected(addr));

                    Self::handle_connection(
                        stream,
                        &incoming_tx,
                        &mut outgoing_rx,
                        &event_tx,
                        heartbeat_interval,
                    )
                    .await;

                    connected.store(false, Ordering::Relaxed);
                    let _ = event_tx.send(ConnectionEvent::Disconnected);
                }
                Err(e) => {
                    eprintln!("Accept error: {}", e);
                }
            }
        }
    }

    /// Per-connection handler.
    ///
    /// Runs three concurrent branches via `tokio::select!`:
    ///   1. **Read** — lines from the TCP stream decoded into [`Message`]s.
    ///   2. **Write** — outgoing [`Message`]s encoded and flushed to the stream.
    ///   3. **Heartbeat** — periodic heartbeat send + received-heartbeat timeout.
    async fn handle_connection(
        stream: tokio::net::TcpStream,
        incoming_tx: &mpsc::Sender<Message>,
        outgoing_rx: &mut mpsc::Receiver<Message>,
        event_tx: &broadcast::Sender<ConnectionEvent>,
        heartbeat_interval: Duration,
    ) {
        let (reader, mut writer) = stream.into_split();
        let mut buf_reader = BufReader::new(reader);
        let mut line = String::new();

        // Delay the first tick so we don't send a heartbeat immediately on connect.
        let mut heartbeat_tick =
            tokio::time::interval_at(Instant::now() + heartbeat_interval, heartbeat_interval);
        let mut last_heartbeat_received = Instant::now();
        let timeout = heartbeat_interval * 2;

        loop {
            line.clear();

            tokio::select! {
                // Branch 1: Read a line from the client ───────────────────
                result = buf_reader.read_line(&mut line) => {
                    match result {
                        Ok(0) => break, // EOF — client closed connection
                        Ok(_) => {
                            match protocol::decode(&line) {
                                Ok(msg) => {
                                    // Track heartbeats for timeout detection
                                    if matches!(msg, Message::Heartbeat(_)) {
                                        last_heartbeat_received = Instant::now();
                                    }
                                    if incoming_tx.send(msg).await.is_err() {
                                        break; // receiver dropped
                                    }
                                }
                                Err(e) => {
                                    eprintln!("Decode error: {}", e);
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("Read error: {}", e);
                            break;
                        }
                    }
                }

                // Branch 2: Write outgoing messages to the client ─────────
                Some(msg) = outgoing_rx.recv() => {
                    match protocol::encode(&msg) {
                        Ok(encoded) => {
                            if let Err(e) = writer.write_all(encoded.as_bytes()).await {
                                eprintln!("Write error: {}", e);
                                break;
                            }
                            if let Err(e) = writer.flush().await {
                                eprintln!("Flush error: {}", e);
                                break;
                            }
                        }
                        Err(e) => {
                            eprintln!("Encode error: {}", e);
                        }
                    }
                }

                // Branch 3: Heartbeat tick ────────────────────────────────
                _ = heartbeat_tick.tick() => {
                    // Send our heartbeat to the client
                    let hb = Message::Heartbeat(protocol::Heartbeat {
                        timestamp: chrono_timestamp(),
                    });
                    if let Ok(encoded) = protocol::encode(&hb) {
                        if let Err(e) = writer.write_all(encoded.as_bytes()).await {
                            eprintln!("Heartbeat write error: {}", e);
                            break;
                        }
                        let _ = writer.flush().await;
                    }

                    // Check whether the client's heartbeat is overdue
                    if last_heartbeat_received.elapsed() > timeout {
                        eprintln!("Heartbeat timeout — no heartbeat received in {:?}", timeout);
                        let _ = event_tx.send(ConnectionEvent::HeartbeatLost);
                        break;
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Produce an ISO-8601 timestamp string for heartbeat messages.
///
/// Falls back to a Unix-epoch representation when `chrono` is unavailable —
/// we intentionally avoid adding another crate and use a simple approach.
fn chrono_timestamp() -> String {
    // We use the elapsed time since UNIX_EPOCH to keep the dependency list
    // small (no chrono crate needed).
    use std::time::SystemTime;
    let d = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{:03}Z", d.as_secs(), d.subsec_millis())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncReadExt;
    use tokio::net::TcpStream;
    use tokio::time::timeout;

    /// Helper: start a TcpServer on an OS-assigned port, returning the port
    /// and the server handle.
    async fn start_server() -> (
        u16,
        mpsc::Sender<Message>,
        mpsc::Receiver<Message>,
        broadcast::Receiver<ConnectionEvent>,
        Arc<AtomicBool>,
    ) {
        // Bind to port 0 to let the OS pick a free port
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        let (incoming_tx, incoming_rx) = mpsc::channel::<Message>(32);
        let (outgoing_tx, outgoing_rx) = mpsc::channel::<Message>(32);
        let (event_tx, event_rx) = broadcast::channel::<ConnectionEvent>(16);
        let connected = Arc::new(AtomicBool::new(false));

        let incoming_tx_clone = incoming_tx.clone();
        let event_tx_clone = event_tx.clone();
        let connected_clone = connected.clone();

        tokio::spawn(async move {
            TcpServer::accept_loop(
                listener,
                incoming_tx_clone,
                outgoing_rx,
                event_tx_clone,
                connected_clone,
                Duration::from_secs(60), // long interval so heartbeat doesn't interfere
            )
            .await;
        });

        (port, outgoing_tx, incoming_rx, event_rx, connected)
    }

    #[tokio::test]
    async fn test_new_creates_disconnected_server() {
        let server = TcpServer::new(0, Duration::from_secs(5));
        assert!(!server.is_connected());
    }

    #[tokio::test]
    async fn test_event_subscriber_returns_receiver() {
        let server = TcpServer::new(0, Duration::from_secs(5));
        let _rx = server.event_subscriber();
        // Just ensure it doesn't panic
    }

    #[tokio::test]
    async fn test_connect_and_disconnect() {
        let (port, _outgoing_tx, _incoming_rx, mut event_rx, connected) = start_server().await;

        // Connect a client
        let stream = TcpStream::connect(format!("127.0.0.1:{}", port))
            .await
            .unwrap();

        // Should receive Connected event
        let evt = timeout(Duration::from_secs(2), event_rx.recv())
            .await
            .unwrap()
            .unwrap();
        assert!(matches!(evt, ConnectionEvent::Connected(_)));
        assert!(connected.load(Ordering::Relaxed));

        // Drop the client to trigger disconnect
        drop(stream);

        let evt = timeout(Duration::from_secs(2), event_rx.recv())
            .await
            .unwrap()
            .unwrap();
        assert!(matches!(evt, ConnectionEvent::Disconnected));
        assert!(!connected.load(Ordering::Relaxed));
    }

    #[tokio::test]
    async fn test_send_and_receive_message() {
        let (port, _outgoing_tx, mut incoming_rx, mut event_rx, _connected) =
            start_server().await;

        let mut stream = TcpStream::connect(format!("127.0.0.1:{}", port))
            .await
            .unwrap();

        // Wait for Connected event
        let _ = timeout(Duration::from_secs(2), event_rx.recv())
            .await
            .unwrap();

        // Client sends a CommandRequest
        let msg = Message::CommandRequest(protocol::CommandRequest {
            id: "test-1".into(),
            command: "echo hello".into(),
            working_directory: "/tmp".into(),
            context: "".into(),
            session_id: "default".into(),
            terminal_profile: protocol::TerminalProfile::System,
            workspace_path: String::new(),
            venv_path: String::new(),
            activate_venv: false,
            timeout_seconds: 30,
        });
        let encoded = protocol::encode(&msg).unwrap();
        stream.write_all(encoded.as_bytes()).await.unwrap();

        // Server should forward it to incoming_rx
        let received = timeout(Duration::from_secs(2), incoming_rx.recv())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(received, msg);
    }

    #[tokio::test]
    async fn test_outgoing_message_reaches_client() {
        let (port, outgoing_tx, _incoming_rx, mut event_rx, _connected) = start_server().await;

        let mut stream = TcpStream::connect(format!("127.0.0.1:{}", port))
            .await
            .unwrap();

        // Wait for Connected event
        let _ = timeout(Duration::from_secs(2), event_rx.recv())
            .await
            .unwrap();

        // Small delay to let the server's handler fully set up
        tokio::time::sleep(Duration::from_millis(50)).await;

        // Server sends a CommandResponse
        let msg = Message::CommandResponse(protocol::CommandResponse {
            id: "test-1".into(),
            status: protocol::ResponseStatus::Approved,
            output: Some("hello\n".into()),
            exit_code: Some(0),
            reason: None,
        });
        outgoing_tx.send(msg.clone()).await.unwrap();

        // Client reads the line
        let mut buf = vec![0u8; 1024];
        let n = timeout(Duration::from_secs(2), stream.read(&mut buf))
            .await
            .unwrap()
            .unwrap();
        let line = String::from_utf8_lossy(&buf[..n]);
        let decoded = protocol::decode(&line).unwrap();
        assert_eq!(decoded, msg);
    }

    #[tokio::test]
    async fn test_heartbeat_exchange() {
        // Verify that sending a Heartbeat message from a client is received by the server.
        let (port, _outgoing_tx, mut incoming_rx, mut event_rx, _connected) =
            start_server().await;

        let mut stream = TcpStream::connect(format!("127.0.0.1:{}", port))
            .await
            .unwrap();

        // Wait for Connected event
        let _ = timeout(Duration::from_secs(2), event_rx.recv())
            .await
            .unwrap();

        // Client sends a Heartbeat
        let hb = Message::Heartbeat(crate::protocol::Heartbeat {
            timestamp: "1234567890.000Z".into(),
        });
        let encoded = protocol::encode(&hb).unwrap();
        stream.write_all(encoded.as_bytes()).await.unwrap();

        // Server should forward it to incoming_rx
        let received = timeout(Duration::from_secs(2), incoming_rx.recv())
            .await
            .unwrap()
            .unwrap();
        assert!(matches!(received, Message::Heartbeat(_)));
        if let Message::Heartbeat(h) = received {
            assert_eq!(h.timestamp, "1234567890.000Z");
        }
    }

    #[tokio::test]
    async fn test_heartbeat_loss_event() {
        // Use a very short heartbeat interval to trigger timeout quickly
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        let (incoming_tx, _incoming_rx) = mpsc::channel::<Message>(32);
        let (_outgoing_tx, outgoing_rx) = mpsc::channel::<Message>(32);
        let (event_tx, mut event_rx) = broadcast::channel::<ConnectionEvent>(16);
        let connected = Arc::new(AtomicBool::new(false));

        let connected_clone = connected.clone();
        let event_tx_clone = event_tx.clone();

        tokio::spawn(async move {
            TcpServer::accept_loop(
                listener,
                incoming_tx,
                outgoing_rx,
                event_tx_clone,
                connected_clone,
                Duration::from_millis(100), // very short heartbeat interval
            )
            .await;
        });

        // Connect a client but don't send any heartbeats
        let _stream = TcpStream::connect(format!("127.0.0.1:{}", port))
            .await
            .unwrap();

        // Wait for Connected
        let evt = timeout(Duration::from_secs(2), event_rx.recv())
            .await
            .unwrap()
            .unwrap();
        assert!(matches!(evt, ConnectionEvent::Connected(_)));

        // Wait for HeartbeatLost (should trigger after ~200ms = 2 * 100ms)
        let evt = timeout(Duration::from_secs(2), event_rx.recv())
            .await
            .unwrap()
            .unwrap();
        assert!(matches!(evt, ConnectionEvent::HeartbeatLost));

        // Then Disconnected
        let evt = timeout(Duration::from_secs(2), event_rx.recv())
            .await
            .unwrap()
            .unwrap();
        assert!(matches!(evt, ConnectionEvent::Disconnected));
    }
}
