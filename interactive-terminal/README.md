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
