# Phase 2 Podman Compose Orchestration

This document defines the integration-lane compose topology and deterministic lifecycle commands.

## Topology Artifact

- Compose file: `docs/integration-harness/podman-compose.integration.yml`
- Required topology controls included:
  - explicit network: `integration_net`
  - explicit volumes: `harness_runtime_state` plus run-scoped bind mounts for data and secrets
  - restart policy: `unless-stopped` for `project-memory`, `no` for `readiness-gate`
  - dependency gates: `readiness-gate` uses `depends_on: condition: service_healthy`

## Deterministic Lifecycle Commands

All commands run from repository root (`Project-Memory-MCP`) and use one deterministic entrypoint:

- `pwsh -File .\scripts\integration-harness-lifecycle.ps1 -Action up -RunId <run_id>`
- `pwsh -File .\scripts\integration-harness-lifecycle.ps1 -Action down -RunId <run_id>`
- `pwsh -File .\scripts\integration-harness-lifecycle.ps1 -Action restart -Component project-memory -RunId <run_id>`
- `pwsh -File .\scripts\integration-harness-lifecycle.ps1 -Action reset -RunId <run_id>`

## Install-First Policy Alignment

- Build/install actions for workspace components remain installer-first:
  - `.\install.ps1`
  - `.\install.ps1 -Component <ComponentName>`
- Lifecycle actions above are orchestration controls and intentionally use `podman compose` through a single script entrypoint.

## Startup Readiness Gate

Startup and restart paths call:

- `scripts/integration-harness-readiness.ps1`

Behavior:

- Parses `docs/integration-harness/contracts/health-readiness.contract.json`
- Checks required components (`required=true` + `readiness_gate=required`)
- Fails fast with component/probe details and non-zero exit code when unhealthy

Health validation thresholds (contracted in `docs/integration-harness/contracts/health-readiness.contract.json`):

- readiness: `required_consecutive_passes=2`, `max_gate_wait_ms=15000`, `failure_threshold_cap=3`
- liveness: `max_probe_timeout_ms=3000`, `failure_threshold_cap=3`, required for reconnect gate
- reconnect: `max_reconnect_latency_ms=20000`, `max_attempts_cap=6`

Reconnect SLO pass/fail criteria (contracted in `reconnect_slo_criteria`):

- Latency thresholds: `p95_reconnect_latency_ms=8000`, `p99_reconnect_latency_ms=15000`
- Failure budget: `max_consecutive_reconnect_failures=2`
- Ratio ceilings: `max_duplicate_reconnect_suppression_ratio=0.05`, `max_stale_token_denial_ratio=0.10`
- Evaluation window: `evaluation_window_runs=20`

Pass/fail semantics:

- **pass** when required liveness/readiness probes satisfy threshold caps and reconnect completes within latency/attempt ceilings.
- **fail** when readiness gate timeout is exceeded, probe failures exceed threshold caps, reconnect latency exceeds `max_reconnect_latency_ms`, or reconnect attempts exceed `max_attempts_cap`.
- **fail** when any `reconnect_slo_criteria.pass_fail.fail_when_any` condition is observed in the run window.

## Phase 1 Extension Reconnect Contract Checkpoints

Phase 1 baseline verification for extension reconnect reliability is documentation-driven and must stay aligned with `contracts/service-contract.md` before fault-lane expansion.

Required checkpoints (sequential):

1. Activation/deactivation lifecycle boundaries are explicitly defined and mapped to extension-owned resources.
2. Combined extension-host/backend reconnect state machine is defined with legal transitions.
3. Idempotent registration/disposal rules are defined for commands, providers, listeners, and polling timers.
4. Minimal persisted recovery state and replay-safety constraints are defined for reload/reconnect recovery.

Gate rule:

- Do not promote Phase 2 reconnect policy tuning or harness fault assertions until all Phase 1 checkpoints are present and internally consistent.

## Phase 2 Reliability Design Checkpoints

Phase 2 reliability design is documentation + contract driven and must be completed sequentially before Phase 3 verification matrix work.

Required checkpoints (sequential):

1. Define bounded extension reconnect retry/backoff and circuit-breaker policy.
2. Define stale-channel detection via heartbeat/health checks and strict safe rebind ordering.
3. Define partial-backend-outage failure isolation so features degrade by domain without extension crash.
4. Define reconnect telemetry schema for attempts, failures, recoveries, and duplicate-registration guard outcomes.

Gate rule:

- Do not promote Phase 3 lane/test design until all Phase 2 checkpoints are represented in `service-contract.md`, `fault-recovery.contract.json`, and `fault-recovery.contract.schema.json`.

