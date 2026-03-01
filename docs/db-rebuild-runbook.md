# DB Rebuild Runbook (Cross-Machine)

This runbook rebuilds Project Memory DB state on a different machine using a reproducibility package.

## 1) Preflight on target machine

From repository root:

```powershell
.\scripts\preflight-machine.ps1
```

Resolve any blocking failures before proceeding.

## 2) Source machine export

From repository root:

```powershell
cd server
npm install
npm run build
npm run repro:export
```

Expected output artifact:

- `database-seed-resources/reproducibility/db-repro-package.json`

Transfer this file to the target machine at the same relative path.

## 3) Target machine baseline setup

From repository root:

```powershell
cd server
npm install
npm run build
```

If you need a fresh local DB before import:

```powershell
cd ..
.\install.ps1 -Component Server -NewDatabase
cd server
```

## 4) Target machine import

From `server/`:

```powershell
npm run repro:import
```

This imports with `--clear` and upserts package contents into the target DB.

## 5) Optional manual CLI

From `server/` after build:

```powershell
node dist/db/reproducibility-package.js export --out ../database-seed-resources/reproducibility/db-repro-package.json
node dist/db/reproducibility-package.js import --in ../database-seed-resources/reproducibility/db-repro-package.json --clear
```

## 6) Round-trip validation

1. Export package from source DB.
2. Import package into clean target DB.
3. Re-export from target DB to a second package path.
4. Compare table checksums and row counts with `compareReproPackages()`.

Expected result:

- `match = true`
- No table checksum/count differences.

## 7) Failure handling

If parity fails:

- Verify both machines run the same migration set and server build version.
- Confirm package path is exactly `database-seed-resources/reproducibility/db-repro-package.json`.
- Re-run import with `--clear`.
- Compare first mismatched table and inspect row-level differences.
- Re-export from source machine and retry.
