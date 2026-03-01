# Reproducibility Package Directory

Expected package path:

- `database-seed-resources/reproducibility/db-repro-package.json`

This directory is intentionally committed so reproducibility export/import scripts work on a fresh clone without manual folder creation.

## Generate package (source machine)

From `server/` after build:

```powershell
npm run repro:export
```

## Import package (target machine)

From `server/` after build:

```powershell
npm run repro:import
```
