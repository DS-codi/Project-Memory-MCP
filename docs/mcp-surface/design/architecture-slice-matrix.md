# Architecture Slice Action Matrix

> **Status:** Design Phase — Step 8
> **Plan:** MCP Surface Integration: expose memory_cartographer actions/resources via consolidated tools
> **Date:** 2026-03-05

## Overview

This matrix specifies the consolidated action contracts for the `architecture_slices` domain of `memory_cartographer`. Slice definitions are stored in the MCP server SQLite DB; slice projections are computed by the **PythonCoreAdapter** then filtered server-side.

**Dispatch route:** `memory_cartographer.ts` → `switch(action)` → typed handler → DB (for catalog/definition) + optional PythonCoreAdapter (for projection) → filter → response

---

## Action Matrix

| Action | Input Params | Required | Output Key Fields | Error Codes | Notes |
|--------|-------------|----------|-------------------|-------------|-------|
| `slice_catalog` | workspace_id | workspace_id | slices[]{slice_id,name,scope_type,created_at,last_materialized_at}, total | D011 | DB only; ordered by name |
| `slice_detail` | workspace_id, slice_id, materialize | workspace_id, slice_id | slice_id, name, scope, filters, nodes(FileEntry[]), edges(ArchitectureEdge[]), projection_summary, truncated | D001, D003, D004, D008 | Partial Python core call if materialize=true |
| `slice_projection` | workspace_id, slice_id, projection_type, filters, limit | workspace_id, slice_id, projection_type | items(SliceProjectionItem[]), total_in_slice, returned, truncated | D001, D004, D008 | Python core + filter; projection_type drives item shape |
| `slice_filters` | workspace_id, slice_id | workspace_id | available_layer_tags, available_language_tags, available_path_prefixes, active_filters? | D001, D003 | DB + Python core; ordered alphabetically |

---

## Scope Boundary Definition

A slice's scope boundary is defined at registration time and stored in the DB. It is opaque to query-side actions (read-only view).

| scope_type | Pattern semantics | Example patterns |
|------------|------------------|-----------------|
| `path_glob` | Standard glob; matches file paths relative to workspace root | `["src/auth/**", "src/session/**"]` |
| `layer_tag` | Must match `FileEntry.layer_tag` exactly | `["data-access", "repository"]` |
| `module_prefix` | Module name must start with one of the prefixes | `["auth.", "session."]` |
| `explicit_files` | Exact `FileEntry.file_id` values | `["src%2Fauth%2Findex.ts", "src%2Fauth%2Futil.ts"]` |

**Depth field:** Optional integer on the scope. If present, the slice includes files up to `depth` hops deep in the dependency graph from the matched root files.

**`include_transitive`:** If `true`, transitively reachable files (via import graph) within workspace are added to the scope. This can significantly expand a slice. Output size limits (`D008`) are enforced after transitive expansion.

---

## Projection Type Matrix

| projection_type | Item shape | Ordering | Default limit | Hard max | Python core involvement |
|-----------------|-----------|---------|--------------|---------|----------------------|
| `file_level` | `FileEntry` (path, language, module_id, layer_tag, loc) | `path` ascending | 100 | 1000 | Yes (filter from full output) |
| `module_level` | `ModuleEntry` (module_id, module_name, files_in_scope, outbound/inbound edge counts) | `module_name` ascending | 50 | 500 | Yes (aggregate from FileEntry) |
| `symbol_level` | `SymbolEntry` (name, kind, file_id, start_line, end_line, visibility) | `file_id` asc then `start_line` asc | 100 | 1000 | Yes (filter from full SymbolEntry list) |

**Filter × projection_type matrix** — which filter types apply per projection:

| Filter type | file_level | module_level | symbol_level |
|------------|-----------|-------------|-------------|
| `path_glob` | ✓ | ✓ (matches module root path) | ✓ |
| `language_tag` | ✓ | ✓ | ✓ |
| `layer_tag` | ✓ | ✓ | ✓ |
| `symbol_kind` | — | — | ✓ |
| `visibility` | — | — | ✓ |

Filters not applicable to a projection type are silently ignored (no error). A D003 diagnostic warning is added if an inapplicable filter was provided.

---

## Output Size Limits

| Action | Object type | Default limit | Hard max | Truncation behavior |
|--------|------------|--------------|---------|-------------------|
| `slice_catalog` | slices | — | 500 | D008 warning; return 500 |
| `slice_detail` nodes | FileEntry | 500 | 2000 | `truncated=true` |
| `slice_detail` edges | ArchitectureEdge | 1000 | 5000 | `truncated=true` |
| `slice_projection` (file_level) | FileEntry | 100 | 1000 | `truncated=true` |
| `slice_projection` (module_level) | ModuleEntry | 50 | 500 | `truncated=true` |
| `slice_projection` (symbol_level) | SymbolEntry | 100 | 1000 | `truncated=true` |

