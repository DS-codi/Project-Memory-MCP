# memory_cartographer Action Inventory

> **Status:** Planning Phase — Step 1
> **Plan:** MCP Surface Integration: expose memory_cartographer actions/resources via consolidated tools
> **Date:** 2026-03-05

## Overview

This document inventories all 17 consolidated actions exposed by `memory_cartographer`, organized by domain family. For each action: input parameters, expected output shape (keyed to Foundation schema fields), applicable error codes from the `DiagnosticCode` 11-code taxonomy, and caching/ordering notes.

**Foundation schema references:**
- `docs/contracts/code-cartography.schema.json` — FileEntry, SymbolEntry, ReferenceEntry, ModuleGraph, ArchitectureEdge, DependencyFlow
- `docs/contracts/database-cartography.schema.json` — DataSourceEntry, TableEntry, ColumnEntry, ConstraintEntry, RelationEntry, MigrationLineage, QueryTouchpoint
- `python-core/memory_cartographer/contracts/normalization.py` — DiagnosticCode enum (11 codes)

---

## DiagnosticCode Taxonomy (from normalization.py)

All error codes below are members of the `DiagnosticCode` enum:

| Code | Name | Meaning |
|------|------|---------|
| D001 | MISSING_SOURCE | Referenced source file or module not found |
| D002 | PARSE_FAILURE | AST/SQL parse error for a scanned artifact |
| D003 | SCHEMA_VERSION_MISMATCH | Python-core output version incompatible with server expectation |
| D004 | PARTIAL_GRAPH | Output is a subset — some edges/nodes could not be resolved |
| D005 | CYCLE_DETECTED | Circular dependency discovered during traversal |
| D006 | DEPTH_LIMIT_EXCEEDED | Traversal depth capped at configured maximum |
| D007 | SCOPE_VIOLATION | Requested path is outside permitted workspace scope |
| D008 | BUDGET_EXCEEDED | Performance budget (files/symbols/time) exceeded during scan |
| D009 | IDENTITY_CONFLICT | Two artifacts resolved to the same normalized identity key |
| D010 | DB_ACCESS_DENIED | Attempted DB operation not permitted under read-only constraints |
| D011 | UNKNOWN_ACTION | Action name not registered in the tool dispatch switch |

*Note: Exact code names are authoritative in `normalization.py`; the table above reflects the research-phase read of the 11-code taxonomy.*

---

## Domain Family 1: cartography_queries

These actions query the code cartography graph produced by `engines/code_cartography.py` via the Python core bridge.

### Action: summary

**Description:** Return a high-level summary of the workspace code graph — file counts, module counts, top-level architecture layers, and scan metadata.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `force_refresh` | `boolean` | No | If true, bypass cache and re-scan; default false |

**Output Shape (fields from Foundation schema):**

```ts
{
  schema_version: string,                    // from output envelope
  workspace_identity: { workspace_id, path }, // from output envelope
  generation_metadata: {
    generated_at: string,                    // ISO timestamp
    scan_duration_ms: number,
    file_count: number,
    module_count: number,
    symbol_count: number,
  },
  diagnostics: DiagnosticEntry[],            // zero or more DiagnosticCode entries
  summary: {
    architecture_layers: string[],           // layer tag values seen in graph
    entry_point_count: number,
    dependency_edge_count: number,
    has_cycles: boolean,
  }
}
```

**Error Codes:** D003 (schema mismatch), D008 (budget exceeded), D011 (unknown action)

**Caching/Ordering Notes:** Cache by `workspace_id + scan_hash`. Deterministic ordering not applicable (aggregate data). Performance tier: LOW (summary only).

---

### Action: file_context

**Description:** Return full context for a single file — its FileEntry, contained symbols, inbound/outbound references, and module membership.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `file_id` | `string` | Yes | Normalized file identity key |
| `include_symbols` | `boolean` | No | Include SymbolEntry list; default true |
| `include_references` | `boolean` | No | Include ReferenceEntry list; default true |

**Output Shape:**

```ts
{
  file: FileEntry,                // path, language, module_id, layer_tag, loc
  symbols: SymbolEntry[],         // name, kind, start_line, end_line, visibility
  inbound_references: ReferenceEntry[],   // from_symbol, to_symbol, ref_kind
  outbound_references: ReferenceEntry[],
  module_membership: { module_id: string, module_name: string },
  diagnostics: DiagnosticEntry[]
}
```

**Error Codes:** D001 (file not found), D002 (parse failure), D003, D007 (scope violation), D009 (identity conflict)

**Caching/Ordering Notes:** Cache by `file_id + schema_version`. Symbols ordered by `start_line` ascending. References ordered by `from_symbol` lexicographic then `to_symbol`.

---

