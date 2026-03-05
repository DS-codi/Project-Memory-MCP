# Architecture Slice Contract

> **Status:** Planning Phase — Step 4
> **Plan:** MCP Surface Integration: expose memory_cartographer actions/resources via consolidated tools
> **Date:** 2026-03-05

## Overview

An **architecture slice** is a named, persisted view of a subset of the workspace code graph. Slices allow consumers to define logical boundaries (e.g., "the authentication module", "the database layer") and then retrieve filtered, pre-computed projections of the code graph scoped to that boundary.

There are two categories of slice data:
1. **Slice definition** — stored in the MCP server SQLite DB (name, scope, filters)
2. **Slice projection** — computed by querying the Python core code graph and filtering by the slice scope

---

## Slice Definition

### Slice Identity

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `slice_id` | `string` | Yes | Server-assigned UUID. Stable after creation. |
| `name` | `string` | Yes | Human-readable name (max 100 chars, unique within workspace) |
| `description` | `string` | No | Optional longer description |
| `workspace_id` | `string` | Yes | Owning workspace |
| `created_at` | `string` | Yes | ISO 8601 creation timestamp |
| `last_materialized_at` | `string` | No | When slice projection was last computed |

### Scope Boundary

The `scope` defines which files/modules are included in the slice.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scope_type` | `ScopeType` | Yes | How the scope is defined (see below) |
| `patterns` | `string[]` | Yes | One or more pattern strings matching the `scope_type` |
| `depth` | `number` | No | Max dependency depth to include from scoped root nodes; default unbounded |
| `include_transitive` | `boolean` | No | Include transitively reachable files within scope; default false |

**ScopeType values:**

| Value | Meaning | Pattern format |
|-------|---------|----------------|
| `path_glob` | Files matching glob patterns | e.g., `src/auth/**`, `**/*.repository.ts` |
| `layer_tag` | Files tagged with a specific architecture layer | Layer tag string, e.g., `data-access`, `api` |
| `module_prefix` | Files in modules matching a name prefix | Module name prefix, e.g., `auth.`, `core.` |
| `explicit_files` | Explicit list of normalized file IDs | FileEntry identity keys |

### Filters

Filters are applied AFTER scope inclusion to further restrict the projected content.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `filter_type` | `FilterType` | Yes | Kind of filter |
| `values` | `string[]` | Yes | Values to match (semantics depend on `filter_type`) |
| `exclude` | `boolean` | No | If true, exclude matching items instead of including; default false |

**FilterType values:**

| Value | Meaning |
|-------|---------|
| `path_glob` | Filter files by glob pattern |
| `language_tag` | Filter by programming language (e.g., `typescript`, `python`) |
| `layer_tag` | Filter by architecture layer tag |
| `symbol_kind` | Filter symbols by kind (e.g., `function`, `class`, `interface`) |
| `visibility` | Filter symbols by visibility (e.g., `public`, `exported`) |

---

## Slice Actions

### slice_catalog

Returns all registered slices for a workspace.

- **Input:** `{ workspace_id: string }`
- **Output:** `SliceCatalogResponse` — array of slice summaries, no materialized content
- **Ordering:** Slices ordered by `name` alphabetically

### slice_detail

Returns the full definition and latest materialized projection of a slice.

- **Input:** `{ workspace_id, slice_id, materialize?: boolean }`
- **materialize=true:** Re-compute projection against current code graph state
- **materialize=false (default):** Return cached projection if available; compute if not
- **Output:** `SliceDetailResponse` — full definition + nodes + edges

### slice_projection

Returns a filtered projection at a specific granularity level, with optional additional filters.

- **Input:** `{ workspace_id, slice_id, projection_type, filters?: SliceFilter[], limit?: number }`
- **projection_type** controls returned item types:

| projection_type | Returned item type | Foundation schema type |
|-----------------|-------------------|----------------------|
| `file_level` | One item per file in scope | `FileEntry` |
| `module_level` | One item per module in scope | `ModuleEntry` (subset of ModuleGraph) |
| `symbol_level` | One item per symbol in scope | `SymbolEntry` |

- **Output:** `SliceProjectionResponse` — discriminated by `projection_type`, with truncation info

### slice_filters

Returns available filter options for a slice or the whole workspace.

- **Input:** `{ workspace_id, slice_id?: string }`
- **Output:** `SliceFiltersResponse` — available tags, layer names, language tags, path prefixes

---

## Projection Types

### file_level

Returns one `FileEntry` per file in the slice scope after filtering.

- **Use case:** Enumerate scoped files for display, search, or dependency analysis
- **Output size:** One item per file (bounded by slice scope size)
- **Contains:** path, language, module_id, layer_tag, loc

### module_level

Returns one `ModuleEntry` per module that has at least one file in the slice scope.

- **Use case:** Collapsed view showing module-to-module dependencies within the slice
- **Output size:** Significantly smaller than `file_level` (files grouped by module)
- **Contains:** module_id, module_name, file_count in scope, inbound/outbound edge counts

### symbol_level

Returns one `SymbolEntry` per symbol in files that are in the slice scope.

- **Use case:** Detailed symbol-level analysis; searching within constrained scope
- **Output size:** Potentially large (all symbols in all scoped files)
- **Contains:** name, kind, file_id, start_line, end_line, visibility
- **Limit enforcement:** Hard limit of 1000 items per response; use `limit` + client offset pagination

---

## Output Size Limits

| Action | Default limit | Hard max |
|--------|--------------|---------|
| `slice_catalog` | All slices (no limit) | 500 slices per workspace |
| `slice_detail` nodes | 500 files | 2000 files |
| `slice_detail` edges | 1000 edges | 5000 edges |
| `slice_projection` (file_level) | 100 | 1000 |
| `slice_projection` (module_level) | 50 | 500 |
| `slice_projection` (symbol_level) | 100 | 1000 |

When a result is truncated, the response includes `truncated: true` and `returned` count.

---

## Error Conditions

| Condition | DiagnosticCode | Handling |
|-----------|---------------|---------|
| Slice not found | D001 | Error response; consumer should call `slice_catalog` to verify slice_id |
| Python core unavailable during materialization | D004 (partial graph) | Return partial or empty projection with diagnostic |
| Scope too broad — file count exceeds hard max | D008 (budget exceeded) | Return truncated result with `was_budget_capped: true` |
| Invalid filter values (unknown layer_tag, etc.) | D003 | Return warning diagnostic; filter ignored rather than rejected |
| Workspace schema version mismatch | D003 | Error response; recalibration required |

---

## Relationship to Python Core

- Slice _definitions_ are stored in MCP server SQLite (no Python core involved)
- Slice _projections_ query the Python core cartography graph, then filter by slice scope
- The Python core returns full `code_cartography` output; the TypeScript layer applies slice filters
- If the Python core is unavailable, `materialize=true` returns D004 partial diagnostic; cached projections still serve

---

## Implementation Note

Slice registration (creating/updating slices) is out of scope for this plan. Steps 10+ (Implementation) will implement query-only actions (`slice_catalog`, `slice_detail`, `slice_projection`, `slice_filters`). Slice CRUD will be a separate plan.
