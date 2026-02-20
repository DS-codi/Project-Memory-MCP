/**
 * Tests for brainstorm-routing.ts — Phase 4 Hub Integration
 *
 * Covers: routeBrainstormToGui(), extractFallbackTextFromRequest(),
 *         extractTextFromResponse(), routeBrainstormWithFallback()
 *
 * Strategy: Mock supervisor-client to control GUI availability and responses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type {
  FormRequest,
  FormResponse,
  Answer,
  RadioSelectQuestion,
  FreeTextQuestion,
  ConfirmRejectQuestion,
  CountdownTimerQuestion,
} from '../../types/gui-forms.types.js';

import type { FormAppLaunchResult, GuiAvailability } from '../../tools/orchestration/supervisor-client.js';

// ── Mock supervisor-client ─────────────────────────────────────

vi.mock('../../tools/orchestration/supervisor-client.js', () => ({
  checkGuiAvailability: vi.fn(),
  launchFormApp: vi.fn(),
}));

import { checkGuiAvailability, launchFormApp } from '../../tools/orchestration/supervisor-client.js';
import {
  routeBrainstormToGui,
  extractFallbackTextFromRequest,
  extractTextFromResponse,
  routeBrainstormWithFallback,
} from '../../tools/orchestration/brainstorm-routing.js';

const mockCheckGuiAvailability = vi.mocked(checkGuiAvailability);
const mockLaunchFormApp = vi.mocked(launchFormApp);

// ── Test data factories ────────────────────────────────────────

function makeFormRequest(questions: FormRequest['questions'] = []): FormRequest {
  return {
    type: 'form_request',
    version: 1,
    request_id: 'req-001',
    form_type: 'brainstorm',
    metadata: {
      plan_id: 'plan_123',
      workspace_id: 'ws_456',
      session_id: 'sess_789',
      agent: 'Brainstorm',
      title: 'Architecture Decision',
    },
    timeout: { duration_seconds: 300, on_timeout: 'auto_fill', fallback_mode: 'chat' },
    window: { title: 'Brainstorm' },
    questions,
  };
}

function makeRadioQuestion(overrides: Partial<RadioSelectQuestion> = {}): RadioSelectQuestion {
  return {
    type: 'radio_select',
    id: 'q_arch',
    label: 'Choose architecture',
    options: [
      { id: 'opt_a', label: 'Monolith', description: 'Single binary', recommended: false, pros: ['Simple'] },
      { id: 'opt_b', label: 'Microservices', description: 'Distributed', recommended: true, pros: ['Scalable'], cons: ['Complex'] },
    ],
    ...overrides,
  };
}

function makeFreeTextQuestion(overrides: Partial<FreeTextQuestion> = {}): FreeTextQuestion {
  return {
    type: 'free_text',
    id: 'q_notes',
    label: 'Additional notes',
    default_value: 'No additional notes.',
    ...overrides,
  };
}

function makeConfirmRejectQuestion(overrides: Partial<ConfirmRejectQuestion> = {}): ConfirmRejectQuestion {
  return {
    type: 'confirm_reject',
    id: 'q_confirm',
    label: 'Approve this plan?',
    ...overrides,
  };
}

function makeCountdownTimerQuestion(overrides: Partial<CountdownTimerQuestion> = {}): CountdownTimerQuestion {
  return {
    type: 'countdown_timer',
    id: 'q_timer',
    label: 'Time remaining: {remaining}s',
    duration_seconds: 60,
    on_timeout: 'auto_fill',
    ...overrides,
  };
}

function makeFormResponse(answers: Answer[], status: FormResponse['status'] = 'completed'): FormResponse {
  return {
    type: 'form_response',
    version: 1,
    request_id: 'req-001',
    form_type: 'brainstorm',
    status,
    metadata: {
      plan_id: 'plan_123',
      workspace_id: 'ws_456',
      session_id: 'sess_789',
      completed_at: '2026-02-20T12:00:00Z',
      duration_ms: 5000,
    },
    answers,
  };
}

function makeAvailability(overrides: Partial<GuiAvailability> = {}): GuiAvailability {
  return {
    supervisor_running: true,
    brainstorm_gui: true,
    approval_gui: true,
    capabilities: ['brainstorm_gui'],
    message: 'Supervisor running',
    ...overrides,
  };
}

function makeLaunchResult(overrides: Partial<FormAppLaunchResult> = {}): FormAppLaunchResult {
  return {
    app_name: 'brainstorm_gui',
    success: true,
    elapsed_ms: 5000,
    timed_out: false,
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// =========================================================================
// routeBrainstormToGui()
// =========================================================================

describe('routeBrainstormToGui', () => {
  it('delegates to launchFormApp with correct app_name', async () => {
    const request = makeFormRequest([makeRadioQuestion()]);
    mockLaunchFormApp.mockResolvedValue(makeLaunchResult());

    await routeBrainstormToGui(request);

    expect(mockLaunchFormApp).toHaveBeenCalledWith(
      'brainstorm_gui',
      request,
      request.timeout.duration_seconds,
      {},
    );
  });

  it('passes custom supervisor options through', async () => {
    const request = makeFormRequest([]);
    const opts = { forceTcp: true, tcpPort: 9999 };
    mockLaunchFormApp.mockResolvedValue(makeLaunchResult());

    await routeBrainstormToGui(request, opts);

    expect(mockLaunchFormApp).toHaveBeenCalledWith(
      'brainstorm_gui',
      request,
      request.timeout.duration_seconds,
      opts,
    );
  });

  it('returns the FormAppLaunchResult directly', async () => {
    const request = makeFormRequest([]);
    const result = makeLaunchResult({ elapsed_ms: 7500 });
    mockLaunchFormApp.mockResolvedValue(result);

    const actual = await routeBrainstormToGui(request);

    expect(actual).toEqual(result);
  });
});

// =========================================================================
// extractFallbackTextFromRequest()
// =========================================================================

describe('extractFallbackTextFromRequest', () => {
  it('extracts recommended radio option as the fallback answer', () => {
    const question = makeRadioQuestion();
    const request = makeFormRequest([question]);

    const { answers, text_summary } = extractFallbackTextFromRequest(request);

    expect(answers).toHaveLength(1);
    expect(answers[0].question_id).toBe('q_arch');
    expect(answers[0].auto_filled).toBe(true);
    // Should pick recommended option (opt_b: Microservices)
    expect(answers[0].value).toEqual({
      type: 'radio_select_answer',
      selected: 'opt_b',
    });
    expect(text_summary).toContain('Microservices');
    expect(text_summary).toContain('Scalable');
  });

  it('falls back to first option when none is recommended', () => {
    const question = makeRadioQuestion({
      options: [
        { id: 'opt_x', label: 'Option X' },
        { id: 'opt_y', label: 'Option Y' },
      ],
    });
    const request = makeFormRequest([question]);

    const { answers } = extractFallbackTextFromRequest(request);

    expect(answers[0].value).toEqual({
      type: 'radio_select_answer',
      selected: 'opt_x',
    });
  });

  it('extracts default_value for free_text questions', () => {
    const question = makeFreeTextQuestion({ default_value: 'My default' });
    const request = makeFormRequest([question]);

    const { answers, text_summary } = extractFallbackTextFromRequest(request);

    expect(answers[0].value).toEqual({
      type: 'free_text_answer',
      value: 'My default',
    });
    expect(answers[0].auto_filled).toBe(true);
    expect(text_summary).toContain('My default');
  });

  it('uses empty string for free_text without default_value', () => {
    const question = makeFreeTextQuestion({ default_value: undefined });
    const request = makeFormRequest([question]);

    const { answers } = extractFallbackTextFromRequest(request);

    expect(answers[0].value).toEqual({
      type: 'free_text_answer',
      value: '',
    });
  });

  it('auto-approves confirm_reject questions', () => {
    const question = makeConfirmRejectQuestion();
    const request = makeFormRequest([question]);

    const { answers, text_summary } = extractFallbackTextFromRequest(request);

    expect(answers[0].value).toEqual({
      type: 'confirm_reject_answer',
      action: 'approve',
    });
    expect(answers[0].auto_filled).toBe(true);
    expect(text_summary).toContain('Auto-approved');
  });

  it('handles countdown_timer with completed result', () => {
    const question = makeCountdownTimerQuestion();
    const request = makeFormRequest([question]);

    const { answers } = extractFallbackTextFromRequest(request);

    expect(answers[0].value).toEqual({
      type: 'countdown_timer_answer',
      result: 'completed',
      elapsed_seconds: 0,
    });
    expect(answers[0].auto_filled).toBe(true);
  });

  it('handles all 4 question types in one request', () => {
    const request = makeFormRequest([
      makeRadioQuestion(),
      makeFreeTextQuestion(),
      makeConfirmRejectQuestion(),
      makeCountdownTimerQuestion(),
    ]);

    const { answers, text_summary } = extractFallbackTextFromRequest(request);

    expect(answers).toHaveLength(4);
    expect(text_summary).toContain('GUI unavailable');
    expect(text_summary).toContain('Choose architecture');
    expect(text_summary).toContain('Additional notes');
  });

  it('includes pros and cons in the text summary for radio options', () => {
    const question = makeRadioQuestion();
    const request = makeFormRequest([question]);

    const { text_summary } = extractFallbackTextFromRequest(request);

    expect(text_summary).toContain('Pros: Scalable');
    expect(text_summary).toContain('Cons: Complex');
  });
});

// =========================================================================
// extractTextFromResponse()
// =========================================================================

describe('extractTextFromResponse', () => {
  it('extracts selected radio option label from response', () => {
    const question = makeRadioQuestion();
    const request = makeFormRequest([question]);
    const response = makeFormResponse([
      {
        question_id: 'q_arch',
        value: { type: 'radio_select_answer', selected: 'opt_a' },
      },
    ]);

    const text = extractTextFromResponse(request, response);

    expect(text).toContain('Monolith');
    expect(text).toContain('Choose architecture');
  });

  it('includes free_text notes from radio answer', () => {
    const question = makeRadioQuestion();
    const request = makeFormRequest([question]);
    const response = makeFormResponse([
      {
        question_id: 'q_arch',
        value: { type: 'radio_select_answer', selected: 'opt_b', free_text: 'Custom thoughts' },
      },
    ]);

    const text = extractTextFromResponse(request, response);

    expect(text).toContain('Custom thoughts');
    expect(text).toContain('Notes:');
  });

  it('marks auto-filled answers in text', () => {
    const question = makeRadioQuestion();
    const request = makeFormRequest([question]);
    const response = makeFormResponse([
      {
        question_id: 'q_arch',
        value: { type: 'radio_select_answer', selected: 'opt_b' },
        auto_filled: true,
      },
    ]);

    const text = extractTextFromResponse(request, response);

    expect(text).toContain('auto-filled');
  });

  it('extracts free_text answer values', () => {
    const question = makeFreeTextQuestion();
    const request = makeFormRequest([question]);
    const response = makeFormResponse([
      {
        question_id: 'q_notes',
        value: { type: 'free_text_answer', value: 'User typed this' },
      },
    ]);

    const text = extractTextFromResponse(request, response);

    expect(text).toContain('User typed this');
    expect(text).toContain('Additional notes');
  });

  it('extracts confirm_reject decision and notes', () => {
    const question = makeConfirmRejectQuestion();
    const request = makeFormRequest([question]);
    const response = makeFormResponse([
      {
        question_id: 'q_confirm',
        value: { type: 'confirm_reject_answer', action: 'reject', notes: 'Needs rework' },
      },
    ]);

    const text = extractTextFromResponse(request, response);

    expect(text).toContain('reject');
    expect(text).toContain('Needs rework');
  });

  it('skips unknown question IDs gracefully', () => {
    const request = makeFormRequest([makeRadioQuestion()]);
    const response = makeFormResponse([
      {
        question_id: 'q_unknown',
        value: { type: 'free_text_answer', value: 'ghost answer' },
      },
    ]);

    const text = extractTextFromResponse(request, response);

    // Should not contain the ghost answer (no matching question)
    expect(text).not.toContain('ghost answer');
  });

  it('omits countdown_timer answers from text summary', () => {
    const request = makeFormRequest([makeCountdownTimerQuestion()]);
    const response = makeFormResponse([
      {
        question_id: 'q_timer',
        value: { type: 'countdown_timer_answer', result: 'completed', elapsed_seconds: 45 },
      },
    ]);

    const text = extractTextFromResponse(request, response);

    // Timer answers should produce minimal or no text
    expect(text).not.toContain('45');
  });
});

// =========================================================================
// routeBrainstormWithFallback()
// =========================================================================

describe('routeBrainstormWithFallback', () => {
  it('uses GUI path when supervisor and brainstorm_gui are available', async () => {
    mockCheckGuiAvailability.mockResolvedValue(makeAvailability());
    const guiResponse = makeFormResponse([
      { question_id: 'q1', value: { type: 'free_text_answer', value: 'User answer' } },
    ]);
    mockLaunchFormApp.mockResolvedValue(makeLaunchResult({
      response_payload: guiResponse,
    }));

    const request = makeFormRequest([makeFreeTextQuestion({ id: 'q1', label: 'Question 1' })]);
    const result = await routeBrainstormWithFallback(request);

    expect(result.success).toBe(true);
    expect(result.path).toBe('gui');
    expect(result.gui_response).toBeDefined();
    expect(result.text_summary).toContain('Question 1');
  });

  it('falls back to text extraction when supervisor is not running', async () => {
    mockCheckGuiAvailability.mockResolvedValue(makeAvailability({
      supervisor_running: false,
      brainstorm_gui: false,
    }));

    const request = makeFormRequest([makeRadioQuestion()]);
    const result = await routeBrainstormWithFallback(request);

    expect(result.success).toBe(true);
    expect(result.path).toBe('fallback');
    expect(result.gui_response).toBeUndefined();
    expect(result.answers).toHaveLength(1);
    expect(result.text_summary).toContain('GUI unavailable');
  });

  it('falls back when brainstorm_gui is not available', async () => {
    mockCheckGuiAvailability.mockResolvedValue(makeAvailability({
      brainstorm_gui: false,
    }));

    const request = makeFormRequest([makeFreeTextQuestion()]);
    const result = await routeBrainstormWithFallback(request);

    expect(result.success).toBe(true);
    expect(result.path).toBe('fallback');
  });

  it('falls back when GUI launch fails', async () => {
    mockCheckGuiAvailability.mockResolvedValue(makeAvailability());
    mockLaunchFormApp.mockResolvedValue(makeLaunchResult({
      success: false,
      error: 'Process crashed',
      response_payload: undefined,
    }));

    const request = makeFormRequest([makeRadioQuestion()]);
    const result = await routeBrainstormWithFallback(request);

    expect(result.success).toBe(true);
    expect(result.path).toBe('fallback');
    expect(result.error).toContain('GUI failed');
  });

  it('falls back when GUI launch throws', async () => {
    mockCheckGuiAvailability.mockResolvedValue(makeAvailability());
    mockLaunchFormApp.mockRejectedValue(new Error('Connection refused'));

    const request = makeFormRequest([makeRadioQuestion()]);
    const result = await routeBrainstormWithFallback(request);

    expect(result.success).toBe(true);
    expect(result.path).toBe('fallback');
    expect(result.error).toContain('Connection refused');
  });

  it('always provides answers and text_summary regardless of path', async () => {
    // Test fallback path
    mockCheckGuiAvailability.mockResolvedValue(makeAvailability({
      supervisor_running: false,
    }));

    const request = makeFormRequest([
      makeRadioQuestion(),
      makeFreeTextQuestion(),
    ]);
    const result = await routeBrainstormWithFallback(request);

    expect(result.answers.length).toBeGreaterThan(0);
    expect(result.text_summary.length).toBeGreaterThan(0);
  });

  it('records elapsed_ms timing', async () => {
    mockCheckGuiAvailability.mockResolvedValue(makeAvailability({
      supervisor_running: false,
    }));

    const request = makeFormRequest([makeRadioQuestion()]);
    const result = await routeBrainstormWithFallback(request);

    expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
  });

  it('includes gui_response when GUI path succeeds', async () => {
    mockCheckGuiAvailability.mockResolvedValue(makeAvailability());
    const guiResponse = makeFormResponse([
      { question_id: 'q_arch', value: { type: 'radio_select_answer', selected: 'opt_a' } },
    ]);
    mockLaunchFormApp.mockResolvedValue(makeLaunchResult({ response_payload: guiResponse }));

    const request = makeFormRequest([makeRadioQuestion()]);
    const result = await routeBrainstormWithFallback(request);

    expect(result.gui_response).toBeDefined();
    expect(result.gui_response?.status).toBe('completed');
  });
});
