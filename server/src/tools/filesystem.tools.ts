/**
 * Filesystem Tools — workspace-scoped file operations
 *
 * Path validation, traversal checking, and sensitive file detection are in
 * ./filesystem-safety.ts to keep this module focused on action handlers.
 */

import { writeFile, readdir, stat, mkdir, open as fsOpen } from 'node:fs/promises';
import { relative, join, basename, dirname } from 'node:path';
import type { ToolResponse } from '../types/index.js';
import {
  resolveWorkspaceRoot,
  validatePath,
  isSensitivePath,
  walkDir,
  buildTree,
  MAX_READ_BYTES,
  MAX_TREE_DEPTH,
  MAX_SEARCH_RESULTS,
} from './filesystem-safety.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileReadResult {
  path: string;
  content: string;
  size: number;
  truncated: boolean;
  warning?: string;
}

export interface FileWriteResult {
  path: string;
  bytes_written: number;
  created: boolean;
}

export interface FileSearchResult {
  pattern: string;
  matches: Array<{ path: string; type: 'file' | 'directory' }>;
  total: number;
  truncated: boolean;
}

export interface FileListResult {
  path: string;
  entries: Array<{
    name: string;
    type: 'file' | 'directory' | 'symlink' | 'other';
    size?: number;
  }>;
}