## Isolated Data and Secrets Paths

Each run uses deterministic isolated paths under:

- `.tmp/integration-harness/runs/<run_id>/data`
- `.tmp/integration-harness/runs/<run_id>/secrets`
- `.tmp/integration-harness/runs/<run_id>/artifacts`

`reset` removes and recreates the run-scoped tree, preventing cross-run state leakage.

## Phase 3 Fault Injection & Recovery

Fault/recovery orchestration uses contract-driven scenarios from:

- `docs/integration-harness/contracts/fault-recovery.contract.json`

Deterministic execution entrypoints:

- `pwsh -File .\scripts\integration-harness-fault-runner.ps1 -RunId <run_id> -RuntimeMode container-mode`
- `pwsh -File .\scripts\integration-harness-fault-runner.ps1 -RunId <run_id> -RuntimeMode supervisor-mode`
- `pwsh -File .\scripts\integration-harness-recovery-assertions.ps1 -RunId <run_id>`

Default lane policy:

- Podman Compose `container-mode` is the canonical default for restart/reconnect validation.
- `supervisor-mode` remains opt-in for targeted host-process diagnostics and is not required for gate promotion.

Validation lane profile (repeatable):

- `podman-compose-default` is the default run profile for matrix execution.
- Repeatability key is `RunId`; artifacts are emitted under `.tmp/integration-harness/runs/<run_id>/artifacts`.
- Canonical command:
  - `pwsh -File .\scripts\integration-harness-matrix.ps1 -RunId <run_id> -Tier all -RunProfile podman-compose-default`
- Optional diagnostic profiles:
  - `podman-compose-network-chaos` (container-mode diagnostics)
  - `supervisor-diagnostics` (non-gating host-process diagnostics)

Fault runner guarantees:

- Atomic actions per scenario (`kill_process`, `stop_service`, `delay_response`, `force_health_failure`)
- Deterministic tagged events in JSONL at `.tmp/integration-harness/runs/<run_id>/artifacts/events/fault-events.jsonl`
- Podman-first container actions for `container-mode`, with deterministic fail-fast `runtime_unavailable` diagnostics when runtime prerequisites are missing

Recovery assertions guarantees:

- Restart choreography checks for container-mode and supervisor-mode expected transition sequence:
  - `connectivity_connected -> connectivity_degraded -> connectivity_disconnected -> connectivity_reconnected`
- Reconnect policy checks for bounded retry cap, timeout, monotonic backoff progression, and failure-domain cooldown floors
- Reconnect choreography checks stale-session invalidation ordering plus dependency/readiness gate ordering before reconnect
- Partial-failure isolation checks ensuring unaffected components remain healthy
- Proxy-heartbeat decoupling assertion for supervisor partial-failure scenarios
- Escalation checks require degraded-state emission and operator-visible alerting when automated recovery is exhausted

Validation-only and dry-run support:

- `pwsh -File .\scripts\integration-harness-fault-runner.ps1 -ValidateOnly`
- `pwsh -File .\scripts\integration-harness-fault-runner.ps1 -RunId <run_id> -RuntimeMode container-mode -DryRun`
- `pwsh -File .\scripts\integration-harness-recovery-assertions.ps1 -RunId <run_id> -ValidateOnly`

## Phase 4 Rollout Milestone Sequence (Lifecycle-First)

Rollout sequencing is normative and must preserve reconnect correctness during updates. No reconnect behavior delta may ship unless lifecycle and bounded-recovery contract locks are green first.

Milestone order:

1. **Lifecycle contract baseline lock**
   - Freeze and validate lifecycle transition contract surfaces first:
     - `docs/integration-harness/contracts/service-contract.md`
     - `docs/integration-harness/contracts/health-readiness.contract.json`
     - `docs/integration-harness/contracts/health-readiness.contract.schema.json`
   - Validate contract parse and harness script validation flow before any reconnect policy edits.

2. **Failure-domain and bounded-recovery contract lock**
   - Apply and validate failure-domain isolation and bounded restart policy shape:
     - `docs/integration-harness/contracts/fault-recovery.contract.json`
     - `docs/integration-harness/contracts/fault-recovery.contract.schema.json`
   - Confirm degraded-state escalation semantics are present before reconnect choreography tuning.

3. **Dashboard state-machine contract landing (mandatory before UX policy updates)**
   - Land and validate deterministic dashboard recovery state-machine contract invariants before any UI fallback UX tuning:
     - `session_recovery_state` transition legality is enforced (`steady -> degraded -> reconnecting -> resyncing|steady`)
     - stale-session invalidation and reconnect admission gate ordering remain explicit and testable
     - `state_transition_rejected` reason codes are emitted for invalid transitions
   - Explicitly defer these until the state-machine lock above is green:
     - UI fallback rendering behavior changes
     - retry/backoff policy parameter tuning
     - reconnect copy/notification wording updates

