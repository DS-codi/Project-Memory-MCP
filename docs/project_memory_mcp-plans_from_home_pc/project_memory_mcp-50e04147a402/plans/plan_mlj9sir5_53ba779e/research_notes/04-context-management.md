---
plan_id: plan_mlj9sir5_53ba779e
created_at: 2026-02-12T09:47:03.286Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Research Area 4: Context Management (for Context Optimization)

## Current Context Management Architecture

### Context Storage
- Plan context stored as JSON files: `data/{workspace_id}/plans/{plan_id}/{type}.json`
- Common types: `original_request`, `audit`, `research`, `architecture`, `affected_files`, `constraints`, `code_references`, `test_expectations`
- Workspace context: `data/{workspace_id}/workspace.context.json`
- Knowledge files: `data/{workspace_id}/knowledge/{slug}.json`
- Research notes: `data/{workspace_id}/plans/{plan_id}/research_notes/*.md`

### Context Overload Problem (Historical)
From knowledge file `plan-summary-plan-mlgbe4zs-41f944e1`:
- **Problem**: Plans could be 50-100KB+ in serialized form
- **Root cause**: Full agent sessions (with entire context objects), full lineage, all steps (including completed)
- **Solution implemented** in recent "Workspace Context Storage & Agent Context Overload Fix" plan:

### Recent Fixes Already Implemented
1. **Compact Init Mode** (default since fix):
   - `compactifyPlanState()` in `server/src/utils/compact-plan-state.ts` (~155 lines)
   - Sessions trimmed to last 3, context reduced to keys-only
   - Lineage capped at last 3 entries
   - Steps filtered to pending/active only (completed excluded)
   - >60% payload reduction (50-100KB → 5-15KB)
   
2. **Context Budget** (`context_budget` parameter):
   - `compactifyWithBudget()` progressively trims until payload fits byte budget
   - Reduces maxSessions → maxLineage → eventually strips completed steps and goals
   - 6-attempt progressive reduction strategy

3. **Workspace Context Summary** (opt-in via `include_workspace_context: true`):
   - `buildWorkspaceContextSummary()` in `server/src/utils/workspace-context-summary.ts`
   - Returns section names + item counts, not full content
   - Staleness warnings for context >30 days old, knowledge files >60 days old

4. **Knowledge Files System**:
   - Persistent named documents that survive across plans
   - Categories: schema, config, limitation, plan-summary, reference, convention
   - Max 256KB per file, 100 files per workspace
   - Archivist creates plan-summary knowledge files after archiving

### Remaining Context Overload Sources
Despite the fixes, context overload can still occur from:
1. **Agent session history accumulation** — sessions grow over multi-agent cycles
2. **Large step lists** — plans with 50+ steps still generate significant payload
3. **Research notes** — appended markdown files can be very large
4. **Instruction files** — Coordinator generates instruction files that agents read at init
5. **Original request context** — user requests with many file attachments
6. **Multiple tool call outputs** — each tool response adds to the agent's context window
7. **Dashboard/extension data** — not directly context overload but adds to system complexity

### Key Files for Context Management
- `server/src/utils/compact-plan-state.ts` — Compact mode implementation
- `server/src/utils/workspace-context-summary.ts` — Workspace summary builder
- `server/src/tools/handoff.tools.ts` — Agent init (where compact/budget applied)
- `server/src/tools/context.tools.ts` — Context CRUD (865 lines)
- `server/src/tools/workspace-context.tools.ts` — Workspace context CRUD (505 lines)
- `server/src/tools/knowledge.tools.ts` — Knowledge file CRUD (301 lines)
- `server/src/tools/consolidated/memory_context.ts` — Consolidated context tool (491 lines)
- `server/src/tools/consolidated/memory_agent.ts` — Consolidated agent tool (381 lines)