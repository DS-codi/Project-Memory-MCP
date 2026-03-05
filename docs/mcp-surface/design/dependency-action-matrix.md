# Dependency/Dependent Traversal Action Matrix

> **Status:** Design Phase — Step 7
> **Plan:** MCP Surface Integration: expose memory_cartographer actions/resources via consolidated tools
> **Date:** 2026-03-05

## Overview

This matrix specifies the consolidated action contracts for the `dependencies_dependents` domain of `memory_cartographer`. All four actions query the **MCP server SQLite database** directly — no Python core invocation.

**Dispatch route:** `memory_cartographer.ts` → `switch(action)` → typed handler → DB layer (SQLite queries) → response

---

## Action Matrix

| Action | Input Params | Required | Output Key Fields | Error Codes | Notes |
|--------|-------------|----------|-------------------|-------------|-------|
| `get_plan_dependencies` | workspace_id, plan_id, depth_limit | workspace_id, plan_id | nodes(DependencyNode[]), edges(DependencyEdge[]), has_cycles, depth_reached, was_depth_capped | D005, D006, D010 | Direction fixed: dependencies; default depth 1 |
| `get_dependencies` | workspace_id, plan_id, depth_limit | workspace_id, plan_id | nodes, edges, has_cycles, depth_reached, was_depth_capped | D005, D006, D010 | Direction fixed: dependents; default depth 5 |
| `reverse_dependent_lookup` | workspace_id, plan_id | workspace_id, plan_id | nodes, edges | D010 | Direction fixed: dependents; depth fixed: 1 |
| `bounded_traversal` | workspace_id, root_plan_id, direction, depth_limit, include_archived, cursor, page_size | workspace_id, root_plan_id, direction | nodes, edges, has_cycles, cycle_path?, was_depth_capped, next_cursor?, total_node_count | D005, D006, D010 | Generic; cursor pagination; default depth 5 |

---

## Depth Limit Enforcement Table

| Action | Default depth | Minimum | Maximum | Configurable? |
|--------|-------------|---------|---------|--------------|
| `get_plan_dependencies` | 1 | 1 | 20 | Yes |
| `get_dependencies` | 5 | 1 | 20 | Yes |
| `reverse_dependent_lookup` | 1 | N/A | N/A | No (always 1) |
| `bounded_traversal` | 5 | 1 | 20 | Yes |

**Enforcement rule:**
1. Parse provided `depth_limit`; reject with validation error if negative or non-integer
2. Clamp to `[1, 20]` silently (do not error on out-of-range; log diagnostic D006 warning if clamped)
3. During BFS: track current depth per node; stop expanding when `current_depth >= depth_limit`
4. Set `was_depth_capped = true` if any node was reached at exactly `depth_limit` and had unexplored children

---

## Cycle Detection Algorithm

**Algorithm: Visited-Set DFS with Path Stack**

```
function traverse(root_plan_id: string, direction: TraversalDirection, depth_limit: number):
  visited = Set<string>()         // all nodes encountered (diamond detection)
  path_stack = string[]           // current DFS call stack (cycle detection)
  result_nodes = []
  result_edges = []
  has_cycles = false
  cycle_path = undefined

  function dfs(plan_id: string, depth: number):
    if depth > depth_limit: return (was_depth_capped = true)
    if plan_id in path_stack:
      has_cycles = true
      cycle_path = [...path_stack, plan_id]  // record first cycle found
      return  // do not recurse; omit back-edge from result_edges
    if plan_id in visited: return  // diamond — node already processed, not a cycle
    visited.add(plan_id)
    path_stack.push(plan_id)
    node = fetchPlanNode(plan_id)
    result_nodes.push(node)
    edges = fetchEdges(plan_id, direction)
    for each edge:
      result_edges.push(edge)
      dfs(edge.target_plan_id, depth + 1)
    path_stack.pop()

  dfs(root_plan_id, 0)
  return { nodes: result_nodes, edges: result_edges, has_cycles, cycle_path }
```

**Properties:**
- `visited` set prevents re-processing diamond nodes but does NOT block re-visiting a node in a different branch
- `path_stack` identifies actual cycles (a node appearing in the current recursive call chain)
- Only the first cycle detected is recorded in `cycle_path`; subsequent cycles within the same traversal are noted in `diagnostics` as D005 entries
- Cycle back-edges are excluded from `edges[]`; all other edges are included

---

## Cursor Pagination Spec

**Applies to:** `bounded_traversal` only

**Algorithm: BFS level checkpoint**

