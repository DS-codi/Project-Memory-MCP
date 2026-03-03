# Integration Harness Service Contract (Podman-First)

This contract defines the canonical participants for the cross-component integration harness.

- Mandatory runtime: Podman + Podman Compose.
- Lifecycle command policy: install script first (`./install.ps1 -Component ...`) for build/install paths.
- Compose defaults are normative for container lane; local/supervisor lane values are included for parity.

## Canonical Service Table

| Component ID | Service / Process | Ownership (Primary Code Path) | Startup Order | Depends On | Container Endpoint (Default) | Local/Supervisor Endpoint (Default) | Health / Readiness Surface |
|---|---|---|---:|---|---|---|---|
| `mcp-server` | MCP server HTTP transport | `server/` | 1 | none | `http://localhost:3000` | `http://localhost:3457` (from `projectMemory.mcpPort`) | `GET /health`, alias `GET /api/health` |
| `dashboard` | Dashboard API + WebSocket | `dashboard/` | 2 | `mcp-server` | API: `http://localhost:3001`, WS: `ws://localhost:3002` | API: `http://localhost:3001`, WS: `ws://localhost:3002` | `GET /api/health` |
| `supervisor-proxy` | Supervisor proxy/control surface for extension coordination | `supervisor/` | 3 | `mcp-server`, `dashboard` | n/a (host process in current model) | HTTP proxy surface on configured MCP port + control TCP `127.0.0.1:45470` | `GET /health`, `GET /api/health`, SSE `GET /supervisor/heartbeat` |
| `extension-test-runner` | VS Code extension headless lane (`@vscode/test-electron`) | `vscode-extension/` | 4 | `mcp-server`, `dashboard`, `supervisor-proxy` | connects to compose-published ports (`3000`, `3001`, `3002`) | connects to configured local ports | Probe targets: MCP `/health`, Dashboard `/api/health`, Supervisor heartbeat |
| `interactive-terminal-bridge` *(optional)* | Host bridge for container→host interactive terminal routing | `interactive-terminal/` | 5 *(optional gate)* | `mcp-server` | bridge target via `PM_INTERACTIVE_TERMINAL_HOST_PORT` (default `45459`) | runtime listener default `127.0.0.1:9100`; host bridge `0.0.0.0:45459` | TCP reachability + bridge preflight (no HTTP health endpoint) |

## Startup Gate Order

1. `mcp-server` healthy.
2. `dashboard` API healthy and WS endpoint reachable.
3. `supervisor-proxy` heartbeat stream available (or explicitly skipped for container-only lane).
4. `extension-test-runner` starts only after steps 1–3 pass.
5. `interactive-terminal-bridge` required only for scenarios that execute interactive terminal flows from container mode.

## Ownership Rules

- Contract changes to MCP/Dashboard health shape are owned by `server/` and `dashboard/` maintainers.
- Supervisor heartbeat/proxy contract changes are owned by `supervisor/` maintainers.
- Extension lane probe behavior is owned by `vscode-extension/` maintainers.
- Bridge runtime and host-port routing behavior is owned by `interactive-terminal/` maintainers.

## Supervisor Lifecycle Baseline (Contracted)

The supervisor lifecycle state machine for each managed child process is the baseline contract surface and must remain lossless with `supervisor/src/runner/state_machine.rs`.

| State | Entry Condition | Exit Transition(s) | Child Process Ownership Boundary |
|---|---|---|---|
| `Disconnected` | Explicit stop, startup default, or `NeverRestart` failure path | `on_start -> Probing` | Child process may be absent; supervisor must not assume live child PID/session ownership. |
| `Probing` | Supervisor start/retry trigger accepted | `on_probe_success -> Connecting`; `on_probe_failure -> Reconnecting` (or `Disconnected` under `NeverRestart`) | Supervisor owns probe intent only; process launch/attach may still be pending. |
| `Connecting` | Probe success | `on_process_ready -> Verifying`; `on_probe_failure -> Reconnecting` | Supervisor may own transport/session bootstrap; child not yet health-qualified. |
| `Verifying` | Process-ready signal observed | `on_health_ok -> Connected`; `on_probe_failure/on_failure -> Reconnecting` | Child is running but not yet admitted for reconnect/dependent traffic. |
| `Connected` | Health gate passed | `on_failure -> Reconnecting`; `on_disconnect -> Disconnected` | Supervisor owns active child session and dependency-facing connectivity lifecycle. |
| `Reconnecting` | Failure/backoff in effect | `on_retry_elapsed -> Probing`; `on_start -> Probing` | Supervisor owns bounded recovery timer only; no global cascade is allowed by default. |

