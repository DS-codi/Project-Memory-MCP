use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// IPC message protocol between the interactive-terminal UI process
/// and the out-of-process `pty-host` binary.
///
/// Wire format: newline-delimited JSON (NDJSON) over a local TCP socket.
/// This enum is intentionally isolated from `crate::protocol::Message`
/// to ensure zero changes to the MCP wire format.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PtyHostMessage {
    /// UI → host: spawn a new PTY session.
    SessionCreate(SessionCreate),
    /// Host → UI: session was spawned successfully.
    SessionCreated(SessionCreated),
    /// Host → UI: session spawn failed.
    SessionCreateFailed(SessionCreateFailed),
    /// UI → host: write raw bytes to a session's PTY input.
    SessionInput(SessionInput),
    /// UI → host: resize a session's PTY.
    SessionResize(SessionResize),
    /// Host → UI: raw output bytes from a session's PTY.
    SessionOutput(SessionOutput),
    /// Host → UI: a session's shell process has exited.
    SessionExited(SessionExited),
    /// UI → host: kill a session.
    SessionKill(SessionKill),
    /// Host → UI: periodic liveness signal.
    Heartbeat(Heartbeat),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionCreate {
    pub session_id: String,
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub cwd: String,
    #[serde(default)]
    pub env: HashMap<String, String>,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionCreated {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionCreateFailed {
    pub session_id: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionInput {
    pub session_id: String,
    /// Raw bytes encoded as a UTF-8 string (lossy conversion applied for non-UTF-8 input).
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionResize {
    pub session_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionOutput {
    pub session_id: String,
    /// Raw PTY output bytes encoded as UTF-8 (lossy) string.
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionExited {
    pub session_id: String,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionKill {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Heartbeat {
    pub ts: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip(msg: &PtyHostMessage) -> PtyHostMessage {
        let json = serde_json::to_string(msg).expect("serialize failed");
        serde_json::from_str(&json).expect("deserialize failed")
    }

    #[test]
    fn session_create_roundtrip() {
        let msg = PtyHostMessage::SessionCreate(SessionCreate {
            session_id: "sess-1".to_string(),
            program: "powershell.exe".to_string(),
            args: vec![],
            cwd: "C:\\Users\\User".to_string(),
            env: HashMap::from([("TERM".to_string(), "xterm-256color".to_string())]),
            cols: 80,
            rows: 24,
        });
        assert_eq!(roundtrip(&msg), msg);
    }

    #[test]
    fn session_created_roundtrip() {
        let msg = PtyHostMessage::SessionCreated(SessionCreated {
            session_id: "sess-1".to_string(),
        });
        assert_eq!(roundtrip(&msg), msg);
    }

    #[test]
    fn session_create_failed_roundtrip() {
        let msg = PtyHostMessage::SessionCreateFailed(SessionCreateFailed {
            session_id: "sess-1".to_string(),
            error: "spawn failed".to_string(),
        });
        assert_eq!(roundtrip(&msg), msg);
    }

    #[test]
    fn session_input_roundtrip() {
        let msg = PtyHostMessage::SessionInput(SessionInput {
            session_id: "sess-1".to_string(),
            data: "ls -la\r\n".to_string(),
        });
        assert_eq!(roundtrip(&msg), msg);
    }

    #[test]
    fn session_resize_roundtrip() {
        let msg = PtyHostMessage::SessionResize(SessionResize {
            session_id: "sess-1".to_string(),
            cols: 120,
            rows: 40,
        });
        assert_eq!(roundtrip(&msg), msg);
    }

    #[test]
    fn session_output_roundtrip() {
        let msg = PtyHostMessage::SessionOutput(SessionOutput {
            session_id: "sess-1".to_string(),
            data: "Hello, PTY host!\r\n".to_string(),
        });
        assert_eq!(roundtrip(&msg), msg);
    }

    #[test]
    fn session_exited_roundtrip() {
        let msg = PtyHostMessage::SessionExited(SessionExited {
            session_id: "sess-1".to_string(),
            exit_code: Some(0),
        });
        assert_eq!(roundtrip(&msg), msg);
    }

    #[test]
    fn session_exited_no_exit_code_roundtrip() {
        let msg = PtyHostMessage::SessionExited(SessionExited {
            session_id: "sess-2".to_string(),
            exit_code: None,
        });
        assert_eq!(roundtrip(&msg), msg);
    }

    #[test]
    fn session_kill_roundtrip() {
        let msg = PtyHostMessage::SessionKill(SessionKill {
            session_id: "sess-1".to_string(),
        });
        assert_eq!(roundtrip(&msg), msg);
    }

    #[test]
    fn heartbeat_roundtrip() {
        let msg = PtyHostMessage::Heartbeat(Heartbeat { ts: 1_234_567_890 });
        assert_eq!(roundtrip(&msg), msg);
    }

    #[test]
    fn type_tag_is_snake_case() {
        let msg = PtyHostMessage::SessionCreate(SessionCreate {
            session_id: "x".to_string(),
            program: "sh".to_string(),
            args: vec![],
            cwd: "/tmp".to_string(),
            env: HashMap::new(),
            cols: 80,
            rows: 24,
        });
        let json = serde_json::to_string(&msg).unwrap();
        assert!(
            json.contains("\"type\":\"session_create\""),
            "type tag should be snake_case; got: {json}"
        );
    }
}
