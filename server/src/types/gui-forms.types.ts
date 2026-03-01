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
  type: 'confirm_reject_answer';
  action: ConfirmRejectAction;
  /** Optional notes explaining the decision. */
  notes?: string;
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
  context?: ApprovalStepContext | Record<string, unknown>;
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
