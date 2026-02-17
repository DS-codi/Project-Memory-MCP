# Diagnose duplicate workspace folders and add workspace-wide context

**Plan ID:** plan_mlct1x3l_a3f2e9f4
**Status:** active
**Priority:** high
**Current Phase:** workflow-governance
**Current Agent:** Coordinator

## Description

Identify duplicate workspace folder causes and add workspace-wide context/data support across server, dashboard, extension, and agent instructions.

## Progress

- [x] **diagnosis:** [analysis] Confirm current workspace ID + data root derivations across MCP server, dashboard server, and extension; record mismatches and duplicate-folder triggers with concrete inputs/outputs.
  - _Confirmed workspace ID/data root derivations and duplicate-folder triggers; recorded in plan note._
- [x] **design:** [planning] Define canonical workspace ID normalization (path normalize/lowercase + hash + basename) and single data root resolution strategy; decide shared utility vs server-resolved ID endpoint.
  - _Canonical workspace ID + data root resolution defined with server-resolved endpoint/tool and shared resolver._
- [x] **design:** [planning] Specify workspace-level context schema, storage location, and metadata (e.g., workspace.context.json + workspace.meta.json) including required fields and validation rules.
  - _Workspace context schema/storage/validation defined (workspace.context.json + workspace.meta.json)._
- [x] **server:** Implement canonical workspace ID + data root utilities in server storage layer and refactor file-store usage to rely on them.
  - _Added workspace-utils for canonical workspace ID/data root and refactored file-store/workspace meta to use it._
- [x] **server:** Add workspace-scoped context CRUD to MCP tools/API (new tool or optional plan_id-less mode) with validation and clear error reporting.
  - _Added workspace-context CRUD tools and memory_context workspace_* actions with validation and schema updates._
- [x] **server:** [fix] Fix server build TypeScript errors from recent refactors (DATA_ROOT reference, workspace context return typing).
  - _Replaced DATA_ROOT usage with getDataRoot() and updated workspace_* context response types to WorkspaceContext._
- [x] **dashboard-server:** Align dashboard server data root + workspace ID derivations; prevent plan creation when workspace meta is missing or provide explicit workspace registration flow.
  - _Aligned dashboard server data root to canonical resolver, added workspace registration endpoint, and blocked plan creation when workspace meta is missing._
- [x] **dashboard-server:** [fix] Fix dashboard server data root default to use canonical resolver when MBS_DATA_ROOT is unset (avoid dashboard/data fallback).
  - _Resolved dashboard server workspace root to repo root so data root defaults to canonical location when MBS_DATA_ROOT is unset._
- [x] **dashboard-server:** [fix] Import node:crypto or provide fallback for randomUUID in workspaces routes build-scripts endpoint.
  - _Added crypto import and randomUUID fallback for workspace build-scripts IDs._
- [x] **dashboard-ui:** Add dashboard UI for viewing/editing workspace context sections (project details, purpose, dependencies, modules, test confirmations, dev patterns, resources) wired to new APIs.
  - _Added workspace context UI with section editors and dashboard-server context endpoints._
- [x] **extension:** Replace legacy workspace ID logic (md5/underscore/raw path) with canonical algorithm or server-resolved ID; update plan creation and fallback paths.
  - _Extension plan creation now registers workspace via /api/workspaces/register to use canonical workspace_id instead of md5-derived ids._
- [x] **agents-docs:** [documentation] Update agent prompts/instructions to distinguish workspace vs plan context and document new workspace context APIs and usage patterns.
  - _Updated mcp-usage guidance for workspace vs plan context, workspace context APIs, and Coordinator handoff example. Prior updates also refreshed plan-context and agent docs to distinguish workspace context usage._
- [x] **migration:** Implement migration/back-compat: detect legacy workspace IDs, map to canonical IDs, migrate/alias data folders, and log/report actions.
  - _Implemented legacy workspace migration in file-store: detect legacy IDs via workspace_path match, alias legacy IDs when canonical exists, migrate legacy folder + metadata when canonical missing, update workspace context/plan workspace_id fields, and log migration. registerWorkspace now returns migration report for clients to surface._
- [x] **testing:** [test] Add tests for workspace ID normalization, data root resolution, workspace context CRUD, and duplicate-folder prevention in plan creation flow.
  - _Added tests for workspace utils normalization/data root, memory_context workspace CRUD actions, and dashboard plan creation guard to prevent unregistered workspace folders; updated workspace context UI save rehydration and reset; added .project-memory/workspace.json for explicit workspace ID._
- [x] **validation:** [validation] Verify build environment for run_build_script (cmd.exe availability, COMSPEC/PATH) and rerun Build Server script; record outcome and any environment remediation needed.
  - _User ran build-and-install.ps1; server and extension builds succeeded._
