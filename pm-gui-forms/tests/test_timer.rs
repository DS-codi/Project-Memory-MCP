//! Integration tests for CountdownTimer lifecycle, pause/resume/cancel,
//! and TimerSnapshot helpers.

use pm_gui_forms::timer::{CountdownTimer, TimerEvent, TimerHandle, TimerSnapshot};

// ── TimerSnapshot Unit Tests (sync — no runtime needed) ──────────

#[test]
fn timer_snapshot_elapsed_seconds_basic() {
    let snap = TimerSnapshot {
        total_seconds: 60,
        remaining_seconds: 45,
        paused: false,
    };
    assert_eq!(snap.elapsed_seconds(), 15);
}

#[test]
fn timer_snapshot_elapsed_seconds_at_start() {
    let snap = TimerSnapshot {
        total_seconds: 120,
        remaining_seconds: 120,
        paused: false,
    };
    assert_eq!(snap.elapsed_seconds(), 0);
}

#[test]
fn timer_snapshot_elapsed_seconds_at_expiry() {
    let snap = TimerSnapshot {
        total_seconds: 30,
        remaining_seconds: 0,
        paused: false,
    };
    assert_eq!(snap.elapsed_seconds(), 30);
}

#[test]
fn timer_snapshot_elapsed_saturates_on_underflow() {
    // Edge case: remaining somehow exceeds total (shouldn't happen, but saturate)
    let snap = TimerSnapshot {
        total_seconds: 10,
        remaining_seconds: 20,
        paused: false,
    };
    assert_eq!(snap.elapsed_seconds(), 0);
}

#[test]
fn timer_snapshot_elapsed_with_zero_duration() {
    let snap = TimerSnapshot {
        total_seconds: 0,
        remaining_seconds: 0,
        paused: false,
    };
    assert_eq!(snap.elapsed_seconds(), 0);
}

// ── TimerHandle::elapsed_from_remaining (sync) ──────────────────

#[tokio::test]
async fn timer_handle_elapsed_from_remaining() {
    let timer = CountdownTimer::new(3);
    let (_rx, handle) = timer.start();

    assert_eq!(handle.elapsed_from_remaining(60, 45), 15);
    assert_eq!(handle.elapsed_from_remaining(60, 0), 60);
    assert_eq!(handle.elapsed_from_remaining(60, 60), 0);
    // Saturating: remaining > duration
    assert_eq!(handle.elapsed_from_remaining(10, 20), 0);

    handle.cancel().await;
}

// ── CountdownTimer Start & Tick Tests ────────────────────────────

#[tokio::test]
async fn timer_emits_initial_tick_with_full_duration() {
    let timer = CountdownTimer::new(5);
    let (mut rx, handle) = timer.start();

    // First event should be the initial tick with full remaining
    let event = rx.recv().await.expect("should receive initial tick");
    assert_eq!(event, TimerEvent::Tick { remaining_seconds: 5 });

    handle.cancel().await;
}

#[tokio::test]
async fn timer_expires_after_duration() {
    // Use a very short timer to keep the test fast
    let timer = CountdownTimer::new(2);
    let (mut rx, _handle) = timer.start();

    let mut events = vec![];
    while let Some(event) = rx.recv().await {
        events.push(event);
        if event == TimerEvent::Expired {
            break;
        }
    }

    // We expect: Tick(2), Tick(1), Tick(0), Expired
    assert!(events.len() >= 3, "expected at least 3 events, got {}", events.len());

    // First event is the initial tick
    assert_eq!(events[0], TimerEvent::Tick { remaining_seconds: 2 });

    // Last event should be Expired
    assert_eq!(*events.last().unwrap(), TimerEvent::Expired);

    // Check that we got a Tick(0) before Expired
    assert!(
        events.contains(&TimerEvent::Tick { remaining_seconds: 0 }),
        "should have a Tick(0) before Expired"
    );
}

#[tokio::test]
async fn timer_ticks_are_monotonically_decreasing() {
    let timer = CountdownTimer::new(3);
    let (mut rx, _handle) = timer.start();

    let mut tick_values = vec![];
    while let Some(event) = rx.recv().await {
        match event {
            TimerEvent::Tick { remaining_seconds } => tick_values.push(remaining_seconds),
            TimerEvent::Expired => break,
        }
    }

    // Ticks should be 3, 2, 1, 0
    for window in tick_values.windows(2) {
        assert!(
            window[0] > window[1],
            "ticks should decrease: {} should be > {}",
            window[0],
            window[1]
        );
    }
}

