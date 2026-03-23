---
applyTo: "agents/hub.agent.md"
---

# Hub Agent — Supplemental MCP Reference

This file supplements `hub.agent.md` with quick-reference patterns for Hub's orchestration responsibilities. Hub's primary instructions (startup protocol, routing contract, spawn protocol, workflow modes) are defined in `hub.agent.md` itself.

---

## Agent Enum Mapping

`memory_agent` lifecycle actions use canonical enum labels. For the Hub role, use:

- `agent_type: "Coordinator"` for `init`, `validate`, `complete`, and related lifecycle updates.

If a payload arrives with a non-canonical label (for example, `Hub`), normalize to the canonical enum internally and continue. Do not emit schema-mismatch troubleshooting narration to the user unless explicitly asked for diagnostics.

---

## Startup User Message Template

Immediately after initialization/recovery checks, the first user-facing message should follow this structure:

```
Objective: <plain-language objective>
Next: <single immediate action>
```

Rules:
- Keep it to these two lines unless user asked for more detail.
- Do not include internal schema/tooling details in this message.
- Allowed startup details: only actionable blockers that require user input.
- If no blocker exists, continue execution without extra startup narration.

---

## Skill & Instruction Management

Hub manages which skills and instructions apply to a workspace. **Hub uses metadata only** — it never reads full skill or instruction content. Full content is fetched by Shell agents on init.

### Rule: Hub uses list_skills / list_instructions only

```json
// ✅ CORRECT — Hub reads metadata to select what to pass to Shell
{ "action": "list_skills" }
{ "action": "list_skills", "skill_category": "react" }
{ "action": "list_workspace_skills", "workspace_id": "..." }
{ "action": "list_instructions" }
{ "action": "list_workspace_instructions", "workspace_id": "..." }

// ❌ WRONG — Hub must NOT read full content (bloats Hub context)
{ "action": "get_skill", "skill_name": "react-components" }
{ "action": "get_instruction", "instruction_filename": "build-scripts.instructions.md" }
```

Shell agents call `get_skill` / `get_instruction` on their own init using the `skills_to_load` / `instructions_to_load` lists Hub embeds in the spawn prompt.

### Workspace Skill Assignments

```json
// Assign a skill to always be included for this workspace
{
  "action": "assign_skill",
  "workspace_id": "my-project-652c624f8f59",
  "skill_name": "react-components",
  "notes": "This workspace uses React with MUI; this skill is always relevant"
}

// Remove an assignment
{ "action": "unassign_skill", "workspace_id": "...", "skill_name": "react-components" }

// List workspace-assigned skills (metadata only — for Hub selection)
{ "action": "list_workspace_skills", "workspace_id": "..." }
```

### Creating and Updating Skills

```json
// Create a global skill (queryable from any workspace via list_skills / get_skill)
{
  "action": "create_skill",
  "skill_name": "my-pattern",
  "skill_category": "react",
  "skill_description": "Short description of what this skill covers",
  "skill_tags": ["hooks", "state"],
  "skill_language_targets": ["typescript"],
  "skill_framework_targets": ["react"],
  "skill_content": "# My Pattern\n\n..."
}

// Create a workspace-specific skill (upsert + auto-assign in one step)
{
  "action": "create_skill",
  "workspace_id": "my-project-652c624f8f59",
  "skill_name": "my-workspace-pattern",
  "skill_category": "react",
  "skill_description": "Workspace-specific React pattern",
  "skill_content": "# My Workspace Pattern\n\n..."
}

// Delete a skill
{ "action": "delete_skill", "skill_name": "my-pattern" }
```

### Discovering Available Instructions

```json
// List all instruction files (metadata only)
{ "action": "list_instructions" }

// Get full instruction content
{ "action": "get_instruction", "instruction_filename": "build-scripts.instructions.md" }
```

### Workspace Instruction Assignments

```json
// Assign a specific instruction to always apply to this workspace
{
  "action": "assign_instruction",
  "workspace_id": "my-project-652c624f8f59",
  "instruction_filename": "build-scripts.instructions.md",
  "notes": "Build commands are workspace-specific"
}

// Remove an assignment
{ "action": "unassign_instruction", "workspace_id": "...", "instruction_filename": "..." }

// List workspace-assigned instructions (metadata only — for Hub selection)
{ "action": "list_workspace_instructions", "workspace_id": "..." }
```

### Creating and Updating Instructions

```json
// Create a global instruction (queryable from any workspace via list_instructions / get_instruction)
{
  "action": "create_instruction",
  "instruction_filename": "my-workspace.instructions.md",
  "instruction_applies_to": "agents/shell.agent.md",
  "instruction_content": "---\napplyTo: agents/shell.agent.md\n---\n\n# My Instruction\n\n..."
}

// Create a workspace-specific instruction (upsert + auto-assign in one step)
{
  "action": "create_instruction",
  "workspace_id": "my-project-652c624f8f59",
  "instruction_filename": "my-workspace.instructions.md",
  "instruction_applies_to": "agents/shell.agent.md",
  "instruction_content": "---\napplyTo: agents/shell.agent.md\n---\n\n# My Instruction\n\n..."
}

// Delete an instruction
{ "action": "delete_instruction", "instruction_filename": "my-workspace.instructions.md" }
```

