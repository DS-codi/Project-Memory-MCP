# Cartography Action Matrix

> **Status:** Design Phase — Step 6
> **Plan:** MCP Surface Integration: expose memory_cartographer actions/resources via consolidated tools
> **Date:** 2026-03-05

## Overview

This matrix specifies the consolidated action contracts for the `cartography_queries` domain of `memory_cartographer`. All five actions invoke the **PythonCoreAdapter** (`server/src/cartography/adapters/`) which bridges to `python-core/memory_cartographer/runtime/entrypoint.py`.

**Dispatch route:** `memory_cartographer.ts` → `switch(action)` → typed handler → `PythonCoreAdapter.query()` → Python core → filter/normalize → response

---

## Action Matrix

| Action | Input Params | Required Params | Output Key Fields | Error Codes | Notes |
|--------|-------------|----------------|-------------------|-------------|-------|
| `summary` | workspace_id, force_refresh | workspace_id | schema_version, generation_metadata{file_count,module_count,symbol_count,scan_duration_ms}, summary{architecture_layers,entry_point_count,dependency_edge_count,has_cycles} | D003, D008, D011 | Cache by workspace_id+scan_hash; LOW perf tier |
| `file_context` | workspace_id, file_id, include_symbols, include_references | workspace_id, file_id | file(FileEntry), symbols(SymbolEntry[]), inbound_references, outbound_references, module_membership | D001, D002, D003, D007, D009 | Cache by file_id+schema_version; symbols ordered by start_line asc |
| `flow_entry_points` | workspace_id, layer_filter, language_filter | workspace_id | entry_points[]{symbol,file,entry_kind,dependency_fan_out}, total_count | D001, D003, D004, D008 | Cache by workspace_id+filters_hash; ordered by entry_kind then file.path |
| `layer_view` | workspace_id, layers, include_cross_layer_edges, depth_limit | workspace_id, layers | layers[]{layer_tag,nodes(FileEntry[]),edges(ArchitectureEdge[])}, cross_layer_edges | D001, D003, D004, D005, D006 | Cache by workspace_id+layers+depth_limit; depth default 3 max 10 |
| `search` | workspace_id, query, search_scope, layer_filter, limit | workspace_id, query | results[]{kind,score,symbol?,file?,module_id?}, total_matches, truncated | D003, D007, D008, D011 | NOT cached; ordered by score desc; limit default 20 max 100 |

---

## Detailed Action Specs

### summary

**Request Schema:**
```ts
{
  action: 'summary',
  workspace_id: string,          // required
  force_refresh?: boolean        // default: false
}
```

**Response Shape:**
```ts
{
  action: 'summary',
  data: {
    result_uri: string,           // 'cartography://ws_{workspace_id}/summary'
    schema_version: string,
    workspace_identity: { workspace_id: string, path?: string },
    generation_metadata: {
      generated_at: string,
      scan_duration_ms: number,
      file_count: number,
      module_count: number,
      symbol_count: number
    },
    summary: {
      architecture_layers: string[],
      entry_point_count: number,
      dependency_edge_count: number,
      has_cycles: boolean
    },
    diagnostics: DiagnosticEntry[]
  }
}
```

**Preflight params (action-params-cartography.ts):**
```ts
summary: ['workspace_id', 'force_refresh?']
```

**Dispatch routing:**
```ts
case 'summary':
  return await pythonCoreAdapter.probe({ workspace_id, force_refresh });
```

---

### file_context

**Request Schema:**
```ts
{
  action: 'file_context',
  workspace_id: string,
  file_id: string,
  include_symbols?: boolean,     // default: true
  include_references?: boolean   // default: true
}
```

**Response Shape:**
```ts
{
  action: 'file_context',
  data: {
    result_uri: string,          // 'cartography://ws_{workspace_id}/files/{file_id}'
    file: FileEntry,
    symbols: SymbolEntry[],
    inbound_references: ReferenceEntry[],
    outbound_references: ReferenceEntry[],
    module_membership: { module_id: string, module_name: string },
    diagnostics: DiagnosticEntry[]
  }
}
```

**Preflight params:**
```ts
file_context: ['workspace_id', 'file_id', 'include_symbols?', 'include_references?']
```

---

### flow_entry_points

**Request Schema:**
```ts
{
  action: 'flow_entry_points',
  workspace_id: string,
  layer_filter?: string[],
  language_filter?: string[]
}
```

**Response Shape:**
```ts
{
  action: 'flow_entry_points',
  data: {
    result_uri: string,          // 'cartography://ws_{workspace_id}/flow/entry_points'
    entry_points: Array<{
      symbol: SymbolEntry,
      file: FileEntry,
      entry_kind: 'main' | 'cli' | 'http_route' | 'exported_api' | 'test_root',
      dependency_fan_out: number
    }>,
    total_count: number,
    diagnostics: DiagnosticEntry[]
  }
}
```

**Preflight params:**
```ts
flow_entry_points: ['workspace_id', 'layer_filter?', 'language_filter?']
```

---

### layer_view

