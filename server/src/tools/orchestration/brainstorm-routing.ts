/**
 * Brainstorm Routing — brainstorm-routing.ts
 *
 * Orchestrates the brainstorm → GUI → Architect flow:
 * 1. Brainstorm agent produces a structured FormRequest payload.
 * 2. Coordinator calls `routeBrainstormToGui()` which sends it to the
 *    Supervisor via the supervisor-client.
 * 3. Wait for FormResponse (up to 5 min timeout).
 * 4. Return the structured answers for the Architect to consume.
 *
 * If the GUI is unavailable, `routeBrainstormWithFallback()` transparently
 * falls back to a plain-text extraction path so the Architect always
 * receives usable data regardless of GUI availability.
 *
 * Created in Phase 4 (Hub Integration) of the Brainstorm GUI plan.
 */

import type {
  FormRequest,
  FormResponse,
  Answer,
  Question,
  RadioSelectQuestion,
  RadioSelectAnswer,
  FreeTextAnswer,
} from '../../types/gui-forms.types.js';

import type {
  FormRefinementRequest,
  FormRefinementResponse,
} from '../../types/gui-forms.types.js';

import { randomUUID } from 'node:crypto';

import {
  checkGuiAvailability,
  continueFormApp,
  launchFormApp,
  type SupervisorClientOptions,
  type FormAppLaunchResult,
} from './supervisor-client.js';

// =========================================================================
// Result types
// =========================================================================

/** Outcome of a brainstorm routing attempt. */
export interface BrainstormRoutingResult {
  /** Whether the routing succeeded end-to-end. */
  success: boolean;
  /** Which path was used. */
  path: 'gui' | 'fallback';
  /** The structured answers from the user (or auto-filled defaults). */
  answers: Answer[];
  /** Full FormResponse when GUI was used. */
  gui_response?: FormResponse;
  /** Plain-text summary (always provided for Architect consumption). */
  text_summary: string;
  /** Error message if the routing failed entirely. */
  error?: string;
  /** Timing in milliseconds. */
  elapsed_ms: number;
}

// =========================================================================
// Refinement routing (Step 26)
// =========================================================================

/** Maximum number of refinement round-trips before forcing a final submission. */
const MAX_REFINEMENT_ROUNDS = 5;

/** Result of a standalone refinement routing call. */
export interface RefinementRoutingResult {
  /** Whether the routing succeeded. */
  success: boolean;
  /** Updated questions returned by the Brainstorm agent. */
  updated_questions: Question[];
  /** Error message if routing failed. */
  error?: string;
  /** Time taken in milliseconds. */
  elapsed_ms: number;
}

/**
 * Route a FormRefinementRequest to the Brainstorm agent via the Supervisor.
 *
 * Called when the Coordinator needs to obtain updated question options for
 * specific question IDs.  The request is forwarded to the Supervisor which
 * dispatches it to the active Brainstorm agent (app name: `brainstorm_refinement`).
 *
 * Return value contains only the updated questions (one per question_id in the
 * refinement request); the caller merges them back into the full question list.
 *
 * @param refinementReq - The FormRefinementRequest built from the GUI partial response
 * @param opts - Supervisor connection options
 */
export async function routeRefinementRequest(
  refinementReq: FormRefinementRequest,
  opts: SupervisorClientOptions = {},
): Promise<RefinementRoutingResult> {
  const startTime = Date.now();

  try {
    const result = await launchFormApp(
      'brainstorm_refinement',
      refinementReq,
      undefined, // use default timeout for refinement turnaround
      opts,
    );

    if (!result.success) {
      return {
        success: false,
        updated_questions: [],
        error: result.error ?? 'Brainstorm refinement routing failed',
        elapsed_ms: Date.now() - startTime,
      };
    }

    const response = result.response_payload as FormRefinementResponse | undefined;
    if (!response || !Array.isArray(response.updated_questions)) {
      return {
        success: false,
        updated_questions: [],
        error: 'Supervisor returned an invalid FormRefinementResponse payload',
        elapsed_ms: Date.now() - startTime,
      };
    }

    return {
      success: true,
      updated_questions: response.updated_questions,
      elapsed_ms: Date.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      updated_questions: [],
      error: `Refinement routing error: ${err instanceof Error ? err.message : String(err)}`,
      elapsed_ms: Date.now() - startTime,
    };
  }
}

