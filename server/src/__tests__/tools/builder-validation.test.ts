import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateBuilder } from '../../tools/agent-validation.tools.js';
import type { PlanState, PlanStep } from '../../types/index.js';

// Mock the file store
vi.mock('../../storage/file-store.js');

import * as store from '../../storage/file-store.js';

// =============================================================================
// Test Helpers
// =============================================================================

function makeStep(overrides: Partial<PlanStep> & { index: number }): PlanStep {
  return {
    phase: 'Implementation',
    task: 'Implement feature',
    status: 'done',
    ...overrides,
  };
}

/**
 * Build a minimal PlanState with sensible defaults for Builder validation tests.
 * Callers override only the fields they care about.
 */
function makePlanState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    id: 'plan_test_001',
    workspace_id: 'ws_test',
    title: 'Test Plan',
    description: 'A test plan for builder validation',
    priority: 'medium',
    status: 'active',
    category: 'feature',
    current_phase: 'Build',
    current_agent: 'Builder',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    agent_sessions: [],
    lineage: [],
    steps: [
      makeStep({ index: 0, phase: 'Implementation', task: 'Implement feature', status: 'done' }),
      makeStep({ index: 1, phase: 'Build', task: 'Verify build', status: 'pending', type: 'build' }),
    ],
    deployment_context: {
      deployed_agent: 'Builder',
      deployed_by: 'Coordinator',
      reason: 'End-of-plan build verification',
      override_validation: true,
      deployed_at: new Date().toISOString(),
    },
    ...overrides,
  } as PlanState;
}

const PARAMS = { workspace_id: 'ws_test', plan_id: 'plan_test_001' };

// =============================================================================
// Tests
// =============================================================================

