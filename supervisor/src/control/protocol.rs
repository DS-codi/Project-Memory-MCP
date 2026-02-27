//! NDJSON control-plane message types.
//!
//! Every message is a single JSON object followed by `\n` (NDJSON framing).
//! Requests carry a `"type"` field used as the serde enum tag.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Ancillary enums
// ---------------------------------------------------------------------------

/// Backend runtime kind used with `SetBackend`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackendKind {
    Node,
    Container,
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/// All commands a client can send to the supervisor.
///
/// Each variant maps to the `"type"` field in the JSON object.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ControlRequest {
    /// Return the status of all managed services.
    Status,

    /// Start a named service.
    Start { service: String },

    /// Stop a named service.
    Stop { service: String },

    /// Restart a named service.
    Restart { service: String },

    /// Switch the active backend (node vs container).
    SetBackend { backend: BackendKind },

    /// List all connected control clients.
    ListClients,

    /// Register a VS Code window as a tracked client.
    AttachClient { pid: u32, window_id: String },

    /// Unregister a previously attached client.
    DetachClient { client_id: String },

    /// Identity handshake — client sends its identity; supervisor replies with
    /// its own identity and capability list.
    WhoAmI(WhoAmIRequest),

    /// Query health data for a single service: state, last_health timestamp,
    /// last_error, and active backend.
    ServiceHealth { service: String },

    /// Query the last N state-transition events for a service.
    /// `limit` defaults to 50 when absent.
    StateEvents { service: String, limit: Option<usize> },

    /// Return aggregate connection health and per-child status for the
    /// minimal supervisor health GUI.
    HealthSnapshot,

    /// Update health window visibility state (`true` = shown, `false` = hidden).
    SetHealthWindowVisibility { visible: bool },

    /// Request graceful supervisor shutdown.
    ShutdownSupervisor,

    /// Signal the supervisor to perform a zero-downtime MCP upgrade.
    /// Drains active sessions, stops the MCP runner, then restarts it.
    UpgradeMcp,

    /// List all currently active VS Code ↔ MCP HTTP sessions tracked by the
    /// supervisor (populated by the `/admin/connections` poll loop).
    ListMcpConnections,

    /// Close a specific VS Code ↔ MCP session by its MCP session UUID.
    ///
    /// The supervisor calls `DELETE /admin/connections/{session_id}` on the MCP
    /// server and then removes the entry from its registry.
    CloseMcpConnection { session_id: String },

    /// List all running MCP instance ports managed by the pool.
    ListMcpInstances,

    /// Manually trigger a pool scale-up (spawn one additional MCP instance).
    /// The supervisor will reject this if `max_instances` is already reached.
    ScaleUpMcp,

    /// Execute one MCP payload through the supervisor-hosted async subprocess
    /// runtime when enabled via feature flag/environment.
    ///
    /// The payload is forwarded to the configured subprocess on stdin as JSON
    /// (single line), and stdout is parsed as JSON when possible.
    McpRuntimeExec {
        payload: serde_json::Value,
        #[serde(skip_serializing_if = "Option::is_none")]
        timeout_ms: Option<u64>,
    },

    /// Update MCP runtime execution policy in-process (single-instance safe).
    ///
    /// This allows wave validation to enable/disable runtime execution and
    /// adjust cohort/hard-stop policy without restarting the supervisor.
    SetMcpRuntimePolicy {
        #[serde(skip_serializing_if = "Option::is_none")]
        enabled: Option<bool>,
        #[serde(skip_serializing_if = "Option::is_none")]
        wave_cohorts: Option<Vec<String>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        hard_stop_gate: Option<bool>,
    },

    /// Return the URL of the `/supervisor/events` SSE endpoint.
    SubscribeEvents,

    /// Return broadcast-channel statistics for the events channel.
    EventStats,

    /// Emit a synthetic `Test` event on the events broadcast channel.
    /// Useful for integration-testing the SSE pipeline end-to-end.
    EmitTestEvent { message: String },

    /// Launch an on-demand form-app GUI process, pipe a payload on stdin,
    /// and return the response from stdout.
    ///
    /// If the GUI response has `status: "refinement_requested"`, the response
    /// will include `pending_refinement: true` and a `session_id` token.
    /// Use `ContinueApp` with that token to send a `FormRefinementResponse`
    /// and read the next `FormResponse` from the still-running GUI.
    LaunchApp {
        /// Registered app name: `"brainstorm_gui"` or `"approval_gui"`.
        app_name: String,
        /// The full [`FormRequest`] JSON payload to pipe to the child process.
        payload: serde_json::Value,
        /// Optional per-request timeout override in seconds.
        /// Falls back to the app's configured `timeout_seconds`.
        #[serde(skip_serializing_if = "Option::is_none")]
        timeout_seconds: Option<u64>,
    },

    /// Continue a GUI session that returned `pending_refinement: true`.
    ///
    /// Sends a `FormRefinementResponse` JSON payload to the running GUI's
    /// stdin and waits for the next `FormResponse` on stdout.
    ContinueApp {
        /// Session token returned by `LaunchApp` with `pending_refinement: true`.
        session_id: String,
        /// The `FormRefinementResponse` JSON to send to the GUI.
        payload: serde_json::Value,
        /// Optional per-continuation timeout override in seconds.
        #[serde(skip_serializing_if = "Option::is_none")]
        timeout_seconds: Option<u64>,
    },
}

