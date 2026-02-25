/**
 * Tests for memory_terminal GUI session routing (read_output / kill).
 *
 * These tests mock TcpTerminalAdapter to verify that:
 *   - read_output routes through TCP when guiSessions.has(session_id)
 *   - read_output falls back to local when session is NOT in guiSessions
 *   - kill routes through TCP for GUI sessions
 *   - TCP connection failure during read_output/kill returns proper errors
 *
 * Separated from memory-terminal.test.ts because these tests require
 * TcpTerminalAdapter to be fully mocked (vi.mock is hoisted and global),
 * while the original test file relies on the real adapter's connect failure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock TcpTerminalAdapter before importing the module under test.
// ---------------------------------------------------------------------------

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn();
const mockSendAndAwait = vi.fn();
const mockSendReadOutput = vi.fn();
const mockSendKill = vi.fn();

vi.mock('../../tools/terminal-tcp-adapter.js', () => ({
  TcpTerminalAdapter: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    close: mockClose,
    sendAndAwait: mockSendAndAwait,
    sendReadOutput: mockSendReadOutput,
    sendKill: mockSendKill,
  })),
}));

// Mock file-store to avoid disk operations
vi.mock('../../storage/db-store.js', () => ({
  getWorkspacePath: (wsId: string) => `/tmp/test-data/${wsId}`,
  getWorkspace: vi.fn().mockResolvedValue(null),
}));

// Mock node:fs/promises to avoid real disk I/O
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Mock terminal.tools.js so local fallback calls are captured
const mockHandleReadOutput = vi.fn().mockResolvedValue({
  success: true,
  data: { session_id: 'local-session', running: false, exit_code: 0, stdout: 'local output', stderr: '' },
});
const mockHandleKill = vi.fn().mockResolvedValue({
  success: true,
  data: { session_id: 'local-session', killed: true },
});

vi.mock('../../tools/terminal.tools.js', () => ({
  handleReadOutput: (...args: unknown[]) => mockHandleReadOutput(...args),
  handleKill: (...args: unknown[]) => mockHandleKill(...args),
  handleGetAllowlist: vi.fn().mockResolvedValue({ success: true, data: { patterns: [] } }),
  handleUpdateAllowlist: vi.fn().mockResolvedValue({ success: true }),
}));

import { memoryTerminal } from '../../tools/consolidated/memory_terminal.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulate a successful `run` action that populates guiSessions with the
 * given session ID. The mock adapter returns an approved CommandResponse.
 */
async function populateGuiSession(sessionId: string): Promise<void> {
  mockSendAndAwait.mockResolvedValueOnce({
    id: sessionId,
    status: 'approved',
    output: 'test output',
    exit_code: 0,
  });

  const result = await memoryTerminal({
    action: 'run',
    command: 'echo',
    args: ['test'],
  });

  // Sanity check — the run should succeed and register the session
  expect(result.success).toBe(true);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GUI session routing: read_output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockConnect to succeed by default
    mockConnect.mockResolvedValue(undefined);
  });

  it('routes read_output through TCP when session_id is in guiSessions', async () => {
    // First, populate guiSessions by running a command through the GUI
    await populateGuiSession('gui-sess-1');

    // Mock the TCP read output response
    mockSendReadOutput.mockResolvedValueOnce({
      id: 'ro-1',
      session_id: 'gui-sess-1',
      running: false,
      exit_code: 0,
      stdout: 'tcp output',
      stderr: 'tcp stderr',
      truncated: false,
    });

    // Call read_output for the GUI session
    const result = await memoryTerminal({
      action: 'read_output',
      session_id: 'gui-sess-1',
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      session_id: 'gui-sess-1',
      running: false,
      exit_code: 0,
      stdout: 'tcp output',
      stderr: 'tcp stderr',
      truncated: false,
    });

    // TCP adapter was used, not the local fallback
    expect(mockSendReadOutput).toHaveBeenCalledWith('gui-sess-1');
    expect(mockHandleReadOutput).not.toHaveBeenCalled();
  });

  it('falls back to local handleReadOutput when session_id is NOT in guiSessions', async () => {
    const result = await memoryTerminal({
      action: 'read_output',
      session_id: 'local-only-session',
    });

    expect(result.success).toBe(true);
    // The local handler was called
    expect(mockHandleReadOutput).toHaveBeenCalledWith({
      session_id: 'local-only-session',
    });
    // TCP adapter was NOT used
    expect(mockSendReadOutput).not.toHaveBeenCalled();
  });

  it('cleans up guiSessions when TCP response shows running=false', async () => {
    await populateGuiSession('gui-sess-cleanup');

    // First read_output returns running=false → session should be removed
    mockSendReadOutput.mockResolvedValueOnce({
      id: 'ro-clean',
      session_id: 'gui-sess-cleanup',
      running: false,
      exit_code: 0,
      stdout: 'done',
      stderr: '',
      truncated: false,
    });

    await memoryTerminal({
      action: 'read_output',
      session_id: 'gui-sess-cleanup',
    });

    // Now calling read_output again should fall back to local since the
    // session was removed from guiSessions
    const secondResult = await memoryTerminal({
      action: 'read_output',
      session_id: 'gui-sess-cleanup',
    });

    // This time local handler should be called (session no longer in guiSessions)
    expect(mockHandleReadOutput).toHaveBeenCalledWith({
      session_id: 'gui-sess-cleanup',
    });
  });

  it('returns error when TCP connection fails during read_output', async () => {
    await populateGuiSession('gui-sess-tcp-fail');

    // Make the next adapter.connect() fail
    mockConnect.mockRejectedValueOnce(new Error('TCP connect failed'));

    const result = await memoryTerminal({
      action: 'read_output',
      session_id: 'gui-sess-tcp-fail',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('read_output via GUI failed');
  });
});

