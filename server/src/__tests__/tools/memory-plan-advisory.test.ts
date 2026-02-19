import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryPlan } from '../../tools/consolidated/memory_plan.js';
import * as planTools from '../../tools/plan/index.js';
import * as validation from '../../tools/consolidated/workspace-validation.js';

/**
 * memory_plan 'get' Advisory Injection Tests
 *
 * Verifies that the 'get' action of memory_plan correctly injects a
 * `migration_hint` when the retrieved plan is detected as a legacy program,
 * and that the key is completely absent (not null/undefined) for normal plans.
 */

vi.mock('../../tools/plan/index.js');
vi.mock('../../tools/consolidated/workspace-validation.js');
vi.mock('../../storage/workspace-identity.js');

const mockWorkspaceId = 'ws_plan_advisory_test';
const mockPlanId = 'plan_advisory_456';

// ===========================================================================
// Fixtures
// ===========================================================================

function makePlanState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: mockPlanId,
    workspace_id: mockWorkspaceId,
    title: 'Advisory Test Plan',
    description: 'desc',
    category: 'feature',
    priority: 'medium',
    status: 'active',
    current_phase: 'Phase 1',
    current_agent: null,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    steps: [],
    agent_sessions: [],
    lineage: [],
    notes: [],
    schema_version: '2.0', // clean by default
    ...overrides,
  };
}

// ===========================================================================
// Tests: memory_plan 'get' — migration_hint injection
// ===========================================================================

describe("memory_plan 'get' — migration_hint injection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(validation, 'validateAndResolveWorkspaceId').mockResolvedValue({
      success: true,
      workspace_id: mockWorkspaceId,
    } as any);
  });

  // -------------------------------------------------------------------------
  // Test 1 — legacy program plan: migration_hint is present with required fields
  // -------------------------------------------------------------------------
  it('includes migration_hint with required fields for a legacy program plan', async () => {
    vi.spyOn(planTools, 'getPlanState').mockResolvedValue({
      success: true,
      data: makePlanState({
        is_program: true,
        schema_version: '1.0',
      }) as any,
    });

    const result = await memoryPlan({
      action: 'get',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'get') {
      const hint = result.data.migration_hint;
      expect(hint).toBeDefined();
      expect(hint!.plan_id).toBe(mockPlanId);
      expect(hint!.severity).toBe('critical');
      expect(hint!.detected_issues).toContain(
        'is_program: true detected — legacy program format',
      );
      expect(typeof hint!.suggested_action).toBe('string');
      expect(hint!.suggested_action.length).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------------
  // Test 2 — migration_hint.plan_id matches the plan's id field
  // -------------------------------------------------------------------------
  it('sets migration_hint.plan_id from the plan id field', async () => {
    const specificPlanId = 'plan_specific_identifier';
    vi.spyOn(planTools, 'getPlanState').mockResolvedValue({
      success: true,
      data: makePlanState({
        id: specificPlanId,
        is_program: true,
        schema_version: '1.0',
      }) as any,
    });

    const result = await memoryPlan({
      action: 'get',
      workspace_id: mockWorkspaceId,
      plan_id: specificPlanId,
    });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'get') {
      expect(result.data.migration_hint!.plan_id).toBe(specificPlanId);
    }
  });

  // -------------------------------------------------------------------------
  // Test 3 — migration_hint.detected_issues array is non-empty
  // -------------------------------------------------------------------------
  it('includes a non-empty detected_issues array in migration_hint', async () => {
    vi.spyOn(planTools, 'getPlanState').mockResolvedValue({
      success: true,
      data: makePlanState({
        is_program: true,
        schema_version: '1.0',
      }) as any,
    });

    const result = await memoryPlan({
      action: 'get',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'get') {
      expect(Array.isArray(result.data.migration_hint!.detected_issues)).toBe(true);
      expect(result.data.migration_hint!.detected_issues.length).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------------
  // Test 4 — normal plan: migration_hint key is absent (not null, not undefined)
  // -------------------------------------------------------------------------
  it('omits migration_hint key entirely for a normal plan with no issues (key absent, not null)', async () => {
    vi.spyOn(planTools, 'getPlanState').mockResolvedValue({
      success: true,
      data: makePlanState() as any,
      // schema_version: '2.0', no is_program → no issues → advisory is null
    });

    const result = await memoryPlan({
      action: 'get',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'get') {
      expect(result.data).not.toHaveProperty('migration_hint');
    }
  });

  // -------------------------------------------------------------------------
  // Test 5 — plan with only missing schema_version (no is_program): hint is
  //           still present but severity is 'warning' not 'critical'
  // -------------------------------------------------------------------------
  it('includes migration_hint with severity "warning" when only schema_version is missing', async () => {
    vi.spyOn(planTools, 'getPlanState').mockResolvedValue({
      success: true,
      data: makePlanState({
        schema_version: undefined,
        // is_program not set
      }) as any,
    });

    const result = await memoryPlan({
      action: 'get',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'get') {
      const hint = result.data.migration_hint;
      expect(hint).toBeDefined();
      expect(hint!.severity).toBe('warning');
      expect(hint!.detected_issues).toContain('missing schema_version');
    }
  });

  // -------------------------------------------------------------------------
  // Error path — getPlanState failure propagates cleanly
  // -------------------------------------------------------------------------
  it('propagates failure when getPlanState returns an error (no migration_hint on failure)', async () => {
    vi.spyOn(planTools, 'getPlanState').mockResolvedValue({
      success: false,
      error: 'Plan not found',
    });

    const result = await memoryPlan({
      action: 'get',
      workspace_id: mockWorkspaceId,
      plan_id: 'plan_missing',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Plan not found');
    expect(result.data).toBeUndefined();
  });
});
