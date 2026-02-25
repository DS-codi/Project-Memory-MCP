/**
 * Program Manifest — Manages the relationship between programs and their child plans.
 *
 * Functions: addPlanToProgram, removePlanFromProgram, listProgramPlans, upgradeToProgram
 *
 * The manifest (manifest.json) tracks an ordered list of child plan IDs.
 * When a plan is added or removed, the corresponding PlanState.program_id
 * field is also updated for cross-reference consistency.
 */

import type {
  ProgramState,
  ProgramManifest,
} from '../../types/program-v2.types.js';
import type { PlanState, ToolResponse } from '../../types/index.js';
import {
  readProgramState,
  saveProgramState,
  readManifest,
  saveManifest,
  createProgramDir,
  saveDependencies,
  saveRisks,
} from '../../storage/db-store.js';
import * as fileStore from '../../storage/db-store.js';
import { generateProgramId } from './program-lifecycle.js';

// =============================================================================
// Plan Summary (for enriched listings)
// =============================================================================

export interface ProgramPlanSummary {
  plan_id: string;
  title: string;
  status: string;
  current_phase: string;
  steps_done: number;
  steps_total: number;
  last_updated: string;
}

// =============================================================================
// addPlanToProgram
// =============================================================================

/**
 * Add a plan to a program's manifest and set program_id on the PlanState.
 * No-ops if the plan is already in the manifest.
 */
