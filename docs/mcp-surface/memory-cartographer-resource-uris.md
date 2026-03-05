# memory_cartographer Resource URI Conventions

> **Status:** Planning Phase — Step 2
> **Plan:** MCP Surface Integration: expose memory_cartographer actions/resources via consolidated tools
> **Date:** 2026-03-05

## Critical Clarification: These Are NOT MCP Resources

> ⚠️ **IMPORTANT ARCHITECTURAL DECISION**
>
> The URI patterns documented in this file are **inline payload conventions** — stable string identifiers embedded in tool response payloads. They are **NOT** registered MCP resource endpoints.
>
> **Evidence:** The MCP server (`server/src/index.ts`) uses `server.tool()` exclusively. `server.resource()` is never called anywhere in `server/src/`. No `server/src/resources/` directory exists. The codebase has no MCP resource protocol infrastructure.
>
> **Consequence:** All data access goes through `memory_cartographer` tool actions. These URI strings serve as:
> 1. **Cache keys** — consumers can cache a response keyed to its URI
> 2. **Reference handles** — a response can include a URI that identifies a related artifact a consumer could fetch via a subsequent tool action
> 3. **Stable identifiers** — URIs are deterministic and reproducible from their input parameters
>
> **There is no server-side URI resolution.** A consumer holding a URI string must call the appropriate `memory_cartographer` action to fetch the data the URI represents.

---

## URI Format Rules

### General Structure

```
{scheme}://{authority}/{path}[?{query}]
```

- **scheme** — one of: `cartography`, `dependency`, `architecture`, `dbmap`  
- **authority** — workspace or entity scope (see per-family rules below)  
- **path** — hierarchical resource path  
- **query** — optional parameters (e.g. `?depth=3`)  

All URI segment values are:
- **Percent-encoded** if they contain spaces, slashes, or special characters  
- **Lowercase** for static path segments  
- **Verbatim** (case-preserved) for dynamic identifiers (`workspace_id`, `file_id`, `plan_id`, etc.)

### Example (well-formed URI)

```
cartography://ws_abc123/files/src%2Ftools%2Fdispatch.ts
dependency://ws_abc123/plans/plan_xyz789/dependencies?depth=3
architecture://ws_abc123/slices/backend-core
dbmap://ws_abc123/tables/context_items
```

---

## Versioning Scheme

URIs do **not** encode schema version in the path. Instead, responses include a `schema_version` field from the output envelope. When a consumer caches a response, it should store both the URI and the `schema_version` together.

**Stability contract:**
- A URI with the same path and query params ALWAYS maps to the same action + parameters
- URI path structure is **semver-stable** — no breaking path changes within a major schema version
- When the Python core schema version bumps major (e.g. `1.x.x` → `2.x.x`), cached responses keyed to that URI are **invalidated** (consumers must re-fetch)

Cache invalidation signal: compare stored `schema_version` against `generation_metadata.schema_version` in a fresh response. If they differ, discard and re-fetch.

---

## Family 1: cartography:// — Code Cartography Graph

**Authority:** `ws_{workspace_id}` (use literal workspace_id value, prefixed `ws_`)

| URI Pattern | Maps-to Action | Required Input | Stability |
|-------------|---------------|----------------|-----------|
| `cartography://ws_{workspace_id}/summary` | `summary` | workspace_id | **STABLE** |
| `cartography://ws_{workspace_id}/files/{file_id}` | `file_context` | workspace_id, file_id | **STABLE** |
| `cartography://ws_{workspace_id}/flow/entry_points` | `flow_entry_points` | workspace_id | **STABLE** |
| `cartography://ws_{workspace_id}/layers/{layer_tag}` | `layer_view` | workspace_id, layer_tag (single) | **STABLE** |
| `cartography://ws_{workspace_id}/search?q={query}` | `search` | workspace_id, query | **UNSTABLE** (query params evolve) |

**Notes:**
- `file_id` is the normalized identity key from `FileEntry.file_id` (percent-encode `/` separators in paths)
- `layer_tag` in the URI is a single layer; multi-layer `layer_view` requests have no single canonical URI
- `search` URIs are UNSTABLE because query parameter shape may evolve

---

## Family 2: dependency:// — Plan Dependency Graph

**Authority:** `ws_{workspace_id}`

