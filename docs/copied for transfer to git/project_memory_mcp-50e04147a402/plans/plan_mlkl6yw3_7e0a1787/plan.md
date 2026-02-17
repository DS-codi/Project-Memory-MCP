# Agent Consolidation & Size Reduction

**Plan ID:** plan_mlkl6yw3_7e0a1787
**Status:** archived
**Priority:** critical
**Current Phase:** complete
**Current Agent:** Coordinator

## Description

Merge Builder into Reviewer (build scripts + regression check become Reviewer capabilities). Review Brainstorm vs Analyst overlap. Extract large sections from coordinator.agent.md (~1388 lines) and analyst.agent.md (~968 lines) into targeted instruction/skill files. All agent files should be under ~400 lines after this. Update all cross-references in instructions, handoff protocol, etc.

## Progress

- [x] **Research:** [research] Audit agents/builder.agent.md — catalog all unique capabilities
  - _Done. Builder has 6 unique capabilities: dual-mode, build script CRUD, regression detection, user-facing reports, error diagnosis, terminal-first execution._
- [x] **Research:** [research] Audit agents/reviewer.agent.md — identify integration points for Builder capabilities
  - _Done. Reviewer has 8 integration points. Estimated post-merge ~385 lines._
- [x] **Implementation:** [code] Merge Builder capabilities into reviewer.agent.md — add build script CRUD, regression detection, build-phase workflow
  - _Done in backup/post-consolidation-agents/reviewer.agent.md (205 lines). Needs to be applied to restored reviewer.agent.md._
- [x] **Implementation:** [code] Apply the Builder→Reviewer merge from backup to the restored reviewer.agent.md
  - _Applied merged reviewer from backup (205 lines)_
- [x] **Implementation:** [code] Move builder.agent.md to archive/old_agents/ and remove from agents/
  - _builder.agent.md moved to archive/old_agents/_
- [x] **Implementation:** [code] Rewrite coordinator instruction files with FULL original content from coordinator.agent.md (not summaries). Files: coordinator-operations.instructions.md, coordinator-context-management.instructions.md, coordinator-subagent-templates.instructions.md, program-management.instructions.md. Each must contain the complete original text.
  - _Instruction files rewritten with full original content: coordinator-operations (508 lines), coordinator-context-management (200 lines), coordinator-subagent-templates (160 lines), program-management (41 lines)_
- [x] **Implementation:** [code] Rewrite coordinator-categorization SKILL.md with full original content from coordinator.agent.md sections (WHEN TO USE ANALYST, WHEN TO USE TDDDriver, When to Use Analyst Mid-Plan)
  - _SKILL.md rewritten with full categorization content (89 lines)_
- [x] **Implementation:** [refactor] Update coordinator.agent.md — replace extracted sections with file path references to instruction/skill files. Keep core identity, MCP tools, workflow sequence, orchestration loop, common mistakes, security boundaries inline.
  - _Coordinator reduced from 1084 to ~363 lines with references to instruction/skill files. Core sections kept inline._
- [x] **Implementation:** [code] Rewrite analyst instruction files with FULL original content. Files: analyst-operations.instructions.md, analyst-methodology SKILL.md. Must contain complete original text from analyst.agent.md.
  - _Analyst instruction files rewritten: analyst-operations (375 lines), analyst-methodology SKILL (236 lines)._
- [x] **Implementation:** [refactor] Update analyst.agent.md — replace extracted sections with file path references. Keep core identity, MCP tools, investigation model overview, security boundaries inline.
  - _Analyst agent reduced from 761 to 169 lines._
- [x] **Implementation:** [refactor] Extract runner.agent.md verbose sections (intermittent logging examples, escalation details, save-context-on-completion) into instructions/runner-operations.instructions.md with FULL content. Replace in agent with path references.
  - _Runner reduced from 408 to 250 lines. Created runner-operations (167 lines)._
