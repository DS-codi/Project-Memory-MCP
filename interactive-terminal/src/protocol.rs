use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub use crate::integration::agent_session_protocol::{
    AgentSessionRecord, AgentSessionState, GetAgentSessionRequest, GetAgentSessionResponse,
    HostedSessionKind, ListAgentSessionsRequest, ListAgentSessionsResponse,
    ReadAgentSessionOutputRequest,
    ReadAgentSessionOutputResponse, StartAgentSessionRequest, StartAgentSessionResponse,
    StopAgentSessionRequest, StopAgentSessionResponse,
};

/// Top-level message envelope, tagged by "type" field.
///
/// Wire format is newline-delimited JSON (NDJSON) over TCP.
/// Each variant is serialized with a `"type"` discriminator in snake_case.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Message {
    CommandRequest(CommandRequest),
    CommandResponse(CommandResponse),
    OutputChunk(OutputChunk),
    StartAgentSessionRequest(StartAgentSessionRequest),
    StartAgentSessionResponse(StartAgentSessionResponse),
    ReadAgentSessionOutputRequest(ReadAgentSessionOutputRequest),
    ReadAgentSessionOutputResponse(ReadAgentSessionOutputResponse),
    StopAgentSessionRequest(StopAgentSessionRequest),
    StopAgentSessionResponse(StopAgentSessionResponse),
    ListAgentSessionsRequest(ListAgentSessionsRequest),
    ListAgentSessionsResponse(ListAgentSessionsResponse),
    GetAgentSessionRequest(GetAgentSessionRequest),
    GetAgentSessionResponse(GetAgentSessionResponse),
    SavedCommandsRequest(SavedCommandsRequest),
    SavedCommandsResponse(SavedCommandsResponse),
    Heartbeat(Heartbeat),
    ReadOutputRequest(ReadOutputRequest),
    ReadOutputResponse(ReadOutputResponse),
    KillSessionRequest(KillSessionRequest),
    KillSessionResponse(KillSessionResponse),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SavedCommandsAction {
    #[serde(alias = "save_saved_command")]
    Save,
    #[serde(alias = "list_saved_commands")]
    List,
    #[serde(alias = "delete_saved_command")]
    Delete,
    #[serde(alias = "use_saved_command")]
    Use,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SavedCommandRecord {
    pub id: String,
    pub name: String,
    pub command: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub last_used_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SavedCommandsRequest {
    pub id: String,
    pub action: SavedCommandsAction,
    pub workspace_id: String,
    #[serde(default)]
    pub command_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SavedCommandsResponse {
    pub id: String,
    pub action: SavedCommandsAction,
    pub workspace_id: String,
    pub success: bool,
    #[serde(default)]
    pub commands: Vec<SavedCommandRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command_entry: Option<SavedCommandRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub targeted_session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// MCP server → GUI: request approval for a command.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CommandRequest {
    pub id: String,
    pub command: String,
    pub working_directory: String,
    #[serde(default)]
    pub context: String,
    #[serde(default = "default_session_id")]
    pub session_id: String,
    #[serde(default)]
    pub terminal_profile: TerminalProfile,
    #[serde(default)]
    pub workspace_path: String,
    #[serde(default)]
    pub venv_path: String,
    #[serde(default)]
    pub activate_venv: bool,
    #[serde(default = "default_timeout")]
    pub timeout_seconds: u64,
    /// Optional argument list (unified protocol addition).
    #[serde(default)]
    pub args: Vec<String>,
    /// Optional environment variables (unified protocol addition).
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// Workspace ID for output-file scoping (unified protocol addition).
    #[serde(default)]
    pub workspace_id: String,
    /// Whether the command was pre-approved by the MCP allowlist.
    /// true → GUI auto-executes; false → GUI shows approval dialog.
    #[serde(default)]
    pub allowlisted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TerminalProfile {
    PowerShell,
    Pwsh,
    Cmd,
    Bash,
    #[default]
    System,
}

fn default_session_id() -> String {
    "default".to_string()
}

fn default_timeout() -> u64 {
    300
}

/// Response status for a command approval/decline/timeout.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ResponseStatus {
    Approved,
    Declined,
    /// MCP timeout — user did not respond within the timeout window.
    Timeout,
}

/// GUI → MCP server: approval/decline result.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CommandResponse {
    pub id: String,
    pub status: ResponseStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Path to JSON output file (unified protocol addition).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_file_path: Option<String>,
}

/// GUI → MCP server: streaming output chunk for an active command.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OutputChunk {
    pub id: String,
    pub chunk: String,
}

/// MCP server → GUI: request the captured output for a completed/running session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReadOutputRequest {
    pub id: String,
    pub session_id: String,
}

