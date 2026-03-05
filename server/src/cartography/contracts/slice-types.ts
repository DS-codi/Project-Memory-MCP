/**
 * slice-types.ts
 *
 * TypeScript type definitions for the architecture slice domain
 * of memory_cartographer consolidated tool actions.
 *
 * These types are PLANNING PHASE stubs. Implementation (server/src/tools/consolidated/memory_cartographer.ts)
 * will import and use these types in the Implementation phase (steps 10+).
 *
 * Spec: docs/mcp-surface/architecture-slice-contract.md
 * Plan: MCP Surface Integration — plan_mm9b56xe_92f7659d
 */

import type { DiagnosticEntry } from './dependency-types.js';

// Re-export DiagnosticEntry for convenience when only importing from this file
export type { DiagnosticEntry };

// ---------------------------------------------------------------------------
// Foundation schema references (imported from python-core output contracts)
// ---------------------------------------------------------------------------

// These mirror the relevant fields from the Foundation code-cartography schema.
// Full definitions will be in the PythonCoreAdapter output types.

/** Minimal FileEntry fields needed for slice responses. */
export interface FileEntry {
  file_id: string;
  path: string;
  language: string;
  module_id: string;
  layer_tag?: string;
  loc: number;
}

/** Minimal SymbolEntry fields needed for slice responses. */
export interface SymbolEntry {
  symbol_id: string;
  name: string;
  kind: 'function' | 'class' | 'interface' | 'variable' | 'type' | 'enum' | 'method' | string;
  file_id: string;
  start_line: number;
  end_line: number;
  visibility: 'public' | 'private' | 'protected' | 'exported' | 'internal' | string;
}

/** Minimal ArchitectureEdge fields needed for slice responses. */
export interface ArchitectureEdge {
  from_module: string;
  to_module: string;
  edge_kind: 'import' | 'call' | 'inherit' | 'compose' | string;
  weight?: number;
}

/** Module-level entry (aggregated from ModuleGraph in Foundation schema). */
export interface ModuleEntry {
  module_id: string;
  module_name: string;
  /** Number of files from this module that are in-scope for the slice. */
  files_in_scope: number;
  /** Total outbound edge count from this module within scope. */
  outbound_edge_count: number;
  /** Total inbound edge count to this module within scope. */
  inbound_edge_count: number;
}

// ---------------------------------------------------------------------------
// Scope definition
// ---------------------------------------------------------------------------

/** How a slice scope is defined. */
export type ScopeType = 'path_glob' | 'layer_tag' | 'module_prefix' | 'explicit_files';

/**
 * Scope boundary for an architecture slice.
 * Defines which files/modules are included.
 */
