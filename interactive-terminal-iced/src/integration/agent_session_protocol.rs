use serde::{Deserialize, Serialize};
use std::collections::HashMap;

fn default_timeout() -> u64 {
    300
}

fn default_inject_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HostedSessionKind {
    AgentCliSession,
    AgentCliSpecialized,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentSessionState {
    Starting,
    Running,
    Stopping,
    Stopped,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StartAgentSessionRequest {
    pub id: String,
    pub session_kind: HostedSessionKind,
    pub session_id: String,
    #[serde(default)]
    pub runtime_session_id: String,
    pub command: String,
    pub working_directory: String,
    #[serde(default)]
    pub context: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub workspace_id: String,
    #[serde(default)]
    pub plan_id: String,
    #[serde(default)]
    pub agent_type: String,
    #[serde(default)]
    pub parent_session_id: String,
    #[serde(default)]
    pub owner_client_id: String,
    #[serde(default)]
    pub source_mode: String,
    #[serde(default)]
    pub prompt_payload: PromptPayload,
    #[serde(default)]
    pub stop_control: StopControl,
    #[serde(default = "default_timeout")]
    pub timeout_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StartAgentSessionResponse {
    pub id: String,
    pub session_kind: HostedSessionKind,
    pub session_id: String,
    pub runtime_session_id: String,
    pub state: AgentSessionState,
    pub accepted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback_used: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ScopeBoundaries {
    #[serde(default)]
    pub files_allowed: Vec<String>,
    #[serde(default)]
    pub directories_allowed: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct PromptPayload {
    #[serde(default)]
    pub enriched_prompt: String,
    #[serde(default)]
    pub scope_boundaries: ScopeBoundaries,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StopControl {
    #[serde(default)]
    pub escalation_level: u8,
    #[serde(default = "default_inject_enabled")]
    pub inject_enabled: bool,
}

impl Default for StopControl {
    fn default() -> Self {
        Self {
            escalation_level: 0,
            inject_enabled: true,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReadAgentSessionOutputRequest {
    pub id: String,
    pub session_kind: HostedSessionKind,
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReadAgentSessionOutputResponse {
    pub id: String,
    pub session_kind: HostedSessionKind,
    pub session_id: String,
    pub state: AgentSessionState,
    pub running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StopAgentSessionRequest {
    pub id: String,
    pub session_kind: HostedSessionKind,
    pub session_id: String,
    #[serde(default)]
    pub escalation_level: u8,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StopAgentSessionResponse {
    pub id: String,
    pub session_kind: HostedSessionKind,
    pub session_id: String,
    pub state: AgentSessionState,
    pub stop_escalation_level: u8,
    pub queued: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ListAgentSessionsRequest {
    pub id: String,
    pub session_kind: HostedSessionKind,
    #[serde(default)]
    pub status_filter: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GetAgentSessionRequest {
    pub id: String,
    pub session_kind: HostedSessionKind,
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentSessionRecord {
    pub session_id: String,
    pub runtime_session_id: String,
    pub session_kind: HostedSessionKind,
    pub state: AgentSessionState,
    pub stop_escalation_level: u8,
    pub running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ListAgentSessionsResponse {
    pub id: String,
    pub session_kind: HostedSessionKind,
    pub sessions: Vec<AgentSessionRecord>,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GetAgentSessionResponse {
    pub id: String,
    pub session_kind: HostedSessionKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<AgentSessionRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
