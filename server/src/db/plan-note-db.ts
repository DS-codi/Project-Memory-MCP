/**
 * Plan notes CRUD.
 */

import type { PlanNoteRow } from './types.js';
import { queryAll, run, newId, nowIso } from './query-helpers.js';

export function addPlanNote(
  planId:   string,
  content:  string,
  noteType: string = 'info'
): PlanNoteRow {
  const id  = newId();
  const now = nowIso();
  run(
    'INSERT INTO plan_notes (id, plan_id, content, note_type, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, planId, content, noteType, now]
  );
  return { id, plan_id: planId, content, note_type: noteType, created_at: now };
}

export function getPlanNotes(planId: string): PlanNoteRow[] {
  return queryAll<PlanNoteRow>(
    'SELECT * FROM plan_notes WHERE plan_id = ? ORDER BY created_at',
    [planId]
  );
}

export function deletePlanNote(id: string): void {
  run('DELETE FROM plan_notes WHERE id = ?', [id]);
}
