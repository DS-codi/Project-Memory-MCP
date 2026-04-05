//! WebView host for the xterm.js terminal panel.
//!
//! Spawns a separate OS window containing a wry WebView2 (Windows) that loads
//! the xterm.js terminal page served by ws_server.rs.
//!
//! Architecture: a background thread runs the winit 0.30 EventLoop for the WebView
//! window. The iced main thread communicates via a sync channel to show/hide/navigate.
//!
//! wry version used: 0.47.2
//! winit version used: 0.30 (pulled in by iced 0.13)
//!
//! Windows-only. On other platforms this module is a no-op stub.

#[cfg(windows)]
mod inner {
    use std::sync::OnceLock;
    use std::sync::mpsc as sync_mpsc;

    // ── Commands sent from iced → WebView thread ──────────────────────────────

    /// Commands sent from the iced main thread to the WebView background thread.
    #[derive(Debug)]
    pub enum WebViewCommand {
        /// Navigate to a new URL.
        Navigate(String),
        /// Make the WebView window visible.
        Show,
        /// Hide the WebView window (does NOT destroy it).
        Hide,
        /// Close and terminate the WebView thread.
        Close,
        /// Resize / reposition the window (physical pixels).
        SetBounds { x: i32, y: i32, width: u32, height: u32 },
    }

    // ── Module-level state (set once at startup) ──────────────────────────────

    static WEBVIEW_TX: OnceLock<sync_mpsc::SyncSender<WebViewCommand>> = OnceLock::new();

    // ── Public entry points ───────────────────────────────────────────────────

    /// Spawn the WebView window thread. Call once when the terminal port is known.
    /// Returns `false` if already started or if initialisation failed.
    pub fn start(port: u16, title: &str) -> bool {
        if WEBVIEW_TX.get().is_some() {
            return false; // already running
        }

        let (tx, rx) = sync_mpsc::sync_channel::<WebViewCommand>(64);
        WEBVIEW_TX.set(tx).ok();

        let url   = format!("http://127.0.0.1:{}/", port);
        let title = title.to_string();

        std::thread::spawn(move || {
            run_webview_thread(url, title, rx);
        });

        true
    }

    // ── Background thread ─────────────────────────────────────────────────────

