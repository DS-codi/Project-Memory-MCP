/**
 * Plan Type Definitions
 *
 * Core types for plan state, steps, notes, confirmation, and compact representations.
 */

import type { AgentType, AgentSession, LineageEntry, AgentRoleBoundaries } from './agent.types.js';
import type { BuildScript } from './build.types.js';
import type { RequestCategory, RequestCategorization } from './context.types.js';

// =============================================================================
// Step & Plan Status
// =============================================================================

export type StepStatus = 'pending' | 'active' | 'done' | 'blocked';

export type StepType =
  | 'standard'
  | 'analysis'
  | 'validation'
  | 'user_validation'
  | 'complex'
  | 'critical'
  | 'build'
  | 'fix'
  | 'refactor'
  | 'confirmation'
  | 'research'
  | 'planning'
  | 'code'
  | 'test'
  | 'documentation';

export type PlanStatus = 'active' | 'paused' | 'completed' | 'archived' | 'failed';

export type PlanPriority = 'low' | 'medium' | 'high' | 'critical';

// =============================================================================
// Step Type Metadata - Behavioral properties for each step type
// =============================================================================

export interface StepTypeMetadata {
  id: StepType;
  auto_completable: boolean;  // Can agent mark this step done without user confirmation?
  blocking: boolean;          // Does this step block subsequent steps?
  description: string;
}

export const STEP_TYPE_BEHAVIORS: Record<StepType, StepTypeMetadata> = {
  standard: {
    id: 'standard',
    auto_completable: true,
    blocking: false,
    description: 'Standard implementation step'
  },
  analysis: {
    id: 'analysis',
    auto_completable: true,
    blocking: false,
    description: 'Research or analysis task'
  },
  validation: {
    id: 'validation',
    auto_completable: true,
    blocking: false,
    description: 'Automated validation or verification'
  },
  user_validation: {
    id: 'user_validation',
    auto_completable: false,
    blocking: true,
    description: 'Requires explicit user approval'
  },
  complex: {
    id: 'complex',
    auto_completable: true,
    blocking: false,
    description: 'Complex multi-part implementation'
  },
  critical: {
    id: 'critical',
    auto_completable: true,
    blocking: true,
    description: 'Critical step that blocks progress if failed'
  },
  build: {
    id: 'build',
    auto_completable: true,
    blocking: false,
    description: 'Build or compile step'
  },
  fix: {
    id: 'fix',
    auto_completable: true,
    blocking: false,
    description: 'Bug fix or correction'
  },
  refactor: {
    id: 'refactor',
    auto_completable: true,
    blocking: false,
    description: 'Code refactoring without behavior change'
  },
  confirmation: {
    id: 'confirmation',
    auto_completable: false,
    blocking: true,
    description: 'Checkpoint requiring user confirmation to proceed'
  },
  research: {
    id: 'research',
    auto_completable: true,
    blocking: false,
    description: 'Research or information gathering task'
  },
  planning: {
    id: 'planning',
    auto_completable: true,
    blocking: false,
    description: 'Planning or design task'
  },
  code: {
    id: 'code',
    auto_completable: true,
    blocking: false,
    description: 'Code implementation task'
  },
  test: {
    id: 'test',
    auto_completable: true,
    blocking: false,
    description: 'Testing task'
  },
  documentation: {
    id: 'documentation',
    auto_completable: true,
    blocking: false,
    description: 'Documentation writing task'
  }
};

// =============================================================================
// Plan Steps
// =============================================================================

export interface PlanStep {
  index: number;
  phase: string;
  task: string;
  status: StepStatus;
  type?: StepType;                // Step type for behavioral hints (defaults to 'standard')
  requires_validation?: boolean;  // Explicit flag for steps needing validation
  requires_confirmation?: boolean;  // Explicit flag for steps needing confirmation
  requires_user_confirmation?: boolean;  // Explicit flag for user confirmation
  assignee?: string;              // Agent or role assigned to this step
  context_priority?: 'high' | 'normal';  // 'high' = always included in compact output regardless of phase filtering
  notes?: string;
  completed_at?: string;
  depends_on?: number[];          // Indices of steps that must complete before this one can start
}

// =============================================================================
// Plan Notes - User annotations for agents
// =============================================================================

export type PlanNoteType = 'info' | 'warning' | 'instruction';

export interface PlanNote {
  note: string;
  type: PlanNoteType;
  added_at: string;
  added_by: 'user' | 'agent';
}

// =============================================================================
// Plan State (state.json)
// =============================================================================

