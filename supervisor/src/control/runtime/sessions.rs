use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use tokio::sync::Mutex;
use uuid::Uuid;

use crate::control::runtime::contracts::{RuntimeSessionSnapshot, RuntimeSessionState};

#[derive(Clone)]
struct RuntimeSessionRecord {
    session_id: String,
    state: RuntimeSessionState,
    created_at_ms: u64,
    updated_at_ms: u64,
    last_error: Option<String>,
}

pub struct SessionCoordinator {
    records: Mutex<HashMap<String, RuntimeSessionRecord>>,
}

impl SessionCoordinator {
    pub fn new() -> Self {
        Self {
            records: Mutex::new(HashMap::new()),
        }
    }

    pub async fn init_session(&self, requested: Option<&str>) -> RuntimeSessionSnapshot {
        let now = now_ms();
        let session_id = requested
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("runtime-{}", Uuid::new_v4()));

        let mut records = self.records.lock().await;
        let record = records
            .entry(session_id.clone())
            .or_insert_with(|| RuntimeSessionRecord {
                session_id: session_id.clone(),
                state: RuntimeSessionState::Initialized,
                created_at_ms: now,
                updated_at_ms: now,
                last_error: None,
            });

        record.updated_at_ms = now;
        RuntimeSessionSnapshot {
            session_id: record.session_id.clone(),
            state: record.state.clone(),
            created_at_ms: record.created_at_ms,
            updated_at_ms: record.updated_at_ms,
            last_error: record.last_error.clone(),
        }
    }

    pub async fn set_state(
        &self,
        session_id: &str,
        state: RuntimeSessionState,
        last_error: Option<String>,
    ) -> Option<RuntimeSessionSnapshot> {
        let mut records = self.records.lock().await;
        let record = records.get_mut(session_id)?;
        record.state = state;
        record.updated_at_ms = now_ms();
        record.last_error = last_error;
        Some(RuntimeSessionSnapshot {
            session_id: record.session_id.clone(),
            state: record.state.clone(),
            created_at_ms: record.created_at_ms,
            updated_at_ms: record.updated_at_ms,
            last_error: record.last_error.clone(),
        })
    }

    pub async fn resume_session(&self, session_id: &str) -> Option<RuntimeSessionSnapshot> {
        let mut records = self.records.lock().await;
        let record = records.get_mut(session_id)?;
        record.updated_at_ms = now_ms();
        Some(RuntimeSessionSnapshot {
            session_id: record.session_id.clone(),
            state: record.state.clone(),
            created_at_ms: record.created_at_ms,
            updated_at_ms: record.updated_at_ms,
            last_error: record.last_error.clone(),
        })
    }

    pub async fn snapshot(&self, session_id: &str) -> Option<RuntimeSessionSnapshot> {
        let records = self.records.lock().await;
        records.get(session_id).map(|record| RuntimeSessionSnapshot {
            session_id: record.session_id.clone(),
            state: record.state.clone(),
            created_at_ms: record.created_at_ms,
            updated_at_ms: record.updated_at_ms,
            last_error: record.last_error.clone(),
        })
    }

    pub async fn list(&self) -> Vec<RuntimeSessionSnapshot> {
        let records = self.records.lock().await;
        let mut out: Vec<RuntimeSessionSnapshot> = records
            .values()
            .map(|record| RuntimeSessionSnapshot {
                session_id: record.session_id.clone(),
                state: record.state.clone(),
                created_at_ms: record.created_at_ms,
                updated_at_ms: record.updated_at_ms,
                last_error: record.last_error.clone(),
            })
            .collect();
        out.sort_by(|a, b| a.created_at_ms.cmp(&b.created_at_ms));
        out
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{sleep, Duration};

    #[tokio::test]
    async fn init_session_reuses_requested_identity() {
        let coordinator = SessionCoordinator::new();

        let first = coordinator.init_session(Some("approval-session-1")).await;
        let second = coordinator.init_session(Some("approval-session-1")).await;

        assert_eq!(first.session_id, "approval-session-1");
        assert_eq!(second.session_id, "approval-session-1");
        assert_eq!(first.created_at_ms, second.created_at_ms);
    }

    #[tokio::test]
    async fn resume_session_keeps_state_and_updates_timestamp() {
        let coordinator = SessionCoordinator::new();

        let init = coordinator.init_session(Some("approval-session-2")).await;
        let _ = coordinator
            .set_state("approval-session-2", RuntimeSessionState::Executing, None)
            .await
            .expect("session exists");

        sleep(Duration::from_millis(1)).await;

        let resumed = coordinator
            .resume_session("approval-session-2")
            .await
            .expect("session exists");

        assert!(matches!(resumed.state, RuntimeSessionState::Executing));
        assert_eq!(resumed.created_at_ms, init.created_at_ms);
        assert!(resumed.updated_at_ms >= init.updated_at_ms);
    }
}
