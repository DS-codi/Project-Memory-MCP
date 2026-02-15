# Replay Scenarios

Replay scenario suites define deterministic workflow traces for baseline/candidate comparison.

- Use schema version `1.0`.
- Keep `scenario_id` values in uppercase snake-case.
- Declare `expectations.checks` explicitly for tool ordering, auth outcomes, flow rules, and success signatures.
- Prefer `normalization` options that mask volatile IDs/timestamps for stable drift comparison.
- Replay gate runs can enable `--retry-once true` to triage intermittent flakes without masking deterministic regressions.
- Replay CLI enforces deterministic runtime defaults (`TZ=UTC`, `LANG/LC_ALL=C.UTF-8`) and emits workspace-relative manifest paths.
- Replay CLI remains backward-compatible with legacy `.replay-runs` outputs: artifact resolution uses `--baseline/--candidate` first, then versioned goldens (`v1/<baseline-id>/baseline.norm.json`), then legacy run directories.

Approved normalized baselines are promoted into the versioned store at `../goldens/v1/` via the replay CLI `promote-baseline` command.
