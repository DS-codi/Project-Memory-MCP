/**
 * Tool Logger - Logs tool invocations with DB-backed plan logs.
 * 
 * Logs are stored in SQLite context_items as session records:
 * - plan scope:      parent_type='plan', parent_id={plan_id}, type='tool_log_session:{session_id}'
 * - runtime scope:   parent_type='workspace', parent_id={workspace_id|global_runtime}, type='runtime_log_session:{session_id}'
 * 
 * Retention policy: keep only the 3 most recent session records per scope.
 * 
 * Each log entry contains:
 * - Timestamp (ISO format)
 * - Tool name
 * - Agent type (if known)
 * - Parameters (sanitized)
 * - Result status (success/error)
 */

import { AsyncLocalStorage } from 'async_hooks';
import type { AgentType } from '../types/index.js';
import { deleteContext as dbDeleteContext, getContext as dbGetContext, storeContext as dbStoreContext } from '../db/context-db.js';
import type { ContextParentType, ContextItemRow } from '../db/types.js';

// =============================================================================
// Configuration
// =============================================================================

const SESSION_LOG_MAX_LINES = 2000;
const SESSION_RETENTION_COUNT = 3;
const GLOBAL_RUNTIME_PARENT_ID = 'global_runtime';

// =============================================================================
// Types
// =============================================================================

export interface LogEntry {
  timestamp: string;
  tool: string;
  agent?: AgentType | string;
  workspace_id?: string;
  plan_id?: string;
  params: Record<string, unknown>;
  result: 'success' | 'error';
  error_message?: string;
  duration_ms?: number;
  session_id?: string;
}

// Track current agent per plan (set during initialise_agent)
const currentAgentByPlan: Map<string, AgentType> = new Map();
const toolContextStorage = new AsyncLocalStorage<{ tool: string; params: Record<string, unknown> }>();

type LogScope =
  | { parentType: 'plan'; parentId: string; typePrefix: 'tool_log_session' }
  | { parentType: 'workspace'; parentId: string; typePrefix: 'runtime_log_session' };