| URI Pattern | Maps-to Action | Required Input | Stability |
|-------------|---------------|----------------|-----------|
| `dependency://ws_{workspace_id}/plans/{plan_id}/dependencies` | `get_plan_dependencies` | workspace_id, plan_id | **STABLE** |
| `dependency://ws_{workspace_id}/plans/{plan_id}/dependencies?depth={n}` | `get_plan_dependencies` | workspace_id, plan_id, depth_limit | **STABLE** |
| `dependency://ws_{workspace_id}/plans/{plan_id}/dependents` | `get_dependencies` | workspace_id, plan_id | **STABLE** |
| `dependency://ws_{workspace_id}/plans/{plan_id}/reverse` | `reverse_dependent_lookup` | workspace_id, plan_id | **STABLE** |
| `dependency://ws_{workspace_id}/traversal/{plan_id}?dir={dir}&depth={n}` | `bounded_traversal` | workspace_id, root_plan_id, direction, depth_limit | **UNSTABLE** |

**Notes:**
- `bounded_traversal` URI is UNSTABLE — it represents a parameterized traversal, not a fixed resource. The URI is included as a reference hint, not a cache key.
- Paginated responses include `next_cursor` in the response body (not encoded in the URI).

---

## Family 3: architecture:// — Architecture Slices

**Authority:** `ws_{workspace_id}`

| URI Pattern | Maps-to Action | Required Input | Stability |
|-------------|---------------|----------------|-----------|
| `architecture://ws_{workspace_id}/slices` | `slice_catalog` | workspace_id | **STABLE** |
| `architecture://ws_{workspace_id}/slices/{slice_id}` | `slice_detail` | workspace_id, slice_id | **STABLE** |
| `architecture://ws_{workspace_id}/slices/{slice_id}/projection/{projection_type}` | `slice_projection` | workspace_id, slice_id, projection_type | **STABLE** |
| `architecture://ws_{workspace_id}/slices/{slice_id}/filters` | `slice_filters` | workspace_id, slice_id | **STABLE** |
| `architecture://ws_{workspace_id}/filters` | `slice_filters` (workspace-wide) | workspace_id | **STABLE** |

**Notes:**
- `slice_id` values are assigned by the MCP server when slices are registered (not user-chosen). They are stable UUIDs.
- `projection_type` segment is one of: `file_level`, `module_level`, `symbol_level`

---

## Family 4: dbmap:// — Database Map Access

**Authority:** `ws_{workspace_id}`

| URI Pattern | Maps-to Action | Required Input | Stability |
|-------------|---------------|----------------|-----------|
| `dbmap://ws_{workspace_id}/summary` | `db_map_summary` | workspace_id | **STABLE** |
| `dbmap://ws_{workspace_id}/tables/{table_name}/{pk}` | `db_node_lookup` | workspace_id, table_name, primary_key | **STABLE** |
| `dbmap://ws_{workspace_id}/tables/{table_name}/{pk}/edges` | `db_edge_lookup` | workspace_id, table_name, primary_key | **STABLE** |
| `dbmap://ws_{workspace_id}/tables/context_items?parent_type={pt}&parent_id={pid}` | `context_items_projection` | workspace_id, parent_type, parent_id | **STABLE** |

**Notes:**
- `table_name` must be in the server-enforced allowlist (see `database-map-access-contract.md`)
- `pk` values for context_items, plans, workspaces, etc. are UUIDs or plan-ID strings — always percent-encoded

---

## How URIs Appear in Responses

Each `memory_cartographer` tool response that represents a cacheable artifact includes a `result_uri` field at the top level of the `data` payload:

```ts
// Example response for summary action:
{
  action: 'summary',
  data: {
    result_uri: 'cartography://ws_abc123/summary',
    schema_version: '1.0.0',
    workspace_identity: { ... },
    generation_metadata: { ... },
    summary: { ... },
    diagnostics: []
  }
}
```

For actions that return collections (search results, slice catalogs), individual items may include an `item_uri` field pointing to the canonical detail URI for that item.

**Actions that do NOT include `result_uri`:**
- `search` (query-driven, no stable cache key)
- `bounded_traversal` (parameterized traversal)
- `context_items_projection` (filtered view, not a single entity)

---

## Stability Classification Summary

| Stability | Meaning | Cache TTL Suggestion |
|-----------|---------|---------------------|
| **STABLE** | URI structure will not change within a major schema version | Up to 5 minutes (code graph), 60 seconds (plan graph) |
| **UNSTABLE** | URI may include evolving query params; treat as ephemeral hint | Do not cache |

All caching by consumers is client-side only. The `memory_cartographer` tool itself does not maintain a server-side response cache (the Python core may maintain an in-process cache — that is transparent to callers).

---

## Implementation Note for Step 2

The `result_uri` field in responses is a **string field added to tool response payloads** during the Implementation phase (steps 10+). It requires:
1. A URI-builder utility in `server/src/cartography/` that constructs URIs deterministically from action inputs
2. The utility must be pure (no DB calls) and injectable into each action's response assembly

No MCP `server.resource()` call is needed or desired.
