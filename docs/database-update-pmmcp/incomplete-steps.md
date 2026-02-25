# Incomplete Steps — Plans 01 through 07

**Generated:** 2026-02-24  
**Last Updated:** 2026-02-25 — Full filesystem audit against all plans  
**Audit method:** Cross-referenced plan checkboxes against actual filesystem state in `server/src/`, `dashboard/server/src/`, `dashboard/src/`, `vscode-extension/src/`, `supervisor/`.

---

## Summary

| Plan | Status | Incomplete Steps |
|------|--------|-----------------|
| [Plan 1](01-extension-strip-down.md) | Code Complete — Manual Tests + Deferred Items Pending | 11 steps (1 timer deferred, 4 dashboard isolation, 6 manual tests) |
| [Plan 2](02-supervisor-extension.md) | Implementation Complete — Manual Integration Tests Pending | 4 steps (all manual integration tests) |
| [Plan 3](03-schema-design-db-foundation.md) | ✅ Tests Pass — Integration Tests + CLI Verification Pending | 6 steps (2 integration tests + 4 CLI verification) |
| [Plan 3.5](03.5-plan-type-schema-extension.md) | ✅ Build & Tests Pass — Schema Smoke Tests Pending | 3 steps (schema constraint manual checks) |
| [Plan 4](04-data-migration.md) | ✅ Migration Scripts Created — Execution Pending | 5 steps (execution run + verification) |
| [Plan 4.5](04.5-relational-gap-closure.md) | ✅ Build & Tests Pass — Smoke Tests Pending | 3 steps (smoke tests only) |
| [Plan 5](05-mcp-server-storage-replacement.md) | Phases 1–10 Complete — Dead Code Removal + Smoke Tests Pending | 14 steps (Phase 8 remainder, deferred actions, Phase 11 smoke tests) |
| [Plan 6](06-dashboard-websocket-overhaul.md) | Phases 1–3 + 7 Complete — Phases 4–6, 8–10 Pending | ~36 steps (event unification, write path, agent scanner, webview, cleanup, build) |
| [Plan 7](07-extension-enhancement-v2.md) | ✅ Complete | 0 steps |

**Total incomplete:** ~82 steps across 8 plans (Plan 7 fully done)

---

## Plan 1: Extension Strip-Down

**What's done:** All code changes complete. LM tools, chat participant, McpBridge, session orchestration, file watchers all archived. `extension.ts` reduced from 1582 → 430 lines. Build clean, 61/61 tests pass. Exponential backoff + circuit breaker implemented in ConnectionManager. `dashboard.enabled` setting registered in `package.json`. VSIX built and installed. Plan 7 completed the Phase 1 dead code deletions (ServerManager, FrontendManager, PidLockfile, ServerLogger).  
**What's missing:** DiagnosticsService timer improvement deferred, 4 dashboard isolation verifications pending, 6 manual tests never run.

### Phase 6 — Timer & Watcher Overhead

- [x] **6.5** `ConnectionManager.startAutoDetection()` — exponential backoff *(completed: recursive setTimeout with exponential backoff + circuit breaker)*
- [ ] **6.6** `DiagnosticsService` — make health checks on-demand only instead of heartbeat-driven *(deferred; currently SSE heartbeat-driven)*

### Phase 7 — Dashboard Isolation (partially deferred)

> Steps 7.4 and 7.8 completed. Steps 7.1–7.3 may now be partially obsolete since Plan 7 replaced WebSocket with SSE event subscription. Steps 7.5–7.7 are verification only.

- [ ] **7.1** Audit dashboard HTTP/WebSocket call paths in the extension
- [ ] **7.2** Wrap all dashboard HTTP calls with `try/catch` + 2s timeout
- [ ] **7.3** Make WebSocket connection fully optional with lazy-connect pattern *(may be obsolete — Plan 7 uses SSE via EventSubscriptionService)*
- [x] **7.4** Add circuit breaker to `ConnectionManager` *(completed: `_circuitOpen` flag + `_consecutiveFailures` counter)*
- [ ] **7.5** Verify supervisor does not depend on dashboard server availability
- [ ] **7.6** Verify MCP tool registration never awaits a dashboard connection
- [ ] **7.7** Crash test: kill dashboard mid-session, verify extension and supervisor unaffected
- [x] **7.8** Add `projectMemory.dashboard.enabled` setting *(completed: registered in `package.json` + guard in `extension.ts`)*

