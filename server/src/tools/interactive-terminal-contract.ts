import { randomUUID } from 'node:crypto';

export type InteractiveTerminalCanonicalAction = 'execute' | 'read_output' | 'terminate' | 'list';
export type InteractiveTerminalLegacyAction = 'run' | 'kill' | 'send' | 'close' | 'create' | 'list';
export type InteractiveTerminalMode = 'interactive' | 'headless';
export type InteractiveTerminalIntent = 'open_only' | 'execute_command';

export interface InteractiveTerminalCorrelation {
  request_id: string;
  trace_id: string;
  client_request_id?: string;
}

export interface InteractiveTerminalRuntime {
  workspace_id?: string;
  cwd?: string;
  timeout_ms: number;
  adapter_override?: 'local' | 'bundled' | 'container_bridge' | 'auto';
}

export interface InteractiveTerminalExecution {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface InteractiveTerminalTarget {
  session_id?: string;
  terminal_id?: string;
}

export interface InteractiveTerminalCompat {
  legacy_action?: InteractiveTerminalLegacyAction;
  caller_surface?: 'server' | 'extension' | 'dashboard' | 'chat_button';
}

export interface InteractiveTerminalCanonicalRequest {
  action: InteractiveTerminalCanonicalAction;
  invocation: {
    mode: InteractiveTerminalMode;
    intent: InteractiveTerminalIntent;
  };
  correlation: InteractiveTerminalCorrelation;
  runtime: InteractiveTerminalRuntime;
  execution?: InteractiveTerminalExecution;
  target?: InteractiveTerminalTarget;
  compat?: InteractiveTerminalCompat;
}

export interface InteractiveTerminalFallback {
  strategy:
    | 'reject_no_retry'
    | 'report_decline'
    | 'suggest_retry_headless_or_interactive'
    | 'suggest_reconnect_retry'
    | 'fallback_to_headless_if_allowed'
    | 'reject_with_safety_hint'
    | 'refresh_list_then_retry'
    | 'deterministic_internal_fallback';
  next_action?: InteractiveTerminalCanonicalAction;
  recommended_mode?: InteractiveTerminalMode;
  user_message: string;
  can_auto_retry: boolean;
}

export interface InteractiveTerminalError {
  code:
    | 'PM_TERM_INVALID_ACTION'
    | 'PM_TERM_INVALID_PAYLOAD'
    | 'PM_TERM_INVALID_MODE'
    | 'PM_TERM_DECLINED'
    | 'PM_TERM_TIMEOUT'
    | 'PM_TERM_DISCONNECTED'
    | 'PM_TERM_GUI_UNAVAILABLE'
    | 'PM_TERM_BLOCKED_DESTRUCTIVE'
    | 'PM_TERM_NOT_FOUND'
    | 'PM_TERM_INTERNAL';
  category:
    | 'validation'
    | 'user_decision'
    | 'runtime_timeout'
    | 'transport'
    | 'runtime_unavailable'
    | 'authorization'
    | 'identity'
    | 'internal';
  message: string;
  retriable: boolean;
  details?: Record<string, unknown>;
}

export interface InteractiveTerminalCanonicalErrorResponse {
  success: false;
  action: InteractiveTerminalCanonicalAction;
  status: 'failed';
  correlation: InteractiveTerminalCorrelation;
  resolved: {
    canonical_action: InteractiveTerminalCanonicalAction;
    alias_applied: boolean;
    legacy_action: InteractiveTerminalLegacyAction | null;
    mode: InteractiveTerminalMode;
  };
  error: InteractiveTerminalError;
  fallback: InteractiveTerminalFallback;
}

export interface InteractiveTerminalParseSuccess {
  ok: true;
  request: InteractiveTerminalCanonicalRequest;
  resolved: {
    alias_applied: boolean;
    legacy_action: InteractiveTerminalLegacyAction | null;
  };
}

export interface InteractiveTerminalParseFailure {
  ok: false;
  response: InteractiveTerminalCanonicalErrorResponse;
}

export type InteractiveTerminalParseResult = InteractiveTerminalParseSuccess | InteractiveTerminalParseFailure;

type RawInvocation = {
  mode?: unknown;
  intent?: unknown;
};

type RawPayload = {
  action?: unknown;
  command?: unknown;
  args?: unknown;
  cwd?: unknown;
  timeout?: unknown;
  timeout_ms?: unknown;
  workspace_id?: unknown;
  session_id?: unknown;
  terminal_id?: unknown;
  env?: unknown;
  invocation?: RawInvocation;
  correlation?: { request_id?: unknown; trace_id?: unknown; client_request_id?: unknown };
  runtime?: { workspace_id?: unknown; cwd?: unknown; timeout_ms?: unknown; adapter_override?: unknown };
  execution?: { command?: unknown; args?: unknown; env?: unknown };
  target?: { session_id?: unknown; terminal_id?: unknown };
  compat?: { legacy_action?: unknown; caller_surface?: unknown };
};

const LEGACY_ACTION_MAP: Record<InteractiveTerminalLegacyAction, InteractiveTerminalCanonicalAction> = {
  run: 'execute',
  kill: 'terminate',
  send: 'execute',
  close: 'terminate',
  create: 'execute',
  list: 'list',
};

const DEFAULT_TIMEOUT_MS = 30_000;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (!value.every((item) => typeof item === 'string')) return undefined;
  return value;
}

