/**
 * Phase CRUD + reordering operations.
 */

import type { PhaseRow } from './types.js';
import { queryOne, queryAll, run, transaction, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreatePhaseData {
  id?:         string;
  name:        string;
  order_index?: number;
}

export function createPhase(planId: string, data: CreatePhaseData): PhaseRow {
  const id = data.id ?? newId();

  // Default order_index = count of existing phases
  const orderIndex = data.order_index ?? (
    (queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM phases WHERE plan_id = ?', [planId])?.c ?? 0)
  );

  run(
    'INSERT INTO phases (id, plan_id, name, order_index, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, planId, data.name, orderIndex, nowIso()]
  );
  return getPhase(id)!;
}

/**
 * Get-or-create a phase by name within a plan.
 * Returns an existing phase if one with the same name already exists;
 * otherwise creates a new one at the end.
 */
export function getOrCreatePhase(planId: string, name: string): PhaseRow {
  const existing = queryOne<PhaseRow>(
    'SELECT * FROM phases WHERE plan_id = ? AND name = ?',
    [planId, name]
  );
  if (existing) return existing;
  return createPhase(planId, { name });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getPhase(id: string): PhaseRow | null {
  return queryOne<PhaseRow>('SELECT * FROM phases WHERE id = ?', [id]) ?? null;
}

export function getPhases(planId: string): PhaseRow[] {
  return queryAll<PhaseRow>(
    'SELECT * FROM phases WHERE plan_id = ? ORDER BY order_index, name',
    [planId]
  );
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export function updatePhase(id: string, data: { name?: string; order_index?: number }): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    values.push(data.name);
  }
  if (data.order_index !== undefined) {
    fields.push('order_index = ?');
    values.push(data.order_index);
  }

  if (fields.length === 0) return;

  values.push(id);
  run(`UPDATE phases SET ${fields.join(', ')} WHERE id = ?`, values);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deletePhase(id: string): void {
  run('DELETE FROM phases WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Reordering
// ---------------------------------------------------------------------------

/**
 * Reorder phases in a plan.
 *
 * @param planId - The plan whose phases are being reordered.
 * @param newOrder - Array of phase IDs in the desired order.
 */
export function reorderPhases(planId: string, newOrder: string[]): void {
  transaction(() => {
    newOrder.forEach((phaseId, idx) => {
      run(
        'UPDATE phases SET order_index = ? WHERE id = ? AND plan_id = ?',
        [idx, phaseId, planId]
      );
    });
  });
}

/**
 * Re-derive `order_index` for all phases in a plan from their current
 * alphabetical / positional ordering (used when importing legacy data).
 */
export function normalizePhaseOrder(planId: string): void {
  const phases = getPhases(planId);
  transaction(() => {
    phases.forEach((p, i) => {
      run('UPDATE phases SET order_index = ? WHERE id = ?', [i, p.id]);
    });
  });
}
