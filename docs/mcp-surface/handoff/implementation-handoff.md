# Implementation-Ready Handoff Package

**Plan:** MCP Surface Integration: expose memory_cartographer actions/resources via consolidated tools  
**Phase:** Handoff  
**Step:** 15 — Implementation-Ready Handoff Package  
**Status:** Final deliverable — ready for Reviewer verification then Executor implementation

---

## Overview

This document packages everything an Executor needs to implement `memory_cartographer` in the correct sequence, and everything a Reviewer needs to verify that all plan deliverables are complete and consistent before the implementation plan begins.

---

## PART 1: FOR EXECUTOR — Implementation Guide

### 1.1 Prerequisite Read List

Before writing a single line of code, read these documents in order:

1. [Action inventory (all 17 actions)](../memory-cartographer-action-inventory.md)
2. [Tool routing architecture (wiring + call chain)](../architecture/tool-routing-architecture.md)
3. [Auth & session architecture (authorization, injection guard)](../architecture/auth-session-architecture.md)
4. [Design matrices](../design/) — all 4 files for dispatch pseudocode
5. TypeScript type files:
   - `server/src/cartography/contracts/dependency-types.ts`
   - `server/src/cartography/contracts/slice-types.ts`
   - `server/src/cartography/contracts/db-map-types.ts`

### 1.2 Six-File Registration — Exact Sequence

Implement in this order to avoid import cycles:

```
Step 1:  server/src/tools/preflight/action-params-cartography.ts     [NEW]
         → Declare CartographyActionParamSpec for all 17 actions
         → No imports from memory_cartographer.ts required
         → Test: TypeScript compiles; ACTION_PARAM_SPEC keys match action names

Step 2:  server/src/tools/preflight/action-param-registry.ts         [MODIFY]
         → Import action-params-cartography.ts
         → Add: ACTION_PARAM_SPECS['memory_cartographer'] = cartographyParamSpec
         → Test: registry exports updated spec for 'memory_cartographer'

Step 3:  server/src/tools/preflight/tool-action-mappings.ts          [MODIFY]
         → Add memory_cartographer action→agent-type mapping entries
         → Authorized agents: Researcher, Architect, Coordinator, Analyst, Executor
         → Test: mapping keys cover all 17 actions

Step 4:  server/src/tools/consolidated/memory_cartographer.ts        [NEW]
         → Implement handleMemoryCartographer()
         → switch(action): 4 domain families → domain handlers
         → Domain handlers call: DependencyDbService, DbMapService, PythonCoreAdapter
         → All 3 validation layers (null guards, preflight, case-level)
         → Session propagation (_session_id threading)
         → Test: each action dispatches to correct handler; error propagation correct

Step 5:  server/src/tools/consolidated/index.ts                      [MODIFY]
         → Add: export { handleMemoryCartographer } from './memory_cartographer'
         → Test: export visible from consolidated namespace

Step 6:  server/src/index.ts                                         [MODIFY]
         → Import handleMemoryCartographer
         → Add: server.tool('memory_cartographer', zodMemoryCartographerSchema, handleMemoryCartographer)
         → Zod schema covers: action (enum of 17), params (object), _session_id (string, optional)
         → Test: server.tool registered; server starts without error
```

### 1.3 Domain Handler Implementation Guide

#### cartography_queries + architecture_slices

Both delegate to `PythonCoreAdapter`. 

Reference: `server/src/cartography/adapters/python-bridge.ts` for existing bridge pattern.

```typescript
// Pattern for Python-delegated domains:
async function handleCartographyQuery(action: string, params: CartographyQueryParams) {
  const adapter = new PythonCoreAdapter();
  const envelope = await adapter.invoke('cartograph', { action, ...params });
  // map envelope.code_cartography | envelope.architecture | ... to typed response
  return mapEnvelopeToResponse(action, envelope);
}
```

**Known constraint:** Python core `cartograph` action returns `TODO` error. The TypeScript implementation can be structured correctly and tested with mocked bridge responses. End-to-end tests will not pass until Python core is implemented (separate plan).

#### dependencies_dependents

Pure SQLite — no Python bridge. Uses `better-sqlite3` with parameterized queries.

