# Database Seed Resources

This directory stores artifacts used to move database state safely between machines.

## Structure

- `reproducibility/`
  - Reproducibility package location used by server scripts:
    - `server/package.json` -> `npm run repro:export`
    - `server/package.json` -> `npm run repro:import`

## Notes

- The package file `db-repro-package.json` is generated during export and imported on a target machine.
- Commit policy for generated package files depends on your team workflow. Keep this directory present so scripts resolve paths consistently.
