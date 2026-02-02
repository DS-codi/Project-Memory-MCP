---
agent: "coordinator"
description: "Start a new feature implementation with full agent workflow"
---

# New Feature Request

@coordinator I need to implement a new feature:

## Feature Description

{{featureDescription}}

## Requirements

{{requirements}}

## Acceptance Criteria

{{acceptanceCriteria}}

---

**Instructions for Coordinator:**

1. Use `memory_context` (action: store_initial) to capture this request
2. Create a plan with `memory_plan` (action: create, category: "feature")
3. Spawn Researcher if external APIs/libraries are involved
4. Spawn Architect to design the implementation
5. Follow the standard workflow: Executor → Reviewer → Tester → Archivist
