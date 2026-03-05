# Port and Connection Map — Project Memory MCP

**Last updated:** 2026-03-05  
**Status:** Authoritative reference. Update this file whenever a port changes.

---

## Golden Rule for Tests

> **No test, harness, or script may probe, connect to, or depend on any port in the
> [Live Host System](#live-host-system-supervisor-managed) section by default.**
>
> The integration harness runs in an isolated container stack that uses its own
> port range (43000–43002). The live running system must never be touched.
> Use `-RequireSupervisorProxy` explicitly only when a test is specifically
> validating supervisor integration.

---

## Live Host System (Supervisor-managed)

These ports belong to the **production Project Memory system** running on the
developer's machine. They must **never** be probed by automated tests unless the
test is explicitly opt-in for supervisor integration testing.

| Port / Path | Protocol | Component | Notes |
|---|---|---|---|
| `\\.\pipe\project-memory-supervisor` | Named pipe (Windows) | **Supervisor control API** | Default transport on Windows; fastest, no port conflict |
| `45470` | TCP | **Supervisor control API (TCP fallback)** | Used when `control_transport = "tcp"`; VS Code extension `detect.ts` uses this as fallback |
| `3457` | HTTP | **Supervisor proxy — MCP endpoint** | The public MCP port; proxies requests to pool workers. VS Code extension `projectMemory.mcpPort` defaults to `3457` |
| `3458` | TCP | **Interactive Terminal** | Supervisor-managed interactive terminal binary |
| `3459` | HTTP | **Dashboard (supervisor-managed)** | Node.js dashboard server started by supervisor; `DashboardSection.port` default |
| `3460–3463` | HTTP | **MCP pool workers** | `PoolConfig.base_port = 3460`; supervisor allocates up to `max_instances = 4` workers on consecutive ports |

> **Note:** The supervisor _proxy_ is the single public MCP port (`3457`). Clients
> (VS Code extension, Copilot agents) talk only to `:3457`. Pool workers on
> `3460+` are internal and not directly accessible.

---

## Standalone / Direct-Run Mode

Used when the **MCP server and dashboard are run directly** (e.g. `node server.js`,
`npm run dev`) without the supervisor.

| Port | Protocol | Component | Config key / source |
|---|---|---|---|
| `3000` | HTTP (Streamable-HTTP / SSE) | **MCP server** | `MCP_PORT` env var; `--port` CLI arg; `Containerfile ENV MCP_PORT=3000` |
| `3001` | HTTP | **Dashboard Express API** | `DASHBOARD_PORT` env var; `dashboard/src/config.ts` → `VITE_API_URL || 'http://localhost:3001'` |
| `3002` | WebSocket (TCP) | **Dashboard WebSocket** | `WS_PORT` env var |
| `9200` | HTTP | **Container Alert Listener** | `MBS_ALERT_PORT` env var; `container-alert-listener.ts` default `9200` — receives one-shot POST from container on startup |

---

## Interactive Terminal Bridge

The interactive terminal (Rust + Qt/QML binary) exposes a web server for xterm.js
and may also be reachable over a bridge port from inside a container.

| Port | Protocol | Component | Notes |
|---|---|---|---|
| `9100` | HTTP + WebSocket | **Interactive Terminal web server** | Default when run via `build-interactive-terminal.ps1 --port 9100`; configurable with `--port` |
| `45459` | TCP | **Interactive Terminal bridge (container → host)** | `PM_INTERACTIVE_TERMINAL_HOST_PORT` env var default; used by the container to reach the host-side GUI terminal |

> The terminal web server uses a combined HTTP + WebSocket server on a single port
> (`TerminalWsServer`). `GET /` serves the xterm.js HTML; `GET /ws` upgrades to
> WebSocket for PTY I/O.

---

## Integration Harness (Container-Isolated Test Stack)

The harness runs the container image through `podman-compose` with a separate
host-port namespace. **These ports never overlap with the live system.**

Port mapping is applied only when the harness is started with `-ExposeHostPorts`
(default for `integration-harness-matrix.ps1` runs).

| Host port | Container port | Protocol | Component |
|---|---|---|---|
| `43000` | `3000` | HTTP | MCP server (harness instance) |
| `43001` | `3001` | HTTP | Dashboard Express API (harness instance) |
| `43002` | `3002` | WebSocket | Dashboard WebSocket (harness instance) |

Environment variables to override:

| Variable | Default |
|---|---|
| `PM_HARNESS_MCP_HOST_PORT` | `43000` |
| `PM_HARNESS_DASHBOARD_API_HOST_PORT` | `43001` |
| `PM_HARNESS_DASHBOARD_WS_HOST_PORT` | `43002` |

Source: [docs/integration-harness/podman-compose.integration.hostports.yml](../integration-harness/podman-compose.integration.hostports.yml)

---

## VS Code Extension → System Connections

| Extension setting | Default | Connects to |
|---|---|---|
| `projectMemory.mcpPort` | `3457` | Supervisor proxy (live host) |
| `projectMemory.apiPort` / `projectMemory.serverPort` | `3001` | Dashboard API (live host, standalone mode) |
| Supervisor detection (named pipe) | `\\.\pipe\project-memory-supervisor` | Supervisor control API |
| Supervisor detection (TCP fallback) | `127.0.0.1:45470` | Supervisor control API |

The extension heartbeat (`SupervisorHeartbeat`) polls:

```
GET http://localhost:<mcpPort>/supervisor/heartbeat
```

---

## Module Connection Diagram

```
 ┌─────────────────────────────────────────────────────────────┐
 │                   VS Code + Extension                        │
 │                                                             │
 │  MCP tools ──→ :3457 (supervisor proxy)                     │
 │  Dashboard webview ──→ :3001 (dashboard API)                │
 │  Supervisor heartbeat ──→ :3457/supervisor/heartbeat        │
 │  Supervisor detect ──→ pipe OR :45470                       │
 └─────────────────────────────────────────────────────────────┘
              │                    │
              ▼                    ▼
 ┌────────────────────┐   ┌───────────────────┐
 │  Supervisor        │   │  Dashboard Node.js │
 │  (Rust + Qt/QML)   │   │  :3459             │
 │                    │   │  → :3001 external  │
 │  Control API:      │   └───────────────────┘
 │    pipe (default)  │            │
 │    :45470 (TCP)    │            ▼
 │                    │   ┌───────────────────┐
 │  Proxy: :3457  ────┼──→│  MCP server       │
 │  Pool workers:     │   │  :3460…:3463      │
 │    :3460…:3463     │   │  (pool instances) │
 └────────────────────┘   └───────────────────┘
              │
              ▼
 ┌────────────────────┐
 │  Interactive       │
 │  Terminal          │
 │  (Rust + Qt/QML)   │
 │                    │
 │  TCP: :3458        │
 │  Web: :9100        │
 │  Bridge: :45459    │
 └────────────────────┘

 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
 HARNESS (isolated container stack — never touches ports above)
 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─

 podman-compose (test container)
   :43000 → container :3000  (MCP server)
   :43001 → container :3001  (Dashboard API)
   :43002 → container :3002  (Dashboard WS)

 Container alert listener: :9200 (host, receives container startup POST)
```

---

## Port Assignment Quick Reference

| Port | Owner | Environment |
|---|---|---|
| `3000` | MCP server | Container / standalone |
| `3001` | Dashboard API | Container / standalone / supervisor |
| `3002` | Dashboard WebSocket | Container / standalone |
| `3457` | Supervisor proxy (MCP public endpoint) | **Live host system** |
| `3458` | Interactive Terminal (supervisor-managed) | **Live host system** |
| `3459` | Dashboard (supervisor-managed) | **Live host system** |
| `3460–3463` | MCP pool workers | **Live host system (internal)** |
| `9100` | Interactive Terminal web/WS server | Standalone build |
| `9200` | Container Alert Listener | Host (receives container alert) |
| `43000` | Harness MCP (host-side) | Integration harness only |
| `43001` | Harness Dashboard API (host-side) | Integration harness only |
| `43002` | Harness Dashboard WS (host-side) | Integration harness only |
| `45459` | Interactive Terminal bridge | Container → host bridge |
| `45470` | Supervisor control API (TCP) | Live host (TCP fallback) |
| `\\.\pipe\project-memory-supervisor` | Supervisor control API (pipe) | **Live host system (default)** |

---

## Isolation Contract: What Tests May and May Not Touch

### ✅ Allowed in automated tests (isolated harness ports)

- `43000` — harness MCP server
- `43001` — harness Dashboard API
- `43002` — harness Dashboard WS

### ❌ Forbidden in automated tests (live system ports)

- `3457` — supervisor proxy *(live system MCP endpoint)*
- `3458` — interactive terminal *(live system)*
- `3459` — dashboard *(live system)*
- `3460–3463` — MCP pool workers *(live system internal)*
- `45470` — supervisor control TCP *(live system)*
- `\\.\pipe\project-memory-supervisor` *(live system)*

### ⚠️ Opt-in only (supervisor integration tests)

Use `-RequireSupervisorProxy` on `integration-harness-matrix.ps1` to explicitly
include supervisor-proxy probes. This should only be used in dedicated CI jobs that
are isolated from the developer's running system.

### Implementation

The `SkipSupervisorProxy` flag is threaded through all harness scripts:

- [scripts/integration-harness-readiness.ps1](../../scripts/integration-harness-readiness.ps1) — filters `supervisor-proxy` from required-gate components
- [scripts/integration-harness-lifecycle.ps1](../../scripts/integration-harness-lifecycle.ps1) — passes flag to readiness gate on `up` and `restart`
- [scripts/integration-harness-extension-headless.ps1](../../scripts/integration-harness-extension-headless.ps1) — passes flag before extension tests
- [scripts/integration-harness-matrix.ps1](../../scripts/integration-harness-matrix.ps1) — derives `$skipSupervisorProxy = (container-mode AND NOT RequireSupervisorProxy)`; generates filtered fault contract

The `health-readiness.contract.json` marks `supervisor-proxy` with
`"readiness_gate": "optional"` so that the harness default mode (no supervisor)
is reflected in the contract itself — not just worked around in script logic.
