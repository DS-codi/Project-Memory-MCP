# Cross-Surface Authorization & Session Handling Architecture

**Plan:** MCP Surface Integration: expose memory_cartographer actions/resources via consolidated tools  
**Phase:** Architecture  
**Step:** 11 — Cross-Surface Authorization & Session Handling  
**Status:** Specification (no implementation required for this plan)

---

## Overview

This document defines how `memory_cartographer` handles session propagation, authorization boundaries, stop/injection directive compliance, injection guard validation, and backward-compatible behavior when `_session_id` is absent.

---

## 1. Session Propagation

### _session_id Threading

When a caller includes `_session_id` in the tool input, it threads through the entire call chain for stop-directive and injection-handling purposes:

```
Tool input:
  { action: 'cartography_queries.summary', params: {...}, _session_id: 'sess_...' }
    ↓
memory_cartographer.ts:
  - Extracts _session_id from input (if present)
  - Passes session context to domain handler
    ↓
Domain handler (PythonCoreAdapter / DependencyDbService / DbMapService):
  - Includes session_id in internal request context
  - Session context used for:
      (a) Stop directive polling (see §3)
      (b) Telemetry correlation (see observability-architecture.md)
      (c) Response envelope inclusion
    ↓
Response envelope:
  {
    success: true,
    data: {
      action: 'cartography_queries.summary',
      data: { ... },
      _session_id: 'sess_...'   // echo back for client correlation
    }
  }
```

### When _session_id is Absent

`_session_id` is **optional**. When absent:
- No stop directive checks are performed
- No telemetry session correlation is emitted
- The response envelope omits the `_session_id` echo field
- The action executes normally — absence of session tracking does not invalidate the call
- This enables non-session callers (e.g., direct tool testing, non-agent clients) to use `memory_cartographer` without session overhead

**Implementation note:** The `_session_id` field is declared optional in the Zod schema at `index.ts` registration and as an optional field in the consolidated function's input TypeScript interface.

---

## 2. Authorization Model

### Read-Only Enforcement

All 17 `memory_cartographer` actions are **read-only**. The authorization model enforces this at two levels:

| Enforcement Level | Mechanism | Where |
|---|---|---|
| DB access | `better-sqlite3` instance opened in read-only mode | `DbMapService`, `DependencyDbService` |
| Python core | `cartograph` wire-protocol intent cannot issue write commands | `PythonBridge` + python-core entrypoint.py |
| Preflight | No action in `action-params-cartography.ts` declares write permissions | `preflightValidate()` |
| DB allowlist | Only schema-metadata and allowlisted tables accessible | `DbMapService.validateTableName()` |

**No workspace mutation is permitted in any path through `memory_cartographer`.**

### Agent Type Authorization (tool-action-mappings.ts)

Read access to `memory_cartographer` is granted to:

| Agent Type | Rationale |
|---|---|
| `Researcher` | Primary consumer for codebase exploration |
| `Architect` | Needs cartography data for design decisions |
| `Coordinator` | Needs summary/graph access for plan routing |
| `Analyst` | Needs file context and architecture slices for analysis |
| `Executor` | May query DB structure before implementing steps |

**Restricted agents** (not granted access by default):
- `Tester` — No cartography queries needed for test execution
- `Revisionist` — No cartography queries during fix cycles
- `Archivist` — No cartography queries during archival

The mapping is declared in `tool-action-mappings.ts` and validated by `preflightValidate()` before any action dispatch. Unauthorized agents receive `DiagnosticCode.ACCESS_DENIED`.

### DB Table Allowlist Authorization

Within `database_map_access`, even authorized agents cannot query arbitrary tables. The allowlist (from `database-map-access-contract.md`) is:

```typescript
const ALLOWLISTED_TABLES = [
  'plans',
  'plan_dependencies',
  'context_items',
  'agent_sessions',
  'workspace_meta'
] as const;
```

Any `describe_table` or `query_schema_lineage` call with a table not in this list is rejected with `DiagnosticCode.ACCESS_DENIED` before any SQL executes.

Additionally, `context_items.context_data` column is **always masked** from `describe_table` output regardless of agent type — it contains potentially sensitive plan data.

---

## 3. Stop Directive Handling

Agents using `memory_cartographer` during a session are subject to the standard stop-directive protocol (from `session-interruption.instructions.md`). The following table maps stop levels to expected agent behavior:

| Stop Level | Marker | Memory Cartographer Impact |
|---|---|---|
| Level 1 — Graceful | `⚠️ SESSION STOP` | Agent completes current `memory_cartographer` call, then stops further calls. Handoff + complete before issuing new cartography queries. |
| Level 2 — Immediate | `🛑 SESSION STOP — IMMEDIATE` | Agent stops immediately — even if a cartography response was received, it is NOT processed further. Handoff + complete immediately. |
| Level 3 — Terminated | `❌ SESSION TERMINATED` | Session killed server-side. Any pending cartography call returns an error. Hub recovers via `orphaned_sessions` on next init. |

