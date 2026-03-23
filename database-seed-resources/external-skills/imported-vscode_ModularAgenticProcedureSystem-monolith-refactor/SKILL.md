---
name: monolith-refactor
description: "Use this skill when splitting large files into smaller, cohesive modules while preserving behavior, API stability, and verifiable progress across refactor phases."
---

# Monolith Refactor Guidelines

Use this skill to systematically split large files into smaller, maintainable modules.

## Purpose

Refactor oversized files without changing behavior.

## Target Selection

- Set a target path to either:
  - a specific file, or
  - a directory
- If a directory is provided, refactor the largest files first.

## Recommended Workflow

1. Read and outline the target file or directory structure.
2. Evaluate dependencies to determine a safe refactor order.
3. Propose a module split plan with clear responsibilities.
4. Create new files and move code in small, verifiable steps.
5. For very large files, divide the work across multiple phases.
6. Preserve public APIs with re-exports or index/mod files.
7. Update imports and references after each movement.
8. Add or update tests that cover the split modules.
9. After each phase, update documentation summarizing what moved and why.
10. Publish a final migration report.

## Guardrails

- No behavior changes unless explicitly requested.
- Prefer small, cohesive files; avoid creating new monoliths.
- Keep files under approximately 300-400 lines when practical.
- Keep module boundaries explicit and responsibility-focused.

## Refactor Report Format

Include the following in completion reports:
- Target path
- Files created
- Files modified
- API surface changes (if any)
- Tests added or updated
