// PTY backend for the pty-host binary.
// Adapted from interactive-terminal/src/terminal_core/conpty_backend.rs —
// includes only the ConptyRawSession (raw-bytes) path; the line-based
// ConptyShellSession is not needed here.

#[cfg(windows)]
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
#[cfg(windows)]
use std::io::Read;
#[cfg(windows)]
use std::path::Path;
#[cfg(windows)]
use std::sync::{Arc, Mutex as StdMutex};
#[cfg(windows)]
use tokio::sync::mpsc;

// ─── Raw-bytes PTY session ─────────────────────────────────────────────────

#[cfg(windows)]
pub(crate) struct ConptyRawSession {
    pub(crate) writer: Arc<StdMutex<Box<dyn std::io::Write + Send>>>,
    #[allow(dead_code)]
    pub(crate) child: Arc<StdMutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    pub(crate) pty_master: Arc<StdMutex<Box<dyn portable_pty::MasterPty + Send>>>,
    pub(crate) raw_output_rx: mpsc::Receiver<Vec<u8>>,
}

#[cfg(not(windows))]
pub(crate) struct ConptyRawSession {}

#[cfg(windows)]
impl ConptyRawSession {
    /// Split into `(output_rx, writer_arc, master_arc, child_arc)`.
    pub(crate) fn into_task_parts(
        self,
    ) -> (
        mpsc::Receiver<Vec<u8>>,
        Arc<StdMutex<Box<dyn std::io::Write + Send>>>,
        Arc<StdMutex<Box<dyn portable_pty::MasterPty + Send>>>,
        Arc<StdMutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    ) {
        (self.raw_output_rx, self.writer, self.pty_master, self.child)
    }
}

/// Spawn a raw-bytes PTY session.
#[cfg(windows)]
pub(crate) fn spawn_conpty_raw_session(
    program: &str,
    args: &[String],
    cwd: &Path,
    env_overrides: &[(String, String)],
    cols: u16,
    rows: u16,
) -> Result<ConptyRawSession, String> {
    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize {
            rows,
            cols,
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
    let pty_master = Arc::new(StdMutex::new(pair.master));
    let (raw_output_tx, raw_output_rx) = mpsc::channel::<Vec<u8>>(256);

    // Reader thread: forward raw PTY bytes to the async channel.
    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if raw_output_tx.blocking_send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
            }
        }
    });

    Ok(ConptyRawSession {
        writer,
        child,
        pty_master,
        raw_output_rx,
    })
}

#[cfg(not(windows))]
pub(crate) fn spawn_conpty_raw_session(
    _program: &str,
    _args: &[String],
    _cwd: &std::path::Path,
    _env_overrides: &[(String, String)],
    _cols: u16,
    _rows: u16,
) -> Result<ConptyRawSession, String> {
    Err("PTY spawning is only supported on Windows".to_string())
}

/// Resize the ConPTY to new dimensions.
#[cfg(windows)]
pub(crate) fn resize_conpty(
    master: &Arc<StdMutex<Box<dyn portable_pty::MasterPty + Send>>>,
    cols: u16,
    rows: u16,
) {
    if let Ok(m) = master.lock() {
        let _ = m.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        });
    }
}
