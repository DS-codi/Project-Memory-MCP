/**
 * Memory Observer Dashboard - Shared Types
 * 
 * Core types matching the MCP server for workspace, plan, and agent state.
 */

// Re-export Plan Schema v2 types and analytics types
export * from './schema-v2';
export * from './stats';

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
  | 'Archivist'
  | 'SkillWriter'
  | 'Worker';

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

export type RequestCategory = 
  | 'feature'
  | 'bug'
  | 'change'
  | 'analysis'
  | 'investigation'
  | 'debug'
  | 'refactor'
  | 'documentation';

// Alias for convenience
export type PlanCategory = RequestCategory;

export type PlanTab = 'overview' | 'steps' | 'goals' | 'build-scripts' | 'agents' | 'files';

export type WorkspaceHealth = 'active' | 'stale' | 'blocked' | 'idle';

// =============================================================================
// Lineage & Sessions
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
// Plan Steps
// =============================================================================

export interface PlanStep {
  index: number;
  phase: string;
  task: string;
  status: StepStatus;
  type?: StepType;
  notes?: string;
  assignee?: string;
  requires_validation?: boolean;
  completed_at?: string;
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
  plan_id?: string;
  workspace_id: string;
  mcp_handle?: string;
}

// =============================================================================
// Plan Notes
// =============================================================================

export type PlanNoteType = 'info' | 'warning' | 'instruction';

export interface PlanNote {
  note: string;
  type: PlanNoteType;
  added_at: string;
  added_by: 'user' | 'agent';
}

// =============================================================================
// Plan State
// =============================================================================

export interface RequestCategorization {
  category: RequestCategory;
  confidence: number;
  reasoning: string;
  suggested_workflow: AgentType[];
  skip_agents?: AgentType[];
}

export interface PlanState {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  priority: PlanPriority;
  status: PlanStatus;
  category: RequestCategory;
  categorization?: RequestCategorization;
  current_phase: string;
  current_agent: AgentType | null;
  pending_notes?: PlanNote[];
  goals?: string[];
  success_criteria?: string[];
  build_scripts?: BuildScript[];
  is_program?: boolean;
  program_id?: string;
  created_at: string;
  updated_at: string;
  agent_sessions: AgentSession[];
  lineage: LineageEntry[];
  steps: PlanStep[];

  // Plan Schema v2 optional fields
  phases?: import('./schema-v2').PlanPhase[];
  difficulty_profile?: import('./schema-v2').DifficultyProfile;
  risk_register?: import('./schema-v2').RiskEntry[];
  pre_plan_build_status?: import('./schema-v2').PrePlanBuildStatus;
  matched_skills?: import('./schema-v2').SkillMatch[];
}

export interface PlanTemplate {
  template: string;
  category: PlanCategory;
  label: string;
  goals?: string[];
  success_criteria?: string[];
  steps?: Array<{ phase: string; task: string; status?: string; type?: string; requires_validation?: boolean }>;
}

// =============================================================================
// Workspace Types
// =============================================================================

export interface LanguageInfo {
  name: string;
  percentage: number;
  file_count: number;
  extensions: string[];
}

export interface WorkspaceProfile {
  indexed_at: string;
  languages: LanguageInfo[];
  frameworks: string[];
  build_system?: {
    type: string;
    config_file: string;
    build_command?: string;
  };
  total_files: number;
  total_lines: number;
}

export interface WorkspaceMeta {
  workspace_id: string;
  path: string;
  name: string;
  registered_at: string;
  last_accessed: string;
  active_plans: string[];
  archived_plans: string[];
  indexed: boolean;
  profile?: WorkspaceProfile;
  workspace_build_scripts?: BuildScript[];
}

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
  name: string;
  created_at: string;
  updated_at: string;
  sections: Record<string, WorkspaceContextSection>;
}

// =============================================================================
// Dashboard-Specific Types
// =============================================================================

