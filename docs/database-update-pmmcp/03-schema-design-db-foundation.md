# Plan 3: Schema Design & DB Foundation

**Category:** Feature  
**Priority:** Critical  
**Status:** Implementation Complete — Tests Pending  
**Parent Program:** [Database Migration & System Stabilization](00-program-overview.md)  
**Dependencies:** Plan 2 (Supervisor Extension)  
**Workspace Directory:** `C:\Users\User\Project_Memory_MCP\Project-Memory-MCP`

## Goal

Design and implement the full SQLite schema, build the database access layer, migration runner, and seed utilities. This plan produces the database file and all TypeScript code needed to read/write it — but does **not** change any existing tool handlers (that's Plan 5). The DB should store everything currently in the `data/` directory, plus agent/instruction/skill files.

### Key Design Decisions

- **`better-sqlite3`** — synchronous Node.js SQLite driver, zero config, single file, JSON functions
- **WAL mode** — concurrent reads while writing, eliminates file-lock contention
- **First-class phases** — phases become their own table with `order_index`, not just string labels on steps
- **Polymorphic context** — `(parent_type, parent_id)` where `parent_type ∈ {workspace, plan, phase, step}`
- **Dependency DAG** — generic edge table supporting plan→plan, phase→phase, step→step, and cross-type
- **Archive tables** — completed plans and children move to `_archive` tables, keeping active queries fast
- **Foreign keys enforced** — `PRAGMA foreign_keys = ON`
- **Tool/action/argument catalog** — tools, their actions, required arguments, and descriptions stored in DB so agents can query them
- **Agent/instruction/skill storage** — file contents stored in the DB, broken up and categorized

---

## Phase 1: Schema Design

- [x] **1.1** Finalize the DDL for all core tables. At minimum:

  **Workspace & Organization**
  | Table | Purpose |
  |-------|---------|
  | `workspaces` | One row per registered workspace |
  | `programs` | Integrated programs (FK → workspace) |
  | `program_workspace_links` | Cross-workspace program visibility |

  **Plans & Steps**
  | Table | Purpose |
  |-------|---------|
  | `plans` | One row per plan (FK → workspace, FK → program nullable) |
  | `phases` | First-class phases with `order_index` (FK → plan) |
  | `steps` | Individual tasks (FK → phase, `order_index`) |
  | `plan_notes` | Notes attached to plans |

  **Agent Lifecycle**
  | Table | Purpose |
  |-------|---------|
  | `sessions` | Agent sessions (FK → plan) |
  | `lineage` | Handoff history (FK → plan) |

  **Context & Knowledge**
  | Table | Purpose |
  |-------|---------|
  | `context_items` | Polymorphic context — links to workspace/plan/phase/step |
  | `research_documents` | Long-form research text (FK → plan nullable, FK → workspace) |
  | `knowledge` | Workspace-scoped knowledge files |

  **Build & Dependencies**
  | Table | Purpose |
  |-------|---------|
  | `build_scripts` | Reusable build scripts (FK → workspace, FK → plan nullable) |
  | `dependencies` | DAG: source/target type+id for plan→plan, phase→phase, step→step |

  **Tool Catalog**
  | Table | Purpose |
  |-------|---------|
  | `tools` | MCP tools with name, description |
  | `tool_actions` | Actions per tool with description |
  | `tool_action_params` | Parameters per action with type, required flag, description |

  **Agent/Instruction/Skill Storage**
  | Table | Purpose |
  |-------|---------|
  | `agent_definitions` | Agent markdown files stored as rows (name, content, metadata) |
  | `instruction_files` | Instruction file content (applies_to pattern, content) |
  | `skill_definitions` | Skill files broken into structured rows (name, category, tags, content) |

  **Audit**
  | Table | Purpose |
  |-------|---------|
  | `update_log` | Replaces workspace.context.json update_log |
  | `event_log` | MCPEvents stored as rows |

  **Archive**
  | Table | Purpose |
  |-------|---------|
  | `plans_archive` | Archived plans (same columns as `plans`) |
  | `phases_archive` | Archived phases |
  | `steps_archive` | Archived steps |
  | `sessions_archive` | Archived sessions |
  | `lineage_archive` | Archived lineage |

- [x] **1.2** Design indexes for all FK columns + composite indexes for common queries:
  - `(workspace_id, status)` on `plans` — list active plans per workspace
  - `(plan_id, order_index)` on `phases` — ordered phase retrieval
  - `(phase_id, order_index)` on `steps` — ordered step retrieval
  - `(parent_type, parent_id)` on `context_items` — context lookup by parent
  - `(workspace_id)` on `knowledge`, `build_scripts`, `research_documents`
  - `(source_type, source_id)` and `(target_type, target_id)` on `dependencies`

- [x] **1.3** Design the archival procedure: a single function that, given a plan ID, moves the plan and all child rows (phases, steps, sessions, lineage, notes, context_items, research_documents) to their `_archive` counterparts in a single transaction.

- [x] **1.4** Design the tool catalog seeding: write a JSON/TS data file containing all 8 tools, ~60+ actions, and their parameters (sourced from the preflight registry). This seeds the `tools`, `tool_actions`, and `tool_action_params` tables.

- [x] **1.5** Design the context tool's DB-aware actions: agents should be able to search context by parent scope, type, date range, and full-text content match. Define the query interface.

- [x] **1.6** Write the complete DDL in a migration file (`migrations/001-initial-schema.sql`). Review for correctness.

## Phase 2: Install Dependencies & DB Bootstrap

- [x] **2.1** Add `better-sqlite3` and `@types/better-sqlite3` to `server/package.json`.
- [x] **2.2** Create `server/src/db/connection.ts` — connection manager:
  - Opens the SQLite file at `{DATA_ROOT}/project-memory.db`
  - Sets `PRAGMA foreign_keys = ON`
  - Sets `PRAGMA journal_mode = WAL`
  - Sets `PRAGMA busy_timeout = 5000`
  - Exports a singleton `getDb()` function
  - Handles graceful close on process exit
- [x] **2.3** Create `server/src/db/migration-runner.ts` — reads `migrations/*.sql` files in order, tracks applied migrations in a `_migrations` table, applies only unapplied ones in a transaction.
- [x] **2.4** Create `server/src/db/index.ts` — barrel export for the DB module.

## Phase 3: Query Helpers & Data Access Layer

- [x] **3.1** Create `server/src/db/query-helpers.ts` — generic typed query helpers:
  - `queryOne<T>(sql, params): T | undefined`
  - `queryAll<T>(sql, params): T[]`
  - `run(sql, params): RunResult`
  - `transaction<T>(fn: () => T): T`
- [x] **3.2** Create `server/src/db/workspace-db.ts` — workspace CRUD:
  - `createWorkspace(data): WorkspaceRow`
  - `getWorkspace(id): WorkspaceRow | null`
  - `getWorkspaceByPath(path): WorkspaceRow | null`
  - `listWorkspaces(): WorkspaceRow[]`
  - `updateWorkspace(id, data): void`
  - `deleteWorkspace(id): void`
- [x] **3.3** Create `server/src/db/plan-db.ts` — plan CRUD:
  - `createPlan(data): PlanRow`
  - `getPlan(id): PlanRow | null`
  - `getPlansByWorkspace(wsId, opts?): PlanRow[]` (filter by status, category)
  - `updatePlan(id, data): void`
  - `deletePlan(id): void`
  - `archivePlan(id): void` (moves plan + children to archive tables in a transaction)
  - `findPlanById(id): { plan, workspaceId } | null` (cross-workspace search)
- [x] **3.4** Create `server/src/db/phase-db.ts` — phase CRUD:
  - `createPhase(planId, data): PhaseRow`
  - `getPhases(planId): PhaseRow[]`
  - `updatePhase(id, data): void`
  - `deletePhase(id): void`
  - `reorderPhases(planId, newOrder): void`
- [x] **3.5** Create `server/src/db/step-db.ts` — step CRUD:
  - `createStep(phaseId, data): StepRow`
  - `getSteps(phaseId): StepRow[]`
  - `getAllSteps(planId): StepRow[]` (joins phases)
  - `updateStep(id, data): void`
  - `batchUpdateSteps(updates): void`
  - `deleteStep(id): void`
  - `insertStep(phaseId, atIndex, data): StepRow`
  - `moveStep(id, toPhaseId, toIndex): void`
  - `reorderSteps(phaseId, newOrder): void`
  - `getNextPendingStep(planId): StepRow | null` (for the "next" action)
  - `markCurrentDoneAndGetNext(planId, agentType): { completed: StepRow, next: StepRow | null }` (atomic "next" operation)
- [x] **3.6** Create `server/src/db/session-db.ts` — session CRUD:
  - `createSession(planId, data): SessionRow`
  - `getSession(id): SessionRow | null`
  - `getSessions(planId): SessionRow[]`
  - `completeSession(id, summary, artifacts): void`
- [x] **3.7** Create `server/src/db/lineage-db.ts` — lineage recording:
  - `addLineageEntry(planId, entry): void`
  - `getLineage(planId): LineageRow[]`
- [x] **3.8** Create `server/src/db/context-db.ts` — polymorphic context:
  - `storeContext(parentType, parentId, type, data): ContextRow`
  - `getContext(parentType, parentId, type?): ContextRow[]`
  - `searchContext(query): ContextRow[]` (full-text search across content)
  - `listContextTypes(parentType, parentId): string[]`
  - `deleteContext(id): void`
- [x] **3.9** Create `server/src/db/research-db.ts` — research documents:
  - `appendResearch(planId, wsId, filename, content): void`
  - `getResearch(planId, filename): string | null`
  - `listResearch(planId): string[]`
- [x] **3.10** Create `server/src/db/knowledge-db.ts` — knowledge files:
  - `storeKnowledge(wsId, slug, title, data, opts): KnowledgeRow`
  - `getKnowledge(wsId, slug): KnowledgeRow | null`
  - `listKnowledge(wsId, category?): KnowledgeRow[]`
  - `deleteKnowledge(wsId, slug): void`
- [x] **3.11** Create `server/src/db/build-script-db.ts` — build scripts:
  - `addBuildScript(wsId, data): BuildScriptRow`
  - `getBuildScripts(wsId, planId?): BuildScriptRow[]`
  - `findBuildScript(wsId, scriptId, planId?): BuildScriptRow | null`
  - `deleteBuildScript(wsId, scriptId): void`
- [x] **3.12** Create `server/src/db/dependency-db.ts` — DAG dependencies:
  - `addDependency(sourceType, sourceId, targetType, targetId): void`
  - `getDependencies(sourceType, sourceId): DependencyRow[]`
  - `getDependents(targetType, targetId): DependencyRow[]`
  - `removeDependency(id): void`
  - `checkCycle(sourceType, sourceId, targetType, targetId): boolean`
- [x] **3.13** Create `server/src/db/tool-catalog-db.ts` — tool/action/param catalog:
  - `seedToolCatalog(catalog): void` (idempotent insert-or-update)
  - `getTools(): ToolRow[]`
  - `getToolActions(toolName): ToolActionRow[]`
  - `getActionParams(toolName, actionName): ParamRow[]`
  - `getToolHelp(toolName, actionName?): ToolHelp` (formatted help text)
- [x] **3.14** Create `server/src/db/agent-definition-db.ts` — agent file storage:
  - `storeAgent(name, content, metadata): void`
  - `getAgent(name): AgentDefinitionRow | null`
  - `listAgents(): AgentDefinitionRow[]`
- [x] **3.15** Create `server/src/db/instruction-db.ts` — instruction file storage:
  - `storeInstruction(filename, appliesTo, content): void`
  - `getInstruction(filename): InstructionRow | null`
  - `getInstructionsForFile(filepath): InstructionRow[]` (matches against appliesTo glob patterns)
  - `listInstructions(): InstructionRow[]`
- [x] **3.16** Create `server/src/db/skill-db.ts` — skill storage:
  - `storeSkill(name, category, tags, languageTargets, frameworkTargets, content): void`
  - `getSkill(name): SkillRow | null`
  - `matchSkills(query, opts?): SkillRow[]` (tag/category/framework matching)
  - `listSkills(): SkillRow[]`
- [x] **3.17** Create `server/src/db/update-log-db.ts` — audit log:
  - `addUpdateLog(wsId, entry): void`
  - `getUpdateLog(wsId, limit?, offset?): UpdateLogRow[]`
- [x] **3.18** Create `server/src/db/event-log-db.ts` — event log:
  - `addEventLog(event): void`
  - `getRecentEvents(limit?): EventLogRow[]`
  - `getEventsSince(timestamp): EventLogRow[]`
  - `cleanupOldEvents(maxAge?): number`
- [x] **3.19** Create `server/src/db/program-db.ts` — programs:
  - `createProgram(wsId, data): ProgramRow`
  - `getProgram(id): ProgramRow | null`
  - `listPrograms(wsId): ProgramRow[]`
  - `addPlanToProgram(programId, planId): void`
  - `listProgramPlans(programId): PlanRow[]`
  - `upgradeToProgram(planId): ProgramRow`

## Phase 4: Row Types & Type Mapping

- [x] **4.1** Create `server/src/db/types.ts` — row types for all DB tables (e.g., `WorkspaceRow`, `PlanRow`, `PhaseRow`, `StepRow`, `SessionRow`, `LineageRow`, `ContextRow`, `KnowledgeRow`, `BuildScriptRow`, etc.)
- [x] **4.2** Create `server/src/db/mappers.ts` — functions to convert between DB row types and existing domain types (`PlanState`, `PlanStep`, `WorkspaceMeta`, etc.). These mappers ensure the tool handlers can continue working with existing interfaces while the DB layer uses flat row types.
- [x] **4.3** Ensure the mapper for `PlanState` reconstructs the full object shape (steps nested inside plan, phases populated, sessions array, lineage array) from joined queries or multi-query composition.

## Phase 5: Seed & Test Utilities

- [x] **5.1** Create `server/src/db/seed.ts` — seeds the tool catalog, default agent definitions, and test data:
  - Tool catalog: all 8 MCP tools, ~60+ actions, and their parameters (sourced from preflight registry)
  - Agent definitions: all agent markdown files from `agents/` directory
  - Instruction files: all instruction files from `.github/instructions/`
  - Skill definitions: all skill files from `.github/skills/`
- [x] **5.2** Create a seed script (`seed-db.ts`) that can be run from the command line: `npx tsx server/src/db/seed.ts`
- [ ] **5.3** Create test fixtures: `server/src/db/__tests__/fixtures.ts` with factory functions for creating test workspaces, plans, phases, steps, sessions.
- [ ] **5.4** Write unit tests for the connection manager: open/close, WAL mode verification, foreign key enforcement.
- [ ] **5.5** Write unit tests for the migration runner: apply migrations in order, skip already-applied, handle rollback on error.
- [ ] **5.6** Write unit tests for each data access module (workspace-db, plan-db, step-db, etc.): CRUD operations, constraint enforcement, cascade deletes.
- [ ] **5.7** Write integration test for the archival procedure: create a plan with phases, steps, sessions, context → archive → verify rows moved to archive tables and removed from active tables.
- [ ] **5.8** Write integration test for the "mark current done and get next" atomic operation: verify transaction atomicity, concurrent call safety.

## Phase 6: Build & Verify

- [x] **6.1** `npm run build` in `server/` — fix all TypeScript compilation errors.
- [ ] **6.2** `npx vitest run` in `server/` — all new DB tests pass.
- [ ] **6.3** Verify the DB file is created correctly: open with `sqlite3 CLI`, inspect tables, run sample queries.
- [ ] **6.4** Verify WAL mode is active: `PRAGMA journal_mode` returns `wal`.
- [ ] **6.5** Verify foreign key enforcement: attempt to insert a step with a non-existent phase_id, confirm it fails.
- [ ] **6.6** Load test: insert 50 workspaces × 10 plans × 5 phases × 20 steps each (50,000 steps). Verify query performance stays under 50ms for common lookups.

---

## References

### New Files

| Path | Purpose |
|------|---------|
| `server/src/db/connection.ts` | SQLite connection manager (WAL, FK, singleton) |
| `server/src/db/migration-runner.ts` | Schema migration runner |
| `server/src/db/query-helpers.ts` | Generic typed query helpers |
| `server/src/db/workspace-db.ts` | Workspace CRUD |
| `server/src/db/plan-db.ts` | Plan CRUD + archival |
| `server/src/db/phase-db.ts` | Phase CRUD + reordering |
| `server/src/db/step-db.ts` | Step CRUD + atomic "next" operation |
| `server/src/db/session-db.ts` | Session CRUD |
| `server/src/db/lineage-db.ts` | Handoff lineage |
| `server/src/db/context-db.ts` | Polymorphic context + search |
| `server/src/db/research-db.ts` | Research documents |
| `server/src/db/knowledge-db.ts` | Knowledge files |
| `server/src/db/build-script-db.ts` | Build scripts |
| `server/src/db/dependency-db.ts` | DAG dependencies |
| `server/src/db/tool-catalog-db.ts` | Tool/action/param catalog |
| `server/src/db/agent-definition-db.ts` | Agent file storage |
| `server/src/db/instruction-db.ts` | Instruction file storage |
| `server/src/db/skill-db.ts` | Skill storage with matching |
| `server/src/db/update-log-db.ts` | Audit log |
| `server/src/db/event-log-db.ts` | Event log |
| `server/src/db/program-db.ts` | Programs |
| `server/src/db/types.ts` | Row type definitions |
| `server/src/db/mappers.ts` | Row ↔ domain type converters |
| `server/src/db/seed.ts` | Tool catalog + agent/skill seeding |
| `server/src/db/index.ts` | Barrel export |
| `server/src/db/migrations/001-initial-schema.sql` | DDL for all tables |

### Existing Storage Files (to be replaced in Plan 5)

| Path | Purpose | Replacement |
|------|---------|-------------|
| `server/src/storage/file-store.ts` | Main disk I/O (50+ exports) | `db/*.ts` modules |
| `server/src/storage/file-lock.ts` | Cross-process file locking | WAL mode (no locks needed) |
| `server/src/storage/workspace-registry.ts` | Path→ID mapping | `workspaces` table |
| `server/src/storage/projectmemory-paths.ts` | `.projectmemory/` path helpers | DB queries (no paths needed) |
| `server/src/storage/workspace-utils.ts` | Canonical ID generation | DB lookup by path |
| `server/src/storage/workspace-identity.ts` | Identity resolution (1600 lines) | `workspaces` table + `identity.json` reader |
| `server/src/storage/workspace-hierarchy.ts` | Parent/child overlap detection | `workspaces` table with `parent_workspace_id` |
| `server/src/storage/workspace-mounts.ts` | Container path translation | Stays (container support still needed) |
| `server/src/storage/remote-file-proxy.ts` | Cross-host file proxy | Stays (remote support still needed) |
| `server/src/storage/build-script-utils.ts` | Build script lookup | `build_scripts` table |
| `server/src/storage/program-store.ts` | Program disk I/O | `program-db.ts` |

### Design Notes

- **"Next step" atomic operation**: `markCurrentDoneAndGetNext(planId, agentType)` uses a SQLite transaction to mark the current active step as done (with timestamp and agent attribution) and return the next pending step in phase order. This eliminates the race condition where two agents could mark the same step active.
- **Tool catalog queryable by agents**: Agents call `memory_context(action: "search", query: "memory_plan create")` to discover available actions and parameters. The tool catalog tables are seeded on DB initialization and re-seeded on server startup if the catalog version changes.
- **Polymorphic context search**: The `searchContext` function does a `LIKE` search on the JSON content column. For frequent full-text queries, a future enhancement can add FTS5 virtual tables.
- **Phase extraction from existing data**: During migration (Plan 4), phases are extracted from the `phase` string field on each step. Steps with identical `phase` strings are grouped into the same phase row, preserving the original grouping.