**Request Schema:**
```ts
{
  action: 'layer_view',
  workspace_id: string,
  layers: string[],              // one or more layer tags; required
  include_cross_layer_edges?: boolean,  // default: false
  depth_limit?: number           // default: 3, max: 10
}
```

**Response Shape:**
```ts
{
  action: 'layer_view',
  data: {
    layers: Array<{
      layer_tag: string,
      nodes: FileEntry[],
      edges: ArchitectureEdge[]
    }>,
    cross_layer_edges: ArchitectureEdge[],
    diagnostics: DiagnosticEntry[]
  }
}
```

**Preflight params:**
```ts
layer_view: ['workspace_id', 'layers', 'include_cross_layer_edges?', 'depth_limit?']
```

---

### search

**Request Schema:**
```ts
{
  action: 'search',
  workspace_id: string,
  query: string,
  search_scope?: 'symbols' | 'files' | 'modules' | 'all',  // default: 'all'
  layer_filter?: string[],
  limit?: number                 // default: 20, max: 100
}
```

**Response Shape:**
```ts
{
  action: 'search',
  data: {
    results: Array<{
      kind: 'symbol' | 'file' | 'module',
      score: number,
      symbol?: SymbolEntry,
      file?: FileEntry,
      module_id?: string
    }>,
    total_matches: number,
    truncated: boolean,
    diagnostics: DiagnosticEntry[]
  }
}
```

**Preflight params:**
```ts
search: ['workspace_id', 'query', 'search_scope?', 'layer_filter?', 'limit?']
```

---

## Dispatch Routing

The `memory_cartographer.ts` handler dispatches cartography_queries actions to the `PythonCoreAdapter`:

```ts
// Pseudocode dispatch pattern (follows consolidated tool pattern from memory_context.ts)
async function handleCartographyQuery(action: string, params: CartographyQueryParams) {
  await preflightValidate('memory_cartographer', action, params);
  switch (action) {
    case 'summary':         return await pythonCore.querySummary(params);
    case 'file_context':    return await pythonCore.queryFileContext(params);
    case 'flow_entry_points': return await pythonCore.queryFlowEntryPoints(params);
    case 'layer_view':      return await pythonCore.queryLayerView(params);
    case 'search':          return await pythonCore.querySearch(params);
    default: return { success: false, error: 'D011: unknown action' };
  }
}
```

**3-layer validation:**
1. Null guard: `if (!params.workspace_id) throw ValidationError('workspace_id required')`
2. `preflightValidate('memory_cartographer', action, params)` — checks against action-params-cartography.ts spec
3. Case-level: e.g., `if (action === 'search' && !params.query) throw ValidationError('query required')`

---

## action-params-cartography.ts Preflight Spec

```ts
// server/src/tools/preflight/action-params-cartography.ts
export const CARTOGRAPHY_ACTION_PARAMS = {
  // Cartography queries
  summary:            { required: ['workspace_id'],              optional: ['force_refresh'] },
  file_context:       { required: ['workspace_id', 'file_id'],   optional: ['include_symbols', 'include_references'] },
  flow_entry_points:  { required: ['workspace_id'],              optional: ['layer_filter', 'language_filter'] },
  layer_view:         { required: ['workspace_id', 'layers'],    optional: ['include_cross_layer_edges', 'depth_limit'] },
  search:             { required: ['workspace_id', 'query'],     optional: ['search_scope', 'layer_filter', 'limit'] },
  // Dependencies (to be completed in dependency-action-matrix.md)
  // Architecture slices (to be completed in architecture-slice-matrix.md)
  // DB map (above dbmap actions also go here)
} as const;
```

---

## Performance Tiers

| Action | Tier | Rationale | Suggested Cache TTL |
|--------|------|-----------|-------------------|
| `summary` | LOW | Aggregate counts only, no file content | 5 min |
| `file_context` | MEDIUM | Single file + symbols + refs | 2 min |
| `flow_entry_points` | MEDIUM | Cross-file scan, filtered | 2 min |
| `layer_view` | HIGH | Potentially large graph subset | 1 min |
| `search` | MEDIUM | Query-driven, not cacheable; Python core may optimize internally | N/A |

Performance tier affects whether the TypeScript layer adds a cache hint header to the response metadata. Implementation in steps 10+ will define actual cache eviction strategy.

---

## Error Handling Summary

| Error Code | Trigger | Response Behavior |
|-----------|---------|-------------------|
| D001 | file_id/layer not found | Error response: `{ success: false, error: 'D001: ...' }` |
| D002 | Parse failure in file | Partial response + diagnostic |
| D003 | Schema version mismatch | Error response |
| D004 | Partial graph from Python core | Partial response + diagnostic + `was_partial: true` flag |
| D005 | Cycle in layer graph | Partial response + diagnostic + cycle info |
| D006 | depth_limit exceeded | Truncated response + diagnostic |
| D007 | Scope violation | Error response |
| D008 | Budget exceeded (files/time) | Truncated response + diagnostic + `was_budget_capped: true` |
| D011 | Unknown action | Error response (pre-switch guard) |
