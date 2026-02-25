/**
 * Build script CRUD.
 */

import type { BuildScriptRow } from './types.js';
import { queryOne, queryAll, run, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface AddBuildScriptData {
  name:         string;
  description?: string | null;
  command:      string;
  directory:    string;
  mcp_handle?:  string | null;
  plan_id?:     string | null;
}

export function addBuildScript(
  workspaceId: string,
  data:        AddBuildScriptData
): BuildScriptRow {
  const id  = newId();
  const now = nowIso();
  run(
    `INSERT INTO build_scripts
      (id, workspace_id, plan_id, name, description, command, directory, mcp_handle, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      data.plan_id    ?? null,
      data.name,
      data.description ?? null,
      data.command,
      data.directory,
      data.mcp_handle ?? null,
      now,
    ]
  );
  return findBuildScript(workspaceId, id)!;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getBuildScripts(workspaceId: string, planId?: string | null): BuildScriptRow[] {
  if (planId) {
    return queryAll<BuildScriptRow>(
      'SELECT * FROM build_scripts WHERE workspace_id = ? AND (plan_id = ? OR plan_id IS NULL) ORDER BY created_at',
      [workspaceId, planId]
    );
  }
  return queryAll<BuildScriptRow>(
    'SELECT * FROM build_scripts WHERE workspace_id = ? ORDER BY created_at',
    [workspaceId]
  );
}

export function findBuildScript(
  workspaceId: string,
  scriptId:    string,
  planId?:     string | null
): BuildScriptRow | null {
  if (planId !== undefined) {
    return queryOne<BuildScriptRow>(
      'SELECT * FROM build_scripts WHERE workspace_id = ? AND id = ? AND (plan_id = ? OR plan_id IS NULL)',
      [workspaceId, scriptId, planId]
    ) ?? null;
  }
  return queryOne<BuildScriptRow>(
    'SELECT * FROM build_scripts WHERE workspace_id = ? AND id = ?',
    [workspaceId, scriptId]
  ) ?? null;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deleteBuildScript(workspaceId: string, scriptId: string): void {
  run('DELETE FROM build_scripts WHERE workspace_id = ? AND id = ?', [workspaceId, scriptId]);
}
