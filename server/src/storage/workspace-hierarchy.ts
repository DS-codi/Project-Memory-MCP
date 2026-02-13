/**
 * Workspace Hierarchy - Parent/child workspace detection
 *
 * Provides functions to detect directory overlap between workspaces:
 *  - scanUpForParent: walk UP the tree looking for a parent identity.json
 *  - scanDownForChildren: scan subdirectories for child identity.json files
 *  - detectOverlaps: combines both scans into a single result
 *  - checkRegistryForOverlaps: fallback using workspace-registry.json path containment
 */

import path from 'path';
import { promises as fs } from 'fs';
import type { WorkspaceOverlapInfo, WorkspaceMeta } from '../types/workspace.types.js';
import {
  readWorkspaceIdentityFile,
  getWorkspaceIdentityPath,
  type WorkspaceIdentityFile,
} from './workspace-identity.js';
import {
  normalizeWorkspacePath,
  safeResolvePath,
} from './workspace-utils.js';
import {
  modifyJsonLocked,
} from './file-lock.js';
import {
  getWorkspace,
  saveWorkspace,
  getWorkspaceMetaPath,
} from './file-store.js';

// Directories to skip when scanning downward
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.memory',
  '.projectmemory',
  '.hg',
  '.svn',
  '__pycache__',
  '.tox',
  '.venv',
  'venv',
  '.next',
  'dist',
  'build',
  'target',
]);

// ---------------------------------------------------------------------------
// scanUpForParent
// ---------------------------------------------------------------------------

/**
 * Walk UP the directory tree from `startPath` (excluding startPath itself)
 * looking for `.projectmemory/identity.json`. Returns the first parent
 * workspace found, or null if none exists.
 */
export async function scanUpForParent(
  startPath: string
): Promise<{ workspaceId: string; workspacePath: string } | null> {
  const resolvedStart = safeResolvePath(startPath);
  let current = path.dirname(resolvedStart); // start one level up

  while (true) {
    const parent = path.dirname(current);
    // Reached filesystem root
    if (parent === current) {
      break;
    }

    const identityPath = getWorkspaceIdentityPath(current);
    try {
      await fs.access(identityPath);
      // File exists — try to read and validate it.
      // Pass `undefined` for expectedWorkspaceId; we accept any valid identity.
      // Note: readWorkspaceIdentityFile checks that the identity's workspace_path
      // matches `current`, so it rejects stale copies automatically.
      const identity = await readWorkspaceIdentityFile(current);
      if (identity?.workspace_id && identity.workspace_path) {
        return {
          workspaceId: identity.workspace_id,
          workspacePath: identity.workspace_path,
        };
      }
    } catch {
      // identity.json doesn't exist here — keep climbing
    }

    current = parent;
  }

  return null;
}

// ---------------------------------------------------------------------------
// scanDownForChildren
// ---------------------------------------------------------------------------

/**
 * Recursively scan subdirectories of `startPath` (excluding startPath itself)
 * up to `maxDepth` levels deep, looking for `.projectmemory/identity.json`.
 * Returns an array of discovered child workspace info.
 */
export async function scanDownForChildren(
  startPath: string,
  maxDepth: number = 2
): Promise<Array<{ workspaceId: string; workspacePath: string }>> {
  const resolvedStart = safeResolvePath(startPath);
  const results: Array<{ workspaceId: string; workspacePath: string }> = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // permission denied or not a directory
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;

      const childDir = path.join(dir, entry.name);

      // Check for identity.json in this subdirectory
      const identityPath = getWorkspaceIdentityPath(childDir);
      try {
        await fs.access(identityPath);
        const identity = await readWorkspaceIdentityFile(childDir);
        if (identity?.workspace_id && identity.workspace_path) {
          results.push({
            workspaceId: identity.workspace_id,
            workspacePath: identity.workspace_path,
          });
          // Don't recurse further into a child workspace's subtree —
          // that would be a grandchild, which is its own relationship.
          continue;
        }
      } catch {
        // No identity.json here — recurse deeper
      }

      await walk(childDir, depth + 1);
    }
  }

  await walk(resolvedStart, 1);
  return results;
}

// ---------------------------------------------------------------------------
// detectOverlaps
// ---------------------------------------------------------------------------

/**
 * Detect overlapping workspaces by scanning both upward and downward from
 * the given path. Returns an array of WorkspaceOverlapInfo objects.
 */
