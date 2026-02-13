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
import {
  isDestructiveCommand,
  hasShellOperators,
  ensureAllowlistLoaded,
  getEffectiveAllowlist,
} from './terminal-auth.js';
import {
  spawnAndTrackSession,
  getActiveSessions,
  type SpawnResult,
} from './terminal.tools.js';

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
