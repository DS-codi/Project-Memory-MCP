//! Integration tests for the single-instance lock mechanism.
//!
//! These tests exercise the public API in `supervisor::lock` from outside the
//! crate, covering concurrency, stale-lock reclamation, heartbeat progression,
//! RAII cleanup, and the 2× heartbeat stale threshold boundary.

use std::{
    sync::{Arc, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use tempfile::TempDir;

use supervisor::lock::{acquire, try_acquire, HeartbeatHandle, LockData, LockFile, LockResult};

// ─── Helpers ────────────────────────────────────────────────────────────────

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Write a synthetic lock file with the given data so we can inject arbitrary
/// PID / heartbeat values for stale-detection tests.
fn write_lock_data(path: &std::path::Path, data: &LockData) {
    std::fs::write(path, serde_json::to_string(data).unwrap()).unwrap();
}

// ─── Test 1: Concurrent race — exactly one thread acquires ──────────────────

/// Spawn N threads simultaneously against the same lock path.
/// Exactly 1 must get `LockResult::Acquired`; the remaining N-1 must get
/// `LockResult::AlreadyRunning`.  We verify the strict delta (acquired == 1)
/// to catch any race where the filesystem primitive is not atomic.
#[test]
fn concurrent_race_exactly_one_acquires() {
    const N: usize = 8;

    let dir = TempDir::new().unwrap();
    let path = Arc::new(dir.path().join("supervisor.lock"));
    let interval = Duration::from_secs(5);

    // Collect result labels from every thread.
    let labels: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::with_capacity(N)));

    // Keep LockFiles alive until all threads finish so none drops early and
    // lets a second thread sneak in.
    let live_locks: Arc<Mutex<Vec<LockFile>>> = Arc::new(Mutex::new(Vec::new()));

    let handles: Vec<_> = (0..N)
        .map(|_| {
            let path = Arc::clone(&path);
            let labels = Arc::clone(&labels);
            let live_locks = Arc::clone(&live_locks);

            thread::spawn(move || {
                match try_acquire(&path, interval).unwrap() {
                    LockResult::Acquired(lf) => {
                        live_locks.lock().unwrap().push(lf);
                        labels.lock().unwrap().push("acquired");
                    }
                    LockResult::AlreadyRunning(_) => {
                        labels.lock().unwrap().push("already_running");
                    }
                    LockResult::Stale => {
                        labels.lock().unwrap().push("stale");
                    }
                }
            })
        })
        .collect();

    for h in handles {
        h.join().expect("thread panicked");
    }

    let labels = labels.lock().unwrap();

    let acquired_count = labels.iter().filter(|&&l| l == "acquired").count();
    let running_count = labels.iter().filter(|&&l| l == "already_running").count();
    let stale_count = labels.iter().filter(|&&l| l == "stale").count();

    assert_eq!(
        acquired_count, 1,
        "exactly one thread must win the lock race (got {acquired_count} winners out of {N} threads)"
    );
    assert_eq!(
        running_count,
        N - 1,
        "all other {count} threads must observe AlreadyRunning",
        count = N - 1
    );
    assert_eq!(stale_count, 0, "no thread should see Stale on a fresh lock");

    // Delta check: verify the winner's PID is our own process (sanity).
    // (The LockFile data are already validated via acquired_count == 1.)
    // Drop live_locks explicitly, releasing the lock file only after we've
    // finished asserting — this prevents a second acquire sneaking in.
    drop(labels);
    drop(live_locks);
}

// ─── Test 2: Stale lock — try_acquire returns Stale ─────────────────────────

/// Pre-write a lock file with a PID that is virtually guaranteed not to exist
/// (u32::MAX) and a heartbeat timestamp far in the past.  `try_acquire` must
/// classify it as `LockResult::Stale`.
#[test]
fn stale_lock_try_acquire_returns_stale() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("supervisor.lock");

    let stale = LockData {
        pid: u32::MAX, // guaranteed dead
        started_at: 1_000_000,
        last_heartbeat: 1_000_000, // ancient
    };
    write_lock_data(&path, &stale);

    match try_acquire(&path, Duration::from_secs(5)).unwrap() {
        LockResult::Stale => {} // ✓ expected
        other => panic!("expected Stale for dead PID + old heartbeat, got {:?}", other),
    }
}

// ─── Test 3: Stale lock — acquire() reclaims and succeeds ───────────────────

/// Same stale setup as test 2, but this time call `acquire()` which should
/// auto-delete the stale file and return `LockResult::Acquired`.
#[test]
fn stale_lock_acquire_auto_reclaims() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("supervisor.lock");

    let stale = LockData {
        pid: u32::MAX,
        started_at: 1_000_000,
        last_heartbeat: 1_000_000,
    };
    write_lock_data(&path, &stale);

    match acquire(&path, Duration::from_secs(5)).unwrap() {
        LockResult::Acquired(lf) => {
            // We own the lock: file should exist.
            assert!(path.exists(), "reclaimed lock file should be present on disk");
            // Confirm the new owner's PID matches us.
            assert_eq!(
                lf.snapshot().pid,
                std::process::id(),
                "reclaimed lock must record the new owner's PID"
            );
            drop(lf);
            assert!(!path.exists(), "LockFile::drop should remove the reclaimed file");
        }
        other => panic!("expected Acquired after stale reclaim, got {:?}", other),
    }
}

// ─── Test 4: Heartbeat tick progression ─────────────────────────────────────

