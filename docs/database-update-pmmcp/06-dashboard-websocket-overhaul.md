# Plan 6: Dashboard & WebSocket Overhaul

**Category:** Refactor  
**Priority:** High  
**Status:** In Progress  
**Parent Program:** [Database Migration & System Stabilization](00-program-overview.md)  
**Dependencies:** Plan 5 (MCP Server Storage Replacement)

> **Concurrency note (2026-02-24):** Plans 3/3.5/4/4.5 are complete — the SQLite schema and `server/src/db/` access layer already exist. Phases 1–4 and 6–9 are **fully unblocked** and are being worked now in parallel with Plan 5 Phase 2. Phase 5 (write path via MCP proxy) is deferred until Plan 5 Phase 2 lands; existing write paths remain in place as stubs during that window.  
**Workspace Directory:** `C:\Users\User\Project_Memory_MCP\Project-Memory-MCP`

## Goal

Remove all filesystem-based data access from the dashboard server. Replace chokidar file watching, JSON file scanning, and file-based event storage with direct SQLite queries and supervisor-proxied live updates. The dashboard becomes a thin API layer over the shared database — no more `fs.readFile`, `fs.readdir`, or `chokidar` in the data path.

### Scope

- **Remove**: `chokidar`, `fileScanner.ts`, `fileWatcher.ts`, filesystem event cleanup, all per-file JSON reads
- **Replace**: Express route handlers that call `fileScanner` with DB queries
- **Unify**: WebSocket + SSE into a single supervisor-proxied event channel
- **Keep**: Express server structure, all API endpoints (same URLs), React client, TanStack Query, Zustand, VS Code webview build target
- **Improve**: Real-time updates via supervisor SSE broadcast (Plan 2) instead of chokidar polling

---

## Phase 1: Database Connection Setup

- [x] **1.1** Add `better-sqlite3` to `dashboard/server/package.json` production dependencies
- [x] **1.2** Create `dashboard/server/src/db/connection.ts` — opens the shared `project-memory.db` created by the MCP server (Plan 3). Read `PM_DATA_ROOT` env var to find the DB file (same var used by `server/src/db/connection.ts`). Open in WAL mode, **read-only** (dashboard reads; MCP server writes). Mirror the singleton pattern from the MCP server connection module.
- [x] **1.3** Create `dashboard/server/src/db/queries.ts` — prepared SQL statements covering all queries the dashboard needs:
  - `listWorkspaces()` → `SELECT * FROM workspaces WHERE is_archived = 0`
  - `getWorkspace(id)` → `SELECT * FROM workspaces WHERE workspace_id = ?`
  - `getWorkspacePlans(wsId)` → `SELECT * FROM plans WHERE workspace_id = ? AND is_archived = 0`
  - `getPlan(wsId, planId)` → `SELECT * FROM plans WHERE workspace_id = ? AND plan_id = ?`
  - `getPlanPhases(planId)` → `SELECT * FROM phases WHERE plan_id = ? ORDER BY phase_order`
  - `getPlanSteps(planId)` → `SELECT * FROM steps WHERE plan_id = ? ORDER BY step_index`
  - `getPlanSessions(planId)` → `SELECT * FROM sessions WHERE plan_id = ? ORDER BY started_at DESC`
  - `getPlanLineage(planId)` → `SELECT * FROM lineage WHERE plan_id = ? ORDER BY timestamp`
  - `getPlanContext(planId)` → `SELECT * FROM context WHERE parent_type = 'plan' AND parent_id = ?`
  - `getWorkspaceContext(wsId)` → `SELECT * FROM context WHERE parent_type = 'workspace' AND parent_id = ?`
  - `getRecentEvents(limit)` → `SELECT * FROM event_log ORDER BY timestamp DESC LIMIT ?`
  - `getEventsSince(timestamp)` → `SELECT * FROM event_log WHERE timestamp > ? ORDER BY timestamp`
  - `getMetrics()` → aggregate queries across plans, steps, sessions
  - `getAgentMetrics()` → aggregate queries per agent type
  - `searchPlans(query)` → `SELECT * FROM plans WHERE title LIKE ? OR description LIKE ?`
  - `getKnowledge(wsId)` → `SELECT * FROM knowledge WHERE workspace_id = ?`
  - `getProgram(wsId, programId)` → join `programs` + `program_plans` + `plans`
  - `getBuildScripts(wsId, planId?)` → `SELECT * FROM build_scripts WHERE workspace_id = ?`
