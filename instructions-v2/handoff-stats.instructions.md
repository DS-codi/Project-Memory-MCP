---
applyTo: "**/*"
---

# Handoff Stats — Instrumentation Reference

This document describes the session-level instrumentation system for tracking agent performance metrics, incident reports, and difficulty profiles.

---

## HandoffStats Interface

Metrics auto-collected by the MCP server during each agent session:

| Metric | Type | Description |
|--------|------|-------------|
| `steps_completed` | `number` | Steps marked `done` during this session |
| `steps_attempted` | `number` | Steps marked `active` (attempted) during this session |
| `files_read` | `number` | File read operations performed |
| `files_modified` | `number` | File write/modify operations performed |
| `tool_call_count` | `number` | Total MCP tool calls made |
| `tool_retries` | `number` | Tool calls that failed and were retried |
| `blockers_hit` | `number` | Steps that reached `blocked` status |
| `scope_escalations` | `number` | Scope escalation events |
| `unsolicited_context_reads` | `number` | Context reads not in the initial context bundle |
| `duration_category` | `'quick' \| 'moderate' \| 'extended'` | Session duration classification |

### Duration Category Thresholds

| Category | Wall-Clock Time |
|----------|----------------|
| `quick` | < 2 minutes |
| `moderate` | 2–10 minutes |
| `extended` | > 10 minutes |

---

## Agent Self-Reporting

Agents **should** include `handoff_stats` in their `memory_agent(action: handoff)` data payload. This allows the MCP to cross-validate agent-reported metrics against its own tracking.

### Example Handoff Payload with Stats

```json
{
  "action": "handoff",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "from_agent": "Executor",
  "to_agent": "Coordinator",
  "reason": "Phase 2 complete, ready for review",
  "data": {
    "recommendation": "Reviewer",
    "steps_completed": 3,
    "files_modified": ["src/auth/login.ts", "src/auth/logout.ts"],
    "handoff_stats": {
      "steps_completed": 3,
      "steps_attempted": 3,
      "files_read": 8,
      "files_modified": 2,
      "tool_call_count": 24,
      "tool_retries": 1,
      "blockers_hit": 0,
      "scope_escalations": 0,
      "unsolicited_context_reads": 2,
      "duration_category": "moderate"
    }
  }
}
```

### Self-Reporting Rules

- Self-reporting is **optional but recommended** — the MCP tracks stats regardless
- Agents track their own counts as running totals during the session
- Include the `handoff_stats` object in the `data` field of the `handoff` action
- Agent-reported stats are stored temporarily on the session for validation at `complete` time

---

## MCP Auto-Collection

The MCP server automatically tracks metrics for every session without any agent action required.

### What Gets Tracked Automatically

| Metric | Collection Method |
|--------|-------------------|
| `steps_completed` | Incremented when `memory_steps(action: update, status: 'done')` is called |
| `steps_attempted` | Incremented when `memory_steps(action: update, status: 'active')` is called |
| `files_read` | Incremented on `memory_filesystem(action: read)` calls |
| `files_modified` | Incremented on `memory_filesystem(action: write)` calls |
| `tool_call_count` | Incremented on every MCP tool invocation for the session |
| `tool_retries` | Incremented when a tool call fails and is retried |
| `blockers_hit` | Incremented when `memory_steps(action: update, status: 'blocked')` is called |
| `scope_escalations` | Incremented on scope escalation events |
| `unsolicited_context_reads` | Incremented when a context read targets a file not in the initial context bundle |
| `duration_category` | Computed at session finalization from wall-clock elapsed time |

### Lifecycle

1. **Session init** — `initSessionStats(sessionId)` creates zeroed counters in memory
2. **During session** — `incrementStat(sessionId, metric)` is called by tool handlers
3. **Session complete** — `finalizeSessionStats(sessionId)` computes `duration_category`, returns the `HandoffStats` snapshot, and removes the in-memory entry
4. The finalized stats are stored on `session.handoff_stats` in the plan state

### Unsolicited Context Reads

A context read is classified as "unsolicited" when the file being read was **not** included in the agent's initial context bundle (instruction files, context bundle files provided at init time). This metric helps identify when agents need more upfront context.

---

## Stats Validation

When an agent self-reports stats in `handoff` and the MCP has auto-tracked stats, the system runs a comparison at `complete` time.

### Validation Process

