/**
 * Approval Gate Routing — approval-gate-routing.ts
 *
 * Orchestrates the approval gate → GUI → plan pause/continue flow:
 * 1. When a gated plan step is reached, Coordinator calls routeApprovalGate()
 * 2. If Supervisor is available, launches the approval-gui dialog
 * 3. Waits for user response (approve/reject/timeout)
 * 4. On approve → returns success; plan continues
 * 5. On reject/timeout → writes PausedAtSnapshot; returns pause signal
 *
 * Under the specialized_host-only policy, no chat fallback is performed.
 * GUI unavailability is returned as a routing error.
 *
 * Created in Phase 4 (Hub Integration) of the Brainstorm GUI plan.
 */

import type {
  ApprovalContractV2,
  ApprovalFailureReason,
  ApprovalMode,
  ApprovalRequestContextV2,
  ApprovalRoutingOutcome,
  FormRequest,
  FormResponse,
  ApprovalStepContext,
  ApprovalUrgency,
} from '../../types/gui-forms.types.js';

import type { PlanState, PausedAtSnapshot } from '../../types/plan.types.js';

import {
  createApprovalRequest,
} from '../../utils/gui-forms.utils.js';

import {
  checkGuiAvailability,
  launchFormApp,
  type SupervisorClientOptions,
} from './supervisor-client.js';

import * as store from '../../storage/db-store.js';

// =========================================================================
// Result types
// =========================================================================

/** Possible outcomes of an approval gate. */
export type ApprovalOutcome = ApprovalRoutingOutcome;

interface DecisionResolution {
  outcome: 'approved' | 'rejected' | 'deferred' | 'error';
  user_notes?: string;
  failure_reason?: ApprovalFailureReason;
  detail?: string;
}

/** Result of an approval gate routing attempt. */
export interface ApprovalGateResult {
  /** Whether the approval gate resolved successfully (approved). */
  approved: boolean;
  /** Which path was used. */
  path: 'gui' | 'fallback';
  /** Detailed outcome. */
  outcome: ApprovalOutcome;
  /** User's notes (if rejection with notes). */
  user_notes?: string;
  /** Full FormResponse when GUI was used. */
  gui_response?: FormResponse;
  /** PausedAtSnapshot to write if the plan should be paused. */
  paused_snapshot?: PausedAtSnapshot;
  /** Error message if something went wrong. */
  error?: string;
  /** True when caller must hand off to Coordinator before retrying. */
  requires_handoff_to_coordinator?: boolean;
  /** Explicit handoff instruction for tool surfaces. */
  handoff_instruction?: string;
  /** Timing in milliseconds. */
  elapsed_ms: number;
}

export interface ApprovalHandoffContext {
  workspace_id: string;
  plan_id: string;
  step_index?: number;
  outcome?: ApprovalOutcome | 'unknown';
  detail?: string;
}

const APPROVAL_UNAVAILABLE_PATTERN = /fallback_to_chat|approval gui unavailable|approval gui failed|no response payload|approval gate error/i;

export function buildCoordinatorHandoffInstruction(context: ApprovalHandoffContext): string {
  const stepLabel = typeof context.step_index === 'number'
    ? `step ${context.step_index}`
    : 'the gated step';
  const reason = context.detail
    ? `Approval GUI unavailable for ${stepLabel} (outcome: ${context.outcome ?? 'unknown'}; detail: ${context.detail})`
    : `Approval GUI unavailable for ${stepLabel} (outcome: ${context.outcome ?? 'unknown'})`;

  return `Do not auto-approve. Handoff to Hub/Coordinator now via memory_agent(action: \"handoff\", workspace_id: \"${context.workspace_id}\", plan_id: \"${context.plan_id}\", from_agent: \"<current agent>\", to_agent: \"Coordinator\", reason: \"${reason}\").`;
}

export function maybeAttachCoordinatorHandoffInstruction(
  message: string,
  context: ApprovalHandoffContext,
): string {
  if (!message) {
    return buildCoordinatorHandoffInstruction(context);
  }
  if (message.includes('memory_agent(action: "handoff"')) {
    return message;
  }
  if (!APPROVAL_UNAVAILABLE_PATTERN.test(message)) {
    return message;
  }
  return `${message} ${buildCoordinatorHandoffInstruction(context)}`;
}

