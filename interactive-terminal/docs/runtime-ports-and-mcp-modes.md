# Interactive Terminal Operations: Ports and MCP Modes

This runbook summarizes the current runtime/bridge ports and how interactive MCP calls resolve execution mode.

## Listener Ports

## 1) Runtime listener (app core)

- Bind: `127.0.0.1:<runtimePort>`
- Default runtime port: `9100`
- Source of truth: app startup (`src/main.rs`) pre-binds this listener.

## 2) Host bridge listener (container bridge ingress)

- Bind: `0.0.0.0:<bridgePort>`
- Default bridge port: `45459`
- Purpose: proxy incoming bridge traffic to runtime listener (`127.0.0.1:<runtimePort>`).
- Source of truth: `src/host_bridge_listener.rs`.

## MCP Invocation Surfaces

- `memory_terminal`
  - Headless execution surface (server/container side)
  - Strict allowlist authorization model

- `memory_terminal_interactive`
  - Canonical interactive contract
  - Canonical actions: `execute`, `read_output`, `terminate`, `list`
  - Legacy aliases accepted: `run`, `kill`, `send`, `close`, `create`

## Adapter Mode Resolution (interactive calls)

Resolution order:

1. `runtime.adapter_override`
   - `container_bridge` => force bridge mode
   - `local` or `bundled` => force local mode
   - `auto` => container-aware resolution
2. `PM_TERM_ADAPTER_MODE`
3. Fallback by `PM_RUNNING_IN_CONTAINER`
   - `true` => `container_bridge`
   - otherwise => `local`

For `execute` in `container_bridge`, preflight must succeed before command handling continues.

## Container Bridge Environment (common)

- `PM_INTERACTIVE_TERMINAL_HOST_ALIAS` (default `host.containers.internal`)
- `PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS` (default `host.docker.internal`)
- `PM_INTERACTIVE_TERMINAL_HOST_PORT` (default `45459`)
- `PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS` (default `3000`)

## Windows Verification Commands

From `interactive-terminal/`:

```powershell
# Ensure app/build files are present
Test-Path .\build-interactive-terminal.ps1
Test-Path .\src\main.rs
Test-Path .\src\host_bridge_listener.rs

# Build release and deploy Qt runtime
.\build-interactive-terminal.ps1 -Clean -Profile release

# Start app (new terminal)
Start-Process -FilePath .\target\release\interactive-terminal.exe -ArgumentList @('--port','9100') -PassThru

# Validate ports
Test-NetConnection 127.0.0.1 -Port 9100
Test-NetConnection 127.0.0.1 -Port 45459
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 9100,45459 } | Format-Table -AutoSize
```

## Known limitations / notes

- If container bridge preflight cannot reach host alias/port, interactive execution returns bridge-unavailable failures.
- Current operational baseline assumes host app is running before container-bridge interactive requests.