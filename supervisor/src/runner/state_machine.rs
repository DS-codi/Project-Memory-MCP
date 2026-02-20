//! Connection state machine for a single supervised service.
//!
//! [`ServiceStateMachine`] models the full life-cycle of a connection attempt:
//!
//! ```text
//! Disconnected ──timer/on_start──► Probing
//!     ▲                               │ on_probe_success
//!     │                               ▼
//! Reconnecting ◄──on_failure──── Connecting
//!     │                               │ on_process_ready
//!     │ on_retry_elapsed              ▼
//!     └──────────────────────── Verifying
//!                                     │ on_health_ok
//!                                     ▼
//!                                 Connected
//!                                     │ on_failure
//!                                     ▼
//!                                Reconnecting
//! ```
//!
//! Failures from `Probing`, `Connecting`, or `Verifying` all transition to
//! `Reconnecting` (via [`on_probe_failure`](ServiceStateMachine::on_probe_failure)).
//! A failure while `Connected` uses [`on_failure`](ServiceStateMachine::on_failure).
//!
//! The caller is responsible for:
//! - scheduling a timer that fires after `Reconnecting.retry_after_ms`
//! - calling [`on_retry_elapsed`](ServiceStateMachine::on_retry_elapsed) when that timer fires
//! - checking [`should_give_up`](ServiceStateMachine::should_give_up) to honour max-attempt policy

use tracing::{debug, error, info, warn};
use crate::config::{ReconnectSection, RestartPolicy};
use super::backoff::BackoffState;

// ---------------------------------------------------------------------------
// State enum
// ---------------------------------------------------------------------------

/// All possible connection states for a supervised service.
#[derive(Debug, Clone, PartialEq)]
pub enum ConnectionState {
    /// Service has never been started or was explicitly stopped.
    Disconnected,
    /// Checking whether the service endpoint / process is reachable.
    Probing,
    /// Probe succeeded; waiting for the socket / process to become ready.
    Connecting,
    /// Socket/process is ready; performing a health check.
    Verifying,
    /// Service is healthy and serving requests.
    Connected,
    /// A failure occurred; waiting `retry_after_ms` before probing again.
    Reconnecting {
        /// Milliseconds to wait before transitioning back to `Probing`.
        retry_after_ms: u64,
    },
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/// Drives the [`ConnectionState`] life-cycle for a single service.
///
/// The state machine is **pure** — it does not spawn timers or execute I/O.
/// Callers read the current state and schedule the appropriate async work,
/// then call the relevant `on_*` method to advance the machine.
pub struct ServiceStateMachine {
    state: ConnectionState,
    backoff: BackoffState,
    /// Maximum reconnect attempts before [`should_give_up`] returns `true`.
    /// A value of `0` means unlimited.
    max_attempts: u32,
    /// Cumulative number of failed connection attempts.
    attempt_count: u32,
    /// Human-readable identifier for the service this machine manages.
    /// Used as a structured field on every tracing event.
    service_id: String,
    /// Controls whether (and when) the service is automatically restarted
    /// after a failure or disconnect.
    restart_policy: RestartPolicy,
}

impl ServiceStateMachine {
    /// Create a new state machine starting in [`Disconnected`](ConnectionState::Disconnected).
    ///
    /// `service_id` is an identifier string included in every structured log
    /// event emitted by this machine (e.g. `"mcp"`, `"dashboard"`).
    pub fn new(reconnect_config: &ReconnectSection, service_id: &str, restart_policy: RestartPolicy) -> Self {
        Self {
            state: ConnectionState::Disconnected,
            backoff: BackoffState::from_config(reconnect_config),
            max_attempts: reconnect_config.max_attempts,
            attempt_count: 0,
            service_id: service_id.to_owned(),
            restart_policy,
        }
    }

    /// Current connection state.
    pub fn state(&self) -> &ConnectionState {
        &self.state
    }

    /// Total number of failed attempts since construction or last successful
    /// connection (reset on [`on_health_ok`](ServiceStateMachine::on_health_ok)).
    pub fn attempt_count(&self) -> u32 {
        self.attempt_count
    }

