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

### Podman Compose Dependency Orchestration for Headless Lane (Phase 3)

The mandatory headless extension lane uses the Podman Compose topology as the single dependency orchestrator for deterministic backend fault tests.

Canonical machine-readable source:

- `docs/integration-harness/contracts/fault-recovery.contract.json` -> `fault_injection_verification_matrix.dependency_orchestration`

Dependency chain used by headless lane:

1. `project-memory` service reaches healthy state (`/health` and `/api/health`).
2. dashboard surfaces (`43001` API, `43002` WS by default) are reachable through compose-published host ports.
3. supervisor heartbeat/proxy check passes (or lane explicitly documents skip criteria).
4. extension headless runner starts only after steps 1-3 pass.
5. `interactive-terminal-bridge` preflight gate is required for container-bridge fault scenarios.

Deterministic fault controls (compose-mediated):

- `stop_service` on compose target `project-memory` for restart-path faults.
- `delay_response` on compose target `project-memory` for bounded outage latency injection.
- `force_health_failure` probes against `43000`/`43001` health surfaces by default for outage simulation.
- `simulate_bridge_preflight_failure` against `interactive-terminal-bridge` for host-alias/port/connectivity preflight rejection paths.
- `inject_bridge_runtime_disconnect` against `interactive-terminal-bridge` for post-allocation per-session recovery diagnostics.

Determinism rules:

- Fault actions execute atomically per scenario and must preserve declared `restart_scope`.
- Readiness/dependency gates must re-pass before reconnect admission.
- Headless lane assertions must include dependency-gate evidence for every backend fault scenario.
- Container-bridge scenarios must include preflight decision traces and recovery diagnostics evidence for pass/fail admission.

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

### Container-Bridge Fault Addendum (Phase 3 Step 11)

Canonical container-bridge fault scenarios are machine-readable in:

- `docs/integration-harness/contracts/fault-recovery.contract.json` -> `fault_injection_verification_matrix.scenarios`

Required scenario keys:

- `container_bridge_preflight_failure`
- `container_bridge_recovery_diagnostics`

Required evidence for these scenarios:

- preflight decision trace (`adapter candidate order`, `selected/fallback/terminal outcome`)
- bridge probe diagnostics (`host alias`, `host port`, `connect timeout/latency`)
- per-session recovery timeline + cross-session isolation assertions

## Phase 1 Extension Reconnect Contract Checkpoints

Phase 1 baseline verification for extension reconnect reliability is documentation-driven and must stay aligned with `contracts/service-contract.md` before fault-lane expansion.

Required checkpoints (sequential):

1. Activation/deactivation lifecycle boundaries are explicitly defined and mapped to extension-owned resources.
2. Combined extension-host/backend reconnect state machine is defined with legal transitions.
3. Idempotent registration/disposal rules are defined for commands, providers, listeners, and polling timers.
4. Minimal persisted recovery state and replay-safety constraints are defined for reload/reconnect recovery.

Gate rule:

- Do not promote Phase 2 reconnect policy tuning or harness fault assertions until all Phase 1 checkpoints are present and internally consistent.

## Phase 1 Terminal Session Lifecycle Contract Checkpoints

Phase 1 also requires a machine-readable + prose lock for interactive terminal session lifecycle behavior across `execute`, `read_output`, and `terminate`.

Required checkpoints (sequential):

1. Canonical session lifecycle states and legal transitions are defined for execute/read/terminate paths.
2. Session identity + request correlation requirements are defined across adapter modes (`local`, `bundled`, `container_bridge`) and retries.
3. `terminate` and `read_output` idempotency behavior is defined for repeated requests and post-termination reads.
4. Interruption directive boundaries are defined for graceful, immediate, and terminated control paths.

Gate rule:

- Do not promote Phase 2 adapter/failure-isolation work until these terminal lifecycle checkpoints are represented in `service-contract.md`, `fault-recovery.contract.json`, and `fault-recovery.contract.schema.json`.

## Phase 2 Reliability Design Checkpoints

Phase 2 reliability design is documentation + contract driven and must be completed sequentially before Phase 3 verification matrix work.

Required checkpoints (sequential):

1. Define bounded extension reconnect retry/backoff and circuit-breaker policy.
2. Define stale-channel detection via heartbeat/health checks and strict safe rebind ordering.
3. Define partial-backend-outage failure isolation so features degrade by domain without extension crash.
4. Define reconnect telemetry schema for attempts, failures, recoveries, and duplicate-registration guard outcomes.

