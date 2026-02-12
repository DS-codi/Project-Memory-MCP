# Manual Testing Checklist

Post-build verification for the System-Wide Architecture Evolution plan.

## Build & Install

### Local (VS Code Extension)
1. Run `.\build-and-install.ps1` from the project root
2. Reload VS Code after extension installs
3. Verify MCP server connects (check MCP status in VS Code)

### Podman Container
1. Rebuild the container image:
   ```powershell
   .\run-container.ps1 build
   # or: podman-compose up --build
   ```
2. Start the container:
   ```powershell
   .\run-container.ps1 run
   # or: podman-compose up -d
   ```
3. Verify health check passes:
   ```powershell
   .\run-container.ps1 status
   # or: podman ps --filter name=project-memory
   ```
4. Check logs for startup errors:
   ```powershell
   .\run-container.ps1 logs
   ```
5. Verify endpoints respond:
   - MCP server: `http://localhost:3000/health`
   - Dashboard API: `http://localhost:3001`
   - WebSocket: `ws://localhost:3002`

---

## 1. Integrated Programs

### Create a Program
- [ ] `memory_plan(action: create)` — create 2+ plans in the same workspace
- [ ] `memory_plan(action: create_program)` — create a program with title and description
- [ ] Verify program appears in plan listings

### Link Plans to Program
- [ ] `memory_plan(action: add_plan_to_program)` — link an existing plan to the program
- [ ] Verify `program_id` is set on the linked plan
- [ ] Try linking the same plan twice — should no-op or return error gracefully

### Upgrade Plan to Program
- [ ] `memory_plan(action: upgrade_to_program)` — convert a standalone plan into a program
- [ ] Verify the plan gets `is_program: true` and `child_plan_ids` array

### List Program Plans
- [ ] `memory_plan(action: list_program_plans)` — list all plans in a program
- [ ] Verify aggregate progress is calculated across child plans

### Dependency Validation
- [ ] `memory_plan(action: validate_plan_dependencies)` — add `depends_on_plans` to a plan
- [ ] Create a circular dependency (A→B→A) — should be rejected
- [ ] Create a valid chain (A→B→C) — should pass

### Auto-Upgrade Detection
- [ ] Create a plan, add 100+ steps — verify auto-upgrade suggestion appears in response

---

## 2. Skills System

### List Skills
- [ ] `memory_agent(action: init)` with `include_skills: true` — verify skills appear in response
- [ ] Check that skill matching scores are returned (keyword, category, language, tag weights)

### Deploy Skills
- [ ] `memory_context(action: deploy_skills)` or via extension — deploy skills to a workspace
- [ ] Verify skill files appear in workspace `.github/skills/` or configured directory
- [ ] Check `MBS_SKILLS_ROOT` env var is respected if set

### Skill Matching
- [ ] Init an agent in a TypeScript workspace — verify TypeScript-related skills score higher
- [ ] Init an agent in a Python workspace — verify Python skills score higher

---

## 3. Builder Dual-Mode

### Regression Check (Mid-Plan)
- [ ] During plan execution, deploy Builder with `mode: "regression_check"`
- [ ] Verify it runs build commands and reports pass/fail
- [ ] Check `pre_plan_build_status` is stored when Builder runs first time

### Final Verification (End-of-Plan)
- [ ] Deploy Builder with `mode: "final_verification"` after all phases complete
- [ ] Verify it checks server, dashboard, and extension builds
- [ ] Confirm it reports comprehensive results

---

## 4. Context Optimization

### Compact Mode
- [ ] `memory_agent(action: init)` with `compact: true` (default) — verify trimmed sessions
- [ ] Verify: last 3 sessions are full, 4-10 are summarized, >10 are omitted
- [ ] Check `context_size_bytes` appears in init response

### Context Budget
- [ ] `memory_agent(action: init)` with `context_budget: 5000` — verify payload is trimmed
- [ ] Compare payload size with and without budget

### Phase-Based Step Filtering
- [ ] In compact mode, verify only current phase + adjacent phase steps are returned
- [ ] Steps with `context_priority: "high"` should bypass filtering

### Research Auto-Summarization
- [ ] `memory_context(action: append_research)` — add research notes exceeding 50KB
- [ ] Verify auto-summarization triggers and `[Summarized]` markers appear

---

## 5. Worker Agent

### Worker Validation
- [ ] `memory_agent(action: validate)` with `agent_type: "Worker"` — verify it checks hub deployment
- [ ] Try validating Worker without deployment context — should fail
- [ ] Validate Worker deployed by Coordinator — should pass

