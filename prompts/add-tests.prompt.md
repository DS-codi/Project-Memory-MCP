---
agent: "coordinator"
description: "Add test coverage to existing code"
---

# Test Coverage Request

@coordinator I need to add tests for:

## Target Code

{{targetCode}}

## Test Types Needed

{{testTypes}}

## Coverage Goals

{{coverageGoals}}

---

**Instructions for Coordinator:**

1. Use `memory_context` (action: store_initial) to capture this request
2. Create a plan with `memory_plan` (action: create, category: "feature") (adding test capability)
3. Skip Researcher unless external test frameworks needed
4. Spawn Architect to design test structure
5. Spawn Executor to write tests
6. Spawn Tester in RUN mode to verify all tests pass
7. Archive with coverage report
