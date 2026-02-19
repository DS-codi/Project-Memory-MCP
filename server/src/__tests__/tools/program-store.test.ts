/**
 * Tests for program-store.ts — CRUD operations for the v2 Programs storage.
 *
 * Uses a temp directory per test to exercise real file I/O.
 * The data root is redirected via MBS_DATA_ROOT env var.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type {
  ProgramState,
  ProgramDependency,
  ProgramRisk,
  ProgramManifest,
} from '../../types/program-v2.types.js';

// We need to mock getDataRoot before importing program-store
vi.mock('../../storage/workspace-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage/workspace-utils.js')>();
  return {
    ...actual,
    getDataRoot: vi.fn(),
  };
});

// Mock file-lock to bypass proper-lockfile (no lock files in tests)
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

  return { readJson, writeJson, modifyJsonLocked, writeJsonLocked: writeJson, fileLockManager: { withLock: (_: string, op: () => Promise<unknown>) => op() } };
});

import { getDataRoot } from '../../storage/workspace-utils.js';
import {
  getProgramsPath,
  getProgramPath,
  getProgramStatePath,
  getDependenciesPath,
  getRisksPath,
  getManifestPath,
  createProgramDir,
  readProgramState,
  saveProgramState,
  readDependencies,
  saveDependencies,
  readRisks,
  saveRisks,
  readManifest,
  saveManifest,
  listPrograms,
  deleteProgram,
} from '../../storage/program-store.js';

const WORKSPACE_ID = 'test-workspace-abc123';
const PROGRAM_ID = 'prog_001';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-program-store-'));
  vi.mocked(getDataRoot).mockReturnValue(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// =============================================================================
// Path Helpers
// =============================================================================

describe('Path helpers', () => {
  it('getProgramsPath returns data/{workspaceId}/programs/', () => {
    const result = getProgramsPath(WORKSPACE_ID);
    expect(result).toBe(path.join(tmpDir, WORKSPACE_ID, 'programs'));
  });

  it('getProgramPath returns data/{workspaceId}/programs/{programId}/', () => {
    const result = getProgramPath(WORKSPACE_ID, PROGRAM_ID);
    expect(result).toBe(path.join(tmpDir, WORKSPACE_ID, 'programs', PROGRAM_ID));
  });

  it('getProgramStatePath returns program.json inside the program dir', () => {
    const result = getProgramStatePath(WORKSPACE_ID, PROGRAM_ID);
    expect(result).toBe(
      path.join(tmpDir, WORKSPACE_ID, 'programs', PROGRAM_ID, 'program.json')
    );
  });

  it('getDependenciesPath returns dependencies.json inside the program dir', () => {
    const result = getDependenciesPath(WORKSPACE_ID, PROGRAM_ID);
    expect(result).toBe(
      path.join(tmpDir, WORKSPACE_ID, 'programs', PROGRAM_ID, 'dependencies.json')
    );
  });

  it('getRisksPath returns risks.json inside the program dir', () => {
    const result = getRisksPath(WORKSPACE_ID, PROGRAM_ID);
    expect(result).toBe(
      path.join(tmpDir, WORKSPACE_ID, 'programs', PROGRAM_ID, 'risks.json')
    );
  });

  it('getManifestPath returns manifest.json inside the program dir', () => {
    const result = getManifestPath(WORKSPACE_ID, PROGRAM_ID);
    expect(result).toBe(
      path.join(tmpDir, WORKSPACE_ID, 'programs', PROGRAM_ID, 'manifest.json')
    );
  });
});

// =============================================================================
// Directory Creation
// =============================================================================

describe('createProgramDir', () => {
  it('creates the program directory', async () => {
    await createProgramDir(WORKSPACE_ID, PROGRAM_ID);
    const dirPath = getProgramPath(WORKSPACE_ID, PROGRAM_ID);
    const stat = await fs.stat(dirPath);
    expect(stat.isDirectory()).toBe(true);
  });

  it('is idempotent — calling twice does not throw', async () => {
    await createProgramDir(WORKSPACE_ID, PROGRAM_ID);
    await expect(createProgramDir(WORKSPACE_ID, PROGRAM_ID)).resolves.toBeUndefined();
  });
});

// =============================================================================
// ProgramState CRUD
// =============================================================================

const sampleState: ProgramState = {
  id: PROGRAM_ID,
  workspace_id: WORKSPACE_ID,
  title: 'Test Program',
  description: 'A test program',
  priority: 'medium',
  category: 'feature',
  status: 'active',
  created_at: '2026-02-18T12:00:00.000Z',
  updated_at: '2026-02-18T12:00:00.000Z',
};

describe('ProgramState read/write', () => {
  it('readProgramState returns null for missing file', async () => {
    const result = await readProgramState(WORKSPACE_ID, PROGRAM_ID);
    expect(result).toBeNull();
  });

  it('saveProgramState writes and readProgramState reads it back', async () => {
    await saveProgramState(WORKSPACE_ID, PROGRAM_ID, sampleState);
    const result = await readProgramState(WORKSPACE_ID, PROGRAM_ID);
    expect(result).toEqual(sampleState);
  });

  it('saveProgramState overwrites existing state', async () => {
    await saveProgramState(WORKSPACE_ID, PROGRAM_ID, sampleState);
    const updated = { ...sampleState, title: 'Updated Title' };
    await saveProgramState(WORKSPACE_ID, PROGRAM_ID, updated);
    const result = await readProgramState(WORKSPACE_ID, PROGRAM_ID);
    expect(result?.title).toBe('Updated Title');
  });
});

// =============================================================================
// Dependencies CRUD
// =============================================================================

const sampleDeps: ProgramDependency[] = [
  {
    id: 'dep_001',
    source_plan_id: 'plan_a',
    source_phase: 'Phase 1',
    target_plan_id: 'plan_b',
    target_phase: 'Phase 2',
    type: 'blocks',
    status: 'pending',
    created_at: '2026-02-18T12:00:00.000Z',
  },
];

describe('Dependencies read/write', () => {
  it('readDependencies returns empty array for missing file', async () => {
    const result = await readDependencies(WORKSPACE_ID, PROGRAM_ID);
    expect(result).toEqual([]);
  });

  it('saveDependencies writes and readDependencies reads back', async () => {
    await saveDependencies(WORKSPACE_ID, PROGRAM_ID, sampleDeps);
    const result = await readDependencies(WORKSPACE_ID, PROGRAM_ID);
    expect(result).toEqual(sampleDeps);
  });
});

// =============================================================================
// Risks CRUD
// =============================================================================

const sampleRisks: ProgramRisk[] = [
  {
    id: 'risk_001',
    program_id: PROGRAM_ID,
    type: 'functional_conflict',
    severity: 'high',
    status: 'identified',
    title: 'Auth conflict',
    description: 'Two plans modify the same auth module',
    detected_by: 'auto',
    source_plan_id: 'plan_a',
    created_at: '2026-02-18T12:00:00.000Z',
    updated_at: '2026-02-18T12:00:00.000Z',
  },
];

describe('Risks read/write', () => {
  it('readRisks returns empty array for missing file', async () => {
    const result = await readRisks(WORKSPACE_ID, PROGRAM_ID);
    expect(result).toEqual([]);
  });

  it('saveRisks writes and readRisks reads back', async () => {
    await saveRisks(WORKSPACE_ID, PROGRAM_ID, sampleRisks);
    const result = await readRisks(WORKSPACE_ID, PROGRAM_ID);
    expect(result).toEqual(sampleRisks);
  });
});

// =============================================================================
// Manifest CRUD
// =============================================================================

const sampleManifest: ProgramManifest = {
  program_id: PROGRAM_ID,
  plan_ids: ['plan_a', 'plan_b', 'plan_c'],
  updated_at: '2026-02-18T12:00:00.000Z',
};

describe('Manifest read/write', () => {
  it('readManifest returns null for missing file', async () => {
    const result = await readManifest(WORKSPACE_ID, PROGRAM_ID);
    expect(result).toBeNull();
  });

  it('saveManifest writes and readManifest reads back', async () => {
    await saveManifest(WORKSPACE_ID, PROGRAM_ID, sampleManifest);
    const result = await readManifest(WORKSPACE_ID, PROGRAM_ID);
    expect(result).toEqual(sampleManifest);
  });
});

// =============================================================================
// Listing
// =============================================================================

describe('listPrograms', () => {
  it('returns empty array when no programs directory exists', async () => {
    const result = await listPrograms(WORKSPACE_ID);
    expect(result).toEqual([]);
  });

  it('returns program IDs after creating multiple programs', async () => {
    await createProgramDir(WORKSPACE_ID, 'prog_a');
    await createProgramDir(WORKSPACE_ID, 'prog_b');
    await createProgramDir(WORKSPACE_ID, 'prog_c');

    const result = await listPrograms(WORKSPACE_ID);
    expect(result.sort()).toEqual(['prog_a', 'prog_b', 'prog_c']);
  });

  it('only returns directories, not stray files', async () => {
    await createProgramDir(WORKSPACE_ID, 'prog_real');
    // Create a stray file in the programs/ directory
    const programsDir = getProgramsPath(WORKSPACE_ID);
    await fs.writeFile(path.join(programsDir, 'stray.json'), '{}', 'utf-8');

    const result = await listPrograms(WORKSPACE_ID);
    expect(result).toEqual(['prog_real']);
  });
});

// =============================================================================
// Deletion
// =============================================================================

describe('deleteProgram', () => {
  it('removes the program directory and all contents', async () => {
    await createProgramDir(WORKSPACE_ID, PROGRAM_ID);
    await saveProgramState(WORKSPACE_ID, PROGRAM_ID, sampleState);
    await saveDependencies(WORKSPACE_ID, PROGRAM_ID, sampleDeps);
    await saveRisks(WORKSPACE_ID, PROGRAM_ID, sampleRisks);
    await saveManifest(WORKSPACE_ID, PROGRAM_ID, sampleManifest);

    // Verify files exist before deletion
    const programDir = getProgramPath(WORKSPACE_ID, PROGRAM_ID);
    const entries = await fs.readdir(programDir);
    expect(entries.length).toBeGreaterThan(0);

    await deleteProgram(WORKSPACE_ID, PROGRAM_ID);

    // Directory should no longer exist
    await expect(fs.stat(programDir)).rejects.toThrow();
  });

  it('does not throw when deleting a non-existent program', async () => {
    await expect(deleteProgram(WORKSPACE_ID, 'nonexistent')).resolves.toBeUndefined();
  });

  it('removes program from listing after deletion', async () => {
    await createProgramDir(WORKSPACE_ID, 'prog_keep');
    await createProgramDir(WORKSPACE_ID, 'prog_remove');

    await deleteProgram(WORKSPACE_ID, 'prog_remove');

    const result = await listPrograms(WORKSPACE_ID);
    expect(result).toEqual(['prog_keep']);
  });
});
