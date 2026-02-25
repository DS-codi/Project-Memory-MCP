/**
 * Program Migration — Converts legacy PlanState programs to dedicated ProgramState.
 *
 * Scans all PlanState objects in data/{workspace_id}/plans/ for those with
 * is_program: true, creates corresponding ProgramState entries in
 * data/{workspace_id}/programs/{program_id}/, copies child_plan_ids into
 * manifest.json, copies depends_on_plans into dependencies.json, and clears
 * legacy fields from the old PlanState.
 *
 * Idempotent: skips plans whose program_id already has a ProgramState.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { PlanState } from '../../types/plan.types.js';
import type {
  ProgramState,
  ProgramManifest,
  ProgramDependency,
  DependencyType,
} from '../../types/program-v2.types.js';
import { readJson, writeJson, getDataRoot } from '../../storage/db-store.js';
import {
  createProgramDir,
  readProgramState,
  saveProgramState,
  saveManifest,
  saveDependencies,
  saveRisks,
} from '../../storage/db-store.js';
import { generateProgramId } from './program-lifecycle.js';

// =============================================================================
// File-based helpers (this is a one-time legacy migration tool that reads
// pre-DB plan JSON files directly — not from the SQLite database)
// =============================================================================

async function loadAllPlans(workspaceId: string): Promise<PlanState[]> {
  const plansDir = path.join(getDataRoot(), workspaceId, 'plans');
  let entries: string[];
  try {
    entries = await fs.readdir(plansDir);
  } catch {
    return [];
  }
  const plans: PlanState[] = [];
  for (const planId of entries) {
    const statePath = path.join(plansDir, planId, 'state.json');
    const plan = await readJson<PlanState>(statePath);
    if (plan) plans.push(plan);
  }
  return plans;
}

async function savePlan(workspaceId: string, plan: PlanState): Promise<void> {
  const statePath = path.join(getDataRoot(), workspaceId, 'plans', plan.id, 'state.json');
  await writeJson(statePath, plan);
}

// =============================================================================
// Types
// =============================================================================

/** Summary of a single migrated program. */
export interface MigratedProgramEntry {
  old_plan_id: string;
  new_program_id: string;
  title: string;
  child_plan_ids: string[];
  dependencies_created: number;
  skipped: boolean;
  skip_reason?: string;
}

/** Full migration report. */
export interface MigrationReport {
  workspace_id: string;
  plans_scanned: number;
  programs_found: number;
  programs_migrated: number;
  programs_skipped: number;
  entries: MigratedProgramEntry[];
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generate a dependency ID for migration-created dependencies.
 */
function generateDepId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `dep_${timestamp}_${random}`;
}

/**
 * Convert legacy depends_on_plans strings to ProgramDependency entries.
 *
 * Each entry in depends_on_plans is treated as a 'blocks' dependency
 * where the referenced plan blocks the child plan.
 */
function convertDependenciesToGraph(
  childPlanIds: string[],
  dependsOnPlans: string[],
  programId: string,
): ProgramDependency[] {
  if (!dependsOnPlans.length || !childPlanIds.length) return [];

  const now = new Date().toISOString();
  const deps: ProgramDependency[] = [];

  // Legacy depends_on_plans references plans that block progress.
  // Create a dependency from the blocking plan to each child plan.
  for (const depPlanId of dependsOnPlans) {
    for (const childId of childPlanIds) {
      if (depPlanId === childId) continue; // skip self-references

      deps.push({
        id: generateDepId(),
        source_plan_id: depPlanId,
        target_plan_id: childId,
        type: 'blocks' as DependencyType,
        status: 'pending',
        created_at: now,
      });
    }
  }

  return deps;
}

// =============================================================================
// migratePrograms
// =============================================================================

