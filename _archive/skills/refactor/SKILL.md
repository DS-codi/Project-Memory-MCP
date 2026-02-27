---
name: refactor
description: One-command orchestrator for module refactors in this Project Memory MCP workspace. Use when the user asks to refactor a module with controlled planning, implementation, review, and testing.
argument-hint: <module-or-path> [goal] [constraints]
---

# Refactor Bot

Use this skill to run a full refactor workflow from a single command like `/refactor interactive-terminal/src/cxxqt_bridge "split monolith into focused modules"`.

## Behavior

When invoked, run this sequence:

1. Parse target + goal
   - Target module/path from first argument
   - Optional objective from remaining arguments
   - If missing objective, default to: improve structure while preserving behavior

2. Start a Project Memory plan
   - Register workspace using `memory_workspace(action: "register")`
   - Create a new `refactor` plan with clear goals and success criteria
   - Store initial request via `memory_context(action: "store_initial")`

3. Orchestrate agent flow
   - `Researcher`: inspect usage, dependencies, and risk surface
   - `Architect`: produce step-by-step refactor design with file scope
   - `Executor`: implement minimal scoped changes
   - `Reviewer`: run build-check + quality review
   - `Tester`: write/run targeted tests
   - `Revisionist`: only when blocked/failing
   - `Archivist`: archive when complete

4. Enforce safety + scope
   - Keep public API stable unless user explicitly allows breaking changes
   - Avoid unrelated edits
   - If scope must expand, report and request escalation via handoff
   - Prefer existing build scripts (`memory_plan(action: "list_build_scripts")`) before ad-hoc commands

5. Validate outcomes
   - Build and targeted tests pass for touched areas
   - No unresolved blocked steps
   - Plan archived with summary + artifact list

## Output Format

Return a concise execution report:
- Refactor target and goal
- Files changed
- Build/test status
- Risks or follow-up recommendations

## Example Invocations

- `/refactor interactive-terminal/src/cxxqt_bridge split into module directory`
- `/refactor vscode-extension/src/chat/tools simplify contracts and reduce coupling`
