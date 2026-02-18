# Strict Mode Boundaries — Local / Container (Two-Mode Architecture)

> **Branch:** `feature/strict-mode-boundaries`  
> **Created:** 2026-02-19  
> **Goal:** Collapse the current three-mode system (local / shared / container) into a strict **two-mode** architecture: **Local** and **Container**, with a clear transition mechanism between them.

---

## Problem Statement

The current system has three implicit operating modes:

| Mode | How it works | Issues |
|------|-------------|--------|
| **Local** | MCP server runs via stdio on the host, data root is the local `./data` folder | Works well |
| **Shared / Proxy** | Local stdio server auto-detects a running container (`detectContainer()`) and transparently proxies all tool calls to it — the "shared" mode | Creates confusion: two MCP servers are running, data root ambiguity, identity.json conflicts, proxy session invalidation, agent state split between host and container |
| **Container** | MCP server runs inside the container with HTTP transport, data root is `/data` mount | Works well in isolation, but lacks feedback loop to local instance |

The **shared/proxy mode** (`container-proxy.ts`) is the root cause of most issues:
- Silent proxy transitions mid-session cause tool-call failures when the container restarts
- Data written locally vs. via proxy ends up in different roots
- Workspace identity resolution differs between host and container paths
- No explicit user control over when the transition happens

---

## Target Architecture: Two Strict Modes

### Mode 1: Local (default)

```
┌──────────────────────────────────┐
│  VS Code Extension               │
│  ┌────────────────────────────┐  │
│  │ MCP Server (stdio)         │  │
│  │  Data root: ./data         │  │
│  │  Alert listener: port 9200 │◄─── Container "ready" alert
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

- Standard stdio transport
- All tools execute locally against the host filesystem
- **NEW: Opens an HTTP listener on a configurable port** (default `9200`) that waits for a single `POST /transition` alert from the container
- When the alert arrives, the server **does not auto-proxy** — instead it surfaces a notification to the user/agent that the container is ready, prompting an explicit switch

### Mode 2: Container

```
┌──────────────────────────────────────┐
│  Container                            │
│  ┌────────────────────────────────┐  │
│  │ MCP Server (HTTP, port 3000)   │  │
│  │  Data root: /data (mounted)    │  │
│  │  Sends "ready" alert to host   │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │ Heartbeat / tool-call hook     │  │
│  │  Ensures data root accessible  │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
        │
        │ MCP via StreamableHTTP / SSE
        ▼
┌──────────────────────────────────┐
│  VS Code Extension               │
│  (connects to container:3000)    │
└──────────────────────────────────┘
```

- VS Code `mcp.json` entry points directly to `http://localhost:3000/mcp`
- Data root is the `/data` bind mount
- **NEW: Lightweight liveness check** ensures the data root volume and MCP tools remain accessible — runs either:
  - (a) As a low-cost hook on every tool call (preferred — zero extra CPU), or
  - (b) As an infrequent background poll (e.g., every 60s) only if tool-call hooking isn't sufficient
- On container startup, sends a one-shot HTTP `POST` to the host's alert port to announce readiness

---

## Work Items

### Phase 1: Cull Shared/Proxy Mode

**Goal:** Remove `container-proxy.ts` and all proxy auto-detection logic.

| # | Task | Files |
|---|------|-------|
| 1.1 | Delete `container-proxy.ts` | `server/src/transport/container-proxy.ts` |
| 1.2 | Remove proxy imports and proxy-mode startup branch from `index.ts` | `server/src/index.ts` (lines ~31-32, ~568-592) |
| 1.3 | Remove `MBS_CONTAINER_URL`, `MBS_NO_PROXY` env var handling | `server/src/index.ts`, docs |
| 1.4 | Remove `detectContainer()`, `getContainerUrl()`, `createProxyServer()` references | Grep for all call sites |
| 1.5 | Update `mcp.json` examples in docs — no more "single entry that auto-proxies" | `docs/`, `README.md` |
| 1.6 | Clean up tests that reference proxy mode | `server/src/__tests__/` |

### Phase 2: Local Mode — Alert Listener

**Goal:** When the server starts in local/stdio mode, spin up a tiny HTTP listener that accepts a container "ready" signal.

| # | Task | Details |
|---|------|---------|
| 2.1 | Create `server/src/transport/container-alert-listener.ts` | Minimal HTTP server on configurable port (env `MBS_ALERT_PORT`, default `9200`). Single endpoint: `POST /container-ready` with body `{ url, version }`. On receipt, emits an event / writes to stderr / sends a VS Code notification via the extension. |
| 2.2 | Wire alert listener into stdio startup in `index.ts` | After creating the local MCP server, start the alert listener. On container-ready event, log to stderr: `[alert] Container ready at <url>. Switch your MCP config to use container mode.` |
| 2.3 | Add `MBS_ALERT_PORT` to env var docs | `docs/`, `Containerfile` comments |
| 2.4 | Optional: VS Code extension integration | If the extension has a notification API, surface the alert as a VS Code notification with an action button "Switch to container mode" |

