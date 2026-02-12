/**
 * Tests for Worker lifecycle behavior (handoff.tools.ts).
 *
 * Covers:
 * 1. Worker handoff with budget_exceeded triggers limit storage
 * 2. Worker handoff with scope_escalation triggers limit storage
 * 3. Worker handoff without limit flags does not store limit context
 * 4. Worker sessions recorded in plan lineage
 * 5. isWorkerLimitExceeded / storeWorkerLimitExceeded logic (via handoff)
 *
 * These functions are internal to handoff.tools.ts so we test them
 * through the public `handoff()` API and verify side-effects via mocks.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handoff, initialiseAgent, completeAgent } from '../../tools/handoff.tools.js';
import { AGENT_BOUNDARIES } from '../../types/index.js';
import type { PlanState, LineageEntry } from '../../types/index.js';

// Mock the file store and events
vi.mock('../../storage/file-store.js');
vi.mock('../../tools/event.tools.js', () => ({
  handoff: vi.fn().mockResolvedValue(undefined),
  agentInit: vi.fn().mockResolvedValue(undefined),
  agentComplete: vi.fn().mockResolvedValue(undefined),
}));

import * as store from '../../storage/file-store.js';

// =============================================================================
// Test Helpers
// =============================================================================

function makeWorkerPlan(overrides: Partial<PlanState> = {}): PlanState {
  return {
    id: 'plan_worker_lifecycle_001',
    workspace_id: 'ws_test',
    title: 'Worker Lifecycle Plan',
    description: 'Plan for testing worker lifecycle',
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
        task: 'Execute sub-task',
        status: 'active',
        type: 'code',
      },
    ],
    deployment_context: {
      deployed_agent: 'Worker',
      deployed_by: 'Coordinator',
      reason: 'Execute delegated sub-task',
      override_validation: true,
      deployed_at: new Date().toISOString(),
    },
    ...overrides,
  };
}

// =============================================================================
// Worker limit detection via handoff
// =============================================================================

describe('Worker limit detection through handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    vi.spyOn(store, 'savePlanState').mockResolvedValue(undefined);
    vi.spyOn(store, 'generatePlanMd').mockResolvedValue(undefined);
    vi.spyOn(store, 'nowISO').mockReturnValue('2026-02-13T00:00:00.000Z');
    vi.spyOn(store, 'getContextPath').mockReturnValue('/mock/context/path');
    vi.spyOn(store, 'writeJsonLocked').mockResolvedValue(undefined);
  });

  it('should store limit context when Worker hands off with budget_exceeded', async () => {
    const planState = makeWorkerPlan();
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    const result = await handoff({
      workspace_id: 'ws_test',
      plan_id: 'plan_worker_lifecycle_001',
      from_agent: 'Worker',
      to_agent: 'Coordinator',
      reason: 'Budget exceeded during sub-task',
      data: {
        budget_exceeded: true,
        files_modified: ['src/foo.ts'],
        remaining_work: 'Still need to update tests',
        reason: 'Ran out of step budget',
      },
    });

    expect(result.success).toBe(true);
    // writeJsonLocked should be called twice: once for handoff context, once for limit context
    expect(store.writeJsonLocked).toHaveBeenCalled();
    // Verify one of the writes includes worker_limit_exceeded type
    const calls = vi.mocked(store.writeJsonLocked).mock.calls;
    const limitCall = calls.find(
      (call) => (call[1] as Record<string, unknown>)?.type === 'worker_limit_exceeded'
    );
    expect(limitCall).toBeDefined();
  });

  it('should store limit context when Worker hands off with scope_escalation', async () => {
    const planState = makeWorkerPlan();
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    const result = await handoff({
      workspace_id: 'ws_test',
      plan_id: 'plan_worker_lifecycle_001',
      from_agent: 'Worker',
      to_agent: 'Coordinator',
      reason: 'Scope escalation — needs architectural change',
      data: {
        scope_escalation: true,
        files_modified: [],
        remaining_work: 'Requires cross-module refactor',
        reason: 'Task scope exceeds Worker boundaries',
      },
    });

    expect(result.success).toBe(true);
    const calls = vi.mocked(store.writeJsonLocked).mock.calls;
    const limitCall = calls.find(
      (call) => (call[1] as Record<string, unknown>)?.type === 'worker_limit_exceeded'
    );
    expect(limitCall).toBeDefined();
    const limitData = limitCall![1] as Record<string, unknown>;
    expect(limitData.scope_escalation).toBe(true);
  });

  it('should NOT store limit context when Worker hands off normally', async () => {
    const planState = makeWorkerPlan();
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    const result = await handoff({
      workspace_id: 'ws_test',
      plan_id: 'plan_worker_lifecycle_001',
      from_agent: 'Worker',
      to_agent: 'Coordinator',
      reason: 'Sub-task complete',
      data: {
        budget_exceeded: false,
        scope_escalation: false,
        files_modified: ['src/foo.ts'],
      },
    });

    expect(result.success).toBe(true);
    const calls = vi.mocked(store.writeJsonLocked).mock.calls;
    const limitCall = calls.find(
      (call) => (call[1] as Record<string, unknown>)?.type === 'worker_limit_exceeded'
    );
    expect(limitCall).toBeUndefined();
  });

  it('should NOT store limit context when non-Worker hands off with budget_exceeded', async () => {
    const planState = makeWorkerPlan({ current_agent: 'Executor' });
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    const result = await handoff({
      workspace_id: 'ws_test',
      plan_id: 'plan_worker_lifecycle_001',
      from_agent: 'Executor',
      to_agent: 'Coordinator',
      reason: 'Done',
      data: {
        budget_exceeded: true,
      },
    });

    expect(result.success).toBe(true);
    const calls = vi.mocked(store.writeJsonLocked).mock.calls;
    const limitCall = calls.find(
      (call) => (call[1] as Record<string, unknown>)?.type === 'worker_limit_exceeded'
    );
    expect(limitCall).toBeUndefined();
  });
});

// =============================================================================
// Worker lineage tracking
// =============================================================================

describe('Worker lineage tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(store, 'savePlanState').mockResolvedValue(undefined);
    vi.spyOn(store, 'generatePlanMd').mockResolvedValue(undefined);
    vi.spyOn(store, 'nowISO').mockReturnValue('2026-02-13T00:00:00.000Z');
    vi.spyOn(store, 'getContextPath').mockReturnValue('/mock/context/path');
    vi.spyOn(store, 'writeJsonLocked').mockResolvedValue(undefined);
  });

  it('should record Worker→Coordinator in lineage after handoff', async () => {
    const planState = makeWorkerPlan({ lineage: [] });
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    await handoff({
      workspace_id: 'ws_test',
      plan_id: 'plan_worker_lifecycle_001',
      from_agent: 'Worker',
      to_agent: 'Coordinator',
      reason: 'Sub-task complete',
    });

    // After handoff, planState.lineage should have the new entry
    expect(planState.lineage.length).toBe(1);
    const entry = planState.lineage[0] as LineageEntry;
    expect(entry.from_agent).toBe('Worker');
    expect(entry.to_agent).toBe('Coordinator');
  });

  it('should set recommended_next_agent on plan state', async () => {
    const planState = makeWorkerPlan();
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    await handoff({
      workspace_id: 'ws_test',
      plan_id: 'plan_worker_lifecycle_001',
      from_agent: 'Worker',
      to_agent: 'Coordinator',
      reason: 'Sub-task done, recommend Reviewer',
    });

    // The handoff function sets recommended_next_agent = to_agent
    expect(planState.recommended_next_agent).toBeDefined();
  });

  it('should save plan state after Worker handoff', async () => {
    const planState = makeWorkerPlan();
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    await handoff({
      workspace_id: 'ws_test',
      plan_id: 'plan_worker_lifecycle_001',
      from_agent: 'Worker',
      to_agent: 'Coordinator',
      reason: 'Done',
    });

    expect(store.savePlanState).toHaveBeenCalledWith(planState);
  });
});

// =============================================================================
// Worker scope limits — AGENT_BOUNDARIES cross-check
// =============================================================================

describe('Worker scope limits (AGENT_BOUNDARIES)', () => {
  it('max_steps should be a positive integer', () => {
    const maxSteps = AGENT_BOUNDARIES.Worker.max_steps!;
    expect(maxSteps).toBeGreaterThan(0);
    expect(Number.isInteger(maxSteps)).toBe(true);
  });

  it('max_context_tokens should be a positive integer', () => {
    const maxTokens = AGENT_BOUNDARIES.Worker.max_context_tokens!;
    expect(maxTokens).toBeGreaterThan(0);
    expect(Number.isInteger(maxTokens)).toBe(true);
  });

  it('max_steps should be less than Executor max (Worker is scope-limited)', () => {
    // Worker has more restrictive limits than full Executor
    // Executor has no max_steps defined — undefined means unlimited
    expect(AGENT_BOUNDARIES.Executor.max_steps).toBeUndefined();
    expect(AGENT_BOUNDARIES.Worker.max_steps).toBeDefined();
  });
});
