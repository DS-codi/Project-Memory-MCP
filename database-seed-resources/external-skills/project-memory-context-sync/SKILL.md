---
name: project-memory-context-sync
description: Use this skill when adding, editing, or updating any Project Memory configuration files in this workspace — instruction files (.instructions.md), agent definitions (.agent.md), or skill files (SKILL.md). Ensures all three storage locations stay in sync. USE FOR: creating new instruction files, adding new agent definitions, adding new skills, updating existing files that were previously seeded into the DB.
---

# Project Memory Context Sync

This workspace stores Project Memory configuration in **three places** that must always be kept in sync. If you only update one location, the live system and future re-seeds will diverge.

## The Three Locations

| # | Location | Purpose |
|---|----------|---------|
| 1 | `.github/instructions/` | VS Code picks these up as workspace instructions |
| 2 | `Project-Memory-MCP/database-seed-resources/instructions/` | Source of truth for DB seeding |
| 3 | Live SQLite database | Active runtime — updated by running the seed script |

Same pattern applies for agent and skill files:

| File type | VS Code source | Seed source |
|-----------|---------------|-------------|
| Instructions | `.github/instructions/*.instructions.md` | `database-seed-resources/instructions/` |
| Agent defs | `.github/agents/*.agent.md` | `database-seed-resources/agents/core/` or `agents/spoke/` |
| Skills | `.github/skills/<name>/SKILL.md` | `database-seed-resources/skills/<name>/SKILL.md` (curated) or `database-seed-resources/external-skills/<name>/SKILL.md` (auto-mirrored) |

---

## Workflow: Adding a New Instruction File

### Step 1 — Create in `.github/instructions/`

```
.github/instructions/<name>.instructions.md
```

Required frontmatter:
```yaml
---
applyTo: "**/*"
---
```

Use `applyTo: "agents/hub.agent.md"` (or another glob) if the instructions should only apply to specific files. Use `"**/*"` for workspace-wide rules.

### Step 2 — Copy to seed resources

```powershell
Copy-Item ".github\instructions\<name>.instructions.md" `
          "Project-Memory-MCP\database-seed-resources\instructions\<name>.instructions.md"
```

The file name must be identical in both locations.

### Step 3 — Re-seed the database

```powershell
cd Project-Memory-MCP\server
node dist/db/seed.js
```

Run from `Project-Memory-MCP\server` (where `dist/db/seed.js` exists). The seed is safe to re-run at any time — it upserts, never destructively drops plan/workspace data.

### Step 4 — Verify

```powershell
node dist/db/seed.js 2>&1 | Select-String "instruction"
```

The instruction count should have increased by 1 (e.g. `27 instruction files` → `28 instruction files`).

---

## Workflow: Adding a New Agent Definition

### Step 1 — Create in `.github/agents/`

```
.github/agents/<name>.agent.md
```

Required frontmatter (minimum):
```yaml
---
name: <Name>
description: '<One-line description for agent picker>'
tools: [vscode, execute, read, agent, edit, search, project-memory/*, todo]
---
```

### Step 2 — Copy to seed resources

Core agents (Hub, PromptAnalyst, Shell) go under `core/`:
```powershell
Copy-Item ".github\agents\<name>.agent.md" `
          "Project-Memory-MCP\database-seed-resources\agents\core\<name>.agent.md"
```

Spoke agents go under `spoke/`:
```powershell
Copy-Item ".github\agents\<name>.agent.md" `
          "Project-Memory-MCP\database-seed-resources\agents\spoke\<name>.agent.md"
```

### Step 3 — Re-seed and verify

```powershell
cd Project-Memory-MCP\server
node dist/db/seed.js 2>&1 | Select-String "agent"
```

---

## Workflow: Editing an Existing File

When editing any already-seeded file (e.g. fixing `hub.agent.md`):

1. Edit the file in `.github/` (the working copy).
2. Copy the updated file to `database-seed-resources/` (overwrite) when you are updating a curated seed source.
3. Re-run the seed to push the change into the live DB.

For skills specifically:

- Copy into `database-seed-resources/skills/` when the skill should exist as a curated seed source alongside the workspace copy.
- Otherwise, let the seed pipeline mirror `.github/skills/<name>/SKILL.md` into `database-seed-resources/external-skills/<name>/SKILL.md` automatically.
- If the workspace and curated copies diverge, the seed now picks whichever file has the newer last-edited timestamp. Ties fall back to the curated copy, and the full line-by-line conflict diff is recorded in the DB `event_log`.

```powershell
# Example: syncing an edited hub.agent.md
Copy-Item ".github\agents\hub.agent.md" `
          "Project-Memory-MCP\database-seed-resources\agents\core\hub.agent.md"

cd Project-Memory-MCP\server
node dist/db/seed.js 2>&1 | Select-String "agent|instruction"
```

---

## Key Rules

- **Always edit `.github/` first** — this is the working copy under version control.
- **Never edit `database-seed-resources/skills/` directly** without also updating `.github/` — curated copies must stay identical.
- **Treat `database-seed-resources/external-skills/` as generated mirror output** — it is refreshed by the seed pipeline from `.github/skills/`.
- **Skill conflicts are timestamp-resolved** — when `.github/skills/` and `database-seed-resources/skills/` disagree, the newer file wins during seed; timestamp ties fall back to the curated copy and are audited in `event_log` with the full line-by-line diff payload.
- **Never skip the seed step** — the live DB is what agents actually read at runtime.
- **The seed is always safe to re-run** — it upserts agents, instructions, and skills; it does not touch plans, steps, sessions, or workspace context.
- **File names must match exactly** between `.github/` and `database-seed-resources/`.
