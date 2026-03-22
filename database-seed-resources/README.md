# Database Seed Resources

Canonical, curated source for all seedable static content.

This directory is intentionally manual/curated. Do not bulk-copy archived content into it.

## Seeded content directories

- `agents/`
  - Agent definition files (`*.agent.md`) used by DB seed.
- `instructions/`
  - Instruction files (`*.instructions.md`) used by DB seed.
- `skills/`
  - Curated skill folders containing `SKILL.md` used by DB seed.
- `external-skills/`
  - Auto-mirrored workspace skill folders copied from `.github/skills/*/SKILL.md` during seeding.
- `reproducibility/`
  - DB reproducibility notes/scripts.

`server/src/db/seed.ts` now resolves seed input from this directory (or explicit env overrides) to avoid pulling stale/archived docs from ambient paths.

## Skill seeding behavior

- Normal skill seeding reads both `skills/` and `external-skills/`.
- Workspace skills detected under `.github/skills/<name>/SKILL.md` are mirrored into `external-skills/<name>/SKILL.md` immediately before seeding.
- Mirrored files preserve the workspace file's last-edited timestamp so conflict checks use the original workspace edit time.
- When a workspace skill and a curated `skills/` entry share the same slug but have different content, `server/src/db/seed.ts` compares last-edited timestamps and seeds the newer file.
- If those timestamps are equal, the curated `skills/` entry wins as a deterministic fallback.
- Every content conflict writes a `seed_skill_conflict_resolved` audit record into the existing `event_log` table, including the winner, loser, and the full line-by-line diff payload for the conflicting files.

## Notes

- Add only documents that are accurate to the current system state.
- Plan/workspace runtime docs are not seed content.
