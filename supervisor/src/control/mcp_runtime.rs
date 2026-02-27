use std::collections::HashMap;
use std::path::PathBuf;

use crate::control::runtime::{
    RuntimeDispatchResult, RuntimeDispatcher, RuntimeDispatcherConfig, RuntimeError,
};

#[derive(Debug, Clone)]
pub struct McpSubprocessRuntimeConfig {
    pub command: String,
    pub args: Vec<String>,
    pub working_dir: Option<PathBuf>,
    pub env: HashMap<String, String>,
    pub runtime_enabled: bool,
    pub max_concurrency: usize,
    pub queue_limit: usize,
    pub queue_wait_timeout_ms: u64,
    pub per_session_inflight_limit: usize,
    pub default_timeout_ms: u64,
    pub enabled_wave_cohorts: Vec<String>,
    pub hard_stop_gate: bool,
}

pub struct McpSubprocessRuntime {
    dispatcher: RuntimeDispatcher,
}

impl McpSubprocessRuntime {
    pub fn new(cfg: McpSubprocessRuntimeConfig) -> Self {
        Self {
            dispatcher: RuntimeDispatcher::new(RuntimeDispatcherConfig {
                command: cfg.command,
                args: cfg.args,
                working_dir: cfg.working_dir,
                env: cfg.env,
                runtime_enabled: cfg.runtime_enabled,
                max_concurrency: cfg.max_concurrency,
                queue_limit: cfg.queue_limit,
                queue_wait_timeout_ms: cfg.queue_wait_timeout_ms,
                default_timeout_ms: cfg.default_timeout_ms,
                per_session_inflight_limit: cfg.per_session_inflight_limit,
                enabled_wave_cohorts: cfg.enabled_wave_cohorts,
                hard_stop_gate: cfg.hard_stop_gate,
            }),
        }
    }

    pub async fn execute(
        &self,
        payload: &serde_json::Value,
        timeout_ms: Option<u64>,
    ) -> Result<serde_json::Value, RuntimeError> {
        let RuntimeDispatchResult {
            session_id,
            state,
            data,
        } = self
            .dispatcher
            .dispatch(payload, timeout_ms)
            .await?;

        Ok(serde_json::json!({
            "session_id": session_id,
            "state": state,
            "result": data,
            "telemetry": self.dispatcher.telemetry_snapshot(),
        }))
    }

    pub async fn list_sessions(&self) -> serde_json::Value {
        let sessions = self.dispatcher.list_sessions().await;
        serde_json::json!(sessions)
    }

    pub fn is_enabled(&self) -> bool {
        self.dispatcher.runtime_enabled()
    }

    pub async fn set_policy(
        &self,
        enabled: Option<bool>,
        wave_cohorts: Option<Vec<String>>,
        hard_stop_gate: Option<bool>,
    ) -> serde_json::Value {
        self.dispatcher
            .set_policy(enabled, wave_cohorts, hard_stop_gate)
            .await
    }

    pub async fn cancel_session(&self, session_id: &str) -> anyhow::Result<serde_json::Value> {
        let session = self
            .dispatcher
            .cancel_session(session_id)
            .await
            .map_err(|e| anyhow::anyhow!(e.message()))?;
        Ok(serde_json::json!({ "session": session }))
    }

    pub fn telemetry_snapshot(&self) -> serde_json::Value {
        self.dispatcher.telemetry_snapshot()
    }
}
