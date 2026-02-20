//! Completed-session output tracking for the interactive terminal.
//!
//! Stores captured stdout/stderr for completed (and running) command executions
//! so that `ReadOutputRequest` and `KillSessionRequest` can be served over TCP.

use crate::protocol::{
    AgentSessionRecord, AgentSessionState, GetAgentSessionResponse, HostedSessionKind,
    ListAgentSessionsResponse, Message, ReadAgentSessionOutputResponse,
    StartAgentSessionResponse, StopAgentSessionResponse,
};
use crate::terminal_core::output_tracker::CoreOutputTracker;
use std::collections::HashMap;

pub use crate::terminal_core::output_tracker::CompletedOutput;

#[derive(Debug, Clone)]
pub struct HostedSessionProjection {
    pub session_id: String,
    pub request_id: String,
    pub runtime_session_id: String,
    pub session_kind: HostedSessionKind,
    pub state: AgentSessionState,
    pub stop_escalation_level: u8,
}

/// Manages the completed-output store and running-process kill channels.
///
/// Stored inside `AppState` to be accessible from both `msg_task` and `exec_task`.
#[derive(Default)]
pub struct OutputTracker {
    pub core: CoreOutputTracker,
    /// Hosted session projection keyed by canonical session_id.
    pub hosted_sessions: HashMap<String, HostedSessionProjection>,
}

impl OutputTracker {
    fn session_record(&self, session: &HostedSessionProjection) -> AgentSessionRecord {
        let entry = self.core.completed.get(&session.request_id);
        AgentSessionRecord {
            session_id: session.session_id.clone(),
            runtime_session_id: session.runtime_session_id.clone(),
            session_kind: session.session_kind.clone(),
            state: session.state.clone(),
            stop_escalation_level: session.stop_escalation_level,
            running: entry.map(|item| item.running).unwrap_or(matches!(
                session.state,
                AgentSessionState::Starting | AgentSessionState::Running | AgentSessionState::Stopping
            )),
            exit_code: entry.and_then(|item| item.exit_code),
        }
    }

    fn status_matches_filter(state: &AgentSessionState, status_filter: &str) -> bool {
        let normalized = status_filter.trim().to_ascii_lowercase();
        match normalized.as_str() {
            "" | "all" => true,
            "active" => matches!(state, AgentSessionState::Starting | AgentSessionState::Running),
            "stopping" => matches!(state, AgentSessionState::Stopping),
            "completed" => matches!(
                state,
                AgentSessionState::Stopped | AgentSessionState::Completed | AgentSessionState::Failed
            ),
            _ => false,
        }
    }

    /// Record a completed output entry (or update a running one).
    pub fn store(&mut self, output: CompletedOutput) {
        self.core.store(output);
    }

    /// Mark a running entry as completed with the given exit code and final output.
    pub fn mark_completed(
        &mut self,
        request_id: &str,
        exit_code: Option<i32>,
        stdout: String,
        stderr: String,
    ) {
        self.core
            .mark_completed(request_id, exit_code, stdout, stderr);

        for session in self.hosted_sessions.values_mut() {
            if session.request_id == request_id {
                if matches!(
                    session.state,
                    AgentSessionState::Stopping | AgentSessionState::Stopped
                ) || session.stop_escalation_level > 0
                {
                    session.state = AgentSessionState::Stopped;
                } else {
                    session.state = if exit_code == Some(0) {
                        AgentSessionState::Completed
                    } else {
                        AgentSessionState::Failed
                    };
                }
            }
        }
    }

    /// Register a kill sender for a running process.
    pub fn register_kill_sender(
        &mut self,
        request_id: &str,
        sender: tokio::sync::oneshot::Sender<()>,
    ) {
        self.core.register_kill_sender(request_id, sender);
    }

    /// Build a `ReadOutputResponse` for the given request/session ID.
    pub fn build_read_output_response(&self, response_id: &str, session_id: &str) -> Message {
        self.core
            .build_read_output_response(response_id, session_id)
    }

    /// Attempt to kill a running process by request/session ID.
    /// Returns a `KillSessionResponse` message.
    pub fn try_kill(&mut self, response_id: &str, session_id: &str) -> Message {
        self.core.try_kill(response_id, session_id)
    }