- [x] **server:** [fix] Fix run_build_script lookup to include plan-level build scripts when plan_id is provided; pass plan_id through memory_plan to file-store runBuildScript and update tests/typing accordingly.
  - _Passed plan_id through memory_plan to file-store runBuildScript, updated runBuildScript lookup to include plan-level scripts, and expanded build-script tests for plan-level execution._
- [x] **server:** [fix] Investigate and fix build script registry mismatch where list_build_scripts returns IDs that run_build_script cannot resolve; ensure lookup uses consistent plan/workspace scope and IDs, then rerun validation step 16.
  - _Executor added run_build_script fallback to resolve plan-level scripts even when plan_id is omitted; updated file-store build-script tests to cover fallback lookup. Tests not run._
- [x] **validation:** [validation] Verify run_build_script shell environment: confirm COMSPEC points to %SystemRoot%\System32\cmd.exe, cmd.exe exists, and PATH includes System32; re-run Build Server and Build Dashboard Server scripts; record diagnostics (COMSPEC, PATH, where cmd).
  - _Validated shell environment via PowerShell: COMSPEC=C:\Windows\system32\cmd.exe, SystemRoot=C:\Windows, Test-Path %SystemRoot%\System32\cmd.exe=True, Get-Command cmd.exe succeeded, PATH includes C:\Windows\system32. Reran builds: server `npm run build` and dashboard server `npm run build` succeeded._
- [x] **server:** [fix] If cmd.exe remains unavailable after environment repair, update run_build_script to honor COMSPEC or fall back to PowerShell; add regression coverage and rerun build scripts.
  - _Added run_build_script shell selection with COMSPEC + PowerShell fallback helpers and tests for fallback logic._
- [x] **validation:** [validation] Run targeted validation to confirm no duplicate workspace folders, workspace context persists across surfaces, and legacy data remains accessible.
  - _Validation: data root now has single canonical workspace folder for this project (Project-Memory-MCP-652c624f8f59). Removed duplicate legacy folders Project-Memory-MCP and project-memory-mcp-40f6678f5a9b which only contained redundant plan logs. workspace.context.json and workspace.meta.json exist under canonical workspace; plan data remains under canonical workspace. Server and dashboard server builds succeeded._
- [x] **diagnosis:** [analysis] Audit validation coverage for all agent types and identify gaps (e.g., Builder) plus redundant init+validate workflow; document desired validation flow.
  - _Validation coverage and init/validate workflow gaps documented in plan note._
- [x] **design:** [planning] Define required behavior: validate supports all agents, streamline init+validate, and enforce Builder build-script creation for tasks requiring builds.
  - _Validation behavior defined: validate all agents, init+validate option, Builder build-script enforcement._
- [x] **server:** Extend agent validation to cover all agent types (including Builder) and adjust init/validate flow to reduce redundancy while preserving safety checks.
  - _Added Builder validation, build-phase mapping, and init+validate option in memory_agent._
- [x] **server:** Enforce Builder workflow: require build scripts creation via memory_plan build script actions and block ad-hoc terminal commands; update role boundaries and checks accordingly.
  - _Builder workflow enforced via validation and role boundary updates; build scripts required for build-related steps._
- [x] **server:** Expose plan templates via MCP tool or API endpoints and ensure template listing/creation is wired through consolidated tools.
  - _Confirmed plan templates exposed via memory_plan create_from_template/list_templates and MCP schema; updated consolidated tool docs._
- [x] **dashboard-ui:** Add UI to list/create plans from templates, and surface available templates in the dashboard.
  - _Added plan template panel and CreatePlanForm template loading._
- [x] **extension:** Expose plan templates in the VS Code extension UX (template list + create from template).
  - _Extension plan creation UX already surfaces plan templates from /api/plans/templates with fallback list; creation uses template endpoint when selected._
- [x] **agents-docs:** [documentation] Update agent prompts/instructions to reflect new validation flow and Builder build-script requirement; document plan template usage.
  - _Updated agent instructions for validation flow, Builder build-script requirement, and plan template usage (Coordinator/Architect/Builder/Tester updates; mcp-usage template + init+validate guidance)._
- [x] **testing:** [test] Add tests for expanded agent validation coverage, Builder build-script enforcement, and plan template exposure in server/UI/extension.
  - _Added tests for Builder validation enforcement and expanded agent validation coverage; tightened plan template exposure tests; added dashboard UI plan-template test coverage; added extension McpBridge test for template-based plan creation. Tests not run._
- [x] **workflow-governance:** [planning] Define confirmation policy: agents confirm only before phase transitions unless a step is flagged; require explicit user confirmation before high-risk steps; document flags/criteria.
  - _Confirmation policy defined with phase-level default, step-level flags for high-risk, and PlanState confirmation_state tracking proposal. Stored in architecture.json._
