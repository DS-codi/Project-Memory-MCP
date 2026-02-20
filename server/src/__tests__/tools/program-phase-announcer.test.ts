/**
 * Tests for program-phase-announcer.ts — Phase completion announcements
 * that satisfy cross-plan dependencies.
 *
 * Uses a temp directory per test for file I/O.
 * Mocks file-store.getPlanState for plan lookups.
 * Mocks event emitter to verify event calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { ProgramDependency } from '../../types/program-v2.types.js';

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

// Mock file-store for plan state lookups
vi.mock('../../storage/file-store.js', () => ({
  getPlanState: vi.fn(),
}));

// Mock event emitter
vi.mock('../../events/event-emitter.js', () => ({
  events: {
    programUpdated: vi.fn().mockResolvedValue(undefined),
  },
}));

import { getDataRoot } from '../../storage/workspace-utils.js';
import * as fileStore from '../../storage/file-store.js';
import { events } from '../../events/event-emitter.js';
import { saveDependencies } from '../../storage/program-store.js';
import { readDependencies } from '../../storage/program-store.js';
import { announcePhaseCompletion } from '../../tools/program/program-phase-announcer.js';

const WORKSPACE_ID = 'test-workspace-announcer';
const PROGRAM_ID = 'prog_test_announcer';
const PLAN_A = 'plan_a';
const PLAN_B = 'plan_b';
const PLAN_C = 'plan_c';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-prog-announcer-'));
  vi.mocked(getDataRoot).mockReturnValue(tmpDir);
  vi.clearAllMocks();

  // Ensure program directory exists
  const programDir = path.join(tmpDir, WORKSPACE_ID, 'programs', PROGRAM_ID);
  await fs.mkdir(programDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// =============================================================================
// announcePhaseCompletion
// =============================================================================

describe('announcePhaseCompletion', () => {
  it('returns early when plan has no program_id', async () => {
    vi.mocked(fileStore.getPlanState).mockResolvedValue({
      id: PLAN_A,
      workspace_id: WORKSPACE_ID,
      // No program_id
    } as any);

    const result = await announcePhaseCompletion(WORKSPACE_ID, PLAN_A, 'Phase 1');

    expect(result.in_program).toBe(false);
    expect(result.satisfied_dependencies).toEqual([]);
    expect(result.unblocked_plan_ids).toEqual([]);
    expect(events.programUpdated).not.toHaveBeenCalled();
  });

  it('returns early when plan is not found', async () => {
    vi.mocked(fileStore.getPlanState).mockResolvedValue(null);

    const result = await announcePhaseCompletion(WORKSPACE_ID, PLAN_A, 'Phase 1');

    expect(result.in_program).toBe(false);
    expect(result.satisfied_dependencies).toEqual([]);
  });

  it('returns early when no dependencies exist', async () => {
    vi.mocked(fileStore.getPlanState).mockResolvedValue({
      id: PLAN_A,
      workspace_id: WORKSPACE_ID,
      program_id: PROGRAM_ID,
    } as any);

    // Empty dependencies file
    const result = await announcePhaseCompletion(WORKSPACE_ID, PLAN_A, 'Phase 1');

    expect(result.in_program).toBe(true);
    expect(result.program_id).toBe(PROGRAM_ID);
    expect(result.satisfied_dependencies).toEqual([]);
    expect(result.unblocked_plan_ids).toEqual([]);
  });

  it('satisfies matching pending blocking dependency', async () => {
    vi.mocked(fileStore.getPlanState).mockResolvedValue({
      id: PLAN_A,
      workspace_id: WORKSPACE_ID,
      program_id: PROGRAM_ID,
    } as any);

    const deps: ProgramDependency[] = [
      makeDep('dep_1', PLAN_A, PLAN_B, 'blocks', 'Phase 1', undefined, 'pending'),
    ];
    await saveDependencies(WORKSPACE_ID, PROGRAM_ID, deps);

    const result = await announcePhaseCompletion(WORKSPACE_ID, PLAN_A, 'Phase 1');

    expect(result.satisfied_dependencies).toHaveLength(1);
    expect(result.satisfied_dependencies[0].status).toBe('satisfied');
    expect(result.satisfied_dependencies[0].satisfied_at).toBeDefined();

    // Verify persisted to disk
    const savedDeps = await readDependencies(WORKSPACE_ID, PROGRAM_ID);
    expect(savedDeps[0].status).toBe('satisfied');
  });

  it('does not satisfy already-satisfied dependencies', async () => {
    vi.mocked(fileStore.getPlanState).mockResolvedValue({
      id: PLAN_A,
      workspace_id: WORKSPACE_ID,
      program_id: PROGRAM_ID,
    } as any);

    const deps: ProgramDependency[] = [
      makeDep('dep_1', PLAN_A, PLAN_B, 'blocks', 'Phase 1', undefined, 'satisfied'),
    ];
    await saveDependencies(WORKSPACE_ID, PROGRAM_ID, deps);

    const result = await announcePhaseCompletion(WORKSPACE_ID, PLAN_A, 'Phase 1');

    expect(result.satisfied_dependencies).toHaveLength(0);
  });

  it('does not satisfy non-blocking (informs) dependencies', async () => {
    vi.mocked(fileStore.getPlanState).mockResolvedValue({
      id: PLAN_A,
      workspace_id: WORKSPACE_ID,
      program_id: PROGRAM_ID,
    } as any);

    const deps: ProgramDependency[] = [
      makeDep('dep_1', PLAN_A, PLAN_B, 'informs', 'Phase 1', undefined, 'pending'),
    ];
    await saveDependencies(WORKSPACE_ID, PROGRAM_ID, deps);

    const result = await announcePhaseCompletion(WORKSPACE_ID, PLAN_A, 'Phase 1');

    expect(result.satisfied_dependencies).toHaveLength(0);
  });

  it('satisfies deps with no source_phase (matches any phase)', async () => {
    vi.mocked(fileStore.getPlanState).mockResolvedValue({
      id: PLAN_A,
      workspace_id: WORKSPACE_ID,
      program_id: PROGRAM_ID,
    } as any);

    const deps: ProgramDependency[] = [
      makeDep('dep_1', PLAN_A, PLAN_B, 'blocks', undefined, undefined, 'pending'),
    ];
    await saveDependencies(WORKSPACE_ID, PROGRAM_ID, deps);

    const result = await announcePhaseCompletion(WORKSPACE_ID, PLAN_A, 'Any Phase Name');

    expect(result.satisfied_dependencies).toHaveLength(1);
  });

  it('does not satisfy deps from a different source plan', async () => {
    vi.mocked(fileStore.getPlanState).mockResolvedValue({
      id: PLAN_A,
      workspace_id: WORKSPACE_ID,
      program_id: PROGRAM_ID,
    } as any);

    const deps: ProgramDependency[] = [
      makeDep('dep_1', PLAN_B, PLAN_C, 'blocks', 'Phase 1', undefined, 'pending'),
    ];
    await saveDependencies(WORKSPACE_ID, PROGRAM_ID, deps);

    const result = await announcePhaseCompletion(WORKSPACE_ID, PLAN_A, 'Phase 1');

    expect(result.satisfied_dependencies).toHaveLength(0);
  });

  it('returns unblocked plan when all blocking deps are satisfied', async () => {
    vi.mocked(fileStore.getPlanState).mockResolvedValue({
      id: PLAN_A,
      workspace_id: WORKSPACE_ID,
      program_id: PROGRAM_ID,
    } as any);

    const deps: ProgramDependency[] = [
      // Two blocking deps on plan_b: one from plan_a (pending), one already satisfied
      makeDep('dep_1', PLAN_A, PLAN_B, 'blocks', 'Phase 1', undefined, 'pending'),
      makeDep('dep_2', PLAN_C, PLAN_B, 'blocks', 'Phase 1', undefined, 'satisfied'),
    ];
    await saveDependencies(WORKSPACE_ID, PROGRAM_ID, deps);

    const result = await announcePhaseCompletion(WORKSPACE_ID, PLAN_A, 'Phase 1');

    expect(result.unblocked_plan_ids).toEqual([PLAN_B]);
  });

  it('does not return plan as unblocked when other blocking deps remain pending', async () => {
    vi.mocked(fileStore.getPlanState).mockResolvedValue({
      id: PLAN_A,
      workspace_id: WORKSPACE_ID,
      program_id: PROGRAM_ID,
    } as any);

    const deps: ProgramDependency[] = [
      makeDep('dep_1', PLAN_A, PLAN_B, 'blocks', 'Phase 1', undefined, 'pending'),
      makeDep('dep_2', PLAN_C, PLAN_B, 'blocks', 'Phase 1', undefined, 'pending'),
    ];
    await saveDependencies(WORKSPACE_ID, PROGRAM_ID, deps);

    const result = await announcePhaseCompletion(WORKSPACE_ID, PLAN_A, 'Phase 1');

    // Only dep_1 is satisfied; dep_2 (from plan_c) is still pending
    expect(result.satisfied_dependencies).toHaveLength(1);
    expect(result.unblocked_plan_ids).toEqual([]);
  });

  it('emits programUpdated event for each satisfied dependency', async () => {
    vi.mocked(fileStore.getPlanState).mockResolvedValue({
      id: PLAN_A,
      workspace_id: WORKSPACE_ID,
      program_id: PROGRAM_ID,
    } as any);

    const deps: ProgramDependency[] = [
      makeDep('dep_1', PLAN_A, PLAN_B, 'blocks', 'Phase 1', undefined, 'pending'),
      makeDep('dep_2', PLAN_A, PLAN_C, 'blocks', 'Phase 1', undefined, 'pending'),
    ];
    await saveDependencies(WORKSPACE_ID, PROGRAM_ID, deps);

    await announcePhaseCompletion(WORKSPACE_ID, PLAN_A, 'Phase 1');

    expect(events.programUpdated).toHaveBeenCalledTimes(2);
    expect(events.programUpdated).toHaveBeenCalledWith(
      WORKSPACE_ID,
      PROGRAM_ID,
      expect.objectContaining({
        event: 'dependency_satisfied',
        dependency_id: 'dep_1',
      }),
    );
  });

  it('handles multiple phase completions correctly', async () => {
    vi.mocked(fileStore.getPlanState).mockResolvedValue({
      id: PLAN_A,
      workspace_id: WORKSPACE_ID,
      program_id: PROGRAM_ID,
    } as any);

    const deps: ProgramDependency[] = [
      makeDep('dep_1', PLAN_A, PLAN_B, 'blocks', 'Phase 1', undefined, 'pending'),
      makeDep('dep_2', PLAN_A, PLAN_C, 'blocks', 'Phase 2', undefined, 'pending'),
    ];
    await saveDependencies(WORKSPACE_ID, PROGRAM_ID, deps);

    // Phase 1 completes — should only satisfy dep_1
    const result1 = await announcePhaseCompletion(WORKSPACE_ID, PLAN_A, 'Phase 1');
    expect(result1.satisfied_dependencies).toHaveLength(1);
    expect(result1.satisfied_dependencies[0].id).toBe('dep_1');

    // Phase 2 completes — should satisfy dep_2
    const result2 = await announcePhaseCompletion(WORKSPACE_ID, PLAN_A, 'Phase 2');
    expect(result2.satisfied_dependencies).toHaveLength(1);
    expect(result2.satisfied_dependencies[0].id).toBe('dep_2');
  });
});

// =============================================================================
// Helpers
// =============================================================================

function makeDep(
  id: string,
  sourcePlan: string,
  targetPlan: string,
  type: 'blocks' | 'informs',
  sourcePhase?: string,
  targetPhase?: string,
  status: 'pending' | 'satisfied' = 'pending',
): ProgramDependency {
  return {
    id,
    source_plan_id: sourcePlan,
    source_phase: sourcePhase,
    target_plan_id: targetPlan,
    target_phase: targetPhase,
    type,
    status,
    created_at: new Date().toISOString(),
    ...(status === 'satisfied' ? { satisfied_at: new Date().toISOString() } : {}),
  };
}
