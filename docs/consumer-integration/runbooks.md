# memory_cartographer — Operational Runbooks

**Plan:** Consumer Integration & Validation: agent routing usage, tests, and cross-surface docs  
**Phase:** Documentation  
**Step:** 14 — Operational runbooks  
**Status:** Reference (operational)

---

## Build & Install

### Full Build (All Components)

Run from the workspace root:

```powershell
cd Project-Memory-MCP
.\install.ps1
```

Or to build only the server component:

```powershell
cd Project-Memory-MCP
.\install.ps1 -Component Server
```

### Server-Only Build (Direct)

Use this for quick server rebuilds during development or diagnostics:

```powershell
cd Project-Memory-MCP/server
npm run build
```

### TypeScript Compile Check (No Emit)

Use to verify type correctness without producing output files:

```powershell
cd Project-Memory-MCP/server
npx tsc --noEmit
```

**Run this after every modification** to `memory_cartographer.ts`, `action-params-cartography.ts`, or `tool-action-mappings.ts`.

---

## Running Tests for memory_cartographer

### Wrapper Command (Preferred)

Run the three `memory_cartographer`-scoped test files via the test wrapper:

```powershell
cd Project-Memory-MCP
.\run-tests.ps1 -Component Server -TestArg 'Server=src/__tests__/tools/memory-cartographer-integration.test.ts src/__tests__/tools/memory-cartographer-regression.test.ts src/__tests__/tools/memory-cartographer-benchmark.test.ts'
```

This runs:
- `memory-cartographer-integration.test.ts` — End-to-end Phase A action coverage + degraded path tests
- `memory-cartographer-regression.test.ts` — Invariant regression gates (masking, auth, read-only)
- `memory-cartographer-benchmark.test.ts` — Latency/throughput baselines

### Full Server Test Suite

Run all server tests (includes cartographer tests plus all other server coverage):

```powershell
cd Project-Memory-MCP
.\run-tests.ps1 -Component Server
```

### Full Output on Failure

To get verbose output when a test fails (useful for CI debugging or tracing fixture issues):

```powershell
cd Project-Memory-MCP
.\run-tests.ps1 -Component Server -FullOutputOnFailure
```

---

## Known Limitations

### Phase B Actions Return FEATURE_NOT_AVAILABLE

The following actions are Python-blocked stubs. They will return `FEATURE_NOT_AVAILABLE` until the Python core `cartograph` intent is fully implemented:

**`cartography_queries` (all 5 actions):**
- `cartography_queries.summary`
- `cartography_queries.file_context`
- `cartography_queries.flow_entry_points`
- `cartography_queries.layer_view`
- `cartography_queries.search`

**`architecture_slices` (3 Phase B actions):**
- `architecture_slices.slice_detail`
- `architecture_slices.slice_projection`
- `architecture_slices.slice_filters`

> **These are expected stubs, not bugs.** The test suite includes 11 `it.todo` entries for Phase B actions — these are intentionally deferred and should not be treated as failures.

### `context_data` Is Always Masked — By Design

The `context_items.context_data` column is **never returned** in any `database_map_access` response. This is a deliberate, non-configurable security invariant. The `context_items_projection` action returns `data_preview` (first 500 chars) for safe context inspection.

If you need the full context data for a plan or workspace, use `memory_context(action: get)` via the appropriate authorized agent — not `memory_cartographer`.

### `architecture_slices.slice_catalog` IS Phase A (Implemented)

Despite the Phase B stubs in the `architecture_slices` domain, `slice_catalog` is **fully implemented in Phase A** via SQLite. It is safe to call and returns the registered slice registry for a workspace.

---

## Troubleshooting Common Errors

### PERMISSION_DENIED

**Symptom:** Tool returns `{ success: false, diagnostics: [{ code: "PERMISSION_DENIED" }] }`

**Cause:** The calling agent's `agent_type` is not in the authorized list.

**Fix:**
1. Check which agent type is making the call (inspect your session context).
2. Verify `tool-action-mappings.ts` for the authorized type list.
3. Route the call through an authorized spoke agent: `Coordinator`, `Analyst`, `Executor`, `Researcher`, or `Architect`.
4. Do **not** call `memory_cartographer` from `Tester`, `Revisionist`, or `Archivist` sessions.

**Reference:** `server/src/tools/preflight/tool-action-mappings.ts`

---

### EMPTY_RESULT

**Symptom:** Action returns `success: true` but `nodes: []` / `tables: []` / empty result, possibly with an `EMPTY_RESULT` diagnostic.

**Cause:** The database adapter returned null or no matching rows. Common causes:
- The target plan has no dependencies registered
- The workspace has not been indexed/reindexed after changes
- The specified `plan_id` does not exist in the database

