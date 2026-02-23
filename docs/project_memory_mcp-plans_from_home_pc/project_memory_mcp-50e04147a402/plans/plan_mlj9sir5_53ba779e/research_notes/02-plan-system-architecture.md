---
plan_id: plan_mlj9sir5_53ba779e
created_at: 2026-02-12T09:46:10.620Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Research Area 2: Plan System Architecture (for Integrated Programs)

## Current Plan Data Model

### PlanState (server/src/types/index.ts)
```
PlanState {
  id: string                        // e.g., "plan_mlj9sir5_53ba779e"
  workspace_id: string              // e.g., "project-memory-mcp-40f6678f5a9b"
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'active' | 'paused' | 'completed' | 'archived' | 'failed'
  category: RequestCategory         // 'feature', 'bug', 'change', 'analysis', etc.
  categorization?: RequestCategorization
  current_phase: string
  current_agent: AgentType | null
  recommended_next_agent?: AgentType
  deployment_context?: { deployed_agent, deployed_by, reason, override_validation, deployed_at }
  pending_notes?: PlanNote[]
  confirmation_state?: ConfirmationState
  goals?: string[]
  success_criteria?: string[]
  build_scripts?: BuildScript[]
  created_at: string
  updated_at: string
  agent_sessions: AgentSession[]
  lineage: LineageEntry[]
  steps: PlanStep[]
}
```

### PlanStep
```
PlanStep {
  index: number
  phase: string
  task: string
  status: 'pending' | 'active' | 'done' | 'blocked'
  type?: StepType  // 15 types: standard, analysis, validation, user_validation, complex, critical, build, fix, refactor, confirmation, research, planning, code, test, documentation
  requires_validation?: boolean
  requires_confirmation?: boolean
  requires_user_confirmation?: boolean
  assignee?: string
  notes?: string
  completed_at?: string
  depends_on?: number[]
}
```

### Plan Storage Format
- Plans stored at: `data/{workspace_id}/plans/{plan_id}/`
- Each plan directory contains:
  - `state.json` — Full PlanState object
  - `plan.md` — Human-readable markdown generated from state
  - `original_request.json` — Captured initial user request
  - `research_notes/` — Research documents (markdown files)
  - `logs/` — Tool call logs
  - Various context files: `{type}.json` (e.g., audit.json, architecture.json)

### Workspace-Plan Relationship
- `workspace-registry.json` at data root maps workspace paths to IDs
- `workspace.meta.json` stored per workspace: tracks `active_plans: string[]` and `archived_plans: string[]`
- Plans are flat — NO hierarchy, NO parent-child relationships
- Each workspace has its own `plans/` directory with plan subdirectories
- Archived plans moved to `plans/_archived/` directory

### Plan Templates
- Plan tools support `create_from_template` action
- Available templates: feature, bugfix, refactor, documentation, analysis, investigation

### Confirmation System
- `ConfirmationState` tracks confirmed phases and steps
- High-risk steps auto-detected and require confirmation
- `memory_plan(action: confirm)` to confirm phase/step

## What Would Need to Change for Integrated Programs

### Current Gaps
1. **No plan hierarchy** — plans are completely flat within a workspace
2. **No parent_plan_id field** on PlanState
3. **No "program" or "container" concept** in types
4. **No mechanism to upgrade a plan to a container**
5. **No cross-plan dependency tracking**
6. **No aggregate progress tracking across multiple plans**

### Key Touch Points
- `PlanState` type needs new fields: `parent_program_id`, `is_program`, `child_plan_ids`
- `WorkspaceMeta` needs `active_programs` tracking
- `plan.tools.ts` (2275 lines — already large!) needs program CRUD actions
- `memory_plan.ts` consolidated tool needs new actions
- `file-store.ts` path helpers need program awareness
- Dashboard needs program views
- Coordinator agent needs program-aware workflow logic
- Architect agent needs to decide on program creation