### Transition Invariants

- Only state-machine transitions (`on_*`) are authoritative for lifecycle advancement.
- `on_disconnect` is idempotent and always resets backoff/attempt counters to prevent orphaned ownership metadata.
- `attempt_count` is reset only on `on_health_ok` or `on_disconnect`.
- Reconnect progression is disallowed until health/readiness contract gates pass (see "Reconnect Gate Contract" below).

### Unit-Level Lifecycle Verification Matrix

The following matrix is the normative unit-verification surface for lifecycle correctness and illegal-transition rejection.

| Verification ID | Current State | Trigger | Expected Next State | Classification | Required Assertion |
|---|---|---|---|---|---|
| `lifecycle_u01` | `Disconnected` | `on_start` | `Probing` | legal transition | emits `state_transition` with `from=Disconnected`, `to=Probing` |
| `lifecycle_u02` | `Probing` | `on_probe_success` | `Connecting` | legal transition | emits `state_transition` with `from=Probing`, `to=Connecting` |
| `lifecycle_u03` | `Probing` | `on_probe_failure` | `Reconnecting` | legal transition | emits `state_transition` with `from=Probing`, `to=Reconnecting` and increments attempt/backoff metadata |
| `lifecycle_u04` | `Connecting` | `on_process_ready` | `Verifying` | legal transition | emits `state_transition` with `from=Connecting`, `to=Verifying` |
| `lifecycle_u05` | `Verifying` | `on_health_ok` | `Connected` | legal transition | emits `state_transition` with `from=Verifying`, `to=Connected` and resets attempt metadata |
| `lifecycle_u06` | `Connected` | `on_failure` | `Reconnecting` | legal transition | emits `state_transition` with `from=Connected`, `to=Reconnecting` |
| `lifecycle_u07` | `Reconnecting` | `on_retry_elapsed` | `Probing` | legal transition | emits `state_transition` with `from=Reconnecting`, `to=Probing` |
| `lifecycle_u08` | `*` | `on_disconnect` | `Disconnected` | legal transition | idempotent: repeated trigger remains `Disconnected` and clears owned child session metadata |
| `lifecycle_i01` | `Disconnected` | `on_health_ok` | no transition | illegal transition | emits `illegal_transition_rejected` with `reason_code=invalid_state_trigger_pair` |
| `lifecycle_i02` | `Connected` | `on_process_ready` | no transition | illegal transition | emits `illegal_transition_rejected` with `reason_code=invalid_state_trigger_pair` |
| `lifecycle_i03` | `Reconnecting` | `on_health_ok` | no transition | illegal transition | emits `illegal_transition_rejected` with `reason_code=invalid_state_trigger_pair` |
| `lifecycle_i04` | `Verifying` | `on_start` | no transition | illegal transition | emits `illegal_transition_rejected` with `reason_code=invalid_state_trigger_pair` |

Illegal-transition rejection invariants:

- Rejected transitions must not mutate `attempt_count`, `backoff_ms`, or owned child/session identity.
- Every rejection event must include `component_id`, `current_state`, `trigger`, and `reason_code=invalid_state_trigger_pair`.
- Rejections in `Connected` and `Reconnecting` must preserve failure-domain isolation (no cross-component restart side effects).

## Failure Domains & Restart Scope (Isolation Rules)

Supervisor recovery behavior MUST classify each fault into one of these domains and enforce the matching restart scope:

| Failure Domain | Restart Scope | Isolation Rule |
|---|---|---|
| `child-local` | `child-local` | Restart only the affected child process/session; never trigger cross-component teardown. |
| `dependency-group` | `dependency-group` | Restart only services in the impacted dependency chain; unrelated components remain healthy. |
| `global` | `global` | Global restart is permitted only when explicit safety escalation criteria are met. |

