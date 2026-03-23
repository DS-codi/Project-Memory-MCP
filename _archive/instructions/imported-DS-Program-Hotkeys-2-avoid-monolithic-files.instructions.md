# Avoid Monolithic Files

## Goal
Prevent creation of oversized, multi-responsibility files by favoring small, cohesive modules.

## Rules
- Keep files focused on a single responsibility.
- If a file grows past ~300-400 lines or mixes concerns, split into new modules.
- Add or update exports/index files when splitting.
- Prefer adding new modules over extending already-large files.

## Split Strategy
- Separate by responsibility, feature, or layer.
- Move helper logic into utilities or submodules.
- Keep public APIs stable by re-exporting from the original entry point when needed.

## Refactor Notes
- Evaluate dependencies to determine safe refactoring order.
- Split very large files across multiple steps.
- Add doc comments to public types during the split.
- After each phase, create or update documentation summarizing the refactor.

## Reporting
- Briefly mention what was split and why in your response.
