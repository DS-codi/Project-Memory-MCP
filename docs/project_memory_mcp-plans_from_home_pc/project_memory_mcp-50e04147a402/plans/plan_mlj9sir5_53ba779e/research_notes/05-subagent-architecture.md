---
plan_id: plan_mlj9sir5_53ba779e
created_at: 2026-02-12T09:47:32.350Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Research Area 5: Subagent Architecture

## Current Hub-and-Spoke Model

### Hub Agents (can call runSubagent)
1. **Coordinator** — Primary orchestrator, spawns all agents for plan execution
2. **Analyst** — Investigation hub, may spawn Researcher, Brainstorm for analysis cycles
3. **Runner** — Ad-hoc hub, may spawn agents when quick tasks escalate

### Spoke Agents (MUST NOT call runSubagent)
- Executor, Builder, Reviewer, Tester, Archivist, Brainstorm, Researcher, Architect
- Exception: Revisionist may spawn subagents when pivoting requires immediate sub-task execution

### How Subagents Work Currently
- Coordinator calls VS Code's `runSubagent()` API to spawn an agent
- Coordinator includes anti-spawning instructions in every subagent prompt:
  > "You are a spoke agent. Do NOT call runSubagent to spawn other agents."
- Spoke agents use `memory_agent(action: handoff)` to **recommend** next agent
- Spoke agents use `memory_agent(action: complete)` to finish
- Coordinator reads `recommended_next_agent` from plan state and deploys next

### Defined Agent Types (AgentType enum)
```typescript
type AgentType = 'Coordinator' | 'Analyst' | 'Brainstorm' | 'Runner' | 'Researcher'
  | 'Architect' | 'Executor' | 'Builder' | 'Revisionist' | 'Reviewer' | 'Tester' | 'Archivist';
```

### Agent Role Boundaries (AGENT_BOUNDARIES)
Each agent has defined:
- `can_implement: boolean` — Can create/edit code files
- `can_finalize: boolean` — Can complete without handoff (only Archivist)
- `must_handoff_to: AgentType[]` — Recommended next agents
- `forbidden_actions: string[]` — What this agent must NOT do
- `primary_responsibility: string` — Focus area

### Validation System
- Agent validation in `agent-validation.tools.ts` (650 lines)
- Phase-to-agent mapping ensures correct agent is deployed for current phase
- Deployment context with `override_validation` allows hub agents to bypass heuristics
- Each of the 12 agent types has a dedicated validation function

## Gaps in Current Subagent Architecture

### 1. No Formal "Worker" Type
- Hub agents (especially Coordinator) have been observed spawning **informal subagents** for task decomposition
- These are standard `runSubagent()` calls but without any formal Worker agent type
- The spawned agents often use **physical chat files** for context sharing rather than Project Memory
- No way to grant these informal subagents access to the MCP tools

### 2. Chat File Context Sharing
- No direct references to "chat files" in the codebase were found
- However, the user reports that spawned subagents "often use the physical chat files for context"
- This suggests VS Code's native chat session files are being used for context instead of the MCP system
- This creates a gap: work done by informal subagents is not tracked in plan state

### 3. No Subagent Lifecycle Tracking
- Current system tracks agent sessions via `AgentSession` in plan state
- But informal subagents spawned by hubs don't call `memory_agent(action: init)`
- Their work is invisible to the plan tracking system

### 4. No Task Decomposition Formalism
- When Coordinator or Analyst breaks a task into sub-tasks, there's no formal mechanism
- Hub agents just spawn agents with ad-hoc prompts
- No structured way to define "this is a sub-task of step X"

### What Would Need to Change
1. **New agent type**: Add `Worker` or `SubWorker` to AgentType enum
2. **Worker instructions**: Create a worker.agent.md with minimal, focused instructions
3. **Worker lifecycle**: Workers should init, do work, and complete — tracked in plan state
4. **MCP access**: Workers need access to Project Memory tools (currently inferred from runner chat context)
5. **Anti-spawning**: Workers must never spawn other agents — strict spoke behavior
6. **Coordinator orchestration**: Hub agents need guidance on when/how to use Workers vs full agents
7. **Agent boundaries**: Add AGENT_BOUNDARIES entry for Worker type
8. **Validation**: Add Worker validation function