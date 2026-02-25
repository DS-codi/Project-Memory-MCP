/**
 * program-workspace-links-db.ts
 *
 * CRUD for the `program_workspace_links` table.
 *
 * A program normally "lives" in one workspace, but it can span multiple
 * workspaces once cross-workspace links are established here. Any child plan
 * that belongs to a linked workspace is considered part of the program.
 */

import type { ProgramWorkspaceLinkRow, ProgramRow } from './types.js';
import { queryOne, queryAll, run, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Link / Unlink
// ---------------------------------------------------------------------------

/**
 * Create a cross-workspace link between `programId` and `workspaceId`.
 * Idempotent — safe to call multiple times (INSERT OR IGNORE).
 */
export function linkWorkspace(
  programId:   string,
  workspaceId: string,
  linkedBy?:   string
): void {
  run(
    `INSERT OR IGNORE INTO program_workspace_links
       (program_id, workspace_id, linked_at, linked_by)
     VALUES (?, ?, ?, ?)`,
    [programId, workspaceId, nowIso(), linkedBy ?? null]
  );
}

/**
 * Remove the cross-workspace link between `programId` and `workspaceId`.
 * No-op if the link does not exist.
 */
export function unlinkWorkspace(programId: string, workspaceId: string): void {
  run(
    'DELETE FROM program_workspace_links WHERE program_id = ? AND workspace_id = ?',
    [programId, workspaceId]
  );
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Returns all workspace link rows for a program (sorted by linked_at ASC).
 */
export function getLinkedWorkspaces(programId: string): ProgramWorkspaceLinkRow[] {
  return queryAll<ProgramWorkspaceLinkRow>(
    `SELECT * FROM program_workspace_links
     WHERE program_id = ?
     ORDER BY linked_at ASC`,
    [programId]
  );
}

/**
 * Returns all programs that declared a cross-workspace link to `workspaceId`.
 * This includes programs whose "home" workspace differs from `workspaceId`.
 */
export function getProgramsLinkedToWorkspace(workspaceId: string): ProgramRow[] {
  return queryAll<ProgramRow>(
    `SELECT p.*
     FROM programs p
     INNER JOIN program_workspace_links pwl ON pwl.program_id = p.id
     WHERE pwl.workspace_id = ?
     ORDER BY p.created_at DESC`,
    [workspaceId]
  );
}

/**
 * Returns true when `planWorkspaceId` is either:
 *  • the program's own workspace, or
 *  • explicitly linked via `program_workspace_links`.
 *
 * Used as a guard in `addPlanToProgram()` to prevent accidental cross-workspace
 * plan additions when no link has been established.
 */
export function canAcceptPlanFromWorkspace(
  programId:        string,
  planWorkspaceId:  string
): boolean {
  // Check the program's home workspace first
  const program = queryOne<{ workspace_id: string }>(
    'SELECT workspace_id FROM programs WHERE id = ?',
    [programId]
  );
  if (!program) return false;
  if (program.workspace_id === planWorkspaceId) return true;

  // Check explicit cross-workspace link
  const link = queryOne<{ id: number }>(
    'SELECT id FROM program_workspace_links WHERE program_id = ? AND workspace_id = ?',
    [programId, planWorkspaceId]
  );
  return link !== null && link !== undefined;
}

/**
 * Ensure a workspace link exists. Creates it if absent (auto-link on first use).
 * Returns true if the link already existed, false if it was just created.
 */
export function ensureWorkspaceLink(
  programId:   string,
  workspaceId: string,
  linkedBy?:   string
): boolean {
  const existing = queryOne<{ id: number }>(
    'SELECT id FROM program_workspace_links WHERE program_id = ? AND workspace_id = ?',
    [programId, workspaceId]
  );
  if (existing) return true;
  linkWorkspace(programId, workspaceId, linkedBy);
  return false;
}
