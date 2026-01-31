import * as fs from 'fs/promises';
import * as path from 'path';

interface WorkspaceMeta {
  workspace_id: string;
  path: string;
  name: string;
  registered_at: string;
  last_accessed: string;
  active_plans: string[];
  archived_plans: string[];
  indexed: boolean;
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
}

// Calculate workspace health based on plan activity
function calculateHealth(meta: WorkspaceMeta, plans: PlanState[]): 'active' | 'stale' | 'blocked' | 'idle' {
  if (meta.active_plans.length === 0) return 'idle';
  
  // Check for blocked steps
  for (const plan of plans) {
    if (plan.steps?.some(s => s.status === 'blocked')) {
      return 'blocked';
    }
  }
  
  // Check for recent activity (within 24 hours)
  const lastAccessed = new Date(meta.last_accessed);
  const hoursSinceAccess = (Date.now() - lastAccessed.getTime()) / (1000 * 60 * 60);
  
  if (hoursSinceAccess > 24) return 'stale';
  return 'active';
}

// Scan all workspaces in data root
export async function scanWorkspaces(dataRoot: string): Promise<WorkspaceSummary[]> {
  const workspaces: WorkspaceSummary[] = [];
  
  try {
    const entries = await fs.readdir(dataRoot, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'logs') continue;
      
      const metaPath = path.join(dataRoot, entry.name, 'workspace.meta.json');
      
      try {
        const metaContent = await fs.readFile(metaPath, 'utf-8');
        const meta: WorkspaceMeta = JSON.parse(metaContent);
        
        // Load active plans to determine health
        const plans = await loadPlanStates(dataRoot, meta.workspace_id, meta.active_plans);
        
        workspaces.push({
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
        });
      } catch {
        // Skip directories without valid workspace.meta.json
      }
    }
  } catch (error) {
    console.error('Error scanning workspaces:', error);
  }
  
  return workspaces;
}

// Load plan states for given plan IDs
async function loadPlanStates(dataRoot: string, workspaceId: string, planIds: string[]): Promise<PlanState[]> {
  const plans: PlanState[] = [];
  
  for (const planId of planIds) {
    const statePath = path.join(dataRoot, workspaceId, 'plans', planId, 'state.json');
    try {
      const content = await fs.readFile(statePath, 'utf-8');
      plans.push(JSON.parse(content));
    } catch {
      // Skip missing plans
    }
  }
  
  return plans;
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

// Get all plans for a workspace
export async function getWorkspacePlans(dataRoot: string, workspaceId: string): Promise<PlanSummary[]> {
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
        });
      } catch {
        // Skip invalid plan directories
      }
    }
  } catch (error) {
    console.error('Error getting workspace plans:', error);
  }
  
  // Sort by updated_at descending
  return plans.sort((a, b) => 
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

// Get full plan state
export async function getPlanState(dataRoot: string, workspaceId: string, planId: string): Promise<PlanState | null> {
  const statePath = path.join(dataRoot, workspaceId, 'plans', planId, 'state.json');
  
  try {
    const content = await fs.readFile(statePath, 'utf-8');
    return JSON.parse(content);
  } catch {
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
