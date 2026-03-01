/// Launcher for the out-of-process `pty-host` binary.
///
/// The launcher is active only when the `pty-host` feature flag is enabled.
/// It spawns the `pty-host` binary as a child process, passing the IPC port
/// argument so the binary binds the expected socket before the UI process tries
/// to connect.

/// Default IPC port used by both the pty-host server and the client connector.
///
/// Must match what `pty-host` defaults to (`--ipc-port`).
pub const PTY_HOST_IPC_PORT: u16 = 9102;

#[cfg(feature = "pty-host")]
mod launcher_impl {
    use super::PTY_HOST_IPC_PORT;
    use std::process::{Child, Command};
    use std::sync::{Mutex, OnceLock};

    /// Handle to the spawned `pty-host` child process (Windows only).
    pub static PTY_HOST_CHILD: OnceLock<Mutex<Child>> = OnceLock::new();

    /// Locate the `pty-host` executable next to the current binary.
    fn pty_host_exe_path() -> std::path::PathBuf {
        let mut path = std::env::current_exe()
            .unwrap_or_else(|_| std::path::PathBuf::from("."))
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| std::path::PathBuf::from("."));

        path.push("pty-host.exe");
        path
    }

    /// Spawn the `pty-host` binary.
    ///
    /// The child process binds its IPC socket on `PTY_HOST_IPC_PORT` and waits
    /// for the UI process to connect.  This function returns as soon as the child
    /// process has been launched — the caller is responsible for connecting
    /// (retried by `PtyHostClient::connect`).
    pub fn launch_pty_host() -> Result<(), String> {
        let exe = pty_host_exe_path();

        if !exe.exists() {
            return Err(format!(
                "pty-host binary not found at {}",
                exe.display()
            ));
        }

        let child = Command::new(&exe)
            .arg("--ipc-port")
            .arg(PTY_HOST_IPC_PORT.to_string())
            .spawn()
            .map_err(|e| format!("Failed to spawn pty-host: {e}"))?;

        eprintln!(
            "[pty-host launcher] spawned {} (pid {})",
            exe.display(),
            child.id()
        );

        PTY_HOST_CHILD
            .set(Mutex::new(child))
            .map_err(|_| "PTY_HOST_CHILD already set".to_string())?;

        Ok(())
    }
}

#[cfg(feature = "pty-host")]
pub use launcher_impl::{launch_pty_host, PTY_HOST_CHILD};
