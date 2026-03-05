# Consumer Integration Contract

**Plan:** Consumer Integration & Validation: agent routing usage, tests, and cross-surface docs  
**Phase:** Planning  
**Step:** 1 — Consumer integration contract  
**Status:** Specification (planning artifact; implementation targets steps 4-6)

---

## Overview

This document defines the complete consumer-facing contract for `memory_cartographer` — the consolidated MCP tool exposing 17 actions across 4 domain families. It covers: the two-phase integration scope boundary, per-domain input and output contracts, error handling modes, fallback policy, Phase A vs Phase B readiness, and security invariants.

---

## 1. Integration Scope Boundary

`memory_cartographer` integration is split into two non-overlapping phases. **Phase A is unblocked. Phase B is Python-blocked.**

### Phase A — Implement the Tool (SQLite Domains)

> **Scope:** Build and register `memory_cartographer.ts` via the 6-file registration sequence.

Phase A is complete when the following work is done:

1. `server/src/tools/preflight/action-params-cartography.ts` created — declares `CartographyActionParamSpec` for all 17 actions
2. `server/src/tools/preflight/action-param-registry.ts` modified — registers cartography param spec
3. `server/src/tools/preflight/tool-action-mappings.ts` modified — adds agent type authorization mappings
4. `server/src/tools/consolidated/memory_cartographer.ts` created — implements handler with full dispatch + both SQLite domain handlers active; Python domains stubbed
5. `server/src/tools/consolidated/index.ts` modified — exports `handleMemoryCartographer`
6. `server/src/index.ts` modified — registers `server.tool('memory_cartographer', ...)`

**Domains live in Phase A:**
- `dependencies_dependents` — 4 actions, pure SQLite via `DependencyDbService`
- `database_map_access` — 4 actions (plus `context_items_projection`), pure SQLite via `DbMapService`
- `architecture_slices.slice_catalog` — 1 action, pure SQLite (slice registry only; no Python required)

**Phase A acceptance gate:** Server compiles, starts without error, `dependencies_dependents` and `database_map_access` actions return correct live data, preflight validation active on all 17 actions.

### Phase B — Update Agent Consumers (Python-Blocked Domains)

> **Scope:** Update agent instruction/prompt files so agents actively call `memory_cartographer` in their workflows. Also: bring Python bridge domains online.

Phase B work items (blocked on separate Python core implementation plan):
- `cartography_queries` — 5 actions, requires `PythonCoreAdapter` + fully implemented `cartograph` intent in Python core
- `architecture_slices` (except `slice_catalog`) — 3 actions: `slice_detail`, `slice_projection`, `slice_filters` — require Python bridge

Additional Phase B work (not Python-blocked but deferred to after Phase A stabilizes):
- Update `agents/hub.agent.md` and other relevant agent files to include `memory_cartographer` usage patterns
- Add `memory_cartographer` to agent spoke prompts for Hub's deployment context
- Write Phase B integration tests with real Python bridge responses

**Phase B does not begin until:** Phase A acceptance gate passes AND Python core `cartograph` implementation plan is complete.

---

## 2. Consumer Input Contract Per Domain

All `memory_cartographer` calls share this outer envelope:

```typescript
{
  action: string;      // dot-notated: "<domain>.<action_name>"
  params: object;      // domain-specific; see per-domain specs below
  _session_id?: string; // optional; used for telemetry correlation and stop-directive handling
}
```

---

### Domain: `dependencies_dependents` (Phase A — SQLite)

**Action: `dependencies_dependents.get_plan_dependencies`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `plan_id` | `string` | Yes | Target plan ID; must match `plan_[a-z0-9_]+` pattern |
| `depth_limit` | `number` | No | Max traversal depth; default 1, max 20 |

**Action: `dependencies_dependents.get_dependencies`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `plan_id` | `string` | Yes | Target plan ID |
| `depth_limit` | `number` | No | Default 5, max 20 |

**Action: `dependencies_dependents.reverse_dependent_lookup`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `plan_id` | `string` | Yes | Target plan ID |

