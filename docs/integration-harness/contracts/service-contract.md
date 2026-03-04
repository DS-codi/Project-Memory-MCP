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
| `extension-test-runner` | VS Code extension headless lane (`@vscode/test-electron`) | `vscode-extension/` | 4 | `mcp-server`, `dashboard`, `supervisor-proxy` | connects to compose-published host ports (`43000`, `43001`, `43002`) by default | connects to configured local ports | Probe targets: MCP `/health`, Dashboard `/api/health`, Supervisor heartbeat |
| `interactive-terminal-bridge` *(optional)* | Host bridge for container→host interactive terminal routing | `interactive-terminal/` | 5 *(optional gate)* | `mcp-server` | bridge target via `PM_INTERACTIVE_TERMINAL_HOST_PORT` (default `45459`) | runtime listener default `127.0.0.1:9100`; host bridge `0.0.0.0:45459` | TCP reachability + bridge preflight (no HTTP health endpoint) |

## Startup Gate Order

1. `mcp-server` healthy.
2. `dashboard` API healthy and WS endpoint reachable.
3. `supervisor-proxy` heartbeat stream available (or explicitly skipped for container-only lane).
4. `extension-test-runner` starts only after steps 1–3 pass.
5. `interactive-terminal-bridge` required only for scenarios that execute interactive terminal flows from container mode.

## Phase 3 Headless Lane Dependency Orchestration (Podman Compose)

The mandatory headless extension lane uses Podman Compose as the single dependency orchestrator for deterministic backend fault scenarios.

Required dependency chain before fault execution:

1. `project-memory` service health endpoints pass (`/health`, `/api/health`).
2. Dashboard API + WS surfaces are reachable (`43001`, `43002` by default).
3. Supervisor heartbeat/proxy gate passes, unless scenario contract explicitly marks supervisor dependency as optional.
4. Extension headless runner starts only after steps 1–3 are admitted.

Deterministic backend-fault controls for the headless lane:

- `stop_service` on compose service `project-memory` for restart-path validation.
- `delay_response` on compose service `project-memory` for bounded outage latency injection.
- `force_health_failure` against contracted health surfaces (`43000`/`43001` by default) for failover + recovery gating.

Determinism invariants:

- Fault actions execute atomically per scenario and respect declared `restart_scope`.
- Dependency and readiness gates must re-pass before reconnect admission.
- Headless assertions must include explicit dependency-gate evidence for each backend fault scenario.

## Ownership Rules

- Contract changes to MCP/Dashboard health shape are owned by `server/` and `dashboard/` maintainers.
- Supervisor heartbeat/proxy contract changes are owned by `supervisor/` maintainers.
- Extension lane probe behavior is owned by `vscode-extension/` maintainers.
- Bridge runtime and host-port routing behavior is owned by `interactive-terminal/` maintainers.

## VS Code Extension Reconnect Contract (Phase 1)

This section defines the extension-side reconnect baseline for extension-host reload/update scenarios and backend channel restarts.

### Activation/Deactivation Lifecycle Boundaries

Lifecycle ownership is anchored in `vscode-extension/src/extension.ts` and the managed disposables it registers via `context.subscriptions`.

| Lifecycle Stage | Boundary | Owned Resources | Contract Rule |
|---|---|---|---|
| `activate:start` | Extension host invokes `activate(context)` | module-level singleton instances only (`connectionManager`, `dashboardProvider`, status/tree services) | Activation must instantiate one owner instance per service and register each disposable exactly once into `context.subscriptions`. |
| `activate:register` | Command/provider/event wiring | command registrations, tree/webview providers, heartbeat + event subscriptions | Registrations are activation-scoped and must be teardown-safe through VS Code disposal semantics (no out-of-band global registry). |
| `activate:connect` | Service detection + channel start | `ConnectionManager.detectAndConnect/startAutoDetection`, `EventSubscriptionService.start` | Initial connect can fail without activation failure; reconnect path must stay available after partial startup. |
| `deactivate:start` | Extension host invokes `deactivate()` | supervisor client lease, dashboard provider | Deactivation must detach supervisor client best-effort, dispose owned resources, and leave no retained registration/session ownership. |
| `deactivate:complete` | Extension host process shutdown | all context-managed disposables | No reconnect timers/listeners/commands may outlive extension-host lifetime; restart begins from clean activation state. |

Boundary invariants:

- Activation/deactivation boundaries are extension-host scoped and independent from backend process lifecycle.
- Backend reconnect attempts are forbidden from re-registering extension commands/providers after activation completes.
- Deactivation must be idempotent: repeated detach/dispose attempts are tolerated and must not throw uncaught errors.

### Extension + Backend Reconnect State Machine

The extension-side reconnect contract uses explicit combined state for host lifecycle + backend channel health.

| State | Entry Condition | Exit Transition(s) | Notes |
|---|---|---|---|
| `host_activating` | `activate(context)` begins | `on_activation_ready -> host_active_channel_detecting` | registration phase only |
| `host_active_channel_detecting` | services registered; first detect/connect issued | `on_detect_success -> host_active_channel_connected`; `on_detect_failure -> host_active_channel_disconnected` | allows partial startup |
| `host_active_channel_connected` | dashboard channel healthy (MCP optional partial allowed) | `on_channel_loss -> host_active_channel_reconnecting`; `on_host_deactivate -> host_deactivating` | normal steady state |
| `host_active_channel_reconnecting` | SSE/polling detects disconnect/failure | `on_reconnect_success -> host_active_channel_connected`; `on_retry_exhausted -> host_active_channel_degraded`; `on_host_deactivate -> host_deactivating` | bounded retry/backoff applies |
| `host_active_channel_degraded` | reconnect policy exhausted or circuit open | `on_manual_or_heartbeat_reset -> host_active_channel_detecting`; `on_host_deactivate -> host_deactivating` | degraded mode without re-registration |
| `host_active_channel_disconnected` | initial detect fails before steady-state connectivity | `on_detect_retry -> host_active_channel_detecting`; `on_host_deactivate -> host_deactivating` | activation remains successful |
| `host_deactivating` | `deactivate()` entered | `on_dispose_complete -> host_inactive` | disposal/detach only |
| `host_inactive` | deactivation complete | `on_host_activate -> host_activating` | fresh activation required |

Transition invariants:

- `on_host_activate` is legal only from `host_inactive`.
- Any `on_host_deactivate` transition is terminal for the current host session and cancels reconnect progression.
- Channel recovery transitions (`on_reconnect_success`, `on_manual_or_heartbeat_reset`) must not invoke command/provider registration paths.

### Idempotent Registration/Disposal Rules

Registration and disposal safety is mandatory for commands, providers, listeners, and timers.

| Resource Class | Registration Surface | Disposal Surface | Idempotency Rule |
|---|---|---|---|
| Commands | `vscode.commands.registerCommand(...)` in `activate` and command modules | VS Code subscription disposal on host unload | Commands are activation-time only; reconnect flows must never re-register command IDs. |
| Tree/Webview Providers | `registerTreeDataProvider`, `registerWebviewViewProvider` | VS Code subscription disposal | Providers are single-owner per activation; reconnect is data refresh only. |
| Event listeners/subscriptions | `EventSubscriptionService`, `SupervisorHeartbeat`, service `attach(...)` hooks | service `dispose()` and host subscription disposal | Listener attach must remain single-owner; reconnect can restart transport but cannot duplicate listeners. |
| Connection polling/timers | `ConnectionManager.startAutoDetection` + internal timers | `stopAutoDetection` + manager disposal | Poll loop must guarantee one active detect cycle and enforce circuit-breaker reset path without duplicate timers. |

Registration invariants:

- Reconnect handling is transport/session recovery only; it is not an activation replay mechanism.
- Duplicate registration is treated as contract violation even if runtime behavior appears benign.
- Disposal paths must be safe under repeated invocation and partially initialized resources.

### Minimal Persisted Recovery State and Replay-Safety

Extension reload/reconnect recovery is restricted to a minimal persisted state envelope.

Persisted fields (required minimum):

- `workspace_id` (active workspace identity)
- `selected_plan_id` and selected-plan workspace binding when present
- `top_level_tab` (dashboard/plans/operations)
- `always_provided_notes` (string payload used for plan route enrichment)
- `last_known_connection_mode` (`connected|partial|disconnected|degraded`)

Replay-safety constraints:

- Persisted state must be UI-routing/session metadata only; it must not persist command-registration or listener-registration state.
- Rehydrate path restores selection/view state first, then performs fresh backend fetch; stale cached payloads are advisory and not authoritative.
- Reconnect/reload must not replay side-effecting actions automatically (no implicit command execution from persisted state).
- If persisted selection targets missing workspace/plan, recovery must fall back to safe defaults and clear invalid selection.

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

## Dashboard Session Recovery Contract (Phase 1)

Podman-first contract for dashboard runtime behavior during connection loss and resume.

### Session State Boundaries

The dashboard must persist and rehydrate this bounded session shape:

- `auth/session`: authenticated session identity and lease context used for resume validation.
- `route_context`: active workspace/plan route state.
- `filters`: applied dashboard filters that affect visible plans and activity streams.
- `pending_actions`: count and metadata for in-flight actions awaiting acknowledgement.

Boundary rule: reconnect recovery is allowed to invalidate caches only inside the active workspace and plan boundary, unless a full-resync reason code is emitted.

### Snapshot Schema

Canonical snapshot payload:

```json
{
	"snapshot_version": "v1",
	"captured_at": "<iso8601>",
	"boundary": {
		"workspace_id": "<workspace_id>",
		"plan_id": "<plan_id?>",
		"auth_session_id": "<session_id?>",
		"route_context_key": "<route-key>",
		"filter_hash": "<stable-filter-hash>",
		"pending_action_count": 0
	},
	"reconnect_state": "connected|reconnecting|degraded|recovered",
	"stale_data": false,
	"stale_reason_code": "<optional_reason_code>"
}
```

