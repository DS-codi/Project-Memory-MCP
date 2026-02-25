/**
 * Program risk CRUD (program_risks table).
 *
 * Risks capture known conflicts, behavioral changes, or dependency hazards
 * that span multiple plans within a program.
 */

import type { ProgramRiskRow } from './types.js';
import { queryOne, queryAll, run, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AddRiskData = Omit<ProgramRiskRow, 'id' | 'program_id' | 'created_at'>;

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export function addRisk(programId: string, data: AddRiskData): ProgramRiskRow {
  const id  = newId();
  const now = nowIso();
  run(
    `INSERT INTO program_risks
      (id, program_id, risk_type, severity, description, affected_plan_ids, mitigation, created_at,
       title, risk_status, detected_by, source_plan_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      programId,
      data.risk_type,
      data.severity,
      data.description,
      data.affected_plan_ids ?? '[]',
      data.mitigation ?? null,
      now,
      data.title           ?? '',
      data.risk_status     ?? 'identified',
      data.detected_by     ?? 'manual',
      data.source_plan_id  ?? null,
      data.updated_at      ?? now,
    ]
  );
  return getRisk(id)!;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getRisk(id: string): ProgramRiskRow | null {
  return queryOne<ProgramRiskRow>('SELECT * FROM program_risks WHERE id = ?', [id]) ?? null;
}

export function getRisks(programId: string): ProgramRiskRow[] {
  return queryAll<ProgramRiskRow>(
    'SELECT * FROM program_risks WHERE program_id = ? ORDER BY severity DESC, created_at',
    [programId]
  );
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deleteRisk(riskId: string): void {
  run('DELETE FROM program_risks WHERE id = ?', [riskId]);
}

export function deleteRisksForProgram(programId: string): void {
  run('DELETE FROM program_risks WHERE program_id = ?', [programId]);
}
