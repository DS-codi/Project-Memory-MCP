/**
 * Consolidated Cartographer Tool — memory_cartographer
 *
 * Exposes 17 actions across 4 domain families:
 *   Phase A (SQLite-backed, implemented):
 *     - dependencies_dependents: get_plan_dependencies, get_dependencies,
 *       reverse_dependent_lookup, bounded_traversal
 *     - database_map_access: db_map_summary, db_node_lookup, db_edge_lookup,
 *       context_items_projection
 *   Python-backed cartography queries (live):
 *     - cartography_queries: summary, file_context,
 *       flow_entry_points, layer_view, search
 *     - architecture_slices: slice_detail, slice_projection, slice_filters
 *   SQLite-backed slice catalog (implemented):
 *     - architecture_slices: slice_catalog
 *
 * SECURITY: context_data / data columns in context_items are ALWAYS masked
 * from all database_map_access outputs.
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';

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
import { PythonCoreAdapter, type PythonCoreResponse } from '../cartography/adapters/pythonCoreAdapter.js';
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
  // cartography_queries (Python-backed live)
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
  // architecture_slices (slice_catalog SQLite-backed; detail/projection/filters Python-backed live)
  | 'slice_catalog'
  | 'slice_detail'
  | 'slice_projection'
  | 'slice_filters'
  // database_map_access (Phase A)
  | 'db_map_summary'
  | 'db_node_lookup'
  | 'db_edge_lookup'
  | 'context_items_projection';

type NonSummaryPythonAction =
  | 'file_context'
  | 'flow_entry_points'
  | 'layer_view'
  | 'search'
  | 'slice_detail'
  | 'slice_projection'
  | 'slice_filters';

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
  /** Optional caller surface metadata (used for supervisor-specific side effects) */
  caller_surface?: string;
  /** When true, emit a markdown report into the target workspace */
  write_documentation?: boolean;
  /** When true, stream Python subprocess stderr to process.stderr in real-time (visible in supervisor/interactive terminal) */
  debug_output?: boolean;

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
  'Reviewer',
  'Cognition',
  'Runner',
  'Tester',
  'Revisionist',
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

const SUMMARY_TIMEOUT_ENV_VAR = 'PM_CARTOGRAPHER_SUMMARY_TIMEOUT_MS';
const DEFAULT_SUMMARY_TIMEOUT_MS = 60_000;
const MIN_SUMMARY_TIMEOUT_MS = 1_000;
const MAX_SUMMARY_TIMEOUT_MS = 300_000;
const NON_SUMMARY_TIMEOUT_ENV_VAR = 'PM_CARTOGRAPHER_NON_SUMMARY_TIMEOUT_MS';
const DEFAULT_NON_SUMMARY_TIMEOUT_MS = 15_000;
const DEFAULT_HEAVY_QUERY_TIMEOUT_MS = 60_000;
const MIN_NON_SUMMARY_TIMEOUT_MS = 1_000;
const MAX_NON_SUMMARY_TIMEOUT_MS = 300_000;
const FILE_CONTEXT_TIMEOUT_ENV_VAR = 'PM_CARTOGRAPHER_FILE_CONTEXT_TIMEOUT_MS';
const FLOW_ENTRY_POINTS_TIMEOUT_ENV_VAR = 'PM_CARTOGRAPHER_FLOW_ENTRY_POINTS_TIMEOUT_MS';
const LAYER_VIEW_TIMEOUT_ENV_VAR = 'PM_CARTOGRAPHER_LAYER_VIEW_TIMEOUT_MS';
const SEARCH_TIMEOUT_ENV_VAR = 'PM_CARTOGRAPHER_SEARCH_TIMEOUT_MS';
const SUMMARY_REPO_ROOT_DIR = 'Project-Memory-MCP';
const SUMMARY_PARENT_WORKSPACE_DIR = 'Project_Memory_MCP';

const NON_SUMMARY_QUERY_TIMEOUT_ENV_VARS: Partial<Record<NonSummaryPythonAction, string>> = {
  file_context: FILE_CONTEXT_TIMEOUT_ENV_VAR,
  flow_entry_points: FLOW_ENTRY_POINTS_TIMEOUT_ENV_VAR,
  layer_view: LAYER_VIEW_TIMEOUT_ENV_VAR,
  search: SEARCH_TIMEOUT_ENV_VAR,
};

