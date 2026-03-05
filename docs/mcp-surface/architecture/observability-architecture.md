# Observability & Diagnostics Architecture

**Plan:** MCP Surface Integration: expose memory_cartographer actions/resources via consolidated tools  
**Phase:** Architecture  
**Step:** 12 — Observability & Diagnostics Architecture  
**Status:** Specification (no implementation required for this plan — implementation in a separate plan)

---

## Overview

This document defines the observability model for `memory_cartographer` tool invocations: what metrics are captured per call, how diagnostic codes map to observability severity levels, coverage metrics for Reviewer validation, and the pre-build check clause for schema consistency between `DiagnosticEntry` fields and this spec.

---

## 1. Per-Invocation Metrics

Every `memory_cartographer` action invocation should capture the following metrics at the telemetry layer:

| Metric | Type | Description |
|---|---|---|
| `latency_ms` | `number` | Wall-clock time from tool call entry to response return, in milliseconds |
| `action` | `string` | The action name as provided by the caller (e.g., `cartography_queries.summary`) |
| `domain` | `string` | The domain family: `cartography_queries`, `dependencies_dependents`, `architecture_slices`, `database_map_access` |
| `result_count` | `number \| null` | Number of result items returned (null for actions with non-list results such as `summary`) |
| `error_code` | `string \| null` | DiagnosticCode string if an error/warning occurred, null on clean success |
| `cache_hit` | `boolean` | Whether the result was served from a cache (false for this plan; cache layer not implemented) |
| `session_id` | `string \| null` | The `_session_id` value from tool input for correlation; null if not provided |

### Metric Collection Point

Metrics are collected in `memory_cartographer.ts` after action dispatch resolves:

```typescript
// Pseudocode — not yet implemented
const start = Date.now();
let error_code: string | null = null;
let result_count: number | null = null;

try {
  const result = await dispatch(action, params, context);
  result_count = extractResultCount(action, result);
  return result;
} catch (err) {
  error_code = normalizeErrorCode(err);
  throw err;
} finally {
  telemetry.emit('memory_cartographer.invocation', {
    latency_ms: Date.now() - start,
    action,
    domain: extractDomain(action),
    result_count,
    error_code,
    cache_hit: false,
    session_id: input._session_id ?? null
  });
}
```

### result_count Extraction Rules

| Action type | result_count value |
|---|---|
| `cartography_queries.summary` | `null` (scalar summary, not a list) |
| `cartography_queries.file_context` | number of `files` in response |
| `cartography_queries.flow_entry_points` | number of entry points returned |
| `cartography_queries.layer_view` | number of layer nodes |
| `cartography_queries.search` | number of search result items |
| `dependencies_dependents.*` | number of nodes in the graph |
| `architecture_slices.*` | number of nodes/edges in the slice |
| `database_map_access.list_tables` | number of tables returned |
| `database_map_access.describe_table` | number of columns returned |
| `database_map_access.*` | number of result rows |

---

## 2. DiagnosticCode → Observability Severity Mapping

The 11-code diagnostic taxonomy (from python-core `normalization.py` and the Foundation contract) maps to observability severity as follows:

| DiagnosticCode | Observability Severity | Meaning |
|---|---|---|
| `PARTIAL_RESULT` | `WARN` | Result was returned but may be incomplete (e.g., workspace too large, truncated) |
| `NOT_FOUND` | `WARN` | Requested entity not found; partial or empty result returned |
| `SCHEMA_MISMATCH` | `ERROR` | Python core output does not match expected schema version |
| `PYTHON_CORE_ERROR` | `ERROR` | Unhandled error in Python engine |
| `TIMEOUT` | `ERROR` | Python bridge or DB query exceeded timeout limit |
| `ACCESS_DENIED` | `ERROR` | Agent type not authorized, table not in allowlist, or path traversal attempt |
| `INVALID_PARAMS` | `ERROR` | Parameter validation failure (preflight or domain handler) |
| `INTERNAL_ERROR` | `ERROR` | Unexpected server-side error not categorized above |
| `CACHE_MISS` *(reserved)* | `INFO` | Cache layer miss; full computation performed |
| `PROBE_REQUIRED` *(reserved)* | `INFO` | Python core requires capability probe before proceeding |
| `CAPABILITY_FLAG` *(reserved)* | `INFO` | Feature flag state reported in diagnostic |

**Severity definitions:**
- `ERROR` — Action failed or returned degraded/unsafe result; should be surfaced to agent and logged
- `WARN` — Action succeeded but result may be incomplete; agent should treat result cautiously
- `INFO` — Informational; no action required; for telemetry pipeline only

### Severity in Tool Response

The `diagnostics` field in the response envelope includes severity for each entry:

```typescript
diagnostics: Array<{
  code: string;           // DiagnosticCode enum value
  severity: 'ERROR' | 'WARN' | 'INFO';
  message: string;
  context?: Record<string, unknown>;
  recoverable: boolean;
}>
```

