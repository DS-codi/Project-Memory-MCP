/**
 * Consolidated Filesystem Tool - memory_filesystem
 * 
 * Actions: read, write, search, list, tree, delete, move, copy, append, exists
 * Provides workspace-scoped filesystem operations with safety boundaries.
 */

import type { ToolResponse } from '../../types/index.js';
import {
  handleRead,
  handleWrite,
  handleSearch,
  handleList,
  handleTree,
  handleDelete,
  handleMove,
  handleCopy,
  handleAppend,
  handleExists,
  type FileReadResult,
  type FileWriteResult,
  type FileSearchResult,
  type FileListResult,
  type FileTreeResult,
  type FileDeleteResult,
  type FileDeletePreviewResult,
  type FileMoveResult,
  type FileMovePreviewResult,
  type FileCopyResult,
  type FileAppendResult,
  type FileExistsResult,
} from '../filesystem.tools.js';

export type FilesystemAction = 'read' | 'write' | 'search' | 'list' | 'tree' | 'delete' | 'move' | 'copy' | 'append' | 'exists';

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

  // For delete
  confirm?: boolean;
  dry_run?: boolean;

  // For move, copy
  source?: string;
  destination?: string;
  overwrite?: boolean;

  // For list, tree
  recursive?: boolean;
  max_depth?: number;    // default 3 for tree
}

type FilesystemResult =
  | { action: 'read'; data: FileReadResult }
  | { action: 'write'; data: FileWriteResult }
  | { action: 'search'; data: FileSearchResult }
  | { action: 'list'; data: FileListResult }
  | { action: 'tree'; data: FileTreeResult }
  | { action: 'delete'; data: FileDeleteResult | FileDeletePreviewResult }
  | { action: 'move'; data: FileMoveResult | FileMovePreviewResult }
  | { action: 'copy'; data: FileCopyResult }
  | { action: 'append'; data: FileAppendResult }
  | { action: 'exists'; data: FileExistsResult };

export async function memoryFilesystem(params: MemoryFilesystemParams): Promise<ToolResponse<FilesystemResult>> {
  const { action, workspace_id } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: read, write, search, list, tree, delete, move, copy, append, exists',
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

    case 'delete': {
      if (!params.path) {
        return { success: false, error: 'path is required for action: delete' };
      }
      const result = await handleDelete({
        workspace_id,
        path: params.path,
        confirm: params.confirm,
        dry_run: params.dry_run,
      });
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: { action: 'delete', data: result.data! } };
    }

    case 'move': {
      if (!params.source) {
        return { success: false, error: 'source is required for action: move' };
      }
      if (!params.destination) {
        return { success: false, error: 'destination is required for action: move' };
      }
      const result = await handleMove({
        workspace_id,
        source: params.source,
        destination: params.destination,
        overwrite: params.overwrite,
        dry_run: params.dry_run,
      });
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: { action: 'move', data: result.data! } };
    }

    case 'copy': {
      if (!params.source) {
        return { success: false, error: 'source is required for action: copy' };
      }
      if (!params.destination) {
        return { success: false, error: 'destination is required for action: copy' };
      }
      const result = await handleCopy({
        workspace_id,
        source: params.source,
        destination: params.destination,
        overwrite: params.overwrite,
      });
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: { action: 'copy', data: result.data! } };
    }

    case 'append': {
      if (!params.path) {
        return { success: false, error: 'path is required for action: append' };
      }
      if (params.content === undefined) {
        return { success: false, error: 'content is required for action: append' };
      }
      const result = await handleAppend({
        workspace_id,
        path: params.path,
        content: params.content,
      });
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: { action: 'append', data: result.data! } };
    }

    case 'exists': {
      if (!params.path) {
        return { success: false, error: 'path is required for action: exists' };
      }
      const result = await handleExists({
        workspace_id,
        path: params.path,
      });
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: { action: 'exists', data: result.data! } };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: read, write, search, list, tree, delete, move, copy, append, exists`,
      };
  }
}
