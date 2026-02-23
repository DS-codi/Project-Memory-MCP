---
plan_id: plan_mlkl7hle_541c62b3
created_at: 2026-02-13T18:06:46.166Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Section-by-Section Classification: project-memory-system.instructions.md

**Total lines:** 2244
**Classification criteria:**
- **SKILL** = knowledge, guidance, how-to, examples, best practices, workflows that agents LEARN from
- **INSTRUCTION** = mandatory rules, hard constraints, security boundaries, tool schemas, required behaviors

---

## Section Classification

### 1. Title + Metadata (L1-10) — **INSTRUCTION**
- Version info, purpose statement
- Must stay in instruction file as header identification
- **Lines:** 10 | **Destination:** stays in instruction

### 2. Table of Contents (L12-23) — **INSTRUCTION**
- Navigation index
- **Lines:** 12 | **Destination:** stays in instruction (auto-generated)

### 3. Overview (L25-66) — **SKILL** → `project-memory-overview/SKILL.md`
- "Core Concepts" table: Workspace, Plan, Step, Session, Handoff, Lineage, Context
- "Agent Types" table: all 13 agents with roles and primary tools
- This is knowledge about the system architecture
- **Lines:** ~42 | **Destination:** project-memory-overview/SKILL.md

### 4. Quick Start (L68-110) — **MIXED**
- **INSTRUCTION** portion: "Every agent MUST follow these steps" (mandatory rule)
- **SKILL** portion: The example JSON showing init → validate → update → handoff → complete flow
- The init/validate requirement is a hard constraint (keep in instruction)
- The example workflow is guidance (move to skill)
- **Lines:** ~42 | **Split:** ~10 lines instruction, ~32 lines skill
- **Skill destination:** mcp-tools-usage/SKILL.md (workflow patterns section)

### 5. Tool Summary table (L112-120) — **SKILL** → `project-memory-overview/SKILL.md`
- Quick-reference table of 5 tools and their actions
- Knowledge overview of the system
- **Lines:** ~10 | **Destination:** project-memory-overview/SKILL.md

### 6. memory_workspace — full section (L122-200) — **INSTRUCTION**
- register, list, info, reindex: parameter tables, types, required/optional flags
- These are API schema definitions — mandatory reference
- **Lines:** ~79 | **Destination:** stays in instruction (tool schema)

### 7. memory_plan — full section (L202-700) — **INSTRUCTION**
- create, update, archive, import, find, add_note, delete, consolidate, set_goals
- add_build_script, list_build_scripts, run_build_script, delete_build_script
- create_from_template, list_templates, confirm
- create_program, add_plan_to_program, upgrade_to_program, list_program_plans
- All are API parameter schema definitions
- **Lines:** ~500 | **Destination:** stays in instruction (tool schema)
- **Note:** "Used by" hints are SKILL-like but tightly bound to schemas

### 8. memory_steps — full section (L700-900) — **INSTRUCTION**
- add, update, batch_update, insert, delete, reorder, move, sort, set_order, replace
- All API parameter schema definitions
- **Lines:** ~200 | **Destination:** stays in instruction (tool schema)

### 9. memory_agent — full section (L900-1310) — **INSTRUCTION**
- init, complete, handoff, validate, list, get_instructions, deploy, get_briefing, get_lineage
- Context optimization parameters (compact, context_budget, include_workspace_context)
- All API parameter schema definitions
- **Lines:** ~410 | **Destination:** stays in instruction (tool schema)

### 10. memory_context — full section (L1310-1720) — **INSTRUCTION**
- store, get, store_initial, list, list_research, append_research
- workspace_get/set/update/delete, knowledge_store/get/list/delete
- generate_instructions
- All API parameter schema definitions
- **Lines:** ~410 | **Destination:** stays in instruction (tool schema)