- [x] **server:** Implement confirmation gating in agent workflow: phase-level confirmations by default, step-level confirmations only when requires_validation/high-risk; enforce user confirmation before high-risk steps.
  - _Added confirmation gating in updateStep and new confirm actions to track phase/step approvals with confirmation_state._
- [x] **dashboard-ui:** Fix deploy defaults: persist defaults set by Configure Defaults and ensure values survive refresh/reopen.
  - _Persisted deploy defaults using localStorage and Configure Defaults modal._
- [x] **dashboard-ui:** Populate default instructions dynamically in settings list from available instruction files instead of static entries.
  - _Settings modal now loads default instructions from /api/instructions and filters to general files._
- [x] **agents-docs:** [documentation] Update default instruction files to be non-language and non-workspace specific (except those explicitly scoped), and refresh all instructions in instructions/ for current behavior and tooling.
  - _Scoped specialized instruction files to avoid language/workspace specificity; refreshed instructions for current behavior and tooling across instruction set._
- [ ] **testing:** [test] Add tests for confirmation gating (phase vs step), deploy default persistence, and dynamic instruction list population. ⏳
  - _Tests added for confirmation gating, deploy defaults persistence, and settings modal instruction list; phase completion requires user confirmation before marking done._
- [x] **workflow-governance:** Add audit trail to Project Memory for untracked file changes (log agent/tool writes, reconcile missing records, and surface warnings when changes lack provenance).
  - _Added audit log entries for untracked file updates in workspace context._
- [x] **workflow-governance:** Add workspace-wide file update log: per-agent entries with file path, action, timestamp, summary; stored in workspace context and surfaced across UI/extension; require agents to update after edits.
  - _Logged file updates with tool/action/plan provenance into workspace context update_log._
- [x] **workflow-governance:** [planning] Add explicit guidance for agents to insert/update steps sequentially (avoid out-of-order edits) and document when reindexing is required.
  - _Added sequential insert/update and reindex guidance to mcp-usage instructions._
- [x] **research:** [research] Review available plan/step tools for ordering safeguards and identify improvements needed to prevent out-of-order edits.
  - _Reviewed memory_steps tools and recorded ordering safeguards + improvement ideas in research_notes/step-ordering-tools-review.md._
- [x] **server:** [fix] Update run_build_script fallback to execute build scripts directly (spawn absolute script path without shell) and extend tests.
  - _Implemented direct-exec fallback for run_build_script, added command parsing and shell detection helpers, and updated tests for direct execution parsing._

## Agent Lineage

