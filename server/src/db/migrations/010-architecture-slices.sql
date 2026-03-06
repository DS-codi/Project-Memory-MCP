-- Migration 010: architecture slices catalog
CREATE TABLE IF NOT EXISTS architecture_slices (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  path TEXT NOT NULL,
  type TEXT NOT NULL,
  catalog_metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_architecture_slices_workspace_id ON architecture_slices (workspace_id);
