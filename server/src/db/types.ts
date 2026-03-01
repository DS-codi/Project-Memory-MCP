/**
 * Row type definitions for all SQLite tables.
 *
 * Each interface mirrors the column set of its corresponding table.
 * Nullable columns are typed as `string | null` (or `number | null`).
 * JSON columns are stored as `string` in the DB but typed here as `string`
 * (callers use `JSON.parse(row.field)` to deserialise).
 *
 * Integer booleans (0/1) are typed as `number` to match what better-sqlite3
 * returns; use `Boolean(row.field)` when you need a JS boolean.
 */

// ============================================================
// WORKSPACE & ORGANIZATION
// ============================================================

export interface WorkspaceRow {
  id:                  string;
  path:                string;
  name:                string;
  parent_workspace_id: string | null;
  registered_at:       string;
  updated_at:          string;
  /** JSON: { languages, frameworks, package_manager, ... } */
  profile:             string | null;
  /** JSON: additional metadata */
  meta:                string | null;
}

export interface ProgramRow {
  id:               string;
  workspace_id:     string;
  title:            string;
  description:      string;
  category:         'feature' | 'bugfix' | 'refactor' | 'orchestration' | 'quick_task' | 'advisory';
  priority:         'low' | 'medium' | 'high' | 'critical';
  status:           'active' | 'completed' | 'archived' | 'paused';
  schema_version:   string;
  /** JSON: string[] */
  goals:            string;
  /** JSON: string[] */
  success_criteria: string;
  /** 'v2' for native programs; 'v1_migrated' for converted is_program plans */
  source:           'v2' | 'v1_migrated';
  created_at:       string;
  updated_at:       string;
  archived_at:      string | null;
}

export interface ProgramPlanRow {
  id:          number;
  program_id:  string;
  plan_id:     string;
  order_index: number;
  added_at:    string;
}

export interface ProgramWorkspaceLinkRow {
  id:           number;
  program_id:   string;
  workspace_id: string;
  linked_at:    string;
  linked_by:    string | null;
}

export interface ProgramRiskRow {
  id:                string;
  program_id:        string;
  risk_type:         'functional_conflict' | 'behavioral_change' | 'dependency_risk';
  severity:          'low' | 'medium' | 'high' | 'critical';
  description:       string;
  /** JSON: string[] */
  affected_plan_ids: string;
  mitigation:        string | null;
  created_at:        string;
  // extended in migration 003
  title:             string;
  risk_status:       'identified' | 'mitigated' | 'accepted' | 'resolved';
  detected_by:       'auto' | 'manual';
  source_plan_id:    string | null;
  updated_at:        string;
}

// ============================================================
// PLANS & STRUCTURE
// ============================================================

export interface PlanRow {
  id:                     string;
  workspace_id:           string;
  program_id:             string | null;
  title:                  string;
  description:            string;
  category:               'feature' | 'bugfix' | 'refactor' | 'orchestration' | 'quick_task' | 'advisory';
  priority:               'low' | 'medium' | 'high' | 'critical';
  status:                 'active' | 'completed' | 'archived' | 'paused' | 'blocked';
  schema_version:         string;
  /** JSON: string[] */
  goals:                  string;
  /** JSON: string[] */
  success_criteria:       string;
  /** JSON: CategorizationResult | null */
  categorization:         string | null;
  /** JSON: DeploymentContext | null */
  deployment_context:     string | null;
  /** JSON: ConfirmationState | null */
  confirmation_state:     string | null;
  /** ISO 8601 timestamp extracted from paused_at_snapshot for indexed queries */
  paused_at:              string | null;
  /** JSON: PausedAtSnapshot | null */
  paused_at_snapshot:     string | null;
  recommended_next_agent: string | null;
  created_at:             string;
  updated_at:             string;
  archived_at:            string | null;
  completed_at:           string | null;
}

export interface PhaseRow {
  id:          string;
  plan_id:     string;
  name:        string;
  order_index: number;
  created_at:  string;
}

export interface StepRow {
  id:                         string;
  phase_id:                   string;
  plan_id:                    string;
  task:                       string;
  type:                       string;
  status:                     string;
  assignee:                   string | null;
  notes:                      string | null;
  order_index:                number;
  /** 0 | 1 */
  requires_confirmation:      number;
  /** 0 | 1 */
  requires_user_confirmation: number;
  /** 0 | 1 */
  requires_validation:        number;
  /**
   * @deprecated Legacy JSON integer-index array — column removed from schema in 002.
   * May be non-null only on pre-002 databases. Use `dependencies` table instead.
   */
  depends_on?:                string | null;
  created_at:                 string;
  updated_at:                 string;
  completed_at:               string | null;
  completed_by_agent:         string | null;
}

export interface PlanNoteRow {
  id:         string;
  plan_id:    string;
  content:    string;
  note_type:  string;
  created_at: string;
}

// ============================================================
// AGENT LIFECYCLE
// ============================================================

