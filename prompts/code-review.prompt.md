---
agent: "coordinator"
description: "Review existing code for quality and issues"
---

# Code Review Request

@coordinator I need a code review for:

## Files to Review

{{filesToReview}}

## Review Focus

{{reviewFocus}}

## Standards to Check

{{standards}}

---

**Instructions for Coordinator:**

1. Use `store_initial_context` to capture this request
2. Create a plan with category "analysis"
3. Spawn Reviewer directly (skip Executor)
4. Store findings with `store_context`
5. If issues found, optionally spawn Revisionist to create fix plan
6. Archive review findings
