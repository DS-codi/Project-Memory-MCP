import { Router } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export const programsRouter = Router();

interface PlanState {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  category: string;
  is_program?: boolean;
  child_plan_ids?: string[];
  program_id?: string;
  steps: Array<{ status: string }>;
  goals?: string[];
  notes?: Array<{ type: string; note: string; added_at: string }>;
  created_at: string;
  updated_at: string;
}

interface ProgramPlanRef {
  plan_id: string;
  title: string;
  status: string;
  priority: string;
  current_phase: string;
  progress: { done: number; total: number };
  depends_on_plans: string[];
}

interface AggregateProgress {
  total_plans: number;
  active_plans: number;
  completed_plans: number;
  archived_plans: number;
  failed_plans: number;
  total_steps: number;
  done_steps: number;
  active_steps: number;
  pending_steps: number;
  blocked_steps: number;
  completion_percentage: number;
}

interface ProgramSummary {
  program_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  workspace_id: string;
  plans: ProgramPlanRef[];
  aggregate_progress: AggregateProgress;
}

interface ProgramDetail extends ProgramSummary {
  goals?: string[];
  success_criteria?: string[];
  notes?: Array<{ type: string; note: string; added_at: string }>;
}

/**
 * Read a plan's state.json from disk.
 */
async function readPlanState(dataRoot: string, workspaceId: string, planId: string): Promise<PlanState | null> {
  const statePath = path.join(dataRoot, workspaceId, 'plans', planId, 'state.json');
  try {
    const content = await fs.readFile(statePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Build a ProgramPlanRef from a child plan state.
 */
function toPlanRef(state: PlanState): ProgramPlanRef {
  const done = state.steps?.filter(s => s.status === 'done').length || 0;
  const total = state.steps?.length || 0;
  return {
    plan_id: state.id,
    title: state.title,
    status: state.status,
    priority: state.priority || 'medium',
    current_phase: (state as any).current_phase ?? '',
    progress: { done, total },
    depends_on_plans: (state as any).depends_on_plans ?? [],
  };
}

/**
 * Compute full aggregate progress across child plans.
 */
function computeAggregate(childPlans: PlanState[]): AggregateProgress {
  let totalSteps = 0;
  let doneSteps = 0;
  let activeSteps = 0;
  let pendingSteps = 0;
  let blockedSteps = 0;
  let activePlans = 0;
  let completedPlans = 0;
  let archivedPlans = 0;
  let failedPlans = 0;

  for (const plan of childPlans) {
    switch (plan.status) {
      case 'active': activePlans++; break;
      case 'completed': completedPlans++; break;
      case 'archived': archivedPlans++; break;
      case 'failed': failedPlans++; break;
    }
    for (const step of (plan.steps || [])) {
      totalSteps++;
      switch (step.status) {
        case 'done': doneSteps++; break;
        case 'active': activeSteps++; break;
        case 'pending': pendingSteps++; break;
        case 'blocked': blockedSteps++; break;
      }
    }
  }

  return {
    total_plans: childPlans.length,
    active_plans: activePlans,
    completed_plans: completedPlans,
    archived_plans: archivedPlans,
    failed_plans: failedPlans,
    total_steps: totalSteps,
    done_steps: doneSteps,
    active_steps: activeSteps,
    pending_steps: pendingSteps,
    blocked_steps: blockedSteps,
    completion_percentage: totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0,
  };
}

/**
 * Build a ProgramSummary from a program plan state and its children.
 */
function buildProgramSummary(state: PlanState, childPlans: PlanState[], workspaceId: string): ProgramSummary {
  const plans = childPlans.map(toPlanRef);
  const aggregate = computeAggregate(childPlans);

  return {
    program_id: state.id,
    name: state.title,
    description: state.description || '',
    created_at: state.created_at,
    updated_at: state.updated_at,
    workspace_id: workspaceId,
    plans,
    aggregate_progress: aggregate,
  };
}

// =============================================================================
// GET /api/programs/:workspaceId - List all programs for a workspace
// =============================================================================
programsRouter.get('/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const dataRoot = globalThis.MBS_DATA_ROOT;
    const plansDir = path.join(dataRoot, workspaceId, 'plans');

    const programs: ProgramSummary[] = [];

    let entries: string[];
    try {
      entries = await fs.readdir(plansDir);
    } catch {
      // Workspace has no plans directory at all
      return res.json({ programs: [] });
    }

    for (const entryName of entries) {
      // Check if it's a directory
      const entryPath = path.join(plansDir, entryName);
      let stat;
      try {
        stat = await fs.stat(entryPath);
      } catch { continue; }
      if (!stat.isDirectory()) continue;

      const state = await readPlanState(dataRoot, workspaceId, entryName);
      if (!state || !state.is_program) continue;

      // Load child plans
      const childIds = state.child_plan_ids || [];
      const childPlans: PlanState[] = [];
      for (const childId of childIds) {
        const child = await readPlanState(dataRoot, workspaceId, childId);
        if (child) childPlans.push(child);
      }

      programs.push(buildProgramSummary(state, childPlans, workspaceId));
    }

    // Sort by updated_at descending
    programs.sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    res.json({ programs });
  } catch (error) {
    console.error('Error getting programs:', error);
    res.status(500).json({ error: 'Failed to get programs' });
  }
});

// =============================================================================
// GET /api/programs/:workspaceId/:programId - Get program detail
// =============================================================================
programsRouter.get('/:workspaceId/:programId', async (req, res) => {
  try {
    const { workspaceId, programId } = req.params;
    const dataRoot = globalThis.MBS_DATA_ROOT;

    const state = await readPlanState(dataRoot, workspaceId, programId);
    if (!state) {
      return res.status(404).json({ error: 'Program not found' });
    }
    if (!state.is_program) {
      return res.status(400).json({ error: `${programId} is not a program` });
    }

    // Load child plans
    const childIds = state.child_plan_ids || [];
    const childPlans: PlanState[] = [];
    for (const childId of childIds) {
      const child = await readPlanState(dataRoot, workspaceId, childId);
      if (child) childPlans.push(child);
    }

    const summary = buildProgramSummary(state, childPlans, workspaceId);
    const detail: ProgramDetail = {
      ...summary,
      goals: state.goals,
      success_criteria: (state as any).success_criteria as string[] | undefined,
      notes: state.notes,
    };

    res.json(detail);
  } catch (error) {
    console.error('Error getting program detail:', error);
    res.status(500).json({ error: 'Failed to get program detail' });
  }
});

// =============================================================================
// POST /api/programs/:workspaceId - Create a new program
// =============================================================================
programsRouter.post('/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { title, description, priority, goals, success_criteria, child_plan_ids } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const dataRoot = globalThis.MBS_DATA_ROOT;

    // Generate program ID
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 6);
    const programId = `plan_${timestamp}${random}_${crypto.randomUUID().slice(0, 8)}`;

    const programDir = path.join(dataRoot, workspaceId, 'plans', programId);
    await fs.mkdir(programDir, { recursive: true });

    const now = new Date().toISOString();
    const validChildIds: string[] = [];

    // Validate child plan IDs
    if (Array.isArray(child_plan_ids)) {
      for (const childId of child_plan_ids) {
        const child = await readPlanState(dataRoot, workspaceId, childId);
        if (child) {
          validChildIds.push(childId);
        }
      }
    }

    const programState: PlanState = {
      id: programId,
      title,
      description: description || '',
      status: 'active',
      priority: priority || 'medium',
      category: 'feature',
      is_program: true,
      child_plan_ids: validChildIds,
      steps: [],
      goals: goals || [],
      notes: [],
      created_at: now,
      updated_at: now,
    };

    await fs.writeFile(
      path.join(programDir, 'state.json'),
      JSON.stringify(programState, null, 2)
    );

    // Update child plans with program_id reference
    for (const childId of validChildIds) {
      const childStatePath = path.join(dataRoot, workspaceId, 'plans', childId, 'state.json');
      try {
        const content = await fs.readFile(childStatePath, 'utf-8');
        const childState = JSON.parse(content);
        childState.program_id = programId;
        childState.updated_at = now;
        await fs.writeFile(childStatePath, JSON.stringify(childState, null, 2));
      } catch { /* skip if child can't be updated */ }
    }

    // Update workspace meta
    const metaPath = path.join(dataRoot, workspaceId, 'workspace.meta.json');
    try {
      const metaContent = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(metaContent);
      if (!meta.active_plans.includes(programId)) {
        meta.active_plans.push(programId);
        meta.last_accessed = now;
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
      }
    } catch { /* skip meta update if not found */ }

    // Build the response
    const childPlans: PlanState[] = [];
    for (const childId of validChildIds) {
      const child = await readPlanState(dataRoot, workspaceId, childId);
      if (child) childPlans.push(child);
    }

    const summary = buildProgramSummary(
      programState as unknown as PlanState,
      childPlans,
      workspaceId
    );

    res.status(201).json(summary);
  } catch (error) {
    console.error('Error creating program:', error);
    res.status(500).json({ error: 'Failed to create program' });
  }
});
