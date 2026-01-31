/**
 * Project Memory MCP Server - Type Definitions
 * 
 * Core types for workspace, plan, and agent state management.
 */

// =============================================================================
// Agent Types
// =============================================================================

export type AgentType = 
  | 'Coordinator'
  | 'Researcher'
  | 'Architect'
  | 'Executor'
  | 'Revisionist'
  | 'Reviewer'
  | 'Tester'
  | 'Archivist';

export type StepStatus = 'pending' | 'active' | 'done' | 'blocked';

export type PlanStatus = 'active' | 'paused' | 'completed' | 'archived' | 'failed';

export type PlanPriority = 'low' | 'medium' | 'high' | 'critical';

// =============================================================================
// Request Categories - Different types of user prompts
// =============================================================================

export type RequestCategory = 
  | 'feature'      // Add new functionality
  | 'bug'          // Fix something broken
  | 'change'       // Modify existing behavior
  | 'analysis'     // Understand how something works
  | 'debug'        // Investigate a specific issue
  | 'refactor'     // Improve code without changing behavior
  | 'documentation'; // Update or create docs

export interface RequestCategorization {
  category: RequestCategory;
  confidence: number;  // 0-1 confidence in categorization
  reasoning: string;
  suggested_workflow: AgentType[];
  skip_agents?: AgentType[];  // Agents that can be skipped for this category
}

// =============================================================================
// Lineage & Handoff
// =============================================================================

export interface LineageEntry {
  timestamp: string;
  from_agent: AgentType | 'User';
  to_agent: AgentType;
  reason: string;
}

export interface AgentSession {
  session_id: string;
  agent_type: AgentType;
  started_at: string;
  completed_at?: string;
  context: Record<string, unknown>;
  summary?: string;
  artifacts?: string[];
}

// =============================================================================
// Agent Role Boundaries - Enforced constraints per agent type
// =============================================================================

export interface AgentRoleBoundaries {
  agent_type: AgentType;
  can_implement: boolean;         // Can create/edit code files
  can_finalize: boolean;          // Can complete without handoff (only Archivist)
  must_handoff_to: AgentType[];   // Recommended next agents (Coordinator will deploy)
  forbidden_actions: string[];    // Actions this agent must NOT take
  primary_responsibility: string; // What this agent should focus on
}

/**
 * AGENT ROLE BOUNDARIES
 * 
 * HUB-AND-SPOKE MODEL:
 * - Coordinator is the hub that runs all other agents as subagents
 * - Subagents complete and return control to Coordinator
 * - must_handoff_to = recommendation for which agent Coordinator should deploy next
 * - Only Archivist can finalize (complete without recommending next agent)
 */
