# Interactive Terminal (Current State)

Native Rust + CxxQt + QML desktop app used as the host-side approval/runtime endpoint for interactive terminal workflows.

## Overview

- Runtime listener: binds to `127.0.0.1:9100` by default (configurable).
- Host bridge listener: binds to `0.0.0.0:45459` by default and proxies to runtime `127.0.0.1:<runtimePort>`.
- Runtime listener is pre-bound during startup to avoid QML initialization timing issues.
- Build/deploy entrypoint: `build-interactive-terminal.ps1`.

## Architecture (high level)

```
MCP tool call
  -> interactive terminal routing (server)
  -> host bridge (optional container_bridge path, default port 45459)
  -> interactive-terminal runtime listener (default 127.0.0.1:9100)
  -> Qt UI approval + command execution lifecycle
```

More operations detail: `docs/runtime-ports-and-mcp-modes.md`.

## Out-of-Process PTY Host (`pty-host` feature)

The `pty-host` feature flag isolates ConPTY terminal sessions into a separate lightweight process, preventing native PTY crashes from affecting the Qt GUI process.

### How it works

When compiled with `--features pty-host`:

1. On startup, `interactive-terminal` spawns `pty-host.exe` as a child process.
2. The two processes communicate over a local TCP connection on port **9102** using newline-delimited JSON (NDJSON).
3. PTY session lifecycle (create, input, resize, kill) is managed entirely by `pty-host`.
4. Output bytes flow back through the same `session_output_tx` pipeline used by the legacy path — the rest of the runtime is unchanged.

```
interactive-terminal (UI)          pty-host (child)
  pty_host_launcher.rs ─── spawn ──► main.rs
  pty_host_client.rs   ─── TCP:9102 ─► ipc_server.rs
                                         └─► pty_manager.rs
                                               └─► pty_backend.rs (ConPTY)
```

### Ports

| Port | Purpose |
|------|---------|
| 9100 | MCP TCP JSON (unchanged) |
| 9101 | xterm.js WebSocket (unchanged) |
| 9102 | pty-host IPC NDJSON |

### Building with pty-host

```powershell
# Build both interactive-terminal and pty-host with the feature enabled
cargo build --features pty-host -p interactive-terminal
cargo build -p pty-host

# Or via the combined workspace build
cargo build --features interactive-terminal/pty-host
```

`pty-host.exe` must be co-located with `interactive-terminal.exe` at runtime.

### Backwards compatibility

The legacy in-process ConPTY path is fully preserved under `#[cfg(not(feature = "pty-host"))]`.  Omitting the feature flag produces an identical binary to the pre-feature build.

Full implementation notes: [`PTY_HOST_IMPL.md`](./PTY_HOST_IMPL.md)

## Prerequisites (Windows)

- Rust toolchain (`cargo`, `rustc`)
- Qt 6 MSVC kit (project default: `C:\Qt\6.10.2\msvc2022_64`)
- PowerShell 7+

## Build and Run

From `interactive-terminal/`:

```powershell
# Release build + Qt runtime deployment verification (default profile is release)
.\build-interactive-terminal.ps1 -Clean -Profile release

# Optional: run tests before build
.\build-interactive-terminal.ps1 -Test -Profile release

# Build and launch on custom runtime port
.\build-interactive-terminal.ps1 -Profile release -Run -Port 9100
```

Direct launch after build:

```powershell
.\target\release\interactive-terminal.exe --port 9100 --heartbeat-interval 5 --idle-timeout 300
```

### Build script behavior

- Sets `QMAKE` and prepends Qt `bin` to `PATH`.
- Builds via `cargo build` (adds `--release` for release profile).
- On Windows, runs `windeployqt.exe` for deploy-enabled builds.
- Verifies key Qt DLLs (`Qt6Core.dll`, `Qt6Gui.dll`, `Qt6Qml.dll`, `Qt6Quick.dll`) next to the exe.

## Runtime Configuration

- CLI:
  - `--port` (default `9100`)
  - `--heartbeat-interval` (default `5`)
  - `--idle-timeout` (default `300`)
