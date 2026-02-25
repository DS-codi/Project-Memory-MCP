/**
 * Integration tests:
 *   - archivePlan: verifies rows move from live tables to _archive tables
 *   - markCurrentDoneAndGetNext: verifies step progression logic
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  teardownTestDb,
  makeWorkspace,
  makePlan,
  makePhase,
  makeStep,
} from './fixtures.js';

import { getDb } from '../../db/connection.js';
import { archivePlan, getPlan } from '../../db/plan-db.js';
import { getPhase } from '../../db/phase-db.js';
import { getStep, getAllSteps, updateStep, markCurrentDoneAndGetNext } from '../../db/step-db.js';
import { createSession, getSession } from '../../db/session-db.js';

// ── Helper ───────────────────────────────────────────────────────────────────

function countRows(table: string, planId: string): number {
  const db  = getDb();
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE plan_id = ?`).get(planId) as { n: number };
  return row.n;
}

// ── archivePlan ───────────────────────────────────────────────────────────────

describe('archivePlan', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('moves plan rows into archive tables and removes them from live tables', () => {
    const ws   = makeWorkspace();
    const plan = makePlan(ws.id, { title: 'Archive Me' });
    const ph1  = makePhase(plan.id, 'Setup');
    const ph2  = makePhase(plan.id, 'Impl');
    makeStep(ph1.id, 'Install');
    makeStep(ph1.id, 'Configure');
    makeStep(ph2.id, 'Write code');
    const session = createSession(plan.id, { agent_type: 'Executor' });

    // Pre-condition: rows exist in live tables
    expect(getPlan(plan.id)).not.toBeNull();
    expect(getPhase(ph1.id)).not.toBeNull();
    expect(countRows('steps', plan.id)).toBe(3);
    expect(countRows('sessions', plan.id)).toBe(1);

    archivePlan(plan.id);

    // Post-condition: live tables have no entries for this plan
    expect(getPlan(plan.id)).toBeNull();
    expect(getPhase(ph1.id)).toBeNull();
    expect(getPhase(ph2.id)).toBeNull();
    expect(countRows('steps', plan.id)).toBe(0);
    expect(countRows('sessions', plan.id)).toBe(0);

    // Archive tables now have the rows
    const db = getDb();

    const archivedPlan = db
      .prepare('SELECT * FROM plans_archive WHERE id = ?')
      .get(plan.id) as { title: string } | undefined;
    expect(archivedPlan?.title).toBe('Archive Me');

    const archivedSteps = db
      .prepare('SELECT COUNT(*) AS n FROM steps_archive WHERE plan_id = ?')
      .get(plan.id) as { n: number };
    expect(archivedSteps.n).toBe(3);

    const archivedSessions = db
      .prepare('SELECT COUNT(*) AS n FROM sessions_archive WHERE plan_id = ?')
      .get(plan.id) as { n: number };
    expect(archivedSessions.n).toBe(1);
  });

  it('is idempotent — archiving an already-archived plan does not throw', () => {
    const ws   = makeWorkspace();
    const plan = makePlan(ws.id);
    makePhase(plan.id, 'P');

    archivePlan(plan.id);
    // Second archive should not throw
    expect(() => archivePlan(plan.id)).not.toThrow();
  });

  it('does not affect rows belonging to other plans', () => {
    const ws    = makeWorkspace();
    const keep  = makePlan(ws.id, { title: 'Keep Me' });
    const gone  = makePlan(ws.id, { title: 'Archive Me' });

    const phKeep = makePhase(keep.id, 'K');
    makeStep(phKeep.id, 'Important step');

    const phGone = makePhase(gone.id, 'G');
    makeStep(phGone.id, 'Disposable step');

    archivePlan(gone.id);

    // Plan "keep" is untouched
    expect(getPlan(keep.id)).not.toBeNull();
    expect(countRows('steps', keep.id)).toBe(1);
    expect(getStep(getAllSteps(keep.id)[0]!.id)).not.toBeNull();
  });
});

// ── markCurrentDoneAndGetNext ─────────────────────────────────────────────────

describe('markCurrentDoneAndGetNext', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('marks the current step done and returns the next pending step', () => {
    const ws   = makeWorkspace();
    const plan = makePlan(ws.id);
    const ph   = makePhase(plan.id, 'Phase 1');
    const s1   = makeStep(ph.id, 'Step 1');
    const s2   = makeStep(ph.id, 'Step 2');
    const s3   = makeStep(ph.id, 'Step 3');

    // Mark s1 active first (mirrors typical usage)
    updateStep(s1.id, { status: 'active' });

    const result = markCurrentDoneAndGetNext(plan.id, s1.id, 'Executor');

    // Completed step is done
    expect(result.completed.id).toBe(s1.id);
    expect(result.completed.status).toBe('done');
    expect(result.completed.completed_at).toBeTruthy();
    expect(result.completed.completed_by_agent).toBe('Executor');

    // Next step is the first remaining pending step
    expect(result.next).not.toBeNull();
    expect(result.next!.id).toBe(s2.id);
    expect(result.next!.status).toBe('pending');
  });

  it('returns null as next when the completed step is the last', () => {
    const ws   = makeWorkspace();
    const plan = makePlan(ws.id);
    const ph   = makePhase(plan.id, 'Only Phase');
    const s1   = makeStep(ph.id, 'The only step');

    updateStep(s1.id, { status: 'active' });
    const result = markCurrentDoneAndGetNext(plan.id, s1.id, 'Executor');

    expect(result.completed.id).toBe(s1.id);
    expect(result.completed.status).toBe('done');
    expect(result.next).toBeNull();
  });

  it('skips already-done steps when finding next', () => {
    const ws   = makeWorkspace();
    const plan = makePlan(ws.id);
    const ph   = makePhase(plan.id, 'P');
    const s1   = makeStep(ph.id, 'A');
    const s2   = makeStep(ph.id, 'B (already done)');
    const s3   = makeStep(ph.id, 'C');

    // Pre-complete s2
    updateStep(s2.id, { status: 'done' });
    updateStep(s1.id, { status: 'active' });

    const result = markCurrentDoneAndGetNext(plan.id, s1.id, 'Executor');

    expect(result.completed.id).toBe(s1.id);
    // s2 is already done, so next should be s3
    expect(result.next?.id).toBe(s3.id);
  });

  it('persists the completed_at timestamp to the DB', () => {
    const ws   = makeWorkspace();
    const plan = makePlan(ws.id);
    const ph   = makePhase(plan.id, 'P');
    const s1   = makeStep(ph.id, 'Task');

    updateStep(s1.id, { status: 'active' });
    markCurrentDoneAndGetNext(plan.id, s1.id, 'Tester');

    const row = getStep(s1.id);
    expect(row?.status).toBe('done');
    expect(typeof row?.completed_at).toBe('string');
    expect(row?.completed_at).not.toBeNull();
  });
});
