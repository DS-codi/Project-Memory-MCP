import { describe, it, expect } from 'vitest';
import {
  ensureConfirmationState,
  isHighRiskStep,
  requiresStepConfirmation,
  hasStepConfirmation,
  hasPhaseConfirmation,
  validateStepOrder,
  HIGH_RISK_STEP_TYPES,
  HIGH_RISK_KEYWORDS,
} from '../../tools/plan/plan-utils.js';
import type { PlanState, PlanStep } from '../../types/index.js';

/**
 * Plan Utilities Test
 *
 * Tests for the shared helper functions in plan-utils.ts.
 * These are the foundation that other plan modules depend on.
 */

// ===========================================================================
// Test Fixtures
// ===========================================================================

function makePlanState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    id: 'plan_test',
    workspace_id: 'ws_test',
    title: 'Test Plan',
    description: 'A test plan',
    category: 'feature',
    priority: 'medium',
    status: 'active',
    current_phase: 'Phase 1',
    current_agent: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    steps: [],
    agent_sessions: [],
    lineage: [],
    ...overrides,
  };
}

function makeStep(overrides: Partial<PlanStep> = {}): PlanStep {
  return {
    index: 0,
    phase: 'Phase 1',
    task: 'Do something',
    status: 'pending',
    ...overrides,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Plan Utilities (plan-utils.ts)', () => {

  // =========================================================================
  // Constants
  // =========================================================================

  describe('Constants', () => {
    it('HIGH_RISK_STEP_TYPES should contain critical, build, and validation', () => {
      expect(HIGH_RISK_STEP_TYPES).toContain('critical');
      expect(HIGH_RISK_STEP_TYPES).toContain('build');
      expect(HIGH_RISK_STEP_TYPES).toContain('validation');
    });

    it('HIGH_RISK_KEYWORDS should contain destructive keywords', () => {
      expect(HIGH_RISK_KEYWORDS).toContain('delete');
      expect(HIGH_RISK_KEYWORDS).toContain('wipe');
      expect(HIGH_RISK_KEYWORDS).toContain('reset');
      expect(HIGH_RISK_KEYWORDS).toContain('drop');
      expect(HIGH_RISK_KEYWORDS).toContain('migrate');
    });
  });

  // =========================================================================
  // ensureConfirmationState
  // =========================================================================

  describe('ensureConfirmationState', () => {
    it('should create confirmation_state if missing', () => {
      const state = makePlanState({ confirmation_state: undefined });
      const result = ensureConfirmationState(state);

      expect(result).toBeDefined();
      expect(result.phases).toEqual({});
      expect(result.steps).toEqual({});
      expect(state.confirmation_state).toBe(result);
    });

    it('should preserve existing confirmation_state', () => {
      const existing = {
        phases: { 'Phase 1': { confirmed: true, confirmed_by: 'Tester', confirmed_at: '2026-01-01T00:00:00Z' } },
        steps: { 0: { confirmed: true, confirmed_by: 'Tester', confirmed_at: '2026-01-01T00:00:00Z' } },
      };
      const state = makePlanState({ confirmation_state: existing });
      const result = ensureConfirmationState(state);

      expect(result.phases['Phase 1'].confirmed).toBe(true);
      expect(result.steps[0].confirmed).toBe(true);
    });

    it('should add missing phases sub-object', () => {
      const state = makePlanState({
        confirmation_state: { steps: {} } as any,
      });
      const result = ensureConfirmationState(state);

      expect(result.phases).toEqual({});
      expect(result.steps).toEqual({});
    });

    it('should add missing steps sub-object', () => {
      const state = makePlanState({
        confirmation_state: { phases: {} } as any,
      });
      const result = ensureConfirmationState(state);

      expect(result.phases).toEqual({});
      expect(result.steps).toEqual({});
    });
  });

  // =========================================================================
  // isHighRiskStep
  // =========================================================================

  describe('isHighRiskStep', () => {
    it('should return true for critical step type', () => {
      expect(isHighRiskStep(makeStep({ type: 'critical' }))).toBe(true);
    });

    it('should return true for build step type', () => {
      expect(isHighRiskStep(makeStep({ type: 'build' }))).toBe(true);
    });

    it('should return true for validation step type', () => {
      expect(isHighRiskStep(makeStep({ type: 'validation' }))).toBe(true);
    });

    it('should return false for standard step type', () => {
      expect(isHighRiskStep(makeStep({ type: 'standard' }))).toBe(false);
    });

    it('should return false for step with no type (defaults to standard)', () => {
      expect(isHighRiskStep(makeStep())).toBe(false);
    });

    it('should return true for task containing "delete"', () => {
      expect(isHighRiskStep(makeStep({ task: 'Delete all old records' }))).toBe(true);
    });

    it('should return true for task containing "wipe"', () => {
      expect(isHighRiskStep(makeStep({ task: 'Wipe the database' }))).toBe(true);
    });

    it('should return true for task containing "reset"', () => {
      expect(isHighRiskStep(makeStep({ task: 'Reset user passwords' }))).toBe(true);
    });

    it('should return true for task containing "drop"', () => {
      expect(isHighRiskStep(makeStep({ task: 'Drop the staging table' }))).toBe(true);
    });

    it('should return true for task containing "migrate"', () => {
      expect(isHighRiskStep(makeStep({ task: 'Migrate legacy data' }))).toBe(true);
    });

    it('should be case-insensitive for keyword matching', () => {
      expect(isHighRiskStep(makeStep({ task: 'DELETE all files' }))).toBe(true);
      expect(isHighRiskStep(makeStep({ task: 'WIPE cache' }))).toBe(true);
    });

    it('should return false for task without risky keywords', () => {
      expect(isHighRiskStep(makeStep({ task: 'Add new feature' }))).toBe(false);
    });
  });

  // =========================================================================
  // requiresStepConfirmation
  // =========================================================================

  describe('requiresStepConfirmation', () => {
    it('should return true for confirmation step type', () => {
      expect(requiresStepConfirmation(makeStep({ type: 'confirmation' }))).toBe(true);
    });

    it('should return true for user_validation step type', () => {
      expect(requiresStepConfirmation(makeStep({ type: 'user_validation' }))).toBe(true);
    });

    it('should return true when requires_confirmation is set', () => {
      expect(requiresStepConfirmation(makeStep({ requires_confirmation: true }))).toBe(true);
    });

    it('should return true when requires_user_confirmation is set', () => {
      expect(requiresStepConfirmation(makeStep({ requires_user_confirmation: true }))).toBe(true);
    });

    it('should return true for high-risk steps', () => {
      expect(requiresStepConfirmation(makeStep({ type: 'critical' }))).toBe(true);
    });

    it('should return true for steps with high-risk keywords', () => {
      expect(requiresStepConfirmation(makeStep({ task: 'Delete old data' }))).toBe(true);
    });

    it('should return false for standard non-risky step', () => {
      expect(requiresStepConfirmation(makeStep({ type: 'standard', task: 'Implement widget' }))).toBe(false);
    });

    it('should return false for step with no type and no risky content', () => {
      expect(requiresStepConfirmation(makeStep({ task: 'Write documentation' }))).toBe(false);
    });
  });

  // =========================================================================
  // hasStepConfirmation
  // =========================================================================

  describe('hasStepConfirmation', () => {
    it('should return false when no confirmation state exists', () => {
      const state = makePlanState();
      expect(hasStepConfirmation(state, 0)).toBe(false);
    });

    it('should return false when step has not been confirmed', () => {
      const state = makePlanState({
        confirmation_state: { phases: {}, steps: {} },
      });
      expect(hasStepConfirmation(state, 0)).toBe(false);
    });

    it('should return true when step has been confirmed', () => {
      const state = makePlanState({
        confirmation_state: {
          phases: {},
          steps: {
            0: { confirmed: true, confirmed_by: 'User', confirmed_at: '2026-01-01T00:00:00Z' },
          },
        },
      });
      expect(hasStepConfirmation(state, 0)).toBe(true);
    });

    it('should return false for a different step index', () => {
      const state = makePlanState({
        confirmation_state: {
          phases: {},
          steps: {
            0: { confirmed: true, confirmed_by: 'User', confirmed_at: '2026-01-01T00:00:00Z' },
          },
        },
      });
      expect(hasStepConfirmation(state, 1)).toBe(false);
    });
  });

  // =========================================================================
  // hasPhaseConfirmation
  // =========================================================================

  describe('hasPhaseConfirmation', () => {
    it('should return false when no confirmation state exists', () => {
      const state = makePlanState();
      expect(hasPhaseConfirmation(state, 'Phase 1')).toBe(false);
    });

    it('should return false when phase has not been confirmed', () => {
      const state = makePlanState({
        confirmation_state: { phases: {}, steps: {} },
      });
      expect(hasPhaseConfirmation(state, 'Phase 1')).toBe(false);
    });

    it('should return true when phase has been confirmed', () => {
      const state = makePlanState({
        confirmation_state: {
          phases: {
            'Phase 1': { confirmed: true, confirmed_by: 'User', confirmed_at: '2026-01-01T00:00:00Z' },
          },
          steps: {},
        },
      });
      expect(hasPhaseConfirmation(state, 'Phase 1')).toBe(true);
    });

    it('should return false for a different phase', () => {
      const state = makePlanState({
        confirmation_state: {
          phases: {
            'Phase 1': { confirmed: true, confirmed_by: 'User', confirmed_at: '2026-01-01T00:00:00Z' },
          },
          steps: {},
        },
      });
      expect(hasPhaseConfirmation(state, 'Phase 2')).toBe(false);
    });
  });

  // =========================================================================
  // validateStepOrder
  // =========================================================================

  describe('validateStepOrder', () => {
    it('should return null when all prior steps are done', () => {
      const steps: PlanStep[] = [
        makeStep({ index: 0, status: 'done' }),
        makeStep({ index: 1, status: 'done' }),
        makeStep({ index: 2, status: 'active' }),
      ];
      expect(validateStepOrder(steps, 2)).toBeNull();
    });

    it('should return null when completing the first step', () => {
      const steps: PlanStep[] = [
        makeStep({ index: 0, status: 'active' }),
        makeStep({ index: 1, status: 'pending' }),
      ];
      expect(validateStepOrder(steps, 0)).toBeNull();
    });

    it('should return warning when prior steps are still pending', () => {
      const steps: PlanStep[] = [
        makeStep({ index: 0, status: 'pending' }),
        makeStep({ index: 1, status: 'pending' }),
        makeStep({ index: 2, status: 'active' }),
      ];
      const warning = validateStepOrder(steps, 2);

      expect(warning).not.toBeNull();
      expect(warning!.step_completed).toBe(2);
      expect(warning!.prior_pending).toContain(0);
      expect(warning!.prior_pending).toContain(1);
      expect(warning!.message).toContain('Step 2');
    });

    it('should only include non-done steps in prior_pending', () => {
      const steps: PlanStep[] = [
        makeStep({ index: 0, status: 'done' }),
        makeStep({ index: 1, status: 'active' }),
        makeStep({ index: 2, status: 'pending' }),
        makeStep({ index: 3, status: 'active' }),
      ];
      const warning = validateStepOrder(steps, 3);

      expect(warning).not.toBeNull();
      expect(warning!.prior_pending).toEqual([1, 2]);
      expect(warning!.prior_pending).not.toContain(0);
    });

    it('should return null when there are no prior steps', () => {
      const steps: PlanStep[] = [
        makeStep({ index: 0, status: 'active' }),
      ];
      expect(validateStepOrder(steps, 0)).toBeNull();
    });

    it('should include blocked steps in prior_pending', () => {
      const steps: PlanStep[] = [
        makeStep({ index: 0, status: 'blocked' }),
        makeStep({ index: 1, status: 'active' }),
      ];
      const warning = validateStepOrder(steps, 1);

      expect(warning).not.toBeNull();
      expect(warning!.prior_pending).toContain(0);
    });
  });
});
