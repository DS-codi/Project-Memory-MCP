/**
 * Plan Steps - Step status updates, batch updates, and plan modification
 *
 * Functions: updateStep, batchUpdateSteps, modifyPlan
 */

import type {
  UpdateStepParams,
  BatchUpdateStepsParams,
  ModifyPlanParams,
  ToolResponse,
  PlanState,
  PlanStep,
  PlanOperationResult,
  OrderValidationWarning
} from '../../types/index.js';
import { AGENT_BOUNDARIES, STEP_TYPE_BEHAVIORS } from '../../types/index.js';
import * as store from '../../storage/file-store.js';
import { events } from '../../events/event-emitter.js';
import {
  requiresStepConfirmation,
  hasStepConfirmation,
  hasPhaseConfirmation,
  validateStepOrder
} from './plan-utils.js';
import { checkProgramUpgradeSuggestion } from './plan-step-mutations.js';
import { applySkillPhaseMatching } from './plan-lifecycle.js';
import { announcePhaseCompletion } from '../program/program-phase-announcer.js';

// =============================================================================
// Step Updates
// =============================================================================

/**
 * Update the status of a specific step
 * Returns role_boundaries to remind agent of their constraints
 */
export async function updateStep(
  params: UpdateStepParams
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, step_index, status, notes } = params;

    if (!workspace_id || !plan_id || step_index === undefined || !status) {
      return {
        success: false,
        error: 'workspace_id, plan_id, step_index, and status are required'
      };
    }

    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }

    // Get current agent's boundaries
    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];

    // Find the step
    const step = state.steps.find(s => s.index === step_index);
    if (!step) {
      return {
        success: false,
        error: `Step not found: ${step_index}`
      };
    }

    // Confirmation gating for step execution
    if (status === 'active' || status === 'done') {
      if (requiresStepConfirmation(step) && !hasStepConfirmation(state, step_index)) {
        return {
          success: false,
          error: `Step ${step_index} requires explicit user confirmation before execution. Use memory_plan action "confirm" with scope "step".`
        };
      }

      if (status === 'done') {
        const phaseSteps = state.steps.filter(s => s.phase === step.phase);
        const phaseCompleteAfterUpdate = phaseSteps.every(s =>
          s.index === step_index ? true : s.status === 'done'
        );

        if (phaseCompleteAfterUpdate && !hasPhaseConfirmation(state, step.phase)) {
          return {
            success: false,
            error: `Phase "${step.phase}" requires confirmation before transition. Use memory_plan action "confirm" with scope "phase".`
          };
        }
      }
    }

    // Update step
    step.status = status;
    if (notes) {
      step.notes = notes;
    }
    if (status === 'done') {
      step.completed_at = store.nowISO();
    }

    // Validate step order when marking a step as 'done'
    let orderWarning: OrderValidationWarning | null = null;
    if (status === 'done') {
      orderWarning = validateStepOrder(state.steps, step_index);

      // Type-aware validation: warn if user_validation/confirmation step auto-completed
      const stepType = step.type ?? 'standard';
      const behavior = STEP_TYPE_BEHAVIORS[stepType];
      if (!behavior.auto_completable) {
        const typeWarning = `⚠️ Step ${step_index} is type '${stepType}' which requires explicit user confirmation. Ensure this was intentionally marked done.`;
        if (orderWarning) {
          orderWarning.message += `\n${typeWarning}`;
        } else {
          orderWarning = {
            step_completed: step_index,
            prior_pending: [],
            message: typeWarning
          };
        }
      }
    }

    // Update phase if needed
    const phases = [...new Set(state.steps.map(s => s.phase))];
    const currentPhaseSteps = state.steps.filter(s => s.phase === step.phase);
    const allDone = currentPhaseSteps.every(s => s.status === 'done');

    if (allDone) {
      const currentPhaseIndex = phases.indexOf(step.phase);
      if (currentPhaseIndex < phases.length - 1) {
        state.current_phase = phases[currentPhaseIndex + 1];
      } else {
        state.current_phase = 'complete';
      }
    }

    await store.savePlanState(state);
    await store.generatePlanMd(state);

    // Emit step updated event for WebSocket listeners
    await events.stepUpdated(workspace_id, plan_id, step_index, status);

    // Fire-and-forget: announce phase completion to satisfy cross-plan dependencies
    if (allDone && status === 'done') {
      announcePhaseCompletion(workspace_id, plan_id, step.phase).catch(() => {
        /* Non-blocking — dependency satisfaction is best-effort */
      });
    }

    // Determine next action based on boundaries
    const shouldHandoff = !boundaries.can_finalize;
    const pendingSteps = state.steps.filter(s => s.status === 'pending').length;

    const result: PlanOperationResult = {
      plan_state: state,
      role_boundaries: boundaries,
      next_action: {
        should_handoff: shouldHandoff && pendingSteps === 0,
        handoff_to: boundaries.must_handoff_to.length > 0 ? boundaries.must_handoff_to : undefined,
        message: pendingSteps > 0
          ? `${pendingSteps} steps remaining. Continue with your work.`
          : shouldHandoff
            ? `⚠️ All your steps are complete. You MUST handoff to ${boundaries.must_handoff_to.join(' or ')} before calling complete_agent.`
            : 'All steps complete. You may archive the plan.'
      }
    };

    // Include order warning if present
    if (orderWarning) {
      result.order_warning = orderWarning;
    }

    return {
      success: true,
      data: result
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update step: ${(error as Error).message}`
    };
  }
}

/**
 * Batch update multiple steps at once
 * Useful for marking multiple steps done/pending in a single call
 */
export async function batchUpdateSteps(
  params: BatchUpdateStepsParams
): Promise<ToolResponse<PlanOperationResult & { updated_count: number }>> {
  try {
    const { workspace_id, plan_id, updates } = params;

    if (!workspace_id || !plan_id || !updates || !Array.isArray(updates)) {
      return {
        success: false,
        error: 'workspace_id, plan_id, and updates array are required'
      };
    }

    if (updates.length === 0) {
      return {
        success: false,
        error: 'updates array cannot be empty'
      };
    }

    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }

    // Get current agent's boundaries
    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];

    const updatesByIndex = new Map(updates.map(update => [update.step_index, update]));
    const confirmationErrors: string[] = [];

    for (const update of updates) {
      const step = state.steps.find(s => s.index === update.step_index);
      if (!step) {
        continue;
      }

      if (update.status === 'active' || update.status === 'done') {
        if (requiresStepConfirmation(step) && !hasStepConfirmation(state, update.step_index)) {
          confirmationErrors.push(`Step ${update.step_index} requires explicit user confirmation.`);
        }
      }
    }

    if (confirmationErrors.length > 0) {
      return {
        success: false,
        error: `${confirmationErrors.join(' ')} Use memory_plan action "confirm" before updating these steps.`
      };
    }

    const phases = [...new Set(state.steps.map(s => s.phase))];
    for (const phase of phases) {
      const phaseSteps = state.steps.filter(s => s.phase === phase);
      const phaseCompleteAfterUpdate = phaseSteps.every(step => {
        const update = updatesByIndex.get(step.index);
        if (update?.status) {
          return update.status === 'done';
        }
        return step.status === 'done';
      });

      if (phaseCompleteAfterUpdate && !hasPhaseConfirmation(state, phase)) {
        return {
          success: false,
          error: `Phase "${phase}" requires confirmation before transition. Use memory_plan action "confirm" with scope "phase".`
        };
      }
    }

    let updatedCount = 0;
    const errors: string[] = [];
    const warnings: string[] = [];

    // Apply each update
    for (const update of updates) {
      const step = state.steps.find(s => s.index === update.step_index);
      if (!step) {
        errors.push(`Step ${update.step_index} not found`);
        continue;
      }

      step.status = update.status;
      if (update.notes) {
        step.notes = update.notes;
      }
      if (update.status === 'done') {
        step.completed_at = store.nowISO();

        // Collect order validation warnings for each completed step
        const orderWarning = validateStepOrder(state.steps, update.step_index);
        if (orderWarning) {
          warnings.push(orderWarning.message);
        }

        // Type-aware validation
        const stepType = step.type ?? 'standard';
        const behavior = STEP_TYPE_BEHAVIORS[stepType];
        if (!behavior.auto_completable) {
          warnings.push(`⚠️ Step ${update.step_index} is type '${stepType}' which requires explicit user confirmation.`);
        }
      }
      updatedCount++;
    }

    // Update phase if needed
    for (const phase of phases) {
      const phaseSteps = state.steps.filter(s => s.phase === phase);
      const allDone = phaseSteps.every(s => s.status === 'done');
      if (allDone) {
        const currentPhaseIndex = phases.indexOf(state.current_phase);
        const thisPhaseIndex = phases.indexOf(phase);
        if (thisPhaseIndex >= currentPhaseIndex) {
          if (thisPhaseIndex < phases.length - 1) {
            state.current_phase = phases[thisPhaseIndex + 1];
          } else {
            state.current_phase = 'complete';
          }
        }
      }
    }

    await store.savePlanState(state);
    await store.generatePlanMd(state);

    // Emit step updated events for all successfully updated steps
    for (const update of updates) {
      const step = state.steps.find(s => s.index === update.step_index);
      if (step) {
        await events.stepUpdated(workspace_id, plan_id, update.step_index, update.status);
      }
    }

    // Fire-and-forget: announce phase completions for cross-plan dependencies
    const completedPhases = new Set<string>();
    for (const phase of phases) {
      const phaseSteps = state.steps.filter(s => s.phase === phase);
      const phaseAllDone = phaseSteps.every(s => s.status === 'done');
      // Only announce if a batch update step in this phase was set to 'done'
      const hadDoneUpdate = updates.some(
        u => u.status === 'done' && phaseSteps.some(s => s.index === u.step_index),
      );
      if (phaseAllDone && hadDoneUpdate) {
        completedPhases.add(phase);
      }
    }
    for (const phase of completedPhases) {
      announcePhaseCompletion(workspace_id, plan_id, phase).catch(() => {
        /* Non-blocking — dependency satisfaction is best-effort */
      });
    }

    // Determine next action based on boundaries
    const shouldHandoff = !boundaries.can_finalize;
    const pendingSteps = state.steps.filter(s => s.status === 'pending').length;
    const doneSteps = state.steps.filter(s => s.status === 'done').length;

    // Build message including errors and warnings
    let message = '';
    if (errors.length > 0) {
      message = `Updated ${updatedCount} steps with ${errors.length} errors: ${errors.join(', ')}`;
    } else if (pendingSteps > 0) {
      message = `Updated ${updatedCount} steps. ${pendingSteps} pending, ${doneSteps} done.`;
    } else if (shouldHandoff) {
      message = `⚠️ All steps complete. You MUST handoff to ${boundaries.must_handoff_to.join(' or ')} before calling complete_agent.`;
    } else {
      message = 'All steps complete. You may archive the plan.';
    }

    // Append warnings if present
    if (warnings.length > 0) {
      message += `\n⚠️ Warnings: ${warnings.join('; ')}`;
    }

    return {
      success: true,
      data: {
        updated_count: updatedCount,
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: shouldHandoff && pendingSteps === 0,
          handoff_to: boundaries.must_handoff_to.length > 0 ? boundaries.must_handoff_to : undefined,
          message
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to batch update steps: ${(error as Error).message}`
    };
  }
}

