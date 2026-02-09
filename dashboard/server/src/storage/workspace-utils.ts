/**
 * Workspace Utilities - Canonical workspace ID and data root resolution
 */

import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

const DEFAULT_HASH_LENGTH = 12;

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
  // Dashboard server lives under dashboard/server; resolve to repo root.
  cachedWorkspaceRoot = path.resolve(currentDir, '../../../..');
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
  const resolved = path.resolve(workspacePath);
  const normalized = resolved.replace(/\\/g, '/').toLowerCase();
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
  const resolved = path.resolve(workspacePath);
  return path.basename(resolved);
}

// =============================================================================
// Identity File Resolution
// =============================================================================

export interface WorkspaceIdentityFile {
  schema_version: string;
  workspace_id: string;
  workspace_path: string;
  data_root: string;
  created_at: string;
  updated_at: string;
}

export function getWorkspaceIdentityPath(workspacePath: string): string {
  return path.join(workspacePath, '.projectmemory', 'identity.json');
}

/**
 * Read the `.projectmemory/identity.json` file from a workspace directory.
 * Returns null if the file is missing, malformed, or path mismatch.
 */
export async function readWorkspaceIdentityFile(
  workspacePath: string
): Promise<WorkspaceIdentityFile | null> {
  const resolvedPath = path.resolve(workspacePath);
  const identityPath = getWorkspaceIdentityPath(resolvedPath);

  try {
    const content = await fs.readFile(identityPath, 'utf-8');
    const identity = JSON.parse(content) as WorkspaceIdentityFile;

    if (!identity?.workspace_id || !identity.workspace_path) {
      return null;
    }

    const normalizedInput = normalizeWorkspacePath(resolvedPath);
    const normalizedIdentity = normalizeWorkspacePath(identity.workspace_path);
    if (normalizedInput !== normalizedIdentity) {
      return null;
    }

    return identity;
  } catch {
    return null;
  }
}

/**
 * Resolve the canonical workspace ID for a given filesystem path.
 * Reads identity.json first, falls back to hash-based ID.
 */
export async function resolveCanonicalWorkspaceId(
  workspacePath: string
): Promise<string> {
  const resolvedPath = path.resolve(workspacePath);
  const identity = await readWorkspaceIdentityFile(resolvedPath);
  if (identity?.workspace_id) {
    return identity.workspace_id;
  }
  return getWorkspaceIdFromPath(resolvedPath);
}

/**
 * Write the identity.json file for a workspace.
 */
export async function writeWorkspaceIdentityFile(
  workspacePath: string,
  workspaceId: string,
  dataRoot: string
): Promise<WorkspaceIdentityFile> {
  const resolvedPath = path.resolve(workspacePath);
  const identityPath = getWorkspaceIdentityPath(resolvedPath);
  const now = new Date().toISOString();

  let existing: WorkspaceIdentityFile | null = null;
  try {
    const content = await fs.readFile(identityPath, 'utf-8');
    existing = JSON.parse(content) as WorkspaceIdentityFile;
  } catch {
    // File doesn't exist yet
  }

  const identity: WorkspaceIdentityFile = {
    schema_version: '1.0.0',
    workspace_id: workspaceId,
    workspace_path: resolvedPath,
    data_root: dataRoot,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  await fs.mkdir(path.dirname(identityPath), { recursive: true });
  await fs.writeFile(identityPath, JSON.stringify(identity, null, 2), 'utf-8');
  return identity;
}
