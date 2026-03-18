import { getApiKey, getServerConfig } from "./storage";
import type { PingResponse, RuntimeEvent, PlanSummary } from "../types/api";

async function getBaseUrl(): Promise<string> {
  const cfg = await getServerConfig();
  if (!cfg) throw new Error("No server config — connect to a server first");
  return `http://${cfg.host}:${cfg.httpPort}`;
}

async function buildHeaders(): Promise<Record<string, string>> {
  const key = await getApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (key) {
    headers["X-PM-API-Key"] = key;
  }
  return headers;
}

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const [base, headers] = await Promise.all([getBaseUrl(), buildHeaders()]);
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET /gui/ping — exempt from auth, returns supervisor status.
 * Retries up to 3 times on network error (not 4xx) with 1s/2s/4s backoff.
 */
export async function ping(): Promise<PingResponse> {
  const delays = [1000, 2000, 4000];
  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await apiFetch<PingResponse>("/gui/ping");
    } catch (err: any) {
      lastError = err;
      // Don't retry on HTTP 4xx — those are authoritative server responses
      if (typeof err?.message === "string" && /^HTTP 4\d\d/.test(err.message)) {
        throw err;
      }
      if (attempt < delays.length) {
        await delay(delays[attempt]);
      }
    }
  }
  throw lastError;
}

/** GET /runtime/recent — recent runtime events, requires auth */
export async function getRecentEvents(): Promise<RuntimeEvent[]> {
  return apiFetch<RuntimeEvent[]>("/runtime/recent");
}

/** GET /gui/plans — active plan summaries, requires auth */
export async function getActivePlans(): Promise<PlanSummary[]> {
  return apiFetch<PlanSummary[]>("/gui/plans");
}
