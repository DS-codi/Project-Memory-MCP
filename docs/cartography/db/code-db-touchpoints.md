# Code-to-DB Touchpoints

> **Cartography artifact — Step 11 of Database Cartography plan**
> Maps every file in `server/src/db/` to its database objects and documents the full call
> chain from MCP tool handler → domain repository → query helper → SQLite connection.

---

## 1. DB Layer Architecture Overview

```
MCP Tool Handlers  (server/src/tools/**)
       │
       ▼
Domain Repositories  (server/src/db/*-db.ts)
       │  import from
       ▼
Query Helpers  (server/src/db/query-helpers.ts)
       │  call
       ▼
SQLite Singleton  (server/src/db/connection.ts → getDb())
       │  uses
       ▼
better-sqlite3  →  project-memory.db  (WAL mode, FK enforced)
```

### Infrastructure Files (non-domain)

| File | Role |
|------|------|
| `connection.ts` | Singleton `getDb()` — opens DB, sets WAL / FK / busy_timeout |
| `query-helpers.ts` | Generic wrappers: `queryOne<T>`, `queryAll<T>`, `run`, `transaction<T>`, `newId`, `nowIso` |
| `migration-runner.ts` | `runMigrations()` / `migrationStatus()` — executes `migrations/*.sql` in order |
| `index.ts` | Barrel export — re-exports all domain functions + infrastructure |
| `types.ts` | Row-level TypeScript interfaces for all 41 tables |
| `mappers.ts` | Utility mapping functions (Python↔TS field transformations, partial-object builders) |
| `seed.ts` | Development-only seed data execution |
| `reproducibility-package.ts` | Reproducibility-package assembly utility |

---

## 2. Domain Repository Touchpoints

Each `*-db.ts` file owns CRUD for one or more related tables.  
**Access pattern for all domain files:** import `{ queryOne, queryAll, run, transaction, newId, nowIso }` from `./query-helpers.js`.  
**Connection pattern:** indirect — only `query-helpers.ts` calls `getDb()`; domain files never import `connection.ts` directly.

### 2.1 Workspace Domain

| File | Primary Table(s) | Operations |
|------|-----------------|------------|
| `workspace-db.ts` | `workspaces` | C: `createWorkspace` — INSERT; R: `getWorkspace`, `getWorkspaceByPath`, `listWorkspaces` — SELECT; U: `updateWorkspace` — UPDATE; D: none direct |
| `workspace-session-registry-db.ts` | `workspace_session_registry` | C: upsert INSERT/UPDATE; R: `getSessionRegistry`; U: `updateSessionRegistry`; D: `deleteSessionRegistry` |
| `update-log-db.ts` | `workspace_update_logs` | C: `appendUpdateLog` — INSERT; R: `getUpdateLogs` — SELECT with LIMIT |

### 2.2 Plan Domain

| File | Primary Table(s) | Operations |
|------|-----------------|------------|
| `plan-db.ts` | `plans` | C: `createPlan`; R: `getPlan`, `listPlans`, `assemblePlanState`; U: `updatePlan`, `updatePlanCategory`; D: `deletePlan`; special: `confirmPhase`, `confirmStep` |
| `phase-db.ts` | `phases` | C: `createPhase`; R: `getPhasesForPlan`; U: `updatePhase`; D: `deletePhase` |
| `step-db.ts` | `steps` | C: `createStep`; R: `getStep`, `getStepsForPlan`; U: `updateStep`; D: `deleteStep` |
| `plan-note-db.ts` | `plan_notes` | C: `createPlanNote`; R: `getPlanNotesForPlan`; D: `deletePlanNote` |
| `build-script-db.ts` | `build_scripts` | C: `createBuildScript`; R: `getBuildScript`, `listBuildScripts`; U: `updateBuildScript`; D: `deleteBuildScript` |
| `dependency-db.ts` | `dependencies` | C: `addStepDependency`; R: `getStepDependencies`, `getDependents`; D: `removeStepDependency` |
| `lineage-db.ts` | `lineage` | C: `recordHandoff`; R: `getLineageForPlan` |
| `session-db.ts` | `sessions` | C: `createSession`; R: `getSession`, `getSessions`, `getOrphanedSessions`; U: `completeSession`, `markSessionOrphaned`; D: `deleteSession` |
| `category-workflow-db.ts` | `category_workflows` | C: `createCategoryWorkflow`; R: `getCategoryWorkflow`, `listCategoryWorkflows`; U: `updateCategoryWorkflow`; D: `deleteCategoryWorkflow` |

### 2.3 Context & Research Domain

