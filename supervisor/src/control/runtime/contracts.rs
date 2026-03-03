use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeDispatchMode {
    Init,
    Execute,
    Cancel,
    Complete,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeSessionState {
    Initialized,
    Executing,
    Cancelling,
    Completed,
    Failed,
    TimedOut,
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeSessionSnapshot {
    pub session_id: String,
    pub state: RuntimeSessionState,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeDispatchResult {
    pub session_id: String,
    pub state: RuntimeSessionState,
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryFailureDomain {
    ChildLocal,
    DependencyGroup,
    Global,
}

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeRestartPolicyContract {
    pub max_attempts: u32,
    pub initial_backoff_ms: u64,
    pub max_backoff_ms: u64,
    pub multiplier: f64,
    pub jitter_ratio: f64,
    pub cooldown_after_attempts: u32,
    pub cooldown_child_local_ms: u64,
    pub cooldown_dependency_group_ms: u64,
    pub cooldown_global_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeStopStartPolicyContract {
    pub stop_idempotent: bool,
    pub stop_wait_for_child_exit_ms: u64,
    pub orphan_child_reap_required: bool,
    pub start_requires_clean_pid_set: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeReconnectChoreographyContract {
    pub invalidate_stale_session_first: bool,
    pub require_dependency_gate_pass: bool,
    pub require_readiness_gate_pass: bool,
    pub reconnect_order: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeSafetyEscalationContract {
    pub degrade_after_max_attempts: bool,
    pub degrade_after_timeout_ms: u64,
    pub operator_alert_required: bool,
    pub alert_reason_code: String,
}