### Worker Scope Limits
- [ ] Check `AGENT_BOUNDARIES.Worker.max_steps` is 5
- [ ] Check `AGENT_BOUNDARIES.Worker.max_context_tokens` is 50000
- [ ] Worker's `can_implement` should be true, `can_finalize` should be false

### Worker Lifecycle
- [ ] Deploy Worker via Coordinator prompt — verify init/complete cycle works
- [ ] Worker sessions should appear in plan lineage
- [ ] Worker should NOT be able to spawn subagents

---

## 6. TDDDriver Agent

### TDDDriver as Hub
- [ ] `memory_agent(action: validate)` with `agent_type: "TDDDriver"` — should pass when deployed by Coordinator
- [ ] Verify `AGENT_BOUNDARIES.TDDDriver.is_hub` is true
- [ ] Verify `AGENT_BOUNDARIES.TDDDriver.can_spawn_subagents` is true

### TDD Cycle State
- [ ] Verify `TDDCycleState` can be stored via handoff tools
- [ ] Check cycle phases: `red`, `green`, `refactor`
- [ ] Verify cycle iterations are tracked

### Coordinator Integration
- [ ] Check coordinator.agent.md has TDDDriver deployment criteria
- [ ] Verify handoff-protocol lists TDDDriver as 4th hub agent

---

## 7. Dynamic Prompt System

### Write Prompt
- [ ] `memory_context(action: write_prompt)` — create a .prompt.md file
- [ ] Verify YAML frontmatter includes: title, version, plan_id, created_by
- [ ] Check file is stored at `data/{workspace_id}/prompts/{plan_id}/`

### Prompt Versioning
- [ ] Create a prompt, then update it — verify version auto-increments (1.0.0 → 1.1.0)
- [ ] Check staleness detection flags prompts older than configured threshold

### Prompt Archival
- [ ] Archive a plan that has prompts
- [ ] Verify archived prompts get header: `### ARCHIVED PROMPT: Used for plan " ", Related Steps " "`
- [ ] Archived prompts should still be readable

### TDD Workflow Template
- [ ] Check `prompts/tdd-workflow.prompt.md` exists with placeholders
- [ ] Verify template has fields for test file, source file, cycle number

---

## 8. SkillWriter Agent

### Validation
- [ ] `memory_agent(action: validate)` with `agent_type: "SkillWriter"` — verify spoke validation
- [ ] SkillWriter should NOT be able to spawn subagents
- [ ] Check `AGENT_BOUNDARIES.SkillWriter` exists

### Skills Awareness
- [ ] Verify all 15 agent .md files have a `## Skills Awareness` section

---

## 9. Dashboard (if running)

### Program Views
- [ ] ProgramTreeView renders programs with expandable child plans
- [ ] ProgramDetailPage shows aggregate progress across child plans
- [ ] Navigation from program → individual plan works

### Skills Panel
- [ ] SkillsPanel lists deployed skills per workspace
- [ ] Skill detail expands to show SKILL.md content
- [ ] Deployment status indicators are visible

### Worker Timeline
- [ ] Worker sessions appear in plan timeline with visual distinction
- [ ] Worker sessions show task scope and parent hub agent

---

## 10. Type System & Exports

### Barrel Files
- [ ] `import { AgentType } from '../types/index.js'` resolves correctly
- [ ] `import { createPlan } from '../tools/plan/index.js'` resolves correctly
- [ ] All 6 type modules re-exported: agent, build, context, plan, workspace, common

### AgentType Enum
- [ ] Verify 15 types: Coordinator, Analyst, Researcher, Architect, Executor, Builder, Reviewer, Tester, Revisionist, Archivist, Brainstorm, Runner, SkillWriter, Worker, TDDDriver
- [ ] Zod `AgentTypeSchema` matches TypeScript `AgentType`

---

## Quick Smoke Test Sequence

Run these in order for a fast validation:

```
1. .\build-and-install.ps1
2. Reload VS Code
3. memory_workspace(action: register)
4. memory_plan(action: create) — create a test plan
5. memory_steps(action: add) — add a few steps
6. memory_agent(action: init) with include_skills: true, compact: true
7. memory_context(action: write_prompt) — create a prompt
8. memory_plan(action: create_program) — create a program
9. memory_plan(action: add_plan_to_program) — link the plan
10. memory_plan(action: list_program_plans) — verify linkage
11. memory_plan(action: archive) — archive and check prompt archival
```
