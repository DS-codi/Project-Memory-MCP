# SkillWriter Cross-Workspace Instruction Refactoring

**Plan ID:** plan_mll9pkws_485d6ff0
**Status:** archived
**Priority:** medium
**Current Phase:** complete
**Current Agent:** None

## Description

Extend the SkillWriter agent to handle cross-workspace instruction refactoring. When deployed to a foreign workspace, SkillWriter should analyze existing instruction/rule files and classify each as: (1) keep as instruction/rule (hard rules specific to that workspace), (2) convert to skill (reusable domain knowledge), or (3) delete/consolidate (redundant or outdated). Must follow the established skills-vs-instructions convention. Agent needs new workflow modes, classification heuristics, and user confirmation gates before making changes.

## Progress

- [x] **setup:** [code] Create instructions/skillwriter-refactor-mode.instructions.md with full refactor-mode specification: classification heuristics decision tree, classification report format (markdown table schema), cross-workspace file-handling rules, protected-file conventions, and the two-phase classify→execute workflow. Apply applyTo: agents/skill-writer.agent.md frontmatter.
  - _Created instructions/skillwriter-refactor-mode.instructions.md (178 lines). Contains: Classification Decision Tree (5 categories including split), Classification Report Format with example table (5 sample rows), Cross-Workspace File Handling (dual-workspace + discovery), Protected Files list, Two-Phase Workflow (A: classify, B: execute), Rollback Strategy (git clean state check), Skill Frontmatter Generation with derivation rules and example._
- [x] **setup:** [code] Add 'Workflow Modes' section to skill-writer.agent.md distinguishing 'create' mode (existing behavior) from new 'refactor' mode. Add concise refactor-mode summary (~30 lines) that references instructions/skillwriter-refactor-mode.instructions.md for full details. Keep agent file under 300 lines total.
  - _Added Workflow Modes section (~30 lines) after Your Mission. Covers create mode (default) and refactor mode with classification table, two-phase workflow summary, conservative default, and cross-reference to full spec. Also updated mission paragraph to mention refactor capability. Agent file at 239 lines (under 300 limit)._
- [x] **setup:** [code] Update the SkillWriter 'What You Can and Cannot Do' section to add refactor-mode permissions: CAN read/analyze instruction files in foreign workspaces, CAN delete/consolidate instruction files (after user approval), CAN move content between instruction and skill formats. Add CANNOT: execute changes without user confirmation, modify agent definition files, touch protected files.
  - _Permissions section updated by Executor — 4 new CAN items and 2 new CANNOT items for refactor mode. Confirmed by Coordinator._
- [x] **core:** [code] Add the refactor-mode workflow to skill-writer.agent.md: a concise numbered workflow (Phase A: init → validate → scan directories → read files → classify each → store classification report via memory_context → handoff for user confirmation. Phase B: retrieve approved classifications → execute approved changes → update steps → handoff for review).
  - _Added Refactor Mode Workflow subsection (~22 lines) after existing Workflow section. Two-phase numbered workflow with Phase A (classify, 6 steps) and Phase B (execute, 7 steps). File at 266 lines._
- [x] **core:** [code] Update SkillWriter exit conditions table to include refactor-mode handoff scenarios: (1) Classification report generated → Coordinator (for user confirmation), (2) Approved changes executed → Coordinator (recommends Reviewer), (3) No instruction files found in target workspace → Coordinator (nothing to refactor), (4) Blocked by file access error → Coordinator (recommends Revisionist).
  - _Added 4 refactor-mode rows to Exit Conditions table: classification report → Coordinator, approved changes → Reviewer, no instruction files → Coordinator, file access error → Revisionist. Existing create-mode rows intact._
- [x] **core:** [code] In instructions/skillwriter-refactor-mode.instructions.md, add the Cross-Workspace Identity section: how SkillWriter receives the foreign workspace path (from Coordinator deployment prompt), how to discover instruction file locations (check .github/instructions/, instructions/, docs/ in order), how MCP calls always use PM's workspace_id while file I/O uses the foreign path, and how to handle non-standard layouts (fall back to recursive glob for *.instructions.md and *.md files in common locations).
  - _Section 3 already covered most content from step 0. Added docs/ subsection. Confirmed by Coordinator._