/// Body of the `WhoAmI` request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhoAmIRequest {
    pub request_id: String,
    pub client: String,
    pub client_version: String,
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/// Generic envelope returned for every command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Command-specific payload.  `null` when there is no payload.
    pub data: serde_json::Value,
}

impl ControlResponse {
    /// Convenience constructor for a successful response with a payload.
    pub fn ok(data: serde_json::Value) -> Self {
        Self { ok: true, error: None, data }
    }

    /// Convenience constructor for an error response.
    pub fn err(message: impl Into<String>) -> Self {
        Self {
            ok: false,
            error: Some(message.into()),
            data: serde_json::Value::Null,
        }
    }
}

/// Payload returned inside `ControlResponse.data` for a successful `WhoAmI`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhoAmIResponse {
    pub request_id: String,
    pub ok: bool,
    pub server_name: String,
    pub server_version: String,
    pub instance_id: String,
    /// `"node"` or `"container"`.
    pub mode: String,
    /// Wire-protocol version string, currently `"1"`.
    pub protocol_version: String,
    pub capabilities: Vec<String>,
}

// ---------------------------------------------------------------------------
// FormApp response types
// ---------------------------------------------------------------------------

/// Payload returned inside `ControlResponse.data` for a successful `EventStats`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventStatsData {
    /// Whether the events broadcast channel is enabled.
    pub enabled: bool,
    /// Current number of live SSE subscribers.
    pub subscriber_count: usize,
    /// Total events emitted since the supervisor started.
    pub events_emitted: u64,
    /// URL clients should connect to for the SSE event stream.
    pub events_url: Option<String>,
}

/// Result of a `LaunchApp` or `ContinueApp` request, returned inside `ControlResponse.data`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormAppResponse {
    /// The app that was launched.
    pub app_name: String,
    /// Whether the GUI produced a valid response.
    pub success: bool,
    /// The GUI's response payload (`FormResponse` JSON), present on success.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_payload: Option<serde_json::Value>,
    /// Human-readable error message, present on failure.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Duration in milliseconds from spawn to response (or timeout).
    pub elapsed_ms: u64,
    /// `true` when the process was killed because the timeout expired.
    pub timed_out: bool,
    /// `true` when the GUI requested refinement and a session is waiting.
    /// Supply the `session_id` in a subsequent `ContinueApp` request.
    #[serde(default)]
    pub pending_refinement: bool,
    /// Session token for `ContinueApp` — only present when `pending_refinement == true`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

/// Aggregate connection health summary for the minimal health GUI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionHealthSummary {
    pub state: String,
    pub last_transition_at: Option<u64>,
    pub last_error: Option<String>,
}

/// Per-child service health row for the minimal health GUI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChildHealthStatus {
    pub service_name: String,
    pub status: String,
    pub pid: Option<u32>,
    pub last_health_error: Option<String>,
    pub updated_at: Option<u64>,
}

/// Full minimal health snapshot for supervisor UI consumption.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthSnapshot {
    pub connection: ConnectionHealthSummary,
    pub children: Vec<ChildHealthStatus>,
    pub health_window_visible: bool,
}

/// Lifecycle state of a single form-app process.
///
/// Used internally by the Supervisor to track running GUI processes and
/// enforce timeouts.
#[derive(Debug)]
pub enum FormAppLifecycleState {
    /// The process has been spawned and is waiting for the user response.
    Running,
    /// The process finished and produced a response.
    Completed,
    /// The process was killed due to timeout.
    TimedOut,
    /// The process exited with an error or could not be started.
    Failed(String),
}

/// Internal tracker for a running form-app process.
///
/// Not serialized over the wire; used by the launcher to manage child
/// process handles and kill-on-timeout logic.
#[derive(Debug)]
pub struct FormAppLifecycle {
    /// Name of the app (e.g. `"brainstorm_gui"`).
    pub app_name: String,
    /// OS process ID of the child, if successfully spawned.
    pub pid: Option<u32>,
    /// Current lifecycle state.
    pub state: FormAppLifecycleState,
    /// Unix timestamp (ms) when the process was spawned.
    pub started_at_ms: u64,
    /// Configured timeout in seconds.
    pub timeout_seconds: u64,
}

// ---------------------------------------------------------------------------
// Framing helpers
// ---------------------------------------------------------------------------

/// Deserialise an NDJSON line into a [`ControlRequest`].
pub fn decode_request(line: &str) -> serde_json::Result<ControlRequest> {
    serde_json::from_str(line.trim())
}