Required isolation guarantees:

- Restart operations must be bounded to the declared `restart_scope`.
- Supervisor must reject escalation beyond scope unless domain is explicitly `global`.
- Components listed as unaffected in scenario contracts must maintain healthy/readiness status throughout recovery.

### Bounded Restart Policy (Normative)

Each fault-recovery scenario MUST specify `reconnect_policy` with:

- `max_attempts` as a hard retry cap.
- Exponential backoff fields (`initial_backoff_ms`, `max_backoff_ms`, `multiplier`).
- Jitter (`jitter_ratio`) to avoid synchronized retries.
- Cooldown trigger (`cooldown_after_attempts`) and per-domain cooldown floor (`cooldown_by_failure_domain`).

Failure-domain cooldown floors map to `failure_domain`:

- `child-local` -> `cooldown_by_failure_domain.child_local_ms`
- `dependency-group` -> `cooldown_by_failure_domain.dependency_group_ms`
- `global` -> `cooldown_by_failure_domain.global_ms`

When the retry cap is exhausted, recovery must transition to degraded safety handling (see below) rather than unbounded retries.

### Idempotent Stop/Start (Normative)

Each scenario MUST declare `stop_start_policy` and harness execution must honor:

- `idempotent_stop_start = true` for repeated stop/start calls under rapid restart cycles.
- `stop_wait_for_exit_ms` grace period before restart.
- `orphan_child_reap_required = true` so stale child processes are not retained across restarts.
- `start_requires_clean_pid_set = true` so restart is blocked when stale ownership remains.

Repeated stop/start operations must converge to one healthy runtime instance without duplicate/orphan child ownership.

### Reconnect Choreography (Normative)

Reconnect flow ordering is contract-driven by `reconnect_choreography.ordered_events` and defaults to:

1. `session_invalidated`
2. `reconnect_attempt`
3. `readiness_pass`
4. `connectivity_reconnected`

If `invalidate_stale_session_first` is true, stale session context must be invalidated before any reconnect attempt is emitted.

### Safety Escalation & Operator Visibility

Each scenario MUST define `safety_escalation`:

- `degrade_after_max_attempts` and `degrade_after_timeout_ms` gate transition from automated recovery to degraded state.
- `operator_alert_required = true` requires an explicit operator-visible alert event.
- `operator_alert_reason_code` must be emitted in normalized events when escalation occurs.

## Reconnect Gate Contract

Reconnect attempts are not permitted until all configured gate predicates pass for the target component set.

Mandatory gate predicates:

- Latest liveness probe result is pass (`health_check_pass`).
- Latest readiness probe result is pass (`readiness_pass`).
- Minimum consecutive probe-pass count is satisfied (`minimum_consecutive_passes` in `health-readiness.contract.json`).
- Gate timeout has not expired (`gate_timeout_ms`).

If any gate fails, reconnect must be denied with the configured reason code (default: `readiness_gate_blocked`) and no reconnect attempt should be emitted for that component until gate recovery.

## Transport vs Logical Session Lifecycle (Normative)

Reconnect semantics are split across two layers and must remain explicitly decoupled:

| Layer | Ownership Surface | State Anchor | Recovery Trigger | Divergence Rule |
|---|---|---|---|---|
| Transport connectivity | `server/src/transport/http-transport.ts`, `server/src/transport/container-alert-listener.ts`, `server/src/transport/data-root-liveness.ts` | socket/listener reachability + probe responses | container/network interruption, listener restart, probe failure | Transport reconnect does **not** imply logical session validity. |
| Logical session continuity | `server/src/db/session-db.ts`, `server/src/db/workspace-session-registry-db.ts`, `server/src/tools/session-live-store.ts`, `server/src/tools/session-stats.ts` | session lease + replay cursor + dedup identity | lease expiry, stale replay cursor, resume-token rejection | Logical session resume may fail even when transport is healthy. |

Required divergence behavior:

- Transport reconnect success may still result in logical resume denial when lease/token/cursor checks fail.
- Logical session recovery must emit explicit resume outcome (`reconnect_succeeded`, `reconnect_failed`, or full resync required) independent of socket reconnection.
- Probe/liveness recovery must not auto-authorize stale logical sessions; resume handshake remains mandatory.

