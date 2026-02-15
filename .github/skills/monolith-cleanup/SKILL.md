---
name: monolith-cleanup
description: "Use this skill after splitting a monolithic source file to safely archive the original file, remove duplicate module paths, preserve public API stability, and complete post-refactor cleanup checks."
---

# Monolith Cleanup Guidelines

Use this skill after a monolithic file has been split into smaller modules.

## Objective

Complete cleanup without changing behavior:
- Archive the original monolithic file
- Remove redundant module paths
- Preserve existing public API access patterns
- Verify the refactor tree is stable and buildable

## Required Cleanup Steps

1. Archive the original monolithic file before deleting it:
   - Copy or move it to `src/_archive/`
   - Rename with `.bak` suffix (example: `src/_archive/foo.rs.bak`)
2. Delete (cull) the original monolithic source file from `src/` once replacement modules are in place.
3. Avoid duplicate module paths:
   - Do not keep both `foo.rs` and `foo/mod.rs`
   - Keep only one module path strategy for each module
4. Keep public APIs stable by re-exporting from `mod.rs` (or equivalent index file) as needed.

## Cleanup Checklist

- Remove unused imports introduced during the split.
- Verify `mod.rs` (or index file) re-exports all intended public items.
- Update `lib.rs` or parent module declarations to point to the new module path.
- Confirm only the archived `.bak` file remains from the original monolith.
- Run a quick build or targeted tests related to the refactored module.

## Scope Guardrails

- Do not change runtime behavior unless explicitly requested.
- Keep cleanup focused on module-path consistency and API continuity.
- Avoid broad opportunistic refactors while performing cleanup.
