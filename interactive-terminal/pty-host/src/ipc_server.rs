use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio::sync::mpsc;

use crate::pty_host_protocol::*;
use crate::pty_manager::{HostEvent, PtyManager};

pub(crate) struct IpcServer;

impl IpcServer {
    /// Bind the TCP listener and accept exactly one client (the UI process).
    /// Runs the recv/send loops until either side disconnects or an error occurs.
    pub(crate) async fn run(
        mut manager: PtyManager,
        mut event_rx: mpsc::UnboundedReceiver<HostEvent>,
        ipc_port: u16,
        heartbeat_ms: u64,
    ) -> Result<(), String> {
        let listener = TcpListener::bind(format!("127.0.0.1:{ipc_port}"))
            .await
            .map_err(|e| format!("Failed to bind IPC port {ipc_port}: {e}"))?;

        eprintln!("[pty-host] IPC server listening on 127.0.0.1:{ipc_port}");

        // Accept one client connection (the UI process).
        let (stream, peer) = listener
            .accept()
            .await
            .map_err(|e| format!("IPC accept failed: {e}"))?;

        eprintln!("[pty-host] UI process connected from {peer}");

        let (read_half, write_half) = tokio::io::split(stream);

        // Channel to send outgoing frames from various sources to the write task.
        let (out_tx, mut out_rx) = mpsc::unbounded_channel::<PtyHostMessage>();

        // ── Write task: serialize outgoing PtyHostMessage frames ──────────────
        let write_task = tokio::spawn(async move {
            let mut write_half = write_half;
            while let Some(msg) = out_rx.recv().await {
                match serde_json::to_string(&msg) {
                    Ok(line) => {
                        let payload = format!("{line}\n");
                        if write_half.write_all(payload.as_bytes()).await.is_err() {
                            break;
                        }
                        if write_half.flush().await.is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        eprintln!("[pty-host] serialize error: {e}");
                    }
                }
            }
        });

        // ── Event forwarder: route HostEvents to out_tx ──────────────────────
        let out_tx_for_events = out_tx.clone();
        let event_task = tokio::spawn(async move {
            while let Some(event) = event_rx.recv().await {
                let msg = match event {
                    HostEvent::Output { session_id, data } => {
                        let text = String::from_utf8_lossy(&data).to_string();
                        PtyHostMessage::SessionOutput(SessionOutput {
                            session_id,
                            data: text,
                        })
                    }
                    HostEvent::Exited {
                        session_id,
                        exit_code,
                    } => PtyHostMessage::SessionExited(SessionExited {
                        session_id,
                        exit_code,
                    }),
                };
                if out_tx_for_events.send(msg).is_err() {
                    break;
                }
            }
        });

        // ── Heartbeat task ────────────────────────────────────────────────────
        let out_tx_for_hb = out_tx.clone();
        let heartbeat_interval = std::time::Duration::from_millis(heartbeat_ms);
        let heartbeat_task = tokio::spawn(async move {
            loop {
                tokio::time::sleep(heartbeat_interval).await;
                let ts = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                if out_tx_for_hb
                    .send(PtyHostMessage::Heartbeat(Heartbeat { ts }))
                    .is_err()
                {
                    break;
                }
            }
        });

        // ── Read task: deserialize incoming commands ──────────────────────────
        let mut lines = BufReader::new(read_half).lines();
        loop {
            match lines.next_line().await {
                Ok(Some(line)) => {
                    let msg = match serde_json::from_str::<PtyHostMessage>(&line) {
                        Ok(m) => m,
                        Err(e) => {
                            eprintln!("[pty-host] deserialize error: {e} (line: {line})");
                            continue;
                        }
                    };

                    match msg {
                        PtyHostMessage::SessionCreate(req) => {
                            let session_id = req.session_id.clone();
                            let reply = match manager.spawn(&req) {
                                Ok(()) => PtyHostMessage::SessionCreated(SessionCreated {
                                    session_id: session_id.clone(),
                                }),
                                Err(err) => {
                                    PtyHostMessage::SessionCreateFailed(SessionCreateFailed {
                                        session_id: session_id.clone(),
                                        error: err,
                                    })
                                }
                            };
                            let _ = out_tx.send(reply);
                        }
                        PtyHostMessage::SessionInput(inp) => {
                            manager.write_input(&inp.session_id, inp.data.as_bytes());
                        }
                        PtyHostMessage::SessionResize(r) => {
                            manager.resize(&r.session_id, r.cols, r.rows);
                        }
                        PtyHostMessage::SessionKill(k) => {
                            manager.kill(&k.session_id);
                        }
                        PtyHostMessage::SessionExited(e) => {
                            // Cleanup in manager when we receive our own Exited back (shouldn't happen normally)
                            manager.remove(&e.session_id);
                        }
                        _ => {
                            // Heartbeat and other UI→host messages: ignore
                        }
                    }
                }
                Ok(None) => {
                    eprintln!("[pty-host] UI process disconnected");
                    break;
                }
                Err(e) => {
                    eprintln!("[pty-host] IPC read error: {e}");
                    break;
                }
            }
        }

        // Cleanup
        manager.kill_all();
        write_task.abort();
        event_task.abort();
        heartbeat_task.abort();

        Ok(())
    }
}
