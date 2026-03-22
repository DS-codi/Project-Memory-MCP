-- Migration 011: Fix deployable_agent_profiles CHECK constraint to include 'shell'
--
-- Earlier installs may have a version of this table whose CHECK constraint
-- only allowed ('hub', 'prompt_analyst').  SQLite does not support ALTER TABLE
-- … MODIFY COLUMN, so we rebuild the table using the standard 12-step method,
-- preserving all existing rows.
--
-- Fresh installs already have the correct constraint from migration 007 and
-- will run this migration harmlessly (the INSERT … SELECT copies all rows,
-- the DROP removes the identically-structured old table, and the RENAME
-- restores the canonical name).

CREATE TABLE IF NOT EXISTS deployable_agent_profiles_v2 (
  id          TEXT PRIMARY KEY,
  agent_name  TEXT NOT NULL UNIQUE REFERENCES agent_definitions(name) ON DELETE CASCADE,
  role        TEXT NOT NULL UNIQUE CHECK(role IN ('hub', 'prompt_analyst', 'shell')),
  enabled     INTEGER NOT NULL DEFAULT 1,
  metadata    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO deployable_agent_profiles_v2
  SELECT id, agent_name, role, enabled, metadata, created_at, updated_at
  FROM deployable_agent_profiles;

DROP TABLE deployable_agent_profiles;

ALTER TABLE deployable_agent_profiles_v2 RENAME TO deployable_agent_profiles;

CREATE INDEX IF NOT EXISTS idx_deployable_profiles_enabled
  ON deployable_agent_profiles(enabled);
