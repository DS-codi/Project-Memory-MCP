//! SQLite connection for local (degraded-mode) tool handling.
//!
//! Opens `%APPDATA%\ProjectMemory\project-memory.db` (Windows) or the
//! platform equivalent.  Respects the `PM_DATA_ROOT` env var override used by
//! the server.

pub mod instructions;
pub mod plan;
pub mod steps;
pub mod workspace;

use anyhow::{Context, Result};
use rusqlite::Connection;
use std::path::PathBuf;

/// Resolve the path to `project-memory.db`.
pub fn db_path() -> PathBuf {
    // Honour the same override the Node server uses.
    if let Ok(root) = std::env::var("PM_DATA_ROOT") {
        return PathBuf::from(root).join("project-memory.db");
    }

    #[cfg(windows)]
    let base = PathBuf::from(
        std::env::var_os("APPDATA").unwrap_or_else(|| std::ffi::OsString::from(".")),
    );

    #[cfg(target_os = "macos")]
    let base = {
        let home = std::env::var_os("HOME").unwrap_or_else(|| std::ffi::OsString::from("."));
        PathBuf::from(home).join("Library").join("Application Support")
    };

    #[cfg(not(any(windows, target_os = "macos")))]
    let base = PathBuf::from(
        std::env::var_os("XDG_DATA_HOME")
            .or_else(|| std::env::var_os("HOME").map(|h| {
                let mut p = PathBuf::from(h);
                p.push(".local");
                p.push("share");
                p.into_os_string()
            }))
            .unwrap_or_else(|| std::ffi::OsString::from(".")),
    );

    base.join("ProjectMemory").join("project-memory.db")
}

/// Open a read-write connection to the Project Memory SQLite database.
pub fn open() -> Result<Connection> {
    let path = db_path();
    let conn = Connection::open(&path)
        .with_context(|| format!("failed to open Project Memory database at {}", path.display()))?;

    // Match the server's pragmas for safe concurrent access.
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )
    .context("failed to set database pragmas")?;

    Ok(conn)
}
