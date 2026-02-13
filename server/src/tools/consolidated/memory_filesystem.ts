/**
 * Consolidated Filesystem Tool - memory_filesystem
 * 
 * Actions: read, write, search, list, tree
 * Provides workspace-scoped filesystem operations with safety boundaries.
 */

import type { ToolResponse } from '../../types/index.js';
import {
  handleRead,
  handleWrite,
  handleSearch,
  handleList,
  handleTree,
  type FileReadResult,
  type FileWriteResult,
  type FileSearchResult,
  type FileListResult,
  type FileTreeResult,
} from '../filesystem.tools.js';

export type FilesystemAction = 'read' | 'write' | 'search' | 'list' | 'tree';

export interface MemoryFilesystemParams {
  action: FilesystemAction;
  workspace_id: string;

  // For read, write, list, tree
  path?: string;

  // For write
  content?: string;
  create_dirs?: boolean; // auto-create parent directories (default true)

  // For search
  pattern?: string;      // glob pattern
  regex?: string;        // regex pattern (alternative to glob)
  include?: string;      // file include pattern (e.g. "*.ts")

  // For list, tree
  recursive?: boolean;
  max_depth?: number;    // default 3 for tree
}

type FilesystemResult =
  | { action: 'read'; data: FileReadResult }
  | { action: 'write'; data: FileWriteResult }
  | { action: 'search'; data: FileSearchResult }
  | { action: 'list'; data: FileListResult }
  | { action: 'tree'; data: FileTreeResult };

export async function memoryFilesystem(params: MemoryFilesystemParams): Promise<ToolResponse<FilesystemResult>> {
  const { action, workspace_id } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: read, write, search, list, tree',
    };
  }

  if (!workspace_id) {
    return {
      success: false,
      error: 'workspace_id is required for all filesystem actions',
    };
  }

  switch (action) {
    case 'read': {
      if (!params.path) {
        return { success: false, error: 'path is required for action: read' };
      }
      const result = await handleRead({
        workspace_id,
        path: params.path,
      });
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: { action: 'read', data: result.data! } };
    }

    case 'write': {
      if (!params.path) {
        return { success: false, error: 'path is required for action: write' };
      }
      if (params.content === undefined) {
        return { success: false, error: 'content is required for action: write' };
      }
      const result = await handleWrite({
        workspace_id,
        path: params.path,
        content: params.content,
        create_dirs: params.create_dirs,
      });
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: { action: 'write', data: result.data! } };
    }

    case 'search': {
      if (!params.pattern && !params.regex) {
        return { success: false, error: 'pattern or regex is required for action: search' };
      }
      const result = await handleSearch({
        workspace_id,
        pattern: params.pattern,
        regex: params.regex,
        include: params.include,
      });
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: { action: 'search', data: result.data! } };
    }

    case 'list': {
      const result = await handleList({
        workspace_id,
        path: params.path,
        recursive: params.recursive,
      });
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: { action: 'list', data: result.data! } };
    }

    case 'tree': {
      const result = await handleTree({
        workspace_id,
        path: params.path,
        max_depth: params.max_depth,
      });
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: { action: 'tree', data: result.data! } };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: read, write, search, list, tree`,
      };
  }
}
