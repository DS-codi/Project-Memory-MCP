# Instructions to Skills Rewrite

**Plan ID:** plan_mlkl7hle_541c62b3
**Status:** archived
**Priority:** high
**Current Phase:** complete
**Current Agent:** None

## Description

Rewrite project-memory-system.instructions.md (2248 lines) into modular, agent-specific skill files. Create proper skill files following existing skills/ pattern (with SKILL.md). Make skills callable/accessible via MCP tools. Instructions that remain should be deployable hard-rules only. Depends on Plan 2 (Agent Consolidation) completing first.

## Progress

- [x] **Research:** [research] Audit instructions/project-memory-system.instructions.md (2248 lines) — categorize each section as 'skill' (knowledge/guidance) or 'instruction' (mandatory rule). Produce a section-by-section classification
  - _Classified all 15 sections. ~431 lines extractable as skill, ~1694 lines remain as instruction (tool schemas + mandatory rules). Main skill destinations: project-memory-overview (~52 lines) and mcp-tools-usage (~377 lines)._
- [x] **Research:** [research] Map existing skills/ pattern (pyside6-* skills with SKILL.md) to establish template for new PM-specific skills
  - _Mapped SKILL.md template. User decided: PM-internal topics stay as instructions, NOT skills. Skills are for external frameworks only._
- [x] **Reclassify:** [refactor] Move skills/coordinator-categorization/SKILL.md to instructions/coordinator-categorization.instructions.md — convert from skill format to instruction format
  - _Converted coordinator-categorization from skill to instruction format (66 lines)_
- [x] **Reclassify:** [refactor] Move skills/analyst-methodology/SKILL.md to instructions/analyst-methodology.instructions.md — convert from skill format to instruction format, or merge into analyst-operations.instructions.md if combined stays under 400 lines
  - _Converted analyst-methodology from skill to instruction format (235 lines)_
- [x] **Split Monolith:** [code] Create instructions/mcp-tool-workspace.instructions.md — extract memory_workspace tool reference (all actions, parameters, examples) from project-memory-system.instructions.md
  - _Created mcp-tool-workspace.instructions.md_
- [x] **Split Monolith:** [code] Create instructions/mcp-tool-plan.instructions.md — extract memory_plan tool reference (all actions, parameters, examples) from project-memory-system.instructions.md
  - _Created mcp-tool-plan.instructions.md_
- [x] **Split Monolith:** [code] Create instructions/mcp-tool-steps.instructions.md — extract memory_steps tool reference (all actions, parameters, examples) from project-memory-system.instructions.md
  - _Created mcp-tool-steps.instructions.md_
- [x] **Split Monolith:** [code] Create instructions/mcp-tool-agent.instructions.md — extract memory_agent tool reference (all actions, parameters, examples) from project-memory-system.instructions.md
  - _Created mcp-tool-agent.instructions.md_
- [x] **Split Monolith:** [code] Create instructions/mcp-tool-context.instructions.md — extract memory_context tool reference (all actions, parameters, examples) from project-memory-system.instructions.md
  - _Created mcp-tool-context.instructions.md_
- [x] **Split Monolith:** [refactor] Reduce project-memory-system.instructions.md to a slim overview/index (~50-100 lines) — keep core concepts, agent types table, quick start, and references to per-tool instruction files
  - _Reduced project-memory-system.instructions.md from 2244 to 173 lines. Created mcp-best-practices.instructions.md with workflow examples, best practices, anti-patterns, tips, and type reference appendix._
- [x] **Cleanup:** [refactor] Update agent files to reference instruction files instead of skills where PM-internal content was moved — coordinator, analyst, and any others referencing coordinator-categorization or analyst-methodology skills
  - _Updated coordinator.agent.md: 2 references from skills/coordinator-categorization/SKILL.md → instructions/coordinator-categorization.instructions.md. Updated analyst.agent.md: 1 reference from skills/analyst-methodology/SKILL.md → instructions/analyst-methodology.instructions.md. No cross-references found in instruction files or .github/instructions/. Trimmed mcp-tool-plan.instructions.md from 530 to 304 lines by removing redundant JSON examples from self-explanatory actions._
- [x] **Cleanup:** [refactor] Remove empty skills/coordinator-categorization/ and skills/analyst-methodology/ directories after content has been moved to instructions/
  - _Deleted skills/coordinator-categorization/ and skills/analyst-methodology/ directories. Content already migrated to instructions/._
- [x] **Validation:** [validation] Verify all instruction files are under 400 lines, no broken cross-references, and build still passes
  - _All checks pass: all 25 instruction files under 400 lines, no broken references, old skill directories removed, .github copy synced to slim index._

## Agent Lineage

- **2026-02-13T18:09:42.840Z**: Researcher → Coordinator — _Research phase complete (steps 0-1). Classified all sections of project-memory-system.instructions.md, mapped SKILL.md template structure, assessed 5 secondary instruction files. Produced 3 research notes + structured research.json. Recommend Architect to design the 6 new skills and instruction reductions._
- **2026-02-13T18:37:15.127Z**: Executor → Coordinator — _Reclassify (steps 2-3) and Split Monolith (steps 4-9) phases complete. Created 8 new instruction files, reduced project-memory-system.instructions.md from 2244 to 173 lines. Ready for build verification."_
- **2026-02-13T18:44:38.594Z**: Executor → Coordinator — _Cleanup phase (steps 10-11) complete. All skill references updated to instruction file paths, old skill directories deleted, mcp-tool-plan.instructions.md trimmed to 304 lines. Ready for build verification._