/**
 * Filesystem Safety — path validation, traversal checks, and sensitive file detection
 *
 * Extracted from filesystem.tools.ts (MAJ-3) so that module focuses on
 * action handlers (read, write, search, list, tree) while this module owns
 * all safety-boundary logic.
 */

import { resolve, relative, basename, join, sep } from 'node:path';
import { readdir, stat, lstat, realpath } from 'node:fs/promises';
import * as store from '../storage/file-store.js';
import { resolveToContainerPath, isContainerEnvironment } from '../storage/workspace-mounts.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export const MAX_READ_BYTES = 1024 * 1024; // 1MB warning threshold
export const MAX_WRITE_BYTES = parsePositiveIntEnv('MCP_FILESYSTEM_MAX_WRITE_BYTES', 256 * 1024);
export const MAX_APPEND_BYTES = parsePositiveIntEnv('MCP_FILESYSTEM_MAX_APPEND_BYTES', 256 * 1024);
export const MAX_TREE_DEPTH = 10;
export const MAX_SEARCH_RESULTS = parsePositiveIntEnv('MCP_FILESYSTEM_MAX_SEARCH_RESULTS', 200);
export const MAX_LIST_RESULTS = parsePositiveIntEnv('MCP_FILESYSTEM_MAX_LIST_RESULTS', 500);
export const MAX_TREE_ENTRIES = parsePositiveIntEnv('MCP_FILESYSTEM_MAX_TREE_ENTRIES', 500);

/** Patterns that are always blocked from read/write */
const SENSITIVE_PATTERNS = [
  '.env',
  '.env.local',
  '.env.production',
  '.git/config',
  '.git/credentials',
  'node_modules/.cache',
  'id_rsa',
  'id_ed25519',
  '.pem',
  '.key',
  '.p12',
  '.pfx',
];

/** Directories skipped during tree/walk operations */
export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '__pycache__', '.next',
]);

// ---------------------------------------------------------------------------
// Workspace root resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the workspace root path from a workspace_id.
 */
export async function resolveWorkspaceRoot(workspaceId: string): Promise<string | null> {
  const ws = await store.getWorkspace(workspaceId);
  if (!ws) return null;
  const storedPath = ws.workspace_path || ws.path || null;
  if (!storedPath) return null;

  // In container mode, translate Windows host paths to container mount paths
  if (isContainerEnvironment()) {
    const containerPath = resolveToContainerPath(storedPath);
    if (containerPath) return containerPath;
    // If it's already a container-native path, use it directly
    if (!storedPath.match(/^[a-zA-Z]:[\\\/]/)) return storedPath;
    // Windows path with no mount mapping — cannot resolve in container
    return null;
  }

  return storedPath;
}

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

export interface PathValidation {
  ok: true;
  resolved: string;
}

export interface PathValidationError {
  ok: false;
  error: string;
}

export interface SymlinkPolicyOk {
  ok: true;
}

export interface SymlinkPolicyError {
  ok: false;
  error: string;
}

/**
 * Validate that a resolved path is inside the workspace root.
 * Returns the absolute resolved path or an error string.
 */
export function validatePath(
  workspaceRoot: string,
  inputPath: string,
): PathValidation | PathValidationError {
  const resolved = resolve(workspaceRoot, inputPath);
  const rel = relative(workspaceRoot, resolved);

  // Check for path traversal (going above workspace root)
  if (rel.startsWith('..') || resolve(resolved) !== resolved.split(sep).join(sep)) {
    // Double-check: resolved must start with workspace root
    if (!resolved.startsWith(workspaceRoot)) {
      return { ok: false, error: `Path escapes workspace boundary: "${inputPath}"` };
    }
  }

  // Final check — the resolved path must begin with workspace root
  const normalizedResolved = resolved.toLowerCase();
  const normalizedRoot = workspaceRoot.toLowerCase();
  if (!normalizedResolved.startsWith(normalizedRoot)) {
    return { ok: false, error: `Path escapes workspace boundary: "${inputPath}"` };
  }

  // Check for raw '..' segments in the relative path
  const segments = rel.split(sep);
  if (segments.some((s) => s === '..')) {
    return { ok: false, error: `Path traversal detected in: "${inputPath}"` };
  }

  return { ok: true, resolved };
}

function normalizeForComparison(pathValue: string): string {
  return process.platform === 'win32' ? pathValue.toLowerCase() : pathValue;
}

function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const normalizedRoot = normalizeForComparison(resolve(rootPath));
  const normalizedCandidate = normalizeForComparison(resolve(candidatePath));
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

