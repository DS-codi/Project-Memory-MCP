---
applyTo: "agents/coordinator.agent.md"
---

# Coordinator Request Categorization

This skill helps the Coordinator determine the correct agent or workflow for a request.

---

## � Category Routing Table (v2)

The Coordinator uses 7 categories to route requests to the appropriate workflow:

| Category | Planning Depth | Workflow Path |
|----------|---------------|---------------|
| `feature` | Full | Research → Brainstorm → Architect → Execute loop |
| `bugfix` | Branching | Hub checks cause clarity → investigation-first if unknown → Architect → Execute |
| `refactor` | Full minus brainstorm | Research → Architect → Execute (brainstorm only if architectural choice exists) |
| `orchestration` | Full + research | Research → Brainstorm → Architect → Execute (systemic impact always requires both) |
| `program` | Meta | Program creation → decomposes into child plans, each re-categorized independently |
| `quick_task` | None | Hub → Runner/Executor directly, no formal plan |
| `advisory` | None | Conversational, no action taken |

### Category Decision Tree

```
User prompt received:
├── Is it a question/opinion with no action? → advisory
├── Does it require ≤3-4 small steps? → quick_task → Runner
├── Is it a multi-plan initiative? → program → decompose into child plans
├── Is it fixing a broken thing?
│   ├── Cause known? → bugfix → Architect → Execute
│   └── Cause unknown? → bugfix (investigation-first) → Analyst/Researcher → Architect → Execute
├── Is it restructuring without new features? → refactor → Research → Architect → Execute
├── Is it changing the orchestration system itself? → orchestration → Research → Brainstorm → Architect → Execute
└── Default → feature → Research → Brainstorm → Architect → Execute
```

### Storing the Category Decision

After determining the category, call `memory_agent(action: categorize)` with the `CategoryDecision` payload before creating the plan. This stores the categorization result on the plan state for downstream agents.

---

## �🔍 WHEN TO USE ANALYST INSTEAD

Some requests are better suited for the **Analyst** agent, which specializes in long-term, iterative investigations. **Before starting a plan, evaluate if this is an Analyst task:**

| Use Coordinator (Standard Workflow) | Use Analyst (Investigation Workflow) |
|-------------------------------------|--------------------------------------|
| Building a known feature | Reverse engineering binary formats |
| Implementing a defined spec | Decoding unknown protocols |
| Bug fixes with clear solutions | Multi-session investigations |
| Refactoring with known patterns | Hypothesis → Test → Learn cycles |
| Known scope and milestones | Discovery-oriented work |
| Single-session completion expected | Unknown scope/duration |

**Keywords that suggest Analyst:**
- "decode", "reverse engineer", "analyze binary"
- "figure out the format", "understand the structure"
- "investigation", "discovery", "hypothesis"
- "parse unknown", "interpret bytes"

**If the request matches Analyst criteria:**
1. Tell the user: "This looks like an investigative task. I'll hand this off to the Analyst agent, which specializes in iterative discovery and hypothesis testing."
2. Use the handoff: `@Analyst Start investigation for: [description]`

---

## 🧪 WHEN TO USE TDDDriver INSTEAD

The **TDDDriver** is a hub agent that orchestrates Test-Driven Development cycles (RED → GREEN → REFACTOR). Deploy TDDDriver instead of the standard Executor → Tester flow when:

| Use Standard Flow (Executor → Tester) | Use TDDDriver |
|---------------------------------------|---------------|
| Implementation-first approach | Test-first / TDD approach |
| User wants feature implemented then tested | User explicitly requests TDD |
| Bug fixes with known solutions | New features with well-defined behavior |
| Refactoring existing code | Building new modules from scratch with tests |

**Keywords that suggest TDDDriver:**
- "TDD", "test-driven development", "test first"
- "red green refactor", "write tests first"
- "drive with tests", "failing test first"

**If the request matches TDDDriver criteria:**
1. Tell the user: "This looks like a TDD task. I'll deploy the TDDDriver to orchestrate red-green-refactor cycles."
2. Spawn TDDDriver as a subagent:

```javascript
runSubagent({
  agentName: "TDDDriver",
  prompt: `Orchestrate TDD cycles for: [description]
    Plan: [plan_id] | Workspace: [workspace_id]
    You are a hub agent. You CAN spawn Tester, Executor, and Reviewer as subagents.
    Include anti-spawning instructions in every subagent prompt.`,
  description: "TDD cycle orchestration"
})
```

---

## 🔬 When to Use Analyst Mid-Plan

Some plan steps require **analysis and comparison** rather than implementation. Deploy **Analyst** for steps like:

- "Compare output with ground truth"
- "Validate converted files against expected results"
- "Analyze differences between versions"
- "Test against live data and document findings"
- "Verify data integrity and mapping accuracy"

**Analyst returns to Coordinator** after completing the analysis, just like other subagents.

```
Example flow with Analyst:
  EXECUTOR → implements converter
  ANALYST  → compares output with ground truth, documents differences
  EXECUTOR → fixes issues found by Analyst (if any)
  TESTER   → writes/runs tests
```