### Rehydration Ordering

Rehydration order is strict and must remain deterministic after reload or reconnect:

1. `auth_session`
2. `route_context`
3. `filters`
4. `pending_actions`
5. `query_invalidation`
6. `resume_events`

Ordering invariant: `resume_events` processing is forbidden before `query_invalidation` completes for the active boundary.

### Reconnect UI State Machine

The dashboard UI state machine is constrained to:

- `connected`: normal stream operation.
- `reconnecting`: transport lost or reconnect attempt observed.
- `degraded`: reconnect exceeds degraded threshold without recovery.
- `recovered`: reconnect handshake accepted and invalidation queued.

Required transitions:

- `connected -> reconnecting` on stream error, disconnect, or reconnect-attempt event.
- `reconnecting -> degraded` when degraded timeout elapses without recovery.
- `reconnecting|degraded -> recovered` on reconnect success event.
- `recovered -> connected` after boundary cache invalidation + first post-recovery state event.

### Stale-Data Signaling & Invalidation Triggers

The dashboard must mark data stale during `reconnecting`, `degraded`, and initial `recovered` state.

Cache invalidation triggers on `connectivity_reconnected`:

- `['workspaces']`
- `['workspace', workspace_id]`
- `['plans', workspace_id]`
- `['plan', workspace_id, plan_id]` when `plan_id` is present
- `['lineage', workspace_id, plan_id]` when `plan_id` is present

Stale marker clearance condition: clear stale only after a post-recovery event confirms refreshed state (`workspace_updated` or `step_updated`) within boundary.

### Post-Recovery Data-Freshness Validation (Phase 3)

The integration harness must evaluate freshness checks after `connectivity_reconnected` using the machine-readable contract at `fault-recovery.contract.json -> data_freshness_validation`.

| Check ID | Metric | Threshold | Pass Rule | Fail Rule |
|---|---|---:|---|---|
| `route_restore_latency` | `route_restore_latency_ms` | `<= 2000` | Route context restored within recovery window | Threshold exceeded (`route_restore_latency_exceeded`) |
| `session_rebind_latency` | `session_rebind_latency_ms` | `<= 3000` | Session lease/rebind completes within recovery window | Threshold exceeded (`session_rebind_latency_exceeded`) |
| `first_fresh_event_latency` | `first_fresh_event_latency_ms` | `<= 5000` | First post-recovery fresh state event observed in time | Threshold exceeded (`fresh_event_latency_exceeded`) |
| `stale_marker_clear_latency` | `stale_marker_clear_latency_ms` | `<= 6000` | Stale marker clears after boundary refresh | Threshold exceeded (`stale_marker_clear_latency_exceeded`) |
| `stale_event_replay_count` | `stale_event_replay_count` | `<= 0` | No stale replay emissions after reconnect | Any stale replay (`stale_event_replay_detected`) |

Global pass/fail gate:

- Pass when all checks satisfy thresholds within `post_recovery_window_ms=15000`.
- Fail when any threshold is exceeded or route/session state remains stale past the post-recovery window.

### Backend Outage/Restart Scenario Set (Phase 3)

Phase 3 reconnect validation for extension reliability requires both outage and restart scenario coverage in `fault-recovery.contract.json`.

Mandatory scenario set:

| Scenario ID | Fault Model | Required Recovery Outcome | Contracted Signals |
|---|---|---|---|
| `extension_backend_api_outage` | backend API/readiness outage is injected for extension lane dependencies | extension transitions through degraded/disconnected and regains healthy reconnect within bounded retry policy | `connectivity_degraded`, `connectivity_disconnected`, `reconnect_attempt`, `dependency_gate_pass`, `readiness_pass`, `connectivity_reconnected` |
| `extension_backend_restart` | backend service stop/start with deterministic hold + delay | extension regains connectivity after restart without global restart escalation | `session_invalidated`, `reconnect_attempt`, `dependency_gate_pass`, `readiness_pass`, `connectivity_reconnected` |

Scenario invariants:

- Both scenarios are required for Phase 3 matrix acceptance; restart-only evidence is insufficient.
- `failure_domain` and `restart_scope` must remain bounded to `dependency-group`.
- Recovery success requires reconnect choreography ordering (`session_invalidated -> reconnect_attempt -> dependency_gate_pass -> readiness_pass -> connectivity_reconnected`).
- Scenario failure must emit operator-visible escalation when retries/timeouts are exhausted.

### Mandatory Headless Extension Lane (Phase 3)

The extension verification lane is mandatory and must cover activation, disconnect, reconnect, and rehydration as one deterministic sequence.

Required lane stages:

1. `activation`: extension activates and initial health handshake succeeds.
2. `disconnect`: backend fault injection drives channel degradation/disconnect.
3. `reconnect`: bounded retry + readiness/dependency gates produce `connectivity_reconnected`.
4. `rehydration`: post-reconnect route/session state is restored and freshness checks pass.

Lane invariants:

- Stage order is strict and cannot be skipped or parallelized.
- Success requires both transport recovery and data-freshness recovery.
- Any stage failure is a lane failure and blocks matrix promotion.

### Component-Level Degradation Isolation (Phase 2)

Degraded-state handling must isolate by data domain so unaffected dashboard views continue to operate.

Canonical UI query domains:

- `workspace` -> `['workspace', workspace_id]`
- `plans` -> `['plans', workspace_id]`
- `plan` -> `['plan', workspace_id, plan_id]`
- `lineage` -> `['lineage', workspace_id, plan_id]`

Isolation rules:

- `connectivity_degraded` may include `degraded_domains` (or alias `failed_domains`) as the authoritative failure-domain list.
- Domains listed in `degraded_domains` must be marked stale/degraded; domains not listed remain healthy and continue rendering.
- If degraded domains are omitted, infer from scope (`workspace_id` -> `workspace`, `plans`; `plan_id` -> `plan`, `lineage`), then fall back to all domains only when scope is missing.
- `connectivity_reconnected` must reset all domain states to healthy before post-recovery transition to `connected`.

### Extension Failure Isolation and Safe Degradation (Phase 2)

Partial backend outage must degrade extension capabilities by feature domain without crashing extension host activation/session state.

Feature-domain degradation map:

- `command_execution` -> mutation commands switch to guarded no-op with user-visible degraded reason.
- `plan_reads` -> cached/stale read-only fallback allowed.
- `event_stream` -> stream marked unavailable; polling fallback may continue.
- `diagnostics` -> local diagnostics/log emission remains enabled.

Isolation rules:

- A failure in one feature domain must not force global extension deactivate/reload.
- Domain-level failure updates extension connection mode to `partial` or `degraded` and emits domain-specific reason code.
- Commands/providers/listeners stay registered; only backend-bound operations are gated or downgraded.
- Unhandled backend exceptions must be converted to typed degraded outcomes and must not propagate as extension-host crashes.

Recovery rules:

- Domain state transitions from `degraded` to `healthy` only after successful rebind + readiness pass for that domain dependency.
- On recovery, queued non-destructive reads may replay; mutation commands require explicit fresh backend confirmation.

### Dashboard Listener Lifecycle Idempotency (Phase 2)

Dashboard realtime subscriptions must remain idempotent across reconnect and hot-reload cycles.

Rules:

- EventSource lifecycle is single-owner: setup always closes any pre-existing stream before creating a new stream.
- Cleanup must detach event listeners and close transport to prevent duplicate callback registration.
- Event processing is deduplicated by event `id` using a bounded in-memory suppression window.
- Duplicate events inside suppression window are no-op and must not trigger duplicate invalidations or UI side effects.

### Dashboard Retry/Backoff Policy (Phase 2)

Dashboard reconnect handling must use bounded retry/backoff metadata for both network calls and realtime channel recovery signals.

Policy defaults:

- `initial_backoff_ms`: `1000`
- `max_backoff_ms`: `30000`
- `multiplier`: `2`
- `jitter_ratio`: `0.2`
- `max_attempts`: `8`

Rules:

- `reconnect_attempt` payload fields (`attempt`, `next_backoff_ms`, `reason_code`) are accepted when present but clamped to policy bounds.
- Missing reconnect metadata must derive deterministic bounded backoff from policy defaults.
- `connectivity_reconnected` resets retry state to baseline (`attempt=0`, `next_backoff_ms=initial_backoff_ms`).
- Retry state must remain UI-visible for diagnostics and operator triage during degraded/reconnecting windows.

### Extension Backend Reconnect Retry + Circuit-Breaker Policy (Phase 2)

Extension host reconnect attempts to backend channels must use a bounded retry policy and explicit circuit-breaker states.

Policy defaults (extension channel):

- `max_attempts`: `6`
- `initial_backoff_ms`: `500`
- `max_backoff_ms`: `8000`
- `multiplier`: `2`
- `jitter_ratio`: `0.2`
- `cooldown_after_attempts`: `3`
- `cooldown_ms`: `2000`

Circuit-breaker defaults:

- `state`: `closed|open|half_open`
- `open_after_consecutive_failures`: `3`
- `open_min_duration_ms`: `6000`
- `half_open_probe_max_attempts`: `1`
- `fail_fast_when_open`: `true`

Rules:

- Retry progression is exponential with jitter and is clamped to `max_backoff_ms`.
- When retry count reaches `max_attempts`, transition to `host_active_channel_degraded` and emit `backoff_attempt_limit_exceeded`.
- When the circuit is `open`, reconnect attempts fail fast with `circuit_breaker_open` until `open_min_duration_ms` elapses.
- Half-open probe failure reopens the circuit and restarts the open timer; probe success closes circuit and resets attempt counters.
- Reconnect success always resets circuit state to `closed` and retry counters to baseline.

### Stale-Channel Detection and Safe Rebind Sequence (Phase 2)

Extension reconnect flow must actively detect stale or half-open channels and execute a deterministic rebind sequence.

Stale-channel detection policy:

- Heartbeat interval: `5000ms`
- Heartbeat miss threshold: `2` consecutive misses
- Health recheck timeout: `3000ms`
- Maximum stale confirmation window: `12000ms`

Safe rebind sequence (strict order):

1. Mark channel `suspect` after heartbeat misses exceed threshold.
2. Run health-check probe; if pass, clear suspect state and continue current binding.
3. If health-check fails, mark channel `stale`, emit `channel_stale_detected`, and stop outbound writes.
4. Invalidate transport/session binding (`session_invalidated`) before creating a new transport.
5. Create new transport binding and resume handshake (`reconnect_attempt`).
6. Admit traffic only after readiness pass and reconnect outcome `accepted`.

Rebind invariants:

- At most one active transport binding per extension session.
- Old channel must be closed before new channel listener attach to prevent duplicate callbacks.
- Rebind failure returns to bounded retry policy; no direct re-registration of commands/providers is allowed.

### Pending Action UX Fallback (Phase 2)

During transient outages, pending user actions must transition through explicit fallback modes to avoid lost intent and unsafe replay.

Fallback modes:

- `idle`: normal operation, no pending action backlog.
- `buffering`: outage in progress with pending actions retained for replay.
- `read_only`: outage in progress with zero pending backlog; UI should prevent new mutation actions.
- `draining`: transport recovered and pending action backlog is being acknowledged/flushed.

Mode transitions:

- `connected -> reconnecting|degraded`: enter `buffering` when `pending_action_count > 0`, otherwise `read_only`.
- `reconnecting|degraded -> recovered`: enter `draining` when pending actions remain; otherwise `idle`.
- `recovered -> connected`: only after first post-recovery state event (`workspace_updated` or `step_updated`) and pending backlog reset.

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

## Interactive Terminal Session Lifecycle State Machine (Normative)

Canonical lifecycle states for `execute`, `read_output`, and `terminate` are:

- `session_absent`: no session has been allocated for the requested terminal identity.
- `session_starting`: `execute` has been admitted and runtime launch is in progress.
- `session_running`: runtime launch succeeded and the session accepts output reads.
- `terminate_requested`: termination has been accepted and shutdown is in progress.
- `session_terminated`: process/session exit is observed and final buffered output is stable.
- `session_failed`: startup failed before reaching running state.

Transition contract:

| Trigger | Allowed From | Next State | Contract Outcome |
|---|---|---|---|
| `execute` | `session_absent`, `session_terminated`, `session_failed` | `session_starting` | session allocation + launch admission |
| `read_output` | `session_starting`, `session_running`, `terminate_requested`, `session_terminated`, `session_failed` | unchanged | buffered output snapshot/cursor response |
| `terminate` | `session_starting`, `session_running` | `terminate_requested` | termination request acknowledged |
| `process_spawned` (internal) | `session_starting` | `session_running` | runtime admitted |
| `process_exit` (internal) | `session_running`, `terminate_requested` | `session_terminated` | final-state stabilization |
| `startup_failure` (internal) | `session_starting` | `session_failed` | launch failure recorded |

State-machine invariants:

- `read_output` is observational and must never mutate lifecycle state.
- `terminate` may only advance toward shutdown and never re-enter running state.
- Invalid transitions must be rejected with a deterministic reason code (`terminal_session_invalid_transition`).

### Session Identity & Correlation Requirements (Normative)

Session identity and request correlation must remain deterministic across adapter modes (`local`, `bundled`, `container_bridge`) and retry attempts.

Required identity fields:

- Request scope: `request_id`, `trace_id`, `workspace_id`, `adapter_mode`, `retry_attempt`.
- Session scope: `session_id`, `terminal_id`, `transport_id`, `component_id`.

Contract rules:

- `execute` mints `session_id` and `terminal_id` once; both must remain stable for all subsequent `read_output` and `terminate` calls.
- Adapter fallback/reselection is allowed only before session allocation; once `session_id` exists, cross-mode rebinding for the same session is forbidden.
- Retries for the same logical request must preserve `request_id` and `trace_id` and increment `retry_attempt` monotonically.
- Queue/rate-limit reroute behavior must preserve lineage by emitting parent correlation (`rerouted_from_session_id`) on the new session envelope.

Deterministic rejection reasons:

- `terminal_session_correlation_missing`
- `terminal_session_adapter_mode_mismatch`
- `terminal_session_retry_context_invalid`

### Deterministic Adapter Selection & Fallback Ordering (Phase 2)

Adapter resolution and fallback ordering must complete before session allocation and remain deterministic for every `execute` admission.

Resolution order (authoritative):

1. Runtime override (`runtime.adapter_override`).
2. Environment override (`PM_TERM_ADAPTER_MODE`).
3. Container inference (`PM_RUNNING_IN_CONTAINER=true` -> `container_bridge`).
4. Default mode (`local`).

Candidate fallback order by requested mode:

| Requested Mode | Ordered Candidate Set |
|---|---|
| `local` | `local` -> `bundled` |
| `bundled` | `bundled` -> `local` |
| `container_bridge` | `container_bridge` -> `bundled` -> `local` |

Preflight outcomes (must be explicit):

- `adapter_ready`: candidate preflight passed; session allocation is permitted.
- `adapter_preflight_failed_try_next`: candidate preflight failed while session is still unallocated; next candidate in ordered fallback set is evaluated.
- `adapter_preflight_failed_terminal`: all candidates failed preflight; request is rejected with no session allocation.

Selection invariants:

- Mode reselection/fallback is legal only before `session_id` is minted.
- Once `session_id` exists, adapter mode is immutable for that session.
- Preflight decisions must emit deterministic reason codes for selection, fallback, and terminal preflight failure paths.

Required reason codes:

- `terminal_adapter_selected`
- `terminal_adapter_fallback_selected`
- `terminal_adapter_preflight_failed`

### Bridge-Unavailable Behavior & Recovery Isolation (Phase 2)

Bridge-unavailable handling applies to `container_bridge` and must preserve session isolation boundaries.

Admission behavior:

- Before session allocation, bridge preflight failure follows ordered fallback (`container_bridge` -> `bundled` -> `local`).
- Session allocation is forbidden when bridge preflight fails and no fallback candidate passes.
- After `session_id` allocation, bridge unavailability must reject the current operation without cross-mode rebind.

Recovery policy:

- Recovery probes are scoped per session and must not mutate global adapter defaults.
- Recovery attempts are bounded and deterministic (probe interval + per-session max attempts).
- Recovery success/failure must emit explicit bridge availability reason codes.

Cross-session isolation invariants:

- A bridge failure in one session must not terminate or interrupt other sessions.
- A bridge failure in one session must not clear other sessions' output buffers/cursors.
- A bridge failure in one session must not rewrite other sessions' adapter mode bindings.

Required reason codes:

- `terminal_bridge_unavailable`
- `terminal_bridge_recovery_deferred`
- `terminal_bridge_recovery_succeeded`
- `terminal_bridge_isolation_preserved`

### Bounded Output Buffering & Cursor-Safe Truncation (Phase 2)

`read_output` semantics require bounded per-session buffering with deterministic truncation and cursor safety.

Buffer limits:

- Per-session output buffer is bounded by a fixed byte ceiling.
- Per-read snapshots are bounded by byte and line ceilings.
- Overflow policy is deterministic (`truncate_oldest_preserve_latest`) to preserve newest output under sustained write pressure.

Cursor and truncation rules:

- Cursor model is monotonic and byte-offset based for deterministic replay and duplicate-read idempotency.
- Duplicate `read_output` requests for the same cursor identity must not advance cursor state.
- Truncation must emit explicit marker/reason-code metadata and must not corrupt cursor continuity.

Post-termination behavior:

- Reads must continue until buffered output is drained.
- After deterministic drain completion, reads must return explicit EOF semantics.

Required reason codes:

- `terminal_output_truncated`
- `terminal_output_cursor_invalid`
- `terminal_output_stream_drained`

### Operational Diagnostics Bundle (Phase 4 Step 12)

Operational readiness requires one deterministic diagnostics bundle per run:

- `artifacts/assertions/terminal-diagnostics-bundle.json`

Required diagnostics sections:

- `adapter_mode_snapshot`: requested/resolved adapter mode, selection source, candidate order, fallback outcome.
- `preflight_diagnostics`: probe target, timestamps, latency, outcome, and reason code.
- `session_timeline`: ordered session lifecycle transitions with cause and reason code.
- `buffer_statistics`: per-session buffer envelope metrics and cursor progression boundaries.

Contract source of truth:

- `docs/integration-harness/contracts/fault-recovery.contract.json` -> `failed_reconnect_diagnostics_requirements.diagnostics_bundle`
- `docs/integration-harness/contracts/fault-recovery.contract.schema.json` -> `failedReconnectDiagnosticsRequirements.diagnostics_bundle`

### Per-Session Isolation Guarantees for Concurrent Sessions (Phase 2)

Interactive terminal runtime state must be isolated by `session_id` to prevent cross-session state leakage under concurrent execution.

Isolation scope (required):

- Process/runtime handle
- Output buffer and cursor progression
- Working directory and environment overrides
- Request/trace correlation envelope
- Interruption directive state

Concurrency rules:

- Maximum in-flight action count is enforced per session.
- Parallel work across different sessions is permitted.
- Session locking scope is `session_id`; lock ownership must never span unrelated sessions.

Forbidden cross-session effects:

- Appending output from one session into another session buffer.
- Advancing/rewriting cursor state for a different session.
- Emitting terminate signals toward non-target sessions.
- Mutating environment/adapter binding for non-target sessions.

Cleanup guarantees:

- Terminated sessions must release lock ownership and seal their own final output boundary.
- Session cleanup must not clear runtime state owned by other active sessions.

Required reason codes:

- `terminal_session_isolation_enforced`
- `terminal_session_state_leak_detected`

### `terminate` / `read_output` Idempotency Requirements (Normative)