4. **Reconnect choreography update window**
   - After milestones 1-3 pass, apply reconnect ordering/retry behavior updates in:
     - `scripts/integration-harness-fault-runner.ps1`
     - `scripts/integration-harness-recovery-assertions.ps1`
   - Preserve deterministic reconnect correctness invariants:
     - stale-session invalidation and dependency/readiness gates occur before reconnect admission
     - resume-token + lease checks occur before replay resume acceptance
     - replay acknowledgment guarantee remains required before resume success

5. **Podman-first regression gating and evidence generation**
   - Execute Podman default fault lane, assertions, and summary generation:
     - `scripts/integration-harness-matrix.ps1`
     - `scripts/integration-harness-event-aggregate.ps1`
     - `scripts/integration-harness-health-timeline.ps1`
     - `scripts/integration-harness-run-summary.ps1`
   - Promote rollout only when lifecycle-contract invariants remain stable under the updated reconnect/retry behavior.

## Phase 4 Build/Test Lane Ordering (Step 13)

Regression execution order is fixed and must not be reordered for release gating:

1. **Lifecycle unit checks first**
   - Validate lifecycle transition legality and rejection invariants:
     - contract/schema parse checks for `service-contract.md`, `health-readiness.contract.json`, `fault-recovery.contract.json`, and `run-correlation.contract.json`
     - `pwsh -File .\scripts\integration-harness-fault-runner.ps1 -ValidateOnly`

1. **Dashboard integration checks second**
   - Validate dashboard/session-recovery choreography and bounded recovery assertions before resilience lane:
     - `pwsh -File .\scripts\integration-harness-matrix.ps1 -RunId <run_id> -Tier smoke -ValidateOnly`
     - `pwsh -File .\scripts\integration-harness-matrix.ps1 -RunId <run_id> -Tier fault -ValidateOnly`
     - `pwsh -File .\scripts\integration-harness-recovery-assertions.ps1 -RunId <run_id> -ValidateOnly`

1. **Podman Compose resilience checks third (default gate lane)**
   - Execute Podman-first resilience path as final gate:
     - `pwsh -File .\scripts\integration-harness-matrix.ps1 -RunId <run_id> -Tier resilience`
   - Required artifacts:
     - `artifacts/assertions/matrix-gates.json`
     - `artifacts/assertions/recovery-assertions.json`
     - `artifacts/events/normalized-events.jsonl`
     - `artifacts/summary.json`

Failure policy:

- Stop on first failure in the current stage.
- Do not execute downstream stages when an upstream stage fails.
- Supervisor-mode runs remain supplemental diagnostics and do not replace dashboard integration checks or Podman resilience gate evidence.

## Phase 4 Artifacts, Telemetry, and Evidence

Per-run artifact bundle root remains deterministic and run-scoped:

- `.tmp/integration-harness/runs/<run_id>/artifacts`

Lifecycle bootstrap now creates required bundle structure for every run:

- `logs/`
- `health/`
- `events/`
- `assertions/`
- `summary.json` (initialized stub, replaced by final run summary)
- `bundle-manifest.json` (deterministic required-path manifest)

Phase 4 command flow (run from `Project-Memory-MCP`):

1. Normalize and aggregate event stream with raw traceability linkage:

  `pwsh -File .\scripts\integration-harness-event-aggregate.ps1 -RunId <run_id>`

1. Generate periodic health snapshots and synthesized fault timeline:

  `pwsh -File .\scripts\integration-harness-health-timeline.ps1 -RunId <run_id>`

1. Generate machine-readable + human-readable run summary for CI/reviewer triage:

  `pwsh -File .\scripts\integration-harness-run-summary.ps1 -RunId <run_id>`

Primary phase-4 outputs:

- Normalized events: `.tmp/integration-harness/runs/<run_id>/artifacts/events/normalized-events.jsonl`
- Traceability index: `.tmp/integration-harness/runs/<run_id>/artifacts/events/traceability-index.json`
- Raw event log copy for auditability: `.tmp/integration-harness/runs/<run_id>/artifacts/logs/raw-fault-events.jsonl`
- Periodic snapshots: `.tmp/integration-harness/runs/<run_id>/artifacts/health/health-snapshots.jsonl`
- Fault timeline: `.tmp/integration-harness/runs/<run_id>/artifacts/health/fault-timeline.json`
- Machine-readable summary: `.tmp/integration-harness/runs/<run_id>/artifacts/summary.json`
- Human-readable summary: `.tmp/integration-harness/runs/<run_id>/artifacts/summary.md`

