# Consolidated Resource URI Matrix

> **Status:** Design Phase — Step 9
> **Plan:** MCP Surface Integration: expose memory_cartographer actions/resources via consolidated tools
> **Date:** 2026-03-05

---

## IMPORTANT: Inline Payload Conventions, NOT MCP Resources

> ⚠️ **These are inline payload conventions — not MCP Resources. No `server.resource()` registration.**
>
> The MCP server (`server/src/index.ts`) uses `server.tool()` exclusively. `server.resource()` is never called anywhere in the codebase. No `server/src/resources/` directory exists.
>
> The URI strings in this matrix appear as `result_uri` fields in `memory_cartographer` tool response payloads. They are stable string identifiers that consumers may use as cache keys and reference handles. **There is no server-side URI resolution path.** To fetch data for a URI, call the corresponding `memory_cartographer` action.

---

## Summary Statistics

| URI Family | Scheme | Total URIs | Stable | Unstable | Implementation Phase |
|-----------|--------|-----------|--------|---------|---------------------|
| Code cartography | `cartography://` | 5 | 4 | 1 | Steps 10–14 |
| Plan dependency | `dependency://` | 5 | 4 | 1 | Steps 10–14 |
| Architecture slices | `architecture://` | 5 | 5 | 0 | Steps 10–14 |
| DB map | `dbmap://` | 4 | 4 | 0 | Steps 10–14 |
| **Total** | | **19** | **17** | **2** | |

---

## Family 1: cartography:// — Code Cartography Graph

**Scheme:** `cartography://`
**Authority:** `ws_{workspace_id}`
**Maps-to tool action:** `memory_cartographer`
**Dispatch domain:** `cartography_queries`

| # | URI Pattern | Stability | Maps-to Action | Input binding | Cache TTL | Notes |
|---|-------------|-----------|---------------|---------------|-----------|-------|
| 1 | `cartography://ws_{workspace_id}/summary` | STABLE | `summary` | workspace_id from authority | 5 min | Aggregate scan result |
| 2 | `cartography://ws_{workspace_id}/files/{file_id}` | STABLE | `file_context` | workspace_id, file_id from path | 2 min | file_id is percent-encoded FileEntry.file_id |
| 3 | `cartography://ws_{workspace_id}/flow/entry_points` | STABLE | `flow_entry_points` | workspace_id from authority | 2 min | Unfiltered entry points variant |
| 4 | `cartography://ws_{workspace_id}/layers/{layer_tag}` | STABLE | `layer_view` | workspace_id, layers=[layer_tag] | 1 min | Single-layer variant only; no URI for multi-layer calls |
| 5 | `cartography://ws_{workspace_id}/search?q={query}` | UNSTABLE | `search` | workspace_id, query from query param | Do not cache | Query-driven; params evolve |

**cartography:// URI notes:**
- `file_id` values use percent-encoding: forward slashes `/` in paths become `%2F`
- Multi-layer `layer_view` calls have no canonical URI (they are parameterized queries, not named resources)
- UNSTABLE URIs are included in responses as reference hints, not cache keys

---

## Family 2: dependency:// — Plan Dependency Graph

**Scheme:** `dependency://`
**Authority:** `ws_{workspace_id}`
**Maps-to tool action:** `memory_cartographer`
**Dispatch domain:** `dependencies_dependents`

| # | URI Pattern | Stability | Maps-to Action | Input binding | Cache TTL | Notes |
|---|-------------|-----------|---------------|---------------|-----------|-------|
| 6 | `dependency://ws_{workspace_id}/plans/{plan_id}/dependencies` | STABLE | `get_plan_dependencies` | workspace_id, plan_id (depth=1) | 60 sec | Direct deps only |
| 7 | `dependency://ws_{workspace_id}/plans/{plan_id}/dependencies?depth={n}` | STABLE | `get_plan_dependencies` | workspace_id, plan_id, depth_limit=n | 60 sec | Depth-parameterized variant |
| 8 | `dependency://ws_{workspace_id}/plans/{plan_id}/dependents` | STABLE | `get_dependencies` | workspace_id, plan_id (depth=5) | 60 sec | Reverse closure |
| 9 | `dependency://ws_{workspace_id}/plans/{plan_id}/reverse` | STABLE | `reverse_dependent_lookup` | workspace_id, plan_id | 60 sec | Direct dependents only |
| 10 | `dependency://ws_{workspace_id}/traversal/{plan_id}?dir={dir}&depth={n}` | UNSTABLE | `bounded_traversal` | workspace_id, root_plan_id, direction, depth_limit | Do not cache | Generic traversal; parameterized |

