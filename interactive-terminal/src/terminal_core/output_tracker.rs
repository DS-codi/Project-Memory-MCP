use crate::protocol::{KillSessionResponse, Message, ReadOutputResponse};
use std::collections::HashMap;
use tokio::time::Instant;

/// Maximum age before a completed output entry is evicted (30 minutes).
const EVICTION_AGE_SECS: u64 = 30 * 60;

#[derive(Debug, Clone)]
pub struct CompletedOutput {
    pub request_id: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub running: bool,
    pub completed_at: Instant,
}

#[derive(Default)]
pub struct CoreOutputTracker {
    pub completed: HashMap<String, CompletedOutput>,
    pub kill_senders: HashMap<String, tokio::sync::oneshot::Sender<()>>,
}

impl CoreOutputTracker {
    pub fn store(&mut self, output: CompletedOutput) {
        self.completed.insert(output.request_id.clone(), output);
    }

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

        self.kill_senders.remove(request_id);
    }

    pub fn register_kill_sender(
        &mut self,
        request_id: &str,
        sender: tokio::sync::oneshot::Sender<()>,
    ) {
        self.kill_senders.insert(request_id.to_string(), sender);
    }

    pub fn build_read_output_response(&self, response_id: &str, session_id: &str) -> Message {
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

    pub fn try_kill(&mut self, response_id: &str, session_id: &str) -> Message {
        if let Some(sender) = self.kill_senders.remove(session_id) {
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

    pub fn evict_stale(&mut self) {
        let cutoff = std::time::Duration::from_secs(EVICTION_AGE_SECS);
        self.completed
            .retain(|_, entry| !entry.running || entry.completed_at.elapsed() < cutoff);
        self.completed
            .retain(|_, entry| entry.running || entry.completed_at.elapsed() < cutoff);
    }
}
