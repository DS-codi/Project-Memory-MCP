use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc};
use tokio_tungstenite::tungstenite::Message;

/// HTML served to the Qt WebView when it loads `http://127.0.0.1:<port>/`.
const TERMINAL_HTML: &str = include_str!("../../resources/terminal.html");

/// Combined HTTP + WebSocket server on a single port.
///
/// - `GET /`  → serves `terminal.html`
/// - `GET /ws` with `Upgrade: websocket` → WebSocket connection for xterm.js
///
/// # Pass 1 (scaffold)
/// The server binds and accepts connections; PTY wiring (output_tx → WS, WS → input_rx)
/// is done in Pass 2. For now it simply shows "Connected to shell" in the terminal.
pub struct TerminalWsServer {
    pub port: u16,
    /// Broadcast PTY output bytes to all connected WebSocket clients.
    pub output_tx: broadcast::Sender<Vec<u8>>,
    /// Receive keyboard/resize input from WebSocket clients (→ PTY in Pass 2).
    pub input_tx: mpsc::Sender<Vec<u8>>,
}

impl TerminalWsServer {
    /// Create a new server.  Returns `(server, output_tx)` so the caller can
    /// broadcast PTY data via the returned sender.
    pub fn new(
        port: u16,
        input_tx: mpsc::Sender<Vec<u8>>,
    ) -> (Self, broadcast::Sender<Vec<u8>>) {
        let (output_tx, _) = broadcast::channel(256);
        let server = Self {
            port,
            output_tx: output_tx.clone(),
            input_tx,
        };
        (server, output_tx)
    }

    /// Run the accept loop — call with `tokio::spawn(server.serve())`.
    pub async fn serve(self) {
        let addr = format!("127.0.0.1:{}", self.port);
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

        loop {
            match listener.accept().await {
                Ok((stream, _peer)) => {
                    let out = output_tx.clone();
                    let inp = input_tx.clone();
                    tokio::spawn(handle_connection(stream, out, inp));
                }
                Err(e) => {
                    eprintln!("[TerminalWsServer] accept error: {e}");
                }
            }
        }
    }
}

// ─── Connection dispatcher ────────────────────────────────────────────────────

async fn handle_connection(
    stream: TcpStream,
    output_tx: Arc<broadcast::Sender<Vec<u8>>>,
    input_tx: Arc<mpsc::Sender<Vec<u8>>>,
) {
    // Peek at the first bytes to check for a WebSocket upgrade header.
    let mut peek_buf = [0u8; 512];
    let n = match stream.peek(&mut peek_buf).await {
        Ok(n) => n,
        Err(_) => return,
    };

    let header = String::from_utf8_lossy(&peek_buf[..n]);
    if header.to_ascii_lowercase().contains("upgrade: websocket") {
        handle_websocket(stream, output_tx, input_tx).await;
    } else {
        handle_http(stream).await;
    }
}

// ─── HTTP — serve terminal.html ───────────────────────────────────────────────

async fn handle_http(mut stream: TcpStream) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    // Consume the request (we don't need to parse it — we always serve the same page).
    let mut req_buf = vec![0u8; 4096];
    let _ = stream.read(&mut req_buf).await;

    let body = TERMINAL_HTML.as_bytes();
    let header = format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         \r\n",
        body.len()
    );

    let _ = stream.write_all(header.as_bytes()).await;
    let _ = stream.write_all(body).await;
}

// ─── WebSocket — xterm.js bidirectional bridge ────────────────────────────────

async fn handle_websocket(
    stream: TcpStream,
    output_tx: Arc<broadcast::Sender<Vec<u8>>>,
    input_tx: Arc<mpsc::Sender<Vec<u8>>>,
) {
    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("[TerminalWsServer] WS handshake error: {e}");
            return;
        }
    };

    let (mut ws_sink, mut ws_source) = ws_stream.split();
    let mut output_rx = output_tx.subscribe();

    // Forward PTY output → WebSocket client.
    let output_task = tokio::spawn(async move {
        while let Ok(data) = output_rx.recv().await {
            if ws_sink
                .send(Message::Binary(data.into()))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    // Forward WebSocket input → PTY (Pass 2 will wire the receiver end).
    while let Some(Ok(msg)) = ws_source.next().await {
        match msg {
            Message::Binary(data) => {
                let _ = input_tx.send(data.to_vec()).await;
            }
            Message::Text(text) => {
                let _ = input_tx.send(text.as_bytes().to_vec()).await;
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    output_task.abort();
}