export const AGENT_BOUNDARIES: Record<AgentType, AgentRoleBoundaries> = {
  Coordinator: {
    agent_type: 'Coordinator',
    can_implement: false,
    can_finalize: false,
    must_handoff_to: ['Researcher', 'Architect'],  // Initial deployment options
    forbidden_actions: ['create files', 'edit code', 'run tests', 'implement features'],
    primary_responsibility: 'Orchestrate plan execution by deploying appropriate subagents'
  },
  Researcher: {
    agent_type: 'Researcher',
    can_implement: false,
    can_finalize: false,
    must_handoff_to: ['Architect'],
    forbidden_actions: ['create files', 'edit code', 'implement features'],
    primary_responsibility: 'Gather information, document findings, research patterns'
  },
  Architect: {
    agent_type: 'Architect',
    can_implement: false,
    can_finalize: false,
    must_handoff_to: ['Executor'],
    forbidden_actions: ['create files', 'edit code', 'implement features'],
    primary_responsibility: 'Design solution, define architecture, specify what to build'
  },
  Executor: {
    agent_type: 'Executor',
    can_implement: true,
    can_finalize: false,
    must_handoff_to: ['Reviewer', 'Tester'],
    forbidden_actions: [],
    primary_responsibility: 'Implement code changes according to Architect design'
  },
  Reviewer: {
    agent_type: 'Reviewer',
    can_implement: false,
    can_finalize: false,
    must_handoff_to: ['Tester', 'Archivist', 'Revisionist'],
    forbidden_actions: ['create files', 'edit code', 'implement features'],
    primary_responsibility: 'Review code quality, suggest improvements'
  },
  Tester: {
    agent_type: 'Tester',
    can_implement: true,  // Can create test files
    can_finalize: false,
    must_handoff_to: ['Archivist', 'Revisionist'],
    forbidden_actions: [],
    primary_responsibility: 'Write and run tests, verify implementation'
  },
  Revisionist: {
    agent_type: 'Revisionist',
    can_implement: false,
    can_finalize: false,
    must_handoff_to: ['Architect', 'Executor'],
    forbidden_actions: ['create files', 'edit code', 'implement features'],
    primary_responsibility: 'Analyze failures, adjust plan, redirect work'
  },
  Archivist: {
    agent_type: 'Archivist',
    can_implement: false,
    can_finalize: true,  // ONLY agent that can complete without handoff
    must_handoff_to: [],
    forbidden_actions: ['create files', 'edit code', 'implement features'],
    primary_responsibility: 'Archive completed plan, document outcomes'
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
  notes?: string;
  completed_at?: string;
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
  created_at: string;
  updated_at: string;
  agent_sessions: AgentSession[];
  lineage: LineageEntry[];
  steps: PlanStep[];
}

// =============================================================================
// Workspace Metadata (workspace.meta.json)
// =============================================================================

export interface WorkspaceMeta {
  workspace_id: string;
  path: string;
  name: string;
  registered_at: string;
  last_accessed: string;
  active_plans: string[];
  archived_plans: string[];
  indexed: boolean;  // Whether codebase has been indexed
  profile?: WorkspaceProfile;  // Codebase profile from indexing
}

// =============================================================================
// Workspace Profile - Created on first-time indexing
// =============================================================================

export interface WorkspaceProfile {
  indexed_at: string;
  languages: LanguageInfo[];
  frameworks: string[];
  build_system?: BuildSystemInfo;
  test_framework?: TestFrameworkInfo;
  package_manager?: string;
  key_directories: DirectoryInfo[];
  conventions: CodingConventions;
  total_files: number;
  total_lines: number;
}

export interface LanguageInfo {
  name: string;
  percentage: number;
  file_count: number;
  extensions: string[];
}

export interface BuildSystemInfo {
  type: string;  // 'npm', 'yarn', 'pnpm', 'cargo', 'gradle', 'maven', 'make', etc.
  config_file: string;
  build_command?: string;
  dev_command?: string;
}

export interface TestFrameworkInfo {
  name: string;  // 'jest', 'vitest', 'pytest', 'junit', etc.
  config_file?: string;
  test_command?: string;
  test_directory?: string;
}

export interface DirectoryInfo {
  path: string;
  purpose: string;  // 'source', 'tests', 'config', 'docs', 'assets', etc.
  file_count: number;
}

export interface CodingConventions {
  indentation?: 'tabs' | 'spaces';
  indent_size?: number;
  quote_style?: 'single' | 'double';
  semicolons?: boolean;
  trailing_commas?: boolean;
  line_endings?: 'lf' | 'crlf';
  max_line_length?: number;
}

// =============================================================================
// Tool Parameters
// =============================================================================

export interface RegisterWorkspaceParams {
  workspace_path: string;
}

export interface CreatePlanParams {
  workspace_id: string;
  title: string;
  description: string;
  category: RequestCategory;  // Required: what type of request is this
  priority?: PlanPriority;
  categorization?: RequestCategorization;  // Optional: full categorization details
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
}

export interface InitialiseAgentResult {
  session: AgentSession;
  plan_state: PlanState;
  workspace_status: {
    registered: boolean;
    workspace_id?: string;
    workspace_path?: string;
    active_plans: string[];
    message: string;
  };
  role_boundaries: AgentRoleBoundaries;  // CRITICAL: Constraints this agent MUST follow
}

export interface HandoffParams {
  workspace_id: string;
  plan_id: string;
  from_agent: AgentType;
  to_agent: AgentType;
  reason: string;
  data?: Record<string, unknown>;
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
