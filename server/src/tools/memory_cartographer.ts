/**
 * Consolidated Cartographer Tool — memory_cartographer
 *
 * Exposes 17 actions across 4 domain families:
 *   Phase A (SQLite-backed, implemented):
 *     - dependencies_dependents: get_plan_dependencies, get_dependencies,
 *       reverse_dependent_lookup, bounded_traversal
 *     - database_map_access: db_map_summary, db_node_lookup, db_edge_lookup,
 *       context_items_projection
 *   Phase B (Python-backed summary + remaining NOT_IMPLEMENTED stubs):
 *     - cartography_queries: summary (live), file_context,
 *       flow_entry_points, layer_view, search
 *     - architecture_slices: slice_catalog, slice_detail, slice_projection,
 *       slice_filters
 *
 * SECURITY: context_data / data columns in context_items are ALWAYS masked
 * from all database_map_access outputs.
 */

import { randomUUID } from 'node:crypto';

import type { ToolResponse } from '../types/index.js';
import { preflightValidate } from './preflight/index.js';
import { validateAndResolveWorkspaceId } from './consolidated/workspace-validation.js';
import {
  getDependencies,
  getDependents,
} from '../db/dependency-db.js';
import { getPlan } from '../db/plan-db.js';
import { getWorkspace } from '../db/workspace-db.js';
import { getDb } from '../db/connection.js';
import { queryAll, queryOne } from '../db/query-helpers.js';
import { resolveAccessiblePath } from '../storage/workspace-mounts.js';
import { PythonCoreAdapter } from '../cartography/adapters/pythonCoreAdapter.js';
import { ADAPTER_SCHEMA_VERSION } from '../cartography/contracts/version.js';
import type {
  DependencyNode,
  DependencyEdge,
  DiagnosticEntry,
} from '../cartography/contracts/dependency-types.js';
import type {
  AllowedTableName,
  DbTableSummary,
  DbMapSummary,
  DbMapNode,
  FKHint,
  DbMapEdge,
  DbMapResponse,
  ContextItemsProjectionRow,
  ContextItemsProjection,
} from '../cartography/contracts/db-map-types.js';
import type { DependencyRow } from '../db/types.js';

// =============================================================================
// Action type
// =============================================================================

export type CartographerAction =
  // cartography_queries (Phase B)
  | 'summary'
  | 'file_context'
  | 'flow_entry_points'
  | 'layer_view'
  | 'search'
  // dependencies_dependents (Phase A)
  | 'get_plan_dependencies'
  | 'get_dependencies'
  | 'reverse_dependent_lookup'
  | 'bounded_traversal'
  // architecture_slices (Phase B)
  | 'slice_catalog'
  | 'slice_detail'
  | 'slice_projection'
  | 'slice_filters'
  // database_map_access (Phase A)
  | 'db_map_summary'
  | 'db_node_lookup'
  | 'db_edge_lookup'
  | 'context_items_projection';

// =============================================================================
// Params interface
// =============================================================================

export interface MemoryCartographerParams {
  action: CartographerAction;
  workspace_id: string;
  /** Agent type performing the action — used for authorization check */
  agent_type?: string;
  /** Session tracking */
  _session_id?: string;

  // --- dependencies_dependents ---
  plan_id?: string;
  root_plan_id?: string;
  depth_limit?: number;
  direction?: 'dependencies' | 'dependents' | 'both';
  include_archived?: boolean;
  cursor?: string;
  page_size?: number;

  // --- database_map_access ---
  table_name?: AllowedTableName;
  primary_key?: string;
  edge_direction?: 'outbound' | 'inbound' | 'both';
  parent_type?: 'plan' | 'workspace';
  parent_id?: string;
  type_filter?: string[];
  limit?: number;
  order_by?: 'created_at' | 'type' | 'parent_id';

  // --- cartography_queries (Phase B params) ---
  file_id?: string;
  include_symbols?: boolean;
  include_references?: boolean;
  force_refresh?: boolean;
  layer_filter?: string[];
  language_filter?: string[];
  layers?: string[];
  include_cross_layer_edges?: boolean;
  query?: string;
  search_scope?: 'symbols' | 'files' | 'modules' | 'all';

  // --- architecture_slices (Phase B params) ---
  slice_id?: string;
  materialize?: boolean;
  projection_type?: 'file_level' | 'module_level' | 'symbol_level';
  filters?: unknown[];
}

// =============================================================================
// Authorization
// =============================================================================

const AUTHORIZED_AGENTS = new Set([
  'Researcher',
  'Architect',
  'Coordinator',
  'Analyst',
  'Executor',
]);