### Phase 9 — Build & Verify (manual tests pending)

- [x] **9.3** Package: `npx @vscode/vsce package` *(completed: `project-memory-dashboard-0.2.0.vsix` built)*
- [x] **9.4** Install: `code --install-extension *.vsix` *(completed)*
- [ ] **9.5** Manual test: verify zero LM tool registrations in unrelated chat sessions
- [ ] **9.6** Manual test: dashboard panel loads and displays data
- [ ] **9.7** Manual test: deploy commands work from command palette
- [ ] **9.8** Manual test: supervisor launch commands work
- [ ] **9.9** Manual test: dashboard crash resilience *(requires Phase 7 verification)*
- [ ] **9.10** Manual test: `dashboard.enabled = false` kill switch

---

## Plan 2: Supervisor Extension

**What's done:** Full event broadcast channel (tokio broadcast), `/supervisor/events` SSE endpoint, MCP server event ingestion with reconnect, control-plane extensions (`SubscribeEvents`, `EventStats`, `EmitTestEvent`), QML GUI event status, dashboard bridge mode. 186/186 Rust tests pass, dashboard TypeScript build clean.  
**What's missing:** All remaining steps are manual integration tests that require a running system.

### Phase 7 — Dashboard Integration Preparation (partial)

- [ ] **7.4** *(Manual)* Verify end-to-end: MCP server emits event → supervisor receives → supervisor broadcasts SSE → dashboard server subscribes → dashboard SSE → React frontend — without filesystem polling anywhere in the chain

### Phase 9 — Build & Verify (manual tests pending)

- [ ] **9.4** *(Manual)* Manual test: start supervisor → start MCP server → trigger a plan update → verify the event appears on `/supervisor/events` SSE endpoint
- [ ] **9.5** *(Manual)* Manual test: start dashboard with `SUPERVISOR_EVENTS_URL` set → verify SSE clients receive events without filesystem polling
- [ ] **9.6** *(Manual)* Manual test: kill and restart the MCP server → verify the supervisor reconnects its event subscription automatically

---

## Plan 3: Schema Design & DB Foundation

**What's done:** All DDL (001-initial-schema.sql), all 21 db/*.ts files, types.ts, mappers.ts, seed.ts, test fixtures, connection tests, migration tests, CRUD tests, schema constraint tests, integration tests. Build passes, 1785/1785 tests pass.  
**What's missing:** Two specific integration tests and CLI/performance verification.

### Phase 5 — Seed & Test Utilities (partial)

- [x] **5.3–5.6** Test fixtures, connection tests, migration tests, CRUD tests *(all completed)*
- [ ] **5.7** Write integration test for the archival procedure: create plan with phases/steps/sessions/context → archive → verify rows moved to archive tables
- [ ] **5.8** Write integration test for the "mark current done and get next" atomic operation: transaction atomicity, concurrent call safety

### Phase 6 — Build & Verify (partial)

- [x] **6.2** `npx vitest run` in `server/` — all new DB tests pass *(1785/1785)*
- [ ] **6.3** Verify DB file is created correctly: open with `sqlite3 CLI`, inspect tables, run sample queries
- [ ] **6.4** Verify WAL mode is active: `PRAGMA journal_mode` returns `wal`
- [ ] **6.5** Verify foreign key enforcement: attempt to insert a step with a non-existent `phase_id`, confirm it fails
- [ ] **6.6** Load test: insert 50 workspaces × 10 plans × 5 phases × 20 steps (50,000 steps). Verify query performance stays under 50ms

---

## Plan 3.5: Plan Type Schema Extension

**What's done:** Full DDL, all row types, plan-db type-aware queries, program-risks-db, dependency-db, all mappers, all docs. Build passes, tests pass.  
**What's missing:** Schema constraint smoke tests.