```typescript
// Pattern for SQLite-backed domains:
async function handleDependencies(action: string, params: DependencyParams) {
  const db = getReadonlyDb();
  switch (action) {
    case 'get_dependencies':
      const rows = db.prepare(
        'SELECT p.id, p.title FROM plans p JOIN plan_dependencies pd ON pd.depends_on_plan_id = p.id WHERE pd.plan_id = ?'
      ).all(params.plan_id);
      // build DependencyNode[], DependencyEdge[] from rows
  }
}
```

Cycle detection: implement DFS in TypeScript (not SQL). See `dependency-traversal-contract.md` for algorithm spec.

#### database_map_access

Pure SQLite targeting schema metadata — no Python bridge.

```typescript
// Pattern for DB map access:
function validateTableName(name: string): void {
  if (!ALLOWLISTED_TABLES.includes(name as any)) {
    throw new DiagnosticError('ACCESS_DENIED', `Table '${name}' is not in the allowlist`);
  }
}

function maskSensitiveColumns(table: string, columns: ColumnInfo[]): ColumnInfo[] {
  if (table === 'context_items') {
    return columns.filter(c => c.name !== 'context_data');
  }
  return columns;
}
```

### 1.4 Phase-by-Phase Build Order

To enable incremental testing:

**Phase A — SQLite domains first** (no Python required):
1. Complete Steps 1-3 (preflight wiring)
2. Implement `DependencyDbService` with `dependencies_dependents` actions
3. Implement `DbMapService` with `database_map_access` actions
4. Wire both in `memory_cartographer.ts` (Step 4, partial)
5. Run TC-DD-01 through TC-DD-12 + TC-DM-01 through TC-DM-12

**Phase B — Python bridge domains** (Python core required):
6. Implement `cartography_queries` handler with mocked bridge
7. Implement `architecture_slices` handler with mocked bridge
8. Run TC-CQ-01 through TC-CQ-15 + TC-AS-01 through TC-AS-12 (mocked)
9. Complete Steps 5-6 (export + registration)

**Phase C — Integration** (when Python core stubs are fully implemented):
10. Replace bridge mocks with real `PythonCoreAdapter` calls
11. Run full end-to-end test suite

### 1.5 Dispatch Pattern Reference

```typescript
// Canonical dispatch pattern (from memory_context.ts, adapted for cartographer)
export async function handleMemoryCartographer(
  input: MemoryCartographerInput,
  context: unknown
): Promise<MemoryCartographerResult> {
  const { action, params, _session_id } = input;

  // Layer 1: null guards
  if (!action) return { success: false, error: 'action is required' };
  if (!params) return { success: false, error: 'params is required' };

  // Layer 2: preflight
  const preflight = preflightValidate('memory_cartographer', action, params);
  if (!preflight.valid) {
    return {
      success: true,
      data: {
        action,
        data: null,
        diagnostics: [{ code: 'INVALID_PARAMS', severity: 'ERROR', message: preflight.error, recoverable: false }]
      }
    };
  }

  // Layer 3: dispatch
  const sessionCtx = _session_id ? { session_id: _session_id } : undefined;
  switch (true) {
    case action.startsWith('cartography_queries.'):
      return handleCartographyQuery(action, params, sessionCtx);
    case action.startsWith('dependencies_dependents.'):
      return handleDependencies(action, params, sessionCtx);
    case action.startsWith('architecture_slices.'):
      return handleArchitectureSlice(action, params, sessionCtx);
    case action.startsWith('database_map_access.'):
      return handleDbMapAccess(action, params, sessionCtx);
    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}
```

---

## PART 2: FOR REVIEWER — Contract Verification Checklist

### 2.1 Action Documentation Coverage

- [ ] Action inventory (`memory-cartographer-action-inventory.md`) documents all **17 actions** across 4 domain families
  - cartography_queries: `summary`, `file_context`, `flow_entry_points`, `layer_view`, `search` (5)
  - dependencies_dependents: `get_dependencies`, `get_dependents`, `get_dependency_graph`, `detect_cycles` (4)
  - architecture_slices: `get_slice`, `get_layer_summary`, `get_critical_path`, `get_cohesion_metrics` (4)
  - database_map_access: `list_tables`, `describe_table`, `query_schema_lineage`, `get_query_touchpoints` (4)
  - **Total: 17** ✓
