import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  authorizeCommand,
  isDestructiveCommand,
  hasShellOperators,
  getEffectiveAllowlist,
  getAllowlist,
  updateAllowlist,
  DEFAULT_ALLOWLIST,
} from '../../tools/terminal-auth.js';

// Mock file-store so disk operations do not touch real filesystem
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

// ---------------------------------------------------------------------------
// authorizeCommand
// ---------------------------------------------------------------------------

describe('authorizeCommand', () => {
  it('returns "allowed" for allowlisted commands (git status)', () => {
    const result = authorizeCommand('git', ['status']);
    expect(result.status).toBe('allowed');
  });

  it('returns "allowed" for allowlisted command (npm test)', () => {
    const result = authorizeCommand('npm', ['test']);
    expect(result.status).toBe('allowed');
  });

  it('returns "allowed" for allowlisted command (echo)', () => {
    const result = authorizeCommand('echo', ['hello']);
    expect(result.status).toBe('allowed');
  });

  it('returns "allowed" for allowlisted command (npx tsc)', () => {
    const result = authorizeCommand('npx', ['tsc', '--noEmit']);
    expect(result.status).toBe('allowed');
  });

  it('returns "allowed" for allowlisted command (npx vitest)', () => {
    const result = authorizeCommand('npx', ['vitest']);
    expect(result.status).toBe('allowed');
  });

  it('returns "blocked" for destructive command (rm -rf)', () => {
    const result = authorizeCommand('rm', ['-rf', '/']);
    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('destructive');
  });

  it('returns "blocked" for destructive command (del /f)', () => {
    const result = authorizeCommand('del', ['/f', 'somefile']);
    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('destructive');
  });

  it('returns "blocked" for Remove-Item', () => {
    const result = authorizeCommand('Remove-Item', ['file.txt']);
    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('destructive');
  });

  it('returns "blocked" for format command', () => {
    const result = authorizeCommand('format', ['C:']);
    expect(result.status).toBe('blocked');
  });

  it('returns "blocked" for shutdown', () => {
    const result = authorizeCommand('shutdown', ['/s']);
    expect(result.status).toBe('blocked');
  });

  it('returns "blocked" for unlisted commands', () => {
    const result = authorizeCommand('some-random-command', ['--flag']);
    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('not in the allowlist');
  });

  it('returns "blocked" when pipe operator is present', () => {
    const result = authorizeCommand('git', ['log', '|', 'head']);
    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('shell operators');
  });

  it('returns "blocked" when && operator is present', () => {
    const result = authorizeCommand('echo', ['hello', '&&', 'echo', 'world']);
    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('shell operators');
  });

  it('returns "blocked" when ; operator is present', () => {
    const result = authorizeCommand('echo', ['hello;', 'echo', 'world']);
    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('shell operators');
  });

  it('returns "blocked" when > redirect is present', () => {
    const result = authorizeCommand('echo', ['data', '>', 'file.txt']);
    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('shell operators');
  });

  it('returns "blocked" when backtick is present', () => {
    const result = authorizeCommand('echo', ['`whoami`']);
    expect(result.status).toBe('blocked');
  });

  it('destructive check takes priority over shell operators', () => {
    // "rm file | echo" — destructive keyword should block, not just needs_approval
    const result = authorizeCommand('rm', ['file', '|', 'echo']);
    expect(result.status).toBe('blocked');
  });

  it('is case-insensitive for allowlist matching', () => {
    const result = authorizeCommand('Git', ['Status']);
    expect(result.status).toBe('allowed');
  });

  it('matches command + args as a full string prefix', () => {
    // "git status --short" starts with "git status" → allowed
    const result = authorizeCommand('git', ['status', '--short']);
    expect(result.status).toBe('allowed');
  });

  it('does not match partial word prefixes', () => {
    // "gitx status" does NOT start with "git status"
    const result = authorizeCommand('gitx', ['status']);
    expect(result.status).toBe('blocked');
  });
});

// ---------------------------------------------------------------------------
// isDestructiveCommand
// ---------------------------------------------------------------------------

