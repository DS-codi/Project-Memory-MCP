/**
 * Instruction file storage with glob-matched retrieval.
 */

import type { InstructionFileRow, WorkspaceInstructionAssignmentRow } from './types.js';
import { queryOne, queryAll, run, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export function storeInstruction(
  filename:  string,
  appliesTo: string,
  content:   string
): void {
  const now = nowIso();
  const existing = getInstruction(filename);

  if (existing) {
    run(
      'UPDATE instruction_files SET applies_to = ?, content = ?, updated_at = ? WHERE id = ?',
      [appliesTo, content, now, existing.id]
    );
  } else {
    run(
      `INSERT INTO instruction_files (id, filename, applies_to, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId(), filename, appliesTo, content, now, now]
    );
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getInstruction(filename: string): InstructionFileRow | null {
  return queryOne<InstructionFileRow>(
    'SELECT * FROM instruction_files WHERE filename = ?',
    [filename]
  ) ?? null;
}

export function listInstructions(): InstructionFileRow[] {
  return queryAll<InstructionFileRow>(
    'SELECT * FROM instruction_files ORDER BY filename'
  );
}

/**
 * Return instruction files whose `applies_to` pattern matches `filepath`.
 *
 * Supports simple glob patterns:
 *   - `**\/*` — matches any file
 *   - `agents/foo.md` — exact match
 *   - `agents/*` — matches anything under agents/
 *
 * This is a best-effort in-DB filter.  The caller should further filter
 * with a proper minimatch library if precision is required.
 */
export function getInstructionsForFile(filepath: string): InstructionFileRow[] {
  const all = listInstructions();

  return all.filter(row => {
    const pattern = row.applies_to;
    if (pattern === '**/*' || pattern === '**') return true;
    if (pattern === filepath) return true;

    // Convert glob to a basic regex: * → [^/]*, ** → .*
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // escape special chars
      .replace(/\\\*\\\*/g, '.*')              // ** → .*
      .replace(/\*/g, '[^/]*');               // * → [^/]*

    try {
      return new RegExp(`^${regexStr}$`).test(filepath);
    } catch {
      return false;
    }
  });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deleteInstruction(filename: string): void {
  run('DELETE FROM instruction_files WHERE filename = ?', [filename]);
}

// ---------------------------------------------------------------------------
// Workspace assignments
// ---------------------------------------------------------------------------

/**
 * Assign an instruction file to a workspace so agents initialising in that
 * workspace automatically receive the instruction, regardless of applies_to
 * glob matching.
 */
export function assignInstructionToWorkspace(
  workspaceId: string,
  filename:    string,
  notes?:      string | null
): void {
  const existing = queryOne<WorkspaceInstructionAssignmentRow>(
    'SELECT id FROM workspace_instruction_assignments WHERE workspace_id = ? AND filename = ?',
    [workspaceId, filename]
  );
  if (existing) {
    // Update notes if already assigned
    if (notes !== undefined) {
      run(
        'UPDATE workspace_instruction_assignments SET notes = ? WHERE workspace_id = ? AND filename = ?',
        [notes ?? null, workspaceId, filename]
      );
    }
    return;
  }
  run(
    `INSERT INTO workspace_instruction_assignments (id, workspace_id, filename, notes, assigned_at)
     VALUES (?, ?, ?, ?, ?)`,
    [newId(), workspaceId, filename, notes ?? null, nowIso()]
  );
}

export function unassignInstructionFromWorkspace(workspaceId: string, filename: string): void {
  run(
    'DELETE FROM workspace_instruction_assignments WHERE workspace_id = ? AND filename = ?',
    [workspaceId, filename]
  );
}

export function listWorkspaceInstructionAssignments(
  workspaceId: string
): WorkspaceInstructionAssignmentRow[] {
  return queryAll<WorkspaceInstructionAssignmentRow>(
    'SELECT * FROM workspace_instruction_assignments WHERE workspace_id = ? ORDER BY filename',
    [workspaceId]
  );
}

/** Returns the full instruction content for all instructions assigned to a workspace. */
export function getWorkspaceInstructionsWithContent(
  workspaceId: string
): Array<InstructionFileRow & { assignment_notes: string | null }> {
  return queryAll<InstructionFileRow & { assignment_notes: string | null }>(
    `SELECT i.*, a.notes AS assignment_notes
       FROM instruction_files i
       JOIN workspace_instruction_assignments a ON i.filename = a.filename
      WHERE a.workspace_id = ?
      ORDER BY i.filename`,
    [workspaceId]
  );
}
