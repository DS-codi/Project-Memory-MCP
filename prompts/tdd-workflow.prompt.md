---
agent: "tdd-driver"
description: "TDD red-green-refactor workflow cycle template"
mode: "agent"
version: "1.0.0"
---

# TDD Workflow: {{feature_name}}

@tdd-driver Execute a red-green-refactor TDD cycle for the target feature.

## Test File

{{test_file}}

## Implementation File

{{impl_file}}

## Test Framework

{{test_framework}}

## Acceptance Criteria

{{acceptance_criteria}}

## Matched Skills

{{matched_skills}}

---

**Cycle Instructions for TDDDriver:**

### Phase 1: RED — Write Failing Tests

1. Spawn **Tester** (WRITE mode) with the acceptance criteria above
2. Tester writes test cases in `{{test_file}}` that define expected behavior
3. Spawn **Builder** to verify tests compile but **fail** (red state)
4. If tests don't compile, re-spawn Tester with compile errors

### Phase 2: GREEN — Make Tests Pass

1. Spawn **Executor** to implement minimal code in `{{impl_file}}`
2. Executor writes just enough code to make all tests pass
3. Spawn **Tester** (RUN mode) to verify all tests pass (green state)
4. If tests still fail, re-spawn Executor with failure details

### Phase 3: REFACTOR — Improve Code Quality

1. Spawn **Reviewer** to review the implementation for:
   - Code quality and readability
   - Duplication or unnecessary complexity
   - Adherence to project conventions
2. If Reviewer suggests refactoring:
   - Spawn Executor with refactoring instructions
   - Re-spawn Tester (RUN mode) to confirm tests still pass
3. Repeat until Reviewer approves

### Completion

After all phases complete:
1. Record cycle results via `memory_context(action: store)`
2. Handoff to Coordinator with recommendation for Builder (final verification)

---

**Template Variables:**

- `{{feature_name}}`
- `{{test_file}}`
- `{{impl_file}}`
- `{{test_framework}}`
- `{{acceptance_criteria}}`
- `{{matched_skills}}`
