# agent's inital tldr:
Program: Database Migration & System Stabilization (v2)
TL;DR: Replace the file-based JSON storage with a single SQLite database (better-sqlite3) shared by the MCP server and dashboard. Restructure data into a proper relational schema with first-class phases, dependency DAGs, and polymorphic context linking. Fix the extension's tool registration to stop degrading unrelated chat sessions. Migrate all existing file-based data into the new schema.

The workspace.context.json alone has 469 lines of update logs — that's a single file being locked, read-parsed-modified-written on nearly every tool call. Replacing this with indexed rows eliminates the bottleneck entirely.

# agent's initially proposed schema:
workspaces
  ├── programs (integrated programs, FK → workspace, cross-workspace links via program_workspace_links)
  │     └── plans (FK → workspace NOT NULL, FK → program NULLABLE)
  │           ├── phases (FK → plan, order_index)
  │           │     └── steps (FK → phase, order_index, status, assignee, type)
  │           ├── sessions (agent sessions, FK → plan)
  │           ├── lineage (handoff history, FK → plan)
  │           └── plan_notes (FK → plan)
  ├── context_items (polymorphic: links to workspace/plan/phase/step)
  ├── research_documents (longer-form text, FK → plan NULLABLE, FK → workspace)
  ├── knowledge (workspace-scoped knowledge files)
  ├── build_scripts (FK → workspace, FK → plan NULLABLE)
  └── update_log (replaces workspace.context.json update_log)

dependencies (DAG table)
  source_type + source_id → target_type + target_id
  (plan→plan, phase→phase, step→step, cross-type allowed)

program_workspace_links (cross-workspace program visibility)
  program_id + workspace_id

plan_archive (same columns as plans, receives rows on archive)
  └── phase_archive, step_archive, etc.

# agent's initially proposed plans:

Key design points:

Phases become first-class entities instead of string labels on steps
Dependencies are a generic edge table supporting plan→plan, phase→phase, step→step, and cross-type (step→phase, etc.) constraints
Context items use polymorphic linking: (parent_type, parent_id) where parent_type ∈ {workspace, plan, phase, step} — so you can attach context at any level
Research documents are stored as TEXT rows (content column). For truly massive documents (>1MB), a file_path column allows external storage
Archival moves completed plans + children to _archive tables, keeping the active tables lean
Foreign keys enforced (PRAGMA foreign_keys = ON) — no more orphaned references
Indexes on all FK columns + (status) on plans/steps for fast active-item queries
Child Plans
Plan 1: Schema Design & DB Foundation

Design and finalize the full SQLite schema (DDL with all tables, FKs, indexes, triggers)
Add better-sqlite3 to the server package
Build the DB access layer: connection manager, migration runner, query helpers
Write the schema migration (v1 → creates all tables)
Write seed/test utilities for development
Design the archival trigger/procedure (move plan + children to archive tables)
Plan 2: Data Migration

