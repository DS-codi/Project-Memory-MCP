/**
 * databaseMapper.ts
 *
 * TypeScript type stubs and mapping function skeleton for the database
 * cartography section of the memory_cartographer output envelope.
 *
 * These types mirror the JSON schema defined in:
 *   docs/contracts/sections/database-cartography.schema.json
 *
 * Ownership: TypeScript server (adapter layer).
 * Python core produces the raw section; this mapper deserialises and
 * type-narrows the result for use by MCP tools and callers.
 *
 * Ordering guarantees (enforced by Python core, verified here):
 *   datasources     → sorted by id ascending
 *   tables          → sorted by (datasource_id, schema_name, table_name) ascending
 *   columns         → sorted by (table_id, ordinal_position) ascending
 *   constraints     → sorted by (table_id, constraint_kind, constraint_name) ascending
 *   relations       → sorted by (from_table_id, to_table_id, constraint_name) ascending
 *   query_touchpoints → sorted by (file, line) ascending
 *   migration_lineage.migration_files → sorted by (datasource_id, version) ascending
 *
 * See: docs/contracts/memory-cartographer-contract.md
 *      docs/contracts/normalization-rules.md
 *      server/src/cartography/contracts/types.ts
 */

// ---------------------------------------------------------------------------
// DataSource
// ---------------------------------------------------------------------------

/**
 * A database connection or data source discovered in the workspace.
 */