export interface FileTreeResult {
  path: string;
  tree: string;
  depth: number;
  total_entries: number;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleRead(params: {
  workspace_id: string;
  path: string;
}): Promise<ToolResponse<FileReadResult>> {
  const root = await resolveWorkspaceRoot(params.workspace_id);
  if (!root) {
    return { success: false, error: `Workspace not found: ${params.workspace_id}` };
  }

  const validation = validatePath(root, params.path);
  if (!validation.ok) return { success: false, error: validation.error };

  if (isSensitivePath(validation.resolved)) {
    return { success: false, error: `Access denied: "${params.path}" matches a sensitive file pattern.` };
  }

  try {
    const stats = await stat(validation.resolved);

    if (!stats.isFile()) {
      return { success: false, error: `Not a file: "${params.path}". Use list or tree for directories.` };
    }

    let warning: string | undefined;
    if (stats.size > MAX_READ_BYTES) {
      warning = `File is ${(stats.size / 1024 / 1024).toFixed(1)}MB — only the first 1MB is returned.`;
    }

    const buffer = Buffer.alloc(Math.min(stats.size, MAX_READ_BYTES));
    const fileHandle = await fsOpen(validation.resolved, 'r');
    try {
      await fileHandle.read(buffer, 0, buffer.length, 0);
    } finally {
      await fileHandle.close();
    }

    return {
      success: true,
      data: {
        path: relative(root, validation.resolved),
        content: buffer.toString('utf-8'),
        size: stats.size,
        truncated: stats.size > MAX_READ_BYTES,
        warning,
      },
    };
  } catch (err) {
    return { success: false, error: `Failed to read file: ${(err as Error).message}` };
  }
}

export async function handleWrite(params: {
  workspace_id: string;
  path: string;
  content: string;
  create_dirs?: boolean;
}): Promise<ToolResponse<FileWriteResult>> {
  const root = await resolveWorkspaceRoot(params.workspace_id);
  if (!root) {
    return { success: false, error: `Workspace not found: ${params.workspace_id}` };
  }

  const validation = validatePath(root, params.path);
  if (!validation.ok) return { success: false, error: validation.error };

  if (isSensitivePath(validation.resolved)) {
    return { success: false, error: `Write denied: "${params.path}" matches a sensitive file pattern.` };
  }

  try {
    let created = false;
    try {
      await stat(validation.resolved);
    } catch {
      created = true;
    }

    if (params.create_dirs !== false) {
      await mkdir(dirname(validation.resolved), { recursive: true });
    }

    await writeFile(validation.resolved, params.content, 'utf-8');

    return {
      success: true,
      data: {
        path: relative(root, validation.resolved),
        bytes_written: Buffer.byteLength(params.content, 'utf-8'),
        created,
      },
    };
  } catch (err) {
    return { success: false, error: `Failed to write file: ${(err as Error).message}` };
  }
}

export async function handleSearch(params: {
  workspace_id: string;
  pattern?: string;
  regex?: string;
  include?: string;
}): Promise<ToolResponse<FileSearchResult>> {
  const root = await resolveWorkspaceRoot(params.workspace_id);
  if (!root) {
    return { success: false, error: `Workspace not found: ${params.workspace_id}` };
  }

  const searchPattern = params.pattern || params.regex || '*';
  const matches: Array<{ path: string; type: 'file' | 'directory' }> = [];

  try {
    // Use recursive readdir to find matching files
    const isRegex = !!params.regex;
    let re: RegExp | null = null;
    if (isRegex) {
      try {
        re = new RegExp(params.regex!, 'i');
      } catch {
        return { success: false, error: `Invalid regex pattern: ${params.regex}` };
      }
    }

    // Include filter (e.g. "*.ts")
    let includeRe: RegExp | null = null;
    if (params.include) {
      const escaped = params.include
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      includeRe = new RegExp(`^${escaped}$`, 'i');
    }

    await walkDir(root, root, (relPath, isDir) => {
      if (matches.length >= MAX_SEARCH_RESULTS) return false;

      // Skip common directories
      const firstSegment = relPath.split(/[/\\]/)[0];
      if (firstSegment === 'node_modules' || firstSegment === '.git') return false;

      const name = basename(relPath);

      // Apply include filter
      if (includeRe && !isDir && !includeRe.test(name)) return true;

      // Apply search pattern
      let matched = false;
      if (re) {
        matched = re.test(relPath);
      } else {
        // Glob-like matching: convert * to .*, ? to .
        const globEscaped = searchPattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.');
        const globRe = new RegExp(globEscaped, 'i');
        matched = globRe.test(name) || globRe.test(relPath);
      }

      if (matched) {
        matches.push({
          path: relPath.replace(/\\/g, '/'),
          type: isDir ? 'directory' : 'file',
        });
      }

      return true; // continue walking
    });

    return {
      success: true,
      data: {
        pattern: searchPattern,
        matches,
        total: matches.length,
        truncated: matches.length >= MAX_SEARCH_RESULTS,
      },
    };
  } catch (err) {
    return { success: false, error: `Search failed: ${(err as Error).message}` };
  }
}

export async function handleList(params: {
  workspace_id: string;
  path?: string;
  recursive?: boolean;
}): Promise<ToolResponse<FileListResult>> {
  const root = await resolveWorkspaceRoot(params.workspace_id);
  if (!root) {
    return { success: false, error: `Workspace not found: ${params.workspace_id}` };
  }

  const validation = validatePath(root, params.path || '.');
  if (!validation.ok) return { success: false, error: validation.error };

  try {
    const dirEntries = await readdir(validation.resolved, { withFileTypes: true });
    const entries: FileListResult['entries'] = [];

    for (const entry of dirEntries) {
      let type: 'file' | 'directory' | 'symlink' | 'other' = 'other';
      let size: number | undefined;

      if (entry.isFile()) {
        type = 'file';
        try {
          const s = await stat(join(validation.resolved, entry.name));
          size = s.size;
        } catch { /* ignore */ }
      } else if (entry.isDirectory()) {
        type = 'directory';
      } else if (entry.isSymbolicLink()) {
        type = 'symlink';
      }

      entries.push({ name: entry.name, type, size });
    }

    // Sort: directories first, then files
    entries.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    return {
      success: true,
      data: {
        path: relative(root, validation.resolved) || '.',
        entries,
      },
    };
  } catch (err) {
    return { success: false, error: `Failed to list directory: ${(err as Error).message}` };
  }
}

export async function handleTree(params: {
  workspace_id: string;
  path?: string;
  max_depth?: number;
}): Promise<ToolResponse<FileTreeResult>> {
  const root = await resolveWorkspaceRoot(params.workspace_id);
  if (!root) {
    return { success: false, error: `Workspace not found: ${params.workspace_id}` };
  }

  const validation = validatePath(root, params.path || '.');
  if (!validation.ok) return { success: false, error: validation.error };

  const maxDepth = Math.min(params.max_depth || 3, MAX_TREE_DEPTH);
  const lines: string[] = [];
  let totalEntries = 0;

  try {
    const rootName = params.path ? basename(validation.resolved) : basename(root);
    lines.push(rootName + '/');

    await buildTree(validation.resolved, '', 0, maxDepth, lines, { count: 0 });
    totalEntries = lines.length - 1;

    return {
      success: true,
      data: {
        path: relative(root, validation.resolved) || '.',
        tree: lines.join('\n'),
        depth: maxDepth,
        total_entries: totalEntries,
      },
    };
  } catch (err) {
    return { success: false, error: `Failed to build tree: ${(err as Error).message}` };
  }
}