describe('isDestructiveCommand', () => {
  it('detects "rm " as destructive', () => {
    const result = isDestructiveCommand('rm -rf /tmp/foo');
    expect(result.match).toBe(true);
    expect(result.keyword).toBe('rm');
  });

  it('detects "del " as destructive', () => {
    const result = isDestructiveCommand('del /f file.txt');
    expect(result.match).toBe(true);
  });

  it('detects "rmdir" as destructive', () => {
    const result = isDestructiveCommand('rmdir /s /q folder');
    expect(result.match).toBe(true);
  });

  it('detects "drop " as destructive (SQL)', () => {
    const result = isDestructiveCommand('drop table users');
    expect(result.match).toBe(true);
  });

  it('detects "truncate " as destructive (SQL)', () => {
    const result = isDestructiveCommand('truncate table logs');
    expect(result.match).toBe(true);
  });

  it('detects "Clear-Content" as destructive', () => {
    const result = isDestructiveCommand('Clear-Content file.txt');
    expect(result.match).toBe(true);
  });

  it('detects "dd " as destructive', () => {
    const result = isDestructiveCommand('dd if=/dev/zero of=/dev/sda');
    expect(result.match).toBe(true);
  });

  it('returns false for safe commands', () => {
    const result = isDestructiveCommand('git status');
    expect(result.match).toBe(false);
  });

  it('returns false for "npm test"', () => {
    const result = isDestructiveCommand('npm test');
    expect(result.match).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasShellOperators
// ---------------------------------------------------------------------------

describe('hasShellOperators', () => {
  it('detects pipe |', () => {
    expect(hasShellOperators('cat file | grep foo')).toBe(true);
  });

  it('detects ampersand &', () => {
    expect(hasShellOperators('echo hello && echo world')).toBe(true);
  });

  it('detects semicolon ;', () => {
    expect(hasShellOperators('cd /tmp; ls')).toBe(true);
  });

  it('detects redirect >', () => {
    expect(hasShellOperators('echo data > file.txt')).toBe(true);
  });

  it('detects redirect <', () => {
    expect(hasShellOperators('wc < file.txt')).toBe(true);
  });

  it('detects backtick `', () => {
    expect(hasShellOperators('echo `date`')).toBe(true);
  });

  it('detects dollar sign $', () => {
    expect(hasShellOperators('echo $HOME')).toBe(true);
  });

  it('returns false for safe commands', () => {
    expect(hasShellOperators('git status')).toBe(false);
  });

  it('returns false for commands with hyphens and flags', () => {
    expect(hasShellOperators('npm run build --prod')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_ALLOWLIST
// ---------------------------------------------------------------------------

describe('DEFAULT_ALLOWLIST', () => {
  it('contains git commands', () => {
    expect(DEFAULT_ALLOWLIST).toContain('git status');
    expect(DEFAULT_ALLOWLIST).toContain('git log');
    expect(DEFAULT_ALLOWLIST).toContain('git diff');
  });

  it('contains npm commands', () => {
    expect(DEFAULT_ALLOWLIST).toContain('npm test');
    expect(DEFAULT_ALLOWLIST).toContain('npm run build');
  });

  it('contains npx commands', () => {
    expect(DEFAULT_ALLOWLIST).toContain('npx tsc');
    expect(DEFAULT_ALLOWLIST).toContain('npx vitest');
  });

  it('contains basic shell utilities', () => {
    expect(DEFAULT_ALLOWLIST).toContain('echo');
    expect(DEFAULT_ALLOWLIST).toContain('pwd');
    expect(DEFAULT_ALLOWLIST).toContain('ls');
  });
});

// ---------------------------------------------------------------------------
// Allowlist CRUD (getEffectiveAllowlist, getAllowlist, updateAllowlist)
// ---------------------------------------------------------------------------

describe('Allowlist CRUD', () => {
  it('returns default allowlist when no workspace_id provided', async () => {
    const patterns = await getEffectiveAllowlist();
    expect(patterns).toEqual(DEFAULT_ALLOWLIST);
  });

  it('returns default allowlist for unknown workspace (no disk file)', async () => {
    const patterns = await getEffectiveAllowlist('ws_nonexistent');
    expect(patterns).toEqual(DEFAULT_ALLOWLIST);
  });

  it('getAllowlist returns structured result with pattern count', async () => {
    const result = await getAllowlist();
    expect(result.patterns).toEqual(DEFAULT_ALLOWLIST);
    expect(result.message).toContain(`${DEFAULT_ALLOWLIST.length} patterns`);
  });

  it('updateAllowlist with "add" operation adds new patterns', async () => {
    const result = await updateAllowlist({
      workspace_id: 'ws_test_crud_add',
      patterns: ['docker build', 'docker run'],
      operation: 'add',
    });

    expect(result.patterns).toContain('docker build');
    expect(result.patterns).toContain('docker run');
    expect(result.message).toContain('add');
  });

  it('updateAllowlist with "add" does not duplicate existing patterns', async () => {
    // First add
    await updateAllowlist({
      workspace_id: 'ws_test_crud_dup',
      patterns: ['custom-cmd'],
      operation: 'add',
    });
    // Second add of same pattern
    const result = await updateAllowlist({
      workspace_id: 'ws_test_crud_dup',
      patterns: ['custom-cmd'],
      operation: 'add',
    });

    const count = result.patterns.filter((p) => p === 'custom-cmd').length;
    expect(count).toBe(1);
  });

  it('updateAllowlist with "remove" operation removes patterns', async () => {
    // Set up patterns first
    await updateAllowlist({
      workspace_id: 'ws_test_crud_rm',
      patterns: ['to-remove', 'to-keep'],
      operation: 'add',
    });

    const result = await updateAllowlist({
      workspace_id: 'ws_test_crud_rm',
      patterns: ['to-remove'],
      operation: 'remove',
    });

    expect(result.patterns).not.toContain('to-remove');
    expect(result.patterns).toContain('to-keep');
  });

  it('updateAllowlist with "set" operation replaces all patterns', async () => {
    const result = await updateAllowlist({
      workspace_id: 'ws_test_crud_set',
      patterns: ['only-this'],
      operation: 'set',
    });

    expect(result.patterns).toEqual(['only-this']);
  });

  it('authorizeCommand uses workspace-specific allowlist after update', async () => {
    // Set a custom allowlist with a unique command
    await updateAllowlist({
      workspace_id: 'ws_auth_custom',
      patterns: ['my-safe-tool'],
      operation: 'set',
    });

    const result = authorizeCommand('my-safe-tool', ['--flag'], 'ws_auth_custom');
    expect(result.status).toBe('allowed');
  });
});
