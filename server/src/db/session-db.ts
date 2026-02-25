/**
 * Session CRUD operations.
 */

import type { SessionRow } from './types.js';
import { queryOne, queryAll, run, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateSessionData {
  id?:         string;
  agent_type:  string;
  context?:    object | null;
}

export function createSession(planId: string, data: CreateSessionData): SessionRow {
  const id  = data.id ?? newId();
  const now = nowIso();
  run(
    `INSERT INTO sessions (id, plan_id, agent_type, started_at, context)
     VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      planId,
      data.agent_type,
      now,
      data.context ? JSON.stringify(data.context) : null,
    ]
  );
  return getSession(id)!;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getSession(id: string): SessionRow | null {
  return queryOne<SessionRow>('SELECT * FROM sessions WHERE id = ?', [id]) ?? null;
}

export function getSessions(planId: string): SessionRow[] {
  return queryAll<SessionRow>(
    'SELECT * FROM sessions WHERE plan_id = ? ORDER BY started_at DESC',
    [planId]
  );
}

export function getOrphanedSessions(planId: string): SessionRow[] {
  return queryAll<SessionRow>(
    'SELECT * FROM sessions WHERE plan_id = ? AND is_orphaned = 1 ORDER BY started_at DESC',
    [planId]
  );
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export function completeSession(
  id:        string,
  summary:   string,
  artifacts: string[] = []
): void {
  run(
    `UPDATE sessions
     SET completed_at = ?, summary = ?, artifacts = ?, is_orphaned = 0
     WHERE id = ?`,
    [nowIso(), summary, JSON.stringify(artifacts), id]
  );
}

export function markSessionOrphaned(id: string): void {
  run('UPDATE sessions SET is_orphaned = 1 WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deleteSession(id: string): void {
  run('DELETE FROM sessions WHERE id = ?', [id]);
}
