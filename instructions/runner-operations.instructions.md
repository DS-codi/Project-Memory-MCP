---
applyTo: "agents/runner.agent.md"
---

# Runner Operations

> **Source:** Extracted verbatim from `agents/runner.agent.md` — this is the canonical location for these sections.

## 🔄 INTERMITTENT LOGGING

Unlike other agents that track every action, you log **intermittently**:

### Log These Events:
- ✅ Major discoveries or insights
- ✅ Significant code changes made
- ✅ Decisions that might matter later
- ✅ Errors encountered and how you resolved them
- ✅ When you're about to pause or need context preserved

### Skip Logging For:
- ❌ Reading files to understand code
- ❌ Minor formatting or typo fixes
- ❌ Failed attempts that didn't lead anywhere
- ❌ Obvious intermediate steps

### Example Logging Cadence

```
Task: "Fix the login button styling"

[Start] - No logging, just start working
[Read files] - No logging
[Find the issue] - No logging  
[Fix CSS] - No logging, it's simple
[Test it works] - Maybe log if you discovered something interesting
[Done] - Maybe log final summary if it took >5 min or had insights
```

---

## 📦 WORKSPACE CONTEXT POPULATION (User Says "Populate Context")

If the user says **"populate context"**, **"refresh context"**, **"scan the codebase"**, or **"update workspace context"**:

Deploy **Researcher** to scan the codebase and populate/refresh workspace context:

```javascript
// 1. Register workspace if needed
workspace (action: register) with workspace_path: currentWorkspacePath

// 2. Deploy Researcher to scan the codebase
runSubagent({
  agentName: "Researcher",
  prompt: `Workspace: {workspace_id} | Path: {workspace_path}

TASK: Scan this codebase and populate the workspace context.

Read the codebase to understand:
- Project overview, tech stack, purpose
- Architecture, folder structure, key modules
- Conventions (naming, error handling, testing)
- Key directories and their purposes
- Dependencies and their roles

Then call memory_context(action: workspace_set) with workspace_id: "{workspace_id}"
and populate sections: overview, architecture, conventions, key_directories, dependencies.

This is a context-population task — do NOT create plan steps.

You are a spoke agent. Do NOT call runSubagent.
Use memory_agent(action: handoff) to recommend the next agent back to the Runner.`,
  description: "Populate workspace context"
})
```

---

## 🚀 STARTUP: LIGHTWEIGHT INITIALIZATION

When you start, do a **quick context check** (not mandatory MCP init):

```javascript
// Optional: Check if workspace has relevant context
workspace (action: info) with workspace_id: "..."

// If there's an active plan related to your task, you might reference it
// If not, just start working
```

### You Do NOT Need To:
- Call `memory_agent` (action: init) - you're not in the formal workflow
- Call `memory_agent` (action: validate) - there's no plan to validate against
- Wait for handoff from Coordinator - you can start directly

---

## 🔀 ESCALATION: WHEN TASKS GET BIG

If a task becomes complex enough to need formal planning:

### Signs You Should Escalate:
- Task reaches **10+ steps** (upgrade from todo list to full MCP plan)
- Task has 5+ distinct phases across multiple modules
- Needs review, testing, or multiple iterations by other agents
- Could affect other parts of the system significantly
- User would benefit from persistent structured progress tracking

### How to Escalate:

**Option 1: Hand off to Coordinator**
```
"This task has grown into a multi-phase effort. Let me hand this off to 
the Coordinator to create a proper plan with review and testing phases."

// Then use the handoff button or @Coordinator
```

**Option 2: Create plan yourself and continue**
```javascript
// 1. Create a proper plan with phases
plan (action: create) with
  workspace_id: "...",
  title: "Refactor authentication module",
  description: "Originally a quick fix, grew into full refactor",
  category: "refactor",
  priority: "high"

// 2. Add structured steps
steps (action: add) with
  workspace_id: "...",
  plan_id: "...",
  steps: [
    { phase: "Phase 1: Analysis", task: "Document current auth flow", status: "done" },
    { phase: "Phase 1: Analysis", task: "Identify all consumers", status: "done" },
    { phase: "Phase 2: Refactor", task: "Create new auth service", status: "not-started" },
    // ... more steps
  ]

// 3. Hand off to Coordinator for proper orchestration
"I've created a plan for this refactor. Handing off to Coordinator 
to manage the implementation with proper review and testing."
```

---

## 📄 SAVING CONTEXT ON COMPLETION (MANDATORY)

**Always save a workspace context file when completing a task**, unless the task resulted in creating a full MCP plan (which already persists context).

This ensures every Runner session leaves a trace for future agents and sessions.

### When to Save:
- ✅ **Always** — after completing any task (todo-list or no-tracking tasks)
- ❌ **Skip only** when a full MCP `memory_plan` was created for this task (the plan itself serves as the record)

### How to Save:

```javascript
// MANDATORY on completion (unless a full MCP plan was created)
context (action: workspace_update) with
  workspace_id: "...",
  data: {
    last_runner_session: {
      date: "2026-02-11",
      task: "Fixed authentication timeout issue",
      summary: "Brief description of what was done and why",
      changes: ["src/auth/jwt.ts", "src/config/auth.ts"],
      key_insights: ["The timeout was caused by clock skew, not token expiry"],
      related_files: ["src/middleware/auth.ts"]
    }
  }
```

For tasks with significant findings, also append research notes:

```javascript
context (action: append_research) with
  workspace_id: "...",
  plan_id: "runner-session",
  filename: "auth-debugging.md",
  content: "## JWT Timeout Investigation\n\nFound that clock skew between services was causing false token expiry..."
```

### Decision Flow at Completion:

```
Task complete?
  ├─ Did I create a full MCP plan? → SKIP context save (plan is the record)
  └─ No MCP plan created?
       └─ SAVE workspace context via memory_context(action: workspace_update)
```

---

## Dynamic Prompt Creation

As a hub agent, you can create **plan-specific `.prompt.md` files** via the `write_prompt` action on `memory_context` when a quick task escalates into a complex multi-step workflow.

### When to Create Dynamic Prompts

- Task grows beyond a simple fix into multi-file changes
- You need to spawn subagents with detailed scope boundaries
- The same investigation pattern may repeat

### How to Create a Prompt

```javascript
memory_context(action: "write_prompt", {
  workspace_id: "...",
  plan_id: "...",
  prompt_title: "Quick Fix Escalation",
  prompt_agent: "executor",
  prompt_description: "Fix that grew into refactor",
  prompt_sections: [
    { title: "Original Issue", content: "..." },
    { title: "Scope", content: "Files: {{scopeFiles}}" }
  ],
  prompt_variables: ["scopeFiles"],
  created_by_agent: "Runner"
})
```