**dependency:// URI notes:**
- Not cached by default (live DB reads); suggested TTL is advisory for client-side dedup only
- Paginated `bounded_traversal` responses include `next_cursor` in the response body; the URI does not encode pagination state
- UNSTABLE #10 is returned as a reference hint in `bounded_traversal` responses

---

## Family 3: architecture:// — Architecture Slices

**Scheme:** `architecture://`
**Authority:** `ws_{workspace_id}`
**Maps-to tool action:** `memory_cartographer`
**Dispatch domain:** `architecture_slices`

| # | URI Pattern | Stability | Maps-to Action | Input binding | Cache TTL | Notes |
|---|-------------|-----------|---------------|---------------|-----------|-------|
| 11 | `architecture://ws_{workspace_id}/slices` | STABLE | `slice_catalog` | workspace_id | 30 sec | All slices for workspace |
| 12 | `architecture://ws_{workspace_id}/slices/{slice_id}` | STABLE | `slice_detail` | workspace_id, slice_id | 2 min | Full definition + projection |
| 13 | `architecture://ws_{workspace_id}/slices/{slice_id}/projection/{projection_type}` | STABLE | `slice_projection` | workspace_id, slice_id, projection_type | 1 min | projection_type in path |
| 14 | `architecture://ws_{workspace_id}/slices/{slice_id}/filters` | STABLE | `slice_filters` | workspace_id, slice_id | 5 min | Slice-scoped filter options |
| 15 | `architecture://ws_{workspace_id}/filters` | STABLE | `slice_filters` (no slice_id) | workspace_id | 5 min | Workspace-wide filter options |

**architecture:// URI notes:**
- `slice_id` values are server-assigned UUIDs; they are stable for the lifetime of the slice
- `projection_type` in URI path is one of: `file_level`, `module_level`, `symbol_level`
- All 5 architecture URIs are STABLE — no parameterized-only cases in this family

---

## Family 4: dbmap:// — Database Map Access

**Scheme:** `dbmap://`
**Authority:** `ws_{workspace_id}`
**Maps-to tool action:** `memory_cartographer`
**Dispatch domain:** `database_map_access`

| # | URI Pattern | Stability | Maps-to Action | Input binding | Cache TTL | Notes |
|---|-------------|-----------|---------------|---------------|-----------|-------|
| 16 | `dbmap://ws_{workspace_id}/summary` | STABLE | `db_map_summary` | workspace_id | 5 min | DB schema summary |
| 17 | `dbmap://ws_{workspace_id}/tables/{table_name}/{pk}` | STABLE | `db_node_lookup` | workspace_id, table_name, primary_key | 30 sec | Single row by PK |
| 18 | `dbmap://ws_{workspace_id}/tables/{table_name}/{pk}/edges` | STABLE | `db_edge_lookup` | workspace_id, table_name, primary_key | 30 sec | FK-connected rows |
| 19 | `dbmap://ws_{workspace_id}/tables/context_items?parent_type={pt}&parent_id={pid}` | STABLE | `context_items_projection` | workspace_id, parent_type, parent_id | Do not cache | Paginated; query-driven |

**dbmap:// URI notes:**
- `table_name` must be in ALLOWED_TABLES; any unlisted table is not addressable via URI
- `pk` (primary key) values for UUIDs/plan-IDs are percent-encoded
- `context_items` projection URI is STABLE in structure but NOT cacheable (live DB, paginated)
- URI #19 does not encode pagination cursor; cursor is managed in request/response body

---

## URI Construction Rules (for Implementation)

When implementing the `result_uri` field in tool responses, follow these rules:

