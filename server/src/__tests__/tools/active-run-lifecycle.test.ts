/**
 * Active Run Lifecycle Tests
 *
 * Tests the server-side active-run-lifecycle (stale-run-recovery) module:
 * - acquireActiveRun / releaseActiveRun lifecycle
 * - stale-run detection and auto-recovery
 * - recoverStaleRuns behaviour across sessions, steps, and lane context
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  acquireActiveRun,
  releaseActiveRun,
  recoverStaleRuns,
  writeActiveRun,
  type ActiveRunLifecycleRecord,
  type ActiveRunAcquireResult
} from '../../tools/orchestration/stale-run-recovery.js';
import * as store from '../../storage/file-store.js';
import type { PlanState, AgentSession } from '../../types/index.js';

vi.mock('../../storage/file-store.js');

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const WS = 'ws_test_lifecycle';
const PLAN = 'plan_test_lifecycle';

function makeRun(overrides: Partial<ActiveRunLifecycleRecord> = {}): ActiveRunLifecycleRecord {
  return {
    run_id: 'run-001',
    workspace_id: WS,
    plan_id: PLAN,
    status: 'active',
    started_at: new Date().toISOString(),
    last_updated_at: new Date().toISOString(),
    owner_agent: 'Executor',
    ...overrides
  };
}

function makeStaleRun(ageMinutes: number = 30): ActiveRunLifecycleRecord {
  const staleTime = new Date(Date.now() - ageMinutes * 60 * 1000).toISOString();
  return makeRun({
    run_id: 'run-stale',
    started_at: staleTime,
    last_updated_at: staleTime,
    owner_agent: 'StaledAgent'
  });
}

function basePlanState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    id: PLAN,
    workspace_id: WS,
    title: 'Test Plan',
    description: 'Lifecycle test plan',
    priority: 'medium',
    status: 'active',
    category: 'feature',
    current_phase: 'Phase 1',
    current_agent: 'Executor',
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    agent_sessions: [],
    lineage: [],
    steps: [],
    ...overrides
  };
}

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    session_id: 'sess-001',
    agent_type: 'Executor',
    started_at: new Date().toISOString(),
    context: {},
    ...overrides
  };
}

function makeStaleSession(ageMinutes: number = 30): AgentSession {
  const staleTime = new Date(Date.now() - ageMinutes * 60 * 1000).toISOString();
  return makeSession({
    session_id: 'sess-stale',
    started_at: staleTime
    // no completed_at → considered stale if old enough
  });
}

/** Build the lane context shape that readJson would return */
function laneContext(run: ActiveRunLifecycleRecord | undefined) {
  if (!run) return null;
  return {
    type: 'active_run_lane',
    workspace_id: WS,
    plan_id: PLAN,
    active_run: run,
    updated_at: new Date().toISOString()
  };
}

/* ================================================================== */
/*  SUITE: acquireActiveRun                                           */
/* ================================================================== */