export async function addPlanToProgram(
  workspaceId: string,
  programId: string,
  planId: string,
): Promise<ToolResponse<ProgramManifest>> {
  try {
    if (!workspaceId || !programId || !planId) {
      return { success: false, error: 'workspace_id, program_id, and plan_id are required' };
    }

    // Verify program exists
    const programState = await readProgramState(workspaceId, programId);
    if (!programState) {
      return { success: false, error: `Program not found: ${programId}` };
    }

    if (programState.status === 'archived') {
      return { success: false, error: 'Cannot add plans to an archived program' };
    }

    // Verify plan exists
    const planState = await fileStore.getPlanState(workspaceId, planId);
    if (!planState) {
      return { success: false, error: `Plan not found: ${planId}` };
    }

    // Check if plan is already in a different program
    if (planState.program_id && planState.program_id !== programId) {
      return {
        success: false,
        error: `Plan ${planId} is already in program ${planState.program_id}. Remove it first.`,
      };
    }

    // Update manifest
    let manifest = await readManifest(workspaceId, programId);
    if (!manifest) {
      manifest = { program_id: programId, plan_ids: [], updated_at: new Date().toISOString() };
    }

    if (!manifest.plan_ids.includes(planId)) {
      manifest.plan_ids.push(planId);
      manifest.updated_at = new Date().toISOString();
      await saveManifest(workspaceId, programId, manifest);
    }

    // Set program_id on the PlanState
    if (planState.program_id !== programId) {
      planState.program_id = programId;
      await fileStore.savePlanState(planState);
    }

    return { success: true, data: manifest };
  } catch (error) {
    return {
      success: false,
      error: `Failed to add plan to program: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// removePlanFromProgram
// =============================================================================

/**
 * Remove a plan from a program's manifest and clear program_id on PlanState.
 */
export async function removePlanFromProgram(
  workspaceId: string,
  programId: string,
  planId: string,
): Promise<ToolResponse<ProgramManifest>> {
  try {
    if (!workspaceId || !programId || !planId) {
      return { success: false, error: 'workspace_id, program_id, and plan_id are required' };
    }

    // Verify program exists
    const programState = await readProgramState(workspaceId, programId);
    if (!programState) {
      return { success: false, error: `Program not found: ${programId}` };
    }

    // Update manifest
    const manifest = await readManifest(workspaceId, programId);
    if (!manifest) {
      return { success: false, error: `Manifest not found for program: ${programId}` };
    }

    const idx = manifest.plan_ids.indexOf(planId);
    if (idx === -1) {
      return { success: false, error: `Plan ${planId} is not in program ${programId}` };
    }

    manifest.plan_ids.splice(idx, 1);
    manifest.updated_at = new Date().toISOString();
    await saveManifest(workspaceId, programId, manifest);

    // Clear program_id on PlanState
    const planState = await fileStore.getPlanState(workspaceId, planId);
    if (planState && planState.program_id === programId) {
      planState.program_id = undefined;
      await fileStore.savePlanState(planState);
    }

    return { success: true, data: manifest };
  } catch (error) {
    return {
      success: false,
      error: `Failed to remove plan from program: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// listProgramPlans
// =============================================================================

/**
 * Read the manifest and enrich each plan ID with a summary from PlanState.
 */
export async function listProgramPlans(
  workspaceId: string,
  programId: string,
): Promise<ToolResponse<ProgramPlanSummary[]>> {
  try {
    if (!workspaceId || !programId) {
      return { success: false, error: 'workspace_id and program_id are required' };
    }

    const programState = await readProgramState(workspaceId, programId);
    if (!programState) {
      return { success: false, error: `Program not found: ${programId}` };
    }

    const manifest = await readManifest(workspaceId, programId);
    if (!manifest) {
      return { success: true, data: [] };
    }

    const summaries: ProgramPlanSummary[] = [];
    for (const planId of manifest.plan_ids) {
      const plan = await fileStore.getPlanState(workspaceId, planId);
      if (plan) {
        const doneSteps = plan.steps.filter(s => s.status === 'done').length;
        summaries.push({
          plan_id: plan.id,
          title: plan.title,
          status: plan.status,
          current_phase: plan.current_phase,
          steps_done: doneSteps,
          steps_total: plan.steps.length,
          last_updated: plan.updated_at,
        });
      }
    }

    return { success: true, data: summaries };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list program plans: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// upgradeToProgram
// =============================================================================

/**
 * Upgrade a legacy PlanState with is_program=true into a new ProgramState.
 *
 * 1. Reads the old PlanState (validates is_program flag)
 * 2. Creates a new ProgramState in data/{workspace_id}/programs/
 * 3. Copies child_plan_ids into the manifest
 * 4. Sets program_id on each child plan
 * 5. Clears is_program/child_plan_ids on the original PlanState
 *    and sets its program_id to the new program
 */
export async function upgradeToProgram(
  workspaceId: string,
  planId: string,
): Promise<ToolResponse<{ program: ProgramState; manifest: ProgramManifest }>> {
  try {
    if (!workspaceId || !planId) {
      return { success: false, error: 'workspace_id and plan_id are required' };
    }

    const planState = await fileStore.getPlanState(workspaceId, planId);
    if (!planState) {
      return { success: false, error: `Plan not found: ${planId}` };
    }

    if (!planState.is_program) {
      return { success: false, error: `Plan ${planId} is not a legacy program (missing is_program flag)` };
    }

    const programId = generateProgramId();
    const now = new Date().toISOString();

    // Create new ProgramState from PlanState metadata
    const programState: ProgramState = {
      id: programId,
      workspace_id: workspaceId,
      title: planState.title,
      description: planState.description,
      priority: planState.priority,
      category: planState.category,
      status: planState.status === 'archived' ? 'archived' : 'active',
      created_at: planState.created_at,
      updated_at: now,
      ...(planState.status === 'archived' ? { archived_at: now } : {}),
    };

    // Build manifest from child_plan_ids
    const childIds = planState.child_plan_ids ?? [];
    const manifest: ProgramManifest = {
      program_id: programId,
      plan_ids: [...childIds],
      updated_at: now,
    };

    // Write new program storage
    await createProgramDir(workspaceId, programId);
    await saveProgramState(workspaceId, programId, programState);
    await saveManifest(workspaceId, programId, manifest);
    await saveDependencies(workspaceId, programId, []);
    await saveRisks(workspaceId, programId, []);

    // Update each child plan to point to the new program
    for (const childPlanId of childIds) {
      const childPlan = await fileStore.getPlanState(workspaceId, childPlanId);
      if (childPlan) {
        childPlan.program_id = programId;
        await fileStore.savePlanState(childPlan);
      }
    }

    // Clean up legacy fields on the original plan
    planState.is_program = undefined;
    planState.child_plan_ids = undefined;
    planState.program_id = programId;
    await fileStore.savePlanState(planState);

    return { success: true, data: { program: programState, manifest } };
  } catch (error) {
    return {
      success: false,
      error: `Failed to upgrade to program: ${(error as Error).message}`,
    };
  }
}