**Action: `dependencies_dependents.bounded_traversal`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `root_plan_id` | `string` | Yes | Starting plan for traversal |
| `direction` | `'dependencies' \| 'dependents' \| 'both'` | No | Default `'both'` |
| `depth_limit` | `number` | No | Default 5, max 20 |
| `include_archived` | `boolean` | No | Default `false` |
| `cursor` | `string` | No | Pagination cursor from previous call |
| `page_size` | `number` | No | Default 50, max 200 |

**Example call shape:**

```typescript
await memory_cartographer({
  action: 'dependencies_dependents.bounded_traversal',
  params: {
    workspace_id: 'project_memory_mcp-50e04147a402',
    root_plan_id: 'plan_abc123',
    direction: 'dependencies',
    depth_limit: 3,
  },
  _session_id: 'sess_...',
});
```

---

### Domain: `database_map_access` (Phase A — SQLite)

**Action: `database_map_access.db_map_summary`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Scope for workspace-filtered row counts |

**Action: `database_map_access.db_node_lookup`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace scope |
| `table_name` | `string` | Yes | Must be in `ALLOWLISTED_TABLES` |
| `primary_key` | `string` | Yes | Primary key value (cast server-side) |

**Action: `database_map_access.db_edge_lookup`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace scope |
| `table_name` | `string` | Yes | Source entity table; allowlist-enforced |
| `primary_key` | `string` | Yes | Source entity PK |
| `direction` | `'outbound' \| 'inbound' \| 'both'` | No | Default `'both'` |

**Action: `database_map_access.context_items_projection`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace scope |
| `parent_type` | `'plan' \| 'workspace'` | Yes | Scope discriminator |
| `parent_id` | `string` | Yes | Plan ID or workspace ID |
| `type_filter` | `string[]` | No | Filter by `context_items.type` values |
| `limit` | `number` | No | Max rows; default 50, max 500 |
| `cursor` | `string` | No | Opaque pagination cursor |
| `order_by` | `'created_at' \| 'type' \| 'parent_id'` | No | Default `'created_at'` desc |

**Allowlisted tables (`ALLOWLISTED_TABLES`):**
```typescript
['plans', 'plan_dependencies', 'context_items', 'agent_sessions', 'workspace_meta']
```

**Example call shape:**

```typescript
await memory_cartographer({
  action: 'database_map_access.db_map_summary',
  params: { workspace_id: 'project_memory_mcp-50e04147a402' },
  _session_id: 'sess_...',
});
```

---

### Domain: `cartography_queries` (Phase B — Python-blocked)

**Action: `cartography_queries.summary`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `force_refresh` | `boolean` | No | Bypass cache; default `false` |

**Action: `cartography_queries.file_context`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `file_id` | `string` | Yes | Normalized file identity key (workspace-relative path) |
| `include_symbols` | `boolean` | No | Default `true` |
| `include_references` | `boolean` | No | Default `true` |

**Action: `cartography_queries.flow_entry_points`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `layer_filter` | `string[]` | No | Restrict to architecture layer tags |
| `language_filter` | `string[]` | No | Restrict to language tags |

**Action: `cartography_queries.layer_view`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `layers` | `string[]` | Yes | One or more architecture layer tag names |
| `include_cross_layer_edges` | `boolean` | No | Default `false` |
| `depth_limit` | `number` | No | Default 3, max 10 |

**Action: `cartography_queries.search`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `query` | `string` | Yes | Search query (glob/regex); max 500 chars |
| `search_scope` | `'symbols' \| 'files' \| 'modules' \| 'all'` | No | Default `'all'` |
| `layer_filter` | `string[]` | No | Restrict to layers |
| `limit` | `number` | No | Default 20, max 100 |

---

### Domain: `architecture_slices` (Mixed — `slice_catalog` is Phase A; rest Phase B)

**Action: `architecture_slices.slice_catalog`** (Phase A — SQLite)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |

**Actions: `architecture_slices.slice_detail`, `slice_projection`, `slice_filters`** (Phase B — Python-blocked)

> See `docs/mcp-surface/memory-cartographer-action-inventory.md` for full Phase B parameter specs.

---

## 3. Consumer Output Contract Per Domain

### `dependencies_dependents` — Unified Response

All 4 actions return `DependencyTraversalResponse` from `server/src/cartography/contracts/dependency-types.ts`:

```typescript
interface DependencyTraversalResponse {
  plan_id: string;
  nodes: DependencyNode[];       // DependencyNode: { id, title, status, phase, priority, workspace_id, depth_from_root }
  edges: DependencyEdge[];       // DependencyEdge: { from_plan, to_plan, edge_type, declared_by? }
  has_cycles: boolean;
  cycle_path?: string[];         // plan IDs forming first detected cycle; only when has_cycles = true
  depth_reached: number;
  was_depth_capped: boolean;
  next_cursor?: string;          // only on bounded_traversal responses with pagination
  total_node_count: number;
  diagnostics: DiagnosticEntry[];
}
```

Outer MCP envelope:
```typescript
{
  success: true;
  data: {
    action: string;
    data: DependencyTraversalResponse;
    _session_id?: string;  // echoed back when provided
  }
}
```

### `database_map_access` — Per-Action Response Shapes

**db_map_summary** → `TableListResult` from `server/src/cartography/contracts/db-map-types.ts`:

```typescript
{
  schema_version: string;
  tables: Array<{
    table_name: string;
    row_count: number;
    column_count: number;
    has_fk_relations: boolean;
  }>;
  relation_count: number;
  diagnostics: DiagnosticEntry[];
}
```

**db_node_lookup** → `TableDescription`:

```typescript
{
  table_name: string;
  row: Record<string, unknown>;  // masked columns returned as null/"[REDACTED]"
  fk_hints: Array<{ column: string; references_table: string; references_pk: string }>;
  diagnostics: DiagnosticEntry[];
}
```

**db_edge_lookup**:

```typescript
{
  source: { table_name: string; primary_key: string };
  edges: Array<{
    direction: 'outbound' | 'inbound';
    fk_column: string;
    related_table: string;
    related_rows: Record<string, unknown>[];  // max 50 per edge
    related_total: number;
  }>;
  diagnostics: DiagnosticEntry[];
}
```

**context_items_projection**:

```typescript
{
  parent_type: string;
  parent_id: string;
  items: Array<{
    item_id: string;
    type: string;
    parent_type: string;
    parent_id: string;
    created_at: string;
    data_size_bytes: number;
    data_preview: unknown;    // first 500 chars only; never the full context_data field
    is_truncated: boolean;
  }>;
  total_count: number;
  next_cursor?: string;
  diagnostics: DiagnosticEntry[];
}
```

### `cartography_queries` — Phase B Response Shapes (reference only)

Responses reference `FileEntry`, `SymbolEntry`, `ReferenceEntry`, `ArchitectureEdge`, `DependencyFlow` from `server/src/cartography/contracts/types.ts`. Full shape details in `docs/mcp-surface/memory-cartographer-action-inventory.md`.

### `architecture_slices` — Phase B Response Shapes (reference only)

`SliceResult`, `CohesionMetrics`, `LayerSummary` from `server/src/cartography/contracts/slice-types.ts`. `slice_catalog` response: `{ slices: Array<{ slice_id, name, description?, scope_type, created_at, last_materialized_at? }>, total: number }`.

---

## 4. Error Modes

### DiagnosticEntry Schema

```typescript
interface DiagnosticEntry {
  code: string;           // DiagnosticCode value (see taxonomy below)
  severity: 'ERROR' | 'WARN' | 'INFO';
  message: string;
  recoverable: boolean;
  context?: Record<string, unknown>;
}
```

### DiagnosticCode Taxonomy (11 codes)