export interface WorkspaceSummary {
  workspace_id: string;
  name: string;
  path: string;
  health: WorkspaceHealth;
  active_plan_count: number;
  archived_plan_count: number;
  last_activity: string;
  languages: { name: string; percentage: number }[];
  parent_workspace_id?: string;
  child_workspace_ids?: string[];
  child_workspaces?: WorkspaceSummary[];
}

export interface PlanSummary {
  id: string;
  title: string;
  category: RequestCategory;
  priority: PlanPriority;
  status: PlanStatus;
  current_agent: AgentType | null;
  progress: { done: number; total: number };
  created_at: string;
  updated_at: string;
  is_program?: boolean;
  program_id?: string;
  child_plan_ids?: string[];
  depends_on_plans?: string[];
  linked_plan_ids?: string[];
  relationships?: {
    kind: 'program' | 'child' | 'standalone';
    parent_program_id?: string;
    child_plan_ids: string[];
    linked_plan_ids: string[];
    dependent_plan_ids: string[];
    unresolved_linked_plan_ids: string[];
    state: 'none' | 'ready' | 'partial';
  };
}

// =============================================================================
// Agent Management
// =============================================================================

export interface AgentDeployment {
  workspace_id: string;
  workspace_name: string;
  deployed_path: string;
  version_hash: string;
  is_customized: boolean;
  last_updated: string;
  sync_status: 'synced' | 'outdated' | 'customized' | 'missing';
}

export interface AgentRegistry {
  agent_id: AgentType;
  template_path: string;
  template_hash: string;
  template_updated_at: string;
  deployments: AgentDeployment[];
}

// =============================================================================
// UI State Types
// =============================================================================

export interface PlanFilter {
  status: PlanStatus[];
  category: RequestCategory[];
  priority: PlanPriority[];
  search: string;
  programId?: string;
}

export interface LiveUpdate {
  timestamp: string;
  type: 'handoff' | 'step_update' | 'plan_created' | 'plan_archived';
  workspace_id: string;
  plan_id: string;
  message: string;
}

// =============================================================================
// VS Code Copilot Integration Types
// =============================================================================

export interface HandoffEntry {
  label: string;
  agent: string;
  prompt?: string;
  send?: boolean;
}

export interface AgentFrontmatter {
  name: string;
  description: string;
  tools?: string[];
  handoffs?: HandoffEntry[];
}

export interface PromptTemplate {
  id: string;
  filename: string;
  mode?: 'agent' | 'edit' | 'insert';
  description: string;
  variables: string[];
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstructionFile {
  id: string;
  filename: string;
  applyTo?: string;
  description?: string;
  content: string;
  isPathSpecific: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CopilotStatus {
  hasAgents: boolean;
  hasPrompts: boolean;
  hasInstructions: boolean;
  agentCount: number;
  promptCount: number;
  instructionCount: number;
  outdatedAgents: number;
  missingFiles: string[];
}

// =============================================================================
// Program Types (Multi-Plan Hierarchy)
// =============================================================================

export interface ProgramPlanRef {
  plan_id: string;
  title: string;
  status: PlanStatus;
  priority: PlanPriority;
  current_phase: string;
  progress: { done: number; total: number };
  depends_on_plans: string[];
}

export interface AggregateProgress {
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
  completion_percentage: number;
}

export interface ProgramSummary {
  program_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  workspace_id: string;
  plans: ProgramPlanRef[];
  aggregate_progress: AggregateProgress;
}

export interface ProgramDetail extends ProgramSummary {
  goals?: string[];
  success_criteria?: string[];
  notes?: PlanNote[];

  // Plan Schema v2 optional fields
  risk_register?: import('./schema-v2').RiskEntry[];
  phase_announcements?: import('./schema-v2').PhaseAnnouncement[];
}

// =============================================================================
// Skill Types
// =============================================================================

export interface SkillInfo {
  name: string;
  description: string;
  file_path: string;
  deployed: boolean;
  deployed_at?: string;
  workspace_id: string;
  content?: string;
}

// =============================================================================
// Worker Session Types
// =============================================================================

export interface WorkerSession extends AgentSession {
  agent_type: 'Worker';
  parent_hub_agent: AgentType;
  task_scope?: string;
}
