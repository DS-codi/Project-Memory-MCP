-- Migration 003: Extend program_risks and dependencies tables to match
-- ProgramRisk and ProgramDependency application types. Previously these
-- tables were incomplete schemas; this fills the missing columns so
-- program-store.ts can be replaced with direct DB operations.

-- ── program_risks: missing columns ──────────────────────────────────────────
ALTER TABLE program_risks ADD COLUMN title        text    NOT NULL DEFAULT '';
ALTER TABLE program_risks ADD COLUMN risk_status  text    NOT NULL DEFAULT 'identified';
ALTER TABLE program_risks ADD COLUMN detected_by  text    NOT NULL DEFAULT 'manual';
ALTER TABLE program_risks ADD COLUMN source_plan_id text;
ALTER TABLE program_risks ADD COLUMN updated_at   text    NOT NULL DEFAULT (datetime('now'));

-- ── dependencies: optional phase context ────────────────────────────────────
ALTER TABLE dependencies ADD COLUMN source_phase  text;
ALTER TABLE dependencies ADD COLUMN target_phase  text;
ALTER TABLE dependencies ADD COLUMN satisfied_at  text;