### Phase 3: Container Mode — Startup Alert + Liveness

**Goal:** Container announces itself to the host on startup, and continuously verifies data-root access.

| # | Task | Details |
|---|------|---------|
| 3.1 | Create `server/src/transport/container-startup-alert.ts` | On HTTP transport startup, sends `POST http://<host-ip>:<alert-port>/container-ready` with `{ url: 'http://container:3000', version }`. Uses the same host-IP detection logic from `run-container.ps1`. Fire-and-forget with 3s timeout — if host isn't listening, silently continue. |
| 3.2 | Wire startup alert into `main()` HTTP branch | After `app.listen()`, call `sendStartupAlert()`. |
| 3.3 | Implement data-root liveness hook | Create `server/src/transport/data-root-liveness.ts`. Two strategies: **Strategy A (preferred):** Middleware that wraps every tool call — before executing, verify `fs.access(dataRoot)` succeeds. If it fails, return a structured error `{ success: false, error: 'DATA_ROOT_UNAVAILABLE' }`. This adds ~0.1ms per call on fast filesystems. **Strategy B (fallback):** `setInterval` polling every 60s that checks `fs.access(dataRoot)` and sets a global flag. Tool calls check the flag. |
| 3.4 | Expose liveness status on `/health` endpoint | Add `data_root_accessible: boolean` to the health check response. |
| 3.5 | Pass `MBS_ALERT_HOST` and `MBS_ALERT_PORT` to container env | Update `run-container.ps1` to inject the host's IP + alert port into the container's env vars. |

### Phase 4: Documentation & Config Cleanup

| # | Task | Details |
|---|------|---------|
| 4.1 | Update `mcp-usage.instructions.md` | Remove all "shared mode" references. Document strict two-mode architecture. |
| 4.2 | Update `run-container.ps1` | Add `MBS_ALERT_HOST`/`MBS_ALERT_PORT` env passthrough. Remove any shared-mode workarounds. |
| 4.3 | Update `Containerfile` | Add comments for new env vars. |
| 4.4 | Update workspace-migration docs | Clarify that migration only works within a single mode (local-to-local or container-to-container). |
| 4.5 | Add architecture diagram to README | Two-mode diagram showing the alert flow. |

### Phase 5: Tests

| # | Task | Details |
|---|------|---------|
| 5.1 | Test alert listener start/stop lifecycle | Unit test: listener starts, accepts POST, emits event, shuts down. |
| 5.2 | Test container startup alert | Unit test: fire-and-forget POST, handles timeout gracefully. |
| 5.3 | Test data-root liveness hook | Unit test: tool call returns error when data root is inaccessible. |
| 5.4 | Integration test: local → container alert flow | Start alert listener, simulate container POST, verify event. |
| 5.5 | Remove/update proxy-mode tests | Clean up test files referencing `container-proxy.ts`. |

---

## Environment Variables (new/changed)

| Variable | Default | Description |
|----------|---------|-------------|
| `MBS_ALERT_PORT` | `9200` | Port the local server listens on for container "ready" alerts |
| `MBS_ALERT_HOST` | (auto-detected) | Host IP the container sends its "ready" alert to (set by `run-container.ps1`) |
| ~~`MBS_CONTAINER_URL`~~ | — | **REMOVED** — no more auto-proxy |
| ~~`MBS_NO_PROXY`~~ | — | **REMOVED** — no more auto-proxy |

---

## Migration Notes

- Users who relied on the auto-proxy behavior will need to update their `mcp.json` to have two explicit entries: one for local (`stdio`), one for container (`http://localhost:3000/mcp`), and enable/disable them as needed.
- The alert system provides a soft notification when the container is ready, but the switch is manual (by the user or by the Coordinator agent reconfiguring the MCP entry).

---

## Design Decisions

1. **Why not keep the proxy as opt-in instead of removing it?** The proxy creates a permanently-fragile coupling: session invalidation on container restart, ambiguous data-root ownership, and two MCP servers fighting over workspace identity. Clean separation is better.

2. **Why tool-call hook over polling for liveness?** Polling adds continuous CPU even when idle. A tool-call hook is zero-cost when no tools are being called, and adds negligible latency (~0.1ms `fs.access` check) when they are. It also catches issues at exactly the moment they matter.

3. **Why a separate alert port instead of reusing 3000?** In local mode, the MCP server uses stdio transport — there's no HTTP server running. The alert listener is a purpose-built, minimal HTTP server that only processes one endpoint. Keeping it separate avoids conflating MCP protocol traffic with operational alerts.
