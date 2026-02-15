/**
 * Filesystem Tools — workspace-scoped file operations
 *
 * Path validation, traversal checking, and sensitive file detection are in
 * ./filesystem-safety.ts to keep this module focused on action handlers.
 */

import { constants as fsConstants } from 'node:fs';
import {
  writeFile,
  readdir,
  stat,
  mkdir,
  open as fsOpen,
  unlink,
  rmdir,
  rename,
  copyFile,
  appendFile,
} from 'node:fs/promises';
import { relative, join, basename, dirname } from 'node:path';
import type { ToolResponse } from '../types/index.js';
import {
  resolveWorkspaceRoot,
  validatePath,
  isSensitivePath,
  enforceSymlinkPolicy,
  walkDir,
  SKIP_DIRS,
  buildTree,
  MAX_READ_BYTES,
  MAX_WRITE_BYTES,
  MAX_APPEND_BYTES,
  MAX_TREE_DEPTH,
  MAX_SEARCH_RESULTS,
  MAX_LIST_RESULTS,
  MAX_TREE_ENTRIES,
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
  limit: number;
}

export interface FileListResult {
  path: string;
  entries: Array<{
    name: string;
    path?: string;
    type: 'file' | 'directory' | 'symlink' | 'other';
    size?: number;
  }>;
  total: number;
  truncated: boolean;
  limit: number;
}

export interface FileTreeResult {
  path: string;
  tree: string;
  depth: number;
  total_entries: number;
  truncated: boolean;
  limit: number;
}

export interface FilesystemAuditEvent {
  event_type: 'filesystem_destructive_op';
  action: 'delete' | 'move';
  workspace_id: string;
  path?: string;
  source?: string;
  destination?: string;
  dry_run: boolean;
  outcome: 'success' | 'noop' | 'error';
  reason: string;
  timestamp: string;
  run_context: {
    process_id: number;
    session_id: string | null;
    agent_type: string | null;
  };
}

export interface FileDeletePreviewResult {
  path: string;
  type: 'file' | 'directory' | null;
  would_delete: boolean;
  dry_run: true;
  audit_event: FilesystemAuditEvent;
}

export interface FileMovePreviewResult {
  source: string;
  destination: string;
  would_move: boolean;
  destination_exists: boolean;
  dry_run: true;
  audit_event: FilesystemAuditEvent;
}

export interface FileDeleteResult {
  path: string;
  type: 'file' | 'directory';
  deleted: boolean;
  audit_event: FilesystemAuditEvent;
}

export interface FileMoveResult {
  source: string;
  destination: string;
  overwritten: boolean;
  moved: boolean;
  audit_event: FilesystemAuditEvent;
}

function fsError(code: string, message: string): ToolResponse<never> {
  return { success: false, error: `${code}: ${message}` };
}

function fsErrorWithAudit(
  code: string,
  message: string,
  auditEvent: FilesystemAuditEvent,
): ToolResponse<never> {
  return {
    success: false,
    error: `${code}: ${message}`,
    audit_event: auditEvent,
  } as ToolResponse<never>;
}

function makeAuditEvent(params: {
  action: 'delete' | 'move';
  workspace_id: string;
  path?: string;
  source?: string;
  destination?: string;
  dry_run: boolean;
  outcome: 'success' | 'noop' | 'error';
  reason: string;
}): FilesystemAuditEvent {
  return {
    event_type: 'filesystem_destructive_op',
    action: params.action,
    workspace_id: params.workspace_id,
    path: params.path,
    source: params.source,
    destination: params.destination,
    dry_run: params.dry_run,
    outcome: params.outcome,
    reason: params.reason,
    timestamp: new Date().toISOString(),
    run_context: {
      process_id: process.pid,
      session_id: process.env.MBS_SESSION_ID ?? null,
      agent_type: process.env.MBS_AGENT_TYPE ?? null,
    },
  };
}

export interface FileCopyResult {
  source: string;
  destination: string;
  bytes_copied: number;
  overwritten: boolean;
}

export interface FileAppendResult {
  path: string;
  bytes_appended: number;
}

export interface FileExistsResult {
  path: string;
  exists: boolean;
  type: 'file' | 'directory' | null;
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

  const symlinkCheck = await enforceSymlinkPolicy(root, validation.resolved);
  if (!symlinkCheck.ok) return fsError('FS_SYMLINK_POLICY_VIOLATION', symlinkCheck.error);

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

