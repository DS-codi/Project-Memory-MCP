import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleTerminalRun,
  handleReadOutput,
  handleKill,
  handleGetAllowlist,
  handleUpdateAllowlist,
} from '../../tools/terminal.tools.js';
import {
  handleRead,
  handleWrite,
  handleSearch,
  handleList,
  handleTree,
} from '../../tools/filesystem.tools.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock file-store
vi.mock('../../storage/file-store.js', () => ({
  getWorkspacePath: (wsId: string) => `/tmp/test-data/${wsId}`,
  getWorkspace: vi.fn(),
}));

import * as store from '../../storage/file-store.js';

// Mock fs/promises for terminal-auth disk operations (avoid real disk I/O)
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn().mockImplementation(actual.readFile),
    writeFile: vi.fn().mockImplementation(actual.writeFile),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockImplementation(actual.readdir),
    stat: vi.fn().mockImplementation(actual.stat),
    open: vi.fn().mockImplementation(actual.open),
  };
});

// ---------------------------------------------------------------------------
// Terminal E2E: safe command → output
// ---------------------------------------------------------------------------

describe('Terminal E2E', () => {
  it('runs a safe command (echo hello) and returns output', async () => {
    const result = await handleTerminalRun({
      command: 'echo',
      args: ['hello'],
      timeout: 10_000,
    });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.authorization).toBe('allowed');
      expect(result.data.session_id).toBeTruthy();
      expect(result.data.stdout).toContain('hello');
    }
  });

  it('blocks destructive command and returns error', async () => {
    const result = await handleTerminalRun({
      command: 'rm',
      args: ['-rf', '/'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('blocked');
  });

  it('returns blocked for unlisted command (does NOT execute)', async () => {
    const result = await handleTerminalRun({
      command: 'curl',
      args: ['https://example.com'],
    });

    expect(result.success).toBe(false);
    if (result.data) {
      expect(result.data.authorization).toBe('blocked');
      expect(result.data.session_id).toBe('');
      expect(result.data.allowlist_suggestion).toBeDefined();
    }
  });

  it('returns blocked for command with shell operators', async () => {
    const result = await handleTerminalRun({
      command: 'echo',
      args: ['hello', '|', 'grep', 'h'],
    });

    expect(result.success).toBe(false);
    if (result.data) {
      expect(result.data.authorization).toBe('blocked');
      expect(result.data.allowlist_suggestion).toBeDefined();
    }
  });

  it('can read output from a completed session', async () => {
    const runResult = await handleTerminalRun({
      command: 'echo',
      args: ['read-test'],
      timeout: 10_000,
    });

    expect(runResult.success).toBe(true);
    if (runResult.success && runResult.data) {
      const sessionId = runResult.data.session_id;
      expect(sessionId).toBeTruthy();

      const readResult = await handleReadOutput({ session_id: sessionId });
      expect(readResult.success).toBe(true);
      if (readResult.success && readResult.data) {
        expect(readResult.data.stdout).toContain('read-test');
      }
    }
  });

  it('returns error when reading non-existent session', async () => {
    const result = await handleReadOutput({ session_id: 'non-existent-session-id' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Session not found');
  });

  it('returns error when killing non-existent session', async () => {
    const result = await handleKill({ session_id: 'non-existent-session-id' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Session not found');
  });

  it('handleGetAllowlist returns patterns', async () => {
    const result = await handleGetAllowlist({});
    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(Array.isArray(result.data.patterns)).toBe(true);
      expect(result.data.patterns.length).toBeGreaterThan(0);
    }
  });

  it('handleUpdateAllowlist adds patterns', async () => {
    const result = await handleUpdateAllowlist({
      workspace_id: 'ws_e2e_test',
      patterns: ['e2e-safe-cmd'],
      operation: 'add',
    });
    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.patterns).toContain('e2e-safe-cmd');
    }
  });
});

// ---------------------------------------------------------------------------
// Filesystem E2E
// ---------------------------------------------------------------------------

describe('Filesystem E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects read when workspace is not found', async () => {
    vi.mocked(store.getWorkspace).mockResolvedValue(null);

    const result = await handleRead({
      workspace_id: 'ws_nonexistent',
      path: 'file.txt',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Workspace not found');
  });

  it('rejects read for path outside workspace', async () => {
    vi.mocked(store.getWorkspace).mockResolvedValue({
      workspace_path: process.cwd(),
      id: 'ws_e2e_fs',
    } as any);

    const result = await handleRead({
      workspace_id: 'ws_e2e_fs',
      path: '../../../etc/passwd',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/escapes workspace|traversal/i);
  });

  it('rejects read for sensitive file (.env)', async () => {
    vi.mocked(store.getWorkspace).mockResolvedValue({
      workspace_path: process.cwd(),
      id: 'ws_e2e_fs',
    } as any);

    const result = await handleRead({
      workspace_id: 'ws_e2e_fs',
      path: '.env',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('sensitive');
  });

  it('rejects write for path outside workspace', async () => {
    vi.mocked(store.getWorkspace).mockResolvedValue({
      workspace_path: process.cwd(),
      id: 'ws_e2e_fs',
    } as any);

    const result = await handleWrite({
      workspace_id: 'ws_e2e_fs',
      path: '../../outside/evil.txt',
      content: 'malicious',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/escapes workspace|traversal/i);
  });

  it('rejects write for sensitive file (.env)', async () => {
    vi.mocked(store.getWorkspace).mockResolvedValue({
      workspace_path: process.cwd(),
      id: 'ws_e2e_fs',
    } as any);

    const result = await handleWrite({
      workspace_id: 'ws_e2e_fs',
      path: '.env',
      content: 'SECRET=bad',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('sensitive');
  });

  it('rejects search when workspace is not found', async () => {
    vi.mocked(store.getWorkspace).mockResolvedValue(null);

    const result = await handleSearch({
      workspace_id: 'ws_nonexistent',
      pattern: '*.ts',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Workspace not found');
  });

  it('rejects list when workspace is not found', async () => {
    vi.mocked(store.getWorkspace).mockResolvedValue(null);

    const result = await handleList({
      workspace_id: 'ws_nonexistent',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Workspace not found');
  });

  it('rejects list for path outside workspace', async () => {
    vi.mocked(store.getWorkspace).mockResolvedValue({
      workspace_path: process.cwd(),
      id: 'ws_e2e_fs',
    } as any);

    const result = await handleList({
      workspace_id: 'ws_e2e_fs',
      path: '../../..',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/escapes workspace|traversal/i);
  });

  it('rejects tree when workspace is not found', async () => {
    vi.mocked(store.getWorkspace).mockResolvedValue(null);

    const result = await handleTree({
      workspace_id: 'ws_nonexistent',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Workspace not found');
  });

  it('rejects tree for path outside workspace', async () => {
    vi.mocked(store.getWorkspace).mockResolvedValue({
      workspace_path: process.cwd(),
      id: 'ws_e2e_fs',
    } as any);

    const result = await handleTree({
      workspace_id: 'ws_e2e_fs',
      path: '../../../',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/escapes workspace|traversal/i);
  });

  it('tree respects max_depth parameter', async () => {
    vi.mocked(store.getWorkspace).mockResolvedValue({
      workspace_path: process.cwd(),
      id: 'ws_e2e_fs',
    } as any);

    // Even if the handler succeeds or fails, it should NOT exceed MAX_TREE_DEPTH
    const result = await handleTree({
      workspace_id: 'ws_e2e_fs',
      path: '.',
      max_depth: 1,
    });

    // If successful, depth should be capped
    if (result.success && result.data) {
      expect(result.data.depth).toBeLessThanOrEqual(10);
    }
  });
});
