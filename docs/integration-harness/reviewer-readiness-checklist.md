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
- [x] All above scripts executed successfully from `C:\Users\<username>\Project-Memory-MCP\Project-Memory-MCP`

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

## 5a) Phase 4 lane ordering and diagnostics artifacts (Steps 12-13)

- [x] Canonical lane order is documented as local extension checks -> headless reconnect lane -> Podman-backed integration lane in `docs/integration-harness/orchestration.md`
- [x] Machine-readable stage order is defined as `local_conformance` then `podman_bridge_resilience` in `docs/integration-harness/contracts/fault-recovery.contract.json` (`release_acceptance_checklist.build_test_execution_sequence`)
- [x] Diagnostics bundle requirement is explicitly defined at `artifacts/assertions/terminal-diagnostics-bundle.json` with adapter mode snapshot, preflight diagnostics, session timeline, and buffer statistics
- [x] Failed-run diagnostics explicitly require state timeline artifact `artifacts/health/fault-timeline.json`
- [x] Failed-run diagnostics explicitly require reconnect-attempt telemetry artifact set (`artifacts/assertions/recovery-assertions.json`, `artifacts/summary.json`)
- [x] Failed-run diagnostics explicitly require registration/disposal counters (`register_attempt_count`, `register_success_count`, `register_suppressed_count`, `dispose_invocation_count`, `dispose_success_count`) in `artifacts/assertions/extension-reconnect-assertions.json` and `artifacts/summary.json`
- [x] Failed-run diagnostics explicitly require stale-data marker evidence in `artifacts/events/normalized-events.jsonl` and `artifacts/summary.json`

## 6) Phase 4 release acceptance and rollback safety (Steps 14-15)

- [x] `release_acceptance_checklist` defined in `docs/integration-harness/contracts/fault-recovery.contract.json`
- [x] Schema coverage added in `docs/integration-harness/contracts/fault-recovery.contract.schema.json`
- [x] Recovery assertions enforce checklist and emit `release_acceptance` result in `artifacts/assertions/recovery-assertions.json`
- [x] Sustained pass-rate gate is defined for headless reconnect scenarios (`extension_backend_restart`, `extension_backend_api_outage`, `extension_endpoint_failure`) with evaluation window and threshold
- [x] Session stability + adapter recovery gate thresholds are defined (`session_stability_and_adapter_recovery_gate`) with evaluation window, required artifacts, and pass/fail reason codes
- [x] Rollback/safe-mode policy is defined for reconnect-threshold regressions with explicit trigger reason codes and required safe-mode actions
- [x] Rollback policy explicitly maps stability-envelope regressions (`terminal_session_stability_gate_failed`, `terminal_adapter_recovery_gate_failed`) to ordered rollback sequence + post-rollback lane revalidation
- [x] Rollback policy defines release pin/block behavior plus safe-mode exit criteria (`minimum_consecutive_passing_runs`, `required_reason_code`, `manual_override_allowed`)
- [x] Deterministic resume evidence includes reason codes: `reconnect_duplicate_suppressed`, `reconnect_idempotent_replay`, `replay_ack_guarantee_satisfied`
- [x] Non-cascading recovery evidence rejects `restart_scope=global` and requires passing `failure_domain=dependency-group` + `restart_scope=dependency-group`
- [x] Session recovery guarantees validated: stale-session invalidation ordering, replay ACK guarantee, duplicate reconnect suppression
- [x] Fault tolerance guarantees validated: bounded retry caps/cooldowns, failure-domain isolation, degraded-state operator alerting


## 7) Phase 1 — Container/Runtime Boundary Reliability (plan_mma9q23d_a7a28f45)

### 7a) Podman Runtime Networking and Storage Boundary Contracts

