import { getApiKey, getServerConfig } from "./storage";
import type { ChatMessage, ChatResponse, ChatStatusResponse, RuntimeEvent } from "../types/api";

export interface ChatRequest {
  messages: ChatMessage[];
  workspace_id?: string;
  request_id?: string;
}

async function getBaseUrl(): Promise<string> {
  // In browser (not Capacitor native) use relative URLs — Vite proxies to localhost:3464
  if (!(window as any).Capacitor?.isNativePlatform?.()) {
    return "";
  }
  const cfg = await getServerConfig();
  if (!cfg) throw new Error("No server config");
  return `http://${cfg.host}:${cfg.httpPort}`;
}

async function buildHeaders(): Promise<Record<string, string>> {
  const key = await getApiKey();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (key) h["X-PM-API-Key"] = key;
  return h;
}

/** POST /chatbot/chat */
export async function sendMessage(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  const [base, headers] = await Promise.all([getBaseUrl(), buildHeaders()]);
  const res = await fetch(`${base}/chatbot/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<ChatResponse>;
}

/** GET /chatbot/status/:id */
export async function getStatus(id: string): Promise<ChatStatusResponse> {
  const [base, headers] = await Promise.all([getBaseUrl(), buildHeaders()]);
  const res = await fetch(`${base}/chatbot/status/${id}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ChatStatusResponse>;
}

/** GET /runtime/recent */
export async function getRecentEvents(): Promise<RuntimeEvent[]> {
  const [base, headers] = await Promise.all([getBaseUrl(), buildHeaders()]);
  const res = await fetch(`${base}/runtime/recent`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<RuntimeEvent[]>;
}
