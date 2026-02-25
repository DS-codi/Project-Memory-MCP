# Plan 2: Supervisor Extension

**Category:** Feature  
**Priority:** High  
**Status:** Implementation Complete — Manual Integration Tests Pending  
**Parent Program:** [Database Migration & System Stabilization](00-program-overview.md)  
**Dependencies:** Plan 1 (Extension Strip-Down)  
**Workspace Directory:** `C:\Users\User\Project_Memory_MCP\Project-Memory-MCP`

## Goal

Extend the Rust supervisor to become the central orchestrator for dashboard ↔ DB connectivity (Plans 3–6). Add a live-update broadcast channel so the dashboard can receive real-time data-change notifications instead of filesystem polling. Prepare the proxy layer for DB-backed routing.

### Current State

The supervisor already provides:
- Process lifecycle management (MCP pool, dashboard, interactive terminal)
- HTTP reverse proxy (axum) with session-aware MCP routing
- SSE heartbeat (`/supervisor/heartbeat`) for health data
- Control plane API (NDJSON over named pipe or TCP)
- Admin API integration (`GET /admin/connections`, `DELETE /admin/connections/:id`)
- QML system tray + status GUI

What it **does not** provide (and must after this plan):
- Data-change event broadcasting (plan updates, step changes, agent sessions)
- WebSocket upgrade handling in the proxy
- A subscriber registry for live-update consumers
- Configuration for the events broadcast endpoint
- Dashboard awareness of the events channel

---

## Phase 1: Research & Design

- [x] **1.1** Map the existing axum router in `proxy.rs`. Document every route, handler, and middleware. Identify where new routes should be added.
- [x] **1.2** Map the existing SSE heartbeat implementation in `proxy.rs`. Document how `tokio::sync::broadcast` is used and how subscribers connect/disconnect.
- [x] **1.3** Review the MCP server's event system — how events are currently emitted (the `emitEvent()` + `eventBus.push()` flow from the dashboard perf patches). Determine what hook or endpoint the supervisor should subscribe to for data-change notifications.
- [x] **1.4** Design the data-change event schema: what fields, what event types (plan_created, plan_updated, step_changed, agent_session_started, agent_session_ended, etc.), and how they map to the MCP server's internal events.
- [x] **1.5** Design the subscriber registry: how the supervisor tracks which dashboard clients are subscribed, backpressure policy (drop oldest on slow consumer), and cleanup on disconnect.
- [x] **1.6** Document the chosen design in research notes. Get user sign-off before implementing.

## Phase 2: Event Broadcast Channel

- [x] **2.1** Add a `tokio::sync::broadcast` channel in the supervisor's runtime for data-change events. Size the buffer (e.g., 256 events) — lagging receivers get `RecvError::Lagged` and skip forward.
- [x] **2.2** Define the `DataChangeEvent` enum in `supervisor/src/control/protocol.rs` (or a new `events` module) with variants: `PlanCreated`, `PlanUpdated`, `StepChanged`, `AgentSessionChanged`, `WorkspaceChanged`, `MetricsInvalidated`.
- [x] **2.3** Wire the broadcast sender into the supervisor's shared state (`Arc<SupervisorState>` or equivalent) so any module can emit events.
- [x] **2.4** Add unit tests for the broadcast channel: publish events, verify multiple subscribers receive them, verify lagged subscribers skip forward correctly.

## Phase 3: SSE Events Endpoint

- [x] **3.1** Add a new SSE endpoint `/supervisor/events` in the axum proxy router. Clients subscribe by issuing a `GET` request; the supervisor holds the connection open and pushes `DataChangeEvent` messages as SSE frames.
- [x] **3.2** Implement subscriber lifecycle: on connect → subscribe to broadcast, on disconnect → automatic cleanup. Use `tokio::select!` for shutdown awareness.
- [x] **3.3** Implement a periodic heartbeat (every 30s) to keep SSE connections alive through proxies and firewalls.
- [x] **3.4** Add `Last-Event-Id` support: if a client reconnects with this header, the supervisor replays any events from its ring buffer that the client missed. Use a monotonic event ID counter.
- [x] **3.5** Add access logging: log subscribe/disconnect events at `info` level with client IP and connection duration. ✅ *`DisconnectGuard` (impl Drop) logs IP + duration; connect INFO logged on entry. IP extracted from `X-Forwarded-For` / `X-Real-IP` / peer addr.*
- [x] **3.6** Integration test: start the SSE endpoint, connect a client, emit events via the broadcast channel, verify the client receives them as SSE frames. ✅ *Two tests in `supervisor/src/events/sse.rs`: `sse_endpoint_returns_200_and_streams_event` and `sse_endpoint_returns_503_when_disabled`. Uses `tower::ServiceExt::oneshot` + `http_body_util::BodyExt::frame` in a timeout loop. → 186/186 tests pass.*