- [ ] Podman networking contract is documented in `docs/integration-harness/contracts/service-contract.md` under "Container/Runtime Boundary Contracts": `integration_net` bridge network name, DNS-only cross-service discovery, `127.0.0.1`-only host port publishing with non-conflicting defaults (`43000`, `43001`, `43002`), and `container_network_contract_violated` reason code.
- [ ] Volume/storage boundary contract is documented: named volume `harness_runtime_state` (driver: local), run-scoped bind mounts for data/secrets/artifacts with correct RO/RW semantics, and `container_storage_boundary_violation` reason code.
- [ ] Environment variable boundary contract is documented: declared-only injection rule, required vars per category (`PM_RUN_ID`, `PM_MCP_PORT`, etc.), and `container_env_boundary_violated` reason code.

### 7b) Podman Compose Topology Contracts

- [ ] Canonical service naming contract documented: `project-memory`, `dashboard`, `readiness-gate`, `interactive-terminal-bridge` map to the correct component IDs.
- [ ] Dependency ordering contract documented: `depends_on + condition: service_healthy` for each service with explicit table of required conditions.
- [ ] Restart policy contract documented: `unless-stopped` for backends, `no` for `readiness-gate`, `on-failure` (max 3) for `interactive-terminal-bridge`.
- [ ] Health check declaration contract documented: healthcheck command patterns, intervals, timeouts, retries, and `start_period` for each non-ephemeral service.

### 7c) Readiness/Liveness Health Contract and Startup Gating

- [ ] Liveness probe contract documented with endpoints, max latency, and failure threshold invariants.
- [ ] Readiness probe contract documented with `minimum_consecutive_passes=2` and `max_gate_wait_ms=15000` thresholds.
- [ ] Cross-service startup gate sequence documented (6 admission steps with mandatory and optional service paths).
- [ ] Normalized health response schema (`status`, `checks[*].status`) documented.
- [ ] `startup-gate-result.json` artifact path and required fields documented.

### 7d) Container Boundary Failure Taxonomy

- [ ] Four fault layers (runtime, network, storage, application) are documented in `service-contract.md` with fault classes, trigger conditions, detection reason codes, and escalation semantics.
- [ ] `container_boundary_failure_taxonomy` section added to `fault-recovery.contract.json` with machine-readable fault layer definitions and `classification_rule.required_in_scenario_assertion_output=true`.
- [ ] `containerBoundaryFailureTaxonomy` and `faultLayer` definitions added to `fault-recovery.contract.schema.json`.
- [ ] `container_boundary_failure_taxonomy` added to `properties` in schema and referenced via `$ref: "#/$defs/containerBoundaryFailureTaxonomy"`.
- [ ] Phase 1 container boundary gates documented in `docs/integration-harness/orchestration.md` with 8 gate checkpoints and promotion criteria to Phase 2.
- [ ] Reviewer confirms: `fault_layer` classification decision tree (runtime → network → storage → application) is internally consistent across prose and machine-readable contracts.


---

## 8) Phase 2 — Failure Isolation Design (plan_mma9q23d_a7a28f45)

> Steps 4–7 of the Container/Runtime Boundary Reliability plan.

### 8a) Isolation Policy

- [ ] `service-contract.md` Phase 2 isolation policy section present
- [ ] `fault-recovery.contract.json` top-level `isolation_policy` object present
- [ ] `fault-recovery.contract.schema.json` `isolationPolicy` `$def` present and `isolation_policy` in `properties`
- [ ] `containment_scope_map` documents `child-local`, `dependency-group`, and `global` scopes
- [ ] `forbidden_restart_scope: "global"` is declared
- [ ] `cascade_gate.isolation_violation_reason_code` is `container_isolation_boundary_crossed`
- [ ] `diagnostic_requirement.fault_layer_field_required: true` declared
- [ ] `pass_reason_code: "container_isolation_enforced"` and `fail_reason_code: "container_isolation_violated"` present

### 8b) Dependency Chain Restart/Recovery Choreography

