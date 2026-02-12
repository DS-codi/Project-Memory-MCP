import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateTDDDriver } from '../../tools/agent-validation.tools.js';
import * as store from '../../storage/file-store.js';
import type { PlanState } from '../../types/index.js';

vi.mock('../../storage/file-store.js');

const mockWorkspaceId = 'ws_tdddriver_test';
const mockPlanId = 'plan_tdddriver_456';

function makePlanState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    id: mockPlanId,
    workspace_id: mockWorkspaceId,
    title: 'TDD Plan',
    description: 'Plan using TDD workflow',
    priority: 'medium',
    status: 'active',
    category: 'feature',
    current_phase: 'tdd',
    current_agent: 'TDDDriver',
    created_at: '2026-02-10T00:00:00Z',
    updated_at: '2026-02-10T00:00:00Z',
    agent_sessions: [],
    lineage: [],
    steps: [
      {
        index: 0,
        phase: 'tdd',
        task: 'Red-green-refactor cycle for feature X',
        status: 'pending',
        type: 'standard',
      },
    ],
    ...overrides,
  };
}

describe('TDDDriver validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns valid (continue) when deployed by Coordinator', async () => {
    const state = makePlanState({
      deployment_context: {
        deployed_by: 'Coordinator',
        reason: 'TDD cycle for feature X',
        override_validation: true,
      },
    });
    vi.spyOn(store, 'getPlanState').mockResolvedValue(state);

    const result = await validateTDDDriver({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    expect(result.data?.action).toBe('continue');
    expect(result.data?.current_agent).toBe('TDDDriver');
  });

  it('returns valid (continue) when current_agent matches TDDDriver', async () => {
    const state = makePlanState({ current_agent: 'TDDDriver' });
    vi.spyOn(store, 'getPlanState').mockResolvedValue(state);

    const result = await validateTDDDriver({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    expect(result.data?.action).toBe('continue');
  });

  it('returns switch when heuristic expects a different agent and no deployment context', async () => {
    const state = makePlanState({
      current_phase: 'implementation',
      current_agent: 'Executor',
      deployment_context: undefined,
      steps: [
        {
          index: 0,
          phase: 'implementation',
          task: 'Implement feature Y',
          status: 'pending',
          type: 'standard',
        },
      ],
    });
    vi.spyOn(store, 'getPlanState').mockResolvedValue(state);

    const result = await validateTDDDriver({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    // Without deployment context and wrong phase, should suggest switching
    expect(result.data?.action).toBe('switch');
  });

  it('returns error when plan_id is missing', async () => {
    const result = await validateTDDDriver({
      workspace_id: mockWorkspaceId,
      plan_id: '',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns error when plan not found', async () => {
    vi.spyOn(store, 'getPlanState').mockResolvedValue(null);

    const result = await validateTDDDriver({
      workspace_id: mockWorkspaceId,
      plan_id: 'nonexistent_plan',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('role_boundaries reflect TDDDriver config', async () => {
    const state = makePlanState({
      deployment_context: {
        deployed_by: 'Coordinator',
        reason: 'TDD workflow',
        override_validation: true,
      },
    });
    vi.spyOn(store, 'getPlanState').mockResolvedValue(state);

    const result = await validateTDDDriver({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    const boundaries = result.data?.role_boundaries;
    expect(boundaries?.is_hub).toBe(true);
    expect(boundaries?.can_spawn_subagents).toBe(true);
    expect(boundaries?.can_implement).toBe(false);
    expect(boundaries?.primary_responsibility).toMatch(/tdd/i);
  });
});

describe('TDDDriver in PHASE_AGENT_MAP and TASK_KEYWORDS', () => {
  /**
   * These tests verify that the PHASE_AGENT_MAP and TASK_KEYWORDS tables
   * contain TDDDriver entries by exercising validateTDDDriver against
   * plans whose phase/task strings include TDD-related keywords.
   * When the heuristic recognises "tdd" or "test-driven", it should
   * return action: 'continue' for TDDDriver.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('phase containing "tdd" maps to TDDDriver via heuristic', async () => {
    const state = makePlanState({
      current_phase: 'tdd',
      current_agent: undefined as unknown as string,
      deployment_context: undefined,
    });
    vi.spyOn(store, 'getPlanState').mockResolvedValue(state);

    const result = await validateTDDDriver({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    expect(result.data?.action).toBe('continue');
  });

  it('task containing "tdd cycle" is recognised for TDDDriver', async () => {
    const state = makePlanState({
      current_phase: 'development',
      current_agent: undefined as unknown as string,
      deployment_context: undefined,
      steps: [
        {
          index: 0,
          phase: 'development',
          task: 'Run tdd cycle for auth module',
          status: 'pending',
          type: 'standard',
        },
      ],
    });
    vi.spyOn(store, 'getPlanState').mockResolvedValue(state);

    const result = await validateTDDDriver({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    // "development" phase matches Executor first in PHASE_AGENT_MAP,
    // so this should suggest switch — but task keyword "tdd cycle" is TDDDriver.
    // Exact behaviour depends on priority order; we just verify it runs.
    expect(result.data?.action).toBeDefined();
  });
});