## Phase 4 Failed Recovery Diagnostics Artifacts (Step 14)

Diagnostics capture requirements for failed runs are normative and must include state timeline, reconnect-attempt telemetry, and stale-data markers:

- **State timeline artifact (required)**
  - `artifacts/health/fault-timeline.json`
  - Must capture ordered state transitions and causal linkage for the failed window.
- **Reconnect attempts artifact set (required)**
  - `artifacts/assertions/recovery-assertions.json`
  - `artifacts/summary.json`
  - Must capture `attempt`, `backoff_ms`, `cooldown_ms`, `retry_cap`, `retry_exhausted`, and `outcome`.
- **Stale-data markers artifact set (required)**
  - `artifacts/events/normalized-events.jsonl`
  - `artifacts/summary.json`
  - Must capture stale-data reasoning and clearance signals (`stale_reason_code`, stale marker latency/replay checks).

Detailed field-level requirements:

- **Event timeline evidence**
  - Required fields in normalized stream: `run_id`, `timestamp`, `event_type`, `component_id`, `cause`, `reason_code`
  - Required artifacts: `events/normalized-events.jsonl`, `health/fault-timeline.json`, `events/traceability-index.json`
- **Failure-domain evidence**
  - Required fields in scenario/assertion outputs: `failure_domain`, `restart_scope`, `isolation_outcome`
  - Allowed domain values: `child-local`, `dependency-group`, `global`
- **Retry telemetry evidence**
  - Required fields: `attempt`, `backoff_ms`, `cooldown_ms`, `retry_cap`, `retry_exhausted`, `outcome`
  - Required artifacts: `assertions/recovery-assertions.json`, `summary.json`, `summary.md`
- **Lease/token state evidence**
  - Required fields on reconnect failure diagnostics: `resume_token_state`, `session_lease_state`, `resume_token_ttl_ms_remaining`, `lease_ttl_ms_remaining`
  - Required artifacts: `events/normalized-events.jsonl`, `assertions/recovery-assertions.json`
- **Replay diagnostics evidence**
  - Required fields on reconnect failure diagnostics: `replay_cursor`, `replay_window_events`, `replay_events_replayed`, `replay_events_deduped`, `replay_ack_count`, `replay_ack_latency_ms_p95`
  - Required artifacts: `events/normalized-events.jsonl`, `summary.json`

These requirements are contracted in:

- `docs/integration-harness/contracts/run-correlation.contract.schema.json`
- `docs/integration-harness/contracts/run-correlation.contract.json`
- `docs/integration-harness/contracts/fault-recovery.contract.schema.json`
- `docs/integration-harness/contracts/fault-recovery.contract.json`

Validation-only support:

- `pwsh -File .\scripts\integration-harness-event-aggregate.ps1 -RunId <run_id> -ValidateOnly`
- `pwsh -File .\scripts\integration-harness-health-timeline.ps1 -RunId <run_id> -ValidateOnly`
- `pwsh -File .\scripts\integration-harness-run-summary.ps1 -RunId <run_id> -ValidateOnly`

## Phase 4 Release Acceptance Checklist (Step 15)

Release acceptance is checklist-driven and Podman-first. The canonical checklist contract is:

- `docs/integration-harness/contracts/fault-recovery.contract.json` → `release_acceptance_checklist`

Deterministic resume criteria (must pass):

- required reason codes observed in run evidence: `reconnect_duplicate_suppressed`, `reconnect_idempotent_replay`, `replay_ack_guarantee_satisfied`
- required event evidence observed: `connectivity_reconnected`, `assertion_pass`
- minimum passing scenario count is enforced by `deterministic_resume.minimum_passing_scenarios`

Session recovery guarantees (must pass):

- stale-session invalidation occurs before reconnect admission and replay resume
- replay acknowledgment guarantee remains satisfied before resume success is emitted
- duplicate reconnect suppression remains idempotent and reason-coded for auditability

Non-cascading recovery criteria (must pass):

- minimum passing scenarios in required failure domain/scope pair:
  - `failure_domain=dependency-group`
  - `restart_scope=dependency-group`
- forbidden restart scope for acceptance: `global`

Fault tolerance guarantees (must pass):

- bounded retry behavior is enforced (`max_attempts`, cooldown floors, and retry exhaustion signaling)
- failure-domain isolation is preserved for unaffected components during recovery runs
- degraded-state escalation remains operator-visible when automated recovery is exhausted