| File | Primary Table(s) | Operations |
|------|-----------------|------------|
| `context-db.ts` | `context_items` | C/U: `storeContext` — UPSERT pattern (SELECT + INSERT/UPDATE); R: `getContext`, `getContextItem`; D: `deleteContext`, `pruneContextLogs` |
| `research-db.ts` | `research_documents` | C: `appendResearch`, `appendPlanResearch`; R: `getResearch`, `getResearchByWorkspace`; D: `deleteResearch` |
| `knowledge-db.ts` | `knowledge_items` | C: `createKnowledge`; R: `getKnowledge`, `listKnowledge`; U: `updateKnowledge`; D: `deleteKnowledge` |

### 2.4 Program Domain

| File | Primary Table(s) | Operations |
|------|-----------------|------------|
| `program-db.ts` | `programs` | C: `createProgram`; R: `getProgram`, `listPrograms`; U: `updateProgram`; D: `deleteProgram` |
| `program-risks-db.ts` | `program_risks` | C: `createProgramRisk`; R: `getProgramRisks`; U: `updateProgramRisk`; D: `deleteProgramRisk` |
| `program-workspace-links-db.ts` | `program_workspace_links`, `program_plan_links` | C: `linkWorkspace`, `linkPlan`; R: `getLinkedWorkspaces`, `getProgramsLinkedToWorkspace`, `getLinkedPlans`; D: `unlinkWorkspace`, `unlinkPlan` |

### 2.5 Agent & Deployment Domain

| File | Primary Table(s) | Operations |
|------|-----------------|------------|
| `agent-definition-db.ts` | `agent_definitions` | C: `createAgentDefinition`; R: `getAgentDefinition`, `listAgentDefinitions`; U: `updateAgentDefinition`; D: `deleteAgentDefinition` |
| `deployable-agent-profile-db.ts` | `deployable_agent_profiles` | C: `createDeployableAgentProfile`; R: `getDeployableAgentProfile`, `listDeployableAgentProfiles`; U: `updateDeployableAgentProfile`; D: `deleteDeployableAgentProfile` |
| `agent-deployment-db.ts` | `agent_deployments` | C: `recordAgentDeployment`; R: `getAgentDeployment`, `getAgentDeploymentsByWorkspace`; D: `deleteAgentDeployment` |
| `skill-db.ts` | `skills` | C: `createSkill`; R: `getSkill`, `getSkillByName`, `listSkills`; U: `updateSkill`; D: `deleteSkill` |
| `skill-deployment-db.ts` | `skill_deployments` | C: `recordSkillDeployment`; R: `getSkillDeployment`, `getSkillDeploymentsByWorkspace`; D: `deleteSkillDeployment` |
| `instruction-db.ts` | `instructions` | C: `createInstruction`; R: `getInstruction`, `getInstructionByFilename`, `listInstructions`; U: `updateInstruction`; D: `deleteInstruction` |
| `instruction-deployment-db.ts` | `instruction_deployments` | C: `recordInstructionDeployment`; R: `getInstructionDeployment`, `getInstructionDeploymentsByWorkspace`; D: `deleteInstructionDeployment` |

### 2.6 Tool Catalog Domain

| File | Primary Table(s) | Operations |
|------|-----------------|------------|
| `tool-catalog-db.ts` | `tool_catalog`, `tool_actions`, `tool_action_params` | C: `upsertTool`, `upsertToolAction`, `upsertToolParam`; R: `getTool`, `getToolHelp`, `listTools`; D: `deleteTool` |

### 2.7 File Tracking & Events Domain

| File | Primary Table(s) | Operations |
|------|-----------------|------------|
| `file-edits-db.ts` | `step_file_edits` | C: `recordFileEdit`; R: `getPlanFileEdits`, `getStepFileEdits` |
| `event-log-db.ts` | `agent_event_logs` | C: `logEvent`; R: `getRecentEvents`, `getEventsBySession` |
| `gui-routing-contracts-db.ts` | `gui_routing_contracts` | C: `createRoutingContract`; R: `getRoutingContract`, `getPendingContracts`; U: `resolveContract`; D: `deleteContract` |

---

## 3. Tool-to-DB Access Map

MCP tool handlers access the DB **exclusively** through domain repository functions.  
No tool file uses `getDb()` or raw `better-sqlite3` directly.