describe('GUI session routing: kill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
  });

  it('routes kill through TCP for GUI sessions and returns success', async () => {
    await populateGuiSession('gui-sess-kill');

    mockSendKill.mockResolvedValueOnce({
      id: 'k-1',
      session_id: 'gui-sess-kill',
      killed: true,
      message: 'Kill signal sent',
    });

    const result = await memoryTerminal({
      action: 'kill',
      session_id: 'gui-sess-kill',
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      session_id: 'gui-sess-kill',
      killed: true,
      message: 'Kill signal sent',
    });

    // TCP adapter was used
    expect(mockSendKill).toHaveBeenCalledWith('gui-sess-kill');
    // Local fallback was NOT used
    expect(mockHandleKill).not.toHaveBeenCalled();
  });

  it('removes session from guiSessions after kill', async () => {
    await populateGuiSession('gui-sess-kill-cleanup');

    mockSendKill.mockResolvedValueOnce({
      id: 'k-2',
      session_id: 'gui-sess-kill-cleanup',
      killed: true,
      message: 'Killed',
    });

    await memoryTerminal({
      action: 'kill',
      session_id: 'gui-sess-kill-cleanup',
    });

    // After kill, the session should be removed from guiSessions.
    // Calling read_output should fall back to local.
    const readResult = await memoryTerminal({
      action: 'read_output',
      session_id: 'gui-sess-kill-cleanup',
    });

    expect(mockHandleReadOutput).toHaveBeenCalledWith({
      session_id: 'gui-sess-kill-cleanup',
    });
  });

  it('falls back to local handleKill when session_id is NOT in guiSessions', async () => {
    const result = await memoryTerminal({
      action: 'kill',
      session_id: 'local-only-kill',
    });

    // Local handler was called
    expect(mockHandleKill).toHaveBeenCalledWith({
      session_id: 'local-only-kill',
    });
    // TCP adapter was NOT used
    expect(mockSendKill).not.toHaveBeenCalled();
  });

  it('returns error when TCP connection fails during kill', async () => {
    await populateGuiSession('gui-sess-kill-fail');

    // Make the next adapter.connect() fail
    mockConnect.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await memoryTerminal({
      action: 'kill',
      session_id: 'gui-sess-kill-fail',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('kill via GUI failed');
  });

  it('returns failure when kill response indicates not killed', async () => {
    await populateGuiSession('gui-sess-kill-noop');

    mockSendKill.mockResolvedValueOnce({
      id: 'k-noop',
      session_id: 'gui-sess-kill-noop',
      killed: false,
      error: 'Process may have already exited',
    });

    const result = await memoryTerminal({
      action: 'kill',
      session_id: 'gui-sess-kill-noop',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Process may have already exited');
  });
});
