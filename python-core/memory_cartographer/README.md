# memory_cartographer

`memory_cartographer` is the Python core cartography package for Project Memory MCP.

It provides:
- Code cartography engines and query handlers
- Canonical schema normalization and diagnostics
- Runtime subprocess entrypoint used by the TypeScript MCP server

## Scope And Ownership

Python core owns:
- Canonical output schema version (`schema_version`)
- Runtime request/response envelope shape
- Query handler behavior for cartograph query kinds
- Guardrails (scope, safety, performance) and normalization

TypeScript server owns:
- MCP tool exposure (`memory_cartographer`)
- Workspace resolution, authorization, preflight validation
- SQLite-backed action families (plan dependency graph and DB map access)
- Python process orchestration, timeout configuration, and fallback envelopes

See:
- `../../docs/architecture/memory-cartographer/implementation-boundary.md`
- `../../docs/architecture/memory-cartographer/runtime-boundary.md`
- `../../docs/architecture/memory-cartographer/compatibility-matrix.md`

## Runtime Entry Point

Run the Python core entrypoint directly:

```powershell
python -m memory_cartographer.runtime.entrypoint
```

The runtime reads one NDJSON request line from stdin and writes one NDJSON response line to stdout.

### Runtime Actions

The entrypoint currently supports:
- `cartograph`
- `probe_capabilities`
- `health_check`

### Cartograph Query Kinds

For `action: "cartograph"`, the runtime supports these query kinds:
- `summary`
- `file_context`
- `flow_entry_points`
- `layer_view`
- `search`
- `slice_detail`
- `slice_projection`
- `slice_filters`

If no query selector is supplied, runtime defaults to `summary` and emits a warning marker.

## Request And Response Envelope

Minimal request envelope:

```json
{
  "schema_version": "1.0.0",
  "request_id": "req_demo_001",
  "action": "cartograph",
  "args": {
    "query": "summary",
    "workspace_path": "C:/Users/User/Project_Memory_MCP/Project-Memory-MCP"
  },
  "timeout_ms": 60000
}
```

Response envelope shape:

```json
{
  "schema_version": "1.0.0",
  "request_id": "req_demo_001",
  "status": "ok",
  "result": {},
  "diagnostics": {
    "warnings": [],
    "errors": [],
    "markers": [],
    "skipped_paths": []
  },
  "elapsed_ms": 123
}
```

Status values:
- `ok`
- `partial`
- `error`

## MCP Tool Integration Notes

At the MCP tool layer (`server/src/tools/memory_cartographer.ts`), consolidated actions are split by backend:

Python-backed actions:
- `summary`
- `file_context`
- `flow_entry_points`
- `layer_view`
- `search`
- `slice_detail`
- `slice_projection`
- `slice_filters`

SQLite-backed server actions:
- `get_plan_dependencies`
- `get_dependencies`
- `reverse_dependent_lookup`
- `bounded_traversal`
- `slice_catalog`
- `db_map_summary`
- `db_node_lookup`
- `db_edge_lookup`
- `context_items_projection`

Server-side auth gate for tool callers (when `agent_type` is supplied):
- `Researcher`
- `Architect`
- `Coordinator`
- `Analyst`
- `Executor`

## Timeout Controls (Configured In Server Process)

These environment variables are resolved by the TypeScript server when invoking Python cartography actions:

- `PM_CARTOGRAPHER_SUMMARY_TIMEOUT_MS`
- `PM_CARTOGRAPHER_NON_SUMMARY_TIMEOUT_MS`
- `PM_CARTOGRAPHER_FILE_CONTEXT_TIMEOUT_MS`
- `PM_CARTOGRAPHER_FLOW_ENTRY_POINTS_TIMEOUT_MS`
- `PM_CARTOGRAPHER_LAYER_VIEW_TIMEOUT_MS`
- `PM_CARTOGRAPHER_SEARCH_TIMEOUT_MS`

## Package Layout

```text
memory_cartographer/
  contracts/
    normalization.py
    version.py
  engines/
    code_cartography.py
    database_cartography.py
  guardrails/
    scope_limits.py
    safety.py
    perf_budget.py
  runtime/
    entrypoint.py
  __init__.py
```

## Local Validation

From `Project-Memory-MCP/python-core`:

```powershell
python -m pytest tests/test_runtime_entrypoint.py tests/test_contract_golden.py tests/test_code_cartography.py
```

Related integration tests in server:
- `../../server/src/__tests__/tools/memory-cartographer-integration.test.ts`
- `../../server/src/__tests__/tools/memory-cartographer-regression.test.ts`
- `../../server/src/__tests__/tools/memory-cartographer-benchmark.test.ts`

## Contract References

- `../../docs/contracts/memory-cartographer-contract.md`
- `../../docs/contracts/memory-cartographer.schema.json`
- `../../docs/contracts/sections/code-cartography.schema.json`
- `../../docs/contracts/sections/database-cartography.schema.json`
- `../../docs/qa/memory-cartographer-acceptance.md`
