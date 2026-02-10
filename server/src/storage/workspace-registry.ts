/**
 * Workspace Registry - Central path→ID mapping at data root level.
 *
 * Stores `{ entries: { normalizedPath: canonicalWorkspaceId } }` in
 * `{MBS_DATA_ROOT}/workspace-registry.json`. This file is accessible
 * from the container (unlike identity.json which lives in the host
 * workspace directory) and acts as a safety net to prevent duplicate
 * workspace creation when identity.json can't be read.
 */

import path from 'path';
import { promises as fs } from 'fs';
import { getDataRoot, normalizeWorkspacePath } from './workspace-utils.js';
import { modifyJsonLocked } from './file-lock.js';

export interface WorkspaceRegistry {
  schema_version: string;
  entries: Record<string, string>; // normalizedPath → canonicalWorkspaceId
  updated_at: string;
}

function getRegistryPath(): string {
  return path.join(getDataRoot(), 'workspace-registry.json');
}

/**
 * Read the workspace registry. Returns null if missing or corrupt.
 */
export async function readRegistry(): Promise<WorkspaceRegistry | null> {
  try {
    const content = await fs.readFile(getRegistryPath(), 'utf-8');
    return JSON.parse(content) as WorkspaceRegistry;
  } catch {
    return null;
  }
}

/**
 * Look up a workspace ID by normalized path.
 * Returns the canonical workspace ID or null if not found.
 */
export async function lookupByPath(workspacePath: string): Promise<string | null> {
  const registry = await readRegistry();
  if (!registry?.entries) return null;

  const normalized = normalizeWorkspacePath(workspacePath);
  return registry.entries[normalized] ?? null;
}

/**
 * Register or update a path→ID mapping in the registry.
 */
export async function upsertRegistryEntry(
  workspacePath: string,
  workspaceId: string
): Promise<void> {
  const registryPath = getRegistryPath();
  const normalized = normalizeWorkspacePath(workspacePath);

  await modifyJsonLocked<WorkspaceRegistry>(registryPath, (existing) => {
    const registry = existing ?? {
      schema_version: '1.0.0',
      entries: {},
      updated_at: '',
    };
    registry.entries[normalized] = workspaceId;
    registry.updated_at = new Date().toISOString();
    return registry;
  });
}

/**
 * Remove a path entry from the registry (e.g. after merge).
 */
export async function removeRegistryEntry(
  workspacePath: string
): Promise<void> {
  const registryPath = getRegistryPath();
  const normalized = normalizeWorkspacePath(workspacePath);

  try {
    await modifyJsonLocked<WorkspaceRegistry>(registryPath, (existing) => {
      if (!existing) return existing as unknown as WorkspaceRegistry;
      delete existing.entries[normalized];
      existing.updated_at = new Date().toISOString();
      return existing;
    });
  } catch {
    // Registry doesn't exist — nothing to remove
  }
}