- [x] **Integration:** [code] Update instructions/handoff-protocol.instructions.md — remove Builder references, add Reviewer build-phase entries
  - _Handoff protocol updated - Builder removed, Reviewer entries present._
- [x] **Integration:** [code] Update all agent cross-references — search for 'Builder' and replace with 'Reviewer' where applicable across all instruction and agent files
  - _Updated ALL Builder→Reviewer cross-references across: coordinator.agent.md (workflow diagrams, pseudo-code, decision tree), executor.agent.md (handoff recommendations), tdd-driver.agent.md (exit conditions), README.md (agent table, workflow, feature section), docs/manual-testing-checklist.md, docs/tdd-driver.md, docs/builder-agent.md (rewritten), docs/build-scripts-*.md (3 files), instructions/project-memory-system.instructions.md, instructions/coordinator-subagent-templates.instructions.md, instructions/build-scripts.instructions.md, prompts/tdd-workflow.prompt.md, vscode-extension/src/chat/ChatParticipant.ts, vscode-extension/package.json. Also updated .github/ copies (3 copies of project-memory-system.instructions.md)._
- [x] **Integration:** [code] Update server agent validation code — remove Builder from valid agents list
  - _Done. Removed Builder from 8 files in server/src/. Server compiles clean._
- [x] **Validation:** [validation] Verify all agent files retained their full functionality via section header comparison with originals
  - _PASS: All 4 agent files retain full functionality. coordinator.agent.md has all expected inline sections + references to 5 extracted files. analyst.agent.md has references to analyst-operations + analyst-methodology SKILL. runner.agent.md reference to runner-operations. reviewer.agent.md has Builder capabilities merged (Dual-Mode, Regression Check, Final Verification, Build Script CRUD)._
- [x] **Validation:** [validation] Verify instruction files contain FULL original content (not summaries) — spot-check key sections
  - _User confirmed. Instruction files contain full verbatim content — PASS._
- [x] **Validation:** [validation] Verify no orphaned Builder references remain anywhere
  - _User confirmed. Server Builder refs removed; dashboard retains for historical display._
- [x] **Validation:** [validation] Verify server builds successfully after changes
  - _Server tsc --noEmit clean. 1026/1027 tests pass._

## Agent Lineage

- **2026-02-13T08:37:57.528Z**: Researcher → Coordinator — _Research phase complete (steps 0-1 done). Audited all 15 agent files. Builder has 6 unique capabilities that merge cleanly into Reviewer (~385 lines estimated). Coordinator/Analyst/Runner have extractable sections. Recommend Executor for Implementation phase (steps 2+)._
- **2026-02-13T08:39:48.166Z**: Researcher → Coordinator — _Research complete — Builder & Reviewer audit done. Recommend Executor to begin merge implementation._
- **2026-02-13T10:22:24.073Z**: Executor → Coordinator — _Steps 3-7 complete. Coordinator consolidation done: merged reviewer (278 lines), archived builder, rewrote 4 instruction files + 1 skill file with FULL verbatim content, rebuilt coordinator.agent.md from 1388→362 lines with brief references. Ready for build verification._
- **2026-02-13T12:16:12.373Z**: Executor → Coordinator — _Step 13 complete — Builder removed from server codebase, capabilities merged into Reviewer. Server compiles clean. Ready for review._
- **2026-02-13T12:23:42.205Z**: Reviewer → Coordinator — _Issues found in server test files - recommend Revisionist to fix 7 files with orphaned Builder references that will cause test failures_
- **2026-02-13T12:36:07.083Z**: Executor → Coordinator — _All Builder references in server/src fixed. 8 files updated, TypeScript compiles clean, 1026/1027 tests pass (1 pre-existing terminal-auth failure unrelated to changes). Ready for archival._
- **2026-02-13T17:54:05.556Z**: Coordinator → Archivist — _Plan fully archived. No further agents needed._