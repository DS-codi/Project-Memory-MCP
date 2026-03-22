# Workspace Config Sync

This document describes how the Project Memory extension monitors `.github/agents/` and `.github/instructions/` files, how to configure custom files to participate in sync checking, and how PM-controlled mandatory files work.

---

## Overview

The extension includes a **passive, read-only watcher**. When files in `.github/agents/` or `.github/instructions/` change, or when the MCP server connects, the extension calls `memory_workspace(action: check_context_sync)`. This compares local workspace files against the database — it never writes to the database or auto-imports anything.

Results appear as:
- A **status bar indicator** showing overall sync state for the active workspace
- A **diagnostics tree** in the Project Memory sidebar with per-file status entries

---

## Frontmatter Metadata Contract

Files in `.github/agents/`, `.github/instructions/`, and `.github/skills/` can include YAML frontmatter fields to declare how the sync system should treat them. Files without these fields are ignored by the watcher.

### Fields Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `pm_file_kind` | `agent \| instruction \| skill` | Derived from file extension | Explicitly declares the file type |
| `pm_sync_managed` | `true \| false` | `false` | Opts the file into sync checks. Without this, the file shows as `ignored_local` |
| `pm_controlled` | `true \| false` | `false` | Marks the file as PM-controlled. Workspace copy is report-only; standard import is blocked |
| `pm_import_mode` | `never \| manual` | `never` | `manual` makes an unregistered file eligible for explicit single-file import |
| `pm_canonical_source` | `none \| database_seed_resources` | `none` | Required for PM-controlled files. Identifies the authoritative seed source |
| `pm_canonical_path` | string | — | Path relative to `database-seed-resources/`. Required when `pm_controlled: true` |
| `pm_required_workspace_copy` | `true \| false` | `false` | Marks bootstrap files that must exist on disk in the workspace |

---

## Opting a Custom File into Sync

To have a custom agent or instruction file tracked by the sync system:

**1. Add frontmatter to the file:**

```yaml
---
pm_file_kind: instruction
pm_sync_managed: true
pm_import_mode: manual
---
# My Custom Instructions

...rest of content...
```

**2. Save the file** — the watcher detects the change and runs a sync check automatically.

**3. Check the sync report** — run **"Project Memory: Show Workspace Sync Report"** from the Command Palette (`Ctrl+Shift+P`).

**4. Import if needed** — if the file shows `import_candidate` (no database record), run **"Project Memory: Import Context File to Database"** to register it.

> Files with `pm_sync_managed: false` (or no frontmatter) appear as `ignored_local` and are not tracked.

---

## Understanding Sync Report Statuses

| Status | What it means | What to do |
|--------|--------------|------------|
| `in_sync` | Local file matches DB record (and canonical seed for PM-controlled files) | Nothing — file is healthy |
| `ignored_local` | No sync frontmatter; watcher ignores it | Add `pm_sync_managed: true` to opt in, or leave as-is |
| `local_only` | Managed file exists locally, no DB record, not import-eligible | Check frontmatter; set `pm_import_mode: manual` if import is intended |
| `db_only` | DB record exists, no local workspace copy | Re-deploy via the extension or recreate the file |
| `content_mismatch` | Local and DB versions differ (non-PM-controlled) | Import the local version or revert to DB version |
| `protected_drift` | Mandatory PM-controlled file is missing or differs from canonical seed | Run **"Redeploy Mandatory PM Files from Canonical Source"** |
| `import_candidate` | Has `pm_import_mode: manual`, no DB record | Run **"Import Context File to Database"** |

---

## PM-Controlled Mandatory Files

Some files are managed entirely by Project Memory and should not be edited in workspace copies. These files:

- Have `pm_controlled: true` and `pm_canonical_source: database_seed_resources` in their frontmatter
- Are seeded from `database-seed-resources/` during initial deployment
- Show `protected_drift` if they are missing or differ from the canonical seed

### Mandatory Agents (`.github/agents/`)

| File | Canonical path |
|------|----------------|
| `hub.agent.md` | `database-seed-resources/agents/hub.agent.md` |
| `prompt-analyst.agent.md` | `database-seed-resources/agents/prompt-analyst.agent.md` |
| `shell.agent.md` | `database-seed-resources/agents/shell.agent.md` |

### Mandatory Instructions (`.github/instructions/`)

| File | Canonical path |
|------|----------------|
| `mcp-usage.instructions.md` | `database-seed-resources/instructions/mcp-usage.instructions.md` |
| `hub.instructions.md` | `database-seed-resources/instructions/hub.instructions.md` |
| `prompt-analyst.instructions.md` | `database-seed-resources/instructions/prompt-analyst.instructions.md` |
| `subagent-recovery.instructions.md` | `database-seed-resources/instructions/subagent-recovery.instructions.md` |

> **Do not edit these files locally.** Any local changes will show as `protected_drift` and will be overwritten the next time mandatory files are redeployed from the canonical source.

### Why You Shouldn't Edit `hub.agent.md` (or Other Mandatory Files) Locally

These files define the core orchestration hub and its spoke contract. Project Memory keeps them in lockstep with the database seed to ensure consistent agent behaviour across all workspaces. If you need to customize agent behaviour, create a new non-mandatory `.agent.md` file with `pm_sync_managed: true` and `pm_import_mode: manual` instead.

### Fixing `protected_drift`

Run **"Project Memory: Redeploy Mandatory PM Files from Canonical Source"** from the Command Palette. This reads canonical seed content from `database-seed-resources/` and writes the correct version into the workspace `.github/` directory.

---

## Manual Remediation Commands

All remediation commands are in the Command Palette (`Ctrl+Shift+P` → **"Project Memory: ..."**):

| Command | What it does |
|---------|-------------|
| **Show Workspace Sync Report** | Prints the full sync report to the Output channel |
| **Import Context File to Database** | Imports a single `import_candidate` file after user confirmation; rejects PM-controlled and metadata-invalid files |
| **Redeploy Mandatory PM Files from Canonical Source** | Restores `protected_drift` mandatory files from canonical seed content in `database-seed-resources/` |

---

## Seed-Resource Parity

The canonical seed files in `database-seed-resources/` are the authoritative source for PM-controlled files. When the extension deploys mandatory files or fixes `protected_drift`, it reads directly from this directory.

**Parity rule**: The content of a PM-controlled file in `.github/` must always match its counterpart in `database-seed-resources/`. If they diverge — whether from manual edits or an incomplete deploy — the sync watcher reports `protected_drift`.

To verify that DB-stored instruction content matches the files in `database-seed-resources/`, use:
```
memory_agent(action: list_instructions)
memory_agent(action: get_instruction, filename: "<filename>")
```
Compare the returned content against the corresponding file under `database-seed-resources/instructions/`.
