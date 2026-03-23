/**
 * DB Reference Types — Discriminated artifact references.
 *
 * Defines the canonical contract for referencing artifacts that live in the
 * SQLite database vs. artifacts that exist as real files on the filesystem.
 *
 * ## Serialization rules
 *
 * - **MCP tool responses**: `DbRef` is returned as a flat JSON object via
 *   `toMcpRef()`. It is NEVER serialized as a filesystem path string.
 *   Consumers must check `ref_type` to distinguish DB-backed from file-backed.
 *
 * - **Dashboard API**: `DbRef` can be serialized differently if the dashboard
 *   needs a different wire format (future step — not in scope here).
 *
 * - **Legacy migration**: Existing path consumers will receive a compatibility
 *   wrapper that translates `DbRef` to a synthetic path string during the
 *   transition period (Phase 11). New code must never rely on path strings
 *   for DB-backed artifacts.
 */

import { z } from 'zod';

// =============================================================================
// Artifact Kind Enums
// =============================================================================

/**
 * DB-backed artifact kinds — things stored in SQLite tables.
 *
 * Each value maps 1:1 to a logical artifact family in the database.
 * The table name is NOT encoded here (use `DbRef.table` for that).
 */
export type DbArtifactKind =
  | 'plan'
  | 'context'
  | 'handoff'
  | 'knowledge'
  | 'workspace'
  | 'session'
  | 'skill'
  | 'instruction'
  | 'event';

/**
 * Filesystem artifact kinds — things that exist as real files on disk.
 *
 * These are never stored in the DB; the `FileRef.path` points to an actual
 * file that tools can read/write directly.
 */
export type FileArtifactKind =
  | 'agent_file'
  | 'terminal_allowlist'
  | 'investigation_file'
  | 'config_file';

// =============================================================================
// Reference Interfaces
// =============================================================================

/**
 * Reference to a DB-backed artifact (never a filesystem path).
 *
 * Consumers must use the `database`, `table`, and `row_id` fields to
 * locate the artifact through the storage layer — not by constructing
 * a filesystem path.
 */
export interface DbRef {
  /** Discriminator — always `'db'` for database-backed artifacts. */
  ref_type: 'db';

  /** SQLite database name, e.g. `'project_memory'`. */
  database: string;

  /**
   * Table (or logical collection) that holds the row.
   * Examples: `'plans'`, `'context_items'`, `'handoffs'`, `'knowledge'`.
   */
  table: string;

  /** Primary key of the row, e.g. `'plan_mn3fvcwa_3ef5960b'`. */
  row_id: string;

  /** Optional — restrict reference to a specific column within the row. */
  column?: string;

  /** Semantic discriminator for the type of artifact. */
  artifact_kind: DbArtifactKind;

  /** Human-readable label for agent logs and display surfaces. */
  display_name: string;
}

/**
 * Reference to a real filesystem artifact.
 *
 * The `path` field is guaranteed to point to a file that exists (or should
 * exist) on the local filesystem. Tools can read/write it directly.
 */
export interface FileRef {
  /** Discriminator — always `'file'` for filesystem-backed artifacts. */
  ref_type: 'file';

  /** Absolute or workspace-relative filesystem path (guaranteed to exist). */
  path: string;

  /** Semantic discriminator for the type of artifact. */
  artifact_kind: FileArtifactKind;

  /** Human-readable label for agent logs and display surfaces. */
  display_name: string;
}

/**
 * Discriminated union — either a DB-backed artifact or a real filesystem
 * artifact. Check `ref.ref_type` to narrow.
 */
export type ArtifactRef = DbRef | FileRef;

// =============================================================================
// Type Guards
// =============================================================================

/** Narrow an `ArtifactRef` to `DbRef`. */
export function isDbRef(ref: ArtifactRef): ref is DbRef {
  return ref.ref_type === 'db';
}

/** Narrow an `ArtifactRef` to `FileRef`. */
export function isFileRef(ref: ArtifactRef): ref is FileRef {
  return ref.ref_type === 'file';
}

// =============================================================================
// Serialization Helpers
// =============================================================================

/**
 * Serialize an `ArtifactRef` for MCP tool responses.
 *
 * Returns a plain JSON-safe object suitable for inclusion in MCP `content`
 * blocks. `DbRef` is serialized as a flat object — never as a path string.
 */
export function toMcpRef(ref: ArtifactRef): Record<string, unknown> {
  if (isDbRef(ref)) {
    const obj: Record<string, unknown> = {
      ref_type: ref.ref_type,
      database: ref.database,
      table: ref.table,
      row_id: ref.row_id,
      artifact_kind: ref.artifact_kind,
      display_name: ref.display_name,
    };
    if (ref.column !== undefined) {
      obj.column = ref.column;
    }
    return obj;
  }
  return {
    ref_type: ref.ref_type,
    path: ref.path,
    artifact_kind: ref.artifact_kind,
    display_name: ref.display_name,
  };
}

/**
 * Human-readable string for agent logs and display surfaces.
 *
 * - DbRef:  `"[db:plans/plan_abc123] My Plan Title"`
 * - FileRef: `"[file:agent_file] /path/to/agent.md"`
 */
export function toDisplayString(ref: ArtifactRef): string {
  if (isDbRef(ref)) {
    return `[db:${ref.table}/${ref.row_id}] ${ref.display_name}`;
  }
  return `[file:${ref.artifact_kind}] ${ref.path}`;
}

// =============================================================================
// Zod Schemas — Runtime Validation
// =============================================================================

export const DbArtifactKindSchema = z.enum([
  'plan',
  'context',
  'handoff',
  'knowledge',
  'workspace',
  'session',
  'skill',
  'instruction',
  'event',
]);

export const FileArtifactKindSchema = z.enum([
  'agent_file',
  'terminal_allowlist',
  'investigation_file',
  'config_file',
]);

export const DbRefSchema = z.object({
  ref_type: z.literal('db'),
  database: z.string().min(1),
  table: z.string().min(1),
  row_id: z.string().min(1),
  column: z.string().min(1).optional(),
  artifact_kind: DbArtifactKindSchema,
  display_name: z.string(),
});

export const FileRefSchema = z.object({
  ref_type: z.literal('file'),
  path: z.string().min(1),
  artifact_kind: FileArtifactKindSchema,
  display_name: z.string(),
});

export const ArtifactRefSchema = z.discriminatedUnion('ref_type', [
  DbRefSchema,
  FileRefSchema,
]);

// =============================================================================
// Factory Helpers
// =============================================================================

const DB_NAME = 'project_memory';

/**
 * Create a `DbRef` for a DB-backed artifact.
 *
 * Usage:
 * ```ts
 * const ref = makeDbRef('plans', planId, 'plan', plan.title);
 * ```
 */
export function makeDbRef(
  table: string,
  rowId: string,
  artifactKind: DbArtifactKind,
  displayName: string,
  column?: string,
): DbRef {
  return {
    ref_type: 'db',
    database: DB_NAME,
    table,
    row_id: rowId,
    artifact_kind: artifactKind,
    display_name: displayName,
    ...(column !== undefined ? { column } : {}),
  };
}

/**
 * Create a `FileRef` for a filesystem-backed artifact.
 */
export function makeFileRef(
  filePath: string,
  artifactKind: FileArtifactKind,
  displayName: string,
): FileRef {
  return {
    ref_type: 'file',
    path: filePath,
    artifact_kind: artifactKind,
    display_name: displayName,
  };
}
