/**
 * Instruction file deployment tracking storage.
 *
 * Tracks which instruction files (from instruction_files) are deployed
 * into each workspace, along with their content hash and sync status.
 */

import type { InstructionDeploymentRow } from './types.js';
import { queryOne, queryAll, run, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InstructionSyncStatus = 'synced' | 'outdated' | 'customized' | 'missing';

export interface UpsertInstructionDeploymentInput {
  deployedPath:  string;
  versionHash:   string;
  isCustomized:  boolean;
  syncStatus:    InstructionSyncStatus;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Insert or update a deployment record for (workspaceId, filename).
 */
export function upsertInstructionDeployment(
  workspaceId: string,
  filename:    string,
  data:        UpsertInstructionDeploymentInput
): void {
  const now      = nowIso();
  const existing = getInstructionDeployment(workspaceId, filename);

  if (existing) {
    run(
      `UPDATE instruction_deployments
          SET deployed_path = ?, version_hash = ?, is_customized = ?,
              sync_status = ?, last_updated = ?
        WHERE workspace_id = ? AND filename = ?`,
      [
        data.deployedPath,
        data.versionHash,
        data.isCustomized ? 1 : 0,
        data.syncStatus,
        now,
        workspaceId,
        filename,
      ]
    );
  } else {
    run(
      `INSERT INTO instruction_deployments
         (id, workspace_id, filename, deployed_path, version_hash,
          is_customized, sync_status, deployed_at, last_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        workspaceId,
        filename,
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

export function getInstructionDeployment(
  workspaceId: string,
  filename:    string
): InstructionDeploymentRow | null {
  return queryOne<InstructionDeploymentRow>(
    'SELECT * FROM instruction_deployments WHERE workspace_id = ? AND filename = ?',
    [workspaceId, filename]
  ) ?? null;
}

export function listInstructionDeploymentsByWorkspace(
  workspaceId: string
): InstructionDeploymentRow[] {
  return queryAll<InstructionDeploymentRow>(
    'SELECT * FROM instruction_deployments WHERE workspace_id = ? ORDER BY filename',
    [workspaceId]
  );
}

export function listInstructionDeploymentsByFile(
  filename: string
): InstructionDeploymentRow[] {
  return queryAll<InstructionDeploymentRow>(
    'SELECT * FROM instruction_deployments WHERE filename = ? ORDER BY workspace_id',
    [filename]
  );
}

export function listAllInstructionDeployments(): InstructionDeploymentRow[] {
  return queryAll<InstructionDeploymentRow>(
    'SELECT * FROM instruction_deployments ORDER BY workspace_id, filename'
  );
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deleteInstructionDeployment(
  workspaceId: string,
  filename:    string
): void {
  run(
    'DELETE FROM instruction_deployments WHERE workspace_id = ? AND filename = ?',
    [workspaceId, filename]
  );
}

export function deleteInstructionDeploymentsByWorkspace(workspaceId: string): void {
  run('DELETE FROM instruction_deployments WHERE workspace_id = ?', [workspaceId]);
}
