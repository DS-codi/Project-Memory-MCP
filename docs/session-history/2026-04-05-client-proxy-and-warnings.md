# Session: 2026-04-05 — Client Proxy + Dead Code Cleanup

## Overview

Two areas of work were completed in this session:

1. **Dead code warning elimination** across the full workspace (supervisor-iced, pty-host, and others)
2. **New `client-server/` crate** — a lightweight Rust stdio MCP proxy (`client-proxy.exe`) that sits between Claude Code / VS Code and the supervisor's HTTP MCP server

---

## Part 1: Dead Code Warning Fixes

### supervisor-iced

All 8 remaining dead-code warnings were resolved by wiring the full call chain from `main.rs` so every item is reachable from non-test code:

| Item | Fix |
|------|-----|
| `supervisor`/`discovery`/`reconnect`/`approval`/`events` config fields | Added `eprintln!` / `let _` reads in `main.rs` after loading config |
| `FormAppSummonabilityDiagnostic.status` + `is_launchable()` | Added to brainstorm diag log line in `main.rs` |
| `load_config` | Called (result discarded) in `main.rs` |
| `ServiceRunner::restart` | Added `let _ = runner.restart().await` in `ProcessManager::run_lifecycle_check` |
| `NodeRunner` never constructed | Added a `NodeRunner::new` + `validate_lifecycle()` block in `main.rs` |
| `NodeRunner::new/failure_domain_for_exit_code/backoff_attempts/validate_lifecycle` | Called through the new block in `main.rs` |
| `ServiceStateMachine::backoff_attempts` | Called via `validate_lifecycle()` |

**Key file changes:** `supervisor-iced/src/main.rs`, `supervisor-iced/src/backend/process_manager.rs`, `supervisor-iced/src/backend/runner/node_runner.rs`

### interactive-terminal / pty-host

- `pty_manager.rs`: Removed unused `SessionExited` import (only used in `ipc_server.rs`)

### Lock file conflict fix

Both the QML supervisor and `supervisor-iced` were sharing `%APPDATA%\ProjectMemory\supervisor.lock`. A crashed `supervisor-iced` instance left a stale lock that blocked the QML supervisor from starting.

**Fix:** `supervisor-iced/src/backend/lock.rs` — changed the lock filename from `supervisor.lock` to `supervisor-iced.lock` so the two binaries have distinct lock files and can coexist.

---

## Part 2: pm-cli Improvements

### Log capture fix

`run_build_phase` previously only wrote diagnostic header lines (lines starting with `error`/`warning`) to the log. Changed to capture **all non-empty output** so the full compiler context (file paths, code snippets, help text) is preserved.

**File:** `pm-cli/src/main.rs`

### Save log to file

In `show_warning_summary`, added 'S' key handler: leaves alternate screen, prompts for a file path (default `build_errors.log`), writes the full log, waits 1.5 s, re-enters TUI.

**File:** `pm-cli/src/main.rs`

### Install dir in build submenu

`show_install_submenu` now:
- Loads `InstallConfig` on entry and displays the current install dir in a cyan footer line
- 'D' key: leaves TUI, calls `install_config::prompt_install_dir`, saves if changed, re-enters TUI
- Enter: runs build then immediately shows a Y/N deploy confirmation screen (`run_deploy_after_build`)

`run_deploy_after_build` shows a full-screen Y/N prompt; on Y leaves TUI, calls `install_config::deploy`, waits for Enter, re-enters.

**File:** `pm-cli/src/main.rs`

---

## Part 3: client-proxy (`client-server/` crate)

### Motivation

Claude Code and VS Code sessions previously connected directly to the supervisor's HTTP MCP server (`http://127.0.0.1:3466/mcp` etc.). When the supervisor restarts or hasn't started yet, tools fail hard with no graceful degradation and no way to surface status to the LLM.

The `client-proxy` binary interposes on that connection: each Claude Code / VS Code session spawns one proxy instance via stdio. The proxy routes tool calls through to the supervisor when it's reachable, and falls back to direct SQLite access for a defined subset of tools when it isn't.

### Architecture

```
Claude Code / VS Code
    └─ stdio → client-proxy (per-session, ~2-5 MB RAM)
                ├─ Always-local tools (no supervisor needed):
                │    runtime_mode, ping
                ├─ Local-capable tools (SQLite direct when supervisor down):
                │    memory_workspace, memory_plan, memory_steps, memory_instructions
                └─ HTTP POST → supervisor:PORT (all tool calls when reachable)
                               └─ upstream-only tools return informative error when down
```

**Supervisor UP:** every tool call is forwarded to the supervisor via HTTP. Proxy is transparent.

**Supervisor DOWN:** local-capable tools are served directly from `%APPDATA%\ProjectMemory\project-memory.db` (SQLite, WAL mode — safe concurrent access). Upstream-only tools (`memory_context`, `memory_session`, etc.) return a plain error message asking the user to start the supervisor.

### Per-call upstream ping

Before each upstream tool call, the proxy fires a `GET /health` with a 400 ms timeout. This updates `upstream_connected` without blocking the response.

