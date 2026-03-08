---
applyTo: "agents/folder-cleanup-shell.agent.md"
---

# Folder Cleanup Instruction Pack

Use this instruction with cleanup-focused shell work.

## Core Intent

Perform project cleanup without destructive deletion.

This includes two scopes:

- Filesystem cleanup (`scripts/`, `docs/`, `documentation/`, one-time scripts).
- Project Memory plan cleanup (superseded/redundant/finished-not-archived/program grouping).

## Required Behavior

- Always use a report-first workflow.
- Never delete immediately.
- Always preserve a staging path for reversibility.
- Always include date-modified context near the top of findings.
- For plans, use oldest-first triage by `created_at` when available.
- For plans, never run `memory_plan` mutation actions until explicit user approval.

## Standard Command Sequence

From project root:

1. Generate proposal report:

```powershell
python .\scripts\folder_cleanup\audit_cleanup.py --root .
```

2. Preview staging moves:

```powershell
python .\scripts\folder_cleanup\stage_cleanup.py --root .
```

3. Apply staging moves after approval:

```powershell
python .\scripts\folder_cleanup\stage_cleanup.py --root . --apply
```

4. Preview category organization:

```powershell
python .\scripts\folder_cleanup\organize_by_category.py --root .
```

5. Apply category organization after approval:

```powershell
python .\scripts\folder_cleanup\organize_by_category.py --root . --apply
```

## Plan Cleanup Sequence (Approval-First)

1. Generate plan inventory and status context:

- Call `memory_plan(action: "list")`.
- If needed for step-level completion checks, call `memory_plan(action: "get")` on candidate plans.

2. Build report-only proposal (no mutation):

```powershell
python .\scripts\folder_cleanup\plan_cleanup_audit.py --workspace-id <workspace-id>
```

Optional fallback if you already exported plan payloads:

```powershell
python .\scripts\folder_cleanup\plan_cleanup_audit.py --plans-json <path-to-plans-json> --workspace-id <workspace-id>
```

3. Present proposal grouped by:

- `finished_not_archived`
- `superseded_candidates`
- `redundant_groups`
- `related_groups`

4. Ask for explicit approval and execute only approved items.

Allowed mutation actions after approval only:

- `memory_plan(action: "archive")`
- `memory_plan(action: "merge_plans")`
- `memory_plan(action: "create_program")`
- `memory_plan(action: "add_plan_to_program")`
- `memory_plan(action: "link_to_program")`

5. For merge actions, set `archive_sources: false` unless source archival is explicitly approved.

6. Report final mutation log with plan IDs and skipped/unapproved items.

## One-Time Script Rule

- One-time scripts are staged for deletion.
- If a one-time script contains reusable logic, extract reference material first.
- Keep extraction artifacts in `.cleanup-staging/reference-extracts/`.

## Organization Rule

- Keep `scripts/` and `docs/` (or `documentation/`) grouped by category.
- Preserve recently modified files by default unless explicitly approved.

## Audit Output Requirements

Every cleanup summary should include:

- `last_modified_utc`
- `age_days`
- Proposed action (`stage_for_deletion` or `extract_reference_then_stage`)
- Manifest/report file paths

For plan cleanup output, include:

- `created_at` (and fallback `updated_at`) for oldest-first ordering
- Classification bucket (`finished_not_archived`, `superseded`, `redundant`, `related_program_group`)
- Proposed `memory_plan` action payload(s)
- Explicit note that no mutation was executed before user approval
