# Integration Harness Reviewer Readiness Checklist

Run evidence scope:

- Dry-run: `step21dryrun-final`
- Validate-only: `step21validate-final`

## 1) Contracts and topology

- [x] Service contract and readiness contract present under `docs/integration-harness/contracts/`
- [x] Fault/recovery contract includes extension reconnect scenarios
- [x] Podman-first compose topology and lifecycle flow documented in `docs/integration-harness/orchestration.md`

## 2) Matrix tiers and promotion gates

- [x] Matrix entrypoint exists: `scripts/integration-harness-matrix.ps1`
- [x] Tiers finalized: `smoke`, `fault`, `resilience`
- [x] Bounded runtime targets defined per tier
- [x] Required pass criteria encoded in matrix output (`required_pass_criteria`)
- [x] Promotion gates defined for PR / nightly / pre-release with acceptance rules

## 3) Script registration and execution validation (Step 19)

- [x] Build script registered: `Install Server` (`.\install.ps1 -Component Server`)
- [x] Build script registered: `Install Dashboard` (`.\install.ps1 -Component Dashboard`)
- [x] Build script registered: `Install Extension` (`.\install.ps1 -Component Extension`)
- [x] Test script registered: `Integration Harness Matrix Validate All`
- [x] Test script registered: `Integration Harness Matrix DryRun All`
- [x] All above scripts resolve via `memory_plan(action: run_build_script)`
- [x] All above scripts executed successfully from `C:\Users\User\Project_Memory_MCP\Project-Memory-MCP`

## 4) End-to-end dry-run artifacts (Step 21)

- [x] Matrix gate artifact: `.tmp/integration-harness/runs/step21dryrun-final/artifacts/assertions/matrix-gates.json`
- [x] Extension headless assertions: `.tmp/integration-harness/runs/step21dryrun-final/artifacts/assertions/extension-headless-assertions.json`
- [x] Recovery assertions: `.tmp/integration-harness/runs/step21dryrun-final/artifacts/assertions/recovery-assertions.json`
- [x] Extension reconnect assertions: `.tmp/integration-harness/runs/step21dryrun-final/artifacts/assertions/extension-reconnect-assertions.json`
- [x] Fault events log: `.tmp/integration-harness/runs/step21dryrun-final/artifacts/events/fault-events.jsonl`
- [x] Aggregated events: `.tmp/integration-harness/runs/step21dryrun-final/artifacts/events/normalized-events.jsonl`
- [x] Health timeline: `.tmp/integration-harness/runs/step21dryrun-final/artifacts/health/fault-timeline.json`
- [x] Run summaries: `.tmp/integration-harness/runs/step21dryrun-final/artifacts/summary.json` and `.md`

## 5) Reviewer handoff focus

- Confirm matrix gate semantics in `matrix-gates.json` match documented promotion rules.
- Confirm CI workflow lane mapping in `.github/workflows/podman-integration-harness.yml` aligns with smoke/nightly/full-tier intent.
- Confirm no non-Podman runtime dependency is required for canonical path.

## 5a) Phase 4 lane ordering and diagnostics artifacts (Steps 13-14)

- [x] Canonical lane order is documented as unit checks -> dashboard integration checks -> Podman Compose resilience lane in `docs/integration-harness/orchestration.md`
- [x] Failed-run diagnostics explicitly require state timeline artifact `artifacts/health/fault-timeline.json`
- [x] Failed-run diagnostics explicitly require reconnect-attempt telemetry artifact set (`artifacts/assertions/recovery-assertions.json`, `artifacts/summary.json`)
- [x] Failed-run diagnostics explicitly require stale-data marker evidence in `artifacts/events/normalized-events.jsonl` and `artifacts/summary.json`

## 6) Phase 4 release acceptance (non-cascading + deterministic resume)

- [x] `release_acceptance_checklist` defined in `docs/integration-harness/contracts/fault-recovery.contract.json`
- [x] Schema coverage added in `docs/integration-harness/contracts/fault-recovery.contract.schema.json`
- [x] Recovery assertions enforce checklist and emit `release_acceptance` result in `artifacts/assertions/recovery-assertions.json`
- [x] Deterministic resume evidence includes reason codes: `reconnect_duplicate_suppressed`, `reconnect_idempotent_replay`, `replay_ack_guarantee_satisfied`
- [x] Non-cascading recovery evidence rejects `restart_scope=global` and requires passing `failure_domain=dependency-group` + `restart_scope=dependency-group`
- [x] Session recovery guarantees validated: stale-session invalidation ordering, replay ACK guarantee, duplicate reconnect suppression
- [x] Fault tolerance guarantees validated: bounded retry caps/cooldowns, failure-domain isolation, degraded-state operator alerting