export interface SessionRow {
  id:           string;
  plan_id:      string;
  agent_type:   string;
  started_at:   string;
  completed_at: string | null;
  summary:      string | null;
  /** JSON array of file paths */
  artifacts:    string | null;
  /** 0 | 1 */
  is_orphaned:  number;
  /** JSON: { deployed_by, reason, current_step_index, ... } */
  context:      string | null;
}

export interface LineageRow {
  id:         string;
  plan_id:    string;
  from_agent: string;
  to_agent:   string;
  reason:     string;
  /** JSON: { recommendation, steps_completed, files_modified, ... } */
  data:       string | null;
  timestamp:  string;
}

// ============================================================
// CONTEXT & KNOWLEDGE
// ============================================================

export type ContextParentType = 'workspace' | 'plan' | 'phase' | 'step';

export interface ContextItemRow {
  id:          string;
  parent_type: ContextParentType;
  parent_id:   string;
  type:        string;
  /** JSON */
  data:        string;
  created_at:  string;
  updated_at:  string;
}

export interface ResearchDocumentRow {
  id:           number;
  workspace_id: string;
  /** Polymorphic parent scope */
  parent_type:  'workspace' | 'plan' | 'phase' | 'step';
  /** NULL only when parent_type = 'workspace' */
  parent_id:    string | null;
  filename:     string;
  content:      string;
  created_at:   string;
  updated_at:   string;
}

export interface KnowledgeRow {
  id:               string;
  workspace_id:     string;
  slug:             string;
  title:            string;
  /** JSON */
  data:             string;
  category:         string | null;
  /** JSON array of strings */
  tags:             string | null;
  created_by_agent: string | null;
  created_by_plan:  string | null;
  created_at:       string;
  updated_at:       string;
}

// ============================================================
// BUILD & DEPENDENCIES
// ============================================================

export interface BuildScriptRow {
  id:           string;
  workspace_id: string;
  plan_id:      string | null;
  name:         string;
  description:  string | null;
  command:      string;
  directory:    string;
  mcp_handle:   string | null;
  created_at:   string;
}

export interface DependencyRow {
  id:           number;
  source_type:  'plan' | 'phase' | 'step' | 'program';
  source_id:    string;
  target_type:  'plan' | 'phase' | 'step' | 'program';
  target_id:    string;
  dep_type:     'blocks' | 'informs';
  dep_status:   'pending' | 'satisfied';
  created_at:   string;
  // extended in migration 003
  source_phase: string | null;
  target_phase: string | null;
  satisfied_at: string | null;
}

// ============================================================
// TOOL CATALOG
// ============================================================

export interface ToolRow {
  id:          string;
  name:        string;
  description: string;
}

export interface ToolActionRow {
  id:          string;
  tool_id:     string;
  name:        string;
  description: string;
}

export interface ToolActionParamRow {
  id:            string;
  action_id:     string;
  name:          string;
  type:          string;
  /** 0 | 1 */
  required:      number;
  description:   string;
  default_value: string | null;
}

/** Convenience object returned by `getToolHelp()`. */
export interface ToolHelp {
  tool:    ToolRow;
  actions: Array<{
    action: ToolActionRow;
    params: ToolActionParamRow[];
  }>;
}

// ============================================================
// AGENT / INSTRUCTION / SKILL STORAGE
// ============================================================

export interface AgentDefinitionRow {
  id:         string;
  name:       string;
  content:    string;
  /** JSON */
  metadata:   string | null;
  /** JSON: string[] of "tool:action" or "tool:*" patterns permitted for this role */
  allowed_tools:         string | null;
  /** JSON: string[] of "tool:action" patterns explicitly blocked for this role */
  blocked_tools:         string | null;
  /** JSON: string[] — keys that must be present in context_payload before deploy */
  required_context_keys: string | null;
  /** JSON: CheckpointTriggerConfig — conditions that embed checkpoint rules into materialised files */
  checkpoint_triggers:   string | null;
  /** 1 = permanent on-disk file (hub, prompt-analyst); 0 = ephemeral session-scoped */
  is_permanent:          number;
  created_at: string;
  updated_at: string;
}

