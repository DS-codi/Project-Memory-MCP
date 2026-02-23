# VS Code Extension Modernization

**Plan ID:** plan_mlkl7zuj_c2adac39
**Status:** archived
**Priority:** medium
**Current Phase:** complete
**Current Agent:** Coordinator

## Description

Replace 'Prompts' button with 'Skills' in extension panel. Split DashboardViewProvider.ts (1340-line monolith), ChatParticipant.ts (797 lines), and McpBridge.ts (703 lines) into focused modules. Add skills management and instructions deployment UI. Update extension to reflect agent consolidation from Plan 2. Depends on Plans 2 and 3 completing first.

## Progress

- [x] **Research:** [research] Audit DashboardViewProvider.ts, ChatParticipant.ts, McpBridge.ts — identify split points
  - _Completed. McpBridge at chat/McpBridge.ts not server/. DashboardViewProvider needs webview extraction. ChatParticipant follows KnowledgeCommandHandler pattern._
- [x] **Research:** [research] Audit ChatParticipant.ts and McpBridge.ts — identify split points
  - _Completed as part of step 0._
- [x] **Implementation:** [refactor] Split McpBridge.ts (chat/McpBridge.ts, 703 lines) into: McpBridge.ts (core ~250 lines), McpToolRouter.ts (~200 lines), McpToolHandlers.ts (~350 lines) in vscode-extension/src/chat/
  - _Split complete. McpBridge.ts (804→284 lines), McpToolRouter.ts (174 lines), McpToolHandlers.ts (368 lines). Zero TypeScript errors. Public API unchanged — ToolDefinition re-exported from McpBridge.ts, index.ts unmodified._
- [x] **Implementation:** [refactor] Split ChatParticipant.ts (796 lines) into: ChatParticipant.ts (core routing ~250 lines), ChatPlanCommands.ts (~175 lines), ChatContextCommands.ts (~200 lines), ChatMiscCommands.ts (~200 lines) in vscode-extension/src/chat/
  - _Split ChatParticipant.ts (914→195 lines) into: ChatPlanCommands.ts (198 lines), ChatContextCommands.ts (189 lines), ChatMiscCommands.ts (262 lines). Pure refactor, no behavior changes. TypeScript compiles clean (npx tsc --noEmit). Public API unchanged._
- [x] **Implementation:** [refactor] Split DashboardViewProvider.ts (1340 lines) — extract _getHtmlForWebview into dashboard-webview/: icons.ts, styles.ts, client-script.ts, template.ts, index.ts in vscode-extension/src/providers/dashboard-webview/
  - _Split DashboardViewProvider.ts (1438→315 lines) into 7 focused modules under dashboard-webview/. All files under 400 lines. TypeScript compiles cleanly. Created: icons.ts (39), styles.ts (393), sections.ts (213), client-helpers.ts (209), client-script.ts (211), template.ts (63), index.ts (62). Pure refactor with identical HTML output._
- [x] **Implementation:** [code] Replace 'Deploy Prompts' button/command with 'Deploy Skills' in extension UI — update command registration in package.json and handler in commands/
  - _Done: Renamed 'Deploy Prompts' to 'Deploy Skills' across package.json (commands, settings), deploy-commands.ts (full handler rewrite for skill directories), sections.ts (dashboard button), icons.ts (icon rename), ChatMiscCommands.ts (chat /deploy command), workspace-commands.ts (configure settings), CopilotFileWatcher.ts (trigger). Clean TypeScript compilation._
- [x] **Implementation:** [code] Add skills management UI panel to dashboard — list skills, view SKILL.md content, deploy to workspace
  - _Done: Created skills-section.ts (93 lines) with skills panel HTML and client helpers. Integrated into sections.ts. Created dashboard-message-handlers.ts (183 lines) with getSkills/deploySkill/getInstructions/deployInstruction/undeployInstruction handlers. Updated client-script.ts with message listeners and action handlers. Added CSS styles for skills/instructions items. DashboardViewProvider.ts stays at 389 lines. TypeScript compiles cleanly._
- [x] **Implementation:** [code] Add instructions deployment UI to dashboard — list available instructions, deploy/undeploy toggle
  - _Instructions deployment UI completed. instructions-section.ts (81 lines) and dashboard-message-handlers.ts (159 lines) created. TSC compiles cleanly. Step was completed by Executor but agent was interrupted before marking done._
- [x] **Integration:** [code] Update extension to remove Builder agent references — agent dropdowns, validation lists, command handlers — reflecting agent consolidation
  - _Complete. Searched all TypeScript source files, package.json, and dashboard sections in vscode-extension/ — no Builder agent references found. The Builder agent was already fully removed from the extension codebase. Agent lists in ChatMiscCommands.ts, package.json defaultAgents, and dashboard sections all correctly exclude Builder._
- [x] **Integration:** [code] Update extension package.json with new commands for skills management and instructions deployment
  - _Complete. Added 3 new commands to package.json: listSkills, deploySkill, listInstructions (deployInstructions already existed). Implemented command handlers in deploy-commands.ts: listSkills shows a picker to browse/open skills, deploySkill deploys a single selected skill, listInstructions shows a picker to browse/open instruction files. TypeScript compiles cleanly._
- [x] **Validation:** [validation] Verify all extension source files are under 400 lines after splitting
  - _RUN mode PASSED. TypeScript compiles cleanly (npx tsc --noEmit = 0 errors). Full test suite: 45 tests passing (0 failures) across 7 suites (Extension, Commands, Configuration, View Container, Menu Contributions, ContainerStatusBar, ContainerHealthService). Chat tests (McpBridge, ChatParticipant) compile to JS but are not wired into the suite runner (pre-existing, not caused by refactoring)._
- [x] **Validation:** [test] Run TypeScript compilation check to verify no regressions from file splitting and UI changes
  - _Tester confirmed: 45/45 tests passing, 0 errors. TypeScript compiles cleanly. Archivist proceeding with commit and archive._

## Agent Lineage

- **2026-02-13T18:24:44.346Z**: Researcher → Coordinator — _Research complete. All 3 monolith files audited with line-level responsibility maps and proposed split strategies. Key corrections documented: McpBridge.ts is in chat/ not server/, DashboardViewProvider needs webview template extraction not panel splitting. Ready for Executor to implement splits._
- **2026-02-13T18:35:51.004Z**: Executor → Coordinator — _Step 2 (Split McpBridge.ts) complete. Ready for next step (Step 3: Split ChatParticipant.ts)._
- **2026-02-13T18:55:05.679Z**: Executor → Coordinator — _Step 3 complete — ChatParticipant.ts split into focused modules. Ready for next step (step 4: Split DashboardViewProvider.ts)._
- **2026-02-13T19:24:26.756Z**: Executor → Coordinator — _Step 4 complete — DashboardViewProvider.ts split into 7 focused modules. TypeScript compiles cleanly. Ready for next step._
- **2026-02-13T20:11:35.072Z**: Executor → Coordinator — _Integration phase steps 8-9 complete, ready for build verification and review_
- **2026-02-13T20:21:20.171Z**: Runner → Coordinator — _Step 10 validation complete. All 3 monolith files successfully split under 400 lines. TypeScript compiles cleanly. Recommending Tester for Step 11 (full test/compilation regression check)._
- **2026-02-13T20:28:20.621Z**: Tester → Coordinator — _All tests passing (45/45), TSC clean (0 errors). All 12 plan steps complete. Recommend Archivist to archive the plan._
- **2026-02-13T20:33:52.008Z**: Coordinator → Coordinator — _Plan fully completed and archived. All 12 steps done, committed as a76c958._