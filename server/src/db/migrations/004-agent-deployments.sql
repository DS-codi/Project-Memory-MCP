-- Migration 004: Agent deployment tracking
-- Tracks which agent templates are deployed to which workspaces,
-- their content hash, and sync status relative to the source template.

CREATE TABLE IF NOT EXISTS agent_deployments (
  id             TEXT    NOT NULL PRIMARY KEY,
  workspace_id   TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_name     TEXT    NOT NULL,
  deployed_path  TEXT    NOT NULL DEFAULT '',
  version_hash   TEXT    NOT NULL DEFAULT '',
  is_customized  INTEGER NOT NULL DEFAULT 0,
  sync_status    TEXT    NOT NULL DEFAULT 'missing'
                   CHECK(sync_status IN ('synced', 'outdated', 'customized', 'missing')),
  deployed_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_updated   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, agent_name)
);

CREATE INDEX IF NOT EXISTS idx_agent_deployments_workspace
  ON agent_deployments(workspace_id);

CREATE INDEX IF NOT EXISTS idx_agent_deployments_agent
  ON agent_deployments(agent_name);
