import { describe, it, expect } from 'vitest';

/**
 * Type Barrel Re-exports Test
 *
 * Verifies that types/index.ts correctly re-exports all types from each
 * domain module, and that domain modules export the expected symbols.
 *
 * Phase 1 refactoring split types/index.ts into:
 *   - agent.types.ts
 *   - build.types.ts
 *   - context.types.ts
 *   - plan.types.ts
 *   - workspace.types.ts
 *   - common.types.ts
 */

// Import everything through the barrel file
import * as barrel from '../../types/index.js';

// Import from each domain module directly
import * as agentTypes from '../../types/agent.types.js';
import * as buildTypes from '../../types/build.types.js';
import * as contextTypes from '../../types/context.types.js';
import * as planTypes from '../../types/plan.types.js';
import * as workspaceTypes from '../../types/workspace.types.js';
import * as commonTypes from '../../types/common.types.js';

describe('Types Barrel Re-exports (types/index.ts)', () => {

  // ===========================================================================
  // agent.types.ts exports
  // ===========================================================================

  describe('agent.types.ts re-exports', () => {
    it('should export AGENT_BOUNDARIES constant', () => {
      expect(barrel.AGENT_BOUNDARIES).toBeDefined();
      expect(typeof barrel.AGENT_BOUNDARIES).toBe('object');
    });

    it('should export AGENT_BOUNDARIES with all 14 agent types', () => {
      const expectedAgents = [
        'Coordinator', 'Analyst', 'Brainstorm', 'Runner',
        'Researcher', 'Architect', 'Executor',
        'Revisionist', 'Reviewer', 'Tester', 'Archivist',
        'SkillWriter', 'Worker', 'TDDDriver',
      ];
      for (const agent of expectedAgents) {
        expect(barrel.AGENT_BOUNDARIES).toHaveProperty(agent);
      }
    });

    it('should match direct module import', () => {
      expect(barrel.AGENT_BOUNDARIES).toBe(agentTypes.AGENT_BOUNDARIES);
    });

    it('should export AgentRoleBoundaries shape through barrel', () => {
      // Verify runtime shape of a boundary entry
      const coord = barrel.AGENT_BOUNDARIES.Coordinator;
      expect(coord).toHaveProperty('agent_type');
      expect(coord).toHaveProperty('can_implement');
      expect(coord).toHaveProperty('can_finalize');
      expect(coord).toHaveProperty('must_handoff_to');
      expect(coord).toHaveProperty('forbidden_actions');
      expect(coord).toHaveProperty('primary_responsibility');
    });
  });

  // ===========================================================================
  // build.types.ts exports (interfaces only — no runtime values to check)
  // ===========================================================================

  describe('build.types.ts re-exports', () => {
    it('should import barrel without errors (confirming build types are included)', () => {
      // build.types.ts only exports interfaces — no runtime values.
      // This test confirms the barrel re-export doesn't cause import errors.
      expect(barrel).toBeDefined();
    });

    it('should allow constructing a BuildScript-shaped object via barrel types', () => {
      // Type-level check: ensure the interface is accessible through barrel
      const script: barrel.BuildScript = {
        id: 'test-script',
        name: 'build',
        command: 'npm run build',
        description: 'Build project',
        directory: '.',
        created_at: '2026-01-01T00:00:00Z',
        workspace_id: 'ws_test',
      };
      expect(script.id).toBe('test-script');
    });
  });

  // ===========================================================================
  // context.types.ts exports
  // ===========================================================================

  describe('context.types.ts re-exports', () => {
    it('should allow constructing RequestCategorization via barrel types', () => {
      const cat: barrel.RequestCategorization = {
        category: 'feature',
        confidence: 0.9,
        reasoning: 'adding a feature',
        suggested_workflow: ['Researcher', 'Architect', 'Executor'],
      };
      expect(cat.category).toBe('feature');
      expect(cat.confidence).toBe(0.9);
    });
  });

  // ===========================================================================
  // plan.types.ts exports
  // ===========================================================================

  describe('plan.types.ts re-exports', () => {
    it('should export STEP_TYPE_BEHAVIORS constant', () => {
      expect(barrel.STEP_TYPE_BEHAVIORS).toBeDefined();
      expect(typeof barrel.STEP_TYPE_BEHAVIORS).toBe('object');
    });

    it('should export STEP_TYPE_BEHAVIORS with all step types', () => {
      const expectedTypes = [
        'standard', 'analysis', 'validation', 'user_validation',
        'complex', 'critical', 'build', 'fix', 'refactor',
        'confirmation', 'research', 'planning', 'code', 'test',
        'documentation',
      ];
      for (const t of expectedTypes) {
        expect(barrel.STEP_TYPE_BEHAVIORS).toHaveProperty(t);
      }
    });

    it('should match plan.types direct module import', () => {
      expect(barrel.STEP_TYPE_BEHAVIORS).toBe(planTypes.STEP_TYPE_BEHAVIORS);
    });

    it('should allow constructing a PlanStep via barrel types', () => {
      const step: barrel.PlanStep = {
        index: 0,
        phase: 'Phase 1',
        task: 'Implement feature',
        status: 'pending',
      };
      expect(step.status).toBe('pending');
    });

    it('should allow constructing a PlanState via barrel types', () => {
      const state: barrel.PlanState = {
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
      };
      expect(state.id).toBe('plan_test');
      expect(state.status).toBe('active');
    });

    it('should allow constructing a CompactPlanState via barrel types', () => {
      const compact: barrel.CompactPlanState = {
        id: 'plan_c',
        workspace_id: 'ws_test',
        title: 'Compact',
        description: 'A compact plan',
        status: 'active',
        priority: 'low',
        category: 'bug',
        current_phase: 'Phase 1',
        current_agent: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        plan_summary: { total_steps: 5, done_steps: 2, active_steps: 1, pending_steps: 2, blocked_steps: 0, total_sessions: 1, total_handoffs: 0 },
        steps: [],
        agent_sessions: { recent: [], total_count: 0 },
        lineage: { recent: [], total_count: 0 },
      };
      expect(compact.plan_summary.total_steps).toBe(5);
    });
  });

  // ===========================================================================
  // workspace.types.ts exports
  // ===========================================================================

  describe('workspace.types.ts re-exports', () => {
    it('should allow constructing a WorkspaceMeta via barrel types', () => {
      const meta: barrel.WorkspaceMeta = {
        workspace_id: 'ws_test',
        path: '/test/path',
        name: 'Test',
        registered_at: '2026-01-01T00:00:00Z',
        last_accessed: '2026-01-01T00:00:00Z',
        active_plans: [],
        archived_plans: [],
        indexed: false,
      };
      expect(meta.workspace_id).toBe('ws_test');
    });

    it('should allow constructing a WorkspaceContext via barrel types', () => {
      const ctx: barrel.WorkspaceContext = {
        schema_version: '1.0',
        workspace_id: 'ws_test',
        workspace_path: '/test',
        name: 'Test',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        sections: {},
      };
      expect(ctx.sections).toEqual({});
    });
  });

  // ===========================================================================
  // common.types.ts exports
  // ===========================================================================

  describe('common.types.ts re-exports', () => {
    it('should allow constructing a ToolResponse via barrel types', () => {
      const resp: barrel.ToolResponse<string> = {
        success: true,
        data: 'hello',
      };
      expect(resp.success).toBe(true);
      expect(resp.data).toBe('hello');
    });

    it('should allow constructing a ToolResponse with error', () => {
      const resp: barrel.ToolResponse = {
        success: false,
        error: 'Something failed',
      };
      expect(resp.success).toBe(false);
      expect(resp.error).toBe('Something failed');
    });

    it('should allow constructing param interfaces via barrel types', () => {
      const params: barrel.CreatePlanParams = {
        workspace_id: 'ws_test',
        title: 'New Plan',
        description: 'Desc',
        category: 'feature',
      };
      expect(params.title).toBe('New Plan');
    });
  });

  // ===========================================================================
  // Cross-module consistency
  // ===========================================================================

  describe('Cross-module consistency', () => {
    it('should not have conflicting runtime exports between modules', () => {
      // Collect all runtime (non-type) export names from each module
      const runtimeModules = [
        { name: 'agent', keys: Object.keys(agentTypes) },
        { name: 'build', keys: Object.keys(buildTypes) },
        { name: 'context', keys: Object.keys(contextTypes) },
        { name: 'plan', keys: Object.keys(planTypes) },
        { name: 'workspace', keys: Object.keys(workspaceTypes) },
        { name: 'common', keys: Object.keys(commonTypes) },
      ];

      // Check no duplicate runtime export names across modules
      const seen = new Map<string, string>();
      for (const mod of runtimeModules) {
        for (const key of mod.keys) {
          if (seen.has(key)) {
            // If the same key appears in two modules, fail with details
            expect.fail(
              `Duplicate runtime export "${key}" found in both ${seen.get(key)} and ${mod.name}`
            );
          }
          seen.set(key, mod.name);
        }
      }
    });

    it('should have all domain module runtime exports accessible through barrel', () => {
      const allDomainKeys = [
        ...Object.keys(agentTypes),
        ...Object.keys(buildTypes),
        ...Object.keys(contextTypes),
        ...Object.keys(planTypes),
        ...Object.keys(workspaceTypes),
        ...Object.keys(commonTypes),
      ];

      const barrelKeys = Object.keys(barrel);

      for (const key of allDomainKeys) {
        expect(barrelKeys).toContain(key);
      }
    });
  });
});
