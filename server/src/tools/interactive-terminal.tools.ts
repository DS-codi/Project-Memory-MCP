/**
 * Interactive Terminal Tools — relaxed authorization model
 *
 * Unlike the strict `memory_terminal` tool which blocks non-allowlisted commands
 * and shell operators, this tool uses a RELAXED model:
 *
 * - Destructive keywords → BLOCKED (same as memory_terminal)
 * - Shell operators      → ALLOWED with warning
 * - Not on allowlist     → ALLOWED with warning
 * - On allowlist         → ALLOWED (no warning)
 *
 * Shares the same session store as memory_terminal — read_output and kill
 * work across both tools.
 */

import type { ToolResponse } from '../types/index.js';
import net from 'node:net';
import {
  isDestructiveCommand,
  hasShellOperators,
  ensureAllowlistLoaded,
  getEffectiveAllowlist,
} from './terminal-auth.js';
import {
  spawnAndTrackSession,
  getActiveSessions,
  handleReadOutput,
  handleKill,
  type SpawnResult,
} from './terminal.tools.js';
import type {
  InteractiveTerminalCanonicalErrorResponse,
  InteractiveTerminalCanonicalRequest,
  InteractiveTerminalCorrelation,
} from './interactive-terminal-contract.js';
import {
  mapCommandResponseFromNdjson,
  parseNdjsonMessage,
  serializeCommandRequestToNdjson,
  serializeHeartbeatToNdjson,
} from './interactive-terminal-protocol.js';
import {
  orchestrateInteractiveLifecycle,
  type InteractiveRuntimeAdapter,
} from './interactive-terminal-orchestration.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InteractiveTerminalRunResult extends SpawnResult {
  authorization: 'allowed' | 'allowed_with_warning' | 'blocked';
  warning?: string;
  command?: string;
  reason?: string;
}

export interface SessionListResult {
  sessions: Array<{
    session_id: string;
    command: string;
    args: string[];
    cwd: string;
    pid?: number;
    running: boolean;
    exit_code: number | null;
    created_at: number;
  }>;
  count: number;
}

export interface CanonicalInteractiveResponse {
  success: true;
  action: 'execute' | 'read_output' | 'terminate' | 'list';
  status: 'completed';
  correlation: InteractiveTerminalCorrelation;
  resolved: {
    canonical_action: 'execute' | 'read_output' | 'terminate' | 'list';
    alias_applied: boolean;
    legacy_action: 'run' | 'kill' | 'send' | 'close' | 'create' | 'list' | null;
    mode: 'interactive' | 'headless';
  };
  identity: {
    session_id?: string;
    terminal_id?: string;
  };
  result: {
    authorization?: 'allowed' | 'allowed_with_warning' | 'blocked';
    warning?: string;
    stdout?: string;
    stderr?: string;
    exit_code?: number | null;
    running?: boolean;
    items?: Array<Record<string, unknown>>;
    lifecycle?: string[];
  };
  error: null;
}

type RuntimeAdapterMode = 'local' | 'bundled' | 'container_bridge';

interface BridgeProbeAttempt {
  host: string;
  port: number;
  outcome: 'connected' | 'timeout' | 'unreachable';
  detail?: string;
}

interface BridgePreflightOk {
  ok: true;
}

interface BridgePreflightFailure {
  ok: false;
  type: 'invalid_config' | 'connectivity';
  details: Record<string, unknown>;
}

type BridgePreflightResult = BridgePreflightOk | BridgePreflightFailure;

// ---------------------------------------------------------------------------
// Relaxed authorization
// ---------------------------------------------------------------------------

interface InteractiveAuthResult {
  status: 'allowed' | 'allowed_with_warning' | 'blocked';
  warning?: string;
  reason?: string;
}

/**
 * Relaxed authorization for the interactive terminal tier.
 *
 * Only destructive commands are blocked.  Everything else is allowed,
 * with a `warning` attached when the command is not on the allowlist
 * or contains shell operators so the caller is aware.
 */
