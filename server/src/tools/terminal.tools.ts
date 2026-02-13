/**
 * Terminal Tools — session management, command execution, and output buffering
 *
 * Authorization, allowlist management, and command classification are in
 * ./terminal-auth.ts to keep this module focused on process lifecycle.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { ToolResponse } from '../types/index.js';
import {
  authorizeCommand,
  ensureAllowlistLoaded,
  getAllowlist,
  updateAllowlist,
  type AllowlistResult,
} from './terminal-auth.js';

// Re-export AllowlistResult so downstream consumers don't need to change imports
export type { AllowlistResult } from './terminal-auth.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_OUTPUT_BYTES = 100 * 1024; // 100KB ring buffer cap
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // check every 5 min

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TerminalSession {
  id: string;
  command: string;
  args: string[];
  cwd: string;
  pid?: number;
  running: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Total bytes captured (may exceed ring buffer — we keep only the tail) */
  totalBytes: number;
  createdAt: number;
  updatedAt: number;
  process?: ChildProcess;
}

export interface TerminalRunResult {
  session_id: string;
  pid?: number;
  running: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  authorization: 'allowed' | 'blocked';
  command?: string;
  reason?: string;
  message?: string;
  allowlist_suggestion?: string;
}

export interface TerminalOutputResult {
  session_id: string;
  running: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

export interface TerminalKillResult {
  session_id: string;
  killed: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

const sessions = new Map<string, TerminalSession>();

// ---------------------------------------------------------------------------
// Ring-buffer append
// ---------------------------------------------------------------------------

function appendOutput(session: TerminalSession, stream: 'stdout' | 'stderr', chunk: string): void {
  session[stream] += chunk;
  session.totalBytes += Buffer.byteLength(chunk, 'utf-8');

  // Trim to ring-buffer cap (keep tail)
  if (Buffer.byteLength(session[stream], 'utf-8') > MAX_OUTPUT_BYTES) {
    const buf = Buffer.from(session[stream], 'utf-8');
    session[stream] = buf.subarray(buf.length - MAX_OUTPUT_BYTES).toString('utf-8');
  }

  session.updatedAt = Date.now();
}

// ---------------------------------------------------------------------------
// Stale session cleanup
// ---------------------------------------------------------------------------

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.updatedAt > SESSION_TTL_MS) {
        if (session.process && session.running) {
          try { session.process.kill(); } catch { /* ignore */ }
        }
        sessions.delete(id);
      }
    }
    if (sessions.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL_MS);
  // Don't keep Node alive just for cleanup
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

// ---------------------------------------------------------------------------
// Shared session infrastructure
// ---------------------------------------------------------------------------

export interface SpawnResult {
  session_id: string;
  pid?: number;
  running: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

/**
 * Spawn a child process, track it in the shared session store, and
 * return buffered output.  This is the core engine used by both
 * `memory_terminal` and `memory_terminal_interactive`.
 */
export async function spawnAndTrackSession(params: {
  command: string;
  args: string[];
  cwd?: string;
  timeout?: number;
}): Promise<ToolResponse<SpawnResult>> {
  const { command, args, cwd, timeout = DEFAULT_TIMEOUT_MS } = params;
  const sessionId = randomUUID();
  const workingDir = cwd || process.cwd();

  const session: TerminalSession = {
    id: sessionId,
    command,
    args,
    cwd: workingDir,
    running: true,
    exitCode: null,
    stdout: '',
    stderr: '',
    totalBytes: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  try {
    const isWindows = process.platform === 'win32';
    const child = spawn(command, args, {
      cwd: workingDir,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env },
      ...(isWindows ? {} : { detached: false }),
    });

    session.pid = child.pid;
    session.process = child;

    child.stdout?.on('data', (chunk: Buffer) => {
      appendOutput(session, 'stdout', chunk.toString('utf-8'));
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      appendOutput(session, 'stderr', chunk.toString('utf-8'));
    });

    // Wait for completion or timeout
    const exitPromise = new Promise<number | null>((resolve) => {
      child.on('close', (code) => {
        session.running = false;
        session.exitCode = code;
        session.updatedAt = Date.now();
        resolve(code);
      });
      child.on('error', (err) => {
        session.running = false;
        session.exitCode = -1;
        appendOutput(session, 'stderr', `Process error: ${err.message}\n`);
        resolve(-1);
      });
    });

    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), timeout);
    });

    const result = await Promise.race([exitPromise, timeoutPromise]);

    if (result === 'timeout' && session.running) {
      // Process is still running — leave it in the session map
      // The caller can read_output or kill later
    }

    sessions.set(sessionId, session);
    ensureCleanupTimer();

    const truncated = session.totalBytes > MAX_OUTPUT_BYTES;
    return {
      success: true,
      data: {
        session_id: sessionId,
        pid: session.pid,
        running: session.running,
        exit_code: session.exitCode,
        stdout: session.stdout,
        stderr: session.stderr,
        truncated,
      },
    };
  } catch (err) {
    sessions.set(sessionId, session);
    return {
      success: false,
      error: `Failed to spawn process: ${(err as Error).message}`,
    };
  }
}

