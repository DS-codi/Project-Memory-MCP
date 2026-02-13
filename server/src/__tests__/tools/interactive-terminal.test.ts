import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleInteractiveTerminalRun,
  handleListSessions,
} from '../../tools/interactive-terminal.tools.js';

// Mock file-store so disk operations don't touch real filesystem
vi.mock('../../storage/file-store.js', () => ({
  getWorkspacePath: (wsId: string) => `/tmp/test-data/${wsId}`,
  getWorkspace: vi.fn().mockResolvedValue(null),
}));

// Mock node:fs/promises to avoid real disk I/O
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Mock child_process.spawn to avoid executing real commands
vi.mock('node:child_process', () => {
  const { EventEmitter } = require('node:events');
  const { Readable } = require('node:stream');

  return {
    spawn: vi.fn((_cmd: string, _args: string[], _opts: unknown) => {
      const child = new EventEmitter();
      child.pid = 12345;
      child.stdout = new Readable({ read() {} });
      child.stderr = new Readable({ read() {} });
      child.kill = vi.fn();

      // Simulate successful completion after a tick
      process.nextTick(() => {
        child.stdout.push('mock output\n');
        child.stdout.push(null);
        child.stderr.push(null);
        child.emit('close', 0);
      });

      return child;
    }),
  };
});

// ---------------------------------------------------------------------------
// handleInteractiveTerminalRun
// ---------------------------------------------------------------------------

describe('handleInteractiveTerminalRun', () => {
  it('allows an allowlisted command without warning', async () => {
    const result = await handleInteractiveTerminalRun({
      command: 'git',
      args: ['status'],
    });

    expect(result.success).toBe(true);
    expect(result.data?.authorization).toBe('allowed');
    expect(result.data?.warning).toBeUndefined();
    expect(result.data?.session_id).toBeTruthy();
  });

  it('allows a non-allowlisted command with a warning', async () => {
    const result = await handleInteractiveTerminalRun({
      command: 'some-random-tool',
      args: ['--flag'],
    });

    expect(result.success).toBe(true);
    expect(result.data?.authorization).toBe('allowed_with_warning');
    expect(result.data?.warning).toContain('not on the allowlist');
    expect(result.data?.session_id).toBeTruthy();
  });

  it('allows shell operators with a warning (NOT blocked like memory_terminal)', async () => {
    const result = await handleInteractiveTerminalRun({
      command: 'echo',
      args: ['hello', '|', 'cat'],
    });

    expect(result.success).toBe(true);
    expect(result.data?.authorization).toBe('allowed_with_warning');
    expect(result.data?.warning).toContain('shell operators');
    expect(result.data?.session_id).toBeTruthy();
  });

  it('blocks destructive commands', async () => {
    const result = await handleInteractiveTerminalRun({
      command: 'rm',
      args: ['-rf', '/'],
    });

    expect(result.success).toBe(false);
    expect(result.data?.authorization).toBe('blocked');
    expect(result.data?.reason).toContain('destructive');
  });

  it('blocks Remove-Item as destructive', async () => {
    const result = await handleInteractiveTerminalRun({
      command: 'Remove-Item',
      args: ['file.txt'],
    });

    expect(result.success).toBe(false);
    expect(result.data?.authorization).toBe('blocked');
  });

  it('blocks shutdown as destructive', async () => {
    const result = await handleInteractiveTerminalRun({
      command: 'shutdown',
      args: ['/s'],
    });

    expect(result.success).toBe(false);
    expect(result.data?.authorization).toBe('blocked');
  });

  it('shows both warnings when non-allowlisted AND has shell operators', async () => {
    const result = await handleInteractiveTerminalRun({
      command: 'some-tool',
      args: ['data', '|', 'other-tool'],
    });

    expect(result.success).toBe(true);
    expect(result.data?.authorization).toBe('allowed_with_warning');
    expect(result.data?.warning).toContain('not on the allowlist');
    expect(result.data?.warning).toContain('shell operators');
  });

  it('returns session_id and output for successful commands', async () => {
    const result = await handleInteractiveTerminalRun({
      command: 'echo',
      args: ['hello'],
    });

    expect(result.success).toBe(true);
    expect(result.data?.session_id).toBeTruthy();
    expect(result.data?.pid).toBe(12345);
    expect(result.data?.running).toBe(false);
    expect(result.data?.exit_code).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// handleListSessions
// ---------------------------------------------------------------------------

describe('handleListSessions', () => {
  it('returns a list of sessions', async () => {
    // First run a command to populate the session store
    await handleInteractiveTerminalRun({
      command: 'echo',
      args: ['test-list'],
    });

    const result = await handleListSessions();

    expect(result.success).toBe(true);
    expect(result.data?.sessions).toBeDefined();
    expect(Array.isArray(result.data?.sessions)).toBe(true);
    expect(result.data!.count).toBeGreaterThanOrEqual(1);

    // Verify session structure
    const session = result.data!.sessions[0];
    expect(session).toHaveProperty('session_id');
    expect(session).toHaveProperty('command');
    expect(session).toHaveProperty('running');
    expect(session).toHaveProperty('created_at');
  });
});

// ---------------------------------------------------------------------------
// Consolidated router (memoryTerminalInteractive)
// ---------------------------------------------------------------------------

describe('memoryTerminalInteractive (consolidated router)', () => {
  // Import the consolidated router
  let memoryTerminalInteractive: typeof import('../../tools/consolidated/memory_terminal_interactive.js').memoryTerminalInteractive;

  beforeEach(async () => {
    const mod = await import('../../tools/consolidated/memory_terminal_interactive.js');
    memoryTerminalInteractive = mod.memoryTerminalInteractive;
  });

  it('returns error when action is missing', async () => {
    const result = await memoryTerminalInteractive({} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('action is required');
  });

  it('returns error for run without command', async () => {
    const result = await memoryTerminalInteractive({ action: 'run' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('command is required');
  });

  it('returns error for read_output without session_id', async () => {
    const result = await memoryTerminalInteractive({ action: 'read_output' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('session_id is required');
  });

  it('returns error for kill without session_id', async () => {
    const result = await memoryTerminalInteractive({ action: 'kill' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('session_id is required');
  });

  it('returns error for unknown action', async () => {
    const result = await memoryTerminalInteractive({ action: 'nonexistent' as any });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('run action routes to interactive handler', async () => {
    const result = await memoryTerminalInteractive({
      action: 'run',
      command: 'echo',
      args: ['router-test'],
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('action', 'run');
  });

  it('list action returns sessions', async () => {
    const result = await memoryTerminalInteractive({ action: 'list' });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('action', 'list');
  });

  it('read_output with valid session_id returns output', async () => {
    // First create a session
    const runResult = await memoryTerminalInteractive({
      action: 'run',
      command: 'echo',
      args: ['read-test'],
    });

    const sessionId = (runResult.data as any)?.data?.session_id;
    expect(sessionId).toBeTruthy();

    const result = await memoryTerminalInteractive({
      action: 'read_output',
      session_id: sessionId,
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('action', 'read_output');
  });

  it('kill with valid session_id succeeds', async () => {
    // First create a session
    const runResult = await memoryTerminalInteractive({
      action: 'run',
      command: 'echo',
      args: ['kill-test'],
    });

    const sessionId = (runResult.data as any)?.data?.session_id;
    expect(sessionId).toBeTruthy();

    const result = await memoryTerminalInteractive({
      action: 'kill',
      session_id: sessionId,
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('action', 'kill');
  });
});
