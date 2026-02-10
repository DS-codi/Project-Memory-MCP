# Infrastructure Improvement Plan

> **Created:** 2026-02-10  
> **Scope:** Background process reduction, monitoring/diagnostics, handoff instruction accuracy  
> **Workspace:** ModularAgenticProcedureSystem

---

## Phase 1: Reduce Background Processes & Resource Usage

> Extension must remain ready on VS Code launch — optimize what runs at activation, not whether activation occurs.

- [x] **1.1** Deferred heavy activation work — file watchers start after 2s `setTimeout`; chat integration connects async (non-blocking); server spawn is now lazy by default (`autoStartServer` default changed to `false`)
- [x] **1.2** Implemented lazy server start — `ensureServerRunning()` deduplicates concurrent calls, triggered on first dashboard panel open via `DashboardViewProvider.onFirstResolve()` callback; explicit server commands still start immediately
- [x] **1.3** Added `projectMemory.idleServerTimeoutMinutes` setting (default 0 = disabled) — `ServerManager.startIdleMonitoring()` checks every 60s if no activity for configured minutes; auto-stops server with notification; `resetIdleTimer()` available for activity tracking; also extracted `ServerLogger.ts` (46 lines) to keep ServerManager under 400 lines
- [x] **1.4** Added PID lockfile for cross-window coordination — `PidLockfile.ts` (108 lines) in `server/`; creates `data/server.lock` with PID, port, windowId, timestamp; `acquire()/release()/isOwnedByOther()/isStale()` methods; integrated into ServerManager start/stop/dispose; stale lock detection via `process.kill(pid, 0)`
- [x] **1.5** Optimize `AgentWatcher` and `CopilotFileWatcher` — added 500ms debounce with Set-based batching to AgentWatcher, 300ms debounce with Map-based deduplication to CopilotFileWatcher, cleanup of timers/pending sets in both `stop()` methods
- [x] **1.6** Added cleanup: `deactivate()` now wraps server shutdown in 5s `Promise.race` timeout, try/catch around MCP bridge disconnect, fallback `forceStopOwnedServer()` on any error; `killPid()` already uses `taskkill /f /t` for process tree kill on Windows
- [x] **1.7** Reviewed `.vscode/mcp.json` — removed redundant `@modelcontextprotocol/server-memory` (fully replaced by custom `project-memory` server); kept `filesystem` and `git` servers as they provide `mcp_filesystem_*` and `mcp_git_*` tools actively used by agents; 3 servers remain

## Phase 2: Add Monitoring & Diagnostics

- [x] **2.1** Created `DiagnosticsService` (166 lines) in `vscode-extension/src/services/` — tracks: server running/external/port/frontend status, MCP connection, extension memory (heapUsed MB), uptime; periodic health checks (60s), `onHealthChange` event emitter, formatted text report
- [x] **2.2** Added Status Bar diagnostic indicator — shows green check/yellow warning/red error icon with `PM` label; tooltip shows issues; click runs `showDiagnostics` command
- [x] **2.3** Added `Project Memory: Show Diagnostics` command (`projectMemory.showDiagnostics`) — runs fresh health check and outputs formatted report to a dedicated output channel (server status, MCP status, memory, uptime, issues list)
- [x] **2.4** Added structured logging to `ServerManager` — `log()` writes to both VS Code OutputChannel and rotating `data/logs/server-manager.log` (1 MB rotation); `logEvent()` writes structured JSON entries to `data/logs/process-audit.log`; events tracked: `server_connected_external`, `server_spawned`, `server_stopped`, `server_force_kill`
- [x] **2.5** Added dashboard frontend error logging — `ErrorBoundary.componentDidCatch()` now sends errors to `/api/errors` endpoint (fire-and-forget POST); server writes structured JSON entries to `data/logs/dashboard-errors.log` with error message, componentStack, URL, and timestamp
- [x] **2.6** Added MCP server health probe to `DiagnosticsService` — periodic `memory_workspace(action: list)` call with 5s timeout, response time tracked in diagnostics report; slow responses (>3s) and failures surface as issues in status bar tooltip
- [x] **2.7** Added `data/logs/process-audit.log` — structured JSON entries recording every process spawn/kill with PID, port, timestamp, trigger context, and server directory; shared rotation logic with server-manager.log (1 MB limit)
- [x] **2.8** Enhanced `/api/health` endpoint — now returns: uptime (seconds), connectedClients (WebSocket count), memory (heapUsedMB, heapTotalMB, rssMB), lastError timestamp, plus all root paths and server timestamp; added global error tracking via `uncaughtException`/`unhandledRejection` handlers

