import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clonePlan, mergePlans } from '../../tools/plan/plan-lifecycle.js';
import { setPlanPriority } from '../../tools/plan/plan-goals.js';
import * as store from '../../storage/db-store.js';
import { events } from '../../events/event-emitter.js';
import type { PlanState, PlanStep } from '../../types/index.js';

/**
 * Clone, Merge & Priority Tests
 *
 * Tests for clonePlan, mergePlans (plan-lifecycle.ts), and
 * setPlanPriority (plan-goals.ts).
 * Step 13 of plan_mlld2y2l_78778d06.
 */

vi.mock('../../storage/db-store.js');
vi.mock('../../logging/workspace-update-log.js', () => ({
  appendWorkspaceFileUpdate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../events/event-emitter.js', () => ({
  events: {
    planCreated: vi.fn(),
    planUpdated: vi.fn().mockResolvedValue(undefined),
  },
}));

// ===========================================================================
// Fixtures
// ===========================================================================

const WS = 'ws_clone_merge_test';

function makeStep(overrides: Partial<PlanStep> = {}): PlanStep {
  return {
    index: 0,
    phase: 'Phase 1',
    task: 'Default Task',
    status: 'pending',
    ...overrides,
  };
}

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
// clonePlan
// ===========================================================================

describe('clonePlan', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(store.savePlanState).mockResolvedValue(undefined);
    vi.mocked(store.generatePlanMd).mockResolvedValue(undefined);
    vi.mocked(store.nowISO).mockReturnValue('2026-02-14T00:00:00Z');
  });

  it('should create a new plan with a different ID', async () => {
    const source = makePlan({
      id: 'plan_source',
      title: 'Original',
      description: 'Original desc',
      steps: [makeStep({ task: 'Step 1' })],
    });

    const clonedShell = makePlan({ id: 'plan_cloned', title: '', steps: [] });
    vi.mocked(store.getPlanState).mockResolvedValueOnce(source);
    vi.mocked(store.createPlan).mockResolvedValueOnce(clonedShell);

    const result = await clonePlan({
      workspace_id: WS,
      plan_id: 'plan_source',
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.cloned_plan.id).toBe('plan_cloned');
    expect(result.data!.cloned_plan.id).not.toBe('plan_source');
    expect(result.data!.source_plan_id).toBe('plan_source');
  });

  it('should preserve steps, goals, and success_criteria', async () => {
    const source = makePlan({
      id: 'plan_source',
      title: 'With Goals',
      steps: [
        makeStep({ index: 0, task: 'Step A', status: 'done' }),
        makeStep({ index: 1, task: 'Step B', status: 'pending' }),
      ],
      goals: ['Goal 1', 'Goal 2'],
      success_criteria: ['Criteria 1'],
    });

    const clonedShell = makePlan({ id: 'plan_clone2', steps: [] });
    vi.mocked(store.getPlanState).mockResolvedValueOnce(source);
    vi.mocked(store.createPlan).mockResolvedValueOnce(clonedShell);

    const result = await clonePlan({
      workspace_id: WS,
      plan_id: 'plan_source',
      reset_steps: false,
    });

    expect(result.success).toBe(true);
    const cloned = result.data!.cloned_plan;

    // Steps preserved
    expect(cloned.steps).toHaveLength(2);
    expect(cloned.steps[0].task).toBe('Step A');
    expect(cloned.steps[1].task).toBe('Step B');

    // Goals & criteria passed to createPlan
    expect(store.createPlan).toHaveBeenCalledWith(
      WS,
      expect.any(String),
      source.description,
      source.category,
      source.priority,
      source.categorization,
      ['Goal 1', 'Goal 2'],
      ['Criteria 1']
    );
  });

  it('should reset all steps to pending when reset_steps=true (default)', async () => {
    const source = makePlan({
      id: 'plan_source',
      steps: [
        makeStep({ index: 0, task: 'Done Step', status: 'done', notes: 'completed' }),
        makeStep({ index: 1, task: 'Active Step', status: 'active' }),
        makeStep({ index: 2, task: 'Blocked Step', status: 'blocked', notes: 'issue' }),
      ],
    });

    const clonedShell = makePlan({ id: 'plan_reset', steps: [] });
    vi.mocked(store.getPlanState).mockResolvedValueOnce(source);
    vi.mocked(store.createPlan).mockResolvedValueOnce(clonedShell);

    const result = await clonePlan({
      workspace_id: WS,
      plan_id: 'plan_source',
      // reset_steps defaults to true
    });

    expect(result.success).toBe(true);
    const cloned = result.data!.cloned_plan;

    // All steps should be pending
    for (const step of cloned.steps) {
      expect(step.status).toBe('pending');
      expect(step.notes).toBeUndefined();
    }
    expect(cloned.steps).toHaveLength(3);
  });

  it('should preserve step statuses when reset_steps=false', async () => {
    const source = makePlan({
      id: 'plan_source',
      steps: [
        makeStep({ index: 0, task: 'Done Step', status: 'done', notes: 'good' }),
        makeStep({ index: 1, task: 'Pending Step', status: 'pending' }),
      ],
    });

    const clonedShell = makePlan({ id: 'plan_keep', steps: [] });
    vi.mocked(store.getPlanState).mockResolvedValueOnce(source);
    vi.mocked(store.createPlan).mockResolvedValueOnce(clonedShell);

    const result = await clonePlan({
      workspace_id: WS,
      plan_id: 'plan_source',
      reset_steps: false,
    });

    expect(result.success).toBe(true);
    const cloned = result.data!.cloned_plan;
    expect(cloned.steps[0].status).toBe('done');
    expect(cloned.steps[0].notes).toBe('good');
    expect(cloned.steps[1].status).toBe('pending');
  });

  it('should clear sessions and lineage (fresh plan via createPlan)', async () => {
    const source = makePlan({
      id: 'plan_source',
      agent_sessions: [{ session_id: 'sess_1', agent_type: 'Executor', started_at: '2026-01-01T00:00:00Z' }] as any,
      lineage: [{ from: 'A', to: 'B', at: '2026-01-01T00:00:00Z' }] as any,
    });

    const clonedShell = makePlan({
      id: 'plan_fresh',
      steps: [],
      agent_sessions: [],
      lineage: [],
    });
    vi.mocked(store.getPlanState).mockResolvedValueOnce(source);
    vi.mocked(store.createPlan).mockResolvedValueOnce(clonedShell);

    const result = await clonePlan({
      workspace_id: WS,
      plan_id: 'plan_source',
    });

    expect(result.success).toBe(true);
    const cloned = result.data!.cloned_plan;
    // createPlan creates a fresh plan, so sessions and lineage are empty
    expect(cloned.agent_sessions).toEqual([]);
    expect(cloned.lineage).toEqual([]);
  });

  it('should use custom title when provided', async () => {
    const source = makePlan({ id: 'plan_source', title: 'Original Title' });
    const clonedShell = makePlan({ id: 'plan_titled', steps: [] });

    vi.mocked(store.getPlanState).mockResolvedValueOnce(source);
    vi.mocked(store.createPlan).mockResolvedValueOnce(clonedShell);

    const result = await clonePlan({
      workspace_id: WS,
      plan_id: 'plan_source',
      new_title: 'Custom Clone Title',
    });

    expect(result.success).toBe(true);
    expect(store.createPlan).toHaveBeenCalledWith(
      WS,
      'Custom Clone Title',
      'desc',       // source.description
      'feature',    // source.category
      'medium',     // source.priority
      undefined,    // source.categorization (not set in makePlan)
      undefined,    // source.goals → undefined
      undefined     // source.success_criteria → undefined
    );
    expect(result.data!.message).toContain('Custom Clone Title');
  });

  it('should default title to "(Clone)" suffix when no new_title given', async () => {
    const source = makePlan({ id: 'plan_source', title: 'My Plan' });
    const clonedShell = makePlan({ id: 'plan_auto', steps: [] });

    vi.mocked(store.getPlanState).mockResolvedValueOnce(source);
    vi.mocked(store.createPlan).mockResolvedValueOnce(clonedShell);

    await clonePlan({
      workspace_id: WS,
      plan_id: 'plan_source',
    });

    expect(store.createPlan).toHaveBeenCalledWith(
      WS,
      'My Plan (Clone)',
      'desc',       // source.description
      'feature',    // source.category
      'medium',     // source.priority
      undefined,    // source.categorization
      undefined,    // source.goals → undefined
      undefined     // source.success_criteria → undefined
    );
  });

  it('should fail when source plan does not exist', async () => {
    vi.mocked(store.getPlanState).mockResolvedValueOnce(null);

    const result = await clonePlan({
      workspace_id: WS,
      plan_id: 'plan_ghost',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should fail when required fields are missing', async () => {
    const result = await clonePlan({
      workspace_id: WS,
      plan_id: '',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('required');
  });

  it('should emit planCreated event for the clone', async () => {
    const source = makePlan({ id: 'plan_source', title: 'Original' });
    const clonedShell = makePlan({ id: 'plan_evt', steps: [] });

    vi.mocked(store.getPlanState).mockResolvedValueOnce(source);
    vi.mocked(store.createPlan).mockResolvedValueOnce(clonedShell);

    await clonePlan({
      workspace_id: WS,
      plan_id: 'plan_source',
      new_title: 'Clone Title',
    });

    expect(events.planCreated).toHaveBeenCalledWith(
      WS,
      'plan_evt',
      'Clone Title',
      'clone'
    );
  });

  it('should link clone to same program when link_to_same_program=true', async () => {
    const source = makePlan({ id: 'plan_source', program_id: 'prog_1' });
    const program = makePlan({
      id: 'prog_1',
      is_program: true,
      child_plan_ids: ['plan_source'],
    });
    const clonedShell = makePlan({ id: 'plan_linked', steps: [] });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(source)  // load source
      .mockResolvedValueOnce(program); // load program for linking
    vi.mocked(store.createPlan).mockResolvedValueOnce(clonedShell);

    const result = await clonePlan({
      workspace_id: WS,
      plan_id: 'plan_source',
      link_to_same_program: true,
    });

    expect(result.success).toBe(true);
    expect(result.data!.cloned_plan.program_id).toBe('prog_1');
    // Program should have the clone added too
    expect(store.savePlanState).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'prog_1',
        child_plan_ids: expect.arrayContaining(['plan_linked']),
      })
    );
  });
});