Gate rule:

- Do not promote Phase 3 lane/test design until all Phase 2 checkpoints are represented in `service-contract.md`, `fault-recovery.contract.json`, and `fault-recovery.contract.schema.json`.

## Phase 2 Terminal Adapter & Failure-Isolation Design Checkpoints

Phase 2 terminal adapter/failure-isolation design is contract-driven and must be completed sequentially before Phase 3 terminal lifecycle/race/multi-session verification work.

Required checkpoints (sequential):

1. Define deterministic adapter selection and fallback ordering with explicit preflight outcomes.
2. Define bridge-unavailable behavior and recovery policy without cross-session impact.
3. Define bounded output buffering and truncation semantics with cursor-safe reads.
4. Define per-session isolation guarantees to prevent state leakage between concurrent sessions.

Gate rule:

- Do not promote Phase 3 terminal verification matrix design until all checkpoints above are represented in `service-contract.md`, `fault-recovery.contract.json`, and `fault-recovery.contract.schema.json`.

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

1. **Local conformance lane first (required)**
   - Validate extension-local conformance before any Podman resilience execution:
     - `./run-tests.ps1 -Component Extension`
     - `pwsh -File .\scripts\integration-harness-extension-headless.ps1 -RunId <run_id> -ValidateOnly`
     - `pwsh -File .\scripts\integration-harness-extension-reconnect.ps1 -RunId <run_id> -ValidateOnly`
   - Required local-conformance artifacts:
     - `artifacts/assertions/extension-headless-assertions.json`
     - `artifacts/assertions/extension-reconnect-assertions.json`

1. **Podman bridge resilience lane second (default release gate lane)**
   - Execute Podman-first resilience matrix only after local conformance passes:
     - `pwsh -File .\scripts\integration-harness-matrix.ps1 -RunId <run_id> -Tier resilience -RunProfile podman-compose-default`
   - Required bridge resilience coverage:
     - `container_bridge_preflight_failure`
     - `container_bridge_recovery_diagnostics`
   - Required Podman resilience artifacts:
     - `artifacts/assertions/matrix-gates.json`
     - `artifacts/assertions/recovery-assertions.json`
     - `artifacts/assertions/terminal-diagnostics-bundle.json`
     - `artifacts/events/normalized-events.jsonl`
     - `artifacts/summary.json`

1. **Supervisor diagnostics optional third (non-gating)**
   - `supervisor-mode` runs may be executed only for supplemental investigation and do not satisfy or replace Podman bridge resilience evidence.

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
- Terminal diagnostics bundle: `.tmp/integration-harness/runs/<run_id>/artifacts/assertions/terminal-diagnostics-bundle.json`
- Machine-readable summary: `.tmp/integration-harness/runs/<run_id>/artifacts/summary.json`
- Human-readable summary: `.tmp/integration-harness/runs/<run_id>/artifacts/summary.md`

## Phase 4 Diagnostics Bundle Requirements (Step 12)

Operational readiness requires one deterministic diagnostics bundle per run:

- `artifacts/assertions/terminal-diagnostics-bundle.json`

Bundle sections (all required):

- `adapter_mode_snapshot`
  - captures requested mode, resolved mode, selection source, candidate order, fallback application, and final reason code.
- `preflight_diagnostics`
  - captures probe identity/target, start + completion timestamps, probe latency, probe outcome, and probe reason code.
- `session_timeline`
  - captures `session_id`/`terminal_id` lifecycle transitions (`state_transition`) with ordered timestamps, causes, and reason codes.
- `buffer_statistics`
  - captures per-session buffer envelope metrics (`buffer_bytes_current`, `buffer_bytes_peak`, `bytes_truncated_total`, snapshot payload bytes/lines, cursor start/end).

Validation rules:

- Bundle evidence is mandatory when failed-reconnect diagnostics requirements are evaluated.
- Missing required section or field fails diagnostics gate with `reconnect_failure_diagnostics_missing`.
- Bundle is cross-checked against `normalized-events.jsonl`, `fault-timeline.json`, and recovery assertion outputs for traceability.

## Phase 4 Failed Recovery Diagnostics Artifacts (Step 13)

Diagnostics capture requirements for failed headless reconnect runs are normative and must include state timeline, reconnect-attempt telemetry, registration/disposal counters, and stale-data markers:

- **State timeline artifact (required)**
  - `artifacts/health/fault-timeline.json`
  - Must capture ordered state transitions and causal linkage for the failed window.