## Phase 3: Fix Handoff Instructions & Agent Accuracy

- [x] **3.1** Fix Reviewer agent: change prose reference `reindex_workspace` to the correct tool call format `memory_workspace` (action: `reindex`) — the `reindex` action exists but the prose uses a non-existent standalone tool name
- [x] **3.2** Fix Archivist agent: update the MCP-unavailable guard text to list all 5 tools (`memory_workspace`, `memory_plan`, `memory_steps`, `memory_agent`, `memory_context`)
- [x] **3.3** Audited all 12 agent files: fixed 19 discrepancies across 8 files — added missing actions to MCP check blocks (coordinator, analyst), fixed misleading handoff descriptions (executor, reviewer, tester), added missing tool rows to tables (analyst, tester, brainstorm), removed phantom `phases` parameter (analyst)
- [x] **3.4** Added `last_verified: '2026-02-10'` field to all 12 agent file YAML frontmatter headers
- [x] **3.5** Fixed Executor context dependency — added "Retrieve stored context" step (step 3) to Executor workflow with `memory_context(action: get)` calls for types: `audit`, `architecture`, `affected_files`, `constraints`, `code_references`, `research_summary`; added `memory_context` `get` to Executor tools table; added instruction to avoid broad codebase research when context is provided
- [x] **3.6** Added `context_handoff_checklist` to all 3 hub agents: Coordinator (before Executor prompt template), Analyst (new section after role description), Runner (expanded hub role section) — specifying: user request, affected files, design decisions, constraints, code references, test expectations
- [x] **3.7** Updated Coordinator's Executor prompt template to include explicit "CONTEXT RETRIEVAL" block with `memory_context(action: get)` calls for 5 context type keys
- [x] **3.8** Updated Analyst's `runSubagent` Executor example to store `research_summary` via `memory_context(action: store)` before spawning, and include plan_id/workspace_id and context retrieval instructions in the spawn prompt
- [x] **3.9** Added structured `memory_context` storage protocol and `runSubagent` spawn template to Runner's hub role section, matching Coordinator's context handoff pattern
- [x] **3.10** Established canonical context type keys used across agents: `audit`, `architecture`, `affected_files`, `constraints`, `code_references`, `research_summary`, `test_expectations` — upstream agents store, Executor/Tester retrieve

## Phase 3B: Expand `@memory` Chat Participant

- [x] **3B.1** Add `memory_workspace` to the extension's `languageModelTools` with actions: `register`, `info`, `reindex`, `list` — created `chat/tools/workspace-tool.ts` handler, registered in `ToolProvider.ts`
- [x] **3B.2** Add `memory_agent` to the extension's `languageModelTools` with actions: `init`, `complete`, `handoff`, `validate`, `list`, `get_instructions` — created `chat/tools/agent-tool.ts` handler
- [x] **3B.3** Expand existing `memory_plan` tool actions to include: `update`, `find`, `set_goals`, `add_build_script`, `delete_build_script`, `add_note` — refactored into `chat/tools/plan-tool.ts` (10 actions total)
- [x] **3B.4** Expand existing `memory_steps` tool actions to include: `insert`, `delete`, `reorder`, `move`, `batch_update`, `replace` — refactored into `chat/tools/steps-tool.ts` (8 actions total)
- [x] **3B.5** Expand existing `memory_context` tool actions to include: `store_initial`, `list_research`, `append_research`, `batch_store`, workspace-scoped CRUD actions — refactored into `chat/tools/context-tool.ts` (15 actions total)
- [x] **3B.6** Add `/deploy` and `/diagnostics` commands to the `@memory` chat participant — added handlers in `ChatParticipant.ts`, registered in `package.json` chatParticipants commands
- [x] **3B.7** Add response streaming for long-running chat tool calls to avoid timeout appearance — added `response.progress()` calls in status, plan list, and context commands

## Phase 3C: Dashboard UI Improvements

