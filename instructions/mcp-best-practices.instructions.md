---
applyTo: "**/*"
---

# MCP Best Practices, Anti-Patterns & Tips

> Extracted from [project-memory-system.instructions.md](./project-memory-system.instructions.md)
>
> Workflow examples have been moved to [mcp-workflow-examples.instructions.md](./mcp-workflow-examples.instructions.md).

## Best Practices

### 1. Always Initialize and Validate

```json
// ALWAYS do this first
{ "action": "init", "agent_type": "Executor", ... }
{ "action": "validate", "agent_type": "Executor", ... }
```

### 2. Update Steps Atomically

Mark a step `active` before starting, `done` or `blocked` when finished.

```json
// Before starting work
{ "action": "update", "step_index": 3, "status": "active" }

// After completing
{ "action": "update", "step_index": 3, "status": "done", "notes": "Completed successfully" }
```

### 3. Handoff Through Coordinator

Subagents should ALWAYS hand off to Coordinator with a recommendation:

```json
{
  "action": "handoff",
  "from_agent": "Executor",
  "to_agent": "Coordinator",  // Not directly to Reviewer!
  "reason": "Phase complete",
  "data": { "recommendation": "Reviewer" }
}
```

### 4. Use Goals and Success Criteria

Architect should always set goals:

```json
{
  "action": "set_goals",
  "goals": ["Implement feature X", "Add tests", "Document API"],
  "success_criteria": ["All tests pass", "No regressions", "API docs updated"]
}
```

Reviewer should check them:

```json
// Get plan to see goals
{ "action": "get", "workspace_id": "...", "plan_id": "..." }
// Response includes goals and success_criteria
```

### 5. Generate Instructions for Complex Handoffs

Coordinator should generate instruction files for subagents:

```json
{
  "action": "generate_instructions",
  "target_agent": "Executor",
  "mission": "Implement login/logout endpoints",
  "context": ["Express.js API", "PostgreSQL with Prisma"],
  "files_to_read": ["src/server.ts", "prisma/schema.prisma"]
}
```

### 6. Document Your Work

Store execution logs and research:

```json
// Executor logs work
{
  "action": "store",
  "type": "execution_log",
  "data": { "files_created": [...], "commands_run": [...] }
}

// Researcher documents findings
{
  "action": "append_research",
  "filename": "codebase-analysis.md",
  "content": "## Findings\n\n..."
}
```

---

## Anti-Patterns to Avoid

### ❌ Don't Skip Initialization

```json
// BAD - Starting work without init
{ "action": "update", "step_index": 0, "status": "active" }

// GOOD - Always init first
{ "action": "init", "agent_type": "Executor", ... }
{ "action": "validate", "agent_type": "Executor", ... }
{ "action": "update", "step_index": 0, "status": "active" }
```

### ❌ Don't Handoff Directly Between Subagents

```json
// BAD - Direct handoff between subagents
{
  "action": "handoff",
  "from_agent": "Executor",
  "to_agent": "Tester"  // ❌ Wrong!
}

// GOOD - Always go through Coordinator
{
  "action": "handoff",
  "from_agent": "Executor",
  "to_agent": "Coordinator",
  "data": { "recommendation": "Tester" }
}
```

### ❌ Don't Forget to Complete Sessions

```json
// BAD - Handoff without complete
{ "action": "handoff", ... }
// Session ends without complete

// GOOD - Always complete after handoff
{ "action": "handoff", ... }
{ "action": "complete", "summary": "Finished Phase 2", ... }
```

### ❌ Don't Modify Steps Without Updating Status

```json
// BAD - Just making changes without tracking
// (Agent modifies files but doesn't update step status)

// GOOD - Always update step status
{ "action": "update", "step_index": 3, "status": "active" }
// ... do the work ...
{ "action": "update", "step_index": 3, "status": "done", "notes": "Implemented feature" }
```

### ❌ Don't Create Plans Without Goals

```json
// BAD - Plan without goals
{
  "action": "create",
  "title": "Add feature",
  "description": "Add new feature",
  "category": "feature"
  // No goals or success_criteria!
}

// GOOD - Include goals
{
  "action": "create",
  "title": "Add feature",
  "description": "Add new feature",
  "category": "feature",
  "goals": ["Users can do X", "System handles Y"],
  "success_criteria": ["Tests pass", "No performance regression"]
}
```

---

## Tips by Agent Role

### Coordinator

