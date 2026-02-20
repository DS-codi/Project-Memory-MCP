/**
 * Tests for program-dependencies.ts — Cross-plan dependency graph management.
 *
 * Uses a temp directory per test to exercise real file I/O.
 * The data root is redirected via mocked getDataRoot.
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

import { getDataRoot } from '../../storage/workspace-utils.js';
import {
  setDependency,
  removeDependency,
  getDependencies,
  getDependentsOf,
  validateNoCycles,
} from '../../tools/program/program-dependencies.js';
import { readDependencies } from '../../storage/program-store.js';
import type { ProgramDependency } from '../../types/program-v2.types.js';

const WORKSPACE_ID = 'test-workspace-deps';
const PROGRAM_ID = 'prog_test_deps';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-prog-deps-'));
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
// setDependency
// =============================================================================

describe('setDependency', () => {
  it('creates a new dependency with generated ID', async () => {
    const result = await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_a',
      source_phase: 'Phase 1',
      target_plan_id: 'plan_b',
      target_phase: 'Phase 2',
      type: 'blocks',
    });

    expect(result.created).toBe(true);
    expect(result.dependency.id).toMatch(/^dep_/);
    expect(result.dependency.source_plan_id).toBe('plan_a');
    expect(result.dependency.source_phase).toBe('Phase 1');
    expect(result.dependency.target_plan_id).toBe('plan_b');
    expect(result.dependency.target_phase).toBe('Phase 2');
    expect(result.dependency.type).toBe('blocks');
    expect(result.dependency.status).toBe('pending');
    expect(result.dependency.created_at).toBeDefined();
  });

  it('creates dependency without phases', async () => {
    const result = await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_a',
      target_plan_id: 'plan_b',
      type: 'informs',
    });

    expect(result.created).toBe(true);
    expect(result.dependency.source_phase).toBeUndefined();
    expect(result.dependency.target_phase).toBeUndefined();
    expect(result.dependency.type).toBe('informs');
  });

  it('updates existing dependency type if same source+target', async () => {
    await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_a',
      source_phase: 'Phase 1',
      target_plan_id: 'plan_b',
      target_phase: 'Phase 2',
      type: 'blocks',
    });

    const result = await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_a',
      source_phase: 'Phase 1',
      target_plan_id: 'plan_b',
      target_phase: 'Phase 2',
      type: 'informs',
    });

    expect(result.created).toBe(false);
    expect(result.dependency.type).toBe('informs');

    // Should still be just one dependency
    const deps = await getDependencies(WORKSPACE_ID, PROGRAM_ID);
    expect(deps).toHaveLength(1);
  });

  it('creates separate deps for different phases on same plans', async () => {
    await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_a',
      source_phase: 'Phase 1',
      target_plan_id: 'plan_b',
      type: 'blocks',
    });

    await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_a',
      source_phase: 'Phase 2',
      target_plan_id: 'plan_b',
      type: 'blocks',
    });

    const deps = await getDependencies(WORKSPACE_ID, PROGRAM_ID);
    expect(deps).toHaveLength(2);
  });

  it('rejects self-dependency', async () => {
    await expect(
      setDependency(WORKSPACE_ID, PROGRAM_ID, {
        source_plan_id: 'plan_a',
        target_plan_id: 'plan_a',
        type: 'blocks',
      }),
    ).rejects.toThrow('cannot depend on itself');
  });

  it('rejects dependency that would create a cycle', async () => {
    await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_a',
      target_plan_id: 'plan_b',
      type: 'blocks',
    });

    await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_b',
      target_plan_id: 'plan_c',
      type: 'blocks',
    });

    await expect(
      setDependency(WORKSPACE_ID, PROGRAM_ID, {
        source_plan_id: 'plan_c',
        target_plan_id: 'plan_a',
        type: 'blocks',
      }),
    ).rejects.toThrow('cycle');
  });

  it('allows informs dependency that would otherwise cycle', async () => {
    await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_a',
      target_plan_id: 'plan_b',
      type: 'blocks',
    });

    // informs deps don't create hard edges for cycle detection
    const result = await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_b',
      target_plan_id: 'plan_a',
      type: 'informs',
    });

    expect(result.created).toBe(true);
  });

  it('persists dependencies to disk', async () => {
    await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_a',
      target_plan_id: 'plan_b',
      type: 'blocks',
    });

    const deps = await readDependencies(WORKSPACE_ID, PROGRAM_ID);
    expect(deps).toHaveLength(1);
    expect(deps[0].source_plan_id).toBe('plan_a');
  });
});

// =============================================================================
// removeDependency
// =============================================================================

describe('removeDependency', () => {
  it('removes a dependency by ID', async () => {
    const { dependency } = await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_a',
      target_plan_id: 'plan_b',
      type: 'blocks',
    });

    const result = await removeDependency(WORKSPACE_ID, PROGRAM_ID, dependency.id);
    expect(result.removed).toBe(true);
    expect(result.remaining_count).toBe(0);

    const deps = await getDependencies(WORKSPACE_ID, PROGRAM_ID);
    expect(deps).toHaveLength(0);
  });

  it('returns removed=false for non-existent ID', async () => {
    const result = await removeDependency(WORKSPACE_ID, PROGRAM_ID, 'dep_nonexistent');
    expect(result.removed).toBe(false);
  });

  it('only removes the targeted dependency', async () => {
    const { dependency: dep1 } = await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_a',
      target_plan_id: 'plan_b',
      type: 'blocks',
    });

    await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_c',
      target_plan_id: 'plan_d',
      type: 'informs',
    });

    const result = await removeDependency(WORKSPACE_ID, PROGRAM_ID, dep1.id);
    expect(result.removed).toBe(true);
    expect(result.remaining_count).toBe(1);
  });
});

// =============================================================================
// getDependencies
// =============================================================================

describe('getDependencies', () => {
  it('returns empty array when no dependencies exist', async () => {
    const deps = await getDependencies(WORKSPACE_ID, PROGRAM_ID);
    expect(deps).toEqual([]);
  });

  it('returns all dependencies', async () => {
    await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_a',
      target_plan_id: 'plan_b',
      type: 'blocks',
    });
    await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_c',
      target_plan_id: 'plan_d',
      type: 'informs',
    });

    const deps = await getDependencies(WORKSPACE_ID, PROGRAM_ID);
    expect(deps).toHaveLength(2);
  });
});

// =============================================================================
// getDependentsOf
// =============================================================================

describe('getDependentsOf', () => {
  it('returns dependencies where plan is the target', async () => {
    await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_a',
      target_plan_id: 'plan_b',
      type: 'blocks',
    });

    await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_c',
      target_plan_id: 'plan_b',
      type: 'informs',
    });

    await setDependency(WORKSPACE_ID, PROGRAM_ID, {
      source_plan_id: 'plan_b',
      target_plan_id: 'plan_d',
      type: 'blocks',
    });

    const dependents = await getDependentsOf(WORKSPACE_ID, PROGRAM_ID, 'plan_b');
    expect(dependents).toHaveLength(2);
    expect(dependents.map(d => d.source_plan_id).sort()).toEqual(['plan_a', 'plan_c']);
  });

  it('returns empty array when plan has no dependents', async () => {
    const dependents = await getDependentsOf(WORKSPACE_ID, PROGRAM_ID, 'plan_z');
    expect(dependents).toEqual([]);
  });
});

// =============================================================================
// validateNoCycles
// =============================================================================

describe('validateNoCycles', () => {
  it('returns valid for empty dependency array', () => {
    const result = validateNoCycles([]);
    expect(result.valid).toBe(true);
  });

  it('returns valid for a linear chain', () => {
    const deps: ProgramDependency[] = [
      makeDep('plan_a', 'plan_b', 'blocks'),
      makeDep('plan_b', 'plan_c', 'blocks'),
      makeDep('plan_c', 'plan_d', 'blocks'),
    ];
    const result = validateNoCycles(deps);
    expect(result.valid).toBe(true);
  });

  it('detects a simple 2-node cycle', () => {
    const deps: ProgramDependency[] = [
      makeDep('plan_a', 'plan_b', 'blocks'),
      makeDep('plan_b', 'plan_a', 'blocks'),
    ];
    const result = validateNoCycles(deps);
    expect(result.valid).toBe(false);
    expect(result.cycle).toBeDefined();
    expect(result.cycle!.length).toBeGreaterThanOrEqual(2);
  });

  it('detects a 3-node cycle', () => {
    const deps: ProgramDependency[] = [
      makeDep('plan_a', 'plan_b', 'blocks'),
      makeDep('plan_b', 'plan_c', 'blocks'),
      makeDep('plan_c', 'plan_a', 'blocks'),
    ];
    const result = validateNoCycles(deps);
    expect(result.valid).toBe(false);
    expect(result.cycle).toBeDefined();
  });

  it('ignores informs deps for cycle detection', () => {
    const deps: ProgramDependency[] = [
      makeDep('plan_a', 'plan_b', 'blocks'),
      makeDep('plan_b', 'plan_a', 'informs'),
    ];
    const result = validateNoCycles(deps);
    expect(result.valid).toBe(true);
  });

  it('handles phase-aware nodes (no false positives)', () => {
    // plan_a::Phase1 → plan_b, plan_b → plan_a::Phase2 is NOT a cycle
    const deps: ProgramDependency[] = [
      makeDep('plan_a', 'plan_b', 'blocks', 'Phase 1'),
      makeDep('plan_b', 'plan_a', 'blocks', undefined, 'Phase 2'),
    ];
    // Source "plan_a::Phase 1" → target "plan_b"
    // Source "plan_b" → target "plan_a::Phase 2"
    // No cycle because plan_a::Phase1 and plan_a::Phase2 are different nodes
    const result = validateNoCycles(deps);
    expect(result.valid).toBe(true);
  });

  it('detects cycle with phase-aware nodes', () => {
    const deps: ProgramDependency[] = [
      makeDep('plan_a', 'plan_b', 'blocks', 'Phase 1', 'Phase 1'),
      makeDep('plan_b', 'plan_a', 'blocks', 'Phase 1', 'Phase 1'),
    ];
    const result = validateNoCycles(deps);
    expect(result.valid).toBe(false);
  });

  it('returns valid for disconnected components with no cycles', () => {
    const deps: ProgramDependency[] = [
      makeDep('plan_a', 'plan_b', 'blocks'),
      makeDep('plan_c', 'plan_d', 'blocks'),
      makeDep('plan_e', 'plan_f', 'blocks'),
    ];
    const result = validateNoCycles(deps);
    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// Helpers
// =============================================================================

function makeDep(
  source: string,
  target: string,
  type: 'blocks' | 'informs',
  sourcePhase?: string,
  targetPhase?: string,
): ProgramDependency {
  return {
    id: `dep_test_${Math.random().toString(36).slice(2, 8)}`,
    source_plan_id: source,
    source_phase: sourcePhase,
    target_plan_id: target,
    target_phase: targetPhase,
    type,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
}
