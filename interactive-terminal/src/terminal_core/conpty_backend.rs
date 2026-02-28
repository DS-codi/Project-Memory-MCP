use crate::command_executor::OutputLine;
use std::path::Path;
use tokio::sync::mpsc;

#[cfg(windows)]
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
#[cfg(windows)]
use std::io::{BufRead, BufReader};
#[cfg(windows)]
use std::sync::{Arc, Mutex as StdMutex};

pub(crate) struct ConptyShellSession {
    #[cfg(windows)]
    writer: Arc<StdMutex<Box<dyn std::io::Write + Send>>>,
    #[cfg(windows)]
    child: Arc<StdMutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    #[cfg(windows)]
    output_rx: mpsc::Receiver<OutputLine>,
}

#[cfg(windows)]
pub(crate) fn spawn_conpty_shell(
    program: &str,
    args: &[String],
    cwd: &Path,
    env_overrides: &[(String, String)],
) -> Result<ConptyShellSession, String> {
    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize {
            rows: 40,
            cols: 160,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty failed: {e}"))?;

    let mut cmd = CommandBuilder::new(program);
    for arg in args {
        cmd.arg(arg);
    }
    cmd.cwd(cwd);
    for (key, value) in env_overrides {
        cmd.env(key, value);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("ConPTY spawn failed: {e}"))?;

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("ConPTY reader init failed: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("ConPTY writer init failed: {e}"))?;

    let child = Arc::new(StdMutex::new(child));
    let writer = Arc::new(StdMutex::new(writer));
    let (output_tx, output_rx) = mpsc::channel::<OutputLine>(512);

    std::thread::spawn(move || {
        let mut lines = BufReader::new(reader);
        let mut raw = String::new();

        loop {
            raw.clear();
            match lines.read_line(&mut raw) {
                Ok(0) => break,
                Ok(_) => {
                    let text = raw.trim_end_matches(['\r', '\n']).to_string();
                    if output_tx.blocking_send(OutputLine::Stdout(text)).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    Ok(ConptyShellSession {
        writer,
        child,
        output_rx,
    })
}

#[cfg(not(windows))]
pub(crate) fn spawn_conpty_shell(
    _program: &str,
    _args: &[String],
    _cwd: &Path,
    _env_overrides: &[(String, String)],
) -> Result<ConptyShellSession, String> {
    Err("ConPTY is only available on Windows".to_string())
}

impl ConptyShellSession {
    #[cfg(windows)]
    pub(crate) async fn write_command_line(&self, line: &str) -> Result<(), String> {
        let payload = format!("{line}\n").into_bytes();
        let writer = self.writer.clone();
        tokio::task::spawn_blocking(move || {
            let mut lock = writer
                .lock()
                .map_err(|_| "ConPTY writer mutex poisoned".to_string())?;
            std::io::Write::write_all(&mut *lock, &payload)
                .map_err(|e| format!("ConPTY write failed: {e}"))?;
            std::io::Write::flush(&mut *lock).map_err(|e| format!("ConPTY flush failed: {e}"))
        })
        .await
        .map_err(|e| format!("ConPTY write task failed: {e}"))?
    }

    #[cfg(windows)]
    pub(crate) async fn recv_output_line(&mut self) -> Option<OutputLine> {
        self.output_rx.recv().await
    }

    #[cfg(windows)]
    pub(crate) async fn terminate(self) {
        let child = self.child.clone();
        let _ = tokio::task::spawn_blocking(move || {
            if let Ok(mut lock) = child.lock() {
                let _ = lock.kill();
            }
        })
        .await;
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    /// On every non-Windows target the stub implementation of
    /// `spawn_conpty_shell` must return an informative error without
    /// attempting any PTY allocation.  This guards against regressions
    /// where the cfg-gate is accidentally removed or inverted.
    #[test]
    fn spawn_conpty_shell_non_windows_returns_informative_error() {
        #[cfg(not(windows))]
        {
            let result = spawn_conpty_shell(
                "sh",
                &["-l".to_string()],
                Path::new("/tmp"),
                &[],
            );
            assert!(
                result.is_err(),
                "spawn_conpty_shell must fail on non-Windows targets"
            );
            let err = result.unwrap_err();
            assert!(
                err.to_lowercase().contains("windows"),
                "error message should mention 'Windows'; got: {err}"
            );
        }
        // On Windows this is a compile-time correctness check only;
        // live PTY allocation is exercised in Phase 5 integration tests.
        #[cfg(windows)]
        {
            let _ = std::ptr::null::<()>(); // no-op sentinel
        }
    }

    /// On non-Windows, `ConptyShellSession` has no live fields (all are
    /// `#[cfg(windows)]`-gated).  Confirm the zero-field struct is still
    /// constructible, which would catch accidental removal of the type.
    #[cfg(not(windows))]
    #[test]
    fn conpty_shell_session_is_zero_field_constructible_on_non_windows() {
        // If ConptyShellSession ceases to compile as a zero-field struct this
        // test will fail to build, catching the regression at compile time.
        let _session = ConptyShellSession {};
    }
}
