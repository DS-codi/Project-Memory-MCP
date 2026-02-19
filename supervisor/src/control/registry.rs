//! Service registry and client registry for the control plane.
//!
//! [`Registry`] tracks the runtime state of every managed service and the set
//! of VS Code windows currently attached to this supervisor.

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::control::protocol::BackendKind;

// ---------------------------------------------------------------------------
// Service state
// ---------------------------------------------------------------------------

/// Running state of a single managed service.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ServiceStatus {
    Running,
    Stopped,
    Starting,
    Stopping,
    Error(String),
}

/// Snapshot of one managed service.
#[derive(Debug, Clone, Serialize)]
pub struct ServiceState {
    pub name: String,
    pub status: ServiceStatus,
    pub pid: Option<u32>,
    pub last_error: Option<String>,
}

// ---------------------------------------------------------------------------
// Client entry
// ---------------------------------------------------------------------------

/// Metadata for a VS Code window attached to the supervisor.
#[derive(Debug, Clone, Serialize)]
pub struct ClientEntry {
    pub client_id: String,
    pub pid: u32,
    pub window_id: String,
    /// Unix timestamp (seconds) when this client was attached.
    pub attached_at: u64,
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/// Central registry — wraps service states and client list.
///
/// Callers are expected to put this behind an `Arc<tokio::sync::Mutex<Registry>>`
/// so that the control-plane handler and future subsystems share the same
/// instance.
pub struct Registry {
    services: HashMap<String, ServiceState>,
    pub active_backend: BackendKind,
    clients: HashMap<String, ClientEntry>,
    next_client_id: u64,
}

impl Registry {
    /// Create a registry pre-populated with all known managed services,
    /// each initialised to [`ServiceStatus::Stopped`].
    pub fn new() -> Self {
        let mut services = HashMap::new();
        for name in &["mcp", "interactive_terminal", "dashboard"] {
            services.insert(
                name.to_string(),
                ServiceState {
                    name: name.to_string(),
                    status: ServiceStatus::Stopped,
                    pid: None,
                    last_error: None,
                },
            );
        }
        Self {
            services,
            active_backend: BackendKind::Node,
            clients: HashMap::new(),
            next_client_id: 1,
        }
    }

    /// Return a snapshot of all service states.
    pub fn service_states(&self) -> Vec<ServiceState> {
        let mut states: Vec<ServiceState> = self.services.values().cloned().collect();
        // Stable order for deterministic responses.
        states.sort_by(|a, b| a.name.cmp(&b.name));
        states
    }

    /// Update the status of a named service.  If the service is not tracked
    /// it is silently ignored (the control handler returns ok regardless so
    /// the caller can handle the distinction if needed).
    pub fn set_service_status(&mut self, name: &str, status: ServiceStatus) {
        if let Some(entry) = self.services.get_mut(name) {
            entry.status = status;
        }
    }

    /// Change the active backend and record it.
    pub fn set_backend(&mut self, backend: BackendKind) {
        self.active_backend = backend;
    }

    /// Register a new VS Code window as an attached client.
    ///
    /// Returns the generated `client_id` string (`"client-N"`).
    pub fn attach_client(&mut self, pid: u32, window_id: String) -> String {
        let client_id = format!("client-{}", self.next_client_id);
        self.next_client_id += 1;

        let attached_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        self.clients.insert(
            client_id.clone(),
            ClientEntry {
                client_id: client_id.clone(),
                pid,
                window_id,
                attached_at,
            },
        );
        client_id
    }

    /// Remove a client by ID.  Returns `true` if the client was present.
    pub fn detach_client(&mut self, client_id: &str) -> bool {
        self.clients.remove(client_id).is_some()
    }

    /// Return a snapshot of all currently attached clients.
    pub fn list_clients(&self) -> Vec<ClientEntry> {
        let mut clients: Vec<ClientEntry> = self.clients.values().cloned().collect();
        // Stable order.
        clients.sort_by(|a, b| a.attached_at.cmp(&b.attached_at).then(a.client_id.cmp(&b.client_id)));
        clients
    }
}

impl Default for Registry {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_starts_with_three_stopped_services() {
        let r = Registry::new();
        let states = r.service_states();
        assert_eq!(states.len(), 3);
        for s in &states {
            assert!(matches!(s.status, ServiceStatus::Stopped), "expected Stopped for {}", s.name);
        }
    }

    #[test]
    fn set_service_status_updates_known_service() {
        let mut r = Registry::new();
        r.set_service_status("mcp", ServiceStatus::Running);
        let state = r.service_states().into_iter().find(|s| s.name == "mcp").unwrap();
        assert!(matches!(state.status, ServiceStatus::Running));
    }

    #[test]
    fn set_service_status_ignores_unknown_service() {
        let mut r = Registry::new();
        r.set_service_status("unknown_service", ServiceStatus::Running);
        // Should not panic; registry still has 3 services.
        assert_eq!(r.service_states().len(), 3);
    }

    #[test]
    fn attach_and_detach_client() {
        let mut r = Registry::new();
        let id = r.attach_client(1234, "window-1".to_string());
        assert_eq!(id, "client-1");
        assert_eq!(r.list_clients().len(), 1);

        let removed = r.detach_client(&id);
        assert!(removed);
        assert_eq!(r.list_clients().len(), 0);
    }

    #[test]
    fn detach_client_returns_false_for_unknown() {
        let mut r = Registry::new();
        assert!(!r.detach_client("client-99"));
    }

    #[test]
    fn client_ids_are_sequential() {
        let mut r = Registry::new();
        let id1 = r.attach_client(1, "w1".to_string());
        let id2 = r.attach_client(2, "w2".to_string());
        assert_eq!(id1, "client-1");
        assert_eq!(id2, "client-2");
    }

    #[test]
    fn set_backend_updates_active_backend() {
        let mut r = Registry::new();
        assert!(matches!(r.active_backend, BackendKind::Node));
        r.set_backend(BackendKind::Container);
        assert!(matches!(r.active_backend, BackendKind::Container));
    }
}