### 11. Agent Workflow Examples (L1787-1950) — **SKILL** → `mcp-tools-usage/SKILL.md`
- Complete workflow diagram: Feature Request → Coordinator → Researcher → Architect → Executor → Tester → Reviewer → Archivist
- "Common Pattern: Executor Blocked → Revisionist" example
- These are how-to patterns, not mandatory rules
- **Lines:** ~163 | **Destination:** mcp-tools-usage/SKILL.md

### 12. Best Practices (L1952-2060) — **SKILL** → `mcp-tools-usage/SKILL.md`
- "Always Initialize and Validate" — guidance (the mandatory part is already in Quick Start)
- "Update Steps Atomically" — best practice
- "Handoff Through Coordinator" — best practice / guidance
- "Use Goals and Success Criteria" — guidance
- "Generate Instructions for Complex Handoffs" — workflow tip
- "Document Your Work" — workflow tip
- **Lines:** ~108 | **Destination:** mcp-tools-usage/SKILL.md

### 13. Anti-Patterns to Avoid (L2062-2130) — **MIXED**
- "Don't Skip Initialization" — **INSTRUCTION** (hard rule) but also skill-style example
- "Don't Handoff Directly Between Subagents" — **INSTRUCTION** (enforced by hub-spoke model)
- "Don't Forget to Complete Sessions" — **INSTRUCTION** (hard rule)
- "Don't Modify Steps Without Updating Status" — best practice (**SKILL**)
- "Don't Create Plans Without Goals" — best practice (**SKILL**)
- **Lines:** ~68 | **Split:** ~40 lines instruction, ~28 lines skill
- **Skill destination:** mcp-tools-usage/SKILL.md (anti-patterns section)
- **Instruction items:** Keep mandatory rules as brief enforcements

### 14. Tips by Agent Role (L2132-2210) — **SKILL** → `mcp-tools-usage/SKILL.md`
- Coordinator, Researcher, Architect, Executor, Reviewer, Tester, Revisionist, Archivist, Analyst, Brainstorm, SkillWriter, Worker tips
- All guidance/best practices, none are hard constraints
- **Lines:** ~78 | **Destination:** mcp-tools-usage/SKILL.md

### 15. Appendix: Type Reference (L2212-2244) — **INSTRUCTION**
- StepStatus, StepType, RequestCategory, AgentType, Priority type definitions
- These are canonical type schemas
- **Lines:** ~33 | **Destination:** stays in instruction (schema reference)

---

## Summary Totals

| Classification | Lines | Percentage |
|---------------|-------|------------|
| **INSTRUCTION (stays)** | ~1,694 | ~75.5% |
| **SKILL (extractable)** | ~431 | ~19.2% |
| **MIXED (needs splitting)** | ~110 | ~4.9% |
| **Navigation/meta** | ~9 | ~0.4% |

### Skill Content Distribution by Destination

| Proposed Skill | Extracted Lines | From Sections |
|---------------|----------------|---------------|
| project-memory-overview/SKILL.md | ~52 | §3 Overview, §5 Tool Summary |
| mcp-tools-usage/SKILL.md | ~377 | §4 Quick Start (partial), §11 Workflow Examples, §12 Best Practices, §13 Anti-Patterns (partial), §14 Tips by Role |
| agent-handoff/SKILL.md | ~0 from this file | (content comes from handoff-protocol.instructions.md instead) |
| build-scripts/SKILL.md | ~0 from this file | (content comes from build-scripts.instructions.md instead) |
| plan-context/SKILL.md | ~0 from this file | (content comes from plan-context.instructions.md instead) |
| workspace-management/SKILL.md | ~0 from this file | (content comes from workspace-migration.instructions.md instead) |

### Post-extraction instruction file

The instruction file shrinks from ~2244 lines to ~1694 lines (~75% retention), which is still large but now purely tool schemas and mandatory rules. Consider whether the tool schema sections (§6-§10, ~1600 lines) should remain as-is or be further compressed.
