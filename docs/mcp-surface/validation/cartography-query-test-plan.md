# Contract Test Plan: Cartography Queries + Dependencies/Dependents

**Plan:** MCP Surface Integration: expose memory_cartographer actions/resources via consolidated tools  
**Phase:** Validation  
**Step:** 13 — Contract Test Plan: Cartography Queries + Dependencies  
**Status:** Specification (test cases to be implemented in a separate implementation plan)

---

## Overview

This document outlines 27 contract test cases (15 cartography_queries + 12 dependencies_dependents) for the `memory_cartographer` consolidated tool. Each test case specifies: action name, input, expected output fields, expected `DiagnosticCode` on error cases, and test fixture notes.

Schema conformance requirement: all response shapes must match types defined in `server/src/cartography/contracts/types.ts`.

---

## Notation

- **TC-CQ-nn** = Test Case, Cartography Queries, number
- **TC-DD-nn** = Test Case, Dependencies/Dependents, number
- **Fixture:** The test fixture or seeded data required
- **Expected DiagnosticCode:** Applied only to error/boundary cases; clean success cases expect `diagnostics: []` or `diagnostics` absent

---

## Part A: cartography_queries Actions (15 Test Cases)

### A1. summary (3 test cases)

#### TC-CQ-01 — summary: positive case
- **Action:** `cartography_queries.summary`
- **Input:** `{ action: 'cartography_queries.summary', params: { workspace_path: '/fixtures/simple-workspace' } }`
- **Expected output fields:**
  - `success: true`
  - `data.action: 'cartography_queries.summary'`
  - `data.data.file_count: number` (≥ 0)
  - `data.data.language_breakdown: Record<string, number>`
  - `data.data.schema_version: string`
  - `data.data.diagnostics: []` (empty on clean success)
- **Fixture:** Simple workspace with 5 TypeScript files, 2 Python files

#### TC-CQ-02 — summary: boundary (empty workspace)
- **Action:** `cartography_queries.summary`
- **Input:** `{ action: 'cartography_queries.summary', params: { workspace_path: '/fixtures/empty-workspace' } }`
- **Expected:**
  - `success: true`
  - `data.data.file_count: 0`
  - `data.data.language_breakdown: {}`
  - `data.data.diagnostics[0].code: 'NOT_FOUND'` OR `diagnostics: []` (empty workspace is valid)
- **Fixture:** Empty directory registered as workspace

#### TC-CQ-03 — summary: malformed request (missing workspace_path)
- **Action:** `cartography_queries.summary`
- **Input:** `{ action: 'cartography_queries.summary', params: {} }`
- **Expected:**
  - `success: false` OR `data.data.diagnostics[0].code: 'INVALID_PARAMS'`
  - `data.data.diagnostics[0].severity: 'ERROR'`
- **Fixture:** None required
- **Expected DiagnosticCode:** `INVALID_PARAMS`

---

### A2. file_context (3 test cases)

#### TC-CQ-04 — file_context: positive case (known file)
- **Action:** `cartography_queries.file_context`
- **Input:** `{ action: 'cartography_queries.file_context', params: { workspace_path: '/fixtures/simple-workspace', file_path: 'src/index.ts' } }`
- **Expected:**
  - `success: true`
  - `data.data.file_path: 'src/index.ts'`
  - `data.data.symbols: Array<{ name: string, kind: string, line: number }>` (non-empty)
  - `data.data.imports: string[]`
  - `data.data.exports: string[]`
- **Schema:** output must match `FileEntry` from `types.ts`
- **Fixture:** `src/index.ts` with 3 exported functions

#### TC-CQ-05 — file_context: boundary (file with no exports)
- **Action:** `cartography_queries.file_context`
- **Input:** `{ action: 'cartography_queries.file_context', params: { workspace_path: '/fixtures/simple-workspace', file_path: 'src/util.ts' } }`
- **Expected:**
  - `success: true`
  - `data.data.exports: []` (valid empty list)
  - `data.data.symbols: Array` (may be non-empty for private symbols)
- **Fixture:** `src/util.ts` with internal functions only

#### TC-CQ-06 — file_context: malformed request (path traversal)
- **Action:** `cartography_queries.file_context`
- **Input:** `{ action: 'cartography_queries.file_context', params: { workspace_path: '/fixtures/simple-workspace', file_path: '../../secrets/.env' } }`
- **Expected:**
  - `success: false` or `diagnostics[0].code: 'ACCESS_DENIED'`
  - No file content returned
