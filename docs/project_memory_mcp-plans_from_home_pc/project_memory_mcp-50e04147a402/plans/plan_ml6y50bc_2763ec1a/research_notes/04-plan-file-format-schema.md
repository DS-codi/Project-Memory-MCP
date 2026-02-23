---
plan_id: plan_ml6y50bc_2763ec1a
created_at: 2026-02-03T18:46:37.309Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Plan File Format & Schema Research

## Plan Storage Structure

```
data/{workspace_id}/plans/{plan_id}/
├── state.json          # Full plan state (authoritative source)
├── plan.md             # Human-readable view (regenerated on changes)
├── original_request.json  # Initial user request
├── research_notes/     # Research markdown files
└── {type}.json         # Context files (analysis.json, research.json, etc.)
```

## state.json Schema (PlanState Interface)

```typescript
interface PlanState {
  id: string;                    // "plan_ml57j88i_f2b0dbce"
  workspace_id: string;          // "Project-Memory-MCP-652c624f8f59"
  title: string;                 // Plan title
  description: string;           // Plan description
  priority: PlanPriority;        // "low" | "medium" | "high" | "critical"
  status: PlanStatus;            // "active" | "paused" | "completed" | "archived" | "failed"
  category: RequestCategory;     // "feature" | "bug" | "change" | etc.
  categorization?: RequestCategorization;  // Full categorization details
  current_phase: string;         // Current phase name
  current_agent: AgentType | null;  // Currently deployed agent
  recommended_next_agent?: AgentType;  // Suggested next agent
  pending_notes?: PlanNote[];    // Notes for next agent (auto-cleared)
  created_at: string;            // ISO timestamp
  updated_at: string;            // ISO timestamp
  agent_sessions: AgentSession[]; // All agent sessions
  lineage: LineageEntry[];       // Handoff history
  steps: PlanStep[];             // All plan steps
}
```

## Backwards Compatibility Patterns Found

### 1. Optional Fields with Defaults
```typescript
// In Zod schema
status: StepStatusSchema.optional().default('pending')
```

### 2. Optional Interface Properties
```typescript
notes?: string;        // Optional in interface
completed_at?: string; // Only set when done
```

### 3. Graceful Null Handling
```typescript
current_agent: AgentType | null  // Explicitly nullable
```

### 4. Version-less Schema
- No `schema_version` field exists
- Changes must be backwards compatible
- Old plans without new fields must work

## Recommended Pattern for Step Types

Following existing patterns:
```typescript
export type StepType = 
  | 'standard'           // Default for existing plans
  | 'validation'         // Requires user confirmation
  | 'critical'           // Must not be skipped
  | 'analysis'           // Analysis/research step
  | 'build'              // Build/compile step
  | 'test'               // Testing step
  | 'refactor'           // Refactoring step
  | 'archive'            // Archival/documentation step
  | 'fix'                // Bug fix step
  | 'confirmation';      // Requires immediate validation

export interface PlanStep {
  index: number;
  phase: string;
  task: string;
  status: StepStatus;
  notes?: string;
  completed_at?: string;
  // NEW FIELDS (optional for backwards compat)
  type?: StepType;           // Defaults to 'standard' if missing
  requires_validation?: boolean;  // Step needs user approval
  assignee?: string;         // Already in schema, add to interface
}
```

## Reading Old Plans (Backwards Compat)

When reading a step without type:
```typescript
const stepType = step.type ?? 'standard';
const needsValidation = step.requires_validation ?? 
  (stepType === 'validation' || stepType === 'confirmation');
```
