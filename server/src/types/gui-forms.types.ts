/**
 * TypeScript protocol types for the FormRequest/FormResponse wire protocol.
 *
 * Mirrors: pm-gui-forms/src/protocol/ (Rust canonical source).
 * Used by: Brainstorm agent, Coordinator, MCP server.
 *
 * Key mapping decisions:
 * - Serde `#[serde(tag = "type")]` → discriminated union on string literal `type`
 * - `Uuid` → `string` (UUID v4 format)
 * - `DateTime<Utc>` → `string` (ISO 8601)
 * - Rust impl builders → factory functions in gui-forms.utils.ts
 * - Newtype wrappers → type aliases
 */

// ── Enums (string literal unions) ──────────────────────────────

/** Which kind of form this is. */
export type FormType = 'brainstorm' | 'approval';

/** Contract mode for approval requests/responses. */
export type ApprovalMode = 'binary' | 'multiple_choice' | 'multi_approval_session';

/** Explicit request shape for approval-mode negotiation. */
export type ApprovalRequestShape =
  | 'confirm_reject_question'
  | 'radio_select_question'
  | 'multi_approval_question_set';

/** Explicit response shape for approval-mode negotiation. */
export type ApprovalResponseShape =
  | 'confirm_reject_answer'
  | 'radio_select_answer'
  | 'approval_decision_v2';

/** Terminal status of a submitted/timed-out/cancelled form. */
export type FormStatus =
  | 'completed'
  | 'cancelled'
  | 'timed_out'
  | 'deferred'
  | 'refinement_requested';

/** Action taken when the form timeout expires. */
export type TimeoutAction = 'auto_fill' | 'approve' | 'reject' | 'defer';

/** Fallback mode when the GUI binary is unavailable. */
export type GuiFormsFallbackMode = 'chat' | 'none';

/** Possible actions for a confirm/reject answer. */
export type ConfirmRejectAction = 'approve' | 'reject';

/** Deterministic decision state for v2 approval payloads. */
export type ApprovalDecisionState = 'approve' | 'reject' | 'defer' | 'no_decision' | 'invalid';

/** Deterministic outcomes expected by approval gate routing. */
export type ApprovalRoutingOutcome =
  | 'approved'
  | 'rejected'
  | 'timeout'
  | 'deferred'
  | 'fallback_to_chat'
  | 'error';

/**
 * Compatibility/failure cases that approval routing must handle deterministically.
 *
 * Cross-layer contract:
 * - Legacy `confirm_reject`/`confirm_reject_answer` payloads remain accepted.
 * - Unknown modes and malformed decision payloads are fail-safe (never auto-approved).
 * - Partial multi-session decisions map to non-approved outcomes.
 */
export type ApprovalCompatibilityCase =
  | 'legacy_confirm_reject_approve'
  | 'legacy_confirm_reject_reject'
  | 'v2_binary_approve'
  | 'v2_binary_reject'
  | 'v2_multiple_choice_selected'
  | 'v2_multi_session_all_approved'
  | 'v2_multi_session_any_rejected'
  | 'v2_multi_session_partial_or_deferred'
  | 'timed_out'
  | 'form_deferred'
  | 'gui_unavailable_or_launch_failed'
  | 'missing_decision_payload'
  | 'unknown_mode'
  | 'malformed_answer_payload';

/** Optional deterministic reason codes for non-approved compatibility outcomes. */
export type ApprovalFailureReason =
  | 'missing_decision'
  | 'unknown_mode'
  | 'malformed_answer'
  | 'partial_session_completion'
  | 'gui_unavailable'
  | 'launch_failed'
  | 'response_status_unexpected'
  | 'request_timed_out';

/** One row in the compatibility/failure semantics matrix. */
export interface ApprovalCompatibilityMatrixEntry {
  case: ApprovalCompatibilityCase;
  outcome: ApprovalRoutingOutcome;
  approved: boolean;
  failure_reason?: ApprovalFailureReason;
  notes: string;
}

/**
 * Canonical approval compatibility and failure semantics matrix.
 *
 * This documents expected routing behavior for legacy and v2 payloads.
 * Missing/unknown/malformed decisions are intentionally non-approved.
 */