This field is defined in `server/src/cartography/contracts/types.ts` (`DiagnosticEntry`). The schema defined here must remain consistent with those types (see §5 Pre-Build Check Clause).

---

## 3. Coverage Metrics

Coverage metrics enable the Reviewer to validate that the `memory_cartographer` implementation exercises all defined actions over time.

### Definition

**Action exercise coverage** = the percentage of the 17 defined actions that have been invoked at least once across the last N sessions.

```
Coverage(N) = (count of distinct actions invoked across last N sessions) / 17 × 100%
```

Default N = 10 sessions.

### Coverage Categories

| Coverage % | Interpretation |
|---|---|
| 100% | All actions exercised — full coverage |
| ≥ 80% | Good coverage — all major domains exercised |
| 50–79% | Partial coverage — some domains not exercised |
| < 50% | Low coverage — significant functionality untested |

### Coverage Metric Fields (to be emitted by telemetry pipeline)

```typescript
interface CartographyCoverageReport {
  snapshot_at: string;           // ISO timestamp
  session_window: number;        // N sessions evaluated
  total_actions_defined: 17;     // static constant
  actions_invoked: string[];     // distinct action names seen
  actions_not_invoked: string[]; // complement of actions_invoked
  coverage_pct: number;          // 0–100
  domain_breakdown: {
    cartography_queries: { total: 5; invoked: number };
    dependencies_dependents: { total: 4; invoked: number };
    architecture_slices: { total: 4; invoked: number };
    database_map_access: { total: 4; invoked: number };
  };
}
```

### How the Reviewer Uses Coverage Metrics

During plan validation, the Reviewer can check coverage by:
1. Querying the telemetry log for `memory_cartographer.invocation` events in the last N sessions
2. Computing `CartographyCoverageReport` from the log
3. Flagging any domain with 0 invocations as a gap requiring test plan coverage
4. Using `docs/mcp-surface/validation/cartography-query-test-plan.md` and `slice-dbmap-test-plan.md` as the definitive test case source for closing coverage gaps

---

## 4. Latency Budgets and Alerting Thresholds

| Domain | Expected p50 (ms) | Alerting threshold (ms) | Notes |
|---|---|---|---|
| `dependencies_dependents` | < 50 | > 500 | Pure SQLite; should be fast |
| `database_map_access` | < 30 | > 300 | Schema metadata queries; small result sets |
| `cartography_queries` | < 2000 | > 10000 | Python process spawn or bridge call involved |
| `architecture_slices` | < 3000 | > 15000 | Python core + graph computation |

Latency outside alerting thresholds should be logged at `ERROR` severity and included in the `diagnostics` field as a `TIMEOUT` or `INTERNAL_ERROR` code.

---

## 5. Pre-Build Check Clause

**Reviewer Validation Requirement:**

Before the implementation plan is executed, the Reviewer MUST verify that:

1. `server/src/cartography/contracts/types.ts` contains a `DiagnosticEntry` type with at minimum these fields:
   - `code: string` (or `DiagnosticCode` enum)
   - `severity: 'ERROR' | 'WARN' | 'INFO'`
   - `message: string`
   - `recoverable: boolean`

2. If `DiagnosticEntry` in `types.ts` does NOT include `severity`, the implementation plan must add it before implementation begins (not during).

3. The 11-code `DiagnosticCode` enum in `server/src/cartography/contracts/types.ts` (or `normalization.py`) must include all codes listed in §2 above.

4. The telemetry invocation shape defined in §1 (7 fields: `latency_ms`, `action`, `domain`, `result_count`, `error_code`, `cache_hit`, `session_id`) must not conflict with any existing telemetry schema in `server/src/`.

### How to Execute the Check

```
# Check DiagnosticEntry in TypeScript contracts
grep -r "DiagnosticEntry\|DiagnosticCode\|severity" server/src/cartography/contracts/

# Confirm types.ts exports DiagnosticEntry
grep "export.*DiagnosticEntry\|export.*DiagnosticCode" server/src/cartography/contracts/types.ts
```

If the check passes (fields present, no conflicts): Reviewer can approve implementation plan.  
If the check fails (missing fields): Executor must add missing fields to `types.ts` as the first implementation step.

---

## 6. Telemetry Non-Goals (This Plan)

The following are explicitly **not** implemented in this plan:
- A persistent telemetry store (no DB table for metrics)
- A dashboard or UI for coverage metrics
- Real-time alerting pipeline
- Caching infrastructure (all `cache_hit` values will be `false`)
- Python-side telemetry (Python core does not emit invocation metrics)

These are deferred to the implementation plan that follows this specification plan.

---

## Cross-References

- [DiagnosticCode taxonomy (Python core)](../../../Project-Memory-MCP/python-core/memory_cartographer/contracts/normalization.py)
- [TypeScript type contracts](../../../Project-Memory-MCP/server/src/cartography/contracts/)
- [Auth & session architecture (session_id propagation)](./auth-session-architecture.md)
- [Tool routing (dispatch point for metric collection)](./tool-routing-architecture.md)
- [Validation test plans (coverage gap closure)](../validation/)
