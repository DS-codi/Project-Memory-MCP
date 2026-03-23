/**
 * Dashboard-local DbRef types — mirrors the canonical definitions from
 * `server/src/types/db-ref.types.ts` for use in dashboard REST API responses.
 *
 * The dashboard server is a separate TypeScript project and cannot import
 * from the MCP server source directly.  These types are intentionally kept
 * minimal (no Zod, no factory helpers) since the dashboard only serializes
 * refs, never validates inbound ones.
 *
 * Phase 11 — added as part of the Dashboard & Scanner Contracts migration.
 */

// =============================================================================
// Artifact Kind Enums
// =============================================================================

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

export type FileArtifactKind =
  | 'agent_file'
  | 'terminal_allowlist'
  | 'investigation_file'
  | 'config_file';

// =============================================================================
// Reference Interfaces
// =============================================================================

export interface DbRef {
  ref_type: 'db';
  database: string;
  table: string;
  row_id: string;
  column?: string;
  artifact_kind: DbArtifactKind;
  display_name: string;
}

export interface FileRef {
  ref_type: 'file';
  path: string;
  artifact_kind: FileArtifactKind;
  display_name: string;
}

export type ArtifactRef = DbRef | FileRef;

// =============================================================================
// Factory Helper
// =============================================================================

const DB_NAME = 'project_memory';

export function makeDbRef(
  table: string,
  rowId: string,
  artifactKind: DbArtifactKind,
  displayName: string,
): DbRef {
  return {
    ref_type: 'db',
    database: DB_NAME,
    table,
    row_id: rowId,
    artifact_kind: artifactKind,
    display_name: displayName,
  };
}