export const APPROVAL_COMPATIBILITY_MATRIX: readonly ApprovalCompatibilityMatrixEntry[] = [
  {
    case: 'legacy_confirm_reject_approve',
    outcome: 'approved',
    approved: true,
    notes: 'Legacy confirm_reject payload with explicit approve action.',
  },
  {
    case: 'legacy_confirm_reject_reject',
    outcome: 'rejected',
    approved: false,
    notes: 'Legacy confirm_reject payload with explicit reject action.',
  },
  {
    case: 'v2_binary_approve',
    outcome: 'approved',
    approved: true,
    notes: 'V2 binary decision contains explicit approve action.',
  },
  {
    case: 'v2_binary_reject',
    outcome: 'rejected',
    approved: false,
    notes: 'V2 binary decision contains explicit reject action.',
  },
  {
    case: 'v2_multiple_choice_selected',
    outcome: 'approved',
    approved: true,
    notes: 'V2 multiple-choice decision selected a non-empty option id.',
  },
  {
    case: 'v2_multi_session_all_approved',
    outcome: 'approved',
    approved: true,
    notes: 'Every multi-session decision is approve.',
  },
  {
    case: 'v2_multi_session_any_rejected',
    outcome: 'rejected',
    approved: false,
    notes: 'At least one multi-session item is explicitly rejected.',
  },
  {
    case: 'v2_multi_session_partial_or_deferred',
    outcome: 'deferred',
    approved: false,
    failure_reason: 'partial_session_completion',
    notes: 'Any defer/no_decision indicates incomplete approval set.',
  },
  {
    case: 'timed_out',
    outcome: 'timeout',
    approved: false,
    failure_reason: 'request_timed_out',
    notes: 'Timeout is non-approved unless an explicit decision answer is parsed.',
  },
  {
    case: 'form_deferred',
    outcome: 'deferred',
    approved: false,
    notes: 'GUI explicitly deferred decision.',
  },
  {
    case: 'gui_unavailable_or_launch_failed',
    outcome: 'fallback_to_chat',
    approved: false,
    failure_reason: 'gui_unavailable',
    notes: 'Supervisor/GUI unavailable or launch failure requires coordinator handoff.',
  },
  {
    case: 'missing_decision_payload',
    outcome: 'error',
    approved: false,
    failure_reason: 'missing_decision',
    notes: 'Completed response without parseable decision payload is fail-safe.',
  },
  {
    case: 'unknown_mode',
    outcome: 'error',
    approved: false,
    failure_reason: 'unknown_mode',
    notes: 'Unknown approval mode is treated as a protocol error.',
  },
  {
    case: 'malformed_answer_payload',
    outcome: 'error',
    approved: false,
    failure_reason: 'malformed_answer',
    notes: 'Malformed answer payload is treated as a protocol error.',
  },
] as const;

/** Result of a countdown timer question. */
export type TimerResult = 'completed' | 'timed_out';

// ── Config types ───────────────────────────────────────────────

/** Timeout configuration for a form. */
export interface TimeoutConfig {
  /** Total allowed seconds before timeout fires. */
  duration_seconds: number;
  /** What happens when the timer expires. */
  on_timeout: TimeoutAction;
  /** Fallback behaviour when the GUI process cannot be launched. */
  fallback_mode: GuiFormsFallbackMode;
}

/** Window configuration controlling size and flags of the GUI window. */
export interface WindowConfig {
  /** Whether the window stays on top of all other windows. @default false */
  always_on_top?: boolean;
  /** Window width in logical pixels. @default 900 */
  width?: number;
  /** Window height in logical pixels. @default 700 */
  height?: number;
  /** Title for the window title-bar. */
  title: string;
}

/** Session metadata for multi-approval handling. */
export interface ApprovalSessionContract {
  session_id: string;
  item_ids?: string[];
  require_all_responses?: boolean;
}

/** Shared approval contract metadata (v2) for explicit mode/shape negotiation. */
export interface ApprovalContractV2 {
  mode: ApprovalMode;
  request_shape: ApprovalRequestShape;
  response_shape: ApprovalResponseShape;
  session?: ApprovalSessionContract;
}

// ── Metadata ───────────────────────────────────────────────────

/** Metadata shared across request and response envelopes. */
export interface FormMetadata {
  plan_id: string;
  workspace_id: string;
  session_id: string;
  agent: string;
  title: string;
  description?: string;
}

/** Metadata attached to a response. */
export interface ResponseMetadata {
  plan_id: string;
  workspace_id: string;
  session_id: string;
  /** ISO 8601 timestamp. */
  completed_at?: string;
  /** @default 0 */
  duration_ms?: number;
  /** @default 0 */
  auto_filled_count?: number;
  /** How many refinement round-trips occurred before final submission. @default 0 */
  refinement_count?: number;
}

// ── Question types ─────────────────────────────────────────────

/** A single option within a RadioSelectQuestion. */
export interface RadioOption {
  /** Unique identifier for this option. */
  id: string;
  /** Short label displayed to the user. */
  label: string;
  /** Longer description of the option. */
  description?: string;
  /** Arguments in favour. @default [] */
  pros?: string[];
  /** Arguments against. @default [] */
  cons?: string[];
  /** Whether the agent recommends this option. @default false */
  recommended?: boolean;
}

