# Validation Matrix

**Plan:** Consumer Integration & Validation: agent routing usage, tests, and cross-surface docs  
**Phase:** Planning  
**Step:** 3 — Validation matrix  
**Status:** Specification (test implementation targets steps 8-10 in Validation phase)

---

## Overview

This document defines the complete validation matrix for `memory_cartographer` consumer integration. It covers: integration test dimensions (happy/degraded/failure paths), regression test dimensions (invariants), benchmark dimensions (latency/throughput), mapping of all 51 upstream test cases (27 + 24) to test categories, Phase A vs Phase B test scope, baseline capture strategy, and pass/fail acceptance criteria.

---

## 1. Integration Test Dimensions

Integration tests verify end-to-end behavior across the consumer integration path: from agent tool call → preflight → domain handler → response → consumer fallback.

### 1.1 Happy Path

Test that each action returns correct, well-formed data when provided valid inputs and when upstream dependencies are available.

| Dimension | Criteria |
|-----------|----------|
| Valid input, valid fixture | `success: true`, typed response matches TypeScript contract |
| `_session_id` included | Response echoes `_session_id`; session correlation active |
| Empty result is valid | `nodes: []`, `tables: []`, `results: []` — all valid; `success: true` |
| Partial result with WARN | `success: true` with `diagnostics[].severity === 'WARN'`; result processed normally |
| Pagination | `next_cursor` present when results exceed page size; follow-up call returns next page |

**Phase A happy path coverage (executable immediately):**  
- All `dependencies_dependents` actions with seeded plan fixture (TC-DD-01, TC-DD-04, TC-DD-07, TC-DD-10)
- All `database_map_access` actions with seeded DB fixture (TC-DM-01, TC-DM-04, TC-DM-07, TC-DM-10)
- `architecture_slices.slice_catalog` with populated slice registry

**Phase B happy path coverage (requires Python core):**  
- All `cartography_queries` actions with workspace fixture (TC-CQ-01, TC-CQ-04, TC-CQ-07, TC-CQ-10, TC-CQ-13)
- `architecture_slices.slice_detail/projection/filters` with Python bridge mock, then real bridge

### 1.2 Degraded Path (Python Unavailable)

Tests that verify correct consumer behavior when the Python bridge returns an error or stub response.

| Scenario | Expected behavior |
|----------|------------------|
| `cartography_queries.*` called before Python core ready | Response contains `PYTHON_CORE_ERROR`; consumer uses fallback (no throw) |
| `architecture_slices.slice_detail` called with bridge stub | `PYTHON_CORE_ERROR` diagnostic; TypeScript handler structure still correct |
| Python bridge timeout | `TIMEOUT` diagnostic; action returns gracefully within handler timeout |
| Python bridge returns schema version mismatch | `SCHEMA_MISMATCH` diagnostic; no crash |
| Phase A SQLite domains work normally | `dependencies_dependents` and `database_map_access` unaffected by Python unavailability |

**Test fixture:** Mock `PythonCoreAdapter.invoke()` to return a `TODO` error stub (matching current Python core behavior).

### 1.3 Hard Failure (Null / Error Response)

Tests that consumers behave correctly under worst-case conditions: missing data, invalid params, unauthorized access.

| Scenario | Expected behavior |
|----------|------------------|
| `action` not in enum | `UNKNOWN_ACTION` / `INVALID_PARAMS`; `success: false` or diagnostic |
| Missing required param (e.g., `workspace_id`) | `INVALID_PARAMS` in diagnostics; no crash |
| Non-existent `plan_id` | `NOT_FOUND` in diagnostics; `nodes: []` |
| Table not in allowlist | `ACCESS_DENIED`; no SQL executed |
| Unauthorized agent type | `ACCESS_DENIED` from preflight; no dispatch |
| Path traversal in `file_id` | `ACCESS_DENIED`; no file system access |
| `plan_id` format invalid (not `plan_[a-z0-9_]+`) | `INVALID_PARAMS` |
| `depth_limit` > max | Clamped to max OR `INVALID_PARAMS` |
| SQL injection in `table_name` | `ACCESS_DENIED` (allowlist blocks it) |
| SQL operator in `query` param | `INVALID_PARAMS` or sanitized; no DB mutation |
| `success: false` from server | Consumer logs, returns null/fallback; does not throw |