- **Reconnect attempts artifact set (required)**
  - `artifacts/assertions/recovery-assertions.json`
  - `artifacts/assertions/extension-reconnect-assertions.json`
  - `artifacts/summary.json`
  - Must capture `attempt`, `backoff_ms`, `cooldown_ms`, `retry_cap`, `retry_exhausted`, and `outcome`.
- **Registration/disposal counters artifact set (required)**
  - `artifacts/assertions/extension-reconnect-assertions.json`
  - `artifacts/summary.json`
  - Must capture `register_attempt_count`, `register_success_count`, `register_suppressed_count`, `dispose_invocation_count`, and `dispose_success_count`.
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
  - Required artifacts: `assertions/recovery-assertions.json`, `assertions/extension-reconnect-assertions.json`, `summary.json`, `summary.md`
- **Registration/disposal counter evidence**
  - Required fields: `register_attempt_count`, `register_success_count`, `register_suppressed_count`, `dispose_invocation_count`, `dispose_success_count`
  - Required artifacts: `assertions/extension-reconnect-assertions.json`, `summary.json`, `summary.md`
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

## Phase 4 Release Acceptance Checklist (Step 14)

Release acceptance is checklist-driven and Podman-first. The canonical checklist contract is:

- `docs/integration-harness/contracts/fault-recovery.contract.json` → `release_acceptance_checklist`

Deterministic resume criteria (must pass):

- required reason codes observed in run evidence: `reconnect_duplicate_suppressed`, `reconnect_idempotent_replay`, `replay_ack_guarantee_satisfied`
- required event evidence observed: `connectivity_reconnected`, `assertion_pass`
- minimum passing scenario count is enforced by `deterministic_resume.minimum_passing_scenarios`

Headless reconnect sustained pass-rate gate (must pass):

- required reconnect scenarios in evaluation window: `extension_backend_restart`, `extension_backend_api_outage`, `extension_endpoint_failure`
- evaluation window: `20` runs
- minimum pass rate: `0.95`
- minimum consecutive passing runs: `5`
- required evidence artifacts: `artifacts/assertions/extension-reconnect-assertions.json`, `artifacts/assertions/matrix-gates.json`, `artifacts/summary.json`
- pass/fail reason codes: `headless_reconnect_pass_rate_sustained` / `headless_reconnect_pass_rate_below_threshold`

Session stability + adapter recovery thresholds (must pass):

- evaluation window: `20` runs
- required artifacts: `artifacts/assertions/terminal-diagnostics-bundle.json`, `artifacts/assertions/extension-reconnect-assertions.json`, `artifacts/assertions/matrix-gates.json`, `artifacts/summary.json`
- session stability ceilings:
  - `max_startup_failure_rate=0.02`
  - `max_unexpected_termination_rate=0.01`
  - `max_cursor_regression_events=0`
  - `max_cross_session_isolation_violations=0`
- adapter recovery thresholds:
  - `minimum_preflight_success_rate=0.98`
  - `max_terminal_preflight_failure_rate=0.02`
  - `max_bridge_probe_latency_p95_ms=1500`
  - `max_bridge_recovery_attempts_per_session=3`
  - `minimum_bridge_recovery_success_rate=0.95`
- gate reason codes:
  - pass: `terminal_session_stability_gate_passed`, `terminal_adapter_recovery_gate_passed`
  - fail: `terminal_session_stability_gate_failed`, `terminal_adapter_recovery_gate_failed`

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

## Phase 4 Rollback and Safe-Mode Policy (Step 15)

Rollback and safe-mode behavior for reconnect reliability regressions is contract-driven via:

- `docs/integration-harness/contracts/fault-recovery.contract.json` -> `release_acceptance_checklist.rollback_safe_mode_policy`

Trigger conditions (any trigger engages safe mode):

- reason code `headless_reconnect_pass_rate_below_threshold`
- reason code `release_acceptance_not_ready`
- reason code `backoff_attempt_limit_exceeded`
- reason code `terminal_session_stability_gate_failed`
- reason code `terminal_adapter_recovery_gate_failed`
- pass-rate regression threshold hit (`minimum_pass_rate=0.95` over `evaluation_window_runs=20`)
- consecutive failure threshold hit (`max_consecutive_failures_before_safe_mode=2`)

Safe-mode actions (required):

- enforce single in-flight reconnect admission
- disable noncritical realtime features
- block mutating extension operations until freshness is re-established
- emit operator-visible alerting

