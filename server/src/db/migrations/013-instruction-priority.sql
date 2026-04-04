ALTER TABLE instruction_files ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE instruction_files ADD COLUMN auto_surface INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspace_instruction_assignments ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE workspace_instruction_assignments ADD COLUMN auto_surface INTEGER NOT NULL DEFAULT 0;