- [x] **3C.1** Make `WorkspaceContextPanel` sections collapsible — created reusable `CollapsibleSection` component; wrapped all 7 sections with default collapsed state
- [x] **3C.2** Add a read-only view mode to `WorkspaceContextPanel` — shows context as formatted text/cards by default; global Edit/Save toggle switches to form mode
- [x] **3C.3** Improve `ResearchNotesViewer` — added search/filter input, syntax highlighting for fenced code blocks via `HighlightedContent` component, note count badge
- [x] **3C.4** Add a `PlanContextViewer` component — displays all stored `memory_context` items for a plan in collapsible cards with type-based color coding, search/filter, and smart value rendering; added as "Context" tab in plan detail page
- [x] **3C.5** Add collapsible sections to the plan detail view — integrated `PlanContextViewer` as new "Context" tab with `Database` icon; context files render in `CollapsibleSection` wrappers

## Phase 4: Refactor Monolith Files

- [x] **4.1** Refactor `extension.ts` (1503→268 lines) — extracted into: `commands/server-commands.ts` (165), `commands/deploy-commands.ts` (272), `commands/plan-commands.ts` (239), `commands/workspace-commands.ts` (246), `utils/helpers.ts` (38), `utils/defaults.ts` (30)
- [x] **4.2** Refactor `ServerManager.ts` (720→330 lines) — extracted into: `server/FrontendManager.ts` (133), `server/ServerHealthUtils.ts` (187)
- [x] **4.3** All extracted modules verified under 400-line limit: extension.ts (268), ServerManager.ts (330), FrontendManager.ts (133), ServerHealthUtils.ts (187), server-commands.ts (165), deploy-commands.ts (272), plan-commands.ts (239), workspace-commands.ts (246), helpers.ts (38), defaults.ts (30)

## Phase 5: Validation & Testing

> Consolidated validation for local mode, container mode, agent workflows, and UI. Items are grouped by category; each can be verified independently. Some items depend on earlier implementation phases (noted inline).

### 5A: Cleanup & Test Suite

- [x] **5A.1** Removed stale files: `chat/ToolProvider.ts.backup`, `extension.ts.backup`, `extension.new.ts`, `server/ServerManager.ts.backup`, `server/ServerManager.new.ts`
- [ ] **5A.2** Run full test suite (`server`, `dashboard`, `extension`) after all changes to confirm no regressions

### 5B: Local Mode

- [ ] **5B.1** Cold-start VS Code and confirm extension activates cleanly with minimal resource usage; Express server should not spawn until first dashboard or tool interaction
- [ ] **5B.2** Open 3+ VS Code windows simultaneously with the same workspace and verify only one dashboard server process exists (PID lockfile prevents duplicates)

### 5C: Container Mode

- [ ] **5C.1** Build the container image and verify both MCP and dashboard servers start and are reachable on ports 3000, 3001, and 3002
- [ ] **5C.2** Connect VS Code to the containerized MCP (via auto-detection or explicit `MBS_CONTAINER_URL`) and verify all 5 consolidated tools work (`memory_workspace`, `memory_plan`, `memory_steps`, `memory_agent`, `memory_context`)
- [ ] **5C.3** Open the dashboard frontend served from the container (port 3001) and verify workspaces, plans, and live WebSocket updates function
- [ ] **5C.4** Open 3+ VS Code windows and verify they all connect to the same container instance — no duplicate server processes, shared state visible across windows
- [ ] **5C.5** Stop the container while VS Code is connected — verify the extension detects the loss, shows a warning, and offers to restart locally or re-probe
- [ ] **5C.6** Verify volume-mounted data persists across container restarts — stop container, restart, confirm plans and context are intact

### 5D: Agent Workflows & Context Flow

- [ ] **5D.1** Verify all 12 agent files produce correct handoff behavior by running a simulated Coordinator → Executor → Reviewer → Tester → Archivist cycle
- [ ] **5D.2** Verify Executor receives complete context from a Coordinator → Architect → Executor handoff without needing to perform codebase research
- [ ] **5D.3** Verify all 3 hub agents (Coordinator, Analyst, Runner) store structured context before spawning Executor in a test handoff

### 5E: Chat Participant & Dashboard UI

> Depends on Phase 3B (chat expansion) and Phase 3C (dashboard UI) being implemented first.

- [ ] **5E.1** Verify all 5 tools are callable via the `@memory` chat participant with full action coverage *(requires 3B)*
- [ ] **5E.2** Verify `WorkspaceContextPanel` renders in collapsed read-only mode by default and can be toggled to edit mode per-section *(requires 3C)*

## Phase 6: Containerize MCP + Dashboard (Podman)

