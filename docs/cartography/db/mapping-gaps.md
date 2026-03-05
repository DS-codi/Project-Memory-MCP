# Mapping Gaps

> **Cartography artifact — Step 13 of Database Cartography plan**
> Identifies unmapped DB objects and unmapped query surfaces, with
> gap classification, impact rating, and prioritized remediation candidates.

---

## Summary

| Gap ID | Category | Severity | Impact |
|--------|----------|----------|--------|
| G-01 | Cartography Python core not implemented | CRITICAL | Full automated cartography pipeline is blocked |
| G-02 | Archive table read path absent | LOW | Archive data is write-only from TS tool layer |
| G-03 | Partial CRUD — audit/log tables | LOW | Intentional (immutable audit trail design) |
| G-04 | Tool catalog not populated at runtime | MEDIUM | `tool_catalog`, `tool_actions`, `tool_action_params` may be empty |
| G-05 | Domain type ↔ DB column field-name deltas | LOW | Mapper errors would be caught at compile time; no runtime risk |
| G-06 | `workspace_instruction_assignments` and `workspace_skill_assignments` write path | LOW | Assignment tables may only be writable via one code path |
| G-07 | `databaseMapper.ts` types are unfilled stubs | MEDIUM | Contract types exist but no runtime deserialization path is wired |

---

## G-01: Cartography Python Core Not Implemented

**Severity:** CRITICAL  
**Category:** Adapter Stack — Python subprocess bridge

### Description

The `memory_cartographer` Python subprocess integration (the automated DB cartography pipeline) is **entirely unimplemented**. Three files form the stub chain:

| File | Location | Stub Behavior |
|------|----------|---------------|
| `pythonBridge.ts` | `server/src/cartography/runtime/` | `invokePythonCore()` always throws `"invokePythonCore() not yet implemented"` |
| `pythonCoreAdapter.ts` | `server/src/cartography/adapters/` | `probeCapabilities()` and `invoke()` both throw `"not yet implemented"` |
| `databaseMapper.ts` | `server/src/cartography/mappers/` | TypeScript type stubs only — no deserialization logic implemented |

### Intended architecture (not yet functional)

```
MCP Tool Call
    │
    ▼
PythonCoreAdapter.invoke()
    │ uses
    ▼
pythonBridge.invokePythonCore()
    │ spawns
    ▼
python -m memory_cartographer.runtime.entrypoint
    │ produces NDJSON
    ▼
PythonBridgeResponse → databaseMapper.ts deserializes
    │
    ▼
DatabaseCartographySection (data used by MCP tools)
```

### Why it matters

- All MCP cartography tools that would rely on `PythonCoreAdapter.invoke()` are blocked.
- The Python subprocess package `memory_cartographer` does not exist in this workspace.
- The `PythonBridgeRequest` / `PythonBridgeResponse` NDJSON wire protocol is documented but has no implementation.

### Remediation

| Priority | Action |
|----------|--------|
| High | Implement `invokePythonCore()` subprocess spawn (Node.js `child_process.spawn`) |
| High | Create `memory_cartographer` Python package with `runtime.entrypoint` module |
| Medium | Implement `PythonCoreAdapter.probeCapabilities()` and `invoke()` |
| Medium | Implement `databaseMapper.ts` deserialization of `DatabaseCartographySection` |

---

## G-02: Archive Table Read Path Absent

**Severity:** LOW  
**Category:** Schema surface — missing read API

### Description

Five archive tables are populated by archival operations but have **no dedicated read path** in the TS tool layer:

| Archive Table | Populated By | Read API |
|---------------|-------------|---------|
| `plans_archive` | `deletePlan()` in `plan-db.ts` | ❌ None |
| `phases_archive` | `deletePlan()` in `plan-db.ts` | ❌ None |
| `steps_archive` | `deletePlan()` in `plan-db.ts` | ❌ None |
| `sessions_archive` | `deletePlan()` in `plan-db.ts` | ❌ None |
| `lineage_archive` | `deletePlan()` in `plan-db.ts` | ❌ None |

