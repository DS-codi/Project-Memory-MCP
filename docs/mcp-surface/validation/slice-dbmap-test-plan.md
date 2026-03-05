# Contract Test Plan: Architecture Slices + DB Map Access

**Plan:** MCP Surface Integration: expose memory_cartographer actions/resources via consolidated tools  
**Phase:** Validation  
**Step:** 14 — Contract Test Plan: Architecture Slices + DB Map Access  
**Status:** Specification (test cases to be implemented in a separate implementation plan)

---

## Overview

This document outlines 24 contract test cases (12 architecture_slices + 12 database_map_access) for the `memory_cartographer` consolidated tool. Slice tests use a deterministic fixed workspace tree fixture. DB map tests use a seeded SQLite fixture against the `ALLOWLISTED_TABLES` set.

Schema conformance requirement: all response shapes must match types defined in `server/src/cartography/contracts/slice-types.ts` and `server/src/cartography/contracts/db-map-types.ts`.

---

## Notation

- **TC-AS-nn** = Test Case, Architecture Slices, number
- **TC-DM-nn** = Test Case, DB Map Access, number
- **Fixture:** The test fixture or seeded data required
- **Expected DiagnosticCode:** Applied only to error/boundary cases

---

## Part C: architecture_slices Actions (12 Test Cases)

### Deterministic Fixture Requirement

All slice tests use a **fixed known workspace tree** defined as:

```
fixture-workspace/
  src/
    controllers/
      planController.ts     (imports: planService.ts, validationUtils.ts)
    services/
      planService.ts        (imports: planRepository.ts)
    repositories/
      planRepository.ts     (imports: db.ts)
    utils/
      validationUtils.ts    (no imports)
    db.ts                   (no imports)
  tests/
    planController.test.ts  (imports: planController.ts)
```

This 6-file fixture has a known 3-layer architecture (controllers → services → repositories/utils/db). All slice test assertions are made against this known structure.

**Python bridge mock:** Because `python-core/engines/code_cartography.py` stubs are not fully implemented, slice tests mock `PythonBridge.send()` to return the fixture structure as a pre-built `CartographyEnvelope`. This is noted per test case.

---

### C1. get_slice (3 test cases)

#### TC-AS-01 — get_slice: positive case (full projection)
- **Action:** `architecture_slices.get_slice`
- **Input:** `{ action: 'architecture_slices.get_slice', params: { workspace_path: '/fixtures/fixture-workspace', layer: 'controllers', projection: 'full' } }`
- **Expected:**
  - `success: true`
  - `data.data.slice_id: string`
  - `data.data.layer: 'controllers'`
  - `data.data.files: ['src/controllers/planController.ts']`
  - `data.data.imports.length: 2` (planService, validationUtils)
  - `data.data.exports: Array` (non-empty)
  - `data.data.edges: Array<ArchitectureEdge>` (connects to services layer)
- **Schema:** must match `SliceResult` from `slice-types.ts`
- **Fixture:** fixture-workspace as defined above; Python bridge mock

#### TC-AS-02 — get_slice: boundary (projection = 'summary')
- **Action:** `architecture_slices.get_slice`
- **Input:** `{ action: 'architecture_slices.get_slice', params: { workspace_path: '/fixtures/fixture-workspace', layer: 'controllers', projection: 'summary' } }`
- **Expected:**
  - `success: true`
  - `data.data.files: ['src/controllers/planController.ts']` (file list present)
  - `data.data.symbol_detail: undefined` (summary omits symbol-level detail)
  - `data.data.edges: undefined` (summary omits edges for reduced payload)
- **Fixture:** Same as TC-AS-01; mock returns summary projection

#### TC-AS-03 — get_slice: malformed (non-existent layer name)
- **Action:** `architecture_slices.get_slice`
- **Input:** `{ action: 'architecture_slices.get_slice', params: { workspace_path: '/fixtures/fixture-workspace', layer: 'nonExistentLayer99', projection: 'full' } }`
- **Expected:**
  - `diagnostics[0].code: 'NOT_FOUND'`
  - `data.data.files: []` or absent
