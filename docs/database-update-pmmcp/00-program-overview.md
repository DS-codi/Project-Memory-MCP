# Program: Database Migration & System Stabilization

**Category:** Refactor / Infrastructure  
**Priority:** Critical  
**Status:** In Progress — Plans 1–4 Implementation Complete, Plan 4.5 Schema Done  

## Program Goal

Replace the file-based JSON storage with a single SQLite database (`better-sqlite3`) shared by the MCP server and dashboard. Stabilize the VS Code extension to stop degrading unrelated chat sessions. Extend the supervisor to facilitate dashboard ↔ DB connectivity and become the central orchestrator.

## Child Plans (Execution Order)

| # | Plan | Description | Depends On |
|---|------|-------------|------------|
| 1 | [Extension Strip-Down](01-extension-strip-down.md) | Remove LM tools, chat participant, aggressive timers. Make extension lightweight. Re-enable for real-world testing. | — |
| 2 | [Supervisor Extension](02-supervisor-extension.md) | Extend the Rust/QML supervisor to proxy dashboard↔DB, provide live update broadcasting, and manage the MCP admin API needed by later plans. | Plan 1 |
| 3 | [Schema Design & DB Foundation](03-schema-design-db-foundation.md) | Design the full SQLite schema, build the DB access layer, migration runner, and seed utilities. Store tools, agents, instructions, and skills in the DB. | Plan 2 |
| 3.5 | [Plan Type Schema Extension](03.5-plan-type-schema-extension.md) | Complete the schema with precise DDL for all plan-type-variant fields (`category` CHECK constraints, `paused_at_snapshot`, `program_risks`, `dep_type`/`dep_status` on dependencies). Update DB row types, mappers, and data access layer. Produce schema & query reference docs. | Plan 3 |
| 4 | [Data Migration](04-data-migration.md) | Build migration scripts to read all existing `data/` file structures and populate the new database. Validate referential integrity. | Plans 3, 3.5 |
| 4.5 | [Relational Gap Closure](04.5-relational-gap-closure.md) | Close three relational gaps not covered in Plans 3–4: `program_workspace_links` DDL + data access; normalise `steps.depends_on` JSON array → `dependencies` table rows; extend `research_documents` to support phase/step-level parent linking. | Plan 4 |
| 5 | [MCP Server Storage Replacement](05-mcp-server-storage-replacement.md) | Replace `file-store.ts` and all tool handlers with DB-backed equivalents. Clean break — no backwards compatibility with file storage. | Plans 4, 4.5 |
| 6 | [Dashboard & WebSocket Overhaul](06-dashboard-websocket-overhaul.md) | Remove `chokidar`, connect dashboard to DB via supervisor proxy. Replace file scanning with SQL queries. | Plan 5 |
| 7 | [Extension Enhancement (v2)](07-extension-enhancement-v2.md) | Add new functionality: deployment UI, plan status views, supervisor integration. Complimentary role. | Plan 6 |

## Success Criteria

- [ ] Dashboard stays connected indefinitely under heavy agent activity (no dropout)
- [ ] Disabling the extension causes zero overhead on other Copilot chat sessions
- [ ] All data from the file-based system is successfully migrated to SQLite
- [ ] Foreign key constraints prevent orphaned references
- [ ] Archival moves plans to archive tables, keeping active queries fast
- [ ] Supervisor proxies dashboard↔DB and broadcasts live updates
- [ ] Extension serves a complimentary role without duplicating MCP tools
- [ ] All existing tests pass after migration
