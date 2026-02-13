/**
 * Filesystem Safety — path validation, traversal checks, and sensitive file detection
 *
 * Extracted from filesystem.tools.ts (MAJ-3) so that module focuses on
 * action handlers (read, write, search, list, tree) while this module owns
 * all safety-boundary logic.
 */

import { resolve, relative, basename, join, sep } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import * as store from '../storage/file-store.js';
import { resolveToContainerPath, isContainerEnvironment } from '../storage/workspace-mounts.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_READ_BYTES = 1024 * 1024; // 1MB warning threshold
export const MAX_TREE_DEPTH = 10;
export const MAX_SEARCH_RESULTS = 200;

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
): Promise<void> {
  if (depth >= maxDepth || counter.count > 500) return;

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

    if (counter.count > 500) {
      lines.push(`${prefix}${childPrefix}... (truncated at 500 entries)`);
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
      );
    }
  }
}
