# Database Seed Resources

Canonical, curated source for all seedable static content.

This directory is intentionally manual/curated. Do not bulk-copy archived content into it.

## Seeded content directories

- `agents/`
  - Agent definition files (`*.agent.md`) used by DB seed.
- `instructions/`
  - Instruction files (`*.instructions.md`) used by DB seed.
- `skills/`
  - Skill folders containing `SKILL.md` used by DB seed.
- `reproducibility/`
  - DB reproducibility notes/scripts.

`server/src/db/seed.ts` now resolves seed input from this directory (or explicit env overrides) to avoid pulling stale/archived docs from ambient paths.

## Notes

- Add only documents that are accurate to the current system state.
- Plan/workspace runtime docs are not seed content.