const LEGACY_CONFIRM_REJECT_TYPES = new Set(['confirm_reject_answer', 'confirm_reject']);
const LEGACY_RADIO_SELECT_TYPES = new Set(['radio_select_answer']);
const AGGREGATED_MULTI_APPROVAL_TYPES = new Set(['approval_session_submission_v2']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function resolveLegacyConfirmRejectDecision(value: unknown): DecisionResolution | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = readString(value, 'type');
  if (!type || !LEGACY_CONFIRM_REJECT_TYPES.has(type)) {
    return null;
  }

  const action = readString(value, 'action');
  const notes = readString(value, 'notes');

  if (action === 'approve') {
    return { outcome: 'approved' };
  }

  if (action === 'reject') {
    return {
      outcome: 'rejected',
      user_notes: notes,
    };
  }

  return {
    outcome: 'error',
    failure_reason: 'malformed_answer',
    detail: `Malformed legacy confirm_reject payload: invalid action "${action ?? '<missing>'}"`,
  };
}

function resolveLegacyRadioSelectDecision(value: unknown): DecisionResolution | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = readString(value, 'type');
  if (!type || !LEGACY_RADIO_SELECT_TYPES.has(type)) {
    return null;
  }

  const selected = readString(value, 'selected');
  const notes = readString(value, 'free_text');

  if (selected && selected.trim().length > 0) {
    return {
      outcome: 'approved',
      user_notes: notes,
    };
  }

  return {
    outcome: 'error',
    failure_reason: 'missing_decision',
    detail: 'Multiple-choice radio_select_answer payload is missing selected option',
  };
}

function resolveAggregateSessionSubmissionDecision(value: unknown): DecisionResolution | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = readString(value, 'type');
  if (!type || !AGGREGATED_MULTI_APPROVAL_TYPES.has(type)) {
    return null;
  }

  const mode = readString(value, 'mode') ?? 'multi_approval_session';
  const decision: Record<string, unknown> = {
    mode,
    session_id: value.session_id,
    decisions: value.decisions,
  };

  const notes = readString(value, 'notes');
  if (notes) {
    decision.notes = notes;
  }

  return resolveV2DecisionPayload({
    type: 'approval_decision_v2',
    decision,
  });
}

