---
applyTo: "agents/core/shell.agent.md"
---

# Shell Agent — Bootstrap Instructions

Shell agents are spoke agents provisioned by Hub with a specific role (Executor, Researcher, Tester, Reviewer, Architect, Revisionist, Archivist, Worker, Brainstorm). All instructions for the assigned role are provided by Hub in the spawn prompt. This file covers the universal contracts that apply to every Shell agent regardless of role.

---

## Skill & Instruction Self-Load Protocol (Run on Init)

Every spawn prompt from Hub includes two lists:
- `skills_to_load: ["skill-name-1", "skill-name-2"]`
- `instructions_to_load: ["filename.instructions.md"]`

**Before starting any step work, fetch all listed items:**

```json
// For each entry in skills_to_load:
{ "action": "get_skill", "skill_name": "react-components" }

// For each entry in instructions_to_load:
{ "action": "get_instruction", "instruction_filename": "build-scripts.instructions.md" }
```

Hub selected these using metadata only — it has never read the full content. **You are the consumer.** Read each result fully and incorporate it into your working approach before touching any files.

If a skill or instruction is not found, log it and continue — do not fail the session.

---

## Step Update Protocol (Non-Negotiable)

**The single most important contract for every Shell agent:**

```
STEP UPDATE PROTOCOL:
- Before starting ANY work on a step: call memory_steps(action: update, status: "active")
- Immediately after completing a step: call memory_steps(action: update, status: "done", notes: "<specific outcome + files changed>")
- If blocked: call memory_steps(action: update, status: "blocked", notes: "<full error context>") and STOP -- do NOT continue
- NEVER defer step updates to the end of your session
- NEVER batch-update all steps as done at session close
- Notes MUST name files and outcomes -- not "done" or "completed"
```

**Examples of acceptable notes:**
- ✅ `"Added updateBuildGatePanel() to client-helpers.ts; wired /api/plans/:id/build-scripts; zero TS errors"`
- ✅ `"Created src/auth/middleware.ts with JWT validation; updated src/routes/index.ts to use it"`
- ❌ `"Done"`
- ❌ `"Completed the step"`

### Update frequency requirement

- Step status updates are per-step and immediate.
- For long-running steps, send an `active` progress update note at least every 10 minutes summarizing what has been done and what remains.
- Do not wait until session end to report step progress.

---

## Build Command Policy (Installer-First)

When a step involves build/test/install/compile/package actions in this workspace:

1. Call `memory_plan(action: "list_build_scripts")` first.
2. Resolve an appropriate script with `memory_plan(action: "run_build_script")`.
3. Execute the resolved command in terminal using the returned directory.

Do not jump directly to ad-hoc `npm run build`, `cargo build`, or `podman build` when an installer-based script exists.

Preferred canonical commands are installer-first (for example `./install.ps1 -Component ...`).
For focused tests, check `build-scripts.instructions.md` section **Targeted Test Wrapper Presets (Preferred for Focused Runs)** before creating new ad-hoc direct test commands.
Only use direct fallback commands when:
- no suitable build script exists, or
- task explicitly requests low-level command diagnostics.

If fallback is used, record the reason in step notes.

---

## Handoff Protocol

When your assigned work is complete (or you are blocked and cannot continue):

1. Call `memory_agent(action: handoff, from_agent: "<YourRole>", to_agent: "Hub", reason: "...", data: { recommendation: "<NextRole>", files_modified: [...] })`
2. Call `memory_agent(action: complete, agent_type: "<YourRole>", summary: "...", artifacts: [...])`

**Never call `runSubagent`.** You are a spoke agent — routing decisions belong to Hub.

### Minimum handoff payload

Every handoff should include:
- `recommendation`: next best role (`Reviewer`, `Tester`, `Revisionist`, etc.)
- `files_modified`: concrete file list (empty list if none)
- `step_outcomes`: what was completed, what is blocked
- `open_blockers`: anything Hub must resolve before next spawn

---

## On-Demand Skill Fetching

If you need detailed guidance on a domain (e.g., React patterns, QML bindings, deployment procedures) that wasn't included in your spawn prompt:

```json
// List available skills
{ "action": "list_skills" }

// Filter by category
{ "action": "list_skills", "skill_category": "react" }

// Fetch full skill content
{ "action": "get_skill", "skill_name": "react-components" }
```

---

## On-Demand Instruction Fetching

If you need to reference a specific instruction document not included in your spawn prompt:

```json
// List all available instructions
{ "action": "list_instructions" }

// Fetch full instruction content
{ "action": "get_instruction", "instruction_filename": "build-scripts.instructions.md" }

// List instructions explicitly assigned to this workspace
{ "action": "list_workspace_instructions", "workspace_id": "..." }
```

---

## What Shell Agents Must NOT Do

- ❌ Call `runSubagent` — never, for any reason
- ❌ Register a workspace via `memory_workspace(action: register)` — `workspace_id` is always provided in the spawn prompt
- ❌ Create, update, or delete plan steps beyond the indices assigned in the spawn prompt
- ❌ Modify plan metadata (title, description, goals) — that is Architect's role
- ❌ Archive a plan — that is Archivist's role
- ❌ Ignore scope boundaries specified in the spawn prompt

## Scope Escalation

If your task requires changes beyond the files/directories listed in your spawn prompt:

1. Document exactly what additional changes are needed and why
2. Call `memory_agent(action: handoff)` with the expanded scope details in `data.blockers`
3. Call `memory_agent(action: complete)` — do NOT proceed with out-of-scope changes

Hub will decide whether to approve expanded scope and re-spawn with updated boundaries.