/**
 * Route a brainstorm FormRequest through the GUI with full refinement support.
 *
 * If the GUI emits `status: "refinement_requested"`, this function:
 * 1. Calls the provided `handleRefinement` callback with the partial
 *    FormResponse to obtain a `FormRefinementResponse`.
 * 2. Sends that response back to the paused GUI session via `continueFormApp`.
 * 3. Repeats until the GUI emits a final `status: "submitted"` response or
 *    the `MAX_REFINEMENT_ROUNDS` limit is reached.
 *
 * @param formRequest         - The original FormRequest payload
 * @param handleRefinement    - Async callback: receives the refinement request
 *                              derived from the GUI's partial response and
 *                              returns a `FormRefinementResponse` with updated
 *                              question options.
 * @param opts                - Supervisor connection options
 */
export async function routeBrainstormWithRefinement(
  formRequest: FormRequest,
  handleRefinement: (req: FormRefinementRequest) => Promise<FormRefinementResponse>,
  opts: SupervisorClientOptions = {},
): Promise<BrainstormRoutingResult> {
  const startTime = Date.now();
  let refinementRounds = 0;

  // ── Initial GUI launch ──────────────────────────────────────────────────
  let result = await routeBrainstormToGui(formRequest, opts);

  if (!result.success) {
    return {
      success: false,
      path: 'gui',
      answers: [],
      text_summary: '',
      error: result.error ?? 'GUI launch failed',
      elapsed_ms: Date.now() - startTime,
    };
  }

  // ── Refinement loop ────────────────────────────────────────────────────
  while (result.pending_refinement && result.session_id && refinementRounds < MAX_REFINEMENT_ROUNDS) {
    refinementRounds += 1;

    const guiPartial = result.response_payload as FormResponse;

    // Build a FormRefinementRequest from the GUI's partial response.
    const refinementReq: FormRefinementRequest = {
      type: 'form_refinement_request',
      version: 1,
      request_id: randomUUID(),
      original_request_id: formRequest.request_id,
      form_type: formRequest.form_type,
      question_ids: (guiPartial.refinement_requests ?? []).map(r => r.question_id),
      user_feedback: (guiPartial.refinement_requests ?? []).map(r => ({
        question_id: r.question_id,
        feedback: r.feedback ?? '',
      })),
      current_answers: guiPartial.answers,
    };

    // Delegate to the caller (typically Brainstorm agent invocation).
    let refinementResp: FormRefinementResponse;
    try {
      refinementResp = await handleRefinement(refinementReq);
    } catch (err) {
      return {
        success: false,
        path: 'gui',
        answers: [],
        text_summary: '',
        error: `Refinement handler error (round ${refinementRounds}): ${
          err instanceof Error ? err.message : String(err)
        }`,
        elapsed_ms: Date.now() - startTime,
      };
    }

    // Send the refinement response back to the paused GUI session.
    result = await continueFormApp(
      result.session_id,
      refinementResp,
      formRequest.timeout?.duration_seconds,
      opts,
    );

    if (!result.success) {
      return {
        success: false,
        path: 'gui',
        answers: [],
        text_summary: '',
        error: result.error ?? `GUI failed after refinement round ${refinementRounds}`,
        elapsed_ms: Date.now() - startTime,
      };
    }
  }

  // ── Final result ───────────────────────────────────────────────────────
  if (!result.response_payload) {
    return {
      success: false,
      path: 'gui',
      answers: [],
      text_summary: '',
      error: 'GUI returned no payload after refinement loop',
      elapsed_ms: Date.now() - startTime,
    };
  }

  const guiResponse = result.response_payload as FormResponse;
  // Attach refinement metadata.
  if (guiResponse.metadata) {
    guiResponse.metadata.refinement_count = refinementRounds;
  }

  const textSummary = extractTextFromResponse(formRequest, guiResponse);
  return {
    success: true,
    path: 'gui',
    answers: guiResponse.answers,
    gui_response: guiResponse,
    text_summary: textSummary,
    elapsed_ms: Date.now() - startTime,
  };
}

