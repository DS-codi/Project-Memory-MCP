# Database Map Access Contract

> **Status:** Planning Phase — Step 5
> **Plan:** MCP Surface Integration: expose memory_cartographer actions/resources via consolidated tools
> **Date:** 2026-03-05

## Overview

The `database_map_access` domain of `memory_cartographer` provides read-only introspection of the MCP server's SQLite database schema and selected entity data. It is designed for workspace-scoped schema discovery, entity navigation, and context_items projection.

**Core constraint: Read-only access only.** No INSERT, UPDATE, DELETE, or DDL operations are permitted. All queries run as SELECT statements against the allowed table set.

---

## Read-Only Constraint Enforcement

1. **Allowlist-enforced table access**: Only tables in the `ALLOWED_TABLES` list may be queried. Any request for an unlisted table returns DiagnosticCode D007 (SCOPE_VIOLATION).
2. **No raw SQL passthrough**: Callers cannot provide SQL strings. All queries are assembled server-side from structured input parameters.
3. **No lateral joins**: FK-join traversal is limited to the declared foreign-key relationships in `FK_RELATION_MAP` (see below). Arbitrary cross-table JOINs are not supported.
4. **Column masking**: Certain columns are masked in responses (e.g., credential fields, internal flags). See `MASKED_COLUMNS` list.
5. **Workspace scoping**: All queries are WHERE-filtered by `workspace_id` where the schema supports it. Data from other workspaces is invisible.

---

## Available Entity Types

### Allowed Tables (ALLOWED_TABLES)

| Table | Primary Key | Workspace Scoped | Description |
|-------|-------------|-----------------|-------------|
| `context_items` | `id` | Yes (via parent_type/parent_id) | Plan and workspace context data |
| `workspaces` | `id` | N/A (the workspace record itself) | Workspace registry |
| `plans` | `id` | Yes (`workspace_id`) | Plan records |
| `agent_sessions` | `id` | Yes (via plan → workspace) | Agent session records |
| `steps` | `id` | Yes (via plan → workspace) | Plan step records |
| `handoffs` | `id` | Yes (via plan → workspace) | Agent handoff records |
| `build_scripts` | `id` | Yes (`workspace_id`) | Registered build scripts |
| `research_notes` | `id` | Yes (via plan → workspace) | Research note records |

### Masked Columns (MASKED_COLUMNS)

These columns are returned as `null` or `"[REDACTED]"` in all responses:

| Table | Masked Column | Reason |
|-------|--------------|--------|
| `workspaces` | `path` | Filesystem path (potentially sensitive) |
| `context_items` | `data` (full field) | May contain secrets/keys in context JSON — use `data_preview` projection instead |
| `build_scripts` | `script_command` | May contain credentials in command args |
| `agent_sessions` | `context` | May contain injected user prompts |

*Note: `context_items.data` is NOT directly returned. Use the `context_items_projection` action which returns a safe `data_preview` (first 500 chars of JSON string only).*

### FK Relation Map (FK_RELATION_MAP)

Only these foreign key relationships may be traversed via `db_edge_lookup`:

| Source Table | FK Column | Target Table | Target PK |
|-------------|----------|-------------|----------|
| `plans` | `workspace_id` | `workspaces` | `id` |
| `agent_sessions` | `plan_id` | `plans` | `id` |
| `steps` | `plan_id` | `plans` | `id` |
| `handoffs` | `plan_id` | `plans` | `id` |
| `build_scripts` | `workspace_id` | `workspaces` | `id` |
| `research_notes` | `plan_id` | `plans` | `id` |

---

## Action Specifications

### db_map_summary

**Purpose:** Schema-level overview of the database — table list, approximate row counts, and relation count.

**Input:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Scope for workspace-filtered row counts |

**Output:**

```ts
{
  schema_version: string,       // SQLite user_version pragma value
  tables: Array<{
    table_name: string,         // from ALLOWED_TABLES only
    row_count: number,          // workspace-scoped COUNT(*) where applicable
    column_count: number,
    has_fk_relations: boolean,  // true if table appears in FK_RELATION_MAP
  }>,
  relation_count: number,       // total FK edges in FK_RELATION_MAP
  diagnostics: DiagnosticEntry[]
}
```

**Notes:** Row counts are workspace-scoped for tables with `workspace_id`; global count for `workspaces` table.

---

### db_node_lookup

**Purpose:** Fetch a single row from an allowed table by primary key.

**Input:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace scope for access control |
| `table_name` | `string` | Yes | Must be in ALLOWED_TABLES |
| `primary_key` | `string` | Yes | Primary key value (as string; server casts as needed) |

**Output:**

