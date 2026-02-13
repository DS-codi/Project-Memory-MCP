/**
 * File Store - Disk I/O operations for Project Memory MCP Server
 * 
 * Handles all file system operations including:
 * - Workspace directory management
 * - Plan state persistence
 * - Context and research note storage
 * - File locking for concurrent access (via file-lock.ts)
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { PlanState, WorkspaceMeta, WorkspaceProfile, RequestCategory, RequestCategorization, BuildScript, WorkspaceContext, WorkspaceOverlapInfo } from '../types/index.js';
import { STEP_TYPE_BEHAVIORS } from '../types/index.js';
import { appendWorkspaceFileUpdate } from '../logging/workspace-update-log.js';
import {
  getDataRoot as resolveDataRoot,
  getWorkspaceDisplayName,
  getWorkspaceIdFromPath,
  normalizeWorkspacePath,
  safeResolvePath
} from './workspace-utils.js';
import {
  resolveCanonicalWorkspaceId,
  readWorkspaceIdentityFile as readIdentityFileFromModule,
  validateWorkspaceId as validateWsId,
  WorkspaceNotRegisteredError,
  getWorkspaceIdentityPath as getIdentityPath,
  type WorkspaceIdentityFile as IdentityFile,
} from './workspace-identity.js';
import {
  fileLockManager,
  readJson,
  writeJson,
  modifyJsonLocked,
  writeJsonLocked,
} from './file-lock.js';
import { upsertRegistryEntry, readRegistry } from './workspace-registry.js';
import { detectOverlaps, checkRegistryForOverlaps } from './workspace-hierarchy.js';

// Re-export from workspace-identity module for backwards compatibility
export type { WorkspaceIdentityFile } from './workspace-identity.js';
export { getWorkspaceIdentityPath } from './workspace-identity.js';

// Re-export locking utilities from file-lock module for backwards compatibility
export { readJson, writeJson, modifyJsonLocked, writeJsonLocked } from './file-lock.js';

export interface WorkspaceMigrationReport {
  action: 'none' | 'aliased' | 'migrated';
  canonical_workspace_id: string;
  legacy_workspace_ids: string[];
  notes: string[];
}

// WorkspaceIdentityFile is now defined in and re-exported from workspace-identity.ts

// =============================================================================
// Configuration
// =============================================================================

const WORKSPACE_SCHEMA_VERSION = '1.0.0';

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check whether a workspace path is genuinely accessible from this process.
 *
 * In container mode (Linux), Windows-style paths like `s:\\foo` or `C:\\Users\\...`
 * are not reachable directly, but may be available via workspace mounts.
 * This guard prevents spurious writes to phantom directories while still
 * allowing access to properly mounted workspace directories.
 */
async function isWorkspaceAccessible(workspacePath: string): Promise<boolean> {
  const { resolveAccessiblePath } = await import('./workspace-mounts.js');
  const accessible = await resolveAccessiblePath(workspacePath);
  return accessible !== null;
}

/**
 * Generate a workspace ID from a path using a hash
 */
export function generateWorkspaceId(workspacePath: string): string {
  return getWorkspaceIdFromPath(workspacePath);
}

export async function resolveWorkspaceIdForPath(workspacePath: string): Promise<string> {
  return resolveCanonicalWorkspaceId(workspacePath);
}

/**
 * Generate a unique plan ID
 */
export function generatePlanId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `plan_${timestamp}_${random}`;
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `sess_${timestamp}_${random}`;
}

/**
 * Get the current ISO timestamp
 */
export function nowISO(): string {
  return new Date().toISOString();
}

// =============================================================================
// Path Helpers
// =============================================================================

export function getDataRoot(): string {
  return resolveDataRoot();
}

export function getWorkspacePath(workspaceId: string): string {
  return path.join(getDataRoot(), workspaceId);
}

export function getWorkspaceMetaPath(workspaceId: string): string {
  return path.join(getWorkspacePath(workspaceId), 'workspace.meta.json');
}

export function getWorkspaceContextPath(workspaceId: string): string {
  return path.join(getWorkspacePath(workspaceId), 'workspace.context.json');
}

export function getPlansPath(workspaceId: string): string {
  return path.join(getWorkspacePath(workspaceId), 'plans');
}

export function getPlanPath(workspaceId: string, planId: string): string {
  return path.join(getPlansPath(workspaceId), planId);
}

