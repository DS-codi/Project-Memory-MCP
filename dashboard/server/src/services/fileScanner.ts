import * as fs from 'fs/promises';
import * as path from 'path';
import { dataCache } from './cache.js';

interface WorkspaceMeta {
  workspace_id: string;
  path: string;
  name: string;
  registered_at: string;
  last_accessed: string;
  active_plans: string[];
  archived_plans: string[];
  indexed: boolean;
  parent_workspace_id?: string;
  child_workspace_ids?: string[];
  profile?: {
    indexed_at: string;
    languages: { name: string; percentage: number; file_count: number }[];
    total_files: number;
    total_lines: number;
  };
}

interface PlanState {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  category: string;
  current_phase: string;
  current_agent: string | null;
  created_at: string;
  updated_at: string;
  agent_sessions: unknown[];
  lineage: unknown[];
  steps: { status: string }[];
  is_program?: boolean;
  program_id?: string;
  child_plan_ids?: string[];
  depends_on_plans?: string[];
  linked_plan_ids?: string[];
  relationships?: {
    parent_program_id?: string;
    child_plan_ids?: string[];
    linked_plan_ids?: string[];
  };
}

interface WorkspaceSummary {
  workspace_id: string;
  name: string;
  path: string;
  health: 'active' | 'stale' | 'blocked' | 'idle';
  active_plan_count: number;
  archived_plan_count: number;
  last_activity: string;
  languages: { name: string; percentage: number }[];
  parent_workspace_id?: string;
  child_workspace_ids?: string[];
  child_workspaces?: WorkspaceSummary[];
}

interface PlanSummary {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  current_agent: string | null;
  progress: { done: number; total: number };
  created_at: string;
  updated_at: string;
  is_program?: boolean;
  program_id?: string;
  child_plan_ids?: string[];
  depends_on_plans?: string[];
  linked_plan_ids?: string[];
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const filtered = value.filter((entry): entry is string => typeof entry === 'string');
  return filtered.length > 0 ? filtered : undefined;
}

// Calculate workspace health based on plan activity
function calculateHealth(meta: WorkspaceMeta, plans: PlanState[]): 'active' | 'stale' | 'blocked' | 'idle' {
  if (meta.active_plans.length === 0) return 'idle';
  
  // Check for blocked steps
  for (const plan of plans) {
    if (plan?.steps?.some(s => s.status === 'blocked')) {
      return 'blocked';
    }
  }
  
  // Check for recent activity (within 24 hours)
  const lastAccessed = new Date(meta.last_accessed);
  const hoursSinceAccess = (Date.now() - lastAccessed.getTime()) / (1000 * 60 * 60);
  
  if (hoursSinceAccess > 24) return 'stale';
  return 'active';
}

// Scan all workspaces in data root (cached for 30s)
export async function scanWorkspaces(dataRoot: string): Promise<WorkspaceSummary[]> {
  const cacheKey = 'workspaces';
  const cached = dataCache.get<WorkspaceSummary[]>(cacheKey);
  if (cached) return cached;

  try {
    const entries = await fs.readdir(dataRoot, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory() && e.name !== 'logs');

    const results = await Promise.all(dirs.map(async (entry) => {
      const metaPath = path.join(dataRoot, entry.name, 'workspace.meta.json');
      try {
        const metaContent = await fs.readFile(metaPath, 'utf-8');
        const meta: WorkspaceMeta = JSON.parse(metaContent);

        // Guard against null/invalid meta files
        if (!meta || typeof meta !== 'object' || !meta.workspace_id) return null;

        // Load active plans to determine health (parallelized within workspace)
        const plans = await loadPlanStates(dataRoot, meta.workspace_id, meta.active_plans || []);

        return {
          workspace_id: meta.workspace_id,
          name: meta.name,
          path: meta.path,
          health: calculateHealth(meta, plans),
          active_plan_count: meta.active_plans.length,
          archived_plan_count: meta.archived_plans.length,
          last_activity: meta.last_accessed,
          languages: meta.profile?.languages?.slice(0, 5).map(l => ({
            name: l.name,
            percentage: l.percentage,
          })) || [],
          ...(meta.parent_workspace_id ? { parent_workspace_id: meta.parent_workspace_id } : {}),
          ...(meta.child_workspace_ids?.length ? { child_workspace_ids: meta.child_workspace_ids } : {}),
        } as WorkspaceSummary;
      } catch {
        // Skip directories without valid workspace.meta.json
        return null;
      }
    }));

    const workspaces = results.filter((w): w is WorkspaceSummary => w !== null);
    dataCache.set(cacheKey, workspaces);
    return workspaces;
  } catch (error) {
    console.error('Error scanning workspaces:', error);
    return [];
  }
}

/**
 * Build a hierarchical workspace tree from a flat list.
 * Groups child workspaces under their parents and returns only
 * top-level workspaces (parents + unlinked standalones).
 */
export function buildWorkspaceHierarchy(workspaces: WorkspaceSummary[]): WorkspaceSummary[] {
  // Index workspaces by ID
  const wsMap = new Map<string, WorkspaceSummary>();
  for (const ws of workspaces) {
    wsMap.set(ws.workspace_id, { ...ws });
  }

  // Collect child IDs from parent references
  const childIds = new Set<string>();
  for (const ws of wsMap.values()) {
    if (ws.parent_workspace_id && wsMap.has(ws.parent_workspace_id)) {
      childIds.add(ws.workspace_id);
      // Attach to parent's transient child_workspaces array
      const parent = wsMap.get(ws.parent_workspace_id)!;
      if (!parent.child_workspaces) parent.child_workspaces = [];
      parent.child_workspaces.push(ws);
    }
  }

  // Return only top-level workspaces (no parent_workspace_id or parent not in set)
  return Array.from(wsMap.values()).filter(ws => !childIds.has(ws.workspace_id));
}

