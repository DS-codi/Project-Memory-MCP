# memory_cartographer — Consumer Integration Usage Guide

**Plan:** Consumer Integration & Validation: agent routing usage, tests, and cross-surface docs  
**Phase:** Documentation  
**Step:** 13 — Consumer integration usage documentation  
**Status:** Reference (consumer-facing)

---

## Overview

`memory_cartographer` is a consolidated MCP tool that exposes workspace cartography — plan dependency graphs, database structure maps, and (Phase B) Python-backed architecture intelligence — to authorized agent consumers.

It provides **17 actions** across **4 domain families**:

| Domain | Implementation Phase | Actions |
|--------|---------------------|---------|
| `dependencies_dependents` | **Phase A** (SQLite) | 4 actions |
| `database_map_access` | **Phase A** (SQLite) | 4 actions |
| `architecture_slices` | Phase A (`slice_catalog` only); Phase B (remaining 3) | 4 actions total |
| `cartography_queries` | **Phase B** (Python-blocked) | 5 actions |

### Phase A / Phase B Split

**Phase A** actions are fully implemented and backed by SQLite. They run without any Python dependency and are safe to call in production workflows today.

**Phase B** actions require the Python core `cartograph` intent to be fully implemented. Until then, they return `{ diagnostic_code: "FEATURE_NOT_AVAILABLE" }` stubs. **Do not call Phase B actions in production workflows**.

### Which Surface Can Call It

`memory_cartographer` is an MCP tool registered on the server's `stdio` transport:

| Surface | Can call directly? | Notes |
|---------|-------------------|-------|
| **Agent (via MCP client)** | Yes | Primary consumer; must be an authorized agent type |
| **VS Code extension** | Yes | Routes through the extension's MCP client |
| **Dashboard** | No — reads only | Reads cartographer output from plan context; does not invoke the tool directly |
| **CLI** | Yes | Use the MCP server's stdio transport |

---

## Authorization

`memory_cartographer` enforces agent type authorization at the preflight layer. The check runs before any data is touched.

### Authorized Agent Types

| Agent Type | Authorized |
|------------|-----------|
| `Coordinator` | ✅ Yes |
| `Analyst` | ✅ Yes |
| `Executor` | ✅ Yes |
| `Researcher` | ✅ Yes |
| `Architect` | ✅ Yes |
| `Tester` | ❌ No |
| `Revisionist` | ❌ No |
| `Archivist` | ❌ No |

### Unauthorized Access Behavior

When an unauthorized agent type calls the tool, the response returns `PERMISSION_DENIED` immediately — no action dispatch occurs:

```json
{
  "success": false,
  "data": {
    "action": "<action>",
    "data": null,
    "diagnostics": [{
      "code": "PERMISSION_DENIED",
      "severity": "ERROR",
      "message": "Agent type '<AgentType>' is not authorized to call memory_cartographer",
      "recoverable": false
    }]
  }
}
```

**Fix:** Ensure the calling agent session is one of the authorized types. Hub routes cartography calls through authorized spoke agents (Executor, Researcher, Architect, or Analyst).

---

## Phase A Actions Reference

### Domain: `dependencies_dependents`

> Pure SQLite. Always available. No Python dependency.

All actions use dot-notation: `dependencies_dependents.<action_name>`.

---

**`dependencies_dependents.get_plan_dependencies`**

Returns the direct dependency list for a single plan.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `workspace_id` | `string` | Yes | — | Workspace identifier |
| `plan_id` | `string` | Yes | — | Target plan ID (format: `plan_[a-z0-9_]+`) |
| `depth_limit` | `number` | No | 1 | Max traversal depth; max 20 |

---

**`dependencies_dependents.get_dependencies`**

Full forward-dependency traversal from a plan.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `workspace_id` | `string` | Yes | — | Workspace identifier |
| `plan_id` | `string` | Yes | — | Starting plan ID |
| `depth_limit` | `number` | No | 5 | Max traversal depth; max 20 |

---

**`dependencies_dependents.reverse_dependent_lookup`**

Finds all plans that depend on the given plan (reverse/inbound traversal).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `workspace_id` | `string` | Yes | — | Workspace identifier |
| `plan_id` | `string` | Yes | — | Target plan ID |

---

**`dependencies_dependents.bounded_traversal`**