function asRecordOfStrings(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.every(([, v]) => typeof v === 'string')) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
}

function asTimeoutMs(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return DEFAULT_TIMEOUT_MS;
  if (value <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(value, 300_000);
}

function fallbackFor(code: InteractiveTerminalError['code']): InteractiveTerminalFallback {
  switch (code) {
    case 'PM_TERM_DECLINED':
      return {
        strategy: 'report_decline',
        next_action: 'execute',
        recommended_mode: 'interactive',
        user_message: 'The interactive command was declined.',
        can_auto_retry: false,
      };
    case 'PM_TERM_TIMEOUT':
      return {
        strategy: 'suggest_retry_headless_or_interactive',
        next_action: 'execute',
        recommended_mode: 'headless',
        user_message: 'The request timed out. Retry now or switch modes.',
        can_auto_retry: false,
      };
    case 'PM_TERM_DISCONNECTED':
      return {
        strategy: 'suggest_reconnect_retry',
        next_action: 'execute',
        recommended_mode: 'interactive',
        user_message: 'The interactive connection was lost. Reconnect and retry.',
        can_auto_retry: false,
      };
    case 'PM_TERM_GUI_UNAVAILABLE':
      return {
        strategy: 'fallback_to_headless_if_allowed',
        next_action: 'execute',
        recommended_mode: 'headless',
        user_message: 'Interactive GUI is unavailable. Headless execution is recommended.',
        can_auto_retry: false,
      };
    case 'PM_TERM_BLOCKED_DESTRUCTIVE':
      return {
        strategy: 'reject_with_safety_hint',
        next_action: 'execute',
        recommended_mode: 'interactive',
        user_message: 'This command is blocked by safety policy.',
        can_auto_retry: false,
      };
    case 'PM_TERM_NOT_FOUND':
      return {
        strategy: 'refresh_list_then_retry',
        next_action: 'list',
        user_message: 'The terminal/session was not found. Refresh list and retry.',
        can_auto_retry: false,
      };
    case 'PM_TERM_INTERNAL':
      return {
        strategy: 'deterministic_internal_fallback',
        next_action: 'execute',
        user_message: 'Internal interactive terminal error. Retry may succeed.',
        can_auto_retry: false,
      };
    default:
      return {
        strategy: 'reject_no_retry',
        next_action: 'execute',
        user_message: 'The request is invalid. Fix payload and retry.',
        can_auto_retry: false,
      };
  }
}

function createErrorResponse(input: {
  action: InteractiveTerminalCanonicalAction;
  mode: InteractiveTerminalMode;
  alias_applied: boolean;
  legacy_action: InteractiveTerminalLegacyAction | null;
  correlation: InteractiveTerminalCorrelation;
  error: InteractiveTerminalError;
}): InteractiveTerminalCanonicalErrorResponse {
  return {
    success: false,
    action: input.action,
    status: 'failed',
    correlation: input.correlation,
    resolved: {
      canonical_action: input.action,
      alias_applied: input.alias_applied,
      legacy_action: input.legacy_action,
      mode: input.mode,
    },
    error: input.error,
    fallback: fallbackFor(input.error.code),
  };
}

function normalizeAction(rawAction: unknown): {
  action?: InteractiveTerminalCanonicalAction;
  aliasApplied: boolean;
  legacyAction: InteractiveTerminalLegacyAction | null;
} {
  const actionString = asString(rawAction);
  if (!actionString) {
    return { aliasApplied: false, legacyAction: null };
  }

  if (actionString === 'execute' || actionString === 'read_output' || actionString === 'terminate' || actionString === 'list') {
    return { action: actionString, aliasApplied: false, legacyAction: null };
  }

  if (actionString in LEGACY_ACTION_MAP) {
    const legacy = actionString as InteractiveTerminalLegacyAction;
    return {
      action: LEGACY_ACTION_MAP[legacy],
      aliasApplied: legacy !== 'list',
      legacyAction: legacy,
    };
  }

  return { aliasApplied: false, legacyAction: null };
}

export function parseInteractiveTerminalRequest(input: unknown): InteractiveTerminalParseResult {
  const payload = (input ?? {}) as RawPayload;
  const normalized = normalizeAction(payload.action);
  const generatedCorrelation: InteractiveTerminalCorrelation = {
    request_id: asString(payload.correlation?.request_id) ?? `req_${randomUUID()}`,
    trace_id: asString(payload.correlation?.trace_id) ?? `trace_${randomUUID()}`,
    ...(asString(payload.correlation?.client_request_id)
      ? { client_request_id: asString(payload.correlation?.client_request_id)! }
      : {}),
  };

  if (!normalized.action) {
    return {
      ok: false,
      response: createErrorResponse({
        action: 'execute',
        mode: 'headless',
        alias_applied: false,
        legacy_action: null,
        correlation: generatedCorrelation,
        error: {
          code: 'PM_TERM_INVALID_ACTION',
          category: 'validation',
          message: 'action is required and must be one of: execute, read_output, terminate, list (legacy aliases: run, kill, send, close, create).',
          retriable: false,
        },
      }),
    };
  }

  const action = normalized.action;
  const runtimeTimeout = asTimeoutMs(payload.runtime?.timeout_ms ?? payload.timeout_ms ?? payload.timeout);
  const runtime: InteractiveTerminalRuntime = {
    workspace_id: asString(payload.runtime?.workspace_id ?? payload.workspace_id),
    cwd: asString(payload.runtime?.cwd ?? payload.cwd),
    timeout_ms: runtimeTimeout,
    adapter_override: ((): InteractiveTerminalRuntime['adapter_override'] => {
      const v = asString(payload.runtime?.adapter_override);
      if (!v) return undefined;
      if (v === 'local' || v === 'bundled' || v === 'container_bridge' || v === 'auto') return v;
      return undefined;
    })(),
  };

  const invocationMode = asString(payload.invocation?.mode) as InteractiveTerminalMode | undefined;
  const invocationIntent = asString(payload.invocation?.intent) as InteractiveTerminalIntent | undefined;
  const command = asString(payload.execution?.command ?? payload.command);
  const args = asStringArray(payload.execution?.args ?? payload.args);
  const env = asRecordOfStrings(payload.execution?.env ?? payload.env);
  const target: InteractiveTerminalTarget = {
    session_id: asString(payload.target?.session_id ?? payload.session_id),
    terminal_id: asString(payload.target?.terminal_id ?? payload.terminal_id),
  };

  const compatLegacyAction = asString(payload.compat?.legacy_action) as InteractiveTerminalLegacyAction | undefined;
  const resolvedLegacyAction = normalized.legacyAction ?? compatLegacyAction ?? null;

  let mode: InteractiveTerminalMode = invocationMode ?? 'headless';
  let intent: InteractiveTerminalIntent = invocationIntent ?? 'execute_command';

  if (resolvedLegacyAction === 'create') {
    mode = 'interactive';
    intent = 'open_only';
  } else if (resolvedLegacyAction === 'send') {
    mode = 'interactive';
    intent = 'execute_command';
  }

  if (mode !== 'interactive' && mode !== 'headless') {
    return {
      ok: false,
      response: createErrorResponse({
        action,
        mode: 'headless',
        alias_applied: normalized.aliasApplied,
        legacy_action: resolvedLegacyAction,
        correlation: generatedCorrelation,
        error: {
          code: 'PM_TERM_INVALID_MODE',
          category: 'validation',
          message: `Unsupported invocation.mode: ${String(invocationMode)}.`,
          retriable: false,
        },
      }),
    };
  }

  if (action === 'execute') {
    if (!intent || (intent !== 'open_only' && intent !== 'execute_command')) {
      return {
        ok: false,
        response: createErrorResponse({
          action,
          mode,
          alias_applied: normalized.aliasApplied,
          legacy_action: resolvedLegacyAction,
          correlation: generatedCorrelation,
          error: {
            code: 'PM_TERM_INVALID_PAYLOAD',
            category: 'validation',
            message: 'execute requires invocation.intent (open_only | execute_command).',
            retriable: false,
          },
        }),
      };
    }

    if (intent === 'execute_command' && !command) {
      return {
        ok: false,
        response: createErrorResponse({
          action,
          mode,
          alias_applied: normalized.aliasApplied,
          legacy_action: resolvedLegacyAction,
          correlation: generatedCorrelation,
          error: {
            code: 'PM_TERM_INVALID_PAYLOAD',
            category: 'validation',
            message: 'execution.command is required when intent=execute_command.',
            retriable: false,
          },
        }),
      };
    }

    if (intent === 'open_only' && command) {
      return {
        ok: false,
        response: createErrorResponse({
          action,
          mode,
          alias_applied: normalized.aliasApplied,
          legacy_action: resolvedLegacyAction,
          correlation: generatedCorrelation,
          error: {
            code: 'PM_TERM_INVALID_PAYLOAD',
            category: 'validation',
            message: 'execution.command must be omitted when intent=open_only.',
            retriable: false,
          },
        }),
      };
    }

    if (mode === 'headless' && target.terminal_id) {
      return {
        ok: false,
        response: createErrorResponse({
          action,
          mode,
          alias_applied: normalized.aliasApplied,
          legacy_action: resolvedLegacyAction,
          correlation: generatedCorrelation,
          error: {
            code: 'PM_TERM_INVALID_MODE',
            category: 'validation',
            message: 'headless execute does not allow target.terminal_id.',
            retriable: false,
          },
        }),
      };
    }
  }

  if (action === 'read_output' || action === 'terminate') {
    if (!target.session_id && !target.terminal_id) {
      return {
        ok: false,
        response: createErrorResponse({
          action,
          mode,
          alias_applied: normalized.aliasApplied,
          legacy_action: resolvedLegacyAction,
          correlation: generatedCorrelation,
          error: {
            code: 'PM_TERM_INVALID_PAYLOAD',
            category: 'validation',
            message: `${action} requires target.session_id or target.terminal_id.`,
            retriable: false,
          },
        }),
      };
    }
  }

  if (action === 'list' && (command || args || target.session_id || target.terminal_id)) {
    return {
      ok: false,
      response: createErrorResponse({
        action,
        mode,
        alias_applied: normalized.aliasApplied,
        legacy_action: resolvedLegacyAction,
        correlation: generatedCorrelation,
        error: {
          code: 'PM_TERM_INVALID_PAYLOAD',
          category: 'validation',
          message: 'list does not accept execution or target fields.',
          retriable: false,
        },
      }),
    };
  }

  const request: InteractiveTerminalCanonicalRequest = {
    action,
    invocation: {
      mode,
      intent,
    },
    correlation: generatedCorrelation,
    runtime,
    ...(command || args || env ? { execution: { command, args, env } } : {}),
    ...(target.session_id || target.terminal_id ? { target } : {}),
    compat: {
      legacy_action: resolvedLegacyAction ?? undefined,
      caller_surface: (asString(payload.compat?.caller_surface) as InteractiveTerminalCompat['caller_surface']) ?? 'server',
    },
  };

  return {
    ok: true,
    request,
    resolved: {
      alias_applied: normalized.aliasApplied,
      legacy_action: resolvedLegacyAction,
    },
  };
}