// =============================================================================
// Table name mapping: AllowedTableName → actual SQLite table name
// =============================================================================

const TABLE_NAME_MAP: Record<AllowedTableName, string> = {
  context_items:  'context_items',
  workspaces:     'workspaces',
  plans:          'plans',
  agent_sessions: 'sessions',
  steps:          'steps',
  handoffs:       'lineage',
  build_scripts:  'build_scripts',
  research_notes: 'research_documents',
};

// =============================================================================
// FK relation map: AllowedTableName → outbound FK hints
// =============================================================================

const FK_OUTBOUND_MAP: Record<AllowedTableName, FKHint[]> = {
  workspaces:     [],
  context_items:  [], // polymorphic parent — omit FK hints for safety
  plans:          [{ column: 'workspace_id', references_table: 'workspaces', references_pk: 'id' }],
  agent_sessions: [{ column: 'plan_id', references_table: 'plans', references_pk: 'id' }],
  steps:          [{ column: 'plan_id', references_table: 'plans', references_pk: 'id' }],
  handoffs:       [{ column: 'plan_id', references_table: 'plans', references_pk: 'id' }],
  build_scripts:  [
    { column: 'workspace_id', references_table: 'workspaces', references_pk: 'id' },
    { column: 'plan_id',     references_table: 'plans',      references_pk: 'id' },
  ],
  research_notes: [{ column: 'workspace_id', references_table: 'workspaces', references_pk: 'id' }],
};

/** Inbound FK map: AllowedTableName → tables that have an FK pointing to it */
const FK_INBOUND_MAP: Partial<Record<AllowedTableName, Array<{ from_table: AllowedTableName; fk_column: string }>>> = {
  workspaces: [
    { from_table: 'plans',          fk_column: 'workspace_id' },
    { from_table: 'build_scripts',  fk_column: 'workspace_id' },
    { from_table: 'research_notes', fk_column: 'workspace_id' },
  ],
  plans: [
    { from_table: 'agent_sessions', fk_column: 'plan_id' },
    { from_table: 'steps',          fk_column: 'plan_id' },
    { from_table: 'handoffs',       fk_column: 'plan_id' },
    { from_table: 'build_scripts',  fk_column: 'plan_id' },
  ],
};

function totalRelationCount(): number {
  return Object.values(FK_OUTBOUND_MAP).reduce((sum, hints) => sum + hints.length, 0);
}

// =============================================================================
// Helper: columns to mask for context_items
// =============================================================================

const CONTEXT_ITEMS_MASKED_COLUMNS = new Set(['data', 'context_data']);

function maskContextItemsRow(row: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    masked[k] = CONTEXT_ITEMS_MASKED_COLUMNS.has(k) ? '[REDACTED]' : v;
  }
  return masked;
}

// =============================================================================
// Helper: build DependencyNode from planRow + depth
// =============================================================================

function buildDepNode(planId: string, depth: number): DependencyNode | null {
  const plan = getPlan(planId);
  if (!plan) return null;

  const phaseRow = queryOne<{ name: string }>(
    'SELECT name FROM phases WHERE plan_id = ? ORDER BY order_index ASC LIMIT 1',
    [planId],
  );

  return {
    id:              plan.id,
    title:           plan.title,
    status:          plan.status as DependencyNode['status'],
    phase:           phaseRow?.name ?? '',
    priority:        plan.priority as DependencyNode['priority'],
    workspace_id:    plan.workspace_id,
    depth_from_root: depth,
  };
}

// =============================================================================
// Helper: DependencyRow → DependencyEdge
// =============================================================================

function depRowToEdge(row: DependencyRow): DependencyEdge {
  const edgeTypeMap: Record<string, DependencyEdge['edge_type']> = {
    blocks:  'blocks',
    informs: 'related',
  };
  return {
    from_plan:    row.source_id,
    to_plan:      row.target_id,
    edge_type:    edgeTypeMap[row.dep_type] ?? 'depends_on',
    declared_by:  'system',
  };
}

// =============================================================================
// Helper: BFS dependency traversal
// =============================================================================

interface BfsResult {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  has_cycles: boolean;
  cycle_path: string[];
  depth_reached: number;
  was_depth_capped: boolean;
  total_node_count: number;
  diagnostics: DiagnosticEntry[];
}