Repeated `terminate` and `read_output` calls (including retries, duplicate delivery, and race overlap) must resolve idempotently.

`terminate` idempotency rules:

- Duplicate `terminate` requests for the same session/request identity must return an existing outcome instead of issuing another kill signal.
- Allowed duplicate outcomes: `termination_signaled`, `already_terminating`, `already_terminated`.
- Exactly one effective termination signal may be emitted per active process instance.

`read_output` idempotency rules:

- Duplicate `read_output` requests for the same session/cursor identity must return the same page and cursor metadata.
- Duplicate reads must not advance cursor position or consume additional buffered output.
- After session termination, reads must allow deterministic buffer drain and then return explicit end-of-stream semantics.

Required reason codes:

- `terminal_terminate_idempotent_replay`
- `terminal_already_terminated`
- `terminal_read_output_duplicate_suppressed`
- `terminal_output_stream_drained`

### Interruption Directive Boundaries (Normative)

Interruption directives are terminal-session control signals and must enforce deterministic handling boundaries.

| Directive | Marker | Delivery Boundary | Allowed Follow-up on Same Session | Required Result |
|---|---|---|---|---|
| `graceful_stop` | `⚠️ SESSION STOP` | Directive is delivered with normal response payload | finish current read path, optional final `terminate` | transition toward `terminate_requested`/`session_terminated` without new execute admission |
| `immediate_stop` | `🛑 SESSION STOP — IMMEDIATE` | Directive replaces normal payload for the interrupted request | `terminate` only (idempotent) | immediate halt of further read/execute progression |
| `terminated` | `❌ SESSION TERMINATED` | Session is already killed server-side | `read_output`/`terminate` return terminal-state semantics only | no additional process mutation; requires new session for future execute |

Boundary invariants:

- Directive handling must never escalate scope or grant additional permissions.
- `graceful_stop` may complete only the current micro-task boundary; it must not start new work units.
- `immediate_stop` and `terminated` paths are hard-stop boundaries for session progression and must preserve audit correlation.

Required reason codes:

- `terminal_stop_graceful`
- `terminal_stop_immediate`
- `terminal_session_terminated_directive`
- `terminal_stop_directive_violation`

### Phase 3 Lifecycle Conformance Matrix (Step 8)

Lifecycle sequencing tests are contract-defined at:

- `docs/integration-harness/contracts/fault-recovery.contract.json` -> `interactive_terminal_session_contract.verification_matrix.lifecycle_conformance_tests`

Required lifecycle sequencing cases:

| Case ID | Sequencing Focus | Expected Lifecycle Progression | Required Assertions |
|---|---|---|---|
| `lifecycle_execute_read_terminate_sequence` | canonical `execute -> read_output -> terminate -> read_output` | `session_absent -> session_starting -> session_running -> terminate_requested -> session_terminated` | read is observational; terminate only advances shutdown path; post-termination read drains to EOF |
| `lifecycle_startup_read_then_terminate` | startup read before process fully running | `session_absent -> session_starting -> terminate_requested -> session_terminated` | startup read does not mutate lifecycle; single effective termination signal |
| `lifecycle_execute_requires_new_session_after_terminated` | post-termination read and execute re-admission | `session_terminated -> session_terminated -> session_starting` | post-termination read is terminal-state only; execute requires new session identity |

### Phase 3 Race-Condition Matrix (Step 9)

Race-condition tests are contract-defined at:

- `docs/integration-harness/contracts/fault-recovery.contract.json` -> `interactive_terminal_session_contract.verification_matrix.race_condition_tests`

Required race/idempotency cases:

| Case ID | Parallel Action Set | Required Outcome | Required Reason Codes |
|---|---|---|---|
| `race_terminate_read_overlap_same_session` | `terminate` + `read_output` on same session | terminate path remains deterministic; output drain reaches EOF | `terminal_terminate_idempotent_replay`, `terminal_output_stream_drained` |
| `race_duplicate_terminate_burst` | repeated concurrent `terminate` calls | exactly one effective kill signal; repeats return existing result | `terminal_terminate_idempotent_replay`, `terminal_already_terminated` |
| `race_duplicate_read_same_cursor_with_terminate` | duplicate `read_output` (same cursor) overlapping `terminate` | duplicate reads return same page/cursor; no cursor over-advance | `terminal_read_output_duplicate_suppressed`, `terminal_output_stream_drained` |

### Phase 3 Multi-Session Stress Matrix (Step 10)

Multi-session stress definitions are contract-defined at:

- `docs/integration-harness/contracts/fault-recovery.contract.json` -> `interactive_terminal_session_contract.verification_matrix.multi_session_stress_tests`

Required stress/isolation cases:

| Case ID | Session Count | Stress Focus | Required Invariants |
|---|---:|---|---|
| `stress_parallel_session_output_isolation` | 8 | parallel execute/read with mixed termination patterns | no cross-session output append, cursor advance, or terminate signal leakage |
| `stress_buffer_truncation_integrity_under_pressure` | 16 | sustained output pressure with bounded reads | per-session truncation policy preserved; cursor monotonicity preserved; no cross-session buffer corruption |
| `stress_cleanup_isolation_after_partial_termination` | 12 | staggered session termination while neighbors remain active | terminating sessions release only their own state; active-session buffers/locks remain intact |

### Phase 3 Container-Bridge Fault Matrix (Step 11)

Container-bridge fault definitions are contract-defined at:

- `docs/integration-harness/contracts/fault-recovery.contract.json` -> `interactive_terminal_session_contract.verification_matrix.container_bridge_fault_tests`
- `docs/integration-harness/contracts/fault-recovery.contract.json` -> `fault_injection_verification_matrix.scenarios`

Required Podman-backed container-bridge cases:

| Case ID / Scenario Key | Fault Stage | Required Behavior | Required Diagnostics / Reason Codes |
|---|---|---|---|
| `bridge_preflight_host_alias_unresolved_fallback` | preflight | ordered fallback occurs before session allocation; reject when all candidates fail | adapter selection trace + preflight probe result; `terminal_bridge_unavailable`, `terminal_adapter_preflight_failed` |
| `bridge_preflight_connect_timeout_terminal_reject` | preflight | connect-timeout path hard-fails without session allocation when fallback is exhausted | probe latency + candidate-order evidence; `terminal_bridge_connect_timeout`, `terminal_adapter_preflight_failed` |
| `bridge_post_allocation_recovery_isolated` | post-allocation | operation rejected without cross-mode rebind; unaffected sessions continue | per-session recovery attempt timeline + cross-session isolation assertions; `terminal_bridge_recovery_deferred`, `terminal_bridge_isolation_preserved` |
| `container_bridge_preflight_failure` | fault-injection lane | preflight failure surfaced with deterministic fallback/terminal rejection evidence | `terminal_adapter_preflight_failed`, `terminal_bridge_unavailable`, `terminal_adapter_fallback_selected` |
| `container_bridge_recovery_diagnostics` | fault-injection lane | bounded per-session recovery produces deterministic diagnostics and reconnect evidence | `terminal_bridge_recovery_deferred`, `terminal_bridge_recovery_succeeded`, `reconnect_failure_diagnostics_present` |

### Phase 4 Build/Test Execution Sequence (Step 13)

Operational readiness gating is strictly ordered and fail-fast:

1. `local_conformance` (required first)
	- `./run-tests.ps1 -Component Extension`
	- `pwsh -File .\scripts\integration-harness-extension-headless.ps1 -RunId <run_id> -ValidateOnly`
	- `pwsh -File .\scripts\integration-harness-extension-reconnect.ps1 -RunId <run_id> -ValidateOnly`
2. `podman_bridge_resilience` (required second)
	- `pwsh -File .\scripts\integration-harness-matrix.ps1 -RunId <run_id> -Tier resilience -RunProfile podman-compose-default`
	- required scenario coverage: `container_bridge_preflight_failure`, `container_bridge_recovery_diagnostics`

Gate rule:

- Stage 2 is forbidden when stage 1 fails.
- Supervisor-mode diagnostics are optional and non-gating.

Contract source of truth:

- `docs/integration-harness/contracts/fault-recovery.contract.json` -> `release_acceptance_checklist.build_test_execution_sequence`

### Phase 4 Release Gate Thresholds (Step 14)

Release acceptance requires explicit threshold checks for session stability and adapter recovery behavior over an evaluation window:

- `evaluation_window_runs=20`
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

Required gate evidence artifacts:

- `artifacts/assertions/terminal-diagnostics-bundle.json`
- `artifacts/assertions/extension-reconnect-assertions.json`
- `artifacts/assertions/matrix-gates.json`
- `artifacts/summary.json`

Contract source of truth:

- `docs/integration-harness/contracts/fault-recovery.contract.json` -> `release_acceptance_checklist.session_stability_and_adapter_recovery_gate`

### Phase 4 Rollback Strategy for Stability Envelope Regressions (Step 15)

Rollback strategy is activated when stability-envelope gates regress, including:

- `terminal_session_stability_gate_failed`
- `terminal_adapter_recovery_gate_failed`
- `headless_reconnect_pass_rate_below_threshold`

Required rollback sequence (ordered):

1. `enter_safe_mode_and_freeze_promotion`
2. `revert_adapter_selection_policy_to_last_known_good`
3. `enforce_single_inflight_reconnect_and_mutation_block`
4. `rerun_local_conformance_lane`
5. `rerun_podman_bridge_resilience_lane`

Release controls while rollback is active:

- pin current release candidate
- block new promotion attempts
- require reviewer acknowledgement before unpinning

Post-rollback validation is mandatory before safe-mode exit and must include lane-sequenced reruns with sustained pass evidence.

Contract source of truth:

- `docs/integration-harness/contracts/fault-recovery.contract.json` -> `release_acceptance_checklist.rollback_safe_mode_policy`

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

### Extension Reconnect Telemetry Schema (Phase 2)

Reconnect telemetry emitted by extension-side reliability flows must follow a normalized envelope and event taxonomy.

