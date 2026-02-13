# Reviewer Agent — Build Verification Capabilities

> **Note:** The Builder agent has been merged into the Reviewer agent. The Reviewer now handles both build verification and code review. This document describes the Reviewer's build verification capabilities (formerly the Builder agent).

## Overview

The Reviewer agent includes build verification capabilities that run before code review. When deployed after an Executor phase, the Reviewer first checks that the code compiles (build-check mode), then proceeds with code review. At the end of a plan, the Reviewer performs a comprehensive final verification.

## Build-Check Modes

| Mode | When | Purpose |
|------|------|---------|
| **Build-check** | Mid-plan (after Executor) | Quick compile verification — detects regressions if `pre_plan_build_status='passing'` |
| **Final Verification** | End-of-plan (after all tests pass) | Comprehensive build with user-facing instructions and optimization suggestions |

## When Build-Check Runs

| Condition | Build-Check Behavior |
|-----------|---------------------|
| `pre_plan_build_status='passing'` | Reviewer runs build verification before code review |
| `pre_plan_build_status='unknown'` | Reviewer skips build check, goes directly to code review |
| `pre_plan_build_status='failing'` | Reviewer skips build check (can't distinguish new from pre-existing failures) |

## Build Script Lifecycle

1. **Discovery**: Reviewer calls `list_build_scripts` to find existing scripts
2. **Creation** (if needed): Reviewer calls `add_build_script` with name, command, and directory
3. **Resolution**: Reviewer calls `run_build_script` to get the absolute command and directory
4. **Execution**: Reviewer runs the resolved command in the terminal via `run_in_terminal`
5. **Analysis**: Reviewer examines output and determines pass/fail
6. **Cleanup** (optional): Reviewer calls `delete_build_script` for one-off scripts

## Workflow Position

```
Executor → Reviewer (build-check + code review) → Tester
                  → Revisionist (on build failure or review issues)
```

## Handoff Patterns

| Outcome | Handoff To | Recommendation |
|---------|-----------|----------------|
| Build succeeds + review approved | Coordinator | Recommend Tester |
| Build fails | Coordinator | Recommend Revisionist with error analysis |
| Review issues found | Coordinator | Recommend Revisionist with review notes |

## Dashboard Integration

Build scripts are visible in the dashboard under the **Build Scripts** tab on the plan detail page. Users can:

- View all scripts with their commands and directories
- Add new scripts via the form
- Run scripts (which resolves the command for terminal execution)
- Delete scripts

The dashboard uses optimistic updates for a responsive UI experience.
