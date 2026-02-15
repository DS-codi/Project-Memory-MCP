/**
 * Program Type Definitions
 *
 * Integrated Programs are multi-plan containers that group related plans
 * under a single umbrella. A program is stored as a PlanState with
 * is_program=true and child_plan_ids tracking its constituent plans.
 */

import type { PlanPriority, PlanState, PlanStatus } from './plan.types.js';

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

// =============================================================================
// Unlink / Dependency / Clone / Merge Parameters
// =============================================================================

export interface UnlinkFromProgramParams {
  workspace_id: string;
  plan_id: string;
}

export interface SetPlanDependenciesParams {
  workspace_id: string;
  plan_id: string;
  depends_on_plans: string[];
}

export interface GetPlanDependenciesParams {
  workspace_id: string;
  plan_id: string;
}

export interface GetPlanDependenciesResult {
  plan_id: string;
  depends_on_plans: string[];
  dependents: string[];
  message: string;
}

export interface ClonePlanParams {
  workspace_id: string;
  plan_id: string;
  new_title?: string;
  reset_steps?: boolean;
  link_to_same_program?: boolean;
}

export interface ClonePlanResult {
  source_plan_id: string;
  cloned_plan: PlanState;
  message: string;
}

export interface MergePlansParams {
  workspace_id: string;
  target_plan_id: string;
  source_plan_ids: string[];
  archive_sources?: boolean;
}

export interface MergePlansResult {
  target_plan_id: string;
  source_plan_ids: string[];
  steps_merged: number;
  archived_sources: string[];
  message: string;
}