/** Pick one option from a list, optionally with free-text override. */
export interface RadioSelectQuestion {
  type: 'radio_select';
  id: string;
  label: string;
  description?: string;
  /** @default true */
  required?: boolean;
  options: RadioOption[];
  /** @default true */
  allow_free_text?: boolean;
  free_text_placeholder?: string;
}

/** Free-form text input. */
export interface FreeTextQuestion {
  type: 'free_text';
  id: string;
  label: string;
  description?: string;
  /** @default false */
  required?: boolean;
  placeholder?: string;
  default_value?: string;
  /** @default 2000 */
  max_length?: number;
}

/** Binary approve / reject decision. */
export interface ConfirmRejectQuestion {
  type: 'confirm_reject';
  id: string;
  label: string;
  description?: string;
  /** @default true */
  required?: boolean;
  /** @default 'Approve' */
  approve_label?: string;
  /** @default 'Reject' */
  reject_label?: string;
  /** @default true */
  allow_notes?: boolean;
  notes_placeholder?: string;
}

/** Visual countdown timer bound to the form-level timeout. */
export interface CountdownTimerQuestion {
  type: 'countdown_timer';
  id: string;
  /** Label text; may include {remaining} placeholder for seconds. */
  label: string;
  /** Duration in seconds (typically mirrors TimeoutConfig.duration_seconds). */
  duration_seconds: number;
  /** What happens when the timer expires. */
  on_timeout: TimeoutAction;
  /** Whether user interaction pauses the countdown. @default true */
  pause_on_interaction?: boolean;
}

/** Discriminated union of all question types, tagged on 'type'. */
export type Question =
  | RadioSelectQuestion
  | FreeTextQuestion
  | ConfirmRejectQuestion
  | CountdownTimerQuestion;

/** One approval prompt item in a multi-approval session. */
export interface ApprovalQuestionItem {
  item_id: string;
  label: string;
  description?: string;
  question: Question;
}

/** Explicit v2 request payload for approval-mode question sets. */
export interface ApprovalQuestionSetV2 {
  mode: ApprovalMode;
  items?: ApprovalQuestionItem[];
}

// ── Answer types ───────────────────────────────────────────────

/** Answer to a radio_select question. */
export interface RadioSelectAnswer {
  type: 'radio_select_answer';
  /** The id of the selected RadioOption. */
  selected: string;
  /** Optional free-text override or annotation. */
  free_text?: string;
}

/** Answer to a free_text question. */
export interface FreeTextAnswer {
  type: 'free_text_answer';
  value: string;
}

/** Answer to a confirm_reject question. */
export interface ConfirmRejectAnswer {
  /** Legacy payloads may use 'confirm_reject'. */
  type: 'confirm_reject_answer' | 'confirm_reject';
  action: ConfirmRejectAction;
  /** Optional notes explaining the decision. */
  notes?: string;
}

/** Per-item decision entry used by multi-approval sessions. */
export interface ApprovalSessionItemDecisionV2 {
  item_id: string;
  decision: ApprovalDecisionState;
  selected?: string;
  notes?: string;
}

/** Explicit v2 approval decision payload. */
export interface ApprovalDecisionPayloadV2 {
  mode: ApprovalMode;
  /** Binary mode action. */
  action?: ConfirmRejectAction;
  /** Multiple-choice mode selected option id. */
  selected?: string;
  /** Multi-session mode session id. */
  session_id?: string;
  /** Multi-session mode per-item decisions. */
  decisions?: ApprovalSessionItemDecisionV2[];
  notes?: string;
}

/** Explicit v2 approval decision answer envelope. */
export interface ApprovalDecisionV2Answer {
  type: 'approval_decision_v2';
  decision: ApprovalDecisionPayloadV2;
}

/** Answer to a countdown_timer question. */
export interface CountdownTimerAnswer {
  type: 'countdown_timer_answer';
  /** Whether the user completed in time or the timer expired. */
  result: TimerResult;
  /** How many seconds elapsed before completion or timeout. */
  elapsed_seconds: number;
}

/** Discriminated union of all answer value types, tagged on 'type'. */
export type AnswerValue =
  | RadioSelectAnswer
  | FreeTextAnswer
  | ConfirmRejectAnswer
  | ApprovalDecisionV2Answer
  | CountdownTimerAnswer;

/** A single answer bundled with metadata. */
export interface Answer {
  /** References a Question by its id. */
  question_id: string;
  /** The typed answer value. */
  value: AnswerValue;
  /** Whether this answer was auto-filled due to timeout. @default false */
  auto_filled?: boolean;
  /** Whether the user flagged this answer for refinement. @default false */
  marked_for_refinement?: boolean;
}

// ── Envelope types ─────────────────────────────────────────────

/** User feedback requesting re-evaluation of a specific question. */
export interface RefinementRequestEntry {
  question_id: string;
  feedback: string;
}

