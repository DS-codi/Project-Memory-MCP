/**
 * Plan Schema Versioning Utilities
 *
 * Provides version detection, constants, and phase-building helpers
 * for the v1 → v2 plan schema transition.
 *
 * Key principle: NO on-read mutation. Legacy (v1) plans are read as-is.
 * The Migrator agent (Plan 10) handles actual v1 → v2 data migration.
 */

import type { PlanState, PlanStep, PlanPhase } from '../../types/index.js';

/** Current plan schema version for newly created plans. */
export const PLAN_SCHEMA_VERSION = '2.0';

/**
 * Get the schema version of a plan.
 * Plans without a schema_version field are implicitly v1.
 */
export function getPlanSchemaVersion(state: PlanState): string {
  return state.schema_version ?? '1.0';
}

/**
 * Check if a plan uses the v2 schema.
 */
export function isPlanV2(state: PlanState): boolean {
  return state.schema_version != null && state.schema_version >= '2.0';
}

/**
 * Build a phases array from a flat list of steps.
 *
 * Extracts unique phase names (preserving first-seen order),
 * and creates PlanPhase objects with sensible defaults.
 * Used when creating v2 plans from step arrays.
 */
export function buildPhasesFromSteps(steps: PlanStep[]): PlanPhase[] {
  const seen = new Map<string, number>();
  const order: string[] = [];

  for (const step of steps) {
    if (!step.phase) continue;
    if (seen.has(step.phase)) {
      seen.set(step.phase, seen.get(step.phase)! + 1);
    } else {
      seen.set(step.phase, 1);
      order.push(step.phase);
    }
  }

  return order.map((name, idx) => ({
    name,
    sequence: idx + 1,
    success_criteria: [],
    required_agents: [],
    context_files: [],
    linked_skills: [],
    approval_required: false,
    estimated_steps: seen.get(name) ?? 0,
    auto_continue_eligible: false,
  }));
}
