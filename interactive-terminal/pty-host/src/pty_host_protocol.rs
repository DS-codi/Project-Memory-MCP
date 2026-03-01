// NOTE: This file is intentionally duplicated from
// interactive-terminal/src/pty_host_protocol.rs because the
// interactive-terminal crate is a binary crate with a cxx-qt build dependency
// and cannot be used as a lib dep without pulling in Qt.
// Kept in sync manually. The canonical definition is in interactive-terminal/src.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// IPC message protocol between the interactive-terminal UI process
/// and the out-of-process `pty-host` binary.
///
/// Wire format: newline-delimited JSON (NDJSON) over a local TCP socket.
/// This enum is intentionally isolated from the MCP `Message` enum
/// to ensure zero changes to the MCP wire format.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PtyHostMessage {
    SessionCreate(SessionCreate),
    SessionCreated(SessionCreated),
    SessionCreateFailed(SessionCreateFailed),
    SessionInput(SessionInput),
    SessionResize(SessionResize),
    SessionOutput(SessionOutput),
    SessionExited(SessionExited),
    SessionKill(SessionKill),
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