/// GUI → MCP server: captured output for a session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReadOutputResponse {
    pub id: String,
    pub session_id: String,
    pub running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub truncated: bool,
}

/// MCP server → GUI: request to kill an active session/process.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KillSessionRequest {
    pub id: String,
    pub session_id: String,
}

/// GUI → MCP server: result of a kill request.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KillSessionResponse {
    pub id: String,
    pub session_id: String,
    pub killed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Bidirectional heartbeat for liveness detection.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Heartbeat {
    /// Unique heartbeat ID (unified protocol addition).
    #[serde(default)]
    pub id: String,
    /// Legacy ISO-8601 timestamp — kept for backward compatibility.
    #[serde(default)]
    pub timestamp: String,
    /// Epoch milliseconds (unified protocol addition).
    #[serde(default)]
    pub timestamp_ms: u64,
}

// ---------------------------------------------------------------------------
// NDJSON framing
// ---------------------------------------------------------------------------

/// Encode a message as NDJSON (JSON + newline).
pub fn encode(msg: &Message) -> Result<String, serde_json::Error> {
    let mut json = serde_json::to_string(msg)?;
    json.push('\n');
    Ok(json)
}

/// Decode a single line of NDJSON into a [`Message`].
pub fn decode(line: &str) -> Result<Message, serde_json::Error> {
    serde_json::from_str(line.trim_end())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- helpers ----------------------------------------------------------

    fn sample_request() -> CommandRequest {
        CommandRequest {
            id: "req-001".into(),
            command: "cargo build".into(),
            working_directory: "/home/user/project".into(),
            context: "Building the project".into(),
            session_id: "default".into(),
            terminal_profile: TerminalProfile::System,
            workspace_path: "/home/user/project".into(),
            venv_path: String::new(),
            activate_venv: false,
            timeout_seconds: 120,
            args: vec!["--release".into()],
            env: HashMap::from([("RUST_LOG".into(), "debug".into())]),
            workspace_id: "project-memory-mcp-50e04147a402".into(),
            allowlisted: true,
        }
    }

    fn sample_approved_response() -> CommandResponse {
        CommandResponse {
            id: "req-001".into(),
            status: ResponseStatus::Approved,
            output: Some("Compiling...done".into()),
            exit_code: Some(0),
            reason: None,
            output_file_path: Some("/tmp/output.json".into()),
        }
    }

    fn sample_declined_response() -> CommandResponse {
        CommandResponse {
            id: "req-002".into(),
            status: ResponseStatus::Declined,
            output: None,
            exit_code: None,
            reason: Some("Command looks dangerous".into()),
            output_file_path: None,
        }
    }

    fn sample_heartbeat() -> Heartbeat {
        Heartbeat {
            id: "hb-001".into(),
            timestamp: "2026-02-14T00:00:00Z".into(),
            timestamp_ms: 1771020000000,
        }
    }

    fn sample_saved_record() -> SavedCommandRecord {
        SavedCommandRecord {
            id: "cmd-1".into(),
            name: "Build".into(),
            command: "npm run build".into(),
            created_at: "2026-02-15T00:00:00Z".into(),
            updated_at: "2026-02-15T00:00:00Z".into(),
            last_used_at: None,
        }
    }

    fn sample_saved_commands_request() -> SavedCommandsRequest {
        SavedCommandsRequest {
            id: "saved-001".into(),
            action: SavedCommandsAction::List,
            workspace_id: "project-memory-mcp-40f6678f5a9b".into(),
            command_id: String::new(),
            name: String::new(),
            command: String::new(),
            session_id: String::new(),
        }
    }

    fn sample_saved_commands_response() -> SavedCommandsResponse {
        SavedCommandsResponse {
            id: "saved-001".into(),
            action: SavedCommandsAction::List,
            workspace_id: "project-memory-mcp-40f6678f5a9b".into(),
            success: true,
            commands: vec![sample_saved_record()],
            command_entry: None,
            targeted_session_id: None,
            error: None,
        }
    }

    fn sample_read_output_request() -> ReadOutputRequest {
        ReadOutputRequest {
            id: "ro-001".into(),
            session_id: "sess-abc".into(),
        }
    }

    fn sample_read_output_response() -> ReadOutputResponse {
        ReadOutputResponse {
            id: "ro-001".into(),
            session_id: "sess-abc".into(),
            running: false,
            exit_code: Some(0),
            stdout: "hello world\n".into(),
            stderr: String::new(),
            truncated: false,
        }
    }

    fn sample_kill_session_request() -> KillSessionRequest {
        KillSessionRequest {
            id: "kill-001".into(),
            session_id: "sess-abc".into(),
        }
    }

    fn sample_kill_session_response() -> KillSessionResponse {
        KillSessionResponse {
            id: "kill-001".into(),
            session_id: "sess-abc".into(),
            killed: true,
            message: Some("Process terminated".into()),
            error: None,
        }
    }

    // -- round-trip tests -------------------------------------------------

    #[test]
    fn roundtrip_command_request() {
        let msg = Message::CommandRequest(sample_request());
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn roundtrip_command_response_approved() {
        let msg = Message::CommandResponse(sample_approved_response());
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn roundtrip_command_response_declined() {
        let msg = Message::CommandResponse(sample_declined_response());
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn roundtrip_heartbeat() {
        let msg = Message::Heartbeat(sample_heartbeat());
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn roundtrip_saved_commands_request() {
        let msg = Message::SavedCommandsRequest(sample_saved_commands_request());
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn roundtrip_saved_commands_response() {
        let msg = Message::SavedCommandsResponse(sample_saved_commands_response());
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn roundtrip_read_output_request() {
        let msg = Message::ReadOutputRequest(sample_read_output_request());
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn roundtrip_read_output_response() {
        let msg = Message::ReadOutputResponse(sample_read_output_response());
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn roundtrip_read_output_response_running() {
        let msg = Message::ReadOutputResponse(ReadOutputResponse {
            id: "ro-002".into(),
            session_id: "sess-running".into(),
            running: true,
            exit_code: None,
            stdout: "partial output...".into(),
            stderr: "warning: something\n".into(),
            truncated: true,
        });
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn roundtrip_kill_session_request() {
        let msg = Message::KillSessionRequest(sample_kill_session_request());
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn roundtrip_kill_session_response() {
        let msg = Message::KillSessionResponse(sample_kill_session_response());
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn roundtrip_kill_session_response_not_found() {
        let msg = Message::KillSessionResponse(KillSessionResponse {
            id: "kill-002".into(),
            session_id: "sess-unknown".into(),
            killed: false,
            message: None,
            error: Some("Session not found".into()),
        });
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    // -- JSON type tag tests ----------------------------------------------

    #[test]
    fn json_has_correct_type_tag_command_request() {
        let msg = Message::CommandRequest(sample_request());
        let val: serde_json::Value = serde_json::to_value(&msg).unwrap();
        assert_eq!(val["type"], "command_request");
    }

    #[test]
    fn json_has_correct_type_tag_command_response() {
        let msg = Message::CommandResponse(sample_approved_response());
        let val: serde_json::Value = serde_json::to_value(&msg).unwrap();
        assert_eq!(val["type"], "command_response");
    }

    #[test]
    fn json_has_correct_type_tag_heartbeat() {
        let msg = Message::Heartbeat(sample_heartbeat());
        let val: serde_json::Value = serde_json::to_value(&msg).unwrap();
        assert_eq!(val["type"], "heartbeat");
    }

    #[test]
    fn json_has_correct_type_tag_saved_commands_request() {
        let msg = Message::SavedCommandsRequest(sample_saved_commands_request());
        let val: serde_json::Value = serde_json::to_value(&msg).unwrap();
        assert_eq!(val["type"], "saved_commands_request");
    }

    #[test]
    fn json_has_correct_type_tag_read_output_request() {
        let msg = Message::ReadOutputRequest(sample_read_output_request());
        let val: serde_json::Value = serde_json::to_value(&msg).unwrap();
        assert_eq!(val["type"], "read_output_request");
    }

    #[test]
    fn json_has_correct_type_tag_read_output_response() {
        let msg = Message::ReadOutputResponse(sample_read_output_response());
        let val: serde_json::Value = serde_json::to_value(&msg).unwrap();
        assert_eq!(val["type"], "read_output_response");
    }

    #[test]
    fn json_has_correct_type_tag_kill_session_request() {
        let msg = Message::KillSessionRequest(sample_kill_session_request());
        let val: serde_json::Value = serde_json::to_value(&msg).unwrap();
        assert_eq!(val["type"], "kill_session_request");
    }

    #[test]
    fn json_has_correct_type_tag_kill_session_response() {
        let msg = Message::KillSessionResponse(sample_kill_session_response());
        let val: serde_json::Value = serde_json::to_value(&msg).unwrap();
        assert_eq!(val["type"], "kill_session_response");
    }

    #[test]
    fn saved_commands_action_alias_deserializes() {
        let json = r#"{"type":"saved_commands_request","id":"saved-002","action":"save_saved_command","workspace_id":"project-memory-mcp-40f6678f5a9b"}"#;
        let msg: Message = serde_json::from_str(json).unwrap();
        if let Message::SavedCommandsRequest(req) = msg {
            assert_eq!(req.action, SavedCommandsAction::Save);
        } else {
            panic!("expected SavedCommandsRequest");
        }
    }

    // -- status enum serialisation ----------------------------------------

    #[test]
    fn response_status_approved_snake_case() {
        let val = serde_json::to_value(ResponseStatus::Approved).unwrap();
        assert_eq!(val, "approved");
    }

    #[test]
    fn response_status_declined_snake_case() {
        let val = serde_json::to_value(ResponseStatus::Declined).unwrap();
        assert_eq!(val, "declined");
    }

    #[test]
    fn response_status_timeout_snake_case() {
        let val = serde_json::to_value(ResponseStatus::Timeout).unwrap();
        assert_eq!(val, "timeout");
    }

    #[test]
    fn roundtrip_timeout_response() {
        let resp = CommandResponse {
            id: "req-timeout".into(),
            status: ResponseStatus::Timeout,
            output: Some("partial output".into()),
            exit_code: None,
            reason: Some("User did not respond within 50s".into()),
            output_file_path: Some("/tmp/partial.json".into()),
        };
        let msg = Message::CommandResponse(resp);
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn timeout_status_deserializes_from_json() {
        let json =
            r#"{"type":"command_response","id":"t1","status":"timeout","reason":"timed out"}"#;
        let msg: Message = serde_json::from_str(json).unwrap();
        if let Message::CommandResponse(resp) = msg {
            assert_eq!(resp.status, ResponseStatus::Timeout);
            assert_eq!(resp.reason.as_deref(), Some("timed out"));
        } else {
            panic!("expected CommandResponse");
        }
    }

    #[test]
    fn heartbeat_new_fields_roundtrip() {
        let hb = Heartbeat {
            id: "hb-rt".into(),
            timestamp: String::new(),
            timestamp_ms: 1700000000000,
        };
        let msg = Message::Heartbeat(hb);
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn heartbeat_defaults_when_fields_missing() {
        let json = r#"{"type":"heartbeat"}"#;
        let msg: Message = serde_json::from_str(json).unwrap();
        if let Message::Heartbeat(hb) = msg {
            assert_eq!(hb.id, "");
            assert_eq!(hb.timestamp, "");
            assert_eq!(hb.timestamp_ms, 0);
        } else {
            panic!("expected Heartbeat");
        }
    }

    #[test]
    fn command_request_new_fields_roundtrip() {
        let req = CommandRequest {
            id: "new-fields".into(),
            command: "npm test".into(),
            working_directory: "/app".into(),
            context: String::new(),
            session_id: "default".into(),
            terminal_profile: TerminalProfile::System,
            workspace_path: String::new(),
            venv_path: String::new(),
            activate_venv: false,
            timeout_seconds: 60,
            args: vec!["--watch".into(), "--coverage".into()],
            env: HashMap::from([("NODE_ENV".into(), "test".into())]),
            workspace_id: "my-workspace-abc123".into(),
            allowlisted: false,
        };
        let msg = Message::CommandRequest(req);
        let encoded = encode(&msg).unwrap();
        let decoded = decode(&encoded).unwrap();
        assert_eq!(msg, decoded);
    }

    // -- optional field handling ------------------------------------------

    #[test]
    fn approved_response_skips_none_fields() {
        let resp = CommandResponse {
            id: "req-003".into(),
            status: ResponseStatus::Approved,
            output: None,
            exit_code: None,
            reason: None,
            output_file_path: None,
        };
        let msg = Message::CommandResponse(resp);
        let json = serde_json::to_string(&msg).unwrap();
        assert!(!json.contains("\"output\""));
        assert!(!json.contains("\"exit_code\""));
        assert!(!json.contains("\"reason\""));
        assert!(!json.contains("\"output_file_path\""));
    }

    #[test]
    fn missing_optional_fields_deserialize_to_none() {
        let json = r#"{"type":"command_response","id":"r1","status":"approved"}"#;
        let msg: Message = serde_json::from_str(json).unwrap();
        if let Message::CommandResponse(resp) = msg {
            assert!(resp.output.is_none());
            assert!(resp.exit_code.is_none());
            assert!(resp.reason.is_none());
            assert!(resp.output_file_path.is_none());
        } else {
            panic!("expected CommandResponse");
        }
    }

    #[test]
    fn default_timeout_when_missing() {
        let json =
            r#"{"type":"command_request","id":"r1","command":"ls","working_directory":"/tmp"}"#;
        let msg: Message = serde_json::from_str(json).unwrap();
        if let Message::CommandRequest(req) = msg {
            assert_eq!(req.timeout_seconds, 300);
            assert_eq!(req.context, ""); // default empty string
            assert_eq!(req.session_id, "default");
            assert_eq!(req.terminal_profile, TerminalProfile::System);
            assert_eq!(req.workspace_path, "");
            assert_eq!(req.venv_path, "");
            assert!(!req.activate_venv);
            // Unified protocol new-field defaults
            assert!(req.args.is_empty());
            assert!(req.env.is_empty());
            assert_eq!(req.workspace_id, "");
            assert!(!req.allowlisted);
        } else {
            panic!("expected CommandRequest");
        }
    }

    // -- edge cases -------------------------------------------------------

    #[test]
    fn empty_command() {
        let req = CommandRequest {
            id: "e1".into(),
            command: String::new(),
            working_directory: "/tmp".into(),
            context: String::new(),
            session_id: "default".into(),
            terminal_profile: TerminalProfile::System,
            workspace_path: String::new(),
            venv_path: String::new(),
            activate_venv: false,
            timeout_seconds: 60,
            args: vec![],
            env: HashMap::new(),
            workspace_id: String::new(),
            allowlisted: false,
        };
        let msg = Message::CommandRequest(req);
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn terminal_profile_serialization_is_snake_case() {
        let val = serde_json::to_value(TerminalProfile::PowerShell).unwrap();
        assert_eq!(val, "power_shell");
    }

    #[test]
    fn special_chars_in_reason() {
        let resp = CommandResponse {
            id: "e2".into(),
            status: ResponseStatus::Declined,
            output: None,
            exit_code: None,
            reason: Some(
                "reason with \"quotes\", newlines\nand\ttabs, and unicode: ñ 中文 🎉".into(),
            ),
            output_file_path: None,
        };
        let msg = Message::CommandResponse(resp);
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn very_long_output() {
        let long_output = "x".repeat(100_000);
        let resp = CommandResponse {
            id: "e3".into(),
            status: ResponseStatus::Approved,
            output: Some(long_output.clone()),
            exit_code: Some(0),
            reason: None,
            output_file_path: None,
        };
        let msg = Message::CommandResponse(resp);
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: Message = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, decoded);
    }

    // -- encode / decode framing ------------------------------------------

    #[test]
    fn encode_appends_newline() {
        let msg = Message::Heartbeat(sample_heartbeat());
        let encoded = encode(&msg).unwrap();
        assert!(encoded.ends_with('\n'));
        assert_eq!(encoded.matches('\n').count(), 1);
    }

    #[test]
    fn decode_trims_trailing_newline() {
        let msg = Message::Heartbeat(sample_heartbeat());
        let encoded = encode(&msg).unwrap();
        // encoded still has the trailing '\n'
        let decoded = decode(&encoded).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn encode_decode_roundtrip_command_request() {
        let msg = Message::CommandRequest(sample_request());
        let encoded = encode(&msg).unwrap();
        let decoded = decode(&encoded).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn encode_decode_roundtrip_command_response() {
        let msg = Message::CommandResponse(sample_approved_response());
        let encoded = encode(&msg).unwrap();
        let decoded = decode(&encoded).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn encode_decode_roundtrip_heartbeat() {
        let msg = Message::Heartbeat(sample_heartbeat());
        let encoded = encode(&msg).unwrap();
        let decoded = decode(&encoded).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn encode_decode_roundtrip_saved_commands_response() {
        let msg = Message::SavedCommandsResponse(sample_saved_commands_response());
        let encoded = encode(&msg).unwrap();
        let decoded = decode(&encoded).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn encode_decode_roundtrip_read_output_request() {
        let msg = Message::ReadOutputRequest(sample_read_output_request());
        let encoded = encode(&msg).unwrap();
        let decoded = decode(&encoded).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn encode_decode_roundtrip_read_output_response() {
        let msg = Message::ReadOutputResponse(sample_read_output_response());
        let encoded = encode(&msg).unwrap();
        let decoded = decode(&encoded).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn encode_decode_roundtrip_kill_session_request() {
        let msg = Message::KillSessionRequest(sample_kill_session_request());
        let encoded = encode(&msg).unwrap();
        let decoded = decode(&encoded).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn encode_decode_roundtrip_kill_session_response() {
        let msg = Message::KillSessionResponse(sample_kill_session_response());
        let encoded = encode(&msg).unwrap();
        let decoded = decode(&encoded).unwrap();
        assert_eq!(msg, decoded);
    }

    #[test]
    fn decode_invalid_json_returns_error() {
        let result = decode("not valid json");
        assert!(result.is_err());
    }

    #[test]
    fn decode_unknown_type_returns_error() {
        let json = r#"{"type":"unknown_variant","id":"u1"}"#;
        let result = decode(json);
        assert!(result.is_err());
    }

    // =================================================================
    // Cross-language protocol conformance tests
    //
    // These JSON strings are CHARACTER-FOR-CHARACTER identical to the
    // fixtures in server/src/__tests__/tools/shared-protocol-fixtures.json.
    // Both sides must decode them identically.
    // =================================================================

    // -- CommandRequest conformance ------------------------------------

    #[test]
    fn conformance_command_request_minimal() {
        let json = r#"{"type":"command_request","id":"test-req-minimal","command":"echo hello","working_directory":"/tmp"}"#;
        let msg = decode(json).expect("should decode minimal command_request");
        if let Message::CommandRequest(req) = msg {
            assert_eq!(req.id, "test-req-minimal");
            assert_eq!(req.command, "echo hello");
            assert_eq!(req.working_directory, "/tmp");
            // Rust defaults for missing optional fields
            assert!(req.args.is_empty());
            assert!(req.env.is_empty());
            assert_eq!(req.workspace_id, "");
            assert_eq!(req.session_id, "default");
            assert_eq!(req.timeout_seconds, 300);
            assert!(!req.allowlisted);
        } else {
            panic!("expected CommandRequest");
        }
    }

    #[test]
    fn conformance_command_request_full() {
        let json = r#"{"type":"command_request","id":"test-req-full","command":"npm run build","working_directory":"/home/user/project","args":["--production"],"env":{"NODE_ENV":"production"},"workspace_id":"my-project-abc123","session_id":"sess-001","timeout_seconds":120,"allowlisted":true}"#;
        let msg = decode(json).expect("should decode full command_request");
        if let Message::CommandRequest(req) = msg {
            assert_eq!(req.id, "test-req-full");
            assert_eq!(req.command, "npm run build");
            assert_eq!(req.working_directory, "/home/user/project");
            assert_eq!(req.args, vec!["--production"]);
            assert_eq!(
                req.env.get("NODE_ENV").map(|s| s.as_str()),
                Some("production")
            );
            assert_eq!(req.workspace_id, "my-project-abc123");
            assert_eq!(req.session_id, "sess-001");
            assert_eq!(req.timeout_seconds, 120);
            assert!(req.allowlisted);
        } else {
            panic!("expected CommandRequest");
        }
    }

    #[test]
    fn conformance_command_request_empty_arrays() {
        let json = r#"{"type":"command_request","id":"test-req-empty-arrays","command":"ls -la","working_directory":"/home/user","args":[],"env":{},"allowlisted":false}"#;
        let msg = decode(json).expect("should decode command_request with empty arrays");
        if let Message::CommandRequest(req) = msg {
            assert_eq!(req.id, "test-req-empty-arrays");
            assert_eq!(req.command, "ls -la");
            assert_eq!(req.working_directory, "/home/user");
            assert!(req.args.is_empty());
            assert!(req.env.is_empty());
            assert!(!req.allowlisted);
        } else {
            panic!("expected CommandRequest");
        }
    }

    // -- CommandResponse conformance -----------------------------------

    #[test]
    fn conformance_command_response_approved() {
        let json = r#"{"type":"command_response","id":"test-resp-approved","status":"approved","output":"Build succeeded\nDone in 3.2s","exit_code":0,"output_file_path":"/tmp/.projectmemory/terminal-output/output-001.json"}"#;
        let msg = decode(json).expect("should decode approved command_response");
        if let Message::CommandResponse(resp) = msg {
            assert_eq!(resp.id, "test-resp-approved");
            assert_eq!(resp.status, ResponseStatus::Approved);
            assert_eq!(
                resp.output.as_deref(),
                Some("Build succeeded\nDone in 3.2s")
            );
            assert_eq!(resp.exit_code, Some(0));
            assert!(resp.reason.is_none());
            assert_eq!(
                resp.output_file_path.as_deref(),
                Some("/tmp/.projectmemory/terminal-output/output-001.json")
            );
        } else {
            panic!("expected CommandResponse");
        }
    }

    #[test]
    fn conformance_command_response_declined() {
        let json = r#"{"type":"command_response","id":"test-resp-declined","status":"declined","reason":"Command not on allowlist"}"#;
        let msg = decode(json).expect("should decode declined command_response");
        if let Message::CommandResponse(resp) = msg {
            assert_eq!(resp.id, "test-resp-declined");
            assert_eq!(resp.status, ResponseStatus::Declined);
            assert!(resp.output.is_none());
            assert!(resp.exit_code.is_none());
            assert_eq!(resp.reason.as_deref(), Some("Command not on allowlist"));
            assert!(resp.output_file_path.is_none());
        } else {
            panic!("expected CommandResponse");
        }
    }

    #[test]
    fn conformance_command_response_timeout() {
        let json = r#"{"type":"command_response","id":"test-resp-timeout","status":"timeout","output":"partial output before timeout","reason":"User did not respond within 60s","output_file_path":"/tmp/.projectmemory/terminal-output/partial-002.json"}"#;
        let msg = decode(json).expect("should decode timeout command_response");
        if let Message::CommandResponse(resp) = msg {
            assert_eq!(resp.id, "test-resp-timeout");
            assert_eq!(resp.status, ResponseStatus::Timeout);
            assert_eq!(
                resp.output.as_deref(),
                Some("partial output before timeout")
            );
            assert_eq!(
                resp.reason.as_deref(),
                Some("User did not respond within 60s")
            );
            assert_eq!(
                resp.output_file_path.as_deref(),
                Some("/tmp/.projectmemory/terminal-output/partial-002.json")
            );
        } else {
            panic!("expected CommandResponse");
        }
    }

    #[test]
    fn conformance_command_response_minimal() {
        let json = r#"{"type":"command_response","id":"test-resp-minimal","status":"approved"}"#;
        let msg = decode(json).expect("should decode minimal command_response");
        if let Message::CommandResponse(resp) = msg {
            assert_eq!(resp.id, "test-resp-minimal");
            assert_eq!(resp.status, ResponseStatus::Approved);
            assert!(resp.output.is_none());
            assert!(resp.exit_code.is_none());
            assert!(resp.reason.is_none());
            assert!(resp.output_file_path.is_none());
        } else {
            panic!("expected CommandResponse");
        }
    }

    #[test]
    fn conformance_command_response_null_exit_code() {
        let json = r#"{"type":"command_response","id":"test-resp-null-exit","status":"approved","output":"killed","exit_code":null}"#;
        let msg = decode(json).expect("should decode command_response with null exit_code");
        if let Message::CommandResponse(resp) = msg {
            assert_eq!(resp.id, "test-resp-null-exit");
            assert_eq!(resp.status, ResponseStatus::Approved);
            assert_eq!(resp.output.as_deref(), Some("killed"));
            assert!(resp.exit_code.is_none());
        } else {
            panic!("expected CommandResponse");
        }
    }

    // -- Heartbeat conformance -----------------------------------------

    #[test]
    fn conformance_heartbeat_standard() {
        let json = r#"{"type":"heartbeat","id":"hb-001","timestamp_ms":1771020000000}"#;
        let msg = decode(json).expect("should decode standard heartbeat");
        if let Message::Heartbeat(hb) = msg {
            assert_eq!(hb.id, "hb-001");
            assert_eq!(hb.timestamp_ms, 1771020000000);
        } else {
            panic!("expected Heartbeat");
        }
    }

    #[test]
    fn conformance_heartbeat_zero_timestamp() {
        let json = r#"{"type":"heartbeat","id":"hb-zero","timestamp_ms":0}"#;
        let msg = decode(json).expect("should decode heartbeat with zero timestamp");
        if let Message::Heartbeat(hb) = msg {
            assert_eq!(hb.id, "hb-zero");
            assert_eq!(hb.timestamp_ms, 0);
        } else {
            panic!("expected Heartbeat");
        }
    }

    // -- ReadOutputRequest/Response conformance -------------------------

    #[test]
    fn conformance_read_output_request() {
        let json =
            r#"{"type":"read_output_request","id":"ro-conf-001","session_id":"sess-conf-abc"}"#;
        let msg = decode(json).expect("should decode read_output_request");
        if let Message::ReadOutputRequest(req) = msg {
            assert_eq!(req.id, "ro-conf-001");
            assert_eq!(req.session_id, "sess-conf-abc");
        } else {
            panic!("expected ReadOutputRequest");
        }
    }

    #[test]
    fn conformance_read_output_response_completed() {
        let json = r#"{"type":"read_output_response","id":"ro-conf-001","session_id":"sess-conf-abc","running":false,"exit_code":0,"stdout":"hello world\n","stderr":"","truncated":false}"#;
        let msg = decode(json).expect("should decode completed read_output_response");
        if let Message::ReadOutputResponse(resp) = msg {
            assert_eq!(resp.id, "ro-conf-001");
            assert_eq!(resp.session_id, "sess-conf-abc");
            assert!(!resp.running);
            assert_eq!(resp.exit_code, Some(0));
            assert_eq!(resp.stdout, "hello world\n");
            assert_eq!(resp.stderr, "");
            assert!(!resp.truncated);
        } else {
            panic!("expected ReadOutputResponse");
        }
    }

    #[test]
    fn conformance_read_output_response_running() {
        let json = r#"{"type":"read_output_response","id":"ro-conf-002","session_id":"sess-running","running":true,"stdout":"partial...","stderr":"warn","truncated":true}"#;
        let msg = decode(json).expect("should decode running read_output_response");
        if let Message::ReadOutputResponse(resp) = msg {
            assert_eq!(resp.id, "ro-conf-002");
            assert!(resp.running);
            assert!(resp.exit_code.is_none());
            assert!(resp.truncated);
        } else {
            panic!("expected ReadOutputResponse");
        }
    }

    // -- KillSessionRequest/Response conformance ------------------------

    #[test]
    fn conformance_kill_session_request() {
        let json =
            r#"{"type":"kill_session_request","id":"kill-conf-001","session_id":"sess-kill-abc"}"#;
        let msg = decode(json).expect("should decode kill_session_request");
        if let Message::KillSessionRequest(req) = msg {
            assert_eq!(req.id, "kill-conf-001");
            assert_eq!(req.session_id, "sess-kill-abc");
        } else {
            panic!("expected KillSessionRequest");
        }
    }

    #[test]
    fn conformance_kill_session_response_killed() {
        let json = r#"{"type":"kill_session_response","id":"kill-conf-001","session_id":"sess-kill-abc","killed":true,"message":"Process terminated"}"#;
        let msg = decode(json).expect("should decode killed kill_session_response");
        if let Message::KillSessionResponse(resp) = msg {
            assert_eq!(resp.id, "kill-conf-001");
            assert!(resp.killed);
            assert_eq!(resp.message.as_deref(), Some("Process terminated"));
            assert!(resp.error.is_none());
        } else {
            panic!("expected KillSessionResponse");
        }
    }

    #[test]
    fn conformance_kill_session_response_not_found() {
        let json = r#"{"type":"kill_session_response","id":"kill-conf-002","session_id":"sess-unknown","killed":false,"error":"Session not found"}"#;
        let msg = decode(json).expect("should decode not-found kill_session_response");
        if let Message::KillSessionResponse(resp) = msg {
            assert_eq!(resp.id, "kill-conf-002");
            assert!(!resp.killed);
            assert!(resp.message.is_none());
            assert_eq!(resp.error.as_deref(), Some("Session not found"));
        } else {
            panic!("expected KillSessionResponse");
        }
    }

    #[test]
    fn read_output_response_skips_none_exit_code() {
        let resp = ReadOutputResponse {
            id: "ro-skip".into(),
            session_id: "sess-skip".into(),
            running: true,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            truncated: false,
        };
        let msg = Message::ReadOutputResponse(resp);
        let json = serde_json::to_string(&msg).unwrap();
        assert!(!json.contains("\"exit_code\""));
    }

    #[test]
    fn kill_session_response_skips_none_fields() {
        let resp = KillSessionResponse {
            id: "kill-skip".into(),
            session_id: "sess-skip".into(),
            killed: true,
            message: None,
            error: None,
        };
        let msg = Message::KillSessionResponse(resp);
        let json = serde_json::to_string(&msg).unwrap();
        assert!(!json.contains("\"message\""));
        assert!(!json.contains("\"error\""));
    }
}