function resolveV2DecisionPayload(value: unknown): DecisionResolution | null {
  if (!isRecord(value)) {
    return null;
  }

  if (readString(value, 'type') !== 'approval_decision_v2') {
    return null;
  }

  const decisionRaw = value.decision;
  if (!isRecord(decisionRaw)) {
    return {
      outcome: 'error',
      failure_reason: 'malformed_answer',
      detail: 'Malformed approval_decision_v2 payload: missing decision object',
    };
  }

  const mode = readString(decisionRaw, 'mode');
  const topLevelNotes = readString(decisionRaw, 'notes');

  switch (mode) {
    case 'binary': {
      const action = readString(decisionRaw, 'action');
      if (action === 'approve') {
        return { outcome: 'approved', user_notes: topLevelNotes };
      }
      if (action === 'reject') {
        return { outcome: 'rejected', user_notes: topLevelNotes };
      }
      return {
        outcome: 'error',
        failure_reason: 'missing_decision',
        detail: 'Binary approval_decision_v2 payload is missing explicit action',
      };
    }

    case 'multiple_choice': {
      const selected = readString(decisionRaw, 'selected');
      if (selected && selected.trim().length > 0) {
        return { outcome: 'approved', user_notes: topLevelNotes };
      }
      return {
        outcome: 'error',
        failure_reason: 'missing_decision',
        detail: 'Multiple-choice approval_decision_v2 payload is missing selected option',
      };
    }

    case 'multi_approval_session': {
      const sessionId = readString(decisionRaw, 'session_id');
      if (!sessionId || sessionId.trim().length === 0) {
        return {
          outcome: 'error',
          failure_reason: 'malformed_answer',
          detail: 'Multi-approval session decision is missing session_id',
        };
      }

      const decisionsRaw = decisionRaw.decisions;
      if (!Array.isArray(decisionsRaw)) {
        return {
          outcome: 'error',
          failure_reason: 'malformed_answer',
          detail: 'Multi-approval session decision is missing decisions array',
        };
      }

      if (decisionsRaw.length === 0) {
        return {
          outcome: 'deferred',
          failure_reason: 'partial_session_completion',
          detail: 'Multi-approval session contains no item decisions',
          user_notes: topLevelNotes,
        };
      }

      let hasReject = false;
      let hasDeferred = false;
      let firstNotes = topLevelNotes;

      for (const item of decisionsRaw) {
        if (!isRecord(item)) {
          return {
            outcome: 'error',
            failure_reason: 'malformed_answer',
            detail: 'Multi-approval session contains non-object decision entry',
          };
        }

        const state = readString(item, 'decision');
        const itemNotes = readString(item, 'notes');
        if (!firstNotes && itemNotes) {
          firstNotes = itemNotes;
        }

        if (state === 'approve') {
          continue;
        }

        if (state === 'reject') {
          hasReject = true;
          continue;
        }

        if (state === 'defer' || state === 'no_decision') {
          hasDeferred = true;
          continue;
        }

        if (state === 'invalid') {
          return {
            outcome: 'error',
            failure_reason: 'malformed_answer',
            detail: 'Multi-approval session contains invalid decision state',
          };
        }

        return {
          outcome: 'error',
          failure_reason: 'malformed_answer',
          detail: `Multi-approval session contains unknown decision state "${state ?? '<missing>'}"`,
        };
      }

      if (hasReject) {
        return {
          outcome: 'rejected',
          user_notes: firstNotes,
        };
      }

      if (hasDeferred) {
        return {
          outcome: 'deferred',
          user_notes: firstNotes,
          failure_reason: 'partial_session_completion',
          detail: 'Multi-approval session is partially complete or deferred',
        };
      }

      return {
        outcome: 'approved',
        user_notes: firstNotes,
      };
    }

    default:
      return {
        outcome: 'error',
        failure_reason: 'unknown_mode',
        detail: `Unknown approval_decision_v2 mode "${mode ?? '<missing>'}"`,
      };
  }
}

function resolveCompletedDecision(response: FormResponse): DecisionResolution {
  const answers: unknown[] = Array.isArray(response.answers)
    ? response.answers as unknown[]
    : [];

  for (const rawAnswer of answers) {
    if (!isRecord(rawAnswer)) {
      continue;
    }

    const value = rawAnswer.value;

    const legacyResolution = resolveLegacyConfirmRejectDecision(value);
    if (legacyResolution) {
      return legacyResolution;
    }

    const radioSelectResolution = resolveLegacyRadioSelectDecision(value);
    if (radioSelectResolution) {
      return radioSelectResolution;
    }

    const aggregateSessionResolution = resolveAggregateSessionSubmissionDecision(value);
    if (aggregateSessionResolution) {
      return aggregateSessionResolution;
    }

    const v2Resolution = resolveV2DecisionPayload(value);
    if (v2Resolution) {
      return v2Resolution;
    }
  }

  return {
    outcome: 'error',
    failure_reason: 'missing_decision',
    detail: 'Missing decision payload: no confirm_reject or approval_decision_v2 answer found',
  };
}

function buildPausedSnapshot(
  planState: PlanState,
  stepIndex: number,
  sessionId: string,
  reason: 'rejected' | 'timeout' | 'deferred',
  guiResponse: FormResponse,
  userNotes?: string,
): PausedAtSnapshot {
  const step = planState.steps[stepIndex];
  return {
    paused_at: new Date().toISOString(),
    step_index: stepIndex,
    phase: step?.phase ?? planState.current_phase,
    step_task: step?.task ?? 'Unknown',
    reason,
    approval_response: guiResponse,
    user_notes: userNotes,
    session_id: sessionId,
  };
}

// =========================================================================
// Helpers
// =========================================================================

/** Map plan priority to approval urgency. */
function priorityToUrgency(priority: string): ApprovalUrgency {
  switch (priority) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'medium': return 'medium';
    case 'low': return 'low';
    default: return 'medium';
  }
}

