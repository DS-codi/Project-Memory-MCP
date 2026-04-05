use serde::{Deserialize, Serialize};

/// JSON envelope for all WebSocket messages between the mobile client and
/// the interactive-terminal server.
///
/// The `type` field is used as the serde tag so every message is a flat JSON
/// object: `{ "type": "data", "session_id": "...", "payload": "..." }`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsMessage {
    /// First message from client — must arrive within the auth timeout window.
    /// `session_id` defaults to an empty string (new session) if not provided.
    Auth {
        key: String,
        #[serde(default)]
        session_id: String,
    },

    /// PTY output (server → client) or keystroke input (client → server).
    /// `payload` is a Base64-encoded byte string.
    Data { session_id: String, payload: String },

    /// Terminal resize request from client.
    Resize { cols: u16, rows: u16 },

    /// Error notification (server → client), typically followed by connection close.
    Error { message: String },

    /// Keep-alive ping sent by the server every 30 seconds.
    /// The client SHOULD echo back a `Heartbeat` to signal liveness.
    Heartbeat,

    /// Thinking/reasoning content extracted from CLI `<thinking>` blocks (server → client).
    /// `payload` is Base64-encoded raw bytes of the extracted thinking text.
    /// Sent alongside normal `Data` frames so the client can display thinking
    /// in a separate panel without polluting the main terminal output.
    Thinking { session_id: String, payload: String },
}

// ─── Serde round-trip tests ───────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn round_trip(msg: &WsMessage) -> WsMessage {
        let json = serde_json::to_string(msg).expect("serialize failed");
        serde_json::from_str(&json).expect("deserialize failed")
    }

    #[test]
    fn auth_round_trip() {
        let msg = WsMessage::Auth {
            key: "super-secret-api-key".into(),
            session_id: "sess_abc".into(),
        };
        assert_eq!(round_trip(&msg), msg);
    }

    #[test]
    fn auth_without_session_id_defaults_to_empty() {
        // Simulate an old client that omits session_id.
        let json = r#"{"type":"auth","key":"k"}"#;
        let msg: WsMessage = serde_json::from_str(json).expect("parse");
        assert_eq!(
            msg,
            WsMessage::Auth {
                key: "k".into(),
                session_id: "".into(),
            }
        );
    }

    #[test]
    fn data_round_trip() {
        let msg = WsMessage::Data {
            session_id: "sess_abc123".into(),
            payload: "aGVsbG8gd29ybGQ=".into(),
        };
        assert_eq!(round_trip(&msg), msg);
    }

    #[test]
    fn resize_round_trip() {
        let msg = WsMessage::Resize { cols: 220, rows: 50 };
        assert_eq!(round_trip(&msg), msg);
    }

    #[test]
    fn error_round_trip() {
        let msg = WsMessage::Error {
            message: "unauthorized".into(),
        };
        assert_eq!(round_trip(&msg), msg);
    }

    #[test]
    fn heartbeat_round_trip() {
        let msg = WsMessage::Heartbeat;
        assert_eq!(round_trip(&msg), msg);
    }

    #[test]
    fn auth_serializes_type_tag() {
        let msg = WsMessage::Auth {
            key: "k".into(),
            session_id: "".into(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"auth\""), "unexpected json: {json}");
    }

    #[test]
    fn heartbeat_serializes_type_tag() {
        let msg = WsMessage::Heartbeat;
        let json = serde_json::to_string(&msg).unwrap();
        assert!(
            json.contains("\"type\":\"heartbeat\""),
            "unexpected json: {json}"
        );
    }

    #[test]
    fn thinking_round_trip() {
        let msg = WsMessage::Thinking {
            session_id: "sess_abc".into(),
            payload: "dGhpbmtpbmcgdGV4dA==".into(),
        };
        assert_eq!(round_trip(&msg), msg);
    }

    #[test]
    fn thinking_serializes_type_tag() {
        let msg = WsMessage::Thinking {
            session_id: "".into(),
            payload: "dGhpbmtpbmc=".into(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(
            json.contains("\"type\":\"thinking\""),
            "unexpected json: {json}"
        );
    }
}
