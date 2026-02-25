/**
 * Update log — replaces workspace.context.json update_log array.
 */

import type { UpdateLogRow } from './types.js';
import { queryAll, run, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export function addUpdateLog(
  workspaceId: string,
  action:      string,
  data?:       object | null
): void {
  run(
    `INSERT INTO update_log (workspace_id, timestamp, action, data)
     VALUES (?, ?, ?, ?)`,
    [workspaceId, nowIso(), action, data ? JSON.stringify(data) : null]
  );
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getUpdateLog(
  workspaceId: string,
  limit  = 100,
  offset = 0
): UpdateLogRow[] {
  return queryAll<UpdateLogRow>(
    `SELECT * FROM update_log WHERE workspace_id = ?
     ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    [workspaceId, limit, offset]
  );
}

export function getUpdateLogSince(workspaceId: string, since: string): UpdateLogRow[] {
  return queryAll<UpdateLogRow>(
    `SELECT * FROM update_log WHERE workspace_id = ? AND timestamp >= ?
     ORDER BY timestamp`,
    [workspaceId, since]
  );
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/** Remove log entries older than `maxDays` days (default: 90). */
export function cleanupUpdateLog(workspaceId: string, maxDays = 90): number {
  const cutoff = new Date(Date.now() - maxDays * 86_400_000)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, '');
  const result = run(
    'DELETE FROM update_log WHERE workspace_id = ? AND timestamp < ?',
    [workspaceId, cutoff]
  );
  return result.changes;
}
