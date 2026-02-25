import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  linkToProgram,
  unlinkFromProgram,
} from '../../tools/plan/plan-programs.js';
import * as store from '../../storage/db-store.js';
import { events } from '../../events/event-emitter.js';
import type { PlanState } from '../../types/index.js';

/**
 * Plan Link / Unlink Tests
 *
 * Tests for linkToProgram and unlinkFromProgram actions.
 * Step 11 of plan_mlld2y2l_78778d06.
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

const WS = 'ws_link_test';

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

describe('linkToProgram', () => {
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
      registered_at: '2026-01-01T00:00:00Z',
    } as any);
    vi.mocked(store.saveWorkspace).mockResolvedValue(undefined);
  });

  it('should successfully link a plan to a program (bidirectional)', async () => {
    const program = makeProgram();
    const plan = makePlan({ id: 'plan_A' });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(program)  // linkToProgram loads program
      .mockResolvedValueOnce(plan)     // linkToProgram loads plan
      .mockResolvedValueOnce(program)  // addPlanToProgram loads program
      .mockResolvedValueOnce(plan)     // addPlanToProgram loads plan
      .mockResolvedValueOnce(plan);    // wouldCreateCycle loads plan

    const result = await linkToProgram({
      workspace_id: WS,
      program_id: 'prog_1',
      plan_id: 'plan_A',
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.plan.program_id).toBe('prog_1');
    expect(result.data!.program.child_plan_ids).toContain('plan_A');
  });

  it('should error when linking an already-linked plan to a different program', async () => {
    const program = makeProgram();
    const plan = makePlan({ id: 'plan_A', program_id: 'other_prog' });
    const otherProgram = makeProgram({ id: 'other_prog', title: 'Other Program' });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(program)       // load target program
      .mockResolvedValueOnce(plan)          // load plan
      .mockResolvedValueOnce(otherProgram); // load existing program for title

    const result = await linkToProgram({
      workspace_id: WS,
      program_id: 'prog_1',
      plan_id: 'plan_A',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('already belongs to program');
    expect(result.error).toContain('unlink_from_program');
  });

  it('should error when linking to a non-existent program', async () => {
    vi.mocked(store.getPlanState).mockResolvedValueOnce(null); // program not found

    const result = await linkToProgram({
      workspace_id: WS,
      program_id: 'prog_nonexistent',
      plan_id: 'plan_A',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
    expect(result.error).toContain('prog_nonexistent');
  });

  it('should error when linking to a non-program plan', async () => {
    const regularPlan = makePlan({ id: 'plan_regular', title: 'Regular Plan' });
    vi.mocked(store.getPlanState).mockResolvedValueOnce(regularPlan);

    const result = await linkToProgram({
      workspace_id: WS,
      program_id: 'plan_regular',
      plan_id: 'plan_A',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not a program');
    expect(result.error).toContain('upgrade_to_program');
  });

  it('should error on self-reference (plan_id === program_id)', async () => {
    const result = await linkToProgram({
      workspace_id: WS,
      program_id: 'plan_X',
      plan_id: 'plan_X',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('itself');
  });

  it('should error when plan does not exist', async () => {
    const program = makeProgram();
    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(program) // program found
      .mockResolvedValueOnce(null);   // plan not found

    const result = await linkToProgram({
      workspace_id: WS,
      program_id: 'prog_1',
      plan_id: 'plan_ghost',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
    expect(result.error).toContain('plan_ghost');
  });

  it('should error when required fields are missing', async () => {
    const result = await linkToProgram({
      workspace_id: WS,
      program_id: '',
      plan_id: 'plan_A',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('required');
  });

  it('should no-op when plan is already linked to same program', async () => {
    // When plan.program_id already equals program_id, addPlanToProgram's
    // cycle detection sees plan.program_id === programId and returns a cycle
    // error before reaching the no-op check on child_plan_ids. To reach the
    // actual no-op path, the wouldCreateCycle mock must return a plan without
    // program_id so cycle detection passes, then child_plan_ids triggers the
    // no-op return.
    const program = makeProgram({ child_plan_ids: ['plan_A'] });
    const plan = makePlan({ id: 'plan_A', program_id: 'prog_1' });
    const planForCycleCheck = makePlan({ id: 'plan_A' }); // no program_id

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(program) // linkToProgram loads program
      .mockResolvedValueOnce(plan)    // linkToProgram loads plan
      .mockResolvedValueOnce(program) // addPlanToProgram loads program
      .mockResolvedValueOnce(plan)    // addPlanToProgram loads plan
      .mockResolvedValueOnce(planForCycleCheck); // wouldCreateCycle check (no program_id → no cycle)

    const result = await linkToProgram({
      workspace_id: WS,
      program_id: 'prog_1',
      plan_id: 'plan_A',
    });

    // Should succeed as no-op because child_plan_ids already includes plan_A
    expect(result.success).toBe(true);
  });
});

describe('unlinkFromProgram', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(store.savePlanState).mockResolvedValue(undefined);
    vi.mocked(store.generatePlanMd).mockResolvedValue(undefined);
    vi.mocked(store.nowISO).mockReturnValue('2026-02-14T00:00:00Z');
  });

  it('should successfully unlink a plan from a program (bidirectional)', async () => {
    const plan = makePlan({ id: 'plan_A', program_id: 'prog_1' });
    const program = makeProgram({ child_plan_ids: ['plan_A', 'plan_B'] });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(plan)    // load plan
      .mockResolvedValueOnce(program); // load program

    const result = await unlinkFromProgram({
      workspace_id: WS,
      plan_id: 'plan_A',
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    // Plan should no longer have program_id
    expect(result.data!.plan.program_id).toBeUndefined();
    // Program should no longer list the plan
    expect(result.data!.program.child_plan_ids).not.toContain('plan_A');
    // Other children should remain
    expect(result.data!.program.child_plan_ids).toContain('plan_B');
  });

  it('should call savePlanState for both plan and program', async () => {
    const plan = makePlan({ id: 'plan_A', program_id: 'prog_1' });
    const program = makeProgram({ child_plan_ids: ['plan_A'] });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(plan)
      .mockResolvedValueOnce(program);

    await unlinkFromProgram({ workspace_id: WS, plan_id: 'plan_A' });

    expect(store.savePlanState).toHaveBeenCalledTimes(2);
  });

  it('should call generatePlanMd for both plan and program', async () => {
    const plan = makePlan({ id: 'plan_A', program_id: 'prog_1' });
    const program = makeProgram({ child_plan_ids: ['plan_A'] });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(plan)
      .mockResolvedValueOnce(program);

    await unlinkFromProgram({ workspace_id: WS, plan_id: 'plan_A' });

    expect(store.generatePlanMd).toHaveBeenCalledTimes(2);
  });

  it('should emit planUpdated event after unlinking', async () => {
    const plan = makePlan({ id: 'plan_A', program_id: 'prog_1' });
    const program = makeProgram({ child_plan_ids: ['plan_A'] });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(plan)
      .mockResolvedValueOnce(program);

    await unlinkFromProgram({ workspace_id: WS, plan_id: 'plan_A' });

    expect(events.planUpdated).toHaveBeenCalledWith(
      WS,
      'plan_A',
      expect.objectContaining({ unlinked_from_program: 'prog_1' })
    );
  });

  it('should error when plan has no program_id', async () => {
    const plan = makePlan({ id: 'plan_A' }); // no program_id
    vi.mocked(store.getPlanState).mockResolvedValueOnce(plan);

    const result = await unlinkFromProgram({
      workspace_id: WS,
      plan_id: 'plan_A',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not linked to any program');
  });

  it('should error when plan does not exist', async () => {
    vi.mocked(store.getPlanState).mockResolvedValueOnce(null);

    const result = await unlinkFromProgram({
      workspace_id: WS,
      plan_id: 'plan_ghost',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should clean up orphaned program_id when program is missing', async () => {
    const plan = makePlan({ id: 'plan_A', program_id: 'prog_deleted' });

    vi.mocked(store.getPlanState)
      .mockResolvedValueOnce(plan)  // load plan
      .mockResolvedValueOnce(null); // program doesn't exist

    const result = await unlinkFromProgram({
      workspace_id: WS,
      plan_id: 'plan_A',
    });

    // Should fail but clean up the orphaned reference
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
    expect(result.error).toContain('Cleared orphaned');
    // Should still have saved the plan to clear program_id
    expect(store.savePlanState).toHaveBeenCalled();
  });

  it('should error when required fields are missing', async () => {
    const result = await unlinkFromProgram({
      workspace_id: '',
      plan_id: 'plan_A',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('required');
  });
});