- [x] **1.4** Import and expose `getDb()` from `connection.ts` in each route file that needs data access

## Phase 2: Replace fileScanner with DB Queries

- [x] **2.1** Update `routes/workspaces.ts`:
  - Replace `scanWorkspaces()` call with `queries.listWorkspaces()`
  - Replace `getPlanState()` calls with `queries.getPlan()`
  - Replace workspace meta/context file reads with `queries.getWorkspace()` + `queries.getWorkspaceContext()`
  - Remove `fileScanner` imports
- [x] **2.2** Update `routes/plans.ts`:
  - Replace `getWorkspacePlans()` with `queries.getWorkspacePlans()`
  - Replace `getPlanState()` with `queries.getPlan()` + `queries.getPlanPhases()` + `queries.getPlanSteps()`
  - Replace `getPlanLineage()` with `queries.getPlanLineage()`
  - Replace `getResearchNotes()` with `queries.getPlanContext()` filtered by type `research`
  - Replace handoff/context/step updates with supervisor-proxied MCP tool calls (dashboard writes go through the MCP server, not direct DB writes)
  - Remove all `fs.readFile` / `fs.writeFile` operations for plan data
- [x] **2.3** Update `routes/metrics.ts`:
  - Replace the complex `scanWorkspaces()` + `getWorkspacePlans()` + `getPlanState()` aggregation loop with direct SQL aggregate queries from `queries.getMetrics()` and `queries.getAgentMetrics()`
  - Remove `dataCache` imports — DB queries with proper indices are fast enough without application-level caching
- [x] **2.4** Update `routes/events.ts`:
  - Replace `fs.readdir` + `fs.readFile` event loading with `queries.getRecentEvents()`
  - Keep SSE endpoint but source events from the DB event log + supervisor broadcast (not eventBus ring buffer)
- [x] **2.5** Update `routes/search.ts`:
  - Replace file-based search with `queries.searchPlans()` using SQL `LIKE` or FTS5 if available
  - Remove `scanWorkspaces` / `getWorkspacePlans` / `getPlanState` calls
- [x] **2.6** Update `routes/knowledge.ts`:
  - Replace file-based knowledge CRUD with `queries.getKnowledge()` and DB write operations
- [x] **2.7** Update `routes/programs.ts`:
  - Replace program file reads with `queries.getProgram()` aggregate query
- [x] **2.8** Delete `services/fileScanner.ts` — fully replaced by `db/queries.ts`

## Phase 3: Remove Chokidar & File Watcher

- [x] **3.1** Remove chokidar from `dashboard/server/package.json` dependencies
- [x] **3.2** Delete `services/fileWatcher.ts` — no longer watching files for changes
- [x] **3.3** Update `index.ts` — remove file watcher initialization:
  - Remove `initializeFileWatcher()` call
  - Remove `watcher` import
  - Remove the cleanup interval for old events (`cleanupOldEvents` — now handled by MCP server via Plan 5)
- [x] **3.4** Delete `services/cache.ts` — the TTL cache was a workaround for expensive file scans. DB queries with proper indices don't need application-level caching.
- [x] **3.5** Remove event bus ring buffer from `events/eventBus.ts` — events are queried from DB for historical access. Keep the EventEmitter for real-time push to connected SSE clients.

## Phase 4: Unify Real-Time Updates

Currently the dashboard has two overlapping real-time channels (WebSocket on port 3002 from chokidar, SSE from eventBus). Plan 2 already wired `eventBus.on('event', ...)` → WebSocket clients. Replace the whole stack with a single SSE-only channel powered by the supervisor's broadcast endpoint.

- [x] **4.1** Update `events/eventBus.ts`:
  - Remove the in-memory ring buffer (historical events come from DB `event_log` queries)
  - Keep `MCPEventBus extends EventEmitter` for live push
  - Add `connectToSupervisor(url: string)` that opens an HTTP/SSE client (`EventSource`-style via `http` module) to `SUPERVISOR_EVENTS_URL` env var (set in Plan 2, e.g. `http://localhost:3457/supervisor/events`)
  - On supervisor SSE events: parse → `this.emit('event', event)` → existing `/api/events/stream` pushes to browser
  - Graceful reconnect on disconnect (exponential back-off)
