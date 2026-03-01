import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { WebhookDispatcher } from '../../events/webhook-dispatcher.js';
import type { WebhookRuntimeConfig } from '../../config/webhook-config.js';
import type { MCPEvent } from '../../events/event-emitter.js';

function buildEvent(overrides?: Partial<MCPEvent>): MCPEvent {
  return {
    id: 'evt_test_1',
    type: 'tool_call',
    timestamp: '2026-03-01T00:00:00.000Z',
    workspace_id: 'ws_1',
    plan_id: 'plan_1',
    agent_type: 'Executor',
    tool_name: 'memory_plan',
    data: { ok: true },
    ...overrides,
  };
}

function buildConfig(overrides?: Partial<WebhookRuntimeConfig>): WebhookRuntimeConfig {
  return {
    enabled: true,
    url: 'https://example.com/webhook',
    timeoutMs: 3000,
    signingEnabled: true,
    secret: 'test-secret',
    signatureAlgorithm: 'sha256',
    maxPayloadBytes: 131072,
    retryMaxAttempts: 2,
    retryBaseDelayMs: 5,
    retryMaxDelayMs: 20,
    retryJitterRatio: 0,
    retryableStatusCodes: new Set([408, 425, 429, 500, 502, 503, 504]),
    queueConcurrency: 1,
    queueMaxInflight: 100,
    failOpenOnQueueOverflow: true,
    configErrors: [],
    ...overrides,
  };
}

describe('WebhookDispatcher', () => {
  it('does not dispatch when disabled or URL is missing', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();

    const disabledDispatcher = new WebhookDispatcher(buildConfig({ enabled: false }), { fetchFn });
    const missingUrlDispatcher = new WebhookDispatcher(buildConfig({ url: null }), { fetchFn });

    disabledDispatcher.enqueue(buildEvent({ id: 'evt_disabled' }));
    missingUrlDispatcher.enqueue(buildEvent({ id: 'evt_missing_url' }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('retries on retryable 5xx status and includes required signature headers', async () => {
    const fetchFn = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce({ status: 500 } as Response)
      .mockResolvedValueOnce({ status: 200 } as Response);

    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    const warn = vi.fn();
    const error = vi.fn();

    const dispatcher = new WebhookDispatcher(buildConfig(), {
      fetchFn,
      sleep,
      logger: { warn, error },
    });

    dispatcher.enqueue(buildEvent());

    await vi.waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    const firstCall = fetchFn.mock.calls[0];
    const init = firstCall[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-PM-Webhook-Id']).toBeTruthy();
    expect(headers['X-PM-Webhook-Timestamp']).toBeTruthy();
    expect(headers['X-PM-Webhook-Attempt']).toBe('1');
    expect(headers['X-PM-Webhook-Signature']).toMatch(/^v1=/);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('uses deterministic timestamp/signature and retry jitter delay when timeout is retryable', async () => {
    const fetchFn = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      .mockResolvedValueOnce({ status: 200 } as Response);

    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    const warn = vi.fn();
    const error = vi.fn();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const randomSpy = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.42)
      .mockReturnValueOnce(0);

    const dispatcher = new WebhookDispatcher(
      buildConfig({ retryJitterRatio: 0.5, retryBaseDelayMs: 10, retryMaxDelayMs: 50 }),
      {
        fetchFn,
        sleep,
        logger: { warn, error },
      },
    );

    dispatcher.enqueue(buildEvent());

    await vi.waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    const firstCall = fetchFn.mock.calls[0];
    const init = firstCall[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    const body = String(init.body);

    expect(headers['X-PM-Webhook-Timestamp']).toBe('1700000000');
    const expectedDigest = createHmac('sha256', 'test-secret')
      .update(`1700000000.${body}`)
      .digest('hex');
    expect(headers['X-PM-Webhook-Signature']).toBe(`v1=${expectedDigest}`);
    expect(sleep).toHaveBeenCalledWith(5);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();

    nowSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it('drops oversized payloads without attempting network delivery', async () => {
    const fetchFn = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
    const warn = vi.fn();
    const error = vi.fn();

    const dispatcher = new WebhookDispatcher(buildConfig({ maxPayloadBytes: 64 }), {
      fetchFn,
      logger: { warn, error },
    });

    dispatcher.enqueue(
      buildEvent({
        data: {
          payload: 'x'.repeat(1000),
        },
      }),
    );

    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith('payload_too_large_drop', expect.any(Object));
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('does not retry for non-retryable 4xx status', async () => {
    const fetchFn = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce({ status: 404 } as Response);

    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    const warn = vi.fn();
    const error = vi.fn();

    const dispatcher = new WebhookDispatcher(buildConfig(), {
      fetchFn,
      sleep,
      logger: { warn, error },
    });

    dispatcher.enqueue(buildEvent());

    await vi.waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledTimes(1);
    });

    expect(sleep).not.toHaveBeenCalled();
  });
});
