/**
 * Workspace Identity — identity.json read / write only
 *
 * All workspace operations (ID validation, ghost scan, merge, migrate) live in
 * workspace-operations.ts. This module is intentionally small (~90-100 lines).
 *
 * Resolution order:
 *  1. Read `.projectmemory/identity.json` → use `workspace_id` if valid
 *  2. Fall back to `getWorkspaceIdFromPath()` (hash-based)
 */

import path from 'path';
import { promises as fs } from 'fs';
import {
  getWorkspaceIdFromPath,
  normalizeWorkspacePath,
  getDataRoot,
  safeResolvePath,
  modifyJsonLocked,
  lookupByPath,
} from './db-store.js';

// Re-export the identity file interface used by file-store.ts
export interface WorkspaceIdentityFile {
  schema_version: string;
  workspace_id: string;
  workspace_path: string;
  data_root: string;
  created_at: string;
  updated_at: string;
  project_mcps?: Array<{
    name: string;
    description?: string;
    config_path?: string;
    url?: string;
  }>;
  parent_workspace_id?: string;  // Stored in the child's identity.json to reference its parent
  parent_workspace_path?: string;  // The parent's path for quick lookup
}

// ---------------------------------------------------------------------------
// Core identity helpers
// ---------------------------------------------------------------------------

export function getWorkspaceIdentityPath(workspacePath: string): string {
  return path.join(workspacePath, '.projectmemory', 'identity.json');
}

// ---------------------------------------------------------------------------
// Low-level JSON helpers (avoid importing file-store to prevent cycles)
// ---------------------------------------------------------------------------

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Identity file I/O
// ---------------------------------------------------------------------------

/**
 * Read the `.projectmemory/identity.json` file from a workspace directory.
 * Returns null if the file is missing or malformed.
 *
 * Path validation behaviour:
 * - If `expectedWorkspaceId` is provided and matches the identity file's
 *   `workspace_id`, the identity is accepted **even when paths differ**
 *   (cross-machine scenario). A warning is logged for diagnostics.
 * - Otherwise, a path mismatch still causes rejection (guards against
 *   copied identity files when no expected ID is available).
 */
export async function readWorkspaceIdentityFile(
  workspacePath: string,
  expectedWorkspaceId?: string
): Promise<WorkspaceIdentityFile | null> {
  const resolvedPath = safeResolvePath(workspacePath);
  const identityPath = getWorkspaceIdentityPath(resolvedPath);
  const identity = await readJsonSafe<WorkspaceIdentityFile>(identityPath);

  if (!identity?.workspace_id || !identity.workspace_path) {
    return null;
  }

  const normalizedInput = normalizeWorkspacePath(resolvedPath);
  const normalizedIdentity = normalizeWorkspacePath(identity.workspace_path);
  if (normalizedInput !== normalizedIdentity) {
    // If we have an expected workspace_id and it matches, accept despite path mismatch
    if (expectedWorkspaceId && identity.workspace_id === expectedWorkspaceId) {
      console.warn(
        `[workspace-identity] Path mismatch but workspace_id matches (cross-machine): ` +
        `expected_id=${expectedWorkspaceId}, path_in_file=${identity.workspace_path}, ` +
        `current_path=${resolvedPath}. Accepting identity.`
      );
      return identity;
    }
    return null;
  }

  return identity;
}

// ---------------------------------------------------------------------------
// Core resolution functions
// ---------------------------------------------------------------------------

/**
 * Resolve the *canonical* workspace ID for a given filesystem path.
 *
 * 1. If `.projectmemory/identity.json` exists and is valid → use its `workspace_id`.
 * 2. If workspace-registry.json has a mapping for this path → use that ID.
 * 3. Otherwise fall back to the hash-based `getWorkspaceIdFromPath()`.
 */
export async function resolveCanonicalWorkspaceId(
  workspacePath: string
): Promise<string> {
  const resolvedPath = safeResolvePath(workspacePath);

  // 1. identity.json
  const identity = await readWorkspaceIdentityFile(resolvedPath);
  if (identity?.workspace_id) {
    return identity.workspace_id;
  }

  // 2. workspace-registry.json (safety net when identity.json is unreachable)
  const registryId = await lookupByPath(resolvedPath);
  if (registryId) {
    return registryId;
  }

  // 3. Hash-based fallback
  return getWorkspaceIdFromPath(resolvedPath);
}


// ---------------------------------------------------------------------------
// Identity file enforcement
// ---------------------------------------------------------------------------

/**
 * Ensure `.projectmemory/identity.json` exists in a workspace directory.
 *
 * Checks whether the file already exists and is valid. If missing or stale,
 * writes (or refreshes) it. Fails silently when the directory is not
 * writable (e.g. container mode pointing at a host path).
 *
 * @returns `true` if the file was written/refreshed, `false` if it already
 *          existed and was valid, or if writing failed gracefully.
 */
export async function ensureIdentityFile(
  workspacePath: string,
  workspaceId: string,
  dataRoot?: string
): Promise<boolean> {
  try {
    const resolvedPath = safeResolvePath(workspacePath);

    // Guard: workspace directory must be reachable from this process
    // In container mode, try resolving via workspace mounts
    const { resolveAccessiblePath } = await import('./workspace-mounts.js');
    const accessiblePath = await resolveAccessiblePath(resolvedPath);
    if (!accessiblePath) {
      return false;
    }

    // Fast check — if identity file exists and matches, skip write
    const existing = await readWorkspaceIdentityFile(accessiblePath, workspaceId);
    if (existing && existing.workspace_id === workspaceId) {
      return false; // Already present and valid
    }

    // Write / refresh the identity file
    // Use accessiblePath for the file location (may be container mount path)
    // but store resolvedPath as workspace_path (the original host path)
    const identityPath = getWorkspaceIdentityPath(accessiblePath);
    const now = new Date().toISOString();
    await modifyJsonLocked<WorkspaceIdentityFile>(identityPath, (prev) => ({
      schema_version: '1.0.0',
      workspace_id: workspaceId,
      workspace_path: resolvedPath,
      data_root: dataRoot || getDataRoot(),
      created_at: prev?.created_at || now,
      updated_at: now,
      project_mcps: prev?.project_mcps,
    }));
    return true;
  } catch {
    // Graceful failure — container mode, read-only FS, etc.
    return false;
  }
}

