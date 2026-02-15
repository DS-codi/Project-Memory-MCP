# Interactive Terminal

A Qt-based GUI application for interactive command approval and execution. Built with Rust, CxxQt, and QML.

The Interactive Terminal acts as a human-in-the-loop gateway: an MCP server (or any TCP client) sends command requests over a TCP connection, and the user approves or declines each one through a desktop GUI. Approved commands are executed locally with real-time output streaming.

## MCP Integration Topology

The Interactive Terminal participates in a routed MCP flow where approval and execution are separated:

- MCP caller chooses a terminal workflow intent.
- Interactive Terminal (Rust+QML) handles approval queue and decision UI.
- After approval, routing resolves to one execution contract:
  - `memory_terminal` for headless server/container execution
  - `memory_terminal_interactive` for visible host-terminal execution
- Result/error payloads are returned using the selected terminal surface contract.

The gateway is an approval/orchestration layer and should not be treated as a third terminal execution API.

For canonical contract details and action-alias unification design, see:

- [Interactive Terminal Contract Unification Design](../docs/interactive-terminal-contract-unification-design.md)

## Architecture

```
┌─────────────────┐          TCP (NDJSON)          ┌──────────────────────────────┐
│                 │  ──── CommandRequest ────────►  │                              │
│   MCP Server    │                                 │    Interactive Terminal       │
│   (client)      │  ◄─── CommandResponse ───────  │                              │
│                 │  ◄──► Heartbeat ──────────────► │                              │
└─────────────────┘                                 └──────┬───────────────────────┘
                                                           │
                                                    ┌──────┴───────────────────────┐
                                                    │   Rust Backend               │
                                                    │  ┌───────────────────────┐   │
                                                    │  │ TcpServer             │   │
                                                    │  │  • accept loop        │   │
                                                    │  │  • NDJSON framing     │   │
                                                    │  │  • heartbeat monitor  │   │
                                                    │  └───────┬───────────────┘   │
                                                    │          │ channels           │
                                                    │  ┌───────┴───────────────┐   │
                                                    │  │ TerminalApp (QObject) │   │
                                                    │  │  • command queue      │   │
                                                    │  │  • approve / decline  │   │
                                                    │  └───────┬───────────────┘   │
                                                    │          │ Qt signals         │
                                                    │  ┌───────┴───────────────┐   │
                                                    │  │ QML UI               │   │
                                                    │  │  • main.qml          │   │
                                                    │  │  • CommandCard.qml   │   │
                                                    │  │  • DeclineDialog.qml │   │
                                                    │  │  • OutputView.qml   │   │
                                                    │  └───────────────────────┘   │
                                                    └──────────────────────────────┘
```

## Prerequisites