1. Traversal proceeds BFS level-by-level from root
2. After each full BFS level completes:
   - If `accumulated_nodes.length > page_size`: emit the current page with `next_cursor`
   - Cursor encodes checkpoint state (see below)
3. On resume (caller provides `cursor`):
   - Decode cursor; validate workspace_id + root_plan_id match
   - Re-seed visited set from cursor's `visited_plan_ids`
   - Resume from cursor's `pending_queue` (next BFS level to process)

**Cursor payload (base64-encoded JSON):**
```ts
{
  version: 1,
  root_plan_id: string,
  workspace_id: string,
  direction: TraversalDirection,
  depth_limit: number,
  include_archived: boolean,
  depth_completed: number,         // last fully-completed BFS depth
  pending_queue: string[],         // plan IDs queued for next depth level
  visited_plan_ids: string[],      // all plan IDs already returned to caller
  created_at: string               // ISO timestamp for TTL checks
}
```

**Cursor TTL:** 10 minutes. Expired cursors return D010 error (caller restarts traversal).

**Cursor validation:** `workspace_id` in cursor must match request `workspace_id`; mismatch → D010.

---

## Response Envelope Shape

```ts
// Applies to all 4 dependency actions
{
  success: true,
  data: {
    action: 'get_plan_dependencies' | 'get_dependencies' | 'reverse_dependent_lookup' | 'bounded_traversal',
    data: {
      plan_id: string,                  // root plan for this traversal
      nodes: DependencyNode[],          // ordered: BFS level asc, then id lex within level
      edges: DependencyEdge[],          // ordered: from_plan lex, then to_plan lex
      has_cycles: boolean,
      cycle_path?: string[],            // only if has_cycles == true
      depth_reached: number,
      was_depth_capped: boolean,
      next_cursor?: string,             // only on bounded_traversal when more pages exist
      total_node_count: number,
      diagnostics: DiagnosticEntry[]
    }
  }
}
```

---

## Preflight Action Params

```ts
// Contribution to server/src/tools/preflight/action-params-cartography.ts
get_plan_dependencies:    { required: ['workspace_id', 'plan_id'],       optional: ['depth_limit'] },
get_dependencies:         { required: ['workspace_id', 'plan_id'],       optional: ['depth_limit'] },
reverse_dependent_lookup: { required: ['workspace_id', 'plan_id'],       optional: [] },
bounded_traversal:        { required: ['workspace_id', 'root_plan_id', 'direction'],
                            optional: ['depth_limit', 'include_archived', 'cursor', 'page_size'] },
```

---

## Dispatch Routing

```ts
// Pseudocode — part of memory_cartographer.ts switch
case 'get_plan_dependencies':
  validateNull(params.plan_id, 'plan_id');
  return await depDb.getPlanDependencies(params.workspace_id, params.plan_id, params.depth_limit ?? 1);

case 'get_dependencies':
  validateNull(params.plan_id, 'plan_id');
  return await depDb.getDependencies(params.workspace_id, params.plan_id, params.depth_limit ?? 5);

case 'reverse_dependent_lookup':
  validateNull(params.plan_id, 'plan_id');
  return await depDb.reverseLookup(params.workspace_id, params.plan_id);

case 'bounded_traversal':
  validateNull(params.root_plan_id, 'root_plan_id');
  validateNull(params.direction, 'direction');
  return await depDb.boundedTraversal({
    workspace_id: params.workspace_id,
    root_plan_id: params.root_plan_id,
    direction: params.direction,
    depth_limit: clamp(params.depth_limit ?? 5, 1, 20),
    include_archived: params.include_archived ?? false,
    cursor: params.cursor,
    page_size: clamp(params.page_size ?? 50, 1, 200),
  });
```

---

## Error Conditions

| Action | Condition | Code | Server Behavior |
|--------|-----------|------|-----------------|
| All | Plan not found | D010 | `{ success: false, error: 'D010: plan_id not found' }` |
| All | Cycle detected | D005 | Return partial results + `has_cycles=true, cycle_path=[...]` + D005 diagnostic; do NOT error |
| All | Depth capped | D006 | Return partial results + `was_depth_capped=true` + D006 diagnostic warning |
| `bounded_traversal` | Invalid cursor | D010 | `{ success: false, error: 'D010: invalid or expired cursor' }` |
| `bounded_traversal` | Workspace mismatch in cursor | D010 | `{ success: false, error: 'D010: cursor workspace mismatch' }` |
| `bounded_traversal` | page_size out of range | — | Silently clamped to [1, 200] |
| All | depth_limit out of range | — | Silently clamped to [1, 20] + D006 warning if clamped |