// =========================================================================
// GUI path
// =========================================================================

/**
 * Send a brainstorm FormRequest to the GUI via the Supervisor and wait
 * for the user's response.
 *
 * @param formRequest - The validated FormRequest payload
 * @param opts - Supervisor connection options
 * @returns The FormResponse from the GUI process
 */
export async function routeBrainstormToGui(
  formRequest: FormRequest,
  opts: SupervisorClientOptions = {},
): Promise<FormAppLaunchResult> {
  // Use the form's timeout if configured
  const guiTimeout = formRequest.timeout?.duration_seconds;

  return launchFormApp('brainstorm_gui', formRequest, guiTimeout, opts);
}

// =========================================================================
// Fallback path (Step 22)
// =========================================================================

/**
 * Extract a plain-text summary from a FormRequest by reading the
 * recommended options and question labels.
 *
 * Used when the GUI is unavailable — the Architect receives a text summary
 * derived from the Brainstorm agent's recommendations instead of user
 * selections.
 *
 * This is the "chat fallback" path.
 */
export function extractFallbackTextFromRequest(
  formRequest: FormRequest,
): { answers: Answer[]; text_summary: string } {
  const answers: Answer[] = [];
  const lines: string[] = [];

  lines.push(`# Brainstorm Decisions (auto-filled — GUI unavailable)`);
  lines.push('');

  for (const question of formRequest.questions) {
    switch (question.type) {
      case 'radio_select': {
        const recommended = question.options.find(o => o.recommended);
        const selected = recommended ?? question.options[0];
        if (selected) {
          answers.push({
            question_id: question.id,
            value: {
              type: 'radio_select_answer',
              selected: selected.id,
            } as RadioSelectAnswer,
            auto_filled: true,
          });
          lines.push(`## ${question.label}`);
          if (question.description) lines.push(question.description);
          lines.push(`**Selected:** ${selected.label}`);
          if (selected.description) lines.push(selected.description);
          if (selected.pros?.length) lines.push(`Pros: ${selected.pros.join(', ')}`);
          if (selected.cons?.length) lines.push(`Cons: ${selected.cons.join(', ')}`);
          lines.push('');
        }
        break;
      }
      case 'free_text': {
        const defaultValue = question.default_value ?? '';
        answers.push({
          question_id: question.id,
          value: {
            type: 'free_text_answer',
            value: defaultValue,
          } as FreeTextAnswer,
          auto_filled: true,
        });
        if (defaultValue) {
          lines.push(`## ${question.label}`);
          lines.push(defaultValue);
          lines.push('');
        }
        break;
      }
      case 'confirm_reject': {
        // Auto-approve by default
        answers.push({
          question_id: question.id,
          value: {
            type: 'confirm_reject_answer',
            action: 'approve',
          },
          auto_filled: true,
        });
        lines.push(`## ${question.label}`);
        lines.push('**Auto-approved** (GUI unavailable)');
        lines.push('');
        break;
      }
      case 'countdown_timer': {
        // Timer doesn't produce user input — skip
        answers.push({
          question_id: question.id,
          value: {
            type: 'countdown_timer_answer',
            result: 'completed',
            elapsed_seconds: 0,
          },
          auto_filled: true,
        });
        break;
      }
    }
  }

  return {
    answers,
    text_summary: lines.join('\n'),
  };
}

/**
 * Extract a plain-text summary from a completed FormResponse.
 *
 * Used after GUI interaction to produce a readable summary for the Architect.
 */
