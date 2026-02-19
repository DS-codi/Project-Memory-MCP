import { describe, it, expect } from 'vitest';
import {
  detectSinglePlanAdvisory,
  detectMigrationAdvisories,
} from '../../tools/program/program-migration-advisor.js';
import type { PlanState } from '../../types/plan.types.js';

/**
 * Program Migration Advisor Tests
 *
 * Pure-function tests for detectSinglePlanAdvisory and detectMigrationAdvisories.
 * No mocking required — these functions have zero I/O side effects.
 */

// ===========================================================================
// Fixtures
// ===========================================================================

function makePlan(overrides: Partial<PlanState> = {}): PlanState {
  return {
    id: 'plan_test_001',
    workspace_id: 'ws_test',
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
// Tests: detectSinglePlanAdvisory
// ===========================================================================

describe('detectSinglePlanAdvisory', () => {
  // -------------------------------------------------------------------------
  // Case 1 — plain plan with no is_program field and schema_version set
  // -------------------------------------------------------------------------
  it('returns null for a plain plan with no is_program field', () => {
    const plan = makePlan({ schema_version: '2.0' });
    // is_program is not set — no program-schema issues
    // schema_version is set — no schema_version issue
    const result = detectSinglePlanAdvisory(plan);
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Case 2 — legacy program plan: severity 'critical' + issue string present
  // -------------------------------------------------------------------------
  it('returns advisory with severity "critical" for a legacy program plan (is_program: true)', () => {
    const plan = makePlan({
      is_program: true,
      child_plan_ids: ['child_1'],
      schema_version: '2.0',
    });
    const result = detectSinglePlanAdvisory(plan);

    expect(result).not.toBeNull();
    expect(result!.severity).toBe('critical');
    expect(result!.detected_issues).toContain(
      'is_program: true detected — legacy program format',
    );
  });

  // -------------------------------------------------------------------------
  // Case 3 — missing child_plan_ids when is_program: true
  // -------------------------------------------------------------------------
  it('includes "missing child_plan_ids" in detected_issues when is_program is true but child_plan_ids is absent', () => {
    const plan = makePlan({
      is_program: true,
      schema_version: '2.0',
      // child_plan_ids intentionally absent
    });
    const result = detectSinglePlanAdvisory(plan);

    expect(result).not.toBeNull();
    expect(result!.detected_issues).toContain('missing child_plan_ids');
  });

  // -------------------------------------------------------------------------
  // Case 5 — plan_id field in advisory is taken from plan.id
  // -------------------------------------------------------------------------
  it('uses plan.id for the advisory plan_id field (not plan.plan_id)', () => {
    const plan = makePlan({
      id: 'unique_plan_identifier_abc',
      is_program: true,
      schema_version: '2.0',
    });
    const result = detectSinglePlanAdvisory(plan);

    expect(result).not.toBeNull();
    expect(result!.plan_id).toBe('unique_plan_identifier_abc');
  });

  // -------------------------------------------------------------------------
  // Case 6 — missing schema_version
  // -------------------------------------------------------------------------
  it('includes "missing schema_version" in detected_issues when schema_version is absent', () => {
    const plan = makePlan();
    // makePlan() does not set schema_version — it remains undefined
    const result = detectSinglePlanAdvisory(plan);

    expect(result).not.toBeNull();
    expect(result!.detected_issues).toContain('missing schema_version');
  });

  it('includes "missing schema_version" when schema_version is null', () => {
    const plan = makePlan({ schema_version: null as unknown as string });
    const result = detectSinglePlanAdvisory(plan);

    expect(result).not.toBeNull();
    expect(result!.detected_issues).toContain('missing schema_version');
  });

  // -------------------------------------------------------------------------
  // Severity for schema-only issue is 'warning' (no is_program)
  // -------------------------------------------------------------------------
  it('uses severity "warning" for a plan with only missing schema_version (no is_program)', () => {
    const plan = makePlan();
    // is_program not set, schema_version not set → warning
    const result = detectSinglePlanAdvisory(plan);

    expect(result).not.toBeNull();
    expect(result!.severity).toBe('warning');
  });

  // -------------------------------------------------------------------------
  // suggested_action is always present
  // -------------------------------------------------------------------------
  it('includes a non-empty suggested_action string in the advisory', () => {
    const plan = makePlan({ is_program: true, schema_version: '1.0' });
    const result = detectSinglePlanAdvisory(plan);

    expect(result).not.toBeNull();
    expect(typeof result!.suggested_action).toBe('string');
    expect(result!.suggested_action.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Tests: detectMigrationAdvisories
// ===========================================================================

describe('detectMigrationAdvisories', () => {
  // -------------------------------------------------------------------------
  // Case 4 — filters correctly: 2 legacy + 1 normal → length 2
  // -------------------------------------------------------------------------
  it('filters to only plans with issues — 2 legacy + 1 normal plan → array of length 2', () => {
    const legacyA = makePlan({ id: 'plan_legacy_a', is_program: true, schema_version: '1.0' });
    const legacyB = makePlan({ id: 'plan_legacy_b', is_program: true, schema_version: '1.0' });
    const normal  = makePlan({ id: 'plan_normal',   schema_version: '2.0' });

    const results = detectMigrationAdvisories([legacyA, legacyB, normal]);

    expect(results).toHaveLength(2);
  });

  it('maps each advisory to the correct plan_id', () => {
    const legacyA = makePlan({ id: 'plan_a', is_program: true, schema_version: '1.0' });
    const legacyB = makePlan({ id: 'plan_b', is_program: true, schema_version: '1.0' });

    const results = detectMigrationAdvisories([legacyA, legacyB]);

    expect(results.map(r => r.plan_id)).toEqual(['plan_a', 'plan_b']);
  });

  it('returns an empty array for a list of plans that all have no issues', () => {
    const normal1 = makePlan({ id: 'plan_c', schema_version: '2.0' });
    const normal2 = makePlan({ id: 'plan_d', schema_version: '2.0' });

    const results = detectMigrationAdvisories([normal1, normal2]);

    expect(results).toHaveLength(0);
  });

  it('returns an empty array when given an empty plan list', () => {
    const results = detectMigrationAdvisories([]);
    expect(results).toHaveLength(0);
  });

  it('returns advisory for every plan that has an issue (all legacy)', () => {
    const plans = [
      makePlan({ id: 'p1', is_program: true, schema_version: '1.0' }),
      makePlan({ id: 'p2', is_program: true, schema_version: '1.0' }),
      makePlan({ id: 'p3', is_program: true, schema_version: '1.0' }),
    ];

    const results = detectMigrationAdvisories(plans);

    expect(results).toHaveLength(3);
    expect(results.every(r => r.severity === 'critical')).toBe(true);
  });
});
