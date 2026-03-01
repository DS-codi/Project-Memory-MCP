# DB Reproducibility Package Format

This document defines the reproducible export package used to recreate Project Memory DB state on another machine.

## Scope

The package includes DB snapshots for:

- `workspaces`
- `programs`, `program_plans`
- `plans`, `phases`, `steps`
- `sessions`, `lineage`
- `context_items`, `research_documents`, `knowledge_files`
- `agent_definitions`, `deployable_agent_profiles`, `category_workflow_definitions`
- `instruction_files`, `skill_definitions`
- `gui_routing_contracts`
- `dependencies`, `build_scripts`

## File Structure

A package is a single JSON document:

```json
{
  "meta": {
    "schema_version": "1.0",
    "exported_at": "ISO-8601",
    "exported_by": "reproducibility-package",
    "workspace_filter": ["optional"],
    "plan_filter": ["optional"]
  },
  "tables": [
    {
      "table": "plans",
      "row_count": 12,
      "checksum": "sha256",
      "rows": [{ "...": "..." }]
    }
  ]
}
```

## Integrity Model

- Rows are canonically ordered before hashing.
- Table-level checksum uses SHA-256 over stable JSON serialization.
- Parity checks compare `row_count` and `checksum` per table.

## Export / Import Entry Points

Implementation file:

- `server/src/db/reproducibility-package.ts`

Core functions:

- `exportReproPackage()`
- `importReproPackage()`
- `compareReproPackages()`

## Compatibility

- DB-first definitions remain authoritative.
- Static repository files are fallback only.
- Import uses `INSERT OR REPLACE` and supports optional `clear_existing` mode.
