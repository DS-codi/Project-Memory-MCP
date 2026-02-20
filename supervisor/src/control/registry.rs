//! Service registry and client registry for the control plane.
//!
//! [`Registry`] tracks the runtime state of every managed service and the set
//! of VS Code windows currently attached to this supervisor.

use std::collections::{HashMap, VecDeque};
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
    /// Unix timestamp (seconds) of the most recent successful health check.
    pub last_health: Option<u64>,
}

// ---------------------------------------------------------------------------
// Health snapshot (returned by service_health query)
// ---------------------------------------------------------------------------

/// Full health snapshot for a single service, returned by the
/// `ServiceHealth` control-plane query.
#[derive(Debug, Clone, Serialize)]
pub struct ServiceHealth {
    pub service: String,
    /// Human-readable connection state (e.g. `"running"`, `"reconnecting"`).
    pub state: String,
    /// Unix timestamp (seconds) of the last successful health check, or `null`.
    pub last_health: Option<u64>,
    /// Most recent error string, or `null`.
    pub last_error: Option<String>,
    /// Active backend (`"node"` or `"container"`).
    pub backend: String,
}

// ---------------------------------------------------------------------------
// State event
// ---------------------------------------------------------------------------

/// A single state-machine transition event, stored in the ring buffer.
#[derive(Debug, Clone, Serialize)]
pub struct StateEvent {
    pub service: String,
    pub old_state: String,
    pub new_state: String,
    pub reason: String,
    pub timestamp: u64,
}

