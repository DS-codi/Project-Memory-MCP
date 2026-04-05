# interactive-terminal-iced

A pure Rust, [iced 0.13](https://github.com/iced-rs/iced) implementation of the Project Memory interactive terminal GUI.  
It coexists alongside the CxxQt/QML `interactive-terminal` crate and requires **no Qt installation**.

---

## What this crate is

`interactive-terminal-iced` provides the same user-facing interactive terminal experience as the QML version, but is built entirely in Rust using the iced GUI toolkit.  
Key capabilities:

- Renders an **xterm.js** terminal area inside a native OS window backed by the `wry` / WebView2 runtime.
- Connects to the `pm-cli` TCP backend to relay PTY I/O and command-approval events.
- Exposes a system tray icon for quick access and background-mode operation.
- Supports multiple windows managed through a single `iced::daemon` event loop.

---

## Architecture overview

```
┌─────────────────────────────────────────────────────┐
│                iced::daemon event loop               │
│                                                      │
│  ┌──────────────┐   ┌──────────────────────────┐    │
│  │  Main window │   │  Command-approval window  │    │
│  │  (iced UI)   │   │  (iced UI)                │    │
│  └──────┬───────┘   └──────────────────────────┘    │
│         │                                            │
│  ┌──────▼──────────────────────────────────────┐    │
│  │           webview_host                       │    │
│  │  Standalone OS window (wry + WebView2)       │    │
│  │  Loads xterm.js; bridges PTY I/O over        │    │
│  │  postMessage ↔ Rust IPC channel              │    │
│  └──────▲───────────────────────────────────────┘   │
│         │                                            │
│  ┌──────┴──────────────────────────────────────┐    │
│  │           backend_bridge                     │    │
│  │  Tokio async TCP client → pm-cli server      │    │
│  │  Multiplexes PTY bytes + JSON approval msgs  │    │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌────────────────────────────────────────────┐     │
│  │  tray  (tray-icon + tokio event dispatch)  │     │
│  └────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────┘
```

### Key design decisions

| Concern | Approach |
|---------|----------|
| GUI framework | `iced` 0.13 with `tokio` runtime |
| Terminal rendering | `wry` WebView2 OS window hosting xterm.js (Windows-only for WebView2; Linux/macOS can substitute a compatible WebView backend) |
| PTY / backend I/O | TCP stream to a running `pm-cli` server; fully async via `tokio` |
| Multi-window | `iced::daemon` — each logical window is an independent surface within one process |
| System tray | `tray-icon` crate with tokio channel dispatch back into the iced runtime |
| Approval/brainstorm dialogs | First-class iced windows (not pop-up overlays) |

---

## Key modules

| Module | Purpose |
|--------|---------|
| `app_state` | Top-level application state, message enum, iced `Application` impl |
| `backend_bridge` | Async TCP client connecting to the pm-cli server; encodes/decodes the JSON + PTY wire protocol |
| `webview_host` | Spawns and manages the `wry` WebView2 OS window; bridges JavaScript `postMessage` ↔ Rust channels |
| `tray` | System-tray icon lifecycle, menu construction, and event dispatch |
| `types` | Shared data types: `PtyEvent`, `ApprovalRequest`, `AppMessage`, config structs |
| `ui/terminal` | iced widget wrappers for the terminal panel (scrollback, resize signalling) |
| `ui/approval` | iced view for command-approval / diff display |
| `ui/brainstorm` | iced view for brainstorm / context-gathering dialogs |

---

## Differences from the QML version (`interactive-terminal/`)

| Aspect | QML version | iced version (this crate) |
|--------|-------------|---------------------------|
| GUI toolkit | Qt 6 / CxxQt / QML | iced 0.13 (pure Rust) |
| Qt dependency | Required (Qt 6 MSVC kit) | None |
| Terminal embedding | Qt WebEngine (Chromium) | wry WebView2 OS window (separate HWND) |
| Build tooling | `cxx-qt-build` + Qt CMake | `cargo build` only |
| Platform support | Windows (primary), Linux (partial) | Windows (WebView2 required); iced logic cross-platform |
| Maturity | Production-ready | Work in progress |

The WebView terminal window is a **standalone OS window** (not embedded inside the iced surface) because `wry` and `iced` manage their own event loops and window handles independently. The two windows appear and behave as a cohesive unit through coordinated show/hide/resize messaging.

---

## Build instructions

### Prerequisites

- Rust toolchain (stable, 2021 edition)
- **Windows:** [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) — usually pre-installed on Windows 10/11; required by `wry`

### Quick build (debug)

From the workspace root:

```powershell
.\build-interactive-terminal-iced.ps1
```

The binary is copied to `interactive-terminal-iced.exe` in the project root.

### Release build

```powershell
.\build-interactive-terminal-iced.ps1 -Release
```

### Clean build

```powershell
.\build-interactive-terminal-iced.ps1 -Clean
# or combined:
.\build-interactive-terminal-iced.ps1 -Clean -Release
```

### Manual cargo invocation

```bash
# debug
cargo build -p interactive-terminal-iced

# release
cargo build --release -p interactive-terminal-iced
```

Output paths:
- Debug:   `target\debug\interactive-terminal-iced.exe`
- Release: `target\release\interactive-terminal-iced.exe`

---

## Development notes

### WebView2 runtime (Windows)

`wry` on Windows requires the WebView2 runtime to be installed on the target machine.  
It is pre-installed on Windows 10 (20H2+) and Windows 11.  
For CI or clean VMs, install it from: <https://developer.microsoft.com/en-us/microsoft-edge/webview2/>

The WebView2 dependency is gated behind `[target.'cfg(windows)'.dependencies]` in `Cargo.toml`.  
On non-Windows platforms the `webview_host` module is stubbed out and the terminal area falls back to a placeholder iced widget.

### iced 0.13 multi-window via `iced::daemon`

iced 0.13 introduced `iced::daemon` as the preferred API for multi-window applications.  
Each window is identified by a `window::Id` and managed through iced's built-in `window::open` / `window::close` commands.  
The main application struct implements `iced::daemon` traits rather than `iced::application`.

### TCP backend protocol

`backend_bridge` connects to the `pm-cli` interactive-terminal server (default port **3458**).  
The wire format is framed NDJSON for control messages and raw bytes for PTY I/O, multiplexed over a single TCP stream.  
Reconnect logic is handled automatically; the UI shows a "disconnected" banner when the backend is not reachable.

### Tray icon threading

`tray-icon` runs its own OS event loop on a background thread.  
Tray menu actions are sent into the iced runtime via a `tokio::sync::mpsc` channel and converted to `AppMessage` variants inside the iced `subscription` layer.

---

## License

MIT — see the workspace `LICENSE` file.
