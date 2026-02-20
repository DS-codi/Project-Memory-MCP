/**
 * Tests for program-migration.ts — migrating legacy PlanState programs to v2 ProgramState.
 *
 * Uses a temp directory per test to exercise real file I/O.
 * Mocks getDataRoot and file-lock for test isolation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Mock getDataRoot before importing modules
vi.mock('../../storage/workspace-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage/workspace-utils.js')>();
  return {
    ...actual,
    getDataRoot: vi.fn(),
  };
});

// Mock file-lock to bypass proper-lockfile in tests
vi.mock('../../storage/file-lock.js', async () => {
  const fsPromises = (await import('fs')).promises;
  const pathMod = await import('path');

  async function readJson<T>(filePath: string): Promise<T | null> {
    try {
      const content = await fsPromises.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  async function writeJson<T>(filePath: string, data: T): Promise<void> {
    await fsPromises.mkdir(pathMod.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async function modifyJsonLocked<T>(
    filePath: string,
    modifier: (data: T | null) => T | Promise<T>,
  ): Promise<T> {
    const data = await readJson<T>(filePath);
    const modified = await modifier(data);
    await writeJson(filePath, modified);
    return modified;
  }

  return {
    readJson,
    writeJson,
    modifyJsonLocked,
    writeJsonLocked: writeJson,
    fileLockManager: { withLock: (_: string, op: () => Promise<unknown>) => op() },
  };
});

// Mock event emitter
vi.mock('../../events/event-emitter.js', () => ({
  events: {
    programCreated: vi.fn().mockResolvedValue(undefined),
    programUpdated: vi.fn().mockResolvedValue(undefined),
    programArchived: vi.fn().mockResolvedValue(undefined),
  },
}));

import { getDataRoot } from '../../storage/workspace-utils.js';
import { migratePrograms } from '../../tools/program/program-migration.js';
import { readProgramState, readManifest, readDependencies, readRisks } from '../../storage/program-store.js';
import type { PlanState } from '../../types/plan.types.js';

const WORKSPACE_ID = 'test-workspace-migration';

let tmpDir: string;

// Helper: mock the workspace registration check so savePlanState doesn't fail
async function setupWorkspace(): Promise<void> {
  const wsDir = path.join(tmpDir, WORKSPACE_ID);
  const plansDir = path.join(wsDir, 'plans');
  await fs.mkdir(plansDir, { recursive: true });
  // Create workspace.meta.json to pass assertWorkspaceRegistered (needs workspace_id field)
  await fs.writeFile(
    path.join(wsDir, 'workspace.meta.json'),
    JSON.stringify({ workspace_id: WORKSPACE_ID, registered_at: new Date().toISOString() }),
    'utf-8'
  );
}

// Helper: write a PlanState JSON to the plans directory
async function writePlan(plan: PlanState): Promise<void> {
  const planDir = path.join(tmpDir, WORKSPACE_ID, 'plans', plan.id);
  await fs.mkdir(planDir, { recursive: true });
  await fs.writeFile(
    path.join(planDir, 'state.json'),
    JSON.stringify(plan, null, 2),
    'utf-8'
  );
}

// Helper: read a plan state after migration
async function readPlan(planId: string): Promise<PlanState | null> {
  const filePath = path.join(tmpDir, WORKSPACE_ID, 'plans', planId, 'state.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as PlanState;
  } catch {
    return null;
  }
}

function makePlan(overrides: Partial<PlanState> & { id: string }): PlanState {
  return {
    workspace_id: WORKSPACE_ID,
    title: 'Test Plan',
    description: 'A test plan',
    priority: 'medium',
    category: 'feature',
    status: 'active',
    current_phase: 'Phase 1',
    current_agent: 'Executor',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    agent_sessions: [],
    lineage: [],
    steps: [],
    ...overrides,
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-prog-migration-'));
  vi.mocked(getDataRoot).mockReturnValue(tmpDir);
  vi.clearAllMocks();
  await setupWorkspace();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// =============================================================================
// migratePrograms
// =============================================================================

describe('migratePrograms', () => {
  it('returns empty report when no legacy programs exist', async () => {
    // Write some normal plans (no is_program flag)
    await writePlan(makePlan({ id: 'plan_normal_1', title: 'Normal Plan 1' }));
    await writePlan(makePlan({ id: 'plan_normal_2', title: 'Normal Plan 2' }));

    const report = await migratePrograms(WORKSPACE_ID);

    expect(report.workspace_id).toBe(WORKSPACE_ID);
    expect(report.plans_scanned).toBe(2);
    expect(report.programs_found).toBe(0);
    expect(report.programs_migrated).toBe(0);
    expect(report.programs_skipped).toBe(0);
    expect(report.entries).toHaveLength(0);
  });

  it('migrates a legacy program with child plans', async () => {
    const childA = makePlan({ id: 'plan_child_a', title: 'Child A' });
    const childB = makePlan({ id: 'plan_child_b', title: 'Child B' });
    const program = makePlan({
      id: 'plan_program_1',
      title: 'My Program',
      description: 'A program container',
      is_program: true,
      child_plan_ids: ['plan_child_a', 'plan_child_b'],
    });

    await writePlan(childA);
    await writePlan(childB);
    await writePlan(program);

    const report = await migratePrograms(WORKSPACE_ID);

    expect(report.programs_found).toBe(1);
    expect(report.programs_migrated).toBe(1);
    expect(report.programs_skipped).toBe(0);
    expect(report.entries).toHaveLength(1);

    const entry = report.entries[0];
    expect(entry.old_plan_id).toBe('plan_program_1');
    expect(entry.title).toBe('My Program');
    expect(entry.child_plan_ids).toEqual(['plan_child_a', 'plan_child_b']);
    expect(entry.skipped).toBe(false);

    // Verify ProgramState was created
    const programState = await readProgramState(WORKSPACE_ID, entry.new_program_id);
    expect(programState).not.toBeNull();
    expect(programState!.title).toBe('My Program');
    expect(programState!.description).toBe('A program container');
    expect(programState!.status).toBe('active');

    // Verify manifest was created with child plan IDs
    const manifest = await readManifest(WORKSPACE_ID, entry.new_program_id);
    expect(manifest).not.toBeNull();
    expect(manifest!.plan_ids).toEqual(['plan_child_a', 'plan_child_b']);

    // Verify risks.json was initialized empty
    const risks = await readRisks(WORKSPACE_ID, entry.new_program_id);
    expect(risks).toEqual([]);

    // Verify old PlanState was cleaned up
    const updatedProgram = await readPlan('plan_program_1');
    expect(updatedProgram).not.toBeNull();
    expect(updatedProgram!.is_program).toBeUndefined();
    expect(updatedProgram!.child_plan_ids).toBeUndefined();
    expect(updatedProgram!.program_id).toBe(entry.new_program_id);

    // Verify child plans got program_id set
    const updatedChildA = await readPlan('plan_child_a');
    expect(updatedChildA!.program_id).toBe(entry.new_program_id);
    const updatedChildB = await readPlan('plan_child_b');
    expect(updatedChildB!.program_id).toBe(entry.new_program_id);
  });

  it('migrates a program with depends_on_plans into dependencies', async () => {
    const child = makePlan({ id: 'plan_child_dep', title: 'Child' });
    const blocker = makePlan({ id: 'plan_blocker', title: 'Blocker Plan' });
    const program = makePlan({
      id: 'plan_prog_deps',
      title: 'Deps Program',
      is_program: true,
      child_plan_ids: ['plan_child_dep'],
      depends_on_plans: ['plan_blocker'],
    });

    await writePlan(child);
    await writePlan(blocker);
    await writePlan(program);

    const report = await migratePrograms(WORKSPACE_ID);

    expect(report.programs_migrated).toBe(1);

    const entry = report.entries[0];
    expect(entry.dependencies_created).toBeGreaterThan(0);

    // Verify dependencies were written
    const deps = await readDependencies(WORKSPACE_ID, entry.new_program_id);
    expect(deps.length).toBeGreaterThan(0);
    expect(deps[0].source_plan_id).toBe('plan_blocker');
    expect(deps[0].target_plan_id).toBe('plan_child_dep');
    expect(deps[0].type).toBe('blocks');
    expect(deps[0].status).toBe('pending');
  });

  it('is idempotent — running twice does not duplicate', async () => {
    const child = makePlan({ id: 'plan_idem_child', title: 'Idem Child' });
    const program = makePlan({
      id: 'plan_idem_prog',
      title: 'Idem Program',
      is_program: true,
      child_plan_ids: ['plan_idem_child'],
    });

    await writePlan(child);
    await writePlan(program);

    // First migration
    const report1 = await migratePrograms(WORKSPACE_ID);
    expect(report1.programs_migrated).toBe(1);
    const programId = report1.entries[0].new_program_id;

    // After first migration, re-read the updated plan (is_program cleared)
    // Running again should find 0 legacy programs since is_program was cleared
    const report2 = await migratePrograms(WORKSPACE_ID);
    expect(report2.programs_found).toBe(0);
    expect(report2.programs_migrated).toBe(0);
    expect(report2.programs_skipped).toBe(0);

    // ProgramState still exists from first migration
    const programState = await readProgramState(WORKSPACE_ID, programId);
    expect(programState).not.toBeNull();
    expect(programState!.title).toBe('Idem Program');
  });

  it('handles program with no children', async () => {
    const program = makePlan({
      id: 'plan_empty_prog',
      title: 'Empty Program',
      is_program: true,
      child_plan_ids: [],
    });

    await writePlan(program);

    const report = await migratePrograms(WORKSPACE_ID);

    expect(report.programs_migrated).toBe(1);

    const entry = report.entries[0];
    expect(entry.child_plan_ids).toEqual([]);
    expect(entry.dependencies_created).toBe(0);

    // Verify manifest has empty plan_ids
    const manifest = await readManifest(WORKSPACE_ID, entry.new_program_id);
    expect(manifest!.plan_ids).toEqual([]);
  });

  it('handles program with undefined child_plan_ids', async () => {
    const program = makePlan({
      id: 'plan_undef_children',
      title: 'No Children Field',
      is_program: true,
      // child_plan_ids left undefined
    });

    await writePlan(program);

    const report = await migratePrograms(WORKSPACE_ID);

    expect(report.programs_migrated).toBe(1);
    const entry = report.entries[0];
    expect(entry.child_plan_ids).toEqual([]);

    const manifest = await readManifest(WORKSPACE_ID, entry.new_program_id);
    expect(manifest!.plan_ids).toEqual([]);
  });

  it('reuses existing program_id when set on the legacy plan', async () => {
    const program = makePlan({
      id: 'plan_has_progid',
      title: 'Has Program ID',
      is_program: true,
      program_id: 'prog_existing_abc123',
      child_plan_ids: [],
    });

    await writePlan(program);

    const report = await migratePrograms(WORKSPACE_ID);

    expect(report.programs_migrated).toBe(1);
    expect(report.entries[0].new_program_id).toBe('prog_existing_abc123');
  });

  it('skips programs whose ProgramState already exists (manual idempotency)', async () => {
    // Pre-create a ProgramState so the migration should skip
    const programId = 'prog_already_exists';
    const programDir = path.join(tmpDir, WORKSPACE_ID, 'programs', programId);
    await fs.mkdir(programDir, { recursive: true });
    await fs.writeFile(
      path.join(programDir, 'program.json'),
      JSON.stringify({
        id: programId,
        workspace_id: WORKSPACE_ID,
        title: 'Pre-existing',
        description: 'Already migrated',
        priority: 'medium',
        category: 'feature',
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      }),
      'utf-8'
    );

    // Legacy plan pointing at this program_id
    const program = makePlan({
      id: 'plan_skip_prog',
      title: 'Should Skip',
      is_program: true,
      program_id: programId,
      child_plan_ids: [],
    });
    await writePlan(program);

    const report = await migratePrograms(WORKSPACE_ID);

    expect(report.programs_found).toBe(1);
    expect(report.programs_migrated).toBe(0);
    expect(report.programs_skipped).toBe(1);
    expect(report.entries[0].skipped).toBe(true);
    expect(report.entries[0].skip_reason).toContain('already exists');
  });

  it('migrates multiple programs in one call', async () => {
    const progA = makePlan({
      id: 'plan_multi_a',
      title: 'Multi A',
      is_program: true,
      child_plan_ids: [],
    });
    const progB = makePlan({
      id: 'plan_multi_b',
      title: 'Multi B',
      is_program: true,
      child_plan_ids: [],
    });

    await writePlan(progA);
    await writePlan(progB);

    const report = await migratePrograms(WORKSPACE_ID);

    expect(report.programs_found).toBe(2);
    expect(report.programs_migrated).toBe(2);
    expect(report.entries).toHaveLength(2);
  });

  it('preserves archived status in migrated ProgramState', async () => {
    const program = makePlan({
      id: 'plan_archived_prog',
      title: 'Archived Program',
      status: 'archived',
      is_program: true,
      child_plan_ids: [],
    });

    await writePlan(program);

    const report = await migratePrograms(WORKSPACE_ID);
    expect(report.programs_migrated).toBe(1);

    const programState = await readProgramState(WORKSPACE_ID, report.entries[0].new_program_id);
    expect(programState!.status).toBe('archived');
  });

  it('returns correct plans_scanned count including non-program plans', async () => {
    await writePlan(makePlan({ id: 'plan_norm_1' }));
    await writePlan(makePlan({ id: 'plan_norm_2' }));
    await writePlan(makePlan({ id: 'plan_norm_3' }));
    await writePlan(makePlan({
      id: 'plan_prog_scan',
      is_program: true,
      child_plan_ids: [],
    }));

    const report = await migratePrograms(WORKSPACE_ID);

    expect(report.plans_scanned).toBe(4);
    expect(report.programs_found).toBe(1);
    expect(report.programs_migrated).toBe(1);
  });
});