```ts
// URI builder utility (to be created in server/src/cartography/uri-builder.ts)

function buildCartographyUri(workspace_id: string, resource: string): string {
  return `cartography://ws_${workspace_id}/${resource}`;
}

function buildFileUri(workspace_id: string, file_id: string): string {
  return `cartography://ws_${workspace_id}/files/${encodeURIComponent(file_id)}`;
}

function buildDependencyUri(workspace_id: string, plan_id: string, rel: string): string {
  return `dependency://ws_${workspace_id}/plans/${plan_id}/${rel}`;
}

function buildSliceUri(workspace_id: string, slice_id: string, suffix?: string): string {
  const base = `architecture://ws_${workspace_id}/slices/${slice_id}`;
  return suffix ? `${base}/${suffix}` : base;
}

function buildDbMapUri(workspace_id: string, path: string): string {
  return `dbmap://ws_${workspace_id}/${path}`;
}
```

All parameter values MUST be percent-encoded if they contain `/`, `?`, `#`, `&`, or space. The `encodeURIComponent` function covers all cases.

---

## Consumer Usage Pattern

```ts
// How a consumer uses result_uri for caching:
const response = await mcpClient.callTool('memory_cartographer', {
  action: 'summary', workspace_id: 'abc123'
});

const { result_uri, schema_version, summary } = response.data;
// result_uri = 'cartography://ws_abc123/summary'

// Client-side cache:
cache.set(result_uri, { data: response.data, schema_version, cached_at: Date.now() });

// Later, check cache:
const cached = cache.get('cartography://ws_abc123/summary');
if (cached && cached.schema_version === currentSchemaVersion) {
  return cached.data;  // Cache hit
}
// Cache miss or schema change → re-call memory_cartographer
```

---

## Mapping: URI → Action → Domain

| # | URI (abbreviated) | Action | Domain | Dispatch Layer |
|---|-------------------|--------|--------|----------------|
| 1 | `cartography://.../summary` | `summary` | cartography_queries | PythonCoreAdapter |
| 2 | `cartography://.../files/{id}` | `file_context` | cartography_queries | PythonCoreAdapter |
| 3 | `cartography://.../flow/entry_points` | `flow_entry_points` | cartography_queries | PythonCoreAdapter |
| 4 | `cartography://.../layers/{tag}` | `layer_view` | cartography_queries | PythonCoreAdapter |
| 5 | `cartography://.../search?q=...` | `search` | cartography_queries | PythonCoreAdapter |
| 6 | `dependency://.../dependencies` | `get_plan_dependencies` | dependencies_dependents | DB (SQLite) |
| 7 | `dependency://.../dependencies?depth=n` | `get_plan_dependencies` | dependencies_dependents | DB (SQLite) |
| 8 | `dependency://.../dependents` | `get_dependencies` | dependencies_dependents | DB (SQLite) |
| 9 | `dependency://.../reverse` | `reverse_dependent_lookup` | dependencies_dependents | DB (SQLite) |
| 10 | `dependency://.../traversal/...` | `bounded_traversal` | dependencies_dependents | DB (SQLite) |
| 11 | `architecture://.../slices` | `slice_catalog` | architecture_slices | DB (SQLite) |
| 12 | `architecture://.../slices/{id}` | `slice_detail` | architecture_slices | DB + PythonCoreAdapter |
| 13 | `architecture://.../projection/{type}` | `slice_projection` | architecture_slices | DB + PythonCoreAdapter |
| 14 | `architecture://.../filters` (slice) | `slice_filters` | architecture_slices | DB + PythonCoreAdapter |
| 15 | `architecture://.../filters` (ws) | `slice_filters` | architecture_slices | PythonCoreAdapter |
| 16 | `dbmap://.../summary` | `db_map_summary` | database_map_access | DB (SQLite) |
| 17 | `dbmap://.../tables/{t}/{pk}` | `db_node_lookup` | database_map_access | DB (SQLite) |
| 18 | `dbmap://.../tables/{t}/{pk}/edges` | `db_edge_lookup` | database_map_access | DB (SQLite) |
| 19 | `dbmap://.../context_items?...` | `context_items_projection` | database_map_access | DB (SQLite) |
