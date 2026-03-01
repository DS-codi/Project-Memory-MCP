import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFilesystem } from '../../tools/consolidated/memory_filesystem.js';
import type { MemoryFilesystemParams } from '../../tools/consolidated/memory_filesystem.js';
import * as fsTools from '../../tools/filesystem.tools.js';

vi.mock('../../tools/filesystem.tools.js');

describe('MCP Tool: memory_filesystem Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires action and workspace_id', async () => {
    const noAction = await memoryFilesystem({ workspace_id: 'ws' } as MemoryFilesystemParams);
    const noWorkspace = await memoryFilesystem({ action: 'read' } as MemoryFilesystemParams);

    expect(noAction.success).toBe(false);
    expect(noAction.error).toContain('action is required');
    expect(noWorkspace.success).toBe(false);
    expect(noWorkspace.error).toContain('workspace_id is required');
  });

  it('routes read action with required path', async () => {
    vi.mocked(fsTools.handleRead).mockResolvedValue({ success: true, data: { path: 'a.txt', content: 'x', bytes: 1 } } as any);

    const missingPath = await memoryFilesystem({ action: 'read', workspace_id: 'ws' });
    expect(missingPath.success).toBe(false);
    expect(missingPath.error).toContain('path is required for action: read');

    const result = await memoryFilesystem({ action: 'read', workspace_id: 'ws', path: 'a.txt' });
    expect(result.success).toBe(true);
    expect(fsTools.handleRead).toHaveBeenCalledWith({ workspace_id: 'ws', path: 'a.txt' });
  });

  it('routes write/search/list/tree actions and enforces required params', async () => {
    vi.mocked(fsTools.handleWrite).mockResolvedValue({ success: true, data: { path: 'a.txt', bytes_written: 3, created: true } } as any);
    vi.mocked(fsTools.handleSearch).mockResolvedValue({ success: true, data: { query: '*.ts', matches: [] } } as any);
    vi.mocked(fsTools.handleDiscoverCodebase).mockResolvedValue({ success: true, data: { query_text: 'test', keywords: ['test'], matches: [] } } as any);
    vi.mocked(fsTools.handleList).mockResolvedValue({ success: true, data: { path: '.', entries: [] } } as any);
    vi.mocked(fsTools.handleTree).mockResolvedValue({ success: true, data: { path: '.', tree: '' } } as any);

    const writeMissingPath = await memoryFilesystem({ action: 'write', workspace_id: 'ws', content: 'abc' });
    const writeMissingContent = await memoryFilesystem({ action: 'write', workspace_id: 'ws', path: 'a.txt' });
    const searchMissingQuery = await memoryFilesystem({ action: 'search', workspace_id: 'ws' });
    const discoverMissingPrompt = await memoryFilesystem({ action: 'discover_codebase', workspace_id: 'ws' });

    expect(writeMissingPath.success).toBe(false);
    expect(writeMissingContent.success).toBe(false);
    expect(searchMissingQuery.success).toBe(false);
    expect(discoverMissingPrompt.success).toBe(false);

    const writeResult = await memoryFilesystem({ action: 'write', workspace_id: 'ws', path: 'a.txt', content: 'abc', create_dirs: false });
    expect(writeResult.success).toBe(true);
    expect(fsTools.handleWrite).toHaveBeenCalledWith({
      workspace_id: 'ws',
      path: 'a.txt',
      content: 'abc',
      create_dirs: false,
    });

    const searchResult = await memoryFilesystem({ action: 'search', workspace_id: 'ws', regex: 'test', include: '*.ts' });
    expect(searchResult.success).toBe(true);
    expect(fsTools.handleSearch).toHaveBeenCalledWith({ workspace_id: 'ws', pattern: undefined, regex: 'test', include: '*.ts' });

    const discoverResult = await memoryFilesystem({ action: 'discover_codebase', workspace_id: 'ws', prompt_text: 'test prompt', task_text: 'rank files', limit: 5 });
    expect(discoverResult.success).toBe(true);
    expect(fsTools.handleDiscoverCodebase).toHaveBeenCalledWith({
      workspace_id: 'ws',
      prompt_text: 'test prompt',
      task_text: 'rank files',
      limit: 5,
    });

    const listResult = await memoryFilesystem({ action: 'list', workspace_id: 'ws', path: 'src', recursive: true });
    expect(listResult.success).toBe(true);
    expect(fsTools.handleList).toHaveBeenCalledWith({ workspace_id: 'ws', path: 'src', recursive: true });

    const treeResult = await memoryFilesystem({ action: 'tree', workspace_id: 'ws', path: 'src', max_depth: 2 });
    expect(treeResult.success).toBe(true);
    expect(fsTools.handleTree).toHaveBeenCalledWith({ workspace_id: 'ws', path: 'src', max_depth: 2 });
  });

  it('routes delete/move/copy/append/exists and enforces action-specific params', async () => {
    vi.mocked(fsTools.handleDelete).mockResolvedValue({ success: true, data: { path: 'a.txt', type: 'file', deleted: true } } as any);
    vi.mocked(fsTools.handleMove).mockResolvedValue({ success: true, data: { source: 'a.txt', destination: 'b.txt', overwritten: false, moved: true } } as any);
    vi.mocked(fsTools.handleCopy).mockResolvedValue({ success: true, data: { source: 'a.txt', destination: 'b.txt', bytes_copied: 1, overwritten: false } } as any);
    vi.mocked(fsTools.handleAppend).mockResolvedValue({ success: true, data: { path: 'a.txt', bytes_appended: 1 } } as any);
    vi.mocked(fsTools.handleExists).mockResolvedValue({ success: true, data: { path: 'a.txt', exists: true, type: 'file' } } as any);

    const deleteMissingPath = await memoryFilesystem({ action: 'delete', workspace_id: 'ws' });
    const moveMissingSource = await memoryFilesystem({ action: 'move', workspace_id: 'ws', destination: 'b.txt' });
    const copyMissingDestination = await memoryFilesystem({ action: 'copy', workspace_id: 'ws', source: 'a.txt' });
    const appendMissingContent = await memoryFilesystem({ action: 'append', workspace_id: 'ws', path: 'a.txt' });
    const existsMissingPath = await memoryFilesystem({ action: 'exists', workspace_id: 'ws' });

    expect(deleteMissingPath.success).toBe(false);
    expect(moveMissingSource.success).toBe(false);
    expect(copyMissingDestination.success).toBe(false);
    expect(appendMissingContent.success).toBe(false);
    expect(existsMissingPath.success).toBe(false);

    const deleteResult = await memoryFilesystem({ action: 'delete', workspace_id: 'ws', path: 'a.txt', confirm: true, dry_run: true });
    expect(deleteResult.success).toBe(true);
    expect(fsTools.handleDelete).toHaveBeenCalledWith({ workspace_id: 'ws', path: 'a.txt', confirm: true, dry_run: true });

    const moveResult = await memoryFilesystem({ action: 'move', workspace_id: 'ws', source: 'a.txt', destination: 'b.txt', overwrite: true, dry_run: true });
    expect(moveResult.success).toBe(true);
    expect(fsTools.handleMove).toHaveBeenCalledWith({ workspace_id: 'ws', source: 'a.txt', destination: 'b.txt', overwrite: true, dry_run: true });

    const copyResult = await memoryFilesystem({ action: 'copy', workspace_id: 'ws', source: 'a.txt', destination: 'b.txt', overwrite: false });
    expect(copyResult.success).toBe(true);
    expect(fsTools.handleCopy).toHaveBeenCalledWith({ workspace_id: 'ws', source: 'a.txt', destination: 'b.txt', overwrite: false });

    const appendResult = await memoryFilesystem({ action: 'append', workspace_id: 'ws', path: 'a.txt', content: 'z' });
    expect(appendResult.success).toBe(true);
    expect(fsTools.handleAppend).toHaveBeenCalledWith({ workspace_id: 'ws', path: 'a.txt', content: 'z' });

    const existsResult = await memoryFilesystem({ action: 'exists', workspace_id: 'ws', path: 'a.txt' });
    expect(existsResult.success).toBe(true);
    expect(fsTools.handleExists).toHaveBeenCalledWith({ workspace_id: 'ws', path: 'a.txt' });
  });

  it('returns unknown action error for unsupported action values', async () => {
    const result = await memoryFilesystem({ action: 'invalid' as any, workspace_id: 'ws' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action: invalid');
  });
});