- **First action:** Register workspace if new, or get workspace info
- **Create plans with goals:** Always include goals and success_criteria
- **Generate instructions:** Use `generate_instructions` before complex handoffs
- **Track progress:** Check plan state after each subagent completes
- **Handle blockers:** Route to Revisionist when subagents report issues

### Researcher

- **Document everything:** Use `append_research` liberally
- **Structure findings:** Use markdown with headers and lists
- **Note dependencies:** Identify and document external dependencies
- **Be thorough:** Read all relevant files before concluding

### Architect

- **Design before steps:** Think through the solution before adding steps
- **Set goals early:** Use `set_goals` after creating the plan structure
- **Assign appropriately:** Match step complexity to agent capabilities
- **Phase logically:** Group related steps into phases

### Executor

- **One step at a time:** Complete each step fully before moving on
- **Update frequently:** Mark steps active when starting, done when complete
- **Document blockers:** Use detailed notes when marking steps blocked
- **Log your work:** Store execution logs for future reference

### Reviewer

- **Build verification:** Run build scripts and verify compilation before code review
- **Check goals:** Compare work against defined success criteria
- **Be constructive:** Note issues clearly with suggested fixes
- **Approve or block:** Make clear decisions, don't leave things ambiguous
- **Register scripts:** Add reusable build scripts early
- **Test commands:** Verify scripts work before marking steps done
- **Clean up:** Delete obsolete scripts when work is complete

### Tester

- **Cover edge cases:** Don't just test happy paths
- **Document failures:** Provide detailed notes when tests fail
- **Verify fixes:** Re-run tests after Revisionist fixes issues

### Revisionist

- **Understand first:** Read the blocked step notes carefully
- **Fix minimally:** Make targeted fixes, don't over-engineer
- **Verify fix:** Ensure the original step can now proceed

### Archivist

- **Document completely:** Capture all relevant information before archiving
- **Reindex workspace:** Update the codebase profile after major changes
- **Preserve history:** Don't delete context or research prematurely

### Analyst

- **Focus on understanding:** Analyze before recommending action
- **Use research notes:** Document analysis in research files
- **Be specific:** Provide concrete recommendations, not vague suggestions

### Brainstorm

- **Generate options:** Provide multiple approaches, not just one
- **Consider tradeoffs:** Document pros and cons of each option
- **Be creative:** Don't limit yourself to obvious solutions

### SkillWriter

- **Analyze thoroughly:** Read all relevant source files, configs, and patterns before generating skills
- **Follow SKILL.md format:** Use structured frontmatter with category, tags, language_targets, framework_targets
- **Focus on patterns:** Capture reusable conventions not obvious implementation details
- **Don't modify source code:** Only create or update `.github/skills/*/SKILL.md` files

### Worker

- **Stay in scope:** Only modify files explicitly listed in your deployment prompt
- **No plan changes:** Never create, modify, or delete plan steps or plans
- **Report and return:** Complete your task, handoff to hub, and complete your session
- **Lightweight:** Workers are for focused sub-tasks, not broad implementation work

---

## Appendix: Type Reference

### StepStatus

```typescript
type StepStatus = 'pending' | 'active' | 'done' | 'blocked';
```

### StepType

```typescript
type StepType = 
  | 'standard' 
  | 'analysis' 
  | 'validation' 
  | 'user_validation' 
  | 'complex' 
  | 'critical' 
  | 'build' 
  | 'fix' 
  | 'refactor' 
  | 'confirmation'
  | 'research'
  | 'planning'
  | 'code'
  | 'test'
  | 'documentation';
```

### RequestCategory

```typescript
type RequestCategory = 
  | 'feature' 
  | 'bug' 
  | 'change' 
  | 'analysis' 
  | 'investigation'
  | 'debug' 
  | 'refactor' 
  | 'documentation';
```

### AgentType

```typescript
type AgentType = 
  | 'Coordinator' 
  | 'Researcher' 
  | 'Architect' 
  | 'Executor' 
  | 'Reviewer' 
  | 'Tester' 
  | 'Revisionist' 
  | 'Archivist'
  | 'Analyst'
  | 'Brainstorm'
  | 'Runner'
  | 'SkillWriter'
  | 'Worker';
```

### Priority

```typescript
type Priority = 'low' | 'medium' | 'high' | 'critical';
```

---

*This document is part of the Project Memory MCP system reference. See [project-memory-system.instructions.md](./project-memory-system.instructions.md) for the overview and tool index.*
