---
applyTo: "**/*"
---

# memory_cartographer — Tool Reference

Cartography and dependency graph tool. Provides two classes of capability:

- **Phase A (SQLite — available now):** Plan dependency graph traversal and read-only DB schema introspection.
- **Phase B (Python runtime required — stubs):** Codebase cartography queries and architecture slice analysis.

**Authorized agent types:** Researcher, Architect, Coordinator, Analyst, Executor.

---

## Actions

### Phase A — Plan Dependency Graph

#### `get_plan_dependencies`

Get direct dependencies for a plan.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"get_plan_dependencies"` |
| `workspace_id` | string | ✅ | Workspace identifier |
| `plan_id` | string | ✅ | Target plan ID |
| `include_archived` | boolean | — | Include archived plans (default: false) |

**Returns:** Direct dependency and dependent plan IDs with status.

---

#### `get_dependencies`

Get all dependencies for a plan (same as `get_plan_dependencies` — use either).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"get_dependencies"` |
| `workspace_id` | string | ✅ | Workspace identifier |
| `plan_id` | string | ✅ | Target plan ID |

---

#### `reverse_dependent_lookup`

Find all plans that depend on a given plan.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"reverse_dependent_lookup"` |
| `workspace_id` | string | ✅ | Workspace identifier |
| `plan_id` | string | ✅ | Plan to find dependents of |
| `include_archived` | boolean | — | Default: false |

**When to use:** Before archiving or deleting a plan — check nothing still depends on it.

---

#### `bounded_traversal`

Traverse the plan dependency graph from a root plan up to a depth limit, with pagination.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"bounded_traversal"` |
| `workspace_id` | string | ✅ | Workspace identifier |
| `root_plan_id` | string | ✅ | Root plan ID to start traversal from |
| `depth_limit` | number | — | Max traversal depth (default varies, max 20) |
| `direction` | string | — | `"dependencies"`, `"dependents"`, or `"both"` (default: both) |
| `include_archived` | boolean | — | Default: false |
| `cursor` | string | — | Pagination cursor from previous call |
| `page_size` | number | — | Results per page (default: 50, max: 200) |

**When to use:** Understanding the full dependency graph for a program or complex multi-plan feature.

---

### Phase A — Database Map Access

Read-only introspection of the SQLite schema. `context_data` fields are always masked.

#### `db_map_summary`

Return an overview of all accessible tables, row counts, and key relationships.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"db_map_summary"` |
| `workspace_id` | string | ✅ | Workspace identifier |

---

#### `db_node_lookup`

Look up a single row from an allowed table by primary key.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"db_node_lookup"` |
| `workspace_id` | string | ✅ | Workspace identifier |
| `table_name` | string | ✅ | One of: `context_items`, `workspaces`, `plans`, `agent_sessions`, `steps`, `handoffs`, `build_scripts`, `research_notes` |
| `primary_key` | string | ✅ | Primary key value |

---

#### `db_edge_lookup`

Return FK relationships (edges) for a row — inbound, outbound, or both.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"db_edge_lookup"` |
| `workspace_id` | string | ✅ | Workspace identifier |
| `table_name` | string | ✅ | Same allowed set as `db_node_lookup` |
| `primary_key` | string | ✅ | Primary key value |
| `edge_direction` | string | — | `"outbound"`, `"inbound"`, or `"both"` (default: both) |

---

#### `context_items_projection`

Paginated read of `context_items` rows filtered by parent scope. `context_data` always masked.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"context_items_projection"` |
| `workspace_id` | string | ✅ | Workspace identifier |
| `parent_type` | string | ✅ | `"plan"` or `"workspace"` |
| `parent_id` | string | ✅ | Parent plan or workspace ID |
| `type_filter` | string[] | — | Filter by context item type values |
| `limit` | number | — | Max rows per page (default: 50, max: 500) |
| `order_by` | string | — | `"created_at"`, `"type"`, or `"parent_id"` (default: created_at) |

---

### Phase B — Cartography Queries (Python runtime required)

> These actions return stub responses unless the Python cartography runtime is available.

#### `summary`

