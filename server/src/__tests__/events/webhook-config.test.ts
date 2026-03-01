import { describe, expect, it } from 'vitest';
import { getWebhookRuntimeConfig } from '../../config/webhook-config.js';

describe('getWebhookRuntimeConfig', () => {
  it('returns disabled defaults when webhook is not enabled', () => {
    const config = getWebhookRuntimeConfig({});

    expect(config.enabled).toBe(false);
    expect(config.url).toBeNull();
    expect(config.timeoutMs).toBe(3000);
    expect(config.retryMaxAttempts).toBe(3);
    expect(config.retryableStatusCodes.has(500)).toBe(true);
  });

  it('disables webhook and reports error when enabled without URL', () => {
    const config = getWebhookRuntimeConfig({
      PM_WEBHOOK_ENABLED: 'true',
      PM_WEBHOOK_SIGNING_ENABLED: 'false',
    });

    expect(config.enabled).toBe(false);
    expect(config.configErrors.some((error) => error.includes('PM_WEBHOOK_URL'))).toBe(true);
  });

  it('disables webhook when signing is enabled without secret', () => {
    const config = getWebhookRuntimeConfig({
      PM_WEBHOOK_ENABLED: 'true',
      PM_WEBHOOK_URL: 'https://example.com/webhook',
      PM_WEBHOOK_SIGNING_ENABLED: 'true',
    });

    expect(config.enabled).toBe(false);
    expect(config.configErrors.some((error) => error.includes('PM_WEBHOOK_SECRET'))).toBe(true);
  });

  it('enables webhook with bounded values and parsed retryable statuses', () => {
    const config = getWebhookRuntimeConfig({
      PM_WEBHOOK_ENABLED: 'true',
      PM_WEBHOOK_URL: 'https://example.com/webhook',
      PM_WEBHOOK_SIGNING_ENABLED: 'false',
      PM_WEBHOOK_TIMEOUT_MS: '5',
      PM_WEBHOOK_RETRY_BASE_DELAY_MS: '10',
      PM_WEBHOOK_RETRY_MAX_DELAY_MS: '250000',
      PM_WEBHOOK_RETRY_JITTER_RATIO: '1.5',
      PM_WEBHOOK_RETRYABLE_STATUS_CODES: '429,500,foo,503',
      PM_WEBHOOK_QUEUE_CONCURRENCY: '40',
      PM_WEBHOOK_QUEUE_MAX_INFLIGHT: '5',
    });

    expect(config.enabled).toBe(true);
    expect(config.timeoutMs).toBe(250);
    expect(config.retryBaseDelayMs).toBe(50);
    expect(config.retryMaxDelayMs).toBe(120000);
    expect(config.retryJitterRatio).toBe(1);
    expect(config.queueConcurrency).toBe(16);
    expect(config.queueMaxInflight).toBe(10);
    expect(config.retryableStatusCodes.has(429)).toBe(true);
    expect(config.retryableStatusCodes.has(503)).toBe(true);
  });
});
