/**
 * Action Parameter Specs — memory_cartographer
 *
 * Per-action required/optional parameter definitions for all 17 actions
 * across 4 domain families.
 *
 * Phase A (SQLite-backed): dependencies_dependents, database_map_access
 * Phase B (Python-blocked stub): cartography_queries, architecture_slices
 */

import type { ActionParamDef } from './action-params-plan.js';

// =============================================================================
// Shared workspace_id required spec (used in all actions)
// =============================================================================

const WS_ID = { name: 'workspace_id', type: 'string', description: 'Workspace identifier' } as const;

// =============================================================================
// memory_cartographer
// =============================================================================

export const CARTOGRAPHER_PARAMS: Record<string, ActionParamDef> = {

  // ── cartography_queries (Phase B) ─────────────────────────────────────────

  summary: {
    required: [WS_ID],
    optional: [
      { name: 'force_refresh', type: 'boolean', description: 'Bypass cache and re-scan; default false' },
    ],
  },

  file_context: {
    required: [WS_ID, { name: 'file_id', type: 'string', description: 'Normalized file identity key' }],
    optional: [
      { name: 'include_symbols',    type: 'boolean', description: 'Include SymbolEntry list; default true' },
      { name: 'include_references', type: 'boolean', description: 'Include ReferenceEntry list; default true' },
    ],
  },

  flow_entry_points: {
    required: [WS_ID],
    optional: [
      { name: 'layer_filter',    type: 'string[]', description: 'Restrict to specific architecture layer tags' },
      { name: 'language_filter', type: 'string[]', description: 'Restrict to specific language tags' },
    ],
  },

  layer_view: {
    required: [WS_ID, { name: 'layers', type: 'string[]', description: 'One or more architecture layer tag names' }],
    optional: [
      { name: 'include_cross_layer_edges', type: 'boolean', description: 'Include cross-layer edges; default false' },
      { name: 'depth_limit',              type: 'number',  description: 'Max edge traversal depth; default 3, max 10' },
    ],
  },

  search: {
    required: [WS_ID, { name: 'query', type: 'string', description: 'Search query (supports glob and regex)' }],
    optional: [
      { name: 'search_scope',  type: 'string',   description: "'symbols' | 'files' | 'modules' | 'all'; default 'all'" },
      { name: 'layer_filter',  type: 'string[]', description: 'Restrict to layers' },
      { name: 'limit',         type: 'number',   description: 'Max results; default 20, max 100' },
    ],
  },

  // ── dependencies_dependents (Phase A) ─────────────────────────────────────

  get_plan_dependencies: {
    required: [WS_ID, { name: 'plan_id', type: 'string', description: 'Target plan ID' }],
    optional: [
      { name: 'depth_limit', type: 'number', description: 'Traversal depth; default 1, max 20' },
    ],
  },

  get_dependencies: {
    required: [WS_ID, { name: 'plan_id', type: 'string', description: 'Target plan ID' }],
    optional: [
      { name: 'depth_limit', type: 'number', description: 'Traversal depth; default 5, max 20' },
    ],
  },

  reverse_dependent_lookup: {
    required: [WS_ID, { name: 'plan_id', type: 'string', description: 'Target plan ID' }],
    optional: [],
  },

  bounded_traversal: {
    required: [WS_ID, { name: 'root_plan_id', type: 'string', description: 'Starting plan for traversal' }],
    optional: [
      { name: 'direction',        type: 'string',  description: "'dependencies' | 'dependents' | 'both'; default 'both'" },
      { name: 'depth_limit',      type: 'number',  description: 'Max depth; default 5, max 20' },
      { name: 'include_archived', type: 'boolean', description: 'Include archived plans; default false' },
      { name: 'cursor',           type: 'string',  description: 'Opaque pagination cursor from previous call' },
      { name: 'page_size',        type: 'number',  description: 'Results per page; default 50, max 200' },
    ],
  },

  // ── architecture_slices (Phase B) ─────────────────────────────────────────

  slice_catalog: {
    required: [WS_ID],
    optional: [],
  },

  slice_detail: {
    required: [WS_ID, { name: 'slice_id', type: 'string', description: 'Slice identifier' }],
    optional: [
      { name: 'materialize', type: 'boolean', description: 'Force re-materialization; default false' },
    ],
  },

  slice_projection: {
    required: [
      WS_ID,
      { name: 'slice_id',        type: 'string', description: 'Slice identifier' },
      { name: 'projection_type', type: 'string', description: "'file_level' | 'module_level' | 'symbol_level'" },
    ],
    optional: [
      { name: 'filters', type: 'object[]', description: 'Additional filters on top of slice definition' },
      { name: 'limit',   type: 'number',   description: 'Max items; default 100, max 1000' },
    ],
  },

  slice_filters: {
    required: [WS_ID],
    optional: [
      { name: 'slice_id', type: 'string', description: 'If provided, return filters for that slice' },
    ],
  },

  // ── database_map_access (Phase A) ─────────────────────────────────────────

  db_map_summary: {
    required: [WS_ID],
    optional: [],
  },

  db_node_lookup: {
    required: [
      WS_ID,
      { name: 'table_name',  type: 'string', description: 'Allowed table name (context_items | workspaces | plans | agent_sessions | steps | handoffs | build_scripts | research_notes)' },
      { name: 'primary_key', type: 'string', description: 'Primary key value (passed as string)' },
    ],
    optional: [],
  },

  db_edge_lookup: {
    required: [
      WS_ID,
      { name: 'table_name',  type: 'string', description: 'Allowed table name' },
      { name: 'primary_key', type: 'string', description: 'Primary key value' },
    ],
    optional: [
      { name: 'edge_direction', type: 'string', description: "'outbound' | 'inbound' | 'both'; default 'both'" },
    ],
  },

  context_items_projection: {
    required: [
      WS_ID,
      { name: 'parent_type', type: 'string', description: "'plan' | 'workspace'" },
      { name: 'parent_id',   type: 'string', description: 'Parent plan or workspace ID' },
    ],
    optional: [
      { name: 'type_filter', type: 'string[]', description: 'Filter by context_items.type values' },
      { name: 'limit',       type: 'number',   description: 'Max rows per page; default 50, max 500' },
      { name: 'cursor',      type: 'string',   description: 'Opaque pagination cursor from previous call' },
      { name: 'order_by',    type: 'string',   description: "'created_at' | 'type' | 'parent_id'; default 'created_at'" },
    ],
  },
};