// Load plan states for given plan IDs
async function loadPlanStates(dataRoot: string, workspaceId: string, planIds: string[]): Promise<PlanState[]> {
  const results = await Promise.all(planIds.map(async (planId) => {
    const statePath = path.join(dataRoot, workspaceId, 'plans', planId, 'state.json');
    try {
      const content = await fs.readFile(statePath, 'utf-8');
      const parsed = JSON.parse(content);
      // Guard against null/invalid state files
      if (parsed && typeof parsed === 'object' && parsed.id) {
        return parsed as PlanState;
      }
    } catch {
      // Skip missing plans
    }
    return null;
  }));
  return results.filter((p): p is PlanState => p !== null);
}

// Get detailed workspace info
export async function getWorkspaceDetails(dataRoot: string, workspaceId: string): Promise<WorkspaceMeta | null> {
  const metaPath = path.join(dataRoot, workspaceId, 'workspace.meta.json');
  
  try {
    const content = await fs.readFile(metaPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// Get all plans for a workspace (cached for 30s)
export async function getWorkspacePlans(dataRoot: string, workspaceId: string): Promise<PlanSummary[]> {
  const cacheKey = `plans:${workspaceId}`;
  const cached = dataCache.get<PlanSummary[]>(cacheKey);
  if (cached) return cached;

  const plans: PlanSummary[] = [];
  const plansDir = path.join(dataRoot, workspaceId, 'plans');
  
  try {
    const entries = await fs.readdir(plansDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const statePath = path.join(plansDir, entry.name, 'state.json');
      
      try {
        const content = await fs.readFile(statePath, 'utf-8');
        const state: PlanState = JSON.parse(content);
        
        // Guard against null/invalid state files
        if (!state || typeof state !== 'object' || !state.id) continue;
        
        const doneSteps = state.steps?.filter(s => s.status === 'done').length || 0;
        const totalSteps = state.steps?.length || 0;
        
        plans.push({
          id: state.id,
          title: state.title,
          category: state.category,
          priority: state.priority,
          status: state.status,
          current_agent: state.current_agent,
          progress: { done: doneSteps, total: totalSteps },
          created_at: state.created_at,
          updated_at: state.updated_at,
          is_program: state.is_program || false,
          program_id: state.program_id || undefined,
          child_plan_ids:
            toStringArray(state.child_plan_ids)
            ?? toStringArray(state.relationships?.child_plan_ids),
          depends_on_plans:
            toStringArray(state.depends_on_plans)
            ?? toStringArray(state.linked_plan_ids)
            ?? toStringArray(state.relationships?.linked_plan_ids),
          linked_plan_ids:
            toStringArray(state.linked_plan_ids)
            ?? toStringArray(state.depends_on_plans)
            ?? toStringArray(state.relationships?.linked_plan_ids),
        });
      } catch {
        // Skip invalid plan directories
      }
    }
  } catch (error) {
    console.error('Error getting workspace plans:', error);
  }
  
  // Sort by updated_at descending
  const sorted = plans.sort((a, b) => 
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
  dataCache.set(cacheKey, sorted);
  return sorted;
}

// Get full plan state (cached for 30s)
export async function getPlanState(dataRoot: string, workspaceId: string, planId: string): Promise<PlanState | null> {
  const cacheKey = `planState:${workspaceId}:${planId}`;
  const cached = dataCache.get<PlanState | null>(cacheKey);
  if (cached !== undefined) return cached;

  const statePath = path.join(dataRoot, workspaceId, 'plans', planId, 'state.json');
  
  try {
    const content = await fs.readFile(statePath, 'utf-8');
    const plan = JSON.parse(content) as PlanState;
    dataCache.set(cacheKey, plan);
    return plan;
  } catch {
    dataCache.set(cacheKey, null, 10_000); // Cache misses for 10s
    return null;
  }
}

// Get plan lineage (handoff history)
export async function getPlanLineage(dataRoot: string, workspaceId: string, planId: string): Promise<unknown[]> {
  const state = await getPlanState(dataRoot, workspaceId, planId);
  return state?.lineage || [];
}

// Get plan audit log
export async function getPlanAudit(dataRoot: string, workspaceId: string, planId: string): Promise<unknown> {
  const auditPath = path.join(dataRoot, workspaceId, 'plans', planId, 'audit.json');
  
  try {
    const content = await fs.readFile(auditPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// Get research notes for a plan
export async function getResearchNotes(dataRoot: string, workspaceId: string, planId: string): Promise<{ filename: string; content: string; modified_at: string }[]> {
  const researchDir = path.join(dataRoot, workspaceId, 'plans', planId, 'research_notes');
  const notes: { filename: string; content: string; modified_at: string }[] = [];
  
  try {
    const entries = await fs.readdir(researchDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      
      // Only process markdown and text files
      if (!entry.name.endsWith('.md') && !entry.name.endsWith('.txt') && !entry.name.endsWith('.json')) continue;
      
      const filePath = path.join(researchDir, entry.name);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const stats = await fs.stat(filePath);
        
        notes.push({
          filename: entry.name,
          content,
          modified_at: stats.mtime.toISOString(),
        });
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  
  // Sort by modified date descending
  return notes.sort((a, b) => 
    new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime()
  );
}