function normalizeSessionId(input?: string): string {
  const fallback = 'session-unknown';
  const value = (input ?? '').trim();
  if (!value) return fallback;
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getLogScope(entry: LogEntry): LogScope {
  if (entry.plan_id) {
    return {
      parentType: 'plan',
      parentId: entry.plan_id,
      typePrefix: 'tool_log_session',
    };
  }

  return {
    parentType: 'workspace',
    parentId: entry.workspace_id || GLOBAL_RUNTIME_PARENT_ID,
    typePrefix: 'runtime_log_session',
  };
}

function sessionLogType(scope: LogScope, sessionId: string): string {
  return `${scope.typePrefix}:${sessionId}`;
}

function isSessionType(rowType: string, prefix: LogScope['typePrefix']): boolean {
  return rowType.startsWith(`${prefix}:`);
}

// =============================================================================
// Agent Tracking
// =============================================================================

/**
 * Set the current agent for a plan (called during initialise_agent)
 */
export function setCurrentAgent(planId: string, agent: AgentType): void {
  currentAgentByPlan.set(planId, agent);
}

/**
 * Get the current agent for a plan
 */
export function getCurrentAgent(planId: string): AgentType | undefined {
  return currentAgentByPlan.get(planId);
}

/**
 * Clear the current agent for a plan (called during complete_agent or handoff)
 */
export function clearCurrentAgent(planId: string): void {
  currentAgentByPlan.delete(planId);
}

/**
 * Run a function with tool context so downstream calls can access tool metadata.
 */
export async function runWithToolContext<T>(
  tool: string,
  params: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  return toolContextStorage.run({ tool, params }, fn);
}

/**
 * Get the current tool execution context (if any).
 */
export function getToolContext(): { tool: string; params: Record<string, unknown> } | undefined {
  return toolContextStorage.getStore();
}

// =============================================================================
// Logging Functions
// =============================================================================

/**
 * Format a log entry as a single line
 */
function formatLogEntry(entry: LogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.result.toUpperCase()}]`,
    `[${entry.agent || 'unknown'}]`,
    `${entry.tool}`
  ];
  
  // Add duration if available
  if (entry.duration_ms !== undefined) {
    parts.push(`(${entry.duration_ms}ms)`);
  }
  
  // Add sanitized params summary (exclude large objects)
  const paramsSummary = summarizeParams(entry.params);
  if (paramsSummary) {
    parts.push(`- ${paramsSummary}`);
  }
  
  // Add error message if present
  if (entry.error_message) {
    parts.push(`| Error: ${entry.error_message}`);
  }
  
  return parts.join(' ');
}

/**
 * Create a summary of parameters (excluding sensitive/large data)
 */
function summarizeParams(params: Record<string, unknown>): string {
  const summary: string[] = [];
  
  for (const [key, value] of Object.entries(params)) {
    // Skip context objects (too large)
    if (key === 'context' || key === 'data') {
      summary.push(`${key}={...}`);
      continue;
    }
    
    // Skip undefined/null
    if (value === undefined || value === null) {
      continue;
    }
    
    // Truncate long strings
    if (typeof value === 'string') {
      const truncated = value.length > 50 ? value.substring(0, 50) + '...' : value;
      summary.push(`${key}="${truncated}"`);
    } else if (Array.isArray(value)) {
      summary.push(`${key}=[${value.length} items]`);
    } else if (typeof value === 'object') {
      summary.push(`${key}={...}`);
    } else {
      summary.push(`${key}=${value}`);
    }
  }
  
  return summary.join(', ');
}

/**
 * Write a log entry to the appropriate log file
 */
async function writeLogEntry(entry: LogEntry): Promise<void> {
  const line = formatLogEntry(entry);
  
  try {
    const scope = getLogScope(entry);
    const sessionId = normalizeSessionId(entry.session_id);
    const logType = sessionLogType(scope, sessionId);

    const rows = dbGetContext(scope.parentType as ContextParentType, scope.parentId, logType);
    const existing = rows[0]
      ? (() => {
          try {
            return JSON.parse(rows[0].data) as {
              session_id: string;
              scope: string;
              workspace_id?: string;
              plan_id?: string;
              first_logged_at?: string;
              last_logged_at?: string;
              lines?: string[];
            };
          } catch {
            return {
              session_id: sessionId,
              scope: scope.typePrefix,
              lines: [] as string[],
            };
          }
        })()
      : {
          session_id: sessionId,
          scope: scope.typePrefix,
          lines: [] as string[],
        };

    const nowIso = new Date().toISOString();
    const nextLines = [...(existing.lines || []), line].slice(-SESSION_LOG_MAX_LINES);

    dbStoreContext(scope.parentType as ContextParentType, scope.parentId, logType, {
      session_id: sessionId,
      scope: scope.typePrefix,
      workspace_id: entry.workspace_id,
      plan_id: entry.plan_id,
      first_logged_at: existing.first_logged_at || nowIso,
      last_logged_at: nowIso,
      lines: nextLines,
    });

    const allRows = dbGetContext(scope.parentType as ContextParentType, scope.parentId)
      .filter(row => isSessionType(row.type, scope.typePrefix));

    const staleCount = Math.max(0, allRows.length - SESSION_RETENTION_COUNT);
    if (staleCount > 0) {
      const oldestRows = allRows
        .map(row => {
          let lastLoggedAt = row.updated_at || row.created_at || '';
          try {
            const parsed = JSON.parse(row.data) as { last_logged_at?: string };
            if (parsed.last_logged_at) {
              lastLoggedAt = parsed.last_logged_at;
            }
          } catch {
            // keep fallback timestamp values
          }

          return { row, lastLoggedAt };
        })
        .sort((a, b) => {
          const byLastLogged = a.lastLoggedAt.localeCompare(b.lastLoggedAt);
          if (byLastLogged !== 0) return byLastLogged;

          const aCreated = a.row.created_at || '';
          const bCreated = b.row.created_at || '';
          const byCreated = aCreated.localeCompare(bCreated);
          if (byCreated !== 0) return byCreated;

          return a.row.id.localeCompare(b.row.id);
        })
        .slice(0, staleCount)
        .map(item => item.row);

      for (const stale of oldestRows) {
        dbDeleteContext(stale.id);
      }
    }
    
  } catch (error) {
    // Don't throw on logging errors - just log to console
    console.error('Failed to write log entry:', error);
  }
}

/**
 * Log a tool invocation
 * Call this at the start and end of each tool execution
 */
export async function logToolCall(
  tool: string,
  params: Record<string, unknown>,
  result: 'success' | 'error',
  errorMessage?: string,
  durationMs?: number
): Promise<void> {
  // Extract workspace_id and plan_id from params if available
  const workspaceId = params.workspace_id as string | undefined;
  const planId = params.plan_id as string | undefined;
  
  // Get current agent for this plan
  const agent = planId ? getCurrentAgent(planId) : undefined;
  
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    tool,
    agent: agent || (params.agent_type as string | undefined),
    workspace_id: workspaceId,
    plan_id: planId,
    session_id: params._session_id as string | undefined,
    params,
    result,
    error_message: errorMessage,
    duration_ms: durationMs
  };
  
  await writeLogEntry(entry);
}

/**
 * Create a logging wrapper for tool execution
 * This wraps a tool function and automatically logs start/end
 */
export function withLogging<T extends Record<string, unknown>, R>(
  toolName: string,
  fn: (params: T) => Promise<{ success: boolean; error?: string; data?: R }>
): (params: T) => Promise<{ success: boolean; error?: string; data?: R }> {
  return async (params: T) => {
    const startTime = Date.now();
    
    try {
      const result = await fn(params);
      const durationMs = Date.now() - startTime;
      
      await logToolCall(
        toolName,
        params as Record<string, unknown>,
        result.success ? 'success' : 'error',
        result.error,
        durationMs
      );
      
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = (error as Error).message;
      
      await logToolCall(
        toolName,
        params as Record<string, unknown>,
        'error',
        errorMessage,
        durationMs
      );
      
      throw error;
    }
  };
}
