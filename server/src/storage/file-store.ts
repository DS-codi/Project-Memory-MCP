/**
 * File Store - Disk I/O operations for Project Memory MCP Server
 * 
 * Handles all file system operations including:
 * - Workspace directory management
 * - Plan state persistence
 * - Context and research note storage
 * - File locking for concurrent access
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import type { PlanState, WorkspaceMeta, WorkspaceProfile, RequestCategory, RequestCategorization, BuildScript, WorkspaceContext } from '../types/index.js';
import { STEP_TYPE_BEHAVIORS } from '../types/index.js';
import { appendWorkspaceFileUpdate } from '../logging/workspace-update-log.js';
import {
  getDataRoot as resolveDataRoot,
  getWorkspaceDisplayName,
  getWorkspaceIdFromPath,
  normalizeWorkspacePath
} from './workspace-utils.js';

const execAsync = promisify(exec);

const BUILD_SCRIPT_TIMEOUT_MS = 300000;

export interface WorkspaceMigrationReport {
  action: 'none' | 'aliased' | 'migrated';
  canonical_workspace_id: string;
  legacy_workspace_ids: string[];
  notes: string[];
}

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

// =============================================================================
// Configuration
// =============================================================================

const WORKSPACE_SCHEMA_VERSION = '1.0.0';

// =============================================================================
// File Locking for Concurrent Access
// =============================================================================

/**
 * Simple in-memory lock manager to prevent concurrent file access race conditions.
 * Uses a Map of promises to serialize access to the same file path.
 */
class FileLockManager {
  private locks: Map<string, Promise<void>> = new Map();

  /**
   * Execute an operation with exclusive access to a file path.
   * Multiple calls to the same path will be serialized.
   */
  async withLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    const normalizedPath = path.normalize(filePath).toLowerCase();
    
    // Wait for any existing lock on this path
    const existingLock = this.locks.get(normalizedPath);
    if (existingLock) {
      await existingLock.catch(() => {}); // Ignore errors from previous operations
    }

    // Create a new lock for this operation
    let resolveLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.locks.set(normalizedPath, lockPromise);

    try {
      return await operation();
    } finally {
      resolveLock!();
      // Clean up lock if it's still ours
      if (this.locks.get(normalizedPath) === lockPromise) {
        this.locks.delete(normalizedPath);
      }
    }
  }
}

const fileLockManager = new FileLockManager();

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a workspace ID from a path using a hash
 */
export function generateWorkspaceId(workspacePath: string): string {
  return getWorkspaceIdFromPath(workspacePath);
}

export async function resolveWorkspaceIdForPath(workspacePath: string): Promise<string> {
  const resolvedPath = path.resolve(workspacePath);
  const identity = await readWorkspaceIdentityFile(resolvedPath);
  if (identity?.workspace_id) {
    return identity.workspace_id;
  }
  return getWorkspaceIdFromPath(resolvedPath);
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

export function getWorkspaceIdentityPath(workspacePath: string): string {
  return path.join(workspacePath, '.projectmemory', 'identity.json');
}

async function readWorkspaceIdentityFile(workspacePath: string): Promise<WorkspaceIdentityFile | null> {
  const identityPath = getWorkspaceIdentityPath(workspacePath);
  const identity = await readJson<WorkspaceIdentityFile>(identityPath);
  if (!identity?.workspace_id || !identity.workspace_path) {
    return null;
  }

  const normalizedInput = normalizeWorkspacePath(workspacePath);
  const normalizedIdentity = normalizeWorkspacePath(identity.workspace_path);
  if (normalizedInput !== normalizedIdentity) {
    return null;
  }

  return identity;
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
// JSON File Operations (with file locking to prevent race conditions)
// =============================================================================

/**
 * Read a JSON file (not locked - use readJsonLocked for concurrent access)
 */
export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Write a JSON file with pretty formatting (not locked - use writeJsonLocked for concurrent access)
 */
export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Read-modify-write a JSON file with locking to prevent race conditions.
 * Use this for operations that read, modify, and save state.
 */
export async function modifyJsonLocked<T>(
  filePath: string,
  modifier: (data: T | null) => Promise<T> | T
): Promise<T> {
  return fileLockManager.withLock(filePath, async () => {
    const data = await readJson<T>(filePath);
    const modified = await modifier(data);
    await writeJson(filePath, modified);
    return modified;
  });
}

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
  const context = await readJson<WorkspaceContext>(contextPath);
  if (!context) {
    return false;
  }

  let changed = false;
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
    await writeJson(contextPath, context);
  }

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
    const plan = await readJson<PlanState>(planPath);
    if (!plan) {
      continue;
    }

    if (plan.workspace_id !== newWorkspaceId) {
      plan.workspace_id = newWorkspaceId;
      plan.updated_at = nowISO();
      await writeJson(planPath, plan);
      updated += 1;
    }
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

  const resolvedPath = path.resolve(workspacePath);
  const meta: WorkspaceMeta = {
    ...primaryLegacy,
    workspace_id: canonicalId,
    workspace_path: resolvedPath,
    path: resolvedPath,
    legacy_workspace_ids: mergeLegacyWorkspaceIds(primaryLegacy.legacy_workspace_ids, legacyIds),
    updated_at: nowISO()
  };

  await writeJson(getWorkspaceMetaPath(canonicalId), meta);
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
  const workspaceIds = await listDirs(getDataRoot());
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
  await writeJson(filePath, meta);
  await appendWorkspaceFileUpdate({
    workspace_id: meta.workspace_id,
    file_path: filePath,
    summary: 'Updated workspace metadata',
    action: 'save_workspace'
  });
}

