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
  executeCanonicalInteractiveRequest,
  type CanonicalInteractiveResponse,
} from '../interactive-terminal.tools.js';
import {
  type InteractiveTerminalCanonicalErrorResponse,
  parseInteractiveTerminalRequest,
} from '../interactive-terminal-contract.js';

export type InteractiveTerminalAction =
  | 'execute'
  | 'read_output'
  | 'terminate'
  | 'list'
  | 'run'
  | 'kill'
  | 'send'
  | 'close'
  | 'create';

export interface MemoryTerminalInteractiveParams {
  action: InteractiveTerminalAction;

  // Legacy and canonical execution fields
  command?: string;
  args?: string[];
  cwd?: string;
  timeout?: number;
  timeout_ms?: number;
  workspace_id?: string;
  env?: Record<string, string>;
  invocation?: {
    mode?: 'interactive' | 'headless';
    intent?: 'open_only' | 'execute_command';
  };
  correlation?: {
    request_id?: string;
    trace_id?: string;
    client_request_id?: string;
  };
  runtime?: {
    workspace_id?: string;
    cwd?: string;
    timeout_ms?: number;
    adapter_override?: 'local' | 'bundled' | 'container_bridge' | 'auto';
  };
  execution?: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  };
  target?: {
    session_id?: string;
    terminal_id?: string;
  };
  compat?: {
    legacy_action?: 'run' | 'kill' | 'send' | 'close' | 'create' | 'list';
    caller_surface?: 'server' | 'extension' | 'dashboard' | 'chat_button';
  };

  // Legacy short target fields
  session_id?: string;
  terminal_id?: string;
}

type InteractiveTerminalResult = CanonicalInteractiveResponse | InteractiveTerminalCanonicalErrorResponse;

export async function memoryTerminalInteractive(
  params: MemoryTerminalInteractiveParams,
): Promise<ToolResponse<InteractiveTerminalResult>> {
  const parsed = parseInteractiveTerminalRequest(params);
  if (!parsed.ok) {
    return {
      success: false,
      error: parsed.response.error.message,
      data: parsed.response,
    };
  }

  const execution = await executeCanonicalInteractiveRequest(parsed.request, parsed.resolved);
  if (!execution.success) {
    return {
      success: false,
      error: execution.error.error.message,
      data: execution.error,
    };
  }

  return {
    success: true,
    data: execution.data,
  };
}
