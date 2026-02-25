/**
 * dashboard/server/src/db/types.ts
 *
 * Row-level type definitions mirroring server/src/db/types.ts.
 * Kept local to stay within the dashboard's TypeScript rootDir.
 */

export interface WorkspaceRow {
  id:            string;
  name:          string;
  path:          string;
  registered_at: string;
  /** JSON */
  profile:       string | null;
  meta:          string | null;
}

export interface PlanRow {
  id:               string;
  workspace_id:     string;
  title:            string;
  description:      string | null;
  status:           string;
  category:         string | null;
  priority:         string | null;
  /** 0 | 1 */
  is_program:       number;
  parent_program_id: string | null;
  /** JSON */
  goals:            string | null;
  /** JSON */
  success_criteria: string | null;
  schema_version:   string | null;
  recommended_next_agent: string | null;
  current_phase:    string | null;
  created_at:       string;
  updated_at:       string;
  archived_at:      string | null;
}

export interface PhaseRow {
  id:          string;
  plan_id:     string;
  name:        string;
  order_index: number;
  created_at:  string;
  updated_at:  string;
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
  requires_confirmation:      number; // 0 | 1
  requires_user_confirmation: number; // 0 | 1
  requires_validation:        number; // 0 | 1
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

export interface SessionRow {
  id:           string;
  plan_id:      string;
  agent_type:   string;
  started_at:   string;
  completed_at: string | null;
  summary:      string | null;
  /** JSON array of file paths */
  artifacts:    string | null;
  is_orphaned:  number; // 0 | 1
  /** JSON */
  context:      string | null;
}

export interface LineageRow {
  id:         string;
  plan_id:    string;
  from_agent: string;
  to_agent:   string;
  reason:     string;
  /** JSON */
  data:       string | null;
  timestamp:  string;
}

export interface ContextItemRow {
  id:          string;
  parent_type: string;
  parent_id:   string;
  type:        string;
  /** JSON */
  data:        string;
  created_at:  string;
  updated_at:  string;
}

export interface KnowledgeRow {
  id:               string;
  workspace_id:     string;
  slug:             string;
  title:            string;
  /** JSON */
  data:             string;
  category:         string | null;
  /** JSON array */
  tags:             string | null;
  created_by_agent: string | null;
  created_by_plan:  string | null;
  created_at:       string;
  updated_at:       string;
}

export interface EventLogRow {
  id:         number;
  event_type: string;
  /** JSON */
  data:       string | null;
  timestamp:  string;
}

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

export interface ProgramPlanRow {
  id:           string;
  program_id:   string;
  plan_id:      string;
  created_at:   string;
}