describe('Builder Validation — validateBuilderMode & isEndOfPlanDeployment', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: no build scripts registered
    vi.mocked(store.getBuildScripts).mockResolvedValue([]);
  });

  // ---------------------------------------------------------------------------
  // End-of-plan (final_verification) mode
  // ---------------------------------------------------------------------------

  describe('End-of-plan deployment (final_verification)', () => {
    it('should accept end-of-plan deployment without warnings', async () => {
      const state = makePlanState({
        steps: [
          // All non-build steps are done
          makeStep({ index: 0, phase: 'Research', task: 'Gather info', status: 'done' }),
          makeStep({ index: 1, phase: 'Implementation', task: 'Implement', status: 'done' }),
          makeStep({ index: 2, phase: 'Build', task: 'Verify build', status: 'pending', type: 'build' }),
        ],
      });
      vi.mocked(store.getPlanState).mockResolvedValue(state);
      vi.mocked(store.getBuildScripts).mockResolvedValue([
        { id: 'bs1', name: 'build', command: 'npm run build', directory: '.', created_at: new Date().toISOString() },
      ] as any);

      const result = await validateBuilder(PARAMS);

      expect(result.success).toBe(true);
      expect(result.data?.action).toBe('continue');
      // final_verification mode should appear in instructions
      expect(result.data?.instructions).toContain('final verification');
    });

    it('should include user-facing build instructions guidance in final_verification mode', async () => {
      const state = makePlanState({
        steps: [
          makeStep({ index: 0, phase: 'Implementation', task: 'Implement', status: 'done' }),
          makeStep({ index: 1, phase: 'Build', task: 'Compile project', status: 'pending', type: 'build' }),
        ],
      });
      vi.mocked(store.getPlanState).mockResolvedValue(state);
      vi.mocked(store.getBuildScripts).mockResolvedValue([
        { id: 'bs1', name: 'build', command: 'npm run build', directory: '.', created_at: new Date().toISOString() },
      ] as any);

      const result = await validateBuilder(PARAMS);

      expect(result.success).toBe(true);
      expect(result.data?.instructions).toContain('build instructions');
      expect(result.data?.instructions).toContain('optimization suggestions');
      expect(result.data?.instructions).toContain('dependency notes');
    });
  });

  // ---------------------------------------------------------------------------
  // isEndOfPlanDeployment — correctly determines plan position
  // ---------------------------------------------------------------------------

  describe('isEndOfPlanDeployment detection', () => {
    it('should detect end-of-plan when all non-build steps are done', async () => {
      const state = makePlanState({
        steps: [
          makeStep({ index: 0, phase: 'Design', task: 'Design API', status: 'done' }),
          makeStep({ index: 1, phase: 'Implementation', task: 'Implement API', status: 'done' }),
          makeStep({ index: 2, phase: 'Review', task: 'Review code', status: 'done' }),
          makeStep({ index: 3, phase: 'Build', task: 'Final build', status: 'pending', type: 'build' }),
        ],
      });
      vi.mocked(store.getPlanState).mockResolvedValue(state);
      vi.mocked(store.getBuildScripts).mockResolvedValue([
        { id: 'bs1', name: 'build', command: 'npm run build', directory: '.', created_at: new Date().toISOString() },
      ] as any);

      const result = await validateBuilder(PARAMS);

      expect(result.success).toBe(true);
      // Should get final_verification mode (no regression warnings)
      expect(result.data?.instructions).toContain('final verification');
    });

    it('should detect mid-plan when some non-build steps are still pending', async () => {
      const state = makePlanState({
        steps: [
          makeStep({ index: 0, phase: 'Implementation', task: 'Implement feature A', status: 'done' }),
          makeStep({ index: 1, phase: 'Implementation', task: 'Implement feature B', status: 'pending' }),
          makeStep({ index: 2, phase: 'Build', task: 'Regression check', status: 'pending', type: 'build' }),
        ],
        deployment_context: {
          deployed_agent: 'Builder',
          deployed_by: 'Coordinator',
          reason: 'Mid-plan regression check',
          override_validation: true,
          deployed_at: new Date().toISOString(),
        },
        pre_plan_build_status: 'passing',
      });
      vi.mocked(store.getPlanState).mockResolvedValue(state);
      vi.mocked(store.getBuildScripts).mockResolvedValue([
        { id: 'bs1', name: 'build', command: 'npm run build', directory: '.', created_at: new Date().toISOString() },
      ] as any);

      const result = await validateBuilder(PARAMS);

      expect(result.success).toBe(true);
      // Should get regression_check mode
      expect(result.data?.instructions).toContain('regression');
    });
  });

  // ---------------------------------------------------------------------------
  // Mid-plan regression check — pre_plan_build_status = 'passing'
  // ---------------------------------------------------------------------------

  describe('Mid-plan regression check with pre_plan_build_status="passing"', () => {
    it('should accept without warnings', async () => {
      const state = makePlanState({
        steps: [
          makeStep({ index: 0, phase: 'Implementation', task: 'Part A', status: 'done' }),
          makeStep({ index: 1, phase: 'Implementation', task: 'Part B', status: 'pending' }),
          makeStep({ index: 2, phase: 'Build', task: 'Regression check', status: 'pending', type: 'build' }),
        ],
        deployment_context: {
          deployed_agent: 'Builder',
          deployed_by: 'Coordinator',
          reason: 'regression check between phases',
          override_validation: true,
          deployed_at: new Date().toISOString(),
        },
        pre_plan_build_status: 'passing',
      });
      vi.mocked(store.getPlanState).mockResolvedValue(state);
      vi.mocked(store.getBuildScripts).mockResolvedValue([
        { id: 'bs1', name: 'build', command: 'npm run build', directory: '.', created_at: new Date().toISOString() },
      ] as any);

      const result = await validateBuilder(PARAMS);

      expect(result.success).toBe(true);
      expect(result.data?.action).toBe('continue');
      // Should NOT contain pre_plan_build_status warnings
      const warnings = result.data?.warnings ?? [];
      const buildStatusWarnings = warnings.filter(
        (w: string) => w.includes('pre_plan_build_status')
      );
      expect(buildStatusWarnings).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Mid-plan deployment — pre_plan_build_status = 'failing'
  // ---------------------------------------------------------------------------

  describe('Mid-plan deployment with pre_plan_build_status="failing"', () => {
    it('should warn about false positives', async () => {
      const state = makePlanState({
        steps: [
          makeStep({ index: 0, phase: 'Implementation', task: 'Part A', status: 'done' }),
          makeStep({ index: 1, phase: 'Implementation', task: 'Part B', status: 'pending' }),
          makeStep({ index: 2, phase: 'Build', task: 'Regression check', status: 'pending', type: 'build' }),
        ],
        deployment_context: {
          deployed_agent: 'Builder',
          deployed_by: 'Coordinator',
          reason: 'regression check between phases',
          override_validation: true,
          deployed_at: new Date().toISOString(),
        },
        pre_plan_build_status: 'failing',
      });
      vi.mocked(store.getPlanState).mockResolvedValue(state);
      vi.mocked(store.getBuildScripts).mockResolvedValue([
        { id: 'bs1', name: 'build', command: 'npm run build', directory: '.', created_at: new Date().toISOString() },
      ] as any);

      const result = await validateBuilder(PARAMS);

      expect(result.success).toBe(true);
      expect(result.data?.action).toBe('continue');
      // Should have a warning about pre_plan_build_status being "failing"
      const warnings = result.data?.warnings ?? [];
      const failingWarning = warnings.find(
        (w: string) => w.includes('pre_plan_build_status') && w.includes('failing')
      );
      expect(failingWarning).toBeDefined();
      expect(failingWarning).toContain('false positives');
    });
  });

  // ---------------------------------------------------------------------------
  // Mid-plan deployment — pre_plan_build_status = 'unknown'
  // ---------------------------------------------------------------------------

  describe('Mid-plan deployment with pre_plan_build_status="unknown"', () => {
    it('should warn about unreliable results', async () => {
      const state = makePlanState({
        steps: [
          makeStep({ index: 0, phase: 'Implementation', task: 'Part A', status: 'done' }),
          makeStep({ index: 1, phase: 'Implementation', task: 'Part B', status: 'pending' }),
          makeStep({ index: 2, phase: 'Build', task: 'Regression check', status: 'pending', type: 'build' }),
        ],
        deployment_context: {
          deployed_agent: 'Builder',
          deployed_by: 'Coordinator',
          reason: 'regression check between phases',
          override_validation: true,
          deployed_at: new Date().toISOString(),
        },
        pre_plan_build_status: 'unknown',
      });
      vi.mocked(store.getPlanState).mockResolvedValue(state);
      vi.mocked(store.getBuildScripts).mockResolvedValue([
        { id: 'bs1', name: 'build', command: 'npm run build', directory: '.', created_at: new Date().toISOString() },
      ] as any);

      const result = await validateBuilder(PARAMS);

      expect(result.success).toBe(true);
      expect(result.data?.action).toBe('continue');
      // Should warn about unknown status
      const warnings = result.data?.warnings ?? [];
      const unknownWarning = warnings.find(
        (w: string) => w.includes('pre_plan_build_status') && w.includes('unknown')
      );
      expect(unknownWarning).toBeDefined();
      expect(unknownWarning).toContain('unreliable');
    });
  });

  // ---------------------------------------------------------------------------
  // Mid-plan deployment without regression justification
  // ---------------------------------------------------------------------------

  describe('Mid-plan deployment without regression justification', () => {
    it('should warn that Builder is primarily end-of-plan', async () => {
      const state = makePlanState({
        steps: [
          makeStep({ index: 0, phase: 'Implementation', task: 'Part A', status: 'done' }),
          makeStep({ index: 1, phase: 'Implementation', task: 'Part B', status: 'pending' }),
          makeStep({ index: 2, phase: 'Build', task: 'Build project', status: 'pending', type: 'build' }),
        ],
        deployment_context: {
          deployed_agent: 'Builder',
          deployed_by: 'Coordinator',
          reason: 'check build between phases',  // does NOT contain 'regression'
          override_validation: true,
          deployed_at: new Date().toISOString(),
        },
        // pre_plan_build_status not set
      });
      vi.mocked(store.getPlanState).mockResolvedValue(state);
      vi.mocked(store.getBuildScripts).mockResolvedValue([
        { id: 'bs1', name: 'build', command: 'npm run build', directory: '.', created_at: new Date().toISOString() },
      ] as any);

      const result = await validateBuilder(PARAMS);

      expect(result.success).toBe(true);
      const warnings = result.data?.warnings ?? [];
      const midPlanWarning = warnings.find(
        (w: string) => w.includes('mid-plan') || w.includes('end-of-plan')
      );
      expect(midPlanWarning).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Builder blocked when no build scripts registered
  // ---------------------------------------------------------------------------

  describe('Builder blocked without build scripts', () => {
    it('should block when build-related steps exist but no scripts registered', async () => {
      const state = makePlanState({
        steps: [
          makeStep({ index: 0, phase: 'Implementation', task: 'Implement', status: 'done' }),
          makeStep({ index: 1, phase: 'Build', task: 'Run build verification', status: 'pending', type: 'build' }),
        ],
      });
      vi.mocked(store.getPlanState).mockResolvedValue(state);
      vi.mocked(store.getBuildScripts).mockResolvedValue([]);

      const result = await validateBuilder(PARAMS);

      expect(result.success).toBe(false);
      expect(result.error).toContain('BLOCKED');
      expect(result.error).toContain('build scripts');
    });
  });

  // ---------------------------------------------------------------------------
  // Plan not found
  // ---------------------------------------------------------------------------

  describe('Error handling', () => {
    it('should fail gracefully when plan is not found', async () => {
      vi.mocked(store.getPlanState).mockResolvedValue(null);

      const result = await validateBuilder(PARAMS);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Plan not found');
    });

    it('should require workspace_id and plan_id', async () => {
      const result = await validateBuilder({ workspace_id: '', plan_id: '' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });
  });
});
