import type { PlanState, AgentSession } from '../../types/index.js';
import * as store from '../../storage/file-store.js';

const ACTIVE_RUN_CONTEXT_TYPE = 'active_run_lane';
const STALE_RUN_CONTEXT_TYPE = 'stale_run_recovery';
const STALE_SESSION_MS = 20 * 60 * 1000;

export interface ActiveRunAcquireResult {
  acquired: boolean;
  active_run?: ActiveRunLifecycleRecord;
  reason?: 'already_active' | 'acquired' | 'released_stale';
}

export interface ActiveRunLifecycleRecord {
  run_id: string;
  workspace_id: string;
  plan_id: string;
  status: 'active' | 'released' | 'cancelled';
  started_at: string;
  last_updated_at: string;
  owner_agent?: string;
  release_reason_code?: string;
}

interface ActiveRunLaneContext {
  type: typeof ACTIVE_RUN_CONTEXT_TYPE;
  workspace_id: string;
  plan_id: string;
  active_run?: ActiveRunLifecycleRecord;
  updated_at: string;
}

function nowISO(): string {
  return store.nowISO();
}

function contextPath(workspace_id: string, plan_id: string): string {
  return store.getContextPath(workspace_id, plan_id, ACTIVE_RUN_CONTEXT_TYPE);
}

function staleRecoveryContextPath(workspace_id: string, plan_id: string): string {
  return store.getContextPath(workspace_id, plan_id, STALE_RUN_CONTEXT_TYPE);
}

async function readLaneContext(workspace_id: string, plan_id: string): Promise<ActiveRunLaneContext | null> {
  return store.readJson<ActiveRunLaneContext>(contextPath(workspace_id, plan_id));
}

export async function writeActiveRun(
  workspace_id: string,
  plan_id: string,
  run: ActiveRunLifecycleRecord
): Promise<void> {
  const payload: ActiveRunLaneContext = {
    type: ACTIVE_RUN_CONTEXT_TYPE,
    workspace_id,
    plan_id,
    active_run: run,
    updated_at: nowISO()
  };
  await store.writeJsonLocked(contextPath(workspace_id, plan_id), payload);
}

function isActiveRunStale(run: ActiveRunLifecycleRecord): boolean {
  const ageMs = Date.now() - new Date(run.last_updated_at || run.started_at).getTime();
  return ageMs > STALE_SESSION_MS;
}

export async function acquireActiveRun(
  workspace_id: string,
  plan_id: string,
  candidate: ActiveRunLifecycleRecord
): Promise<ActiveRunAcquireResult> {
  const existing = await readLaneContext(workspace_id, plan_id);

  if (existing?.active_run?.status === 'active') {
    if (existing.active_run.run_id === candidate.run_id) {
      await writeActiveRun(workspace_id, plan_id, {
        ...existing.active_run,
        owner_agent: candidate.owner_agent ?? existing.active_run.owner_agent,
        last_updated_at: nowISO()
      });
      return {
        acquired: true,
        active_run: existing.active_run,
        reason: 'acquired'
      };
    }

    if (!isActiveRunStale(existing.active_run)) {
      return {
        acquired: false,
        active_run: existing.active_run,
        reason: 'already_active'
      };
    }

    await releaseActiveRun(workspace_id, plan_id, 'SPAWN_STALE_RECOVERY', existing.active_run.run_id);
    await writeActiveRun(workspace_id, plan_id, candidate);
    return {
      acquired: true,
      active_run: candidate,
      reason: 'released_stale'
    };
  }

  await writeActiveRun(workspace_id, plan_id, candidate);
  return {
    acquired: true,
    active_run: candidate,
    reason: 'acquired'
  };
}

export async function releaseActiveRun(
  workspace_id: string,
  plan_id: string,
  release_reason_code: string,
  run_id?: string
): Promise<{ released: boolean; reason_code: string }> {
  const existing = await readLaneContext(workspace_id, plan_id);
  if (!existing?.active_run) {
    return { released: false, reason_code: release_reason_code };
  }

  if (run_id && existing.active_run.run_id !== run_id) {
    return { released: false, reason_code: release_reason_code };
  }

  const next: ActiveRunLaneContext = {
    ...existing,
    active_run: {
      ...existing.active_run,
      status: release_reason_code === 'SPAWN_CANCELLED_TOKEN' ? 'cancelled' : 'released',
      release_reason_code,
      last_updated_at: nowISO()
    },
    updated_at: nowISO()
  };

  await store.writeJsonLocked(contextPath(workspace_id, plan_id), next);
  return { released: true, reason_code: release_reason_code };
}

function isSessionStale(session: AgentSession): boolean {
  if (session.completed_at) {
    return false;
  }
  const ageMs = Date.now() - new Date(session.started_at).getTime();
  return ageMs > STALE_SESSION_MS;
}

export async function recoverStaleRuns(
  workspace_id: string,
  plan_id: string,
  state: PlanState
): Promise<{ recovered: boolean; note?: string }> {
  const staleSessions = state.agent_sessions.filter(isSessionStale);
  const activeSteps = state.steps.filter(step => step.status === 'active');

  const lane = await readLaneContext(workspace_id, plan_id);
  const hasActiveLane = lane?.active_run?.status === 'active';

  if (!hasActiveLane && staleSessions.length === 0 && activeSteps.length === 0) {
    return { recovered: false };
  }

  const timestamp = nowISO();
  const note = `[STALE_RECOVERY ${timestamp}] Reset stale active run/session state before continuing orchestration.`;

  for (const step of state.steps) {
    if (step.status === 'active') {
      step.status = 'pending';
      step.notes = step.notes ? `${step.notes}\n${note}` : note;
    }
  }

  for (const session of state.agent_sessions) {
    if (isSessionStale(session)) {
      session.completed_at = timestamp;
      session.summary = session.summary
        ? `${session.summary}\n${note}`
        : note;
    }
  }

  if (hasActiveLane) {
    await releaseActiveRun(workspace_id, plan_id, 'SPAWN_STALE_RECOVERY', lane?.active_run?.run_id);
  }

  await store.writeJsonLocked(staleRecoveryContextPath(workspace_id, plan_id), {
    type: STALE_RUN_CONTEXT_TYPE,
    workspace_id,
    plan_id,
    recovered_at: timestamp,
    stale_session_count: staleSessions.length,
    stale_step_count: activeSteps.length,
    note
  });

  return { recovered: true, note };
}