/** Extract rejection notes from a FormResponse. */
function extractRejectionNotes(response: FormResponse): string | undefined {
  const decision = resolveCompletedDecision(response);
  return decision.user_notes;
}

/** Build an ApprovalStepContext from plan state and step index. */
function buildStepContext(
  planState: PlanState,
  stepIndex: number,
): ApprovalStepContext {
  const step = planState.steps[stepIndex];
  return {
    plan_title: planState.title,
    phase: step?.phase ?? planState.current_phase,
    step_task: step?.task ?? 'Unknown step',
    step_index: stepIndex,
    urgency: priorityToUrgency(planState.priority),
  };
}

function selectApprovalModeForStep(
  _planState: PlanState,
  _stepIndex: number,
): ApprovalMode {
  // Current plan-step gates use binary confirm/reject prompts.
  // Keep this explicit so request-mode negotiation is deterministic.
  return 'binary';
}

function buildApprovalContract(mode: ApprovalMode): ApprovalContractV2 {
  switch (mode) {
    case 'multiple_choice':
      return {
        mode,
        request_shape: 'radio_select_question',
        response_shape: 'radio_select_answer',
      };
    case 'multi_approval_session':
      return {
        mode,
        request_shape: 'multi_approval_question_set',
        response_shape: 'approval_decision_v2',
      };
    case 'binary':
    default:
      return {
        mode: 'binary',
        request_shape: 'confirm_reject_question',
        response_shape: 'confirm_reject_answer',
      };
  }
}

function buildApprovalRequestContext(
  stepContext: ApprovalStepContext,
  mode: ApprovalMode,
): ApprovalRequestContextV2 {
  const contract = buildApprovalContract(mode);
  return {
    step: stepContext,
    contract,
    // Legacy metadata path retained for supervisor-side diagnostics.
    approval_contract_v2: contract,
  };
}

/** Build a FormRequest for an approval gate dialog. */
function buildApprovalFormRequest(
  planState: PlanState,
  stepIndex: number,
  sessionId: string,
): FormRequest {
  const step = planState.steps[stepIndex];
  const stepContext = buildStepContext(planState, stepIndex);
  const mode = selectApprovalModeForStep(planState, stepIndex);
  const approvalContext = buildApprovalRequestContext(stepContext, mode);

  const questions = [
    {
      type: 'confirm_reject' as const,
      id: 'approval_decision',
      label: `Approve: ${step?.task ?? 'Plan step'}`,
      description: `Phase: ${step?.phase ?? planState.current_phase}\nPlan: ${planState.title}`,
      required: true,
      approve_label: 'Approve & Continue',
      reject_label: 'Reject & Pause',
      allow_notes: true,
      notes_placeholder: 'Explain why this step should not proceed...',
    },
    {
      type: 'countdown_timer' as const,
      id: 'approval_timer',
      label: 'Time remaining: {remaining}s',
      duration_seconds: 60,
      on_timeout: 'defer' as const,
      pause_on_interaction: true,
    },
  ];

  const request = createApprovalRequest(
    {
      plan_id: planState.id,
      workspace_id: planState.workspace_id,
      session_id: sessionId,
      agent: 'Coordinator',
      title: `Approval Required: ${step?.task ?? 'Plan step'}`,
      description: `Step ${stepIndex + 1} of plan "${planState.title}"`,
    },
    questions,
    approvalContext as unknown as ApprovalStepContext,
  );

  // Fail-safe default: timeout does not imply approval unless an explicit decision is returned.
  request.timeout.on_timeout = 'defer';

  return request;
}

// =========================================================================
// Core routing
// =========================================================================

/**
 * Route an approval gate decision through the GUI.
 *
 * @param planState - Current plan state
 * @param stepIndex - 0-based index of the gated step
 * @param sessionId - Current agent session ID
 * @param opts - Supervisor connection options
 * @returns ApprovalGateResult
 */
