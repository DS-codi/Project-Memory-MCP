/**
 * Test fixtures and helpers for DB layer tests.
 *
 * Usage pattern in each test file:
 *
 *   import { setupTestDb, teardownTestDb } from './fixtures.js';
 *
 *   beforeAll(() => setupTestDb());
 *   afterAll(() => teardownTestDb());
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _resetConnectionForTesting, getDb } from '../../db/connection.js';
import { runMigrations } from '../../db/migration-runner.js';

// ── Environment management ───────────────────────────────────────────────────

let tempDir: string | null = null;
let originalDataRoot: string | undefined;

/**
 * Create a temporary directory, point PM_DATA_ROOT at it, reset the
 * connection singleton, and run all migrations.
 *
 * Must be called in `beforeAll`.
 */
export function setupTestDb(): void {
  // Create a fresh temp dir for this test suite
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-'));

  // Capture and override PM_DATA_ROOT
  originalDataRoot = process.env['PM_DATA_ROOT'];
  process.env['PM_DATA_ROOT'] = tempDir;

  // Reset the DB singleton so it will open a fresh file in tempDir
  _resetConnectionForTesting();

  // Open the DB and run migrations
  getDb();
  runMigrations();
}

/**
 * Close the DB, restore the original PM_DATA_ROOT, and remove the temp dir.
 *
 * Must be called in `afterAll`.
 */
export function teardownTestDb(): void {
  _resetConnectionForTesting();

  if (originalDataRoot !== undefined) {
    process.env['PM_DATA_ROOT'] = originalDataRoot;
  } else {
    delete process.env['PM_DATA_ROOT'];
  }

  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
}

// ── Factory helpers ──────────────────────────────────────────────────────────

import { createWorkspace } from '../../db/workspace-db.js';
import { createPlan } from '../../db/plan-db.js';
import { createPhase } from '../../db/phase-db.js';
import { createStep } from '../../db/step-db.js';
import type { WorkspaceRow, PlanRow, PhaseRow, StepRow } from '../../db/types.js';

export type { WorkspaceRow, PlanRow, PhaseRow, StepRow };

let _counter = 0;
const uid = () => `t${++_counter}`;

/** Create a workspace and return its row. */
export function makeWorkspace(overrides: Partial<{ name: string; path: string }> = {}): WorkspaceRow {
  const name = overrides.name ?? `ws-${uid()}`;
  const wsPath = overrides.path ?? `/tmp/${name}`;
  return createWorkspace({ name, path: wsPath });
}

/** Create a plan and return its row. */
export function makePlan(workspaceId: string, overrides: Partial<{ title: string; description: string }> = {}): PlanRow {
  return createPlan({
    workspace_id: workspaceId,
    title:        overrides.title       ?? `Plan ${uid()}`,
    description:  overrides.description ?? 'Test plan',
    category:     'feature',
    priority:     'medium',
  });
}

/** Create a phase and return its row. */
export function makePhase(planId: string, name?: string): PhaseRow {
  return createPhase(planId, { name: name ?? `Phase ${uid()}` });
}

/** Create a step in a phase and return its row. */
export function makeStep(phaseId: string, task?: string): StepRow {
  return createStep(phaseId, { task: task ?? `Task ${uid()}` });
}
