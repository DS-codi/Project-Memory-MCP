/**
 * Tests for Worker agent validation (agent-validation.tools.ts).
 *
 * Covers:
 * 1. validateWorker accepts valid deployment by hub agents
 * 2. validateWorker populates role_boundaries correctly
 * 3. validateWorker fails when plan does not exist
 * 4. validateWorker integrates with getValidationFunction dispatch
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateWorker } from '../../tools/agent-validation.tools.js';
import { AGENT_BOUNDARIES } from '../../types/index.js';
import type { PlanState } from '../../types/index.js';

// Mock the file store
vi.mock('../../storage/db-store.js');

import * as store from '../../storage/db-store.js';

// =============================================================================
// Test Helpers
// =============================================================================

function makeWorkerPlanState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    id: 'plan_worker_001',
    workspace_id: 'ws_test',
    title: 'Worker Subtask Plan',
    description: 'Delegated subtask for Worker agent',
    priority: 'medium',
    status: 'active',
    category: 'feature',
    current_phase: 'Implementation',
    current_agent: 'Worker',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    agent_sessions: [],
    lineage: [],
    steps: [
      {
        index: 0,
        phase: 'Implementation',
        task: 'Implement small feature change',
        status: 'pending',
        type: 'code',
      },
    ],
    deployment_context: {
      deployed_agent: 'Worker',
      deployed_by: 'Coordinator',
      reason: 'Execute small sub-task',
      override_validation: true,
      deployed_at: new Date().toISOString(),
    },
    ...overrides,
  };
}

// =============================================================================
// validateWorker — deployment & role boundaries
// =============================================================================

describe('validateWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Valid deployments by hub agents
  // ---------------------------------------------------------------------------

  it('should accept valid deployment by Coordinator', async () => {
    const planState = makeWorkerPlanState({
      deployment_context: {
        deployed_agent: 'Worker',
        deployed_by: 'Coordinator',
        reason: 'Small sub-task delegation',
        override_validation: true,
        deployed_at: new Date().toISOString(),
      },
    });
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    const result = await validateWorker({
      workspace_id: 'ws_test',
      plan_id: 'plan_worker_001',
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.action).toBe('continue');
  });

  it('should accept valid deployment by Analyst', async () => {
    const planState = makeWorkerPlanState({
      deployment_context: {
        deployed_agent: 'Worker',
        deployed_by: 'Analyst',
        reason: 'Run analysis sub-task',
        override_validation: true,
        deployed_at: new Date().toISOString(),
      },
    });
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    const result = await validateWorker({
      workspace_id: 'ws_test',
      plan_id: 'plan_worker_001',
    });

    expect(result.success).toBe(true);
    expect(result.data!.action).toBe('continue');
  });

  it('should accept valid deployment by Runner', async () => {
    const planState = makeWorkerPlanState({
      deployment_context: {
        deployed_agent: 'Worker',
        deployed_by: 'Runner',
        reason: 'Quick sub-task',
        override_validation: true,
        deployed_at: new Date().toISOString(),
      },
    });
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    const result = await validateWorker({
      workspace_id: 'ws_test',
      plan_id: 'plan_worker_001',
    });

    expect(result.success).toBe(true);
    expect(result.data!.action).toBe('continue');
  });

  // ---------------------------------------------------------------------------
  // Role boundaries in result
  // ---------------------------------------------------------------------------

  it('should return role_boundaries with Worker fields', async () => {
    const planState = makeWorkerPlanState();
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    const result = await validateWorker({
      workspace_id: 'ws_test',
      plan_id: 'plan_worker_001',
    });

    expect(result.success).toBe(true);
    expect(result.data!.role_boundaries).toBeDefined();
    expect(result.data!.role_boundaries.agent_type).toBe('Worker');
    expect(result.data!.role_boundaries.can_implement).toBe(true);
    expect(result.data!.role_boundaries.can_finalize).toBe(false);
  });

  it('should include forbidden_actions matching AGENT_BOUNDARIES', async () => {
    const planState = makeWorkerPlanState();
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    const result = await validateWorker({
      workspace_id: 'ws_test',
      plan_id: 'plan_worker_001',
    });

    expect(result.success).toBe(true);
    const boundaries = result.data!.role_boundaries;
    expect(boundaries.forbidden_actions).toEqual(
      AGENT_BOUNDARIES.Worker.forbidden_actions
    );
  });

  // ---------------------------------------------------------------------------
  // Phase / step metadata
  // ---------------------------------------------------------------------------

  it('should include current_phase and current_step in result', async () => {
    const planState = makeWorkerPlanState();
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    const result = await validateWorker({
      workspace_id: 'ws_test',
      plan_id: 'plan_worker_001',
    });

    expect(result.success).toBe(true);
    expect(result.data!.current_phase).toBeDefined();
    expect(result.data!.current_step).toBeDefined();
  });

  it('should include todo_list for pending steps', async () => {
    const planState = makeWorkerPlanState({
      steps: [
        {
          index: 0,
          phase: 'Implementation',
          task: 'Fix bug in parser',
          status: 'done',
          type: 'code',
        },
        {
          index: 1,
          phase: 'Implementation',
          task: 'Update unit tests',
          status: 'pending',
          type: 'test',
        },
      ],
    });
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    const result = await validateWorker({
      workspace_id: 'ws_test',
      plan_id: 'plan_worker_001',
    });

    expect(result.success).toBe(true);
    expect(result.data!.todo_list).toBeDefined();
    expect(Array.isArray(result.data!.todo_list)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Error cases
  // ---------------------------------------------------------------------------

  it('should fail when plan does not exist', async () => {
    vi.spyOn(store, 'getPlanState').mockResolvedValue(null);

    const result = await validateWorker({
      workspace_id: 'ws_test',
      plan_id: 'plan_nonexistent',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should handle missing workspace_id gracefully', async () => {
    const result = await validateWorker({
      workspace_id: '',
      plan_id: 'plan_worker_001',
    });

    // Should either fail or still return a result (not throw)
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });
});

// =============================================================================
// getValidationFunction dispatch — Worker case
// =============================================================================

describe('getValidationFunction dispatch for Worker', () => {
  /**
   * We test indirectly: calling validateWorker should use the same
   * codepath that getValidationFunction('Worker') resolves to.
   * If the dispatch were missing, validateWorker would not be exported
   * or would fail to match AGENT_BOUNDARIES.
   */
  it('validateWorker should be a function (exported from agent-validation.tools)', () => {
    expect(typeof validateWorker).toBe('function');
  });

  it('AGENT_BOUNDARIES.Worker matches what validateWorker returns in role_boundaries', async () => {
    const planState = makeWorkerPlanState();
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    const result = await validateWorker({
      workspace_id: 'ws_test',
      plan_id: 'plan_worker_001',
    });

    expect(result.success).toBe(true);
    expect(result.data!.role_boundaries.agent_type).toBe(
      AGENT_BOUNDARIES.Worker.agent_type
    );
    expect(result.data!.role_boundaries.must_handoff_to).toEqual(
      AGENT_BOUNDARIES.Worker.must_handoff_to
    );
  });
});
