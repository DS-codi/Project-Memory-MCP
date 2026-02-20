use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// ─── ServiceId ────────────────────────────────────────────────────────────────

/// Identifies which managed service a runtime state entry belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ServiceId {
    Mcp,
    InteractiveTerminal,
    Dashboard,
}

// ─── ServiceState ─────────────────────────────────────────────────────────────

/// Connection lifecycle states for a managed service.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ServiceState {
    /// No connection has been attempted.
    Disconnected,
    /// Checking whether the service endpoint is reachable.
    Probing,
    /// TCP/IPC connection in progress.
    Connecting,
    /// Connected but awaiting protocol handshake / health confirmation.
    Verifying,
    /// Fully operational.
    Connected,
    /// Connection was lost; attempting to re-establish.
    Reconnecting,
}

// ─── ServiceRuntimeState ──────────────────────────────────────────────────────

/// Per-service runtime information tracked by the registry.
#[derive(Debug, Clone)]
pub struct ServiceRuntimeState {
    /// Which service this entry describes.
    pub id: ServiceId,
    /// Current connection lifecycle state.
    pub state: ServiceState,
    /// Active backend endpoint, e.g. `"tcp://localhost:3000"`.
    pub active_backend: Option<String>,
    /// Timestamp of the last successful health update.
    pub last_health: Option<std::time::Instant>,
    /// Most recent error message, if any.
    pub last_error: Option<String>,
    /// Wall-clock time when this entry was first created / service first started.
    pub started_at: Option<std::time::SystemTime>,
}

impl ServiceRuntimeState {
    /// Create a new entry for `id` with [`ServiceState::Disconnected`].
    pub fn new(id: ServiceId) -> Self {
        Self {
            id,
            state: ServiceState::Disconnected,
            active_backend: None,
            last_health: None,
            last_error: None,
            started_at: None,
        }
    }

    /// Returns `true` when the service is fully [`ServiceState::Connected`].
    pub fn is_healthy(&self) -> bool {
        self.state == ServiceState::Connected
    }

    /// Transition to `new_state` and record the current instant as `last_health`.
    pub fn transition(&mut self, new_state: ServiceState) {
        self.state = new_state;
        self.last_health = Some(std::time::Instant::now());
    }
}

// ─── ServiceRegistry ──────────────────────────────────────────────────────────

/// Centralised registry that tracks runtime state for all managed services.
pub struct ServiceRegistry {
    service_states: HashMap<ServiceId, ServiceRuntimeState>,
}

/// A thread-safe, shared handle to a [`ServiceRegistry`].
pub type SharedRegistry = Arc<Mutex<ServiceRegistry>>;

impl ServiceRegistry {
    /// Initialise the registry with all three services in
    /// [`ServiceState::Disconnected`].
    pub fn new() -> Self {
        let mut service_states = HashMap::new();
        for id in [
            ServiceId::Mcp,
            ServiceId::InteractiveTerminal,
            ServiceId::Dashboard,
        ] {
            service_states.insert(id, ServiceRuntimeState::new(id));
        }
        Self { service_states }
    }

    /// Wrap the registry in an `Arc<Mutex<…>>` for cross-thread sharing.
    pub fn shared() -> SharedRegistry {
        Arc::new(Mutex::new(Self::new()))
    }

    /// Return a reference to the runtime state for `id`, if present.
    pub fn get_state(&self, id: &ServiceId) -> Option<&ServiceRuntimeState> {
        self.service_states.get(id)
    }

    /// Transition the service identified by `id` to `new_state`.
    ///
    /// Calls [`ServiceRuntimeState::transition`], which also updates
    /// `last_health`.
    pub fn update_state(&mut self, id: ServiceId, new_state: ServiceState) {
        if let Some(entry) = self.service_states.get_mut(&id) {
            entry.transition(new_state);
        }
    }

    /// Set (or clear) the active backend endpoint for `id`.
    pub fn set_backend(&mut self, id: ServiceId, backend: Option<String>) {
        if let Some(entry) = self.service_states.get_mut(&id) {
            entry.active_backend = backend;
        }
    }

