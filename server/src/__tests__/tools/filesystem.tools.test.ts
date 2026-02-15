import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockedReaddir,
  mockedStat,
  mockedMkdir,
  mockedWriteFile,
  mockedOpen,
  mockedUnlink,
  mockedRmdir,
  mockedRename,
  mockedCopyFile,
  mockedAppendFile,
  mockedWalkDir,
  mockedBuildTree,
  mockedEnforceSymlinkPolicy,
  mockedValidatePath,
} = vi.hoisted(() => ({
  mockedReaddir: vi.fn(),
  mockedStat: vi.fn(),
  mockedMkdir: vi.fn(),
  mockedWriteFile: vi.fn(),
  mockedOpen: vi.fn(),
  mockedUnlink: vi.fn(),
  mockedRmdir: vi.fn(),
  mockedRename: vi.fn(),
  mockedCopyFile: vi.fn(),
  mockedAppendFile: vi.fn(),
  mockedWalkDir: vi.fn(),
  mockedBuildTree: vi.fn(),
  mockedEnforceSymlinkPolicy: vi.fn().mockResolvedValue({ ok: true }),
  mockedValidatePath: vi.fn((_root: string, inputPath: string) => ({
    ok: true,
    resolved: inputPath === '.' ? '/workspace' : `/workspace/${inputPath}`,
  })),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readdir: mockedReaddir,
    stat: mockedStat,
    mkdir: mockedMkdir,
    writeFile: mockedWriteFile,
    open: mockedOpen,
    unlink: mockedUnlink,
    rmdir: mockedRmdir,
    rename: mockedRename,
    copyFile: mockedCopyFile,
    appendFile: mockedAppendFile,
  };
});

vi.mock('../../tools/filesystem-safety.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../tools/filesystem-safety.js')>();
  return {
    ...actual,
    resolveWorkspaceRoot: vi.fn().mockResolvedValue('/workspace'),
    validatePath: mockedValidatePath,
    isSensitivePath: vi.fn().mockReturnValue(false),
    enforceSymlinkPolicy: mockedEnforceSymlinkPolicy,
    walkDir: mockedWalkDir,
    buildTree: mockedBuildTree,
    SKIP_DIRS: new Set(['node_modules', '.git', 'dist', '.next', '__pycache__']),
    MAX_READ_BYTES: 1024,
    MAX_WRITE_BYTES: 8,
    MAX_APPEND_BYTES: 8,
    MAX_TREE_DEPTH: 10,
    MAX_SEARCH_RESULTS: 3,
    MAX_LIST_RESULTS: 3,
    MAX_TREE_ENTRIES: 3,
  };
});

import {
  handleAppend,
  handleCopy,
  handleDelete,
  handleExists,
  handleList,
  handleMove,
  handleRead,
  handleSearch,
  handleTree,
  handleWrite,
} from '../../tools/filesystem.tools.js';

function fileStat(size = 1) {
  return {
    isFile: () => true,
    isDirectory: () => false,
    isSymbolicLink: () => false,
    size,
  };
}

function dirStat() {
  return {
    isFile: () => false,
    isDirectory: () => true,
    isSymbolicLink: () => false,
    size: 0,
  };
}