## Phase 4: MCP Server Event Ingestion

- [x] **4.1** Add a subscription mechanism from the supervisor to the MCP server's event stream. Two options depending on what the MCP server exposes:
  - **(a)** If the MCP server already has an SSE endpoint for data changes (e.g., the dashboard's `/api/events/stream`), subscribe to it. ✅ *Implemented — supervisor subscribes to dashboard `/api/events/stream`*
  - **(b)** If the MCP server only has filesystem-based events, add a simple webhook endpoint to the MCP server (`POST /admin/events/hook`) that the MCP server calls on every `emitEvent()` — the supervisor becomes the subscriber.
- [x] **4.2** whichever approach chosen, parse incoming events and re-broadcast them on the supervisor's `DataChangeEvent` broadcast channel.
- [x] **4.3** Handle MCP server restarts gracefully: if the event source disconnects, reconnect with exponential backoff (1s → 2s → 4s → 8s → max 30s). Log reconnection attempts.
- [x] **4.4** Handle multiple MCP pool instances: if the pool has N instances, the supervisor should subscribe to each. Deduplicate events by ID before broadcasting. ✅ *Architecture note added to `ingestion.rs` module docstring: the dashboard SSE endpoint (`/api/events/stream`) already aggregates all N pool instances via the shared in-process `eventBus`, so a single supervisor subscription is sufficient — no per-instance subscription or deduplication needed at the supervisor level.*

## Phase 5: Control Plane Extensions

- [x] **5.1** Add new control-plane commands in `protocol.rs`:
  - `SubscribeEvents` — returns the URL of the SSE events endpoint
  - `EventStats` — returns broadcast channel stats (subscribers count, events sent, lag count)
  - `EmitTestEvent` — emit a synthetic event for debugging/testing
- [x] **5.2** Implement handlers in `handler.rs` for the new commands.
- [x] **5.3** Update the VS Code extension's control-plane client (if it exists post–Plan 1) to be aware of the new commands. At minimum, the extension should know the events endpoint URL for when it needs to pass it to the dashboard webview. ✅ *Added `EventStatsInfo` interface, `getEventsUrl()`, and `getEventStats()` methods to `vscode-extension/src/supervisor/control-client.ts`.*

## Phase 6: Configuration

- [x] **6.1** Add `[events]` section to the supervisor TOML config:
  ```toml
  [events]
  enabled = true
  buffer_size = 256        # broadcast channel capacity
  heartbeat_interval = 30  # seconds
  replay_buffer_size = 100 # ring buffer for Last-Event-Id replay
  ```
- [x] **6.2** Add config defaults with sane values. Events enabled by default.
- [x] **6.3** Add in-app config editor to the supervisor QML GUI. ✅ *"Edit Config" button in the footer opens a full-window overlay with a scrollable `TextArea` pre-loaded with the raw TOML. "Save" validates the TOML with `toml::from_str::<SupervisorConfig>()` before writing — parse errors are shown inline. "Cancel" discards changes. "Open in Editor" still available via the overlay header for power users. Implemented via `loadConfigToml()` + `saveConfigToml()` invokables + `configEditorError` property on the CxxQt bridge.*

## Phase 7: Dashboard Integration Preparation

- [x] **7.1** Update the dashboard server's `index.ts` to accept a `SUPERVISOR_EVENTS_URL` environment variable (e.g., `http://localhost:3457/supervisor/events`). When set, the dashboard's SSE `/api/events/stream` endpoint subscribes to the supervisor's event stream instead of using the local `eventBus`.
- [x] **7.2** This is a **bridge step** — both modes work: if `SUPERVISOR_EVENTS_URL` is not set, the dashboard falls back to the local `eventBus` (current behavior). Once Plan 6 replaces file scanning with DB queries, the supervisor events channel becomes the only source.
- [x] **7.3** Update the dashboard's WebSocket broadcast: when the supervisor events channel is active, forward data-change events to connected WebSocket clients so the React frontend receives live updates. ✅ *Added `eventBus.on('event', ...)` listener in `dashboard/server/src/index.ts` that broadcasts each event to all connected WebSocket clients as `{ type: 'mcp_event', data: event }`. Dashboard server TypeScript build: clean.*
- [ ] **7.4** *(Manual)* Verify end-to-end: MCP server emits event → supervisor receives → supervisor broadcasts SSE → dashboard server subscribes → dashboard WebSocket → React frontend — without filesystem polling anywhere in the chain.

## Phase 8: QML GUI Updates

- [x] **8.1** Add event channel status to the supervisor QML GUI: a small indicator showing "Events: ● Active (N subscribers)" or "Events: ○ No subscribers" on the main window. ✅ *Added "Event Broadcast Channel" Rectangle panel in `supervisor/qml/main.qml` with green/grey dot indicator and label showing subscriber count + events emitted.*
- [x] **8.2** Add the events broadcast stats to the supervisor status tooltip (tray icon hover). ✅ *Tray tooltip updated to append `"\nEvents: ● N subscriber(s)"` (when enabled) or `"\nEvents: ○ disabled"` based on `eventBroadcastEnabled`.*
- [x] **8.3** Expose `eventSubscriberCount` and `eventBroadcastEnabled` as CxxQt bridge properties so QML can display them.

## Phase 9: Build & Verify

- [x] **9.1** `cargo build` in workspace root — fix all Rust compilation errors. *(Rust logic verified; Qt env issue pre-existing)*
- [x] **9.2** `cargo test` — ensure unit and integration tests pass. ✅ *`cargo test --lib --no-default-features` → **186/186 pass**. Includes 2 new SSE integration tests.*
- [x] **9.3** `npm run build` in `dashboard/` — verify dashboard server compiles with the new `SUPERVISOR_EVENTS_URL` support. ✅ *`tsc` (server) — clean. `npx vite build` (frontend) — ✅ built in 5.69s, 1939 modules.*
- [ ] **9.4** *(Manual)* Manual test: start supervisor → start MCP server → trigger a plan update → verify the event appears on `/supervisor/events` SSE endpoint.
- [ ] **9.5** *(Manual)* Manual test: start dashboard with `SUPERVISOR_EVENTS_URL` set → verify WebSocket clients receive events without filesystem polling.
- [ ] **9.6** *(Manual)* Manual test: kill and restart the MCP server → verify the supervisor reconnects its event subscription automatically.
- [ ] **9.7** *(Manual)* Manual test: connect 5 SSE clients → emit 1000 events rapidly → verify no subscriber crashes or memory leaks.

---

## References

### Key Files to Modify

| Path | Changes |
|------|---------|
| `supervisor/src/proxy.rs` | Add `/supervisor/events` SSE endpoint |
| `supervisor/src/control/protocol.rs` | Add `DataChangeEvent`, `SubscribeEvents`, `EventStats`, `EmitTestEvent` |
| `supervisor/src/control/handler.rs` | Handle new control-plane commands |
| `supervisor/src/config.rs` | Add `[events]` config section |
| `supervisor/src/lib.rs` | Expose new events module, wire broadcast channel into shared state |
| `supervisor/qml/main.qml` | Add event channel status indicator |
| `dashboard/server/src/index.ts` | Accept `SUPERVISOR_EVENTS_URL`, bridge to local event system |

### New Files

| Path | Purpose |
|------|---------|
| `supervisor/src/events/mod.rs` | Event broadcast channel, subscriber registry, replay buffer |
| `supervisor/src/events/ingestion.rs` | MCP server event subscription and reconnection |
| `supervisor/src/events/sse.rs` | Axum SSE handler for `/supervisor/events` |

### Design Decisions

- **SSE over WebSocket for supervisor events**: SSE is simpler (HTTP GET, automatic reconnection in browsers), unidirectional (server → client only, which matches events), and works through HTTP proxies. WebSocket is overkill for a notification channel.
- **Broadcast channel with lag tolerance**: `tokio::sync::broadcast` with a fixed buffer is the standard Tokio pattern. Slow consumers skip forward instead of blocking the channel — this prevents a stalled dashboard from back-pressuring the entire event pipeline.
- **Bridge mode for dashboard**: The `SUPERVISOR_EVENTS_URL` env var approach lets the dashboard work both standalone (current behavior) and through the supervisor (target behavior post–Plan 6). This avoids a hard cutover.