// ── Cancel Tests ─────────────────────────────────────────────────

#[tokio::test]
async fn timer_cancel_stops_without_expired() {
    let timer = CountdownTimer::new(60); // long timer
    let (mut rx, handle) = timer.start();

    // Receive initial tick
    let _initial = rx.recv().await.expect("initial tick");

    // Cancel immediately
    handle.cancel().await;

    // Drain remaining events — should NOT contain Expired
    let mut events = vec![];
    while let Some(event) = rx.recv().await {
        events.push(event);
    }

    assert!(
        !events.contains(&TimerEvent::Expired),
        "cancelled timer should not emit Expired"
    );
}

#[tokio::test]
async fn timer_cancel_closes_receiver() {
    let timer = CountdownTimer::new(60);
    let (mut rx, handle) = timer.start();
    let _ = rx.recv().await; // initial tick
    handle.cancel().await;

    // After cancel, receiver should eventually return None
    // (task exits → sender dropped → None)
    let mut got_none = false;
    for _ in 0..10 {
        if rx.recv().await.is_none() {
            got_none = true;
            break;
        }
    }
    assert!(got_none, "receiver should return None after cancel");
}

// ── Pause / Resume Tests ─────────────────────────────────────────

#[tokio::test]
async fn timer_pause_stops_ticks() {
    let timer = CountdownTimer::new(10);
    let (mut rx, handle) = timer.start();

    // Receive initial tick
    let initial = rx.recv().await.expect("initial tick");
    assert_eq!(initial, TimerEvent::Tick { remaining_seconds: 10 });

    // Pause the timer
    handle.pause().await;

    // Wait a bit — we should not receive any new ticks while paused
    // Use a short timeout to avoid a slow test
    let result = tokio::time::timeout(
        std::time::Duration::from_millis(1500),
        rx.recv(),
    )
    .await;

    // The timeout should fire (no tick received while paused)
    assert!(
        result.is_err(),
        "should not receive ticks while paused (timeout expected)"
    );

    handle.cancel().await;
}

#[tokio::test]
async fn timer_resume_after_pause() {
    let timer = CountdownTimer::new(10);
    let (mut rx, handle) = timer.start();

    // Receive initial tick
    let _ = rx.recv().await.expect("initial tick");

    // Pause, then resume
    handle.pause().await;
    // Small delay so the pause command is processed
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    handle.resume().await;

    // After resume, we should get ticks again
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        rx.recv(),
    )
    .await;

    assert!(result.is_ok(), "should receive tick after resume");
    let event = result.unwrap().expect("channel still open");
    match event {
        TimerEvent::Tick { remaining_seconds } => {
            assert!(remaining_seconds < 10, "remaining should have decreased");
        }
        TimerEvent::Expired => {
            // This shouldn't happen with a 10s timer after a short pause
            panic!("timer should not have expired so quickly");
        }
    }

    handle.cancel().await;
}

// ── Zero-Duration Timer ──────────────────────────────────────────

#[tokio::test]
async fn timer_zero_duration_expires_immediately() {
    let timer = CountdownTimer::new(0);
    let (mut rx, _handle) = timer.start();

    // Initial tick with remaining = 0
    let first = rx.recv().await.expect("should get initial tick");
    assert_eq!(first, TimerEvent::Tick { remaining_seconds: 0 });

    // Next event should be Expired
    let second = rx.recv().await.expect("should get expired");
    assert_eq!(second, TimerEvent::Expired);
}

// ── TimerHandle Clone ────────────────────────────────────────────

#[tokio::test]
async fn timer_handle_is_cloneable() {
    let timer = CountdownTimer::new(30);
    let (mut rx, handle) = timer.start();

    // Clone the handle and cancel from the clone
    let cloned = handle.clone();
    let _ = rx.recv().await; // initial tick
    cloned.cancel().await;

    // Original receiver should close
    let mut closed = false;
    for _ in 0..10 {
        if rx.recv().await.is_none() {
            closed = true;
            break;
        }
    }
    assert!(closed, "cancel from cloned handle should stop the timer");
}

// ── CountdownTimer::new ──────────────────────────────────────────

#[test]
fn countdown_timer_new_stores_duration() {
    // We can't directly inspect duration, but we verify it through behaviour
    // by checking the initial tick value in an async test. This test just
    // verifies the constructor doesn't panic with various values.
    let _ = CountdownTimer::new(0);
    let _ = CountdownTimer::new(1);
    let _ = CountdownTimer::new(u32::MAX);
}