  const symlinkCheck = await enforceSymlinkPolicy(root, validation.resolved, { allowMissingLeaf: true });
  if (!symlinkCheck.ok) return fsError('FS_SYMLINK_POLICY_VIOLATION', symlinkCheck.error);

  if (isSensitivePath(validation.resolved)) {
    return { success: false, error: `Write denied: "${params.path}" matches a sensitive file pattern.` };
  }

  const payloadBytes = Buffer.byteLength(params.content, 'utf-8');
  if (payloadBytes > MAX_WRITE_BYTES) {
    return fsError('FS_PAYLOAD_TOO_LARGE', `Write payload exceeds ${MAX_WRITE_BYTES} bytes.`);
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
        bytes_written: payloadBytes,
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

      // Skip configured directories if any path segment matches
      const pathSegments = relPath.split(/[/\\]/).filter(Boolean);
      if (pathSegments.some((segment) => SKIP_DIRS.has(segment))) return false;

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
        limit: MAX_SEARCH_RESULTS,
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

  const symlinkCheck = await enforceSymlinkPolicy(root, validation.resolved);
  if (!symlinkCheck.ok) return fsError('FS_SYMLINK_POLICY_VIOLATION', symlinkCheck.error);

  try {
    const entries: FileListResult['entries'] = [];
    let truncated = false;

    if (params.recursive) {
      await walkDir(validation.resolved, validation.resolved, (relPath, isDir) => {
        if (entries.length >= MAX_LIST_RESULTS) {
          truncated = true;
          return false;
        }

        const pathSegments = relPath.split(/[/\\]/).filter(Boolean);
        if (pathSegments.some((segment) => SKIP_DIRS.has(segment))) return false;

        const normalizedPath = relPath.replace(/\\/g, '/');
        const type: 'file' | 'directory' = isDir ? 'directory' : 'file';

        entries.push({
          name: basename(relPath),
          path: normalizedPath,
          type,
        });

        return true;
      });
    } else {
      const dirEntries = await readdir(validation.resolved, { withFileTypes: true });

      for (const entry of dirEntries) {
        if (entries.length >= MAX_LIST_RESULTS) {
          truncated = true;
          break;
        }

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
    }

    // Sort: directories first, then files
    entries.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return (a.path || a.name).localeCompare(b.path || b.name);
    });

    return {
      success: true,
      data: {
        path: relative(root, validation.resolved) || '.',
        entries,
        total: entries.length,
        truncated,
        limit: MAX_LIST_RESULTS,
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

  const symlinkCheck = await enforceSymlinkPolicy(root, validation.resolved);
  if (!symlinkCheck.ok) return fsError('FS_SYMLINK_POLICY_VIOLATION', symlinkCheck.error);

  const maxDepth = Math.min(params.max_depth || 3, MAX_TREE_DEPTH);
  const lines: string[] = [];
  let totalEntries = 0;

  try {
    const rootName = params.path ? basename(validation.resolved) : basename(root);
    lines.push(rootName + '/');

    const truncatedState = { value: false };
    await buildTree(validation.resolved, '', 0, maxDepth, lines, { count: 0 }, {
      maxEntries: MAX_TREE_ENTRIES,
      truncated: truncatedState,
    });
    totalEntries = lines.length - 1;

    return {
      success: true,
      data: {
        path: relative(root, validation.resolved) || '.',
        tree: lines.join('\n'),
        depth: maxDepth,
        total_entries: totalEntries,
        truncated: truncatedState.value,
        limit: MAX_TREE_ENTRIES,
      },
    };
  } catch (err) {
    return { success: false, error: `Failed to build tree: ${(err as Error).message}` };
  }
}

export async function handleDelete(params: {
  workspace_id: string;
  path: string;
  confirm?: boolean;
  dry_run?: boolean;
}): Promise<ToolResponse<FileDeleteResult | FileDeletePreviewResult>> {
  const root = await resolveWorkspaceRoot(params.workspace_id);
  if (!root) {
    return fsErrorWithAudit(
      'FS_WORKSPACE_NOT_FOUND',
      `Workspace not found: ${params.workspace_id}`,
      makeAuditEvent({
        action: 'delete',
        workspace_id: params.workspace_id,
        path: params.path,
        dry_run: params.dry_run === true,
        outcome: 'error',
        reason: 'workspace_not_found',
      }),
    );
  }

  const validation = validatePath(root, params.path);
  if (!validation.ok) {
    return fsErrorWithAudit(
      'FS_PATH_VALIDATION_FAILED',
      validation.error,
      makeAuditEvent({
        action: 'delete',
        workspace_id: params.workspace_id,
        path: params.path,
        dry_run: params.dry_run === true,
        outcome: 'error',
        reason: 'path_validation_failed',
      }),
    );
  }

  const normalizedPath = relative(root, validation.resolved).replace(/\\/g, '/');
  const symlinkCheck = await enforceSymlinkPolicy(root, validation.resolved, { allowMissingLeaf: true });
  if (!symlinkCheck.ok) {
    return fsErrorWithAudit(
      'FS_SYMLINK_POLICY_VIOLATION',
      symlinkCheck.error,
      makeAuditEvent({
        action: 'delete',
        workspace_id: params.workspace_id,
        path: normalizedPath,
        dry_run: params.dry_run === true,
        outcome: 'error',
        reason: 'symlink_policy_violation',
      }),
    );
  }

  if (isSensitivePath(validation.resolved)) {
    return fsErrorWithAudit(
      'FS_DELETE_SENSITIVE_PATH',
      `Delete denied: "${params.path}" matches a sensitive file pattern.`,
      makeAuditEvent({
        action: 'delete',
        workspace_id: params.workspace_id,
        path: normalizedPath,
        dry_run: params.dry_run === true,
        outcome: 'error',
        reason: 'sensitive_path_denied',
      }),
    );
  }

  const dryRun = params.dry_run === true;

  if (!dryRun && params.confirm !== true) {
    return fsErrorWithAudit(
      'FS_DELETE_CONFIRM_REQUIRED',
      'Delete requires confirm: true.',
      makeAuditEvent({
        action: 'delete',
        workspace_id: params.workspace_id,
        path: normalizedPath,
        dry_run: false,
        outcome: 'error',
        reason: 'confirm_required',
      }),
    );
  }

  try {
    const entry = await stat(validation.resolved);

    const resolvedType: 'file' | 'directory' | null = entry.isFile()
      ? 'file'
      : entry.isDirectory()
        ? 'directory'
        : null;

    if (dryRun) {
      return {
        success: true,
        data: {
          path: normalizedPath,
          type: resolvedType,
          would_delete: resolvedType !== null,
          dry_run: true,
          audit_event: makeAuditEvent({
            action: 'delete',
            workspace_id: params.workspace_id,
            path: normalizedPath,
            dry_run: true,
            outcome: resolvedType ? 'success' : 'error',
            reason: resolvedType ? 'preview' : 'unsupported_type',
          }),
        },
      };
    }

    if (entry.isFile()) {
      await unlink(validation.resolved);
      return {
        success: true,
        data: {
          path: normalizedPath,
          type: 'file',
          deleted: true,
          audit_event: makeAuditEvent({
            action: 'delete',
            workspace_id: params.workspace_id,
            path: normalizedPath,
            dry_run: false,
            outcome: 'success',
            reason: 'deleted_file',
          }),
        },
      };
    }

    if (entry.isDirectory()) {
      await rmdir(validation.resolved);
      return {
        success: true,
        data: {
          path: normalizedPath,
          type: 'directory',
          deleted: true,
          audit_event: makeAuditEvent({
            action: 'delete',
            workspace_id: params.workspace_id,
            path: normalizedPath,
            dry_run: false,
            outcome: 'success',
            reason: 'deleted_directory',
          }),
        },
      };
    }

    return fsErrorWithAudit(
      'FS_DELETE_UNSUPPORTED_TYPE',
      `Unsupported path type for delete: "${params.path}".`,
      makeAuditEvent({
        action: 'delete',
        workspace_id: params.workspace_id,
        path: normalizedPath,
        dry_run: dryRun,
        outcome: 'error',
        reason: 'unsupported_type',
      }),
    );
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      if (dryRun) {
        return {
          success: true,
          data: {
            path: normalizedPath,
            type: null,
            would_delete: false,
            dry_run: true,
            audit_event: makeAuditEvent({
              action: 'delete',
              workspace_id: params.workspace_id,
              path: normalizedPath,
              dry_run: true,
              outcome: 'noop',
              reason: 'already_missing',
            }),
          },
        };
      }

      return {
        success: true,
        data: {
          path: normalizedPath,
          type: 'file',
          deleted: false,
          audit_event: makeAuditEvent({
            action: 'delete',
            workspace_id: params.workspace_id,
            path: normalizedPath,
            dry_run: false,
            outcome: 'noop',
            reason: 'already_missing',
          }),
        },
      };
    }
    return fsErrorWithAudit(
      'FS_DELETE_FAILED',
      `Failed to delete path: ${error.message}`,
      makeAuditEvent({
        action: 'delete',
        workspace_id: params.workspace_id,
        path: normalizedPath,
        dry_run: dryRun,
        outcome: 'error',
        reason: 'delete_failed',
      }),
    );
  }
}

export async function handleMove(params: {
  workspace_id: string;
  source: string;
  destination: string;
  overwrite?: boolean;
  dry_run?: boolean;
}): Promise<ToolResponse<FileMoveResult | FileMovePreviewResult>> {
  const root = await resolveWorkspaceRoot(params.workspace_id);
  if (!root) {
    return fsErrorWithAudit(
      'FS_WORKSPACE_NOT_FOUND',
      `Workspace not found: ${params.workspace_id}`,
      makeAuditEvent({
        action: 'move',
        workspace_id: params.workspace_id,
        source: params.source,
        destination: params.destination,
        dry_run: params.dry_run === true,
        outcome: 'error',
        reason: 'workspace_not_found',
      }),
    );
  }

  const sourceValidation = validatePath(root, params.source);
  if (!sourceValidation.ok) {
    return fsErrorWithAudit(
      'FS_PATH_VALIDATION_FAILED',
      sourceValidation.error,
      makeAuditEvent({
        action: 'move',
        workspace_id: params.workspace_id,
        source: params.source,
        destination: params.destination,
        dry_run: params.dry_run === true,
        outcome: 'error',
        reason: 'source_path_validation_failed',
      }),
    );
  }

  const destinationValidation = validatePath(root, params.destination);
  if (!destinationValidation.ok) {
    return fsErrorWithAudit(
      'FS_PATH_VALIDATION_FAILED',
      destinationValidation.error,
      makeAuditEvent({
        action: 'move',
        workspace_id: params.workspace_id,
        source: params.source,
        destination: params.destination,
        dry_run: params.dry_run === true,
        outcome: 'error',
        reason: 'destination_path_validation_failed',
      }),
    );
  }

  const normalizedSource = relative(root, sourceValidation.resolved).replace(/\\/g, '/');
  const normalizedDestination = relative(root, destinationValidation.resolved).replace(/\\/g, '/');

  const sourceSymlinkCheck = await enforceSymlinkPolicy(root, sourceValidation.resolved);
  if (!sourceSymlinkCheck.ok) {
    return fsErrorWithAudit(
      'FS_SYMLINK_POLICY_VIOLATION',
      sourceSymlinkCheck.error,
      makeAuditEvent({
        action: 'move',
        workspace_id: params.workspace_id,
        source: normalizedSource,
        destination: normalizedDestination,
        dry_run: params.dry_run === true,
        outcome: 'error',
        reason: 'source_symlink_policy_violation',
      }),
    );
  }

  const destinationSymlinkCheck = await enforceSymlinkPolicy(root, destinationValidation.resolved, { allowMissingLeaf: true });
  if (!destinationSymlinkCheck.ok) {
    return fsErrorWithAudit(
      'FS_SYMLINK_POLICY_VIOLATION',
      destinationSymlinkCheck.error,
      makeAuditEvent({
        action: 'move',
        workspace_id: params.workspace_id,
        source: normalizedSource,
        destination: normalizedDestination,
        dry_run: params.dry_run === true,
        outcome: 'error',
        reason: 'destination_symlink_policy_violation',
      }),
    );
  }

  if (isSensitivePath(sourceValidation.resolved) || isSensitivePath(destinationValidation.resolved)) {
    return fsErrorWithAudit(
      'FS_MOVE_SENSITIVE_PATH',
      'Move denied: source or destination matches a sensitive file pattern.',
      makeAuditEvent({
        action: 'move',
        workspace_id: params.workspace_id,
        source: normalizedSource,
        destination: normalizedDestination,
        dry_run: params.dry_run === true,
        outcome: 'error',
        reason: 'sensitive_path_denied',
      }),
    );
  }

  if (sourceValidation.resolved === destinationValidation.resolved) {
    return {
      success: true,
      data: {
        source: normalizedSource,
        destination: normalizedDestination,
        overwritten: false,
        moved: false,
        audit_event: makeAuditEvent({
          action: 'move',
          workspace_id: params.workspace_id,
          source: normalizedSource,
          destination: normalizedDestination,
          dry_run: false,
          outcome: 'noop',
          reason: 'same_path_noop',
        }),
      },
    };
  }

  const overwrite = params.overwrite === true;
  const dryRun = params.dry_run === true;
  let destinationExists = false;

  try {
    await stat(sourceValidation.resolved);
  } catch {
    return fsErrorWithAudit(
      'FS_MOVE_SOURCE_MISSING',
      `Source does not exist: "${params.source}".`,
      makeAuditEvent({
        action: 'move',
        workspace_id: params.workspace_id,
        source: normalizedSource,
        destination: normalizedDestination,
        dry_run: params.dry_run === true,
        outcome: 'error',
        reason: 'source_missing',
      }),
    );
  }

  try {
    await stat(destinationValidation.resolved);
    destinationExists = true;
  } catch {
    destinationExists = false;
  }

  if (destinationExists && !overwrite) {
    return fsErrorWithAudit(
      'FS_MOVE_DESTINATION_EXISTS',
      `Destination already exists: "${params.destination}". Set overwrite: true to replace it.`,
      makeAuditEvent({
        action: 'move',
        workspace_id: params.workspace_id,
        source: normalizedSource,
        destination: normalizedDestination,
        dry_run: dryRun,
        outcome: 'error',
        reason: 'destination_exists',
      }),
    );
  }

  if (dryRun) {
    return {
      success: true,
      data: {
        source: normalizedSource,
        destination: normalizedDestination,
        would_move: true,
        destination_exists: destinationExists,
        dry_run: true,
        audit_event: makeAuditEvent({
          action: 'move',
          workspace_id: params.workspace_id,
          source: normalizedSource,
          destination: normalizedDestination,
          dry_run: true,
          outcome: 'success',
          reason: destinationExists ? 'preview_overwrite' : 'preview',
        }),
      },
    };
  }

  try {
    await rename(sourceValidation.resolved, destinationValidation.resolved);
    return {
      success: true,
      data: {
        source: normalizedSource,
        destination: normalizedDestination,
        overwritten: destinationExists,
        moved: true,
        audit_event: makeAuditEvent({
          action: 'move',
          workspace_id: params.workspace_id,
          source: normalizedSource,
          destination: normalizedDestination,
          dry_run: false,
          outcome: 'success',
          reason: destinationExists ? 'moved_overwrite' : 'moved',
        }),
      },
    };
  } catch (err) {
    return fsErrorWithAudit(
      'FS_MOVE_FAILED',
      `Failed to move path: ${(err as Error).message}`,
      makeAuditEvent({
        action: 'move',
        workspace_id: params.workspace_id,
        source: normalizedSource,
        destination: normalizedDestination,
        dry_run: dryRun,
        outcome: 'error',
        reason: 'move_failed',
      }),
    );
  }
}

export async function handleCopy(params: {
  workspace_id: string;
  source: string;
  destination: string;
  overwrite?: boolean;
}): Promise<ToolResponse<FileCopyResult>> {
  const root = await resolveWorkspaceRoot(params.workspace_id);
  if (!root) {
    return { success: false, error: `Workspace not found: ${params.workspace_id}` };
  }

  const sourceValidation = validatePath(root, params.source);
  if (!sourceValidation.ok) return { success: false, error: sourceValidation.error };

  const destinationValidation = validatePath(root, params.destination);
  if (!destinationValidation.ok) return { success: false, error: destinationValidation.error };

  const sourceSymlinkCheck = await enforceSymlinkPolicy(root, sourceValidation.resolved);
  if (!sourceSymlinkCheck.ok) return fsError('FS_SYMLINK_POLICY_VIOLATION', sourceSymlinkCheck.error);

  const destinationSymlinkCheck = await enforceSymlinkPolicy(root, destinationValidation.resolved, { allowMissingLeaf: true });
  if (!destinationSymlinkCheck.ok) return fsError('FS_SYMLINK_POLICY_VIOLATION', destinationSymlinkCheck.error);

  if (isSensitivePath(sourceValidation.resolved) || isSensitivePath(destinationValidation.resolved)) {
    return fsError('FS_COPY_SENSITIVE_PATH', 'Copy denied: source or destination matches a sensitive file pattern.');
  }

  if (sourceValidation.resolved === destinationValidation.resolved) {
    return fsError('FS_COPY_SAME_PATH', 'Copy requires different source and destination paths.');
  }

  let sourceStats;
  try {
    sourceStats = await stat(sourceValidation.resolved);
  } catch {
    return fsError('FS_COPY_SOURCE_MISSING', `Source does not exist: "${params.source}".`);
  }

  if (!sourceStats.isFile()) {
    return fsError('FS_COPY_SOURCE_NOT_FILE', `Copy only supports files. Not a file: "${params.source}".`);
  }

  const overwrite = params.overwrite === true;
  let destinationExists = false;
  try {
    await stat(destinationValidation.resolved);
    destinationExists = true;
  } catch {
    destinationExists = false;
  }

  if (destinationExists && !overwrite) {
    return fsError('FS_COPY_DESTINATION_EXISTS', `Destination already exists: "${params.destination}". Set overwrite: true to replace it.`);
  }

  try {
    await mkdir(dirname(destinationValidation.resolved), { recursive: true });
    await copyFile(
      sourceValidation.resolved,
      destinationValidation.resolved,
      overwrite ? 0 : fsConstants.COPYFILE_EXCL,
    );
    const normalizedSource = relative(root, sourceValidation.resolved).replace(/\\/g, '/');
    const normalizedDestination = relative(root, destinationValidation.resolved).replace(/\\/g, '/');

    return {
      success: true,
      data: {
        source: normalizedSource,
        destination: normalizedDestination,
        bytes_copied: sourceStats.size,
        overwritten: destinationExists,
      },
    };
  } catch (err) {
    return fsError('FS_COPY_FAILED', `Failed to copy file: ${(err as Error).message}`);
  }
}

export async function handleAppend(params: {
  workspace_id: string;
  path: string;
  content: string;
}): Promise<ToolResponse<FileAppendResult>> {
  const root = await resolveWorkspaceRoot(params.workspace_id);
  if (!root) {
    return { success: false, error: `Workspace not found: ${params.workspace_id}` };
  }

  const validation = validatePath(root, params.path);
  if (!validation.ok) return { success: false, error: validation.error };

  const symlinkCheck = await enforceSymlinkPolicy(root, validation.resolved);
  if (!symlinkCheck.ok) return fsError('FS_SYMLINK_POLICY_VIOLATION', symlinkCheck.error);

  if (isSensitivePath(validation.resolved)) {
    return fsError('FS_APPEND_SENSITIVE_PATH', `Append denied: "${params.path}" matches a sensitive file pattern.`);
  }

  const payloadBytes = Buffer.byteLength(params.content, 'utf-8');
  if (payloadBytes > MAX_APPEND_BYTES) {
    return fsError('FS_PAYLOAD_TOO_LARGE', `Append payload exceeds ${MAX_APPEND_BYTES} bytes.`);
  }

  try {
    const entry = await stat(validation.resolved);
    if (!entry.isFile()) {
      return fsError('FS_APPEND_TARGET_NOT_FILE', `Not a file: "${params.path}".`);
    }
  } catch {
    return fsError('FS_APPEND_TARGET_MISSING', `Cannot append: file does not exist: "${params.path}".`);
  }

  try {
    await appendFile(validation.resolved, params.content, 'utf-8');
    const normalizedPath = relative(root, validation.resolved).replace(/\\/g, '/');
    return {
      success: true,
      data: {
        path: normalizedPath,
        bytes_appended: payloadBytes,
      },
    };
  } catch (err) {
    return fsError('FS_APPEND_FAILED', `Failed to append file: ${(err as Error).message}`);
  }
}

export async function handleExists(params: {
  workspace_id: string;
  path: string;
}): Promise<ToolResponse<FileExistsResult>> {
  const root = await resolveWorkspaceRoot(params.workspace_id);
  if (!root) {
    return { success: false, error: `Workspace not found: ${params.workspace_id}` };
  }

  const validation = validatePath(root, params.path);
  if (!validation.ok) return { success: false, error: validation.error };

  const symlinkCheck = await enforceSymlinkPolicy(root, validation.resolved, { allowMissingLeaf: true });
  if (!symlinkCheck.ok) return fsError('FS_SYMLINK_POLICY_VIOLATION', symlinkCheck.error);

  const normalizedPath = relative(root, validation.resolved).replace(/\\/g, '/');

  try {
    const entry = await stat(validation.resolved);
    let type: 'file' | 'directory' | null = null;
    if (entry.isFile()) type = 'file';
    else if (entry.isDirectory()) type = 'directory';

    return {
      success: true,
      data: {
        path: normalizedPath,
        exists: true,
        type,
      },
    };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      return {
        success: true,
        data: {
          path: normalizedPath,
          exists: false,
          type: null,
        },
      };
    }

    return {
      success: false,
      error: `Failed to check path existence: ${error.message}`,
    };
  }
}