export async function detectOverlaps(
  workspacePath: string
): Promise<WorkspaceOverlapInfo[]> {
  const resolvedPath = safeResolvePath(workspacePath);
  const overlaps: WorkspaceOverlapInfo[] = [];

  // Scan upward for a parent workspace
  const parent = await scanUpForParent(resolvedPath);
  if (parent) {
    overlaps.push({
      overlap_detected: true,
      relationship: 'parent',
      existing_workspace_id: parent.workspaceId,
      existing_workspace_path: parent.workspacePath,
      existing_workspace_name: path.basename(parent.workspacePath),
      suggested_action: 'link',
      message: `Directory is inside existing workspace "${path.basename(parent.workspacePath)}" (${parent.workspaceId}). Consider linking as a child workspace.`,
    });
  }

  // Scan downward for child workspaces
  const children = await scanDownForChildren(resolvedPath);
  for (const child of children) {
    overlaps.push({
      overlap_detected: true,
      relationship: 'child',
      existing_workspace_id: child.workspaceId,
      existing_workspace_path: child.workspacePath,
      existing_workspace_name: path.basename(child.workspacePath),
      suggested_action: 'link',
      message: `Directory contains existing workspace "${path.basename(child.workspacePath)}" (${child.workspaceId}). Consider linking as a child workspace.`,
    });
  }

  return overlaps;
}

// ---------------------------------------------------------------------------
// checkRegistryForOverlaps
// ---------------------------------------------------------------------------

/**
 * Check the workspace registry (path→id mapping) for path containment.
 * This is a fallback when identity.json files might not exist (e.g. container mode).
 *
 * @param workspacePath  The path being registered
 * @param registry       A Record of normalizedPath → workspaceId from the registry
 * @returns              WorkspaceOverlapInfo[] for path containment matches
 */
export function checkRegistryForOverlaps(
  workspacePath: string,
  registry: Record<string, string>
): WorkspaceOverlapInfo[] {
  const normalizedNew = normalizeWorkspacePath(workspacePath);
  const overlaps: WorkspaceOverlapInfo[] = [];

  for (const [registeredPath, registeredId] of Object.entries(registry)) {
    // Skip exact match — that's the same workspace, not an overlap
    if (registeredPath === normalizedNew) continue;

    const isParent = normalizedNew.startsWith(registeredPath + '/');
    const isChild = registeredPath.startsWith(normalizedNew + '/');

    if (isParent) {
      overlaps.push({
        overlap_detected: true,
        relationship: 'parent',
        existing_workspace_id: registeredId,
        existing_workspace_path: registeredPath,
        existing_workspace_name: path.basename(registeredPath),
        suggested_action: 'link',
        message: `Directory is inside registered workspace "${path.basename(registeredPath)}" (${registeredId}). Consider linking as a child workspace.`,
      });
    } else if (isChild) {
      overlaps.push({
        overlap_detected: true,
        relationship: 'child',
        existing_workspace_id: registeredId,
        existing_workspace_path: registeredPath,
        existing_workspace_name: path.basename(registeredPath),
        suggested_action: 'link',
        message: `Directory contains registered workspace "${path.basename(registeredPath)}" (${registeredId}). Consider linking as a child workspace.`,
      });
    }
  }

  return overlaps;
}

// ---------------------------------------------------------------------------
// Workspace Hierarchy Type
// ---------------------------------------------------------------------------

export interface WorkspaceHierarchyInfo {
  parent?: { id: string; name: string; path: string };
  children: Array<{ id: string; name: string; path: string }>;
}

// ---------------------------------------------------------------------------
// linkWorkspaces
// ---------------------------------------------------------------------------

/**
 * Create a bidirectional parent-child link between two workspaces.
 *
 * 1. Add `childId` to the parent's `child_workspace_ids` (deduped).
 * 2. Set `parent_workspace_id` on the child's workspace.meta.json.
 * 3. Update the child's on-disk `identity.json` with `parent_workspace_id`
 *    and `parent_workspace_path`.
 * 4. Set `hierarchy_linked_at` on both metas.
 */
export async function linkWorkspaces(
  parentId: string,
  childId: string,
  _dataRoot?: string
): Promise<void> {
  const now = new Date().toISOString();

  // --- Parent meta ---
  const parentMeta = await getWorkspace(parentId);
  if (!parentMeta) {
    throw new Error(`Parent workspace not found: ${parentId}`);
  }
  const childIdSet = new Set(parentMeta.child_workspace_ids ?? []);
  childIdSet.add(childId);
  parentMeta.child_workspace_ids = [...childIdSet];
  parentMeta.hierarchy_linked_at = now;
  await saveWorkspace(parentMeta);

  // --- Child meta ---
  const childMeta = await getWorkspace(childId);
  if (!childMeta) {
    throw new Error(`Child workspace not found: ${childId}`);
  }
  childMeta.parent_workspace_id = parentId;
  childMeta.hierarchy_linked_at = now;
  await saveWorkspace(childMeta);

  // --- Child identity.json ---
  const childPath = childMeta.workspace_path || childMeta.path;
  const parentPath = parentMeta.workspace_path || parentMeta.path;
  if (childPath) {
    try {
      const identityPath = getWorkspaceIdentityPath(childPath);
      await modifyJsonLocked<WorkspaceIdentityFile>(identityPath, (prev) => ({
        ...prev!,
        parent_workspace_id: parentId,
        parent_workspace_path: parentPath,
        updated_at: now,
      }));
    } catch {
      // Identity file may not be accessible (container mode, etc.)
      console.warn(`[workspace-hierarchy] Could not update child identity.json at ${childPath}`);
    }
  }
}