Required envelope fields:

- `run_id`
- `workspace_id`
- `component_id`
- `event_type`
- `timestamp`
- `attempt`
- `reason_code`
- `outcome`
- `session_id`
- `transport_id`
- `registration_guard`

Allowed reconnect event types:

- `reconnect_attempt`
- `reconnect_failed`
- `reconnect_recovered`
- `circuit_breaker_opened`
- `circuit_breaker_half_open_probe`
- `duplicate_registration_guard_triggered`

Duplicate-registration guard payload requirements:

- `registration_guard.scope`: `commands|providers|listeners|timers`
- `registration_guard.action`: `suppressed|no_op_ack|reused_existing`
- `registration_guard.resource_id`: stable command/provider/listener/timer identity
- `registration_guard.idempotency_key`: dedup key used for suppression decision

Reason-code requirements:

- Attempt/failure path: `reconnect_observed`, `backoff_attempt_limit_exceeded`, `circuit_breaker_open`
- Recovery path: `connectivity_reconnected`, `replay_ack_guarantee_satisfied`
- Guard path: `reconnect_duplicate_suppressed`, `duplicate_registration_prevented`

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
## Container/Runtime Boundary Contracts (Phase 1 — Podman Contract Baseline)

This section defines canonical runtime boundary contracts for all Podman-managed services. These contracts govern the hard interface boundaries that every component must respect when operating within or across the container boundary.

### Podman Runtime Networking Contracts

All inter-service communication inside the integration harness runs over a single named Podman network. Services MUST NOT assume host-mode networking for cross-service calls.

| Contract Field | Normative Value | Violation Behavior |
|---|---|---|
| Required network driver | `bridge` or `podman` | Any service that bypasses the named network emits `container_network_contract_violated` |
| Canonical network name | `integration_net` (defined in `podman-compose.integration.yml`) | Services sharing no common network must fail health checks before startup admission |
| Port publishing scope | Published to `127.0.0.1` only (no `0.0.0.0` binding in integration lane) | Wide-open bindings are forbidden in integration harness profiles |
| Cross-service reachability | Services communicate by compose service name (DNS name) inside `integration_net` | Direct IP references in service config are forbidden; only DNS names are portable |
| External access (harness scripts) | Scripts access services via `localhost:<published_port>` | Harness scripts must not embed container-internal DNS names |

Network boundary invariants:

- Services that fail to join `integration_net` at startup must be marked `network_boundary_unreachable` and excluded from readiness gate evaluation.
- Any service that publishes on a port not declared in `podman-compose.integration.yml` is a contract violation and must emit `container_port_undeclared`.
- The integration harness must verify network reachability for every service before executing fault scenarios.

### Podman DNS and Service Discovery Contracts

Compose-managed DNS is the only permitted service discovery mechanism within the container boundary.

| Contract Field | Normative Value |
|---|---|
| DNS resolver | Podman internal DNS (compose service name = hostname) |
| Canonical service hostnames | `project-memory`, `dashboard`, `readiness-gate`, `interactive-terminal-bridge` (see Canonical Service Table) |
| DNS TTL assumption | Zero-TTL: internal DNS lookups must not be cached across container restarts; reconnect flows must re-resolve |
| Service alias policy | If a service declares DNS aliases, each alias must be documented in the Canonical Service Table entry |

DNS contract invariants:

- After a container restart, any client holding a stale resolved IP must treat it as invalid and re-resolve via DNS before reconnect admission.
- DNS resolution failures at startup must emit `container_dns_resolution_failed` and block readiness gate passage for that service.
- Harness readiness scripts must probe by service name (via published port) and must not skip DNS resolution.

### Podman Volume and Storage Boundary Contracts

All stateful runtime data consumed or produced by containers in the integration lane must be bound through declared volume or bind-mount paths only.

| Volume / Mount Type | Usage | Mount Path Pattern | Contract Rule |
|---|---|---|---|
| Named volume (`harness_runtime_state`) | Persistent runtime state across compose lifecycle | `/data` (container-side) | Must declare `driver: local`; no implicit anonymous volumes permitted |
| Run-scoped bind mount (data) | Per-run isolated data tree | `.tmp/integration-harness/runs/<run_id>/data:/data/run` | Run ID must be deterministic and set at compose-up time via environment variable |
| Run-scoped bind mount (secrets) | Per-run secrets | `.tmp/integration-harness/runs/<run_id>/secrets:/run/secrets:ro` | Read-only mount; services must not write to secrets path |
| Run-scoped bind mount (artifacts) | Per-run output artifacts | `.tmp/integration-harness/runs/<run_id>/artifacts:/artifacts` | Writable by test runner; read-only for all other services |

Storage boundary invariants:

- Services must not write data outside their declared mount paths; any write outside declared paths is a `container_storage_boundary_violation`.
- Named volume must be explicitly declared in `podman-compose.integration.yml` under the `volumes:` top-level key.
- Run-scoped paths must be created by the lifecycle script before compose-up; containers must not create run-scoped directories themselves.
- Abrupt container termination must not corrupt named volume state; restart path must validate named volume integrity before admitting healthy status.

### Environment Variable Boundary Contracts

Environment variables crossing the container boundary must follow declared-only injection with no ambient host environment leakage.

| Env Var Category | Scope | Declaration Requirement |
|---|---|---|
| Runtime config | Container-scoped | Must be declared explicitly in `podman-compose.integration.yml` under `environment:` or `env_file:` |
| Run identity | `PM_RUN_ID` | Injected at compose-up time from lifecycle script; must be present for all services |
| Port config | `PM_MCP_PORT`, `PM_DASHBOARD_API_PORT`, `PM_DASHBOARD_WS_PORT` | Must match declared `ports:` entries; harness scripts must not hardcode port values |
| Secret paths | `PM_DATA_PATH`, `PM_SECRETS_PATH`, `PM_ARTIFACTS_PATH` | Must resolve to run-scoped bind mounts declared above |
| Bridge config | `PM_INTERACTIVE_TERMINAL_HOST_ALIAS`, `PM_INTERACTIVE_TERMINAL_HOST_PORT` | Required only for container-bridge fault scenarios; must not default to host-environment values |

Env boundary invariants:

- The integration lane must never inherit arbitrary host environment variables; all required vars must be explicit in compose definition or injected by the lifecycle script.
- Containers must fail startup with `container_env_boundary_violated` if required env vars are absent.
- The lifecycle script must validate required env var presence before `podman compose up`.

### Podman Compose Topology Contracts (Service Naming, Dependency Ordering, Restart Policies)

The Podman Compose integration topology is the authoritative runtime substrate for the integration harness. All service naming, dependency ordering, and restart policy expectations defined here are normative and must be reflected exactly in `docs/integration-harness/podman-compose.integration.yml`.

#### Canonical Service Naming

Compose service names are the single stable identifier for DNS resolution, restart policy scoping, and fault injection targeting. Service names must not be changed without a corresponding update to all contracts that reference them.

| Compose Service Name | Maps To (Component ID) | Canonical Compose Name Rule |
|---|---|---|
| `project-memory` | `mcp-server` | canonical; scripts and contracts reference this name for stop/start/health fault injection |
| `dashboard` | `dashboard` | canonical; API (`3001`) and WS (`3002`) ports published from this service |
| `readiness-gate` | harness control plane | ephemeral service; exits 0 on gate pass, non-zero on gate fail; `depends_on: condition: service_healthy` from runner |
| `interactive-terminal-bridge` | `interactive-terminal-bridge` | optional; required only for container-bridge fault scenarios; no HTTP health endpoint |

Service naming invariants:

- Scripts must reference services by their canonical compose service name — never by container ID or IP.
- Fault injection actions (`stop_service`, `delay_response`, `force_health_failure`) must target the canonical service name.
- Service name renames require a coordinated contract update across: `podman-compose.integration.yml`, `service-contract.md`, `fault-recovery.contract.json`, and all harness scripts that reference the old name.

#### Dependency Ordering Contract

Service startup ordering is declared via `depends_on` + `condition: service_healthy` in `podman-compose.integration.yml` and must match the Canonical Service Table's `Depends On` column exactly.

| Service | `depends_on` Entries | `condition` Required |
|---|---|---|
| `project-memory` | none | — |
| `dashboard` | `project-memory: service_healthy` | `service_healthy` |
| `readiness-gate` | `project-memory: service_healthy`, `dashboard: service_healthy` | `service_healthy` for both |
| `interactive-terminal-bridge` | `project-memory: service_healthy` | `service_healthy` |

Dependency ordering invariants:

- No service may declare `condition: service_started` as a substitute for `service_healthy`; the integration lane requires health-qualified ordering.
- Circular `depends_on` declarations are forbidden and must be detected by harness validation scripts before compose-up admission.
- The `readiness-gate` service is the terminal dependency gate sentinel: a non-zero exit from `readiness-gate` must abort the run and emit `dependency_gate_failed`.
- Optional service (`interactive-terminal-bridge`) must be excluded from the `depends_on` graph of mandatory services; its absence must emit `optional_service_absent` as an info-level annotation, not a hard gate failure.

#### Restart Policy Contract

Restart policy per service is normative and must be explicitly declared (no implicit defaults).

| Service | Restart Policy | Rationale |
|---|---|---|
| `project-memory` | `unless-stopped` | persistent backend; must recover from transient crashes without manual intervention during harness run |
| `dashboard` | `unless-stopped` | persistent backend; restart semantics mirror `project-memory` for consistent reconnect testing |
| `readiness-gate` | `no` | single-shot gate; must not restart after exit |
| `interactive-terminal-bridge` | `on-failure` with `max_retry_count: 3` | optional bridge service; bounded restart on transient failure; must not loop unboundedly |

Restart policy invariants:

- `unless-stopped` services must still comply with bounded restart policy as defined in the `reconnect_policy` fields of `fault-recovery.contract.json`; compose restart policy and application-level reconnect policy are complementary, not redundant.
- `readiness-gate` exit code is the authoritative gate signal; orchestration scripts must capture and propagate this exit code as the gate pass/fail result.
- A service with `restart: no` that exits non-zero must emit `container_unexpected_exit` with reason code `restart_policy_no` and block any dependent gate.
- Interactive-terminal-bridge `max_retry_count` exhaustion must emit `container_restart_limit_reached` and transition bridge availability to `unavailable`.

#### Health Check Declaration Contract

Every non-ephemeral service must declare a `healthcheck:` block in `podman-compose.integration.yml`. Ephemeral services (`readiness-gate`) must not declare a `healthcheck:` block.

| Service | Healthcheck Command Pattern | interval | timeout | retries |
|---|---|---|---|---|
| `project-memory` | `curl -sf http://localhost:3000/health` | `5s` | `3s` | `3` |
| `dashboard` | `curl -sf http://localhost:3001/api/health` | `5s` | `3s` | `3` |
| `interactive-terminal-bridge` | TCP reachability check on `PM_INTERACTIVE_TERMINAL_HOST_PORT` | `10s` | `5s` | `3` |

Health check invariants:

- `start_period` must be declared for services that require initialization time before health checks begin (recommended minimum: `10s` for server, `15s` for dashboard).
- Health check failures must propagate to `depends_on + condition: service_healthy` evaluation so dependent services are not started prematurely.
- The harness readiness script must consume health check outcomes from `podman inspect` before issuing any fault injection action.

### Container Readiness/Liveness Health Contract and Cross-Service Startup Gating Rules

This section defines the canonical health probe contract for all Podman-managed services in the integration harness and the deterministic startup gate rules that govern cross-service admission. These rules are normative and supplement the machine-readable contract at `docs/integration-harness/contracts/health-readiness.contract.json`.

#### Liveness Probe Contract

Liveness probes detect whether a service process is alive. A failing liveness probe triggers a container restart (subject to restart policy).

| Service | Liveness Endpoint | Method | Expected Status | Max Latency |
|---|---|---|---|---|
| `project-memory` | `http://localhost:3000/health` | `GET` | `200 OK` | `3000ms` |
| `project-memory` (alias) | `http://localhost:3000/api/health` | `GET` | `200 OK` | `3000ms` |
| `dashboard` | `http://localhost:3001/api/health` | `GET` | `200 OK` | `3000ms` |
| `interactive-terminal-bridge` | TCP port `PM_INTERACTIVE_TERMINAL_HOST_PORT` | TCP reachability | connection accepted | `3000ms` |

Liveness probe invariants:

- A liveness probe miss must increment `failure_count` atomically; failure count exceeding `failure_threshold_cap=3` triggers container restart sequence.
- Liveness probes must not be used as readiness gates; a service that is live (process running) may still be not-ready for traffic.
- The harness must not start fault injection until liveness probes have passed for all required services.

#### Readiness Probe Contract

Readiness probes gate service traffic admission. A service that fails readiness may be live but is not eligible for dependent service startup or fault injection targeting.

| Service | Readiness Endpoint | Readiness Indicator | Gate Role |
|---|---|---|---|
| `project-memory` | `http://localhost:3000/health` | `{ "status": "healthy" }` in response body | mandatory readiness gate for `dashboard` and `readiness-gate` |
| `dashboard` | `http://localhost:3001/api/health` | `{ "status": "healthy" }` in response body | mandatory for `readiness-gate` and harness script admission |
| `interactive-terminal-bridge` | TCP on `PM_INTERACTIVE_TERMINAL_HOST_PORT` | connection accepted within `max_probe_timeout_ms` | required only for container-bridge fault scenarios; optional gate for other scenarios |

Readiness probe invariants:

- A service is ready only when `minimum_consecutive_passes=2` probes succeed within `max_gate_wait_ms=15000`.
- Readiness gate timeout (`max_gate_wait_ms`) is hard; exceeding it must block dependent service startup and emit `readiness_gate_timeout_exceeded` with the non-ready service ID.
- Readiness state is independent of liveness state: a service may be live but not ready (initialization in progress) or ready-then-degraded (probe regression after startup).

#### Cross-Service Startup Gating Rules

Startup gating is deterministic and enforced by the harness through the `readiness-gate` service and `scripts/integration-harness-readiness.ps1`. The gate sequence is strict and non-negotiable.

Gate admission sequence:

1. **`project-memory` liveness pass** — TCP reachability on port `3000` must succeed before any probe is issued to `dashboard`.
2. **`project-memory` readiness pass** — `GET /health` returns `{"status":"healthy"}` with `minimum_consecutive_passes=2` within `max_gate_wait_ms=15000`.
3. **`dashboard` liveness pass** — TCP reachability on port `3001` after `project-memory` readiness gate clears.
4. **`dashboard` readiness pass** — `GET /api/health` returns `{"status":"healthy"}` with `minimum_consecutive_passes=2` within `max_gate_wait_ms=15000`.
5. **Optional: `interactive-terminal-bridge` readiness pass** — required only when the run profile includes container-bridge fault scenarios; emits `optional_service_absent` when skipped.
6. **Gate sentinel exit** — `readiness-gate` service exits 0; harness runner is admitted for fault execution.

Startup gate invariants:

- Steps 1-4 are mandatory for all run profiles; failure at any mandatory step must abort the run with `startup_gate_failed` and the failing component ID.
- Gate probe polling must be bounded: poll interval = `2000ms`, max polls = `ceil(max_gate_wait_ms / poll_interval_ms)`, no unbounded loops.
- `readiness-gate` must emit a machine-readable gate result to `artifacts/health/startup-gate-result.json` with one record per component containing: `component_id`, `gate_status`, `consecutive_passes`, `elapsed_ms`, `reason_code`.
- Reconnect admission after fault scenarios must re-evaluate readiness gate predicates from step 1; reconnect without re-passing gates is forbidden.

#### Health Probe Response Schema (Normative)

Health endpoints (liveness and readiness) must return a normalized JSON body conforming to:

```json
{
  "status": "healthy | degraded | unhealthy",
  "timestamp": "<iso8601>",
  "component_id": "<service-name>",
  "checks": [
    {
      "name": "<check-name>",
      "status": "pass | warn | fail",
      "reason_code": "<optional-reason-code>"
    }
  ]
}
```

Health response invariants:

- `status=healthy` requires all `checks[*].status` to be `pass`.
- `status=degraded` is returned when one or more checks are `warn` but none are `fail`.
- `status=unhealthy` is returned when any check is `fail`.
- The harness readiness gate admits only `status=healthy` responses; `degraded` and `unhealthy` are treated as gate-fail for readiness purposes.
- The `component_id` field must match the canonical compose service name exactly.

### Container Boundary Failure Taxonomy (Runtime, Network, Storage, Application Fault Layers)

All faults encountered in Podman-managed integration harness flows must be classified into one of the four fault layers defined below before recovery actions are applied. The taxonomy is normative and drives fault-runner scenario selection, recovery choreography, and escalation semantics.

#### Fault Layer 1: Runtime Faults

Runtime faults originate from the container execution environment itself, independent of network or application state.

| Fault Class | Trigger Condition | Detection Signal | Escalation Semantics |
|---|---|---|---|
| `container_crash` | Container process exits unexpectedly (non-zero exit, OOM, signal kill) | `process_exit` event with non-zero exit code; compose reports container as `exited` | Restart scope: `child-local` for isolated service crash; escalate to `dependency-group` if dependent services lose health |
| `container_start_timeout` | Container fails to reach healthy state within `start_period + healthcheck.interval * retries` | `dependency_gate_failed` with reason code `container_start_timeout_exceeded` | Restart scope: `child-local`; retry up to `max_retry_count` (per restart policy); escalate to `dependency-group` if mandatory service |
| `container_restart_loop` | Container restarts more than `restart_loop_threshold` (default: 3) times within `restart_loop_window_ms` (default: 60000ms) | `container_restart_limit_reached` reason code | Restart scope exhausted; transition service to `degraded_unavailable`; require operator acknowledgement |
| `resource_pressure` | CPU/memory/IO saturation causes probe timeouts or slow response | liveness probe timeout; latency spike above configured ceiling | Restart scope: `child-local`; emit `resource_pressure_detected` and throttle fault injection until pressure clears |

Runtime fault invariants:
- Runtime faults must not automatically escalate restart scope beyond the declared minimum scope without first emitting a reason code.
- Container restart loops must emit `container_restart_limit_reached` before any global restart is considered.
- Resource pressure must be documented as advisory diagnostics evidence in the terminal-diagnostics-bundle.

#### Fault Layer 2: Network Faults

Network faults originate from Podman bridge networking, DNS resolution failures, or port publishing issues.

| Fault Class | Trigger Condition | Detection Signal | Escalation Semantics |
|---|---|---|---|
| `network_partition` | Service loses reachability within `integration_net` while process is running | health probe returns connection refused or timeout on internal DNS name | Restart scope: `dependency-group`; re-evaluate all services that depend on the partitioned service |
| `dns_resolution_failure` | Internal compose DNS fails to resolve service hostname | `container_dns_resolution_failed` reason code; health probe cannot reach service endpoint | Restart scope: `child-local` per service; network must be re-established before readiness gate re-evaluation |
| `port_publish_failure` | Published port not reachable from host | harness script receives connection refused on `localhost:<published_port>` | Restart scope: `child-local`; emit `container_port_undeclared` if port was not declared; network-level reconnect required |
| `bridge_connectivity_loss` | Container-bridge TCP channel loses connectivity after session allocation | `terminal_bridge_unavailable` reason code | Per-session scoped recovery; no cross-session impact; escalate only when all recovery attempts exhausted |

Network fault invariants:
- Network faults always require re-evaluation of the dependency gate chain before reconnect admission.
- DNS resolution failure must trigger service restart or network reconnect before readiness re-evaluation.
- Bridge connectivity loss is isolated per session and must not cascade to other sessions.

