# Dynamic Hub Architecture — Design Document

**Version:** 1.0  
**Date:** 2 March 2026  
**Status:** Current

---

## 1. Overview

Project Memory MCP uses a **dynamic hub-and-spoke agent model** in which a small number of permanent agents orchestrate work by provisioning blank-slate Shell agents at runtime with a complete identity, role instructions, context, and scope boundaries.

### Problem this solves

The previous model had a growing collection of static agent files — one per role (Coordinator, Analyst, Runner, TDDDriver, Executor, Reviewer, Tester, etc.). Each agent file was independently maintained and their instructions drifted over time. Each agent had to self-gather context at startup, duplicating work and wasting tokens. There was no single source of truth for role definitions.

### Solution

- **Two permanent agents** — Hub (orchestration) and PromptAnalyst (routing).
- **One blank-slate spoke** — Shell, given a complete role and context by Hub at spawn time.
- **DB-first role definitions** — all role instructions live in the database, fetched at spawn time via `memory_agent(action: get_instructions)`.
- **Context pre-assembled by Hub** — Shell executes from Hub's prompt alone and never self-gathers.

---

## 2. Agent Architecture

```
┌───────────────────────────────────────────────────────┐
│                        USER                           │
└──────────────────────────┬────────────────────────────┘
                           │ request
                           ▼
┌───────────────────────────────────────────────────────┐
│                        HUB                            │
│  Permanent orchestration agent                        │
│  - Registers workspace                                │
│  - Routes through PromptAnalyst                       │
│  - Pulls role instructions from DB                    │
│  - Composes complete spoke prompt                     │
│  - Spawns Shell with full context                     │
│  - Validates completion after every spoke             │
└────────────┬─────────────────────────┬────────────────┘
             │ investigate+classify     │ spawn(role+context)
             ▼                          ▼
┌────────────────────┐    ┌─────────────────────────────┐
│   PROMPT ANALYST   │    │          SHELL              │
│  Investigation +   │    │  Blank-slate spoke          │
│  routing spoke     │    │  Executes from Hub's prompt │
│  Returns structured│    │  No self-gathering          │
│  routing decision  │    │  Returns via handoff        │
└────────────────────┘    └─────────────────────────────┘
```

### 2.1 Hub

The permanent orchestration hub. Hub:
- Is the only agent that calls `runSubagent`
- Never implements code or makes file changes directly
- Is alive throughout the entire plan lifecycle
- Owns the pause/resume protocol
- Owns the post-spoke validation gate

### 2.2 PromptAnalyst

The investigation and routing spoke. PromptAnalyst:
- Reads code files, plan state, and sessions to understand the actual scope of the request
- Classifies the request into `hub_mode` and `scope_classification`
- Returns pre-gathered code references with `key_content` so Shell doesn't need to re-read
- Does **not** implement, does **not** modify plan steps, does **not** spawn agents

### 2.3 Shell

The blank-slate execution spoke. Shell:
- Receives a complete prompt from Hub containing its role, task, context, scope, and all required identifiers
- Calls MCP tools using the `workspace_id`, `plan_id`, `session_id`, `step_indices` provided in its prompt
- Returns to Hub via `memory_agent(action: handoff)`
- Has zero independent context-gathering responsibility

---

## 3. Startup Protocol (Hub)

On every new Hub session:

```
1. memory_workspace(action: register, workspace_path: "<abs-path>")
   → returns canonical workspace_id

2. memory_agent(action: init, agent_type: "Hub", workspace_id: "...")
   → check response.orphaned_sessions

3. If orphaned_sessions non-empty:
   - run git diff --stat
   - check plan for steps stuck in "active" status
   - reset/resolve before spawning anything

4. If workspace context is stale or empty:
   - populate before routing to PromptAnalyst

5. Pass workspace_id to every Shell spawn.
   Shell must never derive or register its own workspace ID.
```

---

## 4. PromptAnalyst Contract

### 4.1 What PromptAnalyst does

1. **Investigate** — reads relevant files, current plan state, recent sessions, and workspace context
2. **Classify** — determines hub mode and scope based on evidence, not surface text
3. **Return** — structured routing decision with pre-gathered context

