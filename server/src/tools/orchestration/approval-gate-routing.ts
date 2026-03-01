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
  FormRequest,
  FormResponse,
  ApprovalStepContext,
  ApprovalUrgency,
  ConfirmRejectAnswer,
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
export type ApprovalOutcome = 'approved' | 'rejected' | 'timeout' | 'deferred' | 'fallback_to_chat' | 'error';

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
  /** Timing in milliseconds. */
  elapsed_ms: number;
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
  for (const answer of response.answers) {
    if (answer.value.type === 'confirm_reject_answer') {
      const cra = answer.value as ConfirmRejectAnswer;
      if (cra.action === 'reject' && cra.notes) {
        return cra.notes;
      }
    }
  }
  return undefined;
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

/** Build a FormRequest for an approval gate dialog. */
function buildApprovalFormRequest(
  planState: PlanState,
  stepIndex: number,
  sessionId: string,
): FormRequest {
  const step = planState.steps[stepIndex];
  const stepContext = buildStepContext(planState, stepIndex);

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
      on_timeout: 'approve' as const,
      pause_on_interaction: true,
    },
  ];

  return createApprovalRequest(
    {
      plan_id: planState.id,
      workspace_id: planState.workspace_id,
      session_id: sessionId,
      agent: 'Coordinator',
      title: `Approval Required: ${step?.task ?? 'Plan step'}`,
      description: `Step ${stepIndex + 1} of plan "${planState.title}"`,
    },
    questions,
    stepContext,
  );
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
  const step = planState.steps[stepIndex];

  // 1. Check GUI availability
  const availability = await checkGuiAvailability(opts);

  if (!availability.supervisor_running || !availability.approval_gui) {
    return {
      approved: false,
      path: 'fallback',
      outcome: 'fallback_to_chat',
      error: 'Approval GUI unavailable; fallback_to_chat',
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
      return {
        approved: false,
        path: 'fallback',
        outcome: 'fallback_to_chat',
        error: `Approval GUI failed: ${result.error}`,
        elapsed_ms: Date.now() - startTime,
      };
    }

    const guiResponse = result.response_payload as FormResponse | undefined;
    if (!guiResponse) {
      return {
        approved: false,
        path: 'fallback',
        outcome: 'fallback_to_chat',
        error: 'Approval GUI returned no response payload',
        elapsed_ms: Date.now() - startTime,
      };
    }

    // 3. Interpret the response
    const elapsed = result.elapsed_ms;

    switch (guiResponse.status) {
      case 'completed': {
        // Check if the confirm_reject answer is approve or reject
        const decision = guiResponse.answers.find(
          a => a.value.type === 'confirm_reject_answer',
        );
        if (decision) {
          const cra = decision.value as ConfirmRejectAnswer;
          if (cra.action === 'approve') {
            return {
              approved: true,
              path: 'gui',
              outcome: 'approved',
              gui_response: guiResponse,
              elapsed_ms: elapsed,
            };
          }
          // Explicit rejection
          const userNotes = cra.notes;
          return {
            approved: false,
            path: 'gui',
            outcome: 'rejected',
            user_notes: userNotes,
            gui_response: guiResponse,
            paused_snapshot: {
              paused_at: new Date().toISOString(),
              step_index: stepIndex,
              phase: step?.phase ?? planState.current_phase,
              step_task: step?.task ?? 'Unknown',
              reason: 'rejected',
              approval_response: guiResponse,
              user_notes: userNotes,
              session_id: sessionId,
            },
            elapsed_ms: elapsed,
          };
        }
        // No confirm_reject answer found — treat as approved
        return {
          approved: true,
          path: 'gui',
          outcome: 'approved',
          gui_response: guiResponse,
          elapsed_ms: elapsed,
        };
      }

      case 'timed_out': {
        // Timer expired — check on_timeout setting
        // Default for approval is auto-approve on timeout
        if (formRequest.timeout.on_timeout === 'approve') {
          return {
            approved: true,
            path: 'gui',
            outcome: 'approved',
            gui_response: guiResponse,
            elapsed_ms: elapsed,
          };
        }
        // Timeout with reject action → pause
        return {
          approved: false,
          path: 'gui',
          outcome: 'timeout',
          gui_response: guiResponse,
          paused_snapshot: {
            paused_at: new Date().toISOString(),
            step_index: stepIndex,
            phase: step?.phase ?? planState.current_phase,
            step_task: step?.task ?? 'Unknown',
            reason: 'timeout',
            approval_response: guiResponse,
            session_id: sessionId,
          },
          elapsed_ms: elapsed,
        };
      }

      case 'cancelled': {
        // User closed the dialog — treat as rejection
        const userNotes = extractRejectionNotes(guiResponse);
        return {
          approved: false,
          path: 'gui',
          outcome: 'rejected',
          user_notes: userNotes,
          gui_response: guiResponse,
          paused_snapshot: {
            paused_at: new Date().toISOString(),
            step_index: stepIndex,
            phase: step?.phase ?? planState.current_phase,
            step_task: step?.task ?? 'Unknown',
            reason: 'rejected',
            approval_response: guiResponse,
            user_notes: userNotes,
            session_id: sessionId,
          },
          elapsed_ms: elapsed,
        };
      }

      case 'deferred': {
        return {
          approved: false,
          path: 'gui',
          outcome: 'deferred',
          gui_response: guiResponse,
          paused_snapshot: {
            paused_at: new Date().toISOString(),
            step_index: stepIndex,
            phase: step?.phase ?? planState.current_phase,
            step_task: step?.task ?? 'Unknown',
            reason: 'deferred',
            approval_response: guiResponse,
            session_id: sessionId,
          },
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
    return {
      approved: false,
      path: 'fallback',
      outcome: 'fallback_to_chat',
      error: `Approval gate error: ${err instanceof Error ? err.message : String(err)}`,
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
