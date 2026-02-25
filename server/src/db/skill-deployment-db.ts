/**
 * Skill deployment tracking storage.
 *
 * Tracks which skills (from skill_definitions) are deployed into each
 * workspace, along with their content hash and sync status.
 */

import type { SkillDeploymentRow } from './types.js';
import { queryOne, queryAll, run, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SkillSyncStatus = 'synced' | 'outdated' | 'customized' | 'missing';

export interface UpsertSkillDeploymentInput {
  deployedPath:  string;
  versionHash:   string;
  isCustomized:  boolean;
  syncStatus:    SkillSyncStatus;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Insert or update a deployment record for (workspaceId, skillName).
 */
export function upsertSkillDeployment(
  workspaceId: string,
  skillName:   string,
  data:        UpsertSkillDeploymentInput
): void {
  const now      = nowIso();
  const existing = getSkillDeployment(workspaceId, skillName);

  if (existing) {
    run(
      `UPDATE skill_deployments
          SET deployed_path = ?, version_hash = ?, is_customized = ?,
              sync_status = ?, last_updated = ?
        WHERE workspace_id = ? AND skill_name = ?`,
      [
        data.deployedPath,
        data.versionHash,
        data.isCustomized ? 1 : 0,
        data.syncStatus,
        now,
        workspaceId,
        skillName,
      ]
    );
  } else {
    run(
      `INSERT INTO skill_deployments
         (id, workspace_id, skill_name, deployed_path, version_hash,
          is_customized, sync_status, deployed_at, last_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        workspaceId,
        skillName,
        data.deployedPath,
        data.versionHash,
        data.isCustomized ? 1 : 0,
        data.syncStatus,
        now,
        now,
      ]
    );
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getSkillDeployment(
  workspaceId: string,
  skillName:   string
): SkillDeploymentRow | null {
  return queryOne<SkillDeploymentRow>(
    'SELECT * FROM skill_deployments WHERE workspace_id = ? AND skill_name = ?',
    [workspaceId, skillName]
  ) ?? null;
}

export function listSkillDeploymentsByWorkspace(
  workspaceId: string
): SkillDeploymentRow[] {
  return queryAll<SkillDeploymentRow>(
    'SELECT * FROM skill_deployments WHERE workspace_id = ? ORDER BY skill_name',
    [workspaceId]
  );
}

export function listSkillDeploymentsBySkill(
  skillName: string
): SkillDeploymentRow[] {
  return queryAll<SkillDeploymentRow>(
    'SELECT * FROM skill_deployments WHERE skill_name = ? ORDER BY workspace_id',
    [skillName]
  );
}

export function listAllSkillDeployments(): SkillDeploymentRow[] {
  return queryAll<SkillDeploymentRow>(
    'SELECT * FROM skill_deployments ORDER BY workspace_id, skill_name'
  );
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deleteSkillDeployment(
  workspaceId: string,
  skillName:   string
): void {
  run(
    'DELETE FROM skill_deployments WHERE workspace_id = ? AND skill_name = ?',
    [workspaceId, skillName]
  );
}

export function deleteSkillDeploymentsByWorkspace(workspaceId: string): void {
  run('DELETE FROM skill_deployments WHERE workspace_id = ?', [workspaceId]);
}
