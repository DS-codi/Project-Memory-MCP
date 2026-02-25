/**
 * Tests for context metrics: payload size measurement, instruction
 * relevance scoring, and reviewer regression high-priority storage.
 *
 * Phase 6: Context Optimization — context metrics
 *
 * Since measurePayloadSize, scoreAndFilterInstructions, and
 * storeBuilderRegressionFailure are private helpers inside
 * handoff.tools.ts, we test them through the public API
 * (initialiseAgent and handoff) with mocked storage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initialiseAgent, handoff } from '../../tools/handoff.tools.js';
import * as store from '../../storage/db-store.js';
import * as contextTools from '../../tools/context.tools.js';
import * as skillsTools from '../../tools/skills.tools.js';
import { events } from '../../events/event-emitter.js';
import type { PlanState, AgentInstructionFile } from '../../types/index.js';

vi.mock('../../storage/db-store.js');
vi.mock('../../tools/context.tools.js');
vi.mock('../../tools/skills.tools.js');
vi.mock('../../events/event-emitter.js', () => ({
  events: {
    agentInit: vi.fn().mockResolvedValue(undefined),
    handoff: vi.fn().mockResolvedValue(undefined),
    agentComplete: vi.fn().mockResolvedValue(undefined),
  }
}));
vi.mock('../../utils/workspace-context-summary.js', () => ({
  buildWorkspaceContextSummary: vi.fn().mockResolvedValue(undefined)
}));

const mockWorkspaceId = 'ws_metrics_test';
const mockPlanId = 'plan_metrics_test';

// ---------------------------------------------------------------------------
// Plan state factory
// ---------------------------------------------------------------------------

function makeBasePlanState(overrides?: Partial<PlanState>): PlanState {
  return {
    id: mockPlanId,
    workspace_id: mockWorkspaceId,
    title: 'Context Metrics Test Plan',
    description: 'Plan for testing context_size_bytes and scoring',
    priority: 'medium',
    status: 'active',
    category: 'feature',
    current_phase: 'Phase 1',
    current_agent: 'Executor',
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-13T00:00:00Z',
    agent_sessions: [],
    lineage: [],
    steps: [
      {
        index: 0,
        phase: 'Phase 1',
        task: 'Implement widget architecture',
        status: 'active',
        type: 'code'
      },
      {
        index: 1,
        phase: 'Phase 1',
        task: 'Add data validation layer',
        status: 'pending',
        type: 'code'
      }
    ],
    ...overrides
  };
}

function makeInstructionFiles(count: number): AgentInstructionFile[] {
  return Array.from({ length: count }, (_, i) => ({
    filename: `instruction-${i}.md`,
    target_agent: 'Executor' as const,
    mission: `Mission ${i}: implement the ${i % 2 === 0 ? 'widget' : 'service'} architecture`,
    context: [`Context for instruction ${i}`, `architecture design phase`],
    constraints: [],
    deliverables: [],
    files_to_read: i < 3 ? ['widget.ts'] : ['other.ts'],
    generated_at: new Date(Date.now() - i * 3600000).toISOString(),
    plan_id: mockPlanId,
    full_path: `/instructions/instruction-${i}.md`
  }));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function setupStoreMocks(state?: PlanState) {
  const planState = state || makeBasePlanState();

  vi.mocked(store.getPlanState).mockResolvedValue(planState);
  vi.mocked(store.savePlanState).mockResolvedValue(undefined);
  vi.mocked(store.generatePlanMd).mockResolvedValue(undefined);
  vi.mocked(store.getWorkspace).mockResolvedValue({
    workspace_id: mockWorkspaceId,
    name: 'Test Workspace',
    path: '/test/workspace',
    registered_at: '2026-01-01T00:00:00Z',
    active_plans: [mockPlanId],
    codebase_profile: {}
  } as any);
  vi.mocked(store.getAllWorkspaces).mockResolvedValue([]);
  vi.mocked(store.getWorkspacePlans).mockResolvedValue([]);
  vi.mocked(store.generateSessionId).mockReturnValue('sess_test_001');
  vi.mocked(store.nowISO).mockReturnValue('2026-02-13T12:00:00Z');
  vi.mocked(store.getContextPath).mockReturnValue('/data/context/test.json');
  vi.mocked(store.writeJsonLocked).mockResolvedValue(undefined);

  // Skill matching returns empty by default
  vi.mocked(skillsTools.matchWorkspaceSkillsToContext).mockResolvedValue({
    success: true,
    data: []
  });

  // No instruction files by default
  vi.mocked(contextTools.discoverInstructionFiles).mockResolvedValue({
    success: true,
    data: { instructions: [], contents: {} }
  });
}

// ---------------------------------------------------------------------------
// Tests: context_size_bytes measures payload correctly
// ---------------------------------------------------------------------------

describe('context_size_bytes measurement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStoreMocks();
  });

  it('should return context_size_bytes in initialiseAgent response', async () => {
    const result = await initialiseAgent({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      agent_type: 'Executor',
      context: {}
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.context_size_bytes).toBeDefined();
    expect(typeof result.data!.context_size_bytes).toBe('number');
    expect(result.data!.context_size_bytes).toBeGreaterThan(0);
  });

  it('should measure size that includes plan_state payload', async () => {
    const result = await initialiseAgent({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      agent_type: 'Executor',
      context: {}
    });

    // The context_size should at minimum cover the plan state
    const planStateSize = Buffer.byteLength(
      JSON.stringify(result.data!.plan_state),
      'utf-8'
    );
    expect(result.data!.context_size_bytes).toBeGreaterThanOrEqual(planStateSize);
  });

  it('should increase when matched_skills are present', async () => {
    // First, get baseline without skills
    const baseResult = await initialiseAgent({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      agent_type: 'Executor',
      context: {}
    });
    const baseSize = baseResult.data!.context_size_bytes!;

    // Now add matched skills
    vi.mocked(skillsTools.matchWorkspaceSkillsToContext).mockResolvedValue({
      success: true,
      data: [
        {
          skill_name: 'test-skill',
          relevance_score: 0.8,
          matched_keywords: ['widget', 'architecture'],
          content: 'Full skill content here for testing payload size increase...'
        }
      ]
    });

    const withSkillsResult = await initialiseAgent({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      agent_type: 'Executor',
      context: {}
    });

    expect(withSkillsResult.data!.context_size_bytes).toBeGreaterThan(baseSize);
  });

  it('should handle zero-sized optional fields gracefully', async () => {
    const result = await initialiseAgent({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      agent_type: 'Executor',
      context: {}
    });

    // Even with no skills or workspace context, size should be non-negative
    expect(result.data!.context_size_bytes).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Instruction relevance scoring returns top 5
// ---------------------------------------------------------------------------

describe('Instruction relevance scoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStoreMocks();
  });

  it('should include instruction_files in init response when available', async () => {
    const instructions = makeInstructionFiles(3);
    vi.mocked(contextTools.discoverInstructionFiles).mockResolvedValue({
      success: true,
      data: { instructions, contents: {} }
    });

    const result = await initialiseAgent({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      agent_type: 'Executor',
      context: {}
    });

    expect(result.success).toBe(true);
    expect(result.data!.instruction_files).toBeDefined();
    expect(result.data!.instruction_files!.length).toBeGreaterThan(0);
  });

  it('should limit instruction files to top results when many exist', async () => {
    // Create 10 instructions — scoring should pick top 5
    const instructions = makeInstructionFiles(10);
    vi.mocked(contextTools.discoverInstructionFiles).mockResolvedValue({
      success: true,
      data: { instructions, contents: {} }
    });

    const result = await initialiseAgent({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      agent_type: 'Executor',
      context: {}
    });

    expect(result.success).toBe(true);
    if (result.data!.instruction_files) {
      expect(result.data!.instruction_files.length).toBeLessThanOrEqual(5);
    }
  });

  it('should not fail when no instruction files exist', async () => {
    vi.mocked(contextTools.discoverInstructionFiles).mockResolvedValue({
      success: true,
      data: { instructions: [], contents: {} }
    });

    const result = await initialiseAgent({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      agent_type: 'Executor',
      context: {}
    });

    expect(result.success).toBe(true);
    // instruction_files may be undefined or empty
    expect(result.data!.instruction_files ?? []).toHaveLength(0);
  });

  it('should handle instruction discovery failure gracefully', async () => {
    vi.mocked(contextTools.discoverInstructionFiles).mockResolvedValue({
      success: false,
      error: 'Instructions directory not found'
    });

    const result = await initialiseAgent({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      agent_type: 'Executor',
      context: {}
    });

    // Init should still succeed even if instructions fail
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: Reviewer regression stored as high-priority
// ---------------------------------------------------------------------------

describe('Reviewer regression high-priority storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStoreMocks();
  });

  it('should store regression failure context on Reviewer handoff', async () => {
    const result = await handoff({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      from_agent: 'Reviewer',
      to_agent: 'Coordinator',
      reason: 'Build regression detected',
      data: {
        mode: 'regression_check',
        build_success: false,
        regression_report: {
          regression_summary: 'TypeScript compilation errors after step 3',
          suspected_step: {
            index: 3,
            phase: 'Phase 1',
            task: 'Refactor data model',
            confidence: 0.85,
            reasoning: 'Step 3 introduced breaking type changes'
          },
          errors: [
            { file: 'src/model.ts', line: 42, message: 'Type mismatch' },
            { file: 'src/service.ts', line: 15, message: 'Missing property' }
          ]
        },
        scripts_run: ['tsc --noEmit']
      }
    });

    expect(result.success).toBe(true);

    // Verify writeJsonLocked was called for the regression context
    expect(store.writeJsonLocked).toHaveBeenCalled();

    // Find the regression call (not the handoff context call)
    const calls = vi.mocked(store.writeJsonLocked).mock.calls;
    const regressionCall = calls.find(call => {
      const data = call[1] as Record<string, unknown>;
      return data.type === 'builder_regression_failure';
    });

    expect(regressionCall).toBeDefined();
    if (regressionCall) {
      const stored = regressionCall[1] as Record<string, unknown>;
      expect(stored.type).toBe('builder_regression_failure');
      expect(stored.priority).toBe('high');
      expect(stored.failing_step_index).toBe(3);
      expect(stored.regression_summary).toContain('TypeScript compilation errors');
      expect(stored.error_output).toHaveLength(2);
    }
  });

  it('should NOT store regression context for successful builds', async () => {
    const result = await handoff({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      from_agent: 'Reviewer',
      to_agent: 'Coordinator',
      reason: 'Build passed',
      data: {
        mode: 'regression_check',
        build_success: true
      }
    });

    expect(result.success).toBe(true);

    // writeJsonLocked should be called for handoff context only,
    // NOT for regression failure
    const calls = vi.mocked(store.writeJsonLocked).mock.calls;
    const regressionCall = calls.find(call => {
      const data = call[1] as Record<string, unknown>;
      return data.type === 'builder_regression_failure';
    });
    expect(regressionCall).toBeUndefined();
  });

  it('should NOT store regression context for non-Reviewer agents', async () => {
    const result = await handoff({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      from_agent: 'Executor',
      to_agent: 'Coordinator',
      reason: 'Implementation done',
      data: {
        mode: 'regression_check',
        build_success: false,
        regression_report: {
          regression_summary: 'Errors found',
          errors: [{ file: 'a.ts', line: 1, message: 'error' }]
        }
      }
    });

    expect(result.success).toBe(true);

    const calls = vi.mocked(store.writeJsonLocked).mock.calls;
    const regressionCall = calls.find(call => {
      const data = call[1] as Record<string, unknown>;
      return data.type === 'builder_regression_failure';
    });
    expect(regressionCall).toBeUndefined();
  });

  it('should handle regression data with missing fields gracefully', async () => {
    const result = await handoff({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      from_agent: 'Reviewer',
      to_agent: 'Coordinator',
      reason: 'Build regression detected',
      data: {
        mode: 'regression_check',
        build_success: false,
        regression_report: {
          regression_summary: 'Build failed'
          // No suspected_step or errors
        }
      }
    });

    expect(result.success).toBe(true);

    const calls = vi.mocked(store.writeJsonLocked).mock.calls;
    const regressionCall = calls.find(call => {
      const data = call[1] as Record<string, unknown>;
      return data.type === 'builder_regression_failure';
    });

    expect(regressionCall).toBeDefined();
    if (regressionCall) {
      const stored = regressionCall[1] as Record<string, unknown>;
      expect(stored.priority).toBe('high');
      expect(stored.failing_step_index).toBeNull();
      expect(stored.suspected_breaking_change).toBeNull();
      expect(stored.error_output).toEqual([]);
    }
  });

  it('should include stored_at timestamp in regression context', async () => {
    await handoff({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      from_agent: 'Reviewer',
      to_agent: 'Coordinator',
      reason: 'Build regression detected',
      data: {
        mode: 'regression_check',
        build_success: false,
        regression_report: { regression_summary: 'fail' }
      }
    });

    const calls = vi.mocked(store.writeJsonLocked).mock.calls;
    const regressionCall = calls.find(call => {
      const data = call[1] as Record<string, unknown>;
      return data.type === 'builder_regression_failure';
    });

    if (regressionCall) {
      const stored = regressionCall[1] as Record<string, unknown>;
      expect(stored.stored_at).toBeDefined();
      expect(typeof stored.stored_at).toBe('string');
    }
  });
});