| Code | Severity | Meaning |
|------|----------|---------|
| `MISSING_SOURCE` / `NOT_FOUND` | WARN | Referenced source, file, plan, or entity not found |
| `PARSE_FAILURE` | ERROR | AST/SQL parse error for a scanned artifact |
| `SCHEMA_VERSION_MISMATCH` / `SCHEMA_MISMATCH` | ERROR | Python-core output version incompatible |
| `PARTIAL_GRAPH` / `PARTIAL_RESULT` | WARN | Output is a subset; some edges/nodes unresolved |
| `CYCLE_DETECTED` | WARN | Circular dependency during traversal (result still returned) |
| `DEPTH_LIMIT_EXCEEDED` | WARN | Traversal depth capped |
| `SCOPE_VIOLATION` / `ACCESS_DENIED` | ERROR | Requested path/table/action is not permitted |
| `BUDGET_EXCEEDED` / `TIMEOUT` | ERROR | Performance budget or timeout exceeded |
| `IDENTITY_CONFLICT` | ERROR | Two artifacts resolved to the same identity key |
| `DB_ACCESS_DENIED` | ERROR | DB operation not permitted (read-only constraint) |
| `UNKNOWN_ACTION` / `INVALID_PARAMS` | ERROR | Action not registered or params failed validation |

### Null/Empty Response Handling

Consumers MUST handle these cases gracefully without throwing:

- `data.data` may be `null` when `success: false` — check `success` before accessing `data.data`
- `diagnostics` array may be empty `[]` (clean success) or contain WARN entries along with a valid result
- `nodes: []`, `edges: []` are valid responses (leaf plan with no dependencies)
- `tables: []` is a valid response (no ALLOWLISTED_TABLES found with rows)

### Python-Unavailable Degraded Mode

When `cartography_queries` or `architecture_slices` (Phase B) actions are called before Python core is ready:

```typescript
// Expected degraded response shape:
{
  success: true,
  data: {
    action: 'cartography_queries.summary',
    data: {
      diagnostics: [{
        code: 'PYTHON_CORE_ERROR',
        severity: 'ERROR',
        message: 'Python core cartograph intent returned TODO stub',
        recoverable: false
      }]
    }
  }
}
```

Consumers checking for Python availability should inspect `diagnostics[0].code === 'PYTHON_CORE_ERROR'` and route to a fallback behavior (see §5).

---

## 5. Fallback Policy

Consumers must implement graceful degradation at every call site. The following table defines the required fallback behavior:

| Error condition | Consumer action |
|----------------|----------------|
| `success: false` | Log the error; do not propagate as unhandled exception; treat as empty/unavailable result |
| `PYTHON_CORE_ERROR` in diagnostics | Log warning; skip this cartography call; continue workflow without that data |
| `ACCESS_DENIED` in diagnostics | Log security event; halt the specific query; do not retry with different params |
| `TIMEOUT` in diagnostics | Log latency event; skip this call; do not block the agent workflow |
| `PARTIAL_RESULT` in diagnostics | Accept and use the partial result; record a diagnostic note that coverage may be incomplete |
| Empty `nodes: []` or `tables: []` | Treat as valid empty state; do not fail workflow |
| `next_cursor` present | Issue follow-up paginated calls only if additional data is required for the current task |
| `null` / `undefined` `data.data` | Treat as complete unavailability; use a no-op path through the consuming logic |

**Critical rule:** Consumers MUST NOT throw or block agent workflow execution on any `memory_cartographer` error. The tool provides supplemental context — workflows are complete without it.

**Recommended pattern:**

```typescript
// Correct: graceful fallback
const result = await memory_cartographer({ action: '...', params: { ... } });
if (!result.success || result.data?.data == null) {
  // Log and continue; do not throw
  return null;  // or default value
}
const data = result.data.data;
if (data.diagnostics?.some(d => d.severity === 'ERROR')) {
  // Log diagnostics; decide whether partial data is usable
}
return data;
```

---

## 6. Phase A vs Phase B Readiness

