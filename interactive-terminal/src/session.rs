use crate::protocol::CommandRequest;
use std::collections::HashMap;
use std::time::{Duration, Instant};

// ---------------------------------------------------------------------------
// SessionManager
// ---------------------------------------------------------------------------

/// Tracks active command requests, connection state, and idle timeout.
///
/// Used by the bridge layer to manage the lifecycle of pending commands
/// and to decide when the application should exit due to inactivity.
pub struct SessionManager {
    /// Active requests indexed by their unique request ID.
    requests: HashMap<String, CommandRequest>,

    /// Whether a TCP client is currently connected.
    connected: bool,

    /// Timestamp of the last significant activity (request add/remove,
    /// connect/disconnect).
    last_activity_at: Instant,
}

impl SessionManager {
    /// Create a new `SessionManager`.
    ///
    /// `_idle_timeout` is accepted for API symmetry but the timeout check
    /// is performed via [`SessionManager::should_exit`].
    pub fn new(_idle_timeout: Duration) -> Self {
        Self {
            requests: HashMap::new(),
            connected: false,
            last_activity_at: Instant::now(),
        }
    }

    /// Store a new pending command request.
    pub fn add_request(&mut self, request: CommandRequest) {
        self.requests.insert(request.id.clone(), request);
        self.last_activity_at = Instant::now();
    }

    /// Remove and return a command request by ID.
    pub fn remove_request(&mut self, id: &str) -> Option<CommandRequest> {
        let removed = self.requests.remove(id);
        if removed.is_some() {
            self.last_activity_at = Instant::now();
        }
        removed
    }

    /// Look up a command request by ID without removing it.
    pub fn get_request(&self, id: &str) -> Option<&CommandRequest> {
        self.requests.get(id)
    }

    /// Number of currently tracked requests.
    pub fn active_count(&self) -> usize {
        self.requests.len()
    }

    /// Returns `true` if there are no pending requests.
    pub fn is_idle(&self) -> bool {
        self.requests.is_empty()
    }

    /// Timestamp of the most recent activity.
    pub fn last_activity(&self) -> Instant {
        self.last_activity_at
    }

    /// Whether the application should exit due to prolonged inactivity.
    ///
    /// Returns `true` when there are no pending requests **and** the time
    /// since the last activity exceeds `idle_timeout`.
    pub fn should_exit(&self, idle_timeout: Duration) -> bool {
        self.is_idle() && self.last_activity_at.elapsed() > idle_timeout
    }

    /// Drain all pending requests (e.g. on client disconnect).
    pub fn clear_all(&mut self) -> Vec<CommandRequest> {
        self.last_activity_at = Instant::now();
        self.requests.drain().map(|(_, v)| v).collect()
    }

    /// Update the connection state.
    pub fn set_connected(&mut self, connected: bool) {
        self.connected = connected;
        self.last_activity_at = Instant::now();
    }

    /// Whether a client is currently connected.
    pub fn is_connected(&self) -> bool {
        self.connected
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::CommandRequest;

    fn sample_request(id: &str) -> CommandRequest {
        CommandRequest {
            id: id.to_string(),
            command: "echo hello".into(),
            working_directory: "/tmp".into(),
            context: "test".into(),
            session_id: "default".into(),
            terminal_profile: crate::protocol::TerminalProfile::System,
            workspace_path: String::new(),
            venv_path: String::new(),
            activate_venv: false,
            timeout_seconds: 30,
        }
    }

    #[test]
    fn new_session_starts_idle() {
        let mgr = SessionManager::new(Duration::from_secs(300));
        assert_eq!(mgr.active_count(), 0);
        assert!(mgr.is_idle());
        assert!(!mgr.is_connected());
    }

    #[test]
    fn add_and_get_request() {
        let mut mgr = SessionManager::new(Duration::from_secs(300));
        mgr.add_request(sample_request("r1"));

        assert_eq!(mgr.active_count(), 1);
        assert!(!mgr.is_idle());

        let req = mgr.get_request("r1");
        assert!(req.is_some());
        assert_eq!(req.unwrap().command, "echo hello");

        assert!(mgr.get_request("nonexistent").is_none());
    }

    #[test]
    fn remove_request() {
        let mut mgr = SessionManager::new(Duration::from_secs(300));
        mgr.add_request(sample_request("r1"));
        mgr.add_request(sample_request("r2"));

        let removed = mgr.remove_request("r1");
        assert!(removed.is_some());
        assert_eq!(removed.unwrap().id, "r1");
        assert_eq!(mgr.active_count(), 1);

        // Removing nonexistent returns None.
        assert!(mgr.remove_request("r1").is_none());
    }

    #[test]
    fn clear_all_drains_requests() {
        let mut mgr = SessionManager::new(Duration::from_secs(300));
        mgr.add_request(sample_request("r1"));
        mgr.add_request(sample_request("r2"));
        mgr.add_request(sample_request("r3"));

        let drained = mgr.clear_all();
        assert_eq!(drained.len(), 3);
        assert!(mgr.is_idle());
        assert_eq!(mgr.active_count(), 0);
    }

    #[test]
    fn should_exit_only_when_idle_and_timed_out() {
        let mut mgr = SessionManager::new(Duration::from_secs(300));

        // Freshly created: idle but not timed out yet.
        assert!(!mgr.should_exit(Duration::from_secs(300)));

        // With a zero timeout, any idle time is enough.
        assert!(mgr.should_exit(Duration::ZERO));

        // Not idle when requests are pending, even with zero timeout.
        mgr.add_request(sample_request("r1"));
        assert!(!mgr.should_exit(Duration::ZERO));
    }

    #[test]
    fn connection_state_tracking() {
        let mut mgr = SessionManager::new(Duration::from_secs(300));
        assert!(!mgr.is_connected());

        mgr.set_connected(true);
        assert!(mgr.is_connected());

        mgr.set_connected(false);
        assert!(!mgr.is_connected());
    }

    #[test]
    fn last_activity_updates_on_mutations() {
        let mut mgr = SessionManager::new(Duration::from_secs(300));
        let t0 = mgr.last_activity();

        // Small sleep to ensure time moves forward.
        std::thread::sleep(Duration::from_millis(10));

        mgr.add_request(sample_request("r1"));
        let t1 = mgr.last_activity();
        assert!(t1 > t0);

        std::thread::sleep(Duration::from_millis(10));

        mgr.remove_request("r1");
        let t2 = mgr.last_activity();
        assert!(t2 > t1);
    }
}
