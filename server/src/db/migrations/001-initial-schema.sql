-- ============================================================
-- Project Memory MCP — Initial Schema (Migration 001)
-- SQLite with WAL mode, FK enforcement, and JSON functions
-- ============================================================

-- ============================================================
-- WORKSPACE & ORGANIZATION
-- ============================================================

CREATE TABLE IF NOT EXISTS workspaces (
  id                 TEXT    PRIMARY KEY,
  path               TEXT    NOT NULL UNIQUE,
  name               TEXT    NOT NULL,
  parent_workspace_id TEXT   REFERENCES workspaces(id) ON DELETE SET NULL,
  registered_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  profile            TEXT,   -- JSON: { languages, frameworks, package_manager, ... }
  meta               TEXT    -- JSON: additional metadata
);

CREATE TABLE IF NOT EXISTS programs (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  category         TEXT NOT NULL DEFAULT 'feature'
                     CHECK(category IN (
                       'feature','bugfix','refactor',
                       'orchestration','quick_task','advisory'
                     )),
  priority         TEXT NOT NULL DEFAULT 'medium'
                     CHECK(priority IN ('low','medium','high','critical')),
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK(status IN ('active','completed','archived','paused')),
  schema_version   TEXT NOT NULL DEFAULT '2.0',
  goals            TEXT NOT NULL DEFAULT '[]',   -- JSON: string[]
  success_criteria TEXT NOT NULL DEFAULT '[]',   -- JSON: string[]
  source           TEXT NOT NULL DEFAULT 'v2'
                     CHECK(source IN ('v2','v1_migrated')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at      TEXT
);

-- ============================================================
-- PLANS & STRUCTURE
-- ============================================================

CREATE TABLE IF NOT EXISTS plans (
  id                    TEXT PRIMARY KEY,
  workspace_id          TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  program_id            TEXT REFERENCES programs(id) ON DELETE SET NULL,
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  category              TEXT NOT NULL DEFAULT 'feature'
                          CHECK(category IN (
                            'feature','bugfix','refactor',
                            'orchestration','quick_task','advisory'
                          )),
  priority              TEXT NOT NULL DEFAULT 'medium'
                          CHECK(priority IN ('low','medium','high','critical')),
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK(status IN (
                            'active','completed','archived','paused','blocked'
                          )),
  schema_version        TEXT NOT NULL DEFAULT '2.0',
  goals                 TEXT NOT NULL DEFAULT '[]',            -- JSON: string[]
  success_criteria      TEXT NOT NULL DEFAULT '[]',            -- JSON: string[]
  categorization        TEXT,         -- JSON: CategorizationResult | null
  deployment_context    TEXT,         -- JSON: DeploymentContext | null
  confirmation_state    TEXT,         -- JSON: ConfirmationState | null
  paused_at             TEXT,         -- ISO 8601 timestamp | null
  paused_at_snapshot    TEXT,         -- JSON: PausedAtSnapshot | null
  recommended_next_agent TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at           TEXT,
  completed_at          TEXT
);

CREATE TABLE IF NOT EXISTS program_plans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id  TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  plan_id     TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  added_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(program_id, plan_id)
);

