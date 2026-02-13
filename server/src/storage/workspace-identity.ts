/**
 * Workspace Identity - Single source of truth for workspace ID resolution
 *
 * This module provides the canonical functions for resolving, validating,
 * and redirecting workspace IDs. All code paths that need a workspace ID
 * should go through this module rather than computing IDs independently.
 *
 * Resolution order:
 *  1. Read `.projectmemory/identity.json` → use `workspace_id` if valid
 *  2. Fall back to `getWorkspaceIdFromPath()` (hash-based)
 */

import path from 'path';
import { promises as fs } from 'fs';
import type { WorkspaceMeta, WorkspaceContext } from '../types/index.js';
import {
  getWorkspaceIdFromPath,
  normalizeWorkspacePath,
  getDataRoot,
  safeResolvePath,
} from './workspace-utils.js';
import {
  writeJsonLocked,
  modifyJsonLocked,
} from './file-lock.js';
import { lookupByPath, upsertRegistryEntry } from './workspace-registry.js';

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
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class WorkspaceNotRegisteredError extends Error {
  public readonly candidateId: string;
  public readonly suggestions: string[];

  constructor(candidateId: string, suggestions: string[] = []) {
    const lines = [`Workspace '${candidateId}' is not registered.`];
    if (suggestions.length > 0) {
      lines.push(`Did you mean: ${suggestions.join(', ')}?`);
    }
    super(lines.join(' '));
    this.name = 'WorkspaceNotRegisteredError';
    this.candidateId = candidateId;
    this.suggestions = suggestions;
  }
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function getWorkspaceIdentityPath(workspacePath: string): string {
  return path.join(workspacePath, '.projectmemory', 'identity.json');
}

function getWorkspaceDir(workspaceId: string): string {
  return path.join(getDataRoot(), workspaceId);
}

function getWorkspaceMetaPath(workspaceId: string): string {
  return path.join(getWorkspaceDir(workspaceId), 'workspace.meta.json');
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

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether a workspace path is genuinely accessible on this machine.
 *
 * In container mode (Linux), Windows-style paths like `s:\foo` or `C:\Users\...`
 * are not directly reachable, but may be available via workspace mounts.
 * Falls back to checking container mount paths when the direct path fails.
 *
 * Returns `true` only when the directory exists and is a real directory.
 */
async function isWorkspacePathAccessible(workspacePath: string): Promise<boolean> {
  const { resolveAccessiblePath } = await import('./workspace-mounts.js');
  const accessible = await resolveAccessiblePath(workspacePath);
  return accessible !== null;
}

async function listDirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

/**
 * Recursively copy a directory. More reliable than fs.rename when
 * files may be locked by another process (e.g., VS Code file watchers).
 */
async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Move a directory using copy + delete. Falls back to recursive copy
 * if fs.rename fails (e.g., EPERM from locked files).
 */
async function moveDirSafe(src: string, dest: string): Promise<void> {
  try {
    // Try fast rename first
    await fs.rename(src, dest);
  } catch (renameErr) {
    // Fallback to copy + delete
    try {
      await copyDirRecursive(src, dest);
      await fs.rm(src, { recursive: true, force: true });
    } catch (copyErr) {
      throw new Error(
        `Failed to move '${src}' to '${dest}': rename failed (${(renameErr as Error).message}), copy also failed (${(copyErr as Error).message})`
      );
    }
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

/**
 * Check whether a workspace ID corresponds to a valid, registered workspace
 * (i.e. a `workspace.meta.json` file exists under `data/{workspaceId}/`).
 */
export async function validateWorkspaceId(
  workspaceId: string
): Promise<boolean> {
  const metaPath = getWorkspaceMetaPath(workspaceId);
  const meta = await readJsonSafe<WorkspaceMeta>(metaPath);
  return meta !== null && !!meta.workspace_id;
}

/**
 * Find the canonical workspace ID that a given (possibly legacy) workspace ID
 * maps to. Searches all registered workspaces' `legacy_workspace_ids` arrays.
 *
 * Returns `null` if no workspace claims this legacy ID.
 */
export async function findCanonicalForLegacyId(
  legacyId: string
): Promise<string | null> {
  const dataRoot = getDataRoot();
  const dirs = await listDirs(dataRoot);
  const legacyLower = legacyId.toLowerCase();

  for (const dir of dirs) {
    const meta = await readJsonSafe<WorkspaceMeta>(
      path.join(dataRoot, dir, 'workspace.meta.json')
    );
    if (!meta) continue;

    // Case-insensitive comparison for canonical ID
    if (meta.workspace_id?.toLowerCase() === legacyLower) {
      return meta.workspace_id; // It IS canonical (return actual casing)
    }

    // Case-insensitive comparison for legacy IDs
    if (
      Array.isArray(meta.legacy_workspace_ids) &&
      meta.legacy_workspace_ids.some(id => id.toLowerCase() === legacyLower)
    ) {
      return meta.workspace_id;
    }
  }

  return null;
}

/**
 * Resolve a workspace ID or throw a helpful error.
 *
 * 1. If `workspaceId` is directly registered → return its meta.
 * 2. If `workspaceId` appears in any workspace's `legacy_workspace_ids` →
 *    transparently redirect to the canonical workspace and return its meta.
 * 3. Otherwise throw `WorkspaceNotRegisteredError` with suggestions.
 */
export async function resolveOrReject(
  workspaceId: string
): Promise<{ meta: WorkspaceMeta; redirected_from?: string }> {
  // 1. Direct match
  const directMeta = await readJsonSafe<WorkspaceMeta>(
    getWorkspaceMetaPath(workspaceId)
  );
  if (directMeta && directMeta.workspace_id) {
    return { meta: directMeta };
  }

  // 2. Legacy ID redirect
  const canonicalId = await findCanonicalForLegacyId(workspaceId);
  if (canonicalId && canonicalId !== workspaceId) {
    const canonicalMeta = await readJsonSafe<WorkspaceMeta>(
      getWorkspaceMetaPath(canonicalId)
    );
    if (canonicalMeta) {
      return { meta: canonicalMeta, redirected_from: workspaceId };
    }
  }

  // 3. Throw with suggestions
  const suggestions = await findSimilarWorkspaceIds(workspaceId);
  throw new WorkspaceNotRegisteredError(workspaceId, suggestions);
}

// ---------------------------------------------------------------------------
// Workspace ID format validation
// ---------------------------------------------------------------------------

const WORKSPACE_ID_PATTERN = /^[a-z0-9_-]+-[a-f0-9]{12}$/;

/**
 * Check whether a workspace ID matches the canonical format: `{name}-{12-hex-chars}`.
 * Legacy IDs (plain folder names) will not match.
 */
export function isCanonicalIdFormat(workspaceId: string): boolean {
  return WORKSPACE_ID_PATTERN.test(workspaceId);
}

/**
 * Validate workspace_id format. Returns true if:
 * - The ID matches the canonical format, OR
 * - The ID is found in some workspace's `legacy_workspace_ids`.
 */
export async function validateWorkspaceIdFormat(
  workspaceId: string
): Promise<{ valid: boolean; reason?: string }> {
  if (WORKSPACE_ID_PATTERN.test(workspaceId)) {
    return { valid: true };
  }

  // Check if it's a known legacy ID
  const canonical = await findCanonicalForLegacyId(workspaceId);
  if (canonical) {
    return { valid: true, reason: `Legacy ID; canonical is '${canonical}'` };
  }

  return {
    valid: false,
    reason: `ID '${workspaceId}' does not match expected format: {name}-{12-hex-chars}`,
  };
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find workspace IDs that are similar to the given ID, for error messages.
 * Looks at registered workspace names and legacy IDs.
 */
async function findSimilarWorkspaceIds(
  targetId: string
): Promise<string[]> {
  const dataRoot = getDataRoot();
  const dirs = await listDirs(dataRoot);
  const suggestions: string[] = [];
  const targetLower = targetId.toLowerCase();

  for (const dir of dirs) {
    const meta = await readJsonSafe<WorkspaceMeta>(
      path.join(dataRoot, dir, 'workspace.meta.json')
    );
    if (!meta) continue;

    // Check if name is similar
    const name = (meta.name || '').toLowerCase();
    const wsId = (meta.workspace_id || '').toLowerCase();

    if (
      wsId.includes(targetLower) ||
      targetLower.includes(wsId) ||
      name.includes(targetLower) ||
      targetLower.includes(name)
    ) {
      suggestions.push(meta.workspace_id);
    }
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Ghost & merge helpers
// ---------------------------------------------------------------------------

export interface GhostFolderInfo {
  folder_name: string;
  folder_path: string;
  contents: string[];
  plan_ids: string[];
  likely_canonical_match: string | null;
  match_reason: string | null;
  suggested_merge_command: string | null;
}

/**
 * Scan the data root for "ghost" folders — directories without a `workspace.meta.json`.
 * Cross-references known `legacy_workspace_ids` and plan overlaps to suggest canonical matches.
 */
export async function scanGhostFolders(): Promise<GhostFolderInfo[]> {
  const dataRoot = getDataRoot();
  const dirs = await listDirs(dataRoot);
  const systemDirs = new Set(['events', 'logs']);
  const ghosts: GhostFolderInfo[] = [];

  // Build a map of canonical workspaces for cross-referencing
  const canonicalWorkspaces: Array<{
    id: string;
    meta: WorkspaceMeta;
    activePlans: string[];
  }> = [];

  for (const dir of dirs) {
    if (systemDirs.has(dir)) continue;
    const meta = await readJsonSafe<WorkspaceMeta>(
      path.join(dataRoot, dir, 'workspace.meta.json')
    );
    if (meta) {
      canonicalWorkspaces.push({
        id: dir,
        meta,
        activePlans: [
          ...(meta.active_plans || []),
          ...(meta.archived_plans || []),
        ],
      });
    }
  }

  // Find ghost folders
  for (const dir of dirs) {
    if (systemDirs.has(dir)) continue;

    const metaPath = path.join(dataRoot, dir, 'workspace.meta.json');
    if (await pathExists(metaPath)) continue; // Not a ghost

    const folderPath = path.join(dataRoot, dir);
    const contents = await listDirContents(folderPath);
    const planIds = await findPlanIdsInDir(folderPath);

    // Try to find a canonical match
    const { matchId, reason } = findCanonicalMatch(
      dir,
      planIds,
      canonicalWorkspaces
    );

    ghosts.push({
      folder_name: dir,
      folder_path: folderPath,
      contents,
      plan_ids: planIds,
      likely_canonical_match: matchId,
      match_reason: reason,
      suggested_merge_command: matchId
        ? `merge-workspace --source ${dir} --target ${matchId}`
        : null,
    });
  }

  return ghosts;
}

async function listDirContents(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map(e => (e.isDirectory() ? `${e.name}/` : e.name));
  } catch {
    return [];
  }
}

async function findPlanIdsInDir(dirPath: string): Promise<string[]> {
  const plansDir = path.join(dirPath, 'plans');
  if (!(await pathExists(plansDir))) return [];
  return listDirs(plansDir);
}

function findCanonicalMatch(
  ghostName: string,
  ghostPlanIds: string[],
  canonicals: Array<{ id: string; meta: WorkspaceMeta; activePlans: string[] }>
): { matchId: string | null; reason: string | null } {
  // 1. Check legacy_workspace_ids (case-insensitive)
  const ghostLower = ghostName.toLowerCase();
  for (const c of canonicals) {
    if (
      Array.isArray(c.meta.legacy_workspace_ids) &&
      c.meta.legacy_workspace_ids.some(id => id.toLowerCase() === ghostLower)
    ) {
      return { matchId: c.id, reason: `Ghost name found in legacy_workspace_ids` };
    }
  }

  // 2. Check plan overlap
  if (ghostPlanIds.length > 0) {
    for (const c of canonicals) {
      const overlap = ghostPlanIds.filter(p => c.activePlans.includes(p));
      if (overlap.length > 0) {
        return {
          matchId: c.id,
          reason: `Plan overlap: ${overlap.join(', ')}`,
        };
      }
    }
  }

  // 3. Name similarity (ghost name is a prefix/suffix of canonical)
  for (const c of canonicals) {
    const cLower = c.id.toLowerCase();
    const cName = (c.meta.name || '').toLowerCase();
    if (
      cLower.startsWith(ghostLower) ||
      ghostLower.startsWith(cName) ||
      cName === ghostLower
    ) {
      return { matchId: c.id, reason: `Name similarity: '${ghostName}' ≈ '${c.id}'` };
    }
  }

  return { matchId: null, reason: null };
}

// ---------------------------------------------------------------------------
// Merge operations
// ---------------------------------------------------------------------------

export interface MergeResult {
  merged_plans: string[];
  merged_logs: string[];
  source_deleted: boolean;
  notes: string[];
}

/**
 * Merge a ghost/source workspace folder into a target canonical workspace.
 *
 * - Moves plan folders from source → target (skips duplicates)
 * - Updates `workspace_id` in every moved `state.json`
 * - Appends source ID to target's `legacy_workspace_ids`
 * - Deletes the now-empty source folder
 * - Writes an audit entry to `workspace.context.json`
 *
 * @param sourceId  The ghost/source folder name under data root
 * @param targetId  The canonical workspace ID to merge into
 * @param dryRun    If true, report what would happen without making changes
 */
export async function mergeWorkspace(
  sourceId: string,
  targetId: string,
  dryRun: boolean = true
): Promise<MergeResult> {
  const dataRoot = getDataRoot();
  const sourcePath = path.join(dataRoot, sourceId);
  const targetPath = path.join(dataRoot, targetId);
  const result: MergeResult = {
    merged_plans: [],
    merged_logs: [],
    source_deleted: false,
    notes: [],
  };

  // Validate target exists and has workspace.meta.json
  const targetMetaPath = path.join(targetPath, 'workspace.meta.json');
  const targetMeta = await readJsonSafe<WorkspaceMeta>(targetMetaPath);
  if (!targetMeta) {
    result.notes.push(`ERROR: Target '${targetId}' has no workspace.meta.json — refusing to merge.`);
    return result;
  }

  // Validate source exists
  if (!(await pathExists(sourcePath))) {
    result.notes.push(`ERROR: Source '${sourceId}' does not exist.`);
    return result;
  }

  // Find plans in source
  const sourcePlanIds = await findPlanIdsInDir(sourcePath);
  const targetPlanIds = await findPlanIdsInDir(targetPath);
  const targetPlanSet = new Set(targetPlanIds);

  // Move plans
  for (const planId of sourcePlanIds) {
    const sourcePlanDir = path.join(sourcePath, 'plans', planId);
    const targetPlanDir = path.join(targetPath, 'plans', planId);

    if (targetPlanSet.has(planId)) {
      result.notes.push(`Skipped plan '${planId}': already exists in target.`);
      continue;
    }

    if (!dryRun) {
      await fs.mkdir(path.join(targetPath, 'plans'), { recursive: true });
      await moveDirSafe(sourcePlanDir, targetPlanDir);

      // Update workspace_id in state.json (or create minimal state if missing)
      const statePath = path.join(targetPlanDir, 'state.json');
      const state = await readJsonSafe<Record<string, unknown>>(statePath);
      if (state) {
        state.workspace_id = targetId;
        state.updated_at = new Date().toISOString();
        await writeJsonLocked(statePath, state);
      } else {
        // Create minimal state for plans that only have logs
        const minimalState = {
          id: planId,
          workspace_id: targetId,
          title: `Recovered plan: ${planId}`,
          status: 'archived',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          steps: [],
          notes: ['This plan was recovered during workspace migration. No original state.json was found.'],
        };
        await writeJsonLocked(statePath, minimalState);
        result.notes.push(`Created minimal state.json for plan '${planId}' (was missing).`);
      }
    }

    result.merged_plans.push(planId);
  }

  // Merge logs (source logs → target logs by appending)
  const sourceLogsDir = path.join(sourcePath, 'logs');
  if (await pathExists(sourceLogsDir)) {
    try {
      const logFiles = await fs.readdir(sourceLogsDir);
      for (const logFile of logFiles) {
        const sourceLogPath = path.join(sourceLogsDir, logFile);
        const targetLogsDir = path.join(targetPath, 'logs');
        const targetLogPath = path.join(targetLogsDir, logFile);

        if (!dryRun) {
          await fs.mkdir(targetLogsDir, { recursive: true });
          const sourceContent = await fs.readFile(sourceLogPath, 'utf-8');
          try {
            const existing = await fs.readFile(targetLogPath, 'utf-8');
            await fs.writeFile(
              targetLogPath,
              existing + '\n' + sourceContent,
              'utf-8'
            );
          } catch {
            // Target log doesn't exist, just copy
            await fs.writeFile(targetLogPath, sourceContent, 'utf-8');
          }
        }

        result.merged_logs.push(logFile);
      }
    } catch {
      result.notes.push('No logs directory in source or failed to read logs.');
    }
  }

  // Update target's workspace.meta.json with legacy ID
  if (!dryRun) {
    const legacyIds = new Set<string>(targetMeta.legacy_workspace_ids || []);
    legacyIds.add(sourceId);
    targetMeta.legacy_workspace_ids = Array.from(legacyIds);
    targetMeta.updated_at = new Date().toISOString();
    await writeJsonLocked(targetMetaPath, targetMeta);

    // Write audit entry to workspace.context.json
    const contextPath = path.join(targetPath, 'workspace.context.json');
    await modifyJsonLocked<WorkspaceContext>(contextPath, (existing) => {
      const context = existing || {
        schema_version: '1.0.0',
        workspace_id: targetId,
        workspace_path: targetMeta.workspace_path || targetMeta.path || '',
        name: targetMeta.name || targetId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sections: {},
      } as WorkspaceContext;

      const auditLog = context.audit_log || { entries: [], last_updated: '' };
      auditLog.entries.push({
        timestamp: new Date().toISOString(),
        tool: 'merge-workspace',
        action: 'merge',
        file_path: targetMetaPath,
        summary: `Merged ghost folder '${sourceId}' → '${targetId}'. Plans: ${result.merged_plans.join(', ') || 'none'}. Logs: ${result.merged_logs.join(', ') || 'none'}.`,
        warning: '',
      });
      auditLog.last_updated = new Date().toISOString();
      context.audit_log = auditLog;
      context.updated_at = new Date().toISOString();
      return context;
    });
  }

  // Verify no plan state.json still references sourceId
  if (!dryRun) {
    const remainingRefs = await checkRemainingReferences(sourceId, targetId);
    if (remainingRefs.length > 0) {
      result.notes.push(
        `WARNING: ${remainingRefs.length} plan state(s) still reference '${sourceId}'. Not deleting source.`
      );
    } else {
      // Delete source folder
      try {
        await fs.rm(sourcePath, { recursive: true, force: true });
        result.source_deleted = true;
      } catch (err) {
        result.notes.push(`Failed to delete source folder: ${(err as Error).message}`);
      }
    }
  }

  if (dryRun) {
    result.notes.push('DRY RUN — no changes were made.');
  }

  return result;
}

/**
 * Check if any plan `state.json` in the target workspace still references
 * the source workspace ID.
 */
async function checkRemainingReferences(
  sourceId: string,
  targetId: string
): Promise<string[]> {
  const dataRoot = getDataRoot();
  const targetPlansDir = path.join(dataRoot, targetId, 'plans');
  const planIds = await listDirs(targetPlansDir);
  const references: string[] = [];

  for (const planId of planIds) {
    const statePath = path.join(targetPlansDir, planId, 'state.json');
    const state = await readJsonSafe<Record<string, unknown>>(statePath);
    if (state && state.workspace_id === sourceId) {
      references.push(planId);
    }
  }

  return references;
}

// ---------------------------------------------------------------------------
// Full workspace migration (register + scan + merge + cleanup)
// ---------------------------------------------------------------------------

export interface MigrateWorkspaceResult {
  workspace_id: string;
  workspace_path: string;
  identity_written: boolean;
  ghost_folders_found: GhostFolderInfo[];
  ghost_folders_merged: string[];
  plans_recovered: string[];
  folders_deleted: string[];
  notes: string[];
}

/**
 * Full workspace migration: re-register, find all ghost/duplicate folders,
 * merge their plans into the canonical workspace, and clean up.
 *
 * This is the "just fix everything" action for workspaces that were
 * created under older versions of the system.
 *
 * Steps:
 * 1. Resolve the canonical workspace ID for the path
 * 2. Ensure the canonical workspace folder + meta exist
 * 3. Scan all data folders for ghosts that match this workspace
 * 4. Merge plans from every matching ghost into the canonical folder
 * 5. Delete the now-empty ghost folders
 * 6. Write/refresh identity.json in the workspace directory
 */
export async function migrateWorkspace(
  workspacePath: string
): Promise<MigrateWorkspaceResult> {
  const resolvedPath = safeResolvePath(workspacePath);
  const dataRoot = getDataRoot();
  const canonicalId = await resolveCanonicalWorkspaceId(resolvedPath);

  const result: MigrateWorkspaceResult = {
    workspace_id: canonicalId,
    workspace_path: resolvedPath,
    identity_written: false,
    ghost_folders_found: [],
    ghost_folders_merged: [],
    plans_recovered: [],
    folders_deleted: [],
    notes: [],
  };

  // 1. Ensure canonical workspace directory exists with meta
  const canonicalPath = path.join(dataRoot, canonicalId);
  const canonicalMetaPath = path.join(canonicalPath, 'workspace.meta.json');
  const canonicalPlansDir = path.join(canonicalPath, 'plans');
  await fs.mkdir(canonicalPlansDir, { recursive: true });

  let canonicalMeta = await readJsonSafe<WorkspaceMeta>(canonicalMetaPath);
  const now = new Date().toISOString();

  if (!canonicalMeta) {
    // Create fresh meta for this workspace
    canonicalMeta = {
      schema_version: '1.0.0',
      workspace_id: canonicalId,
      workspace_path: resolvedPath,
      path: resolvedPath,
      name: path.basename(resolvedPath),
      created_at: now,
      updated_at: now,
      registered_at: now,
      last_accessed: now,
      last_seen_at: now,
      data_root: dataRoot,
      legacy_workspace_ids: [],
      active_plans: [],
      archived_plans: [],
      active_programs: [],
      indexed: false,
    };
    await writeJsonLocked(canonicalMetaPath, canonicalMeta);
    result.notes.push(`Created canonical workspace folder: ${canonicalId}`);
  } else {
    canonicalMeta.last_accessed = now;
    canonicalMeta.last_seen_at = now;
    canonicalMeta.updated_at = now;
    canonicalMeta.workspace_path = canonicalMeta.workspace_path || resolvedPath;
    canonicalMeta.data_root = canonicalMeta.data_root || dataRoot;
  }

  // 2. Find ALL folders in data root that could belong to this workspace
  const allDirs = await listDirs(dataRoot);
  const systemDirs = new Set(['events', 'logs']);
  const normalizedTarget = normalizeWorkspacePath(resolvedPath);
  const matchingGhosts: GhostFolderInfo[] = [];
  const canonicalIdLower = canonicalId.toLowerCase();

  for (const dir of allDirs) {
    // Skip system dirs and the canonical folder itself (case-insensitive)
    if (systemDirs.has(dir) || dir.toLowerCase() === canonicalIdLower) continue;

    const dirPath = path.join(dataRoot, dir);
    const dirMeta = await readJsonSafe<WorkspaceMeta>(
      path.join(dirPath, 'workspace.meta.json')
    );

    let isMatch = false;
    let matchReason = '';

    if (dirMeta) {
      // Has meta — check if workspace_path matches
      const metaPath = dirMeta.workspace_path || dirMeta.path;
      if (metaPath && normalizeWorkspacePath(metaPath) === normalizedTarget) {
        isMatch = true;
        matchReason = `workspace_path matches: ${metaPath}`;
      }
    } else {
      // Ghost folder (no meta) — check legacy IDs and name similarity (case-insensitive)
      const dirLower = dir.toLowerCase();
      const legacyIdsLower = (canonicalMeta.legacy_workspace_ids || []).map(id => id.toLowerCase());
      if (legacyIdsLower.includes(dirLower)) {
        isMatch = true;
        matchReason = `Listed in canonical legacy_workspace_ids`;
      } else {
        // Check name similarity (folder name is prefix of canonical or vice versa)
        const baseName = path.basename(resolvedPath).toLowerCase();
        if (dirLower === baseName || dirLower.startsWith(baseName + '-') || baseName.startsWith(dirLower)) {
          isMatch = true;
          matchReason = `Name similarity: '${dir}' ≈ workspace '${path.basename(resolvedPath)}'`;
        }
      }
    }

    if (isMatch) {
      const planIds = await findPlanIdsInDir(dirPath);
      const contents = await listDirContents(dirPath);
      matchingGhosts.push({
        folder_name: dir,
        folder_path: dirPath,
        contents,
        plan_ids: planIds,
        likely_canonical_match: canonicalId,
        match_reason: matchReason,
        suggested_merge_command: null,
      });
    }
  }

  result.ghost_folders_found = matchingGhosts;

  // 3. Merge plans from each matching ghost into canonical
  const existingPlanIds = new Set(await findPlanIdsInDir(canonicalPath));

  for (const ghost of matchingGhosts) {
    const ghostPath = path.join(dataRoot, ghost.folder_name);
    let mergedAny = false;

    for (const planId of ghost.plan_ids) {
      if (existingPlanIds.has(planId)) {
        result.notes.push(`Skipped plan '${planId}' from '${ghost.folder_name}': already exists in canonical.`);
        continue;
      }

      const sourcePlanDir = path.join(ghostPath, 'plans', planId);
      const targetPlanDir = path.join(canonicalPlansDir, planId);

      await moveDirSafe(sourcePlanDir, targetPlanDir);

      // Update workspace_id in state.json (or create minimal state if missing)
      const statePath = path.join(targetPlanDir, 'state.json');
      const state = await readJsonSafe<Record<string, unknown>>(statePath);
      if (state) {
        state.workspace_id = canonicalId;
        state.updated_at = now;
        await writeJsonLocked(statePath, state);
      } else {
        // Create minimal state for plans that only have logs
        const minimalState = {
          id: planId,
          workspace_id: canonicalId,
          title: `Recovered plan: ${planId}`,
          status: 'archived',
          created_at: now,
          updated_at: now,
          steps: [],
          notes: ['This plan was recovered during workspace migration. No original state.json was found.'],
        };
        await writeJsonLocked(statePath, minimalState);
        result.notes.push(`Created minimal state.json for plan '${planId}' (was missing).`);
      }

      existingPlanIds.add(planId);
      result.plans_recovered.push(planId);
      mergedAny = true;
    }

    // Merge logs if present
    const ghostLogsDir = path.join(ghostPath, 'logs');
    if (await pathExists(ghostLogsDir)) {
      try {
        const logFiles = await fs.readdir(ghostLogsDir);
        const targetLogsDir = path.join(canonicalPath, 'logs');
        await fs.mkdir(targetLogsDir, { recursive: true });
        for (const logFile of logFiles) {
          const srcLog = path.join(ghostLogsDir, logFile);
          const dstLog = path.join(targetLogsDir, logFile);
          const srcContent = await fs.readFile(srcLog, 'utf-8');
          try {
            const existing = await fs.readFile(dstLog, 'utf-8');
            await fs.writeFile(dstLog, existing + '\n' + srcContent, 'utf-8');
          } catch {
            await fs.writeFile(dstLog, srcContent, 'utf-8');
          }
        }
      } catch {
        // ignore log merge failures
      }
    }

    // Record as legacy ID
    if (!canonicalMeta.legacy_workspace_ids) {
      canonicalMeta.legacy_workspace_ids = [];
    }
    if (!canonicalMeta.legacy_workspace_ids.includes(ghost.folder_name)) {
      canonicalMeta.legacy_workspace_ids.push(ghost.folder_name);
    }

    if (mergedAny) {
      result.ghost_folders_merged.push(ghost.folder_name);
    }

    // Delete the ghost folder
    try {
      await fs.rm(ghostPath, { recursive: true, force: true });
      result.folders_deleted.push(ghost.folder_name);
    } catch (err) {
      result.notes.push(`Failed to delete '${ghost.folder_name}': ${(err as Error).message}`);
    }
  }

  // 4. Update the canonical workspace.meta.json plan lists
  const allPlanIds = await findPlanIdsInDir(canonicalPath);
  const activePlans: string[] = [];
  const archivedPlans: string[] = [];
  for (const planId of allPlanIds) {
    const statePath = path.join(canonicalPlansDir, planId, 'state.json');
    const state = await readJsonSafe<Record<string, unknown>>(statePath);
    if (state?.status === 'archived') {
      archivedPlans.push(planId);
    } else {
      activePlans.push(planId);
    }
  }
  canonicalMeta.active_plans = activePlans;
  canonicalMeta.archived_plans = archivedPlans;
  canonicalMeta.updated_at = now;
  await writeJsonLocked(canonicalMetaPath, canonicalMeta);

  // 5. Write/refresh identity.json in the workspace directory
  const { resolveAccessiblePath: resolveAccessible } = await import('./workspace-mounts.js');
  const accessibleMigratePath = await resolveAccessible(resolvedPath);
  if (accessibleMigratePath) {
    try {
      const identityPath = getWorkspaceIdentityPath(accessibleMigratePath);
      await modifyJsonLocked<WorkspaceIdentityFile>(identityPath, (existingIdentity) => {
        return {
          schema_version: '1.0.0',
          workspace_id: canonicalId,
          workspace_path: resolvedPath,
          data_root: dataRoot,
          created_at: existingIdentity?.created_at || now,
          updated_at: now,
          project_mcps: existingIdentity?.project_mcps,
        };
      });
      result.identity_written = true;
    } catch (err) {
      result.notes.push(`Failed to write identity.json: ${(err as Error).message}`);
    }
  } else {
    result.notes.push(`Workspace path not accessible from this process (container mode?): ${resolvedPath}`);
  }

  // 6. Update workspace-registry.json
  try {
    await upsertRegistryEntry(resolvedPath, canonicalId);
  } catch (err) {
    result.notes.push(`Failed to update workspace registry: ${(err as Error).message}`);
  }

  return result;
}
