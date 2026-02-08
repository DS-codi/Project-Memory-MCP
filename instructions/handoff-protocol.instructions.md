---
applyTo: "**/*"
---

# Hub-and-Spoke Handoff Protocol

This workspace uses a **hub-and-spoke** model for agent orchestration.

## Architecture

```
                    ┌───────────────┐
                    │  COORDINATOR  │  ← Central Hub
                    │   (Hub)       │
                    └───────┬───────┘
           ┌────────────────┼────────────────┐
           ▼                ▼                ▼
    ┌──────────┐     ┌──────────┐     ┌──────────┐
    │ Executor │     │ Reviewer │     │  Tester  │  ← Spokes
    └────┬─────┘     └────┬─────┘     └────┬─────┘
         │                │                │
         └────────────────┴────────────────┘
                   Return to Hub
```

## Key Rules

### For Coordinator (Hub)
- **You spawn all agents** using `runSubagent`
- **Control always returns to you** after each agent completes
- Read `recommended_next_agent` from plan state to decide next action
- Track overall plan progress across agent sessions

### For Other Agents (Spokes)
- **You are a subagent** - you don't transfer control directly
- Call `memory_agent` (action: handoff) to **recommend** the next agent (not transfer)
- Call `memory_agent` (action: complete) when your work is done
- Control automatically returns to Coordinator

## Handoff Flow

1. **Coordinator spawns Executor**

2. **Executor implements** → calls `memory_agent` (action: handoff, to: "Coordinator", recommended: "Reviewer") → calls `memory_agent` (action: complete)
3. **Coordinator reads** `recommended_next_agent` → spawns Reviewer
4. **Reviewer validates** → calls `memory_agent` (action: handoff, to: "Coordinator", recommended: "Tester") → calls `memory_agent` (action: complete)
5. **Coordinator reads** → spawns Tester
6. **Repeat** until Archivist archives the plan

## What Handoff Does

The `memory_agent` (action: handoff) tool:
- Records the transition in lineage history
- Sets `recommended_next_agent` on the plan state
- **Does NOT** transfer control to another agent

The Coordinator reads `recommended_next_agent` and decides what to do next.

## Common Handoff Patterns

| From | To | When |
|------|-----|------|
| Researcher | Coordinator | Research complete (recommends Architect) |
| Architect | Coordinator | Plan designed (recommends Executor) |
| Executor | Coordinator | Implementation done (recommends Reviewer) |
| Reviewer | Coordinator | Approved (recommends Tester) or issues (recommends Revisionist) |
| Tester | Coordinator | Tests pass (recommends Archivist) or fail (recommends Revisionist) |
| Revisionist | Coordinator | Plan updated (recommends Executor) |
| Archivist | (none) | Final agent - plan archived |

## Expanded Agent Handoff Details

Use these rules when coordinating non-core agents or alternate flows.

### Coordinator (Hub)
- Always handoff by spawning subagents with `runSubagent`.
- Always wait for subagents to call `memory_agent` (action: handoff) and `memory_agent` (action: complete).
- Use `memory_plan` (action: get) to read `recommended_next_agent` before spawning the next agent.

### Researcher
- Handoff to Coordinator with recommendation for Architect when research is complete.
- Handoff to Coordinator with recommendation for Analyst when investigation should continue.

### Architect
- Handoff to Coordinator with recommendation for Executor when plan is ready.
- Handoff to Coordinator with recommendation for Researcher when more research is required.

### Executor
- Handoff to Coordinator with recommendation for Builder after implementation.
- Handoff to Coordinator with recommendation for Revisionist if blocked or build/test failures are found.

### Builder
- Handoff to Coordinator with recommendation for Reviewer if build passes.
- Handoff to Coordinator with recommendation for Revisionist if build fails.

### Reviewer
- Handoff to Coordinator with recommendation for Tester if review passes.
- Handoff to Coordinator with recommendation for Revisionist if issues are found.

### Tester
- WRITE mode: handoff to Coordinator with recommendation to continue the phase loop.
- RUN mode: handoff to Coordinator with recommendation for Archivist if tests pass.
- RUN mode: handoff to Coordinator with recommendation for Revisionist if tests fail.

### Revisionist
- Handoff to Coordinator with recommendation for Executor after plan fixes.
- Handoff to Coordinator with recommendation for Analyst if re-analysis is required.

### Archivist
- Final agent. No handoff; only `memory_agent` (action: complete) after `memory_plan` (action: archive).

### Analyst
- Handoff to Coordinator with recommendation for Executor when investigation yields implementation steps.
- Handoff to Coordinator with recommendation for Researcher when external docs are needed.
- Handoff to Coordinator with recommendation for Brainstorm when exploring options is needed.

### Brainstorm
- Handoff to Coordinator with recommendation for Architect when ideas are ready to formalize.
- Handoff to Coordinator with recommendation for Researcher when missing context blocks planning.

### Runner
- If task grows complex, handoff to Coordinator with recommendation to create a plan.
- If investigation is required, handoff to Coordinator with recommendation for Analyst.
