import { createHmac } from 'node:crypto';
import { getWebhookRuntimeConfig, type WebhookRuntimeConfig } from '../config/webhook-config.js';
import type { MCPEvent } from './event-emitter.js';

type FetchFn = typeof fetch;
type SleepFn = (ms: number) => Promise<void>;
type Logger = {
  warn: (message: string, details?: Record<string, unknown>) => void;
  error: (message: string, details?: Record<string, unknown>) => void;
};

interface WebhookPayload {
  schema_version: '1.0';
  delivery_id: string;
  attempt: number;
  max_attempts: number;
  sent_at: string;
  event: MCPEvent;
  context: {
    workspace_id: string | null;
    plan_id: string | null;
    agent_type: string | null;
    tool_name: string | null;
  };
  delivery: {
    source: 'project-memory-mcp/server';
    mode: 'best-effort-non-blocking';
    retryable: boolean;
  };
}

interface DispatchAttemptResult {
  ok: boolean;
  retryable: boolean;
  status: number | null;
  errorCode: string;
  durationMs: number;
}

const DEFAULT_SLEEP: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function defaultLogger(): Logger {
  return {
    warn(message, details) {
      if (details) {
        console.warn(`[webhook] ${message}`, details);
        return;
      }
      console.warn(`[webhook] ${message}`);
    },
    error(message, details) {
      if (details) {
        console.error(`[webhook] ${message}`, details);
        return;
      }
      console.error(`[webhook] ${message}`);
    },
  };
}

function buildDeliveryId(nowMs: number): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `whd_${nowMs}_${random}`;
}

function calculateRetryDelayMs(config: WebhookRuntimeConfig, attemptNumber: number): number {
  const exponentialDelay = Math.min(
    config.retryMaxDelayMs,
    config.retryBaseDelayMs * 2 ** Math.max(0, attemptNumber - 1),
  );
  const jitterSpan = exponentialDelay * config.retryJitterRatio;
  const jitterOffset = (Math.random() * 2 - 1) * jitterSpan;
  const withJitter = Math.round(exponentialDelay + jitterOffset);
  return Math.max(0, withJitter);
}

function isHttpSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

function toWebhookPayload(
  event: MCPEvent,
  deliveryId: string,
  attempt: number,
  maxAttempts: number,
  retryable: boolean,
): WebhookPayload {
  return {
    schema_version: '1.0',
    delivery_id: deliveryId,
    attempt,
    max_attempts: maxAttempts,
    sent_at: new Date().toISOString(),
    event,
    context: {
      workspace_id: event.workspace_id ?? null,
      plan_id: event.plan_id ?? null,
      agent_type: event.agent_type ?? null,
      tool_name: event.tool_name ?? null,
    },
    delivery: {
      source: 'project-memory-mcp/server',
      mode: 'best-effort-non-blocking',
      retryable,
    },
  };
}

function signPayload(config: WebhookRuntimeConfig, unixTimestamp: string, rawBody: string): string | null {
  if (!config.signingEnabled) {
    return null;
  }

  const signedInput = `${unixTimestamp}.${rawBody}`;
  const digest = createHmac(config.signatureAlgorithm, config.secret).update(signedInput).digest('hex');
  return `v1=${digest}`;
}

export class WebhookDispatcher {
  private readonly config: WebhookRuntimeConfig;
  private readonly fetchFn: FetchFn;
  private readonly sleep: SleepFn;
  private readonly logger: Logger;

  private readonly queue: MCPEvent[] = [];
  private activeCount = 0;

  constructor(
    config: WebhookRuntimeConfig,
    options?: {
      fetchFn?: FetchFn;
      sleep?: SleepFn;
      logger?: Logger;
    },
  ) {
    this.config = config;
    this.fetchFn = options?.fetchFn ?? fetch;
    this.sleep = options?.sleep ?? DEFAULT_SLEEP;
    this.logger = options?.logger ?? defaultLogger();
  }

  enqueue(event: MCPEvent): void {
    if (!this.config.enabled || !this.config.url) {
      return;
    }

    const inFlight = this.queue.length + this.activeCount;
    if (inFlight >= this.config.queueMaxInflight) {
      if (this.config.failOpenOnQueueOverflow) {
        this.logger.warn('queue_overflow_drop', {
          event_id: event.id,
          event_type: event.type,
          workspace_id: event.workspace_id ?? null,
          plan_id: event.plan_id ?? null,
          queue_max_inflight: this.config.queueMaxInflight,
        });
      }
      return;
    }

    this.queue.push(event);
    this.pump();
  }

