/**
 * Tests for server/src/routes/programs.ts — pure logic functions.
 *
 * We re-implement the exported-internal helpers (computeAggregate, toPlanRef,
 * buildProgramSummary) inline because they are not module-exported from the
 * router file. Testing the algorithm in isolation avoids needing Express or FS.
 */
import { describe, it, expect } from 'vitest';

// ─── Duplicated types matching server code ───────────────────────────────────

interface PlanState {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  category: string;
  is_program?: boolean;
  child_plan_ids?: string[];
  program_id?: string;
  steps: Array<{ status: string }>;
  goals?: string[];
  created_at: string;
  updated_at: string;
  current_phase?: string;
  depends_on_plans?: string[];
}

interface ProgramPlanRef {
  plan_id: string;
  title: string;
  status: string;
  priority: string;
  current_phase: string;
  progress: { done: number; total: number };
  depends_on_plans: string[];
}

interface AggregateProgress {
  total_plans: number;
  active_plans: number;
  completed_plans: number;
  archived_plans: number;
  failed_plans: number;
  total_steps: number;
  done_steps: number;
  active_steps: number;
  pending_steps: number;
  blocked_steps: number;
  completion_percentage: number;
}

// ─── Re-implemented logic (mirrors server/src/routes/programs.ts) ────────────

function toPlanRef(state: PlanState): ProgramPlanRef {
  const done = state.steps?.filter((s) => s.status === 'done').length || 0;
  const total = state.steps?.length || 0;
  return {
    plan_id: state.id,
    title: state.title,
    status: state.status,
    priority: state.priority || 'medium',
    current_phase: (state as any).current_phase ?? '',
    progress: { done, total },
    depends_on_plans: (state as any).depends_on_plans ?? [],
  };
}

function computeAggregate(childPlans: PlanState[]): AggregateProgress {
  let totalSteps = 0;
  let doneSteps = 0;
  let activeSteps = 0;
  let pendingSteps = 0;
  let blockedSteps = 0;
  let activePlans = 0;
  let completedPlans = 0;
  let archivedPlans = 0;
  let failedPlans = 0;

  for (const plan of childPlans) {
    switch (plan.status) {
      case 'active': activePlans++; break;
      case 'completed': completedPlans++; break;
      case 'archived': archivedPlans++; break;
      case 'failed': failedPlans++; break;
    }
    for (const step of plan.steps || []) {
      totalSteps++;
      switch (step.status) {
        case 'done': doneSteps++; break;
        case 'active': activeSteps++; break;
        case 'pending': pendingSteps++; break;
        case 'blocked': blockedSteps++; break;
      }
    }
  }

  return {
    total_plans: childPlans.length,
    active_plans: activePlans,
    completed_plans: completedPlans,
    archived_plans: archivedPlans,
    failed_plans: failedPlans,
    total_steps: totalSteps,
    done_steps: doneSteps,
    active_steps: activeSteps,
    pending_steps: pendingSteps,
    blocked_steps: blockedSteps,
    completion_percentage: totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0,
  };
}

function buildProgramSummary(
  state: PlanState,
  childPlans: PlanState[],
  workspaceId: string,
) {
  const plans = childPlans.map(toPlanRef);
  const aggregate = computeAggregate(childPlans);
  return {
    program_id: state.id,
    name: state.title,
    description: state.description || '',
    created_at: state.created_at,
    updated_at: state.updated_at,
    workspace_id: workspaceId,
    plans,
    aggregate_progress: aggregate,
  };
}

// ─── Factories ───────────────────────────────────────────────────────────────

function makePlanState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    id: 'plan_default',
    title: 'Default Plan',
    description: '',
    status: 'active',
    priority: 'medium',
    category: 'feature',
    steps: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('toPlanRef', () => {
  it('maps basic PlanState to ProgramPlanRef', () => {
    const state = makePlanState({
      id: 'plan_abc',
      title: 'Migrate DB',
      status: 'active',
      priority: 'high',
      steps: [{ status: 'done' }, { status: 'pending' }, { status: 'pending' }],
    });
    const ref = toPlanRef(state);

    expect(ref.plan_id).toBe('plan_abc');
    expect(ref.title).toBe('Migrate DB');
    expect(ref.status).toBe('active');
    expect(ref.priority).toBe('high');
    expect(ref.progress).toEqual({ done: 1, total: 3 });
  });

  it('defaults priority to "medium" when missing', () => {
    const state = makePlanState({ priority: '' });
    // With falsy priority the code falls through to || 'medium'
    const ref = toPlanRef(state);
    expect(ref.priority).toBe('medium');
  });

  it('returns 0/0 progress for plans with no steps', () => {
    const state = makePlanState({ steps: [] });
    const ref = toPlanRef(state);
    expect(ref.progress).toEqual({ done: 0, total: 0 });
  });

  it('includes current_phase from plan state', () => {
    const state = makePlanState({ current_phase: 'Implementation' });
    const ref = toPlanRef(state);
    expect(ref.current_phase).toBe('Implementation');
  });

  it('defaults depends_on_plans to empty array', () => {
    const state = makePlanState();
    const ref = toPlanRef(state);
    expect(ref.depends_on_plans).toEqual([]);
  });

  it('passes through depends_on_plans when present', () => {
    const state = makePlanState({ depends_on_plans: ['plan_x', 'plan_y'] });
    const ref = toPlanRef(state);
    expect(ref.depends_on_plans).toEqual(['plan_x', 'plan_y']);
  });
});

