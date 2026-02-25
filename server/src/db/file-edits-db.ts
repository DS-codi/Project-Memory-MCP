/**
 * file-edits-db.ts
 *
 * CRUD for the `step_file_edits` table.
 *
 * Records file-level changes made during step execution so that plans have
 * a traceable history of which files were touched, and by which agent/session.
 */

import type { FileEditRow } from './types.js';
import { queryAll, run, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FileChangeType = 'create' | 'edit' | 'delete' | 'rename';

export interface RecordFileEditOptions {
  previousPath?: string;
  agentType?:    string;
  sessionId?:    string;
  notes?:        string;
  editedAt?:     string;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Record a single file edit event for a step.
 *
 * @param workspaceId  Workspace the plan belongs to
 * @param planId       Plan ID
 * @param stepId       Step ID (null if not tied to a specific step)
 * @param filePath     Path of the affected file (workspace-relative recommended)
 * @param changeType   'create' | 'edit' | 'delete' | 'rename'
 * @param opts         Optional supplementary metadata
 * @returns            The auto-generated row id
 */
export function recordFileEdit(
  workspaceId: string,
  planId:      string,
  stepId:      string | null,
  filePath:    string,
  changeType:  FileChangeType,
  opts:        RecordFileEditOptions = {}
): number {
  const editedAt = opts.editedAt ?? nowIso();

  const result = run(
    `INSERT INTO step_file_edits
       (workspace_id, plan_id, step_id, file_path, change_type,
        previous_path, edited_at, agent_type, session_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      workspaceId,
      planId,
      stepId       ?? null,
      filePath,
      changeType,
      opts.previousPath ?? null,
      editedAt,
      opts.agentType   ?? null,
      opts.sessionId   ?? null,
      opts.notes       ?? null,
    ]
  );

  // better-sqlite3 run() returns a RunResult with lastInsertRowid
  return (result as unknown as { lastInsertRowid: number }).lastInsertRowid;
}

/**
 * Record multiple file edits in a single call (convenience wrapper).
 */
export function recordFileEdits(
  workspaceId: string,
  planId:      string,
  stepId:      string | null,
  edits:       Array<{ filePath: string; changeType: FileChangeType } & RecordFileEditOptions>
): void {
  for (const edit of edits) {
    const { filePath, changeType, ...opts } = edit;
    recordFileEdit(workspaceId, planId, stepId, filePath, changeType, opts);
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Full edit history for a file path within a workspace, sorted oldest-first.
 */
export function getFileEditHistory(workspaceId: string, filePath: string): FileEditRow[] {
  return queryAll<FileEditRow>(
    `SELECT * FROM step_file_edits
     WHERE workspace_id = ? AND file_path = ?
     ORDER BY edited_at ASC`,
    [workspaceId, filePath]
  );
}

/**
 * All edits recorded for a specific step.
 */
export function getStepFileEdits(stepId: string): FileEditRow[] {
  return queryAll<FileEditRow>(
    `SELECT * FROM step_file_edits
     WHERE step_id = ?
     ORDER BY edited_at ASC`,
    [stepId]
  );
}

/**
 * All edits recorded under a plan (across all steps), sorted oldest-first.
 */
export function getPlanFileEdits(planId: string): FileEditRow[] {
  return queryAll<FileEditRow>(
    `SELECT * FROM step_file_edits
     WHERE plan_id = ?
     ORDER BY edited_at ASC`,
    [planId]
  );
}

/**
 * Fuzzy file path search within a workspace using SQL LIKE pattern.
 *
 * Caller should supply SQL LIKE wildcards: e.g. `'%auth%'` or `'src/%.ts'`.
 */
export function searchFileEdits(workspaceId: string, likePattern: string): FileEditRow[] {
  return queryAll<FileEditRow>(
    `SELECT * FROM step_file_edits
     WHERE workspace_id = ? AND file_path LIKE ?
     ORDER BY edited_at DESC`,
    [workspaceId, likePattern]
  );
}

/**
 * Returns the distinct set of file paths that were edited within a plan.
 */
export function getEditedFilesForPlan(planId: string): string[] {
  const rows = queryAll<{ file_path: string }>(
    `SELECT DISTINCT file_path FROM step_file_edits WHERE plan_id = ? ORDER BY file_path`,
    [planId]
  );
  return rows.map(r => r.file_path);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Remove all file-edit records for a plan (e.g. when wiping migrated data).
 */
export function deletePlanFileEdits(planId: string): void {
  run('DELETE FROM step_file_edits WHERE plan_id = ?', [planId]);
}