- [ ] All 4 design matrices exist and cover their respective domain's 17 actions:
  - `cartography-action-matrix.md` (5 actions)
  - `dependency-action-matrix.md` (4 actions)
  - `architecture-slice-matrix.md` (4 actions)
  - `resource-uri-matrix.md` (19 URIs total — inline convention only)

### 2.2 Resource URI Convention

- [ ] `memory-cartographer-resource-uris.md` documents **19 URI patterns**
- [ ] Document confirms these are **inline payload return conventions only** — NOT true MCP `server.resource()` registrations
- [ ] No `server.resource()` calls exist in `server/src/` (verify with grep)
  ```
  grep -r "server\.resource" server/src/
  ```
  Expected result: **zero matches**

### 2.3 TypeScript Type Files

All 3 contract files must compile without errors:

- [ ] `server/src/cartography/contracts/dependency-types.ts` compiles — exports `DependencyNode`, `DependencyEdge`, `DependencyGraph`
- [ ] `server/src/cartography/contracts/slice-types.ts` compiles — exports `SliceResult`, `CohesionMetrics`, `LayerSummary`
- [ ] `server/src/cartography/contracts/db-map-types.ts` compiles — exports `TableListResult`, `TableDescription`, `SchemaLineageResult`, `QueryTouchpoints`

Verify:
```
npx tsc --noEmit server/src/cartography/contracts/dependency-types.ts
npx tsc --noEmit server/src/cartography/contracts/slice-types.ts
npx tsc --noEmit server/src/cartography/contracts/db-map-types.ts
```

### 2.4 Design Matrices Consistency

- [ ] Action names in design matrices match action inventory **exactly** (no renamed actions, no missing actions)
- [ ] Dispatch pseudocode in matrices is consistent with routing architecture in `tool-routing-architecture.md`
- [ ] Preflight param spec in matrices matches what will be declared in `action-params-cartography.ts` (to be verified post-implementation)

### 2.5 Architecture Documents

- [ ] `tool-routing-architecture.md` exists and covers all 4 domain families
- [ ] `auth-session-architecture.md` exists and covers authorization model, injection guard, stop directives, `_session_id` threading
- [ ] `observability-architecture.md` exists and covers per-invocation metrics, DiagnosticCode severity mapping, coverage metrics, pre-build check clause

### 2.6 Validation Test Plans

- [ ] `cartography-query-test-plan.md` has **15 + 12 = 27 test cases** (cartography_queries plus dependencies)
- [ ] `slice-dbmap-test-plan.md` has **12 + 12 = 24 test cases** (architecture_slices plus DB map)
- [ ] Security test TC-DM-05 (`context_items.context_data` masking) is explicitly defined
- [ ] Each test case includes: action name, input, expected output fields, DiagnosticCode on error cases

### 2.7 No Unintended Server Changes

- [ ] No new `server.resource()` calls added to `server/src/index.ts`
- [ ] No existing server files modified (only new spec/type files created)
- [ ] TypeScript type files in `server/src/cartography/contracts/` are new files, not modifications to existing files

---

## PART 3: Plan Deliverables Summary

### Files Created (This Plan)

**Foundation + Research (Steps 1-2):**
- `docs/mcp-surface/memory-cartographer-action-inventory.md` — 17 actions across 4 domains
- `docs/mcp-surface/memory-cartographer-resource-uris.md` — 19 URI patterns (inline conventions)

**Planning / Contract Design (Steps 3-9):**
- `docs/mcp-surface/dependency-traversal-contract.md`
- `server/src/cartography/contracts/dependency-types.ts`
- `docs/mcp-surface/architecture-slice-contract.md`
- `server/src/cartography/contracts/slice-types.ts`
- `docs/mcp-surface/database-map-access-contract.md`
- `server/src/cartography/contracts/db-map-types.ts`
- `docs/mcp-surface/design/cartography-action-matrix.md`
- `docs/mcp-surface/design/dependency-action-matrix.md`
- `docs/mcp-surface/design/architecture-slice-matrix.md`
- `docs/mcp-surface/design/resource-uri-matrix.md`

**Architecture (Steps 10-12):**
- `docs/mcp-surface/architecture/tool-routing-architecture.md`
- `docs/mcp-surface/architecture/auth-session-architecture.md`
- `docs/mcp-surface/architecture/observability-architecture.md`

