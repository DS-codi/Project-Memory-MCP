import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validatePlanDependencies } from '../../tools/plan/plan-programs.js';
import * as store from '../../storage/file-store.js';
import type { PlanState } from '../../types/index.js';

/**
 * Plan Dependencies Test
 *
 * Tests for validatePlanDependencies and the internal hasDependencyPath
 * DFS cycle-detection logic used in depends_on_plans validation.
 */

vi.mock('../../storage/file-store.js');

// ===========================================================================
// Fixtures
// ===========================================================================

const WS = 'ws_deps_test';

function makePlan(overrides: Partial<PlanState> = {}): PlanState {
  return {
    id: 'plan_default',
    workspace_id: WS,
    title: 'Test Plan',
    description: 'desc',
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

// ===========================================================================
// Tests
// ===========================================================================

describe('Plan Dependency Validation (validatePlanDependencies)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Direct cycles
  // =========================================================================

  describe('direct cycles', () => {
    it('should detect self-dependency (plan depends on itself)', async () => {
      const result = await validatePlanDependencies(WS, 'plan_A', ['plan_A']);

      // planId === depId shortcut triggers immediately
      expect(result).toBe('plan_A');
    });

    it('should detect direct two-node cycle (A depends on B, B depends on A)', async () => {
      // plan_A wants to depend on plan_B, but plan_B already depends on plan_A
      const planB = makePlan({
        id: 'plan_B',
        depends_on_plans: ['plan_A'],
      });

      vi.mocked(store.getPlanState).mockResolvedValueOnce(planB);

      const result = await validatePlanDependencies(WS, 'plan_A', ['plan_B']);

      // hasDependencyPath(plan_B → plan_A) should find plan_A
      expect(result).toBe('plan_B');
    });
  });

  // =========================================================================
  // Transitive cycles
  // =========================================================================

  describe('transitive cycles', () => {
    it('should detect transitive cycle (A→B→C→A)', async () => {
      // plan_A wants to depend on plan_B
      // plan_B depends on plan_C, plan_C depends on plan_A
      const planB = makePlan({ id: 'plan_B', depends_on_plans: ['plan_C'] });
      const planC = makePlan({ id: 'plan_C', depends_on_plans: ['plan_A'] });

      vi.mocked(store.getPlanState)
        .mockResolvedValueOnce(planB)   // hasDependencyPath loads plan_B
        .mockResolvedValueOnce(planC);  // hasDependencyPath loads plan_C → finds plan_A

      const result = await validatePlanDependencies(WS, 'plan_A', ['plan_B']);

      expect(result).toBe('plan_B');
    });

    it('should detect long transitive cycle (A→B→C→D→A)', async () => {
      const planB = makePlan({ id: 'plan_B', depends_on_plans: ['plan_C'] });
      const planC = makePlan({ id: 'plan_C', depends_on_plans: ['plan_D'] });
      const planD = makePlan({ id: 'plan_D', depends_on_plans: ['plan_A'] });

      vi.mocked(store.getPlanState)
        .mockResolvedValueOnce(planB)
        .mockResolvedValueOnce(planC)
        .mockResolvedValueOnce(planD);

      const result = await validatePlanDependencies(WS, 'plan_A', ['plan_B']);

      expect(result).toBe('plan_B');
    });
  });

  // =========================================================================
  // Valid dependency chains (no cycles)
  // =========================================================================

  describe('valid dependency chains', () => {
    it('should allow a simple valid chain (A depends on B, B has no deps)', async () => {
      const planB = makePlan({ id: 'plan_B' });
      // No depends_on_plans

      vi.mocked(store.getPlanState).mockResolvedValueOnce(planB);

      const result = await validatePlanDependencies(WS, 'plan_A', ['plan_B']);

      expect(result).toBeNull();
    });

    it('should allow a multi-hop valid chain (A→B→C, no cycle)', async () => {
      const planB = makePlan({ id: 'plan_B', depends_on_plans: ['plan_C'] });
      const planC = makePlan({ id: 'plan_C' });

      vi.mocked(store.getPlanState)
        .mockResolvedValueOnce(planB)
        .mockResolvedValueOnce(planC);

      const result = await validatePlanDependencies(WS, 'plan_A', ['plan_B']);

      expect(result).toBeNull();
    });

    it('should allow multiple independent dependencies', async () => {
      // plan_A depends on both plan_B and plan_C (neither cycles back)
      const planB = makePlan({ id: 'plan_B' });
      const planC = makePlan({ id: 'plan_C' });

      vi.mocked(store.getPlanState)
        .mockResolvedValueOnce(planB)
        .mockResolvedValueOnce(planC);

      const result = await validatePlanDependencies(WS, 'plan_A', [
        'plan_B',
        'plan_C',
      ]);

      expect(result).toBeNull();
    });

    it('should handle missing plan gracefully (returns null, not crash)', async () => {
      // plan_B doesn't exist on disk
      vi.mocked(store.getPlanState).mockResolvedValueOnce(null);

      const result = await validatePlanDependencies(WS, 'plan_A', ['plan_B']);

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('should return null for empty dependency list', async () => {
      const result = await validatePlanDependencies(WS, 'plan_A', []);

      expect(result).toBeNull();
    });

    it('should detect cycle only through the offending depId among mixed deps', async () => {
      // plan_A depends on [plan_B, plan_C]
      // plan_B is fine, plan_C cycles back to plan_A
      const planB = makePlan({ id: 'plan_B' });
      const planC = makePlan({ id: 'plan_C', depends_on_plans: ['plan_A'] });

      vi.mocked(store.getPlanState)
        .mockResolvedValueOnce(planB)   // check plan_B — clean
        .mockResolvedValueOnce(planC);  // check plan_C — cycle

      const result = await validatePlanDependencies(WS, 'plan_A', [
        'plan_B',
        'plan_C',
      ]);

      expect(result).toBe('plan_C');
    });
  });
});