- **Expected DiagnosticCode:** `NOT_FOUND`

---

### C2. get_layer_summary (3 test cases)

#### TC-AS-04 — get_layer_summary: positive case
- **Action:** `architecture_slices.get_layer_summary`
- **Input:** `{ action: 'architecture_slices.get_layer_summary', params: { workspace_path: '/fixtures/fixture-workspace' } }`
- **Expected:**
  - `success: true`
  - `data.data.layers: Array<{ name: string, file_count: number, avg_coupling: number }>` (3 layers)
  - Layer names include: `controllers`, `services`, `repositories`
  - `data.data.layers[0].file_count ≥ 1`
- **Fixture:** fixture-workspace; Python bridge mock

#### TC-AS-05 — get_layer_summary: boundary (single-layer workspace)
- **Action:** `architecture_slices.get_layer_summary`
- **Input:** `{ action: 'architecture_slices.get_layer_summary', params: { workspace_path: '/fixtures/flat-workspace' } }`
- **Expected:**
  - `success: true`
  - `data.data.layers.length: 1`
  - Layer has high coupling (all files in same layer)
- **Fixture:** flat-workspace: 4 files in `src/` with mutual imports (no sub-layers)

#### TC-AS-06 — get_layer_summary: malformed (workspace_path missing)
- **Action:** `architecture_slices.get_layer_summary`
- **Input:** `{ action: 'architecture_slices.get_layer_summary', params: {} }`
- **Expected:**
  - `diagnostics[0].code: 'INVALID_PARAMS'`
- **Expected DiagnosticCode:** `INVALID_PARAMS`

---

### C3. get_critical_path (3 test cases)

#### TC-AS-07 — get_critical_path: positive case
- **Action:** `architecture_slices.get_critical_path`
- **Input:** `{ action: 'architecture_slices.get_critical_path', params: { workspace_path: '/fixtures/fixture-workspace', entry_file: 'src/controllers/planController.ts' } }`
- **Expected:**
  - `success: true`
  - `data.data.path: string[]` (ordered list of files in dependency chain)
  - `data.data.path[0]: 'src/controllers/planController.ts'`
  - `data.data.path` ends at `src/db.ts` (deepest dependency)
  - `data.data.path.length: 4` (controller→service→repository→db)
- **Fixture:** fixture-workspace; Python bridge mock

#### TC-AS-08 — get_critical_path: boundary (circular dependency warning)
- **Action:** `architecture_slices.get_critical_path`
- **Input:** `{ action: 'architecture_slices.get_critical_path', params: { workspace_path: '/fixtures/circular-workspace', entry_file: 'src/a.ts' } }`
- **Expected:**
  - `success: true`
  - `data.data.has_cycle: true`
  - `data.data.path` returns truncated path (no infinite recursion)
  - `diagnostics[0].code: 'PARTIAL_RESULT'`
- **Expected DiagnosticCode:** `PARTIAL_RESULT`
- **Fixture:** circular-workspace: `a.ts` imports `b.ts`, `b.ts` imports `a.ts`

#### TC-AS-09 — get_critical_path: malformed (entry_file path traversal)
- **Action:** `architecture_slices.get_critical_path`
- **Input:** `{ action: 'architecture_slices.get_critical_path', params: { workspace_path: '/fixtures/fixture-workspace', entry_file: '../../../etc/passwd' } }`
- **Expected:**
  - `diagnostics[0].code: 'ACCESS_DENIED'`
- **Expected DiagnosticCode:** `ACCESS_DENIED`

---

### C4. get_cohesion_metrics (3 test cases)

