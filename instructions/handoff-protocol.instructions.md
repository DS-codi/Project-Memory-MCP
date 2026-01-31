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
- Call `handoff` to **recommend** the next agent (not transfer)
- Call `complete_agent` when your work is done
- Control automatically returns to Coordinator

## Handoff Flow

1. **Coordinator spawns Executor**
2. **Executor implements** → calls `handoff(to: "Reviewer")` → calls `complete_agent`
3. **Coordinator reads** `recommended_next_agent` → spawns Reviewer
4. **Reviewer validates** → calls `handoff(to: "Tester")` → calls `complete_agent`
5. **Coordinator reads** → spawns Tester
6. **Repeat** until Archivist archives the plan

## What Handoff Does

The `handoff` tool:
- Records the transition in lineage history
- Sets `recommended_next_agent` on the plan state
- **Does NOT** transfer control to another agent

The Coordinator reads `recommended_next_agent` and decides what to do next.

## Common Handoff Patterns

| From | To | When |
|------|-----|------|
| Researcher | Coordinator | Research complete |
| Architect | Coordinator | Plan designed |
| Executor | Coordinator | Implementation done (recommends Reviewer) |
| Reviewer | Coordinator | Approved (recommends Tester) or issues (recommends Revisionist) |
| Tester | Coordinator | Tests pass (recommends Archivist) or fail (recommends Revisionist) |
| Revisionist | Coordinator | Plan updated (recommends Executor) |
| Archivist | (none) | Final agent - plan archived |