/// Maximum number of state events retained in the ring buffer.
const MAX_EVENTS: usize = 200;

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
    /// IDs of MCP sessions currently active for this client.
    pub active_session_ids: Vec<String>,
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
    event_log: VecDeque<StateEvent>,
    /// Whether an upgrade has been requested but not yet completed.
    upgrade_pending: bool,
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
                    last_health: None,
                },
            );
        }
        Self {
            services,
            active_backend: BackendKind::Node,
            clients: HashMap::new(),
            next_client_id: 1,
            event_log: VecDeque::new(),
            upgrade_pending: false,
        }
    }

    /// Create a registry pre-populated with all known managed services and
    /// the active backend pre-set from the loaded config.
    pub fn with_backend(backend: BackendKind) -> Self {
        let mut r = Self::new();
        r.active_backend = backend;
        r
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

    /// Record a successful health check for a service, updating `last_health`
    /// to the current Unix timestamp.
    pub fn set_service_health_ok(&mut self, name: &str) {
        if let Some(entry) = self.services.get_mut(name) {
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            entry.last_health = Some(ts);
        }
    }

    /// Record a service error string, clearing any previous `last_error`.
    pub fn set_service_error(&mut self, name: &str, error: String) {
        if let Some(entry) = self.services.get_mut(name) {
            entry.last_error = Some(error);
        }
    }

    /// Return a full [`ServiceHealth`] snapshot for `name`, or `None` if the
    /// service is not tracked.
    pub fn service_health(&self, name: &str) -> Option<ServiceHealth> {
        let entry = self.services.get(name)?;
        let backend = format!("{:?}", self.active_backend).to_lowercase();
        Some(ServiceHealth {
            service: entry.name.clone(),
            state: format!("{:?}", entry.status).to_lowercase(),
            last_health: entry.last_health,
            last_error: entry.last_error.clone(),
            backend,
        })
    }

    /// Append a state-transition event to the ring buffer, evicting the oldest
    /// entry when the buffer exceeds [`MAX_EVENTS`].
    pub fn push_state_event(
        &mut self,
        service: &str,
        old_state: &str,
        new_state: &str,
        reason: &str,
    ) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        self.event_log.push_back(StateEvent {
            service: service.to_owned(),
            old_state: old_state.to_owned(),
            new_state: new_state.to_owned(),
            reason: reason.to_owned(),
            timestamp,
        });
        while self.event_log.len() > MAX_EVENTS {
            self.event_log.pop_front();
        }
    }

    /// Return up to `limit` of the most-recent state events for `service`.
    pub fn state_events(&self, service: &str, limit: usize) -> Vec<StateEvent> {
        let filtered: Vec<StateEvent> = self
            .event_log
            .iter()
            .filter(|e| e.service == service)
            .cloned()
            .collect();
        let start = filtered.len().saturating_sub(limit);
        filtered[start..].to_vec()
    }

    /// Change the active backend and record it.
    pub fn set_backend(&mut self, backend: BackendKind) {
        self.active_backend = backend;
    }

    /// Mark whether an MCP upgrade is pending.
    pub fn set_upgrade_pending(&mut self, pending: bool) {
        self.upgrade_pending = pending;
    }

    /// Return `true` if an MCP upgrade has been requested but not yet completed.
    pub fn is_upgrade_pending(&self) -> bool {
        self.upgrade_pending
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
                active_session_ids: Vec::new(),
            },
        );
        client_id
    }

    /// Associate a session ID with an existing client.
    ///
    /// Returns `true` if the client was found (and the session was appended),
    /// `false` if no client with that ID exists.
    pub fn add_session_to_client(&mut self, client_id: &str, session_id: String) -> bool {
        match self.clients.get_mut(client_id) {
            Some(entry) => {
                entry.active_session_ids.push(session_id);
                true
            }
            None => false,
        }
    }

    /// Remove a session ID from a client's active session list.
    ///
    /// Returns `true` if the session was found and removed, `false` if either
    /// the client or the session was not present.
    pub fn remove_session_from_client(&mut self, client_id: &str, session_id: &str) -> bool {
        match self.clients.get_mut(client_id) {
            Some(entry) => {
                if let Some(pos) = entry.active_session_ids.iter().position(|s| s == session_id) {
                    entry.active_session_ids.remove(pos);
                    true
                } else {
                    false
                }
            }
            None => false,
        }
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
    fn newly_attached_client_has_empty_session_ids() {
        let mut r = Registry::new();
        let id = r.attach_client(42, "win-42".to_string());
        let clients = r.list_clients();
        let entry = clients.iter().find(|c| c.client_id == id).unwrap();
        assert!(entry.active_session_ids.is_empty());
    }

    #[test]
    fn add_session_to_client_appends_session() {
        let mut r = Registry::new();
        let id = r.attach_client(10, "win-10".to_string());
        let found = r.add_session_to_client(&id, "sess-abc".to_string());
        assert!(found);
        let clients = r.list_clients();
        let entry = clients.iter().find(|c| c.client_id == id).unwrap();
        assert_eq!(entry.active_session_ids, vec!["sess-abc"]);
    }

    #[test]
    fn add_session_returns_false_for_unknown_client() {
        let mut r = Registry::new();
        let found = r.add_session_to_client("client-99", "sess-x".to_string());
        assert!(!found);
    }

    #[test]
    fn remove_session_from_client_removes_and_returns_true() {
        let mut r = Registry::new();
        let id = r.attach_client(20, "win-20".to_string());
        r.add_session_to_client(&id, "sess-1".to_string());
        r.add_session_to_client(&id, "sess-2".to_string());
        let removed = r.remove_session_from_client(&id, "sess-1");
        assert!(removed);
        let clients = r.list_clients();
        let entry = clients.iter().find(|c| c.client_id == id).unwrap();
        assert_eq!(entry.active_session_ids, vec!["sess-2"]);
    }

    #[test]
    fn remove_session_returns_false_for_unknown_session() {
        let mut r = Registry::new();
        let id = r.attach_client(30, "win-30".to_string());
        r.add_session_to_client(&id, "sess-1".to_string());
        let removed = r.remove_session_from_client(&id, "sess-999");
        assert!(!removed);
        // Original session still there
        let clients = r.list_clients();
        let entry = clients.iter().find(|c| c.client_id == id).unwrap();
        assert_eq!(entry.active_session_ids.len(), 1);
    }

    #[test]
    fn remove_session_returns_false_for_unknown_client() {
        let mut r = Registry::new();
        let removed = r.remove_session_from_client("client-99", "sess-1");
        assert!(!removed);
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

    // -----------------------------------------------------------------------
    // ServiceHealth tests
    // -----------------------------------------------------------------------

    #[test]
    fn service_health_returns_none_for_unknown() {
        let r = Registry::new();
        assert!(r.service_health("unknown").is_none());
    }

    #[test]
    fn service_health_returns_last_health_after_set() {
        let mut r = Registry::new();
        r.set_service_health_ok("mcp");
        let h = r.service_health("mcp").expect("should have health");
        assert!(h.last_health.is_some(), "last_health should be set");
        assert!(h.last_health.unwrap() > 0);
        assert_eq!(h.service, "mcp");
    }

    #[test]
    fn set_service_error_sets_last_error() {
        let mut r = Registry::new();
        r.set_service_error("mcp", "connection timeout".to_string());
        let h = r.service_health("mcp").expect("should have health");
        assert_eq!(h.last_error.as_deref(), Some("connection timeout"));
    }

    #[test]
    fn service_health_ignores_unknown_service() {
        let mut r = Registry::new();
        r.set_service_health_ok("nonexistent"); // should not panic
        r.set_service_error("nonexistent", "err".to_string()); // should not panic
    }

    // -----------------------------------------------------------------------
    // StateEvent tests
    // -----------------------------------------------------------------------

    #[test]
    fn state_events_initially_empty() {
        let r = Registry::new();
        assert!(r.state_events("mcp", 50).is_empty());
    }

    #[test]
    fn push_state_event_and_query() {
        let mut r = Registry::new();
        r.push_state_event("mcp", "Stopped", "Starting", "service_start");
        r.push_state_event("mcp", "Starting", "Connected", "health_ok");
        let evts = r.state_events("mcp", 50);
        assert_eq!(evts.len(), 2);
        assert_eq!(evts[0].old_state, "Stopped");
        assert_eq!(evts[0].reason, "service_start");
        assert_eq!(evts[1].new_state, "Connected");
    }

    #[test]
    fn state_events_filters_by_service() {
        let mut r = Registry::new();
        r.push_state_event("mcp", "Stopped", "Starting", "service_start");
        r.push_state_event("dashboard", "Stopped", "Running", "service_start");
        assert_eq!(r.state_events("mcp", 50).len(), 1);
        assert_eq!(r.state_events("dashboard", 50).len(), 1);
        assert_eq!(r.state_events("mcp", 50)[0].service, "mcp");
    }

    #[test]
    fn state_events_limit_respected() {
        let mut r = Registry::new();
        for i in 0..10usize {
            r.push_state_event("mcp", "A", "B", &format!("reason_{i}"));
        }
        let evts = r.state_events("mcp", 3);
        assert_eq!(evts.len(), 3);
        // Should return the last 3
        assert_eq!(evts[0].reason, "reason_7");
        assert_eq!(evts[2].reason, "reason_9");
    }

    #[test]
    fn state_events_capped_at_max_events() {
        let mut r = Registry::new();
        // Push more than MAX_EVENTS (200) events
        for i in 0..250usize {
            r.push_state_event("mcp", "A", "B", &format!("reason_{i}"));
        }
        // The ring buffer should never exceed MAX_EVENTS
        let all = r.state_events("mcp", 300);
        assert_eq!(all.len(), 200, "ring buffer should cap at MAX_EVENTS=200");
        // Oldest events (0..49) should have been evicted
        assert_eq!(all[0].reason, "reason_50", "oldest 50 should be evicted");
        assert_eq!(all[199].reason, "reason_249");
    }

    // -----------------------------------------------------------------------
    // upgrade_pending tests
    // -----------------------------------------------------------------------

    #[test]
    fn upgrade_pending_defaults_to_false() {
        let r = Registry::new();
        assert!(!r.is_upgrade_pending());
    }

    #[test]
    fn set_upgrade_pending_true_then_false() {
        let mut r = Registry::new();
        r.set_upgrade_pending(true);
        assert!(r.is_upgrade_pending());
        r.set_upgrade_pending(false);
        assert!(!r.is_upgrade_pending());
    }
}