#### TC-AS-10 — get_cohesion_metrics: positive case
- **Action:** `architecture_slices.get_cohesion_metrics`
- **Input:** `{ action: 'architecture_slices.get_cohesion_metrics', params: { workspace_path: '/fixtures/fixture-workspace', layer: 'services' } }`
- **Expected:**
  - `success: true`
  - `data.data.layer: 'services'`
  - `data.data.cohesion_score: number` (0.0 – 1.0)
  - `data.data.coupling_count: number ≥ 0`
  - `data.data.afferent_coupling: number` (dependencies from outside into layer)
  - `data.data.efferent_coupling: number` (dependencies from layer to outside)
- **Schema:** must match `CohesionMetrics` from `slice-types.ts`
- **Fixture:** fixture-workspace; Python bridge mock

#### TC-AS-11 — get_cohesion_metrics: boundary (layer with 0 internal coupling)
- **Action:** `architecture_slices.get_cohesion_metrics`
- **Input:** `{ action: 'architecture_slices.get_cohesion_metrics', params: { workspace_path: '/fixtures/flat-workspace', layer: 'src' } }`
- **Expected:**
  - `data.data.cohesion_score` is 0.0 or 1.0 depending on model
  - No error; scalar layer edge case returns valid metrics

#### TC-AS-12 — get_cohesion_metrics: malformed (layer name is SQL injection attempt)
- **Action:** `architecture_slices.get_cohesion_metrics`
- **Input:** `{ action: 'architecture_slices.get_cohesion_metrics', params: { workspace_path: '/fixtures/fixture-workspace', layer: "'; DROP TABLE plans; --" } }`
- **Expected:**
  - `diagnostics[0].code: 'INVALID_PARAMS'`
  - Layer name sanitized/rejected before Python bridge call
- **Expected DiagnosticCode:** `INVALID_PARAMS`

---

## Part D: database_map_access Actions (12 Test Cases)

### Deterministic Fixture Requirement

DB map tests use a **seeded SQLite fixture** or the live DB in **read-only mode**. The fixture must include:
- At minimum: `plans`, `plan_dependencies`, `context_items`, `agent_sessions`, `workspace_meta` tables (the allowlisted set)
- `context_items` must have rows with `context_data` populated (for masking test)
- A non-allowlisted table named `secrets_test_table` to verify allowlist enforcement

Fixture available at: `test/fixtures/db-map-fixture.db` (to be created in implementation plan)

### Security Contract

`context_items.context_data` column MUST be absent from all `describe_table` outputs regardless of how the test is configured.

---

### D1. list_tables (3 test cases)

#### TC-DM-01 — list_tables: positive case (allowlisted tables only)
- **Action:** `database_map_access.list_tables`
- **Input:** `{ action: 'database_map_access.list_tables', params: { workspace_id: 'fixture_workspace_id' } }`
- **Expected:**
  - `success: true`
  - `data.data.tables: Array<{ name: string, row_count?: number }>` (5 entries matching ALLOWLISTED_TABLES)
  - `data.data.tables` does NOT include `secrets_test_table`
  - `data.data.tables` does NOT include `sqlite_master`, `sqlite_stat1` (internal tables excluded)
- **Schema:** must match `TableListResult` from `db-map-types.ts`
- **Fixture:** db-map-fixture.db

#### TC-DM-02 — list_tables: boundary (filter parameter)
- **Action:** `database_map_access.list_tables`
- **Input:** `{ action: 'database_map_access.list_tables', params: { workspace_id: 'fixture_workspace_id', filter: 'plan' } }`
- **Expected:**
  - `data.data.tables` contains only tables with 'plan' in name: `plans`, `plan_dependencies`
  - Tables without 'plan' in name are excluded from result
- **Fixture:** db-map-fixture.db

#### TC-DM-03 — list_tables: malformed (non-existent workspace_id)
- **Action:** `database_map_access.list_tables`
- **Input:** `{ action: 'database_map_access.list_tables', params: { workspace_id: 'workspace_does_not_exist' } }`
- **Expected:**
  - `diagnostics[0].code: 'NOT_FOUND'`