### Action: flow_entry_points

**Description:** List all detected entry points in the workspace (main functions, CLI handlers, HTTP route registrations, exported top-level symbols).

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `layer_filter` | `string[]` | No | Restrict to specific architecture layer tags |
| `language_filter` | `string[]` | No | Restrict to specific language tags |

**Output Shape:**

```ts
{
  entry_points: Array<{
    symbol: SymbolEntry,
    file: FileEntry,
    entry_kind: 'main' | 'cli' | 'http_route' | 'exported_api' | 'test_root',
    dependency_fan_out: number,   // from DependencyFlow
  }>,
  total_count: number,
  diagnostics: DiagnosticEntry[]
}
```

**Error Codes:** D001, D003, D004 (partial graph), D008

**Caching/Ordering Notes:** Cache by `workspace_id + filters_hash`. Ordered by `entry_kind` category then `file.path` ascending.

---

### Action: layer_view

**Description:** Return the architecture graph for one or more named layers — nodes (files/modules) and edges (ArchitectureEdge).

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `layers` | `string[]` | Yes | One or more architecture layer tag names |
| `include_cross_layer_edges` | `boolean` | No | Include edges crossing into other layers; default false |
| `depth_limit` | `number` | No | Maximum edge traversal depth; default 3, max 10 |

**Output Shape:**

```ts
{
  layers: Array<{
    layer_tag: string,
    nodes: FileEntry[],
    edges: ArchitectureEdge[],   // from_module, to_module, edge_kind, weight
  }>,
  cross_layer_edges: ArchitectureEdge[],  // only if include_cross_layer_edges=true
  diagnostics: DiagnosticEntry[]
}
```

**Error Codes:** D001, D003, D004, D005 (cycle detected in layer graph), D006 (depth exceeded)

**Caching/Ordering Notes:** Cache by `workspace_id + layers + depth_limit`. Nodes ordered by `file.path`. Edges ordered by `from_module + to_module`.

---

### Action: search

**Description:** Semantic and lexical search across symbols, file paths, and module names in the cartography graph.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `query` | `string` | Yes | Search query (supports glob patterns and regex) |
| `search_scope` | `'symbols' \| 'files' \| 'modules' \| 'all'` | No | Scope; default 'all' |
| `layer_filter` | `string[]` | No | Restrict to layers |
| `limit` | `number` | No | Max results; default 20, max 100 |

**Output Shape:**

```ts
{
  results: Array<{
    kind: 'symbol' | 'file' | 'module',
    score: number,               // 0.0–1.0 relevance score
    symbol?: SymbolEntry,
    file?: FileEntry,
    module_id?: string,
  }>,
  total_matches: number,
  truncated: boolean,
  diagnostics: DiagnosticEntry[]
}
```

**Error Codes:** D003, D007, D008, D011

**Caching/Ordering Notes:** Results ordered by `score` descending then `kind` alphabetically. NOT cached (query-driven). Pagination: client re-queries with narrowed `query` or adjusted `limit` (no cursor for search).

---

## Domain Family 2: dependencies_dependents

These actions traverse the plan dependency graph stored in the MCP server database (not the Python core).

### Action: get_plan_dependencies

**Description:** Retrieve direct dependencies of a plan (plans this plan depends on).

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `plan_id` | `string` | Yes | Target plan ID |
| `depth_limit` | `number` | No | How many levels deep; default 1 (direct only), max 20 |

**Output Shape:**

```ts
{
  plan_id: string,
  dependencies: DependencyNode[],   // id, title, status, phase
  edges: DependencyEdge[],          // from_plan, to_plan, edge_type
  depth_reached: number,
  diagnostics: DiagnosticEntry[]
}
```

**Error Codes:** D005 (cycle), D006 (depth exceeded), D010 (not found — repurposed as plan not found)

**Caching/Ordering Notes:** NOT cached (live DB). Nodes ordered by plan `created_at` ascending.

---

### Action: get_dependencies

**Description:** Retrieve reverse transitive closure — all plans that directly or transitively depend on this plan.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `plan_id` | `string` | Yes | Target plan ID |
| `depth_limit` | `number` | No | Default 5, max 20 |

**Output Shape:** Same as `get_plan_dependencies`.

**Error Codes:** D005, D006

**Caching/Ordering Notes:** NOT cached. Same ordering as above.

---

### Action: reverse_dependent_lookup

**Description:** Find all plans that declare the given plan as a dependency (direct reverse lookup only, depth=1).

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `plan_id` | `string` | Yes | Target plan ID |

**Output Shape:**

```ts
{
  plan_id: string,
  dependents: DependencyNode[],
  edges: DependencyEdge[],
  diagnostics: DiagnosticEntry[]
}
```

**Error Codes:** D010 (plan not found)

