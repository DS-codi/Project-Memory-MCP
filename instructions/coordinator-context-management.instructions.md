---
applyTo: "agents/coordinator.agent.md"
---

# Coordinator Context Management

Knowledge files, instruction file generation, goals & success criteria tracking, and dynamic prompt creation for the Coordinator agent.

---

## 🎯 TRACKING GOALS & SUCCESS CRITERIA

Plans can have **goals** (high-level objectives) and **success_criteria** (measurable outcomes).

### After Each Phase Completion

When a phase completes, check progress against goals:

```javascript
// Get plan state after each phase
const state = plan (action: get) with workspace_id, plan_id

// Review goals and success_criteria
if (state.goals && state.goals.length > 0) {
    console.log("Plan Goals:", state.goals)
    // Evaluate: Are we on track?
}

if (state.success_criteria && state.success_criteria.length > 0) {
    console.log("Success Criteria:", state.success_criteria)
    // Check: Which criteria are now met?
}

// Report to user periodically
"📊 Phase 2 Complete - Progress Check:
 Goals: 2/3 addressed
 ✅ Dark mode implemented
 ✅ Theme toggle added
 ⏳ Settings persistence (Phase 3)
 
 Success Criteria:
 ✅ Theme works with system preference
 ⏳ Theme persists across sessions (needs testing)"
```

### Setting Goals (via Architect)

Goals and success_criteria are typically set when the plan is created or updated by the Architect using `memory_plan` (action: set_goals):

```javascript
// Architect sets goals after designing the plan
plan (action: set_goals) with
  workspace_id: "...",
  plan_id: "...",
  goals: ["Implement feature X", "Refactor module Y"],
  success_criteria: ["All tests pass", "No performance regression", "Documentation updated"]
```

---

## 📄 GENERATING INSTRUCTION FILES FOR SUBAGENTS

Before spawning a subagent, you can generate a **workspace-local instruction file** that provides additional context beyond the prompt. This is useful for:

- Complex tasks that need detailed context
- Multi-step implementations that span sessions
- Passing file references and constraints

**Default practice:** Before each subagent run, deploy the standard guidance from instructions/avoid-monolithic-files.instructions.md and include a target path (directory or specific file) in the instruction context.

### How to Generate Instructions

```javascript
// Before spawning Executor, generate detailed instructions
context (action: generate_instructions) with
  workspace_id: "...",
  plan_id: "...",
  target_agent: "Executor",
  mission: "Implement the authentication module for Phase 2",
  context: "This workspace uses Express.js with JWT tokens. The user model exists at src/models/user.ts.",
  constraints: [
    "Must maintain backward compatibility with existing API",
    "Use existing bcrypt setup for password hashing",
    "Follow error handling patterns from src/middleware/errorHandler.ts"
  ],
  deliverables: [
    "src/routes/auth.ts - Auth routes",
    "src/controllers/authController.ts - Auth logic",
    "src/middleware/authMiddleware.ts - JWT validation"
  ],
  files_to_read: [
    "src/models/user.ts",
    "src/middleware/errorHandler.ts",
    "src/config/jwt.ts"
  ]

// Response includes the path where instruction file was written:
// → .memory/instructions/executor-{timestamp}.md
```

### Instruction File Location

Instruction files are written to:
```
{workspace}/.memory/instructions/{agent}-{timestamp}.md
```

### When Subagents Initialize

When a subagent calls `memory_agent` (action: init), it automatically receives any matching instruction files:

```javascript
// Subagent receives in init response:
{
  "instruction_files": [
    {
      "path": ".memory/instructions/executor-2026-02-04T08-00-00.md",
      "target_agent": "Executor",
      "mission": "Implement the authentication module for Phase 2",
      "constraints": [...],
      "deliverables": [...],
      "files_to_read": [...]
    }
  ]
}
```

### Best Practices

1. **Generate before spawning**: Create instruction file, then spawn the subagent
2. **Be specific**: Include file paths, patterns to follow, and constraints
3. **Include context**: Reference existing code patterns the agent should follow
4. **List deliverables**: Make it clear what files should be created/modified

---

## 📚 USING WORKSPACE KNOWLEDGE FILES

Workspace knowledge files are persistent, named documents that store institutional memory across plans. They are stored at `/data/{workspace_id}/knowledge/{slug}.json` and managed via `memory_context` actions: `knowledge_store`, `knowledge_get`, `knowledge_list`, `knowledge_delete`.

### What Are Knowledge Files?

Knowledge files capture reusable project information that outlives any single plan:

| Category | Examples | Created By |
|----------|----------|------------|
| `plan-summary` | What a completed plan achieved, decisions made | Archivist (after archiving) |
| `schema` | Database tables, API contracts, data models | Archivist or Executor |
| `convention` | Error handling patterns, naming rules, testing practices | Archivist |
| `limitation` | Rate limits, vendor constraints, known issues | Archivist or Researcher |
| `config` | Environment setup, deployment details, build config | Archivist or Executor |
| `reference` | External docs, architecture decisions, design rationale | Archivist or Researcher |

### Checking Available Knowledge at Init

When you call `memory_agent` (action: init) with `include_workspace_context: true`, the response includes a `knowledge_files` array:

```javascript
// In init response → workspace_context_summary:
{
  "knowledge_files": [
    { "slug": "schema-users-table", "title": "Users Table Schema", "category": "schema", "updated_at": "..." },
    { "slug": "convention-error-handling", "title": "Error Handling Patterns", "category": "convention", "updated_at": "..." },
    { "slug": "plan-summary-plan_abc123", "title": "Plan: Add Auth Module", "category": "plan-summary", "updated_at": "..." }
  ],
  "stale_knowledge_files": ["limitation-old-vendor-api"]  // 60+ days old
}
```

### Directing Subagents to Knowledge Files

**Before spawning a subagent**, review the available knowledge files and include relevant slugs in the subagent prompt or instruction file. This is how institutional memory flows to the right agent at the right time.

**When generating instruction files** (via `memory_context` action: `generate_instructions`), include relevant knowledge file slugs in the `files_to_read` or `constraints` fields:

```javascript
context (action: generate_instructions) with
  workspace_id: "...",
  plan_id: "...",
  target_agent: "Executor",
  mission: "Add user profile endpoints",
  constraints: [
    "Read knowledge file 'schema-users-table' for the current database schema",
    "Follow patterns in knowledge file 'convention-error-handling'",
    "Be aware of limitations in 'limitation-vendor-api-rate-limit'"
  ],
  files_to_read: [
    "knowledge:schema-users-table",
    "knowledge:convention-error-handling"
  ]
```

**When spawning subagents directly**, mention relevant knowledge files in the prompt:

```
Before implementing, read these knowledge files for context:
- `memory_context` (action: knowledge_get, slug: "schema-users-table") — current DB schema
- `memory_context` (action: knowledge_get, slug: "convention-error-handling") — error handling patterns

These contain project-specific context from previous plans.
```

### When to Direct Agents to Knowledge Files

| Scenario | Knowledge to Reference |
|----------|----------------------|
| Implementing database changes | `schema-*` files for current table structures |
| Adding new API endpoints | `convention-*` files for patterns, `schema-*` for data models |
| Investigating bugs | `limitation-*` files for known constraints, `plan-summary-*` for recent changes |
| Researching before design | `plan-summary-*` files for what's been tried before |
| Setting up environments | `config-*` files for deployment/build details |

### Refreshing Stale Knowledge

If `stale_knowledge_files` appears in the init response, consider directing the Archivist or Researcher to review and update those files during the next relevant plan.

---

## Dynamic Prompt Creation

As a hub agent, you can create **plan-specific `.prompt.md` files** via the `write_prompt` action on `memory_context`. Dynamic prompts give subagents detailed, structured instructions that go beyond inline handoff text.

### When to Create Dynamic Prompts

| Use Dynamic Prompt | Use Inline Instructions |
|---|---|
| Task requires >500 words of instructions | Simple, one-shot task |
| Complex scope boundaries needed | Straightforward file modifications |
| Task may need revision/retry (prompt persists) | Context is agent-specific |
| Multiple subagents share the same context | Single subagent, single step |
| Repeatable pattern across plans | Unique one-time task |

### How to Create a Prompt

```javascript
memory_context(action: "write_prompt", {
  workspace_id: "...",
  plan_id: "...",
  prompt_title: "Auth Middleware Implementation",
  prompt_agent: "executor",
  prompt_description: "Implement JWT middleware for auth module",
  prompt_sections: [
    { title: "Context", content: "The Architect designed..." },
    { title: "Files to Modify", content: "{{affectedFiles}}" },
    { title: "Constraints", content: "Must validate JWT tokens..." }
  ],
  prompt_variables: ["affectedFiles", "architectureContext"],
  prompt_phase: "Phase 2: Implementation",
  prompt_step_indices: [5, 6, 7],
  created_by_agent: "Coordinator",
  tags: ["auth", "middleware"]
})
```

The prompt is stored at `data/{workspace_id}/plans/{plan_id}/prompts/` and can be referenced when spawning subagents.

### Prompt Versioning

Prompts use semantic versioning. When updating an existing prompt (e.g., after Reviewer feedback), pass `prompt_version: "2.0.0"` and the same `prompt_slug` to create an updated version. Staleness detection flags prompts older than the current plan state.
