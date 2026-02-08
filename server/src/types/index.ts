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
  | 'Analyst'
  | 'Brainstorm'
  | 'Runner'
  | 'Researcher'
  | 'Architect'
  | 'Executor'
  | 'Builder'
  | 'Revisionist'
  | 'Reviewer'
  | 'Tester'
  | 'Archivist';

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
// Request Categories - Different types of user prompts
// =============================================================================

export type RequestCategory = 
  | 'feature'      // Add new functionality
  | 'bug'          // Fix something broken
  | 'change'       // Modify existing behavior
  | 'analysis'     // Understand how something works
  | 'investigation' // Deep problem resolution and discovery
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
// Build Scripts
// =============================================================================

export interface BuildScript {
  id: string;
  name: string;
  description: string;
  command: string;
  directory: string;
  created_at: string;
  plan_id?: string;       // If associated with a specific plan
  workspace_id: string;   // Workspace this script belongs to
  mcp_handle?: string;    // Optional MCP tool handle for programmatic execution
  directory_path?: string; // Absolute directory path resolved by the MCP tool
  command_path?: string;   // Absolute command path when command is a file path
}

// Build Script Result Types for MCP Tool Actions
export interface AddBuildScriptResult {
  script: BuildScript;
}

export interface ListBuildScriptsResult {
  scripts: BuildScript[];
}

export interface RunBuildScriptResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface DeleteBuildScriptResult {
  deleted: boolean;
  script_id: string;
}

// =============================================================================
// Agent Role Boundaries - Enforced constraints per agent type
// =============================================================================

export interface AgentRoleBoundaries {
  agent_type: AgentType;
  can_implement: boolean;         // Can create/edit code files
  can_edit_docs?: boolean;        // Can edit documentation files (README, docs, etc.)
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
  Analyst: {
    agent_type: 'Analyst',
    can_implement: true,  // Can make small changes to get analysis/experiments working
    can_finalize: false,
    must_handoff_to: ['Coordinator', 'Executor', 'Archivist'],  // Can spawn subagents or hand back to Coordinator
    forbidden_actions: [],  // Analyst can edit files for analysis purposes
    primary_responsibility: 'Long-term iterative analysis and investigation - manages hypothesis-driven exploration cycles, reverse engineering, and format discovery. Can make small code changes to support analysis.'
  },
  Brainstorm: {
    agent_type: 'Brainstorm',
    can_implement: false,
    can_finalize: false,
    must_handoff_to: ['Coordinator', 'Architect'],
    forbidden_actions: ['create files', 'edit code', 'run tests', 'implement features'],
    primary_responsibility: 'Explore ideas, compare approaches, and refine requirements before a formal plan is created.'
  },
  Runner: {
    agent_type: 'Runner',
    can_implement: true,
    can_finalize: false,
    must_handoff_to: ['Coordinator', 'Analyst', 'Brainstorm'],
    forbidden_actions: [],
    primary_responsibility: 'Execute quick, ad-hoc tasks without formal plans, logging context when useful.'
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
    must_handoff_to: ['Builder', 'Reviewer', 'Tester'],
    forbidden_actions: [],
    primary_responsibility: 'Implement code changes according to Architect design'
  },
  Builder: {
    agent_type: 'Builder',
    can_implement: false,
    can_finalize: false,
    must_handoff_to: ['Tester', 'Revisionist'],
    forbidden_actions: [
      'create files',
      'edit code',
      'implement features',
      'run terminal commands',
      'run ad-hoc build commands'
    ],
    primary_responsibility: 'Execute build scripts via memory_plan actions, verify builds succeed, diagnose build failures'
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
    can_edit_docs: true,  // Can edit documentation files (README, docs, etc.)
    can_finalize: true,  // ONLY agent that can complete without handoff
    must_handoff_to: [],
    forbidden_actions: ['create source files', 'edit source code', 'implement features'],
    primary_responsibility: 'Archive completed plan, update documentation, commit changes'
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
  build_scripts?: BuildScript[];  // Plan-specific build scripts
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
// Workspace Metadata (workspace.meta.json)
// =============================================================================

export interface WorkspaceMeta {
  schema_version?: string;
  workspace_id: string;
  workspace_path?: string;
  path: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  registered_at: string;
  last_accessed: string;
  last_seen_at?: string;
  data_root?: string;
  legacy_workspace_ids?: string[];
  source?: string;
  status?: string;
  active_plans: string[];
  archived_plans: string[];
  indexed: boolean;  // Whether codebase has been indexed
  profile?: WorkspaceProfile;  // Codebase profile from indexing
  workspace_build_scripts?: BuildScript[];  // Workspace-level build scripts
}

// =============================================================================
// Workspace Context (workspace.context.json)
// =============================================================================

export interface WorkspaceContextSectionItem {
  title: string;
  description?: string;
  links?: string[];
}

export interface WorkspaceContextSection {
  summary?: string;
  items?: WorkspaceContextSectionItem[];
}

export interface WorkspaceContext {
  schema_version: string;
  workspace_id: string;
  workspace_path: string;
  identity_file_path?: string;
  name: string;
  created_at: string;
  updated_at: string;
  sections: Record<string, WorkspaceContextSection>;
  update_log?: WorkspaceUpdateLog;
  audit_log?: WorkspaceAuditLog;
}

export interface WorkspaceUpdateLogEntry {
  timestamp: string;
  tool: string;
  action?: string;
  file_path: string;
  summary: string;
  plan_id?: string;
  agent?: string;
  untracked?: boolean;
  warning?: string;
}

export interface WorkspaceUpdateLog {
  entries: WorkspaceUpdateLogEntry[];
  last_updated: string;
}

export interface WorkspaceAuditEntry {
  timestamp: string;
  tool: string;
  action?: string;
  file_path: string;
  summary: string;
  plan_id?: string;
  agent?: string;
  warning: string;
}

export interface WorkspaceAuditLog {
  entries: WorkspaceAuditEntry[];
  last_updated: string;
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
  validate?: boolean;  // Optional - run validation as part of init
  validation_mode?: 'init+validate';
  deployment_context?: {  // Set by orchestrators to influence validation
    deployed_by: AgentType | 'User';  // Who is deploying this agent
    reason: string;                    // Why this agent was chosen
    override_validation?: boolean;     // Default true - validation respects this deployment
  };
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
  instruction_files?: AgentInstructionFile[];  // Instruction files for this agent from Coordinator
  validation?: { success: boolean; result?: unknown; error?: string };
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
