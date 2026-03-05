# Migration Registry

**Database:** `{PM_DATA_ROOT}/project-memory.db`  
**Migration Framework:** Custom Node.js runner (`server/src/db/migration-runner.ts`)  
**Tracking Table:** `_migrations (id INTEGER PK AUTOINCR, filename TEXT UNIQUE, applied_at TEXT)`  
**Date of Registry:** 2026-03-05

---

## Execution Order

| # | Filename | Description | Tables Created | Tables Altered |
|---|----------|-------------|---------------|----------------|
| 1 | `001-initial-schema.sql` | Initial schema — full workspace/plan/agent model | 25 active + 5 archive = 30 | — |
| 2 | `002-gap-closure.sql` | Relational gap closure — adds polymorphic research_documents, step_file_edits | 2 (step_file_edits, program_workspace_links) | research_documents (rename strategy) |
| 3 | `003-program-extended.sql` | Extend program_risks and dependencies | — | program_risks (+5 cols), dependencies (+3 cols) |
| 4 | `004-agent-deployments.sql` | Agent deployment tracking per workspace | 1 (agent_deployments) | — |
| 5 | `005-instruction-skill-deployments.sql` | Instruction + skill deployment tracking | 2 (instruction_deployments, skill_deployments) | — |
| 6 | `006-dynamic-hub-agent-model.sql` | Dynamic hub model — extends agent_definitions, adds session registry + GUI contracts | 2 (workspace_session_registry, gui_routing_contracts) | agent_definitions (+5 cols) |
| 7 | `007-deployable-workflow-definitions.sql` | Deployable hub agent profiles and category workflow definitions | 2 (deployable_agent_profiles, category_workflow_definitions) | — |
| 8 | `008-workspace-instruction-skill-assignments.sql` | Workspace-scoped instruction and skill assignments | 2 (workspace_instruction_assignments, workspace_skill_assignments) | — |
| 9 | `009-workflow-mode.sql` | Per-plan workflow mode settings + auto-delete trigger | 1 (plan_workflow_settings) | — |

**Total files:** 9  
**Total tables created across all migrations:** ~41 (35 domain + 1 tracking + 5 archive)  
**Total columns added via ALTER:** 13

---

## Migration Runner Summary

### Location
```
server/src/db/migration-runner.ts
```

### How `_migrations` Tracking Works
- On startup, `ensureMigrationsTable()` issues `CREATE TABLE IF NOT EXISTS _migrations`
- `appliedMigrations()` reads `SELECT filename FROM _migrations` into a `Set<string>`
- `pendingMigrationFiles()` reads `.sql` files from `migrations/` directory, sorts by filename, filters out already-applied filenames
- After each migration runs, `INSERT INTO _migrations (filename) VALUES (?)` records the applied filename
- **Idempotent by design:** running the runner multiple times only applies unapplied migrations

### Transactional Behavior
Each migration file is applied inside a **single `db.transaction()`** block:
- All statements in the file succeed together or roll back together
- The `_migrations` insert happens inside the same transaction
- If a migration throws, the transaction is rolled back and the error is re-thrown as `Migration "<filename>" failed: <msg>`

### Statement Splitter
Migration SQL files are split on `;` at end-of-line (handles multi-statement files). Comment stripping is applied to detect the leading SQL keyword for classification.

### Soft-Skip Behavior (DML / DROP COLUMN)
INSERT/UPDATE/DELETE/SELECT statements that fail with `"no such column"` are **soft-skipped** — this handles migrations written to upgrade old schemas when fresh test DBs already have the correct schema from `001-initial-schema.sql`.

After a soft-skip:
- The destination table name is recorded in `skipDdlForTables`
- Subsequent `DROP TABLE` or `ALTER TABLE RENAME` targeting that table are also skipped
- Any other error causes the entire migration transaction to roll back

### Error Handling
| Scenario | Behavior |
|----------|----------|
| DML / DROP COLUMN fails with "no such column" | Soft-skip; continue to next statement |
| Any other error | Roll back transaction; throw `Migration "<name>" failed: <msg>` |
| MIGRATIONS_DIR not found | Return empty pending list (no error) |

### Migration Status API
`migrationStatus()` returns full status for all `.sql` files: `{filename, applied, appliedAt}`. Used for diagnostics and admin tooling.

---

## Migration Sources

```
Directory:   server/src/db/migrations/
Framework:   Custom SQLite migration runner (no Prisma, no Flyway, no Knex)
Naming:      NNN-description.sql (zero-padded 3-digit sequence number)
Sort order:  Lexicographic (filename sort)
```

### Files (9 total)
```
001-initial-schema.sql                      (22,463 bytes)
002-gap-closure.sql                         ( 4,801 bytes)
003-program-extended.sql                    ( 1,192 bytes)
004-agent-deployments.sql                   ( 1,043 bytes)
005-instruction-skill-deployments.sql       ( 2,393 bytes)
006-dynamic-hub-agent-model.sql             ( 6,437 bytes)
007-deployable-workflow-definitions.sql     ( 2,358 bytes)
008-workspace-instruction-skill-assignments.sql (1,780 bytes)
009-workflow-mode.sql                       (   579 bytes)
```

### Key Design Decisions
1. **No rollback scripts** — migrations are forward-only; no `down` counterparts
2. **IF NOT EXISTS guards** — most CREATE TABLE/INDEX statements are idempotent
3. **Rename strategy for structural changes** — migration 002 uses CREATE → INSERT → DROP → RENAME to safely transform research_documents
4. **ALTER TABLE ADD COLUMN** — used for safe additive column changes (migrations 003, 006)
5. **Trigger for cascade** — migration 009 uses a trigger for plan_workflow_settings cleanup rather than a FK constraint, presumably for SQLite trigger semantics compatibility
