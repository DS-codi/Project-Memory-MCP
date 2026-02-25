/**
 * Step CRUD + atomic "next step" operations.
 */

import type { StepRow } from './types.js';
import { queryOne, queryAll, run, transaction, newId, nowIso } from './query-helpers.js';
import { getOrCreatePhase } from './phase-db.js';

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateStepData {
  id?:                        string;
  task:                       string;
  type?:                      string;
  status?:                    string;
  assignee?:                  string | null;
  notes?:                     string | null;
  order_index?:               number;
  requires_confirmation?:     boolean;
  requires_user_confirmation?: boolean;
  requires_validation?:       boolean;
  /**
   * @deprecated — index-based array. Ignored at write time; step-level
   * dependencies are now stored in the `dependencies` table via
   * `addStepDependency()`. Kept here so call-sites don't error during
   * the transition period.
   */
  depends_on?:                number[] | null;
}

export function createStep(phaseId: string, data: CreateStepData): StepRow {
  const id = data.id ?? newId();
  const now = nowIso();

  // Resolve the plan_id from the phase
  const phase = queryOne<{ plan_id: string }>('SELECT plan_id FROM phases WHERE id = ?', [phaseId]);
  if (!phase) throw new Error(`Phase not found: ${phaseId}`);

  const orderIndex = data.order_index ?? (
    (queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM steps WHERE phase_id = ?', [phaseId])?.c ?? 0)
  );

  run(
    `INSERT INTO steps
      (id, phase_id, plan_id, task, type, status, assignee, notes,
       order_index, requires_confirmation, requires_user_confirmation,
       requires_validation, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      phaseId,
      phase.plan_id,
      data.task,
      data.type   ?? 'standard',
      data.status ?? 'pending',
      data.assignee ?? null,
      data.notes    ?? null,
      orderIndex,
      data.requires_confirmation      ? 1 : 0,
      data.requires_user_confirmation ? 1 : 0,
      data.requires_validation        ? 1 : 0,
      now,
      now,
    ]
  );
  return getStep(id)!;
}

/**
 * Create a step by phase name (get-or-create the phase if needed).
 */
export function createStepInPhase(
  planId:    string,
  phaseName: string,
  data:      CreateStepData
): StepRow {
  const phase = getOrCreatePhase(planId, phaseName);
  return createStep(phase.id, data);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getStep(id: string): StepRow | null {
  return queryOne<StepRow>('SELECT * FROM steps WHERE id = ?', [id]) ?? null;
}

export function getSteps(phaseId: string): StepRow[] {
  return queryAll<StepRow>(
    'SELECT * FROM steps WHERE phase_id = ? ORDER BY order_index',
    [phaseId]
  );
}

/** Return all steps for a plan ordered by phase.order_index then step.order_index. */
export function getAllSteps(planId: string): StepRow[] {
  return queryAll<StepRow>(
    `SELECT s.*
     FROM steps s
     JOIN phases p ON p.id = s.phase_id
     WHERE s.plan_id = ?
     ORDER BY p.order_index, s.order_index`,
    [planId]
  );
}

export function getNextPendingStep(planId: string): StepRow | null {
  // Skip steps that have at least one unsatisfied 'blocks' dependency
  // (i.e. any dependency row where this step is the target and dep is pending).
  return queryOne<StepRow>(
    `SELECT s.*
     FROM steps s
     JOIN phases p ON p.id = s.phase_id
     WHERE s.plan_id = ? AND s.status = 'pending'
       AND NOT EXISTS (
         SELECT 1 FROM dependencies d
         WHERE d.target_type = 'step'
           AND d.target_id   = s.id
           AND d.dep_type    = 'blocks'
           AND d.dep_status  = 'pending'
       )
     ORDER BY p.order_index, s.order_index
     LIMIT 1`,
    [planId]
  ) ?? null;
}

// ---------------------------------------------------------------------------
// Step dependencies
// ---------------------------------------------------------------------------

/**
 * Returns the IDs of all steps that must complete before `stepId` can start.
 * (All 'blocks' deps where `stepId` is the target.)
 */
export function getStepDependencies(stepId: string): string[] {
  const rows = queryAll<{ source_id: string }>(
    `SELECT source_id FROM dependencies
     WHERE target_type = 'step' AND target_id = ? AND dep_type = 'blocks'`,
    [stepId]
  );
  return rows.map(r => r.source_id);
}

/**
 * Returns the IDs of all steps that are blocked by `stepId`.
 * (All 'blocks' deps where `stepId` is the source.)
 */
export function getStepDependents(stepId: string): string[] {
  const rows = queryAll<{ target_id: string }>(
    `SELECT target_id FROM dependencies
     WHERE source_type = 'step' AND source_id = ? AND dep_type = 'blocks'`,
    [stepId]
  );
  return rows.map(r => r.target_id);
}

/**
 * Record that `stepId` cannot start until `blockedByStepId` is done.
 * Idempotent — safe to call multiple times.
 */
export function addStepDependency(stepId: string, blockedByStepId: string): void {
  run(
    `INSERT OR IGNORE INTO dependencies
       (source_type, source_id, target_type, target_id, dep_type, dep_status)
     VALUES ('step', ?, 'step', ?, 'blocks', 'pending')`,
    [blockedByStepId, stepId]
  );
}

/**
 * Remove a specific dependency between two steps.
 */
export function removeStepDependency(stepId: string, blockedByStepId: string): void {
  run(
    `DELETE FROM dependencies
     WHERE source_type = 'step' AND source_id = ?
       AND target_type = 'step' AND target_id = ?`,
    [blockedByStepId, stepId]
  );
}

/**
 * Mark all outgoing 'blocks' dependencies from `stepId` as satisfied.
 * Call this when a step transitions to 'done' to unblock downstream steps.
 */
export function markStepDependenciesSatisfied(stepId: string): void {
  run(
    `UPDATE dependencies
     SET dep_status = 'satisfied'
     WHERE source_type = 'step' AND source_id = ?
       AND dep_type = 'blocks' AND dep_status = 'pending'`,
    [stepId]
  );
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export interface UpdateStepData {
  task?:                      string;
  type?:                      string;
  status?:                    string;
  assignee?:                  string | null;
  notes?:                     string | null;
  requires_confirmation?:     boolean;
  requires_user_confirmation?: boolean;
  requires_validation?:       boolean;
  completed_at?:              string | null;
  completed_by_agent?:        string | null;
}

export function updateStep(id: string, data: UpdateStepData): void {
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [nowIso()];

  if (data.task      !== undefined) { fields.push('task = ?');      values.push(data.task); }
  if (data.type      !== undefined) { fields.push('type = ?');      values.push(data.type); }
  if (data.status    !== undefined) { fields.push('status = ?');    values.push(data.status); }
  if ('assignee' in data) { fields.push('assignee = ?'); values.push(data.assignee ?? null); }
  if ('notes'    in data) { fields.push('notes = ?');    values.push(data.notes    ?? null); }

  if (data.requires_confirmation !== undefined) {
    fields.push('requires_confirmation = ?');
    values.push(data.requires_confirmation ? 1 : 0);
  }
  if (data.requires_user_confirmation !== undefined) {
    fields.push('requires_user_confirmation = ?');
    values.push(data.requires_user_confirmation ? 1 : 0);
  }
  if (data.requires_validation !== undefined) {
    fields.push('requires_validation = ?');
    values.push(data.requires_validation ? 1 : 0);
  }
  if ('completed_at' in data) {
    fields.push('completed_at = ?');
    values.push(data.completed_at ?? null);
  }
  if ('completed_by_agent' in data) {
    fields.push('completed_by_agent = ?');
    values.push(data.completed_by_agent ?? null);
  }

  values.push(id);
  run(`UPDATE steps SET ${fields.join(', ')} WHERE id = ?`, values);
}

export interface BatchUpdate {
  id:      string;
  status?: string;
  notes?:  string | null;
}

export function batchUpdateSteps(updates: BatchUpdate[]): void {
  transaction(() => {
    for (const u of updates) {
      updateStep(u.id, { status: u.status, notes: u.notes });
    }
  });
}

// ---------------------------------------------------------------------------
// Insert at position
// ---------------------------------------------------------------------------

/** Insert a step at a specific order_index within a phase, shifting others down. */
export function insertStepAt(phaseId: string, atIndex: number, data: CreateStepData): StepRow {
  return transaction(() => {
    // Shift existing steps down
    run(
      'UPDATE steps SET order_index = order_index + 1 WHERE phase_id = ? AND order_index >= ?',
      [phaseId, atIndex]
    );
    return createStep(phaseId, { ...data, order_index: atIndex });
  });
}

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

/** Move a step to a different phase and/or order position. */
export function moveStep(stepId: string, toPhaseId: string, toIndex: number): void {
  const step = queryOne<StepRow>('SELECT * FROM steps WHERE id = ?', [stepId]);
  if (!step) throw new Error(`Step not found: ${stepId}`);

  const targetPhase = queryOne<{ plan_id: string }>('SELECT plan_id FROM phases WHERE id = ?', [toPhaseId]);
  if (!targetPhase) throw new Error(`Target phase not found: ${toPhaseId}`);

  transaction(() => {
    // Close the gap in the source phase
    run(
      'UPDATE steps SET order_index = order_index - 1 WHERE phase_id = ? AND order_index > ?',
      [step.phase_id, step.order_index]
    );
    // Open a slot in the target phase
    run(
      'UPDATE steps SET order_index = order_index + 1 WHERE phase_id = ? AND order_index >= ?',
      [toPhaseId, toIndex]
    );
    // Move the step
    run(
      'UPDATE steps SET phase_id = ?, plan_id = ?, order_index = ?, updated_at = ? WHERE id = ?',
      [toPhaseId, targetPhase.plan_id, toIndex, nowIso(), stepId]
    );
  });
}

// ---------------------------------------------------------------------------
// Reorder within phase
// ---------------------------------------------------------------------------

export function reorderSteps(phaseId: string, newOrder: string[]): void {
  transaction(() => {
    newOrder.forEach((stepId, idx) => {
      run(
        'UPDATE steps SET order_index = ?, updated_at = ? WHERE id = ? AND phase_id = ?',
        [idx, nowIso(), stepId, phaseId]
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deleteStep(id: string): void {
  run('DELETE FROM steps WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Atomic "next step" operation
// ---------------------------------------------------------------------------

export interface MarkDoneAndGetNextResult {
  completed: StepRow;
  next:      StepRow | null;
}

/**
 * Atomically mark the currently-active step as done (with timestamp and
 * agent attribution) and return the next pending step.
 *
 * This eliminates the race condition where two concurrent callers could
 * both mark the same step active.
 */
export function markCurrentDoneAndGetNext(
  planId:    string,
  stepId:    string,
  agentType: string
): MarkDoneAndGetNextResult {
  return transaction(() => {
    const now = nowIso();

    run(
      `UPDATE steps
       SET status = 'done', completed_at = ?, completed_by_agent = ?, updated_at = ?
       WHERE id = ? AND plan_id = ?`,
      [now, agentType, now, stepId, planId]
    );

    const completed = getStep(stepId)!;
    const next      = getNextPendingStep(planId);

    return { completed, next };
  });
}