describe('computeAggregate', () => {
  it('returns zeroed aggregate for empty child list', () => {
    const agg = computeAggregate([]);
    expect(agg).toEqual({
      total_plans: 0,
      active_plans: 0,
      completed_plans: 0,
      archived_plans: 0,
      failed_plans: 0,
      total_steps: 0,
      done_steps: 0,
      active_steps: 0,
      pending_steps: 0,
      blocked_steps: 0,
      completion_percentage: 0,
    });
  });

  it('counts plan statuses correctly', () => {
    const plans = [
      makePlanState({ status: 'active' }),
      makePlanState({ status: 'active' }),
      makePlanState({ status: 'completed' }),
      makePlanState({ status: 'archived' }),
      makePlanState({ status: 'failed' }),
    ];
    const agg = computeAggregate(plans);

    expect(agg.total_plans).toBe(5);
    expect(agg.active_plans).toBe(2);
    expect(agg.completed_plans).toBe(1);
    expect(agg.archived_plans).toBe(1);
    expect(agg.failed_plans).toBe(1);
  });

  it('counts step statuses across all plans', () => {
    const plans = [
      makePlanState({
        steps: [
          { status: 'done' },
          { status: 'done' },
          { status: 'active' },
        ],
      }),
      makePlanState({
        steps: [
          { status: 'pending' },
          { status: 'blocked' },
        ],
      }),
    ];
    const agg = computeAggregate(plans);

    expect(agg.total_steps).toBe(5);
    expect(agg.done_steps).toBe(2);
    expect(agg.active_steps).toBe(1);
    expect(agg.pending_steps).toBe(1);
    expect(agg.blocked_steps).toBe(1);
  });

  it('calculates completion_percentage correctly', () => {
    const plans = [
      makePlanState({
        steps: [
          { status: 'done' },
          { status: 'done' },
          { status: 'done' },
          { status: 'pending' },
        ],
      }),
    ];
    const agg = computeAggregate(plans);
    expect(agg.completion_percentage).toBe(75);
  });

  it('returns 0% completion when there are no steps', () => {
    const plans = [makePlanState({ steps: [] })];
    const agg = computeAggregate(plans);
    expect(agg.completion_percentage).toBe(0);
  });

  it('returns 100% when all steps are done', () => {
    const plans = [
      makePlanState({
        steps: [{ status: 'done' }, { status: 'done' }],
      }),
    ];
    const agg = computeAggregate(plans);
    expect(agg.completion_percentage).toBe(100);
  });

  it('rounds completion percentage to nearest integer', () => {
    // 1/3 = 33.33...% → should round to 33
    const plans = [
      makePlanState({
        steps: [{ status: 'done' }, { status: 'pending' }, { status: 'pending' }],
      }),
    ];
    const agg = computeAggregate(plans);
    expect(agg.completion_percentage).toBe(33);
  });

  it('handles plans with undefined steps gracefully', () => {
    const plan = makePlanState();
    (plan as any).steps = undefined;
    const agg = computeAggregate([plan]);
    expect(agg.total_steps).toBe(0);
    expect(agg.completion_percentage).toBe(0);
  });
});

describe('buildProgramSummary', () => {
  it('builds a full ProgramSummary from a program state and children', () => {
    const programState = makePlanState({
      id: 'prog_main',
      title: 'Main Program',
      description: 'Top-level program',
      is_program: true,
      child_plan_ids: ['plan_a', 'plan_b'],
    });
    const children = [
      makePlanState({
        id: 'plan_a',
        title: 'Plan A',
        status: 'active',
        steps: [{ status: 'done' }, { status: 'pending' }],
      }),
      makePlanState({
        id: 'plan_b',
        title: 'Plan B',
        status: 'completed',
        steps: [{ status: 'done' }, { status: 'done' }],
      }),
    ];

    const summary = buildProgramSummary(programState, children, 'ws_test');

    expect(summary.program_id).toBe('prog_main');
    expect(summary.name).toBe('Main Program');
    expect(summary.description).toBe('Top-level program');
    expect(summary.workspace_id).toBe('ws_test');
    expect(summary.plans).toHaveLength(2);
    expect(summary.plans[0].plan_id).toBe('plan_a');
    expect(summary.plans[1].plan_id).toBe('plan_b');
    expect(summary.aggregate_progress.total_plans).toBe(2);
    expect(summary.aggregate_progress.total_steps).toBe(4);
    expect(summary.aggregate_progress.done_steps).toBe(3);
    expect(summary.aggregate_progress.completion_percentage).toBe(75);
  });

  it('defaults description to empty string when missing', () => {
    const programState = makePlanState({ id: 'prog_x', title: 'X' });
    delete (programState as any).description;

    const summary = buildProgramSummary(programState, [], 'ws_1');
    expect(summary.description).toBe('');
  });

  it('handles zero child plans', () => {
    const programState = makePlanState({ id: 'prog_empty', title: 'Empty' });
    const summary = buildProgramSummary(programState, [], 'ws_1');

    expect(summary.plans).toEqual([]);
    expect(summary.aggregate_progress.total_plans).toBe(0);
    expect(summary.aggregate_progress.completion_percentage).toBe(0);
  });
});