    pub fn start_hosted_session(
        &mut self,
        response_id: &str,
        session_id: &str,
        runtime_session_id: &str,
    ) -> Message {
        self.hosted_sessions.insert(
            session_id.to_string(),
            HostedSessionProjection {
                session_id: session_id.to_string(),
                request_id: runtime_session_id.to_string(),
                runtime_session_id: runtime_session_id.to_string(),
                session_kind: HostedSessionKind::AgentCliSpecialized,
                state: AgentSessionState::Running,
                stop_escalation_level: 0,
            },
        );

        Message::StartAgentSessionResponse(StartAgentSessionResponse {
            id: response_id.to_string(),
            session_kind: HostedSessionKind::AgentCliSpecialized,
            session_id: session_id.to_string(),
            runtime_session_id: runtime_session_id.to_string(),
            state: AgentSessionState::Running,
            accepted: true,
            message: Some("Hosted session queued".to_string()),
            error: None,
            error_code: None,
            fallback_used: Some(false),
            fallback_reason: None,
        })
    }

    pub fn fail_hosted_session_start(
        &mut self,
        response_id: &str,
        session_id: &str,
        runtime_session_id: &str,
        error_code: &str,
        error: &str,
        fallback_reason: &str,
    ) -> Message {
        self.hosted_sessions.insert(
            session_id.to_string(),
            HostedSessionProjection {
                session_id: session_id.to_string(),
                request_id: runtime_session_id.to_string(),
                runtime_session_id: runtime_session_id.to_string(),
                session_kind: HostedSessionKind::AgentCliSpecialized,
                state: AgentSessionState::Failed,
                stop_escalation_level: 0,
            },
        );

        Message::StartAgentSessionResponse(StartAgentSessionResponse {
            id: response_id.to_string(),
            session_kind: HostedSessionKind::AgentCliSpecialized,
            session_id: session_id.to_string(),
            runtime_session_id: runtime_session_id.to_string(),
            state: AgentSessionState::Failed,
            accepted: false,
            message: None,
            error: Some(error.to_string()),
            error_code: Some(error_code.to_string()),
            fallback_used: Some(true),
            fallback_reason: Some(fallback_reason.to_string()),
        })
    }

    pub fn build_read_hosted_session_output_response(
        &self,
        response_id: &str,
        session_id: &str,
    ) -> Message {
        if let Some(session) = self.hosted_sessions.get(session_id) {
            if let Some(entry) = self.core.completed.get(&session.request_id) {
                return Message::ReadAgentSessionOutputResponse(ReadAgentSessionOutputResponse {
                    id: response_id.to_string(),
                    session_kind: session.session_kind.clone(),
                    session_id: session_id.to_string(),
                    state: session.state.clone(),
                    running: entry.running,
                    exit_code: entry.exit_code,
                    stdout: entry.stdout.clone(),
                    stderr: entry.stderr.clone(),
                    truncated: false,
                });
            }

            return Message::ReadAgentSessionOutputResponse(ReadAgentSessionOutputResponse {
                id: response_id.to_string(),
                session_kind: session.session_kind.clone(),
                session_id: session_id.to_string(),
                state: session.state.clone(),
                running: matches!(
                    session.state,
                    AgentSessionState::Starting
                        | AgentSessionState::Running
                        | AgentSessionState::Stopping
                ),
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                truncated: false,
            });
        }

        Message::ReadAgentSessionOutputResponse(ReadAgentSessionOutputResponse {
            id: response_id.to_string(),
            session_kind: HostedSessionKind::AgentCliSpecialized,
            session_id: session_id.to_string(),
            state: AgentSessionState::Failed,
            running: false,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            truncated: false,
        })
    }