Paginated traversal in any direction with cursor support.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `workspace_id` | `string` | Yes | — | Workspace identifier |
| `root_plan_id` | `string` | Yes | — | Starting plan for traversal |
| `direction` | `'dependencies' \| 'dependents' \| 'both'` | No | `'both'` | Traversal direction |
| `depth_limit` | `number` | No | 5 | Max traversal depth; max 20 |
| `include_archived` | `boolean` | No | `false` | Include archived plans in results |
| `cursor` | `string` | No | — | Pagination cursor from previous call |
| `page_size` | `number` | No | 50 | Page size; max 200 |

---

### Domain: `database_map_access`

> Pure SQLite. Always available. `context_data` is **always masked** — this is a security invariant that cannot be disabled.

All actions use dot-notation: `database_map_access.<action_name>`.

---

**`database_map_access.db_map_summary`**

Returns schema summary: table names, row counts, column counts, and FK relation metadata.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Scope for workspace-filtered row counts |

---

**`database_map_access.db_node_lookup`**

Returns a single row from an allowlisted table by primary key. Sensitive columns are masked.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace scope |
| `table_name` | `string` | Yes | Must be in `ALLOWLISTED_TABLES` |
| `primary_key` | `string` | Yes | Primary key value |

**Allowlisted tables:** `plans`, `plan_dependencies`, `context_items`, `agent_sessions`, `workspace_meta`

---

**`database_map_access.db_edge_lookup`**

Returns FK-related rows for a source entity, with optional direction filter.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `workspace_id` | `string` | Yes | — | Workspace scope |
| `table_name` | `string` | Yes | — | Source entity table (allowlist-enforced) |
| `primary_key` | `string` | Yes | — | Source entity primary key |
| `direction` | `'outbound' \| 'inbound' \| 'both'` | No | `'both'` | FK traversal direction |

---

**`database_map_access.context_items_projection`**

Projects context items with safe data previews (first 500 chars only). `context_data` is never exposed.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `workspace_id` | `string` | Yes | — | Workspace scope |
| `parent_type` | `'plan' \| 'workspace'` | Yes | — | Scope discriminator |
| `parent_id` | `string` | Yes | — | Plan ID or workspace ID |
| `type_filter` | `string[]` | No | — | Filter by `context_items.type` values |
| `limit` | `number` | No | 50 | Max rows; max 500 |
| `cursor` | `string` | No | — | Opaque pagination cursor |
| `order_by` | `'created_at' \| 'type' \| 'parent_id'` | No | `'created_at'` desc | Sort order |

> **Security invariant:** `context_data` is always masked in all `database_map_access` responses. You will never receive the raw `context_data` field — not from `db_node_lookup`, not from `db_edge_lookup`, not from `context_items_projection`. Use `data_preview` (first 500 chars) for safe inspection.

---

### Domain: `architecture_slices` (Phase A — `slice_catalog` only)

**`architecture_slices.slice_catalog`** *(Phase A — SQLite)*

Returns the registered slice catalog for a workspace.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace identifier |

---

## Phase B Actions (Stub Notice)

The following actions and domains are **not available** until Phase B is implemented:

### `cartography_queries` — 5 actions (all Phase B)

- `cartography_queries.summary`
- `cartography_queries.file_context`
- `cartography_queries.flow_entry_points`
- `cartography_queries.layer_view`
- `cartography_queries.search`

### `architecture_slices` — 3 Phase B actions

- `architecture_slices.slice_detail`
- `architecture_slices.slice_projection`
- `architecture_slices.slice_filters`

**All Phase B stubs return:**

```json
{
  "success": true,
  "data": {
    "action": "<action>",
    "data": {
      "diagnostics": [{
        "code": "FEATURE_NOT_AVAILABLE",
        "severity": "ERROR",
        "message": "Phase B not yet implemented — Python core cartograph intent required",
        "recoverable": false
      }]
    }
  }
}
```

> **Do not call Phase B actions in production agent workflows.** Treat `FEATURE_NOT_AVAILABLE` as an expected stub response, not a bug. Phase B begins after the Python core `cartograph` implementation plan is complete and Phase A acceptance gates pass.

---

## Calling the Tool

### MCP Tool Call (Direct JSON)

Send as a standard MCP tool call with `action` and `params`:

```json
{
  "tool": "memory_cartographer",
  "params": {
    "action": "dependencies_dependents.get_dependencies",
    "params": {
      "workspace_id": "project_memory_mcp-50e04147a402",
      "plan_id": "plan_abc123",
      "depth_limit": 3
    },
    "_session_id": "sess_..."
  }
}
```

For `database_map_access.db_map_summary`:

```json
{
  "tool": "memory_cartographer",
  "params": {
    "action": "database_map_access.db_map_summary",
    "params": {
      "workspace_id": "project_memory_mcp-50e04147a402"
    },
    "_session_id": "sess_..."
  }
}
```

### VS Code Extension

The extension routes calls through its MCP client. Use the same JSON envelope as above — the extension's MCP client handles transport. No extension-specific wrapping is needed.

```typescript
// Inside an extension tool handler:
const result = await mcpClient.callTool('memory_cartographer', {
  action: 'dependencies_dependents.bounded_traversal',
  params: {
    workspace_id: workspaceId,
    root_plan_id: planId,
    direction: 'dependencies',
    depth_limit: 5,
  },
  _session_id: sessionId,
});
```

### Dashboard

The Dashboard **does not call `memory_cartographer` directly**. It reads cartographer output from plan context items stored by agents. If you need cartography data visible in the Dashboard, an authorized agent (Coordinator, Executor, Analyst, etc.) must call the tool and store the result via `memory_context(action: store)`.

### CLI (MCP stdio Transport)

Connect to the MCP server via its stdio transport and send a standard JSON-RPC `tools/call` request:

```bash
# Start the server in stdio mode and pipe a tool call:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"memory_cartographer","arguments":{"action":"database_map_access.db_map_summary","params":{"workspace_id":"project_memory_mcp-50e04147a402"}}}}' \
  | node server/dist/index.js
```

---

## Response Handling

### Normal Phase A Response

A successful Phase A call returns a structured response. Always check `success` before accessing `data.data`:

```typescript
const result = await memory_cartographer({
  action: 'dependencies_dependents.get_dependencies',
  params: { workspace_id, plan_id },
});

if (!result.success || result.data?.data == null) {
  // Log and apply fallback — do NOT throw
  return null;
}

const { nodes, edges, has_cycles, diagnostics } = result.data.data;

if (diagnostics?.some(d => d.severity === 'ERROR')) {
  // Log diagnostic details; decide if partial result is usable
}

// Use nodes and edges
```

### PERMISSION_DENIED

The calling agent type is not in the authorized list.

```typescript
// Response shape:
{ success: false, data: { diagnostics: [{ code: "PERMISSION_DENIED", ... }] } }

// Fix: Ensure the call is made from an authorized agent type.
// Hub should route cartography calls through Coordinator, Analyst, Executor,
// Researcher, or Architect — not Tester, Revisionist, or Archivist.
```

### EMPTY_RESULT

The adapter returned a null or empty result. This typically means the database contains no matching data (e.g., a plan with no dependencies, or an empty workspace).

```typescript
// Response shape:
{ success: true, data: { data: { nodes: [], edges: [], diagnostics: [{ code: "EMPTY_RESULT", ... }] } } }

// Handling: Treat as a valid empty state. Log at INFO level. Do not fail the workflow.
if (nodes.length === 0 && edges.length === 0) {
  logger.info('memory_cartographer: empty result — no dependencies found for plan', { plan_id });
  return { nodes: [], edges: [] };
}
```

### FEATURE_NOT_AVAILABLE

A Phase B stub action was called before Phase B is implemented.

```typescript
// Response shape:
{ success: true, data: { data: { diagnostics: [{ code: "FEATURE_NOT_AVAILABLE", ... }] } } }

// Handling: This is expected behavior until Phase B ships. Do NOT treat as a bug.
// Apply a no-op fallback and continue.
if (diagnostics.some(d => d.code === 'FEATURE_NOT_AVAILABLE')) {
  logger.debug('memory_cartographer: Phase B action not yet available — skipping', { action });
  return null;
}
```

---

## Security Invariants

The following invariants are enforced by the server and cannot be bypassed by consumers:

1. **`context_data` is always masked.** No `database_map_access` action returns the raw `context_data` column. Use `context_items_projection`'s `data_preview` (first 500 chars) for safe inspection.

2. **No raw SQL is exposed.** All queries are executed internally via parameterized statements. Consumers receive typed response objects, never query plans or raw result sets.

