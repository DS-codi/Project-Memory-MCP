import { Router } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  listPrograms,
  getPlan,
  getProgram,
  getProgramChildPlans,
  getPlanSteps,
} from '../db/queries.js';
import type { PlanRow, ProgramRow, StepRow } from '../db/queries.js';

export const programsRouter = Router();

// ---------------------------------------------------------------------------
// Types (kept for write-path compatibility)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// DB-row helpers
// ---------------------------------------------------------------------------

function planRowToRef(row: PlanRow, steps: StepRow[]): ProgramPlanRef {
  const done = steps.filter(s => s.status === 'done').length;
  return {
    plan_id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority ?? 'medium',
    current_phase: row.current_phase ?? '',
    progress: { done, total: steps.length },
    depends_on_plans: [],
  };
}

function computeAggregateFromRows(
  rows: PlanRow[],
  stepsByPlan: Map<string, StepRow[]>
): AggregateProgress {
  let totalSteps = 0, doneSteps = 0, activeSteps = 0, pendingSteps = 0, blockedSteps = 0;
  let activePlans = 0, completedPlans = 0, archivedPlans = 0, failedPlans = 0;

  for (const row of rows) {
    if (row.status === 'archived') archivedPlans++;
    else if (row.status === 'completed') completedPlans++;
    else if (row.status === 'failed') failedPlans++;
    else activePlans++;

    const steps = stepsByPlan.get(row.id) ?? [];
    for (const s of steps) {
      totalSteps++;
      switch (s.status) {
        case 'done': doneSteps++; break;
        case 'active': activeSteps++; break;
        case 'pending': pendingSteps++; break;
        case 'blocked': blockedSteps++; break;
      }
    }
  }

  return {
    total_plans: rows.length,
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

function buildProgramSummaryFromDb(
  program: PlanRow | ProgramRow,
  childRows: PlanRow[],
  stepsByPlan: Map<string, StepRow[]>
): ProgramSummary {
  const plans = childRows.map(row => planRowToRef(row, stepsByPlan.get(row.id) ?? []));
  const aggregate = computeAggregateFromRows(childRows, stepsByPlan);

  return {
    program_id: program.id,
    name: program.title,
    description: program.description ?? '',
    created_at: program.created_at,
    updated_at: program.updated_at,
    workspace_id: program.workspace_id,
    plans,
    aggregate_progress: aggregate,
  };
}

// ---------------------------------------------------------------------------
// Legacy file helper — still needed for write routes
// ---------------------------------------------------------------------------

async function readPlanState(dataRoot: string, workspaceId: string, planId: string): Promise<PlanState | null> {
  const statePath = path.join(dataRoot, workspaceId, 'plans', planId, 'state.json');
  try {
    const content = await fs.readFile(statePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// =============================================================================
// GET /api/programs/:workspaceId - List all programs for a workspace
// =============================================================================
programsRouter.get('/:workspaceId', (req, res) => {
  try {
    const { workspaceId } = req.params;

    const programRows = listPrograms(workspaceId);
    const result: ProgramSummary[] = [];

    for (const program of programRows) {
      const childRows = getProgramChildPlans(program.id);
      const stepsByPlan = new Map<string, StepRow[]>();
      for (const child of childRows) {
        stepsByPlan.set(child.id, getPlanSteps(child.id));
      }
      result.push(buildProgramSummaryFromDb(program, childRows, stepsByPlan));
    }

    result.sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    res.json({ programs: result });
  } catch (error) {
    console.error('Error getting programs:', error);
    res.status(500).json({ error: 'Failed to get programs' });
  }
});

// =============================================================================
// GET /api/programs/:workspaceId/:programId - Get program detail
// =============================================================================
programsRouter.get('/:workspaceId/:programId', (req, res) => {
  try {
    const { workspaceId, programId } = req.params;

    // Look up in programs table first, then fall back to plans table
    const program: PlanRow | ProgramRow | null = getProgram(programId) ?? getPlan(programId);
    if (!program) {
      return res.status(404).json({ error: 'Program not found' });
    }
    // For PlanRow entries, verify is_program flag
    if ('is_program' in program && !program.is_program) {
      return res.status(400).json({ error: `${programId} is not a program` });
    }

    const childRows = getProgramChildPlans(programId);
    const stepsByPlan = new Map<string, StepRow[]>();
    for (const child of childRows) {
      stepsByPlan.set(child.id, getPlanSteps(child.id));
    }

    const summary = buildProgramSummaryFromDb(program, childRows, stepsByPlan);

    let goals: string[] | undefined;
    let successCriteria: string[] | undefined;
    try { goals = program.goals ? JSON.parse(program.goals) : undefined; } catch { /* ignored */ }
    try { successCriteria = program.success_criteria ? JSON.parse(program.success_criteria) : undefined; } catch { /* ignored */ }

    const detail: ProgramDetail = {
      ...summary,
      goals,
      success_criteria: successCriteria,
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

    // Return the created program state directly (GET endpoint provides full DB-backed summary)
    const summary = programState;

    res.status(201).json(summary);
  } catch (error) {
    console.error('Error creating program:', error);
    res.status(500).json({ error: 'Failed to create program' });
  }
});
