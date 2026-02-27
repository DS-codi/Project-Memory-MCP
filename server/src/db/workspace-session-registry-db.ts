/**
 * Workspace session registry.
 *
 * Live table of active agent sessions across an entire workspace.
 * Written by deploy_agent_to_workspace at spawn time;
 * updated on every step-status change and memory_agent handoff/complete.
 * Queried at deploy time to build the ##PEER_SESSIONS section injected
 * into every materialised agent file.
 *
 * The `id` column mirrors sessions.id so the two records stay in sync.
 */

import type { WorkspaceSessionRegistryRow } from './types.js';
import { queryOne, queryAll, run, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface UpsertRegistryInput {
  workspaceId:         string;
  planId?:             string | null;
  agentType:           string;
  currentPhase?:       string | null;
  stepIndicesClaimed?: number[];
  filesInScope?:       string[];
  materialisedPath?:   string | null;
}

export interface UpdateRegistryInput {
  currentPhase?:       string | null;
  stepIndicesClaimed?: number[];
  filesInScope?:       string[];
  materialisedPath?:   string | null;
  status?:             'active' | 'stopping' | 'completed';
}

/** Shape of a peer session summary injected into ##PEER_SESSIONS blocks. */
export interface PeerSessionSummary {
  sessionId:           string;
  agentType:           string;
  planId:              string | null;
  currentPhase:        string | null;
  stepIndicesClaimed:  number[];
  filesInScope:        string[];
  materialisedPath:    string | null;
  status:              string;
  startedAt:           string;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Insert or update the registry row for a session.
 * Called by deploy_agent_to_workspace immediately after writing the file.
 */
export function upsertSessionRegistry(
  sessionId: string,
  data:      UpsertRegistryInput
): WorkspaceSessionRegistryRow {
  const now = nowIso();
  const existing = getRegistryRow(sessionId);

  const stepsClaimed = JSON.stringify(data.stepIndicesClaimed ?? []);
  const filesInScope = JSON.stringify(data.filesInScope ?? []);

  if (existing) {
    run(
      `UPDATE workspace_session_registry
          SET workspace_id = ?, plan_id = ?, agent_type = ?,
              current_phase = ?, step_indices_claimed = ?,
              files_in_scope = ?, materialised_path = ?,
              status = 'active', updated_at = ?
        WHERE id = ?`,
      [
        data.workspaceId,
        data.planId ?? null,
        data.agentType,
        data.currentPhase ?? null,
        stepsClaimed,
        filesInScope,
        data.materialisedPath ?? existing.materialised_path,
        now,
        sessionId,
      ]
    );
  } else {
    run(
      `INSERT INTO workspace_session_registry
         (id, workspace_id, plan_id, agent_type,
          current_phase, step_indices_claimed, files_in_scope,
          materialised_path, status, started_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [
        sessionId,
        data.workspaceId,
        data.planId ?? null,
        data.agentType,
        data.currentPhase ?? null,
        stepsClaimed,
        filesInScope,
        data.materialisedPath ?? null,
        now,
        now,
      ]
    );
  }

  return getRegistryRow(sessionId)!;
}

/**
 * Partial update — called on each step status change and at handoff/complete.
 */
export function updateSessionRegistry(
  sessionId: string,
  patch:     UpdateRegistryInput
): void {
  const existing = getRegistryRow(sessionId);
  if (!existing) return;

  const now = nowIso();
  run(
    `UPDATE workspace_session_registry
        SET current_phase        = ?,
            step_indices_claimed = ?,
            files_in_scope       = ?,
            materialised_path    = ?,
            status               = ?,
            updated_at           = ?
      WHERE id = ?`,
    [
      patch.currentPhase       !== undefined ? patch.currentPhase   : existing.current_phase,
      patch.stepIndicesClaimed !== undefined ? JSON.stringify(patch.stepIndicesClaimed) : existing.step_indices_claimed,
      patch.filesInScope       !== undefined ? JSON.stringify(patch.filesInScope)       : existing.files_in_scope,
      patch.materialisedPath   !== undefined ? patch.materialisedPath                  : existing.materialised_path,
      patch.status             !== undefined ? patch.status                             : existing.status,
      now,
      sessionId,
    ]
  );
}

/** Mark session as completed (called by memory_agent handoff/complete). */
export function completeRegistrySession(sessionId: string): void {
  run(
    `UPDATE workspace_session_registry
        SET status = 'completed', updated_at = ?
      WHERE id = ?`,
    [nowIso(), sessionId]
  );
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getRegistryRow(sessionId: string): WorkspaceSessionRegistryRow | null {
  return queryOne<WorkspaceSessionRegistryRow>(
    'SELECT * FROM workspace_session_registry WHERE id = ?',
    [sessionId]
  ) ?? null;
}

/**
 * Return all active sessions for a workspace, excluding the given session.
 * Used to build the ##PEER_SESSIONS section at deploy time.
 */
export function getActivePeerSessions(
  workspaceId: string,
  excludeSessionId: string
): PeerSessionSummary[] {
  const rows = queryAll<WorkspaceSessionRegistryRow>(
    `SELECT * FROM workspace_session_registry
      WHERE workspace_id = ? AND id != ? AND status = 'active'
      ORDER BY started_at ASC`,
    [workspaceId, excludeSessionId]
  );

  return rows.map(row => ({
    sessionId:          row.id,
    agentType:          row.agent_type,
    planId:             row.plan_id,
    currentPhase:       row.current_phase,
    stepIndicesClaimed: safeParseJson<number[]>(row.step_indices_claimed, []),
    filesInScope:       safeParseJson<string[]>(row.files_in_scope, []),
    materialisedPath:   row.materialised_path,
    status:             row.status,
    startedAt:          row.started_at,
  }));
}

/** All sessions for a workspace (any status). Used for session panel display. */
export function getAllWorkspaceSessions(workspaceId: string): WorkspaceSessionRegistryRow[] {
  return queryAll<WorkspaceSessionRegistryRow>(
    `SELECT * FROM workspace_session_registry
      WHERE workspace_id = ?
      ORDER BY started_at DESC`,
    [workspaceId]
  );
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/** Remove completed/stale registry rows older than the given ISO timestamp. */
export function pruneCompletedSessions(olderThan: string): number {
  const stmt = run(
    `DELETE FROM workspace_session_registry
      WHERE status = 'completed' AND updated_at < ?`,
    [olderThan]
  );
  return (stmt as unknown as { changes: number }).changes ?? 0;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function safeParseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