**Caching/Ordering Notes:** NOT cached. Dependents ordered by `title` alphabetically.

---

### Action: bounded_traversal

**Description:** Generic bounded traversal of the plan dependency graph starting from a root plan, with configurable direction, depth, and visited-set cycle detection.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `root_plan_id` | `string` | Yes | Starting plan |
| `direction` | `'dependencies' \| 'dependents' \| 'both'` | No | Traversal direction; default 'both' |
| `depth_limit` | `number` | No | Default 5, max 20 |
| `include_archived` | `boolean` | No | Include archived plans in traversal; default false |
| `cursor` | `string` | No | Pagination cursor (opaque, returned by previous call) |
| `page_size` | `number` | No | Results per page; default 50, max 200 |

**Output Shape:**

```ts
{
  root_plan_id: string,
  nodes: DependencyNode[],
  edges: DependencyEdge[],
  has_cycles: boolean,
  cycle_path?: string[],          // plan IDs forming the cycle, if detected
  depth_reached: number,
  next_cursor?: string,
  diagnostics: DiagnosticEntry[]
}
```

**Error Codes:** D005, D006, D010

**Caching/Ordering Notes:** Nodes ordered by BFS level then `plan_id`. Cycle detection: visited-set DFS with path tracking.

---

## Domain Family 3: architecture_slices

These actions manage named architecture slices — logical views of a subset of the workspace code graph.

### Action: slice_catalog

**Description:** List all registered architecture slices for a workspace.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |

**Output Shape:**

```ts
{
  slices: Array<{
    slice_id: string,
    name: string,
    description?: string,
    scope_type: 'path_glob' | 'layer_tag' | 'module_prefix' | 'explicit_files',
    created_at: string,
    last_materialized_at?: string,
  }>,
  total: number
}
```

**Error Codes:** D011

**Caching/Ordering Notes:** Slices ordered by `name` alphabetically. Catalog is live (not cached).

---

### Action: slice_detail

**Description:** Return the full definition and materialized content of a named slice.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `slice_id` | `string` | Yes | Slice identifier |
| `materialize` | `boolean` | No | Force re-materialization; default false (use cached if available) |

**Output Shape:**

```ts
{
  slice_id: string,
  name: string,
  scope: SliceScope,             // see slice-types.ts
  filters: SliceFilter[],
  nodes: FileEntry[],            // files in scope
  edges: ArchitectureEdge[],     // edges within scope
  projection_summary: {
    file_count: number,
    symbol_count: number,
    edge_count: number,
  },
  diagnostics: DiagnosticEntry[]
}
```

**Error Codes:** D001 (slice not found), D003, D004, D008

**Caching/Ordering Notes:** Nodes ordered by `path`. Edges by `from_module + to_module`.

---

### Action: slice_projection

**Description:** Return a filtered projection of a slice at a specified granularity (file, module, or symbol level).

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `slice_id` | `string` | Yes | Slice identifier |
| `projection_type` | `'file_level' \| 'module_level' \| 'symbol_level'` | Yes | Projection granularity |
| `filters` | `SliceFilter[]` | No | Additional filters to apply on top of slice definition |
| `limit` | `number` | No | Max items; default 100, max 1000 |

**Output Shape:**

```ts
{
  slice_id: string,
  projection_type: string,
  items: Array<FileEntry | ModuleEntry | SymbolEntry>,   // discriminated by projection_type
  total_in_slice: number,
  returned: number,
  truncated: boolean,
  diagnostics: DiagnosticEntry[]
}
```

**Error Codes:** D001, D004, D008

**Caching/Ordering Notes:** Items ordered by `path`/`name` ascending. Pagination: use `limit` + client offset (stateless).

---

### Action: slice_filters

**Description:** Return valid filter options for a slice — available layer tags, language tags, path patterns, and current filter configuration.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `slice_id` | `string` | No | If provided, return filters for that slice; else return workspace-wide filter options |

**Output Shape:**

```ts
{
  available_layer_tags: string[],
  available_language_tags: string[],
  available_path_prefixes: string[],
  active_filters?: SliceFilter[],    // if slice_id provided
  diagnostics: DiagnosticEntry[]
}
```

**Error Codes:** D001, D003

**Caching/Ordering Notes:** All arrays ordered alphabetically.

---

## Domain Family 4: database_map_access

These actions provide read-only introspection of the MCP server SQLite schema. **No mutation is permitted.**

### Action: db_map_summary

**Description:** Return a summary of the database schema — tables, row counts, and relation map.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier for DB scoping |

**Output Shape:**

```ts
{
  schema_version: string,
  tables: Array<{
    table_name: string,
    row_count: number,
    column_count: number,
    has_fk_relations: boolean,
  }>,
  relation_count: number,
  diagnostics: DiagnosticEntry[]
}
```

