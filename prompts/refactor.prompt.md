---
agent: "coordinator"
description: "Refactor code for better maintainability"
---

# Refactoring Request

@coordinator I need to refactor:

## Target Code

{{targetCode}}

## Refactoring Goals

{{refactoringGoals}}

## Constraints

{{constraints}}

---

**Instructions for Coordinator:**

1. Use `store_initial_context` to capture this request
2. Create a plan with category "refactor"
3. Spawn Architect to design the refactoring approach
4. Execute refactoring: Executor → Reviewer → Tester
5. Ensure existing tests still pass
6. Archive with git commit documenting the refactor
