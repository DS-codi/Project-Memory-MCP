//! Handshake initiator — sent by the supervisor to verify an MCP endpoint.
//!
//! When the supervisor discovers a potential MCP server (via TCP or named-pipe
//! connection), it calls [`perform_handshake`] to assert that the remote is a
//! trusted Project Memory MCP instance before routing any real commands to it.

use anyhow::Result;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;

use crate::control::protocol::{
    decode_response, encode_response, validate_handshake, WhoAmIRequest, WhoAmIResponse,
};

/// Perform a WhoAmI handshake over an existing TCP stream to an MCP endpoint.
///
/// Sends a [`WhoAmIRequest`] to the remote, reads the [`WhoAmIResponse`], and
/// validates it with [`validate_handshake`].
///
/// Returns `Ok(WhoAmIResponse)` when the endpoint is confirmed to be a trusted
/// Project Memory MCP server that satisfies all `required_capabilities`.
///
/// # Errors
///
/// Returns an error if:
/// * The write or read fails (I/O error).
/// * The response cannot be deserialised.
/// * [`validate_handshake`] rejects the response (wrong server name,
///   incompatible protocol version, or missing capabilities).
pub async fn perform_handshake(
    stream: &mut TcpStream,
    required_capabilities: &[&str],
) -> Result<WhoAmIResponse> {
    // Build a unique request ID from the current wall-clock time in ms.
    let request_id = format!(
        "hs-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );

    let req = WhoAmIRequest {
        request_id: request_id.clone(),
        client: "pm-supervisor".to_string(),
        client_version: env!("CARGO_PKG_VERSION").to_string(),
    };

    // Send the WhoAmIRequest as a single NDJSON line.
    let line = encode_response(&req);
    stream.write_all(line.as_bytes()).await?;

    // Read exactly one line (the WhoAmIResponse) from the remote.
    let mut reader = BufReader::new(stream);
    let mut buf = String::new();
    reader.read_line(&mut buf).await?;

    // Deserialise and validate.
    let response: WhoAmIResponse = decode_response(buf.trim())?;
    validate_handshake(&response, required_capabilities)
        .map_err(|e| anyhow::anyhow!("{e}"))?;

    Ok(response)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::super::protocol::{validate_handshake, HandshakeError, WhoAmIResponse};

    fn valid_response() -> WhoAmIResponse {
        WhoAmIResponse {
            request_id: "hs-1".to_string(),
            ok: true,
            server_name: "project-memory-mcp".to_string(),
            server_version: "1.0.0".to_string(),
            instance_id: "mcp-abc123".to_string(),
            mode: "node".to_string(),
            protocol_version: "1".to_string(),
            capabilities: vec![
                "plan".to_string(),
                "context".to_string(),
                "terminal".to_string(),
            ],
        }
    }

    // ------------------------------------------------------------------
    // Step 8: validate_handshake acceptance and rejection tests
    // ------------------------------------------------------------------

    #[test]
    fn handshake_accepted_for_valid_response() {
        let resp = valid_response();
        let result = validate_handshake(&resp, &["plan", "context"]);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().server_name, "project-memory-mcp");
    }

    #[test]
    fn handshake_accepted_with_no_required_capabilities() {
        let resp = valid_response();
        let result = validate_handshake(&resp, &[]);
        assert!(result.is_ok());
    }

    #[test]
    fn handshake_rejected_for_wrong_server_name() {
        let mut resp = valid_response();
        resp.server_name = "some-other-server".to_string();
        let result = validate_handshake(&resp, &[]);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, HandshakeError::WrongServerName(ref name) if name == "some-other-server"));
        let msg = err.to_string();
        assert!(msg.contains("project-memory-mcp"));
        assert!(msg.contains("some-other-server"));
    }

    #[test]
    fn handshake_rejected_for_incompatible_protocol_version() {
        let mut resp = valid_response();
        resp.protocol_version = "2".to_string();
        let result = validate_handshake(&resp, &[]);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            matches!(err, HandshakeError::IncompatibleProtocolVersion { ref got } if got == "2")
        );
        let msg = err.to_string();
        assert!(msg.contains("incompatible protocol_version"));
        assert!(msg.contains("\"2\""));
    }

    #[test]
    fn handshake_rejected_for_missing_capabilities() {
        let resp = valid_response();
        let result = validate_handshake(&resp, &["plan", "workspace", "search"]);
        assert!(result.is_err());
        let err = result.unwrap_err();
        match err {
            HandshakeError::MissingCapabilities(ref missing) => {
                assert!(missing.contains(&"workspace".to_string()));
                assert!(missing.contains(&"search".to_string()));
                assert!(!missing.contains(&"plan".to_string()));
            }
            other => panic!("expected MissingCapabilities, got {other:?}"),
        }
        let msg = err.to_string();
        assert!(msg.contains("workspace"));
        assert!(msg.contains("search"));
    }

    #[test]
    fn handshake_wrong_name_takes_priority_over_missing_caps() {
        let mut resp = valid_response();
        resp.server_name = "not-mcp".to_string();
        // Even if capabilities are also wrong, WrongServerName is checked first.
        let result = validate_handshake(&resp, &["workspace"]);
        assert!(matches!(result, Err(HandshakeError::WrongServerName(_))));
    }

    #[test]
    fn handshake_error_display_contains_all_missing_caps() {
        let resp = valid_response();
        let err = validate_handshake(&resp, &["a", "b", "c"])
            .unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("a"));
        assert!(msg.contains("b"));
        assert!(msg.contains("c"));
    }
}