- Environment overrides:
  - `TERMINAL_PORT` overrides `--port`
  - `PM_INTERACTIVE_TERMINAL_HOST_PORT` sets bridge listener port (default `45459`)

## MCP Integration Notes

- `memory_terminal`: headless server/container terminal surface.
- `memory_terminal_interactive`: canonical routed interactive contract.
  - Canonical actions: `execute`, `read_output`, `terminate`, `list`
  - Legacy aliases accepted: `run`, `kill`, `send`, `close`, `create`
- Adapter mode resolution for interactive routing:
  1. `runtime.adapter_override`
  2. `PM_TERM_ADAPTER_MODE`
  3. Fallback by `PM_RUNNING_IN_CONTAINER` (`container_bridge` in container, otherwise `local`)

## Persistent Process Architecture

Commands executed through the GUI runtime follow a persistent-process model: the Rust process outlives the TCP connection that initiated it, and output is tracked in memory so that later `read_output` and `kill` requests can retrieve or terminate it.

### Data Flow

```
TypeScript (memory_terminal action: run)
    │
    ▼
TcpTerminalAdapter  ── TCP ──►  Rust TcpServer  ── mpsc ──►  msg_task
    │                                                             │
    │  (connection closed after                       CommandRequest queued
    │   CommandResponse received)                     via command_tx
    │                                                             │
    ▼                                                             ▼
guiSessions.add(response.id)                                 exec_task
                                                                  │
                                                    ┌─────────────┼─────────────┐
                                                    │             │             │
                                              OutputTracker   kill channel   command_executor
                                              .store(running)  (oneshot tx)   .execute_command()
                                                    │             │             │
                                                    │             ▼             │
                                                    │      tokio::select! {     │
                                                    │        exec future,       │
                                                    │        kill_rx            │
                                                    │      }                    │
                                                    │             │             │
                                                    ▼             ▼             ▼
                                              OutputTracker.mark_completed(exit_code, stdout, stderr)

Later:  read_output / kill
    │
    ▼
Fresh TcpTerminalAdapter  ── TCP ──►  msg_task match arm
    │                                      │
    │  ReadOutputRequest         OutputTracker.build_read_output_response()
    │  KillSessionRequest        OutputTracker.try_kill() → oneshot::send()
    │                                      │
    ◄──────── response ───────────────────-┘
```

### Read Output Protocol

1. TypeScript calls `memory_terminal` with `action: "read_output"` and `session_id`.
2. The server checks `guiSessions`: if the session ID is present, it routes through TCP to the Rust runtime instead of the local headless handler.
3. A **fresh `TcpTerminalAdapter`** is created, connects to the runtime, sends a `ReadOutputRequest`, and awaits the `ReadOutputResponse`.
4. Inside Rust, `msg_task` matches `Message::ReadOutputRequest` and calls `OutputTracker.build_read_output_response()`, which looks up the session by ID and returns accumulated stdout/stderr, running state, and exit code.
5. If the process has completed (`running: false`), TypeScript removes the session from `guiSessions` so future calls fall back to the local handler.

### Kill Protocol

1. TypeScript calls `memory_terminal` with `action: "kill"` and `session_id`.
2. Same `guiSessions` routing as read_output — a fresh `TcpTerminalAdapter` sends a `KillSessionRequest`.
3. Inside Rust, `msg_task` matches `Message::KillSessionRequest` and calls `OutputTracker.try_kill()`.
4. `try_kill()` removes the `oneshot::Sender` for that session and sends `()` on it.
5. In `exec_task`, the running command is inside a `tokio::select!` that races the execution future against `kill_rx`. When `kill_rx` resolves, the execution future is dropped (killing the child process), and `OutputTracker.mark_completed()` records exit code `-1`.
6. TypeScript removes the session from `guiSessions` regardless of kill result.

### Kill Channel Mechanism

Each command execution creates a `tokio::sync::oneshot` channel pair:

```rust
let (kill_tx, kill_rx) = tokio::sync::oneshot::channel::<()>();
```