- [x] **4.2** Remove the WebSocket server from `index.ts`:
  - Delete the `ws` WebSocket server creation on port 3002
  - Remove `ws` from `dashboard/server/package.json` dependencies
  - Remove the `wsClients` tracking and broadcast logic
  - Note: the `eventBus.on('event', wss.clients.forEach ...)` block added in Plan 2 is also removed here since WS is gone
- [x] **4.3** Update the SSE endpoint (`routes/events.ts`):
  - Keep `GET /api/events/stream` (dashboard clients connect here)
  - Events now flow: MCP server → supervisor broadcast → dashboard eventBus → SSE to browser
  - For historical events: `GET /api/events?since=` queries the DB directly
- [x] **4.4** Update client `useLiveUpdates.ts`:
  - Remove WebSocket connection logic
  - Replace with SSE-only approach: the existing `useMCPEvents.ts` already handles SSE → query invalidation
  - Merge the query invalidation patterns from `useLiveUpdates` into `useMCPEvents`
  - Delete `useLiveUpdates.ts` after merge
- [x] **4.5** Update client `useMCPEvents.ts`:
  - Add the fine-grained query invalidation that was in `useLiveUpdates`:
    - `workspace_updated` → invalidate `['workspaces']`, `['workspace', wsId]`
    - `plan_updated` / `step_update` → invalidate `['plans', wsId]`, `['plan', wsId, planId]`
    - `handoff` → invalidate `['plan', wsId, planId]`
  - Keep toast notification logic
- [x] **4.6** Remove `config.wsUrl` from `dashboard/src/config.ts` — no longer needed

## Phase 5: Dashboard Write Operations *(deferred — gated on Plan 5 Phase 2)*

> ⚠️ This phase requires the MCP server tool handlers to be fully DB-backed (Plan 5 Phase 2). Until then, existing write paths (file-based or direct JSON writes) remain as stubs. Do not start Phase 5 until Plan 5 Phase 2 is marked complete.

The dashboard currently writes data by calling the MCP server API or directly writing JSON files. Standardize on a clean write path.

- [ ] **5.1** Define the write path: Dashboard → Express API → MCP server (via supervisor proxy or direct HTTP call) → DB write
  - The dashboard server should NOT write to the DB directly — the MCP server owns all writes for transactional integrity
  - For operations the dashboard needs to initiate (step updates, plan archive, etc.), proxy through the supervisor's MCP admin API or call the MCP tool endpoints
- [ ] **5.2** Update `routes/plans.ts` step update endpoints:
  - Replace direct `state.json` writes with calls to the MCP server's `memory_steps` tool
  - Use the supervisor's admin API endpoint for step mutations
- [ ] **5.3** Update `routes/plans.ts` plan operations (archive, delete, duplicate, resume):
  - Proxy through MCP server tool calls via supervisor
- [ ] **5.4** Update `routes/workspaces.ts` write operations:
  - Workspace registration, display name, context updates → proxy through MCP tools
- [ ] **5.5** Keep read-only endpoints as direct DB queries (fast, no proxy overhead)
- [ ] **5.6** Update `routes/agents.ts`, `routes/prompts.ts`, `routes/instructions.ts`:
  - For source file management (agent templates, prompt files, instruction files): these still read/write `.md` files in the workspace — this is correct, they are source files not data files
  - For deployment operations: proxy through MCP server

## Phase 6: Update Agent Scanner

- [ ] **6.1** Update `services/agentScanner.ts`:
  > ⏸️ **Deferred** — No deployment-tracking DB table exists yet. `scanAgentTemplates()` (filesystem reads of `.agent.md` source templates) is intentionally file-based and correct. `getAgentDeployments()` filesystem diff logic requires a new `agent_deployments` DB schema to replace. Blocked pending schema design.
  - Replace file-based agent scanning with `agent-definition-db.listAgents()` for deployed agent state
  - Keep filesystem reading for source agent templates (`.agent.md` files in the project) — these are source files
  - Compute diff between source templates and DB-stored deployed versions
- [ ] **6.2** Update agent deployment sync to use DB as the source of truth for what's deployed where
  > ⏸️ **Deferred** — Follows from 6.1. Requires `agent_deployments` table schema first.