describe('acquireActiveRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: nowISO returns a fixed ISO string
    (store.nowISO as Mock).mockReturnValue('2026-02-15T12:00:00.000Z');
    // Default: getContextPath returns a deterministic path
    (store.getContextPath as Mock).mockReturnValue('/mock/path/active_run_lane.json');
    // Default: writeJsonLocked succeeds
    (store.writeJsonLocked as Mock).mockResolvedValue(undefined);
  });

  it('acquires when no existing lane exists', async () => {
    (store.readJson as Mock).mockResolvedValue(null);

    const candidate = makeRun({ run_id: 'run-new' });
    const result = await acquireActiveRun(WS, PLAN, candidate);

    expect(result.acquired).toBe(true);
    expect(result.reason).toBe('acquired');
    expect(store.writeJsonLocked).toHaveBeenCalledTimes(1);
  });

  it('acquires when same run_id re-acquires (idempotent)', async () => {
    const existing = makeRun({ run_id: 'run-001' });
    (store.readJson as Mock).mockResolvedValue(laneContext(existing));

    const candidate = makeRun({ run_id: 'run-001', owner_agent: 'Reviewer' });
    const result = await acquireActiveRun(WS, PLAN, candidate);

    expect(result.acquired).toBe(true);
    expect(result.reason).toBe('acquired');

    // Verify the write updated last_updated_at
    const writtenPayload = (store.writeJsonLocked as Mock).mock.calls[0][1];
    expect(writtenPayload.active_run.last_updated_at).toBe('2026-02-15T12:00:00.000Z');
  });

  it('rejects when a different active run exists (not stale)', async () => {
    const existing = makeRun({ run_id: 'run-existing' });
    (store.readJson as Mock).mockResolvedValue(laneContext(existing));

    const candidate = makeRun({ run_id: 'run-new' });
    const result = await acquireActiveRun(WS, PLAN, candidate);

    expect(result.acquired).toBe(false);
    expect(result.reason).toBe('already_active');
    expect(result.active_run).toEqual(existing);
    // Should NOT have written anything
    expect(store.writeJsonLocked).not.toHaveBeenCalled();
  });

  it('evicts a stale run and acquires for the new candidate', async () => {
    const staleRun = makeStaleRun(30); // 30min old → stale (threshold is 20min)
    (store.readJson as Mock).mockResolvedValue(laneContext(staleRun));

    const candidate = makeRun({ run_id: 'run-fresh', owner_agent: 'Tester' });
    const result = await acquireActiveRun(WS, PLAN, candidate);

    expect(result.acquired).toBe(true);
    expect(result.reason).toBe('released_stale');
    expect(result.active_run).toEqual(candidate);

    // Should have written: first the release of the stale, then the new acquire
    expect(store.writeJsonLocked).toHaveBeenCalledTimes(2);
  });

  it('does not evict a non-stale run from a different owner', async () => {
    // 5 minutes old → not stale (threshold is 20min)
    const recentRun = makeRun({
      run_id: 'run-recent',
      started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      last_updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString()
    });
    (store.readJson as Mock).mockResolvedValue(laneContext(recentRun));

    const candidate = makeRun({ run_id: 'run-new' });
    const result = await acquireActiveRun(WS, PLAN, candidate);

    expect(result.acquired).toBe(false);
    expect(result.reason).toBe('already_active');
  });
});

/* ================================================================== */
/*  SUITE: releaseActiveRun                                           */
/* ================================================================== */

describe('releaseActiveRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (store.nowISO as Mock).mockReturnValue('2026-02-15T12:00:00.000Z');
    (store.getContextPath as Mock).mockReturnValue('/mock/path/active_run_lane.json');
    (store.writeJsonLocked as Mock).mockResolvedValue(undefined);
  });

  it('releases the active run with default reason code', async () => {
    const existing = makeRun({ run_id: 'run-001' });
    (store.readJson as Mock).mockResolvedValue(laneContext(existing));

    const result = await releaseActiveRun(WS, PLAN, 'SPAWN_RELEASE_COMPLETE');

    expect(result.released).toBe(true);
    expect(result.reason_code).toBe('SPAWN_RELEASE_COMPLETE');
    expect(store.writeJsonLocked).toHaveBeenCalledTimes(1);

    const written = (store.writeJsonLocked as Mock).mock.calls[0][1];
    expect(written.active_run.status).toBe('released');
    expect(written.active_run.release_reason_code).toBe('SPAWN_RELEASE_COMPLETE');
  });

  it('releases with SPAWN_RELEASE_HANDOFF reason code', async () => {
    const existing = makeRun({ run_id: 'run-001' });
    (store.readJson as Mock).mockResolvedValue(laneContext(existing));

    const result = await releaseActiveRun(WS, PLAN, 'SPAWN_RELEASE_HANDOFF');

    expect(result.released).toBe(true);
    expect(result.reason_code).toBe('SPAWN_RELEASE_HANDOFF');
  });

  it('sets status to cancelled for SPAWN_CANCELLED_TOKEN', async () => {
    const existing = makeRun({ run_id: 'run-001' });
    (store.readJson as Mock).mockResolvedValue(laneContext(existing));

    const result = await releaseActiveRun(WS, PLAN, 'SPAWN_CANCELLED_TOKEN');

    expect(result.released).toBe(true);
    const written = (store.writeJsonLocked as Mock).mock.calls[0][1];
    expect(written.active_run.status).toBe('cancelled');
    expect(written.active_run.release_reason_code).toBe('SPAWN_CANCELLED_TOKEN');
  });

  it('sets status to released for error-path release', async () => {
    const existing = makeRun({ run_id: 'run-001' });
    (store.readJson as Mock).mockResolvedValue(laneContext(existing));

    const result = await releaseActiveRun(WS, PLAN, 'SPAWN_RELEASE_ERROR_PATH');

    expect(result.released).toBe(true);
    const written = (store.writeJsonLocked as Mock).mock.calls[0][1];
    expect(written.active_run.status).toBe('released');
  });

  it('returns released=false when no active run exists', async () => {
    (store.readJson as Mock).mockResolvedValue(null);

    const result = await releaseActiveRun(WS, PLAN, 'SPAWN_RELEASE_COMPLETE');

    expect(result.released).toBe(false);
    expect(store.writeJsonLocked).not.toHaveBeenCalled();
  });

  it('returns released=false when run_id does not match', async () => {
    const existing = makeRun({ run_id: 'run-001' });
    (store.readJson as Mock).mockResolvedValue(laneContext(existing));

    const result = await releaseActiveRun(WS, PLAN, 'SPAWN_RELEASE_COMPLETE', 'wrong-run-id');

    expect(result.released).toBe(false);
    expect(store.writeJsonLocked).not.toHaveBeenCalled();
  });

  it('releases when run_id matches', async () => {
    const existing = makeRun({ run_id: 'run-001' });
    (store.readJson as Mock).mockResolvedValue(laneContext(existing));

    const result = await releaseActiveRun(WS, PLAN, 'SPAWN_RELEASE_COMPLETE', 'run-001');

    expect(result.released).toBe(true);
  });
});