**Behavior when stop directive is embedded in a cartography response:**
A stop directive can arrive as additional content in the MCP tool response alongside the normal cartography data. The agent must:
1. Check each `memory_cartographer` response for stop markers before processing the data payload
2. On Level 1: use the data if already received, then comply with stop protocol
3. On Level 2: discard the data received in the same response, comply immediately

**Note:** The `memory_cartographer` tool itself does not generate stop directives — it may receive them attached to its responses if the session management layer injects them. The tool's own response processing code does not need to be aware of stop directives; only the calling agent does.

### Injected Guidance Impact on Cartography Queries

When `📝 USER GUIDANCE` is injected into an agent's tool call flow, it may redirect the query scope or depth:

| Injection content | Expected agent adaptation |
|---|---|
| "limit search to the server/ directory" | Agent adjusts subsequent `file_context` params to scope to `server/` |
| "reduce depth to 3 layers" | Agent passes `max_depth: 3` in next `layer_view` or slice call |
| "skip dependency graph for now" | Agent omits `get_dependency_graph` call from its plan |

Injected guidance does **not** bypass preflight validation — e.g., if guidance says "query all tables", the allowlist still applies and unauthorized tables are still rejected.

---

## 4. Injection Guard — Input Parameter Validation

All action parameters are validated before reaching any domain handler, preventing injection of raw query strings to Python core or SQL.

### Validation Layers

**Layer 1 — Zod Schema (index.ts)**  
Top-level shape: `action` (string enum of 17 valid actions), `params` (object). No raw SQL or shell strings accepted at top level.

**Layer 2 — Preflight (action-params-cartography.ts)**  
Per-action parameter spec:
- Path parameters (e.g., `file_path`): validated against `path.normalize()` and workspace-relative path check (no `../` traversal)
- Depth parameters (e.g., `max_depth`): clamped to `[1, MAX_DEPTH_LIMIT]`
- String search terms (e.g., `query` in `search` action): validated as plain string, no SQL operators (`--`, `;`, `'`, `"` stripped or rejected)
- Table name (DB map actions): validated against `ALLOWLISTED_TABLES` before any DB call
- `plan_id` parameters: validated as string matching `plan_[a-z0-9_]+` pattern

**Layer 3 — Domain handler case-level validation**  
Additional sanity checks inside each domain handler:
- `PythonCoreAdapter`: serializes params as JSON; Python core receives structured data, not raw strings
- `DependencyDbService`: uses `db.prepare(sql).get(params)` — always parameterized; plan_id is bound, not interpolated
- `DbMapService`: table name checked against allowlist before prepare; column filters use parameterized queries

### Explicit Injection Attack Mitigations

| Attack vector | Mitigation |
|---|---|
| SQL injection via `table_name` param | Allowlist check rejects unknown table names before prepare() |
| Path traversal via `file_path` param | `../` patterns rejected in preflight; workspace-relative normalization applied |
| Python command injection via `query` param | Query value is JSON-serialized string; not passed to shell; Python core receives structured payload |
| Overlong inputs | `query` string capped at 500 chars; `file_path` capped at 1024 chars; enforced in action-params-cartography.ts |
| Recursive bomb via deep `max_depth` | `max_depth` clamped to `MAX_DEPTH_LIMIT = 10` in preflight |

---

## 5. Compatibility: Sessions That Don't Use _session_id

The `memory_cartographer` tool is fully functional without session tracking:

```
Scenario A: Agent passes _session_id
  → Full telemetry, stop-directive checking, response echo back

Scenario B: Agent does NOT pass _session_id
  → No telemetry emitted
  → No stop directive processing
  → Response omits _session_id field
  → Action executes normally — no degradation of result quality

Scenario C: External tool tester / ad-hoc caller
  → Same as Scenario B
  → No special error or warning for missing _session_id
```

This design ensures backward compatibility as new agent types are added and allows `memory_cartographer` to be used in non-session-tracked contexts (e.g., integration tests, CI inspection scenarios).

---

## 6. Surface Compatibility Matrix

| Surface | Session support | Authorization enforced | Stop directives | Injection guard |
|---|---|---|---|---|
| MCP chat agent (normal) | ✅ Full | ✅ agent type + allowlist | ✅ via response embedding | ✅ 3-layer validation |
| MCP chat agent (no session) | ⬜ None | ✅ agent type + allowlist | ⬜ N/A | ✅ 3-layer validation |
| Direct tool test (vitest) | ⬜ None | ✅ via test fixture | ⬜ N/A | ✅ 3-layer validation |
| CI inspection script | ⬜ None | ✅ agent type fixed | ⬜ N/A | ✅ 3-layer validation |

---

## Cross-References

- [Session interruption protocol](../../../.github/instructions/session-interruption.instructions.md)
- [DB table allowlist](../database-map-access-contract.md)
- [Preflight spec (to be created): action-params-cartography.ts](../../../server/src/tools/preflight/action-params-cartography.ts)
- [Tool routing (domain handler wiring)](./tool-routing-architecture.md)
- [Observability (session correlation)](./observability-architecture.md)
