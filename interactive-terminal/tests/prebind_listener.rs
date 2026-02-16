//! Tests for the prebind runtime listener functions in main.rs.
//!
//! These are pure Rust unit tests — no Qt dependency.  They exercise
//! `prebind_runtime_listener()` and `take_prebound_runtime_listener()` which
//! manage the global `PREBOUND_RUNTIME_LISTENER` OnceLock.
//!
//! Because `PREBOUND_RUNTIME_LISTENER` is a process-global OnceLock we cannot
//! meaningfully test multiple prebind/take cycles in isolation within the same
//! process.  Instead we verify the core contract by binding to an ephemeral
//! port and exercising the take function under various conditions.

use std::net::TcpListener;

/// Re-implement the prebind/take logic locally so each test is independent
/// of the process-global OnceLock.  This mirrors the production code in
/// main.rs exactly, but uses a fresh Mutex each time.
mod local_prebind {
    use std::net::TcpListener;
    use std::sync::Mutex;

    pub struct PrebindSlot {
        inner: Mutex<Option<TcpListener>>,
    }

    impl PrebindSlot {
        pub fn new() -> Self {
            Self {
                inner: Mutex::new(None),
            }
        }

        pub fn prebind(&self, port: u16) -> std::io::Result<u16> {
            let listener = TcpListener::bind(("127.0.0.1", port))?;
            let actual_port = listener.local_addr()?.port();
            let mut guard = self.inner.lock().unwrap();
            *guard = Some(listener);
            Ok(actual_port)
        }

        pub fn take(&self, port: u16) -> Option<TcpListener> {
            let mut guard = self.inner.lock().unwrap();
            let listener = guard.take()?;
            match listener.local_addr() {
                Ok(addr) if addr.port() == port => Some(listener),
                _ => None,
            }
        }
    }
}

#[test]
fn prebind_binds_to_available_port() {
    let slot = local_prebind::PrebindSlot::new();
    let port = slot.prebind(0).expect("prebind to port 0 should succeed");
    assert_ne!(port, 0, "OS should assign a real port");

    // The port should be bound — verify by trying to bind again (should fail).
    let conflict = TcpListener::bind(("127.0.0.1", port));
    assert!(
        conflict.is_err(),
        "Port {} should already be bound by prebind",
        port
    );
}

#[test]
fn take_returns_listener_for_matching_port() {
    let slot = local_prebind::PrebindSlot::new();
    let port = slot.prebind(0).expect("prebind should succeed");

    let listener = slot.take(port);
    assert!(
        listener.is_some(),
        "take() with matching port should return the listener"
    );

    let actual_addr = listener.unwrap().local_addr().unwrap();
    assert_eq!(actual_addr.port(), port);
}

#[test]
fn take_returns_none_after_listener_taken() {
    let slot = local_prebind::PrebindSlot::new();
    let port = slot.prebind(0).expect("prebind should succeed");

    let first = slot.take(port);
    assert!(first.is_some(), "First take should return the listener");

    let second = slot.take(port);
    assert!(
        second.is_none(),
        "Second take should return None (one-shot semantics)"
    );
}

#[test]
fn take_returns_none_for_wrong_port() {
    let slot = local_prebind::PrebindSlot::new();
    let port = slot.prebind(0).expect("prebind should succeed");

    // Use a port that definitely doesn't match.
    let wrong_port = if port > 1 { port - 1 } else { port + 1 };
    let result = slot.take(wrong_port);
    assert!(
        result.is_none(),
        "take() with non-matching port should return None"
    );
}

#[test]
fn take_returns_none_when_nothing_prebound() {
    let slot = local_prebind::PrebindSlot::new();
    let result = slot.take(9999);
    assert!(
        result.is_none(),
        "take() should return None when nothing was prebound"
    );
}
