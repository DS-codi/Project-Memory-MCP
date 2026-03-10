# Cross-Platform Port Setup Guide

**Last updated:** 2026-03-10  
Use this guide when setting up Project Memory MCP on Windows, macOS, or Linux to avoid port mismatches between Supervisor and VS Code extension settings.

---

## 1. Runtime Support Policy (Current State)

Project Memory MCP currently supports one runtime model for normal use:

| Runtime model | Support status | Notes |
|---|---|---|
| Supervisor-managed (live host) | Supported | Use `supervisor.toml` + extension settings. |
| Standalone direct-run (`3000/3001/3002`) | Not supported for normal runtime | Keep as legacy reference only. |
| Integration harness (`43000+`) | Test-only | Use only for isolated harness execution. |

Hard rule: keep extension ports pointed at Supervisor-managed services (`3457` and `3459`) unless you are running a dedicated test harness scenario.

---

## 2. Configure Supervisor Ports (Required Mode)

### Supervisor config file location by OS

| OS | Path |
|---|---|
| Windows | `%APPDATA%\\ProjectMemory\\supervisor.toml` |
| macOS | `~/.config/ProjectMemory/supervisor.toml` |
| Linux | `~/.config/ProjectMemory/supervisor.toml` |

These paths are defined in `supervisor/src/config.rs`.

### Minimum port block to keep consistent

```toml
[supervisor]
control_transport = "tcp"        # Use "named_pipe" on Windows if preferred
control_tcp_port = 45470

[mcp]
port = 3457

[mcp.pool]
base_port = 3460
max_instances = 4

[interactive_terminal]
port = 3458

[dashboard]
port = 3459

[fallback_api]
port = 3465
```

Notes:
1. On Windows, `control_transport = "named_pipe"` is fine, and extension detection also has a TCP fallback probe.
2. On macOS/Linux, prefer `control_transport = "tcp"`.
3. If you change `control_tcp_port`, extension supervisor auto-detect that assumes `45470` may fail unless extension logic is updated too.

---

## 3. Align VS Code Extension Settings

Use workspace settings (`.vscode/settings.json`) and keep user settings aligned when needed.

| Setting | Must match |
|---|---|
| `projectMemory.mcpPort` | `[mcp].port` |
| `projectMemory.serverPort` | `[dashboard].port` |
| `projectMemory.apiPort` (legacy) | Same as `projectMemory.serverPort` or remove it |

Recommended Supervisor-managed values:

```json
{
  "projectMemory.mcpPort": 3457,
  "projectMemory.serverPort": 3459
}
```

Common settings file locations:

| Scope | Windows | macOS | Linux |
|---|---|---|---|
| User | `%APPDATA%\\Code\\User\\settings.json` | `~/Library/Application Support/Code/User/settings.json` | `~/.config/Code/User/settings.json` |
| Workspace | `<workspace>/.vscode/settings.json` | `<workspace>/.vscode/settings.json` | `<workspace>/.vscode/settings.json` |

Windows-only helper for stale `3001` values:

```powershell
./scripts/fix-workspace-ports.ps1 -DryRun
./scripts/fix-workspace-ports.ps1
```

---

## 4. Legacy/Test Port References (Not Supported Runtime Path)

This section is intentionally reference-only for migration and diagnostics. Do not point daily extension workflows at these ports.

| Variable | Default | Used by |
|---|---|---|
| `MCP_PORT` | `3000` | MCP server HTTP transport |
| `DASHBOARD_PORT` | `3001` | Dashboard API server |
| `WS_PORT` | `3002` | Dashboard WebSocket layer |
| `PM_INTERACTIVE_TERMINAL_HOST_PORT` | `45459` | Container-to-host interactive-terminal bridge |

Container entrypoint behavior is defined in `container/entrypoint.sh` and `podman-compose.yml`.

---

## 5. Verify Ports Before Starting Services

Run one of these checks before launching services.

### Windows (PowerShell)

```powershell
$ports = 3457,3458,3459,3460,3461,3462,3463,3465,45470
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $ports -contains $_.LocalPort } |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

### macOS/Linux (bash/zsh)

```bash
for p in 3457 3458 3459 3460 3461 3462 3463 3465 45470; do
  echo "=== port $p ==="
  lsof -nP -iTCP:$p -sTCP:LISTEN || true
done
```

If any required port is already taken, either stop the conflicting process or choose a new, consistent port block and update all mappings.

---

## 6. End-to-End Validation Checklist

After startup, validate in this order:

1. MCP health: `http://localhost:<mcpPort>/health`
2. Dashboard health: `http://localhost:<dashboardPort>/api/health`
3. Extension heartbeat path: `http://localhost:<mcpPort>/supervisor/heartbeat` (Supervisor mode)
4. Extension settings exactly match running ports

Expected result:
1. Extension shows connected/healthy status.
2. No repeated reconnect loop in extension logs.
3. Dashboard loads without "cannot connect" errors.

---

## 7. High-Frequency Misconfiguration Patterns

1. `projectMemory.serverPort` still points to `3001` while Supervisor dashboard runs on `3459`.
2. `projectMemory.mcpPort` points to `3000` while Supervisor proxy runs on `3457`.
3. Non-Windows host left on `control_transport = "named_pipe"` instead of `tcp`.
4. Custom port changed in `supervisor.toml` but not mirrored in workspace settings.
5. Running harness ports (`43000+`) while extension remains configured for live ports (`3457/3459`) or vice versa.

When in doubt, reset to Supervisor defaults (`3457` MCP, `3459` dashboard), verify health endpoints, then adjust only if the Supervisor config and extension settings are updated together.