### Phase 8 — Build & Verify (smoke tests)

- [ ] **8.3** Schema smoke test: INSERT rows into `programs`, `program_plans`, `program_risks`; verify CHECK constraints reject invalid `category`
- [ ] **8.4** Verify `dependencies` table rejects unknown `dep_type` and `dep_status` values
- [ ] **8.5** Verify `plans.program_id → programs.id` FK with `ON DELETE SET NULL`: delete a program, confirm child plans' `program_id` becomes NULL

---

## Plan 4: Data Migration

**What's done:** All 13 migration scripts created and wired in `migrate.ts`. `migrate-logs.ts` created. `validate.ts` with referential integrity checks, report builder. Build passes.  
**What's missing:** Migration has not been executed against the actual data directory.

### Phase 10 — Validation (partial)

- [ ] **10.3** Content verification spot check: read 5 random plans from the database, compare reconstructed `PlanState` against the original `state.json`

### Phase 11 — Build & Verify (execution never run)

- [ ] **11.2** Run the migration in `--dry-run` mode against the actual `data/` directory
- [ ] **11.3** Run the migration for real; review the report and validation output
- [ ] **11.4** Open the resulting `project-memory.db` in `sqlite3 CLI`; run sample queries
- [ ] **11.5** Run `npx vitest run` in `server/` — all migration tests pass alongside existing tests

---

## Plan 4.5: Relational Gap Closure

**What's done:** DDL, all types, all DAL files (program-workspace-links-db, file-edits-db, research-db polymorphic, step-db dependencies), all mappers, all migration scripts including `migrate-file-edits.ts`, docs. Build passes, 1785/1785 tests pass.  
**What's missing:** Smoke tests only.

### Phase 6 — Build & Verify (smoke tests)

- [ ] **6.2** Schema smoke tests: cross-workspace link, step dependency round-trip, `getNextPendingStep` respects blocked deps
- [ ] **6.3** Research linking smoke tests: insert note with `parent_type: 'phase'`; verify retrieval; verify UNIQUE constraint
- [ ] **6.4** File edit history smoke tests: `recordFileEdit`, `getFileEditHistory`, `searchFileEdits`; run `migrate-file-edits` against known `execution_log`

---

## Plan 5: MCP Server Storage Replacement

**What's done:** Phases 1–10 complete. `db-store.ts` shim created (~1322 lines), all 41 source files redirected from `file-store.js` → `db-store.js`. 6 storage files archived. DB location at `%APPDATA%\ProjectMemory\`. Server entry point updated with `getDb()` import and graceful DB close. Event system fully DB-backed. TS: 0 errors, Tests: 1621/1621 passing.  
**What's missing:** 6 dead code removal items (Phase 8), 3 deferred actions (Phases 4/6/7), and 5 smoke tests (Phase 11).

### Phase 4 — Deferred Actions

- [ ] **4.2** Add new `next` action to `memory_steps` — atomic mark-done + return-next *(deferred; not blocking DB migration)*
- [ ] **4.3** Register `next` action in preflight registry *(follows 4.2)*
- [ ] **4.4** Phase-aware step ordering from `phases` table *(deferred)*

### Phase 6 — Deferred

- [ ] **6.5** New `search` context action *(deferred; not blocking DB migration)*

### Phase 7 — Deferred

- [ ] **7.6** Preflight registry — add `next` action *(follows 4.2)*

### Phase 8 — Remove Dead Storage Code (partial)

> 8.1, 8.3–8.5, 8.7–8.8 completed (files archived). Remaining items require porting code first.

- [ ] **8.2** Delete `file-lock.ts` — still re-exported from `db-store.ts` and used for `identity.json` writes via `proper-lockfile`; inline helpers then archive
- [ ] **8.6** Delete `workspace-hierarchy.ts` (431 lines) — still re-exported from `db-store.ts`; port hierarchy logic to `workspace-db.ts` first
- [ ] **8.9** Gut `workspace-identity.ts` — reduce from ~1600 lines to ~50 lines (identity.json read/write only). Currently still has `scanGhostFolders`, `mergeWorkspace`, `migrateWorkspace` and extensive filesystem logic
- [ ] **8.10** Remove `proper-lockfile` from `server/package.json` dependencies *(still listed at lines 26, 33)*
- [ ] **8.11** Clean up all remaining imports of deleted modules
- [ ] **8.12** Remove `mirrorToolResponse()` from `index.ts` *(still exists at lines 54–102: mirrors tool responses to `.projectmemory/active_agents/`)*

