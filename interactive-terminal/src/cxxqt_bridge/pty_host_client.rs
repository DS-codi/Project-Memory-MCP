/// Client-side connector to the out-of-process `pty-host` binary.
///
/// The UI process (interactive-terminal) connects to the pty-host IPC server
/// over a local TCP socket.  All PTY sessions are driven through this client.
///
/// Enabled only when the `pty-host` feature flag is active.
#[cfg(feature = "pty-host")]
pub mod inner {
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex as StdMutex, OnceLock};

    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::TcpStream;
    use tokio::sync::{mpsc, oneshot};
    use tokio::time::{timeout, Duration};

    use crate::cxxqt_bridge::session_runtime::{AppState, SessionLifecycleState};
    use crate::pty_host_protocol::*;

    /// Module-level handle to the connected PtyHostClient.
    /// Initialised once from `runtime_tasks.rs` after the pty-host process has started.
    pub static PTY_HOST_CLIENT: OnceLock<Arc<PtyHostClient>> = OnceLock::new();

    // ── PtyHostSessionHandle ─────────────────────────────────────────────────

    /// Lightweight handle to an active PTY session in the pty-host process.
    ///
    /// Cloning is cheap (Arc-based sender).
    #[derive(Clone)]
    pub struct PtyHostSessionHandle {
        pub session_id: String,
        send_tx: mpsc::UnboundedSender<PtyHostMessage>,
    }

    impl PtyHostSessionHandle {
        fn new(session_id: impl Into<String>, send_tx: mpsc::UnboundedSender<PtyHostMessage>) -> Self {
            Self {
                session_id: session_id.into(),
                send_tx,
            }
        }

        /// Write a UTF-8 command line (appends `\r\n`).
        pub fn write_command_line(&self, cmd: &str) {
            self.write_raw(format!("{cmd}\r\n").as_bytes());
        }

        /// Write raw bytes to the session's PTY stdin.
        pub fn write_raw(&self, data: &[u8]) {
            let text = String::from_utf8_lossy(data).to_string();
            let _ = self.send_tx.send(PtyHostMessage::SessionInput(SessionInput {
                session_id: self.session_id.clone(),
                data: text,
            }));
        }

        /// Resize the session's PTY.
        pub fn resize(&self, cols: u16, rows: u16) {
            let _ = self
                .send_tx
                .send(PtyHostMessage::SessionResize(SessionResize {
                    session_id: self.session_id.clone(),
                    cols,
                    rows,
                }));
        }

        /// Send a kill signal to the session.
        pub fn terminate(&self) {
            let _ = self.send_tx.send(PtyHostMessage::SessionKill(SessionKill {
                session_id: self.session_id.clone(),
            }));
        }
    }

    // ── PtyHostClient ────────────────────────────────────────────────────────

    type PendingCreates = Arc<StdMutex<HashMap<String, oneshot::Sender<Result<(), String>>>>>;

    /// Manages the single TCP connection to the pty-host process.
    pub struct PtyHostClient {
        send_tx: mpsc::UnboundedSender<PtyHostMessage>,
        pending_creates: PendingCreates,
    }

    impl PtyHostClient {
        /// Connect to the pty-host binary and spawn recv/send background tasks.
        ///
        /// `session_output_tx` — forwards `(session_id, raw_bytes)` into the existing
        ///   session output fan-out loop (unchanged from the non-pty-host path).
        ///
        /// `app_state` — used to mark sessions as `Closed` on `SessionExited`.
        pub async fn connect(
            port: u16,
            session_output_tx: mpsc::Sender<(String, Vec<u8>)>,
            app_state: Arc<StdMutex<AppState>>,
        ) -> Result<Arc<Self>, String> {
            // Retry: the pty-host process may take a moment to bind its socket.
            let stream = Self::connect_with_retry(port).await?;
            let (read_half, write_half) = tokio::io::split(stream);

            let pending_creates: PendingCreates = Arc::new(StdMutex::new(HashMap::new()));

            // Channel: enqueues outgoing messages for the write task.
            let (send_tx, mut send_rx) = mpsc::unbounded_channel::<PtyHostMessage>();

            // ── Write task ───────────────────────────────────────────────────
            tokio::spawn(async move {
                let mut write_half = write_half;
                while let Some(msg) = send_rx.recv().await {
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
                        Err(e) => eprintln!("[PtyHostClient] serialize error: {e}"),
                    }
                }
                eprintln!("[PtyHostClient] write task ended");
            });

            // ── Recv task ────────────────────────────────────────────────────
            let pending_for_recv = pending_creates.clone();
            let app_state_for_recv = app_state;
            tokio::spawn(async move {
                let mut lines = BufReader::new(read_half).lines();
                loop {
                    match lines.next_line().await {
                        Ok(Some(line)) => {
                            let msg = match serde_json::from_str::<PtyHostMessage>(&line) {
                                Ok(m) => m,
                                Err(e) => {
                                    eprintln!("[PtyHostClient] deserialize: {e} ({line})");
                                    continue;
                                }
                            };
                            match msg {
                                PtyHostMessage::SessionCreated(c) => {
                                    if let Some(tx) = pending_for_recv
                                        .lock()
                                        .unwrap()
                                        .remove(&c.session_id)
                                    {
                                        let _ = tx.send(Ok(()));
                                    }
                                }
                                PtyHostMessage::SessionCreateFailed(f) => {
                                    if let Some(tx) = pending_for_recv
                                        .lock()
                                        .unwrap()
                                        .remove(&f.session_id)
                                    {
                                        let _ = tx.send(Err(f.error.clone()));
                                    }
                                    eprintln!(
                                        "[PtyHostClient] session creation failed for {}: {}",
                                        f.session_id, f.error
                                    );
                                }
                                PtyHostMessage::SessionOutput(o) => {
                                    let data = o.data.into_bytes();
                                    if session_output_tx
                                        .send((o.session_id, data))
                                        .await
                                        .is_err()
                                    {
                                        eprintln!("[PtyHostClient] session_output_tx closed");
                                        break;
                                    }
                                }
                                PtyHostMessage::SessionExited(e) => {
                                    // Mark the session closed in app state.
                                    {
                                        let mut s = app_state_for_recv.lock().unwrap();
                                        s.session_lifecycle_by_id.insert(
                                            e.session_id.clone(),
                                            SessionLifecycleState::Closed,
                                        );
                                    }
                                    eprintln!(
                                        "[PtyHostClient] session {} exited (code {:?})",
                                        e.session_id, e.exit_code
                                    );
                                }
                                PtyHostMessage::Heartbeat(_) => {
                                    // Liveness signal — no action required.
                                }
                                _ => {
                                    // UI → host direction; shouldn't arrive here, ignore.
                                }
                            }
                        }
                        Ok(None) => {
                            eprintln!("[PtyHostClient] pty-host disconnected");
                            break;
                        }
                        Err(e) => {
                            eprintln!("[PtyHostClient] recv error: {e}");
                            break;
                        }
                    }
                }
            });

            Ok(Arc::new(PtyHostClient {
                send_tx,
                pending_creates,
            }))
        }

        /// Spawn a new PTY session in the pty-host process.
        ///
        /// Returns a `PtyHostSessionHandle` that can be used to send input/resize/kill.
        pub async fn create_session(
            self: &Arc<Self>,
            session_id: impl Into<String>,
            cwd: impl Into<String>,
            cols: u16,
            rows: u16,
        ) -> Result<PtyHostSessionHandle, String> {
            let session_id = session_id.into();
            let (tx, rx) = oneshot::channel();

            self.pending_creates
                .lock()
                .unwrap()
                .insert(session_id.clone(), tx);

            let cmd_shell = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());

            self.send_tx
                .send(PtyHostMessage::SessionCreate(SessionCreate {
                    session_id: session_id.clone(),
                    program: cmd_shell,
                    args: vec![],
                    cwd: cwd.into(),
                    env: HashMap::new(),
                    cols,
                    rows,
                }))
                .map_err(|_| "PtyHostClient send channel closed".to_string())?;

            // Wait up to 10 s for the host to spawn and confirm.
            match timeout(Duration::from_secs(10), rx).await {
                Ok(Ok(Ok(()))) => Ok(PtyHostSessionHandle::new(session_id, self.send_tx.clone())),
                Ok(Ok(Err(e))) => Err(format!("pty-host failed to create session: {e}")),
                Ok(Err(_)) => Err("pending create oneshot dropped".to_string()),
                Err(_) => Err("timed out waiting for session creation".to_string()),
            }
        }

        // ── Internal helpers ─────────────────────────────────────────────────

        async fn connect_with_retry(port: u16) -> Result<TcpStream, String> {
            const MAX_ATTEMPTS: u32 = 20;
            const BASE_DELAY_MS: u64 = 200;
            const BACKOFF_MS: u64 = 50;

            let addr = format!("127.0.0.1:{port}");
            for attempt in 0..MAX_ATTEMPTS {
                match TcpStream::connect(&addr).await {
                    Ok(stream) => {
                        eprintln!("[PtyHostClient] connected on attempt {attempt}");
                        return Ok(stream);
                    }
                    Err(e) => {
                        let delay = BASE_DELAY_MS + BACKOFF_MS * attempt as u64;
                        eprintln!(
                            "[PtyHostClient] connect attempt {attempt}/{MAX_ATTEMPTS} failed ({e}), retry in {delay}ms"
                        );
                        tokio::time::sleep(Duration::from_millis(delay)).await;
                    }
                }
            }
            Err(format!(
                "Could not connect to pty-host on 127.0.0.1:{port} after {MAX_ATTEMPTS} attempts"
            ))
        }
    }
}

#[cfg(feature = "pty-host")]
pub use inner::{PTY_HOST_CLIENT, PtyHostClient, PtyHostSessionHandle};