- **Expected DiagnosticCode:** `NOT_FOUND`

---

### D2. describe_table (3 test cases)

#### TC-DM-04 — describe_table: positive case (plans table)
- **Action:** `database_map_access.describe_table`
- **Input:** `{ action: 'database_map_access.describe_table', params: { workspace_id: 'fixture_workspace_id', table_name: 'plans' } }`
- **Expected:**
  - `success: true`
  - `data.data.table_name: 'plans'`
  - `data.data.columns: Array<{ name: string, type: string, nullable: boolean }>` (non-empty)
  - Column names include: `id`, `title`, `status`, `created_at`
  - Column `depends_on_plans` included if it is a column (or excluded if FK-only)
- **Schema:** must match `TableDescription` from `db-map-types.ts`
- **Fixture:** db-map-fixture.db

#### TC-DM-05 — describe_table: security test (context_items — masked column)
- **Action:** `database_map_access.describe_table`
- **Input:** `{ action: 'database_map_access.describe_table', params: { workspace_id: 'fixture_workspace_id', table_name: 'context_items' } }`
- **Expected:**
  - `success: true`
  - `data.data.columns` does NOT contain `{ name: 'context_data', ... }`
  - Other columns (`id`, `parent_type`, `parent_id`, `type`, `created_at`) ARE present
- **Security Note:** This is the critical masking test — failure here is a security bug
- **Fixture:** db-map-fixture.db; context_items has populated `context_data` rows

#### TC-DM-06 — describe_table: malformed (non-allowlisted table)
- **Action:** `database_map_access.describe_table`
- **Input:** `{ action: 'database_map_access.describe_table', params: { workspace_id: 'fixture_workspace_id', table_name: 'secrets_test_table' } }`
- **Expected:**
  - `diagnostics[0].code: 'ACCESS_DENIED'`
  - No column data returned
- **Expected DiagnosticCode:** `ACCESS_DENIED` (allowlist enforcement)

---

### D3. query_schema_lineage (3 test cases)

#### TC-DM-07 — query_schema_lineage: positive case (plans table)
- **Action:** `database_map_access.query_schema_lineage`
- **Input:** `{ action: 'database_map_access.query_schema_lineage', params: { workspace_id: 'fixture_workspace_id', table_name: 'plans' } }`
- **Expected:**
  - `success: true`
  - `data.data.table_name: 'plans'`
  - `data.data.migrations: Array<{ version: string, applied_at: string, changes: string[] }>` (may be empty if no migration log in fixture)
  - `data.data.related_tables: string[]` (tables referenced by FK from plans)
  - `data.data.created_at: string` (DB creation metadata if available)
- **Schema:** must match `SchemaLineageResult` from `db-map-types.ts`
- **Fixture:** db-map-fixture.db

#### TC-DM-08 — query_schema_lineage: boundary (table with no FK relations)
- **Action:** `database_map_access.query_schema_lineage`
- **Input:** `{ action: 'database_map_access.query_schema_lineage', params: { workspace_id: 'fixture_workspace_id', table_name: 'workspace_meta' } }`
- **Expected:**
  - `success: true`
  - `data.data.related_tables: []` (no FK relations)
  - Valid result with empty relations