> Packages the MCP server and dashboard into a single Podman container. Solves cross-instance sharing (Q1) and component unification (Q2) — all VS Code windows connect to one container over HTTP instead of each spawning their own processes.

### 6A: MCP Transport Change

- [x] **6A.1** Add SSE or Streamable HTTP transport to the MCP server alongside stdio — created `server/src/transport/http-transport.ts` (195 lines) with `/mcp` (Streamable HTTP), `/sse` + `/messages` (legacy SSE), `/health` endpoints; `createHttpApp()` factory accepts a server-per-session factory function; `closeAllTransports()` for graceful shutdown
- [x] **6A.2** Added `express` dependency to MCP server (`server/package.json`); implemented `--transport` CLI flag (`stdio` | `sse` | `streamable-http`) and `--port` flag in `server/src/index.ts`; extracted `createMcpServer()` factory so HTTP transport creates per-session server instances; SDK v1.26.0 ships `SSEServerTransport`, `StreamableHTTPServerTransport`, and `InMemoryEventStore`
- [x] **6A.3** Added `/health` endpoint to HTTP transport returning: `status`, `server` name, `version`, `transport`, `uptime` (seconds), `activeSessions`, `registeredWorkspaces`, `memory` (heapUsedMB, rssMB), `dataRoot`, `agentsRoot`, `timestamp`
- [x] **6A.4** Added environment variable validation in `main()` — checks `MBS_DATA_ROOT` and `MBS_AGENTS_ROOT` exist; auto-creates `MBS_DATA_ROOT` if missing; warns if `MBS_AGENTS_ROOT` is set but doesn't exist

### 6B: Containerfile & Composition

- [x] **6B.1** Created `Containerfile` at repo root — multi-stage build with `node:20-slim`: stage 1 installs/builds MCP server and dashboard (frontend + Express server), stage 2 copies dist artifacts and production `node_modules` into slim runtime image with `tini` as PID 1
- [x] **6B.2** Created `container/entrypoint.sh` — starts MCP server (`--transport streamable-http --port 3000`) and dashboard Express server (ports 3001/3002) as background processes with `trap` for SIGINT/SIGTERM signal forwarding and coordinated shutdown
- [x] **6B.3** Containerfile exposes ports 3000 (MCP HTTP/SSE), 3001 (dashboard API), 3002 (dashboard WebSocket); `HEALTHCHECK` instruction probes `/health` on port 3000
- [x] **6B.4** Volume mount points at `/data` (read-write, workspace data/plans/context/logs) and `/agents` (read-only recommended, agent instruction files); environment variables `MBS_DATA_ROOT=/data` and `MBS_AGENTS_ROOT=/agents` set as defaults
- [x] **6B.5** Created `podman-compose.yml` with port mappings, volume mounts (`./data:/data`, `./agents:/agents:ro`), healthcheck, and `unless-stopped` restart policy; also created `run-container.ps1` PowerShell script with `build/run/stop/logs/status` actions including health endpoint probing
- [x] **6B.6** `run-container.ps1` serves as the build/run script (replaces npm scripts); supports `build`, `run`, `stop`, `logs`, `status` actions; also created `.containerignore` to keep build context lean

### 6C: Extension Container Detection

- [x] **6C.1** Added `projectMemory.containerMode` setting (`auto` | `local` | `container`) and `projectMemory.containerMcpPort` (default 3000) to `vscode-extension/package.json`; `auto` probes for container before local spawn, `container` forces container-only mode
- [x] **6C.2** Created `vscode-extension/src/server/ContainerDetection.ts` (140 lines) — `probeContainer()` checks both MCP `/health` and dashboard `/api/health` in parallel; `shouldUseContainer()` reads settings and probes; `ServerManager.start()` now probes container first when mode is `auto` or `container`, sets `_isExternalServer = true` and `_isContainerMode = true` when detected
- [x] **6C.3** Updated `.vscode/mcp.json` with a `project-memory-container` SSE entry (`{ "type": "sse", "url": "http://localhost:3000/sse" }`) disabled by default — users enable it when switching to container mode and disable the stdio entry
- [x] **6C.4** Added `container` status to `updateStatusBar()` — shows `$(package)` icon with "PM Server (container)" label and prominent background color; tooltip distinguishes container vs external vs local mode
- [x] **6C.5** Implemented `startContainerHealthMonitor()` — polls container health every 30s; on failure: marks server as disconnected, shows warning with "Retry Container" / "Start Local" / "Dismiss" options; `stopContainerHealthMonitor()` called in `stop()` and `dispose()`
- [x] **6C.6** Added automatic container proxy to MCP server — `server/src/transport/container-proxy.ts` detects a running container via health probe, connects as MCP Client (StreamableHTTP/SSE), and forwards all `tools/list` and `tools/call` requests; eliminates need for separate `project-memory-container` config entry; controlled by `MBS_CONTAINER_URL` and `MBS_NO_PROXY` env vars