export function getPlanStatePath(workspaceId: string, planId: string): string {
  return path.join(getPlanPath(workspaceId, planId), 'state.json');
}

export function getPlanMdPath(workspaceId: string, planId: string): string {
  return path.join(getPlanPath(workspaceId, planId), 'plan.md');
}

export function getResearchNotesPath(workspaceId: string, planId: string): string {
  return path.join(getPlanPath(workspaceId, planId), 'research_notes');
}

export function getContextPath(workspaceId: string, planId: string, contextType: string): string {
  return path.join(getPlanPath(workspaceId, planId), `${contextType}.json`);
}

// readWorkspaceIdentityFile is now provided by workspace-identity.ts
const readWorkspaceIdentityFile = readIdentityFileFromModule;

// =============================================================================
// Workspace Validation Guard
// =============================================================================

/**
 * Assert that a workspace is registered before writing data to it.
 * Prevents silent creation of ghost directories from unvalidated workspace IDs.
 *
 * This guard is called by write operations like `savePlanState` and `createPlan`.
 * Read operations do NOT call this guard (they'll just return null for missing data).
 */
async function assertWorkspaceRegistered(workspaceId: string): Promise<void> {
  const isValid = await validateWsId(workspaceId);
  if (!isValid) {
    throw new WorkspaceNotRegisteredError(workspaceId);
  }
}

// =============================================================================
// Directory Operations
// =============================================================================

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Check if a path exists
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List directories in a path
 */
export async function listDirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

// =============================================================================
// JSON File Operations (locking provided by file-lock.ts)
// =============================================================================

/**
 * Write a text file
 */