/* ================================================================== */
/*  SUITE: recoverStaleRuns                                           */
/* ================================================================== */

describe('recoverStaleRuns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (store.nowISO as Mock).mockReturnValue('2026-02-15T12:00:00.000Z');
    (store.getContextPath as Mock).mockReturnValue('/mock/path/context.json');
    (store.writeJsonLocked as Mock).mockResolvedValue(undefined);
  });

  it('returns recovered=false when there is nothing to recover', async () => {
    (store.readJson as Mock).mockResolvedValue(null); // no lane context

    const state = basePlanState({
      steps: [{ index: 0, phase: 'P1', task: 'Do thing', status: 'done', type: 'code' }],
      agent_sessions: [makeSession({ completed_at: '2026-02-15T11:00:00.000Z' })]
    });

    const result = await recoverStaleRuns(WS, PLAN, state);

    expect(result.recovered).toBe(false);
  });

  it('resets active steps to pending', async () => {
    (store.readJson as Mock).mockResolvedValue(null); // no active lane

    const state = basePlanState({
      steps: [
        { index: 0, phase: 'P1', task: 'Active step', status: 'active', type: 'code' },
        { index: 1, phase: 'P1', task: 'Done step', status: 'done', type: 'code' }
      ]
    });

    const result = await recoverStaleRuns(WS, PLAN, state);

    expect(result.recovered).toBe(true);
    expect(result.note).toContain('STALE_RECOVERY');
    expect(state.steps[0].status).toBe('pending');
    expect(state.steps[0].notes).toContain('STALE_RECOVERY');
    // Done step untouched
    expect(state.steps[1].status).toBe('done');
  });

  it('marks stale agent sessions as completed', async () => {
    (store.readJson as Mock).mockResolvedValue(null);

    const staleSession = makeStaleSession(30);
    const freshSession = makeSession({ completed_at: '2026-02-15T11:00:00.000Z' });
    const state = basePlanState({
      agent_sessions: [staleSession, freshSession]
    });

    const result = await recoverStaleRuns(WS, PLAN, state);

    expect(result.recovered).toBe(true);
    // Stale session should now have completed_at
    expect(staleSession.completed_at).toBe('2026-02-15T12:00:00.000Z');
    expect(staleSession.summary).toContain('STALE_RECOVERY');
    // Fresh session untouched
    expect(freshSession.completed_at).toBe('2026-02-15T11:00:00.000Z');
  });

  it('releases active lane during recovery', async () => {
    const activeRun = makeRun({ run_id: 'run-stale-lane' });
    (store.readJson as Mock).mockResolvedValue(laneContext(activeRun));

    const state = basePlanState();

    const result = await recoverStaleRuns(WS, PLAN, state);

    expect(result.recovered).toBe(true);
    // Should have called writeJsonLocked for: release + stale recovery context
    expect(store.writeJsonLocked).toHaveBeenCalled();
  });

  it('handles combined stale sessions, active steps, and active lane', async () => {
    const activeRun = makeRun({ run_id: 'run-combined' });
    (store.readJson as Mock).mockResolvedValue(laneContext(activeRun));

    const staleSession = makeStaleSession(25);
    const state = basePlanState({
      steps: [
        { index: 0, phase: 'P1', task: 'Active step 1', status: 'active', type: 'code' },
        { index: 1, phase: 'P1', task: 'Active step 2', status: 'active', type: 'code' },
        { index: 2, phase: 'P2', task: 'Pending step', status: 'pending', type: 'code' }
      ],
      agent_sessions: [staleSession]
    });

    const result = await recoverStaleRuns(WS, PLAN, state);

    expect(result.recovered).toBe(true);
    expect(state.steps[0].status).toBe('pending');
    expect(state.steps[1].status).toBe('pending');
    expect(state.steps[2].status).toBe('pending'); // was already pending
    expect(staleSession.completed_at).toBeTruthy();
  });

  it('writes stale recovery context with session and step counts', async () => {
    (store.readJson as Mock).mockResolvedValue(null);

    const state = basePlanState({
      steps: [
        { index: 0, phase: 'P1', task: 'Active', status: 'active', type: 'code' }
      ],
      agent_sessions: [makeStaleSession(25)]
    });

    await recoverStaleRuns(WS, PLAN, state);

    // Find the stale_run_recovery write (not the lane release)
    const writeCalls = (store.writeJsonLocked as Mock).mock.calls;
    const recoveryWrite = writeCalls.find(
      ([, payload]: [string, { type?: string }]) => payload?.type === 'stale_run_recovery'
    );
    expect(recoveryWrite).toBeTruthy();
    if (recoveryWrite) {
      const [, payload] = recoveryWrite;
      expect(payload.stale_session_count).toBe(1);
      expect(payload.stale_step_count).toBe(1);
      expect(payload.recovered_at).toBe('2026-02-15T12:00:00.000Z');
    }
  });

  it('preserves existing step notes when adding recovery note', async () => {
    (store.readJson as Mock).mockResolvedValue(null);

    const state = basePlanState({
      steps: [
        { index: 0, phase: 'P1', task: 'Has notes', status: 'active', type: 'code', notes: 'Original note' }
      ]
    });

    await recoverStaleRuns(WS, PLAN, state);

    expect(state.steps[0].notes).toContain('Original note');
    expect(state.steps[0].notes).toContain('STALE_RECOVERY');
  });

  it('preserves existing session summary when adding recovery note', async () => {
    (store.readJson as Mock).mockResolvedValue(null);

    const staleSession = makeStaleSession(25);
    staleSession.summary = 'Partial work done';
    const state = basePlanState({
      agent_sessions: [staleSession]
    });

    await recoverStaleRuns(WS, PLAN, state);

    expect(staleSession.summary).toContain('Partial work done');
    expect(staleSession.summary).toContain('STALE_RECOVERY');
  });

  it('does not mark completed sessions as stale', async () => {
    (store.readJson as Mock).mockResolvedValue(null);

    // Old but completed session → not stale
    const oldCompleted = makeSession({
      session_id: 'sess-old-done',
      started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      completed_at: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
      summary: 'Completed normally'
    });

    const state = basePlanState({
      agent_sessions: [oldCompleted]
    });

    const result = await recoverStaleRuns(WS, PLAN, state);

    expect(result.recovered).toBe(false);
    expect(oldCompleted.summary).toBe('Completed normally'); // untouched
  });
});
