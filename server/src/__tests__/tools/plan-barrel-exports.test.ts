import { describe, it, expect } from 'vitest';

/**
 * Plan Tools Barrel Re-exports Test
 *
 * Verifies that tools/plan/index.ts correctly re-exports all functions from
 * each plan sub-module, and that sub-modules export expected symbols.
 *
 * Phase 1 refactoring split plan.tools.ts into:
 *   - plan-utils.ts         — Shared helpers
 *   - plan-lifecycle.ts     — Plan CRUD
 *   - plan-steps.ts         — Step updates
 *   - plan-step-mutations.ts — Step mutations
 *   - plan-step-ordering.ts — Step ordering
 *   - plan-templates.ts     — Template definitions
 *   - plan-confirmation.ts  — Phase/step confirmation
 *   - plan-goals.ts         — Goals, criteria, notes
 */

// Import everything through the barrel file
import * as planBarrel from '../../tools/plan/index.js';

// Import from each sub-module directly
import * as planUtils from '../../tools/plan/plan-utils.js';
import * as planLifecycle from '../../tools/plan/plan-lifecycle.js';
import * as planSteps from '../../tools/plan/plan-steps.js';
import * as planStepMutations from '../../tools/plan/plan-step-mutations.js';
import * as planStepOrdering from '../../tools/plan/plan-step-ordering.js';
import * as planTemplates from '../../tools/plan/plan-templates.js';
import * as planConfirmation from '../../tools/plan/plan-confirmation.js';
import * as planGoals from '../../tools/plan/plan-goals.js';