| Tool Handler File | Domain DB Functions Called |
|-------------------|---------------------------|
| `workspace.tools.ts` | workspace-db, program-workspace-links-db, update-log-db |
| `context.tools.ts` | context-db, research-db, knowledge-db |
| `context-pull.tools.ts` | context-db |
| `context-search.tools.ts` | context-db, knowledge-db, research-db |
| `knowledge.tools.ts` | knowledge-db |
| `workspace-context.tools.ts` | context-db, workspace-db |
| `handoff.tools.ts` | lineage-db, session-db, plan-db |
| `session-live-store.ts` | session-db |
| `terminal.tools.ts` | workspace-db (for auth lookups) |
| `filesystem.tools.ts` | file-edits-db |
| `skills.tools.ts` | skill-db, skill-deployment-db, deployable-agent-profile-db |
| `agent.tools.ts` | agent-definition-db, agent-deployment-db, session-db, lineage-db, plan-db |
| `agent-validation.tools.ts` | agent-definition-db, deployable-agent-profile-db |
| `agent-deploy.ts` | skill-deployment-db, instruction-deployment-db, deployable-agent-profile-db |
| `agent-materialise.ts` | agent-definition-db, deployable-agent-profile-db |
| **`plan/` sub-module** | |
| `plan/plan-lifecycle.ts` | plan-db, phase-db, step-db, session-db, workspace-db |
| `plan/plan-steps.ts` | step-db, plan-db |
| `plan/plan-step-mutations.ts` | step-db |
| `plan/plan-step-ordering.ts` | step-db |
| `plan/plan-goals.ts` | plan-db |
| `plan/plan-confirmation.ts` | plan-db |
| `plan/plan-programs.ts` | program-db, program-workspace-links-db |
| `plan/plan-templates.ts` | plan-db, phase-db, step-db |
| `plan/plan-utils.ts` | plan-db (utility helpers — no direct DB access) |
| `plan/plan-version.ts` | plan-db |
| **`consolidated/` sub-module** | |
| `consolidated/memory_plan.ts` | Aggregates all `plan/` sub-module functions |
| `consolidated/memory_workspace.ts` | workspace-db, program-workspace-links-db, update-log-db |
| `consolidated/memory_context.ts` | context-db, research-db, knowledge-db |
| `consolidated/memory_steps.ts` | step-db, plan-db |
| `consolidated/memory_agent.ts` | agent-definition-db, deployable-agent-profile-db, session-db, lineage-db |
| `consolidated/memory_session.ts` | session-db, plan-db, context-db |
| **`orchestration/` sub-module** | |
| (various orchestration files) | plan-db, step-db, context-db, session-db |
| **`program/` sub-module** | |
| (various program files) | program-db, program-risks-db, program-workspace-links-db |

---

## 4. Adapter Stack

Three stub files represent the Python integration layer. All are **non-functional stubs** at time of cartography.

| File | Stub Behavior | DB Impact |
|------|--------------|-----------|
| `server/src/pythonBridge.ts` | `invokePythonCore()` always throws `"Python core not available"` | No DB read/write (blocked at call time) |
| `server/src/pythonCoreAdapter.ts` | All methods throw or return empty | No DB read/write |
| `server/src/databaseMapper.ts` | `mapToDatabase()` returns `{}` for all inputs | Field mapping silently fails; Python-to-DB path writes nothing |

**Field-name deltas** (7 identified): Python-side names that differ from TS column names (e.g., `agent_type` vs `agentType`, `created_at` vs `createdAt`, etc.). Fully documented in mapping-gaps.md.

---

## 5. DB Connection Lifecycle

| Phase | What Happens |
|-------|-------------|
| Server start | `getDb()` called once — creates data dir if absent, opens SQLite file, sets PRAGMAs |
| Request handling | All tool handlers call repository functions; `getDb()` returns cached singleton |
| Migration run | `runMigrations()` called on server start — iterates `migrations/*.sql` alphabetically |
| Test isolation | `PM_DATA_ROOT` env var overrides DB path; `_resetConnectionForTesting()` clears singleton |
| Server shutdown | `closeDb()` — closes `better-sqlite3` handle |

---

## 6. Access Pattern Summary

| Pattern | Frequency | Example |
|---------|-----------|---------|
| `queryOne<T>(sql, params)` | ~70% of reads | Fetch single workspace, plan, session by ID |
| `queryAll<T>(sql, params)` | ~25% of reads | List all plans, get all steps for a plan |
| `run(sql, params)` | ~90% of writes | INSERT, UPDATE, DELETE for all domain tables |
| `transaction<T>(fn)` | Plan lifecycle, batch mutations | createPlan + createPhases + createSteps atomically |
| Direct `getDb()` | Migration runner only | Execute SQL files during startup |
| `newId()` | Every INSERT | Generate 16-char hex primary keys |
| `nowIso()` | Every INSERT/UPDATE with timestamps | Produce ISO-8601 UTC datetime string |

---

## 7. Entry Points Matrix

| Import Path | Use Case |
|-------------|---------|
| `from '../db/index.js'` | All tool handlers — single import for any DB function |
| `from '../db/query-helpers.js'` | Domain `*-db.ts` files only |
| `from '../db/connection.js'` | Migration runner only (direct DB access) |
| `from '../db/types.js'` | Row type imports only |

---

*Generated by Database Cartography Executor agent — plan plan_mm9b56x6_551d976d*