## Reconnect Handshake Contract (Normative)

All reconnect attempts in Podman lanes MUST use this handshake envelope before message replay:

1. `resume_token` validation (signature + expiry + transport/logical binding).
2. `session_lease` validation (active lease, not expired, scope match).
3. `replay_cursor` validation (cursor monotonicity and replay-window eligibility).
4. Resume decision (`accepted`, `resume_denied`, `replay_required`, or `full_resync_required`).

Contract fields:

- `resume_token`: bound to `{workspace_id, session_id, transport_id}` with explicit expiry reason code (`resume_token_expired`).
- `session_lease`: bounded by lease TTL with expiry reason code (`session_lease_expired`).
- `replay_cursor`: required for incremental replay; stale or out-of-window cursors must reject resume with `replay_cursor_stale`.

## Reconnect Idempotency & Duplicate Suppression (Normative)

Reconnect execution must be idempotent across duplicate attempts and repeated subscription/replay commands.

Mandatory rules:

- Idempotency key = `resume_token_hash + lease_id + replay_cursor + component_id`.
- Duplicate reconnect attempts inside suppression window return prior outcome and correlation context instead of re-running state mutation.
- Duplicate subscriptions are acknowledged as no-op (no second logical subscription registration).
- Duplicate replay payloads are suppressed by cursor/sequence identity (no duplicate downstream emission).

Reason-code requirements:

- `reconnect_duplicate_suppressed` for duplicate reconnect attempts.
- `reconnect_idempotent_replay` for replay de-dup outcomes.

## Composite Health Model (Normative)

The health contract is composite, not probe-singleton. Overall health combines four dimensions:

1. Liveness (process/probe responsiveness)
2. Readiness (admission gate)
3. Dependency health (required upstream/downstream state)
4. Reconnect subsystem health (resume-token/lease/cursor path)

Aggregation policy:

- Overall `healthy`: all four dimensions pass.
- Overall `degraded`: liveness passes but one or more of readiness/dependency/reconnect-subsystem is degraded.
- Overall `unhealthy`: liveness fails, or two-or-more non-liveness dimensions fail past configured thresholds.

`/health` and timeline artifacts must include per-dimension outcomes and a normalized composite reason code (`composite_health_degraded` when degraded).

## Observability Contract (Lifecycle Events)

Lifecycle event streams must emit normalized records for start/stop/restart/reconnect flows with mandatory causal metadata.

Required normalized fields:

- `run_id`
- `component_id`
- `event_type`
- `timestamp`
- `cause`
- `attempt`
- `outcome`

Required lifecycle event coverage:

- Start/stop: `service_start`, `service_stop`
- Restart: `service_restart`
- Reconnect: `reconnect_attempt` and terminal outcome (`reconnect_succeeded` or `reconnect_failed`)

Semantics:

- `cause` identifies why the lifecycle action occurred (failure/recovery trigger code).
- `attempt` is the zero-based or one-based retry counter used by the recovery policy for that component.
- `outcome` captures result state (`started`, `stopped`, `in_progress`, `succeeded`, `failed`, `skipped`, `observed`).

## Machine-Readable Contract Artifacts

- `health-readiness.contract.schema.json`: schema for component liveness/readiness probes (endpoint path, probe interval, timeout, failure threshold, readiness gate).
- `health-readiness.contract.json`: concrete Podman-first probe contract consumed by startup gating checks.
- `run-correlation.contract.schema.json`: schema for normalized run correlation fields (`run_id`, `component_id`, `event_type`, `timestamp`, `reason_code`).
- `run-correlation.contract.json`: concrete event/identity contract used by logs and assertion output.

## Phase 2 Orchestration Artifacts

- `../podman-compose.integration.yml`: Podman Compose topology for integration lane with explicit network, volumes, restart policy, and service dependency gate.
- `../../../scripts/integration-harness-lifecycle.ps1`: deterministic lifecycle entrypoint (`up`, `down`, `restart`, `reset`).
- `../../../scripts/integration-harness-readiness.ps1`: contract-driven startup readiness gate that fails fast on unhealthy required services.
- `../orchestration.md`: operational guide for command usage, install-first alignment, and isolated run paths.