/**
 * Sprint CRUD operations.
 *
 * Implements sprint and goal management with similar patterns to plan-db.ts.
 */

import type { SprintRow, GoalRow } from './types.js';
import type { Sprint, Goal, SprintStatus } from '../types/sprint.types.js';
import { queryOne, queryAll, run, transaction, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Sprint: Create
// ---------------------------------------------------------------------------

export interface CreateSprintData {
  id?:              string;
  workspace_id:     string;
  attached_plan_id?: string | null;
  title:            string;
  status?:          SprintStatus;
}

export function createSprint(data: CreateSprintData): SprintRow {
  const id  = data.id ?? newId();
  const now = nowIso();
  run(
    `INSERT INTO sprints
      (sprint_id, workspace_id, attached_plan_id, title, status, goals, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '[]', ?, ?)`,
    [
      id,
      data.workspace_id,
      data.attached_plan_id ?? null,
      data.title,
      data.status ?? 'active',
      now,
      now,
    ]
  );
  return getSprint(id)!;
}

// ---------------------------------------------------------------------------
// Sprint: Read
// ---------------------------------------------------------------------------

export function getSprint(id: string): SprintRow | null {
  return queryOne<SprintRow>('SELECT * FROM sprints WHERE sprint_id = ?', [id]) ?? null;
}

export function getSprintWithGoals(id: string): Sprint | null {
  const row = getSprint(id);
  if (!row) return null;
  return rowToSprint(row);
}

export interface ListSprintsOptions {
  status?: SprintStatus;
}

export function listSprints(workspaceId: string, opts: ListSprintsOptions = {}): SprintRow[] {
  const conditions = ['workspace_id = ?'];
  const params: unknown[] = [workspaceId];

  if (opts.status) {
    conditions.push('status = ?');
    params.push(opts.status);
  }

  return queryAll<SprintRow>(
    `SELECT * FROM sprints WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
    params
  );
}

export function listSprintsWithGoals(workspaceId: string, opts: ListSprintsOptions = {}): Sprint[] {
  const rows = listSprints(workspaceId, opts);
  return rows.map(rowToSprint);
}

// ---------------------------------------------------------------------------
// Sprint: Update
// ---------------------------------------------------------------------------

export interface UpdateSprintData {
  title?:            string;
  status?:           SprintStatus;
  attached_plan_id?: string | null;
}

export function updateSprint(id: string, data: UpdateSprintData): void {
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [nowIso()];

  if ('title' in data && data.title !== undefined) {
    fields.push('title = ?');
    values.push(data.title);
  }
  if ('status' in data && data.status !== undefined) {
    fields.push('status = ?');
    values.push(data.status);
  }
  if ('attached_plan_id' in data) {
    fields.push('attached_plan_id = ?');
    values.push(data.attached_plan_id ?? null);
  }

  values.push(id);
  run(`UPDATE sprints SET ${fields.join(', ')} WHERE sprint_id = ?`, values);
}

// ---------------------------------------------------------------------------
// Sprint: Archive
// ---------------------------------------------------------------------------

export function archiveSprint(id: string): void {
  updateSprint(id, { status: 'archived' });
}

// ---------------------------------------------------------------------------
// Sprint: Delete
// ---------------------------------------------------------------------------

export function deleteSprint(id: string): void {
  // Goals are deleted via CASCADE
  run('DELETE FROM sprints WHERE sprint_id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Sprint: Plan Attachment
// ---------------------------------------------------------------------------

export function attachPlan(sprintId: string, planId: string): void {
  run(
    'UPDATE sprints SET attached_plan_id = ?, updated_at = ? WHERE sprint_id = ?',
    [planId, nowIso(), sprintId]
  );
}

export function detachPlan(sprintId: string): void {
  run(
    'UPDATE sprints SET attached_plan_id = NULL, updated_at = ? WHERE sprint_id = ?',
    [nowIso(), sprintId]
  );
}

// ---------------------------------------------------------------------------
// Goals: Create
// ---------------------------------------------------------------------------

export function addGoal(sprintId: string, description: string): GoalRow {
  const id = newId();
  const now = nowIso();
  run(
    `INSERT INTO goals (goal_id, sprint_id, description, completed, completed_at, created_at)
     VALUES (?, ?, ?, 0, NULL, ?)`,
    [id, sprintId, description, now]
  );
  
  // Update sprint's updated_at
  run('UPDATE sprints SET updated_at = ? WHERE sprint_id = ?', [now, sprintId]);
  
  return getGoal(id)!;
}

// ---------------------------------------------------------------------------
// Goals: Read
// ---------------------------------------------------------------------------

export function getGoal(id: string): GoalRow | null {
  return queryOne<GoalRow>('SELECT * FROM goals WHERE goal_id = ?', [id]) ?? null;
}

export function listGoals(sprintId: string): GoalRow[] {
  return queryAll<GoalRow>(
    'SELECT * FROM goals WHERE sprint_id = ? ORDER BY created_at ASC',
    [sprintId]
  );
}

// ---------------------------------------------------------------------------
// Goals: Update
// ---------------------------------------------------------------------------

export interface UpdateGoalData {
  description?: string;
  completed?:   boolean;
}

export function updateGoal(id: string, data: UpdateGoalData): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if ('description' in data && data.description !== undefined) {
    fields.push('description = ?');
    values.push(data.description);
  }
  if ('completed' in data && data.completed !== undefined) {
    fields.push('completed = ?');
    fields.push('completed_at = ?');
    values.push(data.completed ? 1 : 0);
    values.push(data.completed ? nowIso() : null);
  }

  if (fields.length === 0) return;

  values.push(id);
  run(`UPDATE goals SET ${fields.join(', ')} WHERE goal_id = ?`, values);

  // Update parent sprint's updated_at
  const goal = getGoal(id);
  if (goal) {
    run('UPDATE sprints SET updated_at = ? WHERE sprint_id = ?', [nowIso(), goal.sprint_id]);
  }
}

export function completeGoal(id: string): void {
  updateGoal(id, { completed: true });
}

// ---------------------------------------------------------------------------
// Goals: Delete
// ---------------------------------------------------------------------------

export function removeGoal(id: string): void {
  const goal = getGoal(id);
  run('DELETE FROM goals WHERE goal_id = ?', [id]);
  
  // Update parent sprint's updated_at
  if (goal) {
    run('UPDATE sprints SET updated_at = ? WHERE sprint_id = ?', [nowIso(), goal.sprint_id]);
  }
}

// ---------------------------------------------------------------------------
// Row-to-Type Conversion Helpers
// ---------------------------------------------------------------------------

function rowToGoal(row: GoalRow): Goal {
  return {
    goal_id: row.goal_id,
    sprint_id: row.sprint_id,
    description: row.description,
    completed: Boolean(row.completed),
    completed_at: row.completed_at,
    created_at: row.created_at,
  };
}

function rowToSprint(row: SprintRow): Sprint {
  const goalRows = listGoals(row.sprint_id);
  return {
    sprint_id: row.sprint_id,
    workspace_id: row.workspace_id,
    attached_plan_id: row.attached_plan_id,
    title: row.title,
    status: row.status,
    goals: goalRows.map(rowToGoal),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Bulk Operations
// ---------------------------------------------------------------------------

/**
 * Replace all goals for a sprint in a single transaction.
 * Useful for bulk goal updates from the MCP tool.
 */
export function setGoals(sprintId: string, descriptions: string[]): GoalRow[] {
  return transaction(() => {
    // Remove existing goals
    run('DELETE FROM goals WHERE sprint_id = ?', [sprintId]);
    
    // Add new goals
    const now = nowIso();
    const goals: GoalRow[] = [];
    for (const description of descriptions) {
      const id = newId();
      run(
        `INSERT INTO goals (goal_id, sprint_id, description, completed, completed_at, created_at)
         VALUES (?, ?, ?, 0, NULL, ?)`,
        [id, sprintId, description, now]
      );
      goals.push(getGoal(id)!);
    }
    
    // Update sprint's updated_at
    run('UPDATE sprints SET updated_at = ? WHERE sprint_id = ?', [now, sprintId]);
    
    return goals;
  });
}

/**
 * Get sprints by attached plan ID.
 */
export function getSprintsByPlan(planId: string): SprintRow[] {
  return queryAll<SprintRow>(
    'SELECT * FROM sprints WHERE attached_plan_id = ? ORDER BY created_at DESC',
    [planId]
  );
}

/**
 * Get sprint counts by status for a workspace.
 */
export function getSprintCounts(workspaceId: string): Record<SprintStatus, number> {
  const rows = queryAll<{ status: SprintStatus; count: number }>(
    `SELECT status, COUNT(*) as count FROM sprints 
     WHERE workspace_id = ? GROUP BY status`,
    [workspaceId]
  );
  
  const counts: Record<SprintStatus, number> = {
    active: 0,
    completed: 0,
    archived: 0,
  };
  
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  
  return counts;
}
