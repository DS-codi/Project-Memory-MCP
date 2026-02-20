/**
 * Factory functions for constructing validated FormRequest payloads.
 *
 * Mirrors: pm-gui-forms/src/protocol/brainstorm.rs, approval.rs (Rust canonical source).
 * Provides sensible defaults so agents only specify metadata + questions.
 */

import { randomUUID } from 'node:crypto';

import type {
  Answer,
  ApprovalStepContext,
  FormMetadata,
  FormRequest,
  FormRefinementRequest,
  FormResponse,
  FormStatus,
  Question,
  RefinementEntry,
} from '../types/gui-forms.types.js';

/**
 * Create a brainstorm FormRequest with sensible defaults.
 *
 * Defaults (mirrors Rust `BrainstormRequest::new`):
 * - timeout: 300 s, on_timeout: 'auto_fill', fallback: 'chat'
 * - window: 900×700, not always-on-top, title: 'Brainstorm'
 */
export function createBrainstormRequest(
  metadata: FormMetadata,
  questions: Question[],
): FormRequest {
  return {
    type: 'form_request',
    version: 1,
    request_id: randomUUID(),
    form_type: 'brainstorm',
    metadata,
    timeout: {
      duration_seconds: 300,
      on_timeout: 'auto_fill',
      fallback_mode: 'chat',
    },
    window: {
      always_on_top: false,
      width: 900,
      height: 700,
      title: 'Brainstorm',
    },
    questions,
  };
}

/**
 * Create an approval FormRequest with sensible defaults.
 *
 * Defaults (mirrors Rust `ApprovalRequest::new`):
 * - timeout: 60 s, on_timeout: 'approve', fallback: 'none'
 * - window: 500×350, always-on-top, title: 'Approval Required'
 */
export function createApprovalRequest(
  metadata: FormMetadata,
  questions: Question[],
  stepContext?: ApprovalStepContext,
): FormRequest {
  return {
    type: 'form_request',
    version: 1,
    request_id: randomUUID(),
    form_type: 'approval',
    metadata,
    timeout: {
      duration_seconds: 60,
      on_timeout: 'approve',
      fallback_mode: 'none',
    },
    window: {
      always_on_top: true,
      width: 500,
      height: 350,
      title: 'Approval Required',
    },
    questions,
    ...(stepContext ? { context: stepContext } : {}),
  };
}

/**
 * Create a FormResponse envelope.
 *
 * Used by the GUI process or test harnesses to construct a valid response.
 */
export function createFormResponse(
  requestId: string,
  status: FormStatus,
  answers: Answer[],
  metadata: {
    plan_id: string;
    workspace_id: string;
    session_id: string;
    completed_at?: string;
    duration_ms?: number;
    auto_filled_count?: number;
    refinement_count?: number;
  },
  formType: 'brainstorm' | 'approval' = 'brainstorm',
): FormResponse {
  return {
    type: 'form_response',
    version: 1,
    request_id: requestId,
    form_type: formType,
    status,
    metadata: {
      plan_id: metadata.plan_id,
      workspace_id: metadata.workspace_id,
      session_id: metadata.session_id,
      completed_at: metadata.completed_at ?? new Date().toISOString(),
      duration_ms: metadata.duration_ms ?? 0,
      auto_filled_count: metadata.auto_filled_count ?? 0,
      refinement_count: metadata.refinement_count ?? 0,
    },
    answers,
  };
}

/**
 * Create a refinement request for follow-up questions.
 *
 * Used when the user marks questions for re-evaluation.
 */
export function createRefinementRequest(
  originalRequestId: string,
  questionIds: string[],
  userFeedback: RefinementEntry[],
  currentAnswers: Answer[],
): FormRefinementRequest {
  return {
    type: 'form_refinement_request',
    version: 1,
    request_id: randomUUID(),
    original_request_id: originalRequestId,
    form_type: 'brainstorm',
    question_ids: questionIds,
    user_feedback: userFeedback,
    current_answers: currentAnswers,
  };
}

// ── Helper predicates ──────────────────────────────────────────

/**
 * Returns `true` if the response indicates the user wants refinement.
 */
export function isBrainstormRefinementRequested(
  response: FormResponse,
): boolean {
  return response.status === 'refinement_requested';
}

/**
 * Returns `true` if the approval was granted (completed or timed-out with auto-approve).
 */
export function isApprovalGranted(response: FormResponse): boolean {
  return response.status === 'completed' || response.status === 'timed_out';
}

/**
 * Returns `true` if the user explicitly rejected the approval gate.
 */
export function isApprovalRejected(response: FormResponse): boolean {
  return response.status === 'cancelled';
}