> Container validation is covered by Phase 5C.

---

## Success Criteria

| # | Criterion |
|---|-----------|
| SC-1 | Extension activates on startup without noticeable delay; Express server defers until first use |
| SC-2 | A single status bar indicator or command can report the full health state of all Project Memory subsystems (MCP, dashboard server, extension, file watchers) |
| SC-3 | All diagnostic data (process spawns, errors, health checks) is written to structured log files under `data/logs/` |
| SC-4 | Every agent file references only tools and actions that exist in the current consolidated MCP server (v2.0) |
| SC-5 | The `@memory` chat participant exposes all 5 consolidated tools with their full action sets |
| SC-6 | No file in `vscode-extension/src/` exceeds 400 lines |
| SC-7 | Multiple VS Code windows sharing the same workspace do not spawn duplicate server processes (local: PID lockfile; container: single instance) |
| SC-8 | Opening the workspace fresh and running `Project Memory: Show Diagnostics` returns a clean report with no warnings |
| SC-9 | Executor agent receives all necessary context from upstream agents and does not perform redundant research |
| SC-10 | `@memory` chat participant supports `/deploy` and `/diagnostics` commands |
| SC-11 | `WorkspaceContextPanel` defaults to collapsed read-only view; edit mode is per-section or global toggle |
| SC-12 | All 3 hub agents (Coordinator, Analyst, Runner) store structured context via `memory_context` before spawning Executor |
| SC-13 | MCP server supports both stdio (local) and HTTP/SSE (container) transports, selectable via CLI flag |
| SC-14 | A single Podman container runs both MCP server and dashboard, accessible on ports 3000/3001/3002 |
| SC-15 | Extension auto-detects a running container and connects without spawning local processes |
| SC-16 | Multiple VS Code windows share the containerized backend with no process duplication |
| SC-17 | Container data persists across restarts via volume mounts |

## Goals

1. **Ready but lightweight** — extension activates on startup and is immediately usable, but defers heavy resources (server, watchers) until first interaction
2. **Observable infrastructure** — any issue with MCP, dashboard, or extension should be diagnosable without reading source code
3. **Accurate agent instructions** — agents should never receive outdated tool names, action lists, or handoff patterns from their instruction files
4. **Efficient context flow** — upstream agents (Coordinator, Architect, Researcher) must provide downstream agents (Executor, Tester) with all context needed to act without redundant research
5. **Full chat integration** — the `@memory` chat participant should be a complete interface to every MCP capability, not a limited subset
6. **Maintainable codebase** — no monolith files; every module follows the project's own architectural guidelines
7. **Containerized backend** — MCP + dashboard run as a single Podman container; VS Code instances are lightweight clients that connect to the shared backend over HTTP

### Future Consideration

- **Eliminate Express server layer** — with containerization (Phase 6), the Express server becomes part of the container alongside the MCP server. Long-term, if the MCP server gains an HTTP API, the Express layer could be merged into it, reducing the container to a single process. Alternatively, the dashboard webview could communicate directly with the containerized MCP via SSE, bypassing Express entirely.

---

## References