/** The inbound request sent from Supervisor → GUI on stdin. */
export interface FormRequest {
  /** Always 'form_request'. */
  type: 'form_request';
  /** Protocol version (currently 1). */
  version: number;
  /** Unique identifier for this request (UUID v4). */
  request_id: string;
  /** Which form variant. */
  form_type: FormType;
  /** Contextual metadata. */
  metadata: FormMetadata;
  /** Timeout configuration. */
  timeout: TimeoutConfig;
  /** Window configuration. */
  window: WindowConfig;
  /** Ordered list of questions to present. */
  questions: Question[];
  /** Optional form-type-specific context (e.g. ApprovalStepContext for approval forms). */
  context?: ApprovalStepContext | ApprovalRequestContextV2 | Record<string, unknown>;
}

/** The outbound response sent from GUI → Supervisor on stdout. */
export interface FormResponse {
  /** Always 'form_response'. */
  type: 'form_response';
  /** Protocol version (currently 1). */
  version: number;
  /** Echoes FormRequest.request_id. */
  request_id: string;
  /** Which form variant. */
  form_type: FormType;
  /** Terminal status. */
  status: FormStatus;
  /** Response metadata. */
  metadata: ResponseMetadata;
  /** User's answers. */
  answers: Answer[];
  /** Only present when status === 'refinement_requested'. @default [] */
  refinement_requests?: RefinementRequestEntry[];
  /** Populated on final submission when one or more refinements occurred. */
  refinement_session?: RefinementSession;
}

// ── Refinement protocol ────────────────────────────────────────

/** A single refinement entry mapping a question to user feedback. */
export interface RefinementEntry {
  question_id: string;
  feedback: string;
}

/** Request from Supervisor → Brainstorm agent for re-evaluation. */
export interface FormRefinementRequest {
  /** Always 'form_refinement_request'. */
  type: 'form_refinement_request';
  /** Protocol version. */
  version: number;
  /** Unique ID for this refinement request (UUID v4). */
  request_id: string;
  /** The request_id of the original FormRequest. */
  original_request_id: string;
  /** Always 'brainstorm' for refinement. */
  form_type: FormType;
  /** IDs of questions the user wants re-evaluated. */
  question_ids: string[];
  /** Per-question user feedback. */
  user_feedback: RefinementEntry[];
  /** Snapshot of all current answers at time of refinement request. */
  current_answers: Answer[];
}

/** Response from Brainstorm agent with updated questions. */
export interface FormRefinementResponse {
  /** Always 'form_refinement_response'. */
  type: 'form_refinement_response';
  /** Protocol version. */
  version: number;
  /** Matches FormRefinementRequest.request_id. */
  request_id: string;
  /** The original form request ID. */
  original_request_id: string;
  /** Replacement questions (only those that were refined). */
  updated_questions: Question[];
}

// ── Refinement session tracking ────────────────────────────────

/** Records the difference between original and refined options for one question. */
export interface QuestionDiff {
  /** The ID of the question that was refined. */
  question_id: string;
  /** Original options/content before refinement. */
  original_options: RadioOption[];
  /** Replacement options/content after refinement. */
  refined_options: RadioOption[];
  /** ISO 8601 timestamp when this round-trip completed. */
  refined_at: string;
}

/**
 * Tracks the full history of refinement round-trips for a single form session.
 * Attached to the final FormResponse so the server can inspect what changed.
 */
export interface RefinementSession {
  /** Total number of completed refinement round-trips. */
  round_trip_count: number;
  /** Per-question diff records across all round-trips. */
  question_diffs: QuestionDiff[];
  /** ISO 8601 timestamp of the first refinement request. */
  started_at: string;
  /** ISO 8601 timestamp of the most recent completed refinement. */
  last_refined_at?: string;
}

// ── Typed wrappers (type aliases) ──────────────────────────────

/** Brainstorm-specific response (type alias for documentation). */
export type BrainstormResponse = FormResponse;

/** Approval-specific response (type alias for documentation). */
export type ApprovalResponse = FormResponse;

// ── Approval-specific context types ────────────────────────────

/** Visual indicator for the urgency of the approval decision. */
export type ApprovalUrgency = 'low' | 'medium' | 'high' | 'critical';

/**
 * Structured context about the gated plan step.
 * Mirrors Rust `ApprovalStepContext` in pm-gui-forms/src/protocol/approval.rs.
 * Embedded in FormRequest.context for approval forms.
 */
export interface ApprovalStepContext {
  plan_title: string;
  phase: string;
  step_task: string;
  step_index: number;
  urgency: ApprovalUrgency;
}

/** V2 approval context carrying explicit contract metadata. */
export interface ApprovalRequestContextV2 {
  plan_title: string;
  phase: string;
  step_task: string;
  step_index: number;
  urgency: ApprovalUrgency;
  contract: ApprovalContractV2;
}