Build a migration script that reads all existing data/ directory structures
Parse workspace.meta.json → workspaces table
Parse workspace.context.json → context_items + update_log rows
Parse state.json → plans + extract phases from step labels → phases + steps
Parse original_request.json, other context files → context_items
Parse research_notes/*.md → research_documents
Handle integrated programs: extract program_id, child_plan_ids → programs + program_workspace_links
Validate referential integrity post-migration
Handle edge cases: ghost workspaces, duplicate IDs, missing files
Plan 3: MCP Server Storage Replacement

Create db-store.ts replacing file-store.ts — all exports maintain the same function signatures initially, backed by SQL
Replace file-lock.ts entirely (SQLite handles concurrency via WAL mode)
Update all tool handlers in server/src/tools/ to use DB queries
Update the event emitter to fire on DB writes instead of file watches
Remove workspace-registry.json (replaced by workspaces table)
Remove projectmemory-paths.ts, workspace-utils.ts path generation (DB doesn't need path helpers)
Update the plan, steps, context, agent, and workspace tools to leverage SQL (e.g., WHERE status = 'active' instead of load-all-then-filter)
Ensure the dashboard Express server reads from the same DB file
Plan 4: Dashboard & WebSocket Overhaul

Remove chokidar file watcher from dashboard server entirely
Replace fileScanner.ts with direct DB queries via the shared db-store
Update all Express routes in dashboard/server/src/routes/ to query DB
Replace WebSocket event source: use SQLite update_hook or a simple pub/sub triggered on DB writes
Update frontend hooks if any API response shapes change
Verify live updates work reliably without file watching
Plan 5: Extension Stabilization

Make languageModelTools registration conditional: off by default, enabled via setting projectMemory.enableChatTools
Make chatParticipants registration conditional similarly
Reduce timer frequency or make timers lazy (only start when dashboard is open)
Fix ConnectionManager retry storms — exponential backoff with max 3 attempts, then stop
Remove McpBridge HTTP calls when tools aren't registered
Test that disabling the extension eliminates all overhead on other chat sessions
Verification
Server tests: npx vitest run in ./server — all existing tests adapted to DB
Dashboard tests: npx vitest run in ./dashboard
Migration validation: script that reads old file data and DB data, diffs for completeness
Extension: manual test — disable Project Memory, run a normal Copilot chat session, confirm zero overhead
Load test: create 50 plans with 20 steps each, verify dashboard stays responsive
Key Decisions
SQLite via better-sqlite3 over alternatives — sync API, zero config, JSON functions, single file
First-class phases instead of string labels — enables phase-level dependencies and confirmation gates
Polymorphic context linking (parent_type + parent_id) — flexible enough to attach context at any level without schema changes
Archive tables instead of status flag — keeps active queries fast as plan count grows
WAL mode for SQLite — allows concurrent reads while writing, eliminates lock contention
Extension tools off by default — users opt in, preventing degradation of unrelated sessions
Asking a ques



# my responses:
**Please create the program as individual (.md) files in the format of checklists**
Please structure the documents so that all phases and checklist items are at the top with headers.
Include references and important definitions after all checklist items.
## Plan 1 (added detail):
- We should also have tools, their actions and the required arguments with descriptions for each that the agent can query.
- The context tool specifically should get tailored actions for agents to be able to interact with the db by having arguments available for each table and collumn. A search action would be good to provide agents with too.
- Agent, instruction and skill files should all get stored in the db if possible (potentially broken up and categorized by prompt categorization which is the feature of an earlier plan that hasnt properly seen testing yet)
## Plan 2 (added detail):
- Read more of the different data structures/files to add more detail to this plan.
The db should be able to handle everything in the data folder currently.
Plan 3 (added detail):
- If we build the tools to migrate plans to the new database system, we wont need to maintain the old system for any reason. Keeping the old functionality would be messy and could result in the tools becoming very hard to maintain. Clean replacement is the only result i'll accept.
- if the plan tool was update so that agents in action could just call the tool with an action like "next" that would mark their current step as complete and provide them the next step in one tool call that would be perfect.
- The only file that will end up remaining that's necessary from workspace to workspace will be the identity.json in /.projectmemory
## Plan 4 (added detail):
- Add to the supervisor application which runs the mcp proxy to facilitate the dashboard's connection to the db and mcp.
the mcp proxy could easily be extended to provide the dashboard with updates via the supervisor which will also need extension
## Plan 5 (added detail):
- If the tools are the same and the extension tools offer nothing unique, they should be culled from the extension. Again, with no backwards compatibilty.
- The extension will need heavy work to function and compliment the new database storage system. It's purpose is lessened/diminished significantly. It should still offer means for deployment of agent (hub) files and easily getting plan details but injection and stopping/anything regarding the mcp tools should be relegated to the supervisor.
- It should be extended into something actually useful but mostly complimentary.
## Plan 6 (added plan):
- The supervisor app should have both it's gui and functionality extended. This plan should probably be like 2 or 3 because it will be required for the other parts to work.

# Important notes:
- After creating the plan, you should follow a similar workflow to what the MCP does as its a pattern that is proven to work, research (gathers context useful for improving the plan) → architect (uses the research to improve the plan and refines into phases and steps) → executor (acts on the plan) → tester 
- The extension should be fixed as the first plan (have tools culled from it, strip unnecessary features) so that we can add these plans to the existing system and reenable the extension as the system could still help us through development and that would allow us to real world test as we go. It should get another plan for a later stage to add new functionality giving the extension 2 plans.


# Earlier QA:
**QA before plans**
**Questions from Agent:**
Here's the proposed integrated program with 4 child plans. Does this breakdown make sense? **Program: Database Migration & System Stabilization** **Plan 1: Schema Design & DB Foundation** - Design the SQLite schema (tables, FKs, indexes, triggers) - Set up better-sqlite3 in the server package - Build the DB access layer (connection, migrations, query helpers) - Create migration script to import existing file-based data **Plan 2: MCP Server Storage Replacement** - Replace file-store.ts with db-store.ts - Update all tool handlers to use DB queries instead of file reads/writes - Eliminate file-lock.ts (SQLite handles concurrency) - Keep file watcher for backward compat during transition, then remove **Plan 3: Dashboard Server & Frontend Update** - Replace fileScanner.ts with DB queries - Replace chokidar file watcher with DB change notifications (or polling) - Update Express routes to query DB directly - Update WebSocket events to fire on DB writes instead of file changes - Update frontend hooks if API shape changes **Plan 4: Extension Stabilization** - Make tool registration lazy/conditional (off by default or on-demand) - Reduce timer overhead (session sync, prune) - Fix connection retry storms when server isn't running - Optional: decouple chat participant from tool registration
**My answers:**
I'm the only one using this system so maintaining backwards compatibility isnt strictly necessary but the migration agent should be given the knowledge and tools to breakup old file based plans and data into the new db. All plans should be migrated into the new v2 structure as well but this will happen anyways given all of the plans will be broken up for the system. I'd want there to be a Workspaces table which will parent Integrated Programs which should have the ability to have relations to plans in other workspaces. Integrated Programs should but not always have relations to plans with the plans being many-to-one to the Integrated Programs (but not a requirement unless we wanted a specific integrtated program that is defined for unrelated/detached plans). Plans and Integrated Programs should require a workspace relation (non nullable), Phases are children of Plans and Steps are children of phases. It needs to be possible to define dependent plans/phases/steps relationally to each other (ie. when step x must be complete before y). Similarily, it needs to be possible to define relational links between context and research to plans and all planning types. Research and context should also be broken up but im not sure in which way`
**Leaving out irrelevant details**: I'm not copy/pasting our initial discussion about sql choice.
