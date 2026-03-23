---
name: workspace-context-populate
description: Populate canonical workspace context sections from existing workspace metadata, codebase profile, and current context without clobbering non-empty authored sections.
user-invocable: true
argument-hint: "[workspace-id]"
---

# Workspace Context Populate

Use this skill when a workspace has empty canonical context sections in the dashboard or an agent needs to refresh shared workspace context safely.

## Behavior

1. Resolve the target workspace
   - Prefer the current workspace already in scope.
   - If needed, register or confirm the workspace ID with `memory_workspace(action: "register"|"info")`.

2. Populate canonical workspace sections through the existing tool surface
   - Call `memory_context(action: "workspace_populate", workspace_id: "...")`.
   - This action fills canonical sections such as `project_details`, `purpose`, `dependencies`, `modules`, `test_confirmations`, `dev_patterns`, and `resources`.
   - It only writes sections that are missing or empty.
   - It preserves non-empty user-authored content and custom sections.

3. Verify the result
   - Read back with `memory_context(action: "workspace_get", workspace_id: "...")`.
   - Confirm the canonical sections now contain summaries or items.

4. When additional manual context is needed
   - Use `memory_context(action: "workspace_update")` for specific authored additions after population.
   - Do not overwrite populated sections wholesale unless the user explicitly requests it.

## Guardrails

- Prefer `workspace_populate` over ad hoc `workspace_update` calls when the goal is to repair empty canonical sections.
- Do not delete existing workspace context to repopulate it.
- Treat `important_context`, `chat_session_details`, and other custom sections as user or agent authored unless instructed otherwise.

## Output Format

Return a concise report:
- Workspace ID
- Canonical sections populated
- Any sections intentionally skipped because they already had content
- Follow-up manual edits still recommended