Rollback actions (required):

- revert reconnect policy behavior to last-known-good contract values
- pin current release candidate and block promotion while safe mode is active
- rerun headless reconnect lane before safe-mode exit

Stability-envelope rollback sequence (required order):

1. `enter_safe_mode_and_freeze_promotion`
2. `revert_adapter_selection_policy_to_last_known_good`
3. `enforce_single_inflight_reconnect_and_mutation_block`
4. `rerun_local_conformance_lane`
5. `rerun_podman_bridge_resilience_lane`

Release controls during rollback:

- pin active release candidate
- block new promotion attempts
- require reviewer acknowledgement before unpin

Post-rollback revalidation gate:

- required lane sequence: `local_conformance` -> `podman_bridge_resilience`
- minimum consecutive passing runs: `5`
- required reason codes: `headless_reconnect_pass_rate_sustained`, `terminal_session_stability_gate_passed`, `terminal_adapter_recovery_gate_passed`

Safe-mode exit criteria:

- minimum consecutive passing runs: `5`
- required reason code evidence: `headless_reconnect_pass_rate_sustained`
- manual override is disabled (`manual_override_allowed=false`)

## Phase 5 Extension Headless Lane & CI

### Headless extension lane (preflight-gated)

Run from `Project-Memory-MCP`:

- `pwsh -File .\scripts\integration-harness-extension-headless.ps1 -RunId <run_id>`

Behavior:

- Enforces preflight readiness gate via `scripts/integration-harness-readiness.ps1` before extension tests.
- Runs extension integration test lane via `@vscode/test-electron` (`vscode-extension/src/test/suite/integration/headless-activation-handshake.test.ts`).
- Produces deterministic assertion artifact at `.tmp/integration-harness/runs/<run_id>/artifacts/assertions/extension-headless-assertions.json`.

Mandatory lane checkpoints (must execute in order):

1. **activation**: extension host activation succeeds and baseline backend handshake passes.
2. **disconnect**: deterministic backend outage or fault action produces observable channel degradation/disconnect.
3. **reconnect**: bounded retry + gate-driven reconnect succeeds after fault is released.
4. **rehydration**: post-reconnect route/session state is restored and freshness assertions pass.

Gate rule:

- The headless lane is mandatory for matrix promotion and is considered failed if any checkpoint above is missing, reordered, or fails.

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

## Phase 1 Container Boundary Gates (Container/Runtime Boundary Reliability)

Phase 1 establishes the foundational Podman runtime contracts before any boundary-fault test lanes are added. All gates in this section are required for Phase 2 promotion.

### Phase 1 Gate Checklist

Before promoting beyond Phase 1, all of the following must be documented and internally consistent:

1. **Podman networking contract documented** — `integration_net` bridge network, cross-service DNS-only discovery, port publishing scope, and network boundary invariants are all defined in `docs/integration-harness/contracts/service-contract.md`.
2. **Volume/storage boundary contract documented** — named volume (`harness_runtime_state`), run-scoped bind mounts (data/secrets/artifacts), and storage boundary violation semantics are defined in `docs/integration-harness/contracts/service-contract.md`.
3. **Environment variable boundary contract documented** — declared-only injection rule, required env vars per category, and violation detection mechanism are codified.
4. **Compose topology contracts documented** — canonical service names, `depends_on + service_healthy` ordering, explicit restart policies, and health check declaration requirements are defined.
5. **Readiness/liveness health contract documented** — liveness probe endpoints, readiness gate admission sequence, `minimum_consecutive_passes=2` rule, `max_gate_wait_ms=15000` ceiling, and normalized health response schema are codified.
6. **Container boundary failure taxonomy documented** — four fault layers (runtime, network, storage, application) with fault classes, detection reason codes, and escalation semantics are defined and the `fault_layer` field is required in scenario assertion output.
7. **`container_boundary_failure_taxonomy` added to `fault-recovery.contract.json`** — taxonomy schema is machine-readable with `classification_rule.required_in_scenario_assertion_output=true`.
8. **Schema extended in `fault-recovery.contract.schema.json`** — `containerBoundaryFailureTaxonomy` and `faultLayer` definitions are added; `container_boundary_failure_taxonomy` is a valid property in the schema.

### Phase 1 Gate Rules

- Phase 2 isolation design work must NOT begin until all 8 checkpoints above are green.
- All service names referenced in Phase 1 contracts must match those in `podman-compose.integration.yml`.
- Any change to canonical service names requires a coordinated update across all contracts.