/**
 * Create a new workspace
 */
export async function createWorkspace(
  workspacePath: string, 
  profile?: WorkspaceProfile
): Promise<{ meta: WorkspaceMeta; migration: WorkspaceMigrationReport; created: boolean }> {
  const resolvedPath = path.resolve(workspacePath);
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
    existing.workspace_path = existing.workspace_path || existing.path || resolvedPath;
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
    return { meta: existing, migration, created: false };
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
    indexed: !!profile,
    profile
  };
  
  await saveWorkspace(meta);
  return { meta, migration, created: true };
}

export async function writeWorkspaceIdentityFile(
  workspacePath: string,
  meta: WorkspaceMeta
): Promise<WorkspaceIdentityFile> {
  const resolvedPath = path.resolve(workspacePath);
  const identityPath = getWorkspaceIdentityPath(resolvedPath);
  const existing = await readJson<WorkspaceIdentityFile>(identityPath);
  const now = nowISO();

  const identity: WorkspaceIdentityFile = {
    schema_version: '1.0.0',
    workspace_id: meta.workspace_id,
    workspace_path: resolvedPath,
    data_root: meta.data_root || getDataRoot(),
    created_at: existing?.created_at || now,
    updated_at: now,
    project_mcps: existing?.project_mcps
  };

  await writeJson(identityPath, identity);
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
 * Save plan state with locking to prevent race conditions
 */
export async function savePlanState(state: PlanState): Promise<void> {
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
 * Create a new plan
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

/**
 * Find a build script by ID, optionally scoped to a plan.
 * Falls back to searching all plans when planId is omitted.
 */
export async function findBuildScript(
  workspaceId: string,
  scriptId: string,
  planId?: string
): Promise<BuildScript | null> {
  const scripts = await getBuildScripts(workspaceId, planId);
  const directMatch = scripts.find(script => script.id === scriptId);

  if (directMatch || planId) {
    return directMatch ?? null;
  }

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) {
    return null;
  }

  const planIds = new Set<string>();
  for (const id of workspace.active_plans ?? []) {
    planIds.add(id);
  }
  for (const id of workspace.archived_plans ?? []) {
    planIds.add(id);
  }

  for (const id of planIds) {
    const plan = await getPlanState(workspaceId, id);
    const match = plan?.build_scripts?.find(script => script.id === scriptId);
    if (match) {
      return match;
    }
  }

  return null;
}

/**
 * Run a build script
 */
export async function runBuildScript(
  workspaceId: string,
  scriptId: string,
  planId?: string
): Promise<{ success: boolean; output: string; error?: string }> {
  // Find the script
  const script = await findBuildScript(workspaceId, scriptId, planId);
  
  if (!script) {
    return {
      success: false,
      output: '',
      error: `Script ${scriptId} not found`
    };
  }
  
  const execOptions = {
    cwd: script.directory,
    timeout: BUILD_SCRIPT_TIMEOUT_MS
  };
  const { primary } = resolveBuildScriptShellCandidates(process.platform, process.env);
  const directCommand = await resolveDirectCommand(script.command, script.directory);
  const requiresShell = commandRequiresShell(script.command);

  const runWithShell = async (shell?: string) => {
    const options = shell ? { ...execOptions, shell } : execOptions;
    return execAsync(script.command, options);
  };

  const runDirect = async () => {
    if (!directCommand) {
      throw new Error('No direct command resolved for build script');
    }
    return runCommandDirect(
      directCommand.command,
      directCommand.args,
      execOptions.cwd,
      execOptions.timeout
    );
  };

  if (!requiresShell && directCommand) {
    try {
      const { stdout, stderr } = await runDirect();
      return {
        success: true,
        output: stdout + (stderr ? `\n\nSTDERR:\n${stderr}` : '')
      };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message: string };
      if (primary) {
        try {
          const { stdout, stderr } = await runWithShell(primary);
          return {
            success: true,
            output: stdout + (stderr ? `\n\nSTDERR:\n${stderr}` : '')
          };
        } catch (shellError) {
          const shellErr = shellError as { stdout?: string; stderr?: string; message: string };
          return {
            success: false,
            output: shellErr.stdout || err.stdout || '',
            error: shellErr.stderr || shellErr.message
          };
        }
      }

      return {
        success: false,
        output: err.stdout || '',
        error: err.stderr || err.message
      };
    }
  }

  try {
    const { stdout, stderr } = await runWithShell(primary);
    return {
      success: true,
      output: stdout + (stderr ? `\n\nSTDERR:\n${stderr}` : '')
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message: string };
    if (!requiresShell && directCommand) {
      try {
        const { stdout, stderr } = await runDirect();
        return {
          success: true,
          output: stdout + (stderr ? `\n\nSTDERR:\n${stderr}` : '')
        };
      } catch (directError) {
        const directErr = directError as { stdout?: string; stderr?: string; message: string };
        return {
          success: false,
          output: directErr.stdout || err.stdout || '',
          error: directErr.stderr || directErr.message
        };
      }
    }

    return {
      success: false,
      output: err.stdout || '',
      error: err.stderr || err.message
    };
  }
}

