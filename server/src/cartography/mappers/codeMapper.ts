/**
 * codeMapper.ts
 *
 * TypeScript type stubs and mapping function skeleton for the code
 * cartography section of the memory_cartographer output envelope.
 *
 * These types mirror the JSON schema defined in:
 *   docs/contracts/sections/code-cartography.schema.json
 *
 * Ownership: TypeScript server (adapter layer).
 * Python core produces the raw section; this mapper deserialises and
 * type-narrows the result for use by MCP tools and callers.
 *
 * Ordering guarantees (enforced by Python core, verified here):
 *   files           → sorted by path ascending
 *   symbols         → sorted by (file, start_line, name) ascending
 *   references      → sorted by (from_file, from_line, to_file) ascending
 *   architecture_edges → sorted by (from_module, to_module) ascending
 *   module_graph.nodes → sorted ascending
 *   module_graph.edges → sorted by (from, to) ascending
 *   dependency_flow.tiers[n] → each tier sorted ascending
 *   dependency_flow.entry_points → sorted ascending
 *
 * See: docs/contracts/memory-cartographer-contract.md
 *      docs/contracts/normalization-rules.md
 *      server/src/cartography/contracts/types.ts
 */

// ---------------------------------------------------------------------------
// File
// ---------------------------------------------------------------------------

/**
 * A single source file within the scan scope.
 */
export interface CodeFile {
  /** Workspace-relative path (forward-slash, no leading slash). Sort key. */
  path: string;
  /** Detected language identifier (e.g., 'python', 'typescript', 'rust'). */
  language: string;
  /** File size in bytes at scan time. */
  size_bytes: number;
  /** Last-modification time as Unix nanoseconds. */
  mtime_unix_ns: number;
  /** Number of symbols extracted from this file. */
  symbol_count?: number;
  /** true if the file could not be fully parsed. */
  parse_error?: boolean;
}

// ---------------------------------------------------------------------------
// Symbol
// ---------------------------------------------------------------------------

/**
 * An extracted symbol definition.
 */
export interface Symbol {
  /**
   * Stable identity key.
   * Format: '{workspace_relative_file_path}::{symbol_name}'
   * See normalization-rules.md.
   */
  id: string;
  /** Workspace-relative path of the file containing this symbol. */
  file: string;
  /** Symbol name as it appears in source. */
  name: string;
  /** Fully qualified name, when determinable. */
  qualified_name?: string;
  /** Symbol kind: function | class | method | variable | constant | interface | type | module | enum | unknown. */
  kind: string;
  /** 1-based start line. */
  start_line: number;
  /** 1-based end line, when determinable. */
  end_line?: number;
  /** true if exported/public from its module. */
  exported?: boolean;
}

// ---------------------------------------------------------------------------
// Reference
// ---------------------------------------------------------------------------

/**
 * A cross-file symbol reference (call site, import, usage).
 */
export interface Reference {
  /** Workspace-relative path of the file containing the reference. Sort key 1. */
  from_file: string;
  /** 1-based line of the reference site. Sort key 2. */
  from_line: number;
  /** Stable identity key of the referenced symbol (matches Symbol.id). */
  to_symbol_id: string;
  /** Workspace-relative path of the file where the symbol is defined. Sort key 3. */
  to_file?: string;
  /** Reference kind: import | call | inherit | instanceof | type_reference | unknown. */
  reference_kind?: string;
}

// ---------------------------------------------------------------------------
// ModuleGraph
// ---------------------------------------------------------------------------

/** A single edge in the module dependency graph. */
export interface ModuleEdge {
  /** Workspace-relative module path of the importing module. Sort key 1. */
  from: string;
  /** Workspace-relative module path of the imported module. Sort key 2. */
  to: string;
  /** Edge type: static_import | dynamic_import | require | unknown. */
  kind?: string;
}

/**
 * Adjacency representation of the inter-module dependency graph.
 */
export interface ModuleGraph {
  /** All module identifiers (workspace-relative paths, sorted ascending). */
  nodes: string[];
  /** Import/require edges between modules, sorted by (from, to) ascending. */
  edges: ModuleEdge[];
}

// ---------------------------------------------------------------------------
// ArchitectureEdge
// ---------------------------------------------------------------------------

/**
 * A higher-level architectural dependency edge (layer boundary, cross-concern).
 */
export interface ArchitectureEdge {
  /** Source module path. Sort key 1. */
  from_module: string;
  /** Target module path. Sort key 2. */
  to_module: string;
  /** Edge type: layer_call | layer_violation | cross_boundary | circular | unknown. */
  edge_kind: string;
  /** Optional human-readable annotation. */
  annotation?: string;
}

// ---------------------------------------------------------------------------
// DependencyFlow
// ---------------------------------------------------------------------------

/**
 * Topologically sorted dependency tiers and entry points for the module graph.
 */
export interface DependencyFlow {
  /**
   * Topological tiers. Tier 0: no dependencies. Each tier depends only on
   * earlier tiers. Modules within each tier are sorted ascending.
   */
  tiers: string[][];
  /** Entry-point modules (not imported by any other in-scope module). Sorted ascending. */
  entry_points: string[];
  /** Detected circular dependency cycles (each cycle is a sorted path list). */
  cycles?: string[][];
}

// ---------------------------------------------------------------------------
// CodeCartographySection
// ---------------------------------------------------------------------------

/**
 * The complete code cartography section of the output envelope.
 * All array fields are always present (may be empty); never null.
 * See normalization-rules.md for nullability semantics.
 */
export interface CodeCartographySection {
  /** true if the section represents incomplete results. */
  partial?: boolean;
  /** Source file inventory, sorted by path ascending. */
  files: CodeFile[];
  /** Extracted symbol definitions, sorted by (file, start_line, name). */
  symbols: Symbol[];
  /** Cross-file references, sorted by (from_file, from_line, to_file). */
  references: Reference[];
  /** Module dependency graph. */
  module_graph: ModuleGraph;
  /** Architectural dependency edges, sorted by (from_module, to_module). */
  architecture_edges: ArchitectureEdge[];
  /** Topological dependency tiers and entry points. */
  dependency_flow: DependencyFlow;
}

// ---------------------------------------------------------------------------
// Mapper stub
// ---------------------------------------------------------------------------

/**
 * Deserialises and type-narrows the raw code cartography section received
 * from the Python core response envelope.
 *
 * TODO: Implement validation, ordering verification, and type narrowing.
 *       For now this is a pass-through stub that asserts the raw object
 *       matches the expected shape.
 *
 * @param raw - Raw object from the Python core response result field.
 * @returns Typed CodeCartographySection.
 */
export function mapCodeCartography(raw: unknown): CodeCartographySection {
  // TODO: implement full validation and normalisation
  // Stub: cast with minimal shape check
  if (raw === null || typeof raw !== 'object') {
    throw new Error('mapCodeCartography: raw input is not an object');
  }
  return raw as CodeCartographySection;
}