### Impact

Archived plan data cannot be retrieved through any MCP tool. Recovery of archived items requires direct DB access.

### Remediation

Add `getArchivedPlan(id)` and `listArchivedPlans(wsId)` query functions to `plan-db.ts` if archive retrieval is needed by any workflow.

---

## G-03: Partial CRUD — Audit and Log Tables

**Severity:** LOW  
**Category:** Intentional design — immutable audit records

### Description

Several tables support INSERT + SELECT only. No UPDATE or DELETE operations exist for them.

| Table | Missing Operations | Design Rationale |
|-------|--------------------|-----------------|
| `workspace_update_logs` | UPDATE, DELETE | Immutable event log; only append + read |
| `lineage` | UPDATE, DELETE | Immutable handoff audit record |
| `lineage_archive` | UPDATE, DELETE | Immutable archive copy |
| `agent_event_logs` | UPDATE, DELETE | Immutable event stream |
| `step_file_edits` | UPDATE, DELETE | Immutable edit audit trail |
| `_migrations` | UPDATE, DELETE | Owned by migration runner only — DDL not exposed |

### Impact

Low. This is an intentional immutability boundary. No remediation needed unless a retention/pruning policy is required.

---

## G-04: Tool Catalog Not Dynamically Populated

**Severity:** MEDIUM  
**Category:** Schema usage gap

### Description

The `tool_catalog`, `tool_actions`, and `tool_action_params` tables exist in the schema and have full CRUD repository functions in `tool-catalog-db.ts`. However:

- No MCP tool registration path has been found that automatically populates these tables from the live MCP handler definitions.
- These tables may be empty or contain only seed data.
- `seed.ts` exists in `server/src/db/` but its contents and usage context are not confirmed.

### Impact

If the tool catalog is unpopulated, any features that query `getToolHelp()` or `listTools()` will return empty results.

### Remediation

| Priority | Action |
|----------|--------|
| Medium | Verify whether `seed.ts` populates the tool catalog on server start |
| Medium | If empty, implement tool auto-registration from the MCP handler manifest |
| Low | Add integration test verifying tool catalog is non-empty after server startup |

---

## G-05: Domain Type ↔ DB Column Field-Name Deltas

**Severity:** LOW  
**Category:** Mapper translation layer

### Description

`server/src/db/mappers.ts` converts between SQLite row types (from `types.ts`) and domain model types (from `types/plan.types.ts`, `types/workspace.types.ts`, `types/agent.types.ts`). Several field names differ between layers:

| Domain Field | DB Column | Direction | Mapper File |
|-------------|-----------|-----------|-------------|
| `AgentSession.session_id` | `sessions.id` | DB row → domain | `rowToSession()` |
| `WorkspaceMeta.workspace_id` | `workspaces.id` | DB row → domain | `rowToWorkspaceMeta()` |
| `WorkspaceMeta.last_accessed` | `workspaces.updated_at` | DB row → domain | `rowToWorkspaceMeta()` |
| `PlanStep.index` | `steps.order_index` | DB row → domain | `rowToStep()` |
| `WorkspaceMeta.active_plans` | *(not a column — computed separately)* | Populated by caller | `rowToWorkspaceMeta()` |
| `WorkspaceMeta.archived_plans` | *(not a column — computed separately)* | Populated by caller | `rowToWorkspaceMeta()` |
| `WorkspaceMeta.child_workspace_ids` | *(not a column — computed separately)* | Populated by caller | `rowToWorkspaceMeta()` |
| `WorkspaceMeta.hierarchy_linked_at` | `workspaces.meta` (JSON blob) | Extracted from JSON | `rowToWorkspaceMeta()` |

### Impact

Low. These deltas are correctly handled by the mapper layer. There is no runtime risk as long as callers use the mapper functions instead of accessing DB rows directly.

### Note

All of the above deltas are compile-time enforced via TypeScript types. Any incorrect field access would be a type error.

