# Plan 1: Extension Strip-Down

**Category:** Refactor  
**Priority:** Critical  
**Status:** ✅ Complete  
**Parent Program:** [Database Migration & System Stabilization](00-program-overview.md)  
**Dependencies:** None (first plan)  
**Target:** `C:\Users\User\Project_Memory_MCP\Project-Memory-MCP\vscode-extension`  
**Archive Policy:** Files are moved to `src/_archive/` instead of deleted, preserving history for reference.

## Goal

Strip the VS Code extension of all features that duplicate MCP server functionality or degrade unrelated chat sessions. Reduce it to a lightweight dashboard host + deployment helper so it can be re-enabled immediately and used during development of later plans.

---

## Phase 1: Research & Audit

- [x] **1.1** Audit all 7 `languageModelTools` registered in `package.json` (`memory_workspace`, `memory_agent`, `memory_plan`, `memory_steps`, `memory_context`, `memory_filesystem`, `memory_session`). Document which are duplicates of MCP stdio tools vs unique.
- [x] **1.2** Audit the `@memory` chat participant and its 7 slash commands. Document what each does and whether equivalent functionality exists via MCP tools.
- [x] **1.3** Audit all timers: 30s session sync, 5min session prune, connection polling, supervisor heartbeat. Document their purpose and overhead.
- [x] **1.4** Audit `McpBridge` HTTP transport — document the retry/reconnect behavior and how it affects VS Code when the server is unreachable.
- [x] **1.5** Audit file watchers (`AgentWatcher`, `CopilotFileWatcher`) — document what they watch and their overhead.
- [x] **1.6** Audit the `ConnectionManager` — document its polling interval and retry behavior.
- [x] **1.7** Audit the `SessionInterceptRegistry` and orchestration modules — document what they do and whether they're needed without LM tools.
- [x] **1.8** Document findings in research notes. Produce a "keep / remove / defer" list for every module.

## Phase 2: Remove Language Model Tools

- [x] **2.1** Remove all 7 `languageModelTools` entries from `package.json` contributes section.
- [x] **2.2** Archived `vscode-extension/src/chat/tools/` to `src/_archive/chat/tools/`.
- [x] **2.3** Archived `vscode-extension/src/chat/ToolProvider.ts` to `src/_archive/chat/`.
- [x] **2.4** Removed `ToolProvider` import and all references from `extension.ts`.
- [x] **2.5** Removed `toolProvider` variable declaration, initialization, disposal.
- [x] **2.6** Removed `initializeChatIntegration()` entirely (see Phase 8).

## Phase 3: Remove Chat Participant

- [x] **3.1** Removed `chatParticipants` entry from `package.json` contributes section.
- [x] **3.2** Archived `ChatParticipant.ts` to `src/_archive/chat/`.
- [x] **3.3** Archived all chat command handlers to `src/_archive/chat/`.
- [x] **3.4** Removed `ChatParticipant` import and all references from `extension.ts`.
- [x] **3.5** Removed `chatParticipant` variable declaration, initialization, disposal.
- [x] **3.6** Removed `initializeChatIntegration()` entirely (see Phase 8).
- [x] **3.7** Archived `workspaceRegistration.ts` to `src/_archive/chat/`.

## Phase 4: Remove Session Orchestration

- [x] **4.1** Archived `src/chat/orchestration/` to `src/_archive/chat/orchestration/` (including `__tests__/`).
- [x] **4.2** Removed 30s session sync timer (removed with `initializeChatIntegration()`).
- [x] **4.3** Removed 5min session prune timer (removed with `initializeChatIntegration()`).
- [x] **4.4** Removed `sessionInterceptRegistry` variable declaration and all references.
- [x] **4.5** Removed `dashboardProvider.setSessionRegistry()` call.
- [x] **4.6** Removed `syncSessions()` method from `DashboardViewProvider.ts`.
- [x] **4.7** Removed all session message handlers from `dashboard-message-handlers.ts`; dashboard responds with empty sessions list to legacy messages.

## Phase 5: Remove McpBridge & HTTP Transport

