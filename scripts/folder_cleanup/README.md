# Folder Cleanup Toolkit (Non-Destructive)

This toolkit helps clean project folders without hard deletion.

## Safety Guarantees

- Nothing is deleted by these scripts.
- Cleanup candidates are first proposed in a JSON report.
- Staging moves use a project-local recycle bin:
  - `.cleanup-staging/recycle-bin/<run-id>/...`
- One-time scripts can have reference material extracted before staging:
  - `.cleanup-staging/reference-extracts/<run-id>-reference-material.md`

## Date-Modified First Policy

All candidate and organization decisions include:

- `last_modified_utc`
- `age_days`

Older files are listed first so age is one of the primary triage signals.

## Files

- `audit_cleanup.py` - Generates a cleanup proposal report only.
- `stage_cleanup.py` - Moves proposed cleanup candidates into recycle-bin staging.
- `organize_by_category.py` - Previews/applies category-based moves for top-level files in `scripts/` and `docs/` (or `documentation/`).
- `plan_cleanup_audit.py` - Generates a non-destructive Project Memory plan cleanup proposal (finished-not-archived, stale-active, superseded, redundant, related program groups).
- `category_rules.json` - Configurable detection and category rules.

## Typical Workflow

From `Project-Memory-MCP` root:

```powershell
python .\scripts\folder_cleanup\audit_cleanup.py --root .
```

Review the generated report in `.cleanup-staging/reports/`.

Preview staging actions:

```powershell
python .\scripts\folder_cleanup\stage_cleanup.py --root .
```

Apply staging actions (still no delete):

```powershell
python .\scripts\folder_cleanup\stage_cleanup.py --root . --apply
```

Preview category organization:

```powershell
python .\scripts\folder_cleanup\organize_by_category.py --root .
```

Apply category organization:

```powershell
python .\scripts\folder_cleanup\organize_by_category.py --root . --apply
```

Include recently modified files if you intentionally want to reorganize them too:

```powershell
python .\scripts\folder_cleanup\organize_by_category.py --root . --apply --include-recent
```

## Plan Cleanup Proposal Workflow

1. Run the audit in DB-first mode:

```powershell
python .\scripts\folder_cleanup\plan_cleanup_audit.py --workspace-id <workspace-id>
```

1. Optional stale-active recommendation mode (report-only):

```powershell
python .\scripts\folder_cleanup\plan_cleanup_audit.py --workspace-id <workspace-id> --stale-active-days 7
```

When stale-active mode is enabled, the report adds:

- `findings.stale_active_candidates`
- `proposed_actions` entries with `action_type: "pause_stale_active_plan"`
- `approval_gui_batch` payload containing an approval-form `form_request` and response mapping

You can now route the cleanup approval batch directly through MCP with:

```json
{
  "action": "summon_cleanup_approval",
  "workspace_id": "<workspace-id>",
  "cleanup_report_path": ".cleanup-staging/reports/<timestamp>-plan-cleanup-proposal.json"
}
```

Or pass payloads directly from the report:

```json
{
  "action": "summon_cleanup_approval",
  "workspace_id": "<workspace-id>",
  "cleanup_form_request": { "...": "approval_gui_batch.form_request" },
  "cleanup_response_mapping": [ { "...": "approval_gui_batch.response_mapping" } ]
}
```

The action launches `approval_gui`, parses decisions, and returns only the approved `memory_plan` actions to run next (no mutations are executed by the summon action itself).

1. Optional fallback: use an exported JSON payload instead of direct DB reads:

```powershell
python .\scripts\folder_cleanup\plan_cleanup_audit.py --plans-json .\tmp\plans.json --workspace-id <workspace-id>
```

1. Review report output under `.cleanup-staging/reports/` and approve plan mutations explicitly before executing any `memory_plan` actions.

`plan_cleanup_audit.py` never mutates plans. It only proposes actions.
