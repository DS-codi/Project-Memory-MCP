/**
 * Consolidated Terminal Tool — memory_terminal
 *
 * Simplified flat API with 5 actions:
 *   - run           — execute a command (with three-way authorization + GUI approval)
 *   - read_output   — get output from a session
 *   - kill          — terminate a session
 *   - get_allowlist — view the allowlist
 *   - update_allowlist — manage allowlist patterns
 *
 * Created in Phase 2 (MCP Tool Surface) — replaces memory_terminal_interactive.
 * All legacy aliases, nested envelopes, and compat metadata removed.
 */

import type { ToolResponse } from '../../types/index.js';
import {
  handleReadOutput,
  handleKill,
  handleGetAllowlist,
  handleUpdateAllowlist,
} from '../terminal.tools.js';
import {
  isDestructiveCommand,
  hasShellOperators,
  getEffectiveAllowlist,
  ensureAllowlistLoaded,
} from '../terminal-auth.js';
import type { CommandRequest, CommandResponse } from '../terminal-ipc-protocol.js';
import { TcpTerminalAdapter } from '../terminal-tcp-adapter.js';

// =========================================================================
// Public Types
// =========================================================================

export type MemoryTerminalAction =
  | 'run'
  | 'read_output'
  | 'kill'
  | 'get_allowlist'
  | 'update_allowlist';

export interface MemoryTerminalParams {
  action: MemoryTerminalAction;
  /** Command to execute (for run). */
  command?: string;
  /** Command arguments (for run). */
  args?: string[];
  /** Working directory (for run). */
  cwd?: string;
  /** Execution timeout in milliseconds (for run). */
  timeout_ms?: number;
  /** Workspace ID. */
  workspace_id?: string;
  /** Session ID (for read_output, kill). */
  session_id?: string;
  /** Allowlist patterns (for update_allowlist). */
  patterns?: string[];
  /** How to modify the allowlist (for update_allowlist). */
  operation?: 'add' | 'remove' | 'set';
}

/**
 * Extra parameter provided by the MCP SDK — contains sendNotification
 * (for progress notifications) and signal (AbortSignal for cancellation).
 *
 * We use `any` for the notification parameter to stay compatible with the
 * SDK's strongly-typed ServerNotification without importing SDK internals.
 */
export interface McpToolExtra {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendNotification?: (notification: any) => Promise<void> | void;
  signal?: AbortSignal;
}

// =========================================================================
// Three-Way Authorization (Step 15)
// =========================================================================

export type TerminalAuthDecision =
  | { decision: 'blocked'; reason: string }
  | { decision: 'allowed' }
  | { decision: 'needs_approval' };

/**
 * Classify a command into one of three categories:
 *   - blocked       — destructive or contains shell operators → reject immediately
 *   - allowed       — on the allowlist → auto-execute
 *   - needs_approval — not destructive, not on allowlist → GUI shows approval dialog
 *
 * Unlike authorizeCommand() in terminal-auth.ts (which returns 'blocked' for
 * both destructive AND non-allowlisted), this provides the third
 * 'needs_approval' bucket needed for the GUI approval flow.
 */
export async function classifyCommand(
  command: string,
  args: string[],
  workspaceId?: string,
): Promise<TerminalAuthDecision> {
  const fullCommand =
    args.length > 0 ? `${command} ${args.join(' ')}` : command;

  // 1. Destructive → blocked
  const destructive = isDestructiveCommand(fullCommand);
  if (destructive.match) {
    return {
      decision: 'blocked',
      reason: `Destructive command: "${destructive.keyword}"`,
    };
  }

  // 2. Shell operators → blocked
  if (hasShellOperators(fullCommand)) {
    return {
      decision: 'blocked',
      reason: 'Shell operators not allowed',
    };
  }

  // 3. Check allowlist (async — loads from disk on first access)
  const allowlist = await getEffectiveAllowlist(workspaceId);
  const lower = fullCommand.toLowerCase();
  for (const pattern of allowlist) {
    if (
      fullCommand.startsWith(pattern) ||
      lower.startsWith(pattern.toLowerCase())
    ) {
      return { decision: 'allowed' };
    }
  }

  // 4. Not on allowlist, not destructive → needs approval from GUI
  return { decision: 'needs_approval' };
}

// =========================================================================
// Progress Heartbeat (Step 14)
// =========================================================================

let heartbeatInterval: ReturnType<typeof setInterval> | undefined;

function startHeartbeat(extra?: McpToolExtra): void {
  if (!extra?.sendNotification) return;

  heartbeatInterval = setInterval(() => {
    try {
      extra.sendNotification!({
        method: 'notifications/progress',
        params: {
          progressToken: `terminal-${Date.now()}`,
          progress: 0,
          total: 0,
          message: 'Waiting for terminal command response...',
        },
      });
    } catch {
      // Silently ignore if notification channel is closed
    }
  }, 10_000); // Every 10 seconds
}

function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = undefined;
  }
}

// =========================================================================
// Response Mapping
// =========================================================================

/**
 * Map a CommandResponse from the GUI to a ToolResponse.
 *   - approved → success with execution data
 *   - declined → failure with user decision
 *   - timeout  → failure with timeout message
 */
