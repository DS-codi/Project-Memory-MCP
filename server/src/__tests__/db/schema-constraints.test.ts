/**
 * Schema smoke tests for Plan 3.5 changes.
 *
 * Verifies:
 *  1. programs table — new columns, CHECK constraints
 *  2. program_plans join table — unique constraint, FK behaviour
 *  3. program_risks table — CHECK constraints on risk_type and severity
 *  4. plans table — new columns present, goals/success_criteria default to '[]',
 *     is_program and parent_plan_id columns removed
 *  5. dependencies — dep_type / dep_status CHECK constraints
 *  6. plans.program_id → programs.id FK with ON DELETE SET NULL
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, makeWorkspace } from './fixtures.js';
import { getDb } from '../../db/connection.js';
import { createProgram, addPlanToProgram, deleteProgram } from '../../db/program-db.js';
import { addRisk, getRisks } from '../../db/program-risks-db.js';
import { addDependency, markDependencySatisfied } from '../../db/dependency-db.js';
import { createPlan, getPlan } from '../../db/plan-db.js';
import { newId, nowIso } from '../../db/query-helpers.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Run a statement and expect it to throw a SQLite constraint error. */
function expectConstraintViolation(sql: string, params: unknown[] = []) {
  const db = getDb();
  expect(() => db.prepare(sql).run(...params)).toThrow();
}

// ---------------------------------------------------------------------------
// programs table
// ---------------------------------------------------------------------------

describe('schema — programs table', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('inserts a program with all new columns', () => {
    const ws = makeWorkspace();
    const prog = createProgram(ws.id, {
      title: 'My Program',
      description: 'Test',
      goals: ['goal 1'],
      success_criteria: ['success 1'],
      source: 'v2',
    });
    expect(prog.schema_version).toBe('2.0');
    expect(prog.goals).toBe(JSON.stringify(['goal 1']));
    expect(prog.success_criteria).toBe(JSON.stringify(['success 1']));
    expect(prog.source).toBe('v2');
    expect(prog.archived_at).toBeNull();
  });

  it('defaults schema_version to 2.0 when omitted', () => {
    const ws = makeWorkspace();
    const db = getDb();
    const id = newId();
    db.prepare(`
      INSERT INTO programs (id, workspace_id, title, description, category, priority, status, created_at, updated_at)
      VALUES (?, ?, 'Prog', 'Desc', 'feature', 'medium', 'active', ?, ?)
    `).run(id, ws.id, nowIso(), nowIso());

    const row = db.prepare('SELECT * FROM programs WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.schema_version).toBe('2.0');
    expect(row.goals).toBe('[]');
    expect(row.success_criteria).toBe('[]');
    expect(row.source).toBe('v2');
  });

  it('rejects invalid category on programs', () => {
    const ws = makeWorkspace();
    expectConstraintViolation(
      `INSERT INTO programs (id, workspace_id, title, description, category, priority, status, created_at, updated_at)
       VALUES (?, ?, 'P', 'D', 'invalid_cat', 'medium', 'active', ?, ?)`,
      [newId(), ws.id, nowIso(), nowIso()]
    );
  });

  it('rejects invalid priority on programs', () => {
    const ws = makeWorkspace();
    expectConstraintViolation(
      `INSERT INTO programs (id, workspace_id, title, description, category, priority, status, created_at, updated_at)
       VALUES (?, ?, 'P', 'D', 'feature', 'super_high', 'active', ?, ?)`,
      [newId(), ws.id, nowIso(), nowIso()]
    );
  });

  it('rejects invalid source on programs', () => {
    const ws = makeWorkspace();
    expectConstraintViolation(
      `INSERT INTO programs (id, workspace_id, title, description, category, priority, status, source, created_at, updated_at)
       VALUES (?, ?, 'P', 'D', 'feature', 'medium', 'active', 'unknown', ?, ?)`,
      [newId(), ws.id, nowIso(), nowIso()]
    );
  });
});

// ---------------------------------------------------------------------------
// program_plans join table
// ---------------------------------------------------------------------------

