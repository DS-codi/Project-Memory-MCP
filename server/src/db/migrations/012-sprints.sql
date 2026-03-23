-- ============================================================
-- Project Memory MCP — Sprints Schema (Migration 012)
-- Sprint tracking with goals and optional plan attachment
-- ============================================================

-- ============================================================
-- SPRINTS
-- ============================================================

CREATE TABLE IF NOT EXISTS sprints (
  sprint_id        TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  attached_plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK(status IN ('active', 'completed', 'archived')),
  goals            TEXT NOT NULL DEFAULT '[]',   -- JSON: Goal[] (legacy embedded goals)
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sprints_workspace ON sprints(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sprints_status ON sprints(status);
CREATE INDEX IF NOT EXISTS idx_sprints_attached_plan ON sprints(attached_plan_id);

-- ============================================================
-- GOALS (normalized table for sprint goals)
-- ============================================================

CREATE TABLE IF NOT EXISTS goals (
  goal_id      TEXT PRIMARY KEY,
  sprint_id    TEXT NOT NULL REFERENCES sprints(sprint_id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  completed    INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_goals_sprint ON goals(sprint_id);
CREATE INDEX IF NOT EXISTS idx_goals_completed ON goals(completed);