- [x] **5.1** Archived `McpBridge.ts` to `src/_archive/chat/`.
- [x] **5.2** Archived `McpToolHandlers.ts` and `McpToolRouter.ts` to `src/_archive/chat/`.
- [x] **5.3** Archived `HeadlessTerminalExecutionContract.ts` and `HEADLESS_TERMINAL_CONTRACT.md` to `src/_archive/chat/`.
- [x] **5.4** Removed `McpBridge` import and all references from `extension.ts`.
- [x] **5.5** Removed `mcpBridge` variable declaration, initialization, disposal, and all reconnect hooks.
- [x] **5.6** Removed `chat.reconnect` command registration (removed with `initializeChatIntegration()`).
- [x] **5.7** Removed MCP bridge reconnect hooks from `connectionManager.onConnected` callback.
- [x] **5.8** Removed `diagnosticsService.onHealthChange` bridge reconnect block.
- [x] **5.9** Emptied `src/chat/index.ts` — all re-exports removed; file is a documented empty stub.

## Phase 6: Reduce Timer & Watcher Overhead

- [x] **6.1** Archived `AgentWatcher.ts` to `src/_archive/watchers/`.
- [x] **6.2** Archived `CopilotFileWatcher.ts` to `src/_archive/watchers/`.
- [x] **6.3** Removed `initializeWatchers()` function and its `setTimeout` call from `extension.ts`.
- [x] **6.4** `SupervisorHeartbeat` kept as-is (SSE-based, not polling).
- [ ] **6.5** `ConnectionManager.startAutoDetection()` — exponential backoff not yet implemented (deferred).
- [ ] **6.6** `DiagnosticsService` — health checks remain heartbeat-driven (deferred; acceptable for now).

## Phase 7: Dashboard Isolation

Ensure a dashboard crash, hang, or unavailability cannot take down MCP tools, the supervisor, or the extension. The dashboard is a **non-critical, purely observational** surface — everything must work without it.

> **Deferred to Plan 2** — Dashboard isolation hardening is a separate concern now that the extension no longer registers LM tools. The primary goal (eliminating tool pollution) is achieved. Phases 7 items remain as-is for tracking.

- [ ] **7.1** Audit dashboard HTTP/WebSocket call paths in the extension.
- [ ] **7.2** Wrap all dashboard HTTP calls with `try/catch` + 2s timeout.
- [ ] **7.3** Make WebSocket connection fully optional with lazy-connect pattern.
- [ ] **7.4** Add circuit breaker to `ConnectionManager` (3 failures → stop retrying).
- [ ] **7.5** Verify supervisor does not depend on dashboard server availability.
- [ ] **7.6** Verify MCP tool registration never awaits a dashboard connection.
- [ ] **7.7** Crash test: kill dashboard mid-session, verify extension and supervisor unaffected.
- [ ] **7.8** Add `projectMemory.dashboard.enabled` setting (kill switch).

## Phase 8: Clean Up Extension Activation

- [x] **8.1** Removed `initializeChatIntegration()` entirely (~1000 lines). `extension.ts` reduced from 1582 → 430 lines.
- [x] **8.2** Updated `activate()` — all deleted module references removed.
- [x] **8.3** Updated `deactivate()` — removed disposal of McpBridge, ChatParticipant, ToolProvider, watchers.
- [x] **8.4** Removed all unused imports from `extension.ts` (AgentWatcher, CopilotFileWatcher, McpBridge, ChatParticipant, ToolProvider, confirmPendingAction, cancelPendingAction, SessionInterceptRegistry, extractWorkspaceIdFromRegisterResponse, resolveWorkspaceIdFromWorkspaceList).
- [x] **8.5** Updated `package.json` — removed `chatParticipants`, `languageModelTools`, 18 dead commands, and 4 chat-specific settings. 31 commands remain.
- [x] **8.6** Removed `confirmPendingAction` / `cancelPendingAction` imports and registrations.
- [x] **8.7** Reviewed remaining commands — dashboard, deploy, supervisor launch, pool management all retained.

## Phase 9: Build & Verify

- [x] **9.1** `npm run compile` → **clean build, 0 errors**.
- [x] **9.2** `npx vitest run` → **61/61 tests pass** (archived orchestration tests still self-contained and passing).
- [ ] **9.3** Package: `npx @vscode/vsce package` — pending.
- [ ] **9.4** Install: `code --install-extension *.vsix` — pending.
- [ ] **9.5** Manual test: verify zero LM tool registrations in unrelated chat sessions — pending.
- [ ] **9.6** Manual test: dashboard panel loads and displays data — pending.
- [ ] **9.7** Manual test: deploy commands work from command palette — pending.
- [ ] **9.8** Manual test: supervisor launch commands work — pending.
- [ ] **9.9** Manual test: dashboard crash resilience — pending (see Phase 7 deferral).
- [ ] **9.10** Manual test: `dashboard.enabled = false` — pending (setting not yet implemented, see Phase 7).