### 4.2 Hub Mode table

| Mode | Choose when | What Hub will do |
|------|------------|-----------------|
| `standard_orchestration` | Clear deliverable, known approach, medium+ scope | Create/update plan, sequence roles phase by phase, checkpoint each phase |
| `investigation` | Root cause unknown, evidence insufficient to plan, repeated blockers | Discovery-first: gather evidence before any design or implementation |
| `adhoc_runner` | Fully scoped, low risk, completable in 1–3 steps, no plan needed | Direct execution, minimal overhead, escalates if scope grows |
| `tdd_cycle` | Explicit TDD instruction, quality-critical change, or test coverage gap | RED/GREEN/REFACTOR loop with enforced cycle gates |

**Key rule:** Classify from evidence gathered during investigation — not from the surface text of the prompt. A request that sounds simple may reveal high uncertainty once the relevant code and plan state are read.

### 4.3 Output contract

```json
{
  "hub_mode": "standard_orchestration|investigation|adhoc_runner|tdd_cycle",
  "scope_classification": "quick_task|single_plan|multi_plan|program",
  "relevant_code_references": [
    {
      "path": "string",
      "reason": "string",
      "key_content": "string — excerpt or summary of what was found"
    }
  ],
  "constraint_notes": ["string"],
  "recommended_plan_count": 0,
  "recommends_integrated_program": false,
  "recommended_program_count": 0,
  "candidate_plan_titles": ["string"],
  "gaps": ["string — what could not be determined and why"],
  "confidence_score": 0.0,
  "confidence_rationale": "string"
}
```

`key_content` is mandatory on every code reference. Hub uses it to compose the spoke prompt without Shell needing to re-read files. Missing `key_content` is a PromptAnalyst defect.

### 4.4 Scope routing actions

| Classification | Hub action |
|---------------|-----------|
| `quick_task` | Execute directly, no new plan |
| `single_plan` | Create one plan |
| `multi_plan` | Create multiple plans using `recommended_plan_count` and `candidate_plan_titles` |
| `program` | Create integrated program(s), attach child plans |

If `recommends_integrated_program = true`: program creation is mandatory regardless of `scope_classification`.

---

## 5. Shell Spoke Contract

### 5.1 What Shell receives

Every Shell spawn prompt MUST contain all of the following (in any order):

1. **Role instructions** — Full output of `memory_agent(action: get_instructions, agent_name: "<Role>")`. This is the DB-resident definition of how to behave in this role.
2. **Session context** — `workspace_id`, `plan_id`, `session_id` (from `prep_config.session_id`), `current_phase`, and `step_indices`. All MCP tool calls require these identifiers.
3. **Task** — Exactly which plan steps to complete (step indices and task text).
4. **Context** — Key content from PromptAnalyst's `relevant_code_references` embedded inline.
5. **Scope boundaries** — Exact files Shell may modify; directories where it may create files.
6. **Constraints** — From PromptAnalyst's `constraint_notes`.
7. **Step update protocol** — Verbatim block (see Section 6).
8. **Anti-spawn instruction** — "Do NOT call runSubagent. Use memory_agent(action: handoff) to return to Hub."

A spoke prompt missing any of these items is a Hub defect.

### 5.2 What Shell cannot do

- Call `runSubagent` — Hub is the only agent that spawns
- Self-gather context — all context is provided in the prompt
- Register its own workspace — workspace_id is provided by Hub
- Modify plan steps outside its assigned step_indices without explicit instruction

### 5.3 Shell's return protocol

When complete (or blocked):
1. `memory_agent(action: handoff, from_agent: "<Role>", to_agent: "Hub", data: { recommendation: "<NextRole>", steps_completed: N, files_modified: [...] })`
2. `memory_agent(action: complete, agent_type: "<Role>", summary: "...")`

---

## 6. Spawn Protocol (Hub)

The canonical three-step spawn flow before every `runSubagent` call:

### Step 1 — Pull role instructions from DB
```
memory_agent(action: get_instructions, agent_name: "<Role>")
→ returns full role instruction markdown
```

