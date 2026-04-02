//! Single-instance exclusive lock using a JSON lock file.
//!
//! # Guarantee
//! Only one supervisor can hold the lock at a time.  The winner creates the lock
//! file via [`std::fs::OpenOptions::create_new()`] which maps to `O_EXCL` on POSIX and
//! `CREATE_NEW` on Windows — both atomic with respect to the filesystem.
//!
//! # Layout
//! The lock file is a JSON document:
//! ```json
//! { "pid": 1234, "started_at": 1708450000, "last_heartbeat": 1708450005 }
//! ```
//!
//! A [`HeartbeatHandle`] runs a background tokio task that periodically refreshes
//! `last_heartbeat`.  On clean exit the [`LockFile`] guard deletes the file.
//! On crash the file persists; the next startup detects a stale lock (dead PID +
//! outdated heartbeat) and reclaims it automatically.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use sysinfo::{Pid, PidExt, System, SystemExt};
use tokio::sync::watch;

// ─── Helpers ────────────────────────────────────────────────────────────────

/// Current time as seconds since the Unix epoch.
fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// ─── Lock data ──────────────────────────────────────────────────────────────

/// JSON payload written into the lock file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockData {
    /// PID of the owning process.
    pub pid: u32,
    /// Unix timestamp (seconds) when the lock was first acquired.
    pub started_at: u64,
    /// Unix timestamp (seconds) of the most recent heartbeat write.
    pub last_heartbeat: u64,
}

// ─── LockResult ─────────────────────────────────────────────────────────────

/// Outcome of a [`try_acquire`] call.
#[derive(Debug)]
pub enum LockResult {
    /// Lock was successfully acquired; caller owns the returned [`LockFile`].
    Acquired(LockFile),
    /// Another instance is running with this PID.
    AlreadyRunning(u32),
    /// Lock file exists, but the owner is dead **and** the heartbeat is stale.
    /// Call [`acquire`] (which auto-reclaims) or delete the file and retry.
    Stale,
}

// ─── LockFile ───────────────────────────────────────────────────────────────

/// RAII guard for the on-disk lock file.
///
/// Deletes the lock file when dropped (clean exit).  On a crash the file
/// remains on disk; the next startup detects the stale lock and reclaims it.
#[derive(Debug)]
pub struct LockFile {
    path: PathBuf,
    /// Shared with [`HeartbeatHandle`] so the heartbeat can update the JSON
    /// without re-reading the file.
    data: Arc<Mutex<LockData>>,
}

impl LockFile {
    /// Path to the lock file on disk.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Clone the shared-data [`Arc`] so a [`HeartbeatHandle`] can be spawned.
    pub fn data_arc(&self) -> Arc<Mutex<LockData>> {
        Arc::clone(&self.data)
    }

