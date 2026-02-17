# Repurpose Spawn Tool to Context-Prep Only

**Plan ID:** plan_mlmifndl_ef8f927b
**Status:** archived
**Priority:** high
**Current Phase:** complete
**Current Agent:** None

## Description

Remove custom subagent spawn tool behavior that attempts to spawn/validate agents and repurpose it to only store/prepare context before agent launches. Keep actual spawning on the platform-native path (runSubagent / existing orchestration flow) to eliminate current failures and restore known-stable behavior.

## Progress

- [x] **Phase 0: Discovery:** [analysis] Audit current custom spawn tool implementation and enumerate all call sites that depend on spawn behavior, including failure modes observed in plan_mllc6x7s_5254485e
  - _Phase 0 discovery complete. Audited custom spawn tool runtime path and instruction-level callers; documented behavior, call-site inventory, failure modes, redesign constraints, and migration sequence in research_notes/phase0-spawn-tool-discovery.md and research_summary.json._
- [x] **Phase 1: Contract Redesign:** [planning] Define new spawn-tool contract as context-prep only (input schema, persisted context format, return payload) and explicitly remove spawning responsibility
  - _Defined context-prep-only spawn-tool contract (schema, persisted format, return payload) and removed spawn responsibility._
- [x] **Phase 1: Contract Redesign:** [planning] Define compatibility strategy for existing callers (shim/warnings/fallback) so callers migrate to platform-native spawn flow without breakage
  - _Completed compatibility strategy design and migration checklist; phase confirmation satisfied._
- [x] **Phase 2: Implementation:** [code] Refactor spawn tool handler to store/prepare context only; remove/disable custom spawn execution paths and agent-validation side effects
  - _Refactored memory_spawn_agent to context-prep-only behavior: removed lane-lock/execution coupling and target-agent validation side effects; added canonical prep_config payload with mode=context-prep-only and execution.spawn_executed=false invariant; implemented compat_mode strict/legacy behavior, legacy alias shim (spawn_config -> prep_config), warning/deprecation envelope, and deprecated-input handling._
- [x] **Phase 2: Implementation:** [code] Update all call sites to use context-prep step followed by existing stable agent launch path; keep prompts/instructions/context handoff quality at least equivalent
  - _Phase 2 confirmed by user; implementation had already compiled and extension tests passed, so step is now completed._
- [x] **Phase 3: Verification:** [test] Add or update tests covering context-prep behavior, backward-compatibility handling, and ensuring no custom spawn execution is attempted
  - _Updated spawn-agent-tool tests for prep-only invariant, spawn_config->prep_config alias shim, strict/legacy warning envelope, and no-execution behavior. Ran npm test in vscode-extension: 52 passing, 0 failing._
- [x] **Phase 3: Verification:** [validation] Run regression checks for plan orchestration flows that previously used custom spawn and confirm no reintroduction of cancellation/spawn conflicts
  - _Regression check PASSED. Findings: (1) spawn-agent-tool.ts is fully context-prep-only — no imports of lane registry, no spawn execution paths, execution.spawn_executed is always false. (2) Extension compiles cleanly (npm run compile). (3) No remaining references to spawn_executed=true except in test file (as expected — tests verify legacy inputs are REJECTED in strict mode and IGNORED in legacy mode). (4) spawn-reason-codes.ts includes SPAWN_PREP_ONLY and related prep codes. (5) ToolProvider registers tool as 'context preparation only'. (6) package.json schema correctly describes prep-only behavior. No regressions detected._
- [x] **Phase 4: Documentation:** [documentation] Update relevant docs/instructions to reflect new context-prep-only spawn tool behavior and migration guidance for future work
  - _Documentation updates complete. Changes: (1) mcp-usage.instructions.md — added memory_spawn_agent to tool table + added full 'Spawn Context Preparation' section with usage examples, key rules, and migration note. (2) coordinator-subagent-templates.instructions.md — added 'Spawn Preparation (Required)' section with 2-step prep+launch workflow before existing templates. Both instructions/ and .github/instructions/ copies updated identically. Files already correct: handoff-protocol.instructions.md (already had full spawn prep section), coordinator.agent.md (already had Strict Spawn Delegation Protocol)._

## Agent Lineage

- **2026-02-14T16:13:47.896Z**: Analyst → Coordinator — _Phase 0 discovery complete. Recommend Architect for contract redesign. Key files: vscode-extension/src/chat/tools/spawn-agent-tool.ts; vscode-extension/src/chat/orchestration/active-run-registry.ts; vscode-extension/src/chat/orchestration/spawn-reason-codes.ts; vscode-extension/src/chat/tools/agent-tool.ts; vscode-extension/package.json; agents/coordinator.agent.md; instructions/handoff-protocol.instructions.md. Next steps: (1) define prep-only contract and compatibility shape, (2) remove unsupported memory_agent(action: spawn) guidance, (3) resolve lane lifecycle strategy (remove lane or wire deterministic release), (4) formalize migration to runSubagent execution path._
- **2026-02-14T16:16:40.022Z**: Architect → Coordinator — _Phase 1 Contract Redesign complete. Recommendation=Executor. Exact implementation files: (1) vscode-extension/src/chat/tools/spawn-agent-tool.ts, (2) vscode-extension/package.json, (3) vscode-extension/src/chat/ToolProvider.ts, (4) vscode-extension/src/chat/tools/agent-tool.ts, (5) vscode-extension/src/chat/orchestration/active-run-registry.ts, (6) vscode-extension/src/chat/orchestration/spawn-reason-codes.ts, (7) agents/coordinator.agent.md, (8) agents/analyst.agent.md, (9) agents/runner.agent.md, (10) instructions/handoff-protocol.instructions.md. Ordered checklist for Executor: 1) Update memory_spawn_agent schema/descriptions to context-prep-only; 2) Implement canonical payload with mode=context-prep-only and execution.spawn_executed=false invariant; 3) Add legacy alias shim spawn_config -> prep_config; 4) Add warnings/deprecation envelope and compat_mode strict/legacy handling; 5) Remove prep-path lane-lock coupling and execution-centric reason-code dependence; 6) Patch hub caller docs/templates to explicit prep then native runSubagent flow; 7) Add/adjust tests for prep-only invariant, shim, warnings, and no-execution behavior; 8) Add migration/deprecation notes and telemetry assertions for legacy alias removal readiness._
- **2026-02-14T17:16:50.690Z**: Reviewer → Coordinator — _Steps 6-7 complete. Regression check passed (spawn tool is fully context-prep-only, extension compiles). Documentation updated in 4 instruction files. All 8 plan steps are done. Recommend Archivist for plan archival._
- **2026-02-14T17:45:37.800Z**: Coordinator → Coordinator — _Both plans completed and archived. No further work needed."_