/**
 * Agent deployment tracking storage.
 *
 * Tracks which agent templates (from agent_definitions) are deployed
 * into each workspace, along with their content hash and sync status.
 */

import type { AgentDeploymentRow } from './types.js';
import { queryOne, queryAll, run, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncStatus = 'synced' | 'outdated' | 'customized' | 'missing';

export interface UpsertDeploymentInput {
  deployedPath:  string;
  versionHash:   string;
  isCustomized:  boolean;
  syncStatus:    SyncStatus;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Insert or update a deployment record for (workspaceId, agentName).
 * The composite UNIQUE constraint ensures only one record exists per pair.
 */
export function upsertDeployment(
  workspaceId: string,
  agentName:   string,
  data:        UpsertDeploymentInput
): void {
  const now  = nowIso();
  const existing = getDeployment(workspaceId, agentName);

  if (existing) {
    run(
      `UPDATE agent_deployments
          SET deployed_path = ?, version_hash = ?, is_customized = ?,
              sync_status = ?, last_updated = ?
        WHERE workspace_id = ? AND agent_name = ?`,
      [
        data.deployedPath,
        data.versionHash,
        data.isCustomized ? 1 : 0,
        data.syncStatus,
        now,
        workspaceId,
        agentName,
      ]
    );
  } else {
    run(
      `INSERT INTO agent_deployments
         (id, workspace_id, agent_name, deployed_path, version_hash,
          is_customized, sync_status, deployed_at, last_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        workspaceId,
        agentName,
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

export function getDeployment(
  workspaceId: string,
  agentName:   string
): AgentDeploymentRow | null {
  return queryOne<AgentDeploymentRow>(
    'SELECT * FROM agent_deployments WHERE workspace_id = ? AND agent_name = ?',
    [workspaceId, agentName]
  ) ?? null;
}

export function listDeploymentsByWorkspace(
  workspaceId: string
): AgentDeploymentRow[] {
  return queryAll<AgentDeploymentRow>(
    'SELECT * FROM agent_deployments WHERE workspace_id = ? ORDER BY agent_name',
    [workspaceId]
  );
}

export function listDeploymentsByAgent(
  agentName: string
): AgentDeploymentRow[] {
  return queryAll<AgentDeploymentRow>(
    'SELECT * FROM agent_deployments WHERE agent_name = ? ORDER BY workspace_id',
    [agentName]
  );
}

export function listAllDeployments(): AgentDeploymentRow[] {
  return queryAll<AgentDeploymentRow>(
    'SELECT * FROM agent_deployments ORDER BY workspace_id, agent_name'
  );
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deleteDeployment(
  workspaceId: string,
  agentName:   string
): void {
  run(
    'DELETE FROM agent_deployments WHERE workspace_id = ? AND agent_name = ?',
    [workspaceId, agentName]
  );
}

export function deleteDeploymentsByWorkspace(workspaceId: string): void {
  run('DELETE FROM agent_deployments WHERE workspace_id = ?', [workspaceId]);
}