### Step 2 — Deploy context and prepare enriched prompt
```
memory_session(
  action: deploy_and_prep,
  agent_name: "<Role>",
  prompt: "<task description and embedded role instructions>",
  workspace_id: "...",
  plan_id: "...",
  compat_mode: "strict",
  phase_name: "<current_phase>",
  step_indices: [N, N+1, ...],
  include_skills: true,
  include_research: true,
  include_architecture: true,
  prep_config: {
    scope_boundaries: {
      files_allowed: ["src/..."],
      directories_allowed: ["src/..."]
    }
  }
)
→ returns prep_config:
    prep_config.enriched_prompt  — complete enriched prompt for Shell
    prep_config.session_id       — minted session ID for this spoke
    prep_config.plan_context.plan_id
    prep_config.plan_context.current_phase
```

`deploy_and_prep` performs:
- Deploys agent file and context bundle to `.projectmemory/active_agents/{name}/`
- Assembles context bundle from up to 8 sources (research, architecture, skills, instructions, handoff, workspace context, knowledge, phase context)
- Injects scope boundaries and anti-spawn block into the enriched prompt
- Mints a canonical `session_id` for this spoke
- Registers the session in the session registry

If `deploy_and_prep` returns `success: false`, do **NOT** proceed with `runSubagent`. Diagnose and retry.

### Step 3 — Spawn Shell with full context
```
runSubagent({
  agentName: "Shell",
  prompt: prep_config.enriched_prompt,
  description: "<Role>: <brief task>"
})
```

The `enriched_prompt` already contains the context bundle, scope boundaries, anti-spawn block, and session registration. Hub's role in step 1 is to embed the role instructions and task specifics into the `prompt` parameter of `deploy_and_prep` **before** calling it.

### Failure gate
If `deploy_and_prep` returns `success: false`:
- Log the failure reason
- Do NOT call `runSubagent`
- Attempt once more with corrected parameters
- If second attempt fails, pause and report to user

---

## 7. Role Catalogue

All role definitions live in the database. Hub fetches them at spawn time. The following catalogue gives Hub enough information to select the right role name.

| Role | Purpose | Use when |
|------|---------|---------|
| Researcher | Investigate unknowns, produce evidence and findings | Root cause unclear, missing information before design can begin |
| Architect | Design the solution, define plan phases and steps | Research complete or approach is known, need a structured plan |
| Executor | Implement — write code, make file changes | Plan steps defined and clear, ready to build |
| Reviewer | Validate implementation, run build verification | Implementation done, need quality gate before testing or archive |
| Tester | Write and run tests | Need test coverage added or existing tests verified |
| Revisionist | Fix blockers, correct and resequence the plan | Step blocked, review failed, plan needs correction |
| Archivist | Archive completed plan, reindex workspace | All steps done and verified, plan fully complete |
| Worker | Execute a single bounded sub-task | Isolated task, max 5 steps, no plan modification needed |
| Brainstorm | Generate solution options with tradeoffs | Approach unclear, decision needed before design can begin |

Full instructions for each role are fetched via:
```
memory_agent(action: get_instructions, agent_name: "<Role>")
```

---

## 8. Workflow Loops by Mode

### 8.1 `standard_orchestration` — Phase Loop

**Per phase** (repeat until all phases complete):
```
1. Executor    → Implement phase steps
2. Reviewer    → Build verification + code review
               Pass pre_plan_build_status ('passing'|'failing'|'unknown')
               If regression or issues → Revisionist → Executor → loop
3. Tester      → WRITE tests for this phase (do NOT run)
```

**After all phases complete:**
```
4. Tester      → RUN all tests
5. If failures → Revisionist → Executor → re-test loop
6. Reviewer    → Final comprehensive build verification
7. Archivist   → Archive plan, reindex workspace
```

**Plan creation:** For `single_plan` and `multi_plan` scope, Architect is spawned before Executor to design the plan steps.

### 8.2 `investigation` — Discovery Loop