function isCmdShell(shell: string): boolean {
  const normalized = shell.trim().toLowerCase();
  return normalized === 'cmd.exe' || normalized.endsWith('\\cmd.exe') || normalized.endsWith('/cmd.exe');
}

export function resolveBuildScriptShellCandidates(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv
): { primary?: string; fallback?: string } {
  if (platform !== 'win32') {
    return {};
  }

  const comspec = env.COMSPEC?.trim();
  const primary = comspec && comspec.length > 0 ? comspec : 'cmd.exe';
  return { primary };
}

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

export function commandRequiresShell(command: string): boolean {
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (char === '"' || char === "'") {
      if (inQuotes && char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      } else if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      }
      continue;
    }

    if (!inQuotes && (char === '|' || char === '&' || char === ';' || char === '>' || char === '<')) {
      return true;
    }
  }

  return false;
}

export async function resolveDirectCommand(
  command: string,
  cwd: string
): Promise<{ command: string; args: string[] } | null> {
  const tokens = parseCommandTokens(command);
  if (tokens.length === 0) {
    return null;
  }

  let executable = tokens[0];
  const args = tokens.slice(1);
  const hasSeparator = executable.includes('/') || executable.includes('\\');

  if (path.isAbsolute(executable)) {
    await ensureExecutable(executable);
    return { command: executable, args };
  }

  if (hasSeparator || executable.startsWith('.')) {
    const candidate = path.resolve(cwd, executable);
    if (await exists(candidate)) {
      await ensureExecutable(candidate);
      return { command: candidate, args };
    }
    return { command: candidate, args };
  }

  return { command: executable, args };
}

async function ensureExecutable(filePath: string): Promise<void> {
  if (process.platform === 'win32') {
    return;
  }

  try {
    const stats = await fs.stat(filePath);
    const mode = stats.mode;
    if ((mode & 0o111) === 0) {
      await fs.chmod(filePath, mode | 0o111);
    }
  } catch {
    // Ignore missing files or permission errors; execution will surface failures.
  }
}

async function runCommandDirect(
  command: string,
  args: string[],
  cwd: string,
  timeout?: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    const timer = timeout
      ? setTimeout(() => {
          child.kill('SIGTERM');
        }, timeout)
      : null;

    child.stdout?.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', error => {
      if (timer) {
        clearTimeout(timer);
      }
      const err = error as Error & { stdout?: string; stderr?: string };
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    });

    child.on('close', code => {
      if (timer) {
        clearTimeout(timer);
      }
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const err = new Error(`Command exited with code ${code ?? 'unknown'}`) as Error & {
        stdout?: string;
        stderr?: string;
        code?: number | null;
      };
      err.code = code ?? null;
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    });
  });
}