1. Agent calls `memory_agent(action: handoff)` with `data.handoff_stats`
2. MCP stores the agent-reported stats on the session as `agent_reported_stats`
3. Agent calls `memory_agent(action: complete)`
4. MCP finalizes its own tracked stats via `finalizeSessionStats()`
5. MCP calls `validateStats(mcpTracked, agentReported)` to compare
6. Result is stored on `session.stats_validation`

### StatsValidationResult

```typescript
interface StatsValidationResult {
  matches: boolean;              // true if all metrics match
  discrepancies: StatsDiscrepancy[];  // list of mismatches
  mcp_tracked: HandoffStats;    // what the MCP recorded
  agent_reported: HandoffStats; // what the agent claimed
}

interface StatsDiscrepancy {
  metric: string;   // e.g. "files_read"
  expected: number;  // MCP-tracked value
  actual: number;    // agent-reported value
}
```

### Compared Metrics

All numeric fields are compared: `steps_completed`, `steps_attempted`, `files_read`, `files_modified`, `tool_call_count`, `tool_retries`, `blockers_hit`, `scope_escalations`, `unsolicited_context_reads`.

`duration_category` is not compared (MCP always uses its own computation).

### On Discrepancy

- Discrepancies are logged as warnings to the console
- The `stats_validation` result is persisted on the session for later review
- The MCP-tracked values are treated as authoritative

---

## Incident Report Format

Incident reports are **auto-generated** when a Revisionist session completes. The agent does not need to create them manually.

### IncidentReport Schema

```typescript
interface IncidentReport {
  plan_id: string;
  session_id: string;
  agent_type: string;             // Always "Revisionist"
  timestamp: string;              // ISO 8601
  trigger_reason: string;         // From session context
  root_cause_analysis: string;    // From blocked steps + context
  blocked_steps: string[];        // "Step N: task — notes"
  resolution_actions: string[];   // From session summary
  stats_snapshot: HandoffStats;   // Session metrics at report time
  recommendations: string[];     // Auto-generated from thresholds
}
```

### Generation Trigger

The report is generated inside `completeAgent()` when `agent_type === 'Revisionist'`. It is stored as `memory_context(type: 'incident_report')` and `'incident_report'` is appended to the session's `artifacts` array.

### Recommendation Thresholds

| Condition | Recommendation |
|-----------|---------------|
| `tool_retries > 5` | "Tool instruction gap — review tool documentation for common failure patterns" |
| `unsolicited_context_reads > 3` | "Context packaging improvement needed — expand instruction file bundle" |
| `blockers_hit > 2` | "Step decomposition needed — break complex steps into smaller units" |
| `scope_escalations > 0` | "Scope boundary review — adjust allowed files/directories" |

---

## Difficulty Profile Schema

Difficulty profiles are **auto-generated** when the Archivist archives a plan. They are stored as workspace knowledge for future reference.

### DifficultyProfile Schema

```typescript
interface DifficultyProfile {
  plan_id: string;
  total_sessions: number;
  aggregated_stats: HandoffStats;   // Sum across all sessions
  complexity_score: number;         // Weighted, normalized by session count
  common_blockers: string[];        // From blocked step notes
  skill_gaps_identified: string[];  // From metric patterns
  created_at: string;               // ISO 8601
}
```

### Complexity Score Formula

```
raw = (blockers_hit × 3) + (scope_escalations × 2) + (tool_retries × 1)
complexity_score = raw / session_count
```

### Storage

- **Slug:** `difficulty-profile-{planId}`
- **Category:** `difficulty-profile`
- **Tags:** `["metrics", "plan-analysis"]`
- **Created by agent:** `Archivist`

### Querying

```json
memory_context(action: "knowledge_list", workspace_id: "...", category: "difficulty-profile")
```

### Skill Gap Detection Criteria

| Pattern | Threshold | Gap Description |
|---------|-----------|-----------------|
| High unsolicited reads | Avg > 5 per session | Initial context bundles insufficient |
| Multiple blocker patterns | ≥ 2 distinct patterns | Domain knowledge or tooling gaps |
| High tool retry rate | > 10% of total calls | Error handling pattern improvements needed |
| Any scope escalations | > 0 total | Task decomposition refinement needed |

---

## Type Exports

All types are exported from the barrel at `server/src/types/index.ts`:

- `HandoffStats`
- `StatsDiscrepancy`
- `StatsValidationResult`
- `IncidentReport`
- `DifficultyProfile`

---

*This document is part of the Project Memory MCP system reference.*