    // -----------------------------------------------------------------------
    // Transition methods
    // -----------------------------------------------------------------------

    /// Manual start / retry trigger.
    ///
    /// Valid from: `Disconnected`, `Reconnecting`.  
    /// Transitions to: `Probing`.
    pub fn on_start(&mut self) {
        if matches!(
            self.state,
            ConnectionState::Disconnected | ConnectionState::Reconnecting { .. }
        ) {
            let old_state = self.state.clone();
            self.state = ConnectionState::Probing;
            info!(
                service_id = %self.service_id,
                old_state = ?old_state,
                new_state = ?self.state,
                reason = "service_start",
                "state_transition"
            );
        }
    }

    /// Probe responded positively.
    ///
    /// Valid from: `Probing`.  
    /// Transitions to: `Connecting`.
    pub fn on_probe_success(&mut self) {
        if self.state == ConnectionState::Probing {
            let old_state = self.state.clone();
            self.state = ConnectionState::Connecting;
            debug!(
                service_id = %self.service_id,
                old_state = ?old_state,
                new_state = ?self.state,
                reason = "probe_success",
                "state_transition"
            );
        }
    }

    /// Probe (or early-stage connection) failed.
    ///
    /// Valid from: `Probing`, `Connecting`, `Verifying`.  
    /// Transitions to: `Reconnecting { retry_after_ms }` using the back-off,
    /// or `Disconnected` if the restart policy is `NeverRestart`.
    pub fn on_probe_failure(&mut self) {
        let should_transition = matches!(
            self.state,
            ConnectionState::Probing
                | ConnectionState::Connecting
                | ConnectionState::Verifying
        );
        if should_transition {
            let old_state = self.state.clone();
            self.attempt_count += 1;

            if self.restart_policy == RestartPolicy::NeverRestart {
                self.state = ConnectionState::Disconnected;
                warn!(
                    service_id = %self.service_id,
                    old_state = ?old_state,
                    new_state = ?self.state,
                    reason = "probe_failure_never_restart",
                    "state_transition"
                );
                return;
            }

            let delay = self.backoff.next_delay_ms();
            self.state = ConnectionState::Reconnecting {
                retry_after_ms: delay,
            };
            if self.should_give_up() {
                error!(
                    service_id = %self.service_id,
                    old_state = ?old_state,
                    new_state = ?self.state,
                    attempt_count = self.attempt_count,
                    max_attempts = self.max_attempts,
                    reason = "max_attempts_reached",
                    "state_transition"
                );
            } else {
                warn!(
                    service_id = %self.service_id,
                    old_state = ?old_state,
                    new_state = ?self.state,
                    attempt_count = self.attempt_count,
                    retry_after_ms = delay,
                    reason = "probe_failure",
                    "state_transition"
                );
            }
        }
    }

    /// The underlying socket / process signalled it is ready for health checks.
    ///
    /// Valid from: `Connecting`.  
    /// Transitions to: `Verifying`.
    pub fn on_process_ready(&mut self) {
        if self.state == ConnectionState::Connecting {
            let old_state = self.state.clone();
            self.state = ConnectionState::Verifying;
            debug!(
                service_id = %self.service_id,
                old_state = ?old_state,
                new_state = ?self.state,
                reason = "process_ready",
                "state_transition"
            );
        }
    }

    /// Health check returned a valid response.
    ///
    /// Valid from: `Verifying`.  
    /// Transitions to: `Connected`; also resets the back-off accumulator and
    /// `attempt_count`.
    pub fn on_health_ok(&mut self) {
        if self.state == ConnectionState::Verifying {
            let old_state = self.state.clone();
            self.backoff.reset();
            self.attempt_count = 0;
            self.state = ConnectionState::Connected;
            info!(
                service_id = %self.service_id,
                old_state = ?old_state,
                new_state = ?self.state,
                reason = "health_ok",
                "state_transition"
            );
        }
    }