**Error Codes:** D010 (DB read error), D003

**Caching/Ordering Notes:** Tables ordered by `table_name`. Row counts are approximate (SQLite `COUNT(*)`).

---

### Action: db_node_lookup

**Description:** Retrieve a single entity (row) from a named table by primary key.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `table_name` | `string` | Yes | Table to look up (allowlist-enforced) |
| `primary_key` | `string` | Yes | Primary key value |

**Output Shape:**

```ts
{
  table_name: string,
  row: Record<string, unknown>,       // column → value; FK columns included
  fk_hints: Array<{
    column: string,
    references_table: string,
    references_pk: string,
  }>,
  diagnostics: DiagnosticEntry[]
}
```

**Error Codes:** D010, D007 (table not in allowlist), D001 (row not found)

**Caching/Ordering Notes:** Not cached (point-in-time read). FK hints are enumerations of declared foreign keys.

---

### Action: db_edge_lookup

**Description:** Return all FK-connected rows for an entity — its direct neighbours in the schema graph.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `table_name` | `string` | Yes | Source entity table |
| `primary_key` | `string` | Yes | Source entity PK |
| `direction` | `'outbound' \| 'inbound' \| 'both'` | No | FK edge direction; default 'both' |

**Output Shape:**

```ts
{
  source: { table_name: string, primary_key: string },
  edges: Array<{
    direction: 'outbound' | 'inbound',
    fk_column: string,
    related_table: string,
    related_rows: Record<string, unknown>[],
  }>,
  diagnostics: DiagnosticEntry[]
}
```

**Error Codes:** D010, D007, D001

**Caching/Ordering Notes:** Edges ordered by `related_table + direction`. Related rows limited to 50 per edge.

---

### Action: db_edge_lookup *(context_items variant)*

> See `context_items_projection` action below for the specialized context_items join.

---

### Action: context_items_projection

**Description:** Return a filtered, typed projection of `context_items` rows for a plan or workspace scope. This is the primary DB introspection action for plan-scoped context data.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |
| `parent_type` | `'plan' \| 'workspace'` | Yes | Scope discriminator |
| `parent_id` | `string` | Yes | Plan ID or workspace ID |
| `type_filter` | `string[]` | No | Filter by `context_items.type` values |
| `limit` | `number` | No | Max rows; default 50, max 500 |
| `cursor` | `string` | No | Pagination cursor |
| `order_by` | `'created_at' \| 'type' \| 'parent_id'` | No | Default 'created_at' desc |

**Output Shape:**

```ts
{
  parent_type: string,
  parent_id: string,
  items: Array<{
    item_id: string,
    type: string,
    parent_type: string,
    parent_id: string,
    created_at: string,
    data_preview: unknown,    // first 500 chars of JSON data, if large
    is_truncated: boolean,
  }>,
  total_count: number,
  next_cursor?: string,
  diagnostics: DiagnosticEntry[]
}
```

**Error Codes:** D010, D007

**Caching/Ordering Notes:** Ordered as specified by `order_by`. Cursor-based pagination using `created_at` + `item_id` composite for stable ordering.

---

## Summary Table

| Domain | Action | Dispatch Layer | Caching | Python Core? |
|--------|--------|----------------|---------|--------------|
| cartography_queries | summary | PythonCoreAdapter | Yes | Yes |
| cartography_queries | file_context | PythonCoreAdapter | Yes | Yes |
| cartography_queries | flow_entry_points | PythonCoreAdapter | Yes | Yes |
| cartography_queries | layer_view | PythonCoreAdapter | Yes | Yes |
| cartography_queries | search | PythonCoreAdapter | No | Yes |
| dependencies_dependents | get_plan_dependencies | DB layer (SQLite) | No | No |
| dependencies_dependents | get_dependencies | DB layer (SQLite) | No | No |
| dependencies_dependents | reverse_dependent_lookup | DB layer (SQLite) | No | No |
| dependencies_dependents | bounded_traversal | DB layer (SQLite) | No | No |
| architecture_slices | slice_catalog | DB layer (SQLite) | No | No |
| architecture_slices | slice_detail | PythonCoreAdapter + DB | Partial | Yes |
| architecture_slices | slice_projection | PythonCoreAdapter + DB | Partial | Yes |
| architecture_slices | slice_filters | PythonCoreAdapter | Yes | Yes |
| database_map_access | db_map_summary | DB layer (SQLite) | No | No |
| database_map_access | db_node_lookup | DB layer (SQLite) | No | No |
| database_map_access | db_edge_lookup | DB layer (SQLite) | No | No |
| database_map_access | context_items_projection | DB layer (SQLite) | No | No |
