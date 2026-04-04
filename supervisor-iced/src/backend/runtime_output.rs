//! Runtime output store for managed supervisor components.
//!
//! Keeps a per-component in-memory ring buffer of recent output lines and
//! exposes a broadcast channel for live subscribers.  All QML-specific
//! machinery from the original supervisor implementation has been removed;
//! this module is pure-Rust / tokio.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::sync::broadcast;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// `[runtime_output]` section of the supervisor-iced config file.
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct RuntimeOutputSection {
    /// When `false`, output is drained from the pipe but never buffered or
    /// broadcast.  Useful for reducing memory pressure when log capture is
    /// not required.
    pub enabled: bool,
    /// Maximum number of lines retained **per component**.  Older lines are
    /// dropped when the buffer is full.  Defaults to `500`.
    pub buffer_size: usize,
    /// Capacity of the broadcast channel used for live subscribers.
    /// Defaults to `512`.
    pub channel_capacity: usize,
}

impl Default for RuntimeOutputSection {
    fn default() -> Self {
        Self {
            enabled: true,
            buffer_size: 500,
            channel_capacity: 512,
        }
    }
}

// ---------------------------------------------------------------------------
// Event type
// ---------------------------------------------------------------------------

/// A single captured output line from a managed component.
#[derive(Clone, Debug, Serialize)]
pub struct RuntimeOutputEvent {
    /// Unix timestamp in milliseconds.
    pub timestamp_ms: u64,
    /// Logical name of the component that produced this line (e.g. `"mcp"`).
    pub component: String,
    /// Stream the line came from: `"stdout"`, `"stderr"`, or `"status"`.
    pub stream: String,
    /// The text content of the line (trailing newline stripped).
    pub line: String,
}

// ---------------------------------------------------------------------------
// Store internals
// ---------------------------------------------------------------------------

struct StoreInner {
    /// Per-component ring buffers.  The key is the component name
    /// (lower-cased at insertion time for consistent lookup).
    buffers: HashMap<String, VecDeque<String>>,
    /// Whether capture is currently active.
    enabled: bool,
    /// Maximum lines kept per component.
    buffer_size: usize,
}

impl StoreInner {
    fn new(buffer_size: usize, enabled: bool) -> Self {
        Self {
            buffers: HashMap::new(),
            enabled,
            buffer_size,
        }
    }

    /// Push a line into the ring buffer for `component`, evicting the oldest
    /// entry when the buffer is full.
    fn push(&mut self, component: &str, line: String) {
        let buf = self
            .buffers
            .entry(component.to_ascii_lowercase())
            .or_insert_with(|| VecDeque::with_capacity(self.buffer_size));

        buf.push_back(line);
        while buf.len() > self.buffer_size {
            buf.pop_front();
        }
    }

