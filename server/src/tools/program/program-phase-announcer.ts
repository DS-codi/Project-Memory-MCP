/**
 * Program Phase Announcer — Announces phase completions to satisfy cross-plan dependencies.
 *
 * When all steps in a plan's phase are marked 'done', the phase announcer:
 * 1. Reads the plan to find its program_id
 * 2. Reads program dependencies
 * 3. Finds blocking dependencies where source matches the completed plan+phase
 * 4. Marks matching dependencies as 'satisfied'
 * 5. Returns list of newly-unblocked target plans
 *
 * This module is called from the step-update flow as a non-blocking post-hook.
 */

import type { ProgramDependency } from '../../types/program-v2.types.js';
import * as store from '../../storage/db-store.js';
import {
  readDependencies,
  saveDependencies,
} from '../../storage/db-store.js';
import { events } from '../../events/event-emitter.js';

// =============================================================================
// Types
// =============================================================================

export interface PhaseCompletionResult {
  /** Whether the plan belongs to a program */
  in_program: boolean;
  /** Program ID (if any) */
  program_id?: string;
  /** Dependencies that were newly marked 'satisfied' */
  satisfied_dependencies: ProgramDependency[];
  /** Target plan IDs that are now fully unblocked (all blocking deps satisfied) */
  unblocked_plan_ids: string[];
}

// =============================================================================
// announcePhaseCompletion
// =============================================================================

/**
 * Announce that a plan's phase has completed, satisfying any blocking dependencies.
 *
 * Steps:
 * 1. Read the plan to get its program_id
 * 2. If no program_id, return early (plan not in a program)
 * 3. Read program dependencies
 * 4. Find pending blocking dependencies where source matches the completed plan+phase
 * 5. Mark matching dependencies as 'satisfied' with satisfied_at timestamp
 * 6. Save updated dependencies
 * 7. Determine which target plans are now fully unblocked
 * 8. Emit events for each satisfied dependency
 */
export async function announcePhaseCompletion(
  workspaceId: string,
  planId: string,
  phaseName: string,
): Promise<PhaseCompletionResult> {
  // 1. Read the plan to get its program_id
  const plan = await store.getPlanState(workspaceId, planId);
  if (!plan || !plan.program_id) {
    return {
      in_program: false,
      satisfied_dependencies: [],
      unblocked_plan_ids: [],
    };
  }

  const programId = plan.program_id;

  // 3. Read program dependencies
  const deps = await readDependencies(workspaceId, programId);
  if (deps.length === 0) {
    return {
      in_program: true,
      program_id: programId,
      satisfied_dependencies: [],
      unblocked_plan_ids: [],
    };
  }

  // 4. Find matching pending blocking dependencies
  const now = new Date().toISOString();
  const newlySatisfied: ProgramDependency[] = [];

  for (const dep of deps) {
    if (
      dep.source_plan_id === planId &&
      dep.type === 'blocks' &&
      dep.status === 'pending' &&
      matchesPhase(dep.source_phase, phaseName)
    ) {
      dep.status = 'satisfied';
      dep.satisfied_at = now;
      newlySatisfied.push(dep);
    }
  }

  if (newlySatisfied.length === 0) {
    return {
      in_program: true,
      program_id: programId,
      satisfied_dependencies: [],
      unblocked_plan_ids: [],
    };
  }

  // 6. Save updated dependencies
  await saveDependencies(workspaceId, programId, deps);

  // 7. Determine which target plans are now fully unblocked
  const unblockedPlanIds = findUnblockedPlans(deps, newlySatisfied);

  // 8. Emit events for each satisfied dependency
  for (const dep of newlySatisfied) {
    await events.programUpdated(workspaceId, programId, {
      event: 'dependency_satisfied',
      dependency_id: dep.id,
      source_plan_id: dep.source_plan_id,
      source_phase: dep.source_phase,
      target_plan_id: dep.target_plan_id,
      target_phase: dep.target_phase,
    });
  }

  return {
    in_program: true,
    program_id: programId,
    satisfied_dependencies: newlySatisfied,
    unblocked_plan_ids: unblockedPlanIds,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if a dependency's source_phase matches the completed phase.
 * If source_phase is undefined, it matches any phase completion for that plan.
 */
function matchesPhase(
  depSourcePhase: string | undefined,
  completedPhase: string,
): boolean {
  if (!depSourcePhase) return true;
  return depSourcePhase === completedPhase;
}

/**
 * Find target plans that are now fully unblocked.
 *
 * A target plan is "unblocked" when ALL blocking dependencies targeting it
 * are in 'satisfied' status.
 */
function findUnblockedPlans(
  allDeps: ProgramDependency[],
  newlySatisfied: ProgramDependency[],
): string[] {
  // Collect unique target plan IDs from newly satisfied deps
  const candidatePlanIds = [
    ...new Set(newlySatisfied.map((d) => d.target_plan_id)),
  ];

  const unblockedPlanIds: string[] = [];

  for (const targetPlanId of candidatePlanIds) {
    // Find ALL blocking deps targeting this plan
    const blockingDeps = allDeps.filter(
      (d) => d.target_plan_id === targetPlanId && d.type === 'blocks',
    );

    // If all blocking deps are now satisfied, the plan is unblocked
    const allSatisfied = blockingDeps.every((d) => d.status === 'satisfied');
    if (allSatisfied) {
      unblockedPlanIds.push(targetPlanId);
    }
  }

  return unblockedPlanIds;
}
