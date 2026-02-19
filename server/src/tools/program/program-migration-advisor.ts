/**
 * Program Migration Advisor — pure detection module with zero I/O.
 *
 * Analyses PlanState objects for legacy/incomplete program-schema patterns
 * and produces structured MigrationAdvisory records. No file access, no
 * network calls, no side effects — only inspection and data transformation.
 */

import type { PlanState } from '../../types/plan.types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MigrationAdvisory {
  plan_id: string;
  title: string;
  detected_issues: string[];
  suggested_action: string;
  severity: 'info' | 'warning' | 'critical';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Inspect a single PlanState and return a list of human-readable issue strings.
 * An empty array means the plan needs no migration action.
 */
export function detectIssues(plan: PlanState): string[] {
  const issues: string[] = [];

  if (plan.is_program === true) {
    issues.push('is_program: true detected — legacy program format');

    if (!plan.child_plan_ids || plan.child_plan_ids.length === 0) {
      issues.push('missing child_plan_ids');
    }
  }

  if (plan.schema_version === undefined || plan.schema_version === null) {
    issues.push('missing schema_version');
  }

  return issues;
}

/**
 * Build a MigrationAdvisory for a single plan, or return null if the plan
 * has no detected issues.
 */
export function detectSinglePlanAdvisory(plan: PlanState): MigrationAdvisory | null {
  const detected_issues = detectIssues(plan);

  if (detected_issues.length === 0) {
    return null;
  }

  const severity: MigrationAdvisory['severity'] = plan.is_program === true
    ? 'critical'
    : 'warning';

  return {
    plan_id: plan.id,
    title: plan.title,
    detected_issues,
    suggested_action:
      'Invoke the Migrator agent to upgrade this plan to the current program schema',
    severity,
  };
}

/**
 * Scan an array of plans and return one MigrationAdvisory per plan that has
 * detected issues. Plans with no issues are silently omitted.
 */
export function detectMigrationAdvisories(plans: PlanState[]): MigrationAdvisory[] {
  return plans
    .map(detectSinglePlanAdvisory)
    .filter((advisory): advisory is MigrationAdvisory => advisory !== null);
}
