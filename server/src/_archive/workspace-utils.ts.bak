/**
 * Workspace Utilities - Canonical workspace ID and data root resolution
 */

import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_HASH_LENGTH = 12;

/**
 * Safely resolve a workspace path across platforms.
 * On Linux/macOS containers, path.resolve() corrupts Windows absolute paths
 * (e.g. "C:\foo" becomes "/app/C:\foo"). This detects Windows paths and
 * returns them as-is when running on non-Windows platforms.
 */
export function safeResolvePath(inputPath: string): string {
  const isWindowsAbsolute = /^[a-zA-Z]:[\\\/]/.test(inputPath);
  if (isWindowsAbsolute && process.platform !== 'win32') {
    return inputPath;
  }
  return path.resolve(inputPath);
}

let cachedWorkspaceRoot: string | null = null;
let cachedDataRoot: string | null = null;

export function resolveWorkspaceRoot(): string {
  if (cachedWorkspaceRoot) {
    return cachedWorkspaceRoot;
  }

  const envRoot = process.env.MBS_WORKSPACE_ROOT;
  if (envRoot) {
    cachedWorkspaceRoot = path.resolve(envRoot);
    return cachedWorkspaceRoot;
  }

  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  cachedWorkspaceRoot = path.resolve(currentDir, '../../..');
  return cachedWorkspaceRoot;
}

export function getDataRoot(): string {
  if (cachedDataRoot) {
    return cachedDataRoot;
  }

  const envDataRoot = process.env.MBS_DATA_ROOT;
  cachedDataRoot = envDataRoot
    ? path.resolve(envDataRoot)
    : path.resolve(resolveWorkspaceRoot(), 'data');

  return cachedDataRoot;
}

export function normalizeWorkspacePath(workspacePath: string): string {
  const resolved = safeResolvePath(workspacePath);
  const normalized = resolved
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')   // collapse runs of // to / (fixes container double-backslash paths)
    .toLowerCase();
  return normalized.replace(/\/+$/, '');
}

export function getWorkspaceIdFromPath(workspacePath: string): string {
  const normalizedPath = normalizeWorkspacePath(workspacePath);
  const hash = crypto.createHash('sha256').update(normalizedPath).digest('hex');
  const shortHash = hash.substring(0, DEFAULT_HASH_LENGTH);
  const folderName = path.basename(normalizedPath).toLowerCase();
  return `${folderName}-${shortHash}`;
}

export function getWorkspaceDisplayName(workspacePath: string): string {
  const trimmedInput = workspacePath.trim().replace(/[\\/]+$/, '');

  // Handle Windows-style paths explicitly so Linux/macOS hosts don't treat them
  // as plain strings and accidentally return the full input as the display name.
  const isWindowsStyle = /^[a-zA-Z]:[\\/]/.test(trimmedInput) || trimmedInput.includes('\\');
  if (isWindowsStyle) {
    const segments = trimmedInput.split(/[\\/]+/).filter(Boolean);
    const candidate = segments[segments.length - 1];
    if (candidate && !/^[a-zA-Z]:$/.test(candidate)) {
      return candidate;
    }
  }

  const resolved = safeResolvePath(trimmedInput);
  const trimmedResolved = resolved.replace(/[\\/]+$/, '');
  const posixBasename = path.posix.basename(trimmedResolved);
  return posixBasename || trimmedResolved;
}
