# Monolithic File Refactor Instructions

## Purpose
Systematically split large files into smaller, maintainable modules without changing behavior.

## Target
- Target path: <set to a directory or specific file>
- If a directory is given, refactor the largest files first.

## Workflow
1. Read and outline the target file or directory structure.
2. Evaluate dependencies to determine safe refactoring order.
2. Propose a module split plan with responsibilities.
3. Create new files and move code in small, verifiable steps.
4. For very large files, split the refactor into multiple steps.
4. Preserve public APIs with re-exports or index/mod files.
5. Update imports and references.
6. Add doc comments to public types during the split.
7. Add or update tests covering the split modules.
8. After each phase, create or update documentation summarizing the refactor.
9. Report what moved and why.

## Guardrails
- No behavior changes unless explicitly requested.
- Prefer small cohesive files; avoid new monoliths.
- Keep files under ~300-400 lines when possible.

## Report Format
- Target path
- Files created
- Files modified
- API surface changes (if any)
- Tests added or updated