export interface PlanState {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  priority: PlanPriority;
  status: PlanStatus;
  category: RequestCategory;  // Type of request (feature, bug, etc.)
  categorization?: RequestCategorization;  // Full categorization details
  current_phase: string;
  current_agent: AgentType | null;  // Agent currently deployed by Coordinator
  recommended_next_agent?: AgentType;  // Subagent recommendation for Coordinator
  deployment_context?: {  // Set by orchestrators (Coordinator/Analyst/Runner) at deployment time
    deployed_agent: AgentType;       // The agent that was explicitly deployed
    deployed_by: AgentType;          // Who deployed them (Coordinator, Analyst, Runner, or User)
    reason: string;                  // Why this agent was chosen
    override_validation: boolean;    // If true, validation MUST respect this and not redirect
    deployed_at: string;             // ISO timestamp
  };
  pending_notes?: PlanNote[];  // Notes for next agent/tool call (auto-cleared after delivery)
  confirmation_state?: ConfirmationState;  // Confirmation tracking for phases/steps
  goals?: string[];  // Project goals
  success_criteria?: string[];  // Success criteria for completion
  pre_plan_build_status?: 'passing' | 'failing' | 'unknown';  // Build status before plan started — determines Reviewer regression check availability
  build_scripts?: BuildScript[];  // Plan-specific build scripts
  // Integrated Programs fields
  program_id?: string;           // Links this plan to a parent program
  is_program?: boolean;          // True if this plan is a program container
  child_plan_ids?: string[];     // IDs of child plans (only for programs)
  depends_on_plans?: string[];   // Cross-program dependency tracking for child plans
  created_at: string;
  updated_at: string;
  agent_sessions: AgentSession[];
  lineage: LineageEntry[];
  steps: PlanStep[];
}

// =============================================================================
// Confirmation State
// =============================================================================

export interface ConfirmationRecord {
  confirmed: boolean;
  confirmed_by?: string;
  confirmed_at?: string;
}

export interface ConfirmationState {
  phases: Record<string, ConfirmationRecord>;
  steps: Record<number, ConfirmationRecord>;
}

// =============================================================================
// Compact Plan State (for agent init - reduced payload)
// =============================================================================

export interface CompactPlanSummary {
  total_steps: number;
  pending_steps: number;
  active_steps: number;
  done_steps: number;
  blocked_steps: number;
  total_sessions: number;
  total_handoffs: number;
}

export interface CompactAgentSession {
  session_id: string;
  agent_type: AgentType;
  started_at: string;
  completed_at?: string;
  context_keys: string[];  // Object.keys() of context — not full values
  summary?: string;
  artifacts?: string[];
}

/** One-liner summary for sessions 4–10 in progressive trimming */
export interface SummarizedAgentSession {
  agent_type: AgentType;
  summary_line: string;
  timestamp: string;
}

export interface CompactPlanState {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  priority: PlanPriority;
  status: PlanStatus;
  category: RequestCategory;
  current_phase: string;
  current_agent: AgentType | null;
  recommended_next_agent?: AgentType;
  deployment_context?: PlanState['deployment_context'];
  confirmation_state?: ConfirmationState;
  goals?: string[];
  success_criteria?: string[];
  pre_plan_build_status?: 'passing' | 'failing' | 'unknown';
  build_scripts?: BuildScript[];
  created_at: string;
  updated_at: string;
  plan_summary: CompactPlanSummary;
  agent_sessions: {
    recent: CompactAgentSession[];
    summarized?: SummarizedAgentSession[];  // One-liner summaries for sessions 4–10
    total_count: number;
  };
  lineage: { recent: LineageEntry[]; total_count: number };
  steps: PlanStep[];  // Filtered to pending/active only by default
}

// =============================================================================
// Plan Operation Results
// =============================================================================

/**
 * Warning when steps are completed out of order
 */
export interface OrderValidationWarning {
  step_completed: number;   // Index of the step that was completed
  prior_pending: number[];  // Indices of prior steps still pending
  message: string;
}

/**
 * Enhanced response for plan modification tools
 * Includes role_boundaries to remind agent of their constraints
 */
export interface PlanOperationResult {
  plan_state: PlanState;
  role_boundaries: AgentRoleBoundaries;
  next_action: {
    should_handoff: boolean;
    handoff_to?: AgentType[];
    message: string;
  };
  order_warning?: OrderValidationWarning;  // Present if steps completed out of order
}

export interface MissionBriefing {
  plan_id: string;
  plan_title: string;
  current_phase: string;
  deployed_by: AgentType | 'User';
  deployment_reason: string;
  previous_sessions: AgentSession[];
  current_steps: PlanStep[];
  pending_steps_count: number;
}