- **Rust toolchain** — stable 1.70+ (install via [rustup](https://rustup.rs))
- **Qt 6.x** — 6.5 or later (tested with 6.10.2 MSVC 2022)
- **QMAKE environment variable** — must point to your Qt installation's `qmake6` executable

### Setting QMAKE

```powershell
# Windows (PowerShell) — adjust path for your Qt version
$env:QMAKE = "C:\Qt\6.10.2\msvc2022_64\bin\qmake6.exe"
```

```bash
# Linux / macOS
export QMAKE=/usr/lib/qt6/bin/qmake6
```

## Build Instructions

```bash
# Debug build
cargo build

# Release build (with LTO, optimized)
cargo build --release

# Run tests
cargo test
```

The release binary is written to `target/release/interactive-terminal` (or `.exe` on Windows).

## Usage

```bash
# Start with default settings (port 9100, 5s heartbeat, 300s idle timeout)
./interactive-terminal

# Custom port
./interactive-terminal --port 8080

# All options
./interactive-terminal --port 9100 --heartbeat-interval 10 --idle-timeout 600
```

### CLI Arguments

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--port` | `u16` | `9100` | TCP port to listen on (127.0.0.1 only) |
| `--heartbeat-interval` | `u64` | `5` | Heartbeat interval in seconds |
| `--idle-timeout` | `u64` | `300` | Exit after this many seconds of inactivity |

The `TERMINAL_PORT` environment variable overrides `--port` if set.

## JSON Protocol

Communication uses **newline-delimited JSON (NDJSON)** over TCP. Each message is a single JSON object followed by a newline character (`\n`).

All messages have a `"type"` field that determines the message kind.

### Message Types

#### CommandRequest (Client → Terminal)

Request approval to execute a command.

```json
{
  "type": "command_request",
  "id": "req-001",
  "command": "npm run build",
  "working_directory": "/home/user/project",
  "context": "Building the project for deployment",
  "timeout_seconds": 120
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique request identifier |
| `command` | string | yes | Shell command to execute |
| `working_directory` | string | yes | Directory to run the command in |
| `context` | string | no | Human-readable context for the user |
| `timeout_seconds` | integer | no | Execution timeout (default: 300) |

#### CommandResponse (Terminal → Client)

Result of a command approval decision and/or execution.

**Approved and executed:**
```json
{
  "type": "command_response",
  "id": "req-001",
  "status": "approved",
  "output": "Build successful\nDone in 12.3s",
  "exit_code": 0
}
```

**Declined by user:**
```json
{
  "type": "command_response",
  "id": "req-001",
  "status": "declined",
  "reason": "Command looks dangerous"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Matching request ID |
| `status` | string | yes | `"approved"` or `"declined"` |
| `output` | string | no | Combined stdout/stderr output (when approved) |
| `exit_code` | integer | no | Process exit code (when approved) |
| `reason` | string | no | Decline reason (when declined) |

#### Heartbeat (Bidirectional)

Liveness check sent in both directions.

```json
{
  "type": "heartbeat",
  "timestamp": "2026-02-14T12:00:00Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `timestamp` | string | yes | ISO 8601 timestamp |

### Connection Lifecycle

1. Client connects to `127.0.0.1:{port}` via TCP
2. Both sides begin sending heartbeats at the configured interval
3. Client sends `command_request` messages; terminal responds with `command_response`
4. If no heartbeat is received within 3× the heartbeat interval, the connection is considered lost
5. On disconnect, all pending requests are cleaned up

## Project Structure

```
interactive-terminal/
├── Cargo.toml              # Rust package manifest
├── build.rs                # CxxQt build configuration + Windows resources
├── README.md               # This file
├── resources/
│   └── app.manifest        # Windows DPI manifest
├── qml/
│   ├── main.qml            # Root application window
│   ├── CommandCard.qml     # Command display card component
│   ├── DeclineDialog.qml   # Decline reason dialog
│   └── OutputView.qml      # Real-time output display
└── src/
    ├── main.rs             # Entry point, CLI parsing, Qt bootstrap
    ├── cxxqt_bridge.rs     # TerminalApp QObject (CxxQt bridge)
    ├── protocol.rs         # Message types, NDJSON encode/decode
    ├── tcp_server.rs       # TCP server, heartbeat monitoring
    ├── command_executor.rs # Child process execution with timeout
    └── session.rs          # Session/request tracking
```

## Troubleshooting

### `qmake6` not found

Ensure the `QMAKE` environment variable points to your Qt 6 `qmake6` executable:

```powershell
$env:QMAKE = "C:\Qt\6.10.2\msvc2022_64\bin\qmake6.exe"
```

### Linker errors on Windows

Make sure you have the MSVC C++ build tools installed (via Visual Studio Installer). The Qt MSVC kit requires the matching MSVC compiler.

### `cxx-qt-build` fails

- Verify Qt 6.5+ is installed
- Verify `QMAKE` is set correctly and the binary is executable
- Run `qmake6 --version` to confirm Qt is accessible

### Application doesn't start (no window)

- Check stderr output for error messages: `interactive-terminal --port 9100 2>&1`
- Verify QML files are being compiled (check that `build.rs` lists all `.qml` files)
- On Windows, try without the dark mode override: unset `QT_QPA_PLATFORM`

### Connection refused

- Verify the port isn't already in use: `netstat -an | findstr 9100`
- The server only binds to `127.0.0.1` (localhost) — remote connections are not accepted
