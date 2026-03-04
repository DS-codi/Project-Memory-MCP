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