`limit` parameter applies on top of the hard max (min of caller limit and hard max is used).

---

## Error Conditions

| Condition | Code | Action(s) | Handling |
|-----------|------|-----------|---------|
| slice_id not found | D001 | slice_detail, slice_projection, slice_filters | `{ success: false, error: 'D001: slice not found' }` |
| Python core unavailable during materialize | D004 | slice_detail, slice_projection | Return empty nodes/items + D004 diagnostic (partial); `was_partial: true` flag |
| Scope expansion exceeds budget (file count) | D008 | slice_detail, slice_projection | Return truncated result + `was_budget_capped: true` + D008 diagnostic |
| Unknown filter_type value | D003 | slice_projection, slice_filters | Return D003 warning diagnostic; invalid filter ignored |
| Schema version mismatch | D003 | slice_detail, slice_projection | `{ success: false, error: 'D003: schema version mismatch' }` |
| limit out of range | — | slice_projection | Silently clamped to [1, hard_max] |

---

## Preflight Action Params

```ts
// Contribution to server/src/tools/preflight/action-params-cartography.ts
slice_catalog:    { required: ['workspace_id'],            optional: [] },
slice_detail:     { required: ['workspace_id', 'slice_id'], optional: ['materialize'] },
slice_projection: { required: ['workspace_id', 'slice_id', 'projection_type'],
                    optional: ['filters', 'limit'] },
slice_filters:    { required: ['workspace_id'],            optional: ['slice_id'] },
```

---

## Dispatch Routing

```ts
// Pseudocode — part of memory_cartographer.ts switch
case 'slice_catalog':
  return await sliceDb.listSlices(params.workspace_id);

case 'slice_detail':
  validateNull(params.slice_id, 'slice_id');
  const slice = await sliceDb.getSlice(params.workspace_id, params.slice_id);
  if (params.materialize || !slice.last_materialized_at) {
    const graph = await pythonCore.queryForSlice(params.workspace_id, slice.scope);
    return sliceProjector.buildDetail(slice, graph);
  }
  return sliceDb.getCachedDetail(params.workspace_id, params.slice_id);

case 'slice_projection':
  validateNull(params.slice_id, 'slice_id');
  validateNull(params.projection_type, 'projection_type');
  const sliceDef = await sliceDb.getSlice(params.workspace_id, params.slice_id);
  const graph = await pythonCore.queryForSlice(params.workspace_id, sliceDef.scope);
  return sliceProjector.project(sliceDef, graph, {
    projection_type: params.projection_type,
    filters: params.filters ?? [],
    limit: clamp(params.limit ?? 100, 1, getHardMax(params.projection_type)),
  });

case 'slice_filters':
  const filterOptions = await pythonCore.queryAvailableFilters(params.workspace_id);
  if (params.slice_id) {
    const sliceDef = await sliceDb.getSlice(params.workspace_id, params.slice_id);
    return sliceProjector.buildFiltersResponse(filterOptions, sliceDef.filters);
  }
  return sliceProjector.buildFiltersResponse(filterOptions, undefined);
```

---

## Response Shapes

### slice_catalog
```ts
{
  action: 'slice_catalog',
  data: {
    slices: SliceSummary[],   // ordered by name
    total: number
  }
}
```

### slice_detail
```ts
{
  action: 'slice_detail',
  data: {
    result_uri: string,        // 'architecture://ws_{workspace_id}/slices/{slice_id}'
    slice_id: string, name, description?, workspace_id,
    scope: SliceScope,
    filters: SliceFilter[],
    nodes: FileEntry[],        // ordered by path
    edges: ArchitectureEdge[], // ordered by from_module + to_module
    projection_summary: { file_count, symbol_count, edge_count },
    truncated: boolean,
    diagnostics: DiagnosticEntry[]
  }
}
```

### slice_projection
```ts
{
  action: 'slice_projection',
  data: {
    result_uri: string,        // 'architecture://ws_{workspace_id}/slices/{slice_id}/projection/{projection_type}'
    slice_id: string,
    projection_type: ProjectionType,
    items: SliceProjectionItem[],
    total_in_slice: number,
    returned: number,
    truncated: boolean,
    diagnostics: DiagnosticEntry[]
  }
}
```

### slice_filters
```ts
{
  action: 'slice_filters',
  data: {
    result_uri: string,        // 'architecture://ws_{workspace_id}/slices/{slice_id}/filters'
    available_layer_tags: string[],       // alphabetical
    available_language_tags: string[],    // alphabetical
    available_path_prefixes: string[],    // alphabetical
    active_filters?: SliceFilter[],
    diagnostics: DiagnosticEntry[]
  }
}
```