- **`kill_tx`** is registered with `OutputTracker.register_kill_sender(&req.id, kill_tx)` and stored in `OutputTracker.kill_senders` (keyed by request ID).
- **`kill_rx`** is used inside `exec_task`'s `tokio::select!` block to race against the actual command execution.
- When a `KillSessionRequest` arrives, `try_kill()` removes and fires the sender. The `select!` branch for `kill_rx` wins, dropping the execution future and capturing partial output.
- After natural completion, `mark_completed()` removes the kill sender since it's no longer needed.

### Session ID Mapping

The session/request ID flows through the entire stack as a single consistent key:

| Layer | Field | Usage |
|-------|-------|-------|
| TypeScript (server) | `guiSessions` Set | Tracks which sessions were routed through GUI |
| TCP protocol | `CommandRequest.id` | Request identifier sent to Rust |
| Rust `exec_task` | `req.id` | Key for `OutputTracker.store()` and `register_kill_sender()` |
| Rust `OutputTracker` | `completed` HashMap key | Lookup key for `build_read_output_response()` and `try_kill()` |
| TCP responses | `ReadOutputResponse.session_id` / `KillSessionResponse.session_id` | Returned to TypeScript for correlation |

`CommandRequest.id` is the canonical session identifier. TypeScript adds it to `guiSessions` after a successful run, and all subsequent `read_output`/`kill` calls use it to route through TCP and look up the correct `OutputTracker` entry.

### Fresh Adapter Pattern

Each `read_output` and `kill` call creates a **new `TcpTerminalAdapter`** instance rather than reusing the one from the original `run` call. This works because:

1. **Single-client TCP server**: The Rust runtime's `TcpServer` accepts one client at a time. The original connection is closed after the `CommandResponse` is received, freeing the listener for subsequent connections.
2. **State is server-side**: All output and kill-channel state lives in `OutputTracker` (inside `AppState`), not in the TCP connection. Any new connection can query or mutate it.
3. **Clean lifecycle**: Each adapter connects, sends one request, receives one response, and disconnects. No connection pooling or keepalive complexity.

### OutputTracker

`OutputTracker` (in `cxxqt_bridge/completed_outputs.rs`) is the in-memory store that bridges `exec_task` (producer) and `msg_task` (consumer):

| Field | Type | Purpose |
|-------|------|---------|
| `completed` | `HashMap<String, CompletedOutput>` | Stores stdout/stderr/exit_code/running for each session |
| `kill_senders` | `HashMap<String, oneshot::Sender<()>>` | Kill channels for running processes |

Key methods:
- `store()` — records a new entry (initially `running: true`, empty output)
- `mark_completed()` — updates with final exit code and output, removes kill sender
- `build_read_output_response()` — builds a `ReadOutputResponse` message from stored data
- `try_kill()` — removes and fires the kill sender, returns `KillSessionResponse`
- `evict_stale()` — removes entries older than 30 minutes

## Troubleshooting

```powershell
# Verify runtime listener
Test-NetConnection 127.0.0.1 -Port 9100

# Verify host bridge listener
Test-NetConnection 127.0.0.1 -Port 45459

# Check listeners for process
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 9100,45459 } | Format-Table -AutoSize
```

If `container_bridge` preflight fails, validate:

- `PM_INTERACTIVE_TERMINAL_HOST_ALIAS`
- `PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS`
- `PM_INTERACTIVE_TERMINAL_HOST_PORT`
- host app is running and bridge listener is up

## Validation Commands (lightweight)

```powershell
# Confirm key files exist
Test-Path .\build-interactive-terminal.ps1
Test-Path .\src\main.rs
Test-Path .\src\host_bridge_listener.rs

# Confirm release binary after build
Test-Path .\target\release\interactive-terminal.exe
```

## Known limitations / environment notes

- Windows-first operational path is validated; Linux/macOS workflow exists but is not the primary tested target in this workspace.
- In containerized flows, interactive execution depends on host bridge reachability and correct alias/port env values.
- If bridge preflight fails, requests fail closed (no implicit fallback execution).
