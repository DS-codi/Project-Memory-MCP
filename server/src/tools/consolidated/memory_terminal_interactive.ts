/**
 * Consolidated Interactive Terminal Tool — memory_terminal_interactive
 *
 * Canonical actions: execute, read_output, terminate, list
 * Legacy aliases accepted: run, kill, send, close, create
 * Unified headless policy actions: get_allowlist, update_allowlist
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
  handleGetAllowlist,
  handleUpdateAllowlist,
  type AllowlistResult,
} from '../terminal.tools.js';
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
  | 'create'
  | 'get_allowlist'
  | 'update_allowlist';

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

  // Unified allowlist-management fields
  patterns?: string[];
  operation?: 'add' | 'remove' | 'set';
}

type UnifiedAllowlistAction = 'get_allowlist' | 'update_allowlist';

interface UnifiedAllowlistResponse {
  success: true;
  action: UnifiedAllowlistAction;
  status: 'completed';
  correlation: {
    request_id: string;
    trace_id: string;
    client_request_id?: string;
  };
  resolved: {
    canonical_action: 'execute';
    alias_applied: false;
    legacy_action: null;
    mode: 'headless';
  };
  identity: {};
  result: AllowlistResult;
  error: null;
}

type InteractiveTerminalResult = CanonicalInteractiveResponse | InteractiveTerminalCanonicalErrorResponse | UnifiedAllowlistResponse;

function buildAllowlistCorrelation() {
  const now = Date.now();
  return {
    request_id: `req_allowlist_${now}`,
    trace_id: `trace_allowlist_${now}`,
  };
}

export async function memoryTerminalInteractive(
  params: MemoryTerminalInteractiveParams,
): Promise<ToolResponse<InteractiveTerminalResult>> {
  if (params.action === 'get_allowlist') {
    const workspaceId = params.runtime?.workspace_id ?? params.workspace_id;
    const result = await handleGetAllowlist({ workspace_id: workspaceId });
    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      data: {
        success: true,
        action: 'get_allowlist',
        status: 'completed',
        correlation: buildAllowlistCorrelation(),
        resolved: {
          canonical_action: 'execute',
          alias_applied: false,
          legacy_action: null,
          mode: 'headless',
        },
        identity: {},
        result: result.data!,
        error: null,
      },
    };
  }

  if (params.action === 'update_allowlist') {
    if (!params.patterns || !params.operation) {
      return {
        success: false,
        error: 'patterns and operation are required for action: update_allowlist',
      };
    }

    const workspaceId = params.runtime?.workspace_id ?? params.workspace_id;

    const result = await handleUpdateAllowlist({
      workspace_id: workspaceId,
      patterns: params.patterns,
      operation: params.operation,
    });
    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      data: {
        success: true,
        action: 'update_allowlist',
        status: 'completed',
        correlation: buildAllowlistCorrelation(),
        resolved: {
          canonical_action: 'execute',
          alias_applied: false,
          legacy_action: null,
          mode: 'headless',
        },
        identity: {},
        result: result.data!,
        error: null,
      },
    };
  }

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
      error: `${execution.error.error.code}: ${execution.error.error.message}`,
      data: execution.error,
    };
  }

  return {
    success: true,
    data: execution.data,
  };
}
