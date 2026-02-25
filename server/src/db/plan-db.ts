/**
 * Plan CRUD + archival operations.
 */

import type { PlanRow, PlanArchiveRow } from './types.js';
import { queryOne, queryAll, run, transaction, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreatePlanData {
  id?:                     string;
  workspace_id:            string;
  program_id?:             string | null;
  title:                   string;
  description?:            string;
  category?:               string;
  priority?:               string;
  goals?:                  string[] | null;
  success_criteria?:       string[] | null;
  recommended_next_agent?: string | null;
  categorization?:         object | null;
  deployment_context?:     object | null;
  confirmation_state?:     object | null;
  paused_at?:              string | null;
  paused_at_snapshot?:     object | null;
  completed_at?:           string | null;
  schema_version?:         string;
}

export function createPlan(data: CreatePlanData): PlanRow {
  const id  = data.id ?? newId();
  const now = nowIso();
  run(
    `INSERT INTO plans
      (id, workspace_id, program_id, title, description, category, priority,
       status, schema_version, goals, success_criteria, categorization,
       deployment_context, confirmation_state, paused_at, paused_at_snapshot,
       recommended_next_agent, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.workspace_id,
      data.program_id          ?? null,
      data.title,
      data.description         ?? '',
      data.category            ?? 'feature',
      data.priority            ?? 'medium',
      data.schema_version      ?? '2.0',
      data.goals               ? JSON.stringify(data.goals)               : '[]',
      data.success_criteria    ? JSON.stringify(data.success_criteria)    : '[]',
      data.categorization      ? JSON.stringify(data.categorization)      : null,
      data.deployment_context  ? JSON.stringify(data.deployment_context)  : null,
      data.confirmation_state  ? JSON.stringify(data.confirmation_state)  : null,
      data.paused_at           ?? null,
      data.paused_at_snapshot  ? JSON.stringify(data.paused_at_snapshot)  : null,
      data.recommended_next_agent ?? null,
      now,
      now,
      data.completed_at        ?? null,
    ]
  );
  return getPlan(id)!;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getPlan(id: string): PlanRow | null {
  return queryOne<PlanRow>('SELECT * FROM plans WHERE id = ?', [id]) ?? null;
}

export interface ListPlansOptions {
  status?:    string;
  category?:  string;
  programId?: string;
}

export function getPlansByWorkspace(wsId: string, opts: ListPlansOptions = {}): PlanRow[] {
  const conditions = ['workspace_id = ?'];
  const params: unknown[] = [wsId];

  if (opts.status) {
    conditions.push('status = ?');
    params.push(opts.status);
  }
  if (opts.category) {
    conditions.push('category = ?');
    params.push(opts.category);
  }
  if (opts.programId) {
    conditions.push('program_id = ?');
    params.push(opts.programId);
  }

  return queryAll<PlanRow>(
    `SELECT * FROM plans WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
    params
  );
}

/** Cross-workspace search by plan ID — checks both active plans and archive. */
export function findPlanById(id: string): { plan: PlanRow; workspaceId: string } | null {
  const plan = queryOne<PlanRow>('SELECT * FROM plans WHERE id = ?', [id]);
  if (plan) return { plan, workspaceId: plan.workspace_id };

  const archived = queryOne<PlanArchiveRow>('SELECT * FROM plans_archive WHERE id = ?', [id]);
  if (archived) return { plan: archived as unknown as PlanRow, workspaceId: archived.workspace_id };

  return null;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export interface UpdatePlanData {
  title?:                  string;
  description?:            string;
  category?:               string;
  priority?:               string;
  status?:                 string;
  goals?:                  string[] | null;
  success_criteria?:       string[] | null;
  recommended_next_agent?: string | null;
  categorization?:         object | null;
  deployment_context?:     object | null;
  confirmation_state?:     object | null;
  paused_at?:              string | null;
  paused_at_snapshot?:     object | null;
  completed_at?:           string | null;
  program_id?:             string | null;
}

export function updatePlan(id: string, data: UpdatePlanData): void {
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [nowIso()];

  const simple: (keyof UpdatePlanData)[] = [
    'title', 'description', 'category', 'priority', 'status',
    'recommended_next_agent', 'program_id', 'paused_at', 'completed_at',
  ];
  for (const key of simple) {
    if (key in data && data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key] as unknown);
    }
  }
  if ('goals' in data) {
    fields.push('goals = ?');
    values.push(data.goals ? JSON.stringify(data.goals) : '[]');
  }
  if ('success_criteria' in data) {
    fields.push('success_criteria = ?');
    values.push(data.success_criteria ? JSON.stringify(data.success_criteria) : '[]');
  }
  if ('categorization' in data) {
    fields.push('categorization = ?');
    values.push(data.categorization ? JSON.stringify(data.categorization) : null);
  }
  if ('deployment_context' in data) {
    fields.push('deployment_context = ?');
    values.push(data.deployment_context ? JSON.stringify(data.deployment_context) : null);
  }
  if ('confirmation_state' in data) {
    fields.push('confirmation_state = ?');
    values.push(data.confirmation_state ? JSON.stringify(data.confirmation_state) : null);
  }
  if ('paused_at_snapshot' in data) {
    fields.push('paused_at_snapshot = ?');
    values.push(data.paused_at_snapshot ? JSON.stringify(data.paused_at_snapshot) : null);
  }

  values.push(id);
  run(`UPDATE plans SET ${fields.join(', ')} WHERE id = ?`, values);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deletePlan(id: string): void {
  run('DELETE FROM plans WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Archival
// ---------------------------------------------------------------------------

/**
 * Move a plan and all its children (phases, steps, sessions, lineage,
 * plan_notes, context_items, research_documents) to the archive tables in
 * a single transaction.
 */
export function archivePlan(id: string): void {
  transaction(() => {
    const archivedAt = nowIso();

    // Archive plan itself — explicitly exclude plans.archived_at (nullable for
    // active plans) and supply our own archivedAt value to avoid column count mismatch.
    run(
      `INSERT OR REPLACE INTO plans_archive
         (id, workspace_id, program_id, title, description, category, priority, status,
          schema_version, goals, success_criteria, categorization, deployment_context,
          confirmation_state, paused_at, paused_at_snapshot, recommended_next_agent,
          created_at, updated_at, archived_at, completed_at)
       SELECT
          id, workspace_id, program_id, title, description, category, priority, status,
          schema_version, goals, success_criteria, categorization, deployment_context,
          confirmation_state, paused_at, paused_at_snapshot, recommended_next_agent,
          created_at, updated_at, ?, completed_at
       FROM plans WHERE id = ?`,
      [archivedAt, id]
    );

    // Archive phases
    run(
      `INSERT OR REPLACE INTO phases_archive
       SELECT *, ? AS archived_at FROM phases WHERE plan_id = ?`,
      [archivedAt, id]
    );

    // Archive steps
    run(
      `INSERT OR REPLACE INTO steps_archive
       SELECT *, ? AS archived_at FROM steps WHERE plan_id = ?`,
      [archivedAt, id]
    );

    // Archive sessions
    run(
      `INSERT OR REPLACE INTO sessions_archive
       SELECT *, ? AS archived_at FROM sessions WHERE plan_id = ?`,
      [archivedAt, id]
    );

    // Archive lineage
    run(
      `INSERT OR REPLACE INTO lineage_archive
       SELECT *, ? AS archived_at FROM lineage WHERE plan_id = ?`,
      [archivedAt, id]
    );

    // Remove from active tables (cascade handles plan_notes, context_items FK)
    run('DELETE FROM steps   WHERE plan_id = ?', [id]);
    run('DELETE FROM phases  WHERE plan_id = ?', [id]);
    run('DELETE FROM sessions WHERE plan_id = ?', [id]);
    run('DELETE FROM lineage  WHERE plan_id = ?', [id]);
    run('DELETE FROM plans    WHERE id = ?',      [id]);

    // Update status in archive row
    run(
      `UPDATE plans_archive SET status = 'archived', archived_at = ? WHERE id = ?`,
      [archivedAt, id]
    );
  });
}

// ---------------------------------------------------------------------------
// Typed filter queries
// ---------------------------------------------------------------------------

export function getPlansByCategory(
  wsId: string,
  category: PlanRow['category']
): PlanRow[] {
  return queryAll<PlanRow>(
    'SELECT * FROM plans WHERE workspace_id = ? AND category = ? ORDER BY created_at DESC',
    [wsId, category]
  );
}

export function getPausedPlans(wsId: string): PlanRow[] {
  return queryAll<PlanRow>(
    'SELECT * FROM plans WHERE workspace_id = ? AND paused_at IS NOT NULL ORDER BY paused_at DESC',
    [wsId]
  );
}

export function getChildPlans(programId: string): PlanRow[] {
  return queryAll<PlanRow>(
    'SELECT * FROM plans WHERE program_id = ? ORDER BY created_at',
    [programId]
  );
}

export function getPlansByStatus(
  wsId: string,
  ...statuses: Array<PlanRow['status']>
): PlanRow[] {
  const placeholders = statuses.map(() => '?').join(', ');
  return queryAll<PlanRow>(
    `SELECT * FROM plans WHERE workspace_id = ? AND status IN (${placeholders}) ORDER BY created_at DESC`,
    [wsId, ...statuses]
  );
}