export function extractTextFromResponse(
  formRequest: FormRequest,
  formResponse: FormResponse,
): string {
  const lines: string[] = [];
  lines.push(`# Brainstorm Decisions`);
  lines.push('');

  // Build a question lookup
  const questionMap = new Map<string, Question>();
  for (const q of formRequest.questions) {
    questionMap.set(q.id, q);
  }

  for (const answer of formResponse.answers) {
    const question = questionMap.get(answer.question_id);
    if (!question) continue;

    lines.push(`## ${question.label}`);
    if ('description' in question && question.description) {
      lines.push(question.description);
    }

    switch (answer.value.type) {
      case 'radio_select_answer': {
        const radioAnswer = answer.value as RadioSelectAnswer;
        const rsq = question as RadioSelectQuestion;
        const option = rsq.options.find(o => o.id === radioAnswer.selected);
        lines.push(`**Selected:** ${option?.label ?? radioAnswer.selected}`);
        if (option?.description) lines.push(option.description);
        if (radioAnswer.free_text) {
          lines.push(`**Notes:** ${radioAnswer.free_text}`);
        }
        if (answer.auto_filled) lines.push('*(auto-filled)*');
        break;
      }
      case 'free_text_answer': {
        const val = (answer.value as FreeTextAnswer).value;
        if (val) lines.push(val);
        if (answer.auto_filled) lines.push('*(auto-filled)*');
        break;
      }
      case 'confirm_reject_answer': {
        lines.push(`**Decision:** ${answer.value.action}`);
        if (answer.value.notes) lines.push(`**Notes:** ${answer.value.notes}`);
        break;
      }
      case 'countdown_timer_answer': {
        // Don't include timer answers in the summary
        break;
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// =========================================================================
// Combined routing with automatic fallback
// =========================================================================

/**
 * Route a brainstorm FormRequest through the GUI if available,
 * or fall back to a text extraction if the GUI is unavailable.
 *
 * This is the primary entry point for the Coordinator. The Architect
 * always receives a usable result regardless of GUI availability.
 *
 * @param formRequest - The brainstorm FormRequest from the Brainstorm agent
 * @param opts - Supervisor connection options
 * @returns BrainstormRoutingResult with answers and text summary
 */
export async function routeBrainstormWithFallback(
  formRequest: FormRequest,
  opts: SupervisorClientOptions = {},
): Promise<BrainstormRoutingResult> {
  const startTime = Date.now();

  // 1. Check GUI availability
  const availability = await checkGuiAvailability(opts);

  if (!availability.supervisor_running || !availability.brainstorm_gui) {
    // Fallback: extract recommendations as text
    const fallback = extractFallbackTextFromRequest(formRequest);
    return {
      success: true,
      path: 'fallback',
      answers: fallback.answers,
      text_summary: fallback.text_summary,
      elapsed_ms: Date.now() - startTime,
    };
  }

  // 2. Try GUI path
  try {
    const result = await routeBrainstormToGui(formRequest, opts);

    if (result.success && result.response_payload) {
      const guiResponse = result.response_payload as FormResponse;
      const textSummary = extractTextFromResponse(formRequest, guiResponse);

      return {
        success: true,
        path: 'gui',
        answers: guiResponse.answers,
        gui_response: guiResponse,
        text_summary: textSummary,
        elapsed_ms: result.elapsed_ms,
      };
    }

    // GUI launched but failed — fall back to text extraction
    const fallback = extractFallbackTextFromRequest(formRequest);
    return {
      success: true,
      path: 'fallback',
      answers: fallback.answers,
      text_summary: fallback.text_summary,
      error: `GUI failed: ${result.error ?? 'unknown error'}; used fallback`,
      elapsed_ms: Date.now() - startTime,
    };
  } catch (err) {
    // Connection/timeout error — fall back
    const fallback = extractFallbackTextFromRequest(formRequest);
    return {
      success: true,
      path: 'fallback',
      answers: fallback.answers,
      text_summary: fallback.text_summary,
      error: `GUI error: ${err instanceof Error ? err.message : String(err)}; used fallback`,
      elapsed_ms: Date.now() - startTime,
    };
  }
}