---

## References

### Files to Archive (moved to `src/_archive/`)

| Source Path | Archive Path | Reason |
|-------------|-------------|--------|
| `src/chat/tools/*` | `src/_archive/chat/tools/` | LM tool handlers — duplicate MCP stdio tools |
| `src/chat/ToolProvider.ts` | `src/_archive/chat/` | LM tool registration orchestrator |
| `src/chat/ChatParticipant.ts` | `src/_archive/chat/` | @memory chat participant |
| `src/chat/ChatPlanCommands.ts` | `src/_archive/chat/` | /plan slash command handler |
| `src/chat/ChatContextCommands.ts` | `src/_archive/chat/` | /context slash command handler |
| `src/chat/ChatMiscCommands.ts` | `src/_archive/chat/` | /handoff, /status, /deploy, /diagnostics handlers |
| `src/chat/ChatResponseHelpers.ts` | `src/_archive/chat/` | Chat formatting utilities |
| `src/chat/KnowledgeCommandHandler.ts` | `src/_archive/chat/` | /knowledge slash command handler |
| `src/chat/McpBridge.ts` | `src/_archive/chat/` | HTTP transport to dashboard server |
| `src/chat/McpToolHandlers.ts` | `src/_archive/chat/` | HTTP tool handler delegation |
| `src/chat/McpToolRouter.ts` | `src/_archive/chat/` | HTTP tool routing |
| `src/chat/HeadlessTerminalExecutionContract.ts` | `src/_archive/chat/` | Terminal contract for tools |
| `src/chat/HEADLESS_TERMINAL_CONTRACT.md` | `src/_archive/chat/` | Documentation for above |
| `src/chat/orchestration/*` | `src/_archive/chat/orchestration/` | Session tracking, interception, spawn orchestration |
| `src/chat/workspaceRegistration.ts` | `src/_archive/chat/` | Workspace registration used only by chat tools |
| `src/watchers/AgentWatcher.ts` | `src/_archive/watchers/` | File watcher for agent templates |
| `src/watchers/CopilotFileWatcher.ts` | `src/_archive/watchers/` | File watcher for copilot config |

### Files to Modify

| Path | Changes |
|------|---------|
| `package.json` | Remove `languageModelTools`, `chatParticipants`, dead commands |
| `src/extension.ts` | Remove all references to deleted modules, simplify activation |
| `src/chat/index.ts` | Remove re-exports of deleted modules (may become empty → delete) |
| `src/providers/DashboardViewProvider.ts` | Remove `syncSessions()`, session registry reference |
| `src/providers/dashboard-webview/dashboard-message-handlers.ts` | Remove session handlers |
| `src/server/ConnectionManager.ts` | Add exponential backoff, remove MCP bridge hooks |
| `src/services/DiagnosticsService.ts` | Make health checks on-demand only |

### Files to Keep (with possible minor updates)

| Path | Purpose |
|------|---------|
| `src/providers/DashboardViewProvider.ts` | Webview panel host — core feature |
| `src/providers/dashboard-webview/*` | Webview HTML generation |
| `src/deployer/DefaultDeployer.ts` | Agent/skill/instruction deployment |
| `src/commands/deploy-commands.ts` | Deploy command registrations |
| `src/commands/server-commands.ts` | Server management commands |
| `src/commands/workspace-commands.ts` | Workspace commands |
| `src/supervisor/*` | Supervisor detection, launch, heartbeat |
| `src/ui/StatusBarManager.ts` | Status bar indicator |
| `src/utils/*` | Workspace identity, helpers, defaults |

### Why This Must Be First

The extension registers 7 language model tools on `onStartupFinished`. These tools are evaluated by VS Code's LM tool system on **every** chat turn across **all** agents — not just `@memory`. This adds latency and context overhead to unrelated Copilot sessions, degrading the overall experience. Stripping these immediately allows safe re-enabling of the extension for real-world testing during development of Plans 2–7.

### Key Constraint

No backwards compatibility. The extension tools are identical to the MCP stdio tools. Agents already use MCP tools via the stdio transport. The extension tools are a redundant HTTP-transport copy that exists only because the extension was originally designed before the supervisor + MCP proxy existed. They serve no unique purpose.