export async function writeText(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Read a text file
 */
export async function readText(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// =============================================================================
// Workspace Migration
// =============================================================================

function mergeLegacyWorkspaceIds(existing: string[] | undefined, legacyIds: string[]): string[] {
  const merged = new Set(existing ?? []);
  for (const id of legacyIds) {
    if (id) {
      merged.add(id);
    }
  }
  return Array.from(merged);
}

/**
 * Fix B: Scan all workspace.meta.json files in the data root for one whose
 * normalized workspace_path matches the given path. Returns the workspace ID
 * if found, or null. This is a safety net to prevent duplicate workspace creation
 * when identity.json and the registry both fail (e.g., first container run).
 */
async function findExistingWorkspaceByPath(workspacePath: string): Promise<string | null> {
  const normalizedTarget = normalizeWorkspacePath(workspacePath);
  const dirs = await listDirs(getDataRoot());

  for (const dir of dirs) {
    const meta = await readJson<WorkspaceMeta>(getWorkspaceMetaPath(dir));
    if (!meta) continue;

    const metaPath = meta.workspace_path || meta.path;
    if (!metaPath) continue;

    if (normalizeWorkspacePath(metaPath) === normalizedTarget) {
      return meta.workspace_id || dir;
    }
  }

  return null;
}

async function findLegacyWorkspaceMetas(
  workspacePath: string,
  canonicalId: string
): Promise<WorkspaceMeta[]> {
  const normalizedTarget = normalizeWorkspacePath(workspacePath);
  const workspaceIds = await listDirs(getDataRoot());
  const matches: WorkspaceMeta[] = [];

  for (const id of workspaceIds) {
    if (id === canonicalId) {
      continue;
    }

    const meta = await readJson<WorkspaceMeta>(getWorkspaceMetaPath(id));
    if (!meta) {
      continue;
    }

    const metaPath = meta.workspace_path || meta.path;
    if (!metaPath) {
      continue;
    }

    const normalizedMetaPath = normalizeWorkspacePath(metaPath);
    if (normalizedMetaPath === normalizedTarget) {
      matches.push(meta);
    }
  }

  return matches;
}

async function updateWorkspaceContextIds(
  workspaceId: string,
  newWorkspaceId: string,
  workspacePath: string
): Promise<boolean> {
  const contextPath = getWorkspaceContextPath(workspaceId);
  let changed = false;

  await modifyJsonLocked<WorkspaceContext>(contextPath, (context) => {
    if (!context) {
      // No context file — nothing to update
      return null as unknown as WorkspaceContext;
    }

    if (context.workspace_id !== newWorkspaceId) {
      context.workspace_id = newWorkspaceId;
      changed = true;
    }
    if (context.workspace_path !== workspacePath) {
      context.workspace_path = workspacePath;
      changed = true;
    }

    if (changed) {
      context.updated_at = nowISO();
    }
    return context;
  });

  return changed;
}

async function updatePlanWorkspaceIds(
  workspaceId: string,
  newWorkspaceId: string
): Promise<number> {
  const plansPath = getPlansPath(workspaceId);
  const planIds = await listDirs(plansPath);
  let updated = 0;

  for (const planId of planIds) {
    const planPath = getPlanStatePath(workspaceId, planId);
    await modifyJsonLocked<PlanState>(planPath, (plan) => {
      if (!plan) {
        return null as unknown as PlanState;
      }
      if (plan.workspace_id !== newWorkspaceId) {
        plan.workspace_id = newWorkspaceId;
        plan.updated_at = nowISO();
        updated += 1;
      }
      return plan;
    });
  }

  return updated;
}

async function migrateLegacyWorkspace(
  workspacePath: string,
  canonicalId: string
): Promise<WorkspaceMigrationReport> {
  const report: WorkspaceMigrationReport = {
    action: 'none',
    canonical_workspace_id: canonicalId,
    legacy_workspace_ids: [],
    notes: []
  };

  const legacyMetas = await findLegacyWorkspaceMetas(workspacePath, canonicalId);
  if (legacyMetas.length === 0) {
    return report;
  }

  const legacyIds = legacyMetas.map(meta => meta.workspace_id).filter(Boolean);
  report.legacy_workspace_ids = legacyIds;

  const canonicalMeta = await getWorkspace(canonicalId);
  if (canonicalMeta) {
    canonicalMeta.legacy_workspace_ids = mergeLegacyWorkspaceIds(
      canonicalMeta.legacy_workspace_ids,
      legacyIds
    );
    canonicalMeta.updated_at = nowISO();
    await saveWorkspace(canonicalMeta);
    report.action = 'aliased';
    report.notes.push('Canonical workspace exists; recorded legacy IDs without moving data.');
    await appendWorkspaceFileUpdate({
      workspace_id: canonicalId,
      file_path: getWorkspaceMetaPath(canonicalId),
      summary: `Recorded legacy workspace IDs: ${legacyIds.join(', ')}`,
      action: 'alias_legacy_workspace'
    });
    return report;
  }

  const primaryLegacy = legacyMetas[0];
  const primaryLegacyId = primaryLegacy.workspace_id;
  const legacyPath = getWorkspacePath(primaryLegacyId);
  const canonicalPath = getWorkspacePath(canonicalId);

  if (!(await exists(canonicalPath))) {
    await ensureDir(getDataRoot());
    await fs.rename(legacyPath, canonicalPath);
  } else {
    report.notes.push('Canonical workspace directory already exists; skipped folder rename.');
  }

  const resolvedPath = safeResolvePath(workspacePath);
  const meta: WorkspaceMeta = {
    ...primaryLegacy,
    workspace_id: canonicalId,
    workspace_path: resolvedPath,
    path: resolvedPath,
    legacy_workspace_ids: mergeLegacyWorkspaceIds(primaryLegacy.legacy_workspace_ids, legacyIds),
    updated_at: nowISO()
  };

  await writeJsonLocked(getWorkspaceMetaPath(canonicalId), meta);
  await updateWorkspaceContextIds(canonicalId, canonicalId, resolvedPath);
  await updatePlanWorkspaceIds(canonicalId, canonicalId);

  report.action = 'migrated';
  await appendWorkspaceFileUpdate({
    workspace_id: canonicalId,
    file_path: getWorkspaceMetaPath(canonicalId),
    summary: `Migrated legacy workspace ${primaryLegacyId} to ${canonicalId}`,
    action: 'migrate_workspace'
  });

  if (legacyMetas.length > 1) {
    report.notes.push('Multiple legacy workspace IDs found; only the first was migrated.');
  }

  return report;
}

// =============================================================================
// Workspace Operations
// =============================================================================

/**
 * Initialize the data root directory
 */
export async function initDataRoot(): Promise<void> {
  await ensureDir(getDataRoot());
}

/**
 * Get all registered workspaces
 */
export async function getAllWorkspaces(): Promise<WorkspaceMeta[]> {
  const allDirs = await listDirs(getDataRoot());
  // Skip backup directories, system directories, and non-workspace folders
  const workspaceIds = allDirs.filter(d => !d.endsWith('.bak') && !d.startsWith('.'));
  const workspaces: WorkspaceMeta[] = [];
  
  for (const id of workspaceIds) {
    const meta = await readJson<WorkspaceMeta>(getWorkspaceMetaPath(id));
    if (meta) {
      workspaces.push(meta);
    }
  }
  
  return workspaces;
}

/**
 * Get a workspace by ID
 */
export async function getWorkspace(workspaceId: string): Promise<WorkspaceMeta | null> {
  return readJson<WorkspaceMeta>(getWorkspaceMetaPath(workspaceId));
}

/**
 * Save workspace metadata
 */
export async function saveWorkspace(meta: WorkspaceMeta): Promise<void> {
  const filePath = getWorkspaceMetaPath(meta.workspace_id);
  await writeJsonLocked(filePath, meta);
  await appendWorkspaceFileUpdate({
    workspace_id: meta.workspace_id,
    file_path: filePath,
    summary: 'Updated workspace metadata',
    action: 'save_workspace'
  });
}

/**
 * Create a new workspace
 *
 * When `force` is falsy the function first scans for overlapping workspaces
 * (parent directories / child directories that already have identity.json,
 * plus registry-based path containment). If overlaps are found the workspace
 * is NOT created and the result contains `overlap: WorkspaceOverlapInfo[]`.
 */
export async function createWorkspace(
  workspacePath: string, 
  profile?: WorkspaceProfile,
  force?: boolean
): Promise<{ meta: WorkspaceMeta; migration: WorkspaceMigrationReport; created: boolean; overlap?: WorkspaceOverlapInfo[] }> {
  const resolvedPath = safeResolvePath(workspacePath);
  const workspaceId = await resolveWorkspaceIdForPath(resolvedPath);
  const workspaceDir = getWorkspacePath(workspaceId);

  const migration = await migrateLegacyWorkspace(resolvedPath, workspaceId);
  
  // Check if already exists
  const existing = await getWorkspace(workspaceId);
  if (existing) {
    // Update last accessed and optionally update profile
    const now = nowISO();
    existing.last_accessed = now;
    existing.last_seen_at = now;
    existing.updated_at = now;
    existing.schema_version = existing.schema_version || WORKSPACE_SCHEMA_VERSION;
    // Always update path to the caller's declared path — fixes stale/corrupted paths
    existing.workspace_path = resolvedPath;
    existing.path = resolvedPath;
    existing.data_root = existing.data_root || getDataRoot();
    existing.created_at = existing.created_at || existing.registered_at || now;
    if (migration.legacy_workspace_ids.length > 0) {
      existing.legacy_workspace_ids = mergeLegacyWorkspaceIds(
        existing.legacy_workspace_ids,
        migration.legacy_workspace_ids
      );
    }
    if (profile) {
      existing.profile = profile;
      existing.indexed = true;
    }
    await saveWorkspace(existing);
    // Fix C: update workspace registry
    await upsertRegistryEntry(resolvedPath, workspaceId);
    return { meta: existing, migration, created: false };
  }

  // Fix B: Path-based dedup scan — before creating a new workspace, check if ANY
  // existing workspace.meta.json has a matching normalized workspace_path.
  const dedupId = await findExistingWorkspaceByPath(resolvedPath);
  if (dedupId) {
    const dedupMeta = await getWorkspace(dedupId);
    if (dedupMeta) {
      const now = nowISO();
      dedupMeta.last_accessed = now;
      dedupMeta.last_seen_at = now;
      dedupMeta.updated_at = now;
      dedupMeta.workspace_path = resolvedPath;
      dedupMeta.path = resolvedPath;
      if (profile) {
        dedupMeta.profile = profile;
        dedupMeta.indexed = true;
      }
      await saveWorkspace(dedupMeta);
      await upsertRegistryEntry(resolvedPath, dedupId);
      migration.notes.push(`Dedup: found existing workspace '${dedupId}' matching path. Reused instead of creating new.`);
      return { meta: dedupMeta, migration, created: false };
    }
  }
  
  // ---------------------------------------------------------------------------
  // Overlap detection — only for genuinely new workspaces
  // ---------------------------------------------------------------------------
  if (!force) {
    const fsOverlaps = await detectOverlaps(resolvedPath);
    const registry = await readRegistry();
    const registryOverlaps = registry?.entries
      ? checkRegistryForOverlaps(resolvedPath, registry.entries)
      : [];

    // Deduplicate by workspace ID
    const seen = new Set(fsOverlaps.map(o => o.existing_workspace_id));
    const combined = [...fsOverlaps];
    for (const ro of registryOverlaps) {
      if (!seen.has(ro.existing_workspace_id)) {
        combined.push(ro);
        seen.add(ro.existing_workspace_id);
      }
    }

    if (combined.length > 0) {
      return {
        meta: null as unknown as WorkspaceMeta,
        migration,
        created: false,
        overlap: combined,
      };
    }
  }

  // Create new workspace
  await ensureDir(workspaceDir);
  await ensureDir(getPlansPath(workspaceId));
  
  const now = nowISO();
  const meta: WorkspaceMeta = {
    schema_version: WORKSPACE_SCHEMA_VERSION,
    workspace_id: workspaceId,
    workspace_path: resolvedPath,
    path: resolvedPath,
    name: getWorkspaceDisplayName(resolvedPath),
    created_at: now,
    updated_at: now,
    registered_at: now,
    last_accessed: now,
    last_seen_at: now,
    data_root: getDataRoot(),
    active_plans: [],
    archived_plans: [],
    active_programs: [],
    indexed: !!profile,
    profile
  };
  
  await saveWorkspace(meta);
  // Fix C: update workspace registry
  await upsertRegistryEntry(resolvedPath, workspaceId);
  return { meta, migration, created: true };
}

export async function writeWorkspaceIdentityFile(
  workspacePath: string,
  meta: WorkspaceMeta
): Promise<IdentityFile> {
  const resolvedPath = safeResolvePath(workspacePath);

  // Guard: ensure workspace directory is genuinely reachable.
  // In container mode, try to resolve via workspace mounts first.
  const { resolveAccessiblePath } = await import('./workspace-mounts.js');
  const accessiblePath = await resolveAccessiblePath(resolvedPath);
  if (!accessiblePath) {
    throw new Error(
      `Workspace path not accessible from this process (container mode?): ${resolvedPath}`
    );
  }

  const identityPath = getIdentityPath(accessiblePath);

  const identity = await modifyJsonLocked<IdentityFile>(identityPath, (existing) => {
    const now = nowISO();
    return {
      schema_version: '1.0.0',
      workspace_id: meta.workspace_id,
      workspace_path: resolvedPath,
      data_root: meta.data_root || getDataRoot(),
      created_at: existing?.created_at || now,
      updated_at: now,
      project_mcps: existing?.project_mcps
    };
  });

  return identity;
}

// =============================================================================
// Plan Operations
// =============================================================================

/**
 * Find a plan by ID across all workspaces
 * Returns the workspace_id and plan state if found
 */
export async function findPlanById(planId: string): Promise<{ workspace_id: string; plan: PlanState } | null> {
  const workspaceIds = await listDirs(getDataRoot());
  
  for (const workspaceId of workspaceIds) {
    const planPath = getPlanStatePath(workspaceId, planId);
    const plan = await readJson<PlanState>(planPath);
    if (plan) {
      return { workspace_id: workspaceId, plan };
    }
  }
  
  return null;
}

/**
 * Get a plan state by ID
 */
export async function getPlanState(workspaceId: string, planId: string): Promise<PlanState | null> {
  const filePath = getPlanStatePath(workspaceId, planId);
  // Use lock to ensure we don't read during a concurrent write
  return fileLockManager.withLock(filePath, async () => {
    return readJson<PlanState>(filePath);
  });
}

/**
 * Save plan state with locking to prevent race conditions.
 * Validates that the workspace is registered before writing.
 */
export async function savePlanState(state: PlanState): Promise<void> {
  await assertWorkspaceRegistered(state.workspace_id);
  const filePath = getPlanStatePath(state.workspace_id, state.id);
  await fileLockManager.withLock(filePath, async () => {
    state.updated_at = nowISO();
    await writeJson(filePath, state);
  });
  await appendWorkspaceFileUpdate({
    workspace_id: state.workspace_id,
    plan_id: state.id,
    file_path: filePath,
    summary: 'Updated plan state',
    action: 'save_plan_state'
  });
}

/**
 * Get all plans for a workspace
 */
export async function getWorkspacePlans(workspaceId: string): Promise<PlanState[]> {
  const plansDir = getPlansPath(workspaceId);
  const planIds = await listDirs(plansDir);
  const plans: PlanState[] = [];
  
  for (const id of planIds) {
    const state = await getPlanState(workspaceId, id);
    if (state) {
      plans.push(state);
    }
  }
  
  return plans;
}

/**
 * Create a new plan.
 * Validates that the workspace is registered before creating directories.
 */
export async function createPlan(
  workspaceId: string,
  title: string,
  description: string,
  category: RequestCategory,
  priority: 'low' | 'medium' | 'high' | 'critical' = 'medium',
  categorization?: RequestCategorization,
  goals?: string[],
  success_criteria?: string[]
): Promise<PlanState> {
  await assertWorkspaceRegistered(workspaceId);
  const planId = generatePlanId();
  const planDir = getPlanPath(workspaceId, planId);
  
  // Create plan directory structure
  await ensureDir(planDir);
  await ensureDir(getResearchNotesPath(workspaceId, planId));
  
  const now = nowISO();
  const state: PlanState = {
    id: planId,
    workspace_id: workspaceId,
    title,
    description,
    priority,
    category,
    categorization,
    goals,
    success_criteria,
    status: 'active',
    current_phase: 'initialization',
    current_agent: null,
    confirmation_state: { phases: {}, steps: {} },
    created_at: now,
    updated_at: now,
    agent_sessions: [],
    lineage: [],
    steps: []
  };
  
  await savePlanState(state);
  
  // Update workspace metadata
  const workspace = await getWorkspace(workspaceId);
  if (workspace) {
    workspace.active_plans.push(planId);
    workspace.last_accessed = now;
    await saveWorkspace(workspace);
  }
  
  // Generate initial plan.md
  await generatePlanMd(state);
  
  return state;
}

/**
 * Generate a human-readable plan.md from plan state
 */
export async function generatePlanMd(state: PlanState): Promise<void> {
  const lines: string[] = [
    `# ${state.title}`,
    '',
    `**Plan ID:** ${state.id}`,
    `**Status:** ${state.status}`,
    `**Priority:** ${state.priority}`,
    `**Current Phase:** ${state.current_phase}`,
    `**Current Agent:** ${state.current_agent || 'None'}`,
    '',
    '## Description',
    '',
    state.description,
    '',
    '## Progress',
    ''
  ];
  
  if (state.steps.length === 0) {
    lines.push('_No steps defined yet._');
  } else {
    for (const step of state.steps) {
      const checkbox = step.status === 'done' ? '[x]' : '[ ]';
      const statusBadge = step.status === 'active' ? ' ⏳' : step.status === 'blocked' ? ' 🚫' : '';
      
      // Get step type and visual indicators
      const stepType = step.type ?? 'standard';
      const typeBehavior = STEP_TYPE_BEHAVIORS[stepType];
      
      // Add visual indicators based on step type
      let typeIndicator = '';
      if (stepType !== 'standard') {
        typeIndicator = ` [${stepType}]`;
      }
      
      let visualMarker = '';
      if (typeBehavior.blocking) {
        visualMarker = stepType === 'user_validation' ? ' 👤' : stepType === 'critical' ? ' ⚠️' : ' 🔒';
      }
      
      lines.push(`- ${checkbox} **${step.phase}:**${typeIndicator} ${step.task}${statusBadge}${visualMarker}`);
      if (step.notes) {
        lines.push(`  - _${step.notes}_`);
      }
    }
  }
  
  lines.push('', '## Agent Lineage', '');
  
  if (state.lineage.length === 0) {
    lines.push('_No agent activity yet._');
  } else {
    for (const entry of state.lineage) {
      lines.push(`- **${entry.timestamp}**: ${entry.from_agent} → ${entry.to_agent} — _${entry.reason}_`);
    }
  }
  
  const filePath = getPlanMdPath(state.workspace_id, state.id);
  await writeText(filePath, lines.join('\n'));
  await appendWorkspaceFileUpdate({
    workspace_id: state.workspace_id,
    plan_id: state.id,
    file_path: filePath,
    summary: 'Updated plan markdown',
    action: 'generate_plan_md'
  });
}

// =============================================================================
// Build Scripts Operations
// =============================================================================

/**
 * Get all build scripts for a workspace/plan
 * Combines workspace-level and plan-level scripts
 */
export async function getBuildScripts(workspaceId: string, planId?: string): Promise<BuildScript[]> {
  const scripts: BuildScript[] = [];
  
  // Get workspace-level scripts
  const workspace = await getWorkspace(workspaceId);
  if (workspace?.workspace_build_scripts) {
    scripts.push(...workspace.workspace_build_scripts);
  }
  
  // Get plan-level scripts if planId provided
  if (planId) {
    const plan = await getPlanState(workspaceId, planId);
    if (plan?.build_scripts) {
      scripts.push(...plan.build_scripts);
    }
  }
  
  return scripts;
}

/**
 * Add a build script to workspace or plan
 */
export async function addBuildScript(
  workspaceId: string,
  scriptData: Omit<BuildScript, 'id' | 'created_at' | 'workspace_id'>,
  planId?: string
): Promise<BuildScript> {
  const script: BuildScript = {
    ...scriptData,
    id: `script_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
    workspace_id: workspaceId,
    plan_id: planId,
    created_at: nowISO()
  };
  
  if (planId) {
    // Add to plan
    await modifyJsonLocked<PlanState>(
      getPlanStatePath(workspaceId, planId),
      (state) => {
        if (!state) throw new Error(`Plan ${planId} not found`);
        if (!state.build_scripts) state.build_scripts = [];
        state.build_scripts.push(script);
        state.updated_at = nowISO();
        return state;
      }
    );
    await appendWorkspaceFileUpdate({
      workspace_id: workspaceId,
      plan_id: planId,
      file_path: getPlanStatePath(workspaceId, planId),
      summary: `Added build script ${script.name}`,
      action: 'add_build_script'
    });
  } else {
    // Add to workspace
    await modifyJsonLocked<WorkspaceMeta>(
      getWorkspaceMetaPath(workspaceId),
      (meta) => {
        if (!meta) throw new Error(`Workspace ${workspaceId} not found`);
        if (!meta.workspace_build_scripts) meta.workspace_build_scripts = [];
        meta.workspace_build_scripts.push(script);
        meta.last_accessed = nowISO();
        return meta;
      }
    );
    await appendWorkspaceFileUpdate({
      workspace_id: workspaceId,
      file_path: getWorkspaceMetaPath(workspaceId),
      summary: `Added workspace build script ${script.name}`,
      action: 'add_workspace_build_script'
    });
  }
  
  return script;
}

/**
 * Delete a build script
 */
export async function deleteBuildScript(
  workspaceId: string,
  scriptId: string,
  planId?: string
): Promise<boolean> {
  if (planId) {
    // Delete from plan
    await modifyJsonLocked<PlanState>(
      getPlanStatePath(workspaceId, planId),
      (state) => {
        if (!state) throw new Error(`Plan ${planId} not found`);
        if (!state.build_scripts) return state;
        state.build_scripts = state.build_scripts.filter(s => s.id !== scriptId);
        state.updated_at = nowISO();
        return state;
      }
    );
    await appendWorkspaceFileUpdate({
      workspace_id: workspaceId,
      plan_id: planId,
      file_path: getPlanStatePath(workspaceId, planId),
      summary: `Deleted build script ${scriptId}`,
      action: 'delete_build_script'
    });
  } else {
    // Delete from workspace
    await modifyJsonLocked<WorkspaceMeta>(
      getWorkspaceMetaPath(workspaceId),
      (meta) => {
        if (!meta) throw new Error(`Workspace ${workspaceId} not found`);
        if (!meta.workspace_build_scripts) return meta;
        meta.workspace_build_scripts = meta.workspace_build_scripts.filter(s => s.id !== scriptId);
        meta.last_accessed = nowISO();
        return meta;
      }
    );
    await appendWorkspaceFileUpdate({
      workspace_id: workspaceId,
      file_path: getWorkspaceMetaPath(workspaceId),
      summary: `Deleted workspace build script ${scriptId}`,
      action: 'delete_workspace_build_script'
    });
  }
  
  return true;
}

// Re-export findBuildScript from its own module for backwards compatibility
export { findBuildScript } from './build-script-utils.js';

export function parseCommandTokens(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (char === '"' || char === "'") {
      if (inQuotes && char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
        continue;
      }
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
        continue;
      }
    }

    if (!inQuotes && /\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}