| Domain | Actions | Phase | Blocking dependency |
|--------|---------|-------|---------------------|
| `dependencies_dependents` | `get_plan_dependencies`, `get_dependencies`, `reverse_dependent_lookup`, `bounded_traversal` | **Phase A** | None (pure SQLite) |
| `database_map_access` | `db_map_summary`, `db_node_lookup`, `db_edge_lookup`, `context_items_projection` | **Phase A** | None (pure SQLite) |
| `architecture_slices` | `slice_catalog` only | **Phase A** | None (slice registry in SQLite) |
| `cartography_queries` | All 5 actions | **Phase B** | Python core `cartograph` intent fully implemented |
| `architecture_slices` | `slice_detail`, `slice_projection`, `slice_filters` | **Phase B** | Python core + cartography engine stubs replaced |

**Phase A test coverage:** TC-DD-01 through TC-DD-12 (12 cases) + TC-DM-01 through TC-DM-12 (12 cases) = **24 test cases** executable immediately.

**Phase B test coverage (mocked):** TC-CQ-01 through TC-CQ-15 (15 cases) + TC-AS-01 through TC-AS-12 (12 cases) = **27 test cases** executable with Python bridge mocks; end-to-end tests require real Python core.

---

## 7. Security Invariants

The following invariants are non-negotiable and must be maintained in all Phase A and Phase B implementations:

### a. `context_data` Masking

`context_items.context_data` is **always masked** from `describe_table` (or `db_node_lookup`) responses. Consumers must never receive the raw `context_data` field. Use `context_items_projection`'s `data_preview` (first 500 chars) for safe, non-sensitive context inspection.

- Failure mode for masking: TC-DM-05 is a security bug. Implementation must not pass unless masking is verified.

### b. Authorized Agent Types Only

`preflightValidate()` enforces agent type authorization before any action dispatch. Authorized types:

| Agent Type | Authorized |
|------------|-----------|
| `Researcher` | Yes |
| `Architect` | Yes |
| `Coordinator` | Yes |
| `Analyst` | Yes |
| `Executor` | Yes |
| `Tester` | **No** |
| `Revisionist` | **No** |
| `Archivist` | **No** |

Unauthorized requests receive `ACCESS_DENIED` before any data is touched.

### c. No `server.resource()` Calls

`memory_cartographer` uses `result_uri` inline payload conventions for URI schemes (`cartography://`, `dbmap://`). No `server.resource()` calls are registered. Verify:

```
grep -r "server\.resource" server/src/   # must return zero matches
```

### d. No Raw SQL Passthrough

All DB access uses parameterized `better-sqlite3` prepared statements. Table names are allowlist-validated before any `prepare()` call. No user-provided strings are interpolated into SQL.

### e. Path Traversal Prevention

`../` patterns in any `file_path` or `workspace_path` parameter are rejected in preflight before reaching the Python bridge or file system. Workspace-relative normalization applied to all path parameters.

### f. Read-Only Enforcement

All `memory_cartographer` actions are read-only. The `better-sqlite3` instance is opened in read-only mode. No INSERT, UPDATE, DELETE, or DDL operations are reachable through any action path.

---

## Cross-References

- [Action inventory (17 actions)](../mcp-surface/memory-cartographer-action-inventory.md)
- [Implementation handoff (6-file registration sequence)](../mcp-surface/handoff/implementation-handoff.md)
- [Auth & session architecture](../mcp-surface/architecture/auth-session-architecture.md)
- [Tool routing architecture](../mcp-surface/architecture/tool-routing-architecture.md)
- [Database map access contract (allowlist, masked columns)](../mcp-surface/database-map-access-contract.md)
- [TypeScript types: dependency-types.ts](../../server/src/cartography/contracts/dependency-types.ts)
- [TypeScript types: db-map-types.ts](../../server/src/cartography/contracts/db-map-types.ts)
- [TypeScript types: slice-types.ts](../../server/src/cartography/contracts/slice-types.ts)
- [Consumer integration: handoff-graph.md](./handoff-graph.md)
- [Consumer integration: validation-matrix.md](./validation-matrix.md)