function authorizeInteractiveCommand(
  command: string,
  args: string[],
  allowlist: string[],
): InteractiveAuthResult {
  const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;

  // 1. Destructive keywords → always blocked
  const destructive = isDestructiveCommand(fullCommand);
  if (destructive.match) {
    return {
      status: 'blocked',
      reason: `Command contains destructive keyword: "${destructive.keyword}". This command is blocked for safety.`,
    };
  }

  // 2. Check against allowlist
  const lower = fullCommand.toLowerCase();
  const onAllowlist = allowlist.some(
    (pattern) =>
      fullCommand.startsWith(pattern) || lower.startsWith(pattern.toLowerCase()),
  );

  // 3. Build warnings for non-allowlisted or shell-operator commands
  const warnings: string[] = [];

  if (!onAllowlist) {
    warnings.push(`Command "${command}" is not on the allowlist.`);
  }

  if (hasShellOperators(fullCommand)) {
    warnings.push('Command contains shell operators (|, &&, ;, >, etc.).');
  }

  if (warnings.length > 0) {
    return {
      status: 'allowed_with_warning',
      warning: warnings.join(' '),
    };
  }

  return { status: 'allowed' };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Run a command using the relaxed interactive authorization model.
 * Shares the session store with memory_terminal.
 */
export async function handleInteractiveTerminalRun(params: {
  command: string;
  args?: string[];
  cwd?: string;
  timeout?: number;
  workspace_id?: string;
}): Promise<ToolResponse<InteractiveTerminalRunResult>> {
  const { command, args = [], cwd, timeout, workspace_id } = params;

  // Ensure allowlist is loaded from disk for warning generation
  if (workspace_id) {
    await ensureAllowlistLoaded(workspace_id);
  }

  const allowlist = await getEffectiveAllowlist(workspace_id);
  const auth = authorizeInteractiveCommand(command, args, allowlist);

  if (auth.status === 'blocked') {
    const fullCmd = args.length > 0 ? `${command} ${args.join(' ')}` : command;
    return {
      success: false,
      error: auth.reason ?? 'Command blocked by safety policy.',
      data: {
        session_id: '',
        pid: undefined,
        running: false,
        exit_code: null,
        stdout: '',
        stderr: '',
        truncated: false,
        authorization: 'blocked' as const,
        command: fullCmd,
        reason: auth.reason,
      },
    };
  }

  // Spawn the process (shared infrastructure)
  const spawnResult = await spawnAndTrackSession({ command, args, cwd, timeout });
  if (!spawnResult.success) {
    return { success: false, error: spawnResult.error };
  }

  return {
    success: true,
    data: {
      ...spawnResult.data!,
      authorization: auth.status,
      ...(auth.warning ? { warning: auth.warning } : {}),
    },
  };
}

/**
 * List all active terminal sessions (shared across memory_terminal
 * and memory_terminal_interactive).
 */
export async function handleListSessions(): Promise<ToolResponse<SessionListResult>> {
  const activeSessions = getActiveSessions();
  return {
    success: true,
    data: {
      sessions: activeSessions,
      count: activeSessions.length,
    },
  };
}

async function handleInProcessInteractiveExecute(
  request: InteractiveTerminalCanonicalRequest,
): Promise<{
  success: boolean;
  response?: CanonicalInteractiveResponse;
  error?: InteractiveTerminalCanonicalErrorResponse;
}> {
  const adapter: InteractiveRuntimeAdapter = createInProcessInteractiveAdapter(request);

  const orchestration = await orchestrateInteractiveLifecycle({
    request,
    adapter,
  });

  if (!orchestration.ok) {
    if (orchestration.error === 'declined') {
      return {
        success: false,
        error: {
          success: false,
          action: request.action,
          status: 'failed',
          correlation: request.correlation,
          resolved: {
            canonical_action: request.action,
            alias_applied: Boolean(request.compat?.legacy_action),
            legacy_action: request.compat?.legacy_action ?? null,
            mode: request.invocation.mode,
          },
          error: {
            code: 'PM_TERM_DECLINED',
            category: 'user_decision',
            message: orchestration.response?.reason ?? 'Interactive command was declined by user decision.',
            retriable: false,
          },
          fallback: {
            strategy: 'report_decline',
            next_action: 'execute',
            recommended_mode: 'interactive',
            user_message: 'The interactive command was declined.',
            can_auto_retry: false,
          },
        },
      };
    }

    if (orchestration.error === 'timeout') {
      return {
        success: false,
        error: {
          success: false,
          action: request.action,
          status: 'failed',
          correlation: request.correlation,
          resolved: {
            canonical_action: request.action,
            alias_applied: Boolean(request.compat?.legacy_action),
            legacy_action: request.compat?.legacy_action ?? null,
            mode: request.invocation.mode,
          },
          error: {
            code: 'PM_TERM_TIMEOUT',
            category: 'runtime_timeout',
            message: 'Interactive terminal request timed out while waiting for response.',
            retriable: true,
            details: { timeout_ms: request.runtime.timeout_ms },
          },
          fallback: {
            strategy: 'suggest_retry_headless_or_interactive',
            next_action: 'execute',
            recommended_mode: 'headless',
            user_message: 'The interactive path timed out. You can retry now or run in headless mode.',
            can_auto_retry: false,
          },
        },
      };
    }

    if (orchestration.error === 'disconnected') {
      return {
        success: false,
        error: {
          success: false,
          action: request.action,
          status: 'failed',
          correlation: request.correlation,
          resolved: {
            canonical_action: request.action,
            alias_applied: Boolean(request.compat?.legacy_action),
            legacy_action: request.compat?.legacy_action ?? null,
            mode: request.invocation.mode,
          },
          error: {
            code: 'PM_TERM_DISCONNECTED',
            category: 'transport',
            message: 'Interactive bridge disconnected before response was returned.',
            retriable: true,
          },
          fallback: {
            strategy: 'suggest_reconnect_retry',
            next_action: 'execute',
            recommended_mode: 'interactive',
            user_message: 'Connection dropped. Reconnect and retry the command.',
            can_auto_retry: false,
          },
        },
      };
    }

    if (orchestration.error === 'unavailable') {
      return {
        success: false,
        error: {
          success: false,
          action: request.action,
          status: 'failed',
          correlation: request.correlation,
          resolved: {
            canonical_action: request.action,
            alias_applied: Boolean(request.compat?.legacy_action),
            legacy_action: request.compat?.legacy_action ?? null,
            mode: request.invocation.mode,
          },
          error: {
            code: 'PM_TERM_GUI_UNAVAILABLE',
            category: 'runtime_unavailable',
            message: 'Interactive GUI is unavailable for this request.',
            retriable: true,
          },
          fallback: {
            strategy: 'fallback_to_headless_if_allowed',
            next_action: 'execute',
            recommended_mode: 'headless',
            user_message: 'Interactive GUI unavailable; try headless mode.',
            can_auto_retry: false,
          },
        },
      };
    }

    return {
      success: false,
      error: {
        success: false,
        action: request.action,
        status: 'failed',
        correlation: request.correlation,
        resolved: {
          canonical_action: request.action,
          alias_applied: Boolean(request.compat?.legacy_action),
          legacy_action: request.compat?.legacy_action ?? null,
          mode: request.invocation.mode,
        },
        error: {
          code: 'PM_TERM_INTERNAL',
          category: 'internal',
          message: 'Interactive orchestration failed with an internal error.',
          retriable: true,
        },
        fallback: {
          strategy: 'deterministic_internal_fallback',
          next_action: 'execute',
          user_message: 'Internal error occurred. Retry may succeed.',
          can_auto_retry: false,
        },
      },
    };
  }

  return {
    success: true,
    response: {
      success: true,
      action: request.action,
      status: 'completed',
      correlation: request.correlation,
      resolved: {
        canonical_action: request.action,
        alias_applied: Boolean(request.compat?.legacy_action),
        legacy_action: request.compat?.legacy_action ?? null,
        mode: request.invocation.mode,
      },
      identity: {
        session_id: orchestration.response?.session_id,
        terminal_id: orchestration.response?.terminal_id,
      },
      result: {
        authorization: orchestration.response?.authorization,
        warning: orchestration.response?.warning,
        stdout: orchestration.response?.stdout,
        stderr: orchestration.response?.stderr,
        exit_code: orchestration.response?.exit_code,
        running: orchestration.response?.running,
        lifecycle: orchestration.lifecycle.map((entry) => entry.stage),
      },
      error: null,
    },
  };
}

function createInProcessInteractiveAdapter(
  request: InteractiveTerminalCanonicalRequest,
): InteractiveRuntimeAdapter {
  let storedResponse: {
    session_id?: string;
    terminal_id?: string;
    stdout?: string;
    stderr?: string;
    exit_code?: number | null;
    running?: boolean;
    authorization?: 'allowed' | 'allowed_with_warning' | 'blocked';
    warning?: string;
    reason?: string;
  } | undefined;

  return {
    adapter_type: 'inprocess',
    async connect() {
      return {
        ok: true,
        runtime_session_id: `runtime_${request.correlation.request_id}`,
      };
    },

    async sendRequest() {
      if (request.invocation.intent === 'open_only') {
        storedResponse = {
          running: false,
          exit_code: 0,
          stdout: '',
          stderr: '',
          authorization: 'allowed',
        };
        return { ok: true };
      }

      const requestFrame = serializeCommandRequestToNdjson(request);
      const parsed = parseNdjsonMessage(requestFrame);
      if (!parsed || parsed.type !== 'command_request') {
        return { ok: false, error: 'internal' };
      }

      const runResult = await handleInteractiveTerminalRun({
        command: parsed.payload.command ?? '',
        args: parsed.payload.args,
        cwd: parsed.payload.cwd,
        timeout: parsed.payload.timeout_ms,
        workspace_id: request.runtime.workspace_id,
      });

      if (!runResult.success) {
        if (runResult.data?.authorization === 'blocked') {
          storedResponse = {
            reason: runResult.data.reason,
            authorization: 'blocked',
            running: false,
            exit_code: runResult.data.exit_code,
            stdout: runResult.data.stdout,
            stderr: runResult.data.stderr,
          };
          return { ok: true };
        }
        return { ok: false, error: 'internal' };
      }

      const responseFrame = {
        type: 'command_response' as const,
        trace_id: request.correlation.trace_id,
        request_id: request.correlation.request_id,
        payload: {
          decision: 'approved' as const,
          result: {
            session_id: runResult.data?.session_id,
            stdout: runResult.data?.stdout,
            stderr: runResult.data?.stderr,
            exit_code: runResult.data?.exit_code,
            running: runResult.data?.running,
            authorization: runResult.data?.authorization,
            warning: runResult.data?.warning,
          },
        },
      };
      const mapped = mapCommandResponseFromNdjson(responseFrame);
      if (!mapped) {
        return { ok: false, error: 'internal' };
      }

      storedResponse = {
        session_id: mapped.result.session_id,
        stdout: mapped.result.stdout,
        stderr: mapped.result.stderr,
        exit_code: mapped.result.exit_code,
        running: mapped.result.running,
        authorization: mapped.result.authorization,
        warning: mapped.result.warning,
      };

      return { ok: true };
    },

    async awaitResponse() {
      const heartbeat = serializeHeartbeatToNdjson(request.correlation);
      if (!heartbeat.includes('heartbeat')) {
        return { ok: false, error: 'internal' };
      }

      if (process.env.PM_INTERACTIVE_TERMINAL_FORCE_DISCONNECT === '1') {
        return { ok: false, error: 'disconnected' };
      }
      if (process.env.PM_INTERACTIVE_TERMINAL_FORCE_TIMEOUT === '1') {
        return { ok: false, error: 'timeout' };
      }
      if (process.env.PM_INTERACTIVE_TERMINAL_AUTO_DECLINE === '1') {
        return {
          ok: true,
          decision: 'declined',
          response: {
            reason: 'Interactive command declined by policy override.',
          },
        };
      }

      if (storedResponse?.authorization === 'blocked') {
        return {
          ok: true,
          decision: 'declined',
          response: {
            ...storedResponse,
            reason: storedResponse.reason ?? 'Blocked destructive command.',
          },
        };
      }

      return {
        ok: true,
        decision: 'approved',
        response: storedResponse,
      };
    },

    async recover() {
      return {
        ok: true,
        recovered: true,
      };
    },

    async close() {
      return;
    },
  };
}

export async function executeCanonicalInteractiveRequest(
  request: InteractiveTerminalCanonicalRequest,
  resolved: { alias_applied: boolean; legacy_action: 'run' | 'kill' | 'send' | 'close' | 'create' | 'list' | null },
): Promise<{ success: true; data: CanonicalInteractiveResponse } | { success: false; error: InteractiveTerminalCanonicalErrorResponse }> {
  if (request.action === 'list') {
    const listResult = await handleListSessions();
    if (!listResult.success) {
      return {
        success: false,
        error: {
          success: false,
          action: request.action,
          status: 'failed',
          correlation: request.correlation,
          resolved: {
            canonical_action: request.action,
            alias_applied: resolved.alias_applied,
            legacy_action: resolved.legacy_action,
            mode: request.invocation.mode,
          },
          error: {
            code: 'PM_TERM_INTERNAL',
            category: 'internal',
            message: listResult.error ?? 'Unable to list sessions.',
            retriable: true,
          },
          fallback: {
            strategy: 'deterministic_internal_fallback',
            next_action: 'list',
            user_message: 'Unable to list sessions. Retry may succeed.',
            can_auto_retry: false,
          },
        },
      };
    }

    return {
      success: true,
      data: {
        success: true,
        action: request.action,
        status: 'completed',
        correlation: request.correlation,
        resolved: {
          canonical_action: request.action,
          alias_applied: resolved.alias_applied,
          legacy_action: resolved.legacy_action,
          mode: request.invocation.mode,
        },
        identity: {},
        result: {
          items: listResult.data?.sessions as Array<Record<string, unknown>>,
        },
        error: null,
      },
    };
  }

  if (request.action === 'read_output') {
    const identity = request.target?.session_id ?? request.target?.terminal_id;
    if (!identity) {
      return {
        success: false,
        error: {
          success: false,
          action: request.action,
          status: 'failed',
          correlation: request.correlation,
          resolved: {
            canonical_action: request.action,
            alias_applied: resolved.alias_applied,
            legacy_action: resolved.legacy_action,
            mode: request.invocation.mode,
          },
          error: {
            code: 'PM_TERM_INVALID_PAYLOAD',
            category: 'validation',
            message: 'read_output requires a target identity.',
            retriable: false,
          },
          fallback: {
            strategy: 'reject_no_retry',
            next_action: 'read_output',
            user_message: 'Provide a session_id or terminal_id and retry.',
            can_auto_retry: false,
          },
        },
      };
    }

    const output = await handleReadOutput({ session_id: identity });
    if (!output.success) {
      return {
        success: false,
        error: {
          success: false,
          action: request.action,
          status: 'failed',
          correlation: request.correlation,
          resolved: {
            canonical_action: request.action,
            alias_applied: resolved.alias_applied,
            legacy_action: resolved.legacy_action,
            mode: request.invocation.mode,
          },
          error: {
            code: 'PM_TERM_NOT_FOUND',
            category: 'identity',
            message: output.error ?? 'Session not found.',
            retriable: false,
          },
          fallback: {
            strategy: 'refresh_list_then_retry',
            next_action: 'list',
            user_message: 'Session not found. Refresh list and retry.',
            can_auto_retry: false,
          },
        },
      };
    }

    return {
      success: true,
      data: {
        success: true,
        action: request.action,
        status: 'completed',
        correlation: request.correlation,
        resolved: {
          canonical_action: request.action,
          alias_applied: resolved.alias_applied,
          legacy_action: resolved.legacy_action,
          mode: request.invocation.mode,
        },
        identity: {
          session_id: output.data?.session_id,
        },
        result: {
          stdout: output.data?.stdout,
          stderr: output.data?.stderr,
          exit_code: output.data?.exit_code,
          running: output.data?.running,
        },
        error: null,
      },
    };
  }

  if (request.action === 'terminate') {
    const identity = request.target?.session_id ?? request.target?.terminal_id;
    if (!identity) {
      return {
        success: false,
        error: {
          success: false,
          action: request.action,
          status: 'failed',
          correlation: request.correlation,
          resolved: {
            canonical_action: request.action,
            alias_applied: resolved.alias_applied,
            legacy_action: resolved.legacy_action,
            mode: request.invocation.mode,
          },
          error: {
            code: 'PM_TERM_INVALID_PAYLOAD',
            category: 'validation',
            message: 'terminate requires a target identity.',
            retriable: false,
          },
          fallback: {
            strategy: 'reject_no_retry',
            next_action: 'terminate',
            user_message: 'Provide a session_id or terminal_id and retry.',
            can_auto_retry: false,
          },
        },
      };
    }

    const killed = await handleKill({ session_id: identity });
    if (!killed.success) {
      return {
        success: false,
        error: {
          success: false,
          action: request.action,
          status: 'failed',
          correlation: request.correlation,
          resolved: {
            canonical_action: request.action,
            alias_applied: resolved.alias_applied,
            legacy_action: resolved.legacy_action,
            mode: request.invocation.mode,
          },
          error: {
            code: 'PM_TERM_NOT_FOUND',
            category: 'identity',
            message: killed.error ?? 'Session not found.',
            retriable: false,
          },
          fallback: {
            strategy: 'refresh_list_then_retry',
            next_action: 'list',
            user_message: 'Session not found. Refresh list and retry.',
            can_auto_retry: false,
          },
        },
      };
    }

    return {
      success: true,
      data: {
        success: true,
        action: request.action,
        status: 'completed',
        correlation: request.correlation,
        resolved: {
          canonical_action: request.action,
          alias_applied: resolved.alias_applied,
          legacy_action: resolved.legacy_action,
          mode: request.invocation.mode,
        },
        identity: {
          session_id: killed.data?.session_id,
        },
        result: {
          running: false,
          stdout: killed.data?.message,
        },
        error: null,
      },
    };
  }

  if (request.invocation.mode === 'headless') {
    const run = await handleInteractiveTerminalRun({
      command: request.execution?.command ?? '',
      args: request.execution?.args,
      cwd: request.runtime.cwd,
      timeout: request.runtime.timeout_ms,
      workspace_id: request.runtime.workspace_id,
    });

    if (!run.success) {
      const blocked = run.data?.authorization === 'blocked';
      return {
        success: false,
        error: {
          success: false,
          action: request.action,
          status: 'failed',
          correlation: request.correlation,
          resolved: {
            canonical_action: request.action,
            alias_applied: resolved.alias_applied,
            legacy_action: resolved.legacy_action,
            mode: request.invocation.mode,
          },
          error: {
            code: blocked ? 'PM_TERM_BLOCKED_DESTRUCTIVE' : 'PM_TERM_INTERNAL',
            category: blocked ? 'authorization' : 'internal',
            message: run.error ?? 'Headless execute failed.',
            retriable: !blocked,
            details: blocked ? { reason: run.data?.reason } : undefined,
          },
          fallback: blocked
            ? {
                strategy: 'reject_with_safety_hint',
                next_action: 'execute',
                recommended_mode: 'interactive',
                user_message: 'Command blocked by safety policy.',
                can_auto_retry: false,
              }
            : {
                strategy: 'deterministic_internal_fallback',
                next_action: 'execute',
                user_message: 'Headless execution failed. Retry may succeed.',
                can_auto_retry: false,
              },
        },
      };
    }

    return {
      success: true,
      data: {
        success: true,
        action: request.action,
        status: 'completed',
        correlation: request.correlation,
        resolved: {
          canonical_action: request.action,
          alias_applied: resolved.alias_applied,
          legacy_action: resolved.legacy_action,
          mode: request.invocation.mode,
        },
        identity: {
          session_id: run.data?.session_id,
        },
        result: {
          authorization: run.data?.authorization,
          warning: run.data?.warning,
          stdout: run.data?.stdout,
          stderr: run.data?.stderr,
          exit_code: run.data?.exit_code,
          running: run.data?.running,
        },
        error: null,
      },
    };
  }

  const adapterMode = resolveRuntimeAdapterMode(request);
  if (request.action === 'execute' && adapterMode === 'container_bridge') {
    const preflight = await runContainerBridgePreflight();
    if (!preflight.ok) {
      const guidance = [
        'Verify PM_INTERACTIVE_TERMINAL_HOST_ALIAS / PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS resolve from container runtime.',
        'Verify PM_INTERACTIVE_TERMINAL_HOST_PORT matches the host GUI bridge listener.',
        'Start the host interactive-terminal bridge service before retrying.',
      ];

      if (preflight.type === 'invalid_config') {
        return {
          success: false,
          error: {
            success: false,
            action: request.action,
            status: 'failed',
            correlation: request.correlation,
            resolved: {
              canonical_action: request.action,
              alias_applied: resolved.alias_applied,
              legacy_action: resolved.legacy_action,
              mode: request.invocation.mode,
            },
            error: {
              code: 'PM_TERM_INVALID_MODE',
              category: 'validation',
              message: 'Container bridge preflight configuration is invalid.',
              retriable: false,
              details: {
                adapter_mode: adapterMode,
                ...preflight.details,
                guidance,
              },
            },
            fallback: {
              strategy: 'reject_no_retry',
              next_action: 'execute',
              recommended_mode: 'headless',
              user_message: 'Bridge configuration is invalid. Fix environment values before retrying.',
              can_auto_retry: false,
            },
          },
        };
      }

      return {
        success: false,
        error: {
          success: false,
          action: request.action,
          status: 'failed',
          correlation: request.correlation,
          resolved: {
            canonical_action: request.action,
            alias_applied: resolved.alias_applied,
            legacy_action: resolved.legacy_action,
            mode: request.invocation.mode,
          },
          error: {
            code: 'PM_TERM_GUI_UNAVAILABLE',
            category: 'runtime_unavailable',
            message: 'Container bridge preflight failed: host interactive-terminal endpoint is unreachable.',
            retriable: true,
            details: {
              adapter_mode: adapterMode,
              ...preflight.details,
              guidance,
            },
          },
          fallback: {
            strategy: 'fallback_to_headless_if_allowed',
            next_action: 'execute',
            recommended_mode: 'headless',
            user_message: 'Interactive bridge is unreachable. Retry after starting bridge service or run headless mode.',
            can_auto_retry: false,
          },
        },
      };
    }
  }

  const interactive = await handleInProcessInteractiveExecute(request);
  if (!interactive.success) {
    return {
      success: false,
      error: interactive.error!,
    };
  }

  return {
    success: true,
    data: interactive.response!,
  };
}

function resolveRuntimeAdapterMode(request: InteractiveTerminalCanonicalRequest): RuntimeAdapterMode {
  const override = request.runtime.adapter_override;
  if (override === 'local' || override === 'bundled' || override === 'container_bridge') {
    return override;
  }

  const envMode = process.env.PM_TERM_ADAPTER_MODE;
  if (envMode === 'local' || envMode === 'bundled' || envMode === 'container_bridge') {
    return envMode;
  }

  const runningInContainer = process.env.PM_RUNNING_IN_CONTAINER === 'true';
  return runningInContainer ? 'container_bridge' : 'local';
}

function parsePositiveIntEnv(name: string, fallback: number): { value: number; invalid?: string } {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) {
    return { value: fallback };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return { value: fallback, invalid: raw };
  }
  return { value: parsed };
}

