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
