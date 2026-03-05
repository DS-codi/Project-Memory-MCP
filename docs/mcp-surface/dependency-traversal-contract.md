# Dependency Traversal Contract

> **Status:** Planning Phase — Step 3
> **Plan:** MCP Surface Integration: expose memory_cartographer actions/resources via consolidated tools
> **Date:** 2026-03-05

## Overview

This document specifies the contract for plan dependency traversal via the `memory_cartographer` consolidated tool. All four dependency actions operate against the MCP server SQLite database — no Python core invocation is required.

The dependency graph is **directed**: edges run from a dependent plan to its dependency (i.e., "Plan A depends on Plan B" is an edge `A → B`).

---

## Entity Model

### DependencyNode

Represents a plan in the dependency graph.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Plan ID (`plan_...` format) |
| `title` | `string` | Yes | Plan title |
| `status` | `'pending' \| 'active' \| 'done' \| 'blocked' \| 'archived'` | Yes | Current plan status |
| `phase` | `string` | Yes | Current phase name |
| `priority` | `'low' \| 'medium' \| 'high' \| 'critical'` | Yes | Plan priority |
| `workspace_id` | `string` | Yes | Owning workspace ID |
| `depth_from_root` | `number` | Yes | BFS/DFS depth from traversal root (0 = root plan) |

### DependencyEdge

Represents a dependency relationship between two plans.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from_plan` | `string` | Yes | Plan ID that depends on `to_plan` |
| `to_plan` | `string` | Yes | Plan ID being depended upon |
| `edge_type` | `'depends_on' \| 'blocks' \| 'related'` | Yes | Semantic type of relationship |
| `declared_by` | `'user' \| 'agent' \| 'system'` | No | Who created the dependency |

### DependencyTraversalRequest

Common input shape for all traversal actions.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `workspace_id` | `string` | Yes | Workspace scope |
| `plan_id` \| `root_plan_id` | `string` | Yes | Starting plan (field name varies per action) |
| `direction` | `'dependencies' \| 'dependents' \| 'both'` | No | Traversal direction; default varies by action |
| `depth_limit` | `number` | No | Max traversal depth; default 1–5 depending on action |
| `include_archived` | `boolean` | No | Include archived plans; default false |
| `cursor` | `string` | No | Pagination cursor (bounded_traversal only) |
| `page_size` | `number` | No | Results per page; default 50 (bounded_traversal only) |

### DependencyTraversalResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `plan_id` | `string` | Yes | The root plan from which traversal started |
| `nodes` | `DependencyNode[]` | Yes | Deduplicated plan nodes found during traversal |
| `edges` | `DependencyEdge[]` | Yes | All edges traversed (excluding cycle back-edges) |
| `has_cycles` | `boolean` | Yes | Whether a cycle was detected |
| `cycle_path` | `string[]` | No | Plan IDs forming the first detected cycle (if any) |
| `depth_reached` | `number` | Yes | Maximum depth actually traversed |
| `was_depth_capped` | `boolean` | Yes | True if traversal stopped due to `depth_limit` |
| `next_cursor` | `string` | No | Pagination cursor for next page (bounded_traversal only) |
| `total_node_count` | `number` | Yes | Total nodes found (may exceed `nodes` length if paginated) |
| `diagnostics` | `DiagnosticEntry[]` | Yes | Zero or more diagnostic entries |

---

## Input Schema

### Action: get_plan_dependencies

Return plans that this plan directly (or transitively) depends on.

```
direction: fixed at 'dependencies'
depth_limit: default 1 (direct deps only), max 20
```

### Action: get_dependencies

Return the reverse transitive closure — plans that depend on this plan.

```
direction: fixed at 'dependents'
depth_limit: default 5, max 20
```

### Action: reverse_dependent_lookup

Return only direct dependents (plans that directly declare this plan as a dependency). Single-level, no pagination needed.

```
direction: fixed at 'dependents'
depth_limit: fixed at 1
```

### Action: bounded_traversal

Generic traversal with configurable direction, depth, pagination, and archived inclusion.

```
direction: 'dependencies' | 'dependents' | 'both' — required
depth_limit: default 5, max 20
page_size: default 50, max 200
cursor: opaque string returned by previous call
```

---

## Pagination Strategy

**Algorithm: depth-bounded BFS with cursor checkpoint**

1. Traversal proceeds level by level (BFS ordering)
2. After each BFS level completes, if total nodes would exceed `page_size`, emit `next_cursor`
3. Cursor encodes: `{ root_plan_id, direction, depth_completed, last_node_id, include_archived }`
4. Cursor is opaque to callers (base64-encoded JSON)
5. Subsequent call with `cursor` resumes from the encoded checkpoint
6. Visited-set is re-seeded from cursor to prevent re-visiting nodes already returned

**For `get_plan_dependencies`, `get_dependencies`, `reverse_dependent_lookup`:** No cursor pagination. These actions are bounded to `depth_limit ≤ 20` which keeps response sizes manageable without pagination.

---

## Cycle Detection Guarantees

**Algorithm: Visited-Set DFS with Path Tracking**

1. Maintain a `visited: Set<string>` of plan IDs encountered during traversal
2. Maintain a `path_stack: string[]` representing the current DFS path
3. Before enqueuing a plan's children: check if the plan_id is in `path_stack`
   - If YES: cycle detected → set `has_cycles = true`, record `cycle_path = [...path_stack, plan_id]`, **do not recurse into this plan**
   - If NO: add to `path_stack`, recurse, then pop from `path_stack`
4. A plan in `visited` but NOT in `path_stack` is a diamond (not a cycle) — continue without recording a cycle
5. Traversal completes even if a cycle is detected; all non-cycle edges are returned

**Guarantee:** The response always returns all reachable non-cycle edges within `depth_limit`. Cycle back-edges are excluded from `edges[]` but the cycle is documented in `cycle_path`.

---

## Error Conditions

| Condition | DiagnosticCode | Description | Response Behavior |
|-----------|---------------|-------------|------------------|
| Plan not found | D010 | `plan_id` / `root_plan_id` does not exist in DB | Return error response with code D010 |
| Cycle detected | D005 | Graph has one or more cycles | Continue traversal, include `has_cycles: true` + `cycle_path`, add D005 to diagnostics |
| Depth limit exceeded | D006 | Traversal capped at `depth_limit` | Return partial results, `was_depth_capped: true`, add D006 to diagnostics |
| Invalid cursor | D010 | Cursor is malformed or references deleted plan | Return error response; caller must restart traversal |
| Workspace mismatch | D007 | Plan exists but belongs to different workspace | Treat as not found (D010) |

---

## Ordering Guarantees

| Field | Ordering |
|-------|---------|
| `nodes` | BFS level ascending, then `plan_id` lexicographic within level |
| `edges` | `from_plan` lexicographic, then `to_plan` lexicographic |
| `cycle_path` | Ordered from root of cycle to the node that closes it |

Ordering is **deterministic** for a given graph state and input parameters. Two calls with identical inputs return identical `nodes` and `edges` ordering.

---

## Security/Access Notes

- All traversal operates within `workspace_id` scope — plans from other workspaces are invisible
- Archived plans are excluded unless `include_archived: true` is explicitly set
- No write operations are performed; all queries are read-only SELECT
- `cursor` values are validated server-side before use — malformed cursors are rejected with D010