| Resource | Path | Notes |
|----------|------|-------|
| Handoff Protocol | [.github/instructions/handoff-protocol.instructions.md](.github/instructions/handoff-protocol.instructions.md) | Hub-and-spoke model definition |
| Project Memory System | [.github/instructions/project-memory-system.instructions.md](.github/instructions/project-memory-system.instructions.md) | All 5 consolidated tools and their action sets |
| MVC Architecture | [.github/instructions/mvc-architecture.instructions.md](.github/instructions/mvc-architecture.instructions.md) | Directory structure and separation of concerns |
| Avoid Monoliths | [instructions/avoid-monolithic-files.instructions.md](instructions/avoid-monolithic-files.instructions.md) | 300–400 line max per file |
| Extension entry | [vscode-extension/src/extension.ts](vscode-extension/src/extension.ts) | Refactored: 1503→268 lines |
| ServerManager | [vscode-extension/src/server/ServerManager.ts](vscode-extension/src/server/ServerManager.ts) | Refactored: 720→330 lines |
| FrontendManager | [vscode-extension/src/server/FrontendManager.ts](vscode-extension/src/server/FrontendManager.ts) | Extracted from ServerManager (133 lines) |
| ServerHealthUtils | [vscode-extension/src/server/ServerHealthUtils.ts](vscode-extension/src/server/ServerHealthUtils.ts) | Extracted from ServerManager (187 lines) |
| Command modules | [vscode-extension/src/commands/](vscode-extension/src/commands/) | Extracted from extension.ts (4 files, 165–272 lines each) |
| Extension package | [vscode-extension/package.json](vscode-extension/package.json) | `onStartupFinished`, `autoStartServer`, `containerMode`, languageModelTools |
| MCP config (workspace) | [.vscode/mcp.json](.vscode/mcp.json) | stdio + SSE server entries |
| Consolidated tools | [server/src/tools/consolidated/](server/src/tools/consolidated/) | `memory_agent`, `memory_context`, `memory_plan`, `memory_steps`, `memory_workspace` |
| Dashboard server | [dashboard/server/src/](dashboard/server/src/) | Express + WebSocket API server |
| Agent files | [agents/](agents/) | 12 agent instruction files |
| Reviewer agent | [agents/reviewer.agent.md](agents/reviewer.agent.md) | Fixed: prose now uses `memory_workspace(action: reindex)` |
| Archivist agent | [agents/archivist.agent.md](agents/archivist.agent.md) | Fixed: tool guard lists all 5 tools |
| Executor agent | [agents/executor.agent.md](agents/executor.agent.md) | Fixed: step 3 retrieves stored context via `memory_context(action: get)` |
| Analyst agent | [agents/analyst.agent.md](agents/analyst.agent.md) | Fixed: stores `research_summary` before Executor spawn; context handoff checklist added |
| Runner agent | [agents/runner.agent.md](agents/runner.agent.md) | Fixed: structured `runSubagent` template with context storage protocol |
| WorkspaceContextPanel | [dashboard/src/components/workspace/WorkspaceContextPanel.tsx](dashboard/src/components/workspace/WorkspaceContextPanel.tsx) | Always in edit mode, not collapsible |
| ResearchNotesViewer | [dashboard/src/components/plan/ResearchNotesViewer.tsx](dashboard/src/components/plan/ResearchNotesViewer.tsx) | Functional but lacks search/filter |
| MCP server entry | [server/src/index.ts](server/src/index.ts) | Refactored: `createMcpServer()` factory, `--transport` and `--port` CLI flags, stdio + HTTP modes |
| HTTP transport | [server/src/transport/http-transport.ts](server/src/transport/http-transport.ts) | SSE + Streamable HTTP transport, `/health` endpoint, per-session server instances |
| MCP SDK | [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) | v1.26.0 — `StdioServerTransport`, `SSEServerTransport`, `StreamableHTTPServerTransport` |
| Containerfile | [Containerfile](Containerfile) | Multi-stage Podman/Docker build: node:20-slim, tini PID 1, ports 3000/3001/3002 |
| Container entrypoint | [container/entrypoint.sh](container/entrypoint.sh) | Starts MCP (streamable-http) + dashboard, signal trapping |
| Podman compose | [podman-compose.yml](podman-compose.yml) | Volume mounts, port mappings, healthcheck |
| Container run script | [run-container.ps1](run-container.ps1) | PowerShell: build/run/stop/logs/status actions |
| Container proxy | [server/src/transport/container-proxy.ts](server/src/transport/container-proxy.ts) | Auto-detects container, proxies tool calls via StreamableHTTP/SSE |
| Container detection | [vscode-extension/src/server/ContainerDetection.ts](vscode-extension/src/server/ContainerDetection.ts) | `probeContainer()`, `shouldUseContainer()`, settings |
| MCP config | [.vscode/mcp.json](.vscode/mcp.json) | stdio entry with `MBS_CONTAINER_URL`/`MBS_NO_PROXY` env vars |
| Dashboard ErrorBoundary | [dashboard/src/components/common/ErrorBoundary.tsx](dashboard/src/components/common/ErrorBoundary.tsx) | Existing error handling |
| Tool logger | [server/src/logging/tool-logger.ts](server/src/logging/tool-logger.ts) | Existing MCP logging |