describe('filesystem.tools dedicated happy-path and hardening coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedValidatePath.mockImplementation((_root: string, inputPath: string) => ({
      ok: true,
      resolved: inputPath === '.' ? '/workspace' : `/workspace/${inputPath}`,
    }));
    mockedEnforceSymlinkPolicy.mockResolvedValue({ ok: true });
  });

  it('read returns file content and metadata', async () => {
    mockedStat.mockResolvedValue(fileStat(5));
    const read = vi.fn(async (buffer: Buffer) => {
      buffer.write('hello');
      return { bytesRead: 5, buffer };
    });
    const close = vi.fn().mockResolvedValue(undefined);
    mockedOpen.mockResolvedValue({ read, close });

    const result = await handleRead({ workspace_id: 'ws', path: 'a.txt' });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data).toMatchObject({
        path: 'a.txt',
        content: 'hello',
        size: 5,
        truncated: false,
      });
    }
  });

  it('write writes content and marks created=true when file does not exist', async () => {
    mockedStat.mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'ENOENT' }));

    const result = await handleWrite({ workspace_id: 'ws', path: 'dir/new.txt', content: 'hello' });

    expect(result.success).toBe(true);
    expect(mockedMkdir).toHaveBeenCalledWith('/workspace/dir', { recursive: true });
    expect(mockedWriteFile).toHaveBeenCalledWith('/workspace/dir/new.txt', 'hello', 'utf-8');
    if (result.success && result.data) {
      expect(result.data).toMatchObject({ path: 'dir\\new.txt', bytes_written: 5, created: true });
    }
  });

  it('search finds matches and skips canonical SKIP_DIRS segments', async () => {
    mockedWalkDir.mockImplementation(async (_root, _current, callback) => {
      callback('src/main.ts', false);
      callback('dist/output.js', false);
      callback('.next/server/chunk.js', false);
      callback('__pycache__/x.pyc', false);
      callback('node_modules/pkg/index.ts', false);
      callback('src/utils.ts', false);
    });

    const result = await handleSearch({ workspace_id: 'ws', pattern: '*.ts' });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.matches.map((m) => m.path)).toEqual(['src/main.ts', 'src/utils.ts']);
      expect(result.data.matches.some((m) => m.path.includes('.next'))).toBe(false);
      expect(result.data.matches.some((m) => m.path.includes('dist'))).toBe(false);
    }
  });

  it('list returns non-recursive entries with types', async () => {
    mockedReaddir.mockResolvedValue([
      { name: 'src', isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false },
      { name: 'README.md', isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false },
    ]);
    mockedStat.mockResolvedValue(fileStat(42));

    const result = await handleList({ workspace_id: 'ws', path: '.', recursive: false });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.entries).toEqual([
        { name: 'src', type: 'directory', size: undefined },
        { name: 'README.md', type: 'file', size: 42 },
      ]);
    }
  });

  it('list recursive skips SKIP_DIRS and normalizes output paths to forward slashes', async () => {
    mockedWalkDir.mockImplementation(async (_root, _current, callback) => {
      callback('src\\nested', true);
      callback('src\\nested\\file.ts', false);
      callback('dist\\bundle.js', false);
      callback('.next\\cache', true);
    });

    const result = await handleList({ workspace_id: 'ws', path: '.', recursive: true });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.entries.map((entry) => entry.path)).toEqual(['src/nested', 'src/nested/file.ts']);
      expect(result.data.entries.every((entry) => !entry.path?.includes('dist'))).toBe(true);
      expect(result.data.entries.every((entry) => !entry.path?.includes('.next'))).toBe(true);
    }
  });

  it('tree returns generated tree string and truncation metadata', async () => {
    mockedBuildTree.mockImplementation(async (_dir, _prefix, _depth, _maxDepth, lines, counter, options) => {
      lines.push('├── src/');
      lines.push('└── README.md');
      counter.count = 2;
      if (options?.truncated) options.truncated.value = true;
    });

    const result = await handleTree({ workspace_id: 'ws', path: '.', max_depth: 3 });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.tree).toContain('src/');
      expect(result.data.total_entries).toBe(2);
      expect(result.data.truncated).toBe(true);
      expect(result.data.limit).toBe(3);
    }
  });

  it('delete dry_run has no side effects and emits audit event', async () => {
    mockedStat.mockResolvedValue(fileStat());

    const result = await handleDelete({ workspace_id: 'ws', path: 'a.txt', dry_run: true });

    expect(result.success).toBe(true);
    expect(mockedUnlink).not.toHaveBeenCalled();
    expect(mockedRmdir).not.toHaveBeenCalled();
    if (result.success && result.data) {
      expect(result.data).toMatchObject({ path: 'a.txt', would_delete: true, dry_run: true });
      expect(result.data.audit_event).toMatchObject({
        event_type: 'filesystem_destructive_op',
        action: 'delete',
        dry_run: true,
        outcome: 'success',
      });
    }
  });

  it('delete without confirm fails and returns structured audit_event', async () => {
    const result = await handleDelete({ workspace_id: 'ws', path: 'a.txt' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('FS_DELETE_CONFIRM_REQUIRED');
    expect((result as any).audit_event).toMatchObject({
      event_type: 'filesystem_destructive_op',
      action: 'delete',
      outcome: 'error',
      reason: 'confirm_required',
    });
  });

  it('delete missing path is idempotent no-op', async () => {
    mockedStat.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    const result = await handleDelete({ workspace_id: 'ws', path: 'missing.txt', confirm: true });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data).toMatchObject({ path: 'missing.txt', deleted: false });
      expect(result.data.audit_event.outcome).toBe('noop');
    }
  });

  it('move dry_run has no side effects and emits audit event', async () => {
    mockedStat.mockImplementation(async (targetPath: string) => {
      if (targetPath.endsWith('/src.txt')) return fileStat();
      throw Object.assign(new Error('not found'), { code: 'ENOENT' });
    });

    const result = await handleMove({
      workspace_id: 'ws',
      source: 'src.txt',
      destination: 'dest.txt',
      dry_run: true,
    });

    expect(result.success).toBe(true);
    expect(mockedRename).not.toHaveBeenCalled();
    if (result.success && result.data) {
      expect(result.data).toMatchObject({ source: 'src.txt', destination: 'dest.txt', would_move: true, dry_run: true });
      expect(result.data.audit_event).toMatchObject({ action: 'move', dry_run: true, outcome: 'success' });
    }
  });

  it('move same source and destination is a no-op with audit outcome noop', async () => {
    const result = await handleMove({ workspace_id: 'ws', source: 'same.txt', destination: 'same.txt' });

    expect(result.success).toBe(true);
    expect(mockedRename).not.toHaveBeenCalled();
    if (result.success && result.data) {
      expect(result.data).toMatchObject({ source: 'same.txt', destination: 'same.txt', moved: false });
      expect(result.data.audit_event.outcome).toBe('noop');
    }
  });

  it('copy duplicates file and normalizes returned paths', async () => {
    mockedValidatePath
      .mockImplementationOnce(() => ({ ok: true, resolved: '/workspace/src\\file.txt' }))
      .mockImplementationOnce(() => ({ ok: true, resolved: '/workspace/dest\\copy.txt' }));
    mockedStat
      .mockResolvedValueOnce(fileStat(12))
      .mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'ENOENT' }));

    const result = await handleCopy({ workspace_id: 'ws', source: 'src\\file.txt', destination: 'dest\\copy.txt' });

    expect(result.success).toBe(true);
    expect(mockedCopyFile).toHaveBeenCalled();
    if (result.success && result.data) {
      expect(result.data).toMatchObject({
        source: 'src/file.txt',
        destination: 'dest/copy.txt',
        bytes_copied: 12,
        overwritten: false,
      });
    }
  });

  it('copy fails when destination exists and overwrite=false', async () => {
    mockedStat.mockResolvedValue(fileStat(2));

    const result = await handleCopy({ workspace_id: 'ws', source: 'src.txt', destination: 'dest.txt' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('FS_COPY_DESTINATION_EXISTS');
    expect(mockedCopyFile).not.toHaveBeenCalled();
  });

  it('append appends content to existing file', async () => {
    mockedStat.mockResolvedValue(fileStat());

    const result = await handleAppend({ workspace_id: 'ws', path: 'notes.txt', content: 'hello' });

    expect(result.success).toBe(true);
    expect(mockedAppendFile).toHaveBeenCalledWith('/workspace/notes.txt', 'hello', 'utf-8');
    if (result.success && result.data) {
      expect(result.data).toMatchObject({ path: 'notes.txt', bytes_appended: 5 });
    }
  });

  it('append enforces payload guardrail limit', async () => {
    mockedStat.mockResolvedValue(fileStat());

    const result = await handleAppend({ workspace_id: 'ws', path: 'notes.txt', content: '123456789' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('FS_PAYLOAD_TOO_LARGE');
    expect(mockedAppendFile).not.toHaveBeenCalled();
  });

  it('exists returns false/null for missing path and file type for existing file', async () => {
    mockedStat
      .mockResolvedValueOnce(fileStat())
      .mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'ENOENT' }));

    const existing = await handleExists({ workspace_id: 'ws', path: 'file.txt' });
    const missing = await handleExists({ workspace_id: 'ws', path: 'missing.txt' });

    expect(existing.success).toBe(true);
    expect(missing.success).toBe(true);
    if (existing.success && existing.data) {
      expect(existing.data).toMatchObject({ path: 'file.txt', exists: true, type: 'file' });
    }
    if (missing.success && missing.data) {
      expect(missing.data).toMatchObject({ path: 'missing.txt', exists: false, type: null });
    }
  });

  it('normalizes mixed Windows/POSIX separators in action outputs', async () => {
    mockedValidatePath.mockImplementationOnce(() => ({ ok: true, resolved: '/workspace/folder\\mixed/path\\file.txt' }));
    mockedStat.mockResolvedValue(fileStat());

    const result = await handleExists({ workspace_id: 'ws', path: 'folder\\mixed/path\\file.txt' });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.path).toBe('folder/mixed/path/file.txt');
    }
  });

  it('search enforces MAX_SEARCH_RESULTS guardrail and reports truncation', async () => {
    mockedWalkDir.mockImplementation(async (_root, _current, callback) => {
      callback('a.ts', false);
      callback('b.ts', false);
      callback('c.ts', false);
      callback('d.ts', false);
    });

    const result = await handleSearch({ workspace_id: 'ws', pattern: '*.ts' });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.matches.length).toBe(3);
      expect(result.data.truncated).toBe(true);
      expect(result.data.limit).toBe(3);
    }
  });

  it('list recursive enforces MAX_LIST_RESULTS guardrail and truncation', async () => {
    mockedWalkDir.mockImplementation(async (_root, _current, callback) => {
      callback('src', true);
      callback('src/a.ts', false);
      callback('src/b.ts', false);
      callback('src/c.ts', false);
    });

    const result = await handleList({ workspace_id: 'ws', path: '.', recursive: true });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data.entries.length).toBe(3);
      expect(result.data.truncated).toBe(true);
      expect(result.data.limit).toBe(3);
    }
  });

  it('write enforces payload guardrail limit', async () => {
    const result = await handleWrite({ workspace_id: 'ws', path: 'too-big.txt', content: '123456789' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('FS_PAYLOAD_TOO_LARGE');
    expect(mockedWriteFile).not.toHaveBeenCalled();
  });

  it('read denies symlink escape via policy violation', async () => {
    mockedEnforceSymlinkPolicy.mockResolvedValueOnce({ ok: false, error: 'Symlink escapes workspace boundary: "bad"' });

    const result = await handleRead({ workspace_id: 'ws', path: 'bad-link.txt' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('FS_SYMLINK_POLICY_VIOLATION');
  });

  it('exists surfaces symlink policy violation errors', async () => {
    mockedEnforceSymlinkPolicy.mockResolvedValueOnce({ ok: false, error: 'Symlink escapes workspace boundary: "bad"' });

    const result = await handleExists({ workspace_id: 'ws', path: 'bad-link' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('FS_SYMLINK_POLICY_VIOLATION');
  });

  it('delete handles directory happy path', async () => {
    mockedStat.mockResolvedValue(dirStat());

    const result = await handleDelete({ workspace_id: 'ws', path: 'empty-dir', confirm: true });

    expect(result.success).toBe(true);
    expect(mockedRmdir).toHaveBeenCalledWith('/workspace/empty-dir');
    if (result.success && result.data) {
      expect(result.data).toMatchObject({ path: 'empty-dir', type: 'directory', deleted: true });
    }
  });
});