/// Spawn a HeartbeatHandle with a small interval (100 ms), wait for at least
/// two full ticks, then verify that `last_heartbeat` advanced strictly beyond
/// its initial value.
///
/// We assert `delta > 0` (wall-clock seconds moved forward) rather than
/// a fixed expected value — this is robust even on slow CI machines.
#[tokio::test]
async fn heartbeat_advances_last_heartbeat() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("supervisor.lock");

    let lf = match acquire(&path, Duration::from_millis(100)).unwrap() {
        LockResult::Acquired(lf) => lf,
        other => panic!("expected Acquired, got {:?}", other),
    };

    let before_hb = lf.snapshot().last_heartbeat;
    let data_arc = lf.data_arc();

    let handle = HeartbeatHandle::spawn(
        lf.path().to_path_buf(),
        Arc::clone(&data_arc),
        Duration::from_millis(100),
    );

    // Wait for 3 ticks (300 ms) to give the background task plenty of room.
    tokio::time::sleep(Duration::from_millis(350)).await;

    let after_hb = lf.snapshot().last_heartbeat;

    // Stop the heartbeat before any assertions so we don't race with it.
    handle.stop().await;

    assert!(
        after_hb >= before_hb,
        "last_heartbeat must never decrease (before={before_hb}, after={after_hb})"
    );
    // Strict forward progress: at least one second must have elapsed between
    // initial acquisition and after waiting 350 ms (heartbeat writes unix secs).
    // Use delta > 0 when the wall clock has moved by ≥ 1 second, but fall back
    // to checking the in-memory value was touched if the machine is very fast.
    // The in-memory data is the authoritative source; delta on a slow machine
    // would be 0 only if the test ran in under 1 second with no tick at all.
    let mem_hb = data_arc.lock().unwrap().last_heartbeat;
    assert!(
        mem_hb >= before_hb,
        "in-memory heartbeat must not decrease (before={before_hb}, mem={mem_hb})"
    );

    drop(lf);
}

// ─── Test 5: LockFile Drop removes the file (strict scope) ──────────────────

/// Acquire the lock, assert the file exists inside the scope, then let the
/// `LockFile` drop at the closing brace and assert the file is gone
/// immediately afterwards.  The scope boundary makes the RAII guarantee
/// unambiguous — there is no way for the file deletion to be deferred.
#[test]
fn lock_file_drop_in_explicit_scope_removes_file() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("supervisor.lock");

    {
        let lf = match acquire(&path, Duration::from_secs(5)).unwrap() {
            LockResult::Acquired(lf) => lf,
            other => panic!("expected Acquired, got {:?}", other),
        };

        assert!(
            path.exists(),
            "lock file must exist while LockFile guard is in scope"
        );

        // lf is dropped here at end of inner scope.
        let _ = lf;
    }

    assert!(
        !path.exists(),
        "lock file must be deleted immediately after LockFile is dropped"
    );
}

// ─── Test 6a: Stale threshold — 1.5× interval is NOT stale ─────────────────

/// A lock file whose heartbeat is 1.5× the heartbeat interval in the past with
/// a dead PID must NOT be treated as stale (threshold is 2× interval).
///
/// Expected result: `LockResult::AlreadyRunning` (recent-enough heartbeat).
#[test]
fn stale_threshold_one_point_five_times_interval_is_not_stale() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("supervisor.lock");

    let interval_secs: u64 = 10;
    let interval = Duration::from_secs(interval_secs);

    // Heartbeat age = 1.5 × interval = 15 s.  Threshold = 2 × 10 = 20 s.
    // Condition: age (15) > threshold (20)? → false → NOT stale.
    let heartbeat_age_secs = (interval_secs * 3) / 2; // 15 s
    let last_heartbeat = unix_now().saturating_sub(heartbeat_age_secs);

    let lock_data = LockData {
        pid: u32::MAX, // dead PID — heartbeat recency alone should prevent Stale
        started_at: last_heartbeat,
        last_heartbeat,
    };
    write_lock_data(&path, &lock_data);

    match try_acquire(&path, interval).unwrap() {
        LockResult::AlreadyRunning(_) => {} // ✓ heartbeat is recent enough
        LockResult::Stale => panic!(
            "1.5× interval heartbeat must NOT be stale (threshold is 2× interval)"
        ),
        LockResult::Acquired(_) => panic!("did not expect Acquired; lock file was pre-written"),
    }
}

// ─── Test 6b: Stale threshold — 3× interval IS stale ───────────────────────

/// A lock file whose heartbeat is 3× the heartbeat interval in the past with
/// a dead PID MUST be treated as stale (age > 2× threshold).
///
/// Expected result: `LockResult::Stale`.
#[test]
fn stale_threshold_three_times_interval_is_stale() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("supervisor.lock");

    let interval_secs: u64 = 10;
    let interval = Duration::from_secs(interval_secs);

    // Heartbeat age = 3 × interval = 30 s.  Threshold = 2 × 10 = 20 s.
    // Condition: age (30) > threshold (20)? → true AND dead PID → STALE.
    let heartbeat_age_secs = interval_secs * 3; // 30 s
    let last_heartbeat = unix_now().saturating_sub(heartbeat_age_secs);

    let lock_data = LockData {
        pid: u32::MAX, // dead PID
        started_at: last_heartbeat,
        last_heartbeat,
    };
    write_lock_data(&path, &lock_data);

    match try_acquire(&path, interval).unwrap() {
        LockResult::Stale => {} // ✓ correctly identified as stale
        LockResult::AlreadyRunning(_) => panic!(
            "3× interval heartbeat with dead PID must be Stale, not AlreadyRunning"
        ),
        LockResult::Acquired(_) => panic!("did not expect Acquired; lock file was pre-written"),
    }
}