export async function routeApprovalGate(
  planState: PlanState,
  stepIndex: number,
  sessionId: string,
  opts: SupervisorClientOptions = {},
): Promise<ApprovalGateResult> {
  const startTime = Date.now();
  const handoffContextBase: ApprovalHandoffContext = {
    workspace_id: planState.workspace_id,
    plan_id: planState.id,
    step_index: stepIndex,
  };

  // 1. Check GUI availability
  const availability = await checkGuiAvailability(opts);

  if (!availability.supervisor_running || !availability.approval_gui) {
    const baseError = 'Approval GUI unavailable; fallback_to_chat';
    const handoffInstruction = buildCoordinatorHandoffInstruction({
      ...handoffContextBase,
      outcome: 'fallback_to_chat',
      detail: baseError,
    });
    return {
      approved: false,
      path: 'fallback',
      outcome: 'fallback_to_chat',
      error: maybeAttachCoordinatorHandoffInstruction(baseError, {
        ...handoffContextBase,
        outcome: 'fallback_to_chat',
        detail: baseError,
      }),
      requires_handoff_to_coordinator: true,
      handoff_instruction: handoffInstruction,
      elapsed_ms: Date.now() - startTime,
    };
  }

  // 2. Build and send approval request
  const formRequest = buildApprovalFormRequest(planState, stepIndex, sessionId);

  try {
    const result = await launchFormApp(
      'approval_gui',
      formRequest,
      formRequest.timeout.duration_seconds,
      opts,
    );

    if (!result.success) {
      const baseError = `Approval GUI failed: ${result.error}`;
      const handoffInstruction = buildCoordinatorHandoffInstruction({
        ...handoffContextBase,
        outcome: 'fallback_to_chat',
        detail: baseError,
      });
      return {
        approved: false,
        path: 'fallback',
        outcome: 'fallback_to_chat',
        error: maybeAttachCoordinatorHandoffInstruction(baseError, {
          ...handoffContextBase,
          outcome: 'fallback_to_chat',
          detail: baseError,
        }),
        requires_handoff_to_coordinator: true,
        handoff_instruction: handoffInstruction,
        elapsed_ms: Date.now() - startTime,
      };
    }

    const guiResponse = result.response_payload as FormResponse | undefined;
    if (!guiResponse) {
      const baseError = 'Approval GUI returned no response payload';
      const handoffInstruction = buildCoordinatorHandoffInstruction({
        ...handoffContextBase,
        outcome: 'fallback_to_chat',
        detail: baseError,
      });
      return {
        approved: false,
        path: 'fallback',
        outcome: 'fallback_to_chat',
        error: maybeAttachCoordinatorHandoffInstruction(baseError, {
          ...handoffContextBase,
          outcome: 'fallback_to_chat',
          detail: baseError,
        }),
        requires_handoff_to_coordinator: true,
        handoff_instruction: handoffInstruction,
        elapsed_ms: Date.now() - startTime,
      };
    }

    // 3. Interpret the response
    const elapsed = result.elapsed_ms;

    switch (guiResponse.status) {
      case 'completed': {
        const decision = resolveCompletedDecision(guiResponse);

        if (decision.outcome === 'approved') {
          return {
            approved: true,
            path: 'gui',
            outcome: 'approved',
            gui_response: guiResponse,
            elapsed_ms: elapsed,
          };
        }

        if (decision.outcome === 'rejected') {
          return {
            approved: false,
            path: 'gui',
            outcome: 'rejected',
            user_notes: decision.user_notes,
            gui_response: guiResponse,
            paused_snapshot: buildPausedSnapshot(
              planState,
              stepIndex,
              sessionId,
              'rejected',
              guiResponse,
              decision.user_notes,
            ),
            elapsed_ms: elapsed,
          };
        }

        if (decision.outcome === 'deferred') {
          return {
            approved: false,
            path: 'gui',
            outcome: 'deferred',
            user_notes: decision.user_notes,
            gui_response: guiResponse,
            paused_snapshot: buildPausedSnapshot(
              planState,
              stepIndex,
              sessionId,
              'deferred',
              guiResponse,
              decision.user_notes,
            ),
            elapsed_ms: elapsed,
          };
        }

        const failureSuffix = decision.failure_reason
          ? ` (${decision.failure_reason})`
          : '';
        return {
          approved: false,
          path: 'gui',
          outcome: 'error',
          error: `Approval decision parsing failed${failureSuffix}: ${decision.detail ?? 'malformed response payload'}`,
          gui_response: guiResponse,
          elapsed_ms: elapsed,
        };
      }

      case 'timed_out': {
        const timeoutNotes = extractRejectionNotes(guiResponse);
        return {
          approved: false,
          path: 'gui',
          outcome: 'timeout',
          user_notes: timeoutNotes,
          gui_response: guiResponse,
          paused_snapshot: buildPausedSnapshot(
            planState,
            stepIndex,
            sessionId,
            'timeout',
            guiResponse,
            timeoutNotes,
          ),
          elapsed_ms: elapsed,
        };
      }

      case 'cancelled': {
        const userNotes = extractRejectionNotes(guiResponse);
        return {
          approved: false,
          path: 'gui',
          outcome: 'rejected',
          user_notes: userNotes,
          gui_response: guiResponse,
          paused_snapshot: buildPausedSnapshot(
            planState,
            stepIndex,
            sessionId,
            'rejected',
            guiResponse,
            userNotes,
          ),
          elapsed_ms: elapsed,
        };
      }

      case 'deferred': {
        const userNotes = extractRejectionNotes(guiResponse);
        return {
          approved: false,
          path: 'gui',
          outcome: 'deferred',
          user_notes: userNotes,
          gui_response: guiResponse,
          paused_snapshot: buildPausedSnapshot(
            planState,
            stepIndex,
            sessionId,
            'deferred',
            guiResponse,
            userNotes,
          ),
          elapsed_ms: elapsed,
        };
      }

      default: {
        return {
          approved: false,
          path: 'gui',
          outcome: 'error',
          error: `Unexpected approval response status: ${guiResponse.status}`,
          gui_response: guiResponse,
          elapsed_ms: elapsed,
        };
      }
    }
  } catch (err) {
    const baseError = `Approval gate error: ${err instanceof Error ? err.message : String(err)}`;
    const handoffInstruction = buildCoordinatorHandoffInstruction({
      ...handoffContextBase,
      outcome: 'fallback_to_chat',
      detail: baseError,
    });
    return {
      approved: false,
      path: 'fallback',
      outcome: 'fallback_to_chat',
      error: maybeAttachCoordinatorHandoffInstruction(baseError, {
        ...handoffContextBase,
        outcome: 'fallback_to_chat',
        detail: baseError,
      }),
      requires_handoff_to_coordinator: true,
      handoff_instruction: handoffInstruction,
      elapsed_ms: Date.now() - startTime,
    };
  }
}

