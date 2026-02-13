import { describe, it, expect } from 'vitest';
import { AGENT_BOUNDARIES } from '../../types/index.js';
import type { PlanState } from '../../types/index.js';
import type { BuilderHandoffData } from '../../types/common.types.js';

/**
 * Reviewer Build-Mode Types — runtime shape and interface checks for Phase 2 additions.
 *
 * Coverage:
 * 1. BuilderHandoffData interface required/optional fields (deprecated, now used by Reviewer build-mode)
 * 2. AGENT_BOUNDARIES.Reviewer deployment_modes
 * 3. pre_plan_build_status field on PlanState
 */
describe('Phase 2: Reviewer Build-Mode Types & Interfaces', () => {

  // ===========================================================================
  // BuilderHandoffData interface
  // ===========================================================================

  describe('BuilderHandoffData interface', () => {
    it('should accept a minimal valid object with required fields', () => {
      const data: BuilderHandoffData = {
        recommendation: 'Reviewer',
        mode: 'final_verification',
        build_success: true,
        scripts_run: ['build'],
      };

      expect(data.recommendation).toBe('Reviewer');
      expect(data.mode).toBe('final_verification');
      expect(data.build_success).toBe(true);
      expect(data.scripts_run).toEqual(['build']);
    });

    it('should accept optional build_instructions field', () => {
      const data: BuilderHandoffData = {
        recommendation: 'Archivist',
        mode: 'final_verification',
        build_success: true,
        scripts_run: ['build', 'lint'],
        build_instructions: 'Run `npm run build` to compile.',
      };

      expect(data.build_instructions).toBe('Run `npm run build` to compile.');
    });

    it('should accept optional optimization_suggestions field', () => {
      const data: BuilderHandoffData = {
        recommendation: 'Reviewer',
        mode: 'final_verification',
        build_success: true,
        scripts_run: ['build'],
        optimization_suggestions: [
          'Enable tree-shaking for smaller bundle',
          'Add caching headers for static assets',
        ],
      };

      expect(data.optimization_suggestions).toHaveLength(2);
      expect(data.optimization_suggestions![0]).toContain('tree-shaking');
    });

    it('should accept optional dependency_notes field', () => {
      const data: BuilderHandoffData = {
        recommendation: 'Reviewer',
        mode: 'final_verification',
        build_success: true,
        scripts_run: ['build'],
        dependency_notes: [
          'typescript@5.3.0 — no known vulnerabilities',
          'vitest@1.0.0 — dev dependency only',
        ],
      };

      expect(data.dependency_notes).toHaveLength(2);
    });

    it('should accept optional regression_report field', () => {
      const data: BuilderHandoffData = {
        recommendation: 'Revisionist',
        mode: 'regression_check',
        build_success: false,
        scripts_run: ['build'],
        regression_report: {
          errors: [
            { file: 'src/index.ts', line: 42, message: 'Type error' },
          ],
          suspected_step: {
            index: 3,
            phase: 'Implementation',
            task: 'Add new parser',
            confidence: 'high',
            reasoning: 'Error is in newly added file',
          },
          regression_summary: 'Build broke after step 3 — 1 type error introduced',
        },
      };

      expect(data.regression_report).toBeDefined();
      expect(data.regression_report!.errors).toHaveLength(1);
      expect(data.regression_report!.suspected_step?.confidence).toBe('high');
      expect(data.regression_report!.regression_summary).toContain('step 3');
    });

    it('should support both regression_check and final_verification modes', () => {
      const regression: BuilderHandoffData = {
        recommendation: 'Revisionist',
        mode: 'regression_check',
        build_success: false,
        scripts_run: ['build'],
      };

      const finalVerify: BuilderHandoffData = {
        recommendation: 'Archivist',
        mode: 'final_verification',
        build_success: true,
        scripts_run: ['build', 'test'],
      };

      expect(regression.mode).toBe('regression_check');
      expect(finalVerify.mode).toBe('final_verification');
    });

    it('should support all recommendation targets', () => {
      const targets: BuilderHandoffData['recommendation'][] = [
        'Reviewer',
        'Revisionist',
        'Archivist',
      ];

      for (const target of targets) {
        const data: BuilderHandoffData = {
          recommendation: target,
          mode: 'final_verification',
          build_success: true,
          scripts_run: [],
        };
        expect(data.recommendation).toBe(target);
      }
    });
  });

  // ===========================================================================
  // AGENT_BOUNDARIES.Reviewer — deployment_modes (formerly Builder)
  // ===========================================================================

  describe('AGENT_BOUNDARIES.Reviewer', () => {
    it('should exist in AGENT_BOUNDARIES', () => {
      expect(AGENT_BOUNDARIES).toHaveProperty('Reviewer');
    });

    it('should have correct agent_type', () => {
      expect(AGENT_BOUNDARIES.Reviewer.agent_type).toBe('Reviewer');
    });

    it('should not be allowed to implement', () => {
      expect(AGENT_BOUNDARIES.Reviewer.can_implement).toBe(false);
    });

    it('should forbid file creation, code editing, and feature implementation', () => {
      const forbidden = AGENT_BOUNDARIES.Reviewer.forbidden_actions;
      expect(forbidden).toContain('create files');
      expect(forbidden).toContain('edit code');
      expect(forbidden).toContain('implement features');
    });

    it('should have deployment_modes property', () => {
      const reviewer = AGENT_BOUNDARIES.Reviewer as typeof AGENT_BOUNDARIES.Reviewer & {
        deployment_modes: string[];
      };
      expect(reviewer.deployment_modes).toBeDefined();
      expect(Array.isArray(reviewer.deployment_modes)).toBe(true);
    });

    it('should include regression_check and final_verification in deployment_modes', () => {
      const reviewer = AGENT_BOUNDARIES.Reviewer as typeof AGENT_BOUNDARIES.Reviewer & {
        deployment_modes: string[];
      };
      expect(reviewer.deployment_modes).toContain('regression_check');
      expect(reviewer.deployment_modes).toContain('final_verification');
    });

    it('should list Tester and Coordinator as handoff targets', () => {
      expect(AGENT_BOUNDARIES.Reviewer.must_handoff_to).toContain('Tester');
      expect(AGENT_BOUNDARIES.Reviewer.must_handoff_to).toContain('Coordinator');
    });

    it('should mention build and regression in primary_responsibility', () => {
      const resp = AGENT_BOUNDARIES.Reviewer.primary_responsibility;
      expect(resp).toContain('build');
      expect(resp).toContain('regression');
    });
  });

  // ===========================================================================
  // pre_plan_build_status on PlanState
  // ===========================================================================

  describe('PlanState.pre_plan_build_status', () => {
    it('should allow creating a PlanState without pre_plan_build_status (optional field)', () => {
      const state: Partial<PlanState> = {
        id: 'plan_test',
        workspace_id: 'ws_test',
        title: 'Test',
        status: 'active',
        steps: [],
      };

      // The field is optional — omitting it should be valid
      expect(state.pre_plan_build_status).toBeUndefined();
    });

    it('should accept "passing" as pre_plan_build_status', () => {
      const state = { pre_plan_build_status: 'passing' as const };
      expect(state.pre_plan_build_status).toBe('passing');
    });

    it('should accept "failing" as pre_plan_build_status', () => {
      const state = { pre_plan_build_status: 'failing' as const };
      expect(state.pre_plan_build_status).toBe('failing');
    });

    it('should accept "unknown" as pre_plan_build_status', () => {
      const state = { pre_plan_build_status: 'unknown' as const };
      expect(state.pre_plan_build_status).toBe('unknown');
    });

    it('should be included in a full PlanState object', () => {
      const state: Pick<PlanState, 'pre_plan_build_status'> = {
        pre_plan_build_status: 'passing',
      };

      expect(state.pre_plan_build_status).toBe('passing');
    });
  });
});
