# DB Rebuild Runbook (Work Machine)

This runbook rebuilds Project Memory DB state from a reproducibility package.

## Prerequisites

- Server dependencies installed (`npm install` in `server/`).
- Server build completed (`npm run build` in `server/`).
- Package file available at:
  - `database-seed-resources/reproducibility/db-repro-package.json`

## Export on Source Machine

From `server/`:

```bash
npm run repro:export
```

This writes:

- `database-seed-resources/reproducibility/db-repro-package.json`

## Import on Target Machine

From `server/`:

```bash
npm run repro:import
```

This performs import with `--clear` and upserts package data into the target DB.

## Optional Manual CLI

Use the reproducibility module directly:

```bash
node dist/db/reproducibility-package.js export --out ../database-seed-resources/reproducibility/db-repro-package.json
node dist/db/reproducibility-package.js import --in ../database-seed-resources/reproducibility/db-repro-package.json --clear
```

## Round-Trip Validation Procedure

1. Export package from source DB.
2. Import package into clean target DB.
3. Re-export from target DB to a second package path.
4. Compare table checksums and row counts using `compareReproPackages()`.

Expected result:

- `match = true`
- No table-level checksum/count differences.

## Failure Handling

If parity fails:

- Verify both machines run the same migration set.
- Re-run import with `--clear`.
- Compare first mismatched table and inspect row-level differences.
- Re-export package from the source machine and repeat.
