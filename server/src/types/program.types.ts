/**
 * Program Type Definitions
 *
 * Integrated Programs are multi-plan containers that group related plans
 * under a single umbrella. A program is stored as a PlanState with
 * is_program=true and child_plan_ids tracking its constituent plans.
 */

import type { PlanPriority, PlanStatus } from './plan.types.js';

// =============================================================================
// Program Aggregate Progress
// =============================================================================

/**
 * Aggregate progress across all child plans in a program
 */
export interface ProgramAggregateProgress {
  total_plans: number;
  active_plans: number;
  completed_plans: number;
  archived_plans: number;
  failed_plans: number;
  total_steps: number;
  done_steps: number;
  active_steps: number;
  pending_steps: number;
  blocked_steps: number;
  /** Percentage of done steps out of total (0-100) */
  completion_percentage: number;
}

// =============================================================================
// Program Listing Result
// =============================================================================

/**
 * Result of listing plans within a program
 */
export interface ProgramPlansResult {
  program_id: string;
  program_title: string;
  program_status: PlanStatus;
  child_plan_ids: string[];
  child_plans: ProgramChildPlanSummary[];
  aggregate: ProgramAggregateProgress;
}

/**
 * Summary of a child plan within a program listing
 */
export interface ProgramChildPlanSummary {
  plan_id: string;
  title: string;
  status: PlanStatus;
  priority: PlanPriority;
  current_phase: string;
  steps_total: number;
  steps_done: number;
  depends_on_plans: string[];
}

// =============================================================================
// Program Creation Parameters
// =============================================================================

export interface CreateProgramParams {
  workspace_id: string;
  title: string;
  description: string;
  priority?: PlanPriority;
}

export interface AddPlanToProgramParams {
  workspace_id: string;
  program_id: string;
  plan_id: string;
}

export interface UpgradeToProgramParams {
  workspace_id: string;
  plan_id: string;
  move_steps_to_child?: boolean;
  child_plan_title?: string;
}

export interface ListProgramPlansParams {
  workspace_id: string;
  program_id: string;
}