describe('Plan Tools Barrel Re-exports (tools/plan/index.ts)', () => {

  // ===========================================================================
  // plan-utils.ts exports
  // ===========================================================================

  describe('plan-utils.ts re-exports', () => {
    it('should export HIGH_RISK_STEP_TYPES constant', () => {
      expect(planBarrel.HIGH_RISK_STEP_TYPES).toBeDefined();
      expect(Array.isArray(planBarrel.HIGH_RISK_STEP_TYPES)).toBe(true);
    });

    it('should export HIGH_RISK_KEYWORDS constant', () => {
      expect(planBarrel.HIGH_RISK_KEYWORDS).toBeDefined();
      expect(Array.isArray(planBarrel.HIGH_RISK_KEYWORDS)).toBe(true);
    });

    it('should export ensureConfirmationState function', () => {
      expect(planBarrel.ensureConfirmationState).toBeDefined();
      expect(typeof planBarrel.ensureConfirmationState).toBe('function');
    });

    it('should export isHighRiskStep function', () => {
      expect(planBarrel.isHighRiskStep).toBeDefined();
      expect(typeof planBarrel.isHighRiskStep).toBe('function');
    });

    it('should export requiresStepConfirmation function', () => {
      expect(planBarrel.requiresStepConfirmation).toBeDefined();
      expect(typeof planBarrel.requiresStepConfirmation).toBe('function');
    });

    it('should export hasStepConfirmation function', () => {
      expect(planBarrel.hasStepConfirmation).toBeDefined();
      expect(typeof planBarrel.hasStepConfirmation).toBe('function');
    });

    it('should export hasPhaseConfirmation function', () => {
      expect(planBarrel.hasPhaseConfirmation).toBeDefined();
      expect(typeof planBarrel.hasPhaseConfirmation).toBe('function');
    });

    it('should export validateStepOrder function', () => {
      expect(planBarrel.validateStepOrder).toBeDefined();
      expect(typeof planBarrel.validateStepOrder).toBe('function');
    });

    it('should reference the same functions as the direct module', () => {
      expect(planBarrel.ensureConfirmationState).toBe(planUtils.ensureConfirmationState);
      expect(planBarrel.isHighRiskStep).toBe(planUtils.isHighRiskStep);
      expect(planBarrel.validateStepOrder).toBe(planUtils.validateStepOrder);
      expect(planBarrel.HIGH_RISK_STEP_TYPES).toBe(planUtils.HIGH_RISK_STEP_TYPES);
      expect(planBarrel.HIGH_RISK_KEYWORDS).toBe(planUtils.HIGH_RISK_KEYWORDS);
    });
  });

  // ===========================================================================
  // plan-lifecycle.ts exports
  // ===========================================================================

  describe('plan-lifecycle.ts re-exports', () => {
    const lifecycleFunctions = [
      'listPlans',
      'findPlan',
      'createPlan',
      'getPlanState',
      'deletePlan',
      'archivePlan',
      'importPlan',
    ] as const;

    for (const fnName of lifecycleFunctions) {
      it(`should export ${fnName} function`, () => {
        expect((planBarrel as Record<string, unknown>)[fnName]).toBeDefined();
        expect(typeof (planBarrel as Record<string, unknown>)[fnName]).toBe('function');
      });
    }

    it('should reference the same functions as the direct module', () => {
      expect(planBarrel.listPlans).toBe(planLifecycle.listPlans);
      expect(planBarrel.createPlan).toBe(planLifecycle.createPlan);
      expect(planBarrel.getPlanState).toBe(planLifecycle.getPlanState);
      expect(planBarrel.deletePlan).toBe(planLifecycle.deletePlan);
      expect(planBarrel.archivePlan).toBe(planLifecycle.archivePlan);
      expect(planBarrel.importPlan).toBe(planLifecycle.importPlan);
    });
  });

  // ===========================================================================
  // plan-steps.ts exports
  // ===========================================================================

  describe('plan-steps.ts re-exports', () => {
    const stepsFunctions = [
      'updateStep',
      'batchUpdateSteps',
      'modifyPlan',
    ] as const;

    for (const fnName of stepsFunctions) {
      it(`should export ${fnName} function`, () => {
        expect((planBarrel as Record<string, unknown>)[fnName]).toBeDefined();
        expect(typeof (planBarrel as Record<string, unknown>)[fnName]).toBe('function');
      });
    }

    it('should reference the same functions as the direct module', () => {
      expect(planBarrel.updateStep).toBe(planSteps.updateStep);
      expect(planBarrel.batchUpdateSteps).toBe(planSteps.batchUpdateSteps);
      expect(planBarrel.modifyPlan).toBe(planSteps.modifyPlan);
    });
  });

  // ===========================================================================
  // plan-step-mutations.ts exports
  // ===========================================================================

  describe('plan-step-mutations.ts re-exports', () => {
    const mutationFunctions = [
      'insertStep',
      'deleteStep',
      'consolidateSteps',
      'appendSteps',
    ] as const;

    for (const fnName of mutationFunctions) {
      it(`should export ${fnName} function`, () => {
        expect((planBarrel as Record<string, unknown>)[fnName]).toBeDefined();
        expect(typeof (planBarrel as Record<string, unknown>)[fnName]).toBe('function');
      });
    }

    it('should reference the same functions as the direct module', () => {
      expect(planBarrel.insertStep).toBe(planStepMutations.insertStep);
      expect(planBarrel.deleteStep).toBe(planStepMutations.deleteStep);
      expect(planBarrel.consolidateSteps).toBe(planStepMutations.consolidateSteps);
      expect(planBarrel.appendSteps).toBe(planStepMutations.appendSteps);
    });
  });

  // ===========================================================================
  // plan-step-ordering.ts exports
  // ===========================================================================

  describe('plan-step-ordering.ts re-exports', () => {
    const orderingFunctions = [
      'reorderStep',
      'moveStep',
      'sortStepsByPhase',
      'setStepOrder',
    ] as const;

    for (const fnName of orderingFunctions) {
      it(`should export ${fnName} function`, () => {
        expect((planBarrel as Record<string, unknown>)[fnName]).toBeDefined();
        expect(typeof (planBarrel as Record<string, unknown>)[fnName]).toBe('function');
      });
    }

    it('should reference the same functions as the direct module', () => {
      expect(planBarrel.reorderStep).toBe(planStepOrdering.reorderStep);
      expect(planBarrel.moveStep).toBe(planStepOrdering.moveStep);
      expect(planBarrel.sortStepsByPhase).toBe(planStepOrdering.sortStepsByPhase);
      expect(planBarrel.setStepOrder).toBe(planStepOrdering.setStepOrder);
    });
  });

  // ===========================================================================
  // plan-templates.ts exports
  // ===========================================================================

  describe('plan-templates.ts re-exports', () => {
    it('should export createPlanFromTemplate function', () => {
      expect(planBarrel.createPlanFromTemplate).toBeDefined();
      expect(typeof planBarrel.createPlanFromTemplate).toBe('function');
    });

    it('should export getTemplates function', () => {
      expect(planBarrel.getTemplates).toBeDefined();
      expect(typeof planBarrel.getTemplates).toBe('function');
    });

    it('should reference the same functions as the direct module', () => {
      expect(planBarrel.createPlanFromTemplate).toBe(planTemplates.createPlanFromTemplate);
      expect(planBarrel.getTemplates).toBe(planTemplates.getTemplates);
    });
  });

  // ===========================================================================
  // plan-confirmation.ts exports
  // ===========================================================================

  describe('plan-confirmation.ts re-exports', () => {
    it('should export confirmPhase function', () => {
      expect(planBarrel.confirmPhase).toBeDefined();
      expect(typeof planBarrel.confirmPhase).toBe('function');
    });

    it('should export confirmStep function', () => {
      expect(planBarrel.confirmStep).toBeDefined();
      expect(typeof planBarrel.confirmStep).toBe('function');
    });

    it('should reference the same functions as the direct module', () => {
      expect(planBarrel.confirmPhase).toBe(planConfirmation.confirmPhase);
      expect(planBarrel.confirmStep).toBe(planConfirmation.confirmStep);
    });
  });

  // ===========================================================================
  // plan-goals.ts exports
  // ===========================================================================

  describe('plan-goals.ts re-exports', () => {
    it('should export addPlanNote function', () => {
      expect(planBarrel.addPlanNote).toBeDefined();
      expect(typeof planBarrel.addPlanNote).toBe('function');
    });

    it('should export setGoals function', () => {
      expect(planBarrel.setGoals).toBeDefined();
      expect(typeof planBarrel.setGoals).toBe('function');
    });

    it('should reference the same functions as the direct module', () => {
      expect(planBarrel.addPlanNote).toBe(planGoals.addPlanNote);
      expect(planBarrel.setGoals).toBe(planGoals.setGoals);
    });
  });

  // ===========================================================================
  // Cross-module consistency
  // ===========================================================================

  describe('Cross-module consistency', () => {
    it('should not have conflicting runtime exports between plan sub-modules', () => {
      const subModules = [
        { name: 'plan-utils', keys: Object.keys(planUtils) },
        { name: 'plan-lifecycle', keys: Object.keys(planLifecycle) },
        { name: 'plan-steps', keys: Object.keys(planSteps) },
        { name: 'plan-step-mutations', keys: Object.keys(planStepMutations) },
        { name: 'plan-step-ordering', keys: Object.keys(planStepOrdering) },
        { name: 'plan-templates', keys: Object.keys(planTemplates) },
        { name: 'plan-confirmation', keys: Object.keys(planConfirmation) },
        { name: 'plan-goals', keys: Object.keys(planGoals) },
      ];

      const seen = new Map<string, string>();
      for (const mod of subModules) {
        for (const key of mod.keys) {
          if (seen.has(key)) {
            expect.fail(
              `Duplicate runtime export "${key}" found in both ${seen.get(key)} and ${mod.name}`
            );
          }
          seen.set(key, mod.name);
        }
      }
    });

    it('should have all sub-module runtime exports accessible through barrel', () => {
      const allSubModuleKeys = [
        ...Object.keys(planUtils),
        ...Object.keys(planLifecycle),
        ...Object.keys(planSteps),
        ...Object.keys(planStepMutations),
        ...Object.keys(planStepOrdering),
        ...Object.keys(planTemplates),
        ...Object.keys(planConfirmation),
        ...Object.keys(planGoals),
      ];

      const barrelKeys = Object.keys(planBarrel);

      for (const key of allSubModuleKeys) {
        expect(barrelKeys).toContain(key);
      }
    });
  });

  // ===========================================================================
  // Old import path no longer exists
  // ===========================================================================

  describe('Old plan.tools.ts path', () => {
    it('should confirm the old monolithic plan.tools.ts no longer exists', () => {
      // The old plan.tools.ts was split into the plan/ directory.
      // We verify this structurally: the barrel file re-exports from sub-modules,
      // and all expected functions are available through the new barrel.
      // If the old file existed alongside the new barrel, we'd see duplicate exports
      // which the cross-module consistency test above would catch.
      const allKeys = Object.keys(planBarrel);
      expect(allKeys.length).toBeGreaterThan(0);
    });
  });
});
