//! Exponential back-off with jitter for reconnection logic.
//!
//! [`BackoffState`] tracks how long the supervisor should wait before the
//! next probe attempt.  The delay grows exponentially from `initial_delay_ms`
//! up to `max_delay_ms`, and each computed value has a randomised jitter added
//! so that multiple services do not thunder-herd when recovering simultaneously.

use crate::config::ReconnectSection;

/// Exponential back-off with jitter state.
///
/// # Algorithm (`next_delay_ms`)
///
/// 1. Take `current_delay_ms` as the base.
/// 2. Add jitter: `base * jitter_ratio * rand_f64` (uniformly sampled from [0, 1)).
/// 3. Clamp the returned value to `max_delay_ms`.
/// 4. Advance internal state: multiply base by `multiplier`, cap at `max_delay_ms`.
/// 5. Increment `attempts`.
///
/// After [`reset`](BackoffState::reset) the state returns to the initial values
/// and `attempts` is zeroed.
pub struct BackoffState {
    current_delay_ms: u64,
    initial_delay_ms: u64,
    max_delay_ms: u64,
    multiplier: f64,
    jitter_ratio: f64,
    attempts: u32,
}

impl BackoffState {
    /// Create a new [`BackoffState`] with explicit parameters.
    ///
    /// # Parameters
    /// - `initial_ms`  – starting delay (ms)
    /// - `max_ms`      – upper cap on computed delays (ms)
    /// - `multiplier`  – factor applied to the base after each call
    /// - `jitter_ratio`– fraction of the base delay added as random jitter
    pub fn new(initial_ms: u64, max_ms: u64, multiplier: f64, jitter_ratio: f64) -> Self {
        Self {
            current_delay_ms: initial_ms,
            initial_delay_ms: initial_ms,
            max_delay_ms: max_ms,
            multiplier,
            jitter_ratio,
            attempts: 0,
        }
    }

    /// Construct from a [`ReconnectSection`] config block.
    ///
    /// `jitter_ratio` is hard-coded to **0.2** (20 % of the current base), which
    /// provides reasonable spread without large overcorrection.
    pub fn from_config(config: &ReconnectSection) -> Self {
        Self::new(
            config.initial_delay_ms,
            config.max_delay_ms,
            config.multiplier,
            0.2,
        )
    }

    /// Compute the next delay, advance internal state, and return the value.
    ///
    /// The returned delay includes jitter and is capped at `max_delay_ms`.
    pub fn next_delay_ms(&mut self) -> u64 {
        let base = self.current_delay_ms;

        // Jitter: uniformly distributed fraction of the base delay.
        let jitter = (base as f64 * self.jitter_ratio * rand::random::<f64>()) as u64;
        let result = (base + jitter).min(self.max_delay_ms);

        // Advance the base for the *next* call.
        self.current_delay_ms =
            ((base as f64 * self.multiplier).round() as u64).min(self.max_delay_ms);

        self.attempts += 1;
        result
    }

    /// Reset back-off to the initial delay and zero the attempt counter.
    pub fn reset(&mut self) {
        self.current_delay_ms = self.initial_delay_ms;
        self.attempts = 0;
    }

    /// How many times [`next_delay_ms`](BackoffState::next_delay_ms) has been
    /// called since construction or the last [`reset`](BackoffState::reset).
    pub fn attempts(&self) -> u32 {
        self.attempts
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_backoff() -> BackoffState {
        BackoffState::new(500, 30_000, 2.0, 0.0) // zero jitter for determinism
    }

    #[test]
    fn initial_delay_is_initial_ms() {
        let mut b = make_backoff();
        // First call returns the initial delay (jitter=0 → exact).
        let d = b.next_delay_ms();
        assert_eq!(d, 500, "first delay should equal initial_ms");
    }

    #[test]
    fn delay_grows_exponentially() {
        let mut b = make_backoff();
        let d0 = b.next_delay_ms(); // 500
        let d1 = b.next_delay_ms(); // 1000
        let d2 = b.next_delay_ms(); // 2000
        assert_eq!(d0, 500);
        assert_eq!(d1, 1_000);
        assert_eq!(d2, 2_000);
    }

    #[test]
    fn delay_is_capped_at_max() {
        let mut b = BackoffState::new(20_000, 30_000, 2.0, 0.0);
        let d0 = b.next_delay_ms(); // 20 000
        let d1 = b.next_delay_ms(); // would be 40 000 → capped at 30 000
        assert_eq!(d0, 20_000);
        assert_eq!(d1, 30_000);
    }

    #[test]
    fn attempts_counter_tracks_calls() {
        let mut b = make_backoff();
        assert_eq!(b.attempts(), 0);
        b.next_delay_ms();
        assert_eq!(b.attempts(), 1);
        b.next_delay_ms();
        assert_eq!(b.attempts(), 2);
    }

    #[test]
    fn reset_restores_initial_state() {
        let mut b = make_backoff();
        b.next_delay_ms();
        b.next_delay_ms();
        b.reset();
        assert_eq!(b.attempts(), 0);
        assert_eq!(b.next_delay_ms(), 500, "after reset first delay should be initial_ms again");
    }

    #[test]
    fn from_config_uses_default_jitter() {
        let config = ReconnectSection {
            initial_delay_ms: 500,
            max_delay_ms: 30_000,
            multiplier: 2.0,
            max_attempts: 0,
        };
        let b = BackoffState::from_config(&config);
        assert_eq!(b.jitter_ratio, 0.2);
    }

    /// Integration: 20 successive calls from a 500 ms base must never exceed the
    /// 30 000 ms cap — even after the exponential sequence would overflow.
    #[test]
    fn backoff_respects_max_cap() {
        // Use zero jitter so the sequence is fully deterministic.
        let mut b = BackoffState::new(500, 30_000, 2.0, 0.0);
        for i in 0..20 {
            let d = b.next_delay_ms();
            assert!(
                d <= 30_000,
                "iteration {i}: delay {d} ms exceeded the 30 000 ms cap"
            );
        }
    }
}