describe('schema — program_plans join table', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('links a plan to a program and enforces uniqueness', () => {
    const ws = makeWorkspace();
    const prog = createProgram(ws.id, { title: 'P', description: 'D' });
    const plan = createPlan({ workspace_id: ws.id, title: 'Child', description: 'C', category: 'feature' });

    addPlanToProgram(prog.id, plan.id);

    const db = getDb();
    const rows = db.prepare('SELECT * FROM program_plans WHERE program_id = ?').all(prog.id) as unknown[];
    expect(rows).toHaveLength(1);

    // Duplicate insert should throw
    expectConstraintViolation(
      'INSERT INTO program_plans (program_id, plan_id, order_index, added_at) VALUES (?, ?, 1, ?)',
      [prog.id, plan.id, nowIso()]
    );
  });

  it('cascades delete when program is removed', () => {
    const ws = makeWorkspace();
    const prog = createProgram(ws.id, { title: 'P2', description: 'D2' });
    const plan = createPlan({ workspace_id: ws.id, title: 'C2', description: 'CC', category: 'feature' });

    addPlanToProgram(prog.id, plan.id);
    deleteProgram(prog.id);

    const db = getDb();
    const rows = db.prepare('SELECT * FROM program_plans WHERE program_id = ?').all(prog.id);
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// program_risks table
// ---------------------------------------------------------------------------

describe('schema — program_risks table', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('inserts a risk and retrieves it', () => {
    const ws = makeWorkspace();
    const prog = createProgram(ws.id, { title: 'P', description: 'D' });
    const risk = addRisk(prog.id, {
      risk_type: 'functional_conflict',
      severity: 'high',
      description: 'Plans A and B both write to the same config key',
      affected_plan_ids: '["plan_a","plan_b"]',
      mitigation: 'Coordinate write order via dependency',
    });

    expect(risk.id).toBeTruthy();
    expect(risk.risk_type).toBe('functional_conflict');
    expect(risk.severity).toBe('high');
    expect(risk.program_id).toBe(prog.id);

    const all = getRisks(prog.id);
    expect(all).toHaveLength(1);
  });

  it('rejects invalid risk_type', () => {
    const ws = makeWorkspace();
    const prog = createProgram(ws.id, { title: 'P2', description: 'D2' });
    expectConstraintViolation(
      `INSERT INTO program_risks (id, program_id, risk_type, severity, description, affected_plan_ids, created_at)
       VALUES (?, ?, 'bad_type', 'high', 'X', '[]', ?)`,
      [newId(), prog.id, nowIso()]
    );
  });

  it('rejects invalid severity', () => {
    const ws = makeWorkspace();
    const prog = createProgram(ws.id, { title: 'P3', description: 'D3' });
    expectConstraintViolation(
      `INSERT INTO program_risks (id, program_id, risk_type, severity, description, affected_plan_ids, created_at)
       VALUES (?, ?, 'dependency_risk', 'extreme', 'X', '[]', ?)`,
      [newId(), prog.id, nowIso()]
    );
  });
});

// ---------------------------------------------------------------------------
// plans table — new columns and removed columns
// ---------------------------------------------------------------------------

describe('schema — plans table new columns', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('goals and success_criteria default to [] not NULL', () => {
    const ws = makeWorkspace();
    const db = getDb();
    const id = newId();
    db.prepare(`
      INSERT INTO plans (id, workspace_id, title, description, category, priority, status,
                         schema_version, created_at, updated_at)
      VALUES (?, ?, 'Plan', 'Desc', 'feature', 'medium', 'active', '2.0', ?, ?)
    `).run(id, ws.id, nowIso(), nowIso());

    const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.goals).toBe('[]');
    expect(row.success_criteria).toBe('[]');
    expect(row.is_program).toBeUndefined();    // Column removed
    expect(row.parent_plan_id).toBeUndefined(); // Column removed
  });

  it('stores and retrieves deployment_context, confirmation_state, paused_at, completed_at', () => {
    const ws = makeWorkspace();
    const plan = createPlan({
      workspace_id: ws.id,
      title: 'Plan with new cols',
      description: 'D',
      category: 'feature',
    });

    const db = getDb();
    const ctx = JSON.stringify({ deployed_agent: 'Executor', deployed_by: 'Coordinator', reason: 'test', override_validation: false, deployed_at: nowIso() });
    const confState = JSON.stringify({ phases: {}, steps: {} });
    const pausedAt = nowIso();
    const completedAt = nowIso();

    db.prepare(`
      UPDATE plans
      SET deployment_context = ?,
          confirmation_state  = ?,
          paused_at           = ?,
          completed_at        = ?
      WHERE id = ?
    `).run(ctx, confState, pausedAt, completedAt, plan.id);

    const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(plan.id) as Record<string, unknown>;
    expect(row.deployment_context).toBe(ctx);
    expect(row.confirmation_state).toBe(confState);
    expect(row.paused_at).toBe(pausedAt);
    expect(row.completed_at).toBe(completedAt);
  });

  it('rejects invalid plan category', () => {
    const ws = makeWorkspace();
    expectConstraintViolation(
      `INSERT INTO plans (id, workspace_id, title, description, category, priority, status,
                          schema_version, created_at, updated_at)
       VALUES (?, ?, 'P', 'D', 'not_a_category', 'medium', 'active', '2.0', ?, ?)`,
      [newId(), ws.id, nowIso(), nowIso()]
    );
  });
});