- **Expected DiagnosticCode:** `ACCESS_DENIED` (path traversal blocked by preflight)

---

### A3. flow_entry_points (3 test cases)

#### TC-CQ-07 — flow_entry_points: positive case
- **Action:** `cartography_queries.flow_entry_points`
- **Input:** `{ action: 'cartography_queries.flow_entry_points', params: { workspace_path: '/fixtures/server-workspace' } }`
- **Expected:**
  - `success: true`
  - `data.data.entry_points: Array<{ name: string, file: string, kind: 'exported_function' | 'class' | 'route' }>` (non-empty)
- **Fixture:** `server/src/index.ts` with exported `start()` function

#### TC-CQ-08 — flow_entry_points: boundary (no entry points detected)
- **Action:** `cartography_queries.flow_entry_points`
- **Input:** `{ action: 'cartography_queries.flow_entry_points', params: { workspace_path: '/fixtures/empty-workspace' } }`
- **Expected:**
  - `success: true`
  - `data.data.entry_points: []`
  - Optionally: `diagnostics[0].code: 'NOT_FOUND'`
- **Expected DiagnosticCode:** `NOT_FOUND` (optional)

#### TC-CQ-09 — flow_entry_points: malformed (non-existent workspace)
- **Action:** `cartography_queries.flow_entry_points`
- **Input:** `{ action: 'cartography_queries.flow_entry_points', params: { workspace_path: '/no-such-path' } }`
- **Expected:**
  - `diagnostics[0].code: 'NOT_FOUND'` or `'INTERNAL_ERROR'`
- **Expected DiagnosticCode:** `NOT_FOUND`

---

### A4. layer_view (3 test cases)

#### TC-CQ-10 — layer_view: positive case
- **Action:** `cartography_queries.layer_view`
- **Input:** `{ action: 'cartography_queries.layer_view', params: { workspace_path: '/fixtures/server-workspace', max_depth: 3 } }`
- **Expected:**
  - `success: true`
  - `data.data.layers: Array<{ name: string, files: string[], dependencies: string[] }>`
  - `data.data.layers.length ≤ 3` (depth constraint honored)
- **Fixture:** Multi-layer workspace (controllers → services → db layer)

#### TC-CQ-11 — layer_view: boundary (max_depth = 1)
- **Action:** `cartography_queries.layer_view`
- **Input:** `{ action: 'cartography_queries.layer_view', params: { workspace_path: '/fixtures/server-workspace', max_depth: 1 } }`
- **Expected:**
  - `data.data.layers.length: 1`
  - Root layer only returned
  - Optionally: `diagnostics[0].code: 'PARTIAL_RESULT'`
- **Expected DiagnosticCode:** `PARTIAL_RESULT` (optional, depends on implementation)

#### TC-CQ-12 — layer_view: malformed (max_depth exceeds limit)
- **Action:** `cartography_queries.layer_view`
- **Input:** `{ action: 'cartography_queries.layer_view', params: { workspace_path: '/fixtures/server-workspace', max_depth: 999 } }`
- **Expected:**
  - Preflight clamps to `MAX_DEPTH_LIMIT = 10` OR rejects with `INVALID_PARAMS`
  - If clamped: result returned with `max_depth` effective = 10
  - If rejected: `diagnostics[0].code: 'INVALID_PARAMS'`
- **Expected DiagnosticCode:** `INVALID_PARAMS` or clamped result

---

### A5. search (3 test cases)

#### TC-CQ-13 — search: positive case (symbol search)
- **Action:** `cartography_queries.search`
- **Input:** `{ action: 'cartography_queries.search', params: { workspace_path: '/fixtures/server-workspace', query: 'handleMemoryContext' } }`
- **Expected:**
  - `success: true`
  - `data.data.results: Array<{ name: string, file: string, line: number, kind: string }>` (non-empty)
  - `data.data.results[0].name` contains `handleMemoryContext`
- **Fixture:** Workspace with `memory_context.ts` containing `handleMemoryContext`

#### TC-CQ-14 — search: boundary (no results)
- **Action:** `cartography_queries.search`
- **Input:** `{ action: 'cartography_queries.search', params: { workspace_path: '/fixtures/server-workspace', query: 'xyzzzNonExistentSymbol12345' } }`
- **Expected:**
  - `success: true`
  - `data.data.results: []`
  - `diagnostics: []` (empty list is valid, not an error)