/**
 * Write a PausedAtSnapshot to the plan state and set its status to 'paused'.
 *
 * Called by the Coordinator when an approval gate pauses a plan.
 */
export async function pausePlanAtApprovalGate(
  workspaceId: string,
  planId: string,
  snapshot: PausedAtSnapshot,
): Promise<PlanState | null> {
  const state = await store.getPlanState(workspaceId, planId);
  if (!state) return null;

  state.paused_at_snapshot = snapshot;
  state.status = 'paused';
  state.updated_at = new Date().toISOString();

  await store.savePlanState(state);
  await store.generatePlanMd(state);

  return state;
}

/**
 * Resume a paused plan: clear the PausedAtSnapshot and set status back to 'active'.
 *
 * Returns the step index where the plan should resume.
 */
export async function resumePausedPlan(
  workspaceId: string,
  planId: string,
): Promise<{ success: boolean; step_index?: number; phase?: string; error?: string }> {
  const state = await store.getPlanState(workspaceId, planId);
  if (!state) {
    return { success: false, error: `Plan not found: ${planId}` };
  }

  if (state.status !== 'paused') {
    return { success: false, error: `Plan is not paused (status: ${state.status})` };
  }

  if (!state.paused_at_snapshot) {
    return { success: false, error: 'Plan has no paused_at_snapshot' };
  }

  const { step_index, phase } = state.paused_at_snapshot;

  // Clear the snapshot and reactivate
  state.paused_at_snapshot = undefined;
  state.status = 'active';
  state.updated_at = new Date().toISOString();

  await store.savePlanState(state);
  await store.generatePlanMd(state);

  return { success: true, step_index, phase };
}