High-level codebase summary: languages, layers, entry points, module count.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"summary"` |
| `workspace_id` | string | ✅ | Workspace identifier |
| `force_refresh` | boolean | — | Bypass cache (default: false) |

**Response shape:**
```json
{
  "data": {
    "result": {
      "summary": {
        "file_count": 1373,
        "symbol_count": 36148,
        "language_breakdown": [{ "language": "typescript", "file_count": 710 }]
      }
    },
    "elapsed_ms": 14303,
    "diagnostics": { "markers": ["cache_hit"], "warnings": [], "errors": [] }
  }
}
```
- **Cache hit detection:** `result.diagnostics.markers.includes("cache_hit")` — NOT a boolean field
- **File count field:** `result.data.result.summary.file_count` (not `files_total`)
- **Symbol count field:** `result.data.result.summary.symbol_count` (not `symbols_total`)

---

#### `file_context`

Symbol table, references, and layer tags for a specific file.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"file_context"` |
| `workspace_id` | string | ✅ | Workspace identifier |
| `file_id` | string | ✅ | File identity key |
| `include_symbols` | boolean | — | Include symbol list (default: true) |
| `include_references` | boolean | — | Include reference list (default: true) |

---

#### `flow_entry_points`

List main entry points and flow roots in the codebase.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"flow_entry_points"` |
| `workspace_id` | string | ✅ | Workspace identifier |
| `layer_filter` | string[] | — | Filter to specific architecture layers |
| `language_filter` | string[] | — | Filter to specific languages |

---

#### `layer_view`

Architecture layer diagram with optional cross-layer edges.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"layer_view"` |
| `workspace_id` | string | ✅ | Workspace identifier |
| `layers` | string[] | — | Layer tag names to include |
| `include_cross_layer_edges` | boolean | — | Default: false |

---

#### `search`

Full-text search across symbols, files, modules, or all.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"search"` |
| `workspace_id` | string | ✅ | Workspace identifier |
| `query` | string | ✅ | Search query |
| `search_scope` | string | — | `"symbols"`, `"files"`, `"modules"`, or `"all"` (default: all) |

---

### Phase B — Architecture Slices (Python runtime required)

> These actions return stub responses unless the Python cartography runtime is available.

#### `slice_catalog`

List all defined architecture slices for the workspace.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"slice_catalog"` |
| `workspace_id` | string | ✅ | Workspace identifier |

---

#### `slice_detail`

Full metadata and materialization status for a specific slice.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"slice_detail"` |
| `workspace_id` | string | ✅ | Workspace identifier |
| `slice_id` | string | ✅ | Slice identifier |
| `materialize` | boolean | — | Force re-materialization (default: false) |

---

#### `slice_projection`

Project a slice at file, module, or symbol granularity with optional filters.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"slice_projection"` |
| `workspace_id` | string | ✅ | Workspace identifier |
| `slice_id` | string | ✅ | Slice identifier |
| `projection_type` | string | — | `"file_level"`, `"module_level"`, or `"symbol_level"` |
| `filters` | unknown[] | — | Additional filter objects |

---

#### `slice_filters`

List available filter options for a slice.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"slice_filters"` |
| `workspace_id` | string | ✅ | Workspace identifier |
| `slice_id` | string | ✅ | Slice identifier |

---

## Common parameters (all actions)

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent_type` | string | Calling agent type — used for authorization check |
| `_session_id` | string | Session ID for instrumentation tracking |
| `caller_surface` | string | Optional origin metadata (e.g. `"supervisor"`) |
| `write_documentation` | boolean | When true + `caller_surface: "supervisor"`, writes a markdown report under workspace `docs/cartographer/supervisor-reports` |
| `debug_output` | boolean | Stream Python subprocess stderr to server stderr — use to diagnose Phase B hangs or scan failures |

---

## Authorization

Only these agent types may call `memory_cartographer`: **Researcher, Architect, Executor, Reviewer, Tester, Revisionist, Cognition, Runner, Coordinator, Analyst**. Other agent types receive an authorization error.

---

## Engine Selection

By default, the adapter uses the Rust engine (`cartographer-core` binary) when available.
Set `CARTOGRAPHER_ENGINE=python` to force the Python bridge fallback.

| Mode | Condition |
|------|-----------|
| Rust (default) | Binary present at `target/release/cartographer-core` |
| Python fallback | `CARTOGRAPHER_ENGINE=python` or binary absent |

---

## Cache and Rescan

Pass `force_refresh: true` in the action args to bypass the SQLite cache and run a fresh scan.

```
memory_cartographer(action: "summary", workspace_id: "<id>", force_refresh: true)
```

When `force_refresh` is omitted or false, results are served from the SQLite cache at `.projectmemory/cartographer/cache.db` if a valid entry exists for the current git HEAD. Cached reads return in < 50ms.