#### TC-CQ-15 — search: malformed (query too long / injection attempt)
- **Action:** `cartography_queries.search`
- **Input:** `{ action: 'cartography_queries.search', params: { workspace_path: '/fixtures/server-workspace', query: "'; DROP TABLE plans; --" } }`
- **Expected:**
  - `diagnostics[0].code: 'INVALID_PARAMS'` (SQL operator injection blocked)
  - OR: query sanitized and returns empty results
  - No DB mutation in either case
- **Expected DiagnosticCode:** `INVALID_PARAMS`

---

## Part B: dependencies_dependents Actions (12 Test Cases)

### Parity Check Requirement

All dependency output nodes/edges must match the `plans.depends_on_plans` FK data when queried for the same `plan_id`. The test fixture must seed both the FK column and the `plan_dependencies` table with consistent data to verify this.

### B1. get_dependencies (3 test cases)

#### TC-DD-01 — get_dependencies: positive case
- **Action:** `dependencies_dependents.get_dependencies`
- **Input:** `{ action: 'dependencies_dependents.get_dependencies', params: { plan_id: 'plan_fixture_A', depth: 2 } }`
- **Expected:**
  - `success: true`
  - `data.data.nodes: Array<{ id: string, title: string }>` (non-empty; fixture has 2 deps)
  - `data.data.edges: Array<{ from: string, to: string }>` (2 edges)
  - Parity: `nodes` IDs must match `plans.depends_on_plans` for `plan_fixture_A`
- **Fixture:** `plan_fixture_A` with `depends_on_plans: ['plan_fixture_B', 'plan_fixture_C']`

#### TC-DD-02 — get_dependencies: boundary (plan with no dependencies)
- **Action:** `dependencies_dependents.get_dependencies`
- **Input:** `{ action: 'dependencies_dependents.get_dependencies', params: { plan_id: 'plan_fixture_leaf', depth: 1 } }`
- **Expected:**
  - `success: true`
  - `data.data.nodes: []`
  - `data.data.edges: []`
  - Parity: `plans.depends_on_plans` for `plan_fixture_leaf` = `[]`
- **Fixture:** Leaf plan with no dependencies

#### TC-DD-03 — get_dependencies: malformed (non-existent plan_id)
- **Action:** `dependencies_dependents.get_dependencies`
- **Input:** `{ action: 'dependencies_dependents.get_dependencies', params: { plan_id: 'plan_does_not_exist', depth: 1 } }`
- **Expected:**
  - `diagnostics[0].code: 'NOT_FOUND'`
  - `data.data.nodes: []` or absent
- **Expected DiagnosticCode:** `NOT_FOUND`

---

### B2. get_dependents (3 test cases)

#### TC-DD-04 — get_dependents: positive case
- **Action:** `dependencies_dependents.get_dependents`
- **Input:** `{ action: 'dependencies_dependents.get_dependents', params: { plan_id: 'plan_fixture_B', depth: 1 } }`
- **Expected:**
  - `success: true`
  - `data.data.nodes` contains `plan_fixture_A` (which depends on B)
  - `data.data.edges[0].to: 'plan_fixture_B'`
- **Fixture:** Same as TC-DD-01

#### TC-DD-05 — get_dependents: boundary (plan with many dependents, cursor pagination)
- **Action:** `dependencies_dependents.get_dependents`
- **Input:** `{ action: 'dependencies_dependents.get_dependents', params: { plan_id: 'plan_fixture_popular', limit: 2, cursor: null } }`
- **Expected:**
  - `data.data.nodes.length: 2`
  - `data.data.next_cursor: string` (pagination cursor present)
  - Second call with `cursor` returns next page
- **Fixture:** `plan_fixture_popular` has 5 dependents

#### TC-DD-06 — get_dependents: malformed (invalid plan_id format)
- **Action:** `dependencies_dependents.get_dependents`
- **Input:** `{ action: 'dependencies_dependents.get_dependents', params: { plan_id: '../../etc/passwd', depth: 1 } }`
- **Expected:**
  - `diagnostics[0].code: 'INVALID_PARAMS'` (plan_id must match `plan_[a-z0-9_]+`)
- **Expected DiagnosticCode:** `INVALID_PARAMS`

---

### B3. get_dependency_graph (3 test cases)

#### TC-DD-07 — get_dependency_graph: positive case (small graph)
- **Action:** `dependencies_dependents.get_dependency_graph`
- **Input:** `{ action: 'dependencies_dependents.get_dependency_graph', params: { root_plan_id: 'plan_fixture_A', depth: 3 } }`
- **Expected:**
  - `success: true`
  - `data.data.nodes: Array<DependencyNode>` (includes all transitively reachable plans within depth 3)
  - `data.data.edges: Array<DependencyEdge>`
  - `data.data.has_cycles: false` (no cycles in fixture)