/**
 * Modify the plan's steps (used by Revisionist/Architect)
 * Returns role_boundaries to remind agent of their constraints
 */
export async function modifyPlan(
  params: ModifyPlanParams
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, new_steps } = params;

    if (!workspace_id || !plan_id || !new_steps) {
      return {
        success: false,
        error: 'workspace_id, plan_id, and new_steps are required'
      };
    }

    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }

    // Get current agent's boundaries
    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];

    // SAFEGUARD: Prevent accidental mass deletion of steps
    const existingStepCount = state.steps.length;
    const newStepCount = new_steps.length;
    const completedSteps = state.steps.filter(s => s.status === 'done').length;

    // If plan has significant work done and new steps would lose >50% of them, require confirmation
    if (existingStepCount > 20 && newStepCount < existingStepCount * 0.5) {
      return {
        success: false,
        error: `SAFEGUARD: Refusing to replace ${existingStepCount} steps (${completedSteps} done) with only ${newStepCount} steps. ` +
          `This would lose ${existingStepCount - newStepCount} steps. ` +
          `If you intend to ADD steps to a specific phase, use batch_update_steps instead. ` +
          `If you truly need to replace all steps, first call archive_plan to preserve current state.`
      };
    }

    // If there are completed steps that would be lost, warn strongly
    if (completedSteps > 0 && newStepCount < existingStepCount) {
      const wouldLose = existingStepCount - newStepCount;
      console.warn(`[modify_plan] WARNING: Replacing ${existingStepCount} steps with ${newStepCount}. ${completedSteps} completed steps exist.`);
    }

    // Add index to each step
    const indexedSteps: PlanStep[] = new_steps.map((step, index) => ({
      ...step,
      index,
      status: step.status || 'pending'
    }));

    state.steps = indexedSteps;

    // Set current phase to first phase if available
    if (indexedSteps.length > 0) {
      state.current_phase = indexedSteps[0].phase;
    }

    // Build phases and match skills (non-fatal)
    try {
      const workspace = await store.getWorkspace(workspace_id);
      if (workspace?.path) {
        state.phases = await applySkillPhaseMatching(workspace.path, indexedSteps);
      }
    } catch {
      // Non-fatal — skill matching failure should not block plan modification
    }

    // Auto-upgrade detection: suggest program upgrade for large plans
    await checkProgramUpgradeSuggestion(state);

    await store.savePlanState(state);
    await store.generatePlanMd(state);

    // Determine next action - after modifying plan, usually need to handoff to implementer
    const shouldHandoff = !boundaries.can_implement;

    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: shouldHandoff,
          handoff_to: boundaries.must_handoff_to.length > 0 ? boundaries.must_handoff_to : undefined,
          message: shouldHandoff
            ? `⚠️ Plan created/modified. You are ${currentAgent} and CANNOT implement code. You MUST handoff to ${boundaries.must_handoff_to.join(' or ')} now.`
            : `Plan modified. ${indexedSteps.length} steps defined. You may proceed with implementation.`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to modify plan: ${(error as Error).message}`
    };
  }
}