function bfsTraversal(
  rootPlanId: string,
  direction: 'dependencies' | 'dependents' | 'both',
  depthLimit: number,
  includeArchived: boolean,
  pageSize: number,
  startOffset: number,
): BfsResult & { next_offset?: number } {
  const visited   = new Set<string>([rootPlanId]);
  const queue: Array<{ id: string; depth: number }> = [];
  const allNodes: DependencyNode[]  = [];
  const allEdges: DependencyEdge[] = [];
  const diagnostics: DiagnosticEntry[] = [];
  let hasCycles       = false;
  let cyclePath:string[] = [];
  let depthReached    = 0;
  let wasDepthCapped  = false;

  // Seed queue with direct neighbors of root
  const seedEdges = getNeighborEdges(rootPlanId, direction);
  for (const row of seedEdges) {
    const neighborId = direction === 'dependents'
      ? row.source_id   // inbound: from_plan is the dependent
      : row.target_id;  // outbound: to_plan is the dependency
    if (neighborId === rootPlanId) {
      hasCycles = true;
      cyclePath = [rootPlanId, neighborId];
      diagnostics.push({ code: 'D005', message: 'Cycle detected at root level', severity: 'warning' });
      continue;
    }
    if (!visited.has(neighborId)) {
      visited.add(neighborId);
      queue.push({ id: neighborId, depth: 1 });
      allEdges.push(depRowToEdge(row));
    }
  }

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.depth > depthReached) depthReached = item.depth;

    const plan = getPlan(item.id);
    if (!plan) continue;
    if (!includeArchived && plan.status === 'archived') continue;

    const node = buildDepNode(item.id, item.depth);
    if (node) allNodes.push(node);

    if (item.depth >= depthLimit) {
      wasDepthCapped = true;
      diagnostics.push({ code: 'D006', message: `Depth limit ${depthLimit} reached`, severity: 'info' });
      continue;
    }

    const nextEdges = getNeighborEdges(item.id, direction);
    for (const row of nextEdges) {
      const neighborId = direction === 'dependents' ? row.source_id : row.target_id;
      if (neighborId === rootPlanId || visited.has(neighborId)) {
        if (neighborId === rootPlanId && !hasCycles) {
          hasCycles = true;
          cyclePath = [rootPlanId, item.id, neighborId];
          diagnostics.push({ code: 'D005', message: 'Cycle detected during traversal', severity: 'warning' });
        }
        // Still record edge for cycle path even if node visited
        const edgeExists = allEdges.some(
          e => e.from_plan === row.source_id && e.to_plan === row.target_id,
        );
        if (!edgeExists) allEdges.push(depRowToEdge(row));
        continue;
      }
      visited.add(neighborId);
      queue.push({ id: neighborId, depth: item.depth + 1 });
      allEdges.push(depRowToEdge(row));
    }
  }

  // Handle 'both' direction: also from dependents direction if not done
  // (already handled via getNeighborEdges('both') which returns combined results)

  const totalCount  = allNodes.length;
  const pageSlice   = allNodes.slice(startOffset, startOffset + pageSize);
  const hasMore     = startOffset + pageSize < totalCount;

  return {
    nodes:            pageSlice,
    edges:            allEdges,
    has_cycles:       hasCycles,
    cycle_path:       cyclePath,
    depth_reached:    depthReached,
    was_depth_capped: wasDepthCapped,
    total_node_count: totalCount,
    diagnostics,
    next_offset:      hasMore ? startOffset + pageSize : undefined,
  };
}

function getNeighborEdges(planId: string, direction: 'dependencies' | 'dependents' | 'both'): DependencyRow[] {
  if (direction === 'dependencies') {
    return getDependencies('plan', planId).filter(r => r.target_type === 'plan');
  }
  if (direction === 'dependents') {
    return getDependents('plan', planId).filter(r => r.source_type === 'plan');
  }
  // both
  const deps = getDependencies('plan', planId).filter(r => r.target_type === 'plan');
  const dpts = getDependents('plan', planId).filter(r => r.source_type === 'plan');
  return [...deps, ...dpts];
}

// =============================================================================
// Helper: DB map helpers
// =============================================================================

