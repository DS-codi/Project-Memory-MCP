---
plan_id: plan_mlgbe4zs_41f944e1
created_at: 2026-02-10T08:07:10.120Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Issue 2: Agent Context Overload During Initialization

## What the Init Response Contains

When `memory_agent` (action: init) is called, the response returns `InitialiseAgentResult` which contains:

### 1. `session` (AgentSession)
```typescript
interface AgentSession {
  session_id: string;       // e.g., "sess_mlgbfcjv_145e55d5"
  agent_type: AgentType;    // e.g., "Researcher"
  started_at: string;       // ISO timestamp
  completed_at?: string;    // Set when agent completes
  context: Record<string, unknown>;  // Full context object passed by deployer
  summary?: string;         // Set when agent completes
  artifacts?: string[];     // Set when agent completes
}
```
**Size**: Small (~200 bytes for the current session itself)

### 2. `plan_state` (PlanState) ← **THE OVERLOAD SOURCE**
```typescript
interface PlanState {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  priority: PlanPriority;
  status: PlanStatus;
  category: RequestCategory;
  categorization?: RequestCategorization;  // Full categorization details
  current_phase: string;
  current_agent: AgentType | null;
  recommended_next_agent?: AgentType;
  deployment_context?: { ... };  // 5 fields
  pending_notes?: PlanNote[];
  confirmation_state?: ConfirmationState;
  goals?: string[];
  success_criteria?: string[];
  build_scripts?: BuildScript[];
  created_at: string;
  updated_at: string;
  agent_sessions: AgentSession[];  // ← ALL sessions, grows unbounded
  lineage: LineageEntry[];         // ← ALL handoff history, grows unbounded
  steps: PlanStep[];               // ← ALL steps with full details
}
```

**This is the major problem.** For a complex plan with, say:
- 20 steps (each with phase, task, status, notes, type, assignee) → ~2-4 KB
- 15 agent sessions (each with full context objects, potentially containing research targets, Q&A lists, etc.) → **5-20 KB each session context**
- 10 lineage entries → ~1 KB

A moderately complex plan can produce **50-100+ KB** just in `plan_state`.

### 3. `workspace_status`
```typescript
{
  registered: boolean;
  workspace_id?: string;
  workspace_path?: string;
  active_plans: string[];  // List of plan IDs
  message: string;         // Summary string
}
```
**Size**: Small (~200-500 bytes). This is already minimal.

### 4. `role_boundaries` (AgentRoleBoundaries)
Fixed-size object defined per agent type. ~200 bytes. Fine.

### 5. `instruction_files` (optional)
Array of `AgentInstructionFile` objects discovered in the workspace. Varies but typically small.

### 6. `validation` (optional, if `init+validate` mode used)
Contains validation result. Usually small.

## The Specific Overload Problems

### Problem A: `agent_sessions[]` Contains Full Context of All Previous Agents

Each `AgentSession.context` is the **full context object** that each agent was initialized with. For example, a Researcher's context might contain:
```json
{
  "deployed_by": "Coordinator",
  "reason": "Research workspace context storage failures...",
  "research_targets": ["workspace-context validation chain", ...],
  "questions_to_answer": ["Why does workspace context...", ...],
  "known_resources": ["server/src/tools/workspace-context.tools.ts", ...]
}
```

After 5-10 agent handoffs, this accumulates significantly. Each agent's context is typically 500-2000 bytes. With 10 sessions that's 5-20 KB of mostly irrelevant historical context.

### Problem B: All Steps Returned Regardless of Relevance

An Executor only needs to see steps assigned to them or in their phase. But they receive ALL steps including completed ones, unrelated phases, etc.

### Problem C: The Full `lineage[]` History

Every handoff creates a LineageEntry. After many handoffs, this array grows but provides diminishing value to the current agent.

### Problem D: No Summarization

There's no concept of "compact mode" or "summary mode" anywhere in the codebase. The init always returns the complete `PlanState`.

## What Could Be Summarized

1. **`agent_sessions[]`**: Only return the current session + count/summary of previous sessions. E.g. `{ current: AgentSession, previous_count: 8, last_agent: "Executor" }`

2. **`lineage[]`**: Only return the last 2-3 entries + total count. E.g. `{ recent: LineageEntry[], total_count: 10 }`

3. **`steps[]`**: Could filter to only active/pending steps, or steps relevant to the current phase. Return a summary like `{ active: PlanStep[], completed_count: 12, total_count: 20 }`

4. **`categorization`**: Probably not needed after the Coordinator sets it initially

5. **`build_scripts[]`**: Only needed by Builder agent, not all agents

## Existing "Compact" Mechanisms: None Found

I searched for any existing concept of compact/summary mode:
- No `compact` or `summary_mode` parameter on `initialiseAgent()`
- No filtering of `plan_state` before return
- The full `state` object from `store.getPlanState()` is returned directly (line ~218 of handoff.tools.ts)
- `memory_agent.ts` passes through the result directly without any transformation

## Proposed Fix Directions

1. **Add a `compact` parameter to init** that returns summarized plan state
2. **Default to compact mode** with an opt-in `full` mode for agents that need everything
3. **Agent-specific filtering**: Return only steps/data relevant to the agent's role
4. **Separate the full state retrieval** into its own action (e.g., `memory_plan` action: get) — agents that need full history can fetch it separately
5. **Cap `agent_sessions` returned**: Only return last N sessions + summary
6. **Cap `lineage` returned**: Only return last N entries + count