#### Fault Layer 3: Storage Faults

Storage faults originate from volume, bind-mount, or named-volume integrity issues.

| Fault Class | Trigger Condition | Detection Signal | Escalation Semantics |
|---|---|---|---|
| `volume_mount_failure` | Named volume or bind-mount fails to attach at container start | container startup fails with mount error; dependency gate blocked by `dependency_gate_failed` | Restart scope: `child-local` for affected service; run lifecycle reset if data path is corrupted |
| `data_path_corruption` | Run-scoped data tree is corrupt or missing required subdirectories | harness artifact write fails; `container_storage_boundary_violation` reason code | Escalate to `dependency-group` if shared data path; lifecycle script must recreate run tree |
| `abrupt_termination_corruption` | Container is killed without graceful shutdown; named volume state may be partially written | post-restart health probe detects integrity error in volume-backed state | Named volume integrity check required before restart admission; emit `container_storage_integrity_check_required` |
| `storage_boundary_violation` | Service writes outside declared mount paths | `container_storage_boundary_violation` reason code emitted | Service must be quarantined and restarted from clean state; run must be flagged as contaminated |

Storage fault invariants:
- Abrupt termination must always trigger a named volume integrity check before the service is re-admitted to healthy.
- Storage boundary violations must block the affected service from being re-admitted and must emit the violation reason code.
- Run-scoped artifact paths must be recreated by the lifecycle `reset` action before re-running a contaminated run.

#### Fault Layer 4: Application Faults

Application faults originate from service-level logic errors, misconfigurations, or dependency readiness violations that are not caused by the container runtime or network.

| Fault Class | Trigger Condition | Detection Signal | Escalation Semantics |
|---|---|---|---|
| `health_endpoint_failure` | Service is running and reachable but health endpoint returns `status=unhealthy` | health probe receives `200 OK` with `{"status":"unhealthy"}` body | Restart scope: `child-local`; emit `application_health_check_failed`; do not gate other services until service recovers |
| `dependency_readiness_violation` | A dependent service starts traffic before the required upstream service passes readiness gate | dependency gate evidence is missing in scenario assertions | Abort-and-reset; emit `dependency_gate_evidence_missing`; do not promote run evidence |
| `env_boundary_violation` | Service receives or emits environment variables outside declared `environment:` or `env_file:` contract | `container_env_boundary_violated` reason code | Restart scope: `child-local`; env must be re-validated by lifecycle script before restart |
| `circuit_breaker_open` | Application-level circuit breaker opens after consecutive failures | `circuit_breaker_open` reason code emitted; reconnect attempts fail fast | Application-level recovery only; retry after `open_min_duration_ms`; escalate to degraded safety mode if recovery exhausted |

Application fault invariants:
- Application faults must not trigger compose-level container restarts unless the fault persists past `max_attempts` recovery.
- `dependency_readiness_violation` evidence voids the run for gate promotion; all affected scenarios must be re-executed.
- Circuit breaker state is application-managed and must not interact with compose restart policy.

#### Fault Taxonomy Escalation Decision Tree

```
Fault detected
  └─ Is container runtime alive?
       ├─ No  → Layer 1 (Runtime): classify as container_crash or container_start_timeout
       └─ Yes → Is network reachable?
                  ├─ No  → Layer 2 (Network): classify as network_partition or dns_resolution_failure
                  └─ Yes → Is storage intact?
                             ├─ No  → Layer 3 (Storage): classify as volume_mount_failure or abrupt_termination_corruption
                             └─ Yes → Layer 4 (Application): classify by health response, circuit breaker, or dependency gate evidence
```

Taxonomy classification must be recorded in the scenario assertion output under `fault_layer` field before recovery action is applied.


---

## Phase 2 — Single-Service Fault Isolation Policy (Container/Runtime Boundary)

> **Plan**: `plan_mma9q23d_a7a28f45` | **Step**: 4 | **Phase**: Phase 2 — Failure Isolation Design

### Contract

A fault in one compose-managed service container **MUST NOT cascade** to trigger restart of any service outside the fault's declared `failure_domain`. The isolation boundary is determined by the compose service dependency graph and must be enforced by both the compose restart policy and the integration harness orchestrator.

### Containment Scope Definitions

| Scope | Meaning | Permitted |
|---|---|---|
| `child-local` | Restart limited to the faulted service container only. No peer or dependent services are affected. | ✅ Yes |
| `dependency-group` | Restart limited to the faulted service and its declared `depends_on` chain. Unrelated services must remain healthy and running. | ✅ Yes |
| `global` | Restart of the entire compose stack. **FORBIDDEN** under normal operating conditions. | ❌ Forbidden (operator-explicit only) |

### Enforcement Rules

1. **Compose restart policy must match failure domain** — each compose service `restart` policy must be set to `on-failure` or `unless-stopped`, scoped so only the failed container is restarted by compose, not peers.
2. **Harness orchestrator must verify no unscoped restart** — after any container fault, the harness orchestrator must verify that only the expected failure-domain services restarted. Any unscoped restart is a contract violation.
3. **Unaffected services must remain healthy throughout restart** — services not in the faulted service's `depends_on` chain must maintain healthy state (health check passing) throughout the restart sequence.

### Global Restart Prohibition

The `global` restart scope is **forbidden** as an automatic recovery action. It may only be triggered by an explicit operator command. Any automatic restart that affects services outside the faulted service's dependency chain must emit:

- **Event**: `isolation_boundary_crossed`
- **Reason code**: `container_isolation_boundary_crossed`

### Diagnostic Requirements

Every boundary-fault scenario assertion output **MUST** include:

- `fault_layer` — classification from the Phase 1 taxonomy (`runtime`, `network`, `storage`, `application`)
- `failure_domain` — the isolation scope that was active during the fault (`child-local`, `dependency-group`, `global`)

### Pass / Fail Reason Codes

| Outcome | Reason Code |
|---|---|
| Isolation enforced | `container_isolation_enforced` |
| Isolation violated | `container_isolation_violated` |

---

## Phase 2 — Dependency Chain Restart/Recovery Choreography

> **Plan**: `plan_mma9q23d_a7a28f45` | **Step**: 5 | **Phase**: Phase 2 — Failure Isolation Design

### Contract

When a compose service faults and triggers a restart within the `dependency-group` failure domain, the recovery of all dependent services must follow a **deterministic, ordered choreography**. Services must not re-admit traffic until all services in their `depends_on` chain have passed their readiness gates.

### Restart Precedence

Restarts follow **depends_on order, leafs first**: the deepest dependency (the service that has no `depends_on`, e.g., `project-memory`) restarts and passes its readiness gate before any consumer services restart. This prevents consumer services from contacting a service that is still initializing.

### Startup Admission Rule

A service **MUST NOT** admit traffic until all services it declares in `depends_on` have:

1. Completed their health check (compose `healthcheck` passes)
2. Passed the integration harness readiness gate

### Compose-Managed Restart Integration

Compose restart policies (`on-failure`, `unless-stopped`) drive the individual container restart lifecycle. The integration harness **wraps** compose-managed restarts with:

- **Staggered restart enforcement**: No more than one container per dependency tier may restart simultaneously.
- **Readiness re-evaluation**: After any container in a dependency chain restarts, all services that depend on it must re-evaluate their readiness gate before re-admitting traffic.

### Ordered Recovery Events

The harness must emit and validate these events in strict sequence for any `dependency-group` recovery:

```
container_fault_detected
  → container_stopped
    → depends_on_readiness_gates_evaluated
      → container_started
        → health_check_waiting
          → health_check_passed
            → readiness_gate_open
              → service_admitted
```

Any out-of-order emission or missing event is a choreography violation (`dependency_restart_choreography_violated`).

### Pass / Fail Reason Codes

| Outcome | Reason Code |
|---|---|
| Choreography passed | `dependency_restart_choreography_passed` |
| Choreography violated | `dependency_restart_choreography_violated` |

---

## Phase 2 — Storage Integrity Checks and Abrupt Container Termination Recovery Policy

> **Plan**: `plan_mma9q23d_a7a28f45` | **Step**: 6 | **Phase**: Phase 2 — Failure Isolation Design

### Contract

Named volumes that persist stateful data (notably the SQLite database volume for the `project-memory` service) require an integrity check before the service is re-admitted after an **abrupt container termination**. This prevents corrupted state from being silently loaded by a restarting service.

### Abrupt Termination Triggers

An abrupt termination is any termination that bypasses the normal graceful shutdown path:

- `SIGKILL` (including `podman kill` and compose force-stop)
- OOM kill by the container runtime or host kernel
- Host crash or hypervisor-level shutdown
- Runtime forceful stop (e.g., compose stop timeout exceeded)

### Pre-Start Integrity Gate

Before `project-memory` (or any service with a named stateful volume) re-admits traffic after an abrupt termination, it **MUST** run a storage integrity probe:

- **SQLite check**: Execute `PRAGMA integrity_check` against the database file. Expected result: `"ok"`.
- The integrity check is a **blocking gate**: the service does not start its listener until the check completes.

### Integrity Check Outcomes

| Outcome | Action | Reason Code |
|---|---|---|
| Check passes (`ok`) | Proceed with normal startup | `storage_integrity_check_passed` |
| Check fails (non-`ok` result) | Enter degraded state, block service admission, emit `storage_integrity_failed` event | `storage_integrity_check_failed` |

### Failure Recovery Policy

When an integrity check fails:

1. **Auto-restart is FORBIDDEN** — the service must not attempt to restart itself automatically. Auto-restart on a corrupt volume can mask data loss or make corruption worse.
2. **Operator intervention required** — the operator must either restore from backup or acknowledge data loss and re-initialize the volume.
3. **Event emitted**: `storage_integrity_failed` with `fault_layer: storage`, `reason_code: storage_integrity_check_failed`

### Pass / Fail Reason Codes

