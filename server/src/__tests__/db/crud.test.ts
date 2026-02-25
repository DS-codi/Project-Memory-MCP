/**
 * Tests: CRUD operations for workspace, plan, phase, step, session,
 *        lineage, context, knowledge, and build scripts.
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

import { getWorkspace, listWorkspaces, updateWorkspace, deleteWorkspace } from '../../db/workspace-db.js';
import { getPlan, getPlansByWorkspace, updatePlan, deletePlan } from '../../db/plan-db.js';
import { getPhase, getPhases, updatePhase, deletePhase } from '../../db/phase-db.js';
import { getStep, getAllSteps, updateStep } from '../../db/step-db.js';
import { createSession, getSession, getSessions, completeSession } from '../../db/session-db.js';
import { addLineageEntry, getLineage } from '../../db/lineage-db.js';
import { storeContext, getContext, searchContext } from '../../db/context-db.js';
import { appendResearch, getResearch, listResearch } from '../../db/research-db.js';
import { storeKnowledge, getKnowledge, listKnowledge } from '../../db/knowledge-db.js';
import { addBuildScript, getBuildScripts, deleteBuildScript } from '../../db/build-script-db.js';
import { addDependency, getDependencies, getDependents, checkCycle } from '../../db/dependency-db.js';

// ── Workspace CRUD ───────────────────────────────────────────────────────────

describe('workspace-db', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('creates and retrieves a workspace', () => {
    const ws = makeWorkspace({ name: 'my-project', path: '/home/user/my-project' });
    expect(ws.id).toBeTruthy();
    expect(ws.name).toBe('my-project');
    expect(ws.path).toBe('/home/user/my-project');

    const fetched = getWorkspace(ws.id);
    expect(fetched?.id).toBe(ws.id);
    expect(fetched?.name).toBe('my-project');
  });

  it('lists workspaces', () => {
    const ws = makeWorkspace();
    const all = listWorkspaces();
    expect(all.some(w => w.id === ws.id)).toBe(true);
  });

  it('updates a workspace', () => {
    const ws = makeWorkspace();
    updateWorkspace(ws.id, { name: 'updated-name' });
    const updated = getWorkspace(ws.id);
    expect(updated?.name).toBe('updated-name');
  });

  it('deletes a workspace', () => {
    const ws = makeWorkspace();
    deleteWorkspace(ws.id);
    expect(getWorkspace(ws.id)).toBeNull();
  });
});

// ── Plan CRUD ────────────────────────────────────────────────────────────────

describe('plan-db', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('creates and retrieves a plan', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id, { title: 'My Feature Plan' });
    expect(plan.id).toBeTruthy();
    expect(plan.title).toBe('My Feature Plan');
    expect(plan.workspace_id).toBe(ws.id);
    expect(plan.status).toBe('active');

    const fetched = getPlan(plan.id);
    expect(fetched?.id).toBe(plan.id);
  });

  it('lists plans by workspace', () => {
    const ws = makeWorkspace();
    const p1 = makePlan(ws.id);
    const p2 = makePlan(ws.id);
    const plans = getPlansByWorkspace(ws.id);
    const ids = plans.map(p => p.id);
    expect(ids).toContain(p1.id);
    expect(ids).toContain(p2.id);
  });

  it('updates a plan title', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);
    updatePlan(plan.id, { title: 'Renamed Plan' });
    expect(getPlan(plan.id)?.title).toBe('Renamed Plan');
  });

  it('deletes a plan', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);
    deletePlan(plan.id);
    expect(getPlan(plan.id)).toBeNull();
  });
});

// ── Phase CRUD ───────────────────────────────────────────────────────────────

describe('phase-db', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('creates phases and retrieves them by plan', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);
    const ph1 = makePhase(plan.id, 'Phase 1: Setup');
    const ph2 = makePhase(plan.id, 'Phase 2: Implementation');

    const phases = getPhases(plan.id);
    const names  = phases.map(p => p.name);
    expect(names).toContain('Phase 1: Setup');
    expect(names).toContain('Phase 2: Implementation');
  });

  it('assigns sequential order_index', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);
    makePhase(plan.id, 'Seq-A');
    makePhase(plan.id, 'Seq-B');
    makePhase(plan.id, 'Seq-C');
    const phases = getPhases(plan.id).filter(p => p.name.startsWith('Seq-'));
    expect(phases.map(p => p.order_index)).toEqual([0, 1, 2]);
  });

  it('updates a phase name', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);
    const ph = makePhase(plan.id, 'Old Name');
    updatePhase(ph.id, { name: 'New Name' });
    expect(getPhase(ph.id)?.name).toBe('New Name');
  });

  it('deletes a phase', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);
    const ph = makePhase(plan.id, 'To Delete');
    deletePhase(ph.id);
    expect(getPhase(ph.id)).toBeNull();
  });
});

// ── Step CRUD ────────────────────────────────────────────────────────────────

describe('step-db', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('creates steps in a phase', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);
    const ph = makePhase(plan.id, 'Phase 1');
    const s1 = makeStep(ph.id, 'Install deps');
    const s2 = makeStep(ph.id, 'Write code');
    expect(s1.task).toBe('Install deps');
    expect(s2.task).toBe('Write code');
    expect(s1.plan_id).toBe(plan.id);
    expect(s1.status).toBe('pending');
  });

  it('lists all steps for a plan', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);
    const ph = makePhase(plan.id, 'P1');
    makeStep(ph.id, 'Step A');
    makeStep(ph.id, 'Step B');

    const steps = getAllSteps(plan.id);
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.some(s => s.task === 'Step A')).toBe(true);
  });

  it('updates step status', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);
    const ph = makePhase(plan.id, 'P1');
    const step = makeStep(ph.id, 'A task');

    updateStep(step.id, { status: 'active' });
    expect(getStep(step.id)?.status).toBe('active');

    updateStep(step.id, { status: 'done', notes: 'Completed' });
    const done = getStep(step.id);
    expect(done?.status).toBe('done');
    expect(done?.notes).toBe('Completed');
  });

  it('FK constraint prevents step creation with invalid phase', () => {
    expect(() => {
      makeStep('nonexistent-phase-id', 'Bad step');
    }).toThrow();
  });
});

// ── Session CRUD ─────────────────────────────────────────────────────────────

describe('session-db', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('creates and retrieves a session', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);

    const session = createSession(plan.id, {
      agent_type: 'Executor',
      context:    { deployed_by: 'Coordinator' },
    });
    expect(session.id).toBeTruthy();
    expect(session.agent_type).toBe('Executor');

    const fetched = getSession(session.id);
    expect(fetched?.id).toBe(session.id);
  });

  it('completes a session', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);
    const session = createSession(plan.id, { agent_type: 'Reviewer' });

    completeSession(session.id, 'Review done', ['src/foo.ts']);
    const completed = getSession(session.id);
    expect(completed?.summary).toBe('Review done');
    expect(completed?.completed_at).toBeTruthy();
  });

  it('lists sessions for a plan', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);
    createSession(plan.id, { agent_type: 'Coordinator' });
    createSession(plan.id, { agent_type: 'Executor' });

    const sessions = getSessions(plan.id);
    expect(sessions.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Lineage ──────────────────────────────────────────────────────────────────

describe('lineage-db', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('records and retrieves lineage entries', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);

    addLineageEntry(plan.id, {
      from_agent: 'Executor',
      to_agent:   'Coordinator',
      reason:     'Phase complete',
      data:       { recommendation: 'Reviewer' },
    });

    addLineageEntry(plan.id, {
      from_agent: 'Coordinator',
      to_agent:   'Reviewer',
      reason:     'Reviewing implementation',
    });

    const entries = getLineage(plan.id);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.from_agent).toBe('Executor');
    expect(entries[1]?.from_agent).toBe('Coordinator');
  });
});

// ── Context ──────────────────────────────────────────────────────────────────

describe('context-db', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('stores and retrieves plan-scoped context', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);

    storeContext('plan', plan.id, 'execution_log', { commands: ['npm install'] });
    const items = getContext('plan', plan.id, 'execution_log');
    expect(items).toHaveLength(1);
    expect(JSON.parse(items[0]!.data)).toMatchObject({ commands: ['npm install'] });
  });

  it('upserts context (same parent+type overwrites)', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);

    storeContext('plan', plan.id, 'notes', { note: 'v1' });
    storeContext('plan', plan.id, 'notes', { note: 'v2' });

    const items = getContext('plan', plan.id, 'notes');
    expect(items).toHaveLength(1);
    expect(JSON.parse(items[0]!.data)).toMatchObject({ note: 'v2' });
  });

  it('searches context by value', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);

    storeContext('plan', plan.id, 'design', { architecture: 'microservices' });
    storeContext('plan', plan.id, 'constraints', { limit: 'no-breaking-changes' });

    const results = searchContext('microservices', { parentType: 'plan', parentId: plan.id });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(r => r.type === 'design')).toBe(true);
  });
});

// ── Research ─────────────────────────────────────────────────────────────────

describe('research-db', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('appends and reads research documents', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);

    appendResearch(ws.id, 'plan', plan.id, 'analysis.md', '## Finding 1\n\nSome content.');
    const content = getResearch(ws.id, 'plan', plan.id, 'analysis.md');
    expect(content).toContain('Finding 1');
  });

  it('appends to existing research (adds newline separator)', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);

    appendResearch(ws.id, 'plan', plan.id, 'notes.md', 'Part 1');
    appendResearch(ws.id, 'plan', plan.id, 'notes.md', 'Part 2');
    const content = getResearch(ws.id, 'plan', plan.id, 'notes.md');
    expect(content).toContain('Part 1');
    expect(content).toContain('Part 2');
  });

  it('lists research files for workspace+plan', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);

    appendResearch(ws.id, 'plan', plan.id, 'file-a.md', 'content a');
    appendResearch(ws.id, 'plan', plan.id, 'file-b.md', 'content b');
    const filenames = listResearch(ws.id, 'plan', plan.id);
    expect(filenames).toContain('file-a.md');
    expect(filenames).toContain('file-b.md');
  });
});

// ── Knowledge ────────────────────────────────────────────────────────────────

describe('knowledge-db', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('stores and retrieves knowledge by slug', () => {
    const ws = makeWorkspace();
    storeKnowledge(ws.id, 'auth-patterns', 'Auth Patterns', { category: 'security', content: 'Use JWT' });
    const k = getKnowledge(ws.id, 'auth-patterns');
    expect(k?.title).toBe('Auth Patterns');
  });

  it('upserts knowledge on duplicate slug', () => {
    const ws = makeWorkspace();
    storeKnowledge(ws.id, 'my-key', 'Title v1', {});
    storeKnowledge(ws.id, 'my-key', 'Title v2', {});
    const k = getKnowledge(ws.id, 'my-key');
    expect(k?.title).toBe('Title v2');
  });

  it('lists knowledge for a workspace', () => {
    const ws = makeWorkspace();
    storeKnowledge(ws.id, 'doc-a', 'Doc A', {});
    storeKnowledge(ws.id, 'doc-b', 'Doc B', {});
    const all = listKnowledge(ws.id);
    const slugs = all.map(k => k.slug);
    expect(slugs).toContain('doc-a');
    expect(slugs).toContain('doc-b');
  });
});

// ── Build scripts ────────────────────────────────────────────────────────────

describe('build-script-db', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('adds and retrieves build scripts', () => {
    const ws = makeWorkspace();

    const script = addBuildScript(ws.id, {
      name:        'Build Server',
      command:     'npm run build',
      directory:   './server',
      description: 'Compile TypeScript server',
    });
    expect(script.id).toBeTruthy();
    expect(script.name).toBe('Build Server');

    const scripts = getBuildScripts(ws.id);
    expect(scripts.some(s => s.id === script.id)).toBe(true);
  });

  it('deletes a build script', () => {
    const ws = makeWorkspace();
    const script = addBuildScript(ws.id, { name: 'test', command: 'npm test', directory: '.' });
    deleteBuildScript(ws.id, script.id);
    const all = getBuildScripts(ws.id);
    expect(all.some(s => s.id === script.id)).toBe(false);
  });
});

// ── Dependencies ─────────────────────────────────────────────────────────────

describe('dependency-db', () => {
  beforeAll(() => setupTestDb());
  afterAll(() => teardownTestDb());

  it('adds and retrieves edges', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);
    const ph = makePhase(plan.id, 'P');
    const s1 = makeStep(ph.id, 'dep-step');
    const s2 = makeStep(ph.id, 'dependent-step');

    addDependency('step', s2.id, 'step', s1.id);
    const deps = getDependencies('step', s2.id);
    expect(deps.some(d => d.target_id === s1.id)).toBe(true);
  });

  it('detects a cycle before it is added', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);
    const ph = makePhase(plan.id, 'Cycle-P');
    const s1 = makeStep(ph.id, 'Cycle-A');
    const s2 = makeStep(ph.id, 'Cycle-B');
    const s3 = makeStep(ph.id, 'Cycle-C');

    // A → B → C  (no cycle yet)
    addDependency('step', s1.id, 'step', s2.id);
    addDependency('step', s2.id, 'step', s3.id);

    // C → A would create a cycle
    expect(checkCycle('step', s3.id, 'step', s1.id)).toBe(true);

    // A → C would not create a cycle
    expect(checkCycle('step', s1.id, 'step', s3.id)).toBe(false);
  });

  it('retrieves dependents', () => {
    const ws = makeWorkspace();
    const plan = makePlan(ws.id);
    const ph = makePhase(plan.id, 'Dep-P');
    const s1 = makeStep(ph.id, 'shared');
    const s2 = makeStep(ph.id, 'needs-s1-a');
    const s3 = makeStep(ph.id, 'needs-s1-b');

    addDependency('step', s2.id, 'step', s1.id);
    addDependency('step', s3.id, 'step', s1.id);

    const dependents = getDependents('step', s1.id);
    const sourceIds = dependents.map(d => d.source_id);
    expect(sourceIds).toContain(s2.id);
    expect(sourceIds).toContain(s3.id);
  });
});
