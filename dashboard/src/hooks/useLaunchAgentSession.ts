import { useMutation } from '@tanstack/react-query';

const API_BASE = '/api';

export interface LaunchAgentSessionParams {
  workspaceId: string;
  planId: string;
  provider: 'gemini' | 'copilot' | 'claude';
  phase?: string;
  stepIndex?: number;
  stepTask?: string;
}

export interface LaunchAgentSessionResult {
  session_id: string;
  runtime_session_id?: string;
  accepted: boolean;
  state: string;
  message?: string;
  error?: string;
}

export function useLaunchAgentSession() {
  return useMutation<LaunchAgentSessionResult, Error, LaunchAgentSessionParams>({
    mutationFn: async (params) => {
      const res = await fetch(`${API_BASE}/agent-session/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<LaunchAgentSessionResult>;
    },
  });
}