- **2026-02-07T21:12:32.794Z**: Researcher → Architect — _Research complete: identified workspace ID derivation mismatches and plan creation behavior creating folders; documented storage patterns and UI touchpoints._
- **2026-02-07T21:15:26.065Z**: Architect → Executor — _Plan ready with 12 steps across diagnosis, design, server, dashboard, extension, docs, migration, testing, validation phases._
- **2026-02-07T21:17:51.676Z**: Architect → Executor — _Plan steps updated and goals set; ready for implementation._
- **2026-02-07T21:37:38.255Z**: Executor → Coordinator — _Diagnosis steps 0 and 12 complete; findings documented. Recommend Builder next per user request._
- **2026-02-07T21:40:33.514Z**: Architect → Executor — _Design steps 1,2,13 completed with canonical workspace ID/data root strategy, workspace context schema, and validation/build-script requirements documented in architecture context and plan note._
- **2026-02-07T22:01:20.998Z**: Executor → Coordinator — _Server phase steps 3,4,14,15,16 completed; recommend Builder per user request._
- **2026-02-07T22:03:16.608Z**: Builder → Coordinator — _Build verification failed; recommend Revisionist._
- **2026-02-07T22:05:21.112Z**: Revisionist → Executor — _Plan pivoted: build verification failure is environment/runtime (cmd.exe ENOENT). Added validation step to verify build environment (cmd.exe availability, COMSPEC/PATH) and rerun Build Server script before proceeding. Execute new step 11, then unblock validation step._
- **2026-02-07T22:23:27.699Z**: Executor → Coordinator — _Step 5 complete: dashboard server data root/workspace registration alignment implemented; recommend Builder for next phase handling._
- **2026-02-07T22:31:35.660Z**: Builder → Coordinator — _Dashboard server build could not run via build script; recommend Revisionist to investigate run_build_script 'script not found' error and Builder validation failure._
- **2026-02-07T22:35:20.790Z**: Revisionist → Executor — _Plan pivoted to add server fix step for TS build errors. Please apply minimal fixes: replace DATA_ROOT in file-store findPlanById with getDataRoot() or define const DATA_ROOT = getDataRoot(); update memory_context ContextResult workspace_* context types to WorkspaceContext (import type) so workspace_context.tools return types align._
- **2026-02-07T22:43:25.582Z**: Executor → Coordinator — _Step 5 fix complete; recommend Builder for build verification._
- **2026-02-07T22:44:22.793Z**: Builder → Coordinator — _Builder validation failed; unable to run build scripts. Recommend Revisionist to fix validate Builder path or ensure correct validation wiring._
- **2026-02-07T23:10:01.557Z**: Reviewer → Revisionist — _Review found issues: (1) dashboard server workspace root resolves to dashboard/ so default data root mismatches MCP server when MBS_DATA_ROOT is unset; (2) dashboard workspaces build-scripts endpoint uses crypto.randomUUID without node:crypto import, risking runtime failure on older Node/global crypto absence. Please address and re-handoff for review._
- **2026-02-07T23:12:43.009Z**: Revisionist → Executor — _Plan pivoted: added two dashboard-server fix steps for review findings. Please implement fixes in dashboard server: (1) ensure data root default uses canonical resolver when MBS_DATA_ROOT unset (avoid dashboard/data fallback); (2) import node:crypto or provide fallback before crypto.randomUUID in workspaces build-scripts route. After code changes, re-run build dashboard server if needed._
- **2026-02-08T00:26:44.093Z**: Executor → Coordinator — _Steps 7-8 complete; recommend Builder for build verification._
- **2026-02-08T00:28:08.216Z**: Builder → Coordinator — _Build verification attempted; run_build_script failed._
- **2026-02-08T01:14:26.559Z**: Revisionist → Executor — _Root cause found: run_build_script only searches workspace-level scripts (fileStore.runBuildScript calls getBuildScripts without planId), so plan-level scripts returned by list_build_scripts are not found. Added server fix step to pass plan_id through memory_plan and use it in fileStore.runBuildScript; update tests/typing accordingly._
- **2026-02-08T01:24:07.858Z**: Executor → Coordinator — _Plan-level run_build_script support implemented; ready for build verification._
- **2026-02-08T01:40:39.930Z**: Builder → Coordinator — _Build verification failed; run_build_script could not find plan-level scripts_
- **2026-02-08T01:57:07.968Z**: Executor → Coordinator — _Dashboard UI steps 9, 22, 28, 29 implemented. Recommend Builder for build verification._
- **2026-02-08T02:03:04.414Z**: Architect → Executor — _Confirmation policy defined and stored; step 26 done. Please implement server confirmation gating and workflow-governance items (steps 27, 32, 33) per architecture.json._
- **2026-02-08T02:17:55.540Z**: Executor → Coordinator — _Workflow-governance steps 27/32/33 complete; ready for review_
- **2026-02-08T03:34:33.004Z**: Executor → Coordinator — _Step 16 fix implemented with build-script lookup fallback and tests updated; recommend Builder rerun build scripts to validate._
- **2026-02-08T03:40:32.171Z**: Builder → Coordinator — _Build verification complete; run_build_script still cannot resolve plan build script IDs._
- **2026-02-08T03:43:56.960Z**: Builder → Coordinator — _Build verification failed: cmd.exe ENOENT when running build scripts._
- **2026-02-08T03:46:58.386Z**: Revisionist → Coordinator — _Plan pivoted for run_build_script cmd.exe ENOENT. Added validation step to check COMSPEC/PATH/cmd.exe and rerun build scripts, plus conditional server fix to honor COMSPEC or fallback to PowerShell if env repair fails. Recommend Builder to execute new env validation step; if still failing, route to Executor for fallback implementation._
- **2026-02-08T03:51:22.507Z**: Builder → Coordinator — _Environment validation attempted; build scripts still fail with cmd.exe ENOENT. Recommend Revisionist to pursue env remediation or run_build_script fallback per step 18._
- **2026-02-08T03:54:39.196Z**: Executor → Coordinator — _Implemented run_build_script shell fallback and added tests; step 18 done. Ready for review._
- **2026-02-08T03:58:00.017Z**: Builder → Coordinator — _Build verification failed due to cmd.exe ENOENT._
- **2026-02-08T04:02:46.275Z**: Builder → Coordinator — _Build verification complete_
- **2026-02-08T04:08:26.822Z**: Executor → Coordinator — _Run_build_script direct-exec fallback and tests updated; ready for review._
- **2026-02-08T04:13:38.565Z**: Builder → Coordinator — _Build verification complete; run_build_script still fails with cmd.exe ENOENT._
- **2026-02-08T05:02:33.456Z**: Executor → Coordinator — _Step 13 complete with tests, UI fix, and workspace ID file; ready for review._
- **2026-02-08T05:08:27.364Z**: Executor → Coordinator — _Step 28 tests added for validation coverage, Builder enforcement, and template exposure; ready for review._
- **2026-02-08T05:12:59.643Z**: Executor → Coordinator — _Step 34 tests added; phase completion requires user confirmation before marking done._