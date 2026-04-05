//! File-based diagnostic logger for client-proxy.
//!
//! All output goes to stderr (for Claude Code's MCP log) AND to a persistent
//! log file at `%APPDATA%/ProjectMemory/logs/client-proxy.log` so that
//! upstream-call timing and errors are visible even when stderr is not.

use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

static LOG_FILE: OnceLock<Mutex<std::fs::File>> = OnceLock::new();

/// Return the platform log file path.
pub fn log_path() -> PathBuf {
    #[cfg(windows)]
    let base = std::env::var("APPDATA")
        .unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Roaming".to_string());
    #[cfg(not(windows))]
    let base = std::env::var("HOME")
        .map(|h| format!("{h}/.local/share"))
        .unwrap_or_else(|_| "/tmp".to_string());

    PathBuf::from(base)
        .join("ProjectMemory")
        .join("logs")
        .join("client-proxy.log")
}

/// Open (or create) the log file for appending.  Call once at startup.
pub fn init(path: &std::path::Path) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        Ok(f) => {
            LOG_FILE.get_or_init(|| Mutex::new(f));
        }
        Err(e) => eprintln!("[client-proxy] WARNING: could not open log file {}: {e}", path.display()),
    }
}

/// Write a log line to stderr AND the log file, prefixed with a wall-clock timestamp.
pub fn write(msg: &str) {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let s   = (ms / 1000) % 86400;
    let h   = s / 3600;
    let m   = (s % 3600) / 60;
    let sec = s % 60;
    let ms_part = ms % 1000;
    let line = format!("{h:02}:{m:02}:{sec:02}.{ms_part:03} {msg}\n");

    eprintln!("{msg}");

    if let Some(guard) = LOG_FILE.get() {
        if let Ok(mut f) = guard.lock() {
            let _ = f.write_all(line.as_bytes());
            let _ = f.flush();
        }
    }
}

macro_rules! clog {
    ($($arg:tt)*) => {
        $crate::log::write(&format!($($arg)*))
    };
}
pub(crate) use clog;
