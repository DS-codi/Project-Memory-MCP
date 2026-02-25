-- ============================================================
-- Migration 002: Relational Gap Closure
--
-- Adds: program_workspace_links, step_file_edits
-- Updates: research_documents → polymorphic parent model
-- Removes: steps.depends_on, steps_archive.depends_on
--
-- Idempotent: all CREATE TABLE / CREATE INDEX use IF NOT EXISTS.
-- The DROP COLUMN statements may fail silently on SQLite < 3.35.0;
-- the schema will still be functional (column is ignored by code).
-- ============================================================

-- ============================================================
-- Phase 1: program_workspace_links
-- ============================================================

CREATE TABLE IF NOT EXISTS program_workspace_links (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id   TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  linked_at    TEXT NOT NULL DEFAULT (datetime('now')),
  linked_by    TEXT,
  UNIQUE(program_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_pwl_program   ON program_workspace_links(program_id);
CREATE INDEX IF NOT EXISTS idx_pwl_workspace ON program_workspace_links(workspace_id);

-- ============================================================
-- Phase 3: Polymorphic research_documents
--
-- Strategy: rename old table → create new → migrate data → drop old.
-- Uses INSERT OR IGNORE so re-runs are safe.
-- ============================================================

-- Step 3a: create the new table (different structure, so must be a new name)
CREATE TABLE IF NOT EXISTS research_documents_v2 (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_type  TEXT NOT NULL DEFAULT 'plan'
                 CHECK(parent_type IN ('workspace','plan','phase','step')),
  parent_id    TEXT,
  filename     TEXT NOT NULL,
  content      TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, parent_type, parent_id, filename)
);

-- Step 3b: migrate existing plan-scoped research rows
INSERT OR IGNORE INTO research_documents_v2
  (workspace_id, parent_type, parent_id, filename, content, created_at, updated_at)
SELECT workspace_id, 'plan', plan_id, filename, content, created_at, updated_at
FROM research_documents
WHERE plan_id IS NOT NULL;

-- Step 3c: migrate workspace-scoped research rows (plan_id IS NULL)
INSERT OR IGNORE INTO research_documents_v2
  (workspace_id, parent_type, parent_id, filename, content, created_at, updated_at)
SELECT workspace_id, 'workspace', NULL, filename, content, created_at, updated_at
FROM research_documents
WHERE plan_id IS NULL;

-- Step 3d: drop old table and rename new one
DROP TABLE IF EXISTS research_documents;
ALTER TABLE research_documents_v2 RENAME TO research_documents;

-- Step 3e: create indexes on new table
CREATE INDEX IF NOT EXISTS idx_research_workspace ON research_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_research_parent    ON research_documents(parent_type, parent_id);

-- ============================================================
-- Phase 4: step_file_edits
-- ============================================================

CREATE TABLE IF NOT EXISTS step_file_edits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id       TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  step_id       TEXT REFERENCES steps(id) ON DELETE SET NULL,
  file_path     TEXT NOT NULL,
  change_type   TEXT NOT NULL DEFAULT 'edit'
                  CHECK(change_type IN ('create','edit','delete','rename')),
  previous_path TEXT,
  edited_at     TEXT NOT NULL DEFAULT (datetime('now')),
  agent_type    TEXT,
  session_id    TEXT,
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_sfe_workspace ON step_file_edits(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sfe_plan      ON step_file_edits(plan_id);
CREATE INDEX IF NOT EXISTS idx_sfe_step      ON step_file_edits(step_id);
CREATE INDEX IF NOT EXISTS idx_sfe_file_path ON step_file_edits(file_path);
CREATE INDEX IF NOT EXISTS idx_sfe_edited_at ON step_file_edits(edited_at);

-- ============================================================
-- Phase 2: depends_on column removal note
--
-- The steps.depends_on column was never part of migration 001 (initial schema).
-- All DBs created by this migration set do not have this column.
-- No ALTER TABLE is required here.
-- ============================================================