// ---------------------------------------------------------------------------
// unlinkWorkspaces
// ---------------------------------------------------------------------------

/**
 * Remove the parent-child link between two workspaces.
 *
 * 1. Remove `childId` from the parent's `child_workspace_ids`.
 * 2. Clear `parent_workspace_id` from the child's workspace.meta.json.
 * 3. Clear `parent_workspace_id` / `parent_workspace_path` from the child's
 *    on-disk `identity.json`.
 * 4. Clear `hierarchy_linked_at` on both metas when no links remain.
 */
export async function unlinkWorkspaces(
  parentId: string,
  childId: string,
  _dataRoot?: string
): Promise<void> {
  const now = new Date().toISOString();

  // --- Parent meta ---
  const parentMeta = await getWorkspace(parentId);
  if (!parentMeta) {
    throw new Error(`Parent workspace not found: ${parentId}`);
  }
  const remainingChildren = new Set(parentMeta.child_workspace_ids ?? []);
  remainingChildren.delete(childId);
  parentMeta.child_workspace_ids = remainingChildren.size > 0 ? [...remainingChildren] : undefined;
  // Clear hierarchy_linked_at only if no children AND not itself a child
  if (!parentMeta.child_workspace_ids?.length && !parentMeta.parent_workspace_id) {
    parentMeta.hierarchy_linked_at = undefined;
  } else {
    parentMeta.hierarchy_linked_at = now;
  }
  await saveWorkspace(parentMeta);

  // --- Child meta ---
  const childMeta = await getWorkspace(childId);
  if (!childMeta) {
    throw new Error(`Child workspace not found: ${childId}`);
  }
  childMeta.parent_workspace_id = undefined;
  // Clear hierarchy_linked_at only if no children of its own
  if (!childMeta.child_workspace_ids?.length) {
    childMeta.hierarchy_linked_at = undefined;
  }
  await saveWorkspace(childMeta);

  // --- Child identity.json ---
  const childPath = childMeta.workspace_path || childMeta.path;
  if (childPath) {
    try {
      const identityPath = getWorkspaceIdentityPath(childPath);
      await modifyJsonLocked<WorkspaceIdentityFile>(identityPath, (prev) => {
        if (!prev) return prev!;
        const updated = { ...prev, updated_at: now };
        delete (updated as Record<string, unknown>).parent_workspace_id;
        delete (updated as Record<string, unknown>).parent_workspace_path;
        return updated as WorkspaceIdentityFile;
      });
    } catch {
      console.warn(`[workspace-hierarchy] Could not update child identity.json at ${childPath}`);
    }
  }
}

// ---------------------------------------------------------------------------
// getWorkspaceHierarchy
// ---------------------------------------------------------------------------

/**
 * Retrieve the full hierarchy for a given workspace — its parent (if any)
 * and all children (if any).
 */
export async function getWorkspaceHierarchy(
  workspaceId: string,
  _dataRoot?: string
): Promise<WorkspaceHierarchyInfo> {
  const meta = await getWorkspace(workspaceId);
  if (!meta) {
    return { children: [] };
  }

  const hierarchy: WorkspaceHierarchyInfo = { children: [] };

  // Resolve parent
  if (meta.parent_workspace_id) {
    const parentMeta = await getWorkspace(meta.parent_workspace_id);
    if (parentMeta) {
      hierarchy.parent = {
        id: parentMeta.workspace_id,
        name: parentMeta.name,
        path: parentMeta.workspace_path || parentMeta.path,
      };
    }
  }

  // Resolve children
  if (meta.child_workspace_ids?.length) {
    for (const childId of meta.child_workspace_ids) {
      const childMeta = await getWorkspace(childId);
      if (childMeta) {
        hierarchy.children.push({
          id: childMeta.workspace_id,
          name: childMeta.name,
          path: childMeta.workspace_path || childMeta.path,
        });
      }
    }
  }

  return hierarchy;
}