---

## G-06: `workspace_instruction_assignments` / `workspace_skill_assignments` Write Path

**Severity:** LOW  
**Category:** Schema surface — potential single-path writes

### Description

`workspace_instruction_assignments` and `workspace_skill_assignments` are produced by `assign_instruction` and `assign_skill` agent actions respectively. The write path runs through:
- `consolidated/memory_agent.ts` → `instruction-deployment-db.ts` or `skill-deployment-db.ts`

However, these tables are **separate from** the deployment tracking tables (`instruction_deployments`, `skill_deployments`). The assignment tables record *which* instructions/skills are assigned to a workspace (the registry), while the deployment tables record *how* they were physically deployed.

### Impact

If only one code path populates these assignment tables, removal or refactoring of that path could silently break assignment tracking without schema-level enforcement.

### Remediation

Low priority. Verify that `instruction-deployment-db.ts` and `skill-deployment-db.ts` consistently write both the `_assignments` and `_deployments` rows in the same transaction.

---

## G-07: `databaseMapper.ts` Contract Types Are Unfilled Stubs

**Severity:** MEDIUM  
**Category:** Cartography contract — type definitions without runtime

### Description

`server/src/cartography/mappers/databaseMapper.ts` defines a rich set of TypeScript interfaces (`DataSource`, `Table`, `Column`, `Constraint`, `Relation`, `QueryTouchpoint`, `MigrationLineage`, `DatabaseCartographySection`) that represent the expected output of the Python cartography core.

These types mirror a JSON schema at `docs/contracts/sections/database-cartography.schema.json` but no deserialization logic connects them to actual data at runtime.

### Gap Details

| Contract Type | Purpose | Runtime Status |
|--------------|---------|---------------|
| `DataSource` | Database connection discovered in workspace | ❌ Never produced (Python core absent) |
| `Table` | Table/view in scanned datasource | ❌ Never produced |
| `Column` | Column within a table | ❌ Never produced |
| `Constraint` | PK/unique/check/not-null constraint | ❌ Never produced |
| `Relation` | FK or logical relation between tables | ❌ Never produced |
| `QueryTouchpoint` | Code location that issues a query | ❌ Never produced |
| `MigrationLineage` | Migration file discovery results | ❌ Never produced |
| `DatabaseCartographySection` | Top-level section envelope | ❌ Never produced |

### Relationship to G-01

G-07 is a consequence of G-01 — the contract types are the *destination* for data that the Python core would produce. Fixing G-01 unblocks G-07.

### What This Cartography Plan Provides Instead

The 12 Markdown/JSON artifact files produced by this Database Cartography plan (steps 6-15) serve as **manual cartography output** covering the same data that `DatabaseCartographySection` would contain:
- `graph-adjacency-matrix.json` — equivalent to `Relation[]` array
- `schema-drift-report.md` — equivalent to `Table[]` + `Column[]` analysis
- `migration-registry.md` + `migration-object-timeline.md` — equivalent to `MigrationLineage`
- `code-db-touchpoints.md` + `symbol-to-db-map.md` — equivalent to `QueryTouchpoint[]`

---

## Prioritized Remediation Summary

| Priority | Gap | Action |
|----------|-----|--------|
| ⬛ CRITICAL | G-01 | Implement `invokePythonCore()` subprocess spawn; create Python package |
| 🟧 MEDIUM | G-04 | Verify tool catalog population on server start |
| 🟧 MEDIUM | G-07 | Implement `databaseMapper.ts` deserialization once Python core produces output |
| 🟨 LOW | G-02 | Add `getArchivedPlan()` read functions if archive retrieval is required |
| 🟦 NONE | G-03 | Intentional immutable design — no action needed |
| 🟦 NONE | G-05 | Compile-time safe — mapper layer handles all deltas correctly |
| 🟦 LOW | G-06 | Verify transaction boundaries for assignment + deployment writes |

---

*Generated by Database Cartography Executor agent — plan plan_mm9b56x6_551d976d*
