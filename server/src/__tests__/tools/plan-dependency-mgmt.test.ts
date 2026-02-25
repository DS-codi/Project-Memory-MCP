import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setPlanDependencies,
  getPlanDependencies,
} from '../../tools/plan/plan-programs.js';
import * as store from '../../storage/db-store.js';
import { events } from '../../events/event-emitter.js';
import type { PlanState } from '../../types/index.js';

/**
 * Plan Dependency Management Tests
 *
 * Tests for setPlanDependencies and getPlanDependencies actions.
 * Step 12 of plan_mlld2y2l_78778d06.
 */

vi.mock('../../storage/db-store.js');
vi.mock('../../events/event-emitter.js', () => ({
  events: {
    planCreated: vi.fn(),
    planUpdated: vi.fn().mockResolvedValue(undefined),
  },
}));

// ===========================================================================
// Fixtures
// ===========================================================================

const WS = 'ws_deps_mgmt_test';

function makePlan(overrides: Partial<PlanState> = {}): PlanState {
  return {
    id: 'plan_default',
    workspace_id: WS,
    title: 'Test Plan',
    description: 'desc',
    category: 'feature',
    priority: 'medium',
    status: 'active',
    current_phase: 'Phase 1',
    current_agent: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    steps: [],
    agent_sessions: [],
    lineage: [],
    ...overrides,
  };
}

// ===========================================================================
// setPlanDependencies
// ===========================================================================