Required release evidence artifacts (run-scoped):

- `artifacts/assertions/matrix-gates.json`
- `artifacts/events/normalized-events.jsonl`
- `artifacts/health/fault-timeline.json`
- `artifacts/summary.json`

Assertion enforcement:

- `pwsh -File .\scripts\integration-harness-recovery-assertions.ps1 -RunId <run_id>` now evaluates `release_acceptance_checklist` and emits summary block `release_acceptance` with pass/fail reason code:
  - pass: `release_acceptance_ready`
  - fail: `release_acceptance_not_ready`

## Phase 5 Extension Headless Lane & CI

### Headless extension lane (preflight-gated)

Run from `Project-Memory-MCP`:

- `pwsh -File .\scripts\integration-harness-extension-headless.ps1 -RunId <run_id>`

Behavior:

- Enforces preflight readiness gate via `scripts/integration-harness-readiness.ps1` before extension tests.
- Runs extension integration test lane via `@vscode/test-electron` (`vscode-extension/src/test/suite/integration/headless-activation-handshake.test.ts`).
- Produces deterministic assertion artifact at `.tmp/integration-harness/runs/<run_id>/artifacts/assertions/extension-headless-assertions.json`.

Dry-run/validation support:

- `pwsh -File .\scripts\integration-harness-extension-headless.ps1 -RunId <run_id> -DryRun`
- `pwsh -File .\scripts\integration-harness-extension-headless.ps1 -RunId <run_id> -ValidateOnly`

### Extension reconnect scenarios (fault injection driven)

Fault contract now includes extension-targeted scenarios:

- `extension_backend_restart` (backend container stop/start + delay)
- `extension_endpoint_failure` (endpoint failure probe + reconnect verification)

Deterministic runner entrypoint:

- `pwsh -File .\scripts\integration-harness-extension-reconnect.ps1 -RunId <run_id>`

Outputs:

- Events: `.tmp/integration-harness/runs/<run_id>/artifacts/events/extension-reconnect-events.jsonl`
- Assertions: `.tmp/integration-harness/runs/<run_id>/artifacts/assertions/extension-reconnect-assertions.json`

Dry-run/validation support:

- `pwsh -File .\scripts\integration-harness-extension-reconnect.ps1 -RunId <run_id> -DryRun`
- `pwsh -File .\scripts\integration-harness-extension-reconnect.ps1 -RunId <run_id> -ValidateOnly`

### Matrix tiers and promotion gates

Single matrix orchestrator entrypoint:

- `pwsh -File .\scripts\integration-harness-matrix.ps1 -RunId <run_id> -Tier smoke|fault|resilience|all`

Tier definitions:

- **smoke**: preflight + extension headless activation/handshake lane
- **fault**: smoke + container-mode fault/recovery choreography + summary artifacts
- **resilience**: fault + extension reconnect fault scenarios

Default tier execution details:

- Fault tier invokes `integration-harness-fault-runner.ps1 -RuntimeMode container-mode` by default.
- Promotion gates consume container-mode evidence; supervisor-mode outputs are supplemental diagnostics only.

Bounded runtime targets (per run):

- **smoke**: <= 15 minutes
- **fault**: <= 25 minutes
- **resilience**: <= 35 minutes

Required pass criteria (per tier):

- **smoke**
  - extension headless assertions report `status=pass`
  - health/readiness contract parses successfully
- **fault**
  - fault runner emits scenario events and exits success
  - recovery assertions report `status=pass`
  - event aggregation, health timeline, and run summary generation complete successfully
- **resilience**
  - extension reconnect events and assertions are generated
  - extension reconnect assertions report `status=pass`

Promotion gates:

- **PR**: requires `smoke` pass
- **nightly**: requires `smoke` + `fault` pass
- **pre-release**: requires `smoke` + `fault` + `resilience` pass

Promotion gate acceptance rules:

- Required tiers for a gate must all report `status=pass`
- Every required tier must meet its bounded runtime target
- Gate result is `fail` if any required tier fails or exceeds target runtime

Matrix artifact:

- `.tmp/integration-harness/runs/<run_id>/artifacts/assertions/matrix-gates.json`

### Podman-first CI path

Workflow:

- `.github/workflows/podman-integration-harness.yml`

Execution model:

- Podman runtime preflight (`podman --version`, `podman info`)
- PR lane defaults to smoke tier
- Nightly lane runs full matrix tier
- Manual dispatch supports `smoke|fault|resilience|all`
- Always uploads `.tmp/integration-harness/runs/**/artifacts/**` on pass/fail
