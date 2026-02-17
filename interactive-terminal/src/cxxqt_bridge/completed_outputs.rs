//! Completed-session output tracking for the interactive terminal.
//!
//! Stores captured stdout/stderr for completed (and running) command executions
//! so that `ReadOutputRequest` and `KillSessionRequest` can be served over TCP.

use crate::protocol::{KillSessionResponse, Message, ReadOutputResponse};
use std::collections::HashMap;
use tokio::time::Instant;

/// Maximum age before a completed output entry is evicted (30 minutes).
const EVICTION_AGE_SECS: u64 = 30 * 60;

/// Captured output for a completed (or running) command execution.
#[derive(Debug, Clone)]
pub struct CompletedOutput {
    /// The original request ID (same as CommandRequest.id / CommandResponse.id).
    pub request_id: String,
    /// Accumulated stdout.
    pub stdout: String,
    /// Accumulated stderr.
    pub stderr: String,
    /// Process exit code (`None` while still running or if killed).
    pub exit_code: Option<i32>,
    /// Whether the process is still running.
    pub running: bool,
    /// When this entry was last updated (for eviction).
    pub completed_at: Instant,
}

/// Manages the completed-output store and running-process kill channels.
///
/// Stored inside `AppState` to be accessible from both `msg_task` and `exec_task`.
#[derive(Default)]
pub struct OutputTracker {
    /// Completed (or in-progress) command outputs keyed by request ID.
    pub completed: HashMap<String, CompletedOutput>,
    /// Kill channels for running processes, keyed by request ID.
    /// Sending on the channel signals the exec_task to kill the child process.
    pub kill_senders: HashMap<String, tokio::sync::oneshot::Sender<()>>,
}

impl OutputTracker {
    /// Record a completed output entry (or update a running one).
    pub fn store(&mut self, output: CompletedOutput) {
        self.completed.insert(output.request_id.clone(), output);
    }

    /// Mark a running entry as completed with the given exit code and final output.
    pub fn mark_completed(
        &mut self,
        request_id: &str,
        exit_code: Option<i32>,
        stdout: String,
        stderr: String,
    ) {
        if let Some(entry) = self.completed.get_mut(request_id) {
            entry.exit_code = exit_code;
            entry.running = false;
            entry.stdout = stdout;
            entry.stderr = stderr;
            entry.completed_at = Instant::now();
        } else {
            self.completed.insert(
                request_id.to_string(),
                CompletedOutput {
                    request_id: request_id.to_string(),
                    stdout,
                    stderr,
                    exit_code,
                    running: false,
                    completed_at: Instant::now(),
                },
            );
        }
        // Remove the kill sender since the process is done.
        self.kill_senders.remove(request_id);
    }

    /// Register a kill sender for a running process.
    pub fn register_kill_sender(
        &mut self,
        request_id: &str,
        sender: tokio::sync::oneshot::Sender<()>,
    ) {
        self.kill_senders.insert(request_id.to_string(), sender);
    }

    /// Build a `ReadOutputResponse` for the given request/session ID.
    pub fn build_read_output_response(
        &self,
        response_id: &str,
        session_id: &str,
    ) -> Message {
        if let Some(entry) = self.completed.get(session_id) {
            Message::ReadOutputResponse(ReadOutputResponse {
                id: response_id.to_string(),
                session_id: session_id.to_string(),
                running: entry.running,
                exit_code: entry.exit_code,
                stdout: entry.stdout.clone(),
                stderr: entry.stderr.clone(),
                truncated: false,
            })
        } else {
            // Session not found — return empty response with running=false.
            Message::ReadOutputResponse(ReadOutputResponse {
                id: response_id.to_string(),
                session_id: session_id.to_string(),
                running: false,
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                truncated: false,
            })
        }
    }