**Validation (Steps 13-14):**
- `docs/mcp-surface/validation/cartography-query-test-plan.md`
- `docs/mcp-surface/validation/slice-dbmap-test-plan.md`

**Handoff (Step 15):**
- `docs/mcp-surface/handoff/implementation-handoff.md` ← this file

**Total files created: 19** (15 doc files + 3 TypeScript type files + this handoff doc)

### Phases Confirmed

- [x] Foundation (Steps 1-2) — confirmed
- [x] Planning (Steps 3-5) — confirmed
- [x] Design (Steps 6-9) — confirmed
- [x] Architecture (Steps 10-12) — confirmed by Executor (2026-03-05)
- [x] Validation (Steps 13-14) — confirmed by Executor (2026-03-05)
- [x] Handoff (Step 15) — confirmed by Executor (2026-03-05)

### Key Decisions Made

| Decision | Rationale |
|---|---|
| **Inline URIs only — no MCP resources** | Server has no `server.resource()` infrastructure; all cartography:// URIs are inline payload conventions |
| **6-file registration pattern** | Matches existing consolidated tool pattern (memory_context.ts, memory_plan.ts) |
| **Read-only DB access enforced** | `better-sqlite3` opened in read-only mode; Python bridge cannot write |
| **ALLOWLISTED_TABLES** | 5 tables only: `plans`, `plan_dependencies`, `context_items`, `agent_sessions`, `workspace_meta` |
| **context_items.context_data masked** | Prevents sensitive plan data from leaking through DB map access |
| **3-layer validation** | null guards → preflightValidate → case-level (matches existing pattern) |
| **_session_id optional** | Backward compatible; absent session_id = no telemetry, still valid |
| **Agent type access** | Researcher, Architect, Coordinator, Analyst, Executor (5 types granted) |

---

## PART 4: Open Items & Known Constraints

### Python Core — Blocking for cartography_queries and architecture_slices

Both `cartography_queries` and `architecture_slices` domains depend on the Python core `cartograph` action being fully implemented. Current state:
- `python-core/memory_cartographer/runtime/entrypoint.py`: returns `TODO` error for `cartograph` intent
- `python-core/memory_cartographer/engines/code_cartography.py`: stub classes; no scanning logic
- `python-core/memory_cartographer/engines/database_cartography.py`: stub; no live queries

**Impact:** TypeScript implementation and preflight wiring can be completed. Mocked bridge tests can run. End-to-end cartography_queries and architecture_slices will not work until a separate Python core implementation plan completes.

### SQLite Domains — Ready for Implementation (No Python Required)

`dependencies_dependents` and `database_map_access` require only `better-sqlite3` and do not depend on the Python core. These can be implemented fully and tested end-to-end immediately.

**Estimated implementation complexity:**
- `dependencies_dependents`: Medium — 4 actions, DFS cycle detection, cursor pagination
- `database_map_access`: Low — 4 actions, pure schema metadata queries, allowlist enforcement already designed
- `cartography_queries`: Medium-High — 5 actions, Python bridge integration, mock testing
- `architecture_slices`: Medium-High — 4 actions, Python bridge integration, projection types

### No Caching Layer Implemented

`cache_hit` will always be `false` in the initial implementation. A caching layer for repeated cartography queries is deferred to a future optimization plan.

### Telemetry Persistence Not Implemented

Per observability-architecture.md: no persistent telemetry store in this plan. `CartographyCoverageReport` generation requires a follow-on implementation plan.

---

## Cross-References — Full Plan Document Index

```
docs/mcp-surface/
  memory-cartographer-action-inventory.md      ← START HERE
  memory-cartographer-resource-uris.md
  dependency-traversal-contract.md
  architecture-slice-contract.md
  database-map-access-contract.md
  design/
    cartography-action-matrix.md
    dependency-action-matrix.md
    architecture-slice-matrix.md
    resource-uri-matrix.md
  architecture/
    tool-routing-architecture.md               ← KEY WIRING DOC
    auth-session-architecture.md               ← SECURITY DOC
    observability-architecture.md
  validation/
    cartography-query-test-plan.md             ← 27 TEST CASES
    slice-dbmap-test-plan.md                   ← 24 TEST CASES
  handoff/
    implementation-handoff.md                  ← THIS FILE

server/src/cartography/contracts/
  dependency-types.ts
  slice-types.ts
  db-map-types.ts
```
