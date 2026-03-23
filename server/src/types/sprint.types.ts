/**
 * Sprint Type Definitions
 *
 * Types for sprint tracking with goals and optional plan attachment.
 */

// =============================================================================
// Sprint Status
// =============================================================================

export type SprintStatus = 'active' | 'completed' | 'archived';

// =============================================================================
// Goal Interface
// =============================================================================

/**
 * Represents a single goal within a sprint.
 * Goals are stored in the normalized `goals` table.
 */
export interface Goal {
  /** Unique identifier for the goal */
  goal_id: string;
  /** Parent sprint ID */
  sprint_id: string;
  /** Goal description text */
  description: string;
  /** Whether the goal has been completed */
  completed: boolean;
  /** ISO timestamp when the goal was completed (null if not completed) */
  completed_at: string | null;
  /** ISO timestamp when the goal was created */
  created_at: string;
}

// =============================================================================
// Sprint Interface
// =============================================================================

/**
 * Represents a sprint for organizing work within a workspace.
 * Sprints can optionally be attached to a plan.
 */
export interface Sprint {
  /** Unique identifier for the sprint */
  sprint_id: string;
  /** Workspace this sprint belongs to */
  workspace_id: string;
  /** Optional attached plan ID */
  attached_plan_id: string | null;
  /** Sprint title */
  title: string;
  /** Current status of the sprint */
  status: SprintStatus;
  /** Goals associated with this sprint (loaded from goals table) */
  goals: Goal[];
  /** ISO timestamp when the sprint was created */
  created_at: string;
  /** ISO timestamp when the sprint was last updated */
  updated_at: string;
}

// =============================================================================
// Sprint with Metadata (for list views)
// =============================================================================

/**
 * Sprint summary with computed metadata for list views.
 */
export interface SprintSummary extends Sprint {
  /** Total number of goals */
  goal_count: number;
  /** Number of completed goals */
  completed_goal_count: number;
  /** Completion percentage (0-100) */
  completion_percentage: number;
}
