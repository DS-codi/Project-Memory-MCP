import { describe, it, expect, beforeEach, vi } from 'vitest';
import { updateStep } from '../../tools/plan.tools.js';
import * as fileStore from '../../storage/file-store.js';

vi.mock('../../storage/file-store.js');
vi.mock('../../events/event-emitter.js', () => ({
  events: {
    stepUpdated: vi.fn(),
  },
}));

const mockWorkspaceId = 'ws_confirm_test_123';
const mockPlanId = 'plan_confirm_test_456';

function createPlanState(overrides?: Partial<ReturnType<typeof basePlanState>>) {
  return { ...basePlanState(), ...overrides };
}

function basePlanState() {
  return {
    id: mockPlanId,
    workspace_id: mockWorkspaceId,
    title: 'Confirmation Test Plan',
    description: 'Plan to test confirmation gating',
    category: 'feature' as const,
    priority: 'medium' as const,
    status: 'active' as const,
    current_phase: 'Phase A',
    current_agent: 'Executor',
    created_at: '2026-02-08T00:00:00Z',
    updated_at: '2026-02-08T00:00:00Z',
    steps: [
      {
        index: 0,
        phase: 'Phase A',
        task: 'Sensitive step',
        status: 'pending' as const,
        type: 'standard' as const,
        requires_confirmation: true,
      },
      {
        index: 1,
        phase: 'Phase A',
        task: 'Follow-up step',
        status: 'pending' as const,
        type: 'standard' as const,
      },
    ],
    agent_sessions: [],
    lineage: [],
    notes: [],
  };
}

describe('Plan confirmation gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
    vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');
    vi.spyOn(fileStore, 'nowISO').mockReturnValue('2026-02-08T01:00:00Z');
  });

  it('blocks step execution when step confirmation is required', async () => {
    vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(createPlanState());

    const result = await updateStep({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      step_index: 0,
      status: 'active',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('requires explicit user confirmation');
  });

  it('blocks phase completion when phase confirmation is missing', async () => {
    const planState = createPlanState({
      steps: [
        { index: 0, phase: 'Phase A', task: 'Step 1', status: 'done' as const, type: 'standard' as const },
        { index: 1, phase: 'Phase A', task: 'Step 2', status: 'pending' as const, type: 'standard' as const },
      ],
    });

    vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(planState);

    const result = await updateStep({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      step_index: 1,
      status: 'done',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('requires confirmation before transition');
  });

  it('allows step completion when confirmations are present', async () => {
    const planState = createPlanState({
      confirmation_state: {
        phases: { 'Phase A': { confirmed: true, confirmed_by: 'user', confirmed_at: '2026-02-08T00:30:00Z' } },
        steps: { 0: { confirmed: true, confirmed_by: 'user', confirmed_at: '2026-02-08T00:30:00Z' } },
      },
    });

    vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(planState);

    const result = await updateStep({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      step_index: 0,
      status: 'done',
    });

    expect(result.success).toBe(true);
    if (result.data) {
      const step = result.data.plan_state.steps.find(s => s.index === 0);
      expect(step?.status).toBe('done');
      expect(step?.completed_at).toBe('2026-02-08T01:00:00Z');
    }
  });
});