- [x] **integration:** [code] Add a SkillWriter (Refactor Mode) subagent template to instructions/coordinator-subagent-templates.instructions.md. Template must include: plan_id, workspace_id, foreign_workspace_path, mode='refactor', phase (classify or execute), approved_classifications (for execute phase), scope boundaries, and anti-spawning instructions.
  - _Added two SkillWriter refactor-mode subagent templates (Classify + Execute) after Archivist section, before Worker section. ~45 lines added."_
- [x] **integration:** [code] Update the SkillWriter agent description (top-level mission/purpose paragraph) to mention refactoring capability alongside the existing skill-creation purpose. Do NOT modify the frontmatter tools array.
  - _Mission paragraph updated to mention refactor mode. Confirmed by Coordinator._
- [x] **validation:** [validation] Review all changes for monolith compliance: verify skill-writer.agent.md stays under 300 lines, verify skillwriter-refactor-mode.instructions.md stays under 400 lines, verify coordinator-subagent-templates.instructions.md stays under 400 lines after additions. If any file exceeds threshold, create a follow-up step to extract content.
  - _Monolith compliance PASS: skill-writer.agent.md 266/300, skillwriter-refactor-mode.instructions.md 254/400, coordinator-subagent-templates.instructions.md 272/400._
- [x] **validation:** [validation] Verify consistency between skill-writer.agent.md refactor-mode references and the actual content in instructions/skillwriter-refactor-mode.instructions.md. Ensure classification heuristics align with the convention-skills-vs-instructions knowledge file. Verify cross-workspace path handling is consistent across all modified files.
  - _Consistency verification PASS: All 8 checks pass. 2 naming issues (convert_to_skill→convert, missing protected class) fixed by Coordinator in coordinator-subagent-templates.instructions.md._
- [x] **documentation:** [documentation] Update the convention-skills-vs-instructions knowledge file via memory_context(action: knowledge_store) to add a note that SkillWriter can now be deployed in refactor mode to classify and reorganize instruction files, with a reference to the plan that established this capability.
  - _Updated convention-skills-vs-instructions knowledge file with Automated Classification section referencing SkillWriter refactor mode and plan_mll9pkws_485d6ff0._

## Agent Lineage

- **2026-02-13T19:21:11.888Z**: Researcher → Coordinator — _Research complete. All 5 areas investigated: (1) SkillWriter current state and what needs modification vs addition, (2) instruction file formats/conventions in both .github/instructions/ and instructions/, (3) classification heuristics for rules vs skills with decision tree, (4) cross-workspace deployment model including dual-workspace pattern, (5) user confirmation flow patterns. Recommend Architect to design the solution._
- **2026-02-13T19:24:33.786Z**: Architect → Coordinator — _Plan ready with 11 steps across 5 phases. Architecture decisions stored. Ready for Executor to implement._
- **2026-02-13T19:54:16.423Z**: Executor → Coordinator — _Setup phase (steps 0-2) implementation complete. Created skillwriter-refactor-mode.instructions.md (178 lines) with full spec. Updated skill-writer.agent.md (239 lines) with Workflow Modes section and refactor-mode permissions. Ready for build verification and review._
- **2026-02-13T19:58:54.180Z**: Executor → Coordinator — _Core phase steps 3-5 complete. Ready for build verification and review._
- **2026-02-13T20:03:28.651Z**: Executor → Coordinator — _Integration phase steps 6-7 complete. Step 6 done, step 7 implemented but status update blocked by phase confirmation gate. Ready for build verification and review._
- **2026-02-13T20:10:00.060Z**: Reviewer → Coordinator — _Validation review complete. Steps 8-9 done. Found 2 actionable naming inconsistencies in coordinator-subagent-templates.instructions.md (convert_to_skill should be convert; protected missing from classification list). Recommend Revisionist for quick fixes."_