| Outcome | Reason Code |
|---|---|
| Integrity check passed | `storage_integrity_check_passed` |
| Integrity check failed | `storage_integrity_check_failed` |

---

## Phase 2 — Resource-Boundary Safeguards and Pressure Degradation Behavior

> **Plan**: `plan_mma9q23d_a7a28f45` | **Step**: 7 | **Phase**: Phase 2 — Failure Isolation Design

### Contract

All container services **MUST** have resource limits configured via compose `deploy.resources.limits` (fields: `cpus`, `memory`). When resource utilization approaches or exceeds limits, services must follow defined degradation rules rather than failing silently or triggering uncontrolled restarts.

### Resource Limits Enforcement

Each compose service MUST declare:

```yaml
deploy:
  resources:
    limits:
      cpus: "<limit>"
      memory: "<limit>"
```

The harness reviewer must confirm these limits are set for all services before Phase 2 test lanes are enabled.

### Pressure Thresholds and Degradation Behavior

#### CPU Pressure

| Parameter | Value |
|---|---|
| Pressure threshold | >80% CPU utilization sustained for 30 seconds |
| Degraded state | `cpu_pressure` |
| Degradation behavior | Block mutation operations; allow read-only degraded ops only |
| Reason code | `container_cpu_pressure_detected` |

#### Memory Pressure

| Trigger | Classification | Pre-Restart Requirement |
|---|---|---|
| OOM kill by runtime/kernel | `abrupt_termination` | Storage integrity check required before re-admission |
| Reason code | `container_memory_oom_kill` | — |

Memory OOM kills are classified as `abrupt_termination` (fault layer: `runtime`) and trigger the storage integrity gate (see Section above).

#### IO Pressure

| Parameter | Value |
|---|---|
| Pressure threshold | Disk write latency >500ms |
| Degraded state | `io_pressure` |
| Degradation behavior | Suspend event streaming |
| Reason code | `container_io_pressure_detected` |

### Resource Pressure Event

When any pressure threshold is crossed, the service must emit a `resource_pressure_event` with:

- `pressure_type` (`cpu_pressure` | `memory_pressure` | `io_pressure`)
- `service_id` (compose service name)
- `threshold` (the configured limit)
- `current_value` (observed metric value)
- `timestamp`

The circuit breaker trips when sustained pressure is detected (see `circuit_breaker_policy`).

### Pressure Recovery

| Parameter | Value |
|---|---|
| Clear threshold | Utilization drops below 70% |
| Sustained duration | 60 seconds at below-threshold level |
| Action on clear | Re-admit service to full operation |
| Reason code | `container_resource_pressure_cleared` |

### Operator Visibility

Every resource pressure event must trigger an operator alert (`container_resource_boundary_alert`). Pressure states must be visible in diagnostic bundles and logs.

### Pass / Fail Reason Codes

| Outcome | Reason Code |
|---|---|
| Safeguard passed | `resource_boundary_safeguard_passed` |
| Safeguard failed | `resource_boundary_safeguard_failed` |

## Phase 3 — Podman Compose Network Fault Verification Lanes (Step 8)

> **Plan**: `plan_mma9q23d_a7a28f45` | **Step**: 8 | **Phase**: Phase 3 - Podman Verification Lanes

### Contract

Podman Compose network fault tests define three mandatory verification lanes: bridge isolation, DNS lookup failure, and delayed route restoration. These lanes validate that network-layer faults are correctly classified, scoped to `dependency-group` or `child-local`, and recover through dependency gate re-evaluation choreography.

### Verification Scenarios

| Scenario ID | Fault Class | Fault Layer | Recovery Scope | Pass Reason Code |
|---|---|---|---|---|
| `podman_bridge_isolation_partition` | `network_partition` | `network` | `dependency-group` | `podman_bridge_isolation_test_passed` |
| `podman_dns_lookup_failure_and_recovery` | `dns_resolution_failure` | `network` | `child-local` | `podman_dns_failure_recovery_test_passed` |
| `podman_delayed_route_restoration` | `network_partition` | `network` | `dependency-group` | `podman_delayed_route_restoration_test_passed` |

### Network Fault Invariants

- Every network fault scenario must record `fault_layer: network` in its assertion output.
- DNS resolution failure must block readiness gate; stale resolved IPs must be invalidated before reconnect admission.
- Route restoration delays must remain within `p95_reconnect_latency_ms=8000` and `max_reconnect_latency_ms=20000`.
- `dependency_restart_choreography_passed` is required evidence for `dependency-group`-scoped network faults.
- `dependency_gate_must_re_evaluate_after_any_network_fault` is a mandatory determinism rule.

### Machine-Readable Source

- `docs/integration-harness/contracts/fault-recovery.contract.json` → `podman_network_fault_verification_matrix`

---

## Phase 3 — Storage and Volume Fault Verification Lanes (Step 9)

> **Plan**: `plan_mma9q23d_a7a28f45` | **Step**: 9 | **Phase**: Phase 3 - Podman Verification Lanes

### Contract

Storage and volume fault tests define three mandatory verification lanes: permission denial, mount loss, and delayed persistence availability. These lanes validate that storage-layer faults activate the pre-start integrity gate, correctly classify the fault scope, and prevent auto-restart on permission failures.

### Verification Scenarios

| Scenario ID | Fault Class | Fault Layer | Recovery Scope | Auto-Restart Forbidden | Pass Reason Code |
|---|---|---|---|---|---|
| `storage_volume_permission_denied` | `storage_permission_failure` | `storage` | `child-local` | ✅ Yes | `storage_permission_denied_test_passed` |
| `storage_mount_loss_and_recovery` | `volume_mount_loss` | `storage` | `dependency-group` | ❌ No | `storage_mount_loss_recovery_test_passed` |
| `storage_delayed_persistence_availability` | `volume_availability_delay` | `storage` | `child-local` | ❌ No | `storage_delayed_persistence_test_passed` |

### Storage Fault Invariants

- `auto_restart_forbidden` applies to all `storage_permission_failure` class faults.
- Volume mount loss requires `storage_integrity_check_passed` before any restart admission.
- Pre-start gate must enforce storage readiness; no traffic admitted before volume ready.
- `fault_layer_storage_must_be_recorded_in_scenario_assertion_output` is a mandatory determinism rule.
- Operator alert must be emitted on permission denial (`operator_intervention_required` reason code).

### Machine-Readable Source

- `docs/integration-harness/contracts/fault-recovery.contract.json` → `storage_volume_fault_verification_matrix`

---

## Phase 3 — Startup-Order and Readiness Fault Verification Lanes (Step 10)

> **Plan**: `plan_mma9q23d_a7a28f45` | **Step**: 10 | **Phase**: Phase 3 - Podman Verification Lanes

### Contract

Startup-order and readiness fault tests define three mandatory verification lanes: dependency timing races, restart storm suppression, and readiness gate timeout under slow-start conditions. These lanes validate that compose dependency ordering is enforced, reconnect storms are rate-limited, and slow-starting services do not bypass readiness gates.

### Verification Scenarios

| Scenario ID | Fault Class | Fault Layer | Recovery Scope | Pass Reason Code |
|---|---|---|---|---|
| `dependency_timing_race_test` | `startup_timing_race` | `application` | `dependency-group` | `dependency_timing_race_test_passed` |
| `restart_storm_suppression_test` | `restart_storm` | `application` | `dependency-group` | `restart_storm_suppression_test_passed` |
| `readiness_gate_timeout_under_slow_start` | `slow_startup` | `application` | `child-local` | `readiness_gate_slow_start_test_passed` |

### Startup-Order Fault Invariants

- `depends_on` gates must be evaluated before service admission on every startup.
- Restart storm policy must rate-limit reconnect attempts using `window_ms` / `max_reconnect_attempts_in_window` and enforce `cooldown_after_storm_ms`.
- Readiness gate timeout (`readiness_gate_timeout_exceeded`) must not trigger auto-restart; service must wait for health check to pass.
- Slow-start isolation must not cascade to unaffected services.
- `fault_layer_application_must_be_recorded_in_scenario_assertion_output` is mandatory.

### Machine-Readable Source

- `docs/integration-harness/contracts/fault-recovery.contract.json` → `startup_order_readiness_fault_verification_matrix`

---

## Phase 3 — Health Validation Thresholds and Pass/Fail Criteria (Step 11)

> **Plan**: `plan_mma9q23d_a7a28f45` | **Step**: 11 | **Phase**: Phase 3 - Podman Verification Lanes

### Contract

Health validation thresholds define the quantitative pass/fail criteria for recovery latency and stability that all Phase 3 Podman verification lane scenarios must satisfy before Phase 3 → Phase 4 promotion.

### Recovery Latency Thresholds

| Metric | p95 | p99 | Max | Fail Reason Code |
|---|---|---|---|---|
| Reconnect latency | 8,000 ms | 15,000 ms | 20,000 ms | `reconnect_latency_exceeded_threshold` |
| Storage integrity check latency | — | — | 5,000 ms | `storage_integrity_check_latency_exceeded_threshold` |
| Readiness gate open latency | — | — | 30,000 ms | `readiness_gate_latency_exceeded_threshold` |
| DNS re-resolution latency | — | — | 10,000 ms | — |

### Stability Thresholds

| Parameter | Value |
|---|---|
| Minimum consecutive passing scenarios | 3 |
| Evaluation window runs | 5 |
| Max failure budget per window | 1 |
| Minimum pass rate | 0.90 |

### Gate Promotion Criteria

All of the following must be true for Phase 3 → Phase 4 promotion:

- All 3 network fault scenarios pass
- All 3 storage/volume fault scenarios pass
- All 3 startup-order/readiness scenarios pass
- Recovery latency within all thresholds
- Stability threshold of 3 consecutive passing scenarios met
- All 9 required reason codes present in assertion output

### Machine-Readable Source

- `docs/integration-harness/contracts/fault-recovery.contract.json` → `health_validation_thresholds`