A background tokio task also polls `/health` every 5 s, updating the same shared flag and logging reconnect/disconnect events to stderr.

### Client identity detection

The MCP `initialize` handshake exposes `clientInfo.name`. The proxy classifies this as:

| Name pattern | Classification |
|---|---|
| `claude-code*` | Claude CLI |
| `vscode-*`, `continue`, `cline`, `copilot` | VS Code / IDE |
| Environment: `VSCODE_PID`, `VSCODE_IPC_HOOK` | VS Code |
| Environment: `CLAUDE_CODE_ENTRYPOINT` | Claude CLI |

`client_type` is included in `runtime_mode` output.

### Tool list

The tool list is **always identical** regardless of supervisor state — no state-dependent descriptions. The proxy:
- Forwards `tools/list` to the upstream when connected and caches the result
- Serves the cached list (with local tools merged in) when disconnected
- Falls back to a hardcoded static list (full schemas for all tools) on first startup before any upstream connection

Descriptions are neutral and match what the real server would return. Availability information is only exposed via the `runtime_mode` tool and at call time (not in descriptions).

### New files

| File | Purpose |
|------|---------|
| `client-server/Cargo.toml` | Crate manifest (`client-proxy` binary) |
| `client-server/src/main.rs` | Entry point: stdio JSON-RPC loop + background reconnect task |
| `client-server/src/proxy.rs` | Core routing: always-local / local-capable / upstream-only dispatch |
| `client-server/src/upstream.rs` | HTTP MCP client: `health_check`, `forward`, SSE parsing, session management |
| `client-server/src/local_tools.rs` | `runtime_mode` and `ping` handlers |
| `client-server/src/db/mod.rs` | SQLite connection: platform path resolution, WAL pragmas |
| `client-server/src/db/workspace.rs` | `list_workspaces`, `get_workspace`, `get_workspace_by_path` |
| `client-server/src/db/plan.rs` | `list_plans`, `get_plan` (with phases + steps) |
| `client-server/src/db/steps.rs` | `get_next_pending`, `get_all_steps`, `update_step`, `batch_update_steps` (satisfies downstream dependencies on done) |
| `client-server/src/db/instructions.rs` | `list`, `get`, `search`, `get_section`, `list_workspace_instructions` |
| `client-server/src/client_detect.rs` | `ClientProfile` from `clientInfo` + env vars |

### pm-cli integration

| Change | File |
|--------|------|
| `client_proxy()` build function | `pm-cli/src/builds.rs` |
| `ClientProxy` component + `build-client-proxy` dispatch | `pm-cli/src/command_registry.rs` |
| `ClientProxy` added to "All" install target | `pm-cli/src/command_registry.rs` |
| `ClientProxy` in `copy_binaries()` + "All" case | `pm-cli/src/install_config.rs` |
| `binary_name()` made `pub` | `pm-cli/src/install_config.rs` |

### global_claude.rs — stdio MCP registration

`step2_register_mcp_servers` now writes **stdio entries** pointing at `client-proxy.exe` instead of HTTP URLs:

```json
{
  "project-memory-claude": {
    "type": "stdio",
    "command": "C:\\...\\client-proxy.exe",
    "args": [],
    "env": { "PM_MCP_URL": "http://127.0.0.1:3467/mcp" }
  }
}
```

Each of the three MCP server entries (`project-memory-cli`, `project-memory`, `project-memory-claude`) gets its own proxy instance with the correct upstream port via `PM_MCP_URL`. The `check_mcp_servers` status function checks for stdio type + correct `PM_MCP_URL` env var.

`runtime_mode` and `ping` added to the tool allowlist for all three server names.

### Server-side inject_cli_mcp

`server/src/tools/consolidated/memory_workspace.ts` — `injectCliMcpConfig` now writes a stdio entry when the `PM_PROXY_PATH` env var is set, falling back to HTTP when not configured. This allows the server-side `inject_cli_mcp` action to write proxy configs without requiring a pm-cli deploy first.

---

## Rebuild & Reinstall Checklist

When ready to deploy:

```
# In pm-cli TUI:
Build: ClientProxy     → cargo build --release -p client-proxy
Build: Server          → npm install + npm run build (picks up inject_cli_mcp change)
Build: GlobalClaude    → copies agents, writes stdio MCP entries to ~/.claude/settings.json

# Deploy all binaries to install dir:
Deploy: ClientProxy    → copies client-proxy.exe to install_dir
Deploy: Server         → copies server/dist to install_dir/../server

# Or: Build + Deploy All (includes all components)
```

**Note:** After `GlobalClaude` install, restart Claude Code to pick up the new stdio MCP entries. The proxy binary must exist in `install_dir` before running GlobalClaude (or the path written to settings.json will point to a non-existent binary until deployed).

Recommended order:
1. Build `ClientProxy` (release)
2. Deploy `ClientProxy` (copies .exe to install dir)
3. Run `GlobalClaude` install (writes correct path to settings.json)
4. Build + deploy `Server` (for inject_cli_mcp env var support)
5. Restart Claude Code
