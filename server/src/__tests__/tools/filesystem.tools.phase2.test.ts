import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockedStat,
  mockedUnlink,
  mockedRmdir,
  mockedRename,
  mockedCopyFile,
  mockedAppendFile,
  mockedMkdir,
  mockedEnforceSymlinkPolicy,
} = vi.hoisted(() => ({
  mockedStat: vi.fn(),
  mockedUnlink: vi.fn(),
  mockedRmdir: vi.fn(),
  mockedRename: vi.fn(),
  mockedCopyFile: vi.fn(),
  mockedAppendFile: vi.fn(),
  mockedMkdir: vi.fn(),
  mockedEnforceSymlinkPolicy: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    stat: mockedStat,
    unlink: mockedUnlink,
    rmdir: mockedRmdir,
    rename: mockedRename,
    copyFile: mockedCopyFile,
    appendFile: mockedAppendFile,
    mkdir: mockedMkdir,
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
    enforceSymlinkPolicy: mockedEnforceSymlinkPolicy,
    MAX_WRITE_BYTES: 1024,
    MAX_APPEND_BYTES: 1024,
  };
});

import {
  handleAppend,
  handleCopy,
  handleDelete,
  handleExists,
  handleMove,
} from '../../tools/filesystem.tools.js';

function fileStat(size = 1) {
  return {
    isFile: () => true,
    isDirectory: () => false,
    size,
  };
}

function dirStat() {
  return {
    isFile: () => false,
    isDirectory: () => true,
    size: 0,
  };
}