```
1. Researcher  → Gather evidence, produce research notes
               (repeat as needed)
2. Hub reviews findings
   → Sufficient to design? → Architect → define plan steps
     → Switch to standard_orchestration
   → Insufficient?         → additional Researcher cycles
```

Always pauses between cycles. Investigation category is always-pause — not overrideable by auto-continue.

### 8.3 `adhoc_runner` — Direct Execution

```
1. Executor or Worker → Execute directly, no formal plan
   Auto-continue by default (no phase pauses)
2. If scope grows beyond quick_task:
   → Pause, create formal plan, switch to standard_orchestration
```

Worker is capped at ≤5 steps and cannot modify plans. Use Executor for larger scoped tasks.

### 8.4 `tdd_cycle` — TDD Loop

Per cycle:
```
1. Tester      → RED: write failing test
2. Executor    → GREEN: make test pass (minimal)
3. Reviewer    → REFACTOR: quality gate
```

Pause between complete cycles (after REFACTOR). Do not pause within RED→GREEN→REFACTOR — these are tightly coupled. Auto-continue eligible for plans with ≤3 cycles.

When all cycles pass: Archivist.

---

## 9. Progress Tracking

After every spoke returns, Hub MUST:

1. `memory_plan(action: get)` — read updated step statuses and `recommended_next_agent`
2. Verify all assigned steps show `done` (post-spoke validation gate)
3. Inspect `goals` and `success_criteria` — is the plan on track?
4. Read `recommended_next_agent` — the spoke's recommendation
5. Decide: spawn next spoke, pause for user, or handle exception

### Post-spoke validation gate

If any assigned step is still `pending` or `active` after the spoke returns:
- Hub MUST NOT advance to the next phase or deploy the next spoke
- Options: (a) re-prompt spoke for the missed steps, or (b) Hub manually updates with correct status and specific notes
- Steps with vague notes ("done", "completed") are not acceptable — add context via `memory_plan(action: add_note)`

---

## 10. Auto-Continue and Pause Protocol

### Pre-action summary (mandatory, non-disableable)

Before every `runSubagent` call, emit:
```
✅ <what just completed>
➡️  Deploying <Role> to <task>
📋 Expected: <outcome>
```

This happens even in auto-continue mode — the user always sees progress.

### Pause behaviour by mode

| Mode | Default | User override |
|------|---------|---------------|
| `standard_orchestration` | Pause at phase boundaries | "auto-continue" to skip |
| `investigation` | Always pause | Not overrideable |
| `adhoc_runner` | Auto-continue | "pause" to re-enable |
| `tdd_cycle` | Pause between cycles | "auto-continue" to skip |

### Always-pause overrides

These always pause regardless of auto-continue setting:
- `critical` or `high` priority plans
- `user_validation` step type
- Error recovery paths (Revisionist loops)
- Phase confirmation gates

### User override commands

| User says | Effect |
|-----------|--------|
| `"auto-continue"` | Enable auto-continue for this session |
| `"pause"` | Re-enable phase-boundary pausing |
| `"continue"` / `"go"` | Proceed once without changing session setting |

---

## 11. Tool Reference for Hub

| Tool | Action | When to use |
|------|--------|------------|
| `memory_workspace` | `register` | First thing on every session start |
| `memory_workspace` | `info` | Check existing plans in workspace |
| `memory_agent` | `init` | Record Hub activation, get plan state, check orphaned sessions |
| `memory_agent` | `complete` | Close Hub session |
| `memory_agent` | `handoff` | Not used by Hub — Shell agents call this to return |
| `memory_agent` | `get_instructions` | Fetch full role instructions from DB before every spawn |
| `memory_session` | `deploy_and_prep` | Deploy context bundle + prepare enriched prompt (mandatory before runSubagent) |
| `memory_plan` | `create` | Create plan when scope_classification = single_plan |
| `memory_plan` | `get` | Check step status after every spoke returns |
| `memory_plan` | `add_note` | Record route decisions, add context to vague step notes |
| `memory_plan` | `set_goals` | Set goals and success_criteria |
| `memory_plan` | `confirm` | Confirm phase/step after user approval |
| `memory_plan` | `create_program` | Create integrated program when scope_classification = program |
| `memory_steps` | `update` | Mark Hub's own directly-executed steps (rare) |
| `memory_context` | `store_initial` | Store user request + parsed context for Researcher/Architect |
| `memory_context` | `workspace_get` | Check workspace context staleness |