    /// An IO or health-check failure occurred on an established connection.
    ///
    /// Valid from: `Connected`, `Verifying`.  
    /// Transitions to: `Reconnecting { retry_after_ms }` using the back-off,
    /// or `Disconnected` if the restart policy is `NeverRestart`.
    pub fn on_failure(&mut self) {
        let should_transition = matches!(
            self.state,
            ConnectionState::Connected | ConnectionState::Verifying
        );
        if should_transition {
            let old_state = self.state.clone();
            self.attempt_count += 1;

            if self.restart_policy == RestartPolicy::NeverRestart {
                self.state = ConnectionState::Disconnected;
                warn!(
                    service_id = %self.service_id,
                    old_state = ?old_state,
                    new_state = ?self.state,
                    reason = "failure_never_restart",
                    "state_transition"
                );
                return;
            }

            let delay = self.backoff.next_delay_ms();
            self.state = ConnectionState::Reconnecting {
                retry_after_ms: delay,
            };
            if self.should_give_up() {
                error!(
                    service_id = %self.service_id,
                    old_state = ?old_state,
                    new_state = ?self.state,
                    attempt_count = self.attempt_count,
                    max_attempts = self.max_attempts,
                    reason = "max_attempts_reached",
                    "state_transition"
                );
            } else {
                warn!(
                    service_id = %self.service_id,
                    old_state = ?old_state,
                    new_state = ?self.state,
                    retry_after_ms = delay,
                    reason = "connection_failure",
                    "state_transition"
                );
            }
        }
    }

    /// The retry timer elapsed — time to probe again.
    ///
    /// Valid from: `Reconnecting`.  
    /// Transitions to: `Probing`.
    pub fn on_retry_elapsed(&mut self) {
        if matches!(self.state, ConnectionState::Reconnecting { .. }) {
            let old_state = self.state.clone();
            self.state = ConnectionState::Probing;
            info!(
                service_id = %self.service_id,
                old_state = ?old_state,
                new_state = ?self.state,
                reason = "retry_elapsed",
                "state_transition"
            );
        }
    }

    /// Forcefully disconnect the service (e.g. user-initiated stop).
    ///
    /// Valid from: any state.  
    /// Transitions to: `Disconnected`; resets back-off and attempt counter.
    pub fn on_disconnect(&mut self) {
        let old_state = self.state.clone();
        self.backoff.reset();
        self.attempt_count = 0;
        self.state = ConnectionState::Disconnected;
        info!(
            service_id = %self.service_id,
            old_state = ?old_state,
            new_state = ?self.state,
            reason = "explicit_disconnect",
            "state_transition"
        );
    }

    // -----------------------------------------------------------------------
    // Policy helpers
    // -----------------------------------------------------------------------