### Phase 11 — Build & Verify (smoke tests)

- [ ] **11.3** Start server with fresh DB, register workspace, create plan, add steps, run full agent lifecycle
- [ ] **11.4** Start server with migrated DB (from Plan 4) — verify existing data loads correctly
- [ ] **11.5** Test `next` step action *(deferred; action not yet implemented)*
- [ ] **11.6** Test concurrent WAL-mode operations
- [ ] **11.7** Test context search with cross-scope filters
- [ ] **11.9** Verify dashboard server + MCP server can share same DB simultaneously

---

## Plan 6: Dashboard & WebSocket Overhaul

**What's done (based on filesystem — plan doc checkboxes not yet updated):**
- **Phase 1 ✅ Complete:** `better-sqlite3` added to `dashboard/server/package.json`. `db/connection.ts` created (read-only WAL mode, `PM_DATA_ROOT`). `db/queries.ts` created (349 lines, all prepared statements). `db/types.ts` created (155 lines, all row types).
- **Phase 2 ✅ Complete:** All route files (`workspaces.ts`, `plans.ts`, `metrics.ts`, `events.ts`, `search.ts`, `knowledge.ts`, `programs.ts`, `reports.ts`) import from `db/queries.ts` — zero `fileScanner` imports remain.
- **Phase 3 ✅ Complete:** `fileScanner.ts`, `fileWatcher.ts`, `cache.ts` all deleted. No `chokidar` references in the codebase. `chokidar` removed from `package.json`.
- **Phase 7 ✅ Complete:** `main.tsx` updated: `staleTime: 30_000`, `refetchInterval: false`. Per-hook `refetchInterval` overrides removed from `useWorkspaces.ts`, `usePlans.ts`.
- **Phase 4 (partial):** `eventBus.ts` rewritten with `connectToSupervisor(url)` SSE client + exponential backoff reconnect. `useLiveUpdates.ts` already deleted. `useMCPEvents.ts` already has fine-grained query invalidation (`workspace_updated`, `plan_updated`, `step_updated`). BUT `emitter.ts` still has `fs.writeFile` event writing + `cleanupOldEvents()` filesystem cleanup.

**What's missing:** Event emitter cleanup, WS server removal (may already be done), write path, agent scanner, webview build, full cleanup, build+verify.

### Phase 4 — Unify Real-Time Updates (partial)

- [ ] **4.2** Remove the WebSocket server from `index.ts` — delete `ws` server creation, remove `ws` from `package.json` *(needs verification — may already be done)*
- [ ] **4.3** Update SSE endpoint (`routes/events.ts`) — events flow: MCP server → supervisor → dashboard eventBus → SSE to browser
- [ ] **4.5** Update client `useMCPEvents.ts` — merge any remaining `useLiveUpdates` invalidation patterns *(partially done — invalidation already present)*
- [ ] **4.6** Remove `config.wsUrl` from `dashboard/src/config.ts` *(already no `wsUrl` found — may be done)*

### Phase 5 — Dashboard Write Operations (all pending — requires Plan 5)

- [ ] **5.1–5.6** All write path standardization (dashboard → Express API → MCP server → DB write)

### Phase 6 — Update Agent Scanner

- [ ] **6.1** Update `services/agentScanner.ts` — replace file-based scanning with DB for deployed agent state *(still uses `fs` imports)*
- [ ] **6.2** Update agent deployment sync to use DB as source of truth

### Phase 7 — Simplify TanStack Query Config (remaining)

- [ ] **7.3** Add manual refetch button to dashboard header
- [ ] **7.5** Update settings panel — remove configurable refresh interval

### Phase 8 — Update WebView Build

