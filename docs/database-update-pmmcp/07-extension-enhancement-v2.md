# Plan 7: Extension Enhancement (v2)

**Category:** Feature  
**Priority:** Medium  
**Status:** Complete  
**Parent Program:** [Database Migration & System Stabilization](00-program-overview.md)  
**Dependencies:** Plan 6 (Dashboard & WebSocket Overhaul)  
**Workspace Directory:** `C:\Users\User\Project_Memory_MCP\Project-Memory-MCP`

## Goal

Transform the VS Code extension from a passive dashboard wrapper into an actively useful workspace companion. After Plan 1 stripped out the problematic LM tools and chat participant, the extension is lightweight but underutilized. This plan adds new functionality that complements the MCP server and supervisor without duplicating them: native TreeView navigation, live agent status, supervisor-driven notifications, and streamlined deployment.

### Scope

- **Add**: TreeView for workspace/plan/step navigation, live agent status bar, plan status notifications, supervisor event subscription
- **Remove**: Dead legacy code (ServerManager, FrontendManager, PidLockfile, deprecated commands)
- **Improve**: Deploy workflow (one-click defaults), diagnostics (TreeView health panel), code navigation from step notes
- **Keep**: Sidebar webview dashboard, full-tab dashboard panel, supervisor launcher/heartbeat/control client, deploy commands

---

## Phase 1: Dead Code Removal

Clean up legacy code that survived Plan 1's strip-down. This reduces the codebase before adding new features.

- [x] **1.1** Delete `src/server/ServerManager.ts` (602 lines) — extension no longer spawns MCP servers; the supervisor manages this
- [x] **1.2** Delete `src/server/FrontendManager.ts` (158 lines) — frontend dev server management is supervisor's job
- [x] **1.3** Delete `src/server/PidLockfile.ts` (108 lines) — PID lockfile management is unused
- [x] **1.3a** Delete `src/server/ServerLogger.ts` (orphaned after ServerManager removal; no other file imports it)
- [x] **1.4** Remove deprecated commands from `src/commands/server-commands.ts`:
  - `projectMemory.startServer` — remove stub registration and handler
  - `projectMemory.stopServer` — remove stub registration and handler
  - `projectMemory.restartServer` — remove stub registration and handler
  - `projectMemory.forceStopExternalServer` — remove stub registration and handler
  - `projectMemory.isolateServer` — remove stub registration and handler
  - Keep: `showDashboard`, `openDashboardPanel`, `toggleConnection`, `showServerLogs`, `showDiagnostics`, `refreshData`
  - Note: `projectMemory.migrateWorkspace` is in `workspace-commands.ts` (not here) — it is already a stub showing MCP guidance; leave it in place
- [x] **1.5** Remove deprecated commands from `package.json` contributions — the following command IDs are no longer real implementations:
  - `projectMemory.startServer`, `projectMemory.stopServer`, `projectMemory.restartServer`
  - `projectMemory.forceStopExternalServer`, `projectMemory.isolateServer`
  - `projectMemory.toggleServer` (package.json has this but the code registers `toggleConnection` — align or remove)
- [x] **1.6** Remove deprecated settings from `package.json`:
  - `projectMemory.wsPort` — WebSocket removed in Plan 6
  - `projectMemory.autoStartServer` — superseded by supervisor
  - `projectMemory.idleServerTimeoutMinutes` — superseded by supervisor
  - `projectMemory.serverPort` — duplicate of `apiPort` (extension.ts already reads both; keep `apiPort`, remove `serverPort`)
- [x] **1.7** Remove `chokidar` from `package.json` production dependencies — confirmed: no active `.ts` file imports it
- [x] **1.8** Remove `@modelcontextprotocol/sdk` from production deps — confirmed: no active `.ts` file imports it (only archived code used it)
- [x] **1.9** Update `extension.ts` — no direct imports of deleted modules exist; verify compile clean after deletions

## Phase 2: Workspace & Plan TreeView

Add a native VS Code TreeView that shows workspaces, plans, and steps in the activity bar — providing quick navigation without opening the full dashboard.

