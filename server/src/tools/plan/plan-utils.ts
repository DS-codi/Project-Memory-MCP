/**
 * Plan Utilities - Shared helpers for plan tools
 *
 * Common functions used across plan tool modules:
 * confirmation state management, step risk assessment, and order validation.
 */

import type {
  PlanState,
  PlanStep,
  ConfirmationState,
  StepType,
  OrderValidationWarning,
  ProgramAggregateProgress
} from '../../types/index.js';

// =============================================================================
// Constants
// =============================================================================

export const HIGH_RISK_STEP_TYPES: StepType[] = ['critical', 'build', 'validation'];
export const HIGH_RISK_KEYWORDS = ['delete', 'wipe', 'reset', 'drop', 'migrate'];

// =============================================================================
// Confirmation Helpers
// =============================================================================

export function ensureConfirmationState(state: PlanState): ConfirmationState {
  if (!state.confirmation_state) {
    state.confirmation_state = { phases: {}, steps: {} };
  }
  if (!state.confirmation_state.phases) {
    state.confirmation_state.phases = {};
  }
  if (!state.confirmation_state.steps) {
    state.confirmation_state.steps = {};
  }
  return state.confirmation_state;
}

export function isHighRiskStep(step: PlanStep): boolean {
  const stepType = step.type ?? 'standard';
  if (HIGH_RISK_STEP_TYPES.includes(stepType)) {
    return true;
  }

  const taskText = step.task.toLowerCase();
  if (HIGH_RISK_KEYWORDS.some(keyword => taskText.includes(keyword))) {
    return true;
  }

  return false;
}

export function requiresStepConfirmation(step: PlanStep): boolean {
  const stepType = step.type ?? 'standard';
  if (stepType === 'confirmation' || stepType === 'user_validation') {
    return true;
  }

  if (step.requires_confirmation || step.requires_user_confirmation) {
    return true;
  }

  return isHighRiskStep(step);
}

export function hasStepConfirmation(state: PlanState, stepIndex: number): boolean {
  const confirmationState = ensureConfirmationState(state);
  return confirmationState.steps[stepIndex]?.confirmed === true;
}

export function hasPhaseConfirmation(state: PlanState, phase: string): boolean {
  const confirmationState = ensureConfirmationState(state);
  return confirmationState.phases[phase]?.confirmed === true;
}

// =============================================================================
// Order Validation
// =============================================================================

/**
 * Validate step completion order
 * Returns warning if prior steps are not completed yet
 * This is a non-blocking warning, not an error
 */
export function validateStepOrder(steps: PlanStep[], completedIndex: number): OrderValidationWarning | null {
  // Find all prior steps (lower index) that are not done
  const priorPending = steps
    .filter(s => s.index < completedIndex && s.status !== 'done')
    .map(s => s.index);

  if (priorPending.length === 0) {
    return null;  // No warnings
  }

  return {
    step_completed: completedIndex,
    prior_pending: priorPending,
    message: `Step ${completedIndex} completed before prior steps: ${priorPending.join(', ')}. This may indicate out-of-order execution.`
  };
}

// =============================================================================
// Program Aggregate Progress
// =============================================================================

/**
 * Compute aggregate progress across a list of child plans
 */
export function computeAggregateProgress(childPlans: PlanState[]): ProgramAggregateProgress {
  let totalSteps = 0;
  let doneSteps = 0;
  let activeSteps = 0;
  let pendingSteps = 0;
  let blockedSteps = 0;
  let activePlans = 0;
  let completedPlans = 0;
  let archivedPlans = 0;
  let failedPlans = 0;

  for (const plan of childPlans) {
    switch (plan.status) {
      case 'active': activePlans++; break;
      case 'completed': completedPlans++; break;
      case 'archived': archivedPlans++; break;
      case 'failed': failedPlans++; break;
    }

    for (const step of plan.steps) {
      totalSteps++;
      switch (step.status) {
        case 'done': doneSteps++; break;
        case 'active': activeSteps++; break;
        case 'pending': pendingSteps++; break;
        case 'blocked': blockedSteps++; break;
      }
    }
  }

  return {
    total_plans: childPlans.length,
    active_plans: activePlans,
    completed_plans: completedPlans,
    archived_plans: archivedPlans,
    failed_plans: failedPlans,
    total_steps: totalSteps,
    done_steps: doneSteps,
    active_steps: activeSteps,
    pending_steps: pendingSteps,
    blocked_steps: blockedSteps,
    completion_percentage: totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0,
  };
}
