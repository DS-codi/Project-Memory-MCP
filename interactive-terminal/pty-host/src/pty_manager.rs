use std::collections::HashMap;
use tokio::sync::mpsc;

use crate::pty_host_protocol::{SessionCreate, SessionExited};

/// Events emitted by PTY sessions to the IPC send loop.
#[derive(Debug)]
pub(crate) enum HostEvent {
    /// Raw output bytes from a session's PTY.
    Output { session_id: String, data: Vec<u8> },
    /// A session's shell process has exited.
    Exited {
        session_id: String,
        exit_code: Option<i32>,
    },
}

// ── Windows: live PTY sessions ────────────────────────────────────────────

#[cfg(windows)]
use std::sync::{Arc, Mutex as StdMutex};
#[cfg(windows)]
use crate::pty_backend::{resize_conpty, spawn_conpty_raw_session};

#[cfg(windows)]
struct ActiveSession {
    writer: Arc<StdMutex<Box<dyn std::io::Write + Send>>>,
    master: Arc<StdMutex<Box<dyn portable_pty::MasterPty + Send>>>,
    child: Arc<StdMutex<Box<dyn portable_pty::Child + Send + Sync>>>,
}

pub(crate) struct PtyManager {
    /// Only populated on Windows; empty on other platforms.
    #[cfg(windows)]
    sessions: HashMap<String, ActiveSession>,
    #[cfg(not(windows))]
    _sessions: HashMap<String, ()>,

    event_tx: mpsc::UnboundedSender<HostEvent>,
}

impl PtyManager {
    pub(crate) fn new(event_tx: mpsc::UnboundedSender<HostEvent>) -> Self {
        PtyManager {
            #[cfg(windows)]
            sessions: HashMap::new(),
            #[cfg(not(windows))]
            _sessions: HashMap::new(),
            event_tx,
        }
    }

    /// Spawn a new PTY session. The reader task forwards output via `event_tx`.
    pub(crate) fn spawn(&mut self, req: &SessionCreate) -> Result<(), String> {
        #[cfg(windows)]
        {
            let cwd = std::path::Path::new(&req.cwd);
            let session =
                spawn_conpty_raw_session(&req.program, &req.args, cwd, &[], req.cols, req.rows)?;
            let (mut raw_rx, writer, master, child) = session.into_task_parts();

            let session_id = req.session_id.clone();
            let event_tx = self.event_tx.clone();
            tokio::spawn(async move {
                while let Some(chunk) = raw_rx.recv().await {
                    if event_tx
                        .send(HostEvent::Output {
                            session_id: session_id.clone(),
                            data: chunk,
                        })
                        .is_err()
                    {
                        break;
                    }
                }
                // PTY reader loop ended → session exited.
                let exit_code: Option<i32> = None; // portable-pty doesn't always surface exit code
                let _ = event_tx.send(HostEvent::Exited {
                    session_id: session_id.clone(),
                    exit_code,
                });
            });

            self.sessions.insert(
                req.session_id.clone(),
                ActiveSession { writer, master, child },
            );
            Ok(())
        }
        #[cfg(not(windows))]
        {
            let _ = req;
            Err("PTY spawning is only supported on Windows".to_string())
        }
    }

    /// Write raw input bytes to a session's PTY.
    pub(crate) fn write_input(&mut self, session_id: &str, data: &[u8]) {
        #[cfg(windows)]
        {
            if let Some(session) = self.sessions.get(session_id) {
                let writer = session.writer.clone();
                let data_vec = data.to_vec();
                // spawn_blocking because the writer lock is a std Mutex + blocking IO
                let _ = tokio::task::spawn_blocking(move || {
                    if let Ok(mut lock) = writer.lock() {
                        let _ = std::io::Write::write_all(&mut *lock, &data_vec);
                        let _ = std::io::Write::flush(&mut *lock);
                    }
                });
            }
        }
        #[cfg(not(windows))]
        {
            let _ = (session_id, data);
        }
    }

    /// Resize a session's PTY.
    pub(crate) fn resize(&self, session_id: &str, cols: u16, rows: u16) {
        #[cfg(windows)]
        {
            if let Some(session) = self.sessions.get(session_id) {
                resize_conpty(&session.master, cols, rows);
            }
        }
        #[cfg(not(windows))]
        {
            let _ = (session_id, cols, rows);
        }
    }

    /// Kill a single session.
    pub(crate) fn kill(&mut self, session_id: &str) {
        #[cfg(windows)]
        {
            if let Some(session) = self.sessions.remove(session_id) {
                let child = session.child.clone();
                let _ = tokio::task::spawn_blocking(move || {
                    if let Ok(mut lock) = child.lock() {
                        let _ = lock.kill();
                    }
                });
            }
        }
        #[cfg(not(windows))]
        {
            let _ = session_id;
        }
    }

    /// Kill all active sessions (called during graceful shutdown).
    pub(crate) fn kill_all(&mut self) {
        #[cfg(windows)]
        {
            let ids: Vec<String> = self.sessions.keys().cloned().collect();
            for id in ids {
                self.kill(&id);
            }
        }
    }

    /// Remove a session from the map after it has exited (cleanup without killing).
    pub(crate) fn remove(&mut self, session_id: &str) {
        #[cfg(windows)]
        {
            self.sessions.remove(session_id);
        }
        #[cfg(not(windows))]
        {
            let _ = session_id;
        }
    }
}

impl Drop for PtyManager {
    fn drop(&mut self) {
        self.kill_all();
    }
}
