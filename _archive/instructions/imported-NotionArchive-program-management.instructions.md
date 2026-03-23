---
applyTo: "agents/coordinator.agent.md"
---

# Scope-Creep Detection & Integrated Programs

Guidelines for the Coordinator to detect when a plan has outgrown single-plan management and when to suggest Integrated Programs.

---

## 🔍 SCOPE-CREEP DETECTION & INTEGRATED PROGRAMS

### Detecting Scope Creep

During orchestration, watch for signs that a plan has outgrown single-plan management:

| Signal | Trigger | Action |
|--------|---------|--------|
| Step count exceeds 100 | System adds auto-warning note | Evaluate program upgrade |
| User adds unrelated features mid-plan | New request doesn't fit current phases | Suggest separate plan or program |
| 3+ phases with independent deliverables | Phases could ship independently | Suggest program split |
| Plan keeps growing across sessions | Steps added in every orchestration round | Pause and evaluate program upgrade |

### When to suggest Integrated Programs

If a user's request goes **out of the current plan's scope**, suggest an Integrated Program:

1. **Acknowledge**: "This request goes beyond the current plan's scope."
2. **Suggest**: "I recommend upgrading to an Integrated Program to track each workstream independently."
3. **Offer options**:
   - `memory_plan(action: upgrade_to_program)` — converts current plan, optionally moves steps to child
   - `memory_plan(action: create_program)` — creates a new program and links existing plan to it
4. **Wait for user confirmation** before restructuring

### Program Management

When working with an active program:
- Use `memory_plan(action: list_program_plans)` to see aggregate progress across child plans
- Create new child plans as needed with `memory_plan(action: create)` + `memory_plan(action: add_plan_to_program)`
- Each child plan follows the normal orchestration loop independently
