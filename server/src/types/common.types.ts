/**
 * Common Type Definitions
 *
 * Shared utility types, tool parameters, tool responses, and agent instruction types.
 */

import type { AgentType, AgentSession, AgentRoleBoundaries } from './agent.types.js';
import type { BuildScript } from './build.types.js';
import type { RequestCategory, RequestCategorization } from './context.types.js';
import type {
  PlanState,
  CompactPlanState,
  PlanStep,
  PlanPriority,
  StepStatus,
  ConfirmationState
} from './plan.types.js';
import type { WorkspaceContextSummary } from './workspace.types.js';

// =============================================================================
// Tool Parameters
// =============================================================================

export interface RegisterWorkspaceParams {
  workspace_path: string;
  force?: boolean;
}

export interface CreatePlanParams {
  workspace_id: string;
  title: string;
  description: string;
  category: RequestCategory;  // Required: what type of request is this
  priority?: PlanPriority;
  categorization?: RequestCategorization;  // Optional: full categorization details
  goals?: string[];  // Project goals
  success_criteria?: string[];  // Success criteria for completion
}

export interface GetPlanStateParams {
  workspace_id: string;
  plan_id: string;
}

export interface UpdateStepParams {
  workspace_id: string;
  plan_id: string;
  step_index: number;
  status: StepStatus;
  notes?: string;
}

export interface BatchUpdateStepsParams {
  workspace_id: string;
  plan_id: string;
  updates: Array<{
    step_index: number;
    status: StepStatus;
    notes?: string;
  }>;
}

export interface ModifyPlanParams {
  workspace_id: string;
  plan_id: string;
  new_steps: Omit<PlanStep, 'index'>[];
}

export interface ArchivePlanParams {
  workspace_id: string;
  plan_id: string;
}