/**
 * Migrate all legacy PlanState programs in a workspace to the v2 ProgramState
 * storage structure.
 *
 * Algorithm:
 * 1. Scan all PlanState objects for is_program: true
 * 2. For each legacy program plan:
 *    a. Skip if a ProgramState already exists for this plan's program_id (or the plan_id itself)
 *    b. Create ProgramState in data/{workspace_id}/programs/{program_id}/
 *    c. Copy child_plan_ids into manifest.json
 *    d. Convert depends_on_plans into dependencies.json entries
 *    e. Initialise empty risks.json
 *    f. Clear is_program, child_plan_ids, depends_on_plans from old PlanState
 *    g. Set program_id on old PlanState to point at the new program
 *    h. Update child plans' program_id to the new program ID
 * 3. Return migration report
 *
 * Idempotent: running twice produces the same result.
 */
export async function migratePrograms(
  workspaceId: string,
): Promise<MigrationReport> {
  const allPlans = await loadAllPlans(workspaceId);

  const legacyPrograms = allPlans.filter(
    (p: PlanState) => p.is_program === true,
  );

  const report: MigrationReport = {
    workspace_id: workspaceId,
    plans_scanned: allPlans.length,
    programs_found: legacyPrograms.length,
    programs_migrated: 0,
    programs_skipped: 0,
    entries: [],
  };

  if (legacyPrograms.length === 0) return report;

  // Build a map for quick child plan lookups
  const planById = new Map<string, PlanState>(
    allPlans.map((p) => [p.id, p]),
  );

  for (const legacyPlan of legacyPrograms) {
    const entry: MigratedProgramEntry = {
      old_plan_id: legacyPlan.id,
      new_program_id: '',
      title: legacyPlan.title,
      child_plan_ids: legacyPlan.child_plan_ids ?? [],
      dependencies_created: 0,
      skipped: false,
    };

    // Determine the program ID — reuse existing program_id if set, or generate new
    const programId = legacyPlan.program_id || generateProgramId();
    entry.new_program_id = programId;

    // Idempotency check: skip if ProgramState already exists
    const existing = await readProgramState(workspaceId, programId);
    if (existing) {
      entry.skipped = true;
      entry.skip_reason = `ProgramState already exists for ${programId}`;
      report.programs_skipped++;
      report.entries.push(entry);
      continue;
    }

    // 2b. Create ProgramState
    const now = new Date().toISOString();
    const programState: ProgramState = {
      id: programId,
      workspace_id: workspaceId,
      title: legacyPlan.title,
      description: legacyPlan.description,
      priority: legacyPlan.priority ?? 'medium',
      category: legacyPlan.category ?? 'feature',
      status: legacyPlan.status === 'archived' ? 'archived' : 'active',
      created_at: legacyPlan.created_at ?? now,
      updated_at: now,
    };

    await createProgramDir(workspaceId, programId);
    await saveProgramState(workspaceId, programId, programState);

    // 2c. Copy child_plan_ids into manifest.json
    const childIds = legacyPlan.child_plan_ids ?? [];
    const manifest: ProgramManifest = {
      program_id: programId,
      plan_ids: childIds,
      updated_at: now,
    };
    await saveManifest(workspaceId, programId, manifest);

    // 2d. Convert depends_on_plans into dependencies.json
    const dependsOn = legacyPlan.depends_on_plans ?? [];
    const deps = convertDependenciesToGraph(childIds, dependsOn, programId);
    entry.dependencies_created = deps.length;
    await saveDependencies(workspaceId, programId, deps);

    // 2e. Initialise empty risks.json
    await saveRisks(workspaceId, programId, []);

    // 2f. Clear legacy fields from old PlanState
    legacyPlan.is_program = undefined;
    legacyPlan.child_plan_ids = undefined;
    legacyPlan.depends_on_plans = undefined;
    legacyPlan.program_id = programId;
    await savePlan(workspaceId, legacyPlan);

    // 2h. Update child plans' program_id
    for (const childId of childIds) {
      const child = planById.get(childId);
      if (child) {
        child.program_id = programId;
        await savePlan(workspaceId, child);
      }
    }

    report.programs_migrated++;
    report.entries.push(entry);
  }

  return report;
}
