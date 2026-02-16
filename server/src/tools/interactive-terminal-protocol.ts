import type {
  InteractiveTerminalCanonicalRequest,
  InteractiveTerminalCorrelation,
  InteractiveTerminalMode,
} from './interactive-terminal-contract.js';

export type InteractiveTerminalAdapter = 'headless_process' | 'host_bridge_local' | 'container_bridge_to_host';

export type InteractiveTerminalNdjsonMessage =
  | {
      type: 'command_request';
      trace_id: string;
      request_id: string;
      payload: {
        mode: InteractiveTerminalMode;
        intent: 'open_only' | 'execute_command';
        command?: string;
        args?: string[];
        cwd?: string;
        timeout_ms?: number;
        env?: Record<string, string>;
        target_session_id?: string;
        target_terminal_id?: string;
        visibility?: 'visible' | 'headless';
        adapter?: InteractiveTerminalAdapter;
        approval?: {
          required: boolean;
          allowlisted: boolean;
        };
      };
    }
  | {
      type: 'command_response';
      trace_id: string;
      request_id: string;
      payload: {
        decision: 'approved' | 'declined' | 'timeout' | 'disconnected';
        reason?: string;
        correlation?: {
          request_id?: string;
          context_id?: string;
        };
        result?: {
          session_id?: string;
          terminal_id?: string;
          stdout?: string;
          stderr?: string;
          exit_code?: number | null;
          running?: boolean;
          authorization?: 'allowed' | 'allowed_with_warning' | 'blocked';
          warning?: string;
          adapter?: InteractiveTerminalAdapter;
          approval_required?: boolean;
          approved_by?: 'allowlist' | 'user';
          visibility_applied?: 'visible' | 'headless';
          attached_to_existing?: boolean;
        };
      };
    }
  | {
      type: 'heartbeat';
      trace_id: string;
      request_id: string;
      payload: {
        timestamp_ms: number;
      };
    };

export interface CanonicalMappedResponse {
  user_decision: 'approved' | 'declined' | 'timeout' | 'disconnected';
  correlation?: {
    request_id?: string;
    context_id?: string;
  };
  result: {
    session_id?: string;
    terminal_id?: string;
    stdout?: string;
    stderr?: string;
    exit_code?: number | null;
    running?: boolean;
    authorization?: 'allowed' | 'allowed_with_warning' | 'blocked';
    warning?: string;
    adapter?: InteractiveTerminalAdapter;
    approval_required?: boolean;
    approved_by?: 'allowlist' | 'user';
    visibility_applied?: 'visible' | 'headless';
    attached_to_existing?: boolean;
  };
  reason?: string;
}

export function serializeCommandRequestToNdjson(
  request: InteractiveTerminalCanonicalRequest,
  metadata?: {
    adapter?: InteractiveTerminalAdapter;
    visibility?: 'visible' | 'headless';
    approval_required?: boolean;
    allowlisted?: boolean;
  },
): string {
  const frame: InteractiveTerminalNdjsonMessage = {
    type: 'command_request',
    trace_id: request.correlation.trace_id,
    request_id: request.correlation.request_id,
    payload: {
      mode: request.invocation.mode,
      intent: request.invocation.intent,
      command: request.execution?.command,
      args: request.execution?.args,
      cwd: request.runtime.cwd,
      timeout_ms: request.runtime.timeout_ms,
      env: request.execution?.env,
      target_session_id: request.target?.session_id,
      target_terminal_id: request.target?.terminal_id,
      visibility: metadata?.visibility ?? (request.invocation.mode === 'interactive' ? 'visible' : 'headless'),
      adapter: metadata?.adapter,
      approval: {
        required: metadata?.approval_required ?? false,
        allowlisted: metadata?.allowlisted ?? false,
      },
    },
  };
  return `${JSON.stringify(frame)}\n`;
}

export function serializeHeartbeatToNdjson(correlation: InteractiveTerminalCorrelation, timestamp = Date.now()): string {
  const frame: InteractiveTerminalNdjsonMessage = {
    type: 'heartbeat',
    trace_id: correlation.trace_id,
    request_id: correlation.request_id,
    payload: {
      timestamp_ms: timestamp,
    },
  };
  return `${JSON.stringify(frame)}\n`;
}

export function parseNdjsonMessage(line: string): InteractiveTerminalNdjsonMessage | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as Partial<InteractiveTerminalNdjsonMessage>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.type !== 'command_request' && parsed.type !== 'command_response' && parsed.type !== 'heartbeat') return null;
    if (typeof parsed.trace_id !== 'string' || typeof parsed.request_id !== 'string') return null;
    return parsed as InteractiveTerminalNdjsonMessage;
  } catch {
    return null;
  }
}

export function mapCommandResponseFromNdjson(message: InteractiveTerminalNdjsonMessage): CanonicalMappedResponse | null {
  if (message.type !== 'command_response') return null;

  return {
    user_decision: message.payload.decision,
    reason: message.payload.reason,
    correlation: message.payload.correlation,
    result: {
      session_id: message.payload.result?.session_id,
      terminal_id: message.payload.result?.terminal_id,
      stdout: message.payload.result?.stdout,
      stderr: message.payload.result?.stderr,
      exit_code: message.payload.result?.exit_code,
      running: message.payload.result?.running,
      authorization: message.payload.result?.authorization,
      warning: message.payload.result?.warning,
      adapter: message.payload.result?.adapter,
      approval_required: message.payload.result?.approval_required,
      approved_by: message.payload.result?.approved_by,
      visibility_applied: message.payload.result?.visibility_applied,
      attached_to_existing: message.payload.result?.attached_to_existing,
    },
  };
}