export interface DataSource {
  /**
   * Stable identity key. Format: '{kind}::{name}'.
   * See normalization-rules.md.
   */
  id: string;
  /** Data source type: postgresql | mysql | sqlite | mssql | mongodb | redis | unknown. */
  kind: string;
  /** Human-readable name (database name or connection alias). */
  name: string;
  /** How the connection was discovered: env_var | config_file | code_reference | migration_file | unknown. */
  connection_source?: string;
  /** Workspace-relative path to the configuration file where discovered. */
  config_path?: string;
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

/**
 * A table or view in a scanned data source.
 */
export interface Table {
  /**
   * Stable identity key. Format: '{datasource_id}::{schema_name}::{table_name}'.
   * schema_name is empty string for databases without schema namespacing.
   */
  id: string;
  /** Identity key of the parent DataSource. Sort key 1. */
  datasource_id: string;
  /**
   * Schema/namespace name. Empty string when not applicable.
   * Sorts before non-empty values. Sort key 2.
   */
  schema_name: string;
  /** Table or view name. Sort key 3. */
  table_name: string;
  /** Object kind: table | view | materialized_view | unknown. */
  table_kind: string;
  /** Number of columns. */
  column_count?: number;
  /** Estimated row count from DB statistics. */
  row_count_estimate?: number;
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

/**
 * A single column in a table.
 */
export interface Column {
  /**
   * Stable identity key. Format: '{table_id}::{column_name}'.
   */
  id: string;
  /** Identity key of the parent Table. Sort key 1. */
  table_id: string;
  /** Column name. */
  column_name: string;
  /** Database-native data type string. */
  data_type: string;
  /** 1-based ordinal position. Sort key 2. */
  ordinal_position: number;
  /**
   * Whether the column allows NULL values.
   * Always present for columns — never absent or null per normalization-rules.md.
   */
  nullable: boolean;
  /** Default value expression string. Absent when no default is defined. */
  default_value?: string;
  /** true if part of the primary key. */
  is_primary_key?: boolean;
}

// ---------------------------------------------------------------------------
// Constraint
// ---------------------------------------------------------------------------

/**
 * A table constraint (primary key, unique, check, not-null).
 */
export interface Constraint {
  /** Stable identity key. Format: '{table_id}::{constraint_name}'. */
  id: string;
  /** Identity key of the parent Table. Sort key 1. */
  table_id: string;
  /** Constraint type. Sort key 2. */
  constraint_kind: 'primary_key' | 'unique' | 'check' | 'not_null' | 'unknown';
  /** Constraint name. Sort key 3. */
  constraint_name: string;
  /** Ordered list of column identity keys in this constraint. */
  column_ids?: string[];
  /** Check expression (check constraints only). */
  check_expression?: string;
}

// ---------------------------------------------------------------------------
// Relation
// ---------------------------------------------------------------------------

/**
 * A foreign key or logical relation between two tables.
 */
export interface Relation {
  /**
   * Stable identity key. Format: '{from_table_id}::{to_table_id}::{constraint_name}'.
   */
  id: string;
  /** Identity key of the source (referencing) table. Sort key 1. */
  from_table_id: string;
  /** Identity key of the target (referenced) table. Sort key 2. */
  to_table_id: string;
  /** Relation type: foreign_key | logical | unknown. */
  relation_kind: string;
  /** Foreign key constraint name. Sort key 3. */
  constraint_name?: string;
  /** Ordered column identity keys in the source table. */
  from_columns?: string[];
  /** Ordered corresponding column identity keys in the target table. */
  to_columns?: string[];
  /** ON DELETE action. */
  on_delete?: string;
  /** ON UPDATE action. */
  on_update?: string;
}

// ---------------------------------------------------------------------------
// MigrationLineage
// ---------------------------------------------------------------------------

/** A single migration file entry. */
export interface MigrationFile {
  /** Workspace-relative path. */
  path: string;
  /** Migration version string. Sort key 2 (after datasource_id). */
  version: string;
  /** Associated data source identity key. */
  datasource_id?: string;
  /** Migration framework. */
  framework?: string;
  /** Migration status: applied | pending | unknown. */
  status?: string;
}

/**
 * Migration file discovery and schema evolution lineage.
 */
export interface MigrationLineage {
  /** Discovered migration files, sorted by (datasource_id, version) ascending. */
  migration_files: MigrationFile[];
  /** Number of applied migrations. 0 when not determinable. */
  applied_count: number;
  /** Primary migration framework detected. */
  framework?: string;
}

// ---------------------------------------------------------------------------
// QueryTouchpoint
// ---------------------------------------------------------------------------

/**
 * A source code location that references a database table or column.
 */
export interface QueryTouchpoint {
  /** Workspace-relative source file. Sort key 1. */
  file: string;
  /** 1-based line number. Sort key 2. */
  line: number;
  /** Identity key of the referenced Table. */
  table_id: string;
  /** Identity keys of referenced columns (when determinable). */
  column_ids?: string[];
  /** Query kind: select | insert | update | delete | ddl | orm | unknown. */
  query_kind?: string;
  /** ORM method name when detected through ORM usage. */
  orm_method?: string;
}

// ---------------------------------------------------------------------------
// DatabaseCartographySection
// ---------------------------------------------------------------------------

/**
 * The complete database cartography section of the output envelope.
 * All array fields are always present (may be empty); never null.
 * See normalization-rules.md for nullability semantics.
 */
export interface DatabaseCartographySection {
  /** true if the section represents incomplete results. */
  partial?: boolean;
  /** Data source descriptors, sorted by id ascending. */
  datasources: DataSource[];
  /** Table descriptors, sorted by (datasource_id, schema_name, table_name) ascending. */
  tables: Table[];
  /** Column descriptors, sorted by (table_id, ordinal_position) ascending. */
  columns: Column[];
  /** Constraint descriptors, sorted by (table_id, constraint_kind, constraint_name) ascending. */
  constraints: Constraint[];
  /** Relation descriptors, sorted by (from_table_id, to_table_id, constraint_name) ascending. */
  relations: Relation[];
  /** Migration file lineage. */
  migration_lineage: MigrationLineage;
  /** Query touchpoints, sorted by (file, line) ascending. */
  query_touchpoints: QueryTouchpoint[];
}

// ---------------------------------------------------------------------------
// Mapper stub
// ---------------------------------------------------------------------------

/**
 * Deserialises and type-narrows the raw database cartography section received
 * from the Python core response envelope.
 *
 * TODO: Implement validation, ordering verification, and type narrowing.
 *       For now this is a pass-through stub that asserts the raw object
 *       matches the expected shape.
 *
 * @param raw - Raw object from the Python core response result field.
 * @returns Typed DatabaseCartographySection.
 */
export function mapDatabaseCartography(raw: unknown): DatabaseCartographySection {
  // TODO: implement full validation and normalisation
  // Stub: cast with minimal shape check
  if (raw === null || typeof raw !== 'object') {
    throw new Error('mapDatabaseCartography: raw input is not an object');
  }
  return raw as DatabaseCartographySection;
}
