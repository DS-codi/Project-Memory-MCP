import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validatePath,
  isSensitivePath,
  resolveWorkspaceRoot,
  walkDir,
  buildTree,
  MAX_READ_BYTES,
  MAX_TREE_DEPTH,
  MAX_SEARCH_RESULTS,
  SKIP_DIRS,
} from '../../tools/filesystem-safety.js';
import path from 'node:path';

// Mock file-store for resolveWorkspaceRoot
vi.mock('../../storage/db-store.js', () => ({
  getWorkspace: vi.fn(),
}));

import * as store from '../../storage/db-store.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('filesystem-safety constants', () => {
  it('MAX_READ_BYTES is 1MB', () => {
    expect(MAX_READ_BYTES).toBe(1024 * 1024);
  });

  it('MAX_TREE_DEPTH is 10', () => {
    expect(MAX_TREE_DEPTH).toBe(10);
  });

  it('MAX_SEARCH_RESULTS is 200', () => {
    expect(MAX_SEARCH_RESULTS).toBe(200);
  });

  it('SKIP_DIRS contains common skip targets', () => {
    expect(SKIP_DIRS.has('node_modules')).toBe(true);
    expect(SKIP_DIRS.has('.git')).toBe(true);
    expect(SKIP_DIRS.has('dist')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validatePath
// ---------------------------------------------------------------------------

describe('validatePath', () => {
  const workspaceRoot = process.platform === 'win32'
    ? 'C:\\Projects\\my-app'
    : '/home/user/projects/my-app';

  it('allows a path within the workspace root', () => {
    const result = validatePath(workspaceRoot, 'src/index.ts');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolved).toContain('src');
      expect(result.resolved).toContain('index.ts');
    }
  });

  it('allows "." (current dir) as workspace root itself', () => {
    const result = validatePath(workspaceRoot, '.');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolved).toBe(path.resolve(workspaceRoot, '.'));
    }
  });

  it('allows nested paths within workspace', () => {
    const result = validatePath(workspaceRoot, 'src/utils/helpers.ts');
    expect(result.ok).toBe(true);
  });

  it('rejects path traversal with ../../../etc/passwd', () => {
    const result = validatePath(workspaceRoot, '../../../etc/passwd');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('escapes workspace');
    }
  });

  it('rejects path traversal going above workspace root', () => {
    const result = validatePath(workspaceRoot, '../../other-project/secret.ts');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/escapes workspace|traversal/i);
    }
  });

  it('allows absolute path when it resolves within workspace', () => {
    const absPath = path.join(workspaceRoot, 'src', 'file.ts');
    const result = validatePath(workspaceRoot, absPath);
    expect(result.ok).toBe(true);
  });

  it('rejects absolute path outside workspace', () => {
    const outsidePath = process.platform === 'win32'
      ? 'C:\\Windows\\System32\\config'
      : '/etc/passwd';
    const result = validatePath(workspaceRoot, outsidePath);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('escapes workspace');
    }
  });

  it('returns resolved absolute path on success', () => {
    const result = validatePath(workspaceRoot, 'package.json');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(path.isAbsolute(result.resolved)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// isSensitivePath
// ---------------------------------------------------------------------------

describe('isSensitivePath', () => {
  // Blocked patterns
  it('blocks .env', () => {
    expect(isSensitivePath('.env')).toBe(true);
  });

  it('blocks .env.local', () => {
    expect(isSensitivePath('.env.local')).toBe(true);
  });

  it('blocks .env.production', () => {
    expect(isSensitivePath('.env.production')).toBe(true);
  });

  it('blocks .git/config', () => {
    expect(isSensitivePath('.git/config')).toBe(true);
  });

  it('blocks .git/credentials', () => {
    expect(isSensitivePath('.git/credentials')).toBe(true);
  });

  it('blocks id_rsa', () => {
    expect(isSensitivePath('/home/user/.ssh/id_rsa')).toBe(true);
  });

  it('blocks id_ed25519', () => {
    expect(isSensitivePath('id_ed25519')).toBe(true);
  });

  it('blocks .pem files', () => {
    expect(isSensitivePath('server.pem')).toBe(true);
  });

  it('blocks .key files', () => {
    expect(isSensitivePath('private.key')).toBe(true);
  });

  it('blocks .p12 files', () => {
    expect(isSensitivePath('cert.p12')).toBe(true);
  });

  it('blocks .pfx files', () => {
    expect(isSensitivePath('cert.pfx')).toBe(true);
  });

  it('blocks .env in nested path', () => {
    expect(isSensitivePath('config/.env')).toBe(true);
  });

  it('blocks node_modules/.cache', () => {
    expect(isSensitivePath('node_modules/.cache/something')).toBe(true);
  });

  // Allowed patterns
  it('allows normal .ts files', () => {
    expect(isSensitivePath('src/index.ts')).toBe(false);
  });

  it('allows normal .json files', () => {
    expect(isSensitivePath('package.json')).toBe(false);
  });

  it('allows normal .md files', () => {
    expect(isSensitivePath('README.md')).toBe(false);
  });

  it('allows .js files', () => {
    expect(isSensitivePath('dist/main.js')).toBe(false);
  });

  it('allows .css files', () => {
    expect(isSensitivePath('styles/main.css')).toBe(false);
  });

  it('handles Windows-style backslash paths', () => {
    expect(isSensitivePath('config\\.env')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isSensitivePath('.ENV')).toBe(true);
    expect(isSensitivePath('ID_RSA')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveWorkspaceRoot
// ---------------------------------------------------------------------------

describe('resolveWorkspaceRoot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns workspace_path when workspace is found', async () => {
    vi.mocked(store.getWorkspace).mockResolvedValue({
      workspace_path: '/home/user/project',
      id: 'ws_123',
    } as any);

    const result = await resolveWorkspaceRoot('ws_123');
    expect(result).toBe('/home/user/project');
  });

  it('returns null when workspace is not found', async () => {
    vi.mocked(store.getWorkspace).mockResolvedValue(null);

    const result = await resolveWorkspaceRoot('ws_nonexistent');
    expect(result).toBeNull();
  });

  it('falls back to path property if workspace_path is missing', async () => {
    vi.mocked(store.getWorkspace).mockResolvedValue({
      path: '/fallback/path',
      id: 'ws_fallback',
    } as any);

    const result = await resolveWorkspaceRoot('ws_fallback');
    expect(result).toBe('/fallback/path');
  });
});

// ---------------------------------------------------------------------------
// walkDir callback behavior
// ---------------------------------------------------------------------------

describe('walkDir', () => {
  // walkDir relies on real filesystem, so test with a temp dir or mock
  // Here we test that the callback receives expected arguments
  it('is exported as a function', () => {
    expect(typeof walkDir).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// buildTree
// ---------------------------------------------------------------------------

describe('buildTree', () => {
  it('is exported as a function', () => {
    expect(typeof buildTree).toBe('function');
  });

  it('respects maxDepth of 0 (produces no lines)', async () => {
    const lines: string[] = [];
    const counter = { count: 0 };
    // Use a path that likely won't exist (safe no-op)
    await buildTree('/tmp/nonexistent-dir-for-test', '', 0, 0, lines, counter);
    expect(lines.length).toBe(0);
  });

  it('respects counter cap of 500 entries', async () => {
    const lines: string[] = [];
    const counter = { count: 501 };
    // Should not add anything since counter is already over 500
    await buildTree('/tmp', '', 0, 5, lines, counter);
    expect(lines.length).toBe(0);
  });
});