async function runContainerBridgePreflight(): Promise<BridgePreflightResult> {
  const hostAlias = process.env.PM_INTERACTIVE_TERMINAL_HOST_ALIAS?.trim() || 'host.containers.internal';
  const fallbackAlias = process.env.PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS?.trim() || 'host.docker.internal';
  const port = parsePositiveIntEnv('PM_INTERACTIVE_TERMINAL_HOST_PORT', 45_459);
  const connectTimeout = parsePositiveIntEnv('PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS', 3_000);

  const invalidEntries: Array<{ variable: string; value: string }> = [];
  if (port.invalid) invalidEntries.push({ variable: 'PM_INTERACTIVE_TERMINAL_HOST_PORT', value: port.invalid });
  if (connectTimeout.invalid) invalidEntries.push({ variable: 'PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS', value: connectTimeout.invalid });

  if (invalidEntries.length > 0) {
    return {
      ok: false,
      type: 'invalid_config',
      details: {
        invalid_env: invalidEntries,
        defaults_applied: {
          PM_INTERACTIVE_TERMINAL_HOST_PORT: port.value,
          PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS: connectTimeout.value,
        },
      },
    };
  }

  const uniqueHosts = Array.from(new Set([hostAlias, fallbackAlias].filter((value) => value.length > 0)));
  const attempts: BridgeProbeAttempt[] = [];

  for (const host of uniqueHosts) {
    const result = await probeHostPort(host, port.value, connectTimeout.value);
    attempts.push(result);
    if (result.outcome === 'connected') {
      return { ok: true };
    }
  }

  return {
    ok: false,
    type: 'connectivity',
    details: {
      bridge_host_alias: hostAlias,
      bridge_fallback_alias: fallbackAlias,
      bridge_port: port.value,
      connect_timeout_ms: connectTimeout.value,
      attempts,
    },
  };
}

function probeHostPort(host: string, port: number, timeoutMs: number): Promise<BridgeProbeAttempt> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finalize = (attempt: BridgeProbeAttempt): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(attempt);
    };

    socket.setTimeout(timeoutMs);

    socket.once('connect', () => {
      finalize({ host, port, outcome: 'connected' });
    });

    socket.once('timeout', () => {
      finalize({ host, port, outcome: 'timeout', detail: `No connection within ${timeoutMs}ms` });
    });

    socket.once('error', (error: NodeJS.ErrnoException) => {
      finalize({
        host,
        port,
        outcome: 'unreachable',
        detail: `${error.code ?? 'ERR'}${error.message ? `: ${error.message}` : ''}`,
      });
    });

    socket.connect(port, host);
  });
}
