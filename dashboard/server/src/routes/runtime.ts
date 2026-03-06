import { Router } from 'express';

export type FallbackApiHealthState = 'healthy' | 'degraded' | 'disabled' | 'unknown';

export interface FallbackApiHealthSnapshot {
  state: FallbackApiHealthState;
  detail: string;
  checked_at: string;
  proxy_base_url: string | null;
  http_status?: number;
}

interface FallbackApiProbePayload {
  success?: boolean;
  error?: string;
  code?: string;
}

const SUPERVISOR_URL_KEYS = ['SUPERVISOR_PROXY_URL', 'SUPERVISOR_API_URL'] as const;
const HEALTH_PROBE_TIMEOUT_MS = 2000;

function nowIso(): string {
  return new Date().toISOString();
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function resolveSupervisorProxyBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const key of SUPERVISOR_URL_KEYS) {
    const configured = env[key];
    if (isString(configured)) {
      return normalizeBaseUrl(configured);
    }
  }

  const eventsUrl = env.SUPERVISOR_EVENTS_URL;
  if (isString(eventsUrl)) {
    try {
      const parsed = new URL(eventsUrl);
      return normalizeBaseUrl(`${parsed.protocol}//${parsed.host}`);
    } catch {
      return null;
    }
  }

  return null;
}

function classifyFallbackStatus(payload: FallbackApiProbePayload, httpStatus: number): FallbackApiHealthState {
  if (payload.success === true) {
    return 'healthy';
  }

  const code = (payload.code || '').toLowerCase();
  const message = (payload.error || '').toLowerCase();

  if (code === 'fallback_unavailable' && message.includes('disabled')) {
    return 'disabled';
  }

  if (httpStatus === 404) {
    return 'disabled';
  }

  if (
    code === 'fallback_unavailable' ||
    httpStatus >= 500 ||
    message.includes('unavailable') ||
    message.includes('unreachable')
  ) {
    return 'degraded';
  }

  return 'unknown';
}

function defaultDetailForState(state: FallbackApiHealthState): string {
  switch (state) {
    case 'healthy':
      return 'Fallback API responding';
    case 'degraded':
      return 'Fallback API backend unavailable';
    case 'disabled':
      return 'Fallback API disabled';
    default:
      return 'Fallback API health unknown';
  }
}

async function parseProbePayload(response: Response): Promise<FallbackApiProbePayload> {
  try {
    return (await response.json()) as FallbackApiProbePayload;
  } catch {
    return {};
  }
}

export async function probeFallbackApiHealth(
  proxyBaseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FallbackApiHealthSnapshot> {
  const checkedAt = nowIso();
  const endpoint = new URL('/api/fallback/health', `${proxyBaseUrl}/`).toString();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), HEALTH_PROBE_TIMEOUT_MS);

  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    const payload = await parseProbePayload(response);
    const state = classifyFallbackStatus(payload, response.status);

    return {
      state,
      detail: payload.error || defaultDetailForState(state),
      checked_at: checkedAt,
      proxy_base_url: proxyBaseUrl,
      http_status: response.status,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
    const detail = errorMessage.includes('abort')
      ? 'Timed out contacting supervisor fallback endpoint'
      : 'Unable to reach supervisor fallback endpoint';

    return {
      state: 'unknown',
      detail,
      checked_at: checkedAt,
      proxy_base_url: proxyBaseUrl,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export const runtimeRouter = Router();

runtimeRouter.get('/fallback-health', async (_req, res) => {
  const proxyBaseUrl = resolveSupervisorProxyBaseUrl();

  if (!proxyBaseUrl) {
    res.json({
      fallback_api: {
        state: 'disabled',
        detail: 'Supervisor proxy URL not configured; fallback health checks are disabled',
        checked_at: nowIso(),
        proxy_base_url: null,
      } as FallbackApiHealthSnapshot,
    });
    return;
  }

  const snapshot = await probeFallbackApiHealth(proxyBaseUrl);
  res.json({ fallback_api: snapshot });
});