    /// Return the last `n` lines for `component`, or an empty vec if the
    /// component is unknown or capture is disabled.
    fn get_recent(&self, component: &str, n: usize) -> Vec<String> {
        if !self.enabled {
            return Vec::new();
        }
        let key = component.to_ascii_lowercase();
        let Some(buf) = self.buffers.get(&key) else {
            return Vec::new();
        };
        let skip = buf.len().saturating_sub(n);
        buf.iter().skip(skip).cloned().collect()
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Thread-safe, cheaply-cloneable runtime output store.
///
/// # Example
/// ```ignore
/// let store = RuntimeOutputStore::new(RuntimeOutputSection::default());
/// let child = Command::new("my-service").stdout(Stdio::piped()).spawn()?;
/// store.spawn_pipe_reader("my-service", "stdout", child.stdout.unwrap());
/// let last_20 = store.get_recent("my-service", 20);
/// ```
#[derive(Clone)]
pub struct RuntimeOutputStore {
    inner: Arc<Mutex<StoreInner>>,
    tx: broadcast::Sender<RuntimeOutputEvent>,
}

impl RuntimeOutputStore {
    /// Create a new store with settings taken from `config`.
    pub fn new(config: RuntimeOutputSection) -> Self {
        let (tx, _) = broadcast::channel(config.channel_capacity);
        Self {
            inner: Arc::new(Mutex::new(StoreInner::new(
                config.buffer_size,
                config.enabled,
            ))),
            tx,
        }
    }

    // -----------------------------------------------------------------------
    // Capture control
    // -----------------------------------------------------------------------

    /// Returns `true` if output capture is currently enabled.
    pub fn is_enabled(&self) -> bool {
        self.inner
            .lock()
            .map(|g| g.enabled)
            .unwrap_or(false)
    }

    /// Enable or disable output capture.  Disabling clears all buffers.
    pub fn set_enabled(&self, enabled: bool) {
        if let Ok(mut g) = self.inner.lock() {
            g.enabled = enabled;
            if !enabled {
                g.buffers.clear();
            }
        }
    }

    // -----------------------------------------------------------------------
    // Emit / subscribe
    // -----------------------------------------------------------------------

    /// Record a single output line for `component` / `stream`.
    ///
    /// Blank lines (after trimming) are silently ignored.
    pub fn emit(&self, component: &str, stream: &str, line: impl Into<String>) {
        let content: String = line.into();
        if content.trim().is_empty() {
            return;
        }

        let event = RuntimeOutputEvent {
            timestamp_ms: now_ms(),
            component: component.to_string(),
            stream: stream.to_string(),
            line: content.clone(),
        };

        if let Ok(mut g) = self.inner.lock() {
            if !g.enabled {
                return;
            }
            g.push(component, content);
        }

        // Broadcast errors (no active receivers) are not fatal.
        let _ = self.tx.send(event);
    }

    /// Subscribe to the live broadcast channel.  The receiver will observe
    /// all events emitted after this call.
    pub fn subscribe(&self) -> broadcast::Receiver<RuntimeOutputEvent> {
        self.tx.subscribe()
    }

    // -----------------------------------------------------------------------
    // Query
    // -----------------------------------------------------------------------

    /// Return the last `n` buffered lines for `component`.
    ///
    /// Returns an empty vec when the component is unknown, `n` is zero, or
    /// capture is disabled.
    pub fn get_recent(&self, component: &str, n: usize) -> Vec<String> {
        if n == 0 {
            return Vec::new();
        }
        self.inner
            .lock()
            .map(|g| g.get_recent(component, n))
            .unwrap_or_default()
    }

    /// Return the last `n` buffered lines for `component` as full
    /// [`RuntimeOutputEvent`]s (timestamp / stream fields set to `"?"` /
    /// `"buffer"` since only the raw text was stored).
    ///
    /// Prefer [`get_recent`](Self::get_recent) when you only need the text.
    pub fn get_recent_events(&self, component: &str, n: usize) -> Vec<RuntimeOutputEvent> {
        self.get_recent(component, n)
            .into_iter()
            .map(|line| RuntimeOutputEvent {
                timestamp_ms: 0,
                component: component.to_string(),
                stream: "buffer".to_string(),
                line,
            })
            .collect()
    }

    /// Return the names of all components that have produced at least one
    /// buffered line.
    pub fn component_names(&self) -> Vec<String> {
        self.inner
            .lock()
            .map(|g| g.buffers.keys().cloned().collect())
            .unwrap_or_default()
    }

    /// Clear all buffered output (for all components).
    pub fn clear(&self) {
        if let Ok(mut g) = self.inner.lock() {
            g.buffers.clear();
        }
    }

    /// Clear buffered output for a single `component`.
    pub fn clear_component(&self, component: &str) {
        if let Ok(mut g) = self.inner.lock() {
            g.buffers.remove(&component.to_ascii_lowercase());
        }
    }

    // -----------------------------------------------------------------------
    // Pipe reader
    // -----------------------------------------------------------------------

    /// Spawn a background tokio task that reads lines from `reader` and feeds
    /// them into this store under the given `component` / `stream` label.
    ///
    /// The task exits cleanly when the pipe is closed (EOF) or when a read
    /// error occurs (the error is emitted as a `"status"` line so it shows up
    /// in the buffer and broadcast stream).
    ///
    /// `reader` is typically a [`tokio::process::ChildStdout`] or
    /// [`tokio::process::ChildStderr`].
    pub fn spawn_pipe_reader<R>(&self, component: impl Into<String>, stream: &str, reader: R)
    where
        R: AsyncRead + Unpin + Send + 'static,
    {
        let store = self.clone();
        let component = component.into();
        let stream_name = stream.to_string();

        tokio::spawn(async move {
            let mut lines = BufReader::new(reader).lines();
            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => {
                        if store.is_enabled() {
                            store.emit(&component, &stream_name, line);
                        }
                    }
                    Ok(None) => break, // EOF — pipe closed normally
                    Err(err) => {
                        if store.is_enabled() {
                            store.emit(
                                &component,
                                "status",
                                format!("runtime output read error ({stream_name}): {err}"),
                            );
                        }
                        break;
                    }
                }
            }
        });
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_store(buffer_size: usize) -> RuntimeOutputStore {
        RuntimeOutputStore::new(RuntimeOutputSection {
            enabled: true,
            buffer_size,
            channel_capacity: 16,
        })
    }

    #[test]
    fn ring_buffer_evicts_oldest() {
        let store = make_store(3);
        for i in 0..5u32 {
            store.emit("svc", "stdout", format!("line {i}"));
        }
        let recent = store.get_recent("svc", 10);
        // Only the last 3 lines should remain.
        assert_eq!(recent, vec!["line 2", "line 3", "line 4"]);
    }

    #[test]
    fn get_recent_respects_n() {
        let store = make_store(100);
        for i in 0..10u32 {
            store.emit("svc", "stdout", format!("line {i}"));
        }
        let recent = store.get_recent("svc", 3);
        assert_eq!(recent, vec!["line 7", "line 8", "line 9"]);
    }

    #[test]
    fn per_component_isolation() {
        let store = make_store(10);
        store.emit("alpha", "stdout", "alpha line");
        store.emit("beta", "stdout", "beta line");
        assert_eq!(store.get_recent("alpha", 10), vec!["alpha line"]);
        assert_eq!(store.get_recent("beta", 10), vec!["beta line"]);
    }

    #[test]
    fn disabled_store_returns_empty() {
        let store = make_store(10);
        store.emit("svc", "stdout", "before disable");
        store.set_enabled(false);
        // Buffer is cleared on disable.
        assert!(store.get_recent("svc", 10).is_empty());
        // Emitting while disabled is a no-op.
        store.emit("svc", "stdout", "while disabled");
        assert!(store.get_recent("svc", 10).is_empty());
    }

    #[test]
    fn blank_lines_are_ignored() {
        let store = make_store(10);
        store.emit("svc", "stdout", "   ");
        store.emit("svc", "stdout", "\t");
        store.emit("svc", "stdout", "real line");
        let recent = store.get_recent("svc", 10);
        assert_eq!(recent, vec!["real line"]);
    }

    #[test]
    fn component_names_tracks_all_emitters() {
        let store = make_store(10);
        store.emit("alpha", "stdout", "a");
        store.emit("Beta", "stdout", "b"); // stored as "beta"
        let mut names = store.component_names();
        names.sort();
        assert_eq!(names, vec!["alpha", "beta"]);
    }

    #[tokio::test]
    async fn spawn_pipe_reader_populates_buffer() {
        use tokio::io::AsyncWriteExt;

        let store = make_store(50);
        let (reader, mut writer) = tokio::io::duplex(1024);

        store.spawn_pipe_reader("pipe-svc", "stdout", reader);

        writer.write_all(b"hello\nworld\n").await.unwrap();
        drop(writer); // EOF

        // Give the background task a moment to drain.
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let recent = store.get_recent("pipe-svc", 10);
        assert!(recent.contains(&"hello".to_string()));
        assert!(recent.contains(&"world".to_string()));
    }
}
