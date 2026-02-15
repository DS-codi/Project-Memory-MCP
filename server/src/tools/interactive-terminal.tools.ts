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
import { readFile } from 'node:fs/promises';
import {
  isDestructiveCommand,
  hasShellOperators,
  ensureAllowlistLoaded,
  getEffectiveAllowlist,
  authorizeCommand,
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
  type InteractiveTerminalAdapter,
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

type RuntimeAdapterMode = 'local' | 'container_bridge';

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

function decodeLinuxRouteHexIp(hex: string): string | undefined {
  const normalized = hex.trim();
  if (!/^[0-9A-Fa-f]{8}$/.test(normalized)) return undefined;
  const octets: number[] = [];
  for (let index = 0; index < 8; index += 2) {
    const value = Number.parseInt(normalized.slice(index, index + 2), 16);
    if (!Number.isFinite(value) || value < 0 || value > 255) return undefined;
    octets.unshift(value);
  }
  return octets.join('.');
}

async function detectContainerGatewayHost(): Promise<string | undefined> {
  if (process.env.PM_RUNNING_IN_CONTAINER !== 'true') {
    return undefined;
  }

  const explicitGateway = process.env.PM_INTERACTIVE_TERMINAL_HOST_GATEWAY?.trim();
  if (explicitGateway && explicitGateway.length > 0) {
    return explicitGateway;
  }

  try {
    const routeTable = await readFile('/proc/net/route', 'utf-8');
    const lines = routeTable.split(/\r?\n/).slice(1);
    for (const line of lines) {
      const columns = line.trim().split(/\s+/);
      if (columns.length < 3) continue;
      const destination = columns[1];
      const gatewayHex = columns[2];
      if (destination !== '00000000') continue;
      const decoded = decodeLinuxRouteHexIp(gatewayHex);
      if (decoded) {
        return decoded;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function normalizeExecutionForPlatform(command: string, args: string[] | undefined): {
  command: string;
  args: string[];
} {
  const resolvedArgs = Array.isArray(args) ? args : [];

  if (process.platform !== 'win32') {
    return { command, args: resolvedArgs };
  }

  const normalizedCommand = command.trim().toLowerCase();
  const isPosixShell = normalizedCommand === '/bin/sh' || normalizedCommand === 'sh';
  if (!isPosixShell) {
    return { command, args: resolvedArgs };
  }

  const comspec = process.env.ComSpec?.trim() || 'cmd.exe';
  const shellIndex = resolvedArgs.findIndex((value) => value === '-c' || value === '-lc');
  const shellPayload =
    shellIndex >= 0 && shellIndex < resolvedArgs.length - 1
      ? resolvedArgs.slice(shellIndex + 1).join(' ')
      : resolvedArgs.join(' ');

  return {
    command: comspec,
    args: ['/d', '/s', '/c', shellPayload],
  };
}

// ---------------------------------------------------------------------------
// Relaxed authorization
// ---------------------------------------------------------------------------

interface InteractiveAuthResult {
  status: 'allowed' | 'allowed_with_warning' | 'blocked';
  warning?: string;
  reason?: string;
  allowlisted: boolean;
  approval_required: boolean;
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
      allowlisted: false,
      approval_required: false,
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
      allowlisted: onAllowlist,
      approval_required: !onAllowlist,
    };
  }

  return { status: 'allowed', allowlisted: true, approval_required: false };
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

async function handleHeadlessTerminalRun(params: {
  command: string;
  args?: string[];
  cwd?: string;
  timeout?: number;
  workspace_id?: string;
}): Promise<ToolResponse<InteractiveTerminalRunResult>> {
  const { command, args = [], cwd, timeout, workspace_id } = params;

  if (workspace_id) {
    await ensureAllowlistLoaded(workspace_id);
  }

  const auth = authorizeCommand(command, args, workspace_id);
  if (auth.status === 'blocked') {
    const fullCmd = args.length > 0 ? `${command} ${args.join(' ')}` : command;
    return {
      success: false,
      error: auth.reason ?? 'Command blocked by strict headless policy.',
      data: {
        session_id: '',
        pid: undefined,
        running: false,
        exit_code: null,
        stdout: '',
        stderr: '',
        truncated: false,
        authorization: 'blocked',
        command: fullCmd,
        reason: auth.reason,
      },
    };
  }

  const spawnResult = await spawnAndTrackSession({ command, args, cwd, timeout });
  if (!spawnResult.success) {
    return { success: false, error: spawnResult.error };
  }

  return {
    success: true,
    data: {
      ...spawnResult.data!,
      authorization: 'allowed',
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
  adapter: InteractiveTerminalAdapter,
): Promise<{
  success: boolean;
  response?: CanonicalInteractiveResponse;
  error?: InteractiveTerminalCanonicalErrorResponse;
}> {
  const allowlist = await getEffectiveAllowlist(request.runtime.workspace_id);
  const auth = authorizeInteractiveCommand(
    request.execution?.command ?? '',
    request.execution?.args ?? [],
    allowlist,
  );
  const runtimeAdapter: InteractiveRuntimeAdapter = createInProcessInteractiveAdapter(request, {
    adapter,
    approval_required: auth.approval_required,
    allowlisted: auth.allowlisted,
  });

  const orchestration = await orchestrateInteractiveLifecycle({
    request,
    adapter: runtimeAdapter,
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
  metadata: {
    adapter: InteractiveTerminalAdapter;
    approval_required: boolean;
    allowlisted: boolean;
  },
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
    adapter?: InteractiveTerminalAdapter;
    approval_required?: boolean;
    approved_by?: 'allowlist' | 'user';
    visibility_applied?: 'visible' | 'headless';
    attached_to_existing?: boolean;
  } | undefined;

  const targetIdentity = request.target?.session_id ?? request.target?.terminal_id;
  const existingDefaultSession = getActiveSessions()[0]?.session_id;
  const attachedSessionId = targetIdentity ?? existingDefaultSession;
  const attachedToExisting = Boolean(attachedSessionId);

  return {
    adapter_type: metadata.adapter === 'container_bridge_to_host' ? 'container_bridge' : 'local',
    async connect() {
      return {
        ok: true,
        runtime_session_id: `runtime_${request.correlation.request_id}`,
      };
    },

    async sendRequest() {
      if (request.invocation.intent === 'open_only') {
        storedResponse = {
          session_id: attachedSessionId,
          terminal_id: attachedSessionId,
          running: false,
          exit_code: 0,
          stdout: '',
          stderr: '',
          authorization: 'allowed',
          adapter: metadata.adapter,
          approval_required: false,
          approved_by: 'allowlist',
          visibility_applied: 'visible',
          attached_to_existing: attachedToExisting,
        };
        return { ok: true };
      }

      const requestFrame = serializeCommandRequestToNdjson(request, {
        adapter: metadata.adapter,
        visibility: 'visible',
        approval_required: metadata.approval_required,
        allowlisted: metadata.allowlisted,
      });
      const parsed = parseNdjsonMessage(requestFrame);
      if (!parsed || parsed.type !== 'command_request') {
        return { ok: false, error: 'internal' };
      }

      const runResult = await handleInteractiveTerminalRun({
        ...normalizeExecutionForPlatform(parsed.payload.command ?? '', parsed.payload.args),
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
            adapter: metadata.adapter,
            approval_required: metadata.approval_required,
            approved_by: metadata.approval_required ? ('user' as const) : ('allowlist' as const),
            visibility_applied: 'visible' as const,
            attached_to_existing: attachedToExisting,
          },
        },
      };
      const mapped = mapCommandResponseFromNdjson(responseFrame);
      if (!mapped) {
        return { ok: false, error: 'internal' };
      }

      storedResponse = {
        session_id: attachedSessionId ?? mapped.result.session_id,
        terminal_id: attachedSessionId ?? mapped.result.terminal_id,
        stdout: mapped.result.stdout,
        stderr: mapped.result.stderr,
        exit_code: mapped.result.exit_code,
        running: mapped.result.running,
        authorization: mapped.result.authorization,
        warning: mapped.result.warning,
        adapter: mapped.result.adapter,
        approval_required: mapped.result.approval_required,
        approved_by: mapped.result.approved_by,
        visibility_applied: mapped.result.visibility_applied,
        attached_to_existing: mapped.result.attached_to_existing,
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
    const normalizedExecution = normalizeExecutionForPlatform(
      request.execution?.command ?? '',
      request.execution?.args,
    );

    const run = await handleHeadlessTerminalRun({
      command: normalizedExecution.command,
      args: normalizedExecution.args,
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
            strategy: 'reject_no_retry',
            next_action: 'execute',
            recommended_mode: 'interactive',
            user_message: 'Interactive bridge is unreachable. Start host bridge service before retrying.',
            can_auto_retry: false,
          },
        },
      };
    }
  }

  const interactive = await handleInProcessInteractiveExecute(
    request,
    adapterMode === 'container_bridge' ? 'container_bridge_to_host' : 'host_bridge_local',
  );
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
  if (override === 'container_bridge') {
    return 'container_bridge';
  }

  if (override === 'local' || override === 'bundled') {
    return 'local';
  }

  if (override === 'auto') {
    return process.env.PM_RUNNING_IN_CONTAINER === 'true' ? 'container_bridge' : 'local';
  }

  const envMode = process.env.PM_TERM_ADAPTER_MODE;
  if (envMode === 'container_bridge') {
    return 'container_bridge';
  }

  if (envMode === 'local' || envMode === 'bundled') {
    return 'local';
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
  const gatewayHost = await detectContainerGatewayHost();
  const additionalAliases = (process.env.PM_INTERACTIVE_TERMINAL_HOST_ALIASES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
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

  const uniqueHosts = Array.from(
    new Set(
      [hostAlias, fallbackAlias, gatewayHost, ...additionalAliases].filter(
        (value): value is string => Boolean(value && value.length > 0),
      ),
    ),
  );
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
      bridge_gateway_host: gatewayHost,
      bridge_candidate_hosts: uniqueHosts,
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