// ===========================================================================
// mergePlans
// ===========================================================================

describe('mergePlans', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(store.savePlanState).mockResolvedValue(undefined);
    vi.mocked(store.generatePlanMd).mockResolvedValue(undefined);
    vi.mocked(store.nowISO).mockReturnValue('2026-02-14T00:00:00Z');
    vi.mocked(store.getWorkspace).mockResolvedValue({
      workspace_id: WS,
      workspace_name: 'Test',
      workspace_path: '/test',
      active_plans: [],
      archived_plans: [],
      registered_at: '2026-01-01T00:00:00Z',
    } as any);
    vi.mocked(store.saveWorkspace).mockResolvedValue(undefined);
  });

  it('should combine steps from multiple source plans into target', async () => {
    const target = makePlan({
      id: 'plan_target',
      title: 'Target',
      steps: [makeStep({ index: 0, task: 'Original Step' })],
    });
    const srcA = makePlan({
      id: 'plan_srcA',
      title: 'Source A',
      steps: [
        makeStep({ index: 0, task: 'A Step 1' }),
        makeStep({ index: 1, task: 'A Step 2' }),
      ],
    });
    const srcB = makePlan({
      id: 'plan_srcB',
      title: 'Source B',
      steps: [makeStep({ index: 0, task: 'B Step 1' })],
    });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(target) // load target
      .mockResolvedValueOnce(srcA)   // load source A
      .mockResolvedValueOnce(srcB);  // load source B

    const result = await mergePlans({
      workspace_id: WS,
      target_plan_id: 'plan_target',
      source_plan_ids: ['plan_srcA', 'plan_srcB'],
    });

    expect(result.success).toBe(true);
    expect(result.data!.steps_merged).toBe(3);
    expect(result.data!.message).toContain('3 steps');
    expect(result.data!.message).toContain('2 plans');
  });

  it('should reindex merged steps correctly', async () => {
    const target = makePlan({
      id: 'plan_target',
      title: 'Target',
      steps: [
        makeStep({ index: 0, task: 'Existing 1' }),
        makeStep({ index: 1, task: 'Existing 2' }),
      ],
    });
    const src = makePlan({
      id: 'plan_src',
      title: 'Source',
      steps: [
        makeStep({ index: 0, task: 'Merged 1' }),
        makeStep({ index: 1, task: 'Merged 2' }),
      ],
    });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(src);

    await mergePlans({
      workspace_id: WS,
      target_plan_id: 'plan_target',
      source_plan_ids: ['plan_src'],
    });

    // The target should have been saved with reindexed steps
    const savedTarget = vi.mocked(store.savePlanState).mock.calls[0][0] as PlanState;
    expect(savedTarget.steps).toHaveLength(4);
    expect(savedTarget.steps[0].index).toBe(0);
    expect(savedTarget.steps[1].index).toBe(1);
    expect(savedTarget.steps[2].index).toBe(2);
    expect(savedTarget.steps[3].index).toBe(3);
    expect(savedTarget.steps[2].task).toBe('Merged 1');
    expect(savedTarget.steps[3].task).toBe('Merged 2');
  });

  it('should annotate merged steps with source plan title', async () => {
    const target = makePlan({ id: 'plan_target', steps: [] });
    const src = makePlan({
      id: 'plan_src',
      title: 'Auth Module',
      steps: [makeStep({ index: 0, task: 'Login endpoint' })],
    });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(src);

    await mergePlans({
      workspace_id: WS,
      target_plan_id: 'plan_target',
      source_plan_ids: ['plan_src'],
    });

    const savedTarget = vi.mocked(store.savePlanState).mock.calls[0][0] as PlanState;
    expect(savedTarget.steps[0].notes).toContain('Merged from Auth Module');
  });

  it('should archive source plans when archive_sources=true', async () => {
    const target = makePlan({ id: 'plan_target', steps: [] });
    const src = makePlan({
      id: 'plan_src',
      title: 'Source',
      steps: [makeStep({ index: 0, task: 'Step' })],
    });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(src);

    const result = await mergePlans({
      workspace_id: WS,
      target_plan_id: 'plan_target',
      source_plan_ids: ['plan_src'],
      archive_sources: true,
    });

    expect(result.success).toBe(true);
    expect(result.data!.archived_sources).toContain('plan_src');

    // Source plan should be saved with archived status
    const saveCalls = vi.mocked(store.savePlanState).mock.calls;
    const archivedCall = saveCalls.find(
      call => (call[0] as PlanState).id === 'plan_src'
    );
    expect(archivedCall).toBeDefined();
    expect((archivedCall![0] as PlanState).status).toBe('archived');
  });

  it('should not archive sources when archive_sources is false/default', async () => {
    const target = makePlan({ id: 'plan_target', steps: [] });
    const src = makePlan({
      id: 'plan_src',
      steps: [makeStep({ index: 0, task: 'Step' })],
    });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(src);

    const result = await mergePlans({
      workspace_id: WS,
      target_plan_id: 'plan_target',
      source_plan_ids: ['plan_src'],
    });

    expect(result.success).toBe(true);
    expect(result.data!.archived_sources).toEqual([]);
  });

  it('should error on self-merge', async () => {
    const result = await mergePlans({
      workspace_id: WS,
      target_plan_id: 'plan_A',
      source_plan_ids: ['plan_A'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('cannot merge with itself');
  });

  it('should error when a source plan does not exist', async () => {
    const target = makePlan({ id: 'plan_target', steps: [] });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(target)  // load target
      .mockResolvedValueOnce(null);   // source not found

    const result = await mergePlans({
      workspace_id: WS,
      target_plan_id: 'plan_target',
      source_plan_ids: ['plan_ghost'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
    expect(result.error).toContain('plan_ghost');
  });

  it('should error when target plan does not exist', async () => {
    vi.mocked(store.getPlanState).mockResolvedValueOnce(null);

    const result = await mergePlans({
      workspace_id: WS,
      target_plan_id: 'plan_ghost',
      source_plan_ids: ['plan_src'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should error when required fields are missing', async () => {
    const result = await mergePlans({
      workspace_id: WS,
      target_plan_id: 'plan_target',
      source_plan_ids: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('required');
  });

  it('should emit planUpdated event after merge', async () => {
    const target = makePlan({ id: 'plan_target', steps: [] });
    const src = makePlan({
      id: 'plan_src',
      steps: [makeStep({ index: 0, task: 'Step' })],
    });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(src);

    await mergePlans({
      workspace_id: WS,
      target_plan_id: 'plan_target',
      source_plan_ids: ['plan_src'],
    });

    expect(events.planUpdated).toHaveBeenCalledWith(
      WS,
      'plan_target',
      expect.objectContaining({
        merged_from: ['plan_src'],
        steps_merged: 1,
      })
    );
  });

  it('should handle merging from multiple sources', async () => {
    const target = makePlan({ id: 'plan_target', title: 'Target', steps: [] });
    const srcA = makePlan({
      id: 'plan_srcA',
      title: 'Src A',
      steps: [makeStep({ index: 0, task: 'A1' })],
    });
    const srcB = makePlan({
      id: 'plan_srcB',
      title: 'Src B',
      steps: [
        makeStep({ index: 0, task: 'B1' }),
        makeStep({ index: 1, task: 'B2' }),
      ],
    });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(srcA)
      .mockResolvedValueOnce(srcB);

    const result = await mergePlans({
      workspace_id: WS,
      target_plan_id: 'plan_target',
      source_plan_ids: ['plan_srcA', 'plan_srcB'],
    });

    expect(result.success).toBe(true);
    expect(result.data!.steps_merged).toBe(3);
    expect(result.data!.source_plan_ids).toEqual(['plan_srcA', 'plan_srcB']);
  });
});

// ===========================================================================
// setPlanPriority
// ===========================================================================

describe('setPlanPriority', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(store.savePlanState).mockResolvedValue(undefined);
    vi.mocked(store.generatePlanMd).mockResolvedValue(undefined);
    vi.mocked(store.nowISO).mockReturnValue('2026-02-14T00:00:00Z');
  });

  it.each(['low', 'medium', 'high', 'critical'] as const)(
    'should accept valid priority: %s',
    async (priority) => {
      const plan = makePlan({ id: 'plan_A', priority: 'medium' });
      vi.mocked(store.getPlanState).mockResolvedValueOnce(plan);

      const result = await setPlanPriority({
        workspace_id: WS,
        plan_id: 'plan_A',
        priority,
      });

      expect(result.success).toBe(true);
      expect(result.data!.priority).toBe(priority);
      expect(result.data!.previous_priority).toBe('medium');
    }
  );

  it('should save the plan with updated priority', async () => {
    const plan = makePlan({ id: 'plan_A', priority: 'low' });
    vi.mocked(store.getPlanState).mockResolvedValueOnce(plan);

    await setPlanPriority({
      workspace_id: WS,
      plan_id: 'plan_A',
      priority: 'critical',
    });

    expect(store.savePlanState).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'plan_A',
        priority: 'critical',
      })
    );
    expect(store.generatePlanMd).toHaveBeenCalled();
  });

  it('should emit planUpdated event with priority change', async () => {
    const plan = makePlan({ id: 'plan_A', priority: 'low' });
    vi.mocked(store.getPlanState).mockResolvedValueOnce(plan);

    await setPlanPriority({
      workspace_id: WS,
      plan_id: 'plan_A',
      priority: 'high',
    });

    expect(events.planUpdated).toHaveBeenCalledWith(
      WS,
      'plan_A',
      expect.objectContaining({
        priority_changed: { from: 'low', to: 'high' },
      })
    );
  });

  it('should include a summary message', async () => {
    const plan = makePlan({ id: 'plan_A', priority: 'low' });
    vi.mocked(store.getPlanState).mockResolvedValueOnce(plan);

    const result = await setPlanPriority({
      workspace_id: WS,
      plan_id: 'plan_A',
      priority: 'high',
    });

    expect(result.success).toBe(true);
    expect(result.data!.message).toContain('low');
    expect(result.data!.message).toContain('high');
  });

  it('should reject invalid priority value', async () => {
    const result = await setPlanPriority({
      workspace_id: WS,
      plan_id: 'plan_A',
      priority: 'urgent' as any,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid priority');
    expect(result.error).toContain('urgent');
  });

  it('should reject empty priority', async () => {
    const result = await setPlanPriority({
      workspace_id: WS,
      plan_id: 'plan_A',
      priority: '' as any,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid priority');
  });

  it('should error when plan does not exist', async () => {
    vi.mocked(store.getPlanState).mockResolvedValueOnce(null);

    const result = await setPlanPriority({
      workspace_id: WS,
      plan_id: 'plan_ghost',
      priority: 'high',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should error when required fields are missing', async () => {
    const result = await setPlanPriority({
      workspace_id: WS,
      plan_id: '',
      priority: 'high',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('required');
  });
});
