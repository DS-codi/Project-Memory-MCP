/**
 * Integration tests for the plan_workflow_settings table and
 * the three query helpers: getWorkflowMode, setWorkflowMode, deleteWorkflowMode.
 *
 * Coverage:
 *   1. setWorkflowMode creates a row; getWorkflowMode retrieves it.
 *   2. deleteWorkflowMode (application-level cleanup) removes the row.
 *   3. SQLite trigger (trg_delete_workflow_settings) cleans up on plan DELETE.
 *   4. getWorkflowMode returns undefined when no row exists.
 *   5. setWorkflowMode upserts: second call updates, not inserts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, makeWorkspace, makePlan } from './fixtures.js';
import { getDb }                                                 from '../../db/connection.js';
import { archivePlan as dbArchivePlan }                         from '../../db/plan-db.js';
import {
  getWorkflowMode,
  setWorkflowMode,
  deleteWorkflowMode,
}                                                               from '../../db/plan-db.js';

// ── Helper ────────────────────────────────────────────────────────────────────

function countWorkflowRows(planId: string): number {
  const db = getDb();
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM plan_workflow_settings WHERE plan_id = ?')
    .get(planId) as { n: number };
  return row.n;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('workflow-mode DB helpers', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('setWorkflowMode creates a row; getWorkflowMode retrieves it', () => {
    const ws   = makeWorkspace();
    const plan = makePlan(ws.id);

    expect(getWorkflowMode(plan.id)).toBeUndefined();

    setWorkflowMode(plan.id, 'tdd');

    const row = getWorkflowMode(plan.id);
    expect(row).toBeDefined();
    expect(row!.plan_id).toBe(plan.id);
    expect(row!.workflow_mode).toBe('tdd');
    expect(row!.set_at).toBeTruthy();
    expect(row!.updated_at).toBeTruthy();
  });

  it('deleteWorkflowMode (application-level cleanup) removes the row', () => {
    const ws   = makeWorkspace();
    const plan = makePlan(ws.id);

    setWorkflowMode(plan.id, 'overnight');
    expect(countWorkflowRows(plan.id)).toBe(1);

    deleteWorkflowMode(plan.id);
    expect(countWorkflowRows(plan.id)).toBe(0);
    expect(getWorkflowMode(plan.id)).toBeUndefined();
  });

  it('SQLite trigger cleans up plan_workflow_settings on plan DELETE', () => {
    const ws   = makeWorkspace();
    const plan = makePlan(ws.id);

    setWorkflowMode(plan.id, 'enrichment');
    expect(countWorkflowRows(plan.id)).toBe(1);

    // dbArchivePlan physically DELETEs the plan from the plans table,
    // which fires trg_delete_workflow_settings.
    dbArchivePlan(plan.id);

    expect(countWorkflowRows(plan.id)).toBe(0);
  });

  it('getWorkflowMode returns undefined when no row exists', () => {
    const ws   = makeWorkspace();
    const plan = makePlan(ws.id);

    expect(getWorkflowMode(plan.id)).toBeUndefined();
  });

  it('setWorkflowMode upserts: second call updates mode, does not insert a new row', () => {
    const ws   = makeWorkspace();
    const plan = makePlan(ws.id);

    setWorkflowMode(plan.id, 'standard');
    const first = getWorkflowMode(plan.id)!;
    expect(first.workflow_mode).toBe('standard');

    setWorkflowMode(plan.id, 'tdd');
    const second = getWorkflowMode(plan.id)!;
    expect(second.workflow_mode).toBe('tdd');

    // Check only one row exists
    expect(countWorkflowRows(plan.id)).toBe(1);

    // id should be the same (upsert preserves the row)
    expect(second.id).toBe(first.id);

    // set_at is preserved; updated_at may have changed
    expect(second.set_at).toBe(first.set_at);
  });
});