3. **Read-only enforcement.** `memory_cartographer` never mutates database state. All operations are SELECT-equivalent. No `INSERT`, `UPDATE`, or `DELETE` paths exist in the tool.

4. **Table allowlist enforced.** `db_node_lookup` and `db_edge_lookup` operate only on `ALLOWLISTED_TABLES`: `plans`, `plan_dependencies`, `context_items`, `agent_sessions`, `workspace_meta`. Any other table name returns `ACCESS_DENIED`.

5. **Agent type authorization at preflight.** Authorization is checked before any action dispatch. Unauthorized agents receive `PERMISSION_DENIED` with zero data access.

---

## Error Codes Reference

| Code | Severity | Meaning | Consumer Action |
|------|----------|---------|----------------|
| `PERMISSION_DENIED` | ERROR | Calling agent type is not authorized | Use an authorized agent type (Coordinator, Analyst, Executor, Researcher, Architect) |
| `EMPTY_RESULT` | WARN / INFO | Adapter returned null or empty data | Treat as valid empty state; log and continue |
| `FEATURE_NOT_AVAILABLE` | ERROR | Phase B action called before Phase B ships | Expected stub behavior; apply no-op fallback; do not treat as bug |
| `NOT_IMPLEMENTED` | ERROR | Action exists in schema but has no handler | Report as bug if encountered on a Phase A action; expected for some Phase B variants |

Additional diagnostic codes that may appear in the `diagnostics` array:

| Code | Meaning |
|------|---------|
| `ACCESS_DENIED` | Path/table operation not permitted (e.g., non-allowlisted table) |
| `INVALID_PARAMS` | Parameters failed preflight validation |
| `NOT_FOUND` | Referenced plan, entity, or file does not exist |
| `CYCLE_DETECTED` | Circular dependency detected during traversal (result still returned) |
| `DEPTH_LIMIT_EXCEEDED` | Traversal depth was capped at max |
| `PARTIAL_RESULT` | Output is a subset; some edges/nodes unresolved |
| `TIMEOUT` | Handler exceeded performance budget |
| `UNKNOWN_ACTION` | Action string not recognized |

---

## Fallback Policy

`memory_cartographer` provides **supplemental context** — agent workflows MUST remain functional without it.

**Critical rule:** Never throw, never block a handoff, never fail a workflow step on a `memory_cartographer` error of any kind.

### Required Fallback Behavior by Error Condition

| Error condition | Required consumer action |
|----------------|-------------------------|
| `success: false` | Log the error; return null or empty default; continue workflow |
| `PERMISSION_DENIED` | Log security event; skip this call; fix agent type routing |
| `EMPTY_RESULT` | Treat as valid empty state; continue |
| `FEATURE_NOT_AVAILABLE` | Phase B is not shipped; skip call; do not retry |
| `NOT_IMPLEMENTED` | Log as unexpected (Phase A) or expected (Phase B); skip |
| `TIMEOUT` in diagnostics | Log latency event; skip; do not block |
| `PARTIAL_RESULT` in diagnostics | Accept partial data; record that coverage may be incomplete |
| `null` / `undefined` `data.data` | Treat as complete unavailability; use no-op path |
| Unhandled exception from tool call | Catch at call site; log; continue |

### Recommended Call Pattern

```typescript
async function safeCartographerCall(action: string, params: object): Promise<unknown | null> {
  try {
    const result = await memory_cartographer({ action, params });

    if (!result.success || result.data?.data == null) {
      logger.warn('memory_cartographer unavailable', { action, result });
      return null;
    }

    const data = result.data.data as { diagnostics?: Array<{ code: string; severity: string }> };

    if (data.diagnostics?.some(d => d.severity === 'ERROR')) {
      const codes = data.diagnostics.filter(d => d.severity === 'ERROR').map(d => d.code);
      logger.warn('memory_cartographer returned error diagnostics', { action, codes });
      // Return partial data if usable, or null
    }

    return data;
  } catch (err) {
    logger.error('memory_cartographer threw unexpectedly', { action, err });
    return null;  // Never propagate — cartography is supplemental
  }
}
```

---

*See also:*
- [integration-contract.md](./integration-contract.md) — Full input/output contract per domain
- [validation-matrix.md](./validation-matrix.md) — Test coverage matrix
- [runbooks.md](./runbooks.md) — Build/test commands and troubleshooting
- [handoff-graph.md](./handoff-graph.md) — Agent handoff routing with cartographer
