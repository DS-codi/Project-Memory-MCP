-- Migration 009: workflow mode settings per plan
CREATE TABLE IF NOT EXISTS plan_workflow_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  workflow_mode TEXT NOT NULL DEFAULT 'standard' CHECK(workflow_mode IN ('standard','tdd','enrichment','overnight')),
  set_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(plan_id)
);

CREATE TRIGGER IF NOT EXISTS trg_delete_workflow_settings
  AFTER DELETE ON plans
  FOR EACH ROW
BEGIN DELETE FROM plan_workflow_settings WHERE plan_id = OLD.id; END;
