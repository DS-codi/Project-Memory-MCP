//! Control-plane request handler.
//!
//! [`handle_request`] dispatches a decoded [`ControlRequest`] to the
//! appropriate [`Registry`] operation and produces a [`ControlResponse`].

use std::sync::Arc;

use serde_json::json;
use tokio::sync::Mutex;

use crate::control::protocol::{ControlRequest, ControlResponse};
use crate::control::registry::{Registry, ServiceStatus};

/// Dispatch one control-plane request and return its response.
///
/// The registry is protected by an async mutex so multiple inflight requests
/// can be handled concurrently without data races.
pub async fn handle_request(
    req: ControlRequest,
    registry: Arc<Mutex<Registry>>,
) -> ControlResponse {
    match req {
        // ---------------------------------------------------------------
        // Status — snapshot of all service states
        // ---------------------------------------------------------------
        ControlRequest::Status => {
            let reg = registry.lock().await;
            let states = reg.service_states();
            match serde_json::to_value(&states) {
                Ok(data) => ControlResponse::ok(data),
                Err(e) => ControlResponse::err(format!("serialisation error: {e}")),
            }
        }

        // ---------------------------------------------------------------
        // Start
        // ---------------------------------------------------------------
        ControlRequest::Start { service } => {
            let mut reg = registry.lock().await;
            reg.set_service_status(&service, ServiceStatus::Starting);
            ControlResponse::ok(json!({ "service": service, "status": "starting" }))
        }

        // ---------------------------------------------------------------
        // Stop
        // ---------------------------------------------------------------
        ControlRequest::Stop { service } => {
            let mut reg = registry.lock().await;
            reg.set_service_status(&service, ServiceStatus::Stopping);
            ControlResponse::ok(json!({ "service": service, "status": "stopping" }))
        }

        // ---------------------------------------------------------------
        // Restart — transition through Stopping → Starting
        // ---------------------------------------------------------------
        ControlRequest::Restart { service } => {
            let mut reg = registry.lock().await;
            reg.set_service_status(&service, ServiceStatus::Stopping);
            reg.set_service_status(&service, ServiceStatus::Starting);
            ControlResponse::ok(json!({ "service": service, "status": "starting" }))
        }

        // ---------------------------------------------------------------
        // SetBackend — switch active backend
        // ---------------------------------------------------------------
        ControlRequest::SetBackend { backend } => {
            let backend_name = format!("{backend:?}").to_lowercase();
            let mut reg = registry.lock().await;
            reg.set_backend(backend);
            ControlResponse::ok(json!({ "active_backend": backend_name }))
        }

        // ---------------------------------------------------------------
        // ListClients
        // ---------------------------------------------------------------
        ControlRequest::ListClients => {
            let reg = registry.lock().await;
            let clients = reg.list_clients();
            match serde_json::to_value(&clients) {
                Ok(data) => ControlResponse::ok(data),
                Err(e) => ControlResponse::err(format!("serialisation error: {e}")),
            }
        }

        // ---------------------------------------------------------------
        // AttachClient
        // ---------------------------------------------------------------
        ControlRequest::AttachClient { pid, window_id } => {
            let mut reg = registry.lock().await;
            let client_id = reg.attach_client(pid, window_id);
            ControlResponse::ok(json!({ "client_id": client_id }))
        }

        // ---------------------------------------------------------------
        // DetachClient
        // ---------------------------------------------------------------
        ControlRequest::DetachClient { client_id } => {
            let mut reg = registry.lock().await;
            if reg.detach_client(&client_id) {
                ControlResponse::ok(json!({ "client_id": client_id, "detached": true }))
            } else {
                ControlResponse::err(format!("client not found: {client_id}"))
            }
        }

        // ---------------------------------------------------------------
        // WhoAmI — acknowledge the client identity probe
        // ---------------------------------------------------------------
        ControlRequest::WhoAmI(req) => {
            // The client has sent its identity.  The supervisor echoes it back
            // so the caller can confirm the round-trip.  Active endpoint
            // validation (sending WhoAmIRequest to the MCP server and calling
            // validate_handshake) is performed by the handshake initiator in
            // `crate::control::handshake`, not in this dispatch path.
            eprintln!("[supervisor] WhoAmI request received from client: {}", req.client);
            ControlResponse::ok(json!({
                "message": "WhoAmI received",
                "client": req.client,
                "client_version": req.client_version
            }))
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::control::protocol::BackendKind;
    use crate::control::registry::Registry;

    fn make_registry() -> Arc<Mutex<Registry>> {
        Arc::new(Mutex::new(Registry::new()))
    }

    #[tokio::test]
    async fn status_returns_three_services() {
        let reg = make_registry();
        let resp = handle_request(ControlRequest::Status, reg).await;
        assert!(resp.ok);
        let arr = resp.data.as_array().expect("data should be array");
        assert_eq!(arr.len(), 3);
    }

    #[tokio::test]
    async fn start_service_transitions_to_starting() {
        let reg = make_registry();
        let resp = handle_request(
            ControlRequest::Start { service: "mcp".to_string() },
            Arc::clone(&reg),
        )
        .await;
        assert!(resp.ok);
        assert_eq!(resp.data["status"], "starting");
        // Verify registry was updated.
        let locked = reg.lock().await;
        let state = locked.service_states().into_iter().find(|s| s.name == "mcp").unwrap();
        assert!(matches!(state.status, ServiceStatus::Starting));
    }

    #[tokio::test]
    async fn stop_service_transitions_to_stopping() {
        let reg = make_registry();
        let resp = handle_request(
            ControlRequest::Stop { service: "dashboard".to_string() },
            Arc::clone(&reg),
        )
        .await;
        assert!(resp.ok);
        assert_eq!(resp.data["status"], "stopping");
    }

    #[tokio::test]
    async fn restart_leaves_service_in_starting() {
        let reg = make_registry();
        let resp = handle_request(
            ControlRequest::Restart { service: "mcp".to_string() },
            Arc::clone(&reg),
        )
        .await;
        assert!(resp.ok);
        assert_eq!(resp.data["status"], "starting");
    }

    #[tokio::test]
    async fn set_backend_container() {
        let reg = make_registry();
        let resp = handle_request(
            ControlRequest::SetBackend { backend: BackendKind::Container },
            Arc::clone(&reg),
        )
        .await;
        assert!(resp.ok);
        assert_eq!(resp.data["active_backend"], "container");
    }

    #[tokio::test]
    async fn attach_and_list_clients() {
        let reg = make_registry();
        let attach_resp = handle_request(
            ControlRequest::AttachClient { pid: 999, window_id: "win-1".to_string() },
            Arc::clone(&reg),
        )
        .await;
        assert!(attach_resp.ok);
        let client_id = attach_resp.data["client_id"].as_str().unwrap().to_string();

        let list_resp = handle_request(ControlRequest::ListClients, Arc::clone(&reg)).await;
        assert!(list_resp.ok);
        let arr = list_resp.data.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["client_id"], client_id);
    }

    #[tokio::test]
    async fn detach_existing_client_succeeds() {
        let reg = make_registry();
        handle_request(
            ControlRequest::AttachClient { pid: 1, window_id: "w".to_string() },
            Arc::clone(&reg),
        )
        .await;
        let resp = handle_request(
            ControlRequest::DetachClient { client_id: "client-1".to_string() },
            Arc::clone(&reg),
        )
        .await;
        assert!(resp.ok);
    }

    #[tokio::test]
    async fn detach_unknown_client_returns_error() {
        let reg = make_registry();
        let resp = handle_request(
            ControlRequest::DetachClient { client_id: "client-99".to_string() },
            reg,
        )
        .await;
        assert!(!resp.ok);
        assert!(resp.error.unwrap().contains("client not found"));
    }

    #[tokio::test]
    async fn whoami_echoes_client_identity() {
        use crate::control::protocol::WhoAmIRequest;
        let reg = make_registry();
        let resp = handle_request(
            ControlRequest::WhoAmI(WhoAmIRequest {
                request_id: "r1".to_string(),
                client: "vscode".to_string(),
                client_version: "1.0.0".to_string(),
            }),
            reg,
        )
        .await;
        assert!(resp.ok);
        assert_eq!(resp.data["client"], "vscode");
        assert_eq!(resp.data["client_version"], "1.0.0");
        assert_eq!(resp.data["message"], "WhoAmI received");
    }
}