/**
 * Return summary information for all active sessions.
 * Used by `memory_terminal_interactive` list action.
 */
export function getActiveSessions(): Array<{
  session_id: string;
  command: string;
  args: string[];
  cwd: string;
  pid?: number;
  running: boolean;
  exit_code: number | null;
  created_at: number;
}> {
  return Array.from(sessions.values()).map((s) => ({
    session_id: s.id,
    command: s.command,
    args: s.args,
    cwd: s.cwd,
    pid: s.pid,
    running: s.running,
    exit_code: s.exitCode,
    created_at: s.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleTerminalRun(params: {
  command: string;
  args?: string[];
  cwd?: string;
  timeout?: number;
  workspace_id?: string;
}): Promise<ToolResponse<TerminalRunResult>> {
  const { command, args = [], cwd, timeout = DEFAULT_TIMEOUT_MS, workspace_id } = params;

  // Ensure allowlist is loaded from disk before authorizing
  if (workspace_id) {
    await ensureAllowlistLoaded(workspace_id);
  }

  // Authorize
  const auth = authorizeCommand(command, args, workspace_id);
  if (auth.status === 'blocked') {
    const fullCmd = args.length > 0 ? `${command} ${args.join(' ')}` : command;
    return {
      success: false,
      error: auth.reason ?? 'Command blocked by safety policy.',
      data: {
        session_id: '',
        running: false,
        exit_code: null,
        stdout: '',
        stderr: '',
        truncated: false,
        authorization: 'blocked' as const,
        command: fullCmd,
        reason: auth.reason ?? 'Command blocked by safety policy.',
        allowlist_suggestion: `Add to allowlist: memory_terminal(action: "update_allowlist", patterns: ["${command}"], operation: "add")`,
      } as TerminalRunResult,
    };
  }

  // Delegate to shared spawn logic
  const spawnResult = await spawnAndTrackSession({ command, args, cwd, timeout });
  if (!spawnResult.success) {
    return { success: false, error: spawnResult.error };
  }

  return {
    success: true,
    data: {
      ...spawnResult.data!,
      authorization: 'allowed' as const,
    },
  };
}

export async function handleReadOutput(params: {
  session_id: string;
}): Promise<ToolResponse<TerminalOutputResult>> {
  const session = sessions.get(params.session_id);
  if (!session) {
    return {
      success: false,
      error: `Session not found: ${params.session_id}. It may have expired (sessions expire after 30 minutes).`,
    };
  }

  return {
    success: true,
    data: {
      session_id: session.id,
      running: session.running,
      exit_code: session.exitCode,
      stdout: session.stdout,
      stderr: session.stderr,
      truncated: session.totalBytes > MAX_OUTPUT_BYTES,
    },
  };
}

export async function handleKill(params: {
  session_id: string;
}): Promise<ToolResponse<TerminalKillResult>> {
  const session = sessions.get(params.session_id);
  if (!session) {
    return {
      success: false,
      error: `Session not found: ${params.session_id}.`,
    };
  }

  if (!session.running) {
    return {
      success: true,
      data: {
        session_id: session.id,
        killed: false,
        message: 'Process already exited.',
      },
    };
  }

  try {
    session.process?.kill('SIGTERM');
    // Give it a moment, then force kill
    setTimeout(() => {
      if (session.running) {
        try { session.process?.kill('SIGKILL'); } catch { /* ignore */ }
      }
    }, 3000);

    session.running = false;
    session.updatedAt = Date.now();

    return {
      success: true,
      data: {
        session_id: session.id,
        killed: true,
        message: 'SIGTERM sent to process.',
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to kill process: ${(err as Error).message}`,
    };
  }
}

export async function handleGetAllowlist(params: {
  workspace_id?: string;
}): Promise<ToolResponse<AllowlistResult>> {
  const result = await getAllowlist(params.workspace_id);
  return { success: true, data: result };
}

export async function handleUpdateAllowlist(params: {
  workspace_id?: string;
  patterns: string[];
  operation: 'add' | 'remove' | 'set';
}): Promise<ToolResponse<AllowlistResult>> {
  const result = await updateAllowlist(params);
  return { success: true, data: result };
}
