---
applyTo: "agents/coordinator.agent.md"
---

# Sub-Agent Prompt Templates

Templates for the Coordinator to use when spawning sub-agents via `runSubagent`. Each template includes the required context, scope boundaries, and handoff instructions.

---

## 📝 SUB-AGENT PROMPTS

When spawning a sub-agent, include:

### Context Handoff Checklist (Before Spawning Executor)

**MANDATORY:** Before calling `runSubagent` for Executor, store the following via `memory_context`:

1. **User request** — `memory_context(action: store_initial)` with the original user request (if not already stored)
2. **Affected files** — `memory_context(action: store, type: "affected_files")` with paths, purpose, and expected changes
3. **Design decisions** — `memory_context(action: store, type: "architecture")` with architectural choices (from Architect, if applicable)
4. **Constraints** — `memory_context(action: store, type: "constraints")` with technical constraints, conventions, file size limits
5. **Code references** — `memory_context(action: store, type: "code_references")` with relevant snippets, patterns, interfaces
6. **Test expectations** — `memory_context(action: store, type: "test_expectations")` with what should pass after implementation

You can combine items 2–6 into a single `batch_store` call if preferred.

### For Executor:
```
Plan: {plan_id}
Workspace: {workspace_id} | Path: {workspace_path}

PHASE: {current_phase}
TASK: Implement the following steps:
{list of pending steps for this phase}

SCOPE BOUNDARIES (strictly enforced):
- ONLY modify these files: {list files from affected_files context}
- ONLY create files in these directories: {target directories}
- Do NOT refactor, rename, or restructure code outside your scope
- Do NOT install new dependencies without explicit instruction
- Do NOT modify configuration files unless specifically tasked
- If your task requires changes beyond this scope, STOP and use
  memory_agent(action: handoff) to report back. Do NOT expand scope yourself.

SCOPE ESCALATION:
If completing this task requires out-of-scope changes, you MUST:
1. Document what additional changes are needed and why
2. Call memory_agent(action: handoff) with the expanded scope details
3. Call memory_agent(action: complete) — do NOT proceed with out-of-scope changes

CONTEXT RETRIEVAL (do this first):
- Call `memory_context(action: get, type: "audit")` for the codebase audit
- Call `memory_context(action: get, type: "architecture")` for design decisions
- Call `memory_context(action: get, type: "affected_files")` for file list
- Call `memory_context(action: get, type: "constraints")` for constraints
- Call `memory_context(action: get, type: "code_references")` for code snippets
- Check `instruction_files` in your init response for detailed instructions

After completing all steps:
1. Call `memory_agent` (action: handoff) to Coordinator with recommendation for Reviewer
2. Call `memory_agent` (action: complete) with summary

You are a spoke agent. Do NOT call runSubagent to spawn other agents.
Use memory_agent(action: handoff) to recommend the next agent back to the Coordinator.
```

### For Reviewer:
```
Plan: {plan_id}
Workspace: {workspace_id} | Path: {workspace_path}

PHASE: {current_phase}
TASK: Build verification + code review for this phase.

Files changed: {list from last Executor session}
Build commands: {npm run build, cargo build, etc.}
Steps completed: {list}

BUILD-CHECK MODE:
- If pre_plan_build_status is 'passing': run build verification FIRST
  - If BUILD FAILS: handoff to Coordinator with recommendation for Revisionist and error details
- If pre_plan_build_status is 'unknown'/'failing': skip build check

CODE REVIEW:
- Code quality and standards
- Requirements fulfilled
- No obvious bugs

After review:
- If APPROVED: handoff to Coordinator with recommendation for Tester
- If ISSUES: handoff to Coordinator with recommendation for Revisionist and details
```

### For Tester (Writing Tests):
```
Plan: {plan_id}
Workspace: {workspace_id}

PHASE: {current_phase}
TASK: WRITE tests for this phase. DO NOT RUN THEM YET.

Implementation summary: {what was built}
Files to test: {list}

Create test files that cover:
- Unit tests for new functions
- Integration tests if applicable

After writing tests:
- handoff back to Coordinator
- Tests will be run after ALL phases complete
```

### For Tester (Running Tests):
```
Plan: {plan_id}
Workspace: {workspace_id}

TASK: RUN ALL TESTS for the entire plan.

Test files created:
{list of test files from each phase}

Run the test suite and report results.

After running:
- If ALL PASS: handoff to Coordinator with recommendation for Archivist
- If FAILURES: handoff to Coordinator with recommendation for Revisionist and failure details
```

### For Revisionist:
```
Plan: {plan_id}
Workspace: {workspace_id}

TASK: Analyze failures and create fix plan.

Failures: {test failures or review issues}

Modify the plan steps to address issues.
After updating plan: handoff to Coordinator with recommendation for Executor
```