function getTableRowCount(actualTableName: string): number {
  const row = queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM "${actualTableName}"`,
  );
  return row?.c ?? 0;
}

function getTableColumnCount(actualTableName: string): number {
  const cols = getDb().pragma(`table_info(${actualTableName})`) as unknown[];
  return cols.length;
}

function decodeOffset(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as { offset: number };
    return Math.max(0, decoded.offset ?? 0);
  } catch {
    return 0;
  }
}

function encodeOffset(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString('base64');
}

// =============================================================================
// Phase B stub response helper
// =============================================================================

function phaseBStub(action: CartographerAction, domain: 'cartography_queries' | 'architecture_slices') {
  return {
    action,
    data: {
      error:           'NOT_IMPLEMENTED',
      diagnostic_code: 'FEATURE_NOT_AVAILABLE',
      message:         `${domain} requires Python runtime (Phase B); not available in current deployment.`,
      domain,
    },
  };
}

// =============================================================================
// Main handler
// =============================================================================

export async function handleMemoryCartographer(
  params: MemoryCartographerParams,
): Promise<ToolResponse<unknown>> {
  const { action, workspace_id } = params;

  // ── Layer 1: null guards ──────────────────────────────────────────────────
  if (!action) {
    return {
      success: false,
      error:   'action is required for memory_cartographer',
    };
  }
  if (!workspace_id) {
    return {
      success: false,
      error:   'workspace_id is required for memory_cartographer',
    };
  }

  // ── Authorization check ───────────────────────────────────────────────────
  const agentType = params.agent_type;
  if (agentType && !AUTHORIZED_AGENTS.has(agentType)) {
    console.warn(JSON.stringify({
      event:      'cartographer_security_block',
      action,
      agent_type: agentType,
      workspace_id,
      timestamp:  new Date().toISOString(),
    }));
    return {
      success: false,
      data: {
        action,
        data: {
          error:           'UNAUTHORIZED',
          diagnostic_code: 'PERMISSION_DENIED',
          message:         `Agent type '${agentType}' is not authorized for memory_cartographer. Authorized types: ${[...AUTHORIZED_AGENTS].join(', ')}.`,
        },
      },
    };
  }

  // ── Layer 2: workspace validation + preflight ─────────────────────────────
  const validated = await validateAndResolveWorkspaceId(workspace_id);
  if (!validated.success) return validated.error_response as ToolResponse<unknown>;
  const resolvedWorkspaceId = validated.workspace_id;

  const preflight = preflightValidate('memory_cartographer', action, params as unknown as Record<string, unknown>);
  if (!preflight.valid) {
    return {
      success:           false,
      error:             preflight.message,
      preflight_failure: preflight,
    } as ToolResponse<unknown>;
  }

  // ── Telemetry: action dispatch ────────────────────────────────────────────
  console.warn(JSON.stringify({
    event:        'cartographer_action',
    action,
    agent_type:   agentType ?? 'unknown',
    workspace_id: resolvedWorkspaceId,
    timestamp:    new Date().toISOString(),
  }));

  // ── Layer 3: action switch ────────────────────────────────────────────────
  switch (action) {

    // ── Phase B live action: cartography_queries/summary ────────────────────
    case 'summary': {
      const workspace = getWorkspace(resolvedWorkspaceId);
      if (!workspace?.path) {
        return {
          success: false,
          error: `Unable to resolve workspace path for workspace '${resolvedWorkspaceId}'`,
          data: {
            action: 'summary',
            data: {
              error: 'WORKSPACE_PATH_UNAVAILABLE',
              diagnostic_code: 'WORKSPACE_PATH_NOT_FOUND',
              message: `Workspace path could not be resolved for '${resolvedWorkspaceId}'.`,
            },
          },
        };
      }

      // Prefer a process-accessible path (container mount on Linux, host path on Windows).
      const resolvedWorkspacePath = await resolveAccessiblePath(workspace.path);
      const pythonWorkspacePath = resolvedWorkspacePath ?? workspace.path;

      const scopeArgs: Record<string, unknown> = {};
      if (typeof params.file_id === 'string' && params.file_id.length > 0) {
        scopeArgs.file_id = params.file_id;
      }
      if (typeof params.include_symbols === 'boolean') {
        scopeArgs.include_symbols = params.include_symbols;
      }
      if (typeof params.include_references === 'boolean') {
        scopeArgs.include_references = params.include_references;
      }
      if (typeof params.force_refresh === 'boolean') {
        scopeArgs.force_refresh = params.force_refresh;
      }
      if (Array.isArray(params.layer_filter) && params.layer_filter.length > 0) {
        scopeArgs.layer_filter = params.layer_filter;
      }
      if (Array.isArray(params.layers) && params.layers.length > 0) {
        scopeArgs.layers = params.layers;
      }

      const languageFilters = Array.isArray(params.language_filter)
        ? params.language_filter.filter(
            (language): language is string => typeof language === 'string' && language.length > 0,
          )
        : [];

      const adapter = new PythonCoreAdapter();
      const requestId = `cartograph_summary_${randomUUID()}`;

      try {
        const response = await adapter.invoke({
          schema_version: ADAPTER_SCHEMA_VERSION,
          request_id: requestId,
          action: 'cartograph',
          args: {
            query: 'summary',
            workspace_path: pythonWorkspacePath,
            scope: scopeArgs,
            ...(languageFilters.length > 0 ? { languages: languageFilters } : {}),
          },
          timeout_ms: 15_000,
        });

        if (response.status === 'error') {
          return {
            success: false,
            error: 'Python core returned an error for summary action',
            data: {
              action: 'summary',
              data: {
                error: 'PYTHON_CORE_ERROR',
                diagnostic_code: 'PYTHON_RUNTIME_ERROR',
                message: response.diagnostics.errors.join('; ') || 'Python core returned status=error.',
                request_id: response.request_id,
                diagnostics: response.diagnostics,
                elapsed_ms: response.elapsed_ms,
              },
            },
          };
        }

        return {
          success: true,
          data: {
            action: 'summary',
            data: {
              source: 'python_core',
              request_id: response.request_id,
              schema_version: response.schema_version,
              status: response.status,
              elapsed_ms: response.elapsed_ms,
              diagnostics: response.diagnostics,
              result: response.result,
            },
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(JSON.stringify({
          event: 'cartographer_fallback',
          action: 'summary',
          reason: 'python_core_error',
          error: message,
        }));

        return {
          success: false,
          error: `summary failed: ${message}`,
          data: {
            action: 'summary',
            data: {
              error: 'PYTHON_CORE_ERROR',
              diagnostic_code: 'PYTHON_RUNTIME_UNAVAILABLE',
              message,
            },
          },
        };
      }
    }

    // ── Phase B stubs: cartography_queries ──────────────────────────────────
    case 'file_context':
    case 'flow_entry_points':
    case 'layer_view':
    case 'search': {
      console.warn(JSON.stringify({
        event:  'cartographer_phase_b_stub',
        action,
        domain: 'cartography_queries',
      }));
      return { success: true, data: phaseBStub(action, 'cartography_queries') };
    }

    // ── Phase B stubs: architecture_slices ──────────────────────────────────
    case 'slice_catalog':
    case 'slice_detail':
    case 'slice_projection':
    case 'slice_filters': {
      console.warn(JSON.stringify({
        event:  'cartographer_phase_b_stub',
        action,
        domain: 'architecture_slices',
      }));
      return { success: true, data: phaseBStub(action, 'architecture_slices') };
    }

    // ── Phase A: dependencies_dependents ────────────────────────────────────

    case 'get_plan_dependencies': {
      const planId = params.plan_id;
      if (!planId) {
        return { success: false, error: 'plan_id is required for action: get_plan_dependencies' };
      }
      const depthLimit = Math.min(params.depth_limit ?? 1, 20);
      const rows       = getDependencies('plan', planId).filter(r => r.target_type === 'plan');
      const nodes: DependencyNode[]  = [];
      const edges: DependencyEdge[] = rows.map(depRowToEdge);
      const diagnostics: DiagnosticEntry[] = [];
      let depthReached = 0;

      for (const row of rows) {
        const node = buildDepNode(row.target_id, 1);
        if (node) nodes.push(node);
        if (1 > depthReached) depthReached = 1;
      }

      // Recursive BFS for deeper levels
      if (depthLimit > 1 && rows.length > 0) {
        const result = bfsTraversal(planId, 'dependencies', depthLimit, false, 200, 0);
        nodes.splice(0, nodes.length, ...result.nodes);
        edges.splice(0, edges.length, ...result.edges);
        depthReached = result.depth_reached;
        diagnostics.push(...result.diagnostics);
      }

      return {
        success: true,
        data: {
          action:     'get_plan_dependencies',
          data: {
            plan_id:        planId,
            nodes,
            edges,
            depth_reached:  depthReached,
            was_depth_capped: depthLimit > 1 && nodes.length === 200,
            total_node_count: nodes.length,
            has_cycles:     false,
            diagnostics,
          },
        },
      };
    }

    case 'get_dependencies': {
      const planId = params.plan_id;
      if (!planId) {
        return { success: false, error: 'plan_id is required for action: get_dependencies' };
      }
      const depthLimit = Math.min(params.depth_limit ?? 5, 20);
      const result = bfsTraversal(planId, 'dependents', depthLimit, false, 200, 0);

      return {
        success: true,
        data: {
          action: 'get_dependencies',
          data: {
            plan_id:          planId,
            nodes:            result.nodes,
            edges:            result.edges,
            depth_reached:    result.depth_reached,
            was_depth_capped: result.was_depth_capped,
            total_node_count: result.total_node_count,
            has_cycles:       result.has_cycles,
            cycle_path:       result.cycle_path.length > 0 ? result.cycle_path : undefined,
            diagnostics:      result.diagnostics,
          },
        },
      };
    }

    case 'reverse_dependent_lookup': {
      const planId = params.plan_id;
      if (!planId) {
        return { success: false, error: 'plan_id is required for action: reverse_dependent_lookup' };
      }
      const rows  = getDependents('plan', planId).filter(r => r.source_type === 'plan');
      const dependents: DependencyNode[] = [];
      const edges: DependencyEdge[]      = rows.map(depRowToEdge);
      const diagnostics: DiagnosticEntry[] = [];

      for (const row of rows) {
        const node = buildDepNode(row.source_id, 1);
        if (node) {
          dependents.push({ ...node, title: node.title });
        }
      }
      dependents.sort((a, b) => a.title.localeCompare(b.title));

      return {
        success: true,
        data: {
          action: 'reverse_dependent_lookup',
          data: {
            plan_id:    planId,
            dependents,
            edges,
            diagnostics,
          },
        },
      };
    }

    case 'bounded_traversal': {
      const rootPlanId = params.root_plan_id;
      if (!rootPlanId) {
        return { success: false, error: 'root_plan_id is required for action: bounded_traversal' };
      }
      const depthLimit     = Math.min(params.depth_limit ?? 5, 20);
      const direction      = params.direction ?? 'both';
      const includeArchived = params.include_archived ?? false;
      const pageSize       = Math.min(params.page_size ?? 50, 200);
      const startOffset    = decodeOffset(params.cursor);

      const result = bfsTraversal(rootPlanId, direction, depthLimit, includeArchived, pageSize, startOffset);

      let nextCursor: string | undefined;
      if (result.next_offset !== undefined) {
        nextCursor = encodeOffset(result.next_offset);
      }

      return {
        success: true,
        data: {
          action: 'bounded_traversal',
          data: {
            root_plan_id:     rootPlanId,
            nodes:            result.nodes,
            edges:            result.edges,
            has_cycles:       result.has_cycles,
            cycle_path:       result.cycle_path.length > 0 ? result.cycle_path : undefined,
            depth_reached:    result.depth_reached,
            was_depth_capped: result.was_depth_capped,
            total_node_count: result.total_node_count,
            next_cursor:      nextCursor,
            diagnostics:      result.diagnostics,
          },
        },
      };
    }

    // ── Phase A: database_map_access ─────────────────────────────────────────

    case 'db_map_summary': {
      try {
        const schemaVersion = String(
          (getDb().pragma('user_version', { simple: true }) as number) ?? 0,
        );

        const tables: DbTableSummary[] = [];
        for (const [logicalName, actualName] of Object.entries(TABLE_NAME_MAP) as [AllowedTableName, string][]) {
          let rowCount    = 0;
          let columnCount = 0;
          try {
            rowCount    = getTableRowCount(actualName);
            columnCount = getTableColumnCount(actualName);
          } catch {
            // Table may not exist in older schemas — include with zero counts
          }
          tables.push({
            table_name:      logicalName,
            row_count:       rowCount,
            column_count:    columnCount,
            has_fk_relations: (FK_OUTBOUND_MAP[logicalName]?.length ?? 0) > 0,
          });
        }

        const summary: DbMapSummary = {
          schema_version: schemaVersion,
          tables,
          relation_count: totalRelationCount(),
          diagnostics:    [],
        };

        return {
          success: true,
          data: { action: 'db_map_summary', data: summary },
        };
      } catch (err) {
        console.warn(JSON.stringify({
          event:  'cartographer_fallback',
          action: 'db_map_summary',
          reason: 'error',
          error:  String(err),
        }));
        return {
          success: false,
          error:   `db_map_summary failed: ${String(err)}`,
        };
      }
    }

    case 'db_node_lookup': {
      const tableName = params.table_name;
      const primaryKey = params.primary_key;
      if (!tableName) {
        return { success: false, error: 'table_name is required for action: db_node_lookup' };
      }
      if (!primaryKey) {
        return { success: false, error: 'primary_key is required for action: db_node_lookup' };
      }
      if (!(tableName in TABLE_NAME_MAP)) {
        return {
          success: false,
          error:   `table_name '${tableName}' is not in the allowed list. Allowed: ${Object.keys(TABLE_NAME_MAP).join(', ')}`,
        };
      }

      try {
        const actualName = TABLE_NAME_MAP[tableName];
        const row = queryOne<Record<string, unknown>>(
          `SELECT * FROM "${actualName}" WHERE id = ?`,
          [primaryKey],
        );

        if (!row) {
          console.warn(JSON.stringify({
            event:  'cartographer_fallback',
            action: 'db_node_lookup',
            reason: 'null_result',
            table:  tableName,
          }));
          return {
            success: true,
            data: {
              action: 'db_node_lookup',
              data: {
                error:           'NOT_FOUND',
                diagnostic_code: 'EMPTY_RESULT',
                message:         `No row found in '${tableName}' with id = '${primaryKey}'`,
                diagnostics:     [{ code: 'D010', message: 'Row not found', severity: 'error' }],
              },
            },
          };
        }

        // Mask sensitive columns for context_items
        const maskedRow = tableName === 'context_items' ? maskContextItemsRow(row) : row;

        const fkHints: FKHint[] = FK_OUTBOUND_MAP[tableName] ?? [];

        const node: DbMapNode = {
          table_name:  tableName,
          row:         maskedRow,
          fk_hints:    fkHints,
          diagnostics: [],
        };

        return {
          success: true,
          data: { action: 'db_node_lookup', data: node },
        };
      } catch (err) {
        console.warn(JSON.stringify({
          event:  'cartographer_fallback',
          action: 'db_node_lookup',
          reason: 'error',
          error:  String(err),
        }));
        return {
          success: false,
          error:   `db_node_lookup failed: ${String(err)}`,
        };
      }
    }

    case 'db_edge_lookup': {
      const tableName  = params.table_name;
      const primaryKey = params.primary_key;
      const edgeDir    = params.edge_direction ?? 'both';
      if (!tableName) {
        return { success: false, error: 'table_name is required for action: db_edge_lookup' };
      }
      if (!primaryKey) {
        return { success: false, error: 'primary_key is required for action: db_edge_lookup' };
      }
      if (!(tableName in TABLE_NAME_MAP)) {
        return {
          success: false,
          error:   `table_name '${tableName}' is not in the allowed list`,
        };
      }

      try {
        const edges: DbMapEdge[] = [];
        const diagnostics: DiagnosticEntry[] = [];

        // Outbound edges
        if (edgeDir === 'outbound' || edgeDir === 'both') {
          const outboundHints = FK_OUTBOUND_MAP[tableName] ?? [];
          for (const hint of outboundHints) {
            const relatedActual = TABLE_NAME_MAP[hint.references_table];
            const actualName    = TABLE_NAME_MAP[tableName];

            // Get the FK value from the source row
            const sourceRow = queryOne<Record<string, unknown>>(
              `SELECT "${hint.column}" FROM "${actualName}" WHERE id = ?`,
              [primaryKey],
            );
            if (!sourceRow) continue;

            const fkValue = sourceRow[hint.column];
            if (!fkValue) continue;

            const relatedRows = queryAll<Record<string, unknown>>(
              `SELECT * FROM "${relatedActual}" WHERE "${hint.references_pk}" = ? LIMIT 50`,
              [fkValue],
            );
            const maskedRows = hint.references_table === 'context_items'
              ? relatedRows.map(maskContextItemsRow)
              : relatedRows;

            edges.push({
              direction:     'outbound',
              fk_column:     hint.column,
              related_table: hint.references_table,
              related_rows:  maskedRows,
              related_total: maskedRows.length,
            });
          }
        }

        // Inbound edges
        if (edgeDir === 'inbound' || edgeDir === 'both') {
          const inboundDefs = FK_INBOUND_MAP[tableName] ?? [];
          for (const def of inboundDefs) {
            const fromActual = TABLE_NAME_MAP[def.from_table];
            const relatedRows = queryAll<Record<string, unknown>>(
              `SELECT * FROM "${fromActual}" WHERE "${def.fk_column}" = ? LIMIT 50`,
              [primaryKey],
            );
            const totalCount = relatedRows.length;
            const maskedRows = def.from_table === 'context_items'
              ? relatedRows.map(maskContextItemsRow)
              : relatedRows;

            edges.push({
              direction:     'inbound',
              fk_column:     def.fk_column,
              related_table: def.from_table,
              related_rows:  maskedRows,
              related_total: totalCount,
            });
          }
        }

        if (edges.length === 0) {
          console.warn(JSON.stringify({
            event:  'cartographer_fallback',
            action: 'db_edge_lookup',
            reason: 'null_result',
            table:  tableName,
          }));
        }

        const response: DbMapResponse = {
          source:      { table_name: tableName, primary_key: primaryKey },
          edges,
          diagnostics,
        };

        return {
          success: true,
          data: { action: 'db_edge_lookup', data: response },
        };
      } catch (err) {
        console.warn(JSON.stringify({
          event:  'cartographer_fallback',
          action: 'db_edge_lookup',
          reason: 'error',
          error:  String(err),
        }));
        return {
          success: false,
          error:   `db_edge_lookup failed: ${String(err)}`,
        };
      }
    }

    case 'context_items_projection': {
      const parentType = params.parent_type;
      const parentId   = params.parent_id;
      if (!parentType) {
        return { success: false, error: 'parent_type is required for action: context_items_projection' };
      }
      if (!parentId) {
        return { success: false, error: 'parent_id is required for action: context_items_projection' };
      }

      try {
        const maxLimit   = Math.min(params.limit ?? 50, 500);
        const startOffset = decodeOffset(params.cursor);
        const orderBy    = params.order_by ?? 'created_at';
        const typeFilter = params.type_filter;

        // Build query — never select `data` directly; compute safe preview separately
        const orderCol = ['created_at', 'type', 'parent_id'].includes(orderBy)
          ? orderBy
          : 'created_at';

        let sql    = 'SELECT id, parent_type, parent_id, type, created_at, data FROM context_items WHERE parent_type = ? AND parent_id = ?';
        const args: unknown[] = [parentType, parentId];

        if (typeFilter && typeFilter.length > 0) {
          const placeholders = typeFilter.map(() => '?').join(', ');
          sql  += ` AND type IN (${placeholders})`;
          args.push(...typeFilter);
        }
        sql += ` ORDER BY ${orderCol} DESC LIMIT ? OFFSET ?`;
        args.push(maxLimit, startOffset);

        const countSql = typeFilter && typeFilter.length > 0
          ? `SELECT COUNT(*) AS c FROM context_items WHERE parent_type = ? AND parent_id = ? AND type IN (${typeFilter.map(() => '?').join(', ')})`
          : 'SELECT COUNT(*) AS c FROM context_items WHERE parent_type = ? AND parent_id = ?';
        const countArgs = typeFilter && typeFilter.length > 0
          ? [parentType, parentId, ...typeFilter]
          : [parentType, parentId];

        type RawRow = { id: string; parent_type: string; parent_id: string; type: string; created_at: string; data: string | null };
        const rawRows = queryAll<RawRow>(sql, args);
        const total   = (queryOne<{ c: number }>(countSql, countArgs)?.c) ?? 0;

        // Security: explicitly remove data before building response
        const PREVIEW_LIMIT = 500;
        const items: ContextItemsProjectionRow[] = rawRows.map(row => {
          const dataStr      = row.data ?? '';
          const dataSizeBytes = Buffer.byteLength(dataStr, 'utf8');
          const preview      = dataStr.length > PREVIEW_LIMIT ? dataStr.substring(0, PREVIEW_LIMIT) : dataStr;
          const isTruncated  = dataStr.length > PREVIEW_LIMIT;

          // row.data intentionally excluded from the projection row
          return {
            item_id:         row.id,
            type:            row.type,
            parent_type:     row.parent_type as 'plan' | 'workspace',
            parent_id:       row.parent_id,
            created_at:      row.created_at,
            data_size_bytes: dataSizeBytes,
            data_preview:    preview || null,
            is_truncated:    isTruncated,
          };
        });

        const rowsMasked = items.length;
        console.warn(JSON.stringify({
          event:      'cartographer_security_mask',
          action:     'context_items_projection',
          rows_masked: rowsMasked,
        }));

        const hasMore    = startOffset + maxLimit < total;
        const nextCursor = hasMore ? encodeOffset(startOffset + maxLimit) : undefined;

        const projection: ContextItemsProjection = {
          parent_type:  parentType,
          parent_id:    parentId,
          items,
          total_count:  total,
          next_cursor:  nextCursor,
          diagnostics:  [],
        };

        return {
          success: true,
          data: { action: 'context_items_projection', data: projection },
        };
      } catch (err) {
        console.warn(JSON.stringify({
          event:  'cartographer_fallback',
          action: 'context_items_projection',
          reason: 'error',
          error:  String(err),
        }));
        return {
          success: false,
          error:   `context_items_projection failed: ${String(err)}`,
        };
      }
    }

    default: {
      return {
        success: false,
        error:   `Unknown action: '${action}'. Valid actions: summary, file_context, flow_entry_points, layer_view, search, get_plan_dependencies, get_dependencies, reverse_dependent_lookup, bounded_traversal, slice_catalog, slice_detail, slice_projection, slice_filters, db_map_summary, db_node_lookup, db_edge_lookup, context_items_projection`,
        data: {
          action,
          data: {
            error:           'UNKNOWN_ACTION',
            diagnostic_code: 'D011',
            message:         `Action '${action}' is not registered in memory_cartographer`,
          },
        },
      };
    }
  }
}