### Phase 1 → Phase 2 Promotion Criteria

Phase 2 is unlocked when:

1. All Phase 1 gate checkpoints are documented.
2. Compose topology contract is reflected in `podman-compose.integration.yml`.
3. Health check declarations in compose file match the probe endpoints defined in the readiness/liveness contract.
4. The four-layer failure taxonomy is machine-readable in `fault-recovery.contract.json` and schema-validated by `fault-recovery.contract.schema.json`.


---

## Phase 2 Container Boundary Gates — Failure Isolation Design

> **Plan**: `plan_mma9q23d_a7a28f45` | **Steps**: 4–7 | **Phase**: Phase 2 — Failure Isolation Design

The following gates must be validated before promoting to Phase 3. All gates apply to `container-mode` runtime. Verify each gate before marking Phase 2 complete.

### Gate Checklist

#### 2.1 — Isolation Policy Document Gate
- [ ] `service-contract.md` contains Section "Phase 2 — Single-Service Fault Isolation Policy"
- [ ] `fault-recovery.contract.json` contains top-level `isolation_policy` object
- [ ] `fault-recovery.contract.schema.json` contains `isolationPolicy` `$def` and `isolation_policy` property reference
- [ ] `forbidden_restart_scope: "global"` is declared in `isolation_policy`
- [ ] `cascade_gate` with `isolation_violation_reason_code` is documented

#### 2.2 — Restart/Recovery Choreography Gate
- [ ] `service-contract.md` contains Section "Phase 2 — Dependency Chain Restart/Recovery Choreography"
- [ ] `fault-recovery.contract.json` contains top-level `dependency_restart_choreography` object
- [ ] `ordered_recovery_events` array defines all 8 sequenced events
- [ ] `staggered_restart_required: true` and rule is defined
- [ ] `readiness_gate_re_evaluation.required: true` and trigger is specified

#### 2.3 — Storage Integrity Gate
- [ ] `service-contract.md` contains Section "Phase 2 — Storage Integrity Checks"
- [ ] `fault-recovery.contract.json` contains top-level `storage_integrity_policy` object
- [ ] `sqlite_integrity_check` with `PRAGMA integrity_check` is defined for `project-memory`
- [ ] `auto_restart_forbidden: true` for storage integrity failures
- [ ] `abrupt_termination_triggers` list is complete (SIGKILL, OOM_kill, host_crash, runtime_forceful_stop)

#### 2.4 — Resource-Boundary Safeguards Gate
- [ ] `service-contract.md` contains Section "Phase 2 — Resource-Boundary Safeguards"
- [ ] `fault-recovery.contract.json` contains top-level `resource_boundary_policy` object
- [ ] `pressure_thresholds` defines `cpu_pressure`, `memory_pressure`, and `io_pressure`
- [ ] `pressure_event` with required fields list is defined
- [ ] `operator_visibility.alert_required: true` is declared

### Phase 2 → Phase 3 Promotion Criteria

All 4 gate checklists above must be fully checked before Phase 3 (Boundary Testing Implementation) may begin. Additionally:

1. `fault-recovery.contract.json` must pass JSON schema validation against `fault-recovery.contract.schema.json`
2. All Phase 1 gates from the Phase 1 gate section must remain satisfied (no regressions)
3. Phase 2 reviewer sign-off checklist (Section 8 in `reviewer-readiness-checklist.md`) must be complete


---

## Phase 3 — Podman Verification Lanes Gate Checklist

This checklist covers Steps 8-11 (Phase 3) of plan `plan_mma9q23d_a7a28f45`. All items must be checked before Phase 3 → Phase 4 promotion.

### Phase 3.1 — Network Fault Verification Lane (Step 8)

- [ ] 3.1.1 Bridge isolation scenario (`podman_bridge_isolation_partition`) executed and `podman_bridge_isolation_test_passed` reason code present in assertion output
- [ ] 3.1.2 DNS lookup failure scenario (`podman_dns_lookup_failure_and_recovery`) executed and `podman_dns_failure_recovery_test_passed` reason code present
- [ ] 3.1.3 Delayed route restoration scenario (`podman_delayed_route_restoration`) executed and `podman_delayed_route_restoration_test_passed` reason code present
- [ ] 3.1.4 All network scenarios record `fault_layer: network` in assertion output
- [ ] 3.1.5 Reconnect latency ≤ `p95=8000ms`, `max=20000ms` verified in `artifacts/health/fault-timeline.json`