    /// Attempt to kill a running process by request/session ID.
    /// Returns a `KillSessionResponse` message.
    pub fn try_kill(&mut self, response_id: &str, session_id: &str) -> Message {
        if let Some(sender) = self.kill_senders.remove(session_id) {
            // Send the kill signal.
            let killed = sender.send(()).is_ok();
            Message::KillSessionResponse(KillSessionResponse {
                id: response_id.to_string(),
                session_id: session_id.to_string(),
                killed,
                message: if killed {
                    Some("Kill signal sent".to_string())
                } else {
                    None
                },
                error: if killed {
                    None
                } else {
                    Some("Kill signal failed (process may have already exited)".to_string())
                },
            })
        } else {
            Message::KillSessionResponse(KillSessionResponse {
                id: response_id.to_string(),
                session_id: session_id.to_string(),
                killed: false,
                message: None,
                error: Some("Session not found".to_string()),
            })
        }
    }

    /// Remove entries older than 30 minutes.
    pub fn evict_stale(&mut self) {
        let cutoff = std::time::Duration::from_secs(EVICTION_AGE_SECS);
        self.completed
            .retain(|_, entry| !entry.running || entry.completed_at.elapsed() < cutoff);
        // Also retain only completed entries that are recent.
        self.completed
            .retain(|_, entry| entry.running || entry.completed_at.elapsed() < cutoff);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn store_and_retrieve() {
        let mut tracker = OutputTracker::default();
        tracker.store(CompletedOutput {
            request_id: "req-1".into(),
            stdout: "hello".into(),
            stderr: String::new(),
            exit_code: Some(0),
            running: false,
            completed_at: Instant::now(),
        });

        let msg = tracker.build_read_output_response("resp-1", "req-1");
        if let Message::ReadOutputResponse(resp) = msg {
            assert_eq!(resp.stdout, "hello");
            assert!(!resp.running);
            assert_eq!(resp.exit_code, Some(0));
        } else {
            panic!("expected ReadOutputResponse");
        }
    }

    #[test]
    fn not_found_returns_empty() {
        let tracker = OutputTracker::default();
        let msg = tracker.build_read_output_response("resp-1", "nonexistent");
        if let Message::ReadOutputResponse(resp) = msg {
            assert!(!resp.running);
            assert!(resp.exit_code.is_none());
            assert_eq!(resp.stdout, "");
        } else {
            panic!("expected ReadOutputResponse");
        }
    }

    #[test]
    fn kill_no_session() {
        let mut tracker = OutputTracker::default();
        let msg = tracker.try_kill("kill-1", "nonexistent");
        if let Message::KillSessionResponse(resp) = msg {
            assert!(!resp.killed);
            assert!(resp.error.is_some());
        } else {
            panic!("expected KillSessionResponse");
        }
    }

    #[test]
    fn kill_with_sender() {
        let mut tracker = OutputTracker::default();
        let (tx, mut rx) = tokio::sync::oneshot::channel();
        tracker.register_kill_sender("req-1", tx);

        let msg = tracker.try_kill("kill-1", "req-1");
        if let Message::KillSessionResponse(resp) = msg {
            assert!(resp.killed);
            assert!(resp.message.is_some());
            assert!(resp.error.is_none());
        } else {
            panic!("expected KillSessionResponse");
        }

        // rx should have received the signal
        assert!(rx.try_recv().is_ok());
    }

    #[test]
    fn mark_completed_updates_entry() {
        let mut tracker = OutputTracker::default();
        tracker.store(CompletedOutput {
            request_id: "req-1".into(),
            stdout: "partial".into(),
            stderr: String::new(),
            exit_code: None,
            running: true,
            completed_at: Instant::now(),
        });

        tracker.mark_completed("req-1", Some(0), "full output".into(), "some err".into());

        let entry = tracker.completed.get("req-1").unwrap();
        assert!(!entry.running);
        assert_eq!(entry.exit_code, Some(0));
        assert_eq!(entry.stdout, "full output");
        assert_eq!(entry.stderr, "some err");
    }
}