  private pump(): void {
    while (this.activeCount < this.config.queueConcurrency && this.queue.length > 0) {
      const event = this.queue.shift();
      if (!event) break;
      this.activeCount += 1;
      void this.handleDelivery(event).finally(() => {
        this.activeCount -= 1;
        this.pump();
      });
    }
  }

  private async handleDelivery(event: MCPEvent): Promise<void> {
    const maxAttempts = 1 + this.config.retryMaxAttempts;
    const deliveryId = buildDeliveryId(Date.now());

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const payload = toWebhookPayload(event, deliveryId, attempt, maxAttempts, false);
      const rawBody = JSON.stringify(payload);
      const payloadSize = Buffer.byteLength(rawBody, 'utf8');

      if (payloadSize > this.config.maxPayloadBytes) {
        this.logger.warn('payload_too_large_drop', {
          delivery_id: deliveryId,
          event_id: event.id,
          event_type: event.type,
          workspace_id: event.workspace_id ?? null,
          plan_id: event.plan_id ?? null,
          payload_size_bytes: payloadSize,
          max_payload_bytes: this.config.maxPayloadBytes,
        });
        return;
      }

      const attemptResult = await this.dispatchAttempt(event, deliveryId, attempt, maxAttempts, rawBody);

      if (attemptResult.ok) {
        return;
      }

      if (!attemptResult.retryable || attempt >= maxAttempts) {
        this.logger.error('delivery_final_failure', {
          delivery_id: deliveryId,
          event_id: event.id,
          event_type: event.type,
          workspace_id: event.workspace_id ?? null,
          plan_id: event.plan_id ?? null,
          attempt,
          max_attempts: maxAttempts,
          http_status: attemptResult.status,
          error_code: attemptResult.errorCode,
          duration_ms: attemptResult.durationMs,
          next_retry_ms: null,
        });
        return;
      }

      const nextRetryMs = calculateRetryDelayMs(this.config, attempt);
      this.logger.warn('delivery_retry', {
        delivery_id: deliveryId,
        event_id: event.id,
        event_type: event.type,
        workspace_id: event.workspace_id ?? null,
        plan_id: event.plan_id ?? null,
        attempt,
        max_attempts: maxAttempts,
        http_status: attemptResult.status,
        error_code: attemptResult.errorCode,
        duration_ms: attemptResult.durationMs,
        next_retry_ms: nextRetryMs,
      });
      await this.sleep(nextRetryMs);
    }
  }

  private async dispatchAttempt(
    event: MCPEvent,
    deliveryId: string,
    attempt: number,
    maxAttempts: number,
    rawBody: string,
  ): Promise<DispatchAttemptResult> {
    const startedAt = Date.now();
    const unixTimestamp = Math.floor(startedAt / 1000).toString();
    const signature = signPayload(this.config, unixTimestamp, rawBody);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-PM-Webhook-Id': deliveryId,
      'X-PM-Webhook-Timestamp': unixTimestamp,
      'X-PM-Webhook-Event': event.type,
      'X-PM-Webhook-Attempt': String(attempt),
    };

    if (signature) {
      headers['X-PM-Webhook-Signature'] = signature;
    }

    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), this.config.timeoutMs);

    try {
      const response = await this.fetchFn(this.config.url!, {
        method: 'POST',
        headers,
        body: rawBody,
        signal: abortController.signal,
      });

      const durationMs = Date.now() - startedAt;
      if (isHttpSuccess(response.status)) {
        return { ok: true, retryable: false, status: response.status, errorCode: 'ok', durationMs };
      }

      const retryable = this.config.retryableStatusCodes.has(response.status);
      return {
        ok: false,
        retryable,
        status: response.status,
        errorCode: `http_${response.status}`,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const errorName = error instanceof Error ? error.name : 'unknown_error';
      const aborted = errorName === 'AbortError';
      return {
        ok: false,
        retryable: true,
        status: null,
        errorCode: aborted ? 'timeout' : 'network_error',
        durationMs,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

let singleton: WebhookDispatcher | null = null;
let configWarningsLogged = false;

function getDispatcher(): WebhookDispatcher {
  if (singleton) {
    return singleton;
  }

  const config = getWebhookRuntimeConfig();
  const logger = defaultLogger();

  if (!configWarningsLogged && config.configErrors.length > 0) {
    configWarningsLogged = true;
    for (const error of config.configErrors) {
      logger.error('configuration_error', { error_code: 'invalid_config', message: error });
    }
  }

  singleton = new WebhookDispatcher(config, { logger });
  return singleton;
}

export function dispatchEventToWebhook(event: MCPEvent): void {
  try {
    getDispatcher().enqueue(event);
  } catch {
    // Non-fatal by contract.
  }
}

export function __resetWebhookDispatcherForTests(): void {
  singleton = null;
  configWarningsLogged = false;
}
