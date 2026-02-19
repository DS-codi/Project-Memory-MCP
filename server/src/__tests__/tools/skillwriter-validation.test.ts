/**
 * Tests for SkillWriter validation (agent-validation.tools.ts + agent.types.ts).
 *
 * Covers:
 * 1. validateSkillWriter accepts valid deployment context
 * 2. Validates SkillWriter exists in AGENT_BOUNDARIES
 * 3. SkillWriter role boundaries are correctly defined
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateSkillWriter } from '../../tools/agent-validation.tools.js';
import { AGENT_BOUNDARIES } from '../../types/index.js';
import type { PlanState } from '../../types/index.js';

// Mock the file store
vi.mock('../../storage/file-store.js');

import * as store from '../../storage/file-store.js';

// =============================================================================
// Test Helpers
// =============================================================================

function makePlanState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    id: 'plan_skillwriter_001',
    workspace_id: 'ws_test',
    title: 'Skill Writer Plan',
    description: 'Plan for generating skill files',
    priority: 'medium',
    status: 'active',
    category: 'quick_task',
    current_phase: 'Skill Generation',
    current_agent: 'SkillWriter',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    agent_sessions: [],
    lineage: [],
    steps: [
      {
        index: 0,
        phase: 'Skill Generation',
        task: 'Analyze codebase and generate SKILL.md files',
        status: 'pending',
        type: 'documentation',
      },
    ],
    deployment_context: {
      deployed_agent: 'SkillWriter',
      deployed_by: 'Coordinator',
      reason: 'Generate skill files from codebase analysis',
      override_validation: true,
      deployed_at: new Date().toISOString(),
    },
    ...overrides,
  };
}

// =============================================================================
// AGENT_BOUNDARIES — SkillWriter
// =============================================================================

describe('AGENT_BOUNDARIES.SkillWriter', () => {
  it('should exist in AGENT_BOUNDARIES', () => {
    expect(AGENT_BOUNDARIES).toHaveProperty('SkillWriter');
  });

  it('should have agent_type set to SkillWriter', () => {
    expect(AGENT_BOUNDARIES.SkillWriter.agent_type).toBe('SkillWriter');
  });

  it('should not be allowed to implement', () => {
    expect(AGENT_BOUNDARIES.SkillWriter.can_implement).toBe(false);
  });

  it('should not be allowed to finalize', () => {
    expect(AGENT_BOUNDARIES.SkillWriter.can_finalize).toBe(false);
  });

  it('should handoff to Coordinator', () => {
    expect(AGENT_BOUNDARIES.SkillWriter.must_handoff_to).toContain('Coordinator');
  });

  it('should forbid editing source code', () => {
    const forbidden = AGENT_BOUNDARIES.SkillWriter.forbidden_actions;
    expect(forbidden).toContain('edit source code');
  });

  it('should forbid running tests', () => {
    const forbidden = AGENT_BOUNDARIES.SkillWriter.forbidden_actions;
    expect(forbidden).toContain('run tests');
  });

  it('should have primary responsibility related to skill file generation', () => {
    const resp = AGENT_BOUNDARIES.SkillWriter.primary_responsibility;
    expect(resp.toLowerCase()).toContain('skill');
  });
});

// =============================================================================
// validateSkillWriter
// =============================================================================

describe('validateSkillWriter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should accept valid deployment context', async () => {
    const planState = makePlanState();
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    const result = await validateSkillWriter({
      workspace_id: 'ws_test',
      plan_id: 'plan_skillwriter_001',
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.action).toBe('continue');
  });

  it('should return role_boundaries with SkillWriter fields', async () => {
    const planState = makePlanState();
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    const result = await validateSkillWriter({
      workspace_id: 'ws_test',
      plan_id: 'plan_skillwriter_001',
    });

    expect(result.success).toBe(true);
    expect(result.data!.role_boundaries).toBeDefined();
    expect(result.data!.role_boundaries.agent_type).toBe('SkillWriter');
    expect(result.data!.role_boundaries.can_implement).toBe(false);
    expect(result.data!.role_boundaries.primary_responsibility).toContain('skill');
  });

  it('should include current_phase and current_step in result', async () => {
    const planState = makePlanState();
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    const result = await validateSkillWriter({
      workspace_id: 'ws_test',
      plan_id: 'plan_skillwriter_001',
    });

    expect(result.success).toBe(true);
    expect(result.data!.current_phase).toBeDefined();
    expect(result.data!.current_step).toBeDefined();
  });

  it('should fail when plan does not exist', async () => {
    vi.spyOn(store, 'getPlanState').mockResolvedValue(null);

    const result = await validateSkillWriter({
      workspace_id: 'ws_test',
      plan_id: 'plan_nonexistent',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should include todo_list in validation result', async () => {
    const planState = makePlanState({
      steps: [
        {
          index: 0,
          phase: 'Skill Generation',
          task: 'Analyze codebase patterns',
          status: 'done',
          type: 'documentation',
        },
        {
          index: 1,
          phase: 'Skill Generation',
          task: 'Generate SKILL.md for architecture pattern',
          status: 'pending',
          type: 'documentation',
        },
      ],
    });
    vi.spyOn(store, 'getPlanState').mockResolvedValue(planState);

    const result = await validateSkillWriter({
      workspace_id: 'ws_test',
      plan_id: 'plan_skillwriter_001',
    });

    expect(result.success).toBe(true);
    expect(result.data!.todo_list).toBeDefined();
    expect(Array.isArray(result.data!.todo_list)).toBe(true);
  });
});
