use serde::{Deserialize, Serialize};

/// Top-level message envelope, tagged by "type" field.
///
/// Wire format is newline-delimited JSON (NDJSON) over TCP.
/// Each variant is serialized with a `"type"` discriminator in snake_case.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Message {
    CommandRequest(CommandRequest),
    CommandResponse(CommandResponse),
    SavedCommandsRequest(SavedCommandsRequest),
    SavedCommandsResponse(SavedCommandsResponse),
    Heartbeat(Heartbeat),
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

/// Response status for a command approval/decline.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ResponseStatus {
    Approved,
    Declined,
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
}

/// Bidirectional heartbeat for liveness detection.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Heartbeat {
    pub timestamp: String,
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
        }
    }

    fn sample_approved_response() -> CommandResponse {
        CommandResponse {
            id: "req-001".into(),
            status: ResponseStatus::Approved,
            output: Some("Compiling...done".into()),
            exit_code: Some(0),
            reason: None,
        }
    }

    fn sample_declined_response() -> CommandResponse {
        CommandResponse {
            id: "req-002".into(),
            status: ResponseStatus::Declined,
            output: None,
            exit_code: None,
            reason: Some("Command looks dangerous".into()),
        }
    }

    fn sample_heartbeat() -> Heartbeat {
        Heartbeat {
            timestamp: "2026-02-14T00:00:00Z".into(),
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

    // -- optional field handling ------------------------------------------

    #[test]
    fn approved_response_skips_none_fields() {
        let resp = CommandResponse {
            id: "req-003".into(),
            status: ResponseStatus::Approved,
            output: None,
            exit_code: None,
            reason: None,
        };
        let msg = Message::CommandResponse(resp);
        let json = serde_json::to_string(&msg).unwrap();
        assert!(!json.contains("\"output\""));
        assert!(!json.contains("\"exit_code\""));
        assert!(!json.contains("\"reason\""));
    }

    #[test]
    fn missing_optional_fields_deserialize_to_none() {
        let json = r#"{"type":"command_response","id":"r1","status":"approved"}"#;
        let msg: Message = serde_json::from_str(json).unwrap();
        if let Message::CommandResponse(resp) = msg {
            assert!(resp.output.is_none());
            assert!(resp.exit_code.is_none());
            assert!(resp.reason.is_none());
        } else {
            panic!("expected CommandResponse");
        }
    }

    #[test]
    fn default_timeout_when_missing() {
        let json = r#"{"type":"command_request","id":"r1","command":"ls","working_directory":"/tmp"}"#;
        let msg: Message = serde_json::from_str(json).unwrap();
        if let Message::CommandRequest(req) = msg {
            assert_eq!(req.timeout_seconds, 300);
            assert_eq!(req.context, ""); // default empty string
            assert_eq!(req.session_id, "default");
            assert_eq!(req.terminal_profile, TerminalProfile::System);
            assert_eq!(req.workspace_path, "");
            assert_eq!(req.venv_path, "");
            assert!(!req.activate_venv);
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
            reason: Some("reason with \"quotes\", newlines\nand\ttabs, and unicode: ñ 中文 🎉".into()),
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
}
