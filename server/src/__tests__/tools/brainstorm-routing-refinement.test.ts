/**
 * Tests for routeRefinementRequest() and routeBrainstormWithRefinement() — Phase 5
 * Round-Trip Refinement.
 *
 * Covers:
 *  - routeRefinementRequest(): supervisor unavailable → error propagation
 *  - routeRefinementRequest(): successful round-trip → updated questions returned
 *  - routeRefinementRequest(): invalid/missing payload → error
 *  - routeRefinementRequest(): throws / non-Error thrown → error wrapping
 *  - routeBrainstormWithRefinement(): no refinement needed (single GUI round)
 *  - routeBrainstormWithRefinement(): one refinement round → handleRefinement callback
 *  - routeBrainstormWithRefinement(): max refinement rounds (5) reached
 *  - routeBrainstormWithRefinement(): handleRefinement throws → error returned
 *  - routeBrainstormWithRefinement(): continueFormApp fails → error returned
 *  - RefinementSession / QuestionDiff type coverage (structural assertions)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type {
  FormRequest,
  FormResponse,
  Answer,
  Question,
  RadioSelectQuestion,
  FormRefinementRequest,
  FormRefinementResponse,
  RefinementSession,
  QuestionDiff,
} from '../../types/gui-forms.types.js';

import type { FormAppLaunchResult } from '../../tools/orchestration/supervisor-client.js';

// ── Mock supervisor-client ─────────────────────────────────────

vi.mock('../../tools/orchestration/supervisor-client.js', () => ({
  checkGuiAvailability: vi.fn(),
  launchFormApp: vi.fn(),
  continueFormApp: vi.fn(),
}));

import { launchFormApp, continueFormApp } from '../../tools/orchestration/supervisor-client.js';
import {
  routeRefinementRequest,
  routeBrainstormWithRefinement,
} from '../../tools/orchestration/brainstorm-routing.js';

const mockLaunchFormApp = vi.mocked(launchFormApp);
const mockContinueFormApp = vi.mocked(continueFormApp);

// ── Constants ────────────────────────────────────────────────────

const FORM_REQUEST_ID = 'form-req-phase5-001';
const REFINEMENT_REQ_ID = 'refine-req-001';
const GUI_SESSION_ID = 'gui-session-phase5';

// ── Factories ────────────────────────────────────────────────────

function makeRadioQuestion(
  id = 'q_arch',
  label = 'Choose architecture',
): RadioSelectQuestion {
  return {
    type: 'radio_select',
    id,
    label,
    options: [
      { id: 'opt_mono', label: 'Monolith', description: 'Single binary', recommended: false },
      { id: 'opt_micro', label: 'Microservices', description: 'Distributed', recommended: true },
    ],
  };
}

function makeFormRequest(
  questions: FormRequest['questions'] = [makeRadioQuestion()],
): FormRequest {
  return {
    type: 'form_request',
    version: 1,
    request_id: FORM_REQUEST_ID,
    form_type: 'brainstorm',
    metadata: {
      plan_id: 'plan_phase5',
      workspace_id: 'ws_phase5',
      session_id: 'agent-sess-phase5',
      agent: 'Brainstorm',
      title: 'Phase 5 Test Form',
    },
    timeout: { duration_seconds: 300, on_timeout: 'auto_fill', fallback_mode: 'chat' },
    window: { title: 'Phase 5 Refinement' },
    questions,
  };
}

function makeAnswer(questionId: string): Answer {
  return {
    question_id: questionId,
    value: { type: 'radio_select_answer', selected: 'opt_micro' },
    auto_filled: false,
  };
}

function makeRefinementReq(
  questionIds = ['q_arch'],
): FormRefinementRequest {
  return {
    type: 'form_refinement_request',
    version: 1,
    request_id: REFINEMENT_REQ_ID,
    original_request_id: FORM_REQUEST_ID,
    form_type: 'brainstorm',
    question_ids: questionIds,
    user_feedback: questionIds.map(id => ({
      question_id: id,
      feedback: 'Please provide more options',
    })),
    current_answers: [makeAnswer('q_arch')],
  };
}

function makeRefinementResponse(
  updatedQuestions: Question[] = [],
): FormRefinementResponse {
  return {
    type: 'form_refinement_response',
    version: 1,
    request_id: REFINEMENT_REQ_ID,
    original_request_id: FORM_REQUEST_ID,
    updated_questions: updatedQuestions,
  };
}

function makeFormResponse(
  answers: Answer[],
  status: FormResponse['status'] = 'completed',
  refinementSession?: RefinementSession,
): FormResponse {
  return {
    type: 'form_response',
    version: 1,
    request_id: FORM_REQUEST_ID,
    form_type: 'brainstorm',
    status,
    metadata: {
      plan_id: 'plan_phase5',
      workspace_id: 'ws_phase5',
      session_id: GUI_SESSION_ID,
      completed_at: '2026-02-20T12:00:00Z',
      duration_ms: 5000,
      refinement_count: refinementSession?.round_trip_count ?? 0,
    },
    answers,
    refinement_session: refinementSession,
  };
}

function makeFormResponsePendingRefinement(
  questionIds = ['q_arch'],
): FormResponse {
  const resp = makeFormResponse([], 'refinement_requested');
  resp.refinement_requests = questionIds.map(id => ({
    question_id: id,
    feedback: 'This option needs revision',
  }));
  return resp;
}

function makeLaunchResult(
  overrides: Partial<FormAppLaunchResult> = {},
): FormAppLaunchResult {
  return {
    app_name: 'brainstorm_gui',
    success: true,
    elapsed_ms: 1500,
    timed_out: false,
    ...overrides,
  };
}

function makeRefinementSession(rounds: number): RefinementSession {
  const diffs: QuestionDiff[] = Array.from({ length: rounds }, (_, i) => ({
    question_id: `q_${i}`,
    original_options: [
      { id: 'opt_old', label: 'Old Option', recommended: false },
    ],
    refined_options: [
      { id: 'opt_new', label: 'New Option', recommended: true },
    ],
    refined_at: '2026-02-20T12:00:00Z',
  }));
  return {
    round_trip_count: rounds,
    question_diffs: diffs,
    started_at: '2026-02-20T11:50:00Z',
    last_refined_at: rounds > 0 ? '2026-02-20T12:00:00Z' : undefined,
  };
}

// ── Setup ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// =========================================================================
// routeRefinementRequest()
// =========================================================================

describe('routeRefinementRequest', () => {

  // ── Successful path ───────────────────────────────────────────────────

  it('returns updated_questions on a successful round-trip', async () => {
    const updatedQ = makeRadioQuestion('q_arch', 'Architecture (refined)');
    mockLaunchFormApp.mockResolvedValue(
      makeLaunchResult({
        app_name: 'brainstorm_refinement',
        response_payload: makeRefinementResponse([updatedQ]),
      }),
    );

    const result = await routeRefinementRequest(makeRefinementReq());

    expect(result.success).toBe(true);
    expect(result.updated_questions).toHaveLength(1);
    expect(result.updated_questions[0].id).toBe('q_arch');
    expect(result.error).toBeUndefined();
  });

  it('delegates to launchFormApp with app_name brainstorm_refinement', async () => {
    mockLaunchFormApp.mockResolvedValue(
      makeLaunchResult({
        app_name: 'brainstorm_refinement',
        response_payload: makeRefinementResponse([]),
      }),
    );

    const req = makeRefinementReq();
    await routeRefinementRequest(req);

    expect(mockLaunchFormApp).toHaveBeenCalledOnce();
    expect(mockLaunchFormApp).toHaveBeenCalledWith(
      'brainstorm_refinement',
      req,
      undefined,   // no specific timeout override for refinement
      {},
    );
  });

  it('passes custom supervisor opts to launchFormApp', async () => {
    mockLaunchFormApp.mockResolvedValue(
      makeLaunchResult({
        app_name: 'brainstorm_refinement',
        response_payload: makeRefinementResponse([]),
      }),
    );

    const req = makeRefinementReq();
    const opts = { tcpPort: 9997, forceTcp: true };
    await routeRefinementRequest(req, opts);

    expect(mockLaunchFormApp).toHaveBeenCalledWith(
      'brainstorm_refinement',
      req,
      undefined,
      opts,
    );
  });

  it('returns multiple updated_questions from the refinement response', async () => {
    const q1 = makeRadioQuestion('q_arch', 'Architecture (refined)');
    const q2 = makeRadioQuestion('q_tech', 'Technology (refined)');
    mockLaunchFormApp.mockResolvedValue(
      makeLaunchResult({
        app_name: 'brainstorm_refinement',
        response_payload: makeRefinementResponse([q1, q2]),
      }),
    );

    const result = await routeRefinementRequest(makeRefinementReq(['q_arch', 'q_tech']));

    expect(result.success).toBe(true);
    expect(result.updated_questions).toHaveLength(2);
    expect(result.updated_questions[0].id).toBe('q_arch');
    expect(result.updated_questions[1].id).toBe('q_tech');
  });

  it('records elapsed_ms even for fast responses', async () => {
    mockLaunchFormApp.mockResolvedValue(
      makeLaunchResult({
        app_name: 'brainstorm_refinement',
        response_payload: makeRefinementResponse([]),
        elapsed_ms: 200,
      }),
    );

    const result = await routeRefinementRequest(makeRefinementReq());

    expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
  });

  // ── Supervisor/launch failure ─────────────────────────────────────────

  it('returns error when launchFormApp reports failure with message', async () => {
    mockLaunchFormApp.mockResolvedValue(
      makeLaunchResult({
        app_name: 'brainstorm_refinement',
        success: false,
        error: 'Supervisor not running on port 9999',
      }),
    );

    const result = await routeRefinementRequest(makeRefinementReq());

    expect(result.success).toBe(false);
    expect(result.updated_questions).toHaveLength(0);
    expect(result.error).toContain('Supervisor not running on port 9999');
  });

  it('returns generic error when launchFormApp fails without error message', async () => {
    mockLaunchFormApp.mockResolvedValue(
      makeLaunchResult({ app_name: 'brainstorm_refinement', success: false, error: undefined }),
    );

    const result = await routeRefinementRequest(makeRefinementReq());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  // ── Invalid payload ───────────────────────────────────────────────────

  it('returns error when response_payload is undefined on success', async () => {
    mockLaunchFormApp.mockResolvedValue(
      makeLaunchResult({
        app_name: 'brainstorm_refinement',
        success: true,
        response_payload: undefined,
      }),
    );

    const result = await routeRefinementRequest(makeRefinementReq());

    expect(result.success).toBe(false);
    expect(result.updated_questions).toHaveLength(0);
    expect(result.error).toContain('invalid FormRefinementResponse');
  });

  it('returns error when updated_questions is null in payload', async () => {
    mockLaunchFormApp.mockResolvedValue(
      makeLaunchResult({
        app_name: 'brainstorm_refinement',
        success: true,
        response_payload: {
          type: 'form_refinement_response',
          version: 1,
          request_id: REFINEMENT_REQ_ID,
          original_request_id: FORM_REQUEST_ID,
          updated_questions: null,
        } as unknown as FormRefinementResponse,
      }),
    );

    const result = await routeRefinementRequest(makeRefinementReq());

    expect(result.success).toBe(false);
    expect(result.error).toContain('invalid FormRefinementResponse');
  });

  it('returns error when updated_questions is missing from payload', async () => {
    mockLaunchFormApp.mockResolvedValue(
      makeLaunchResult({
        app_name: 'brainstorm_refinement',
        success: true,
        response_payload: {
          type: 'form_refinement_response',
          version: 1,
        } as unknown as FormRefinementResponse,
      }),
    );

    const result = await routeRefinementRequest(makeRefinementReq());

    expect(result.success).toBe(false);
    expect(result.error).toContain('invalid FormRefinementResponse');
  });

  // ── Thrown errors ─────────────────────────────────────────────────────

  it('catches Error thrown by launchFormApp and wraps message', async () => {
    mockLaunchFormApp.mockRejectedValue(new Error('TCP connection refused'));

    const result = await routeRefinementRequest(makeRefinementReq());

    expect(result.success).toBe(false);
    expect(result.updated_questions).toHaveLength(0);
    expect(result.error).toContain('TCP connection refused');
    expect(result.error).toContain('Refinement routing error');
  });

  it('catches non-Error thrown values', async () => {
    mockLaunchFormApp.mockRejectedValue('host unreachable');

    const result = await routeRefinementRequest(makeRefinementReq());

    expect(result.success).toBe(false);
    expect(result.error).toContain('host unreachable');
  });

  it('returns elapsed_ms even on error', async () => {
    mockLaunchFormApp.mockRejectedValue(new Error('crash'));

    const result = await routeRefinementRequest(makeRefinementReq());

    expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
  });
});

// =========================================================================
// routeBrainstormWithRefinement()
// =========================================================================

describe('routeBrainstormWithRefinement', () => {

  // ── No refinement needed ──────────────────────────────────────────────

  it('returns success immediately when GUI completes without refinement', async () => {
    const finalResponse = makeFormResponse([makeAnswer('q_arch')]);
    mockLaunchFormApp.mockResolvedValue(
      makeLaunchResult({
        app_name: 'brainstorm_gui',
        response_payload: finalResponse,
        pending_refinement: false,
      }),
    );

    const handleRefinement = vi.fn();
    const result = await routeBrainstormWithRefinement(makeFormRequest(), handleRefinement);

    expect(result.success).toBe(true);
    expect(result.path).toBe('gui');
    expect(result.answers).toHaveLength(1);
    expect(handleRefinement).not.toHaveBeenCalled();
    expect(mockContinueFormApp).not.toHaveBeenCalled();
  });

  it('sets refinement_count=0 in metadata when no refinements occurred', async () => {
    const finalResponse = makeFormResponse([makeAnswer('q_arch')]);
    mockLaunchFormApp.mockResolvedValue(
      makeLaunchResult({ app_name: 'brainstorm_gui', response_payload: finalResponse }),
    );

    const result = await routeBrainstormWithRefinement(makeFormRequest(), vi.fn());

    expect(result.gui_response?.metadata.refinement_count).toBe(0);
  });

  it('includes gui_response in result when no refinements occurred', async () => {
    const finalResponse = makeFormResponse([makeAnswer('q_arch')]);
    mockLaunchFormApp.mockResolvedValue(
      makeLaunchResult({ app_name: 'brainstorm_gui', response_payload: finalResponse }),
    );

    const result = await routeBrainstormWithRefinement(makeFormRequest(), vi.fn());

    expect(result.gui_response).toBeDefined();
    expect(result.gui_response?.status).toBe('completed');
  });

  it('produces a text_summary from the GUI response', async () => {
    const questions = [makeRadioQuestion('q_arch', 'Architecture Choice')];
    const finalResponse = makeFormResponse([makeAnswer('q_arch')]);
    mockLaunchFormApp.mockResolvedValue(
      makeLaunchResult({ app_name: 'brainstorm_gui', response_payload: finalResponse }),
    );

    const result = await routeBrainstormWithRefinement(
      makeFormRequest(questions),
      vi.fn(),
    );

    expect(result.text_summary).toContain('Architecture Choice');
  });

  // ── Single refinement round ───────────────────────────────────────────

  it('calls handleRefinement once for a single pending_refinement response', async () => {
    const partialResp = makeFormResponsePendingRefinement(['q_arch']);
    const finalResp = makeFormResponse([makeAnswer('q_arch')]);

    mockLaunchFormApp.mockResolvedValueOnce(
      makeLaunchResult({
        app_name: 'brainstorm_gui',
        response_payload: partialResp,
        pending_refinement: true,
        session_id: GUI_SESSION_ID,
      }),
    );
    mockContinueFormApp.mockResolvedValueOnce(
      makeLaunchResult({
        app_name: 'brainstorm_gui',
        response_payload: finalResp,
        pending_refinement: false,
      }),
    );

    const refinementResp = makeRefinementResponse([makeRadioQuestion('q_arch', 'Refined')]);
    const handleRefinement = vi.fn().mockResolvedValue(refinementResp);

    const result = await routeBrainstormWithRefinement(makeFormRequest(), handleRefinement);

    expect(result.success).toBe(true);
    expect(handleRefinement).toHaveBeenCalledOnce();
    expect(result.answers).toHaveLength(1);
  });

  it('calls continueFormApp with the session_id from the GUI launch', async () => {
    const partialResp = makeFormResponsePendingRefinement(['q_arch']);
    const finalResp = makeFormResponse([makeAnswer('q_arch')]);

    mockLaunchFormApp.mockResolvedValueOnce(
      makeLaunchResult({
        app_name: 'brainstorm_gui',
        response_payload: partialResp,
        pending_refinement: true,
        session_id: GUI_SESSION_ID,
      }),
    );
    mockContinueFormApp.mockResolvedValueOnce(
      makeLaunchResult({
        app_name: 'brainstorm_gui',
        response_payload: finalResp,
        pending_refinement: false,
      }),
    );

    const refinementResp = makeRefinementResponse([]);
    const handleRefinement = vi.fn().mockResolvedValue(refinementResp);

    await routeBrainstormWithRefinement(makeFormRequest(), handleRefinement);

    expect(mockContinueFormApp).toHaveBeenCalledWith(
      GUI_SESSION_ID,
      refinementResp,
      300, // formRequest.timeout.duration_seconds
      {},
    );
  });

  it('builds FormRefinementRequest from partial GUI response refinement_requests', async () => {
    const partialResp = makeFormResponsePendingRefinement(['q_arch']);
    const finalResp = makeFormResponse([makeAnswer('q_arch')]);

    mockLaunchFormApp.mockResolvedValueOnce(
      makeLaunchResult({
        app_name: 'brainstorm_gui',
        response_payload: partialResp,
        pending_refinement: true,
        session_id: GUI_SESSION_ID,
      }),
    );
    mockContinueFormApp.mockResolvedValueOnce(
      makeLaunchResult({ app_name: 'brainstorm_gui', response_payload: finalResp }),
    );

    const handleRefinement = vi.fn().mockResolvedValue(makeRefinementResponse([]));
    await routeBrainstormWithRefinement(makeFormRequest(), handleRefinement);

    const refReqArg = handleRefinement.mock.calls[0][0] as FormRefinementRequest;
    expect(refReqArg.type).toBe('form_refinement_request');
    expect(refReqArg.original_request_id).toBe(FORM_REQUEST_ID);
    expect(refReqArg.form_type).toBe('brainstorm');
    expect(refReqArg.question_ids).toContain('q_arch');
  });

  it('sets refinement_count=1 in metadata after one refinement round', async () => {
    const partialResp = makeFormResponsePendingRefinement(['q_arch']);
    const finalResp = makeFormResponse([makeAnswer('q_arch')]);

    mockLaunchFormApp.mockResolvedValueOnce(
      makeLaunchResult({
        app_name: 'brainstorm_gui',
        response_payload: partialResp,
        pending_refinement: true,
        session_id: GUI_SESSION_ID,
      }),
    );
    mockContinueFormApp.mockResolvedValueOnce(
      makeLaunchResult({ app_name: 'brainstorm_gui', response_payload: finalResp }),
    );

    const result = await routeBrainstormWithRefinement(
      makeFormRequest(),
      vi.fn().mockResolvedValue(makeRefinementResponse([])),
    );

    expect(result.gui_response?.metadata.refinement_count).toBe(1);
  });

  // ── Max refinement rounds (5) ─────────────────────────────────────────

  it('exits the refinement loop after exactly MAX_REFINEMENT_ROUNDS (5) iterations', async () => {
    const partialResp = makeFormResponsePendingRefinement(['q_arch']);
    const finalResp = makeFormResponse([makeAnswer('q_arch')]);

    // Initial GUI launch returns pending
    mockLaunchFormApp.mockResolvedValueOnce(
      makeLaunchResult({
        app_name: 'brainstorm_gui',
        response_payload: partialResp,
        pending_refinement: true,
        session_id: GUI_SESSION_ID,
      }),
    );

    // 4 continue calls return still-pending
    for (let i = 0; i < 4; i++) {
      mockContinueFormApp.mockResolvedValueOnce(
        makeLaunchResult({
          app_name: 'brainstorm_gui',
          response_payload: partialResp,
          pending_refinement: true,
          session_id: GUI_SESSION_ID,
        }),
      );
    }
    // 5th continue call returns the final response (loop exits at max)
    mockContinueFormApp.mockResolvedValueOnce(
      makeLaunchResult({
        app_name: 'brainstorm_gui',
        response_payload: finalResp,
        pending_refinement: true, // still pending, but max rounds reached → exit loop
      }),
    );

    const handleRefinement = vi.fn().mockResolvedValue(makeRefinementResponse([]));
    const result = await routeBrainstormWithRefinement(makeFormRequest(), handleRefinement);

    // handleRefinement called exactly MAX_REFINEMENT_ROUNDS = 5 times
    expect(handleRefinement).toHaveBeenCalledTimes(5);
    // continueFormApp called 5 times
    expect(mockContinueFormApp).toHaveBeenCalledTimes(5);
    // refinement_count reflects 5 rounds
    expect(result.gui_response?.metadata.refinement_count).toBe(5);
    expect(result.success).toBe(true);
  });

  // ── Error paths ───────────────────────────────────────────────────────

  it('returns error when initial GUI launch fails', async () => {
    mockLaunchFormApp.mockResolvedValueOnce(
      makeLaunchResult({
        app_name: 'brainstorm_gui',
        success: false,
        error: 'GUI process failed to start',
      }),
    );

    const handleRefinementSpy = vi.fn();
    const result = await routeBrainstormWithRefinement(makeFormRequest(), handleRefinementSpy);

    expect(result.success).toBe(false);
    expect(result.error).toContain('GUI process failed to start');
    expect(handleRefinementSpy).not.toHaveBeenCalled();
  });

  it('returns error when handleRefinement callback throws', async () => {
    const partialResp = makeFormResponsePendingRefinement(['q_arch']);

    mockLaunchFormApp.mockResolvedValueOnce(
      makeLaunchResult({
        app_name: 'brainstorm_gui',
        response_payload: partialResp,
        pending_refinement: true,
        session_id: GUI_SESSION_ID,
      }),
    );

    const handleRefinement = vi.fn().mockRejectedValue(new Error('Brainstorm agent crashed'));
    const result = await routeBrainstormWithRefinement(makeFormRequest(), handleRefinement);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Brainstorm agent crashed');
    expect(result.error).toContain('Refinement handler error');
  });

  it('includes round number in handler error message', async () => {
    const partialResp = makeFormResponsePendingRefinement(['q_arch']);

    mockLaunchFormApp.mockResolvedValueOnce(
      makeLaunchResult({
        app_name: 'brainstorm_gui',
        response_payload: partialResp,
        pending_refinement: true,
        session_id: GUI_SESSION_ID,
      }),
    );

    const handleRefinement = vi.fn().mockRejectedValue(new Error('timeout'));
    const result = await routeBrainstormWithRefinement(makeFormRequest(), handleRefinement);

    expect(result.error).toContain('round 1');
  });

  it('returns error when continueFormApp fails after a refinement round', async () => {
    const partialResp = makeFormResponsePendingRefinement(['q_arch']);

    mockLaunchFormApp.mockResolvedValueOnce(
      makeLaunchResult({
        app_name: 'brainstorm_gui',
        response_payload: partialResp,
        pending_refinement: true,
        session_id: GUI_SESSION_ID,
      }),
    );
    mockContinueFormApp.mockResolvedValueOnce(
      makeLaunchResult({
        app_name: 'brainstorm_gui',
        success: false,
        error: 'GUI process died during continue',
      }),
    );

    const result = await routeBrainstormWithRefinement(
      makeFormRequest(),
      vi.fn().mockResolvedValue(makeRefinementResponse([])),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('GUI process died during continue');
  });

  it('returns error when no payload present after refinement loop', async () => {
    // GUI launch succeeds but returns no payload and pending_refinement false
    mockLaunchFormApp.mockResolvedValueOnce(
      makeLaunchResult({
        app_name: 'brainstorm_gui',
        success: true,
        response_payload: undefined,
        pending_refinement: false,
      }),
    );

    const result = await routeBrainstormWithRefinement(makeFormRequest(), vi.fn());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('records elapsed_ms for both success and failure paths', async () => {
    mockLaunchFormApp.mockResolvedValueOnce(
      makeLaunchResult({ app_name: 'brainstorm_gui', success: false, error: 'fail' }),
    );

    const result = await routeBrainstormWithRefinement(makeFormRequest(), vi.fn());

    expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
  });
});

// =========================================================================
// RefinementSession / QuestionDiff — structural type coverage
// =========================================================================

describe('RefinementSession structural shapes', () => {
  it('zero-round session has empty question_diffs and no last_refined_at', () => {
    const session = makeRefinementSession(0);

    expect(session.round_trip_count).toBe(0);
    expect(session.question_diffs).toHaveLength(0);
    expect(session.last_refined_at).toBeUndefined();
    expect(session.started_at).toBeTruthy();
  });

  it('N-round session has N question_diffs and last_refined_at set', () => {
    const session = makeRefinementSession(3);

    expect(session.round_trip_count).toBe(3);
    expect(session.question_diffs).toHaveLength(3);
    expect(session.last_refined_at).toBeDefined();
  });

  it('question_diffs preserve distinct question_ids', () => {
    const session = makeRefinementSession(4);
    const ids = session.question_diffs.map(d => d.question_id);

    expect(ids).toEqual(['q_0', 'q_1', 'q_2', 'q_3']);
  });
});

describe('QuestionDiff structural shapes', () => {
  it('captures original and refined options independently', () => {
    const diff: QuestionDiff = {
      question_id: 'q_arch',
      original_options: [
        { id: 'opt_a', label: 'Option A (original)', recommended: false },
      ],
      refined_options: [
        { id: 'opt_a', label: 'Option A (refined)', recommended: true },
        { id: 'opt_b', label: 'Option B (new)', recommended: false },
      ],
      refined_at: '2026-02-20T12:05:00Z',
    };

    expect(diff.original_options).toHaveLength(1);
    expect(diff.refined_options).toHaveLength(2);
    expect(diff.original_options[0].label).toBe('Option A (original)');
    expect(diff.refined_options[0].label).toBe('Option A (refined)');
    expect(diff.refined_options[0].recommended).toBe(true);
    expect(diff.original_options[0].recommended).toBe(false);
  });

  it('refined_at is an ISO 8601 string', () => {
    const diff: QuestionDiff = {
      question_id: 'q1',
      original_options: [],
      refined_options: [],
      refined_at: '2026-02-20T12:00:00.000Z',
    };

    expect(diff.refined_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('FormResponse.refinement_session integration', () => {
  it('is undefined on a response submitted without any refinements', () => {
    const resp = makeFormResponse([makeAnswer('q_arch')]);
    expect(resp.refinement_session).toBeUndefined();
    expect(resp.metadata.refinement_count).toBe(0);
  });

  it('is populated on a response submitted after N refinements', () => {
    const session = makeRefinementSession(2);
    const resp = makeFormResponse([makeAnswer('q_arch')], 'completed', session);

    expect(resp.refinement_session).toBeDefined();
    expect(resp.refinement_session?.round_trip_count).toBe(2);
    expect(resp.refinement_session?.question_diffs).toHaveLength(2);
    expect(resp.metadata.refinement_count).toBe(2);
  });

  it('question_diffs in refinement_session have correct fields', () => {
    const session = makeRefinementSession(1);
    const diff = session.question_diffs[0];

    expect(diff).toHaveProperty('question_id');
    expect(diff).toHaveProperty('original_options');
    expect(diff).toHaveProperty('refined_options');
    expect(diff).toHaveProperty('refined_at');
    expect(Array.isArray(diff.original_options)).toBe(true);
    expect(Array.isArray(diff.refined_options)).toBe(true);
  });
});