### For Archivist:
```
Plan: {plan_id}
Workspace: {workspace_id}

TASK: Finalize the completed plan.

1. Commit all changes with appropriate message
2. Update documentation if needed
3. Archive the plan

After archiving: `memory_agent` (action: complete) with final summary
```

### For SkillWriter (Refactor Mode — Classify):
```
Plan: {plan_id}
Workspace: {workspace_id} | Path: {workspace_path}
Foreign Workspace: {foreign_workspace_path}

MODE: refactor
PHASE: classify

TASK: Scan and classify instruction files in the foreign workspace.
Read all `.instructions.md` files, then produce a classification report with one of these actions per file:
- keep — file is fine as-is
- convert — content is a reusable pattern, convert to SKILL.md
- consolidate — merge with another instruction file (specify target)
- delete — redundant, outdated, or empty
- split — file mixes concerns, split into multiple files
- protected — agent definitions, security files — never touched

SCOPE BOUNDARIES:
- READ-ONLY during classify phase — do NOT modify or delete any files
- Only read files in: {foreign_workspace_path}/.github/instructions/
- Only output the classification report via memory_context(action: store)
- If files outside this scope need analysis, STOP and handoff

SCOPE ESCALATION:
If you need to read files outside the instruction directory, STOP, document what's needed, call memory_agent(action: handoff), then memory_agent(action: complete).

You are a spoke agent. Do NOT call runSubagent. Use memory_agent(action: handoff) to recommend next agent.
```

### For SkillWriter (Refactor Mode — Execute):
```
Plan: {plan_id}
Workspace: {workspace_id} | Path: {workspace_path}
Foreign Workspace: {foreign_workspace_path}

MODE: refactor
PHASE: execute

APPROVED CLASSIFICATIONS (from user review):
{approved_classifications}
<!-- Example:
- auth-patterns.instructions.md → convert
- old-deploy-notes.instructions.md → delete
- api-conventions.instructions.md + api-style.instructions.md → consolidate
-->

TASK: Execute ONLY the approved classification actions above. Do not act on files not listed.
For convert: create SKILL.md in .github/skills/{slug}/, delete original instruction file.
For consolidate: merge content into the target file, delete the source file.
For delete: remove the file.
For split: create new files, delete original.

SCOPE BOUNDARIES:
- ONLY modify files listed in approved_classifications above
- ONLY create new files in: {foreign_workspace_path}/.github/skills/, {foreign_workspace_path}/.github/instructions/
- Do NOT modify source code, agent files, or config files
- If a change requires out-of-scope edits, STOP and handoff

SCOPE ESCALATION:
If completing approved actions requires changes beyond listed files, STOP, document what's needed, call memory_agent(action: handoff), then memory_agent(action: complete).

You are a spoke agent. Do NOT call runSubagent. Use memory_agent(action: handoff) to recommend next agent.
```

---

## 🔧 Worker Agent — Lightweight Sub-Tasks

The **Worker** is a lightweight spoke agent for focused, scoped sub-tasks. Use Worker instead of a full spoke agent (Executor, Tester, etc.) when:

| Use Worker | Use Full Spoke Agent |
|-----------|----------------------|
| Single-file or small-scope task | Multi-file implementation |
| Task is ≤ 5 discrete steps | Task requires full phase execution |
| No plan modification needed | Needs to update/add plan steps |
| Quick utility/helper work | Architecture changes, complex refactors |
| Parallel sub-tasks that can be split | Sequential work needing deep context |

#### Spawning a Worker

```javascript
runSubagent({
  agentName: "Worker",
  prompt: `Plan: {plan_id}
Workspace: {workspace_id} | Path: {workspace_path}

TASK: {specific task description}

FILE SCOPE (only these files may be modified):
- src/utils/helper.ts
- src/utils/helper.test.ts

DIRECTORY SCOPE (new files may be created here):
- src/utils/

CONTEXT RETRIEVAL:
- Call memory_context(action: get, type: "affected_files") for file list
- Call memory_context(action: get, type: "constraints") for constraints

You are a spoke agent. Do NOT call runSubagent to spawn other agents.
Do NOT modify plan steps. Do NOT create or archive plans.
Use memory_agent(action: handoff) to recommend the next agent back to the Coordinator.`,
  description: "Worker: {brief task description}"
})
```

#### Worker Limits

Workers have built-in limits (`max_steps: 5`, `max_context_tokens: 50000`). If a Worker reports `budget_exceeded: true` or `scope_escalation: true` in its handoff data, you should:
1. Check `worker_limit_exceeded` context via `memory_context(action: get, type: "worker_limit_exceeded")`
2. Reassess the task decomposition — split into smaller Workers or use a full Executor
3. If scope escalation is needed, update the plan steps and redeploy
