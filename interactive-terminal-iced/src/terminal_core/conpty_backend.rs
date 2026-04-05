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
            cols: 220,
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

// ─── Raw-bytes PTY session (used by the xterm.js WebSocket bridge) ────────────

#[cfg(windows)]
pub(crate) struct ConptyRawSession {
    writer: Arc<StdMutex<Box<dyn std::io::Write + Send>>>,
    #[allow(dead_code)]
    child: Arc<StdMutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    pty_master: Arc<StdMutex<Box<dyn portable_pty::MasterPty + Send>>>,
    raw_output_rx: mpsc::Receiver<Vec<u8>>,
}

#[cfg(not(windows))]
pub(crate) struct ConptyRawSession {}

#[cfg(windows)]
impl ConptyRawSession {
    /// Split into `(output_rx, writer_arc, master_arc)` for use in concurrent tasks.
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

/// Spawn a PTY shell and return a [`ConptyRawSession`] whose output channel
/// delivers raw byte chunks (VT-escape sequences intact) instead of trimmed lines.
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

    // Reader thread: forward raw PTY bytes (VT sequences intact) to the async channel.
    std::thread::spawn(move || {
        use std::io::Read;
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
    _cwd: &Path,
    _env_overrides: &[(String, String)],
    _cols: u16,
    _rows: u16,
) -> Result<ConptyRawSession, String> {
    Err("ConPTY is only available on Windows".to_string())
}

// ─── Helpers shared by the WebSocket input pump ───────────────────────────────

/// Parse `{"type":"resize","cols":N,"rows":N}` sent by xterm.js on connect/resize.
/// Returns `(cols, rows)` on success; `None` if the bytes are not a resize message.
pub(crate) fn try_parse_resize_json(data: &[u8]) -> Option<(u16, u16)> {
    let s = std::str::from_utf8(data).ok()?;
    if !s.contains("\"type\":\"resize\"") {
        return None;
    }
    let cols = extract_json_u16_field(s, "cols")?;
    let rows = extract_json_u16_field(s, "rows")?;
    Some((cols, rows))
}

fn extract_json_u16_field(s: &str, field: &str) -> Option<u16> {
    let key = format!("\"{field}\":");
    let pos = s.find(&key)?;
    let rest = s[pos + key.len()..].trim_start();
    let end = rest
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(rest.len());
    rest[..end].parse().ok()
}

/// Resize the ConPTY to the given dimensions.
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

// ---------------------------------------------------------------------------
// ThinkingTagFilter — streaming `<thinking>` / `</thinking>` extractor
// ---------------------------------------------------------------------------

/// Open and close tag byte sequences for Claude-style thinking blocks.
const THINKING_OPEN: &[u8] = b"<thinking>";
const THINKING_CLOSE: &[u8] = b"</thinking>";

/// Streaming byte-level filter that extracts `<thinking>…</thinking>` blocks
/// from raw PTY output.
///
/// Call [`ThinkingTagFilter::process`] once per read chunk.  It returns
/// `(main_output, thinking_content)`:
///
/// - `main_output`      — bytes with all `<thinking>` content and tag
///                        delimiters removed; safe to forward to xterm.js.
/// - `thinking_content` — bytes extracted from inside the tags; send to the
///                        side-panel channel.
///
/// Handles tags that are split across arbitrary chunk boundaries.
pub struct ThinkingTagFilter {
    inside: bool,
    /// Bytes that form a valid prefix of the current target tag but have not
    /// yet been matched completely.  Carried across `process()` calls.
    pending: Vec<u8>,
}

impl ThinkingTagFilter {
    pub fn new() -> Self {
        Self {
            inside: false,
            pending: Vec::new(),
        }
    }

    /// Process one raw PTY chunk.  Returns `(main_output, thinking_content)`.
    pub fn process(&mut self, input: &[u8]) -> (Vec<u8>, Vec<u8>) {
        let mut main_out = Vec::new();
        let mut think_out = Vec::new();

        // Prepend any bytes left over from the previous call.
        let mut work = std::mem::take(&mut self.pending);
        work.extend_from_slice(input);

        let mut i = 0;
        while i < work.len() {
            let target = if self.inside { THINKING_CLOSE } else { THINKING_OPEN };
            let rem = &work[i..];

            // Count how many leading bytes of `rem` match the target tag.
            let match_len = rem
                .iter()
                .zip(target.iter())
                .take_while(|(a, b)| a == b)
                .count();

            if match_len == 0 {
                // No match — emit this byte to the current stream and advance.
                let byte = work[i];
                if self.inside {
                    think_out.push(byte);
                } else {
                    main_out.push(byte);
                }
                i += 1;
            } else if match_len == target.len() {
                // Full tag match — flip inside/outside state, consume the tag.
                self.inside = !self.inside;
                i += target.len();
            } else if i + match_len == work.len() {
                // Partial match that extends to the very end of `work` —
                // save to pending and wait for the next chunk.
                self.pending = rem.to_vec();
                break;
            } else {
                // Partial prefix followed by a non-matching byte — emit
                // the first byte only and re-scan from the next position.
                let byte = work[i];
                if self.inside {
                    think_out.push(byte);
                } else {
                    main_out.push(byte);
                }
                i += 1;
            }
        }

        (main_out, think_out)
    }
}

// ---------------------------------------------------------------------------
// GeminiThinkingDetector — intercept Gemini CLI "Thinking..." status lines
// ---------------------------------------------------------------------------

/// Strip ANSI/VT escape sequences from a raw byte slice, returning plain text.
/// Handles CSI (`ESC[…`), OSC (`ESC]…BEL`), and single-char escape sequences.
pub fn strip_ansi_escapes(input: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(input.len());
    let mut i = 0;
    while i < input.len() {
        if input[i] == 0x1b {
            i += 1;
            if i >= input.len() {
                break;
            }
            match input[i] {
                b'[' => {
                    // CSI sequence: skip parameter + intermediate bytes, then the final byte (0x40–0x7e).
                    i += 1;
                    while i < input.len() && !(0x40..=0x7e).contains(&input[i]) {
                        i += 1;
                    }
                    if i < input.len() {
                        i += 1;
                    }
                }
                b']' => {
                    // OSC sequence: terminated by BEL (0x07) or ST (ESC \).
                    i += 1;
                    while i < input.len() {
                        if input[i] == 0x07 {
                            i += 1;
                            break;
                        }
                        if input[i] == 0x1b && i + 1 < input.len() && input[i + 1] == b'\\' {
                            i += 2;
                            break;
                        }
                        i += 1;
                    }
                }
                _ => {
                    i += 1;
                }
            }
        } else {
            out.push(input[i]);
            i += 1;
        }
    }
    out
}

/// Detects Gemini CLI "Thinking... (esc to cancel, Xs)" status lines from raw
/// PTY output and extracts them for the side-panel channel.
///
/// Unlike [`ThinkingTagFilter`], this detector does **not** strip the matched
/// content from the main terminal stream — the progress indicator continues to
/// appear in the terminal while also being mirrored to the thinking panel.
///
/// Consecutive identical thinking messages are deduplicated so only the first
/// occurrence of each countdown value (e.g. "Thinking... (esc to cancel, 11s)")
/// is forwarded to the channel.
pub struct GeminiThinkingDetector {
    last_sent: String,
}

impl GeminiThinkingDetector {
    pub fn new() -> Self {
        Self {
            last_sent: String::new(),
        }
    }

    /// Process one raw PTY chunk.
    /// Returns extracted thinking text to route to the side panel, or empty.
    pub fn process(&mut self, chunk: &[u8]) -> Vec<u8> {
        let stripped = strip_ansi_escapes(chunk);
        let text = String::from_utf8_lossy(&stripped);

        if let Some(idx) = text.find("Thinking...") {
            let thinking_part = &text[idx..];
            let end = thinking_part
                .find(|c: char| c == '\n' || c == '\r')
                .unwrap_or(thinking_part.len().min(80));
            let extracted = thinking_part[..end].trim().to_string();

            // Only forward countdown entries — skip bare "Thinking..." spinner frames
            // that appear between each countdown tick.  Never reset last_sent between
            // chunks; deduplication must persist across chunk boundaries to prevent
            // the same countdown value from being forwarded multiple times.
            if extracted.contains("(esc to cancel,") && extracted != self.last_sent {
                self.last_sent = extracted.clone();
                return format!("{extracted}\n").into_bytes();
            }
        }

        Vec::new()
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

    // ── ThinkingTagFilter tests ───────────────────────────────────────────

    #[test]
    fn thinking_filter_strips_tags_and_extracts_content() {
        let mut f = ThinkingTagFilter::new();
        let input = b"before<thinking>inner</thinking>after";
        let (main, think) = f.process(input);
        assert_eq!(main, b"beforeafter");
        assert_eq!(think, b"inner");
    }

    #[test]
    fn thinking_filter_handles_tag_split_across_chunks() {
        let mut f = ThinkingTagFilter::new();
        // Split "<thinking>" as "<think" + "ing>"
        let (m1, t1) = f.process(b"hello<think");
        let (m2, t2) = f.process(b"ing>content</thinking>end");
        assert_eq!([m1, m2].concat(), b"helloend");
        assert_eq!([t1, t2].concat(), b"content");
    }

    #[test]
    fn thinking_filter_handles_close_tag_split_across_chunks() {
        let mut f = ThinkingTagFilter::new();
        // Open tag in one chunk, close tag split across two chunks.
        let (m1, t1) = f.process(b"<thinking>abc</think");
        let (m2, t2) = f.process(b"ing>tail");
        assert_eq!([m1, m2].concat(), b"tail");
        assert_eq!([t1, t2].concat(), b"abc");
    }

    #[test]
    fn thinking_filter_passes_non_tag_content_unchanged() {
        let mut f = ThinkingTagFilter::new();
        let input = b"no tags here";
        let (main, think) = f.process(input);
        assert_eq!(main, b"no tags here");
        assert!(think.is_empty());
    }

    #[test]
    fn thinking_filter_false_open_tag_prefix_is_emitted() {
        let mut f = ThinkingTagFilter::new();
        // "<thinx" is not a valid opening tag and should be emitted as-is.
        let (main, think) = f.process(b"<thinx>rest");
        assert_eq!(main, b"<thinx>rest");
        assert!(think.is_empty());
    }

    #[test]
    fn thinking_filter_multiple_blocks() {
        let mut f = ThinkingTagFilter::new();
        let (main, think) = f.process(b"a<thinking>1</thinking>b<thinking>2</thinking>c");
        assert_eq!(main, b"abc");
        assert_eq!(think, b"12");
    }
}