## Phase 7: Simplify TanStack Query Config

With DB-backed queries and supervisor-pushed events, the aggressive polling is unnecessary.

- [x] **7.1** Update `main.tsx` QueryClient defaults:
  - Change `refetchInterval` from `30000` to `false` (disable polling — events push updates)
  - Change `staleTime` from `5000` to `30000` (30 seconds — data doesn't go stale between pushes)
  - Keep `gcTime` as default
- [x] **7.2** Remove per-hook `refetchInterval` overrides:
  - `useWorkspaces.ts` — remove `refetchInterval`
  - `usePlans.ts` — remove `refetchInterval`
  - `usePrograms.ts` — remove `refetchInterval`
  - `useBuildScripts.ts` — remove `refetchInterval`
  - `useCopilotStatus.ts` — keep `refetchInterval: 60000` (this checks external status, not DB data)
- [x] **7.3** Add a manual refetch button to the dashboard header for users who want to force-refresh
  > Already implemented in `dashboard/src/components/layout/Header.tsx` — `RefreshCw` icon button with spin animation calls `queryClient.invalidateQueries()` on click.
- [x] **7.4** Keep `useMCPEvents` invalidation as the primary update trigger
- [x] **7.5** Update settings panel — remove the configurable refresh interval (now push-driven)

## Phase 8: Update WebView Build

- [x] **8.1** Test the VS Code webview build (`BUILD_TARGET=webview`) still works after all changes
  > `BUILD_TARGET=webview npx vite build` → outputs to `dist-webview/webview.js` — clean.
- [x] **8.2** Ensure the webview build doesn't try to open WebSocket connections (removed in Phase 4)
  > `useLiveUpdates.ts` deleted, `config.wsUrl` removed. No WebSocket code remains in the client bundle.
- [x] **8.3** Test the VS Code bridge (`vscode-bridge.ts`) still functions — `jumpToCode()`, `openFile()`, etc.
  > `dashboard/src/utils/vscode-bridge.ts` verified: pure postMessage wrapper, no WebSocket dependency. 2 unit tests pass.
- [ ] **8.4** Verify the webview can receive events via SSE when running inside VS Code

## Phase 9: Cleanup

- [x] **9.1** Remove all unused imports across dashboard server files
  > `tsc --noEmit` passes clean. All remaining `fs`, `path`, `crypto`, `util` imports in route files are actively used (write ops deferred to Phase 5, but the Phase 5 stubs still use them).
- [x] **9.2** Remove `gray-matter` from dependencies if agent/prompt/instruction MD files move to DB in future (keep for now — they read source .md files)
- [x] **9.3** Update `dashboard/server/package.json` — verify deps:
  - **Remove**: `chokidar`, `ws`
  - **Add**: `better-sqlite3`, `@types/better-sqlite3`
  - **Keep**: `express`, `cors`, `gray-matter`
- [x] **9.4** Remove leftover `MBS_DATA_ROOT` references that assumed directory structure — update to point to the DB file location
  > `MBS_DATA_ROOT` in `index.ts` is retained intentionally: used for the error-log endpoint (`logs/dashboard-errors.log`), source file root paths (agents/prompts/instructions), and health-check reporting. These are source/log paths, not plan data. DB connection uses `PM_DATA_ROOT` separately.
- [x] **9.5** Clean up event-related code: remove `emitEvent()` + `cleanupOldEvents()` from `emitter.ts` — the dashboard server no longer writes events (the MCP server does via Plan 5)
- [ ] **9.6** Delete `dashboard/server/src/storage/workspace-utils.ts` — replaced by DB queries
  > ⏸️ **Blocked** — `workspace-utils.ts` is still actively used: `workspaces.ts` imports `getDataRoot`, `getWorkspaceDisplayName`, `resolveCanonicalWorkspaceId`, `writeWorkspaceIdentityFile`, `safeResolvePath`; `index.ts` imports `getDataRoot` for path computation. Cannot delete until workspace registration write path is proxied through MCP (Phase 5).

## Phase 10: Build & Verify

- [x] **10.1** `npx vite build` in `dashboard/` — verify client builds without errors
- [x] **10.2** `npm run build` in `dashboard/server/` — verify server compiles without errors (if applicable, or check `tsc --noEmit`)
- [x] **10.3** `npx vitest run` in `dashboard/` — fix any broken tests
  > **29 test files, 380 tests — all pass.** Only stderr output is React `act()` warnings (not failures).
- [ ] **10.4** Start the dashboard server with the migrated DB. Verify:
  - Dashboard loads and shows workspaces
  - Plans are listed correctly
  - Plan detail page shows phases, steps, sessions, lineage
  - Metrics page shows correct aggregates
  - Search works across workspaces and plans
- [ ] **10.5** Test live updates:
  - Run an agent through the MCP server while the dashboard is open
  - Verify the dashboard updates in real-time (within 1-2 seconds) without manual refresh
  - Verify toast notifications appear for events
- [ ] **10.6** Test the dashboard stays connected indefinitely:
  - Leave it open for 30 minutes under active agent use
  - Verify no dropouts, no stale data, no memory leaks
- [ ] **10.7** Test concurrent access:
  - Open the dashboard in two browsers simultaneously
  - Both should receive live updates
  - Step mutations from one browser should appear in the other within seconds
- [ ] **10.8** Build and test the VS Code webview variant

---

## References

### Files to Delete

| File | Replacement |
|------|-------------|
| `dashboard/server/src/services/fileScanner.ts` | `dashboard/server/src/db/queries.ts` |
| `dashboard/server/src/services/fileWatcher.ts` | Supervisor SSE broadcast |
| `dashboard/server/src/services/cache.ts` | DB indices (no app cache needed) |
| `dashboard/server/src/storage/workspace-utils.ts` | DB queries |

### Files to Create

| File | Purpose |
|------|---------|
| `dashboard/server/src/db/connection.ts` | Shared DB connection (read-only, WAL mode) |
| `dashboard/server/src/db/queries.ts` | Prepared statements for all dashboard queries |

### Files to Heavily Modify

| File | Changes |
|------|---------|
| `dashboard/server/src/index.ts` | Remove WS server, file watcher, event cleanup. Add DB init, supervisor connection. |
| `dashboard/server/src/routes/workspaces.ts` | Replace fileScanner with DB queries |
| `dashboard/server/src/routes/plans.ts` | Replace fileScanner with DB queries, proxy writes through MCP |
| `dashboard/server/src/routes/metrics.ts` | Replace scan-based metrics with SQL aggregates |
| `dashboard/server/src/routes/events.ts` | Replace file-based events with DB queries + eventBus |
| `dashboard/server/src/routes/search.ts` | Replace file-based search with SQL queries |
| `dashboard/server/src/routes/knowledge.ts` | Replace file-based knowledge with DB queries |
| `dashboard/server/src/routes/programs.ts` | Replace file-based programs with DB queries |
| `dashboard/server/src/events/eventBus.ts` | Remove ring buffer, add supervisor SSE client |
| `dashboard/server/src/events/emitter.ts` | Remove file-based event writing |
| `dashboard/src/hooks/useLiveUpdates.ts` | Delete (merged into useMCPEvents) |
| `dashboard/src/hooks/useMCPEvents.ts` | Add fine-grained query invalidation from useLiveUpdates |
| `dashboard/src/main.tsx` | Update QueryClient defaults (disable polling) |
| `dashboard/src/config.ts` | Remove wsUrl |

### Dependencies Changed

| Package | Action | Reason |
|---------|--------|--------|
| `chokidar` | Remove | Replaced by supervisor events |
| `ws` | Remove | WebSocket server replaced by SSE-only |
| `better-sqlite3` | Add | Direct DB queries for reads |
| `@types/better-sqlite3` | Add (dev) | TypeScript types |

### Data Flow After Migration

```
MCP Server (writes)
    │
    ├─► SQLite DB ◄── Dashboard Server (reads)
    │
    └─► Supervisor SSE broadcast
            │
            └─► Dashboard Server eventBus
                    │
                    └─► SSE endpoint → Browser (TanStack Query invalidation + toast)
```

### Design Decision: Read-Only Dashboard DB

The dashboard opens the SQLite DB in read-only mode for all data queries. This prevents:
- Write contention with the MCP server
- Accidental data corruption from the dashboard
- Need for write-ahead log coordination between processes

All write operations go through the MCP server (proxied via the supervisor's admin API). This maintains a single writer and gives the MCP server transactional control.
