---
plan_id: plan_mlct1x3l_a3f2e9f4
created_at: 2026-02-08T02:45:51.421Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Step Ordering Tools Review

## Current tools
- memory_steps actions: add, update, batch_update, insert, delete, reorder, move, sort, set_order, replace.
- insert: normalizes indices, shifts later steps, and remaps depends_on based on a normalized index map.
- delete: removes a step and shifts indices down.
- reorder: swaps adjacent steps up/down.
- move: moves a step to a target index and shifts affected indices.
- sort: sorts by phase (optional custom phase order) and reorders steps within phase by prior index.
- update: warns on out-of-order completion but does not block it.

## Existing safeguards
- insertStep normalizes indices and shifts depends_on.
- updateStep emits non-blocking warning when earlier steps are still pending.
- move/reorder validate bounds and reindex affected steps.

## Gaps observed
- No blocking guardrail against out-of-order step completion.
- No dedicated "normalize" action to reindex and repair index gaps or duplicates.
- No explicit policy docs in mcp-usage prior to update; agents might append instead of inserting.

## Improvement ideas
- Add memory_steps action: normalize (reindex + re-map depends_on) with a warning when duplicates/gaps are detected.
- Add optional strict mode flag to update/batch_update that blocks marking steps done out of order unless explicitly overridden.
- Add a "plan_order_audit" helper that reports index gaps/duplicates and suggests set_order.