```ts
{
  table_name: string,
  row: Record<string, unknown>,      // column → value; masked columns are null/"[REDACTED]"
  fk_hints: Array<{
    column: string,                  // FK source column in this table
    references_table: string,        // table the FK points to
    references_pk: string,           // PK column in the referenced table
  }>,
  diagnostics: DiagnosticEntry[]
}
```

**Notes:** `fk_hints` are derived from FK_RELATION_MAP for rows matching this `table_name`. They are navigational hints — use `db_edge_lookup` to follow them.

---

### db_edge_lookup

**Purpose:** Return all FK-connected rows for a given entity (its immediate graph neighbourhood).

**Input:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace scope |
| `table_name` | `string` | Yes | Source entity table |
| `primary_key` | `string` | Yes | Source entity PK |
| `direction` | `'outbound' \| 'inbound' \| 'both'` | No | FK edge direction; default 'both' |

**Edge directions defined as:**
- **Outbound**: This entity holds the FK column (e.g., `plans.workspace_id → workspaces.id`)
- **Inbound**: Other entities hold a FK column pointing to this entity (e.g., `agent_sessions.plan_id → plans.id`: from the `plans` node, `agent_sessions` rows are "inbound")

**Output:**

```ts
{
  source: {
    table_name: string,
    primary_key: string
  },
  edges: Array<{
    direction: 'outbound' | 'inbound',
    fk_column: string,
    related_table: string,
    related_rows: Record<string, unknown>[],   // up to 50 rows per edge (masked)
    related_total: number,                      // actual matching row count (may exceed 50)
  }>,
  diagnostics: DiagnosticEntry[]
}
```

**Limit:** Max 50 `related_rows` per edge, with `related_total` indicating actual count.

---

### context_items_projection

**Purpose:** Specialized projection of `context_items` rows for a plan or workspace, with cursor-based pagination. This is the safe, paginated path for context data — the `data` column is never returned raw.

**Input:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace scope |
| `parent_type` | `'plan' \| 'workspace'` | Yes | Records scoping discriminator |
| `parent_id` | `string` | Yes | Plan ID or workspace ID |
| `type_filter` | `string[]` | No | Filter by `context_items.type` values |
| `limit` | `number` | No | Max rows; default 50, max 500 |
| `cursor` | `string` | No | Opaque pagination cursor |
| `order_by` | `'created_at' \| 'type' \| 'parent_id'` | No | Sort column; default 'created_at' desc |

**Output:**

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
    data_size_bytes: number,          // actual byte size of the data field
    data_preview: unknown,            // first 500 chars of JSON-stringified data
    is_truncated: boolean,            // true if data was truncated for preview
  }>,
  total_count: number,                // total rows matching query (before pagination)
  next_cursor?: string,               // present when more pages available
  diagnostics: DiagnosticEntry[]
}
```

**Pagination algorithm:** Cursor encodes `{ parent_type, parent_id, created_at_gt, item_id_gt, order_by }` (base64-encoded JSON). Stable ordering guaranteed by composite key on `(created_at, item_id)`.

---

## Join Projection Spec

The only multi-table join supported is the implicit workspace-scoping join. For example:

- `db_node_lookup('agent_sessions', session_id)` will verify the session's plan belongs to `workspace_id` before returning
- `db_edge_lookup('plans', plan_id, 'inbound')` returns associated `steps`, `agent_sessions`, `handoffs`, `research_notes` (all from FK_RELATION_MAP)

No arbitrary JOIN queries are permitted. Multi-hop joins require multiple sequential action calls.

---

## Pagination

| Action | Pagination Strategy |
|--------|-------------------|
| `db_map_summary` | No pagination (bounded by ALLOWED_TABLES count) |
| `db_node_lookup` | No pagination (single row) |
| `db_edge_lookup` | Implicit limit of 50 `related_rows` per edge; `related_total` indicates actual count |
| `context_items_projection` | Cursor-based pagination with `next_cursor` |

---

## Security Guarantees

1. **No mutation**: All actions are read-only. Any attempt to construct a mutating query server-side is a programmer error and will throw.
2. **No raw SQL passthrough**: Input parameters are mapped to parameterized prepared statements only.
3. **Injection prevention**: All `table_name` and column name inputs are validated against allowlists before query construction. No user-provided values are interpolated into SQL strings directly.
4. **Workspace isolation**: All queries include workspace boundary checks. A caller cannot access data from another workspace by providing a foreign `plan_id` or entity ID.
5. **Column masking**: Sensitive columns are always substituted before response serialization, regardless of action called.
6. **No schema DDL**: SQLite PRAGMA statements and DDL (`CREATE`, `ALTER`, `DROP`) are not supported via any action.
