---
applyTo: "agents/coordinator.agent.md, agents/analyst.agent.md, agents/runner.agent.md, agents/tdd-driver.agent.md"
---

# Hub Interaction Discipline

This document defines the mandatory interaction protocol for **all hub agents** (Coordinator, Analyst, Runner, TDDDriver). It governs when hubs pause for user input, how they communicate before acting, and when they may proceed autonomously.

---

## 1. Pause Policy

### Default Rule: Pause at Phase Boundaries

After each subagent returns (completing a phase or significant workflow step), the hub **MUST pause** and wait for the user before deploying the next agent — unless auto-continue is active (see §3).

**What constitutes a pause point:**
- A subagent completes and hands off back to the hub
- A phase boundary is crossed (moving from Phase 1 to Phase 2)
- The planning phase completes and execution is about to begin
- A Revisionist loop completes and the hub is about to resume the normal flow

**What does NOT require a pause:**
- Internal hub bookkeeping (reading plan state, updating todos)
- Retry logic within the same phase (e.g., Reviewer → Revisionist → Executor within one phase)
- Completing the final `memory_agent(action: complete)` call

### Pause Behavior

When pausing, the hub:
1. Emits a **pre-action chat summary** (see §2)
2. Waits for the user to respond before proceeding
3. Does NOT call `runSubagent` until the user says "continue", "go", "yes", or similar

---

## 2. Pre-Action Chat Summary

### Mandatory Before Every Subagent Spawn

Before calling `runSubagent` (or equivalent), the hub **MUST** provide a brief chat summary to the user. This is **non-disableable** — it applies even when auto-continue is active.

### Format (3-5 lines)

```
**Phase Update:**
✅ [What just completed — agent name, outcome, key result]
➡️ [What happens next — which agent, what task, why]
📋 [Expected outcome — what success looks like for this next step]
```

### Examples

```
**Phase Update:**
✅ Researcher completed codebase analysis — 3 research notes stored
➡️ Deploying Architect to design the solution and create plan steps
📋 Expect 5-8 implementation steps across 2 phases
```

```
**Phase Update:**
✅ Executor completed Phase 1 (3/3 steps done, 4 files modified)
➡️ Deploying Reviewer for build verification and code review
📋 Reviewer will run build first, then review implementation quality
```

### Rules

- **Always include all three lines** (completed, next, expected)
- **Keep it brief** — this is a summary, not a report
- **No tool calls in the summary** — this is a plain chat message
- **First spawn of a plan** uses "Plan created" or "Plan approved" instead of a completion line

---

## 3. Auto-Continue Suggestion

### Eligibility Criteria

The hub may suggest auto-continue to the user when ALL of these conditions are met:

| Criterion | Threshold |
|-----------|-----------|
| Total plan steps | ≤ 4 |
| Total phases | ≤ 2 |
| Plan category | NOT in `always_pause` list (see §4) |
| Plan priority | NOT `critical` or `high` |

### How It Works

1. **At plan approval stage**, when presenting the Architect's plan to the user, the hub evaluates eligibility
2. If eligible, append to the plan summary:
   ```
   💡 This is a small-scope plan (X steps, Y phases). Want me to auto-continue 
   through the phases without pausing? You'll still see summaries before each step.
   Say "auto-continue" to enable, or just "go" to proceed with normal pauses.
   ```
3. **User must explicitly say "auto-continue"** to enable it — silence or "go" means normal pause behavior
4. Once enabled, auto-continue applies for the **remainder of the current session only**
5. Even with auto-continue active, the hub **still emits pre-action summaries** (§2) — it just doesn't wait for a response

### Auto-Continue Does NOT Apply To

- The initial plan approval step (user must always approve the plan)
- User validation steps (`type: "user_validation"`)
- Phase confirmation gates (`memory_plan(action: confirm)`)
- Error recovery paths (Revisionist loops)

---

## 4. Category-Dependent Pause Rules

Pause behavior varies by plan category and priority. These rules are evaluated at plan creation time.