const HEAVY_NON_SUMMARY_QUERY_ACTIONS = new Set<NonSummaryPythonAction>([
  'file_context',
  'flow_entry_points',
  'layer_view',
  'search',
]);

function parseConfiguredTimeoutMs(
  envVarName: string,
  minTimeoutMs: number,
  maxTimeoutMs: number,
): number | undefined {
  const raw = process.env[envVarName];
  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.min(maxTimeoutMs, Math.max(minTimeoutMs, parsed));
}

function resolveConfiguredTimeoutMs(
  envVarName: string,
  defaultTimeoutMs: number,
  minTimeoutMs: number,
  maxTimeoutMs: number,
): number {
  return parseConfiguredTimeoutMs(envVarName, minTimeoutMs, maxTimeoutMs) ?? defaultTimeoutMs;
}

function resolveSummaryTimeoutMs(): number {
  return resolveConfiguredTimeoutMs(
    SUMMARY_TIMEOUT_ENV_VAR,
    DEFAULT_SUMMARY_TIMEOUT_MS,
    MIN_SUMMARY_TIMEOUT_MS,
    MAX_SUMMARY_TIMEOUT_MS,
  );
}

function resolveNonSummaryTimeoutMs(action: NonSummaryPythonAction): number {
  const actionEnvVar = NON_SUMMARY_QUERY_TIMEOUT_ENV_VARS[action];
  if (actionEnvVar) {
    const actionTimeoutMs = parseConfiguredTimeoutMs(
      actionEnvVar,
      MIN_NON_SUMMARY_TIMEOUT_MS,
      MAX_NON_SUMMARY_TIMEOUT_MS,
    );
    if (typeof actionTimeoutMs === 'number') {
      return actionTimeoutMs;
    }
  }

  const nonSummaryTimeoutMs = parseConfiguredTimeoutMs(
    NON_SUMMARY_TIMEOUT_ENV_VAR,
    MIN_NON_SUMMARY_TIMEOUT_MS,
    MAX_NON_SUMMARY_TIMEOUT_MS,
  );
  if (typeof nonSummaryTimeoutMs === 'number') {
    return nonSummaryTimeoutMs;
  }

  if (HEAVY_NON_SUMMARY_QUERY_ACTIONS.has(action)) {
    return DEFAULT_HEAVY_QUERY_TIMEOUT_MS;
  }

  return DEFAULT_NON_SUMMARY_TIMEOUT_MS;
}