/// Deserialise an NDJSON line into a [`WhoAmIResponse`].
pub fn decode_response(line: &str) -> serde_json::Result<WhoAmIResponse> {
    serde_json::from_str(line.trim())
}

/// Serialise any `Serialize` value to an NDJSON line (JSON followed by `\n`).
pub fn encode_response<T: Serialize>(val: &T) -> String {
    let mut s = serde_json::to_string(val).unwrap_or_else(|e| {
        // Fallback: emit a plain error envelope so the channel is never left
        // hanging.
        format!(r#"{{"ok":false,"error":"serialisation error: {e}","data":null}}"#)
    });
    s.push('\n');
    s
}

// ---------------------------------------------------------------------------
// Handshake validation
// ---------------------------------------------------------------------------

/// Errors that can occur when validating a [`WhoAmIResponse`].
#[derive(Debug)]
pub enum HandshakeError {
    /// The remote server reported a name other than `"project-memory-mcp"`.
    WrongServerName(String),
    /// The remote server's `protocol_version` is not compatible with this
    /// supervisor.  Currently only `"1"` is accepted; semver range checks can
    /// be added later.
    IncompatibleProtocolVersion { got: String },
    /// One or more required capabilities were absent from the server's list.
    MissingCapabilities(Vec<String>),
}

impl std::fmt::Display for HandshakeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HandshakeError::WrongServerName(name) => write!(
                f,
                "handshake failed: expected server_name \"project-memory-mcp\", got \"{name}\""
            ),
            HandshakeError::IncompatibleProtocolVersion { got } => write!(
                f,
                "handshake failed: incompatible protocol_version \"{got}\" (expected \"1\")"
            ),
            HandshakeError::MissingCapabilities(caps) => write!(
                f,
                "handshake failed: missing required capabilities: {}",
                caps.join(", ")
            ),
        }
    }
}

impl std::error::Error for HandshakeError {}

/// Result type for handshake validation.
pub type HandshakeResult = Result<WhoAmIResponse, HandshakeError>;

/// Validate a [`WhoAmIResponse`] received from an MCP endpoint.
///
/// The supervisor trusts the endpoint only if:
/// 1. `server_name == "project-memory-mcp"`
/// 2. `protocol_version == "1"` (exact match for now; semver range can be
///    added in a future iteration)
/// 3. Every capability listed in `required_capabilities` is present in the
///    response.
pub fn validate_handshake(
    response: &WhoAmIResponse,
    required_capabilities: &[&str],
) -> HandshakeResult {
    // --- 1. Server name ---
    if response.server_name != "project-memory-mcp" {
        return Err(HandshakeError::WrongServerName(response.server_name.clone()));
    }

    // --- 2. Protocol version ---
    // TODO: extend to a semver range check (accept >= "1.0.0") when the
    // protocol stabilises at a 1.x series.
    if response.protocol_version != "1" {
        return Err(HandshakeError::IncompatibleProtocolVersion {
            got: response.protocol_version.clone(),
        });
    }

    // --- 3. Capability minimum ---
    let missing: Vec<String> = required_capabilities
        .iter()
        .filter(|cap| !response.capabilities.contains(&cap.to_string()))
        .map(|cap| cap.to_string())
        .collect();

    if !missing.is_empty() {
        return Err(HandshakeError::MissingCapabilities(missing));
    }

    Ok(response.clone())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_request_status() {
        let line = r#"{"type":"Status"}"#;
        let req = decode_request(line).expect("parse");
        assert!(matches!(req, ControlRequest::Status));
    }

    #[test]
    fn decode_request_whoami() {
        let line = r#"{"type":"WhoAmI","request_id":"req-1","client":"vscode","client_version":"1.0.0"}"#;
        let req = decode_request(line).expect("parse");
        match req {
            ControlRequest::WhoAmI(inner) => {
                assert_eq!(inner.request_id, "req-1");
                assert_eq!(inner.client, "vscode");
                assert_eq!(inner.client_version, "1.0.0");
            }
            other => panic!("expected WhoAmI, got {other:?}"),
        }
    }

    #[test]
    fn decode_request_set_backend_node() {
        let line = r#"{"type":"SetBackend","backend":"node"}"#;
        let req = decode_request(line).expect("parse");
        match req {
            ControlRequest::SetBackend { backend } => {
                assert!(matches!(backend, BackendKind::Node));
            }
            other => panic!("expected SetBackend, got {other:?}"),
        }
    }

    #[test]
    fn encode_response_ends_with_newline() {
        let resp = ControlResponse::ok(serde_json::json!({"status": "running"}));
        let encoded = encode_response(&resp);
        assert!(encoded.ends_with('\n'));
    }

    #[test]
    fn roundtrip_status_request() {
        let original = ControlRequest::Status;
        let json = serde_json::to_string(&original).expect("serialize");
        let decoded = decode_request(&json).expect("decode");
        assert!(matches!(decoded, ControlRequest::Status));
    }
}
