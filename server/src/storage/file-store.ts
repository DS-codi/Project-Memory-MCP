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
import { exec } from 'child_process';
import { promisify } from 'util';
import type { PlanState, WorkspaceMeta, WorkspaceProfile, RequestCategory, RequestCategorization, BuildScript } from '../types/index.js';
import { STEP_TYPE_BEHAVIORS } from '../types/index.js';

const execAsync = promisify(exec);

// =============================================================================
// Configuration
// =============================================================================

const DATA_ROOT = process.env.MBS_DATA_ROOT || path.join(process.cwd(), '..', 'data');

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
  const normalizedPath = path.normalize(workspacePath).toLowerCase();
  const hash = crypto.createHash('sha256').update(normalizedPath).digest('hex');
  const shortHash = hash.substring(0, 12);
  const folderName = path.basename(workspacePath).replace(/[^a-zA-Z0-9-_]/g, '-');
  return `${folderName}-${shortHash}`;
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
  return DATA_ROOT;
}

export function getWorkspacePath(workspaceId: string): string {
  return path.join(DATA_ROOT, workspaceId);
}

export function getWorkspaceMetaPath(workspaceId: string): string {
  return path.join(getWorkspacePath(workspaceId), 'workspace.meta.json');
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
// Workspace Operations
// =============================================================================

/**
 * Initialize the data root directory
 */
export async function initDataRoot(): Promise<void> {
  await ensureDir(DATA_ROOT);
}

/**
 * Get all registered workspaces
 */
export async function getAllWorkspaces(): Promise<WorkspaceMeta[]> {
  const workspaceIds = await listDirs(DATA_ROOT);
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
  await writeJson(getWorkspaceMetaPath(meta.workspace_id), meta);
}

/**
 * Create a new workspace
 */
export async function createWorkspace(
  workspacePath: string, 
  profile?: WorkspaceProfile
): Promise<WorkspaceMeta> {
  const workspaceId = generateWorkspaceId(workspacePath);
  const workspaceDir = getWorkspacePath(workspaceId);
  
  // Check if already exists
  const existing = await getWorkspace(workspaceId);
  if (existing) {
    // Update last accessed and optionally update profile
    existing.last_accessed = nowISO();
    if (profile) {
      existing.profile = profile;
      existing.indexed = true;
    }
    await saveWorkspace(existing);
    return existing;
  }
  
  // Create new workspace
  await ensureDir(workspaceDir);
  await ensureDir(getPlansPath(workspaceId));
  
  const meta: WorkspaceMeta = {
    workspace_id: workspaceId,
    path: workspacePath,
    name: path.basename(workspacePath),
    registered_at: nowISO(),
    last_accessed: nowISO(),
    active_plans: [],
    archived_plans: [],
    indexed: !!profile,
    profile
  };
  
  await saveWorkspace(meta);
  return meta;
}

// =============================================================================
// Plan Operations
// =============================================================================

/**
 * Find a plan by ID across all workspaces
 * Returns the workspace_id and plan state if found
 */
export async function findPlanById(planId: string): Promise<{ workspace_id: string; plan: PlanState } | null> {
  const workspaceIds = await listDirs(DATA_ROOT);
  
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
  
  await writeText(getPlanMdPath(state.workspace_id, state.id), lines.join('\n'));
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
  }
  
  return true;
}

/**
 * Run a build script
 */
export async function runBuildScript(
  workspaceId: string,
  scriptId: string
): Promise<{ success: boolean; output: string; error?: string }> {
  // Find the script
  const scripts = await getBuildScripts(workspaceId);
  const script = scripts.find(s => s.id === scriptId);
  
  if (!script) {
    return {
      success: false,
      output: '',
      error: `Script ${scriptId} not found`
    };
  }
  
  try {
    const { stdout, stderr } = await execAsync(script.command, {
      cwd: script.directory,
      timeout: 300000 // 5 minute timeout
    });
    
    return {
      success: true,
      output: stdout + (stderr ? `\n\nSTDERR:\n${stderr}` : '')
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message: string };
    return {
      success: false,
      output: err.stdout || '',
      error: err.stderr || err.message
    };
  }
}