- [x] **2.1** Create `src/providers/WorkspacePlanTreeProvider.ts`:
  - Implements `vscode.TreeDataProvider<TreeItem>`
  - Root level: workspaces (from supervisor/dashboard API or direct DB query)
  - Second level: plans grouped by status (active, archived)
  - Third level: steps with status icons
  - Auto-refresh via supervisor SSE events
- [x] **2.2** Create tree item classes:
  - `WorkspaceItem` — icon: `$(folder)`, context value for deploy actions
  - `PlanItem` — icon: status-colored `$(checklist)`, shows progress percentage in description
  - `StepItem` — icon: `$(circle-outline)` (pending), `$(sync~spin)` (active), `$(check)` (done), `$(error)` (blocked)
  - `PhaseItem` — icon: `$(list-ordered)`, groups steps under phases
- [x] **2.3** Register the TreeView in `package.json`:
  - Add view `projectMemory.planExplorer` in the existing `projectMemory` view container
  - Set `type: "tree"` (not webview)
  - Title: "Plans"
- [x] **2.4** Add context menu actions on tree items:
  - Plan: "Open in Dashboard", "Archive Plan", "View Context"
  - Step: "Mark Done", "Mark Blocked", "View Notes"
  - Workspace: "Deploy Defaults", "Open Plans"
- [x] **2.5** Add click action: clicking a plan opens it in the full dashboard panel
- [x] **2.6** Add inline icons: refresh button on tree root, filter button for active/archived toggle

## Phase 3: Live Agent Status Bar

Wire the existing `StatusBarManager` (which has unused `setCurrentAgent()` / `setCurrentPlan()` methods) to display real-time agent activity.

- [x] **3.1** Update `StatusBarManager.ts`:
  - Subscribe to supervisor SSE events for agent init/complete/handoff
  - On agent `init` event: `setCurrentAgent(agentType)` + `setCurrentPlan(planTitle)`
  - On agent `complete` event: clear current agent, show completion flash
  - On agent `handoff` event: show transition animation `Executor → Reviewer`
  - Show `$(robot) Idle` when no agent is active
- [x] **3.2** Add tooltip with rich content:
  - Current agent type and plan title
  - Step in progress (index/total)
  - Session duration
  - Click to open plan in dashboard
- [x] **3.3** Add color coding:
  - Green `statusBarItem.color` when agent is active and healthy
  - Yellow when agent has been active for >5 minutes (long-running)
  - Red when a step is blocked

## Phase 4: Supervisor Event Subscription

Create a unified event subscription service that powers the TreeView refresh, status bar updates, and notifications.

- [x] **4.1** Create `src/services/EventSubscriptionService.ts`:
  - Connects to supervisor SSE broadcast endpoint (`/api/events/stream`) — a **separate** stream from the existing `SupervisorHeartbeat` at `/supervisor/heartbeat` (which carries only health pings)
  - Parses plan-lifecycle events: `plan_created`, `plan_updated`, `plan_archived`, `step_updated`, `agent_init`, `agent_complete`, `agent_handoff`, `workspace_registered`
  - Emits typed VS Code `EventEmitter` events for each category
  - Auto-reconnects on disconnect with exponential backoff (same pattern as `SupervisorHeartbeat`)
  - Respects `dashboard.enabled` setting from Plan 1's circuit breaker
  - Note: reuses the `http` module pattern established by `SupervisorHeartbeat` — no extra networking libs needed
- [x] **4.2** Wire to TreeView: `EventSubscriptionService` → `WorkspacePlanTreeProvider.refresh()`
- [x] **4.3** Wire to StatusBarManager: `EventSubscriptionService` → `StatusBarManager.setCurrentAgent()`
- [x] **4.4** Wire to notifications (Phase 5)
- [x] **4.5** Register in `extension.ts` — create during activation, dispose on deactivation. Lazy-start: only connect when at least one consumer is active.

## Phase 5: Plan Status Notifications

Show VS Code notifications when important plan events occur.

