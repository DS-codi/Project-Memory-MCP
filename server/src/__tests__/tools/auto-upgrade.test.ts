import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkProgramUpgradeSuggestion } from '../../tools/plan/plan-step-mutations.js';
import * as store from '../../storage/db-store.js';
import type { PlanState, PlanStep } from '../../types/index.js';

/**
 * Auto-Upgrade Detection Test
 *
 * Tests for checkProgramUpgradeSuggestion — the logic that adds a pending
 * note when a plan grows past the PROGRAM_UPGRADE_THRESHOLD (100 steps).
 */

vi.mock('../../storage/db-store.js');

// ===========================================================================
// Fixtures
// ===========================================================================

function makePlan(overrides: Partial<PlanState> = {}): PlanState {
  return {
    id: 'plan_auto',
    workspace_id: 'ws_auto_test',
    title: 'Auto-Upgrade Test Plan',
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

/** Generate N dummy steps */
function makeSteps(count: number): PlanStep[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    phase: 'Phase 1',
    task: `Step ${i}`,
    status: 'pending' as const,
  }));
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Auto-Upgrade Detection (checkProgramUpgradeSuggestion)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(store.nowISO).mockReturnValue('2026-02-13T00:00:00Z');
  });

  // =========================================================================
  // Trigger conditions
  // =========================================================================

  it('should add a pending note when step count reaches 100', async () => {
    const plan = makePlan({ steps: makeSteps(100) });

    await checkProgramUpgradeSuggestion(plan);

    expect(plan.pending_notes).toBeDefined();
    expect(plan.pending_notes).toHaveLength(1);
    expect(plan.pending_notes![0].note).toContain('Integrated Program');
    expect(plan.pending_notes![0].note).toContain('100');
    expect(plan.pending_notes![0].type).toBe('warning');
  });

  it('should add a pending note when step count exceeds 100', async () => {
    const plan = makePlan({ steps: makeSteps(150) });

    await checkProgramUpgradeSuggestion(plan);

    expect(plan.pending_notes).toHaveLength(1);
    expect(plan.pending_notes![0].note).toContain('150 steps');
  });

  // =========================================================================
  // Skip conditions
  // =========================================================================

  it('should NOT trigger when step count is below 100', async () => {
    const plan = makePlan({ steps: makeSteps(99) });

    await checkProgramUpgradeSuggestion(plan);

    // No pending_notes should be added
    expect(plan.pending_notes ?? []).toHaveLength(0);
  });

  it('should NOT trigger when plan is already a program', async () => {
    const plan = makePlan({
      steps: makeSteps(200),
      is_program: true,
    });

    await checkProgramUpgradeSuggestion(plan);

    expect(plan.pending_notes ?? []).toHaveLength(0);
  });

  // =========================================================================
  // Duplicate prevention
  // =========================================================================

  it('should NOT add a duplicate note if one already exists', async () => {
    const plan = makePlan({
      steps: makeSteps(120),
      pending_notes: [
        {
          note: 'This plan has 100 steps (threshold: 100). Consider upgrading to an Integrated Program using memory_plan(action: upgrade_to_program).',
          type: 'warning',
          added_at: '2026-02-01T00:00:00Z',
          added_by: 'agent',
        },
      ],
    });

    await checkProgramUpgradeSuggestion(plan);

    // Should still have exactly 1 note, not 2
    expect(plan.pending_notes).toHaveLength(1);
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  it('should initialize pending_notes array if it does not exist', async () => {
    const plan = makePlan({ steps: makeSteps(105) });
    delete (plan as any).pending_notes;

    await checkProgramUpgradeSuggestion(plan);

    expect(plan.pending_notes).toBeDefined();
    expect(plan.pending_notes).toHaveLength(1);
  });

  it('should preserve existing non-upgrade notes while adding suggestion', async () => {
    const plan = makePlan({
      steps: makeSteps(110),
      pending_notes: [
        {
          note: 'Some other warning',
          type: 'info',
          added_at: '2026-02-01T00:00:00Z',
          added_by: 'user',
        },
      ],
    });

    await checkProgramUpgradeSuggestion(plan);

    expect(plan.pending_notes).toHaveLength(2);
    expect(plan.pending_notes![0].note).toBe('Some other warning');
    expect(plan.pending_notes![1].note).toContain('Integrated Program');
  });

  it('should set added_by to agent', async () => {
    const plan = makePlan({ steps: makeSteps(100) });

    await checkProgramUpgradeSuggestion(plan);

    expect(plan.pending_notes![0].added_by).toBe('agent');
  });
});