    pub fn stop_hosted_session(
        &mut self,
        response_id: &str,
        session_id: &str,
        escalation_level: u8,
    ) -> Message {
        let Some((request_id, stop_escalation_level, state)) =
            self.hosted_sessions.get_mut(session_id).map(|session| {
                session.stop_escalation_level = session.stop_escalation_level.max(escalation_level);
                session.state = AgentSessionState::Stopping;
                (
                    session.request_id.clone(),
                    session.stop_escalation_level,
                    session.state.clone(),
                )
            })
        else {
            return Message::StopAgentSessionResponse(StopAgentSessionResponse {
                id: response_id.to_string(),
                session_kind: HostedSessionKind::AgentCliSpecialized,
                session_id: session_id.to_string(),
                state: AgentSessionState::Failed,
                stop_escalation_level: escalation_level,
                queued: false,
                message: None,
                error: Some("Hosted session not found".to_string()),
            });
        };

        let kill_result = self.try_kill(response_id, &request_id);
        let (queued, message, error) = match kill_result {
            Message::KillSessionResponse(resp) => (resp.killed, resp.message, resp.error),
            _ => (false, None, Some("unexpected kill response".to_string())),
        };

        let missing_kill_sender = matches!(error.as_deref(), Some("Session not found"));

        let final_state = if queued {
            AgentSessionState::Stopped
        } else if missing_kill_sender {
            AgentSessionState::Stopped
        } else if matches!(state, AgentSessionState::Stopping) {
            AgentSessionState::Failed
        } else {
            state
        };

        if let Some(session) = self.hosted_sessions.get_mut(session_id) {
            session.state = final_state.clone();
        }

        Message::StopAgentSessionResponse(StopAgentSessionResponse {
            id: response_id.to_string(),
            session_kind: HostedSessionKind::AgentCliSpecialized,
            session_id: session_id.to_string(),
            state: final_state,
            stop_escalation_level,
            queued,
            message,
            error,
        })
    }

    pub fn list_hosted_sessions(&self, response_id: &str, status_filter: &str) -> Message {
        let sessions = self
            .hosted_sessions
            .values()
            .filter(|session| Self::status_matches_filter(&session.state, status_filter))
            .map(|session| self.session_record(session))
            .collect::<Vec<_>>();

        Message::ListAgentSessionsResponse(ListAgentSessionsResponse {
            id: response_id.to_string(),
            session_kind: HostedSessionKind::AgentCliSpecialized,
            count: sessions.len(),
            sessions,
        })
    }

    pub fn get_hosted_session(&self, response_id: &str, session_id: &str) -> Message {
        let session = self
            .hosted_sessions
            .get(session_id)
            .map(|projection| self.session_record(projection));

        Message::GetAgentSessionResponse(GetAgentSessionResponse {
            id: response_id.to_string(),
            session_kind: HostedSessionKind::AgentCliSpecialized,
            error: if session.is_some() {
                None
            } else {
                Some("Hosted session not found".to_string())
            },
            session,
        })
    }

    /// Remove entries older than 30 minutes.
    pub fn evict_stale(&mut self) {
        self.core.evict_stale();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::Instant;

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

        let entry = tracker.core.completed.get("req-1").unwrap();
        assert!(!entry.running);
        assert_eq!(entry.exit_code, Some(0));
        assert_eq!(entry.stdout, "full output");
        assert_eq!(entry.stderr, "some err");
    }

    #[test]
    fn mark_completed_preserves_explicitly_stopped_session_state() {
        let mut tracker = OutputTracker::default();
        tracker.store(CompletedOutput {
            request_id: "req-1".into(),
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
            running: true,
            completed_at: Instant::now(),
        });
        tracker.hosted_sessions.insert(
            "sess-1".into(),
            HostedSessionProjection {
                session_id: "sess-1".into(),
                request_id: "req-1".into(),
                state: AgentSessionState::Stopped,
                stop_escalation_level: 1,
            },
        );

        tracker.mark_completed("req-1", Some(1), "stdout".into(), "stderr".into());

        let session = tracker.hosted_sessions.get("sess-1").unwrap();
        assert_eq!(session.state, AgentSessionState::Stopped);
    }

    #[test]
    fn stop_agent_session_without_kill_sender_is_not_failed() {
        let mut tracker = OutputTracker::default();
        tracker.hosted_sessions.insert(
            "sess-1".into(),
            HostedSessionProjection {
                session_id: "sess-1".into(),
                request_id: "req-1".into(),
                state: AgentSessionState::Running,
                stop_escalation_level: 0,
            },
        );

        let msg = tracker.stop_hosted_session("stop-1", "sess-1", 1);

        if let Message::StopAgentSessionResponse(resp) = msg {
            assert_eq!(resp.state, AgentSessionState::Stopped);
            assert!(!resp.queued);
            assert_eq!(resp.error.as_deref(), Some("Session not found"));
        } else {
            panic!("expected StopAgentSessionResponse");
        }

        let session = tracker.hosted_sessions.get("sess-1").unwrap();
        assert_eq!(session.state, AgentSessionState::Stopped);
    }
}
