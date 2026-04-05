//! Backend bridge: connects the iced UI to the TCP server that receives
//! CommandRequest messages from pm-cli.
//!
//! Architecture:
//! - A Tokio task listens on TCP, parses incoming JSON messages, and sends
//!   them through an unbounded channel.
//! - iced polls the channel via a self-rescheduling Task (same pattern as
//!   supervisor-iced's tray polling).
//! - Outgoing messages (approve/decline responses) go through outgoing_tx.

#![allow(dead_code)]

use std::sync::{Mutex, OnceLock};
use tokio::sync::mpsc;

// ─── Outgoing messages (iced → TCP client) ───────────────────────────────────

/// Messages the iced app can send back to connected clients.
#[derive(Debug, Clone)]
pub enum OutgoingMessage {
    /// Approve a pending command request
    Approve {
        request_id: String,
        autonomy_mode: String,
        provider: String,
        session_mode: String,
        resume_session_id: Option<String>,
        output_format: String,
        budget_max_commands: u32,
        budget_max_duration_secs: u32,
        budget_max_files: u32,
        gemini_screen_reader: bool,
        copilot_minimal_ui: bool,
    },
    /// Decline a pending command request
    Decline {
        request_id: String,
        reason: String,
    },
    /// Raw JSON string (for forwarding arbitrary protocol messages)
    Raw(String),
}

// ─── Backend events (TCP task → iced) ────────────────────────────────────────

/// Events flowing from the TCP backend into iced.
#[derive(Debug, Clone)]
pub enum BackendEvent {
    /// A new TCP client connected.
    Connected,
    /// The TCP client disconnected (or hasn't connected yet).
    Disconnected,
    /// A raw JSON line was received from the client.
    Message(String),
}

// ─── Global channels ─────────────────────────────────────────────────────────

// TCP task → iced (incoming events)
static BACKEND_RX: OnceLock<Mutex<mpsc::UnboundedReceiver<BackendEvent>>> = OnceLock::new();
static BACKEND_TX: OnceLock<mpsc::UnboundedSender<BackendEvent>> = OnceLock::new();

// iced → TCP task (outgoing responses)
static OUTGOING_TX: OnceLock<mpsc::UnboundedSender<OutgoingMessage>> = OnceLock::new();

// ─── Public API ───────────────────────────────────────────────────────────────

/// Call once at startup (e.g. from `app_state::init`) to spawn the TCP listener.
///
/// Returns the outgoing sender so `AppState` can hold it and call
/// `outgoing_tx.send(OutgoingMessage::Approve { … })` on approval.
pub fn start(host: String, port: u16) -> mpsc::UnboundedSender<OutgoingMessage> {
    let (backend_tx, backend_rx) = mpsc::unbounded_channel::<BackendEvent>();
    let (outgoing_tx, outgoing_rx) = mpsc::unbounded_channel::<OutgoingMessage>();

    // Store globally so drain_events() can access the receiver.
    BACKEND_TX.set(backend_tx.clone()).ok();
    BACKEND_RX.set(Mutex::new(backend_rx)).ok();
    OUTGOING_TX.set(outgoing_tx.clone()).ok();

    let tx = backend_tx;
    tokio::spawn(async move {
        run_tcp_loop(host, port, tx, outgoing_rx).await;
    });

    outgoing_tx
}

/// Drain all pending [`BackendEvent`]s from the channel.
///
/// Called from `app_state::update` on every `Message::BackendPoll` tick so
/// that all queued events are processed in a single iced update pass.
pub fn drain_events() -> Vec<BackendEvent> {
    let mut events = Vec::new();
    if let Some(rx_mutex) = BACKEND_RX.get() {
        if let Ok(mut rx) = rx_mutex.try_lock() {
            while let Ok(ev) = rx.try_recv() {
                events.push(ev);
            }
        }
    }
    events
}