    /// Returns `true` when `max_attempts > 0` and the cumulative failure
    /// count has reached or exceeded `max_attempts`.
    ///
    /// The caller should stop scheduling retries and transition to
    /// `Disconnected` (via [`on_disconnect`](ServiceStateMachine::on_disconnect))
    /// when this returns `true`.
    pub fn should_give_up(&self) -> bool {
        self.max_attempts > 0 && self.attempt_count >= self.max_attempts
    }
}

// ---------------------------------------------------------------------------
// ServiceState bridge
// ---------------------------------------------------------------------------

/// Lossless conversion from the runner-layer [`ConnectionState`] to the
/// lifecycle-registry [`crate::registry::ServiceState`].
///
/// Used by Epic D wiring to propagate state-machine transitions into the
/// shared `ServiceRegistry` so control-API consumers see up-to-date lifecycle
/// state.
impl From<ConnectionState> for crate::registry::ServiceState {
    fn from(cs: ConnectionState) -> Self {
        match cs {
            ConnectionState::Disconnected        => crate::registry::ServiceState::Disconnected,
            ConnectionState::Probing             => crate::registry::ServiceState::Probing,
            ConnectionState::Connecting          => crate::registry::ServiceState::Connecting,
            ConnectionState::Verifying           => crate::registry::ServiceState::Verifying,
            ConnectionState::Connected           => crate::registry::ServiceState::Connected,
            ConnectionState::Reconnecting { .. } => crate::registry::ServiceState::Reconnecting,
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_sm() -> ServiceStateMachine {
        let config = ReconnectSection::default();
        ServiceStateMachine::new(&config, "test-service", RestartPolicy::AlwaysRestart)
    }

    // -----------------------------------------------------------------------
    // Happy path: Disconnected → Connected
    // -----------------------------------------------------------------------

    #[test]
    fn happy_path_reaches_connected() {
        let mut sm = make_sm();
        assert_eq!(*sm.state(), ConnectionState::Disconnected);

        sm.on_start();
        assert_eq!(*sm.state(), ConnectionState::Probing);

        sm.on_probe_success();
        assert_eq!(*sm.state(), ConnectionState::Connecting);

        sm.on_process_ready();
        assert_eq!(*sm.state(), ConnectionState::Verifying);

        sm.on_health_ok();
        assert_eq!(*sm.state(), ConnectionState::Connected);
        assert_eq!(sm.attempt_count(), 0, "successful connect should reset attempt count");
    }

    // -----------------------------------------------------------------------
    // Failure paths
    // -----------------------------------------------------------------------

    #[test]
    fn probe_failure_from_probing_goes_reconnecting() {
        let mut sm = make_sm();
        sm.on_start(); // → Probing
        sm.on_probe_failure(); // → Reconnecting
        assert!(matches!(*sm.state(), ConnectionState::Reconnecting { .. }));
        assert_eq!(sm.attempt_count(), 1);
    }

    #[test]
    fn probe_failure_from_connecting_goes_reconnecting() {
        let mut sm = make_sm();
        sm.on_start();
        sm.on_probe_success(); // → Connecting
        sm.on_probe_failure(); // → Reconnecting
        assert!(matches!(*sm.state(), ConnectionState::Reconnecting { .. }));
    }

    #[test]
    fn probe_failure_from_verifying_goes_reconnecting() {
        let mut sm = make_sm();
        sm.on_start();
        sm.on_probe_success();
        sm.on_process_ready(); // → Verifying
        sm.on_probe_failure(); // → Reconnecting
        assert!(matches!(*sm.state(), ConnectionState::Reconnecting { .. }));
    }

    #[test]
    fn on_failure_from_connected_goes_reconnecting() {
        let mut sm = make_sm();
        sm.on_start();
        sm.on_probe_success();
        sm.on_process_ready();
        sm.on_health_ok(); // → Connected
        sm.on_failure();   // → Reconnecting
        assert!(matches!(*sm.state(), ConnectionState::Reconnecting { .. }));
        assert_eq!(sm.attempt_count(), 1);
    }

    // -----------------------------------------------------------------------
    // Retry cycle
    // -----------------------------------------------------------------------

    #[test]
    fn retry_cycle_returns_to_probing() {
        let mut sm = make_sm();
        sm.on_start();
        sm.on_probe_failure(); // → Reconnecting
        sm.on_retry_elapsed(); // → Probing
        assert_eq!(*sm.state(), ConnectionState::Probing);
    }

    // -----------------------------------------------------------------------
    // Backoff reset on success
    // -----------------------------------------------------------------------

    #[test]
    fn health_ok_resets_attempt_count() {
        let mut sm = make_sm();
        sm.on_start();
        sm.on_probe_failure(); // attempt 1
        sm.on_retry_elapsed();
        sm.on_probe_success();
        sm.on_process_ready();
        sm.on_health_ok(); // resets
        assert_eq!(sm.attempt_count(), 0);
    }

    // -----------------------------------------------------------------------
    // Disconnect
    // -----------------------------------------------------------------------

    #[test]
    fn on_disconnect_from_any_state_goes_disconnected() {
        let mut sm = make_sm();
        sm.on_start();
        sm.on_probe_success();
        sm.on_process_ready();
        sm.on_health_ok(); // Connected
        sm.on_failure();   // Reconnecting
        sm.on_disconnect(); // Disconnected
        assert_eq!(*sm.state(), ConnectionState::Disconnected);
        assert_eq!(sm.attempt_count(), 0);
    }

    // -----------------------------------------------------------------------
    // should_give_up
    // -----------------------------------------------------------------------

    #[test]
    fn should_give_up_unlimited() {
        let sm = make_sm(); // max_attempts = 0 → unlimited
        assert!(!sm.should_give_up());
    }

    #[test]
    fn should_give_up_limited() {
        let config = ReconnectSection {
            initial_delay_ms: 500,
            max_delay_ms: 30_000,
            multiplier: 2.0,
            max_attempts: 2,
            jitter_ratio: 0.2,
        };
        let mut sm = ServiceStateMachine::new(&config, "test-service", RestartPolicy::AlwaysRestart);
        sm.on_start();
        sm.on_probe_failure(); // attempt 1
        assert!(!sm.should_give_up());
        sm.on_retry_elapsed();
        sm.on_probe_failure(); // attempt 2
        assert!(sm.should_give_up());
    }

    // -----------------------------------------------------------------------
    // Guard: invalid transitions are no-ops
    // -----------------------------------------------------------------------

    #[test]
    fn probe_success_noop_if_not_probing() {
        let mut sm = make_sm();
        // Still Disconnected
        sm.on_probe_success();
        assert_eq!(*sm.state(), ConnectionState::Disconnected);
    }

    #[test]
    fn on_failure_noop_if_disconnected() {
        let mut sm = make_sm();
        sm.on_failure();
        assert_eq!(*sm.state(), ConnectionState::Disconnected);
    }

    #[test]
    fn retry_elapsed_noop_if_not_reconnecting() {
        let mut sm = make_sm();
        sm.on_start(); // Probing
        sm.on_retry_elapsed();
        assert_eq!(*sm.state(), ConnectionState::Probing, "should remain Probing");
    }

    // -----------------------------------------------------------------------
    // RestartPolicy tests
    // -----------------------------------------------------------------------

    fn make_sm_with_policy(policy: RestartPolicy) -> ServiceStateMachine {
        let config = ReconnectSection::default();
        ServiceStateMachine::new(&config, "policy-svc", policy)
    }

    #[test]
    fn never_restart_on_probe_failure_goes_disconnected() {
        let mut sm = make_sm_with_policy(RestartPolicy::NeverRestart);
        sm.on_start(); // → Probing
        sm.on_probe_failure(); // → Disconnected (not Reconnecting)
        assert_eq!(
            *sm.state(),
            ConnectionState::Disconnected,
            "NeverRestart: on_probe_failure should go to Disconnected"
        );
    }

    #[test]
    fn never_restart_on_failure_from_connected_goes_disconnected() {
        let mut sm = make_sm_with_policy(RestartPolicy::NeverRestart);
        sm.on_start();
        sm.on_probe_success();
        sm.on_process_ready();
        sm.on_health_ok(); // → Connected
        sm.on_failure();   // → Disconnected (not Reconnecting)
        assert_eq!(
            *sm.state(),
            ConnectionState::Disconnected,
            "NeverRestart: on_failure should go to Disconnected"
        );
    }

    #[test]
    fn always_restart_on_probe_failure_goes_reconnecting() {
        let mut sm = make_sm_with_policy(RestartPolicy::AlwaysRestart);
        sm.on_start();
        sm.on_probe_failure();
        assert!(
            matches!(*sm.state(), ConnectionState::Reconnecting { .. }),
            "AlwaysRestart: on_probe_failure should go to Reconnecting"
        );
    }

    #[test]
    fn always_restart_on_failure_goes_reconnecting() {
        let mut sm = make_sm_with_policy(RestartPolicy::AlwaysRestart);
        sm.on_start();
        sm.on_probe_success();
        sm.on_process_ready();
        sm.on_health_ok(); // → Connected
        sm.on_failure();
        assert!(
            matches!(*sm.state(), ConnectionState::Reconnecting { .. }),
            "AlwaysRestart: on_failure should go to Reconnecting"
        );
    }
}
