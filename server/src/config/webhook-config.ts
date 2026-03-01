type SignatureAlgorithm = 'sha256';

export interface WebhookRuntimeConfig {
  enabled: boolean;
  url: string | null;
  timeoutMs: number;
  signingEnabled: boolean;
  secret: string;
  signatureAlgorithm: SignatureAlgorithm;
  maxPayloadBytes: number;
  retryMaxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  retryJitterRatio: number;
  retryableStatusCodes: Set<number>;
  queueConcurrency: number;
  queueMaxInflight: number;
  failOpenOnQueueOverflow: boolean;
  configErrors: string[];
}

const DEFAULT_RETRYABLE_STATUS_CODES = [408, 425, 429, 500, 502, 503, 504];

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function parseBoundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function parseBoundedFloat(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw.trim());
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function parseRetryableStatusCodes(raw: string | undefined): Set<number> {
  if (!raw || !raw.trim()) {
    return new Set<number>(DEFAULT_RETRYABLE_STATUS_CODES);
  }

  const parsed = raw
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value >= 100 && value <= 599);

  if (parsed.length === 0) {
    return new Set<number>(DEFAULT_RETRYABLE_STATUS_CODES);
  }

  return new Set<number>(parsed);
}

function isValidUrl(value: string): boolean {
  try {
    const candidate = new URL(value);
    return candidate.protocol === 'http:' || candidate.protocol === 'https:';
  } catch {
    return false;
  }
}

export function getWebhookRuntimeConfig(env: NodeJS.ProcessEnv = process.env): WebhookRuntimeConfig {
  const enabled = parseBoolean(env.PM_WEBHOOK_ENABLED, false);
  const url = env.PM_WEBHOOK_URL?.trim() || '';

  const timeoutMs = parseBoundedInt(env.PM_WEBHOOK_TIMEOUT_MS, 3000, 250, 30000);
  const signingEnabled = parseBoolean(env.PM_WEBHOOK_SIGNING_ENABLED, true);
  const secret = env.PM_WEBHOOK_SECRET ?? '';
  const signatureAlgorithm: SignatureAlgorithm = 'sha256';
  const maxPayloadBytes = parseBoundedInt(env.PM_WEBHOOK_MAX_PAYLOAD_BYTES, 131072, 1024, 1048576);
  const retryMaxAttempts = parseBoundedInt(env.PM_WEBHOOK_RETRY_MAX_ATTEMPTS, 3, 0, 10);
  const retryBaseDelayMs = parseBoundedInt(env.PM_WEBHOOK_RETRY_BASE_DELAY_MS, 500, 50, 60000);
  const retryMaxDelayMs = parseBoundedInt(env.PM_WEBHOOK_RETRY_MAX_DELAY_MS, 10000, 100, 120000);
  const retryJitterRatio = parseBoundedFloat(env.PM_WEBHOOK_RETRY_JITTER_RATIO, 0.2, 0, 1);
  const retryableStatusCodes = parseRetryableStatusCodes(env.PM_WEBHOOK_RETRYABLE_STATUS_CODES);
  const queueConcurrency = parseBoundedInt(env.PM_WEBHOOK_QUEUE_CONCURRENCY, 2, 1, 16);
  const queueMaxInflight = parseBoundedInt(env.PM_WEBHOOK_QUEUE_MAX_INFLIGHT, 500, 10, 50000);
  const failOpenOnQueueOverflow = parseBoolean(env.PM_WEBHOOK_FAIL_OPEN_ON_QUEUE_OVERFLOW, true);

  const configErrors: string[] = [];
  let effectiveEnabled = enabled;
  let effectiveUrl: string | null = null;

  if (enabled) {
    if (!url || !isValidUrl(url)) {
      configErrors.push('PM_WEBHOOK_URL is missing or invalid while PM_WEBHOOK_ENABLED=true');
      effectiveEnabled = false;
    } else {
      effectiveUrl = url;
    }

    if (signingEnabled && secret.length === 0) {
      configErrors.push('PM_WEBHOOK_SECRET is required when PM_WEBHOOK_SIGNING_ENABLED=true');
      effectiveEnabled = false;
    }
  }

  return {
    enabled: effectiveEnabled,
    url: effectiveEnabled ? effectiveUrl : null,
    timeoutMs,
    signingEnabled,
    secret,
    signatureAlgorithm,
    maxPayloadBytes,
    retryMaxAttempts,
    retryBaseDelayMs,
    retryMaxDelayMs,
    retryJitterRatio,
    retryableStatusCodes,
    queueConcurrency,
    queueMaxInflight,
    failOpenOnQueueOverflow,
    configErrors,
  };
}