- **Schema:** must match `DependencyGraph` from `dependency-types.ts`
- **Fixture:** A→B→C chain

#### TC-DD-08 — get_dependency_graph: boundary (graph with cycle)
- **Action:** `dependencies_dependents.get_dependency_graph`
- **Input:** `{ action: 'dependencies_dependents.get_dependency_graph', params: { root_plan_id: 'plan_fixture_cycle_root', depth: 5 } }`
- **Expected:**
  - `success: true`
  - `data.data.has_cycles: true`
  - `data.data.cycle_paths: Array<string[]>` (one or more cycle paths listed)
  - Result does NOT infinite-loop (DFS terminates)
- **Fixture:** X→Y→X cycle (2-node cycle)

#### TC-DD-09 — get_dependency_graph: malformed (depth exceeds limit)
- **Action:** `dependencies_dependents.get_dependency_graph`
- **Input:** `{ action: 'dependencies_dependents.get_dependency_graph', params: { root_plan_id: 'plan_fixture_A', depth: 50 } }`
- **Expected:**
  - Preflight clamps to `MAX_DEPENDENCY_DEPTH` (e.g., 10) OR rejects with `INVALID_PARAMS`
- **Expected DiagnosticCode:** `INVALID_PARAMS` (if not clamped)

---

### B4. detect_cycles (3 test cases)

#### TC-DD-10 — detect_cycles: positive case (no cycles)
- **Action:** `dependencies_dependents.detect_cycles`
- **Input:** `{ action: 'dependencies_dependents.detect_cycles', params: { workspace_id: 'project_memory_mcp-50e04147a402' } }`
- **Expected:**
  - `success: true`
  - `data.data.cycles_detected: false`
  - `data.data.cycle_paths: []`
- **Fixture:** Workspace with only DAG-shaped plan dependencies

#### TC-DD-11 — detect_cycles: boundary (workspace with actual cycle)
- **Action:** `dependencies_dependents.detect_cycles`
- **Input:** `{ action: 'dependencies_dependents.detect_cycles', params: { workspace_id: 'fixture_workspace_with_cycle' } }`
- **Expected:**
  - `success: true`
  - `data.data.cycles_detected: true`
  - `data.data.cycle_paths.length ≥ 1`
  - `data.data.cycle_paths[0]` is an array of plan IDs forming the cycle
- **Fixture:** Seeded workspace with X→Y→X cycle

#### TC-DD-12 — detect_cycles: malformed (non-existent workspace_id)
- **Action:** `dependencies_dependents.detect_cycles`
- **Input:** `{ action: 'dependencies_dependents.detect_cycles', params: { workspace_id: 'workspace_does_not_exist' } }`
- **Expected:**
  - `diagnostics[0].code: 'NOT_FOUND'`
- **Expected DiagnosticCode:** `NOT_FOUND`

---

## Schema Conformance Requirement

All responses from `cartography_queries` actions must conform to:
- `FileEntry`, `SymbolEntry`, `ReferenceEntry` in `server/src/cartography/contracts/types.ts`

All responses from `dependencies_dependents` actions must conform to:
- `DependencyNode`, `DependencyEdge`, `DependencyGraph` in `server/src/cartography/contracts/dependency-types.ts`

Conformance validation approach:
1. Import TypeScript types in vitest test files
2. Use `satisfies` type assertion on response data shapes
3. If types don't compile: fail immediately (schema mismatch bug)

---

## Test Infrastructure Notes

- **Test runner:** vitest (matching existing server test pattern)
- **DB fixtures:** Use `better-sqlite3` in-memory DB seeded in `beforeEach` hooks
- **Python core fixtures:** Mock the `PythonBridge` response for cartography_queries tests (Python core stubs don't return real data yet)
- **Fixture workspace path:** Use a dedicated `test/fixtures/` directory with known file structures
- **Isolation:** Each test case's fixture DB is seeded fresh; no shared state between test cases

---

## Cross-References

- [Cartography action inventory (17 actions)](../memory-cartographer-action-inventory.md)
- [Dependency traversal contract + types](../dependency-traversal-contract.md)
- [TypeScript contracts: dependency-types.ts](../../../server/src/cartography/contracts/dependency-types.ts)
- [Auth/injection guard (validates INVALID_PARAMS behavior)](../architecture/auth-session-architecture.md)
- [Action params preflight spec](../../../server/src/tools/preflight/action-params-cartography.ts)
