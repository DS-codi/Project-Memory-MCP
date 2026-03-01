/**
 * Deployable agent profiles.
 *
 * Defines which agent_definitions are first-class deployables in the
 * hub model (currently Hub + PromptAnalyst).
 */

import type { DeployableAgentProfileRow } from './types.js';
import { queryOne, queryAll, run, newId, nowIso } from './query-helpers.js';

export type DeployableAgentRole = 'hub' | 'prompt_analyst';

export interface UpsertDeployableAgentProfileInput {
  role: DeployableAgentRole;
  enabled?: boolean;
  metadata?: Record<string, unknown> | null;
}

export function upsertDeployableAgentProfile(
  agentName: string,
  input: UpsertDeployableAgentProfileInput,
): void {
  const existing = getDeployableAgentProfileByRole(input.role);
  const now = nowIso();

  if (existing) {
    run(
      `UPDATE deployable_agent_profiles
          SET agent_name = ?, enabled = ?, metadata = ?, updated_at = ?
        WHERE role = ?`,
      [
        agentName,
        input.enabled === false ? 0 : 1,
        input.metadata ? JSON.stringify(input.metadata) : null,
        now,
        input.role,
      ],
    );
    return;
  }

  run(
    `INSERT INTO deployable_agent_profiles
       (id, agent_name, role, enabled, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      agentName,
      input.role,
      input.enabled === false ? 0 : 1,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now,
      now,
    ],
  );
}

export function getDeployableAgentProfileByName(agentName: string): DeployableAgentProfileRow | null {
  return queryOne<DeployableAgentProfileRow>(
    'SELECT * FROM deployable_agent_profiles WHERE agent_name = ?',
    [agentName],
  ) ?? null;
}

export function getDeployableAgentProfileByRole(role: DeployableAgentRole): DeployableAgentProfileRow | null {
  return queryOne<DeployableAgentProfileRow>(
    'SELECT * FROM deployable_agent_profiles WHERE role = ?',
    [role],
  ) ?? null;
}

export function listDeployableAgentProfiles(enabledOnly = false): DeployableAgentProfileRow[] {
  if (enabledOnly) {
    return queryAll<DeployableAgentProfileRow>(
      'SELECT * FROM deployable_agent_profiles WHERE enabled = 1 ORDER BY role',
    );
  }

  return queryAll<DeployableAgentProfileRow>(
    'SELECT * FROM deployable_agent_profiles ORDER BY role',
  );
}

export function deleteDeployableAgentProfile(role: DeployableAgentRole): void {
  run('DELETE FROM deployable_agent_profiles WHERE role = ?', [role]);
}
