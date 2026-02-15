import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockedReaddir, mockedWalkDir } = vi.hoisted(() => ({
  mockedReaddir: vi.fn(),
  mockedWalkDir: vi.fn(),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readdir: mockedReaddir,
  };
});

vi.mock('../../tools/filesystem-safety.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../tools/filesystem-safety.js')>();
  return {
    ...actual,
    resolveWorkspaceRoot: vi.fn().mockResolvedValue('/workspace'),
    validatePath: vi.fn((_root: string, inputPath: string) => ({
      ok: true,
      resolved: inputPath === '.' ? '/workspace' : `/workspace/${inputPath}`,
    })),
    isSensitivePath: vi.fn().mockReturnValue(false),
    SKIP_DIRS: new Set(['node_modules', '.git', 'dist']),
    walkDir: mockedWalkDir,
  };
});

import { handleList, handleSearch } from '../../tools/filesystem.tools.js';

describe('filesystem.tools Phase 1 bug fixes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handleList recursive uses walkDir and skips SKIP_DIRS entries', async () => {
    mockedWalkDir.mockImplementation(async (_root, _current, callback) => {
      const continueSrc = callback('src', true);
      if (continueSrc) callback('src/index.ts', false);

      const continueNodeModules = callback('node_modules', true);
      if (continueNodeModules) callback('node_modules/pkg/index.js', false);
    });

    const result = await handleList({
      workspace_id: 'ws_test',
      path: '.',
      recursive: true,
    });

    expect(result.success).toBe(true);
    expect(mockedWalkDir).toHaveBeenCalled();
    expect(mockedReaddir).not.toHaveBeenCalled();

    if (result.success && result.data) {
      expect(result.data.entries.map((entry) => entry.path)).toEqual([
        'src',
        'src/index.ts',
      ]);
      expect(result.data.entries.every((entry) => !entry.path?.includes('node_modules'))).toBe(true);
    }
  });

  it('handleSearch skips entries when any path segment is in SKIP_DIRS', async () => {
    mockedWalkDir.mockImplementation(async (_root, _current, callback) => {
      callback('src/app/main.ts', false);
      callback('src/node_modules/lib/a.ts', false);
      callback('packages/core/.git/config', false);
      callback('dist/output.js', false);
    });

    const result = await handleSearch({
      workspace_id: 'ws_test',
      pattern: '*.ts',
    });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.matches.map((match) => match.path)).toEqual(['src/app/main.ts']);
    }
  });
});
