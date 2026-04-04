/**
 * User Sessions CRUD — workspace-agnostic user-defined session records.
 *
 * Each record captures a named working context: directories, commands,
 * freetext notes, and optional links to live agent session IDs.
 */

import { queryOne, queryAll, run, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserSession {
  id: string;
  name: string;
  working_dirs: string[];
  commands: string[];
  notes: string;
  linked_agent_session_ids: string[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

/** Raw DB row shape (JSON columns stored as TEXT, pinned as INTEGER). */
interface UserSessionRow {
  id: string;
  name: string;
  working_dirs: string;
  commands: string;
  notes: string;
  linked_agent_session_ids: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToSession(row: UserSessionRow): UserSession {
  return {
    id: row.id,
    name: row.name,
    working_dirs: parseJsonArray(row.working_dirs),
    commands: parseJsonArray(row.commands),
    notes: row.notes ?? '',
    linked_agent_session_ids: parseJsonArray(row.linked_agent_session_ids),
    pinned: row.pinned === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function listUserSessions(): UserSession[] {
  const rows = queryAll<UserSessionRow>(
    'SELECT * FROM user_sessions ORDER BY pinned DESC, updated_at DESC'
  );
  return rows.map(rowToSession);
}

export function getUserSession(id: string): UserSession | null {
  const row = queryOne<UserSessionRow>(
    'SELECT * FROM user_sessions WHERE id = ?',
    [id]
  );
  return row ? rowToSession(row) : null;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export function createUserSession(
  data: Omit<UserSession, 'id' | 'created_at' | 'updated_at'>
): UserSession {
  const id = newId();
  const now = nowIso();
  run(
    `INSERT INTO user_sessions
      (id, name, working_dirs, commands, notes, linked_agent_session_ids, pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.name,
      JSON.stringify(data.working_dirs ?? []),
      JSON.stringify(data.commands ?? []),
      data.notes ?? '',
      JSON.stringify(data.linked_agent_session_ids ?? []),
      data.pinned ? 1 : 0,
      now,
      now,
    ]
  );
  return getUserSession(id)!;
}

export function updateUserSession(
  id: string,
  data: Partial<Omit<UserSession, 'id' | 'created_at'>>
): UserSession | null {
  const existing = getUserSession(id);
  if (!existing) return null;

  const now = nowIso();
  const merged = {
    name: data.name ?? existing.name,
    working_dirs: data.working_dirs ?? existing.working_dirs,
    commands: data.commands ?? existing.commands,
    notes: data.notes !== undefined ? data.notes : existing.notes,
    linked_agent_session_ids: data.linked_agent_session_ids ?? existing.linked_agent_session_ids,
    pinned: data.pinned !== undefined ? data.pinned : existing.pinned,
  };

  run(
    `UPDATE user_sessions
     SET name = ?, working_dirs = ?, commands = ?, notes = ?,
         linked_agent_session_ids = ?, pinned = ?, updated_at = ?
     WHERE id = ?`,
    [
      merged.name,
      JSON.stringify(merged.working_dirs),
      JSON.stringify(merged.commands),
      merged.notes,
      JSON.stringify(merged.linked_agent_session_ids),
      merged.pinned ? 1 : 0,
      now,
      id,
    ]
  );
  return getUserSession(id);
}

export function deleteUserSession(id: string): boolean {
  const result = run('DELETE FROM user_sessions WHERE id = ?', [id]);
  return result.changes > 0;
}
