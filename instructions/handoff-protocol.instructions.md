---
applyTo: "**/*"
---

# Hub-and-Spoke Handoff Protocol

This workspace uses a **hub-and-spoke** model for agent orchestration.

## Architecture

```
                    ┌───────────────┐
                    │  COORDINATOR  │  ← Primary Hub
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

    Also spawnable as lightweight spokes:
    ┌──────────┐
    │  Worker  │  ← Scoped sub-task spoke (max 5 steps)
    └──────────┘
```

### Hub Agents
Four agents are recognised as **hubs** that may spawn subagents via `runSubagent`:
- **Coordinator** — Primary orchestrator. Spawns any agent for plan execution.
- **Analyst** — Investigation hub. May spawn Researcher, Brainstorm, or other agents for analysis cycles.
- **Runner** — Ad-hoc hub. May spawn agents when quick tasks escalate.
- **TDDDriver** — TDD hub. Spawns Tester (RED), Executor (GREEN), Reviewer (REFACTOR) for test-driven development cycles.

### Spoke Agents
All other agents are **spokes**: Executor, Reviewer, Tester, Archivist, Brainstorm, Researcher, Architect, Worker, Cognition.
- **Worker** is a lightweight spoke for scoped sub-tasks (≤ 5 steps). Cannot modify plans or spawn subagents.
- **Cognition** is a read-only reasoning/analysis spoke. Cannot edit files, modify plans, or create context. Returns analysis results to Coordinator.
- **Exception**: Revisionist may spawn subagents when pivoting a plan requires immediate sub-task execution.

## Subagent Spawning Rules

1. **Only hub agents may call `runSubagent`.** (Coordinator, Analyst, Runner, TDDDriver)
2. **When spawning a subagent, hubs MUST include anti-spawning instructions** in the prompt:
   > "You are a spoke agent. Do NOT call `runSubagent` to spawn other agents. Use `memory_agent(action: handoff)` to recommend the next agent back to the hub."
3. **Spoke agents MUST NOT call `runSubagent`** — use `memory_agent(action: handoff)` to recommend the next agent.
4. **Revisionist exception**: The Revisionist may spawn subagents when a plan pivot requires immediate sub-task execution, but should prefer handoff when possible.

### Anti-Patterns
- **NEVER**: Executor calling `runSubagent('Tester', ...)`
  - **INSTEAD**: Executor calls `memory_agent(action: handoff)` to recommend Tester
- **NEVER**: Spoke agent ignoring anti-spawning instructions from the hub
  - **INSTEAD**: Use `memory_agent(action: handoff)` and let the hub decide

## Key Rules

### For Hub Agents (Coordinator, Analyst, Runner, TDDDriver)
- **You spawn subagents** using `runSubagent`
- **Always include anti-spawning instructions** in the subagent prompt
- **Control returns to you** after each subagent completes
- Read `recommended_next_agent` from plan state to decide next action

### For Spoke Agents (all others except Revisionist)
- **You are a subagent** — you don't transfer control directly
- **NEVER call `runSubagent`** — this is reserved for hub agents
- Call `memory_agent` (action: handoff) to **recommend** the next agent (not transfer)
- Call `memory_agent` (action: complete) when your work is done
- Control automatically returns to the hub that spawned you

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
| Worker | Coordinator | Sub-task complete, or limit/scope exceeded |
| Cognition | Coordinator | Analysis/reasoning complete (recommends next agent based on findings) |
| TDDDriver | Coordinator | TDD cycles complete (recommends Reviewer) or blocked (recommends Revisionist) |
| Archivist | (none) | Final agent - plan archived |

## Expanded Agent Handoff Details

Use these rules when coordinating non-core agents or alternate flows.

### Coordinator (Primary Hub)
- Always handoff by spawning subagents with `runSubagent`.
- **Include anti-spawning instructions** in every subagent prompt.
- Always wait for subagents to call `memory_agent` (action: handoff) and `memory_agent` (action: complete).
- Use `memory_plan` (action: get) to read `recommended_next_agent` before spawning the next agent.

### Researcher
- Handoff to Coordinator with recommendation for Architect when research is complete.
- Handoff to Coordinator with recommendation for Analyst when investigation should continue.

### Architect
- Handoff to Coordinator with recommendation for Executor when plan is ready.
- Handoff to Coordinator with recommendation for Researcher when more research is required.

### Executor
- Handoff to Coordinator with recommendation for Reviewer after implementation.
- Handoff to Coordinator with recommendation for Revisionist if blocked or build/test failures are found.

### Reviewer
- Runs build verification when entering from Executor (build-check mode).
- Handoff to Coordinator with recommendation for Tester if build and review pass.
- Handoff to Coordinator with recommendation for Revisionist if build fails or issues are found.

### Tester
- WRITE mode: handoff to Coordinator with recommendation to continue the phase loop.
- RUN mode: handoff to Coordinator with recommendation for Archivist if tests pass.
- RUN mode: handoff to Coordinator with recommendation for Revisionist if tests fail.

