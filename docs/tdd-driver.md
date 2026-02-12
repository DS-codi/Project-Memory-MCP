# TDDDriver Agent

> **Status:** Upcoming (Phase 10) — This document describes the planned design.

## Overview

The TDDDriver is a **hub agent** that orchestrates Test-Driven Development (TDD) red-green-refactor cycles. Unlike the standard workflow where testing happens after implementation, TDDDriver inverts the flow: tests are written first, verified to fail, code is implemented to pass them, and then refactored.

## Motivation

The standard agent workflow follows:

```
Executor → Builder → Reviewer → Tester(WRITE) → ... → Tester(RUN) → Archivist
```

This works well for most tasks, but TDD requires a fundamentally different cycle:

```
Write failing test → Verify it fails → Implement code → Verify it passes → Refactor → Repeat
```

The TDDDriver agent bridges this gap by acting as a hub that orchestrates subagents in a TDD-specific sequence.

## Architecture

TDDDriver is a **hub agent** (like Coordinator, Analyst, Runner), meaning it can spawn subagents via `runSubagent`. It sits between the Coordinator and spoke agents:

```
┌───────────────┐
│  Coordinator  │
└───────┬───────┘
        │ spawns
        ▼
┌───────────────┐
│   TDDDriver   │  ← TDD Hub
│    (Hub)      │
└───────┬───────┘
   ┌────┼────┐
   ▼    ▼    ▼
Tester  Builder  Executor   ← Spoke subagents
```

## The Red-Green-Refactor Cycle

TDDDriver orchestrates the classic TDD cycle using existing spoke agents:

### 1. RED — Write a Failing Test

TDDDriver spawns **Tester** in `WRITE` mode with the test specification:

```javascript
runSubagent({
  agentName: "Tester",
  prompt: `
    MODE: WRITE
    Plan: plan_abc123
    Workspace: my-project-abc123

    ## YOUR TASK
    Write a failing test for: ${featureDescription}

    ## Test Specification
    ${testSpec}

    ## SCOPE
    - Files to create: ${testFiles}
    - Do NOT implement the feature code
    - The test MUST fail when run (no production code exists yet)
  `
});
```

### 2. Verify RED — Confirm Tests Fail

TDDDriver spawns **Builder** to run the tests and verify they fail:

```javascript
runSubagent({
  agentName: "Builder",
  prompt: `
    Plan: plan_abc123
    Workspace: my-project-abc123

    ## YOUR TASK
    Run the test suite and verify the new tests FAIL.

    ## Expected Behavior
    - Tests in ${testFiles} should FAIL
    - Existing tests should still PASS
    - Report failure messages for the new tests
  `
});
```

If the new tests pass unexpectedly, TDDDriver loops back to step 1 — the test specification needs revision.

### 3. GREEN — Implement Minimum Code

TDDDriver spawns **Executor** to write the minimum code needed to pass the tests:

```javascript
runSubagent({
  agentName: "Executor",
  prompt: `
    Plan: plan_abc123
    Workspace: my-project-abc123

    ## YOUR TASK
    Write the MINIMUM code to make these tests pass: ${testFiles}

    ## CONSTRAINTS
    - Write only enough code to pass the tests
    - Do NOT add extra functionality beyond what tests require
    - Do NOT refactor yet — that comes next

    ## SCOPE
    - Files to modify: ${implementationFiles}
  `
});
```

### 4. Verify GREEN — Confirm Tests Pass

TDDDriver spawns **Builder** again to verify all tests pass:

```javascript
runSubagent({
  agentName: "Builder",
  prompt: `
    Plan: plan_abc123
    Workspace: my-project-abc123

    ## YOUR TASK
    Run the full test suite and verify ALL tests pass.

    ## Expected Behavior
    - New tests in ${testFiles} should PASS
    - All existing tests should still PASS
  `
});
```

If tests still fail, TDDDriver loops back to step 3 with failure details.

### 5. REFACTOR — Clean Up

TDDDriver spawns **Reviewer** to identify refactoring opportunities, then **Executor** to apply them:

```javascript
// First: identify what to refactor
runSubagent({
  agentName: "Reviewer",
  prompt: `
    Review ${implementationFiles} for refactoring opportunities.
    Tests must continue to pass after any changes.
  `
});

// Then: apply refactoring
runSubagent({
  agentName: "Executor",
  prompt: `
    Apply these refactoring suggestions: ${reviewerSuggestions}
    CONSTRAINT: All tests in ${testFiles} must still pass.
  `
});
```

### 6. Verify REFACTOR — Confirm Nothing Broke

Final **Builder** run to confirm all tests still pass after refactoring.

## Full Cycle Flow

```
TDDDriver
  ├── 1. Tester(WRITE)     → Write failing test
  ├── 2. Builder(verify)   → Confirm test fails ──── loops to 1 if passes
  ├── 3. Executor(implement)→ Write minimum code
  ├── 4. Builder(verify)   → Confirm test passes ─── loops to 3 if fails
  ├── 5. Reviewer + Executor → Refactor
  ├── 6. Builder(verify)   → Confirm still passes ── loops to 5 if fails
  └── Repeat for next test specification
```

## Integration with the Agent System

### Deployment

The Coordinator spawns TDDDriver when:

- The user explicitly requests TDD workflow
- The plan category or step type indicates test-driven development
- A plan step is tagged with `type: "tdd"`

### Hub Privileges

As a hub agent, TDDDriver:

- **CAN** spawn subagents via `runSubagent`
- **MUST** include anti-spawning instructions in every subagent prompt
- **MUST** include scope boundaries for every subagent

### Handoff Flow

```
Coordinator
  └── spawns TDDDriver
        ├── cycles through RED-GREEN-REFACTOR
        └── handoffs back to Coordinator
              └── recommends: Archivist (if TDD complete)
                              Revisionist (if blocked)
```

### Step Tracking

TDDDriver creates and manages its own sub-steps within a plan phase:

```json
{
  "phase": "TDD: UserAuth",
  "steps": [
    { "task": "RED: Write failing test for login()", "type": "test" },
    { "task": "Verify RED: Confirm test fails", "type": "validation" },
    { "task": "GREEN: Implement login() minimum", "type": "code" },
    { "task": "Verify GREEN: Confirm test passes", "type": "validation" },
    { "task": "REFACTOR: Clean up login()", "type": "refactor" },
    { "task": "Verify REFACTOR: Confirm still passes", "type": "validation" }
  ]
}
```

## Integration with Skills System

TDDDriver can leverage matched skills to:

- Determine the correct test framework and conventions for the project
- Understand project-specific testing patterns
- Apply language-appropriate TDD idioms

When spawning Tester in WRITE mode, TDDDriver passes relevant skills context so tests follow project conventions.

## When to Use TDDDriver vs Standard Workflow

| Use TDDDriver | Use Standard Workflow |
|--------------|----------------------|
| User requests TDD | Default for most tasks |
| High-confidence requirements exist | Requirements are exploratory |
| Mission-critical code (auth, payments) | General features |
| Well-defined interfaces | Greenfield exploration |
| Regression-prone areas | Simple changes |

## Configuration

TDDDriver will be configurable via plan metadata:

```json
{
  "tdd_config": {
    "max_red_retries": 3,
    "max_green_retries": 5,
    "refactor_enabled": true,
    "coverage_threshold": 80
  }
}
```

## Related Documentation

- [Worker Agent](worker-agent.md) — Lightweight spoke agent for focused tasks
- [Skills System](skills-system.md) — How skills guide agent behavior
- [Integrated Programs](integrated-programs.md) — Multi-plan coordination