---

## 2. Regression Test Dimensions

Regression tests verify that critical invariants are preserved across implementation changes. These must be re-run on every modification to `memory_cartographer.ts`, `action-params-cartography.ts`, or `tool-action-mappings.ts`.

### 2.1 DB Mapping Invariants

Verify that `dependencies_dependents` query results are consistent with raw `plans.depends_on_plans` FK data for the same `plan_id`.

| Check | Assertion |
|-------|-----------|
| Parity: `get_plan_dependencies` vs FK column | `nodes` IDs in response match `plans.depends_on_plans` for target plan |
| Parity: `reverse_dependent_lookup` vs FK reverse | Returned dependents match all plans with FK pointing to target |
| Empty graph consistency | Plan with no dependencies → `nodes: []`, `edges: []` forever |
| Cycle detection termination | Cyclic graph traversal terminates without infinite loop; `has_cycles: true` with `cycle_path` |

**Test case coverage:** TC-DD-01 through TC-DD-12 (all 12 dependency test cases)

### 2.2 `context_data` Masking (Security Regression)

Verify that `context_items.context_data` is never exposed through any `database_map_access` action path.

| Check | Assertion |
|-------|-----------|
| TC-DM-05: `describe_table('context_items')` | `columns` array does NOT include `{ name: 'context_data' }` |
| `db_node_lookup('context_items', id)` | `row.context_data` is absent or `"[REDACTED]"` |
| `context_items_projection` | `items[].data_preview` is truncated (≤ 500 chars); never includes full `context_data` |
| After code changes to `DbMapService` | Re-run TC-DM-05 as first priority before any other test |

**Classification:** TC-DM-05 is a **security regression test**. Failure is a security bug requiring immediate block before plan can proceed.

### 2.3 Authorized-Agent Enforcement

Verify that `preflightValidate()` correctly rejects unauthorized agent types for all 17 actions.

| Check | Assertion |
|-------|-----------|
| `Tester` calling any action | `ACCESS_DENIED` in diagnostics; no domain dispatch |
| `Revisionist` calling any action | `ACCESS_DENIED`; no dispatch |
| `Archivist` calling any action | `ACCESS_DENIED`; no dispatch |
| New agent type added to system | Default should be **denied** unless explicitly added to `tool-action-mappings.ts` |
| `Executor` calling `database_map_access.db_map_summary` | Authorized; returns valid result |
| Verify all 5 authorized types | `Researcher`, `Architect`, `Coordinator`, `Analyst`, `Executor` — all return data for each domain |

### 2.4 Cross-Surface Response Consistency

Verify that `memory_cartographer` returns consistent responses regardless of caller surface (MCP chat agent, direct vitest test, CI script).