function resolveSummaryWorkspacePath(workspacePath: string): string {
  const baseName = path.basename(workspacePath).toLowerCase();
  if (baseName === SUMMARY_REPO_ROOT_DIR.toLowerCase()) {
    return workspacePath;
  }

  if (baseName === SUMMARY_PARENT_WORKSPACE_DIR.toLowerCase()) {
    return path.join(workspacePath, SUMMARY_REPO_ROOT_DIR);
  }

  return workspacePath;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asLaunchContext(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function extractLaunchContextFromError(error: unknown): Record<string, unknown> | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const launchContext = asLaunchContext(error.launchContext);
  if (launchContext) {
    return launchContext;
  }

  return asLaunchContext(error.launch_context);
}

function extractLaunchContextFromMessage(message: string): Record<string, unknown> | undefined {
  const marker = 'launch_context=';
  const markerIndex = message.indexOf(marker);
  if (markerIndex === -1) {
    return undefined;
  }

  const jsonStart = message.indexOf('{', markerIndex + marker.length);
  if (jsonStart === -1) {
    return undefined;
  }

  let depth = 0;
  for (let index = jsonStart; index < message.length; index += 1) {
    const char = message[index];
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char !== '}') {
      continue;
    }

    depth -= 1;
    if (depth !== 0) {
      continue;
    }

    const candidate = message.slice(jsonStart, index + 1);
    try {
      const parsed = JSON.parse(candidate);
      return asLaunchContext(parsed);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function extractLaunchContextFromDiagnostics(errors: string[]): Record<string, unknown> | undefined {
  for (const errorMessage of errors) {
    const launchContext = extractLaunchContextFromMessage(errorMessage);
    if (launchContext) {
      return launchContext;
    }
  }
  return undefined;
}

function extractLaunchContextFromResponse(response: PythonCoreResponse): Record<string, unknown> | undefined {
  if (isRecord(response.result)) {
    const launchContext = asLaunchContext(response.result.launch_context)
      ?? asLaunchContext(response.result.launchContext);
    if (launchContext) {
      return launchContext;
    }
  }

  return extractLaunchContextFromDiagnostics(response.diagnostics.errors);
}

const SUPERVISOR_REPORT_RELATIVE_DIR = path.join('docs', 'cartographer', 'supervisor-reports');
const SUPERVISOR_CACHE_RELATIVE_DIR   = path.join('docs', 'cartographer', 'cache');
const SUPERVISOR_INDEX_RELATIVE_PATH  = path.join('docs', 'cartographer', 'index.md');

interface SupervisorDocumentationRecord {
  status: 'written' | 'failed';
  generated_at: string;
  file_path?: string;
  relative_path?: string;
  bytes?: number;
  error?: string;
}

function shouldWriteSupervisorDocumentation(params: MemoryCartographerParams): boolean {
  return params.caller_surface === 'supervisor' && params.write_documentation === true;
}

function sanitizeParamsForDocumentation(params: MemoryCartographerParams): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...params };
  delete sanitized._session_id;
  return sanitized;
}

function formatSupervisorDocumentation(
  workspaceId: string,
  workspacePath: string,
  action: CartographerAction,
  params: MemoryCartographerParams,
  response: PythonCoreResponse,
): string {
  const generatedAt = new Date().toISOString();
  const diagnostics = response.diagnostics ?? {
    warnings: [] as string[],
    errors: [] as string[],
    markers: [] as string[],
    skipped_paths: [] as string[],
  };

  const summaryStats = isRecord(response.result) && isRecord(response.result.summary)
    ? response.result.summary
    : undefined;

  const topLevelSummary = {
    status: response.status,
    elapsed_ms: response.elapsed_ms,
    warning_count: Array.isArray(diagnostics.warnings) ? diagnostics.warnings.length : 0,
    error_count: Array.isArray(diagnostics.errors) ? diagnostics.errors.length : 0,
    marker_count: Array.isArray(diagnostics.markers) ? diagnostics.markers.length : 0,
    skipped_path_count: Array.isArray(diagnostics.skipped_paths) ? diagnostics.skipped_paths.length : 0,
    summary_stats: action === 'summary' ? (summaryStats ?? null) : undefined,
  };

  return [
    '# Cartographer Supervisor Report',
    '',
    `- Generated at (UTC): ${generatedAt}`,
    `- Workspace ID: ${workspaceId}`,
    `- Workspace Path: ${workspacePath}`,
    `- Action: ${action}`,
    `- Caller Surface: ${params.caller_surface ?? 'unknown'}`,
    '',
    '## Request Parameters',
    '```json',
    JSON.stringify(sanitizeParamsForDocumentation(params), null, 2),
    '```',
    '',
    '## Execution Summary',
    '```json',
    JSON.stringify(topLevelSummary, null, 2),
    '```',
    '',
    '## Diagnostics',
    '```json',
    JSON.stringify(diagnostics, null, 2),
    '```',
    '',
    '## Raw Cartographer Result',
    '```json',
    JSON.stringify(response.result ?? null, null, 2),
    '```',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function formatCacheReadme(): string {
  return [
    '# Cartographer Cache',
    '',
    'Machine-readable JSON files generated by the supervisor cartographer scan.',
    'Each file is **always overwritten** with the latest scan result.',
    '',
    '## Files',
    '',
    '| File | Description |',
    '|------|-------------|',
    '| `summary.json` | Latest aggregate stats (file count, symbols, modules, …) |',
    '| `summary-latest.json` | Full raw Python-core response for the summary action |',
    '| `files.json` | All discovered files with path, language, size_bytes, mtime |',
    '| `references.json` | All cross-file symbol references (from_file, from_line, to_symbol_id, to_file, kind) |',
    '| `module-graph.json` | Module dependency graph (nodes array + edges with from/to/kind) |',
    '| `dependency-flow.json` | Dependency tiers, entry points, and detected cycles |',
    '| `languages/<lang>.json` | Per-language file count breakdown |',
    '| `symbols/<lang>.json` | All symbols for that language (id, file, name, kind, start_line, exported) |',
    '| `symbols/index.json` | Flat name-sorted symbol index across all languages for quick lookup |',
    '',
    'Historical timestamped reports live in `../supervisor-reports/`.',
    'The running index is at `../index.md`.',
    '',
  ].join('\n');
}

function formatIndexHeader(): string {
  return [
    '# Cartographer Scan Index',
    '',
    'Running catalog of all supervisor-triggered cartography scans.',
    '',
    '| Generated At (UTC) | Action | Status | Elapsed | Files | Modules | Symbols | Report |',
    '|-------------------|--------|--------|---------|-------|---------|---------|--------|',
  ].join('\n');
}

async function writeSupervisorCache(
  workspacePath: string,
  workspaceId: string,
  action: CartographerAction,
  response: PythonCoreResponse,
  generatedAt: string,
): Promise<void> {
  const fs = await import('node:fs/promises');
  const cacheDir = path.join(workspacePath, SUPERVISOR_CACHE_RELATIVE_DIR);
  await fs.mkdir(cacheDir, { recursive: true });

  // Always write <action>-latest.json (full raw Python-core result)
  await fs.writeFile(
    path.join(cacheDir, `${action}-latest.json`),
    JSON.stringify(
      { generated_at: generatedAt, workspace_id: workspaceId, elapsed_ms: response.elapsed_ms, action, result: response.result },
      null, 2,
    ),
    'utf-8',
  );

  // Extra structure for the summary action
  if (action === 'summary' && isRecord(response.result)) {
    const summaryData = isRecord(response.result['summary']) ? response.result['summary'] : {};

    // summary.json — flattened, always current
    await fs.writeFile(
      path.join(cacheDir, 'summary.json'),
      JSON.stringify(
        {
          generated_at: generatedAt,
          workspace_id: workspaceId,
          workspace_path: workspacePath,
          elapsed_ms: response.elapsed_ms,
          engine: typeof response.result['engine'] === 'string' ? response.result['engine'] : 'code_cartography',
          ...summaryData,
        },
        null, 2,
      ),
      'utf-8',
    );

    // Per-language breakdown files
    const breakdown = Array.isArray(summaryData['language_breakdown']) ? summaryData['language_breakdown'] : [];
    if (breakdown.length > 0) {
      const langDir = path.join(cacheDir, 'languages');
      await fs.mkdir(langDir, { recursive: true });
      for (const entry of breakdown) {
        if (!isRecord(entry) || typeof entry['language'] !== 'string') continue;
        await fs.writeFile(
          path.join(langDir, `${entry['language'] as string}.json`),
          JSON.stringify(
            { generated_at: generatedAt, workspace_id: workspaceId, language: entry['language'], file_count: entry['file_count'] },
            null, 2,
          ),
          'utf-8',
        );
      }
    }

    // README.md — written once
    const readmePath = path.join(cacheDir, 'README.md');
    try { await fs.access(readmePath); } catch { await fs.writeFile(readmePath, formatCacheReadme(), 'utf-8'); }
  }
}

async function updateCartographerIndex(
  workspacePath: string,
  action: CartographerAction,
  response: PythonCoreResponse,
  generatedAt: string,
  workspaceRelativeReportPath: string,
): Promise<void> {
  const fs = await import('node:fs/promises');
  const indexPath = path.join(workspacePath, SUPERVISOR_INDEX_RELATIVE_PATH);

  const summaryStats = action === 'summary' && isRecord(response.result) && isRecord(response.result['summary'])
    ? response.result['summary']
    : {};

  const fileCount  = action === 'summary' ? (summaryStats['file_count']   ?? '–') : '–';
  const modCount   = action === 'summary' ? (summaryStats['module_count'] ?? '–') : '–';
  const symCount   = action === 'summary' ? (summaryStats['symbol_count'] ?? '–') : '–';

  // Path from the index file to the report
  const indexDir    = path.dirname(indexPath);
  const absReport   = path.join(workspacePath, workspaceRelativeReportPath);
  const relToIndex  = path.relative(indexDir, absReport).replace(/\\/g, '/');
  const linkText    = path.basename(workspaceRelativeReportPath);

  const newRow = `| ${generatedAt} | ${action} | ${response.status} | ${response.elapsed_ms}ms | ${fileCount} | ${modCount} | ${symCount} | [${linkText}](${relToIndex}) |`;

  let existing = '';
  try { existing = await fs.readFile(indexPath, 'utf-8'); } catch { /* new file */ }

  const content = existing
    ? existing.trimEnd() + '\n' + newRow + '\n'
    : formatIndexHeader() + '\n' + newRow + '\n';

  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, content, 'utf-8');
}

// Fire-and-forget background enrichment queries that populate the cache after a
// successful summary scan.  These are best-effort: all errors are swallowed.
function spawnBackgroundCacheQueries(
  pythonWorkspacePath: string,
  documentationWorkspacePath: string,
  workspaceId: string,
  maxTimeoutMs: number,
  debugOutput: boolean | undefined,
): void {
  const bgTimeout = Math.min(maxTimeoutMs, 90_000);
  const cacheDir  = path.join(documentationWorkspacePath, SUPERVISOR_CACHE_RELATIVE_DIR);

  const runFullScanAndCache = async (): Promise<void> => {
    try {
      const adapter   = new PythonCoreAdapter();
      const requestId = `cartograph_full_scan_bg_${randomUUID()}`;
      const bgResponse = await adapter.invoke(
        {
          schema_version: ADAPTER_SCHEMA_VERSION,
          request_id:     requestId,
          action:         'cartograph',
          args:           {
            query:               'full_scan',
            workspace_path:      pythonWorkspacePath,
            scope:               {},
            include_symbols:     true,
            include_references:  true,
          },
          timeout_ms: bgTimeout,
        },
        { debug_output: debugOutput },
      );

      if (bgResponse.status !== 'ok' && bgResponse.status !== 'partial') return;

      const result = bgResponse.result;
      if (!isRecord(result)) return;

      const fs           = await import('node:fs/promises');
      const generatedAt  = new Date().toISOString();
      const partial      = result['partial'] === true;

      await fs.mkdir(cacheDir, { recursive: true });

      // files.json — all discovered files with metadata
      const files = Array.isArray(result['files']) ? result['files'] : [];
      await fs.writeFile(
        path.join(cacheDir, 'files.json'),
        JSON.stringify(
          { generated_at: generatedAt, workspace_id: workspaceId, partial, total: files.length, files },
          null, 2,
        ),
        'utf-8',
      );

      // symbols — split per language into symbols/<lang>.json
      const symbols = Array.isArray(result['symbols']) ? result['symbols'] : [];
      if (symbols.length > 0) {
        const byLang = new Map<string, unknown[]>();
        for (const sym of symbols) {
          if (!isRecord(sym)) continue;
          const file = typeof sym['file'] === 'string' ? sym['file'] : '';
          const ext  = file.includes('.') ? file.split('.').pop()?.toLowerCase() ?? '' : '';
          const lang = EXT_TO_LANG[ext] ?? (ext || 'unknown');
          if (!byLang.has(lang)) byLang.set(lang, []);
          byLang.get(lang)!.push(sym);
        }

        const symDir = path.join(cacheDir, 'symbols');
        await fs.mkdir(symDir, { recursive: true });

        // Per-language files
        for (const [lang, langSyms] of byLang) {
          await fs.writeFile(
            path.join(symDir, `${lang}.json`),
            JSON.stringify(
              { generated_at: generatedAt, workspace_id: workspaceId, language: lang, partial,
                total: langSyms.length, symbols: langSyms },
              null, 2,
            ),
            'utf-8',
          );
        }

        // symbols-index.json — flat lightweight index for quick lookup (name/file/kind/line)
        const index = symbols
          .filter(isRecord)
          .map(s => ({ id: s['id'], file: s['file'], name: s['name'], kind: s['kind'], start_line: s['start_line'], exported: s['exported'] ?? null }))
          .sort((a, b) => String(a['name']).localeCompare(String(b['name'])));
        await fs.writeFile(
          path.join(symDir, 'index.json'),
          JSON.stringify(
            { generated_at: generatedAt, workspace_id: workspaceId, partial, total: index.length, symbols: index },
            null, 2,
          ),
          'utf-8',
        );
      }

      // references.json
      const refs = Array.isArray(result['references']) ? result['references'] : [];
      if (refs.length > 0) {
        await fs.writeFile(
          path.join(cacheDir, 'references.json'),
          JSON.stringify(
            { generated_at: generatedAt, workspace_id: workspaceId, partial, total: refs.length, references: refs },
            null, 2,
          ),
          'utf-8',
        );
      }

      // module-graph.json
      const moduleGraph = isRecord(result['module_graph']) ? result['module_graph'] : {};
      await fs.writeFile(
        path.join(cacheDir, 'module-graph.json'),
        JSON.stringify(
          { generated_at: generatedAt, workspace_id: workspaceId, partial, ...moduleGraph },
          null, 2,
        ),
        'utf-8',
      );

      // dependency-flow.json
      const depFlow = isRecord(result['dependency_flow']) ? result['dependency_flow'] : {};
      await fs.writeFile(
        path.join(cacheDir, 'dependency-flow.json'),
        JSON.stringify(
          { generated_at: generatedAt, workspace_id: workspaceId, partial, ...depFlow },
          null, 2,
        ),
        'utf-8',
      );

    } catch { /* best-effort — ignore all errors */ }
  };

  void runFullScanAndCache();
}

// Mapping of common file extensions to language names (mirrors Python side).
const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  cs: 'csharp',
  cpp: 'cpp', cc: 'cpp', h: 'cpp', hpp: 'cpp',
  java: 'java',
  sh: 'shell', bash: 'shell', ps1: 'shell',
  ahk: 'ahk', ah2: 'ahk',
  sql: 'sql',
  md: 'markdown',
  json: 'json', yaml: 'yaml', toml: 'toml',
};

// ---------------------------------------------------------------------------

async function writeSupervisorDocumentation(
  workspaceId: string,
  workspacePath: string,
  action: CartographerAction,
  params: MemoryCartographerParams,
  response: PythonCoreResponse,
): Promise<SupervisorDocumentationRecord> {
  const generatedAt = new Date().toISOString();
  const timestampSlug = generatedAt.replace(/[.:]/g, '-');
  const fileName = `cartographer-supervisor-${action}-${timestampSlug}.md`;
  const reportDir = path.join(workspacePath, SUPERVISOR_REPORT_RELATIVE_DIR);
  const reportPath = path.join(reportDir, fileName);
  const relativePath = path.relative(workspacePath, reportPath) || reportPath;
  const content = formatSupervisorDocumentation(workspaceId, workspacePath, action, params, response);

  try {
    const fs = await import('node:fs/promises');
    await fs.mkdir(reportDir, { recursive: true });
    await fs.writeFile(reportPath, content, 'utf-8');

    // Write machine-readable cache files and update the running index.
    // These are best-effort: failures here must not fail the doc write.
    await Promise.allSettled([
      writeSupervisorCache(workspacePath, workspaceId, action, response, generatedAt),
      updateCartographerIndex(workspacePath, action, response, generatedAt, relativePath),
    ]);

    return {
      status: 'written',
      generated_at: generatedAt,
      file_path: reportPath,
      relative_path: relativePath,
      bytes: Buffer.byteLength(content, 'utf8'),
    };
  } catch (error) {
    return {
      status: 'failed',
      generated_at: generatedAt,
      error: error instanceof Error ? error.message : String(error),
      file_path: reportPath,
      relative_path: relativePath,
    };
  }
}

function attachDocumentationRecord(
  payload: ToolResponse<unknown>,
  record: SupervisorDocumentationRecord,
): ToolResponse<unknown> {
  if (!isRecord(payload.data)) {
    return payload;
  }

  const actionEnvelope = payload.data;
  if (!isRecord(actionEnvelope.data)) {
    return payload;
  }

  actionEnvelope.data.documentation = record;
  return payload;
}

function buildPythonRuntimeErrorEnvelope(
  action: NonSummaryPythonAction,
  response: PythonCoreResponse,
): ToolResponse<unknown> {
  const launchContext = extractLaunchContextFromResponse(response);

  return {
    success: false,
    error:   `Python core returned an error for ${action} action`,
    data: {
      action,
      data: {
        error:           'PYTHON_CORE_ERROR',
        diagnostic_code: 'PYTHON_RUNTIME_ERROR',
        message:         response.diagnostics.errors.join('; ') || 'Python core returned status=error.',
        request_id:      response.request_id,
        diagnostics:     response.diagnostics,
        elapsed_ms:      response.elapsed_ms,
        ...(launchContext ? { launch_context: launchContext } : {}),
      },
    },
  };
}

function buildPythonRuntimeUnavailableEnvelope(
  action: NonSummaryPythonAction,
  message: string,
  launchContext?: Record<string, unknown>,
): ToolResponse<unknown> {
  return {
    success: false,
    error:   `${action} failed: ${message}`,
    data: {
      action,
      data: {
        error:           'PYTHON_CORE_ERROR',
        diagnostic_code: 'PYTHON_RUNTIME_UNAVAILABLE',
        message,
        ...(launchContext ? { launch_context: launchContext } : {}),
      },
    },
  };
}

function buildPythonSuccessEnvelope(
  action: NonSummaryPythonAction,
  response: PythonCoreResponse,
): ToolResponse<unknown> {
  return {
    success: true,
    data: {
      action,
      data: {
        source:         'python_core',
        request_id:     response.request_id,
        schema_version: response.schema_version,
        status:         response.status,
        elapsed_ms:     response.elapsed_ms,
        diagnostics:    response.diagnostics,
        result:         response.result,
      },
    },
  };
}

function buildNonSummaryQueryArgs(
  action: NonSummaryPythonAction,
  params: MemoryCartographerParams,
  pythonWorkspacePath: string,
  resolvedWorkspaceId: string,
): Record<string, unknown> {
  const queryArgs: Record<string, unknown> = {
    query:          action,
    workspace_path: pythonWorkspacePath,
  };

  switch (action) {
    case 'file_context': {
      queryArgs.file_id = params.file_id;
      if (typeof params.include_symbols === 'boolean') {
        queryArgs.include_symbols = params.include_symbols;
      }
      if (typeof params.include_references === 'boolean') {
        queryArgs.include_references = params.include_references;
      }
      return queryArgs;
    }

    case 'flow_entry_points': {
      if (Array.isArray(params.layer_filter) && params.layer_filter.length > 0) {
        queryArgs.layer_filter = params.layer_filter;
      }
      if (Array.isArray(params.language_filter) && params.language_filter.length > 0) {
        queryArgs.language_filter = params.language_filter;
      }
      return queryArgs;
    }

    case 'layer_view': {
      queryArgs.layers = params.layers;
      if (typeof params.depth_limit === 'number') {
        queryArgs.depth_limit = params.depth_limit;
      }
      if (typeof params.include_cross_layer_edges === 'boolean') {
        queryArgs.include_cross_layer_edges = params.include_cross_layer_edges;
      }
      return queryArgs;
    }

    case 'search': {
      queryArgs.search_query = params.query;
      if (params.search_scope) {
        queryArgs.search_scope = params.search_scope;
      }
      if (Array.isArray(params.layer_filter) && params.layer_filter.length > 0) {
        queryArgs.layer_filter = params.layer_filter;
      }
      if (typeof params.limit === 'number') {
        queryArgs.limit = params.limit;
      }
      return queryArgs;
    }

    case 'slice_detail': {
      queryArgs.workspace_id = resolvedWorkspaceId;
      queryArgs.slice_id = params.slice_id;
      return queryArgs;
    }

    case 'slice_projection': {
      queryArgs.workspace_id = resolvedWorkspaceId;
      queryArgs.slice_id = params.slice_id;
      queryArgs.projection_type = params.projection_type;
      if (Array.isArray(params.filters) && params.filters.length > 0) {
        queryArgs.filters = params.filters;
      }
      return queryArgs;
    }

    case 'slice_filters': {
      queryArgs.workspace_id = resolvedWorkspaceId;
      if (params.slice_id) {
        queryArgs.slice_id = params.slice_id;
      }
      return queryArgs;
    }

    default:
      return queryArgs;
  }
}

async function invokeNonSummaryPythonAction(
  action: NonSummaryPythonAction,
  params: MemoryCartographerParams,
  resolvedWorkspaceId: string,
  pythonWorkspacePath: string,
): Promise<ToolResponse<unknown>> {
  const adapter = new PythonCoreAdapter();
  const requestId = `cartograph_${action}_${randomUUID()}`;
  const queryArgs = buildNonSummaryQueryArgs(action, params, pythonWorkspacePath, resolvedWorkspaceId);
  const timeoutMs = resolveNonSummaryTimeoutMs(action);

  try {
    const response = await adapter.invoke({
      schema_version: ADAPTER_SCHEMA_VERSION,
      request_id:     requestId,
      action:         'cartograph',
      args:           queryArgs,
      timeout_ms:     timeoutMs,
    }, { debug_output: params.debug_output });

    let documentationRecord: SupervisorDocumentationRecord | undefined;
    if (shouldWriteSupervisorDocumentation(params)) {
      documentationRecord = await writeSupervisorDocumentation(
        resolvedWorkspaceId,
        pythonWorkspacePath,
        action,
        params,
        response,
      );

      if (documentationRecord.status === 'failed') {
        console.warn(JSON.stringify({
          event: 'cartographer_documentation_write_failed',
          action,
          workspace_id: resolvedWorkspaceId,
          error: documentationRecord.error,
          file_path: documentationRecord.file_path ?? null,
        }));
      }
    }

    if (response.status === 'error') {
      const payload = buildPythonRuntimeErrorEnvelope(action, response);
      return documentationRecord
        ? attachDocumentationRecord(payload, documentationRecord)
        : payload;
    }

    const payload = buildPythonSuccessEnvelope(action, response);
    return documentationRecord
      ? attachDocumentationRecord(payload, documentationRecord)
      : payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const launchContext = extractLaunchContextFromError(error) ?? extractLaunchContextFromMessage(message);

    console.warn(JSON.stringify({
      event:          'cartographer_fallback',
      action,
      reason:         'python_core_error',
      error:          message,
      launch_context: launchContext ?? null,
    }));

    return buildPythonRuntimeUnavailableEnvelope(action, message, launchContext);
  }
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
      const effectiveSummaryWorkspacePath = resolveSummaryWorkspacePath(pythonWorkspacePath);
      const documentationWorkspacePath = effectiveSummaryWorkspacePath;
      const summaryTimeoutMs = resolveSummaryTimeoutMs();

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
            workspace_path: effectiveSummaryWorkspacePath,
            scope: scopeArgs,
            ...(languageFilters.length > 0 ? { languages: languageFilters } : {}),
          },
          timeout_ms: summaryTimeoutMs,
        }, { debug_output: params.debug_output });

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

        let documentationRecord: SupervisorDocumentationRecord | undefined;
        if (shouldWriteSupervisorDocumentation(params)) {
          documentationRecord = await writeSupervisorDocumentation(
            resolvedWorkspaceId,
            documentationWorkspacePath,
            'summary',
            params,
            response,
          );

          if (documentationRecord.status === 'failed') {
            console.warn(JSON.stringify({
              event: 'cartographer_documentation_write_failed',
              action: 'summary',
              workspace_id: resolvedWorkspaceId,
              error: documentationRecord.error,
              file_path: documentationRecord.file_path ?? null,
            }));
          }

          // Kick off background enrichment queries (flow_entry_points + layer_view)
          // to populate the cache directory.  These are fire-and-forget.
          spawnBackgroundCacheQueries(
            effectiveSummaryWorkspacePath,
            documentationWorkspacePath,
            resolvedWorkspaceId,
            summaryTimeoutMs,
            params.debug_output,
          );
        }

        const payload: ToolResponse<unknown> = {
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

        return documentationRecord
          ? attachDocumentationRecord(payload, documentationRecord)
          : payload;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const launchContext = extractLaunchContextFromError(error);
        console.warn(JSON.stringify({
          event: 'cartographer_fallback',
          action: 'summary',
          reason: 'python_core_error',
          error: message,
          launch_context: launchContext ?? null,
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
              ...(launchContext ? { launch_context: launchContext } : {}),
            },
          },
        };
      }
    }

    // ── Phase B live actions: non-summary cartography_queries + slices ─────
    case 'file_context':
    case 'flow_entry_points':
    case 'layer_view':
    case 'search':
    case 'slice_detail':
    case 'slice_projection':
    case 'slice_filters': {
      const workspace = getWorkspace(resolvedWorkspaceId);
      if (!workspace?.path) {
        return {
          success: false,
          error: `Unable to resolve workspace path for workspace '${resolvedWorkspaceId}'`,
          data: {
            action,
            data: {
              error:           'WORKSPACE_PATH_UNAVAILABLE',
              diagnostic_code: 'WORKSPACE_PATH_NOT_FOUND',
              message:         `Workspace path could not be resolved for '${resolvedWorkspaceId}'.`,
            },
          },
        };
      }

      const resolvedWorkspacePath = await resolveAccessiblePath(workspace.path);
      const pythonWorkspacePath = resolvedWorkspacePath ?? workspace.path;
      return invokeNonSummaryPythonAction(
        action,
        params,
        resolvedWorkspaceId,
        pythonWorkspacePath,
      );
    }

    // ── architecture_slices: slice_catalog (SQLite-backed) ──────────────────
    case 'slice_catalog': {
      type SliceCatalogRow = {
        id: string;
        workspace_id: string;
        path: string;
        type: string;
        catalog_metadata: string | null;
        created_at: string;
        updated_at: string;
      };
      const slices = queryAll<SliceCatalogRow>(
        'SELECT id, workspace_id, path, type, catalog_metadata, created_at, updated_at FROM architecture_slices WHERE workspace_id = ?',
        [resolvedWorkspaceId],
      );
      return {
        success: true,
        data: {
          action: 'slice_catalog',
          data: {
            slices,
            total: slices.length,
          },
        },
      };
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