**Lane commands:**
```bash
# Bridge isolation
podman-compose -f docs/integration-harness/harness.compose.yml stop project-memory && sleep 3 && podman-compose start project-memory

# DNS fault (use compose network isolation)
podman network disconnect integration_net project-memory && sleep 2.5 && podman network connect integration_net project-memory

# Delayed route restoration
podman network disconnect integration_net project-memory && sleep 2 && sleep 1.5 && podman network connect integration_net project-memory
```

### Phase 3.2 — Storage/Volume Fault Verification Lane (Step 9)

- [ ] 3.2.1 Volume permission denied scenario (`storage_volume_permission_denied`) executed and `storage_permission_denied_test_passed` reason code present
- [ ] 3.2.2 Mount loss scenario (`storage_mount_loss_and_recovery`) executed and `storage_mount_loss_recovery_test_passed` reason code present
- [ ] 3.2.3 Delayed persistence scenario (`storage_delayed_persistence_availability`) executed and `storage_delayed_persistence_test_passed` reason code present
- [ ] 3.2.4 Auto-restart NOT triggered on permission failure scenario — `operator_intervention_required` reason code emitted
- [ ] 3.2.5 Storage integrity check confirmed before any restart admission in mount loss scenario
- [ ] 3.2.6 All storage scenarios record `fault_layer: storage` in assertion output

**Lane commands:**
```bash
# Volume permission test
chmod 000 /var/lib/containers/storage/volumes/project-memory-data/_data && sleep 2 && chmod 755 /var/lib/containers/storage/volumes/project-memory-data/_data

# Mount loss test
podman volume rm --force project-memory-data-test && sleep 3 && podman volume create project-memory-data-test
```

### Phase 3.3 — Startup-Order / Readiness Fault Verification Lane (Step 10)

- [ ] 3.3.1 Dependency timing race scenario (`dependency_timing_race_test`) executed and `dependency_timing_race_test_passed` reason code present
- [ ] 3.3.2 Restart storm suppression scenario (`restart_storm_suppression_test`) executed and `restart_storm_suppression_test_passed` reason code present
- [ ] 3.3.3 Readiness gate timeout under slow-start scenario (`readiness_gate_timeout_under_slow_start`) executed and `readiness_gate_slow_start_test_passed` reason code present
- [ ] 3.3.4 `depends_on` gates confirmed evaluated before service admission in all startup scenarios
- [ ] 3.3.5 Storm suppression cooldown enforced — no excess reconnect attempts during `cooldown_after_storm_ms` window
- [ ] 3.3.6 Readiness gate timeout did NOT trigger auto-restart — service admitted only after health check passed

**Lane commands:**
```bash
# Dependency race
podman-compose -f docs/integration-harness/harness.compose.yml up --no-start project-memory && sleep 3 && podman-compose start project-memory

# Restart storm
for i in {1..5}; do podman-compose restart project-memory && sleep 0.5; done

# Slow start
podman-compose -f docs/integration-harness/harness.compose.yml stop project-memory && sleep 8 && podman-compose start project-memory
```

### Phase 3.4 — Health Validation Thresholds (Step 11)

- [ ] 3.4.1 All 9 required pass reason codes present in final `artifacts/summary.json`
- [ ] 3.4.2 Reconnect latency p99 ≤ 15,000ms in `artifacts/health/fault-timeline.json`
- [ ] 3.4.3 Reconnect latency max ≤ 20,000ms confirmed
- [ ] 3.4.4 Storage integrity check latency ≤ 5,000ms confirmed
- [ ] 3.4.5 Readiness gate open latency ≤ 30,000ms confirmed
- [ ] 3.4.6 Stability threshold: ≥ 3 consecutive passing scenarios in evaluation window of 5 runs
- [ ] 3.4.7 Failure budget: ≤ 1 failure per 5-run window (min pass rate 0.90)

### Phase 3 → Phase 4 Promotion Criteria

Before advancing to Phase 4 (Diagnostics & Release Readiness), ALL of the following must be satisfied:

1. All Phase 3.1 network fault lane checks ✅
2. All Phase 3.2 storage/volume fault lane checks ✅
3. All Phase 3.3 startup-order/readiness fault lane checks ✅
4. All Phase 3.4 health threshold checks ✅
5. `phase3_health_validation_thresholds_passed` reason code present in `artifacts/summary.json`
6. Reviewer sign-off on checklist Section 9 (all subsections 9a–9d)
