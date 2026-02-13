/**
 * Consolidated Terminal Tool - memory_terminal
 * 
 * Actions: run, read_output, kill, get_allowlist, update_allowlist
 * Provides safe command execution with session management and authorization.
 */

import type { ToolResponse } from '../../types/index.js';
import {
  handleTerminalRun,
  handleReadOutput,
  handleKill,
  handleGetAllowlist,
  handleUpdateAllowlist,
  type TerminalRunResult,
  type TerminalOutputResult,
  type TerminalKillResult,
  type AllowlistResult,
} from '../terminal.tools.js';

export type TerminalAction = 'run' | 'read_output' | 'kill' | 'get_allowlist' | 'update_allowlist';

export interface MemoryTerminalParams {
  action: TerminalAction;

  // For run
  command?: string;
  args?: string[];
  cwd?: string;
  timeout?: number;       // ms, default 30000
  workspace_id?: string;

  // For read_output, kill
  session_id?: string;

  // For update_allowlist
  patterns?: string[];     // patterns to add or set
  operation?: 'add' | 'remove' | 'set';  // how to modify allowlist
}

type TerminalResult =
  | { action: 'run'; data: TerminalRunResult }
  | { action: 'read_output'; data: TerminalOutputResult }
  | { action: 'kill'; data: TerminalKillResult }
  | { action: 'get_allowlist'; data: AllowlistResult }
  | { action: 'update_allowlist'; data: AllowlistResult };

export async function memoryTerminal(params: MemoryTerminalParams): Promise<ToolResponse<TerminalResult>> {
  const { action } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: run, read_output, kill, get_allowlist, update_allowlist',
    };
  }

  switch (action) {
    case 'run': {
      if (!params.command) {
        return { success: false, error: 'command is required for action: run' };
      }
      const result = await handleTerminalRun({
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

    case 'get_allowlist': {
      const result = await handleGetAllowlist({
        workspace_id: params.workspace_id,
      });
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: { action: 'get_allowlist', data: result.data! } };
    }

    case 'update_allowlist': {
      if (!params.patterns || !params.operation) {
        return {
          success: false,
          error: 'patterns and operation are required for action: update_allowlist',
        };
      }
      const result = await handleUpdateAllowlist({
        workspace_id: params.workspace_id,
        patterns: params.patterns,
        operation: params.operation,
      });
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: { action: 'update_allowlist', data: result.data! } };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: run, read_output, kill, get_allowlist, update_allowlist`,
      };
  }
}
