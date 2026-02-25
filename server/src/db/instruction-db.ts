/**
 * Instruction file storage with glob-matched retrieval.
 */

import type { InstructionFileRow } from './types.js';
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