export interface StoreContextParams {
  workspace_id: string;
  plan_id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface StoreInitialContextParams {
  workspace_id: string;
  plan_id: string;
  user_request: string;  // The verbatim user request
  files_mentioned?: string[];  // Files the user referenced
  file_contents?: Record<string, string>;  // Attached file contents (path -> content)
  requirements?: string[];  // Explicit requirements from user
  constraints?: string[];  // Constraints or limitations mentioned
  examples?: string[];  // Examples or references provided
  conversation_context?: string;  // Any prior conversation context
  additional_notes?: string;  // Any other relevant notes
}

export interface GetContextParams {
  workspace_id: string;
  plan_id: string;
  type: string;
}

export interface AppendResearchParams {
  workspace_id: string;
  plan_id: string;
  filename: string;
  content: string;
}

export interface InitialiseAgentParams {
  workspace_id?: string;  // Optional - if not provided, returns workspace status
  plan_id?: string;       // Optional - if not provided, returns available plans
  agent_type: AgentType;
  context: Record<string, unknown>;
  compact?: boolean;  // Default true - return compact plan state (summarized sessions/lineage/steps)
  context_budget?: number;  // Optional byte budget - progressively trim response to fit
  include_workspace_context?: boolean;  // If true, include workspace context summary in response
  validate?: boolean;  // Optional - run validation as part of init
  validation_mode?: 'init+validate';
  deployment_context?: {  // Set by orchestrators to influence validation
    deployed_by: AgentType | 'User';  // Who is deploying this agent
    reason: string;                    // Why this agent was chosen
    override_validation?: boolean;     // Default true - validation respects this deployment
  };
}

export interface HandoffParams {
  workspace_id: string;
  plan_id: string;
  from_agent: AgentType;
  to_agent: AgentType;
  reason: string;
  data?: Record<string, unknown>;
}

/**
 * Structured handoff data template for Reviewer build-check mode.
 * When Reviewer hands off to Coordinator after build verification, data should follow this shape.
 * Coordinator passes build_instructions, optimization_suggestions, and
 * dependency_notes to the user.
 * @deprecated Renamed from BuilderHandoffData - Builder merged into Reviewer
 */
export interface BuilderHandoffData {
  recommendation: 'Reviewer' | 'Revisionist' | 'Archivist';
  mode: 'regression_check' | 'final_verification';
  build_success: boolean;
  scripts_run: string[];
  /** User-facing build/run instructions (final_verification only) */
  build_instructions?: string;
  /** Actionable optimization recommendations */
  optimization_suggestions?: string[];
  /** Dependency status notes */
  dependency_notes?: string[];
  /** Regression report details (regression_check only) */
  regression_report?: {
    errors: Array<{ file: string; line?: number; message: string }>;
    suspected_step?: {
      index: number;
      phase: string;
      task: string;
      confidence: 'high' | 'medium' | 'low';
      reasoning: string;
    };
    regression_summary: string;
  };
}

// =============================================================================
// TDD Cycle State
// =============================================================================

export type TDDPhase = 'red' | 'green' | 'refactor';

export interface TDDCycleIteration {
  cycle: number;
  red?: { test_written: boolean; test_fails: boolean; test_file: string };
  green?: { code_written: boolean; test_passes: boolean; impl_file: string };
  refactor?: { reviewed: boolean; changes_made: boolean };
}

/**
 * TDD cycle state tracked by TDDDriver hub agent.
 * Stored/retrieved via memory_context with type "tdd_cycle_state".
 */
export interface TDDCycleState {
  cycle_number: number;
  current_phase: TDDPhase;
  test_file: string;
  implementation_file?: string;
  iterations: TDDCycleIteration[];
}

export interface GetMissionBriefingParams {
  workspace_id: string;
  plan_id: string;
}

export interface GetLineageParams {
  workspace_id: string;
  plan_id: string;
}

export interface CompleteAgentParams {
  workspace_id: string;
  plan_id: string;
  agent_type: AgentType;
  summary: string;
  artifacts?: string[];
}

export interface GetWorkspacePlansParams {
  workspace_id: string;
}

export interface ImportPlanParams {
  workspace_id: string;
  plan_file_path: string;  // Absolute path to the plan.md file in the workspace
  title?: string;          // Optional title override (otherwise extracted from file)
  category: RequestCategory;
  priority?: PlanPriority;
  categorization?: RequestCategorization;
}

export interface ImportPlanResult {
  plan_state: PlanState;
  original_path: string;
  archived_path: string;
  imported_content: string;
}

// =============================================================================
// Tool Responses
// =============================================================================

export interface ToolResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// =============================================================================
// Agent Init Result
// =============================================================================

export interface InitialiseAgentResult {
  session: AgentSession;
  plan_state: PlanState | CompactPlanState;
  workspace_status: {
    registered: boolean;
    workspace_id?: string;
    workspace_path?: string;
    active_plans: string[];
    message: string;
  };
  role_boundaries: AgentRoleBoundaries;  // CRITICAL: Constraints this agent MUST follow
  instruction_files?: AgentInstructionFile[];  // Instruction files for this agent from Coordinator
  matched_skills?: MatchedSkillEntry[];  // Skills matched against current plan/step context
  validation?: { success: boolean; result?: unknown; error?: string };
  workspace_context_summary?: WorkspaceContextSummary;  // Opt-in via include_workspace_context=true
  context_size_bytes?: number;  // Total payload size for monitoring (plan_state + workspace_context + matched_skills)
}

/**
 * A matched skill entry returned in agent init response.
 * Includes skill metadata and content for top matches.
 */
export interface MatchedSkillEntry {
  skill_name: string;
  relevance_score: number;
  matched_keywords: string[];
  /** Full SKILL.md content — included only for top 2-3 matches */
  content?: string;
}

// =============================================================================
// Agent Instruction Files
// =============================================================================

export interface GenerateAgentInstructionsParams {
  workspace_id: string;
  plan_id: string;
  target_agent: AgentType;
  mission: string;
  context?: string[];
  constraints?: string[];
  deliverables?: string[];
  files_to_read?: string[];
  output_path?: string;  // Workspace-relative path, defaults to .memory/instructions/{target_agent}-{timestamp}.md
}

export interface AgentInstructionFile {
  filename: string;
  target_agent: AgentType;
  mission: string;
  context: string[];
  constraints: string[];
  deliverables: string[];
  files_to_read: string[];
  generated_at: string;
  plan_id: string;
  full_path: string;
}