    fn run_webview_thread(
        url:   String,
        title: String,
        rx:    sync_mpsc::Receiver<WebViewCommand>,
    ) {
        use winit::event::{Event, WindowEvent};
        use winit::event_loop::{ControlFlow, EventLoopBuilder};
        use winit::window::WindowAttributes;
        use winit::platform::windows::EventLoopBuilderExtWindows;
        use wry::WebViewBuilder;

        // Build an event loop that is allowed to run on a non-main thread
        // (required because iced already owns the main thread's event loop).
        let mut builder = EventLoopBuilder::<WebViewCommand>::with_user_event();
        builder.with_any_thread(true);
        let event_loop = match builder.build() {
            Ok(el) => el,
            Err(e) => {
                tracing::error!("[webview_host] Failed to create EventLoop: {}", e);
                return;
            }
        };

        // Proxy used by the command relay thread to inject user events.
        let proxy = event_loop.create_proxy();

        // Relay: bridge the sync_mpsc receiver → winit user-events.
        std::thread::spawn(move || {
            loop {
                match rx.recv_timeout(std::time::Duration::from_millis(50)) {
                    Ok(cmd) => {
                        if let Err(_) = proxy.send_event(cmd) {
                            break; // event loop exited
                        }
                    }
                    Err(sync_mpsc::RecvTimeoutError::Timeout) => {}
                    Err(sync_mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }
        });

        // State kept alive across event loop iterations.
        // Both are created on `Event::Resumed` (first iteration).
        let mut window_and_view: Option<(winit::window::Window, wry::WebView)> = None;

        let run_result = event_loop.run(move |event, active_loop| {
            active_loop.set_control_flow(ControlFlow::Wait);

            match event {
                // ── First run: create window + WebView ────────────────────────
                Event::Resumed => {
                    if window_and_view.is_some() {
                        return; // already created (re-entrancy guard)
                    }

                    let attrs = WindowAttributes::default()
                        .with_title(&title)
                        .with_inner_size(winit::dpi::LogicalSize::new(900u32, 700u32))
                        .with_visible(true);

                    let window = match active_loop.create_window(attrs) {
                        Ok(w) => w,
                        Err(e) => {
                            tracing::error!("[webview_host] Failed to create window: {}", e);
                            active_loop.exit();
                            return;
                        }
                    };

                    let webview = match WebViewBuilder::new()
                        .with_url(&url)
                        .with_devtools(cfg!(debug_assertions))
                        .build(&window)
                    {
                        Ok(wv) => wv,
                        Err(e) => {
                            tracing::error!(
                                "[webview_host] Failed to create WebView (WebView2 installed?): {}",
                                e
                            );
                            active_loop.exit();
                            return;
                        }
                    };

                    tracing::info!("[webview_host] Window + WebView ready, loading {}", url);
                    window_and_view = Some((window, webview));
                }

                // ── Commands from iced ────────────────────────────────────────
                Event::UserEvent(cmd) => {
                    if let Some((ref window, ref webview)) = window_and_view {
                        match cmd {
                            WebViewCommand::Navigate(u) => {
                                if let Err(e) = webview.load_url(&u) {
                                    tracing::warn!("[webview_host] load_url failed: {}", e);
                                }
                            }
                            WebViewCommand::Show => {
                                window.set_visible(true);
                            }
                            WebViewCommand::Hide => {
                                window.set_visible(false);
                            }
                            WebViewCommand::Close => {
                                active_loop.exit();
                            }
                            WebViewCommand::SetBounds { x, y, width, height } => {
                                let _ = window.request_inner_size(
                                    winit::dpi::PhysicalSize::new(width, height),
                                );
                                window.set_outer_position(
                                    winit::dpi::PhysicalPosition::new(x, y),
                                );
                            }
                        }
                    }
                }

                // ── Window close button → hide, don't destroy ─────────────────
                Event::WindowEvent {
                    event: WindowEvent::CloseRequested,
                    ..
                } => {
                    if let Some((ref window, _)) = window_and_view {
                        window.set_visible(false);
                    }
                }

                _ => {}
            }
        });

        if let Err(e) = run_result {
            tracing::warn!("[webview_host] EventLoop exited with error: {}", e);
        }
    }

    // ── Send helpers ──────────────────────────────────────────────────────────

    /// Send a command to the WebView thread (non-blocking, drops if channel full).
    pub fn send(cmd: WebViewCommand) {
        if let Some(tx) = WEBVIEW_TX.get() {
            let _ = tx.try_send(cmd);
        }
    }

    pub fn navigate(port: u16) {
        send(WebViewCommand::Navigate(format!("http://127.0.0.1:{}/", port)));
    }

    pub fn show() {
        send(WebViewCommand::Show);
    }

    pub fn hide() {
        send(WebViewCommand::Hide);
    }

    pub fn close() {
        send(WebViewCommand::Close);
    }
}

// ── Public API (cfg-gated) ────────────────────────────────────────────────────

/// Start the WebView terminal window. No-op on non-Windows. Returns `false` if
/// already started or if the WebView2 runtime is unavailable.
pub fn start(port: u16) -> bool {
    #[cfg(windows)]
    { inner::start(port, "Terminal") }
    #[cfg(not(windows))]
    { let _ = port; false }
}

/// Show the terminal WebView window. No-op on non-Windows.
pub fn show() {
    #[cfg(windows)] inner::show();
}

/// Hide the terminal WebView window. No-op on non-Windows.
pub fn hide() {
    #[cfg(windows)] inner::hide();
}

/// Navigate to a new terminal server URL (e.g. when the port changes). No-op on non-Windows.
pub fn navigate(port: u16) {
    #[cfg(windows)] inner::navigate(port);
}

/// Close and destroy the WebView window. No-op on non-Windows.
pub fn close() {
    #[cfg(windows)] inner::close();
}