---

## 12. Step Update Protocol (Required in Every Shell Prompt)

Hub embeds this block verbatim in every spoke prompt:

```
STEP UPDATE PROTOCOL (non-negotiable):
- Before starting ANY work on a step: call memory_steps(action: update, status: "active")
- Immediately after completing a step: call memory_steps(action: update, status: "done", notes: "<specific outcome + files changed>")
- If blocked: call memory_steps(action: update, status: "blocked", notes: "<full error context>") and stop
- NEVER defer step updates to the end of your session
- NEVER batch-update all steps as done at session close
- Notes MUST name files and outcomes — not "done" or "completed"
```

---

## 13. Session Context Life Cycle

```
Hub session starts
  ↓
memory_agent(init) → session_id for Hub session
  ↓
memory_session(deploy_and_prep) → prep_config.session_id  ← spoke session ID
  ↓
runSubagent(Shell, enriched_prompt containing session_id)
  ↓
Shell calls MCP tools using workspace_id + plan_id + session_id from prompt
  ↓
Shell: memory_agent(handoff) → triggers cleanupAgent:
  - moves .projectmemory/active_agents/{name}/execution_notes
    to .projectmemory/reviewed_queue/{planId}/{name}_{timestamp}/
  - removes .projectmemory/active_agents/{name}/
  ↓
Hub: memory_plan(get) → validate spoke completion
  ↓
Next spoke or plan completion
```

`.projectmemory/active_agents/{name}/` contents during a spoke session:
```
{name}.agent.md          ← role instruction file
manifest.json            ← deployment metadata (plan, phase, steps, timestamps)
context/
  context-bundle.json    ← assembled context (research, architecture, skills, etc.)
instructions/            ← matched instruction files
```

This is automatically created by `deploy_and_prep` and cleaned up on handoff/complete. No manual management required.

---

## 14. DB Storage Model

Role definitions, skills, and instructions are stored in the MCP SQLite database:

| Table | Purpose |
|-------|---------|
| `agent_definitions` | Full role instructions (Researcher, Executor, Reviewer, etc.) |
| `instruction_files` | Instruction markdown files (scoped by applyTo patterns) |
| `skill_definitions` | Skill markdown files (domain patterns and conventions) |
| `deployable_agent_profiles` | Hub and PromptAnalyst as first-class deployable agents |
| `category_workflow_definitions` | Workflow category definitions linked to deployable profiles |

Resolution at spawn time:
- `memory_agent(action: get_instructions, agent_name: "Executor")` → reads from `agent_definitions` (DB-first, file fallback)
- `memory_session(action: deploy_and_prep, include_skills: true)` → reads from `skill_definitions` (DB-first)

DB can be seeded from `database-seed-resources/` and reproduced on a fresh machine via `npm run repro:import` in `server/`.

---

## 15. Constraints Summary

| Constraint | Applies to |
|-----------|-----------|
| Hub MUST call `deploy_and_prep` before every `runSubagent` | Hub |
| Hub MUST get role instructions from DB before composing prompt | Hub |
| Hub MUST pass workspace_id, plan_id, session_id, current_phase, step_indices in every spoke prompt | Hub |
| Hub MUST NOT implement code or make file changes directly | Hub |
| Hub MUST validate post-spoke step completion before advancing | Hub |
| Shell MUST NOT call `runSubagent` | Shell |
| Shell MUST NOT self-gather context not provided in prompt | Shell |
| Shell MUST update step status before and after each step | Shell |
| PromptAnalyst MUST NOT classify without investigating first | PromptAnalyst |
| PromptAnalyst MUST NOT implement or modify plan steps | PromptAnalyst |
| PromptAnalyst MUST include `key_content` on every code reference | PromptAnalyst |

---

*Document version: 1.0 — 2 March 2026*
