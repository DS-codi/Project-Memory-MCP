import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createProgram,
  addPlanToProgram,
  upgradeToProgram,
  listProgramPlans,
} from '../../tools/plan/plan-programs.js';
import * as store from '../../storage/file-store.js';
import { events } from '../../events/event-emitter.js';
import type { PlanState } from '../../types/index.js';

/**
 * Plan Programs Test
 *
 * Tests for Integrated Program CRUD operations:
 * createProgram, addPlanToProgram, upgradeToProgram, listProgramPlans.
 */

vi.mock('../../storage/file-store.js');
vi.mock('../../events/event-emitter.js', () => ({
  events: { planCreated: vi.fn() },
}));

// ===========================================================================
// Fixtures
// ===========================================================================

const WS = 'ws_prog_test';

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

function makeProgram(overrides: Partial<PlanState> = {}): PlanState {
  return makePlan({
    id: 'prog_1',
    title: 'Test Program',
    is_program: true,
    child_plan_ids: [],
    current_phase: 'Program Container',
    ...overrides,
  });
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Plan Programs (plan-programs.ts)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default store mock behaviors
    vi.mocked(store.savePlanState).mockResolvedValue(undefined);
    vi.mocked(store.getWorkspace).mockResolvedValue({
      workspace_id: WS,
      workspace_name: 'Test',
      workspace_path: '/test',
      active_plans: [],
      registered_at: '2026-01-01T00:00:00Z',
    } as any);
    vi.mocked(store.saveWorkspace).mockResolvedValue(undefined);
    vi.mocked(store.nowISO).mockReturnValue('2026-02-13T00:00:00Z');
  });

  // =========================================================================
  // createProgram
  // =========================================================================

  describe('createProgram', () => {
    it('should create a plan with is_program=true', async () => {
      const createdPlan = makePlan({ id: 'prog_new' });
      vi.mocked(store.createPlan).mockResolvedValue(createdPlan);

      const result = await createProgram({
        workspace_id: WS,
        title: 'My Program',
        description: 'Big effort',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.is_program).toBe(true);
      expect(result.data!.child_plan_ids).toEqual([]);
      expect(result.data!.current_phase).toBe('Program Container');
    });

    it('should call savePlanState with the program', async () => {
      const createdPlan = makePlan({ id: 'prog_save' });
      vi.mocked(store.createPlan).mockResolvedValue(createdPlan);

      await createProgram({
        workspace_id: WS,
        title: 'My Program',
        description: 'desc',
      });

      expect(store.savePlanState).toHaveBeenCalledWith(
        expect.objectContaining({ is_program: true })
      );
    });

    it('should emit planCreated event', async () => {
      const createdPlan = makePlan({ id: 'prog_evt' });
      vi.mocked(store.createPlan).mockResolvedValue(createdPlan);

      await createProgram({
        workspace_id: WS,
        title: 'Evented Program',
        description: 'desc',
      });

      expect(events.planCreated).toHaveBeenCalledWith(
        WS,
        'prog_evt',
        'Evented Program',
        'program'
      );
    });

    it('should update workspace active_programs', async () => {
      const createdPlan = makePlan({ id: 'prog_ws' });
      vi.mocked(store.createPlan).mockResolvedValue(createdPlan);

      await createProgram({
        workspace_id: WS,
        title: 'WS Program',
        description: 'desc',
      });

      expect(store.saveWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          active_programs: expect.arrayContaining(['prog_ws']),
        })
      );
    });

    it('should fail when required fields are missing', async () => {
      const result = await createProgram({
        workspace_id: WS,
        title: '',
        description: 'desc',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should respect priority parameter', async () => {
      const createdPlan = makePlan({ id: 'prog_pri' });
      vi.mocked(store.createPlan).mockResolvedValue(createdPlan);

      await createProgram({
        workspace_id: WS,
        title: 'High Priority',
        description: 'urgent',
        priority: 'critical',
      });

      expect(store.createPlan).toHaveBeenCalledWith(
        WS, 'High Priority', 'urgent', 'feature', 'critical'
      );
    });
  });

  // =========================================================================
  // addPlanToProgram
  // =========================================================================

  describe('addPlanToProgram', () => {
    it('should link a plan to a program', async () => {
      const program = makeProgram();
      const plan = makePlan({ id: 'plan_child' });

      vi.mocked(store.getPlanState)
        .mockResolvedValueOnce(program)  // load program
        .mockResolvedValueOnce(plan);    // load plan

      const result = await addPlanToProgram({
        workspace_id: WS,
        program_id: 'prog_1',
        plan_id: 'plan_child',
      });

      expect(result.success).toBe(true);
      expect(result.data!.plan.program_id).toBe('prog_1');
      expect(result.data!.program.child_plan_ids).toContain('plan_child');
    });

    it('should prevent a program from containing itself', async () => {
      const result = await addPlanToProgram({
        workspace_id: WS,
        program_id: 'prog_1',
        plan_id: 'prog_1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot contain itself');
    });

    it('should reject if target is not a program', async () => {
      const notProgram = makePlan({ id: 'plan_notprog' });
      vi.mocked(store.getPlanState).mockResolvedValueOnce(notProgram);

      const result = await addPlanToProgram({
        workspace_id: WS,
        program_id: 'plan_notprog',
        plan_id: 'plan_child',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a program');
    });

    it('should reject if plan already belongs to another program', async () => {
      const program = makeProgram();
      const plan = makePlan({ id: 'plan_owned', program_id: 'other_prog' });

      vi.mocked(store.getPlanState)
        .mockResolvedValueOnce(program)
        .mockResolvedValueOnce(plan);

      const result = await addPlanToProgram({
        workspace_id: WS,
        program_id: 'prog_1',
        plan_id: 'plan_owned',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already belongs to program');
    });

    it('should prevent circular references', async () => {
      // plan_child is itself a program containing prog_1
      const program = makeProgram({ id: 'prog_1' });
      const childProgram = makeProgram({
        id: 'plan_child',
        child_plan_ids: ['prog_1'],
      });

      vi.mocked(store.getPlanState)
        .mockResolvedValueOnce(program)       // load program (prog_1)
        .mockResolvedValueOnce(childProgram)  // load plan_child for addPlanToProgram
        .mockResolvedValueOnce(childProgram); // wouldCreateCycle loads plan_child → finds 'prog_1' in child_plan_ids === programId → cycle detected

      const result = await addPlanToProgram({
        workspace_id: WS,
        program_id: 'prog_1',
        plan_id: 'plan_child',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('circular reference');
    });

    it('should no-op if plan is already linked', async () => {
      const program = makeProgram({ child_plan_ids: ['plan_child'] });
      const plan = makePlan({ id: 'plan_child' });

      vi.mocked(store.getPlanState)
        .mockResolvedValueOnce(program)   // load program
        .mockResolvedValueOnce(plan)      // load plan
        .mockResolvedValueOnce(plan);     // wouldCreateCycle re-loads plan

      const result = await addPlanToProgram({
        workspace_id: WS,
        program_id: 'prog_1',
        plan_id: 'plan_child',
      });

      expect(result.success).toBe(true);
      // savePlanState should NOT be called for a no-op
      expect(store.savePlanState).not.toHaveBeenCalled();
    });

    it('should fail when required fields are missing', async () => {
      const result = await addPlanToProgram({
        workspace_id: WS,
        program_id: '',
        plan_id: 'plan_child',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });
  });

  // =========================================================================
  // upgradeToProgram
  // =========================================================================

  describe('upgradeToProgram', () => {
    it('should convert an existing plan to a program', async () => {
      const plan = makePlan({ id: 'plan_up', steps: [] });
      vi.mocked(store.getPlanState).mockResolvedValueOnce(plan);

      const result = await upgradeToProgram({
        workspace_id: WS,
        plan_id: 'plan_up',
      });

      expect(result.success).toBe(true);
      expect(result.data!.program.is_program).toBe(true);
      expect(result.data!.program.current_phase).toBe('Program Container');
      expect(result.data!.program.child_plan_ids).toEqual([]);
    });

    it('should fail if plan is already a program', async () => {
      const program = makeProgram({ id: 'prog_already' });
      vi.mocked(store.getPlanState).mockResolvedValueOnce(program);

      const result = await upgradeToProgram({
        workspace_id: WS,
        plan_id: 'prog_already',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already a program');
    });

    it('should fail if plan belongs to another program', async () => {
      const plan = makePlan({ id: 'plan_child', program_id: 'other_prog' });
      vi.mocked(store.getPlanState).mockResolvedValueOnce(plan);

      const result = await upgradeToProgram({
        workspace_id: WS,
        plan_id: 'plan_child',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('belongs to program');
    });

    it('should create a child plan when move_steps_to_child=true', async () => {
      const steps = [
        { index: 0, phase: 'P1', task: 'T1', status: 'done' as const },
        { index: 1, phase: 'P1', task: 'T2', status: 'pending' as const },
      ];
      const plan = makePlan({ id: 'plan_migrate', steps, category: 'bugfix' });
      const childPlan = makePlan({ id: 'child_new' });

      vi.mocked(store.getPlanState).mockResolvedValueOnce(plan);
      vi.mocked(store.createPlan).mockResolvedValueOnce(childPlan);

      const result = await upgradeToProgram({
        workspace_id: WS,
        plan_id: 'plan_migrate',
        move_steps_to_child: true,
        child_plan_title: 'Migrated Steps',
      });

      expect(result.success).toBe(true);
      // Original plan should now have no steps
      expect(result.data!.program.steps).toEqual([]);
      // Child plan should exist
      expect(result.data!.child_plan).toBeDefined();
      // Child should have the migrated steps
      expect(result.data!.child_plan!.steps).toHaveLength(2);
      // Child should reference the parent program
      expect(result.data!.child_plan!.program_id).toBe('plan_migrate');
      // Program should list the child
      expect(result.data!.program.child_plan_ids).toContain('child_new');
    });

    it('should update workspace active_programs', async () => {
      const plan = makePlan({ id: 'plan_ws_up' });
      vi.mocked(store.getPlanState).mockResolvedValueOnce(plan);

      await upgradeToProgram({ workspace_id: WS, plan_id: 'plan_ws_up' });

      expect(store.saveWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          active_programs: expect.arrayContaining(['plan_ws_up']),
        })
      );
    });

    it('should fail when required fields are missing', async () => {
      const result = await upgradeToProgram({
        workspace_id: '',
        plan_id: 'plan_x',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });
  });

  // =========================================================================
  // listProgramPlans
  // =========================================================================

  describe('listProgramPlans', () => {
    it('should return child plan summaries and aggregate progress', async () => {
      const childA = makePlan({
        id: 'child_a',
        title: 'Child A',
        status: 'active',
        steps: [
          { index: 0, phase: 'P1', task: 'T1', status: 'done' },
          { index: 1, phase: 'P1', task: 'T2', status: 'pending' },
        ],
      });
      const childB = makePlan({
        id: 'child_b',
        title: 'Child B',
        status: 'completed',
        steps: [
          { index: 0, phase: 'P1', task: 'T1', status: 'done' },
          { index: 1, phase: 'P1', task: 'T2', status: 'done' },
        ],
      });
      const program = makeProgram({ child_plan_ids: ['child_a', 'child_b'] });

      vi.mocked(store.getPlanState)
        .mockResolvedValueOnce(program)  // load program
        .mockResolvedValueOnce(childA)   // load child_a
        .mockResolvedValueOnce(childB);  // load child_b

      const result = await listProgramPlans({
        workspace_id: WS,
        program_id: 'prog_1',
      });

      expect(result.success).toBe(true);
      const data = result.data!;

      // Child plan summaries
      expect(data.child_plans).toHaveLength(2);
      expect(data.child_plans[0].plan_id).toBe('child_a');
      expect(data.child_plans[0].steps_total).toBe(2);
      expect(data.child_plans[0].steps_done).toBe(1);
      expect(data.child_plans[1].plan_id).toBe('child_b');
      expect(data.child_plans[1].steps_done).toBe(2);

      // Aggregate progress
      expect(data.aggregate.total_plans).toBe(2);
      expect(data.aggregate.total_steps).toBe(4);
      expect(data.aggregate.done_steps).toBe(3);
      expect(data.aggregate.completion_percentage).toBe(75);
    });

    it('should fail if target is not a program', async () => {
      const plan = makePlan({ id: 'not_prog' });
      vi.mocked(store.getPlanState).mockResolvedValueOnce(plan);

      const result = await listProgramPlans({
        workspace_id: WS,
        program_id: 'not_prog',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a program');
    });

    it('should handle empty program with no children', async () => {
      const program = makeProgram({ child_plan_ids: [] });
      vi.mocked(store.getPlanState).mockResolvedValueOnce(program);

      const result = await listProgramPlans({
        workspace_id: WS,
        program_id: 'prog_1',
      });

      expect(result.success).toBe(true);
      expect(result.data!.child_plans).toEqual([]);
      expect(result.data!.aggregate.total_plans).toBe(0);
      expect(result.data!.aggregate.completion_percentage).toBe(0);
    });

    it('should skip missing child plans gracefully', async () => {
      const program = makeProgram({ child_plan_ids: ['exists', 'gone'] });
      const existingChild = makePlan({
        id: 'exists',
        title: 'Exists',
        steps: [{ index: 0, phase: 'P1', task: 'T1', status: 'done' }],
      });

      vi.mocked(store.getPlanState)
        .mockResolvedValueOnce(program)
        .mockResolvedValueOnce(existingChild)
        .mockResolvedValueOnce(null);  // 'gone' not found

      const result = await listProgramPlans({
        workspace_id: WS,
        program_id: 'prog_1',
      });

      expect(result.success).toBe(true);
      expect(result.data!.child_plans).toHaveLength(1);
      expect(result.data!.aggregate.total_plans).toBe(1);
    });

    it('should fail when required fields are missing', async () => {
      const result = await listProgramPlans({
        workspace_id: WS,
        program_id: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });
  });
});
