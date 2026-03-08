import { randomUUID } from 'crypto';

export interface SupervisorWindowIdentityInput {
  workspacePath?: string;
  machineId: string;
  processId: number;
  sessionNonce?: string;
}

/**
 * Build a supervisor window identifier that is unique per VS Code window.
 *
 * The workspace path stays human-readable while the nonce avoids collisions
 * when multiple windows open the same workspace concurrently.
 */
export function buildSupervisorWindowId(input: SupervisorWindowIdentityInput): string {
  const workspaceToken = input.workspacePath?.trim() || 'no-workspace';
  const nonce = input.sessionNonce?.trim() || randomUUID();
  return `${workspaceToken}|${input.machineId}|pid:${input.processId}|${nonce}`;
}