# Out-of-Process PTY Host — Implementation Summary

## Overview

This document summarises the implementation of the out-of-process PTY host for the `interactive-terminal` crate.  The feature isolates ConPTY sessions into a separate lightweight process (`pty-host`) to improve stability and isolate the Qt GUI process from native PTY crashes.

The implementation is gated behind the Cargo feature flag `pty-host` — all existing code paths are fully preserved under `#[cfg(not(feature = "pty-host"))]`.

---

## Architecture

```
┌──────────────────────────────────────────┐
│  interactive-terminal (UI process)        │
│  Port 9100 TCP  ·  Port 9101 WS           │
│                                           │
│  pty_host_launcher.rs                     │
│    └── spawns pty-host.exe as child       │
│                                           │
│  cxxqt_bridge/pty_host_client.rs          │
│    └── TCP NDJSON client → port 9102      │
│    └── routes SessionOutput → existing    │
│         session_output_tx pipeline        │
│    └── routes SessionExited → AppState    │
│         SessionLifecycleState::Closed     │
└──────────────┬───────────────────────────┘
               │  TCP :9102  (NDJSON)
               │
┌──────────────▼───────────────────────────┐
│  pty-host (child process)                 │
│                                           │
│  ipc_server.rs                            │
│    └── TcpListener :9102 (one client)     │
│    └── recv task: dispatch to PtyManager  │
│    └── send task: forward HostEvents +    │
│         heartbeat to client               │
│                                           │
│  pty_manager.rs                           │
│    └── HashMap<session_id, ActiveSession> │
│    └── spawn / write_input / resize / kill│
│                                           │
│  pty_backend.rs                           │
│    └── ConPTY via portable-pty (Windows)  │
└──────────────────────────────────────────┘
```

---

## New Files

| File | Purpose |
|------|---------|
| `interactive-terminal/pty-host/Cargo.toml` | Standalone binary crate manifest |
| `interactive-terminal/pty-host/src/main.rs` | Entry point with clap CLI (`--ipc-port`, `--heartbeat-ms`) |
| `interactive-terminal/pty-host/src/pty_host_protocol.rs` | Duplicate of shared protocol enum (see note below) |
| `interactive-terminal/pty-host/src/pty_backend.rs` | ConPTY spawning without Qt dependency (`ConptyRawSession`) |
| `interactive-terminal/pty-host/src/pty_manager.rs` | Session lifecycle manager (`PtyManager`, `HostEvent`) |
| `interactive-terminal/pty-host/src/ipc_server.rs` | TCP NDJSON IPC server (`IpcServer::run`) |
| `interactive-terminal/src/pty_host_protocol.rs` | Canonical `PtyHostMessage` NDJSON enum (with unit tests) |
| `interactive-terminal/src/pty_host_launcher.rs` | Spawns `pty-host.exe` on startup; `PTY_HOST_IPC_PORT = 9102` |
| `interactive-terminal/src/cxxqt_bridge/pty_host_client.rs` | `PtyHostClient`, `PtyHostSessionHandle`, `PTY_HOST_CLIENT` |

---

## Modified Files

| File | Change |
|------|--------|
| `Cargo.toml` (root workspace) | Added `"interactive-terminal/pty-host"` to `members` |
| `interactive-terminal/Cargo.toml` | Added `[features] pty-host = []` |
| `interactive-terminal/src/main.rs` | Added `mod pty_host_launcher; mod pty_host_protocol;` + launch call |
| `interactive-terminal/src/cxxqt_bridge/mod.rs` | Added `#[cfg(feature = "pty-host")] pub mod pty_host_client;` |
| `interactive-terminal/src/cxxqt_bridge/runtime_tasks.rs` | Feature-gated `WsTerminalSessionHandle`, `ensure_ws_terminal_session`, `terminate_ws_terminal_session`, `prune_closed_ws_terminal_sessions`, input pump, added `PtyHostClient::connect` call |

---

## IPC Protocol (`PtyHostMessage`)

Wire format: newline-delimited JSON (NDJSON) over `127.0.0.1:9102`.

Tagged enum (`#[serde(tag = "type", rename_all = "snake_case")]`):

| Variant | Direction | Purpose |
|---------|-----------|---------|
| `SessionCreate` | UI → host | Spawn a new PTY session |
| `SessionCreated` | Host → UI | Spawn succeeded |
| `SessionCreateFailed` | Host → UI | Spawn failed (includes error string) |
| `SessionInput` | UI → host | Write bytes to PTY stdin |
| `SessionResize` | UI → host | Resize PTY (`cols`, `rows`) |
| `SessionOutput` | Host → UI | Raw PTY output bytes (UTF-8 lossy) |
| `SessionExited` | Host → UI | Shell process exited (optional exit code) |
| `SessionKill` | UI → host | Kill a session |
| `Heartbeat` | Host → UI | Periodic liveness signal (UNIX timestamp) |

---

## Protocol Duplication Note

`interactive-terminal` has no `lib.rs` target (only a `[[bin]]` entry) and uses CXX-Qt build constraints that make adding one non-trivial.  As a result, `pty-host` cannot depend on `interactive-terminal` as a library crate.  The `PtyHostMessage` enum is therefore **deliberately duplicated** into `pty-host/src/pty_host_protocol.rs` (annotated with a comment explaining the reason).  If a shared library crate is introduced in the future, this duplication should be consolidated.

---

## Feature Flag Usage

```toml
# Activate out-of-process PTY host
cargo build --features pty-host
```

Without the flag, the original in-process ConPTY path is used unchanged.

---

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 9100 | TCP NDJSON | MCP command/response (unchanged) |
| 9101 | WebSocket | xterm.js terminal output (unchanged) |
| 9102 | TCP NDJSON | pty-host IPC (new) |

---

## Backwards Compatibility Checklist

- ✅ `protocol.rs` `Message` enum — **untouched** (MCP wire format stable)
- ✅ `execute_command_via_ws_terminal` — **untouched** (uses `ws_input_tx` / `ws_output_tx` only)
- ✅ `AppState.ws_terminal_tx` — **untouched** (broadcast sender unchanged)
- ✅ Approval flow (`approve_command → command_tx → exec_task`) — **untouched**
- ✅ `SessionOutputBuffer` / disk-spill — **untouched**
- ✅ Legacy ConPTY path — **preserved** under `#[cfg(all(windows, not(feature = "pty-host")))]`

---

## Known Limitations / Future Work

- `pty-host` is Windows-only; non-Windows builds are no-ops (no ConPTY available).
- `pty-host.exe` must be co-located with `interactive-terminal.exe` at runtime.
- Session reconnection on pty-host crash is not yet implemented; the UI process would need to re-launch and re-create sessions.
- The `PtyHostMessage` NDJSON protocol should be moved to a shared `pty-protocol` crate if a library target is added.
