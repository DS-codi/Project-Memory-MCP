import { describe, it, expect, beforeEach, vi } from 'vitest';
import { updateStep } from '../../tools/plan/index.js';
import * as fileStore from '../../storage/db-store.js';
import * as approvalGateRouting from '../../tools/orchestration/approval-gate-routing.js';

vi.mock('../../storage/db-store.js');
vi.mock('../../events/event-emitter.js', () => ({
  events: {
    stepUpdated: vi.fn(),
  },
}));
vi.mock('../../tools/orchestration/approval-gate-routing.js', async () => {
  const actual = await vi.importActual<typeof import('../../tools/orchestration/approval-gate-routing.js')>(
    '../../tools/orchestration/approval-gate-routing.js',
  );
  return {
    ...actual,
    routeApprovalGate: vi.fn(),
  };
});

const mockWorkspaceId = 'ws_confirm_test_123';
const mockPlanId = 'plan_confirm_test_456';
const mockRouteApprovalGate = vi.mocked(approvalGateRouting.routeApprovalGate);

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

  it('attempts approval GUI routing for gated steps and returns Coordinator handoff guidance when unavailable', async () => {
    vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(createPlanState());
    mockRouteApprovalGate.mockResolvedValue({
      approved: false,
      path: 'fallback',
      outcome: 'fallback_to_chat',
      error: 'Approval GUI unavailable; fallback_to_chat',
      elapsed_ms: 5,
      requires_handoff_to_coordinator: true,
      handoff_instruction: 'Do not auto-approve. Handoff to Hub/Coordinator now via memory_agent(action: "handoff", to_agent: "Coordinator").',
    } as any);

    const result = await updateStep({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      step_index: 0,
      status: 'active',
    });

    expect(result.success).toBe(false);
    expect(mockRouteApprovalGate).toHaveBeenCalledOnce();
    expect(result.error).toContain('requires explicit user confirmation');
    expect(result.error).toContain('memory_agent(action: "handoff"');
    expect(result.error).toContain('to_agent: "Coordinator"');
    expect(result.error).toContain('Fallback behavior "fallback_to_chat"');
  });

  it('returns explicit deferred fallback behavior when approval is deferred', async () => {
    vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(createPlanState());
    mockRouteApprovalGate.mockResolvedValue({
      approved: false,
      path: 'gui',
      outcome: 'deferred',
      user_notes: 'Need more context',
      elapsed_ms: 11,
    } as any);

    const result = await updateStep({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      step_index: 0,
      status: 'active',
    });

    expect(result.success).toBe(false);
    expect(mockRouteApprovalGate).toHaveBeenCalledOnce();
    expect(result.error).toContain('Approval gate outcome "deferred"');
    expect(result.error).toContain('Fallback behavior "deferred"');
    expect(result.error).toContain('Need more context');
    expect(result.error).not.toContain('memory_agent(action: "handoff"');
  });

  it('returns explicit blocked fallback behavior when approval payload parsing fails', async () => {
    vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(createPlanState());
    mockRouteApprovalGate.mockResolvedValue({
      approved: false,
      path: 'gui',
      outcome: 'error',
      error: 'Approval decision parsing failed (unknown_mode): Unknown approval_decision_v2 mode "legacy_unknown"',
      elapsed_ms: 9,
    } as any);

    const result = await updateStep({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      step_index: 0,
      status: 'active',
    });

    expect(result.success).toBe(false);
    expect(mockRouteApprovalGate).toHaveBeenCalledOnce();
    expect(result.error).toContain('Approval gate outcome "error"');
    expect(result.error).toContain('Fallback behavior "blocked"');
    expect(result.error).toContain('unknown_mode');
    expect(result.error).not.toContain('memory_agent(action: "handoff"');
  });

  it('marks step confirmed when approval GUI approves and continues execution', async () => {
    vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(createPlanState());
    mockRouteApprovalGate.mockResolvedValue({
      approved: true,
      path: 'gui',
      outcome: 'approved',
      elapsed_ms: 8,
    } as any);

    const result = await updateStep({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      step_index: 0,
      status: 'active',
    });

    expect(result.success).toBe(true);
    expect(mockRouteApprovalGate).toHaveBeenCalledOnce();
    if (result.data) {
      const confirmation = result.data.plan_state.confirmation_state?.steps?.[0];
      const step = result.data.plan_state.steps.find(s => s.index === 0);
      expect(confirmation?.confirmed).toBe(true);
      expect(confirmation?.confirmed_by).toBe('approval_gui');
      expect(step?.status).toBe('active');
    }
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