- [ ] `service-contract.md` Phase 2 choreography section present
- [ ] `fault-recovery.contract.json` top-level `dependency_restart_choreography` object present
- [ ] `fault-recovery.contract.schema.json` `dependencyRestartChoreography` `$def` present
- [ ] `restart_precedence: "depends_on_order_leafs_first"` declared
- [ ] `ordered_recovery_events` array contains all 8 sequenced events in correct order
- [ ] `staggered_restart_required: true` and `staggered_restart_rule` defined
- [ ] `readiness_gate_re_evaluation.required: true` and `gate_pass_required_before_traffic_admission: true` declared
- [ ] `choreography_violation_reason_code` and `pass_reason_code` present

### 8c) Storage Integrity Checks

- [ ] `service-contract.md` Phase 2 storage integrity section present
- [ ] `fault-recovery.contract.json` top-level `storage_integrity_policy` object present
- [ ] `fault-recovery.contract.schema.json` `storageIntegrityPolicy` `$def` present
- [ ] `abrupt_termination_triggers` list is complete (SIGKILL, OOM_kill, host_crash, runtime_forceful_stop)
- [ ] `named_volume_check.required_before_service_admission: true` declared
- [ ] `sqlite_integrity_check.pragma: "PRAGMA integrity_check"` declared for `project-memory`
- [ ] `integrity_check_outcomes.fail.auto_restart_forbidden: true` declared
- [ ] `integrity_check_outcomes.fail.recovery` describes operator-intervention requirement
- [ ] `pass_reason_code` and `fail_reason_code` present

### 8d) Resource-Boundary Safeguards

- [ ] `service-contract.md` Phase 2 resource boundary section present
- [ ] `fault-recovery.contract.json` top-level `resource_boundary_policy` object present
- [ ] `fault-recovery.contract.schema.json` `resourceBoundaryPolicy` `$def` present
- [ ] `resource_limits.enforcement: "compose_deploy_resources_limits"` declared
- [ ] `cpu_pressure` threshold (80%, 30s) and degradation behavior documented
- [ ] `memory_pressure` OOM kill classification and storage integrity pre-check documented
- [ ] `io_pressure` threshold (500ms disk write latency) and degradation behavior documented
- [ ] `pressure_event` with all required fields list declared
- [ ] `recovery` clear threshold (70%, 60s) and `action_on_clear` defined
- [ ] `operator_visibility.alert_required: true` and `alert_reason_code` declared
- [ ] `pass_reason_code` and `fail_reason_code` present

### 8e) JSON Validation

- [ ] `fault-recovery.contract.json` validates against `fault-recovery.contract.schema.json` with no schema errors
- [ ] All Phase 2 new top-level keys are registered in schema `properties` (not just `$defs`)
- [ ] No Phase 1 schema entries broken by Phase 2 additions

---

## 9) Phase 3 — Podman Verification Lanes

> Plan `plan_mma9q23d_a7a28f45` | Steps 8–11 | Phase 3 - Podman Verification Lanes

### 9a) Network Fault Verification Lane (Step 8)

- [ ] `podman_network_fault_verification_matrix` present in `fault-recovery.contract.json`
- [ ] 3 network scenarios defined: `podman_bridge_isolation_partition`, `podman_dns_lookup_failure_and_recovery`, `podman_delayed_route_restoration`
- [ ] All 3 scenarios include `scenario_id`, `fault_class`, `fault_layer: network`, `injection`, `failure_domain`, `restart_scope`, `required_reason_codes`, `required_assertions`, `pass_reason_code`, `fail_reason_code`
- [ ] Bridge isolation scenario scoped to `dependency-group`; DNS failure to `child-local`; delayed route to `dependency-group`
- [ ] `dependency_gate_must_re_evaluate_after_any_network_fault` present in `determinism_rules`
- [ ] `required_artifacts` includes `artifacts/assertions/network-fault-assertions.json`, `artifacts/events/normalized-events.jsonl`, `artifacts/health/fault-timeline.json`, `artifacts/summary.json`
- [ ] Schema def `podmanNetworkFaultVerificationMatrix` present in `fault-recovery.contract.schema.json`
- [ ] Schema property `podman_network_fault_verification_matrix` present in schema `properties` block
- [ ] Phase 3 network fault section appended to `service-contract.md`
- [ ] Phase 3.1 gate checklist added to `orchestration.md`
- [ ] JSON validates against updated schema