export interface SliceScope {
  /** How the scope is defined. */
  scope_type: ScopeType;
  /**
   * One or more pattern strings matching the scope_type semantics:
   * - path_glob: glob patterns (e.g., "src/auth/**")
   * - layer_tag: layer tag strings (e.g., ["data-access", "api"])
   * - module_prefix: module name prefixes (e.g., ["auth.", "core."])
   * - explicit_files: normalized file_id values
   */
  patterns: string[];
  /**
   * Maximum dependency depth from root scope nodes to include.
   * Undefined = unbounded (include all transitively reachable within workspace).
   */
  depth?: number;
  /**
   * Whether to include files transitively reachable from scope root nodes.
   * Default: false (include only files directly matching `patterns`).
   */
  include_transitive?: boolean;
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

/** How a filter restricts slice content. */
export type FilterType = 'path_glob' | 'language_tag' | 'layer_tag' | 'symbol_kind' | 'visibility';

/**
 * A filter applied on top of a slice scope to further restrict projected content.
 */
export interface SliceFilter {
  /** The filtering dimension. */
  filter_type: FilterType;
  /**
   * Values to match. Semantics depend on filter_type:
   * - path_glob: glob patterns
   * - language_tag: language identifiers (e.g., "typescript", "python")
   * - layer_tag: layer tag strings
   * - symbol_kind: symbol kind strings (e.g., "function", "class")
   * - visibility: visibility strings (e.g., "public", "exported")
   */
  values: string[];
  /**
   * If true, EXCLUDE items matching this filter (blacklist mode).
   * Default: false (whitelist mode — include only matching items).
   */
  exclude?: boolean;
}

// ---------------------------------------------------------------------------
// Projection type
// ---------------------------------------------------------------------------

/** Granularity level for slice projections. */
export type ProjectionType = 'file_level' | 'module_level' | 'symbol_level';

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

/** Input for the slice_catalog action. */
export interface SliceCatalogRequest {
  workspace_id: string;
}

/** Input for the slice_detail action. */
export interface SliceDetailRequest {
  workspace_id: string;
  slice_id: string;
  /**
   * If true, re-compute projection against current code graph state.
   * Default: false (use cached projection if available; compute if not).
   */
  materialize?: boolean;
}

/** Input for the slice_projection action. */
export interface SliceProjectionRequest {
  workspace_id: string;
  slice_id: string;
  /** Granularity level for the projected items. */
  projection_type: ProjectionType;
  /** Additional filters applied on top of the slice definition. */
  filters?: SliceFilter[];
  /**
   * Maximum number of items to return.
   * Default: 100, max: 1000.
   */
  limit?: number;
}

/** Input for the slice_filters action. */
export interface SliceFiltersRequest {
  workspace_id: string;
  /**
   * If provided, return active filters for this slice.
   * If omitted, return workspace-wide available filter options.
   */
  slice_id?: string;
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

/** Summary entry in a slice catalog response. */
export interface SliceSummary {
  slice_id: string;
  name: string;
  description?: string;
  scope_type: ScopeType;
  created_at: string;
  last_materialized_at?: string;
}

/** Response for the slice_catalog action. */
export interface SliceCatalogResponse {
  slices: SliceSummary[];
  total: number;
  diagnostics: DiagnosticEntry[];
}

/** Response for the slice_detail action. */
export interface SliceDetailResponse {
  slice_id: string;
  name: string;
  description?: string;
  workspace_id: string;
  scope: SliceScope;
  filters: SliceFilter[];
  /** Files included in the slice scope (ordered by path). */
  nodes: FileEntry[];
  /** Dependency edges between nodes in scope (ordered by from_module + to_module). */
  edges: ArchitectureEdge[];
  projection_summary: {
    file_count: number;
    symbol_count: number;
    edge_count: number;
  };
  /** Whether the node/edge lists were truncated due to size limits. */
  truncated: boolean;
  diagnostics: DiagnosticEntry[];
}

/**
 * Discriminated union for slice_projection response items.
 * Actual item type depends on `projection_type`.
 */
export type SliceProjectionItem =
  | { kind: 'file'; item: FileEntry }
  | { kind: 'module'; item: ModuleEntry }
  | { kind: 'symbol'; item: SymbolEntry };

/** Response for the slice_projection action. */
export interface SliceProjectionResponse {
  slice_id: string;
  projection_type: ProjectionType;
  items: SliceProjectionItem[];
  /** Total items in the slice matching projection type + filters (before `limit` truncation). */
  total_in_slice: number;
  /** Number of items actually returned in this response. */
  returned: number;
  /** True if `returned < total_in_slice`. */
  truncated: boolean;
  diagnostics: DiagnosticEntry[];
}

/** Response for the slice_filters action. */
export interface SliceFiltersResponse {
  /** All unique layer tags found across the workspace (or slice scope if slice_id provided). */
  available_layer_tags: string[];
  /** All unique language tags found in the workspace (or slice scope). */
  available_language_tags: string[];
  /** All unique path prefixes (directory-level) found. */
  available_path_prefixes: string[];
  /** Active filters on the slice, if slice_id was provided. */
  active_filters?: SliceFilter[];
  diagnostics: DiagnosticEntry[];
}