- [x] **5.1** Create `src/services/NotificationService.ts`:
  - Subscribes to `EventSubscriptionService`
  - Shows information notifications for:
    - Agent handoff: `"$(arrow-right) Executor → Reviewer on 'Add Auth'"` with "Open Plan" button
    - Plan complete: `"$(check) Plan 'Add Auth' completed!"` with "View" button
    - Step blocked: `"$(warning) Step blocked: 'Create login endpoint'"` with "View" button
  - Respects `projectMemory.showNotifications` setting
  - Debounces rapid-fire events (max 1 notification per 5 seconds per plan)
- [x] **5.2** Add notification settings:
  - `projectMemory.notifications.agentHandoffs` (boolean, default: true)
  - `projectMemory.notifications.planComplete` (boolean, default: true)
  - `projectMemory.notifications.stepBlocked` (boolean, default: true)
- [x] **5.3** Add "Mute for 1 hour" option in notification actions

## Phase 6: One-Click Deploy

Simplify the deployment workflow. Currently deploying agents/skills/instructions requires multi-step QuickPick selection.

- [x] **6.1** Add a "Deploy All Defaults" button to the status bar when a workspace is open:
  - One click → deploys default agents, instructions, and skills (from settings) to the current workspace
  - Shows progress notification during deployment
  - Skips files that haven't changed (checksum comparison via `DefaultDeployer`)
- [x] **6.2** Add a deploy profile system:
  - Store profiles in `projectMemory.deployProfiles` setting
  - Each profile: name + list of agents + instructions + skills
  - QuickPick to select profile before deploying
- [x] **6.3** Add explorer context menu for `.agent.md` files:
  - "Deploy to Current Workspace"
  - "Deploy to All Open Workspaces"
- [x] **6.4** Add auto-deploy trigger on workspace open (if `projectMemory.autoDeployOnWorkspaceOpen` is true):
  - Compare deployed checksums against source checksums
  - Only deploy changed files
  - Show count: `"Deployed 3 updated agents, 1 instruction"`

## Phase 7: Diagnostics TreeView

Replace the output-channel-only diagnostics with a visual health panel.

- [x] **7.1** Create `src/providers/DiagnosticsTreeProvider.ts`:
  - Shows subsystem health as tree nodes:
    - `$(check) MCP Server` / `$(warning) MCP Server (degraded)` / `$(error) MCP Server (down)`
    - `$(check) Dashboard` / `$(error) Dashboard (unreachable)`
    - `$(check) Supervisor` / `$(warning) Supervisor (no heartbeat)`
    - `$(database) Database` — size, table counts, WAL size
    - `$(pulse) Memory` — process memory usage if available
  - Sub-nodes under each: uptime, last heartbeat time, connection details
- [x] **7.2** Register as `projectMemory.diagnosticsView` in the activity bar container
- [x] **7.3** Add a "Run Full Diagnostic" command that expands all nodes and logs to output channel
- [x] **7.4** Add click-to-copy on diagnostic values (useful for bug reports)

## Phase 8: Step-Level Code Navigation

When plan steps reference files in their task descriptions or notes, make those file references clickable.

- [x] **8.1** In the TreeView `StepItem`, parse the step task and notes for file paths
- [x] **8.2** Add "Go to File" as a context menu action when file paths are detected
- [x] **8.3** In the sidebar webview dashboard, render detected file paths as clickable links that invoke `vscode.open`
- [x] **8.4** Use the VS Code bridge (`vscode-bridge.ts`) `jumpToCode()` for line-specific navigation when step notes include line numbers

## Phase 9: Build & Verify

- [x] **9.1** `npm run compile` in `vscode-extension/` — verify TypeScript compilation with zero errors
- [x] **9.2** `npx @vscode/vsce package` — verify VSIX package builds successfully
- [x] **9.3** `code --install-extension *.vsix` — install and test in VS Code
- [x] **9.4** Test TreeView:
  - Open a workspace with active plans
  - Verify workspace → plan → step hierarchy renders correctly
  - Click a plan → opens in dashboard panel
  - Context menu actions work (archive, mark done, mark blocked)
