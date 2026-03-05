/**
 * dependency-types.ts
 *
 * TypeScript type definitions for the dependency/dependent traversal domain
 * of memory_cartographer consolidated tool actions.
 *
 * These types are PLANNING PHASE stubs. Implementation (server/src/tools/consolidated/memory_cartographer.ts)
 * will import and use these types in the Implementation phase (steps 10+).
 *
 * Spec: docs/mcp-surface/dependency-traversal-contract.md
 * Plan: MCP Surface Integration — plan_mm9b56xe_92f7659d
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Diagnostic entry from the DiagnosticCode taxonomy (normalization.py). */
export interface DiagnosticEntry {
  code: string; // DiagnosticCode enum value, e.g. 'D005'
  message: string;
  severity: 'error' | 'warning' | 'info';
  context?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Graph entities
// ---------------------------------------------------------------------------

/** Status values for a plan node within the dependency graph. */
export type PlanStatus = 'pending' | 'active' | 'done' | 'blocked' | 'archived';

/** Priority levels for a plan node. */
export type PlanPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * A plan node in the dependency/dependent graph.
 * Carries display-level metadata sufficient for graph rendering and status checks.
 */
export interface DependencyNode {
  /** Plan ID in `plan_...` format. */
  id: string;
  /** Human-readable title of the plan. */
  title: string;
  /** Current plan execution status. */
  status: PlanStatus;
  /** Name of the current phase within the plan. */
  phase: string;
  /** Plan priority level. */
  priority: PlanPriority;
  /** The workspace this plan belongs to. */
  workspace_id: string;
  /**
   * BFS/DFS depth from the traversal root.
   * 0 = the root plan itself.
   * 1 = direct dependency or dependent.
   */
  depth_from_root: number;
}

/** Semantic types for a dependency edge. */
export type DependencyEdgeType = 'depends_on' | 'blocks' | 'related';

/**
 * A directed edge in the plan dependency graph.
 * Direction: from_plan → to_plan means "from_plan depends on to_plan".
 */
export interface DependencyEdge {
  /**
   * The plan that declares the dependency (the dependant).
   * This plan cannot be considered complete until `to_plan` is done.
   */
  from_plan: string;
  /**
   * The plan being depended upon (the dependency).
   */
  to_plan: string;
  /** Semantic relationship type. */
  edge_type: DependencyEdgeType;
  /** Who created this dependency relationship. */
  declared_by?: 'user' | 'agent' | 'system';
}

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

/** Traversal direction for bounded_traversal action. */
export type TraversalDirection = 'dependencies' | 'dependents' | 'both';

/**
 * Input for the get_plan_dependencies action.
 * Returns plans this plan depends on (forward direction).
 */
export interface GetPlanDependenciesRequest {
  workspace_id: string;
  plan_id: string;
  /** Maximum traversal depth. Default: 1 (direct dependencies only). Max: 20. */
  depth_limit?: number;
}

/**
 * Input for the get_dependencies action.
 * Returns plans that transitively depend on this plan (reverse direction).
 */
export interface GetDependenciesRequest {
  workspace_id: string;
  plan_id: string;
  /** Maximum traversal depth. Default: 5. Max: 20. */
  depth_limit?: number;
}

/**
 * Input for the reverse_dependent_lookup action.
 * Returns only direct dependents (depth = 1, not configurable).
 */
export interface ReverseDependentLookupRequest {
  workspace_id: string;
  plan_id: string;
}

/**
 * Input for the bounded_traversal action.
 * Generic traversal with configurable direction, depth, and pagination.
 */
export interface DependencyTraversalRequest {
  workspace_id: string;
  /** Starting plan for traversal. */
  root_plan_id: string;
  /** Traversal direction. */
  direction: TraversalDirection;
  /** Maximum depth. Default: 5. Max: 20. */
  depth_limit?: number;
  /** Include archived plans in traversal. Default: false. */
  include_archived?: boolean;
  /** Opaque pagination cursor returned by a previous call. */
  cursor?: string;
  /** Max nodes per page. Default: 50. Max: 200. */
  page_size?: number;
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

/**
 * Unified response shape for all four dependency traversal actions.
 *
 * - get_plan_dependencies: `nodes` = dependencies, `direction` in edges is always 'dependencies'
 * - get_dependencies: `nodes` = dependents, `direction` in edges is always 'dependents'
 * - reverse_dependent_lookup: `nodes` = direct dependents only, `depth_reached` = 1
 * - bounded_traversal: all of the above, with pagination support
 */
export interface DependencyTraversalResponse {
  /** The plan ID from which traversal was rooted. */
  plan_id: string;
  /**
   * All plan nodes discovered during traversal, deduplicated.
   * Ordered by BFS level ascending, then `id` lexicographic within level.
   * The root plan itself is excluded from this array.
   */
  nodes: DependencyNode[];
  /**
   * All edges traversed.
   * Cycle back-edges are excluded; see `has_cycles` and `cycle_path` for cycle info.
   * Ordered by `from_plan` lexicographic, then `to_plan` lexicographic.
   */
  edges: DependencyEdge[];
  /** Whether a cycle was detected during traversal. */
  has_cycles: boolean;
  /**
   * Plan IDs forming the first detected cycle, if any.
   * Ordered from the plan that starts the cycle to the node that closes it.
   * Only present when `has_cycles` is true.
   */
  cycle_path?: string[];
  /** Maximum depth level actually reached during traversal. */
  depth_reached: number;
  /**
   * True if traversal was cut short because `depth_limit` was reached
   * before the full graph could be explored.
   */
  was_depth_capped: boolean;
  /**
   * Opaque cursor for fetching the next page of results.
   * Only present on `bounded_traversal` responses where results were truncated.
   */
  next_cursor?: string;
  /**
   * Total number of graph nodes found (may exceed `nodes.length` when paginated).
   */
  total_node_count: number;
  /** Diagnostic entries from traversal (D005 cycles, D006 depth cap, etc.). */
  diagnostics: DiagnosticEntry[];
}
