---
agent: "coordinator"
description: "Investigate and fix a bug with full tracking"
---

# Bug Fix Request

@coordinator I need to fix a bug:

## Bug Description

{{bugDescription}}

## Steps to Reproduce

{{stepsToReproduce}}

## Expected Behavior

{{expectedBehavior}}

## Actual Behavior

{{actualBehavior}}

---

**Instructions for Coordinator:**

1. Use `memory_context` (action: store_initial) to capture this request
2. Create a plan with `memory_plan` (action: create, category: "bug")
3. Spawn Researcher to investigate root cause (if unclear)
4. Spawn Architect for simple fix design
5. Execute fix: Executor → Reviewer → Tester → Archivist
6. Ensure tests cover the bug scenario