### Revisionist
- Handoff to Coordinator with recommendation for Executor after plan fixes.
- Handoff to Coordinator with recommendation for Analyst if re-analysis is required.

### Archivist
- Final agent. No handoff; only `memory_agent` (action: complete) after `memory_plan` (action: archive).

### Analyst (Investigation Hub)
- May spawn subagents (Researcher, Brainstorm, etc.) for analysis cycles.
- **Include anti-spawning instructions** in every subagent prompt.
- Handoff to Coordinator with recommendation for Executor when investigation yields implementation steps.
- Handoff to Coordinator with recommendation for Researcher when external docs are needed.
- Handoff to Coordinator with recommendation for Brainstorm when exploring options is needed.

### Brainstorm
- Handoff to Coordinator with recommendation for Architect when ideas are ready to formalize.
- Handoff to Coordinator with recommendation for Researcher when missing context blocks planning.

### Runner (Ad-hoc Hub)
- May spawn subagents when quick tasks escalate beyond simple execution.
- **Include anti-spawning instructions** in every subagent prompt.
- If task grows complex, handoff to Coordinator with recommendation to create a plan.
- If investigation is required, handoff to Coordinator with recommendation for Analyst.

### Worker (Lightweight Spoke)
- Worker is a **spoke agent** — it MUST NOT call `runSubagent`.
- Receives workspace_id, plan_id, specific task, and file scope from the hub that spawned it.
- Cannot modify plan steps, create plans, or archive.
- Handoff to the deploying hub agent (Coordinator, Analyst, or Runner) when sub-task is complete.
- If scope or budget limits are exceeded, sets `budget_exceeded: true` or `scope_escalation: true` in handoff data.
- Hub agent reads limit flags and reassesses task decomposition.

### Cognition (Read-Only Analysis Spoke)
- Cognition is a **spoke agent** — it MUST NOT call `runSubagent`.
- **Read-only**: Cannot edit files, modify plans, create context, or update steps.
- Allowed tools: `memory_plan` (read-only), `memory_context` (read-only), `memory_steps` (read-only).
- Capabilities: Analyze codebase, ideate solutions, critique approaches, provide structured reasoning.
- Handoff to Coordinator with recommendation based on analysis findings (e.g., Architect, Executor, Researcher).
- Spawned by hub agents using `memory_spawn_agent` (prep) followed by native `runSubagent` (execute).

### TDDDriver (TDD Hub)
- TDDDriver is a **hub agent** — it CAN call `runSubagent`.
- Spawns Tester (RED phase), Executor (GREEN phase), Reviewer (REFACTOR phase).
- **Include anti-spawning instructions** in every subagent prompt.
- Tracks TDD cycle state (cycle number, current phase, iterations).
- Handoff to Coordinator with recommendation for Reviewer when all TDD cycles are complete.
- Handoff to Coordinator with recommendation for Revisionist if blocked.

## Subagent Interruption Recovery

When a user cancels or interrupts a subagent mid-execution, the hub that spawned it **must** follow the recovery protocol before continuing. See `instructions/subagent-recovery.instructions.md` for the full protocol.

**Quick summary:**
1. `git diff --stat` — assess what files were changed
2. `memory_plan(action: get)` — check for steps stuck in "active" status
3. `get_errors()` — check codebase health
4. Ask user what went wrong and how to proceed
5. Course-correct: revert, reset steps, re-spawn with scope guardrails

## Scope Guardrails

**All hub agents MUST include scope boundaries** when spawning subagents. Every `runSubagent` prompt should contain:
- Explicit list of files the subagent may modify
- Directories where new files may be created
- A "SCOPE ESCALATION" block instructing the subagent to stop and handoff if out-of-scope changes are needed

See `instructions/subagent-recovery.instructions.md` for the full scope boundary template.

## Spawn Preparation Tool (`memory_spawn_agent`)

Hub agents should use `memory_spawn_agent` to prepare context-rich spawn payloads, then execute with native `runSubagent`.

### Usage

```json
{
  "compat_mode": "strict",
  "agent_name": "Cognition",
  "workspace_id": "workspace-id",
  "plan_id": "plan-id",
  "prompt": "Analyze the authentication module for security vulnerabilities"
}
```

Then launch natively:

```json
{
  "agentName": "Cognition",
  "prompt": "<memory_spawn_agent.prep_config.enriched_prompt>",
  "description": "Analyze authentication module"
}
```

### How It Works

1. **Context preparation**: Builds `prep_config.enriched_prompt` with workspace/plan context.
2. **Boundary injection**: Adds scope boundaries and anti-spawning instructions when applicable.
3. **Compatibility support**: Returns canonical `prep_config` (plus deprecated `spawn_config` alias in legacy mode).
4. **Native execution**: Caller passes prepared prompt into `runSubagent`.

### Rules

- **Only hub agents** (Coordinator, Analyst, Runner, TDDDriver) should prepare+spawn subagents.
- Spoke agents MUST NOT spawn — use `memory_agent(action: handoff)` instead.
- `memory_spawn_agent` is prep-only and MUST NOT be treated as execution.
- Always call native `runSubagent` after prep using `prep_config.enriched_prompt`.