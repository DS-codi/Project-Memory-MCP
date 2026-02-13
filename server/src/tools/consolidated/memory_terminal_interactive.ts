/**
 * Consolidated Interactive Terminal Tool — memory_terminal_interactive
 *
 * Actions: run, read_output, kill, list
 *
 * Relaxed authorization: destructive commands are blocked, everything
 * else is allowed (with warnings for non-allowlisted or shell-operator
 * commands).  Shares session store with memory_terminal.
 */

import type { ToolResponse } from '../../types/index.js';
import {
  handleInteractiveTerminalRun,
  handleListSessions,
  type InteractiveTerminalRunResult,
  type SessionListResult,
} from '../interactive-terminal.tools.js';
import {
  handleReadOutput,
  handleKill,
  type TerminalOutputResult,
  type TerminalKillResult,
} from '../terminal.tools.js';

export type InteractiveTerminalAction = 'run' | 'read_output' | 'kill' | 'list';

export interface MemoryTerminalInteractiveParams {
  action: InteractiveTerminalAction;

  // For run
  command?: string;
  args?: string[];
  cwd?: string;
  timeout?: number;       // ms, default 30000
  workspace_id?: string;

  // For read_output, kill
  session_id?: string;
}

type InteractiveTerminalResult =
  | { action: 'run'; data: InteractiveTerminalRunResult }
  | { action: 'read_output'; data: TerminalOutputResult }
  | { action: 'kill'; data: TerminalKillResult }
  | { action: 'list'; data: SessionListResult };

export async function memoryTerminalInteractive(
  params: MemoryTerminalInteractiveParams,
): Promise<ToolResponse<InteractiveTerminalResult>> {
  const { action } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: run, read_output, kill, list',
    };
  }

  switch (action) {
    case 'run': {
      if (!params.command) {
        return { success: false, error: 'command is required for action: run' };
      }
      const result = await handleInteractiveTerminalRun({
        command: params.command,
        args: params.args,
        cwd: params.cwd,
        timeout: params.timeout,
        workspace_id: params.workspace_id,
      });
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: { action: 'run', data: result.data! } };
    }

    case 'read_output': {
      if (!params.session_id) {
        return { success: false, error: 'session_id is required for action: read_output' };
      }
      const result = await handleReadOutput({ session_id: params.session_id });
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: { action: 'read_output', data: result.data! } };
    }

    case 'kill': {
      if (!params.session_id) {
        return { success: false, error: 'session_id is required for action: kill' };
      }
      const result = await handleKill({ session_id: params.session_id });
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: { action: 'kill', data: result.data! } };
    }

    case 'list': {
      const result = await handleListSessions();
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: { action: 'list', data: result.data! } };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: run, read_output, kill, list`,
      };
  }
}