### 9b) Storage/Volume Fault Verification Lane (Step 9)

- [ ] `storage_volume_fault_verification_matrix` present in `fault-recovery.contract.json`
- [ ] 3 storage scenarios defined: `storage_volume_permission_denied`, `storage_mount_loss_and_recovery`, `storage_delayed_persistence_availability`
- [ ] All 3 scenarios include required fields matching schema `storageVolumeFaultVerificationMatrix`
- [ ] `storage_volume_permission_denied` has `auto_restart_forbidden: true`
- [ ] `pre_start_integrity_gate_required_before_any_restart_on_storage_fault` present in `determinism_rules`
- [ ] `auto_restart_forbidden_on_permission_failure` present in `determinism_rules`
- [ ] `required_artifacts` includes `artifacts/assertions/storage-fault-assertions.json`
- [ ] Schema def `storageVolumeFaultVerificationMatrix` present in schema
- [ ] Schema property `storage_volume_fault_verification_matrix` present in schema `properties`
- [ ] Phase 3 storage fault section appended to `service-contract.md`
- [ ] Phase 3.2 gate checklist added to `orchestration.md`

### 9c) Startup-Order / Readiness Fault Verification Lane (Step 10)

- [ ] `startup_order_readiness_fault_verification_matrix` present in `fault-recovery.contract.json`
- [ ] 3 scenarios defined: `dependency_timing_race_test`, `restart_storm_suppression_test`, `readiness_gate_timeout_under_slow_start`
- [ ] All 3 include required fields matching schema `startupOrderReadinessFaultVerificationMatrix`
- [ ] `restart_storm_suppression_test` includes `storm_suppression` block with `window_ms`, `max_reconnect_attempts_in_window`, `cooldown_after_storm_ms`
- [ ] `readiness_gate_timeout_under_slow_start` includes `readiness_gate_timeout` block with `timeout_ms` and `timeout_reason_code`
- [ ] `depends_on_gates_must_be_evaluated_before_service_admission` present in `determinism_rules`
- [ ] `restart_storm_policy_must_suppress_excess_reconnect_attempts` present in `determinism_rules`
- [ ] `readiness_gate_timeout_must_not_trigger_auto_restart` present in `determinism_rules`
- [ ] Schema def `startupOrderReadinessFaultVerificationMatrix` present in schema
- [ ] Phase 3 startup-order section appended to `service-contract.md`
- [ ] Phase 3.3 gate checklist added to `orchestration.md`

### 9d) Health Validation Thresholds (Step 11)

- [ ] `health_validation_thresholds` present in `fault-recovery.contract.json`
- [ ] `recovery_latency_thresholds` includes `max_reconnect_latency_ms=20000`, `p95_reconnect_latency_ms=8000`, `p99_reconnect_latency_ms=15000`
- [ ] `stability_thresholds` includes `minimum_consecutive_passing_scenarios=3`, `evaluation_window_runs=5`, `max_failure_budget_per_window=1`, `min_pass_rate=0.9`
- [ ] `pass_fail_criteria` array includes at minimum: reconnect latency, storage integrity check latency, readiness gate latency, scenarios consecutive passing
- [ ] `gate_promotion_criteria.required_reason_codes` contains all 9 Phase 3 pass reason codes
- [ ] `pass_reason_code: "phase3_health_validation_thresholds_passed"` present
- [ ] `fail_reason_code: "phase3_health_validation_thresholds_failed"` present
- [ ] Schema def `healthValidationThresholds` present in schema with required fields validated
- [ ] Phase 3 health thresholds section appended to `service-contract.md`
- [ ] Phase 3.4 gate checklist and promotion criteria added to `orchestration.md`
- [ ] JSON contract validates against updated schema (`npx ajv-cli validate -s fault-recovery.contract.schema.json -d fault-recovery.contract.json`)