| Surface | Check |
|---------|-------|
| MCP chat agent (with `_session_id`) | Response shape identical to non-session call; `_session_id` echoed back |
| Direct vitest test (no `_session_id`) | Response shape identical; `_session_id` field absent from response |
| Call with valid inputs from two different agent types | Same input → same output (deterministic for SQLite domains) |
| Call to `db_map_summary` from `Architect` vs `Researcher` | Identical response (authorization doesn't change result shape) |
| Phase A SQLite domains (no mocking) | Same results in test and in production server instance |

---

## 3. Benchmark Dimensions

Benchmarks establish latency baselines and throughput targets for each domain. These are captured at Phase A acceptance (SQLite domains) and at Phase B launch (Python domains).

### 3.1 Action Latency Targets

| Domain | p50 target | p95 target | Alerting threshold | Measurement condition |
|--------|-----------|-----------|-------------------|----------------------|
| `dependencies_dependents` | < 50ms | < 100ms | > 500ms | Live DB; workspace with 10+ plans |
| `database_map_access` | < 30ms | < 80ms | > 300ms | Seeded SQLite fixture; 5 tables |
| `cartography_queries` | < 500ms | < 2000ms | > 10000ms | Python bridge mock; Phase B real bridge |
| `architecture_slices` (detail) | < 1000ms | < 3000ms | > 15000ms | Python bridge mock; Phase B real bridge |

> **P95 target rationale:** P95 at 100ms for SQLite domains means 19 out of 20 calls complete in under 100ms. This is the consumer-facing acceptance threshold, not just a design goal.

### 3.2 Throughput Targets

| Domain | Sustained throughput | Test condition |
|--------|---------------------|----------------|
| `dependencies_dependents` | ≥ 50 calls/sec | Concurrent calls with isolated DB reads |
| `database_map_access` | ≥ 80 calls/sec | `db_map_summary` repeated calls |
| `cartography_queries` | ≥ 0.5 calls/sec | Python bridge (latency-bound) |

### 3.3 Memory Overhead

| Scope | Limit | Measurement |
|-------|-------|-------------|
| Per `bounded_traversal` call | < 50 MB heap delta | 100-node graph traversal |
| Per `slice_projection` call | < 100 MB heap delta | 1000-item projection |
| Server restart required | Never (no memory leak) | 1000 sequential calls; no heap growth trend |

---

## 4. Test Case Map

The following table maps all 51 upstream test cases (27 from `cartography-query-test-plan.md` + 24 from `slice-dbmap-test-plan.md`) to test type categories and Phase readiness.

### Classification Legend

| Category | Meaning |
|----------|---------|
| `unit` | Tests a single domain handler function in isolation with mock DB or mock bridge |
| `integration` | Tests the full tool call path (input → preflight → dispatch → response) with real fixture |
| `regression` | A specific invariant that must be re-checked on every change to the relevant code |
| `benchmark` | Latency / throughput measurement; generates a numeric result to compare against baseline |

---

### Part A: cartography_queries (15 cases — Phase B)

| Test Case | Action | Category | Phase | Priority |
|-----------|--------|----------|-------|----------|
| TC-CQ-01 | `cartography_queries.summary` — positive | integration | B | P1 |
| TC-CQ-02 | `cartography_queries.summary` — empty workspace | integration | B | P2 |
| TC-CQ-03 | `cartography_queries.summary` — missing params | unit | B | P1 |
| TC-CQ-04 | `cartography_queries.file_context` — positive | integration | B | P1 |
| TC-CQ-05 | `cartography_queries.file_context` — no exports | integration | B | P2 |
| TC-CQ-06 | `cartography_queries.file_context` — path traversal | regression | B | P0 |
| TC-CQ-07 | `cartography_queries.flow_entry_points` — positive | integration | B | P1 |
| TC-CQ-08 | `cartography_queries.flow_entry_points` — empty | integration | B | P2 |
| TC-CQ-09 | `cartography_queries.flow_entry_points` — bad workspace | unit | B | P1 |
| TC-CQ-10 | `cartography_queries.layer_view` — positive | integration | B | P1 |
| TC-CQ-11 | `cartography_queries.layer_view` — max_depth=1 | integration | B | P2 |
| TC-CQ-12 | `cartography_queries.layer_view` — depth exceeds limit | unit | B | P1 |
| TC-CQ-13 | `cartography_queries.search` — positive | integration | B | P1 |
| TC-CQ-14 | `cartography_queries.search` — no results | integration | B | P2 |
| TC-CQ-15 | `cartography_queries.search` — SQL injection | regression | B | P0 |

### Part B: dependencies_dependents (12 cases — Phase A)

| Test Case | Action | Category | Phase | Priority |
|-----------|--------|----------|-------|----------|
| TC-DD-01 | `dependencies_dependents.get_plan_dependencies` — positive | integration | **A** | P1 |
| TC-DD-02 | `dependencies_dependents.get_plan_dependencies` — leaf plan | integration | **A** | P2 |
| TC-DD-03 | `dependencies_dependents.get_plan_dependencies` — not found | unit | **A** | P1 |
| TC-DD-04 | `dependencies_dependents.get_dependencies` — positive | integration | **A** | P1 |
| TC-DD-05 | `dependencies_dependents.get_dependencies` — pagination | integration | **A** | P2 |
| TC-DD-06 | `dependencies_dependents.get_dependencies` — invalid plan_id | regression | **A** | P0 |
| TC-DD-07 | `dependencies_dependents.bounded_traversal` — positive | integration | **A** | P1 |
| TC-DD-08 | `dependencies_dependents.bounded_traversal` — cycle | regression | **A** | P0 |
| TC-DD-09 | `dependencies_dependents.bounded_traversal` — depth exceeded | unit | **A** | P1 |
| TC-DD-10 | `dependencies_dependents.reverse_dependent_lookup` — no cycles | integration | **A** | P1 |
| TC-DD-11 | `dependencies_dependents.reverse_dependent_lookup` — workspace cycle | regression | **A** | P0 |
| TC-DD-12 | `dependencies_dependents.reverse_dependent_lookup` — bad workspace | unit | **A** | P1 |

### Part C: architecture_slices (12 cases — Phase B, except slice_catalog)

| Test Case | Action | Category | Phase | Priority |
|-----------|--------|----------|-------|----------|
| TC-AS-01 | `architecture_slices.slice_detail` — full projection | integration | B | P1 |
| TC-AS-02 | `architecture_slices.slice_detail` — summary projection | integration | B | P2 |
| TC-AS-03 | `architecture_slices.slice_detail` — non-existent layer | unit | B | P1 |
| TC-AS-04 | `architecture_slices.slice_projection` — positive | integration | B | P1 |
| TC-AS-05 | `architecture_slices.slice_projection` — single-layer | integration | B | P2 |
| TC-AS-06 | `architecture_slices.slice_projection` — missing params | unit | B | P1 |
| TC-AS-07 | `architecture_slices.slice_filters` — positive | integration | B | P1 |
| TC-AS-08 | `architecture_slices.slice_filters` — circular dependency | regression | B | P0 |
| TC-AS-09 | `architecture_slices.slice_filters` — path traversal | regression | B | P0 |
| TC-AS-10 | `architecture_slices.slice_catalog` — positive | integration | **A** | P1 |
| TC-AS-11 | `architecture_slices.slice_catalog` — 0 coupling | integration | B | P2 |
| TC-AS-12 | `architecture_slices.slice_catalog` — SQL injection in layer | regression | B | P0 |

> **Note:** TC-AS-10 maps to `slice_catalog` (Phase A). TC-AS-01 through TC-AS-09 and TC-AS-11/12 map to Phase B slice actions. The upstream test plan uses different action labels; classification above reflects the canonical action inventory names.

### Part D: database_map_access (12 cases — Phase A)

| Test Case | Action | Category | Phase | Priority |
|-----------|--------|----------|-------|----------|
| TC-DM-01 | `database_map_access.db_map_summary` — positive | integration | **A** | P1 |
| TC-DM-02 | `database_map_access.db_map_summary` — filter | integration | **A** | P2 |
| TC-DM-03 | `database_map_access.db_map_summary` — bad workspace | unit | **A** | P1 |
| TC-DM-04 | `database_map_access.db_node_lookup` — plans table | integration | **A** | P1 |
| TC-DM-05 | `database_map_access.db_node_lookup` — context_items masked | **regression** | **A** | **P0** |
| TC-DM-06 | `database_map_access.db_node_lookup` — non-allowlisted | regression | **A** | P0 |
| TC-DM-07 | `database_map_access.db_edge_lookup` — plans table | integration | **A** | P1 |
| TC-DM-08 | `database_map_access.db_edge_lookup` — no FK relations | integration | **A** | P2 |
| TC-DM-09 | `database_map_access.db_edge_lookup` — SQL injection | regression | **A** | P0 |
| TC-DM-10 | `database_map_access.context_items_projection` — positive | integration | **A** | P1 |
| TC-DM-11 | `database_map_access.context_items_projection` — no touchpoints | integration | **A** | P2 |
| TC-DM-12 | `database_map_access.context_items_projection` — non-allowlisted | regression | **A** | P0 |

### Priority Key

| Priority | Meaning |
|----------|---------|
| P0 | Security or correctness regression — must pass before any code lands |
| P1 | Core functionality — must pass before phase acceptance |
| P2 | Boundary/edge case — must pass before final review |

---

## 5. Phase A Test Scope

**Immediately executable — no Python required:**

- **24 test cases:** TC-DD-01 through TC-DD-12 (all 12 dependency cases) + TC-DM-01 through TC-DM-12 (all 12 DB map cases)
- **+1 case:** TC-AS-10 (`slice_catalog` — SQLite-backed)
- **Total Phase A tests: 25**

**Phase A test infrastructure requirements:**
- `better-sqlite3` in-memory DB seeded in `beforeEach` fixtures
- Plan fixture: `plan_fixture_A` with 2 dependencies (`plan_fixture_B`, `plan_fixture_C`)
- Cycle fixture: `plan_fixture_cycle_root` → `plan_fixture_Y` → `plan_fixture_cycle_root`
- DB map fixture: `db-map-fixture.db` (seeded per `slice-dbmap-test-plan.md` deterministic spec)
  - `context_items` table with populated `context_data` rows (for masking test)
  - `secrets_test_table` (for allowlist enforcement test)
- Test runner: vitest (matches existing server test pattern)
- Schema validation: TypeScript `satisfies` assertions on response shapes

**Phase A acceptance gate:** All 25 Phase A test cases pass. TC-DM-05 (`context_data` masking) must pass as a precondition — failure blocks acceptance.

---

## 6. Baseline Capture Strategy

### Phase A Baseline (SQLite Domains — Capture at Phase A Acceptance)

When Phase A tests pass and server is ready for acceptance review, capture baselines for:

| Measurement | Method | Storage |
|-------------|--------|---------|
| p50/p95 latency per action (10 runs each) | vitest benchmark suite; `Date.now()` wrapping | `test/benchmarks/phase-a-baseline.json` |
| Memory delta per call type | Node.js `process.memoryUsage()` before/after | Same file |
| Response shape fingerprint | Jest snapshot of canonical response (happy path) | `test/snapshots/__snapshots__/` |

**Baseline update policy:** Baselines are updated only when:
1. An intentional implementation change alters latency characteristics
2. A new fixture is seeded (different data size)
3. Phase B launches and changes behavior of Phase A domains (should not happen — domains are independent)

**Baseline comparison rule:** If new measurement is > 150% of baseline on any P95 metric, flag as regression before merging.

### Phase B Baseline (Python-Blocked Domains — Capture at Phase B Launch)

Phase B baselines cannot be captured until Python core is fully implemented. At Phase B launch:

1. **Mock baseline first:** Run full test suite with the Python bridge mock and capture mock latency baselines. These represent TypeScript-layer overhead only.
2. **Real baseline second:** Replace mock with real `PythonCoreAdapter` calls. Capture real-bridge latencies.
3. **Gap analysis:** Compare mock vs real baselines. Gap = Python core processing time. Document in `test/benchmarks/phase-b-baseline.json`.

**Pre-Phase B capture requirement:** Before Phase B acceptance, the following must be in `test/benchmarks/`:
- `phase-b-baseline.json` with real-bridge latency measurements for all 5 `cartography_queries` actions
- `phase-b-baseline.json` with real-bridge latency for all 4 `architecture_slices` Phase B actions

---

## 7. Pass/Fail Criteria

### Integration Test Acceptance

| Requirement | Pass condition |
|-------------|---------------|
| Phase A integration tests | All 25 Phase A test cases pass (25/25) |
| Phase B integration tests (mocked) | All 27 Phase B mocked tests pass (with Python bridge mock) |
| Phase B integration tests (real) | All 27 Phase B real tests pass (requires Python core) |
| No regressions from prior test run | 0 previously-passing tests newly fail |

### Security Test Gate (P0 — blocks all other tests)

| Test case | Pass condition |
|-----------|---------------|
| TC-DM-05 (`context_data` masking) | `columns` array from `describe_table('context_items')` does NOT contain `context_data` |
| TC-CQ-06 (path traversal) | `ACCESS_DENIED`; no file content returned |
| TC-CQ-15 (SQL injection in search) | `INVALID_PARAMS` or sanitized; DB not mutated |
| TC-DM-09 (SQL injection in table_name) | `ACCESS_DENIED`; no SQL execution on injected string |

All P0 tests must pass before Phase A is accepted. A single P0 failure = immediate block.

### Latency Acceptance

| Metric | Threshold | Measurement |
|--------|-----------|-------------|
| `dependencies_dependents` p95 | ≤ 100ms | 20 benchmark runs on seeded fixture |
| `database_map_access` p95 | ≤ 80ms | 20 benchmark runs on seeded fixture |
| `cartography_queries` p95 (mock) | ≤ 200ms | TypeScript handler overhead only |
| `cartography_queries` p95 (real) | ≤ 2000ms | Full Python bridge round-trip |
| `architecture_slices` p95 (real) | ≤ 3000ms | Full Python bridge + graph computation |

Latency thresholds above 150% of the captured baseline (§6) are flagged as regressions even if they are within absolute limits.

### Coverage Acceptance

| Requirement | Threshold |
|-------------|-----------|
| Action exercise coverage (last 10 sessions) | ≥ 80% of 17 defined actions |
| P0 test pass rate | 100% (no exceptions) |
| P1 test pass rate | 100% (no exceptions) |
| P2 test pass rate | ≥ 95% (1 allowed boundary-only failure per domain) |
| TypeScript contract conformance | 100% (all `satisfies` assertions compile) |

### Phase Acceptance Gates

| Gate | Condition |
|------|-----------|
| Phase A acceptance | 25/25 Phase A tests pass; all 8 P0 tests pass; p95 latency within targets |
| Phase B (mocked) acceptance | 25+27 = 52 tests pass with mocks; TypeScript handler compiles; `memory_cartographer` server registration confirmed |
| Phase B (real) acceptance | All 52 tests pass with real bridge; Python core must return non-TODO responses for cartography actions |
| Final plan acceptance | All 51+1 test cases pass; coverage ≥ 80%; no security regressions; baselines captured |

---

## Test Infrastructure Summary

| Component | Technology | Notes |
|-----------|-----------|-------|
| Test runner | vitest | Matches existing server pattern |
| DB fixtures | `better-sqlite3` in-memory | Seeded in `beforeEach` per test file |
| Python bridge mock | vitest mock factory | `vi.mock('server/src/cartography/adapters/python-bridge.ts')` |
| Workspace fixture | `test/fixtures/fixture-workspace/` | 6-file deterministic structure (from `slice-dbmap-test-plan.md`) |
| DB map fixture | `test/fixtures/db-map-fixture.db` | Per deterministic spec in `slice-dbmap-test-plan.md` |
| Schema validation | TypeScript `satisfies` | Enforced at compile time; verifies TS contract conformance |
| Benchmark harness | vitest bench | `Date.now()` wrapping; 20-run samples per action |
| Snapshot baselines | vitest snapshots | Canonical happy-path response shapes |

---

## Cross-References

- [Integration contract (inputs/outputs, error modes, fallback policy)](./integration-contract.md)
- [Handoff graph (agent consumer map, session threading)](./handoff-graph.md)
- [Upstream test plan: cartography_queries + dependencies (27 cases)](../mcp-surface/validation/cartography-query-test-plan.md)
- [Upstream test plan: architecture_slices + DB map (24 cases)](../mcp-surface/validation/slice-dbmap-test-plan.md)
- [Observability architecture (latency budgets, DiagnosticCode severity)](../mcp-surface/architecture/observability-architecture.md)
- [Auth & session architecture (authorized agents, injection guard)](../mcp-surface/architecture/auth-session-architecture.md)
- [TypeScript contracts: dependency-types.ts](../../server/src/cartography/contracts/dependency-types.ts)