    /// Record an error message for `id` and clear any previous error.
    pub fn record_error(&mut self, id: ServiceId, error: String) {
        if let Some(entry) = self.service_states.get_mut(&id) {
            entry.last_error = Some(error);
        }
    }

    /// Returns `true` only when **every** registered service is
    /// [`ServiceState::Connected`].
    pub fn all_connected(&self) -> bool {
        self.service_states.values().all(|s| s.is_healthy())
    }
}

impl Default for ServiceRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_registry_has_all_services_disconnected() {
        let reg = ServiceRegistry::new();
        for id in [
            ServiceId::Mcp,
            ServiceId::InteractiveTerminal,
            ServiceId::Dashboard,
        ] {
            let state = reg.get_state(&id).expect("service should be present");
            assert_eq!(state.state, ServiceState::Disconnected);
            assert!(!state.is_healthy());
        }
    }

    #[test]
    fn all_connected_false_initially() {
        let reg = ServiceRegistry::new();
        assert!(!reg.all_connected());
    }

    #[test]
    fn all_connected_true_after_all_transition() {
        let mut reg = ServiceRegistry::new();
        for id in [
            ServiceId::Mcp,
            ServiceId::InteractiveTerminal,
            ServiceId::Dashboard,
        ] {
            reg.update_state(id, ServiceState::Connected);
        }
        assert!(reg.all_connected());
    }

    #[test]
    fn partial_connected_is_not_all_connected() {
        let mut reg = ServiceRegistry::new();
        reg.update_state(ServiceId::Mcp, ServiceState::Connected);
        reg.update_state(ServiceId::InteractiveTerminal, ServiceState::Connected);
        // Dashboard remains Disconnected
        assert!(!reg.all_connected());
    }

    #[test]
    fn update_state_transitions_correctly() {
        let mut reg = ServiceRegistry::new();
        reg.update_state(ServiceId::Mcp, ServiceState::Connecting);
        let s = reg.get_state(&ServiceId::Mcp).unwrap();
        assert_eq!(s.state, ServiceState::Connecting);
        assert!(!s.is_healthy());
        assert!(s.last_health.is_some(), "transition should record last_health");
    }

    #[test]
    fn set_backend_persists() {
        let mut reg = ServiceRegistry::new();
        reg.set_backend(ServiceId::Dashboard, Some("tcp://localhost:9000".into()));
        let s = reg.get_state(&ServiceId::Dashboard).unwrap();
        assert_eq!(s.active_backend.as_deref(), Some("tcp://localhost:9000"));
    }

    #[test]
    fn record_error_persists() {
        let mut reg = ServiceRegistry::new();
        reg.record_error(ServiceId::Mcp, "connection refused".into());
        let s = reg.get_state(&ServiceId::Mcp).unwrap();
        assert_eq!(s.last_error.as_deref(), Some("connection refused"));
    }

    #[test]
    fn shared_registry_is_arc_mutex() {
        let shared = ServiceRegistry::shared();
        {
            let mut reg = shared.lock().unwrap();
            reg.update_state(ServiceId::Mcp, ServiceState::Connected);
        }
        let reg = shared.lock().unwrap();
        assert!(reg.get_state(&ServiceId::Mcp).unwrap().is_healthy());
    }

    #[test]
    fn service_runtime_state_new_defaults() {
        let s = ServiceRuntimeState::new(ServiceId::InteractiveTerminal);
        assert_eq!(s.id, ServiceId::InteractiveTerminal);
        assert_eq!(s.state, ServiceState::Disconnected);
        assert!(s.active_backend.is_none());
        assert!(s.last_health.is_none());
        assert!(s.last_error.is_none());
        assert!(s.started_at.is_none());
    }

    // ── Additional tests ──────────────────────────────────────────────────────

    /// Walk all three services through every intermediate state and confirm
    /// `all_connected()` returns true only after the final transition.
    #[test]
    fn full_lifecycle_reaches_connected_for_all_services() {
        let all_ids = [
            ServiceId::Mcp,
            ServiceId::InteractiveTerminal,
            ServiceId::Dashboard,
        ];
        let lifecycle = [
            ServiceState::Probing,
            ServiceState::Connecting,
            ServiceState::Verifying,
            ServiceState::Connected,
        ];
        let mut reg = ServiceRegistry::new();
        assert!(!reg.all_connected(), "should not be connected before lifecycle starts");

        for id in all_ids {
            for state in lifecycle.iter() {
                reg.update_state(id, state.clone());
            }
            // After each full-lifecycle service the intermediate ones may still be Disconnected,
            // so only assert per-service health directly.
            let s = reg.get_state(&id).unwrap();
            assert_eq!(s.state, ServiceState::Connected);
            assert!(s.is_healthy());
            assert!(s.last_health.is_some(), "last_health must be set after transition");
        }

        assert!(
            reg.all_connected(),
            "all services should be Connected after completing the full lifecycle"
        );
    }

    /// Two services Connected, one still Reconnecting → `all_connected()` == false.
    #[test]
    fn partial_connected_reconnecting_prevents_all_connected() {
        let mut reg = ServiceRegistry::new();
        reg.update_state(ServiceId::Mcp, ServiceState::Connected);
        reg.update_state(ServiceId::InteractiveTerminal, ServiceState::Connected);
        reg.update_state(ServiceId::Dashboard, ServiceState::Reconnecting);

        assert!(
            !reg.all_connected(),
            "Reconnecting service must prevent all_connected from returning true"
        );

        let s = reg.get_state(&ServiceId::Dashboard).unwrap();
        assert_eq!(s.state, ServiceState::Reconnecting);
        assert!(!s.is_healthy());
    }

    /// Spawn multiple reader and writer threads against a SharedRegistry.
    /// The test passes if no thread panics and no deadlock occurs.
    #[test]
    fn concurrent_registry_access_no_deadlock_no_panic() {
        use std::sync::Arc;
        use std::thread;

        let shared = ServiceRegistry::shared();
        let mut handles = Vec::new();

        // 4 writer threads — each transitions all services to Connected
        for _ in 0..4 {
            let reg = Arc::clone(&shared);
            handles.push(thread::spawn(move || {
                for id in [
                    ServiceId::Mcp,
                    ServiceId::InteractiveTerminal,
                    ServiceId::Dashboard,
                ] {
                    let mut r = reg.lock().unwrap();
                    r.update_state(id, ServiceState::Connected);
                }
            }));
        }

        // 4 reader threads — each reads state for all services
        for _ in 0..4 {
            let reg = Arc::clone(&shared);
            handles.push(thread::spawn(move || {
                for id in [
                    ServiceId::Mcp,
                    ServiceId::InteractiveTerminal,
                    ServiceId::Dashboard,
                ] {
                    let r = reg.lock().unwrap();
                    let _ = r.get_state(&id);
                    let _ = r.all_connected();
                }
            }));
        }

        for h in handles {
            h.join().expect("thread should not panic");
        }
    }

    /// Setting an error and then transitioning to Connected must NOT clear `last_error`.
    #[test]
    fn error_survives_transition_to_connected() {
        let mut reg = ServiceRegistry::new();
        reg.record_error(ServiceId::InteractiveTerminal, "handshake timeout".into());
        reg.update_state(ServiceId::InteractiveTerminal, ServiceState::Connected);

        let s = reg.get_state(&ServiceId::InteractiveTerminal).unwrap();
        assert_eq!(s.state, ServiceState::Connected);
        assert!(s.is_healthy());
        assert_eq!(
            s.last_error.as_deref(),
            Some("handshake timeout"),
            "last_error must not be cleared by a state transition"
        );
    }

    /// `set_backend` stores a URL; setting `None` afterwards clears it.
    #[test]
    fn set_backend_stores_and_clears() {
        let mut reg = ServiceRegistry::new();

        // initial state: no backend
        assert!(reg.get_state(&ServiceId::Mcp).unwrap().active_backend.is_none());

        // set a backend URL
        reg.set_backend(ServiceId::Mcp, Some("tcp://localhost:3000".into()));
        assert_eq!(
            reg.get_state(&ServiceId::Mcp).unwrap().active_backend.as_deref(),
            Some("tcp://localhost:3000")
        );

        // clear the backend
        reg.set_backend(ServiceId::Mcp, None);
        assert!(
            reg.get_state(&ServiceId::Mcp).unwrap().active_backend.is_none(),
            "active_backend should be None after set_backend(None)"
        );
    }
}
