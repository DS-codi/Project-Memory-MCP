-- Migration 005: Instruction and skill deployment tracking
-- Tracks which instruction files and skills are deployed to each workspace,
-- their content hash, and sync status relative to the source template.

-- ── Instruction file deployments ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS instruction_deployments (
  id             TEXT    NOT NULL PRIMARY KEY,
  workspace_id   TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  filename       TEXT    NOT NULL,   -- matches instruction_files.filename
  deployed_path  TEXT    NOT NULL DEFAULT '',
  version_hash   TEXT    NOT NULL DEFAULT '',
  is_customized  INTEGER NOT NULL DEFAULT 0,
  sync_status    TEXT    NOT NULL DEFAULT 'missing'
                   CHECK(sync_status IN ('synced', 'outdated', 'customized', 'missing')),
  deployed_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_updated   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, filename)
);

CREATE INDEX IF NOT EXISTS idx_instruction_deployments_workspace
  ON instruction_deployments(workspace_id);

CREATE INDEX IF NOT EXISTS idx_instruction_deployments_filename
  ON instruction_deployments(filename);

-- ── Skill deployments ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS skill_deployments (
  id             TEXT    NOT NULL PRIMARY KEY,
  workspace_id   TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  skill_name     TEXT    NOT NULL,   -- matches skill_definitions.name
  deployed_path  TEXT    NOT NULL DEFAULT '',
  version_hash   TEXT    NOT NULL DEFAULT '',
  is_customized  INTEGER NOT NULL DEFAULT 0,
  sync_status    TEXT    NOT NULL DEFAULT 'missing'
                   CHECK(sync_status IN ('synced', 'outdated', 'customized', 'missing')),
  deployed_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_updated   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_skill_deployments_workspace
  ON skill_deployments(workspace_id);

CREATE INDEX IF NOT EXISTS idx_skill_deployments_skill
  ON skill_deployments(skill_name);
