---
agent: "coordinator"
description: "Generate documentation for code or project"
---

# Documentation Request

@coordinator I need documentation for:

## Documentation Target

{{documentationTarget}}

## Documentation Type

{{documentationType}}

## Audience

{{audience}}

---

**Instructions for Coordinator:**

1. Use `memory_context` (action: store_initial) to capture this request
2. Create a plan with `memory_plan` (action: create, category: "documentation")
3. Spawn Researcher to gather information about the code
4. Spawn Architect to outline documentation structure
5. Spawn Executor to write documentation
6. Spawn Reviewer to verify accuracy
7. Archive documentation