describe('filesystem.tools Phase 2 handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEnforceSymlinkPolicy.mockResolvedValue({ ok: true });
  });

  it('handleDelete requires confirm=true', async () => {
    const result = await handleDelete({ workspace_id: 'ws', path: 'a.txt' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('FS_DELETE_CONFIRM_REQUIRED');
    expect((result as any).audit_event).toMatchObject({
      event_type: 'filesystem_destructive_op',
      action: 'delete',
      path: 'a.txt',
      outcome: 'error',
      reason: 'confirm_required',
    });
    expect(mockedUnlink).not.toHaveBeenCalled();
    expect(mockedRmdir).not.toHaveBeenCalled();
  });

  it('handleDelete supports dry_run preview with no side effects', async () => {
    mockedStat.mockResolvedValue(fileStat());

    const result = await handleDelete({ workspace_id: 'ws', path: 'a.txt', dry_run: true });

    expect(result.success).toBe(true);
    expect(mockedUnlink).not.toHaveBeenCalled();
    expect(mockedRmdir).not.toHaveBeenCalled();
    if (result.success && result.data) {
      expect(result.data).toMatchObject({ path: 'a.txt', would_delete: true, dry_run: true });
    }
  });

  it('handleDelete deletes a file when confirmed', async () => {
    mockedStat.mockResolvedValue(fileStat());

    const result = await handleDelete({ workspace_id: 'ws', path: 'a.txt', confirm: true });

    expect(result.success).toBe(true);
    expect(mockedUnlink).toHaveBeenCalledWith('/workspace/a.txt');
    if (result.success && result.data) {
      expect(result.data).toMatchObject({ path: 'a.txt', type: 'file', deleted: true });
      expect(result.data.audit_event.action).toBe('delete');
    }
  });

  it('handleDelete is idempotent for missing paths', async () => {
    const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' });
    mockedStat.mockRejectedValue(enoent);

    const result = await handleDelete({ workspace_id: 'ws', path: 'missing.txt', confirm: true });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      expect(result.data).toMatchObject({ path: 'missing.txt', deleted: false });
    }
  });

  it('handleMove blocks overwrite=false when destination exists', async () => {
    mockedStat.mockImplementation(async (targetPath: string) => {
      if (targetPath === '/workspace/src.txt') return fileStat();
      if (targetPath === '/workspace/dest.txt') return fileStat();
      throw new Error('not found');
    });

    const result = await handleMove({
      workspace_id: 'ws',
      source: 'src.txt',
      destination: 'dest.txt',
      overwrite: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('FS_MOVE_DESTINATION_EXISTS');
    expect((result as any).audit_event).toMatchObject({
      event_type: 'filesystem_destructive_op',
      action: 'move',
      source: 'src.txt',
      destination: 'dest.txt',
      outcome: 'error',
      reason: 'destination_exists',
    });
    expect(mockedRename).not.toHaveBeenCalled();
  });

  it('handleMove supports dry_run preview with no side effects', async () => {
    mockedStat.mockImplementation(async (targetPath: string) => {
      if (targetPath === '/workspace/src.txt') return fileStat();
      throw new Error('not found');
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
    }
  });

  it('handleMove returns noop for same-path move', async () => {
    mockedStat.mockResolvedValue(fileStat());

    const result = await handleMove({
      workspace_id: 'ws',
      source: 'same.txt',
      destination: 'same.txt',
    });

    expect(result.success).toBe(true);
    expect(mockedRename).not.toHaveBeenCalled();
    if (result.success && result.data) {
      expect(result.data).toMatchObject({ source: 'same.txt', destination: 'same.txt', moved: false });
    }
  });

  it('handleMove renames source to destination', async () => {
    mockedStat.mockImplementation(async (targetPath: string) => {
      if (targetPath === '/workspace/src.txt') return fileStat();
      throw new Error('not found');
    });

    const result = await handleMove({
      workspace_id: 'ws',
      source: 'src.txt',
      destination: 'dest.txt',
    });

    expect(result.success).toBe(true);
    expect(mockedRename).toHaveBeenCalledWith('/workspace/src.txt', '/workspace/dest.txt');
    if (result.success && result.data) {
      expect(result.data).toMatchObject({
        source: 'src.txt',
        destination: 'dest.txt',
        overwritten: false,
        moved: true,
      });
      expect(result.data.audit_event.action).toBe('move');
    }
  });

  it('handleCopy rejects same source and destination paths', async () => {
    const result = await handleCopy({
      workspace_id: 'ws',
      source: 'same.txt',
      destination: 'same.txt',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('FS_COPY_SAME_PATH');
  });

  it('handleCopy copies a file and creates parent directories', async () => {
    mockedStat.mockImplementation(async (targetPath: string) => {
      if (targetPath === '/workspace/src.txt') return fileStat(12);
      throw new Error('not found');
    });

    const result = await handleCopy({
      workspace_id: 'ws',
      source: 'src.txt',
      destination: 'nested/dest.txt',
    });

    expect(result.success).toBe(true);
    expect(mockedMkdir).toHaveBeenCalledWith('/workspace/nested', { recursive: true });
    expect(mockedCopyFile).toHaveBeenCalled();
    if (result.success && result.data) {
      expect(result.data).toMatchObject({
        source: 'src.txt',
        destination: 'nested/dest.txt',
        bytes_copied: 12,
        overwritten: false,
      });
    }
  });

  it('handleAppend fails when target does not exist', async () => {
    mockedStat.mockRejectedValue(new Error('ENOENT'));

    const result = await handleAppend({ workspace_id: 'ws', path: 'missing.txt', content: 'x' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('FS_APPEND_TARGET_MISSING');
    expect(mockedAppendFile).not.toHaveBeenCalled();
  });

  it('handleAppend appends to an existing file', async () => {
    mockedStat.mockResolvedValue(fileStat());

    const result = await handleAppend({ workspace_id: 'ws', path: 'a.txt', content: 'hello' });

    expect(result.success).toBe(true);
    expect(mockedAppendFile).toHaveBeenCalledWith('/workspace/a.txt', 'hello', 'utf-8');
    if (result.success && result.data) {
      expect(result.data).toMatchObject({ path: 'a.txt', bytes_appended: 5 });
    }
  });

  it('handleExists returns exists/type for file and ENOENT missing path', async () => {
    mockedStat.mockResolvedValueOnce(fileStat());
    const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' });
    mockedStat.mockRejectedValueOnce(enoent);

    const existsResult = await handleExists({ workspace_id: 'ws', path: 'a.txt' });
    const missingResult = await handleExists({ workspace_id: 'ws', path: 'missing.txt' });

    expect(existsResult.success).toBe(true);
    expect(missingResult.success).toBe(true);

    if (existsResult.success && existsResult.data) {
      expect(existsResult.data).toMatchObject({ path: 'a.txt', exists: true, type: 'file' });
    }

    if (missingResult.success && missingResult.data) {
      expect(missingResult.data).toMatchObject({ path: 'missing.txt', exists: false, type: null });
    }

    expect(mockedEnforceSymlinkPolicy).toHaveBeenCalledWith('/workspace', '/workspace/a.txt', { allowMissingLeaf: true });
    expect(mockedEnforceSymlinkPolicy).toHaveBeenCalledWith('/workspace', '/workspace/missing.txt', { allowMissingLeaf: true });
  });

  it('handleExists returns symlink policy violation errors', async () => {
    mockedEnforceSymlinkPolicy.mockResolvedValueOnce({ ok: false, error: 'Symlink escapes workspace boundary: "bad"' });

    const result = await handleExists({ workspace_id: 'ws', path: 'bad' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('FS_SYMLINK_POLICY_VIOLATION');
  });

  it('handleExists returns deterministic error for non-ENOENT stat failures', async () => {
    const eacces = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    mockedStat.mockRejectedValueOnce(eacces);

    const result = await handleExists({ workspace_id: 'ws', path: 'restricted.txt' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to check path existence: permission denied');
  });

  it('handleDelete deletes an empty directory when confirmed', async () => {
    mockedStat.mockResolvedValue(dirStat());

    const result = await handleDelete({ workspace_id: 'ws', path: 'empty', confirm: true });

    expect(result.success).toBe(true);
    expect(mockedRmdir).toHaveBeenCalledWith('/workspace/empty');
    if (result.success && result.data) {
      expect(result.data).toMatchObject({ path: 'empty', type: 'directory', deleted: true });
    }
  });
});