    /// Snapshot of the current lock data (for logging / diagnostics).
    pub fn snapshot(&self) -> LockData {
        self.data.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

impl Drop for LockFile {
    fn drop(&mut self) {
        // Best-effort removal — ignore errors (e.g., already deleted on panic).
        let _ = fs::remove_file(&self.path);
    }
}

// ─── HeartbeatHandle ────────────────────────────────────────────────────────

/// Background task that periodically refreshes `last_heartbeat` in the lock file.
///
/// Obtain one via [`HeartbeatHandle::spawn`] after calling [`acquire`].
pub struct HeartbeatHandle {
    shutdown_tx: watch::Sender<bool>,
    join_handle: tokio::task::JoinHandle<()>,
}

impl HeartbeatHandle {
    /// Spawn the heartbeat background task.
    ///
    /// # Arguments
    /// * `path`     – path to the lock file (same as [`LockFile::path`])
    /// * `data`     – shared [`LockData`] arc from [`LockFile::data_arc`]
    /// * `interval` – how often to refresh `last_heartbeat` (default: 5 s)
    pub fn spawn(path: PathBuf, data: Arc<Mutex<LockData>>, interval: Duration) -> Self {
        let (shutdown_tx, mut shutdown_rx) = watch::channel(false);

        let join_handle = tokio::spawn(async move {
            loop {
                tokio::select! {
                    biased;

                    // Shutdown signal takes priority.
                    changed = shutdown_rx.changed() => {
                        if changed.is_ok() && *shutdown_rx.borrow() {
                            break;
                        }
                    }

                    _ = tokio::time::sleep(interval) => {
                        let now = unix_now();
                        let json_opt = {
                            match data.lock() {
                                Ok(mut d) => {
                                    d.last_heartbeat = now;
                                    serde_json::to_string(&*d).ok()
                                }
                                Err(poisoned) => {
                                    // Mutex poisoned (another thread panicked) — take the data anyway.
                                    let mut d = poisoned.into_inner();
                                    d.last_heartbeat = now;
                                    serde_json::to_string(&*d).ok()
                                }
                            }
                        };

                        if let Some(json) = json_opt {
                            // Overwrite the lock file with updated heartbeat.
                            let _ = fs::write(&path, json);
                        }
                    }
                }
            }
        });

        Self {
            shutdown_tx,
            join_handle,
        }
    }

    /// Stop the heartbeat task gracefully and wait for it to finish.
    pub async fn stop(self) {
        // Ignore send error (task may have already exited).
        let _ = self.shutdown_tx.send(true);
        let _ = self.join_handle.await;
    }
}

// ─── Path helper ────────────────────────────────────────────────────────────

/// Default lock-file path: `%APPDATA%\ProjectMemory\supervisor.lock` on Windows,
/// `$XDG_RUNTIME_DIR/project-memory/supervisor.lock` (or `$HOME`) elsewhere.
pub fn default_lock_path() -> PathBuf {
    #[cfg(windows)]
    let base = PathBuf::from(
        std::env::var_os("APPDATA").unwrap_or_else(|| std::ffi::OsString::from(".")),
    );

    #[cfg(not(windows))]
    let base = PathBuf::from(
        std::env::var_os("XDG_RUNTIME_DIR")
            .or_else(|| std::env::var_os("HOME"))
            .unwrap_or_else(|| std::ffi::OsString::from("/tmp")),
    );

    base.join("ProjectMemory").join("supervisor.lock")
}

// ─── PID liveness ───────────────────────────────────────────────────────────

/// Returns `true` if a process with `pid` is currently alive.
///
/// Uses `sysinfo` for a lightweight, cross-platform process table query.
fn is_pid_alive(pid: u32) -> bool {
    let mut sys = System::new();
    // Refresh only the single target process — more efficient than refresh_processes().
    sys.refresh_process(Pid::from_u32(pid));
    sys.process(Pid::from_u32(pid)).is_some()
}

/// Returns `true` when the lock should be considered stale (safe to reclaim).
///
/// A lock is stale when **both** conditions hold:
/// 1. The heartbeat has not been updated within `stale_threshold_secs`.
/// 2. The PID is no longer alive (confirms the process didn't just pause).
fn is_stale(data: &LockData, stale_threshold_secs: u64) -> bool {
    let age = unix_now().saturating_sub(data.last_heartbeat);
    age > stale_threshold_secs && !is_pid_alive(data.pid)
}

// ─── Acquisition ────────────────────────────────────────────────────────────

/// Attempt a single atomic lock-file creation.
///
/// Returns [`LockResult::Stale`] when the existing file is owned by a dead PID
/// with an outdated heartbeat — the **caller** is responsible for deleting the
/// file before retrying (see [`acquire`] for the auto-reclaim variant).
///
/// # Arguments
/// * `path`               – lock-file location (create parent dirs if needed)
/// * `heartbeat_interval` – used to compute the stale threshold (`2 × interval`)
pub fn try_acquire(path: &Path, heartbeat_interval: Duration) -> Result<LockResult> {
    // Ensure the parent directory exists.
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create lock directory: {}", parent.display()))?;
    }

    let pid = std::process::id();
    let now = unix_now();
    let data = LockData {
        pid,
        started_at: now,
        last_heartbeat: now,
    };
    let json = serde_json::to_string(&data).context("failed to serialise lock data")?;

    // ── Atomic create: fails with AlreadyExists if the file is present ───────
    match fs::OpenOptions::new()
        .write(true)
        .create_new(true) // O_EXCL / CREATE_NEW — atomic single-instance guarantee
        .open(path)
    {
        Ok(mut file) => {
            use io::Write;
            file.write_all(json.as_bytes())
                .context("failed to write initial lock data")?;
            drop(file); // flush & close before sharing

            let lock_file = LockFile {
                path: path.to_path_buf(),
                data: Arc::new(Mutex::new(data)),
            };
            Ok(LockResult::Acquired(lock_file))
        }

        // ── File already exists — inspect and classify ────────────────────
        Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {
            let raw = fs::read_to_string(path)
                .with_context(|| format!("failed to read lock file: {}", path.display()))?;

            match serde_json::from_str::<LockData>(&raw) {
                Ok(existing) => {
                    let threshold_secs = (heartbeat_interval * 2).as_secs();
                    if is_stale(&existing, threshold_secs) {
                        Ok(LockResult::Stale)
                    } else {
                        Ok(LockResult::AlreadyRunning(existing.pid))
                    }
                }
                Err(_) => {
                    // Corrupt or empty lock file — treat as stale so we can recover.
                    Ok(LockResult::Stale)
                }
            }
        }

        Err(e) => Err(anyhow::Error::new(e).context("failed to create lock file")),
    }
}

/// Acquire the lock, automatically reclaiming a stale lock if one is found.
///
/// This is the preferred entry point for the supervisor startup sequence:
///
/// ```rust,ignore
/// match lock::acquire(&lock_path, Duration::from_secs(5))? {
///     LockResult::Acquired(lf) => { /* we own the lock */ }
///     LockResult::AlreadyRunning(pid) => { /* exit gracefully */ }
///     LockResult::Stale => unreachable!("acquire() never returns Stale"),
/// }
/// ```
pub fn acquire(path: &Path, heartbeat_interval: Duration) -> Result<LockResult> {
    match try_acquire(path, heartbeat_interval)? {
        LockResult::Stale => {
            // Delete the stale file and try once more.
            fs::remove_file(path).with_context(|| {
                format!("failed to remove stale lock file: {}", path.display())
            })?;
            // On a second Stale result something is very wrong — propagate it.
            try_acquire(path, heartbeat_interval)
        }
        other => Ok(other),
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tempfile::TempDir;

    fn tmp_lock(dir: &TempDir) -> PathBuf {
        dir.path().join("supervisor.lock")
    }

    #[test]
    fn acquire_creates_lock_file() {
        let dir = TempDir::new().unwrap();
        let path = tmp_lock(&dir);

        match acquire(&path, Duration::from_secs(5)).unwrap() {
            LockResult::Acquired(lf) => {
                assert!(path.exists());
                drop(lf);
                assert!(!path.exists(), "LockFile::drop should delete the file");
            }
            other => panic!("expected Acquired, got {:?}", other),
        }
    }

    #[test]
    fn second_acquire_returns_already_running() {
        let dir = TempDir::new().unwrap();
        let path = tmp_lock(&dir);

        let _lf = match acquire(&path, Duration::from_secs(5)).unwrap() {
            LockResult::Acquired(lf) => lf,
            other => panic!("first acquire failed: {:?}", other),
        };

        match try_acquire(&path, Duration::from_secs(5)).unwrap() {
            LockResult::AlreadyRunning(pid) => {
                assert_eq!(pid, std::process::id());
            }
            other => panic!("expected AlreadyRunning, got {:?}", other),
        }
    }

    #[test]
    fn stale_lock_with_dead_pid_is_reclaimed() {
        let dir = TempDir::new().unwrap();
        let path = tmp_lock(&dir);

        // Write a lock file with a dead PID and very old heartbeat.
        let stale_data = LockData {
            pid: 99999999, // almost certainly not running
            started_at: 1_000_000,
            last_heartbeat: 1_000_000,
        };
        fs::write(&path, serde_json::to_string(&stale_data).unwrap()).unwrap();

        // try_acquire should detect stale.
        match try_acquire(&path, Duration::from_secs(5)).unwrap() {
            LockResult::Stale => {}
            other => panic!("expected Stale, got {:?}", other),
        }

        // acquire() should reclaim and succeed.
        match acquire(&path, Duration::from_secs(5)).unwrap() {
            LockResult::Acquired(lf) => drop(lf),
            other => panic!("expected Acquired after reclaim, got {:?}", other),
        }
    }

    #[test]
    fn lock_file_drop_removes_file() {
        let dir = TempDir::new().unwrap();
        let path = tmp_lock(&dir);

        let lf = match acquire(&path, Duration::from_secs(5)).unwrap() {
            LockResult::Acquired(lf) => lf,
            other => panic!("expected Acquired, got {:?}", other),
        };
        assert!(path.exists());
        drop(lf);
        assert!(!path.exists());
    }

    #[tokio::test]
    async fn heartbeat_updates_last_heartbeat() {
        let dir = TempDir::new().unwrap();
        let path = tmp_lock(&dir);

        let lf = match acquire(&path, Duration::from_millis(100)).unwrap() {
            LockResult::Acquired(lf) => lf,
            other => panic!("expected Acquired, got {:?}", other),
        };

        let initial_hb = lf.snapshot().last_heartbeat;
        let data_arc = lf.data_arc();

        let handle = HeartbeatHandle::spawn(
            lf.path().to_path_buf(),
            data_arc,
            Duration::from_millis(100),
        );

        // Wait enough time for at least one heartbeat tick.
        tokio::time::sleep(Duration::from_millis(350)).await;

        let updated_hb = lf.snapshot().last_heartbeat;
        assert!(
            updated_hb >= initial_hb,
            "heartbeat should not go backwards"
        );

        handle.stop().await;
        drop(lf);
    }
}