#### TC-DM-09 — query_schema_lineage: malformed (SQL injection in table_name)
- **Action:** `database_map_access.query_schema_lineage`
- **Input:** `{ action: 'database_map_access.query_schema_lineage', params: { workspace_id: 'fixture_workspace_id', table_name: "plans'; DROP TABLE plans; --" } }`
- **Expected:**
  - `diagnostics[0].code: 'ACCESS_DENIED'` (table name doesn't match any allowlisted entry)
  - No SQL execution against injected string
- **Expected DiagnosticCode:** `ACCESS_DENIED`

---

### D4. get_query_touchpoints (3 test cases)

#### TC-DM-10 — get_query_touchpoints: positive case
- **Action:** `database_map_access.get_query_touchpoints`
- **Input:** `{ action: 'database_map_access.get_query_touchpoints', params: { workspace_id: 'fixture_workspace_id', table_name: 'plans' } }`
- **Expected:**
  - `success: true`
  - `data.data.table_name: 'plans'`
  - `data.data.touchpoints: Array<{ file: string, line: number, query_type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' }>`
  - Touchpoints include known query locations from `server/src/` that access `plans`
- **Schema:** must match `QueryTouchpoints` from `db-map-types.ts`
- **Fixture:** db-map-fixture.db + known server source files

#### TC-DM-11 — get_query_touchpoints: boundary (table with no touchpoints in codebase)
- **Action:** `database_map_access.get_query_touchpoints`
- **Input:** `{ action: 'database_map_access.get_query_touchpoints', params: { workspace_id: 'fixture_workspace_id', table_name: 'agent_sessions' } }`
- **Expected:**
  - `success: true`
  - `data.data.touchpoints: []` (if no code accesses agent_sessions directly)
  - OR: non-empty if server code does query agent_sessions
  - Either case: valid response with no error

#### TC-DM-12 — get_query_touchpoints: malformed (non-allowlisted table)
- **Action:** `database_map_access.get_query_touchpoints`
- **Input:** `{ action: 'database_map_access.get_query_touchpoints', params: { workspace_id: 'fixture_workspace_id', table_name: 'secrets_test_table' } }`
- **Expected:**
  - `diagnostics[0].code: 'ACCESS_DENIED'`
- **Expected DiagnosticCode:** `ACCESS_DENIED`

---

## Schema Conformance Requirements

### architecture_slices
- `SliceResult`, `CohesionMetrics`, `LayerSummary` in `server/src/cartography/contracts/slice-types.ts`
- `ArchitectureEdge` in `server/src/cartography/contracts/types.ts`

### database_map_access
- `TableListResult`, `TableDescription`, `SchemaLineageResult`, `QueryTouchpoints` in `server/src/cartography/contracts/db-map-types.ts`

Conformance validation: use TypeScript `satisfies` operator in vitest test files against actual response shapes.

---

## Deterministic Fixture Specifications

### fixture-workspace Structure (for slices)
As defined in the Deterministic Fixture Requirement section above. Python bridge mock returns pre-built `CartographyEnvelope` responses.

### db-map-fixture.db (for DB map access)
SQLite file seeded with:
- `plans` table: 3 rows with columns id, title, status, created_at, workspace_id, depends_on_plans
- `plan_dependencies` table: 2 dependency edges
- `context_items` table: 2 rows — with `context_data` column populated (to test masking)
- `agent_sessions` table: 1 row
- `workspace_meta` table: 1 row
- `secrets_test_table`: 1 row (to verify allowlist blocks it)

Tables must be created with the exact schema used by the production server (import schema from existing migrations or `seed.sql`).

---

## context_items_projection Security Test Summary

`TC-DM-05` is the critical security test. It verifies that `context_items.context_data` (which stores potentially sensitive plan data — research notes, architecture docs, context payloads) is **always masked** from the `describe_table` response.

A failure in `TC-DM-05` (i.e., `context_data` appearing in column list) is a **security bug** requiring immediate fix before the implementation plan is approved.

---

## Cross-References

- [Architecture slice contract + types](../architecture-slice-contract.md)
- [DB map access contract + allowlist](../database-map-access-contract.md)
- [TypeScript contracts: slice-types.ts](../../../server/src/cartography/contracts/slice-types.ts)
- [TypeScript contracts: db-map-types.ts](../../../server/src/cartography/contracts/db-map-types.ts)
- [Auth/injection guard (allowlist + path traversal)](../architecture/auth-session-architecture.md)
- [Observability (DiagnosticCode severity mapping)](../architecture/observability-architecture.md)