/// Returns a clone of the outgoing sender (if `start` has been called).
pub fn outgoing_tx() -> Option<mpsc::UnboundedSender<OutgoingMessage>> {
    OUTGOING_TX.get().cloned()
}

// ─── TCP accept loop ──────────────────────────────────────────────────────────

async fn run_tcp_loop(
    host: String,
    port: u16,
    tx: mpsc::UnboundedSender<BackendEvent>,
    mut outgoing_rx: mpsc::UnboundedReceiver<OutgoingMessage>,
) {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::TcpListener;

    let addr = format!("{}:{}", host, port);
    tracing::info!("Listening for pm-cli on {}", addr);

    loop {
        // Bind a fresh listener each iteration so we recover from port errors.
        let listener = match TcpListener::bind(&addr).await {
            Ok(l) => l,
            Err(e) => {
                tracing::warn!("TCP bind failed: {} — retrying in 2s", e);
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                continue;
            }
        };

        // Signal the UI that we are in the "listening / waiting" state.
        let _ = tx.send(BackendEvent::Disconnected);

        // Wait for a single client to connect.
        let (stream, peer) = match listener.accept().await {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("accept error: {}", e);
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                continue;
            }
        };
        tracing::info!("pm-cli connected from {}", peer);
        let _ = tx.send(BackendEvent::Connected);

        // Split the stream so we can read and write concurrently.
        let (read_half, mut write_half) = stream.into_split();
        let mut reader = BufReader::new(read_half);
        let mut line = String::new();

        // Per-connection select loop: read incoming lines OR send outgoing.
        loop {
            tokio::select! {
                result = reader.read_line(&mut line) => {
                    match result {
                        Ok(0) => {
                            // EOF — client disconnected cleanly.
                            break;
                        }
                        Ok(_) => {
                            let msg = line.trim().to_string();
                            if !msg.is_empty() {
                                let _ = tx.send(BackendEvent::Message(msg));
                            }
                            line.clear();
                        }
                        Err(e) => {
                            tracing::warn!("TCP read error: {}", e);
                            break;
                        }
                    }
                }

                Some(out) = outgoing_rx.recv() => {
                    let json = outgoing_message_to_json(&out);
                    let mut data = json;
                    data.push('\n');
                    if let Err(e) = write_half.write_all(data.as_bytes()).await {
                        tracing::warn!("TCP write error: {}", e);
                        break;
                    }
                }
            }
        }

        tracing::info!("pm-cli disconnected");
        let _ = tx.send(BackendEvent::Disconnected);
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        // Loop back to bind a new listener and wait for the next connection.
    }
}

// ─── JSON serialisation helpers ───────────────────────────────────────────────

fn outgoing_message_to_json(msg: &OutgoingMessage) -> String {
    match msg {
        OutgoingMessage::Approve {
            request_id,
            autonomy_mode,
            provider,
            session_mode,
            resume_session_id,
            output_format,
            budget_max_commands,
            budget_max_duration_secs,
            budget_max_files,
            gemini_screen_reader,
            copilot_minimal_ui,
        } => serde_json::json!({
            "type": "CommandResponse",
            "requestId": request_id,
            "approved": true,
            "autonomyMode": autonomy_mode,
            "provider": provider,
            "sessionMode": session_mode,
            "resumeSessionId": resume_session_id,
            "outputFormat": output_format,
            "budgetMaxCommands": budget_max_commands,
            "budgetMaxDurationSecs": budget_max_duration_secs,
            "budgetMaxFiles": budget_max_files,
            "geminiScreenReader": gemini_screen_reader,
            "copilotMinimalUi": copilot_minimal_ui,
        })
        .to_string(),

        OutgoingMessage::Decline { request_id, reason } => serde_json::json!({
            "type": "CommandResponse",
            "requestId": request_id,
            "approved": false,
            "declineReason": reason,
        })
        .to_string(),

        OutgoingMessage::Raw(s) => s.clone(),
    }
}
