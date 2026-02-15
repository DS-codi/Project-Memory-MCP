# Replay Golden Baselines (v1)

This directory stores approved replay golden baselines using the `v1` layout.

## Layout

Each baseline is stored as:

`v1/<baseline-id>/baseline.norm.json`
`v1/<baseline-id>/metadata.json`

Where:

- `baseline.norm.json` is the approved normalized baseline artifact (`ReplayProfileArtifacts` with `profile: "baseline"`).
- `metadata.json` is the approval metadata contract (`replay-golden-baseline-metadata.v1`) including baseline id, promotion timestamp, source candidate artifact path, and scenario metadata.

## Promotion Flow

Use replay CLI command `promote-baseline`:

- Dry-run summary (default, no write):
  - `node tools/replay-cli-runner.js promote-baseline --candidate <path-to-baseline.norm.json> --baseline-id <id>`
- Guarded write (explicit approval):
  - `node tools/replay-cli-runner.js promote-baseline --candidate <path> --baseline-id <id> --apply --approve`
- Overwrite existing baseline intentionally:
  - add `--force`

## Legacy Migration Playbook

Use `migrate-legacy-runs` when your baseline source still lives in historical `.replay-runs/<run-id>/` directories.

1. Dry-run migration from latest legacy run:

`node tools/replay-cli-runner.js migrate-legacy-runs --baseline-id <id> --legacy-runs-root <path-to-.replay-runs>`

1. Dry-run migration from a specific legacy run directory:

`node tools/replay-cli-runner.js migrate-legacy-runs --baseline-id <id> --legacy-runs-root <path> --legacy-run-dir <run-id-or-absolute-path>`

1. Apply migration with explicit approval:

`node tools/replay-cli-runner.js migrate-legacy-runs --baseline-id <id> --legacy-runs-root <path> --apply --approve`

The migration command reuses the same guarded write behavior as `promote-baseline` (`--apply`, `--approve`, optional `--force`).

## Compatibility Guarantees

- Existing scripts using `compare --baseline <file> --candidate <file>` continue to work unchanged.
- `compare` now also supports fallback artifact resolution in this order:
  1) explicit CLI files (`--baseline`, `--candidate`)
  2) versioned golden baseline (`v1/<baseline-id>/baseline.norm.json`) for baseline
  3) legacy run directory artifacts under `--legacy-runs-root` / `--legacy-run-dir`
- `promote-baseline` still accepts `--candidate`; when omitted, it can resolve baseline artifacts from legacy run directories.