/**
 * Enforce constrained symlink policy:
 * - Symlinks are allowed only when their resolved target remains within workspace root.
 * - Any symlink that resolves outside workspace is denied.
 */
export async function enforceSymlinkPolicy(
  workspaceRoot: string,
  absolutePath: string,
  options?: { allowMissingLeaf?: boolean },
): Promise<SymlinkPolicyOk | SymlinkPolicyError> {
  const rootRealPath = await realpath(workspaceRoot).catch(() => resolve(workspaceRoot));
  const rel = relative(workspaceRoot, absolutePath);
  const segments = rel.split(/[\\/]/).filter(Boolean);

  let currentPath = workspaceRoot;
  for (let i = 0; i < segments.length; i++) {
    currentPath = join(currentPath, segments[i]);

    let stats;
    try {
      stats = await lstat(currentPath);
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT' && options?.allowMissingLeaf) {
        break;
      }
      if (error.code === 'ENOENT') {
        return { ok: false, error: `Path does not exist: "${rel.replace(/\\/g, '/')}"` };
      }
      return { ok: false, error: `Symlink policy check failed: ${error.message}` };
    }

    if (stats.isSymbolicLink()) {
      const linkTarget = await realpath(currentPath).catch(() => null);
      if (!linkTarget) {
        return { ok: false, error: `Broken symlink is not allowed: "${rel.replace(/\\/g, '/')}"` };
      }

      if (!isPathInsideRoot(rootRealPath, linkTarget)) {
        return {
          ok: false,
          error: `Symlink escapes workspace boundary: "${rel.replace(/\\/g, '/')}"`,
        };
      }
    }
  }

  const finalRealPath = await realpath(absolutePath).catch(() => null);
  if (finalRealPath && !isPathInsideRoot(rootRealPath, finalRealPath)) {
    return {
      ok: false,
      error: `Resolved path escapes workspace boundary via symlink: "${rel.replace(/\\/g, '/')}"`,
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sensitive file detection
// ---------------------------------------------------------------------------

/**
 * Check if a path matches any sensitive pattern (blocked for safety).
 */
export function isSensitivePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const base = basename(filePath).toLowerCase();

  for (const pattern of SENSITIVE_PATTERNS) {
    const lower = pattern.toLowerCase();
    if (normalized.includes(lower) || base === lower || base.endsWith(lower)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Directory walk helper
// ---------------------------------------------------------------------------

/**
 * Recursively walk a directory, calling `callback` for each entry.
 * Return `false` from callback to skip a subtree.
 */
export async function walkDir(
  root: string,
  currentDir: string,
  callback: (relPath: string, isDir: boolean) => boolean,
  depth = 0,
): Promise<void> {
  if (depth > MAX_TREE_DEPTH) return;

  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);
    const relPath = relative(root, fullPath);
    const isDir = entry.isDirectory();

    const shouldContinue = callback(relPath, isDir);
    if (!shouldContinue) continue;

    if (isDir) {
      await walkDir(root, fullPath, callback, depth + 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Tree builder helper
// ---------------------------------------------------------------------------

/**
 * Recursively build an ASCII directory tree.
 */
export async function buildTree(
  dir: string,
  prefix: string,
  depth: number,
  maxDepth: number,
  lines: string[],
  counter: { count: number },
  options?: { maxEntries?: number; truncated?: { value: boolean } },
): Promise<void> {
  const maxEntries = options?.maxEntries ?? MAX_TREE_ENTRIES;
  const truncatedState = options?.truncated ?? { value: false };

  if (depth >= maxDepth || counter.count >= maxEntries) {
    truncatedState.value = true;
    return;
  }

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  // Sort: directories first, then files
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  // Filter out skipped directories
  entries = entries.filter((e) => !(e.isDirectory() && SKIP_DIRS.has(e.name)));

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    const suffix = entry.isDirectory() ? '/' : '';
    lines.push(`${prefix}${connector}${entry.name}${suffix}`);
    counter.count++;

    if (counter.count >= maxEntries) {
      lines.push(`${prefix}${childPrefix}... (truncated at ${maxEntries} entries)`);
      truncatedState.value = true;
      return;
    }

    if (entry.isDirectory()) {
      await buildTree(
        join(dir, entry.name),
        prefix + childPrefix,
        depth + 1,
        maxDepth,
        lines,
        counter,
        { maxEntries, truncated: truncatedState },
      );
    }
  }
}