// ---------------------------------------------------------------------------
// dependencies — dep_type / dep_status
// ---------------------------------------------------------------------------

describe('schema — dependencies dep_type and dep_status', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('defaults dep_type to blocks and dep_status to pending', () => {
    const ws = makeWorkspace();
    const planA = createPlan({ workspace_id: ws.id, title: 'A', description: 'A', category: 'feature' });
    const planB = createPlan({ workspace_id: ws.id, title: 'B', description: 'B', category: 'feature' });

    const dep = addDependency('plan', planA.id, 'plan', planB.id);
    expect(dep.dep_type).toBe('blocks');
    expect(dep.dep_status).toBe('pending');
    expect(typeof dep.id).toBe('number');
  });

  it('stores dep_type = informs', () => {
    const ws = makeWorkspace();
    const planA = createPlan({ workspace_id: ws.id, title: 'A2', description: '-', category: 'feature' });
    const planB = createPlan({ workspace_id: ws.id, title: 'B2', description: '-', category: 'feature' });

    const dep = addDependency('plan', planA.id, 'plan', planB.id, 'informs');
    expect(dep.dep_type).toBe('informs');
  });

  it('markDependencySatisfied sets dep_status to satisfied', () => {
    const ws = makeWorkspace();
    const planA = createPlan({ workspace_id: ws.id, title: 'A3', description: '-', category: 'feature' });
    const planB = createPlan({ workspace_id: ws.id, title: 'B3', description: '-', category: 'feature' });

    addDependency('plan', planA.id, 'plan', planB.id);
    markDependencySatisfied('plan', planA.id, 'plan', planB.id);

    const db = getDb();
    const row = db.prepare(
      'SELECT dep_status FROM dependencies WHERE source_id = ? AND target_id = ?'
    ).get(planA.id, planB.id) as { dep_status: string } | undefined;
    expect(row?.dep_status).toBe('satisfied');
  });

  it('rejects invalid dep_type', () => {
    const ws = makeWorkspace();
    const planA = createPlan({ workspace_id: ws.id, title: 'A4', description: '-', category: 'feature' });
    const planB = createPlan({ workspace_id: ws.id, title: 'B4', description: '-', category: 'feature' });
    expectConstraintViolation(
      `INSERT INTO dependencies (source_type, source_id, target_type, target_id, dep_type)
       VALUES ('plan', ?, 'plan', ?, 'causes')`,
      [planA.id, planB.id]
    );
  });

  it('rejects invalid dep_status', () => {
    const ws = makeWorkspace();
    const planA = createPlan({ workspace_id: ws.id, title: 'A5', description: '-', category: 'feature' });
    const planB = createPlan({ workspace_id: ws.id, title: 'B5', description: '-', category: 'feature' });
    expectConstraintViolation(
      `INSERT INTO dependencies (source_type, source_id, target_type, target_id, dep_type, dep_status)
       VALUES ('plan', ?, 'plan', ?, 'blocks', 'done')`,
      [planA.id, planB.id]
    );
  });
});

// ---------------------------------------------------------------------------
// FK: plans.program_id → programs.id ON DELETE SET NULL
// ---------------------------------------------------------------------------

describe('schema — plans.program_id FK ON DELETE SET NULL', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('clears plan.program_id when the program is deleted', () => {
    const ws = makeWorkspace();
    const prog = createProgram(ws.id, { title: 'P', description: 'D' });
    const plan = createPlan({ workspace_id: ws.id, title: 'Child', description: 'C', category: 'feature' });

    addPlanToProgram(prog.id, plan.id);

    // Verify the FK is set
    const before = getPlan(plan.id);
    expect(before?.program_id).toBe(prog.id);

    // Delete the program — FK should null out plans.program_id
    deleteProgram(prog.id);

    const after = getPlan(plan.id);
    expect(after?.program_id).toBeNull();
  });
});
