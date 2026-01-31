/**
 * Tool Logger - Logs all tool invocations to plan-specific daily log files
 * 
 * Log files are stored at:
 * data/{workspace_id}/plans/{plan_id}/logs/{YYYY-MM-DD}.log
 * 
 * Each log entry contains:
 * - Timestamp (ISO format)
 * - Tool name
 * - Agent type (if known)
 * - Parameters (sanitized)
 * - Result status (success/error)
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { AgentType } from '../types/index.js';

// =============================================================================
// Configuration
// =============================================================================

const DATA_ROOT = process.env.MBS_DATA_ROOT || path.join(process.cwd(), '..', 'data');

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
}

// Track current agent per plan (set during initialise_agent)
const currentAgentByPlan: Map<string, AgentType> = new Map();

// =============================================================================
// Path Helpers
// =============================================================================

function getLogsPath(workspaceId: string, planId: string): string {
  return path.join(DATA_ROOT, workspaceId, 'plans', planId, 'logs');
}

function getLogFilePath(workspaceId: string, planId: string, date: Date): string {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(getLogsPath(workspaceId, planId), `${dateStr}.log`);
}

function getGlobalLogPath(): string {
  return path.join(DATA_ROOT, 'logs');
}

function getGlobalLogFilePath(date: Date): string {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(getGlobalLogPath(), `${dateStr}.log`);
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

// =============================================================================
// Logging Functions
// =============================================================================

/**
 * Ensure a directory exists
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

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
  const now = new Date();
  const line = formatLogEntry(entry) + '\n';
  
  try {
    // If we have workspace and plan, write to plan-specific log
    if (entry.workspace_id && entry.plan_id) {
      const logDir = getLogsPath(entry.workspace_id, entry.plan_id);
      await ensureDir(logDir);
      
      const logFile = getLogFilePath(entry.workspace_id, entry.plan_id, now);
      await fs.appendFile(logFile, line, 'utf-8');
    }
    
    // Always write to global log as well
    const globalLogDir = getGlobalLogPath();
    await ensureDir(globalLogDir);
    
    const globalLogFile = getGlobalLogFilePath(now);
    const globalLine = entry.workspace_id && entry.plan_id 
      ? `[${entry.workspace_id}/${entry.plan_id}] ${line}`
      : `[global] ${line}`;
    await fs.appendFile(globalLogFile, globalLine, 'utf-8');
    
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