-- Cross-workspace program visibility.
-- One row per (program, foreign workspace) pair.
-- Plans in that workspace can then be added to program_plans normally.
CREATE TABLE IF NOT EXISTS program_workspace_links (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id   TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  linked_at    TEXT NOT NULL DEFAULT (datetime('now')),
  linked_by    TEXT,  -- agent type or 'user' that created the link
  UNIQUE(program_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS program_risks (
  id                TEXT PRIMARY KEY,
  program_id        TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  risk_type         TEXT NOT NULL
                      CHECK(risk_type IN (
                        'functional_conflict',
                        'behavioral_change',
                        'dependency_risk'
                      )),
  severity          TEXT NOT NULL
                      CHECK(severity IN ('low','medium','high','critical')),
  description       TEXT NOT NULL,
  affected_plan_ids TEXT NOT NULL DEFAULT '[]',  -- JSON: string[]
  mitigation        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS phases (
  id          TEXT PRIMARY KEY,
  plan_id     TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(plan_id, name)
);

CREATE TABLE IF NOT EXISTS steps (
  id                        TEXT    PRIMARY KEY,
  phase_id                  TEXT    NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  plan_id                   TEXT    NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  task                      TEXT    NOT NULL,
  type                      TEXT    NOT NULL DEFAULT 'standard',
  status                    TEXT    NOT NULL DEFAULT 'pending',
  assignee                  TEXT,
  notes                     TEXT,
  order_index               INTEGER NOT NULL DEFAULT 0,
  requires_confirmation     INTEGER NOT NULL DEFAULT 0,
  requires_user_confirmation INTEGER NOT NULL DEFAULT 0,
  requires_validation       INTEGER NOT NULL DEFAULT 0,
  created_at                TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at              TEXT,
  completed_by_agent        TEXT
);

CREATE TABLE IF NOT EXISTS plan_notes (
  id         TEXT PRIMARY KEY,
  plan_id    TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  note_type  TEXT NOT NULL DEFAULT 'info',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- AGENT LIFECYCLE
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  plan_id      TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  agent_type   TEXT NOT NULL,
  started_at   TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  summary      TEXT,
  artifacts    TEXT,  -- JSON array of file paths
  is_orphaned  INTEGER NOT NULL DEFAULT 0,
  context      TEXT   -- JSON object: deployed_by, reason, etc.
);

CREATE TABLE IF NOT EXISTS lineage (
  id          TEXT    PRIMARY KEY,
  plan_id     TEXT    NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  from_agent  TEXT    NOT NULL,
  to_agent    TEXT    NOT NULL,
  reason      TEXT    NOT NULL DEFAULT '',
  data        TEXT,   -- JSON object: recommendation, steps_completed, files_modified, etc.
  timestamp   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- CONTEXT & KNOWLEDGE
-- ============================================================

CREATE TABLE IF NOT EXISTS context_items (
  id          TEXT PRIMARY KEY,
  parent_type TEXT NOT NULL,  -- 'workspace' | 'plan' | 'phase' | 'step'
  parent_id   TEXT NOT NULL,
  type        TEXT NOT NULL,
  data        TEXT NOT NULL,  -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS research_documents (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- Polymorphic parent: workspace, plan, phase, or step
  parent_type  TEXT NOT NULL DEFAULT 'plan'
                 CHECK(parent_type IN ('workspace','plan','phase','step')),
  parent_id    TEXT,  -- NULL only when parent_type = 'workspace'
  filename     TEXT NOT NULL,
  content      TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, parent_type, parent_id, filename)
);

CREATE TABLE IF NOT EXISTS knowledge (
  id                TEXT PRIMARY KEY,
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug              TEXT NOT NULL,
  title             TEXT NOT NULL,
  data              TEXT NOT NULL,  -- JSON
  category          TEXT,
  tags              TEXT,           -- JSON array
  created_by_agent  TEXT,
  created_by_plan   TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, slug)
);

-- ============================================================
-- BUILD & DEPENDENCIES
-- ============================================================

CREATE TABLE IF NOT EXISTS build_scripts (
  id          TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id     TEXT REFERENCES plans(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  description TEXT,
  command     TEXT NOT NULL,
  directory   TEXT NOT NULL,
  mcp_handle  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dependencies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL
                CHECK(source_type IN ('plan','phase','step','program')),
  source_id   TEXT NOT NULL,
  target_type TEXT NOT NULL
                CHECK(target_type IN ('plan','phase','step','program')),
  target_id   TEXT NOT NULL,
  dep_type    TEXT NOT NULL DEFAULT 'blocks'
                CHECK(dep_type IN ('blocks','informs')),
  dep_status  TEXT NOT NULL DEFAULT 'pending'
                CHECK(dep_status IN ('pending','satisfied')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_type, source_id, target_type, target_id)
);

-- ============================================================
-- TOOL CATALOG
-- ============================================================

CREATE TABLE IF NOT EXISTS tools (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tool_actions (
  id          TEXT PRIMARY KEY,
  tool_id     TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  UNIQUE(tool_id, name)
);

CREATE TABLE IF NOT EXISTS tool_action_params (
  id            TEXT PRIMARY KEY,
  action_id     TEXT NOT NULL REFERENCES tool_actions(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'string',
  required      INTEGER NOT NULL DEFAULT 0,
  description   TEXT NOT NULL DEFAULT '',
  default_value TEXT,
  UNIQUE(action_id, name)
);

-- ============================================================
-- AGENT / INSTRUCTION / SKILL STORAGE
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_definitions (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  content    TEXT NOT NULL DEFAULT '',
  metadata   TEXT,  -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS instruction_files (
  id         TEXT PRIMARY KEY,
  filename   TEXT NOT NULL UNIQUE,
  applies_to TEXT NOT NULL DEFAULT '**/*',
  content    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS skill_definitions (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE,
  category          TEXT,
  tags              TEXT,              -- JSON array
  language_targets  TEXT,              -- JSON array
  framework_targets TEXT,              -- JSON array
  content           TEXT NOT NULL DEFAULT '',
  description       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- AUDIT
-- ============================================================

CREATE TABLE IF NOT EXISTS update_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  timestamp    TEXT    NOT NULL DEFAULT (datetime('now')),
  action       TEXT    NOT NULL,
  data         TEXT    -- JSON
);

CREATE TABLE IF NOT EXISTS event_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  data       TEXT,  -- JSON
  timestamp  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-step file edit history.
-- step_id is nullable: edits discovered via migration may not resolve to a step.
CREATE TABLE IF NOT EXISTS step_file_edits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id       TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  step_id       TEXT REFERENCES steps(id) ON DELETE SET NULL,
  file_path     TEXT NOT NULL,    -- relative to workspace root
  change_type   TEXT NOT NULL DEFAULT 'edit'
                  CHECK(change_type IN ('create','edit','delete','rename')),
  previous_path TEXT,             -- only for rename operations
  edited_at     TEXT NOT NULL DEFAULT (datetime('now')),
  agent_type    TEXT,
  session_id    TEXT,
  notes         TEXT
);

-- ============================================================
-- ARCHIVE TABLES (mirrors of active tables, plus archived_at)
-- ============================================================

CREATE TABLE IF NOT EXISTS plans_archive (
  id                    TEXT PRIMARY KEY,
  workspace_id          TEXT NOT NULL,
  program_id            TEXT,
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  category              TEXT NOT NULL DEFAULT 'feature'
                          CHECK(category IN (
                            'feature','bugfix','refactor',
                            'orchestration','quick_task','advisory'
                          )),
  priority              TEXT NOT NULL DEFAULT 'medium'
                          CHECK(priority IN ('low','medium','high','critical')),
  status                TEXT NOT NULL DEFAULT 'archived',
  schema_version        TEXT NOT NULL DEFAULT '2.0',
  goals                 TEXT NOT NULL DEFAULT '[]',
  success_criteria      TEXT NOT NULL DEFAULT '[]',
  categorization        TEXT,
  deployment_context    TEXT,
  confirmation_state    TEXT,
  paused_at             TEXT,
  paused_at_snapshot    TEXT,
  recommended_next_agent TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  archived_at           TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at          TEXT
);

CREATE TABLE IF NOT EXISTS phases_archive (
  id          TEXT PRIMARY KEY,
  plan_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  archived_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS steps_archive (
  id                        TEXT    PRIMARY KEY,
  phase_id                  TEXT    NOT NULL,
  plan_id                   TEXT    NOT NULL,
  task                      TEXT    NOT NULL,
  type                      TEXT    NOT NULL DEFAULT 'standard',
  status                    TEXT    NOT NULL DEFAULT 'done',
  assignee                  TEXT,
  notes                     TEXT,
  order_index               INTEGER NOT NULL DEFAULT 0,
  requires_confirmation     INTEGER NOT NULL DEFAULT 0,
  requires_user_confirmation INTEGER NOT NULL DEFAULT 0,
  requires_validation       INTEGER NOT NULL DEFAULT 0,
  created_at                TEXT    NOT NULL,
  updated_at                TEXT    NOT NULL,
  completed_at              TEXT,
  completed_by_agent        TEXT,
  archived_at               TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions_archive (
  id           TEXT PRIMARY KEY,
  plan_id      TEXT NOT NULL,
  agent_type   TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  completed_at TEXT,
  summary      TEXT,
  artifacts    TEXT,
  is_orphaned  INTEGER NOT NULL DEFAULT 0,
  context      TEXT,
  archived_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lineage_archive (
  id          TEXT    PRIMARY KEY,
  plan_id     TEXT    NOT NULL,
  from_agent  TEXT    NOT NULL,
  to_agent    TEXT    NOT NULL,
  reason      TEXT    NOT NULL DEFAULT '',
  data        TEXT,
  timestamp   TEXT    NOT NULL,
  archived_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Workspaces
CREATE INDEX IF NOT EXISTS idx_workspaces_path            ON workspaces(path);
CREATE INDEX IF NOT EXISTS idx_workspaces_parent          ON workspaces(parent_workspace_id);

-- Programs
CREATE INDEX IF NOT EXISTS idx_programs_workspace         ON programs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_programs_status            ON programs(workspace_id, status);

-- Program plans (join table)
CREATE INDEX IF NOT EXISTS idx_program_plans_program      ON program_plans(program_id);
CREATE INDEX IF NOT EXISTS idx_program_plans_plan         ON program_plans(plan_id);

-- Program risks
CREATE INDEX IF NOT EXISTS idx_program_risks_program      ON program_risks(program_id);

-- Plans
CREATE INDEX IF NOT EXISTS idx_plans_workspace_status     ON plans(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_plans_workspace            ON plans(workspace_id);
CREATE INDEX IF NOT EXISTS idx_plans_workspace_category   ON plans(workspace_id, category);
CREATE INDEX IF NOT EXISTS idx_plans_program_id           ON plans(program_id) WHERE program_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plans_paused_at            ON plans(paused_at) WHERE paused_at IS NOT NULL;

-- Phases
CREATE INDEX IF NOT EXISTS idx_phases_plan_order          ON phases(plan_id, order_index);

-- Steps
CREATE INDEX IF NOT EXISTS idx_steps_phase_order          ON steps(phase_id, order_index);
CREATE INDEX IF NOT EXISTS idx_steps_plan                 ON steps(plan_id);
CREATE INDEX IF NOT EXISTS idx_steps_plan_status          ON steps(plan_id, status);

-- Sessions
CREATE INDEX IF NOT EXISTS idx_sessions_plan              ON sessions(plan_id);

-- Lineage
CREATE INDEX IF NOT EXISTS idx_lineage_plan               ON lineage(plan_id);

-- Context items  
CREATE INDEX IF NOT EXISTS idx_context_parent             ON context_items(parent_type, parent_id);
CREATE INDEX IF NOT EXISTS idx_context_parent_type        ON context_items(parent_type, parent_id, type);

-- Research (polymorphic parent)
CREATE INDEX IF NOT EXISTS idx_research_workspace  ON research_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_research_parent     ON research_documents(parent_type, parent_id);

-- Knowledge
CREATE INDEX IF NOT EXISTS idx_knowledge_workspace        ON knowledge(workspace_id);

-- Build scripts
CREATE INDEX IF NOT EXISTS idx_build_scripts_workspace    ON build_scripts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_build_scripts_plan         ON build_scripts(plan_id);

-- Dependencies
CREATE INDEX IF NOT EXISTS idx_deps_source                ON dependencies(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_deps_target                ON dependencies(target_type, target_id);

-- Program workspace links
CREATE INDEX IF NOT EXISTS idx_pwl_program   ON program_workspace_links(program_id);
CREATE INDEX IF NOT EXISTS idx_pwl_workspace ON program_workspace_links(workspace_id);

-- Step file edits
CREATE INDEX IF NOT EXISTS idx_sfe_workspace ON step_file_edits(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sfe_plan      ON step_file_edits(plan_id);
CREATE INDEX IF NOT EXISTS idx_sfe_step      ON step_file_edits(step_id);
CREATE INDEX IF NOT EXISTS idx_sfe_file_path ON step_file_edits(file_path);
CREATE INDEX IF NOT EXISTS idx_sfe_edited_at ON step_file_edits(edited_at);

-- Update log
CREATE INDEX IF NOT EXISTS idx_update_log_workspace       ON update_log(workspace_id);
CREATE INDEX IF NOT EXISTS idx_update_log_timestamp       ON update_log(timestamp);

-- Event log
CREATE INDEX IF NOT EXISTS idx_event_log_type             ON event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_timestamp        ON event_log(timestamp);

-- Tool catalog
CREATE INDEX IF NOT EXISTS idx_tool_actions_tool          ON tool_actions(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_params_action         ON tool_action_params(action_id);

-- Skill definitions
CREATE INDEX IF NOT EXISTS idx_skill_category             ON skill_definitions(category);