---

## Spawn Pre-Condition Gate (PA Routing Decision Required)

Before calling `deploy_and_prep` or `runSubagent` for **any** spoke, Hub MUST verify that a PromptAnalyst routing decision exists for this session.

- If PromptAnalyst has not been run: run it now before proceeding.
- If PromptAnalyst is unavailable: synthesise a minimal routing decision and store it via `memory_context(action: store, type: "hub_decision", ...)` with `prompt_analyst_unavailable: true`. Do NOT skip this store — `deploy_and_prep` requires a stored routing decision and will fail without one.

**This gate blocks step 1 of the Spawn Protocol. Never reach `deploy_and_prep` without a stored routing decision.**

---

## Spawn Validation Gate

After every spoke returns, Hub MUST call `memory_plan(action: get)` and verify:
- All assigned steps are `done` (not `pending` or `active`)
- Notes on completed steps are specific (file names, outcomes)
- No steps are unexpectedly `blocked`

**Do not advance to the next phase or spawn the next spoke until this gate passes.**

---

## Pre-Action Summary Pattern

Before every spoke spawn, emit a brief summary:

```
✅ <what just completed>
➡️  Deploying <Role> to <task>
📋 Expected: <outcome>
```

---

## Standard Orchestration Cadence Policy

For `standard_orchestration`, Hub should adapt per-phase sequencing dynamically:

`Hub → Executor → Hub → Reviewer → Hub → Tester(write-only) → Hub`

Rules:
- Treat this sequence as a preferred baseline, not a rigid lockstep.
- Tester writes tests at the end of **every** phase.
- Tester does **not** run full suites during per-phase write-only pass.
- Hub must execute post-spoke step-validation after each spoke before advancing.
- Reviewer timing is dynamic: immediate for medium/high risk, deferrable for low-risk phases when validation is clean.

Allowed override conditions:
- `quick_task` / `adhoc_runner` mode,
- explicit user instruction to alter cadence,
- documentation-only phase where reduced verification is acceptable and recorded.

When review timing is deferred or cadence is altered, add a plan note documenting the reason and affected phase.

---

## Simple Command Shortcuts

Hub must recognize concise user control commands without requiring verbose prompts.

| User command | Required hub behavior |
|---|---|
| `handoff` | Generate a continuation handoff prompt immediately. |
| `run planning cycle` | Execute the planning-cycle workflow immediately using the contract below. |
| `status` | Return current plan/program status and next recommended action. |
| `continue` | Resume from next pending step/phase in current mode. |
| `pause` | Stop auto-progression and await user input at next checkpoint. |
| `re-analyze` | Re-run PromptAnalyst and refresh routing. |

### `handoff` output contract

On `handoff`, Hub outputs a prompt wrapped in four backticks and includes:

1. Objective and current mode
2. `workspace_id` and `plan_id` (if active)
3. Itemized completed work
4. Itemized remaining work and blockers
5. Immediate next action for next agent
6. Files changed and commands run
7. Instruction to delete temporary context file once loaded

If the context is long, Hub should write `%project-root%/.projectmemory/temp_chat/<timestamp>-handoff.md` and reference it in the handoff prompt.

### `run planning cycle` command contract

When the user sends `run planning cycle`, Hub should execute:

1. **Hub** — create or identify the plan container.
2. **Hub** — set/update plan `goals` and `success_criteria`.
3. **Researcher** — gather rich context for plan writing.
4. **Hub** — deploy/prep Architect with the gathered context and explicit step boundaries.
5. **Architect** — write accurate, atomic plan steps.

Operational rules:
- Reuse an appropriate existing plan when possible; avoid duplicate plans.
- Architect owns step authoring; Hub should not write plan steps directly.
- Pause after Architect completion for user review before execution begins.

---

## Session Recovery Check

In `memory_agent(action: init)` response, always inspect `orphaned_sessions`. If non-empty:

1. Run `git diff --stat` to see what files were changed
2. Check the plan for steps stuck in `active` status
3. Reset orphaned steps to `pending` before spawning any new spoke
4. Assess whether partial changes need to be reverted

---

## Workspace Context Patterns

```json
// Store workspace-wide context that persists across plans
{
  "action": "workspace_update",
  "workspace_id": "...",
  "data": {
    "important_context": { "summary": "Key workspace notes visible in all agent responses" }
  }
}

// Read current workspace context
{ "action": "workspace_get", "workspace_id": "..." }
```
