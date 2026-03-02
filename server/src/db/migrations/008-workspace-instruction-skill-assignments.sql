-- Migration 008: Workspace-scoped instruction and skill assignments
-- Allows instructions and skills to be explicitly assigned to specific workspaces,
-- enabling workspace-specific agent context beyond the global applies_to glob matching.
-- Also adds a notes/description column to skill_definitions for discoverability.

-- ── Workspace instruction assignments ────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_instruction_assignments (
  id           TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,   -- matches instruction_files.filename
  notes        TEXT,
  assigned_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, filename)
);

CREATE INDEX IF NOT EXISTS idx_wia_workspace
  ON workspace_instruction_assignments(workspace_id);

CREATE INDEX IF NOT EXISTS idx_wia_filename
  ON workspace_instruction_assignments(filename);

-- ── Workspace skill assignments ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_skill_assignments (
  id           TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  skill_name   TEXT NOT NULL,   -- matches skill_definitions.name
  notes        TEXT,
  assigned_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_wsa_workspace
  ON workspace_skill_assignments(workspace_id);

CREATE INDEX IF NOT EXISTS idx_wsa_skill
  ON workspace_skill_assignments(skill_name);
