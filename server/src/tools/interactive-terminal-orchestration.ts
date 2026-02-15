import type {
  InteractiveTerminalCanonicalRequest,
  InteractiveTerminalCorrelation,
} from './interactive-terminal-contract.js';

export type InteractiveLifecycleStage =
  | 'spawn'
  | 'ready'
  | 'request_sent'
  | 'user_decision'
  | 'response_returned';

export interface InteractiveLifecycleEntry {
  stage: InteractiveLifecycleStage;
  at: number;
  details?: Record<string, unknown>;
}

export interface AdapterConnectResult {
  ok: boolean;
  error?: 'timeout' | 'disconnected' | 'unavailable' | 'internal';
  runtime_session_id?: string;
}

export interface AdapterSendResult {
  ok: boolean;
  error?: 'timeout' | 'disconnected' | 'internal';
}

export interface AdapterAwaitResult {
  ok: boolean;
  decision?: 'approved' | 'declined';
  error?: 'timeout' | 'disconnected' | 'internal';
  response?: {
    session_id?: string;
    terminal_id?: string;
    stdout?: string;
    stderr?: string;
    exit_code?: number | null;
    running?: boolean;
    authorization?: 'allowed' | 'allowed_with_warning' | 'blocked';
    warning?: string;
    reason?: string;
    adapter?: 'headless_process' | 'host_bridge_local' | 'container_bridge_to_host';
    approval_required?: boolean;
    approved_by?: 'allowlist' | 'user';
    visibility_applied?: 'visible' | 'headless';
    attached_to_existing?: boolean;
  };
}

export interface AdapterRecoverResult {
  ok: boolean;
  recovered: boolean;
}

export interface InteractiveRuntimeAdapter {
  readonly adapter_type: 'local' | 'bundled' | 'container_bridge' | 'inprocess';
  connect(input: {
    correlation: InteractiveTerminalCorrelation;
    timeout_ms: number;
  }): Promise<AdapterConnectResult>;
  sendRequest(input: {
    request: InteractiveTerminalCanonicalRequest;
    timeout_ms: number;
  }): Promise<AdapterSendResult>;
  awaitResponse(input: {
    correlation: InteractiveTerminalCorrelation;
    timeout_ms: number;
  }): Promise<AdapterAwaitResult>;
  recover(input: {
    correlation: InteractiveTerminalCorrelation;
    reason: 'timeout' | 'disconnected';
  }): Promise<AdapterRecoverResult>;
  close(input: {
    correlation: InteractiveTerminalCorrelation;
  }): Promise<void>;
}

export interface OrchestrationResult {
  ok: boolean;
  lifecycle: InteractiveLifecycleEntry[];
  error?: 'timeout' | 'disconnected' | 'unavailable' | 'declined' | 'internal';
  response?: {
    session_id?: string;
    terminal_id?: string;
    stdout?: string;
    stderr?: string;
    exit_code?: number | null;
    running?: boolean;
    authorization?: 'allowed' | 'allowed_with_warning' | 'blocked';
    warning?: string;
    reason?: string;
    adapter?: 'headless_process' | 'host_bridge_local' | 'container_bridge_to_host';
    approval_required?: boolean;
    approved_by?: 'allowlist' | 'user';
    visibility_applied?: 'visible' | 'headless';
    attached_to_existing?: boolean;
  };
}

export async function orchestrateInteractiveLifecycle(input: {
  request: InteractiveTerminalCanonicalRequest;
  adapter: InteractiveRuntimeAdapter;
}): Promise<OrchestrationResult> {
  const lifecycle: InteractiveLifecycleEntry[] = [];
  const timeoutMs = input.request.runtime.timeout_ms;

  const push = (stage: InteractiveLifecycleStage, details?: Record<string, unknown>): void => {
    lifecycle.push({ stage, at: Date.now(), ...(details ? { details } : {}) });
  };

  push('spawn', { adapter: input.adapter.adapter_type });
  const connect = await input.adapter.connect({
    correlation: input.request.correlation,
    timeout_ms: timeoutMs,
  });

  if (!connect.ok) {
    return {
      ok: false,
      lifecycle,
      error: connect.error === 'unavailable' ? 'unavailable' : connect.error ?? 'internal',
    };
  }

  push('ready', { runtime_session_id: connect.runtime_session_id });

  const send = await input.adapter.sendRequest({
    request: input.request,
    timeout_ms: timeoutMs,
  });

  if (!send.ok) {
    await input.adapter.close({ correlation: input.request.correlation });
    return {
      ok: false,
      lifecycle,
      error: send.error ?? 'internal',
    };
  }

  push('request_sent');

  let awaitResult = await input.adapter.awaitResponse({
    correlation: input.request.correlation,
    timeout_ms: timeoutMs,
  });

  if (!awaitResult.ok && (awaitResult.error === 'timeout' || awaitResult.error === 'disconnected')) {
    const recover = await input.adapter.recover({
      correlation: input.request.correlation,
      reason: awaitResult.error,
    });

    if (recover.ok && recover.recovered) {
      awaitResult = await input.adapter.awaitResponse({
        correlation: input.request.correlation,
        timeout_ms: timeoutMs,
      });
    }
  }

  if (!awaitResult.ok) {
    await input.adapter.close({ correlation: input.request.correlation });
    return {
      ok: false,
      lifecycle,
      error: awaitResult.error ?? 'internal',
    };
  }

  push('user_decision', { decision: awaitResult.decision });

  if (awaitResult.decision === 'declined') {
    await input.adapter.close({ correlation: input.request.correlation });
    push('response_returned', { declined: true });
    return {
      ok: false,
      lifecycle,
      error: 'declined',
      response: awaitResult.response,
    };
  }

  await input.adapter.close({ correlation: input.request.correlation });
  push('response_returned', { approved: true });
  return {
    ok: true,
    lifecycle,
    response: awaitResult.response,
  };
}
