# Agent Type Mapping Contract

## Overview

Project Memory MCP normalizes agent type identifiers at the Zod schema boundary. The key contract: **"Hub" is a runtime alias for "Coordinator"**.

## How It Works

### The `AgentTypeSchema` Preprocessor

In `server/src/index.ts`, every tool schema that accepts an `agent_type`, `to_agent`, or `from_agent` field uses a shared Zod schema:

```ts
const AgentTypeSchema = z.preprocess(
  (val) => val === 'Hub' ? 'Coordinator' : val,
  z.enum(['Coordinator', 'Analyst', 'Researcher', 'Architect', 'Executor',
    'Reviewer', 'Tester', 'Revisionist', 'Archivist', 'Brainstorm',
    'Runner', 'SkillWriter', 'Worker', 'TDDDriver', 'Cognition', 'Migrator'])
);
```

The `z.preprocess()` step runs **before** Zod validation. When an agent sends `agent_type: "Hub"`, the preprocessor silently rewrites it to `"Coordinator"` before the enum check fires. All downstream handler code only ever sees `"Coordinator"`.

### Normalization Scope

The alias applies everywhere `AgentTypeSchema` is used:

| Field | Example Tool | Behavior |
|-------|-------------|----------|
| `agent_type` | `memory_agent(action: "init")` | `"Hub"` → `"Coordinator"` |
| `to_agent` | `memory_agent(action: "handoff")` | `"Hub"` → `"Coordinator"` |
| `from_agent` | `memory_agent(action: "handoff")` | `"Hub"` → `"Coordinator"` |
| `suggested_workflow` | `memory_plan(action: "create")` | Each array element normalized |
| `skip_agents` | `memory_plan(action: "create")` | Each array element normalized |

## Valid Agent Types

The 16 canonical agent types (used in the TypeScript `AgentType` union and Zod enum):

| Agent Type | Role |
|-----------|------|
| Coordinator | Hub orchestrator — deploys and manages all other agents |
| Analyst | Investigation and analysis |
| Researcher | Research and information gathering |
| Architect | System design and architecture |
| Executor | Code implementation |
| Reviewer | Code review |
| Tester | Testing and validation |
| Revisionist | Revision and rework |
| Archivist | Archival and cleanup |
| Brainstorm | Brainstorming and ideation |
| Runner | Ad-hoc task execution |
| SkillWriter | Skill creation and management |
| Worker | Lightweight scoped tasks |
| TDDDriver | Test-driven development cycles |
| Cognition | Cognitive analysis |
| Migrator | Migration tasks |

**Plus one runtime alias:**

| Alias | Resolves To | Notes |
|-------|------------|-------|
| Hub | Coordinator | Runtime-only. NOT in the TypeScript `AgentType` union. |

## Implications for Agent Authors

1. **You can use "Hub" or "Coordinator" interchangeably** in `agent_type`, `to_agent`, and `from_agent` fields. Both are accepted.

2. **All stored data will contain "Coordinator"**, never "Hub". The normalization happens before persistence, so database records, plan state, and session logs always show the canonical form.

3. **TypeScript code should use `"Coordinator"`**. The `AgentType` type union does not include `"Hub"` — it's a Zod-level runtime alias only. Code that type-checks against `AgentType` won't accept the string `"Hub"`.

4. **No special handling needed in handler code.** By the time your handler function receives parameters, `"Hub"` has already been transformed to `"Coordinator"`.

## Related Files

- `server/src/types/agent.types.ts` — `AgentType` union and `HubAgent` type alias
- `server/src/index.ts` — `AgentTypeSchema` definition with `z.preprocess()`
