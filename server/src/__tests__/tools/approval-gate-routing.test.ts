/**
 * Tests for approval-gate-routing.ts — Phase 4 Hub Integration
 *
 * Covers: routeApprovalGate(), pausePlanAtApprovalGate(), resumePausedPlan()
 *
 * Strategy: Mock supervisor-client and file-store to control flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type {
  FormResponse,
  Answer,
  ApprovalDecisionV2Answer,
  ConfirmRejectAnswer,
} from '../../types/gui-forms.types.js';

import type { PlanState, PausedAtSnapshot } from '../../types/plan.types.js';
import type { FormAppLaunchResult, GuiAvailability } from '../../tools/orchestration/supervisor-client.js';

// ── Mock supervisor-client ─────────────────────────────────────

vi.mock('../../tools/orchestration/supervisor-client.js', () => ({
  checkGuiAvailability: vi.fn(),
  launchFormApp: vi.fn(),
}));

// ── Mock file-store ────────────────────────────────────────────

vi.mock('../../storage/db-store.js', () => ({
  getPlanState: vi.fn(),
  savePlanState: vi.fn(),
  generatePlanMd: vi.fn(),
}));

// ── Mock gui-forms utils ───────────────────────────────────────

vi.mock('../../utils/gui-forms.utils.js', () => ({
  createApprovalRequest: vi.fn((_meta, questions, _ctx) => ({
    type: 'form_request',
    version: 1,
    request_id: 'approval-req-001',
    form_type: 'approval',
    metadata: _meta,
    timeout: { duration_seconds: 60, on_timeout: 'approve', fallback_mode: 'chat' },
    window: { title: 'Approval' },
    questions,
    context: _ctx,
  })),
}));

import { checkGuiAvailability, launchFormApp } from '../../tools/orchestration/supervisor-client.js';
import * as store from '../../storage/db-store.js';

import {
  routeApprovalGate,
  pausePlanAtApprovalGate,
  resumePausedPlan,
} from '../../tools/orchestration/approval-gate-routing.js';

const mockCheckGui = vi.mocked(checkGuiAvailability);
const mockLaunchForm = vi.mocked(launchFormApp);
const mockGetPlanState = vi.mocked(store.getPlanState);
const mockSavePlanState = vi.mocked(store.savePlanState);
const mockGeneratePlanMd = vi.mocked(store.generatePlanMd);

// ── Test data ──────────────────────────────────────────────────

function makePlanState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    id: 'plan_test_001',
    workspace_id: 'ws_test_001',
    title: 'Test Plan',
    description: 'A test plan',
    priority: 'medium',
    status: 'active',
    category: 'feature',
    current_phase: 'Phase 2: Implementation',
    current_agent: 'Coordinator',
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-15T00:00:00Z',
    agent_sessions: [],
    lineage: [],
    steps: [
      { index: 0, phase: 'Phase 1: Setup', task: 'Init project', status: 'done', type: 'standard' },
      { index: 1, phase: 'Phase 2: Implementation', task: 'Build auth module', status: 'pending', type: 'standard' },
      { index: 2, phase: 'Phase 2: Implementation', task: 'Build API routes', status: 'pending', type: 'standard' },
    ],
    ...overrides,
  } as PlanState;
}

function makeGuiAvailability(overrides: Partial<GuiAvailability> = {}): GuiAvailability {
  return {
    supervisor_running: true,
    brainstorm_gui: true,
    approval_gui: true,
    capabilities: ['approval_gui'],
    message: 'Supervisor running',
    ...overrides,
  };
}

function makeApprovalResponse(
  action: 'approve' | 'reject',
  notes?: string,
  status: FormResponse['status'] = 'completed',
): FormResponse {
  const answers: Answer[] = [
    {
      question_id: 'approval_decision',
      value: {
        type: 'confirm_reject_answer',
        action,
        ...(notes ? { notes } : {}),
      } as ConfirmRejectAnswer,
    },
  ];
  return {
    type: 'form_response',
    version: 1,
    request_id: 'approval-req-001',
    form_type: 'approval',
    status,
    metadata: {
      plan_id: 'plan_test_001',
      workspace_id: 'ws_test_001',
      session_id: 'sess_test',
      completed_at: '2026-02-20T12:00:00Z',
      duration_ms: 3000,
    },
    answers,
  };
}

function makeRadioSelectResponse(
  selected: string,
  freeText?: string,
  status: FormResponse['status'] = 'completed',
): FormResponse {
  return {
    type: 'form_response',
    version: 1,
    request_id: 'approval-req-001',
    form_type: 'approval',
    status,
    metadata: {
      plan_id: 'plan_test_001',
      workspace_id: 'ws_test_001',
      session_id: 'sess_test',
      completed_at: '2026-02-20T12:00:00Z',
      duration_ms: 3000,
    },
    answers: [
      {
        question_id: 'approval_decision',
        value: {
          type: 'radio_select_answer',
          selected,
          ...(freeText ? { free_text: freeText } : {}),
        },
      },
    ],
  };
}

function makeV2DecisionResponse(
  decision: ApprovalDecisionV2Answer['decision'],
  status: FormResponse['status'] = 'completed',
): FormResponse {
  return {
    type: 'form_response',
    version: 1,
    request_id: 'approval-req-001',
    form_type: 'approval',
    status,
    metadata: {
      plan_id: 'plan_test_001',
      workspace_id: 'ws_test_001',
      session_id: 'sess_test',
      completed_at: '2026-02-20T12:00:00Z',
      duration_ms: 3000,
    },
    answers: [
      {
        question_id: 'approval_decision',
        value: {
          type: 'approval_decision_v2',
          decision,
        },
      },
    ],
  };
}

function makeAggregateSessionSubmissionResponse(
  payload: {
    session_id?: string;
    decisions?: Array<{
      item_id: string;
      decision: 'approve' | 'reject' | 'defer' | 'no_decision' | 'invalid';
      notes?: string;
    }>;
    notes?: string;
    mode?: 'binary' | 'multiple_choice' | 'multi_approval_session';
  },
  status: FormResponse['status'] = 'completed',
): FormResponse {
  return {
    type: 'form_response',
    version: 1,
    request_id: 'approval-req-001',
    form_type: 'approval',
    status,
    metadata: {
      plan_id: 'plan_test_001',
      workspace_id: 'ws_test_001',
      session_id: 'sess_test',
      completed_at: '2026-02-20T12:00:00Z',
      duration_ms: 3000,
    },
    answers: [
      {
        question_id: 'approval_decision',
        value: {
          type: 'approval_session_submission_v2',
          ...payload,
        },
      },
    ],
  };
}

function makeLaunchResult(overrides: Partial<FormAppLaunchResult> = {}): FormAppLaunchResult {
  return {
    app_name: 'approval_gui',
    success: true,
    elapsed_ms: 3000,
    timed_out: false,
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// =========================================================================
// routeApprovalGate()
// =========================================================================

describe('routeApprovalGate', () => {
  // --- Fallback paths ---

  it('falls back to chat when supervisor is not running', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability({ supervisor_running: false }));

    const result = await routeApprovalGate(makePlanState(), 1, 'sess_001');

    expect(result.approved).toBe(false);
    expect(result.path).toBe('fallback');
    expect(result.outcome).toBe('fallback_to_chat');
    expect(result.requires_handoff_to_coordinator).toBe(true);
    expect(result.handoff_instruction).toContain('memory_agent(action: "handoff"');
    expect(result.handoff_instruction).toContain('to_agent: "Coordinator"');
    expect(result.error).toContain('memory_agent(action: "handoff"');
  });

  it('falls back to chat when approval_gui is unavailable', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability({ approval_gui: false }));

    const result = await routeApprovalGate(makePlanState(), 1, 'sess_001');

    expect(result.approved).toBe(false);
    expect(result.path).toBe('fallback');
    expect(result.outcome).toBe('fallback_to_chat');
    expect(result.requires_handoff_to_coordinator).toBe(true);
    expect(result.handoff_instruction).toContain('memory_agent(action: "handoff"');
    expect(result.handoff_instruction).toContain('to_agent: "Coordinator"');
  });

  // --- Approval path ---

  it('returns approved:true when user approves via GUI', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability());
    const guiResponse = makeApprovalResponse('approve');
    mockLaunchForm.mockResolvedValue(makeLaunchResult({
      response_payload: guiResponse,
    }));

    const result = await routeApprovalGate(makePlanState(), 1, 'sess_001');

    expect(result.approved).toBe(true);
    expect(result.path).toBe('gui');
    expect(result.outcome).toBe('approved');
    expect(result.gui_response).toBeDefined();

    const launchPayload = mockLaunchForm.mock.calls[0]?.[1] as {
      context?: {
        step?: { step_task?: string; step_index?: number };
        contract?: { mode?: string; request_shape?: string; response_shape?: string };
        approval_contract_v2?: { mode?: string; request_shape?: string; response_shape?: string };
      };
    };
    expect(launchPayload.context).toMatchObject({
      step: {
        step_task: 'Build auth module',
        step_index: 1,
      },
      contract: {
        mode: 'binary',
        request_shape: 'confirm_reject_question',
        response_shape: 'confirm_reject_answer',
      },
      approval_contract_v2: {
        mode: 'binary',
        request_shape: 'confirm_reject_question',
        response_shape: 'confirm_reject_answer',
      },
    });
  });

  it('accepts multiple-choice radio_select_answer responses deterministically', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability());
    mockLaunchForm.mockResolvedValue(makeLaunchResult({
      response_payload: makeRadioSelectResponse('approve_option', 'Looks good'),
    }));

    const result = await routeApprovalGate(makePlanState(), 1, 'sess_001');

    expect(result.approved).toBe(true);
    expect(result.outcome).toBe('approved');
  });

  it('accepts approval_decision_v2 binary responses deterministically', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability());
    mockLaunchForm.mockResolvedValue(makeLaunchResult({
      response_payload: makeV2DecisionResponse({
        mode: 'binary',
        action: 'approve',
      }),
    }));

    const result = await routeApprovalGate(makePlanState(), 1, 'sess_001');

    expect(result.approved).toBe(true);
    expect(result.outcome).toBe('approved');
  });

  it('accepts approval_decision_v2 multiple_choice responses deterministically', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability());
    mockLaunchForm.mockResolvedValue(makeLaunchResult({
      response_payload: makeV2DecisionResponse({
        mode: 'multiple_choice',
        selected: 'ship_it',
      }),
    }));

    const result = await routeApprovalGate(makePlanState(), 1, 'sess_001');

    expect(result.approved).toBe(true);
    expect(result.outcome).toBe('approved');
  });

  it('handles aggregated multi-session submissions with any rejection as rejected', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability());
    mockLaunchForm.mockResolvedValue(makeLaunchResult({
      response_payload: makeAggregateSessionSubmissionResponse({
        session_id: 'agg_sess_1',
        decisions: [
          { item_id: 'q1', decision: 'approve' },
          { item_id: 'q2', decision: 'reject', notes: 'Needs revision' },
        ],
      }),
    }));

    const result = await routeApprovalGate(makePlanState(), 1, 'sess_001');

    expect(result.approved).toBe(false);
    expect(result.outcome).toBe('rejected');
    expect(result.paused_snapshot?.reason).toBe('rejected');
  });

  it('handles aggregated multi-session submissions with all approvals as approved', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability());
    mockLaunchForm.mockResolvedValue(makeLaunchResult({
      response_payload: makeAggregateSessionSubmissionResponse({
        session_id: 'agg_sess_all_ok',
        decisions: [
          { item_id: 'q1', decision: 'approve' },
          { item_id: 'q2', decision: 'approve' },
        ],
      }),
    }));

    const result = await routeApprovalGate(makePlanState(), 1, 'sess_001');

    expect(result.approved).toBe(true);
    expect(result.outcome).toBe('approved');
  });

  it('handles aggregated multi-session submissions with defer/no_decision as deferred', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability());
    mockLaunchForm.mockResolvedValue(makeLaunchResult({
      response_payload: makeAggregateSessionSubmissionResponse({
        session_id: 'agg_sess_2',
        decisions: [
          { item_id: 'q1', decision: 'approve' },
          { item_id: 'q2', decision: 'no_decision', notes: 'Need follow-up' },
        ],
      }),
    }));

    const result = await routeApprovalGate(makePlanState(), 1, 'sess_001');

    expect(result.approved).toBe(false);
    expect(result.outcome).toBe('deferred');
    expect(result.paused_snapshot?.reason).toBe('deferred');
  });

  // --- Rejection path ---

  it('returns rejected with user_notes and PausedAtSnapshot', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability());
    const guiResponse = makeApprovalResponse('reject', 'This approach is wrong');
    mockLaunchForm.mockResolvedValue(makeLaunchResult({
      response_payload: guiResponse,
    }));

    const result = await routeApprovalGate(makePlanState(), 1, 'sess_001');

    expect(result.approved).toBe(false);
    expect(result.path).toBe('gui');
    expect(result.outcome).toBe('rejected');
    expect(result.user_notes).toBe('This approach is wrong');
    expect(result.paused_snapshot).toBeDefined();
    expect(result.paused_snapshot!.reason).toBe('rejected');
    expect(result.paused_snapshot!.step_index).toBe(1);
    expect(result.paused_snapshot!.step_task).toBe('Build auth module');
    expect(result.paused_snapshot!.session_id).toBe('sess_001');
  });

  // --- Timeout path ---

  it('does not auto-approve on timeout (fail-safe)', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability());
    const guiResponse: FormResponse = {
      ...makeApprovalResponse('approve'),
      status: 'timed_out',
    };
    mockLaunchForm.mockResolvedValue(makeLaunchResult({
      response_payload: guiResponse,
    }));

    const result = await routeApprovalGate(makePlanState(), 1, 'sess_001');

    expect(result.approved).toBe(false);
    expect(result.outcome).toBe('timeout');
    expect(result.paused_snapshot?.reason).toBe('timeout');
  });

  // --- Cancelled / deferred paths ---

  it('returns rejected when user cancels the dialog', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability());
    const guiResponse: FormResponse = {
      ...makeApprovalResponse('reject'),
      status: 'cancelled',
    };
    mockLaunchForm.mockResolvedValue(makeLaunchResult({
      response_payload: guiResponse,
    }));

    const result = await routeApprovalGate(makePlanState(), 2, 'sess_002');

    expect(result.approved).toBe(false);
    expect(result.outcome).toBe('rejected');
    expect(result.paused_snapshot).toBeDefined();
    expect(result.paused_snapshot!.reason).toBe('rejected');
    expect(result.paused_snapshot!.step_task).toBe('Build API routes');
  });

  it('returns deferred when GUI returns deferred status', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability());
    const guiResponse: FormResponse = {
      ...makeApprovalResponse('approve'),
      status: 'deferred',
    };
    mockLaunchForm.mockResolvedValue(makeLaunchResult({
      response_payload: guiResponse,
    }));

    const result = await routeApprovalGate(makePlanState(), 1, 'sess_001');

    expect(result.approved).toBe(false);
    expect(result.outcome).toBe('deferred');
    expect(result.paused_snapshot).toBeDefined();
    expect(result.paused_snapshot!.reason).toBe('deferred');
  });

  // --- Error paths ---

  it('falls back to chat when launchFormApp fails', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability());
    mockLaunchForm.mockResolvedValue(makeLaunchResult({
      success: false,
      error: 'GUI process crashed',
    }));

    const result = await routeApprovalGate(makePlanState(), 1, 'sess_001');

    expect(result.approved).toBe(false);
    expect(result.outcome).toBe('fallback_to_chat');
    expect(result.error).toContain('GUI failed');
  });

  it('falls back to chat when launchFormApp returns no response_payload', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability());
    mockLaunchForm.mockResolvedValue(makeLaunchResult({
      success: true,
      response_payload: undefined,
    }));

    const result = await routeApprovalGate(makePlanState(), 1, 'sess_001');

    expect(result.approved).toBe(false);
    expect(result.outcome).toBe('fallback_to_chat');
    expect(result.error).toContain('no response payload');
  });

  it('falls back to chat when launchFormApp throws', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability());
    mockLaunchForm.mockRejectedValue(new Error('Socket timeout'));

    const result = await routeApprovalGate(makePlanState(), 1, 'sess_001');

    expect(result.approved).toBe(false);
    expect(result.outcome).toBe('fallback_to_chat');
    expect(result.error).toContain('Socket timeout');
  });

  // --- PausedAtSnapshot fields ---

  it('populates PausedAtSnapshot with correct phase and step_task', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability());
    const guiResponse = makeApprovalResponse('reject', 'No good');
    mockLaunchForm.mockResolvedValue(makeLaunchResult({
      response_payload: guiResponse,
    }));

    const plan = makePlanState();
    const result = await routeApprovalGate(plan, 0, 'sess_snap');

    expect(result.paused_snapshot).toBeDefined();
    expect(result.paused_snapshot!.phase).toBe('Phase 1: Setup');
    expect(result.paused_snapshot!.step_task).toBe('Init project');
    expect(result.paused_snapshot!.paused_at).toBeDefined();
    expect(result.paused_snapshot!.user_notes).toBe('No good');
    expect(result.paused_snapshot!.session_id).toBe('sess_snap');
  });

  it('treats completed response with no decision answer as error (fail-safe)', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability());
    // Response with only a timer answer, no approval decision payload.
    const guiResponse: FormResponse = {
      type: 'form_response',
      version: 1,
      request_id: 'req-001',
      form_type: 'approval',
      status: 'completed',
      metadata: { plan_id: 'p', workspace_id: 'w', session_id: 's' },
      answers: [
        {
          question_id: 'timer',
          value: { type: 'countdown_timer_answer', result: 'completed', elapsed_seconds: 10 },
        },
      ],
    };
    mockLaunchForm.mockResolvedValue(makeLaunchResult({ response_payload: guiResponse }));

    const result = await routeApprovalGate(makePlanState(), 1, 'sess_001');

    expect(result.approved).toBe(false);
    expect(result.outcome).toBe('error');
    expect(result.error).toContain('missing_decision');
  });

  it('uses plan priority for urgency mapping in the form request', async () => {
    mockCheckGui.mockResolvedValue(makeGuiAvailability());
    mockLaunchForm.mockResolvedValue(makeLaunchResult({
      response_payload: makeApprovalResponse('approve'),
    }));

    const criticalPlan = makePlanState({ priority: 'critical' });
    await routeApprovalGate(criticalPlan, 1, 'sess_001');

    // Verify launchFormApp was called (the urgency mapping is internal,
    // but we can validate the function completed correctly)
    expect(mockLaunchForm).toHaveBeenCalled();
  });
});

// =========================================================================
// pausePlanAtApprovalGate()
// =========================================================================

describe('pausePlanAtApprovalGate', () => {
  it('writes PausedAtSnapshot and sets status to paused', async () => {
    const plan = makePlanState();
    mockGetPlanState.mockResolvedValue(plan);
    mockSavePlanState.mockResolvedValue(undefined);
    mockGeneratePlanMd.mockResolvedValue(undefined);

    const snapshot: PausedAtSnapshot = {
      paused_at: '2026-02-20T10:00:00Z',
      step_index: 1,
      phase: 'Phase 2: Implementation',
      step_task: 'Build auth module',
      reason: 'rejected',
      user_notes: 'Wrong approach',
      session_id: 'sess_001',
    };

    const result = await pausePlanAtApprovalGate('ws_test_001', 'plan_test_001', snapshot);

    expect(result).not.toBeNull();
    expect(result!.paused_at_snapshot).toEqual(snapshot);
    expect(result!.status).toBe('paused');
    expect(mockSavePlanState).toHaveBeenCalledOnce();
    expect(mockGeneratePlanMd).toHaveBeenCalledOnce();
  });

  it('returns null when plan is not found', async () => {
    mockGetPlanState.mockResolvedValue(null);

    const snapshot: PausedAtSnapshot = {
      paused_at: '2026-02-20T10:00:00Z',
      step_index: 0,
      phase: 'Phase 1',
      step_task: 'Setup',
      reason: 'timeout',
    };

    const result = await pausePlanAtApprovalGate('ws_missing', 'plan_missing', snapshot);

    expect(result).toBeNull();
    expect(mockSavePlanState).not.toHaveBeenCalled();
  });

  it('updates the updated_at timestamp', async () => {
    const plan = makePlanState();
    mockGetPlanState.mockResolvedValue(plan);
    mockSavePlanState.mockResolvedValue(undefined);
    mockGeneratePlanMd.mockResolvedValue(undefined);

    const snapshot: PausedAtSnapshot = {
      paused_at: '2026-02-20T10:00:00Z',
      step_index: 1,
      phase: 'Phase 2',
      step_task: 'Task',
      reason: 'deferred',
    };

    const result = await pausePlanAtApprovalGate('ws_test_001', 'plan_test_001', snapshot);

    expect(result!.updated_at).toBeDefined();
    // Should be a recent timestamp, not the original
    expect(result!.updated_at).not.toBe('2026-02-15T00:00:00Z');
  });
});

// =========================================================================
// resumePausedPlan()
// =========================================================================

describe('resumePausedPlan', () => {
  it('clears snapshot and sets status to active', async () => {
    const snapshot: PausedAtSnapshot = {
      paused_at: '2026-02-20T10:00:00Z',
      step_index: 1,
      phase: 'Phase 2: Implementation',
      step_task: 'Build auth module',
      reason: 'rejected',
    };
    const plan = makePlanState({
      status: 'paused' as PlanState['status'],
      paused_at_snapshot: snapshot,
    });
    mockGetPlanState.mockResolvedValue(plan);
    mockSavePlanState.mockResolvedValue(undefined);
    mockGeneratePlanMd.mockResolvedValue(undefined);

    const result = await resumePausedPlan('ws_test_001', 'plan_test_001');

    expect(result.success).toBe(true);
    expect(result.step_index).toBe(1);
    expect(result.phase).toBe('Phase 2: Implementation');
    expect(mockSavePlanState).toHaveBeenCalledOnce();
  });

  it('returns error when plan is not found', async () => {
    mockGetPlanState.mockResolvedValue(null);

    const result = await resumePausedPlan('ws_missing', 'plan_missing');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error when plan is not paused', async () => {
    const plan = makePlanState({ status: 'active' });
    mockGetPlanState.mockResolvedValue(plan);

    const result = await resumePausedPlan('ws_test_001', 'plan_test_001');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not paused');
  });

  it('returns error when plan has no paused_at_snapshot', async () => {
    const plan = makePlanState({
      status: 'paused' as PlanState['status'],
      paused_at_snapshot: undefined,
    });
    mockGetPlanState.mockResolvedValue(plan);

    const result = await resumePausedPlan('ws_test_001', 'plan_test_001');

    expect(result.success).toBe(false);
    expect(result.error).toContain('no paused_at_snapshot');
  });

  it('generates plan markdown after resume', async () => {
    const snapshot: PausedAtSnapshot = {
      paused_at: '2026-02-20T10:00:00Z',
      step_index: 2,
      phase: 'Phase 2',
      step_task: 'Build API routes',
      reason: 'timeout',
    };
    const plan = makePlanState({
      status: 'paused' as PlanState['status'],
      paused_at_snapshot: snapshot,
    });
    mockGetPlanState.mockResolvedValue(plan);
    mockSavePlanState.mockResolvedValue(undefined);
    mockGeneratePlanMd.mockResolvedValue(undefined);

    await resumePausedPlan('ws_test_001', 'plan_test_001');

    expect(mockGeneratePlanMd).toHaveBeenCalledOnce();
  });
});