describe('setPlanDependencies', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(store.savePlanState).mockResolvedValue(undefined);
    vi.mocked(store.generatePlanMd).mockResolvedValue(undefined);
    vi.mocked(store.nowISO).mockReturnValue('2026-02-14T00:00:00Z');
  });

  it('should set dependencies successfully', async () => {
    const plan = makePlan({ id: 'plan_A' });
    const depB = makePlan({ id: 'plan_B' });
    const depC = makePlan({ id: 'plan_C' });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(plan)  // load plan_A
      .mockResolvedValueOnce(depB)  // validate plan_B exists
      .mockResolvedValueOnce(depC)  // validate plan_C exists
      // validatePlanDependencies DFS calls:
      .mockResolvedValueOnce(depB)  // check plan_B for cycle
      .mockResolvedValueOnce(depC); // check plan_C for cycle

    const result = await setPlanDependencies({
      workspace_id: WS,
      plan_id: 'plan_A',
      depends_on_plans: ['plan_B', 'plan_C'],
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.depends_on_plans).toEqual(['plan_B', 'plan_C']);
    expect(result.data!.message).toContain('2 dependencies');
  });

  it('should save the plan with updated depends_on_plans', async () => {
    const plan = makePlan({ id: 'plan_A' });
    const depB = makePlan({ id: 'plan_B' });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(plan)
      .mockResolvedValueOnce(depB)
      .mockResolvedValueOnce(depB);

    await setPlanDependencies({
      workspace_id: WS,
      plan_id: 'plan_A',
      depends_on_plans: ['plan_B'],
    });

    expect(store.savePlanState).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'plan_A',
        depends_on_plans: ['plan_B'],
      })
    );
    expect(store.generatePlanMd).toHaveBeenCalled();
  });

  it('should emit planUpdated event', async () => {
    const plan = makePlan({ id: 'plan_A' });
    const depB = makePlan({ id: 'plan_B' });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(plan)
      .mockResolvedValueOnce(depB)
      .mockResolvedValueOnce(depB);

    await setPlanDependencies({
      workspace_id: WS,
      plan_id: 'plan_A',
      depends_on_plans: ['plan_B'],
    });

    expect(events.planUpdated).toHaveBeenCalledWith(
      WS,
      'plan_A',
      expect.objectContaining({ dependencies_updated: ['plan_B'] })
    );
  });

  it('should detect circular dependency (A→B→A)', async () => {
    const planA = makePlan({ id: 'plan_A' });
    const planB = makePlan({ id: 'plan_B', depends_on_plans: ['plan_A'] });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(planA)  // load plan_A
      .mockResolvedValueOnce(planB)  // validate plan_B exists
      .mockResolvedValueOnce(planB); // validatePlanDependencies DFS: plan_B depends on plan_A

    const result = await setPlanDependencies({
      workspace_id: WS,
      plan_id: 'plan_A',
      depends_on_plans: ['plan_B'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Circular dependency');
  });

  it('should detect self-dependency', async () => {
    const planA = makePlan({ id: 'plan_A' });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(planA)  // load plan_A
      .mockResolvedValueOnce(planA); // validate plan_A exists (it references itself)
    // validatePlanDependencies: planId === depId shortcut triggers

    const result = await setPlanDependencies({
      workspace_id: WS,
      plan_id: 'plan_A',
      depends_on_plans: ['plan_A'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Circular dependency');
  });

  it('should fail when a dependency plan does not exist', async () => {
    const planA = makePlan({ id: 'plan_A' });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(planA)  // load plan_A
      .mockResolvedValueOnce(null);  // plan_B not found

    const result = await setPlanDependencies({
      workspace_id: WS,
      plan_id: 'plan_A',
      depends_on_plans: ['plan_B'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
    expect(result.error).toContain('plan_B');
  });

  it('should allow clearing dependencies with empty array', async () => {
    const planA = makePlan({ id: 'plan_A', depends_on_plans: ['plan_B'] });

    vi.mocked(store.getPlanState).mockResolvedValueOnce(planA);

    const result = await setPlanDependencies({
      workspace_id: WS,
      plan_id: 'plan_A',
      depends_on_plans: [],
    });

    expect(result.success).toBe(true);
    expect(result.data!.depends_on_plans).toEqual([]);
    expect(result.data!.message).toContain('Cleared');
  });

  it('should fail when plan does not exist', async () => {
    vi.mocked(store.getPlanState).mockResolvedValueOnce(null);

    const result = await setPlanDependencies({
      workspace_id: WS,
      plan_id: 'plan_ghost',
      depends_on_plans: ['plan_B'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should fail when required fields are missing', async () => {
    const result = await setPlanDependencies({
      workspace_id: WS,
      plan_id: '',
      depends_on_plans: ['plan_B'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('required');
  });

  it('should fail when depends_on_plans is not an array', async () => {
    const result = await setPlanDependencies({
      workspace_id: WS,
      plan_id: 'plan_A',
      depends_on_plans: 'plan_B' as any,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('array');
  });

  it('should report all missing plans in a single error', async () => {
    const planA = makePlan({ id: 'plan_A' });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(planA)  // load plan_A
      .mockResolvedValueOnce(null)   // plan_B not found
      .mockResolvedValueOnce(null);  // plan_C not found

    const result = await setPlanDependencies({
      workspace_id: WS,
      plan_id: 'plan_A',
      depends_on_plans: ['plan_B', 'plan_C'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('plan_B');
    expect(result.error).toContain('plan_C');
  });
});

// ===========================================================================
// getPlanDependencies
// ===========================================================================

describe('getPlanDependencies', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return correct depends_on list', async () => {
    const planA = makePlan({
      id: 'plan_A',
      depends_on_plans: ['plan_B', 'plan_C'],
    });

    vi.mocked(store.getPlanState).mockResolvedValueOnce(planA);
    vi.mocked(store.getWorkspacePlans).mockResolvedValueOnce([]);

    const result = await getPlanDependencies({
      workspace_id: WS,
      plan_id: 'plan_A',
    });

    expect(result.success).toBe(true);
    expect(result.data!.depends_on_plans).toEqual(['plan_B', 'plan_C']);
  });

  it('should return correct dependents (reverse lookups)', async () => {
    const planA = makePlan({ id: 'plan_A' });
    const planB = makePlan({ id: 'plan_B', depends_on_plans: ['plan_A'] });
    const planC = makePlan({ id: 'plan_C', depends_on_plans: ['plan_A'] });
    const planD = makePlan({ id: 'plan_D' }); // does NOT depend on plan_A

    vi.mocked(store.getPlanState).mockResolvedValueOnce(planA);
    vi.mocked(store.getWorkspacePlans).mockResolvedValueOnce([
      planA, planB, planC, planD,
    ]);

    const result = await getPlanDependencies({
      workspace_id: WS,
      plan_id: 'plan_A',
    });

    expect(result.success).toBe(true);
    expect(result.data!.dependents).toContain('plan_B');
    expect(result.data!.dependents).toContain('plan_C');
    expect(result.data!.dependents).not.toContain('plan_D');
    expect(result.data!.dependents).toHaveLength(2);
  });

  it('should return empty arrays when plan has no dependencies', async () => {
    const planA = makePlan({ id: 'plan_A' }); // no depends_on_plans

    vi.mocked(store.getPlanState).mockResolvedValueOnce(planA);
    vi.mocked(store.getWorkspacePlans).mockResolvedValueOnce([planA]);

    const result = await getPlanDependencies({
      workspace_id: WS,
      plan_id: 'plan_A',
    });

    expect(result.success).toBe(true);
    expect(result.data!.depends_on_plans).toEqual([]);
    expect(result.data!.dependents).toEqual([]);
  });

  it('should not include itself in dependents', async () => {
    const planA = makePlan({ id: 'plan_A', depends_on_plans: ['plan_B'] });

    vi.mocked(store.getPlanState).mockResolvedValueOnce(planA);
    vi.mocked(store.getWorkspacePlans).mockResolvedValueOnce([planA]);

    const result = await getPlanDependencies({
      workspace_id: WS,
      plan_id: 'plan_A',
    });

    expect(result.success).toBe(true);
    expect(result.data!.dependents).not.toContain('plan_A');
  });

  it('should include a summary message', async () => {
    const planA = makePlan({
      id: 'plan_A',
      depends_on_plans: ['plan_B'],
    });
    const planC = makePlan({ id: 'plan_C', depends_on_plans: ['plan_A'] });

    vi.mocked(store.getPlanState).mockResolvedValueOnce(planA);
    vi.mocked(store.getWorkspacePlans).mockResolvedValueOnce([planA, planC]);

    const result = await getPlanDependencies({
      workspace_id: WS,
      plan_id: 'plan_A',
    });

    expect(result.success).toBe(true);
    expect(result.data!.message).toContain('1 dependencies');
    expect(result.data!.message).toContain('1 dependents');
  });

  it('should fail when plan does not exist', async () => {
    vi.mocked(store.getPlanState).mockResolvedValueOnce(null);

    const result = await getPlanDependencies({
      workspace_id: WS,
      plan_id: 'plan_ghost',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should fail when required fields are missing', async () => {
    const result = await getPlanDependencies({
      workspace_id: WS,
      plan_id: '',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('required');
  });
});
