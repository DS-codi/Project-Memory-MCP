/**
 * Dependency DAG (plan→plan, phase→phase, step→step, program→plan, cross-type).
 */

import type { DependencyRow } from './types.js';
import { queryAll, run, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export function addDependency(
  sourceType: DependencyRow['source_type'],
  sourceId:   string,
  targetType: DependencyRow['target_type'],
  targetId:   string,
  depType:    DependencyRow['dep_type'] = 'blocks'
): DependencyRow {
  // Idempotent: return existing edge if it already exists
  const existing = getDependencies(sourceType, sourceId).find(
    d => d.target_type === targetType && d.target_id === targetId
  );
  if (existing) return existing;

  const now = nowIso();
  const result = run(
    `INSERT OR IGNORE INTO dependencies
      (source_type, source_id, target_type, target_id, dep_type, dep_status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    [sourceType, sourceId, targetType, targetId, depType, now]
  );
  return {
    id:           Number(result.lastInsertRowid),
    source_type:  sourceType,
    source_id:    sourceId,
    target_type:  targetType,
    target_id:    targetId,
    dep_type:     depType,
    dep_status:   'pending',
    created_at:   now,
    source_phase: null,
    target_phase: null,
    satisfied_at: null,
  };
}

/**
 * Add a plan-to-plan dependency with optional phase context.
 * Used by the program dependencies system.
 */
export function addProgramDependency(
  sourcePlanId:  string,
  targetPlanId:  string,
  depType:       DependencyRow['dep_type'],
  depStatus:     DependencyRow['dep_status'],
  sourcePhase?:  string | null,
  targetPhase?:  string | null,
  satisfiedAt?:  string | null,
): DependencyRow {
  const now = nowIso();
  const result = run(
    `INSERT OR REPLACE INTO dependencies
      (source_type, source_id, target_type, target_id, dep_type, dep_status,
       source_phase, target_phase, satisfied_at, created_at)
     VALUES ('plan', ?, 'plan', ?, ?, ?, ?, ?, ?, ?)`,
    [sourcePlanId, targetPlanId, depType, depStatus,
     sourcePhase ?? null, targetPhase ?? null, satisfiedAt ?? null, now]
  );
  return {
    id:           Number(result.lastInsertRowid),
    source_type:  'plan',
    source_id:    sourcePlanId,
    target_type:  'plan',
    target_id:    targetPlanId,
    dep_type:     depType,
    dep_status:   depStatus,
    created_at:   now,
    source_phase: sourcePhase ?? null,
    target_phase: targetPhase ?? null,
    satisfied_at: satisfiedAt ?? null,
  };
}

export function deleteProgramDependencies(sourcePlanId: string, targetPlanId: string): void {
  run(
    `DELETE FROM dependencies WHERE source_type = 'plan' AND source_id = ? AND target_type = 'plan' AND target_id = ?`,
    [sourcePlanId, targetPlanId]
  );
}

export function deletePlanDependencies(planId: string): void {
  run(
    `DELETE FROM dependencies WHERE source_type = 'plan' AND source_id = ?`,
    [planId]
  );
}

export function markDependencySatisfied(
  sourceType: DependencyRow['source_type'],
  sourceId:   string,
  targetType: DependencyRow['target_type'],
  targetId:   string
): void {
  const now = nowIso();
  run(
    `UPDATE dependencies SET dep_status = 'satisfied', satisfied_at = ?
     WHERE source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?`,
    [now, sourceType, sourceId, targetType, targetId]
  );
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getDependencies(
  sourceType: string,
  sourceId:   string,
  depType?:   DependencyRow['dep_type']
): DependencyRow[] {
  if (depType) {
    return queryAll<DependencyRow>(
      'SELECT * FROM dependencies WHERE source_type = ? AND source_id = ? AND dep_type = ?',
      [sourceType, sourceId, depType]
    );
  }
  return queryAll<DependencyRow>(
    'SELECT * FROM dependencies WHERE source_type = ? AND source_id = ?',
    [sourceType, sourceId]
  );
}

export function getDependents(targetType: string, targetId: string): DependencyRow[] {
  return queryAll<DependencyRow>(
    'SELECT * FROM dependencies WHERE target_type = ? AND target_id = ?',
    [targetType, targetId]
  );
}

// ---------------------------------------------------------------------------
// Cycle detection (simple BFS)
// ---------------------------------------------------------------------------

/**
 * Returns true if adding an edge from source→target would create a cycle.
 */
export function checkCycle(
  sourceType: string,
  sourceId:   string,
  targetType: string,
  targetId:   string
): boolean {
  // BFS from target: if we can reach source, adding source→target creates a cycle.
  const visited  = new Set<string>();
  const queue: Array<{ type: string; id: string }> = [{ type: targetType, id: targetId }];

  while (queue.length > 0) {
    const node = queue.shift()!;
    const key  = `${node.type}:${node.id}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (node.type === sourceType && node.id === sourceId) return true;

    const deps = getDependencies(node.type, node.id);
    for (const d of deps) {
      queue.push({ type: d.target_type, id: d.target_id });
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function removeDependency(id: number): void {
  run('DELETE FROM dependencies WHERE id = ?', [id]);
}

export function removeDependenciesFor(sourceType: string, sourceId: string): void {
  run('DELETE FROM dependencies WHERE source_type = ? AND source_id = ?', [sourceType, sourceId]);
}

/**
 * Get all plan-to-plan dependency edges for a given set of plan IDs.
 * Used to materialise a program's cross-plan dependency list.
 */
export function getPlanDependenciesForProgram(planIds: string[]): DependencyRow[] {
  if (planIds.length === 0) return [];
  const placeholders = planIds.map(() => '?').join(', ');
  return queryAll<DependencyRow>(
    `SELECT * FROM dependencies
     WHERE source_type = 'plan' AND source_id IN (${placeholders})
       AND target_type = 'plan'`,
    planIds
  );
}