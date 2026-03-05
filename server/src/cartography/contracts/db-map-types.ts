/**
 * db-map-types.ts
 *
 * TypeScript type definitions for the database_map_access domain
 * of memory_cartographer consolidated tool actions.
 *
 * These types are PLANNING PHASE stubs. Implementation (server/src/tools/consolidated/memory_cartographer.ts)
 * will import and use these types in the Implementation phase (steps 10+).
 *
 * Spec: docs/mcp-surface/database-map-access-contract.md
 * Plan: MCP Surface Integration — plan_mm9b56xe_92f7659d
 */

import type { DiagnosticEntry } from './dependency-types.js';

export type { DiagnosticEntry };

// ---------------------------------------------------------------------------
// Allowlist constants (runtime values defined in implementation)
// ---------------------------------------------------------------------------

/**
 * Allowed table names for db_map_access actions.
 * Any request referencing a table not in this list is rejected with D007.
 */
export type AllowedTableName =
  | 'context_items'
  | 'workspaces'
  | 'plans'
  | 'agent_sessions'
  | 'steps'
  | 'handoffs'
  | 'build_scripts'
  | 'research_notes';

/** Direction of FK edge traversal in db_edge_lookup. */
export type EdgeDirection = 'outbound' | 'inbound' | 'both';

/** Order column for context_items_projection. */
export type ContextItemsOrderBy = 'created_at' | 'type' | 'parent_id';

/** Parent scope discriminator for context_items queries. */
export type ContextParentType = 'plan' | 'workspace';

// ---------------------------------------------------------------------------
// Database Map entities
// ---------------------------------------------------------------------------

/**
 * Summary entry for a single table in the database map.
 */
export interface DbTableSummary {
  table_name: AllowedTableName;
  /** Workspace-scoped row count (or global if table has no workspace_id FK). */
  row_count: number;
  column_count: number;
  /** True if this table has at least one entry in the FK_RELATION_MAP. */
  has_fk_relations: boolean;
}

/**
 * A foreign key hint attached to a node lookup response.
 * Points to another table/column that can be navigated via db_edge_lookup.
 */
export interface FKHint {
  /** Column in the source table that holds the FK value. */
  column: string;
  /** Table the FK references. */
  references_table: AllowedTableName;
  /** Primary key column in the referenced table. */
  references_pk: string;
}

/**
 * A single FK edge returned by db_edge_lookup.
 */
export interface DbMapEdge {
  direction: 'outbound' | 'inbound';
  /** The FK column involved in this edge. */
  fk_column: string;
  /** The related table. */
  related_table: AllowedTableName;
  /**
   * Rows from the related table, with masked columns applied.
   * Capped at 50 rows. See `related_total` for actual count.
   */
  related_rows: Record<string, unknown>[];
  /** Total matching rows before cap (may exceed related_rows.length). */
  related_total: number;
}

/**
 * Summary of the DB schema — top-level structure returned by db_map_summary.
 */
export interface DbMapSummary {
  /** SQLite user_version pragma value (schema migration version). */
  schema_version: string;
  tables: DbTableSummary[];
  /** Total number of declared FK relationships in the FK_RELATION_MAP. */
  relation_count: number;
  diagnostics: DiagnosticEntry[];
}

/**
 * A single row lookup result from db_node_lookup.
 */
export interface DbMapNode {
  table_name: AllowedTableName;
  /**
   * Row data with masked columns substituted.
   * Masked columns are returned as null or "[REDACTED]".
   */
  row: Record<string, unknown>;
  /** Navigational hints for FK columns in this row. */
  fk_hints: FKHint[];
  diagnostics: DiagnosticEntry[];
}

// ---------------------------------------------------------------------------
// context_items projection
// ---------------------------------------------------------------------------

/**
 * A single context_items row in a projection response.
 * The full `data` column is never returned — only a safe preview.
 */
export interface ContextItemsProjectionRow {
  item_id: string;
  type: string;
  parent_type: ContextParentType;
  parent_id: string;
  created_at: string;
  /** Actual byte size of the underlying `data` JSON. */
  data_size_bytes: number;
  /**
   * First 500 characters of the JSON-stringified `data` field.
   * May be null if the item has no data.
   */
  data_preview: unknown;
  /** True if `data_preview` was truncated (data field longer than preview limit). */
  is_truncated: boolean;
}

/**
 * Paginated projection of context_items rows for a plan or workspace scope.
 */
export interface ContextItemsProjection {
  parent_type: ContextParentType;
  parent_id: string;
  items: ContextItemsProjectionRow[];
  /** Total rows matching the query, before pagination. */
  total_count: number;
  /** Opaque cursor for the next page; absent if no more pages. */
  next_cursor?: string;
  diagnostics: DiagnosticEntry[];
}

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

/** Input for the db_map_summary action. */
export interface DbMapSummaryRequest {
  workspace_id: string;
}

/** Input for the db_node_lookup action. */
export interface DbNodeLookupRequest {
  workspace_id: string;
  table_name: AllowedTableName;
  /** Primary key value (passed as string; server casts to correct type). */
  primary_key: string;
}

/** Input for the db_edge_lookup action. */
export interface DbEdgeLookupRequest {
  workspace_id: string;
  table_name: AllowedTableName;
  primary_key: string;
  /** Default: 'both'. */
  direction?: EdgeDirection;
}

/** Input for the context_items_projection action. */
export interface DbMapRequest {
  workspace_id: string;
  parent_type: ContextParentType;
  parent_id: string;
  /** Filter by context_items.type values. If empty/absent, all types are returned. */
  type_filter?: string[];
  /** Max rows per page. Default: 50. Max: 500. */
  limit?: number;
  /** Opaque pagination cursor from previous call. */
  cursor?: string;
  /** Column to sort by. Default: 'created_at' descending. */
  order_by?: ContextItemsOrderBy;
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

/**
 * Response for the db_edge_lookup action.
 */
export interface DbMapResponse {
  source: {
    table_name: AllowedTableName;
    primary_key: string;
  };
  edges: DbMapEdge[];
  diagnostics: DiagnosticEntry[];
}
