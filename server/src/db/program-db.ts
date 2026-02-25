/**
 * Program CRUD (Integrated Programs — first-class multi-plan containers).
 *
 * Programs are stored in the `programs` table, completely separate from plans.
 * Child plans link back to programs via `plans.program_id` (FK) and the
 * `program_plans` join table provides ordered child-plan membership.
 */

import type { ProgramRow, ProgramPlanRow, PlanRow } from './types.js';
import { queryOne, queryAll, run, transaction, newId, nowIso } from './query-helpers.js';
import { createPlan, getPlan } from './plan-db.js';
import { ensureWorkspaceLink } from './program-workspace-links-db.js';

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateProgramData {
  id?:              string;
  title:            string;
  description?:     string;
  category?:        string;
  priority?:        string;
  goals?:           string[] | null;
  success_criteria?: string[] | null;
  source?:          'v2' | 'v1_migrated';
}

export function createProgram(workspaceId: string, data: CreateProgramData): ProgramRow {
  const id  = data.id ?? newId();
  const now = nowIso();
  run(
    `INSERT INTO programs
      (id, workspace_id, title, description, category, priority, status,
       schema_version, goals, success_criteria, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', '2.0', ?, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      data.title,
      data.description      ?? '',
      data.category         ?? 'feature',
      data.priority         ?? 'medium',
      data.goals            ? JSON.stringify(data.goals)            : '[]',
      data.success_criteria ? JSON.stringify(data.success_criteria) : '[]',
      data.source           ?? 'v2',
      now,
      now,
    ]
  );
  return getProgram(id)!;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getProgram(id: string): ProgramRow | null {
  return queryOne<ProgramRow>('SELECT * FROM programs WHERE id = ?', [id]) ?? null;
}

export function listPrograms(workspaceId: string): ProgramRow[] {
  return queryAll<ProgramRow>(
    'SELECT * FROM programs WHERE workspace_id = ? ORDER BY created_at DESC',
    [workspaceId]
  );
}

/** Ordered child-plan rows for a program (via program_plans join table). */
export function listProgramPlans(programId: string): ProgramPlanRow[] {
  return queryAll<ProgramPlanRow>(
    'SELECT * FROM program_plans WHERE program_id = ? ORDER BY order_index',
    [programId]
  );
}

/** Full PlanRow for each child plan, ordered by program_plans.order_index. */
export function getProgramPlanRows(programId: string): PlanRow[] {
  return queryAll<PlanRow>(
    `SELECT p.* FROM plans p
     INNER JOIN program_plans pp ON pp.plan_id = p.id
     WHERE pp.program_id = ?
     ORDER BY pp.order_index`,
    [programId]
  );
}

// ---------------------------------------------------------------------------
// Link plan to program
// ---------------------------------------------------------------------------

export function addPlanToProgram(
  programId: string,
  planId:    string,
  orderIndex?: number
): void {
  transaction(() => {
    // Determine next order_index if not specified
    const idx = orderIndex ?? (() => {
      const rows = listProgramPlans(programId);
      return rows.length > 0 ? Math.max(...rows.map(r => r.order_index)) + 1 : 0;
    })();

    // Auto-create a cross-workspace link when the plan lives in a different
    // workspace than the program.
    const planRow    = queryOne<{ workspace_id: string }>('SELECT workspace_id FROM plans WHERE id = ?', [planId]);
    const programRow = queryOne<{ workspace_id: string }>('SELECT workspace_id FROM programs WHERE id = ?', [programId]);
    if (planRow && programRow && planRow.workspace_id !== programRow.workspace_id) {
      ensureWorkspaceLink(programId, planRow.workspace_id);
    }

    run(
      `INSERT OR IGNORE INTO program_plans (program_id, plan_id, order_index)
       VALUES (?, ?, ?)`,
      [programId, planId, idx]
    );

    // Keep plans.program_id in sync
    run('UPDATE plans SET program_id = ?, updated_at = ? WHERE id = ?', [programId, nowIso(), planId]);
  });
}

export function removePlanFromProgram(programId: string, planId: string): void {
  transaction(() => {
    run(
      'DELETE FROM program_plans WHERE program_id = ? AND plan_id = ?',
      [programId, planId]
    );
    // Clear the FK only if the plan still references this program
    run(
      'UPDATE plans SET program_id = NULL, updated_at = ? WHERE id = ? AND program_id = ?',
      [nowIso(), planId, programId]
    );
  });
}

// ---------------------------------------------------------------------------
// Upgrade a regular plan to a program
// ---------------------------------------------------------------------------

/**
 * Upgrade an existing plan to a Program.
 *
 * Creates a proper `programs` row from the plan's metadata, then either:
 * - `moveStepsToChild: true`  — a new child plan is created for the original
 *   plan's steps; the original plan is deleted.
 * - `moveStepsToChild: false` — the original plan becomes the first child plan
 *   of the new program (linked via program_plans).
 */
export function upgradeToProgram(
  planId: string,
  opts: { moveStepsToChild?: boolean; childTitle?: string } = {}
): ProgramRow {
  const plan = getPlan(planId);
  if (!plan) throw new Error(`Plan not found: ${planId}`);

  // Create the program container
  const program = createProgram(plan.workspace_id, {
    title:           plan.title,
    description:     plan.description,
    category:        plan.category,
    priority:        plan.priority,
    goals:           JSON.parse(plan.goals),
    success_criteria: JSON.parse(plan.success_criteria),
    source:          'v2',
  });

  if (opts.moveStepsToChild) {
    // Create child plan mirroring the original and link it
    const childPlan = createPlan({
      workspace_id:     plan.workspace_id,
      program_id:       program.id,
      title:            opts.childTitle ?? `${plan.title} — Phase 1`,
      description:      plan.description,
      category:         plan.category,
      priority:         plan.priority,
      goals:            JSON.parse(plan.goals),
      success_criteria: JSON.parse(plan.success_criteria),
    });

    // Move all phases/steps from original to the child
    transaction(() => {
      run('UPDATE phases SET plan_id = ? WHERE plan_id = ?', [childPlan.id, planId]);
      run('UPDATE steps  SET plan_id = ? WHERE plan_id = ?', [childPlan.id, planId]);
    });

    addPlanToProgram(program.id, childPlan.id, 0);
  } else {
    // Link the original plan as the first child
    addPlanToProgram(program.id, planId, 0);
  }

  return program;
}

// ---------------------------------------------------------------------------
// Update / Delete
// ---------------------------------------------------------------------------

export interface UpdateProgramData {
  title?:           string;
  description?:     string;
  category?:        string;
  priority?:        string;
  status?:          string;
  goals?:           string[] | null;
  success_criteria?: string[] | null;
}

export function updateProgram(id: string, data: UpdateProgramData): void {
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [nowIso()];

  if (data.title       !== undefined) { fields.push('title = ?');       values.push(data.title); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.category    !== undefined) { fields.push('category = ?');    values.push(data.category); }
  if (data.priority    !== undefined) { fields.push('priority = ?');    values.push(data.priority); }
  if (data.status      !== undefined) { fields.push('status = ?');      values.push(data.status); }
  if ('goals' in data) {
    fields.push('goals = ?');
    values.push(data.goals ? JSON.stringify(data.goals) : '[]');
  }
  if ('success_criteria' in data) {
    fields.push('success_criteria = ?');
    values.push(data.success_criteria ? JSON.stringify(data.success_criteria) : '[]');
  }

  values.push(id);
  run(`UPDATE programs SET ${fields.join(', ')} WHERE id = ?`, values);
}

export function deleteProgram(id: string): void {
  run('DELETE FROM programs WHERE id = ?', [id]);
}