- [ ] **8.1–8.4** WebView build verification and VS Code bridge testing

### Phase 9 — Cleanup (partial)

- [ ] **9.1** Remove all unused imports across dashboard server files
- [ ] **9.3** Verify `dashboard/server/package.json` deps: remove `ws` if still present; verify `better-sqlite3` added *(better-sqlite3 confirmed added)*
- [ ] **9.4** Remove leftover `MBS_DATA_ROOT` references
- [ ] **9.5** Clean up `emitter.ts` — remove `emitEvent()` + `cleanupOldEvents()` filesystem writes *(still has `fs.writeFile`, `fs.mkdir`, `fs.readdir`, `fs.stat`, `fs.unlink`)*
- [ ] **9.6** Delete `dashboard/server/src/storage/workspace-utils.ts` *(still exists)*

### Phase 10 — Build & Verify (all pending)

- [ ] **10.1–10.8** Full build, test, and manual verification

---

## Plan 7: Extension Enhancement (v2)

**Status:** ✅ **Complete** — All phases verified against filesystem.

- Phase 1 (Dead Code Removal): `ServerManager.ts`, `FrontendManager.ts`, `PidLockfile.ts`, `ServerLogger.ts` all deleted. Deprecated commands and settings removed from `package.json`.
- Phase 2 (TreeView): `WorkspacePlanTreeProvider.ts` created and registered.
- Phase 3 (Status Bar): `StatusBarManager.ts` wired to supervisor SSE events.
- Phase 4 (Event Subscription): `EventSubscriptionService.ts` created.
- Phase 5 (Notifications): `NotificationService.ts` created.
- Phase 6 (One-Click Deploy): Deploy profile system and context menu added.
- Phase 7 (Diagnostics TreeView): `DiagnosticsTreeProvider.ts` created and registered.
- Phase 8 (Code Navigation): Step file path parsing and click-to-navigate implemented.
- Phase 9 (Build & Verify): All checkboxes marked ✅ in plan doc.

---

## Quick Reference — Remaining Code Changes

| Change | Plan | Phase | Type |
|--------|------|-------|------|
| Add `next` action to `memory_steps.ts` | 5 | 4.2 | Code |
| Register `next` in preflight registry | 5 | 4.3, 7.6 | Code |
| Port `workspace-hierarchy.ts` to `workspace-db.ts` | 5 | 8.6 | Refactor |
| Gut `workspace-identity.ts` to ~50 lines | 5 | 8.9 | Refactor |
| Inline `file-lock.ts` helpers, delete file | 5 | 8.2 | Refactor |
| Remove `proper-lockfile` from `package.json` | 5 | 8.10 | Cleanup |
| Remove `mirrorToolResponse()` from `index.ts` | 5 | 8.12 | Cleanup |
| Clean up `emitter.ts` filesystem writes | 6 | 9.5 | Cleanup |
| Delete `workspace-utils.ts` (dashboard) | 6 | 9.6 | Cleanup |
| Update `agentScanner.ts` to use DB | 6 | 6.1 | Refactor |
| Standardize dashboard write path via MCP proxy | 6 | 5.1–5.6 | Feature |

## Quick Reference — Verification / Testing Only

| Test | Plan | Phase |
|------|------|-------|
| Archival procedure integration test | 3 | 5.7 |
| Mark-done-get-next atomic test | 3 | 5.8 |
| CLI DB verification (WAL, FK, load) | 3 | 6.3–6.6 |
| Schema smoke tests (constraints) | 3.5 | 8.3–8.5 |
| Migration dry-run + execution | 4 | 11.2–11.5 |
| Plan 4 content verification | 4 | 10.3 |
| Plan 4.5 smoke tests | 4.5 | 6.2–6.4 |
| Plan 5 smoke tests | 5 | 11.3–11.9 |
| Plan 6 full build + verify | 6 | 10.1–10.8 |
| Plan 1 manual tests | 1 | 9.5–9.10 |
| Plan 2 manual integration tests | 2 | 7.4, 9.4–9.6 |
| Plan 1 dashboard isolation checks | 1 | 7.1–7.3, 7.5–7.7 |