- [x] **9.5** Test status bar:
  - Run an agent through the MCP server
  - Verify the status bar updates: `$(robot) Idle` → `$(robot) Executor` → `$(arrow-right) Executor → Reviewer` → `$(robot) Reviewer` → `$(robot) Idle`
- [x] **9.6** Test notifications:
  - Verify handoff notification appears with "Open Plan" action
  - Verify plan complete notification appears
  - Verify mute/settings toggles work
- [x] **9.7** Test deploy:
  - One-click deploy installs only changed files
  - Explorer context menu works for `.agent.md` files
- [x] **9.8** Test diagnostics:
  - Health panel shows correct status for each subsystem
  - Reacts to supervisor disconnect/reconnect
- [x] **9.9** Test extension load time:
  - Verify the extension activates in <500ms
  - Verify no timer loops or heavy startup processing
  - Verify disabling the extension causes zero overhead on Copilot chat
- [x] **9.10** Test extension doesn't register any LM tools or chat participants (regression from Plan 1)

---

## References

### Files to Delete

| Path | Lines | Reason |
|------|-------|--------|
| `src/server/ServerManager.ts` | 602 | Legacy — supervisor manages servers |
| `src/server/FrontendManager.ts` | 158 | Legacy — supervisor manages frontend |
| `src/server/PidLockfile.ts` | 108 | Unused PID lockfile management |
| `src/server/ServerLogger.ts` | ~60 | Only used by ServerManager (orphaned after deletion) |

### Files to Create

| Path | Purpose |
|------|---------|
| `src/providers/WorkspacePlanTreeProvider.ts` | TreeView for workspace → plan → step navigation |
| `src/services/EventSubscriptionService.ts` | Supervisor SSE event subscription and distribution |
| `src/services/NotificationService.ts` | VS Code notifications for plan events |
| `src/providers/DiagnosticsTreeProvider.ts` | TreeView health panel for subsystem status |

### Files to Modify

| Path | Changes |
|------|---------|
| `src/extension.ts` | Register TreeViews, EventSubscription, NotificationService. Remove dead imports. |
| `src/ui/StatusBarManager.ts` | Wire to EventSubscriptionService for live agent status |
| `src/commands/server-commands.ts` | Remove deprecated commands |
| `src/commands/deploy-commands.ts` | Add one-click deploy, context menu deploy |
| `src/providers/DashboardViewProvider.ts` | Add code navigation links for file paths in steps |
| `package.json` | Add TreeViews, remove deprecated commands/settings, update deps |

### Dependencies Changed

| Package | Action | Reason |
|---------|--------|--------|
| `chokidar` | Remove | Confirmed unused — no active `.ts` file imports it |
| `@modelcontextprotocol/sdk` | Remove | Confirmed unused — no active `.ts` file imports it; only archived code used it |

### VS Code API Usage

| API | Used For |
|-----|---------|
| `vscode.TreeDataProvider` | WorkspacePlanTreeProvider, DiagnosticsTreeProvider |
| `vscode.TreeItem` | Plan/step/workspace/health nodes |
| `vscode.EventEmitter` | EventSubscriptionService typed events |
| `vscode.StatusBarItem` | Agent status (existing), deploy button (new) |
| `vscode.window.showInformationMessage` | Plan status notifications with actions |
| `vscode.window.createWebviewPanel` | Dashboard panel (existing) |
| `vscode.commands.registerCommand` | New commands for tree actions |

### Design Notes

- **Complimentary, not duplicative**: The extension provides VS Code-native UI (TreeView, status bar, notifications) that complements the full React dashboard. It doesn't reimplement dashboard features — it provides quick-glance information and navigation shortcuts.
- **Event-driven updates**: All dynamic content is powered by the supervisor SSE broadcast. No polling loops in the extension. The `EventSubscriptionService` is the single connection point.
- **Lazy activation**: The event subscription only connects when consumers exist (TreeView visible, notifications enabled, etc.). The extension remains lightweight when these features are inactive.
- **No LM tools or chat participant**: This plan explicitly does NOT re-add any `languageModelTools` or `chatParticipants`. The extension's role is UI companion, not MCP tool provider.
