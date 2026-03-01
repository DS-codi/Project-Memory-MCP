-- Migration 007: Deployable hub model category/workflow definitions
-- Adds explicit deployable-agent profiles and category workflow definitions
-- with relationships to agent_definitions.

CREATE TABLE IF NOT EXISTS deployable_agent_profiles (
  id          TEXT PRIMARY KEY,
  agent_name  TEXT NOT NULL UNIQUE REFERENCES agent_definitions(name) ON DELETE CASCADE,
  role        TEXT NOT NULL UNIQUE CHECK(role IN ('hub', 'prompt_analyst')),
  enabled     INTEGER NOT NULL DEFAULT 1,
  metadata    TEXT, -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deployable_profiles_enabled
  ON deployable_agent_profiles(enabled);

CREATE TABLE IF NOT EXISTS category_workflow_definitions (
  id                           TEXT PRIMARY KEY,
  category                     TEXT NOT NULL UNIQUE
                                 CHECK(category IN ('feature', 'bugfix', 'refactor', 'orchestration', 'program', 'quick_task', 'advisory')),
  scope_classification         TEXT NOT NULL
                                 CHECK(scope_classification IN ('quick_task', 'single_plan', 'multi_plan', 'program')),
  planning_depth               TEXT NOT NULL,
  workflow_path                TEXT NOT NULL DEFAULT '[]', -- JSON string[]
  skip_agents                  TEXT NOT NULL DEFAULT '[]', -- JSON string[]
  requires_research            INTEGER NOT NULL DEFAULT 0,
  requires_brainstorm          INTEGER NOT NULL DEFAULT 0,
  recommends_integrated_program INTEGER NOT NULL DEFAULT 0,
  recommended_plan_count       INTEGER NOT NULL DEFAULT 1,
  recommended_program_count    INTEGER NOT NULL DEFAULT 0,
  candidate_plan_titles        TEXT NOT NULL DEFAULT '[]', -- JSON string[]
  decomposition_strategy       TEXT,
  hub_agent_name               TEXT REFERENCES deployable_agent_profiles(agent_name) ON DELETE SET NULL,
  prompt_analyst_agent_name    TEXT REFERENCES deployable_agent_profiles(agent_name) ON DELETE SET NULL,
  metadata                     TEXT, -- JSON
  created_at                   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_category_workflow_scope
  ON category_workflow_definitions(scope_classification);