export interface DeployableAgentProfileRow {
  id:         string;
  agent_name: string;
  role:       'hub' | 'prompt_analyst';
  enabled:    number;
  /** JSON */
  metadata:   string | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryWorkflowDefinitionRow {
  id:                            string;
  category:                      'feature' | 'bugfix' | 'refactor' | 'orchestration' | 'program' | 'quick_task' | 'advisory';
  scope_classification:          'quick_task' | 'single_plan' | 'multi_plan' | 'program';
  planning_depth:                string;
  /** JSON string[] */
  workflow_path:                 string;
  /** JSON string[] */
  skip_agents:                   string;
  requires_research:             number;
  requires_brainstorm:           number;
  recommends_integrated_program: number;
  recommended_plan_count:        number;
  recommended_program_count:     number;
  /** JSON string[] */
  candidate_plan_titles:         string;
  decomposition_strategy:        string | null;
  hub_agent_name:                string | null;
  prompt_analyst_agent_name:     string | null;
  /** JSON */
  metadata:                      string | null;
  created_at:                    string;
  updated_at:                    string;
}

/** Live registry of active agent sessions, used to build ##PEER_SESSIONS blocks. */
export interface WorkspaceSessionRegistryRow {
  id:                   string;  // mirrors sessions.id
  workspace_id:         string;
  plan_id:              string | null;
  agent_type:           string;
  current_phase:        string | null;
  /** JSON: number[] */
  step_indices_claimed: string;
  /** JSON: string[] of absolute file paths */
  files_in_scope:       string;
  /** Absolute path to materialised .agent.md written by deploy_agent_to_workspace */
  materialised_path:    string | null;
  status:               'active' | 'stopping' | 'completed';
  started_at:           string;
  updated_at:           string;
}

/** DB-owned GUI routing contract.  Hub queries by contract_type key at spawn time. */
export interface GuiRoutingContractRow {
  id:                       string;
  contract_type:            'approval' | 'brainstorm';
  version:                  string;
  /** JSON: TriggerCriteria */
  trigger_criteria:         string;
  /** JSON: JSONSchema for the FormRequest payload sent to the GUI */
  invocation_params_schema: string;
  /** JSON: expected response envelope shape */
  response_schema:          string;
  /** JSON: keyed by outcome ('approve'|'reject'|'timeout'|'select'), value = MCP call array */
  feedback_paths:           string;
  fallback_behavior:        'auto-select-recommended' | 'block' | 'skip';
  enabled:                  number; // 1 | 0
  created_at:               string;
  updated_at:               string;
}

export interface InstructionFileRow {
  id:         string;
  filename:   string;
  applies_to: string;
  content:    string;
  created_at: string;
  updated_at: string;
}

export interface SkillDefinitionRow {
  id:               string;
  name:             string;
  category:         string | null;
  /** JSON array */
  tags:             string | null;
  /** JSON array */
  language_targets:  string | null;
  /** JSON array */
  framework_targets: string | null;
  content:          string;
  description:      string | null;
  created_at:       string;
  updated_at:       string;
}

// ============================================================
// AUDIT
// ============================================================

export interface UpdateLogRow {
  id:           number;
  workspace_id: string;
  timestamp:    string;
  action:       string;
  /** JSON */
  data:         string | null;
}

export interface EventLogRow {
  id:         number;
  event_type: string;
  /** JSON */
  data:       string | null;
  timestamp:  string;
}

export interface FileEditRow {
  id:            number;
  workspace_id:  string;
  plan_id:       string;
  step_id:       string | null;
  file_path:     string;
  change_type:   'create' | 'edit' | 'delete' | 'rename';
  previous_path: string | null;
  edited_at:     string;
  agent_type:    string | null;
  session_id:    string | null;
  notes:         string | null;
}

// ============================================================
// ARCHIVE (mirrors of active tables plus archived_at)
// ============================================================

export interface PlanArchiveRow extends PlanRow {
  archived_at: string;
}

export interface PhaseArchiveRow extends PhaseRow {
  archived_at: string;
}

export interface StepArchiveRow extends StepRow {
  archived_at: string;
}

export interface SessionArchiveRow extends SessionRow {
  archived_at: string;
}

export interface LineageArchiveRow extends LineageRow {
  archived_at: string;
}

// ============================================================
// DEPLOYMENT TRACKING (agents, instructions, skills)
// ============================================================

export interface AgentDeploymentRow {
  id:            string;
  workspace_id:  string;
  agent_name:    string;
  deployed_path: string;
  version_hash:  string;
  /** SQLite boolean: 0 | 1 */
  is_customized: number;
  sync_status:   'synced' | 'outdated' | 'customized' | 'missing';
  deployed_at:   string;
  last_updated:  string;
}

export interface InstructionDeploymentRow {
  id:            string;
  workspace_id:  string;
  filename:      string;
  deployed_path: string;
  version_hash:  string;
  /** SQLite boolean: 0 | 1 */
  is_customized: number;
  sync_status:   'synced' | 'outdated' | 'customized' | 'missing';
  deployed_at:   string;
  last_updated:  string;
}

export interface SkillDeploymentRow {
  id:            string;
  workspace_id:  string;
  skill_name:    string;
  deployed_path: string;
  version_hash:  string;
  /** SQLite boolean: 0 | 1 */
  is_customized: number;
  sync_status:   'synced' | 'outdated' | 'customized' | 'missing';
  deployed_at:   string;
  last_updated:  string;
}

// ============================================================
// MIGRATIONS TRACKER (internal)
// ============================================================

export interface MigrationRow {
  id:         number;
  filename:   string;
  applied_at: string;
}
