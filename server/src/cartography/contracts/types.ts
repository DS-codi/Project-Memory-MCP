/**
 * types.ts
 *
 * Canonical TypeScript types for the memory_cartographer output envelope.
 *
 * These types mirror the JSON schema defined in:
 *   docs/contracts/memory-cartographer.schema.json
 *
 * Ownership: TypeScript server (adapter layer) — these types are used to
 * deserialise, validate, and forward the output produced by the Python core.
 * The Python core is the schema producer and schema_version authority.
 *
 * See: docs/contracts/memory-cartographer-contract.md
 *      docs/architecture/memory-cartographer/implementation-boundary.md
 *      docs/architecture/memory-cartographer/compatibility-matrix.md
 */

// ---------------------------------------------------------------------------
// WorkspaceIdentity
// ---------------------------------------------------------------------------

/**
 * Provenance descriptor for the workspace that was scanned.
 * Produced by the Python core; used by the TypeScript adapter for cache
 * invalidation and workspace correlation.
 */
export interface WorkspaceIdentity {
  /**
   * Absolute path to the workspace root as seen by the Python core process.
   */
  path: string;

  /**
   * Display name for the workspace. Derived from the directory name when
   * no explicit name is configured.
   */
  name: string;

  /**
   * Deterministic SHA-256 hex fingerprint of the scanned file tree.
   * Computed from sorted workspace-relative paths + mtime_unix_ns values,
   * applied after scope filtering. Used to detect workspace staleness.
   * See docs/contracts/memory-cartographer-contract.md#fingerprint-computation
   */
  fingerprint: string;
}

// ---------------------------------------------------------------------------
// GenerationMetadata
// ---------------------------------------------------------------------------

/**
 * Provenance and performance data for the scan run that produced this envelope.
 */
export interface GenerationMetadata {
  /**
   * ISO 8601 UTC timestamp when the scan started.
   * Example: "2026-03-04T11:00:00.000Z"
   */
  timestamp: string;

  /**
   * Wall-clock duration of the scan in milliseconds, as measured by the
   * Python core.
   */
  duration_ms: number;

  /**
   * Semver version of the Python core (memory_cartographer) that produced
   * this output. Example: "0.1.0"
   */
  cartographer_version: string;

  /**
   * true if the result is a partial scan; false for a complete scan.
   * When true, the diagnostics array will contain at least one entry
   * explaining what was skipped or truncated.
   */
  partial: boolean;

  /**
   * Echoed from the runtime request envelope for correlation.
   */
  request_id: string;
}

// ---------------------------------------------------------------------------
// DiagnosticEntry
// ---------------------------------------------------------------------------

/**
 * Severity level for a diagnostic entry.
 * - error: scan failure or hard constraint violation
 * - warning: degraded coverage (scan continued but some data is missing)
 * - info: informational notice (no data loss)
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * A single structured diagnostic entry in the envelope.
 * The code taxonomy is defined in docs/contracts/normalization-rules.md.
 */
export interface DiagnosticEntry {
  /**
   * Machine-readable diagnostic code.
   * Example values: "SCAN_TIMEOUT", "FILE_READ_ERROR", "SECRETS_REDACTED"
   * See normalization-rules.md for the full taxonomy.
   */
  code: string;

  /**
   * Severity of this diagnostic entry.
   */
  severity: DiagnosticSeverity;

  /**
   * Human-readable explanation of the diagnostic.
   */
  message: string;

  /**
   * Workspace-relative file or directory path associated with this
   * diagnostic, when applicable. Absent when not path-specific.
   */
  path?: string;
}

// ---------------------------------------------------------------------------
// Section placeholder types
// (Refined by codeMapper.ts and databaseMapper.ts in their respective steps)
// ---------------------------------------------------------------------------

/**
 * Placeholder for the code cartography section type.
 * Replaced by CodeCartographySection from server/src/cartography/mappers/codeMapper.ts
 * once that step is complete.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CodeCartographySection {}

/**
 * Placeholder for the database cartography section type.
 * Replaced by DatabaseCartographySection from server/src/cartography/mappers/databaseMapper.ts
 * once that step is complete.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DatabaseCartographySection {}

// ---------------------------------------------------------------------------
// CartographyEnvelope — canonical top-level type
// ---------------------------------------------------------------------------

/**
 * Canonical output envelope produced by the memory_cartographer Python core.
 *
 * Every response from the Python core (code scan, database scan, or both) is
 * wrapped in this envelope. The TypeScript adapter reads, validates, and
 * forwards this shape to MCP callers.
 *
 * Nullability rules:
 * - All required fields are always present and never null.
 * - code_cartography and database_cartography are absent (undefined) when not
 *   requested — they are never null. See normalization-rules.md.
 * - diagnostics is always present as an array (may be empty).
 *
 * Schema version authority: Python core declares schema_version; the
 * TypeScript adapter validates it but must not mutate it.
 */
export interface CartographyEnvelope {
  /**
   * Semantic version of the output schema produced by Python core.
   * Format: "MAJOR.MINOR.PATCH". Validated by the TypeScript adapter against
   * the supported range defined in version.ts.
   */
  schema_version: string;

  /**
   * Provenance descriptor for the scanned workspace.
   */
  workspace_identity: WorkspaceIdentity;

  /**
   * Provenance and performance data for this scan run.
   */
  generation_metadata: GenerationMetadata;

  /**
   * Structured diagnostic entries. Always present; may be an empty array.
   */
  diagnostics: DiagnosticEntry[];

  /**
   * Code scanning output. Present only when a code scan was requested and
   * at least partially completed. Absent (undefined, not null) when not
   * requested or when the code scan failed fatally.
   */
  code_cartography?: CodeCartographySection;

  /**
   * Database scanning output. Present only when a database scan was
   * requested and at least partially completed. Absent (undefined, not null)
   * when not requested or when the database scan failed fatally.
   */
  database_cartography?: DatabaseCartographySection;
}