| Category | Pause Behavior | Auto-Continue Available | Rationale |
|----------|---------------|------------------------|-----------|
| `orchestration` | **Always pause** | ❌ Never | Systemic changes need human oversight at every step |
| `program` | **Always pause** | ❌ Never | Multi-plan coordination requires explicit user control |
| `feature` | Pause (default) | ✅ If eligible | Standard work — user may want to skip pauses on small features |
| `bugfix` | Pause (default) | ✅ If eligible | Fixes vary in risk — user decides |
| `refactor` | Pause (default) | ✅ If eligible | Structural changes — user decides |
| `quick_task` | **Auto-continue by default** | ✅ Pre-enabled | Quick tasks should flow without friction |
| `advisory` | **No pause** | N/A | No subagents spawned — conversational only |

### Priority Override

Regardless of category, plans with `critical` or `high` priority **always pause** and are never eligible for auto-continue.

| Priority | Override |
|----------|----------|
| `critical` | Always pause, no auto-continue |
| `high` | Always pause, no auto-continue |
| `medium` | Follow category rule |
| `low` | Follow category rule |

---

## 5. User Override Commands

Users can change pause behavior mid-session with these commands:

| Command | Effect | Scope |
|---------|--------|-------|
| `auto-continue` | Skip pauses for the rest of this session | Current session only |
| `pause` | Re-enable pauses (disables auto-continue) | Current session only |
| `continue` / `go` / `yes` | Proceed from the current pause point | One-time |

### Detection

Hub agents should recognize these commands in any user message:
- Exact match: "auto-continue", "pause", "continue"
- Natural language: "keep going", "don't pause", "go ahead", "proceed"
- Combined: "auto-continue and go" (enable auto-continue AND proceed)

### Persistence

- Override state is **session-scoped** — it resets when the session ends
- The hub tracks `auto_continue_active: boolean` as an internal session variable
- Override state is NOT persisted to plan state or MCP storage

---

## 6. Hub-Specific Considerations

Each hub agent applies this discipline slightly differently based on its role:

### Coordinator

- **Primary enforcer** of pause discipline — most complex orchestration loops
- Evaluates auto-continue eligibility at plan approval stage
- Tracks `auto_continue_active` throughout the session
- Pause points: after each subagent return, at phase boundaries, before final sequence

### Analyst

- Pauses between **investigation cycles** (each Researcher/Brainstorm deployment)
- Does NOT pause within a single analysis chain (e.g., reading files + storing research)
- Pre-action summaries focus on investigation findings and next hypothesis
- Auto-continue is rarely applicable (investigations are inherently iterative)

### Runner

- **Lighter pause policy** — `quick_task` category auto-continues by default
- If a task escalates beyond quick_task scope, Runner hands off to Coordinator (which then applies full pause discipline)
- Pre-action summaries are shorter (1-2 lines acceptable for quick tasks)
- Pause points: only when spawning subagents (rare for Runner)

### TDDDriver

- Pauses between **complete TDD cycles** (RED → GREEN → REFACTOR = one cycle)
- Does NOT pause within a cycle (e.g., between RED and GREEN phases)
- Pre-action summaries report cycle results (tests written, tests passing, refactoring done)
- Auto-continue suggestion applies to the overall TDD session, not individual cycles. Eligibility threshold is adapted to **≤3 complete cycles** (since each cycle is a tightly-coupled unit of 3 subagent spawns, the general ≤4-step criteria maps to cycle-level granularity)

---

## Quick Reference

```
┌─────────────────────────────────────────────────────────────┐
│              HUB INTERACTION DISCIPLINE                      │
│                                                              │
│  Before EVERY subagent spawn:                                │
│    1. Emit pre-action summary (ALWAYS, non-disableable)     │
│    2. Check auto_continue_active                             │
│       ├─ YES → proceed without waiting                       │
│       └─ NO  → wait for user to say "continue"              │
│                                                              │
│  Exceptions (always pause regardless):                       │
│    • critical/high priority plans                            │
│    • orchestration/program categories                        │
│    • user_validation steps                                   │
│    • error recovery (Revisionist loops)                      │
│                                                              │
│  User can change behavior mid-session:                       │
│    "auto-continue" → skip pauses                             │
│    "pause" → re-enable pauses                                │
│    "continue" → proceed once                                 │
└─────────────────────────────────────────────────────────────┘
```
