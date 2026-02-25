/**
 * Workspace CRUD operations.
 */

import type { WorkspaceRow } from './types.js';
import { queryOne, queryAll, run, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateWorkspaceData {
  id?:                  string;
  path:                 string;
  name:                 string;
  parent_workspace_id?: string | null;
  profile?:             object | null;
  meta?:                object | null;
}

export function createWorkspace(data: CreateWorkspaceData): WorkspaceRow {
  const id  = data.id ?? newId();
  const now = nowIso();
  run(
    `INSERT INTO workspaces (id, path, name, parent_workspace_id, profile, meta, registered_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.path,
      data.name,
      data.parent_workspace_id ?? null,
      data.profile ? JSON.stringify(data.profile) : null,
      data.meta    ? JSON.stringify(data.meta)    : null,
      now,
      now,
    ]
  );
  return getWorkspace(id)!;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getWorkspace(id: string): WorkspaceRow | null {
  return queryOne<WorkspaceRow>('SELECT * FROM workspaces WHERE id = ?', [id]) ?? null;
}

export function getWorkspaceByPath(path: string): WorkspaceRow | null {
  return queryOne<WorkspaceRow>('SELECT * FROM workspaces WHERE path = ?', [path]) ?? null;
}

export function listWorkspaces(): WorkspaceRow[] {
  return queryAll<WorkspaceRow>('SELECT * FROM workspaces ORDER BY registered_at DESC');
}

export function listChildWorkspaces(parentId: string): WorkspaceRow[] {
  return queryAll<WorkspaceRow>(
    'SELECT * FROM workspaces WHERE parent_workspace_id = ? ORDER BY name',
    [parentId]
  );
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export interface UpdateWorkspaceData {
  name?:                string;
  parent_workspace_id?: string | null;
  profile?:             object | null;
  meta?:                object | null;
}

export function updateWorkspace(id: string, data: UpdateWorkspaceData): void {
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [nowIso()];

  if (data.name !== undefined) {
    fields.push('name = ?');
    values.push(data.name);
  }
  if ('parent_workspace_id' in data) {
    fields.push('parent_workspace_id = ?');
    values.push(data.parent_workspace_id ?? null);
  }
  if ('profile' in data) {
    fields.push('profile = ?');
    values.push(data.profile ? JSON.stringify(data.profile) : null);
  }
  if ('meta' in data) {
    fields.push('meta = ?');
    values.push(data.meta ? JSON.stringify(data.meta) : null);
  }

  values.push(id);
  run(`UPDATE workspaces SET ${fields.join(', ')} WHERE id = ?`, values);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deleteWorkspace(id: string): void {
  run('DELETE FROM workspaces WHERE id = ?', [id]);
}
