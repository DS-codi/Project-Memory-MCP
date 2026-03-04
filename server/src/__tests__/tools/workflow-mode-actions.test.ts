import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setWorkflowModeAction,
  getWorkflowModeAction,
} from '../../tools/plan/plan-lifecycle.js';
import * as store from '../../storage/db-store.js';
import * as planDb from '../../db/plan-db.js';
import type { PlanState } from '../../types/index.js';

/**
 * Workflow Mode Action Tests
 *
 * Tests for setWorkflowModeAction and getWorkflowModeAction in plan-lifecycle.ts.
 * Step 10 of plan_mmbqt3yr_af40cbc4.
 */

vi.mock('../../storage/db-store.js');
vi.mock('../../db/plan-db.js');

// ===========================================================================
// Fixtures
// ===========================================================================

const WS = 'ws_wfm_test';
const PLAN_ID = 'plan_wfm_test';

function makePlan(overrides: Partial<PlanState> = {}): PlanState {
  return {
    id: PLAN_ID,
    workspace_id: WS,
    title: 'WFM Test Plan',
    description: 'desc',
    category: 'feature',
    priority: 'medium',
    status: 'active',
    current_phase: 'Phase 1',
    current_agent: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    steps: [],
    agent_sessions: [],
    lineage: [],
    workflow_mode: 'standard',
    ...overrides,
  };
}

// ===========================================================================
// setWorkflowModeAction
// ===========================================================================

describe('setWorkflowModeAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(store.getPlanState).mockResolvedValue(makePlan());
    vi.mocked(planDb.setWorkflowMode).mockImplementation(() => undefined);
  });

  it('sets a valid workflow mode and returns updated plan state', async () => {
    const updatedPlan = makePlan({ workflow_mode: 'tdd' });
    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(makePlan())    // existence check
      .mockResolvedValueOnce(updatedPlan);  // fresh state after upsert

    const result = await setWorkflowModeAction({
      workspace_id: WS,
      plan_id: PLAN_ID,
      workflow_mode: 'tdd',
    });

    expect(result.success).toBe(true);
    expect(result.data!.workflow_mode).toBe('tdd');
    expect(result.data!.plan_id).toBe(PLAN_ID);
    expect(result.data!.plan_state.workflow_mode).toBe('tdd');
    expect(planDb.setWorkflowMode).toHaveBeenCalledWith(PLAN_ID, 'tdd');
  });

  it('accepts all valid workflow modes', async () => {
    const modes = ['standard', 'tdd', 'enrichment', 'overnight'] as const;
    for (const mode of modes) {
      vi.resetAllMocks();
      vi.mocked(store.getPlanState).mockResolvedValue(makePlan({ workflow_mode: mode }));
      vi.mocked(planDb.setWorkflowMode).mockImplementation(() => undefined);

      const result = await setWorkflowModeAction({
        workspace_id: WS,
        plan_id: PLAN_ID,
        workflow_mode: mode,
      });
      expect(result.success).toBe(true);
      expect(result.data!.workflow_mode).toBe(mode);
    }
  });

  it('returns error for an invalid workflow_mode', async () => {
    const result = await setWorkflowModeAction({
      workspace_id: WS,
      plan_id: PLAN_ID,
      workflow_mode: 'invalid_mode',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/workflow_mode must be one of/);
    expect(planDb.setWorkflowMode).not.toHaveBeenCalled();
  });

  it('returns error for empty workflow_mode', async () => {
    const result = await setWorkflowModeAction({
      workspace_id: WS,
      plan_id: PLAN_ID,
      workflow_mode: '',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/workflow_mode must be one of/);
  });

  it('returns error when plan does not exist', async () => {
    vi.mocked(store.getPlanState).mockResolvedValue(null);

    const result = await setWorkflowModeAction({
      workspace_id: WS,
      plan_id: 'nonexistent',
      workflow_mode: 'tdd',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Plan not found/);
    expect(planDb.setWorkflowMode).not.toHaveBeenCalled();
  });

  it('returns error when workspace_id is missing', async () => {
    const result = await setWorkflowModeAction({
      workspace_id: '',
      plan_id: PLAN_ID,
      workflow_mode: 'tdd',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/workspace_id and plan_id are required/);
  });

  it('returns error when plan_id is missing', async () => {
    const result = await setWorkflowModeAction({
      workspace_id: WS,
      plan_id: '',
      workflow_mode: 'tdd',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/workspace_id and plan_id are required/);
  });
});

// ===========================================================================
// getWorkflowModeAction
// ===========================================================================

describe('getWorkflowModeAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(store.getPlanState).mockResolvedValue(makePlan());
    vi.mocked(planDb.getWorkflowMode).mockReturnValue(undefined);
  });

  it('returns standard when no workflow mode row exists', async () => {
    vi.mocked(planDb.getWorkflowMode).mockReturnValue(undefined);

    const result = await getWorkflowModeAction({
      workspace_id: WS,
      plan_id: PLAN_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data!.workflow_mode).toBe('standard');
    expect(result.data!.plan_id).toBe(PLAN_ID);
  });

  it('returns stored workflow mode when row exists', async () => {
    vi.mocked(planDb.getWorkflowMode).mockReturnValue({
      id: 1,
      plan_id: PLAN_ID,
      workflow_mode: 'tdd',
      set_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    const result = await getWorkflowModeAction({
      workspace_id: WS,
      plan_id: PLAN_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data!.workflow_mode).toBe('tdd');
  });

  it('returns each valid mode that has been stored', async () => {
    const modes = ['standard', 'tdd', 'enrichment', 'overnight'] as const;
    for (const mode of modes) {
      vi.mocked(planDb.getWorkflowMode).mockReturnValue({
        id: 1,
        plan_id: PLAN_ID,
        workflow_mode: mode,
        set_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      });

      const result = await getWorkflowModeAction({ workspace_id: WS, plan_id: PLAN_ID });
      expect(result.success).toBe(true);
      expect(result.data!.workflow_mode).toBe(mode);
    }
  });

  it('returns error when plan does not exist', async () => {
    vi.mocked(store.getPlanState).mockResolvedValue(null);

    const result = await getWorkflowModeAction({
      workspace_id: WS,
      plan_id: 'nonexistent',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Plan not found/);
  });

  it('returns error when workspace_id is missing', async () => {
    const result = await getWorkflowModeAction({
      workspace_id: '',
      plan_id: PLAN_ID,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/workspace_id and plan_id are required/);
  });

  it('returns error when plan_id is missing', async () => {
    const result = await getWorkflowModeAction({
      workspace_id: WS,
      plan_id: '',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/workspace_id and plan_id are required/);
  });
});