**Fix:**
1. Confirm the plan or entity exists: call `memory_plan(action: get)` and verify.
2. If the workspace was recently modified, run `memory_workspace(action: reindex)`.
3. Check that `plan_id` follows the format `plan_[a-z0-9_]+`.
4. Treat as a valid empty state in your consumer code — `EMPTY_RESULT` is not an error condition that requires retry.

---

### FEATURE_NOT_AVAILABLE

**Symptom:** Action returns a diagnostic with `code: "FEATURE_NOT_AVAILABLE"`.

**Cause:** A Phase B stub action was called before Phase B is implemented.

**Fix:** This is expected behavior. Do not treat as a bug. Apply a no-op fallback in consumer code and continue. Check the [Phase B stub list](#phase-b-actions-return-feature_not_available) above to confirm the action is in Phase B scope.

---

### TypeScript Compile Errors

**Symptom:** `npx tsc --noEmit` fails in `server/`.

**Common causes and fixes:**

| Error pattern | Likely cause | Fix |
|---------------|-------------|-----|
| Type error in `action-params-cartography.ts` | New action added without correct param spec shape | Check `CartographyActionParamSpec` type definition; ensure all required fields are present |
| `handleMemoryCartographer` not found | Export missing from `consolidated/index.ts` | Verify the export in `server/src/tools/consolidated/index.ts` |
| Unknown action string | Action name in handler doesn't match registered name | Cross-check action string in `memory_cartographer.ts` against `action-params-cartography.ts` |
| Import error for dependency types | Missing import from `cartography/contracts/dependency-types.ts` | Add the missing import explicitly |
| `access_control` or `agent_type` shape mismatch | preflight type contract changed | Check `tool-action-mappings.ts` for current type shapes |

**Run after fix:**
```powershell
cd Project-Memory-MCP/server
npx tsc --noEmit
```

---

## Test Results Baseline

*Recorded at initial implementation (Phase A complete):*

| Metric | Value |
|--------|-------|
| Total active tests | 92 / 92 passing |
| Phase B `it.todo` entries | 11 (expected — deferred) |
| TC-DM-05 P0 security gate (context_data masking) | **PASS** |
| TC-DM-09 masking invariant | **PASS** |
| Authorization gate | **PASS** |
| Phase A happy path (all `dependencies_dependents` + `database_map_access`) | **PASS** |
| Regression invariants | **PASS** |
| Benchmark baseline captured | **PASS** |

> Any regression below 92/92 on active tests (excluding `it.todo`) should be treated as a blocking issue before merge. TC-DM-05 failure is a **P0 security bug** — do not ship.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| [`server/src/tools/memory_cartographer.ts`](../../server/src/tools/memory_cartographer.ts) | Main handler — action dispatch, domain routing, error wrapping |
| [`server/src/tools/preflight/action-params-cartography.ts`](../../server/src/tools/preflight/action-params-cartography.ts) | Param specs for all 17 actions (`CartographyActionParamSpec`) |
| [`server/src/tools/preflight/tool-action-mappings.ts`](../../server/src/tools/preflight/tool-action-mappings.ts) | Agent type authorization mappings for all tools including `memory_cartographer` |
| [`server/src/tools/consolidated/index.ts`](../../server/src/tools/consolidated/index.ts) | Consolidated export — exports `handleMemoryCartographer` |
| [`server/src/index.ts`](../../server/src/index.ts) | MCP tool registration — where `server.tool('memory_cartographer', ...)` is registered |
| [`server/src/__tests__/tools/memory-cartographer-integration.test.ts`](../../server/src/__tests__/tools/memory-cartographer-integration.test.ts) | Integration test suite (Phase A end-to-end + degraded paths) |
| [`server/src/__tests__/tools/memory-cartographer-regression.test.ts`](../../server/src/__tests__/tools/memory-cartographer-regression.test.ts) | Regression test suite (invariants: masking, auth, read-only) |
| [`server/src/__tests__/tools/memory-cartographer-benchmark.test.ts`](../../server/src/__tests__/tools/memory-cartographer-benchmark.test.ts) | Benchmark test suite (latency/throughput baselines) |
| [`docs/consumer-integration/integration-contract.md`](./integration-contract.md) | Full input/output contract per domain (authoritative spec) |
| [`docs/consumer-integration/handoff-graph.md`](./handoff-graph.md) | Agent handoff graph with cartographer routing |
| [`docs/consumer-integration/validation-matrix.md`](./validation-matrix.md) | Test case matrix mapping all 51+ test cases to dimensions |

---

*See also:*
- [usage-guide.md](./usage-guide.md) — Consumer API reference, auth table, error codes, fallback patterns
- [integration-contract.md](./integration-contract.md) — Full parameter and response contracts per domain