function mapCommandResponseToToolResponse(
  response: CommandResponse,
): ToolResponse {
  switch (response.status) {
    case 'approved':
      return {
        success: true,
        data: {
          session_id: response.id,
          stdout: response.output ?? '',
          stderr: '',
          exit_code: response.exit_code ?? null,
          output_file_path: response.output_file_path,
        },
      };
    case 'declined':
      return {
        success: false,
        error: response.reason ?? 'Command declined by user',
      };
    case 'timeout':
      return {
        success: false,
        error: response.reason ?? 'Command timed out waiting for response',
      };
    default:
      return {
        success: false,
        error: `Unknown response status: ${(response as CommandResponse).status}`,
      };
  }
}

// =========================================================================
// Action Handlers
// =========================================================================

async function handleRun(
  params: MemoryTerminalParams,
  extra?: McpToolExtra,
): Promise<ToolResponse> {
  if (!params.command) {
    return { success: false, error: 'command is required for action: run' };
  }

  const command = params.command;
  const args = params.args ?? [];

  // Ensure allowlist is loaded from disk before classification
  if (params.workspace_id) {
    await ensureAllowlistLoaded(params.workspace_id);
  }

  // Three-way authorization
  const auth = await classifyCommand(command, args, params.workspace_id);

  if (auth.decision === 'blocked') {
    return {
      success: false,
      error: `Command blocked: ${auth.reason}`,
    };
  }

  // Build CommandRequest for the TCP wire protocol
  const request: CommandRequest = {
    type: 'command_request',
    id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    command,
    working_directory: params.cwd ?? process.cwd(),
    args: args.length > 0 ? args : undefined,
    workspace_id: params.workspace_id,
    session_id: params.session_id,
    timeout_seconds: params.timeout_ms
      ? Math.ceil(params.timeout_ms / 1000)
      : undefined,
    allowlisted: auth.decision === 'allowed',
  };

  // Create a fresh TCP adapter for this request.
  // Forward heartbeats from the GUI as MCP progress notifications.
  const adapter = new TcpTerminalAdapter({
    progressCallback: (heartbeat) => {
      if (extra?.sendNotification) {
        try {
          extra.sendNotification({
            method: 'notifications/progress',
            params: {
              progressToken: `terminal-hb-${heartbeat.id}`,
              progress: 0,
              total: 0,
              message: `GUI heartbeat at ${heartbeat.timestamp_ms}`,
            },
          });
        } catch {
          // Silently ignore if notification channel is closed
        }
      }
    },
  });

  // Start heartbeat to prevent MCP client timeout while waiting for GUI
  startHeartbeat(extra);

  // Clean up TCP connection on abort signal
  if (extra?.signal) {
    extra.signal.addEventListener(
      'abort',
      () => {
        stopHeartbeat();
        adapter.close();
      },
      { once: true },
    );
  }

  try {
    await adapter.connect();

    const response: CommandResponse = await adapter.sendAndAwait(request);

    stopHeartbeat();
    adapter.close();

    return mapCommandResponseToToolResponse(response);
  } catch (err) {
    stopHeartbeat();
    adapter.close();
    return {
      success: false,
      error: `Terminal run error: ${(err as Error).message}`,
    };
  }
}

async function handleReadOutputAction(
  params: MemoryTerminalParams,
): Promise<ToolResponse> {
  if (!params.session_id) {
    return {
      success: false,
      error: 'session_id is required for action: read_output',
    };
  }
  return handleReadOutput({ session_id: params.session_id });
}

async function handleKillAction(
  params: MemoryTerminalParams,
): Promise<ToolResponse> {
  if (!params.session_id) {
    return {
      success: false,
      error: 'session_id is required for action: kill',
    };
  }
  return handleKill({ session_id: params.session_id });
}

async function handleGetAllowlistAction(
  params: MemoryTerminalParams,
): Promise<ToolResponse> {
  return handleGetAllowlist({ workspace_id: params.workspace_id });
}

async function handleUpdateAllowlistAction(
  params: MemoryTerminalParams,
): Promise<ToolResponse> {
  if (!params.patterns || !params.operation) {
    return {
      success: false,
      error: 'patterns and operation are required for action: update_allowlist',
    };
  }
  return handleUpdateAllowlist({
    workspace_id: params.workspace_id,
    patterns: params.patterns,
    operation: params.operation,
  });
}

// =========================================================================
// Main Entry Point
// =========================================================================

/**
 * Consolidated memory_terminal tool handler.
 *
 * @param params  Flat params — action determines which fields are required
 * @param extra   MCP SDK extra — sendNotification for heartbeat, signal for abort
 */
export async function memoryTerminal(
  params: MemoryTerminalParams,
  extra?: McpToolExtra,
): Promise<ToolResponse> {
  switch (params.action) {
    case 'run':
      return handleRun(params, extra);
    case 'read_output':
      return handleReadOutputAction(params);
    case 'kill':
      return handleKillAction(params);
    case 'get_allowlist':
      return handleGetAllowlistAction(params);
    case 'update_allowlist':
      return handleUpdateAllowlistAction(params);
    default:
      return {
        success: false,
        error: `Unknown action: "${(params as { action: string }).action}". Valid actions: run, read_output, kill, get_allowlist, update_allowlist`,
      };
  }
}
