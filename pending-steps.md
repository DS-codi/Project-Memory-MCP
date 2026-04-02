# Pending Steps — PM-MCP Test

> Exported on 2026-03-25T13:20:29.482Z
> Workspace ID: `project-memory-mcp-40f6678f5a9b`
> **23 plan(s)** with **177 unfinished step(s)**

## interactive-terminal — QML → Tauri

- **Plan ID:** `plan_mn62kdlr_a3ff1eef`
- **Category:** refactor
- **Priority:** high
- **Status:** active
- **Current Phase:** main.qml
- **Description:** Port interactive-terminal from QML/CxxQt to a standalone Tauri process with xterm.js for the terminal surface. This is the only component using Tauri (WebView required for terminal emulation). Runs as a separate process; communicates with the rest of the app via the existing TCP gateway.

### main.qml

- ⬜ **[PENDING]** Port main.qml — Tauri window shell replacing the QML window root

### TerminalView.qml

- ⬜ **[PENDING]** Port TerminalView.qml — replace with xterm.js WebView component wired to pty-host IPC

### OutputView.qml

- ⬜ **[PENDING]** Port OutputView.qml — read-only output viewer, replace with scrollable xterm.js or HTML panel

### CommandCard.qml

- ⬜ **[PENDING]** Port CommandCard.qml — command metadata display card in the Tauri frontend

## pm-gui-forms — QML → iced

- **Plan ID:** `plan_mn62k8cx_e9daa693`
- **Category:** refactor
- **Priority:** critical
- **Status:** active
- **Current Phase:** FormShell.qml
- **Description:** Port pm-gui-forms from QML/CxxQt to iced. This crate is the shared form component library used by pm-brainstorm-gui and others. Must be ported first or in parallel as a shared iced widget crate so downstream GUIs can depend on it.

### FormShell.qml

- ⬜ **[PENDING]** Port FormShell.qml — outer form container widget

### QuestionCard.qml

- ⬜ **[PENDING]** Port QuestionCard.qml — question display card widget

### RadioSelector.qml

- ⬜ **[PENDING]** Port RadioSelector.qml — radio option selector widget

### FreeTextInput.qml

- ⬜ **[PENDING]** Port FreeTextInput.qml — free text input widget

### ConfirmRejectCard.qml

- ⬜ **[PENDING]** Port ConfirmRejectCard.qml — confirm/reject card widget

### ActionButtons.qml

- ⬜ **[PENDING]** Port ActionButtons.qml — action button row widget

### CountdownBar.qml

- ⬜ **[PENDING]** Port CountdownBar.qml — countdown bar widget

## pm-install-gui — QML → iced

- **Plan ID:** `plan_mn62k3sx_720bd140`
- **Category:** refactor
- **Priority:** medium
- **Status:** active
- **Current Phase:** main.qml
- **Description:** Port pm-install-gui from QML/CxxQt to iced. The install GUI is a wizard-style installer: welcome, path selection, component selection, progress, and finish pages.

### main.qml

- ⬜ **[PENDING]** Port main.qml — wizard shell, page routing, window chrome

### WelcomePage.qml

- ⬜ **[PENDING]** Port WelcomePage.qml — landing/welcome wizard page

### PathSelectionPage.qml

- ⬜ **[PENDING]** Port PathSelectionPage.qml — install path picker page

### ComponentSelectionPage.qml

- ⬜ **[PENDING]** Port ComponentSelectionPage.qml — component checkbox selection page

### ProgressPage.qml

- ⬜ **[PENDING]** Port ProgressPage.qml — install progress display with live log output

### FinishPage.qml

- ⬜ **[PENDING]** Port FinishPage.qml — install complete/result summary page

## pm-brainstorm-gui — QML → iced

- **Plan ID:** `plan_mn62k052_4eb0c8fa`
- **Category:** refactor
- **Priority:** medium
- **Status:** active
- **Current Phase:** main.qml
- **Description:** Port pm-brainstorm-gui from QML/CxxQt to iced. The brainstorm GUI presents structured question flows for gathering user input during planning sessions — radio selectors, free text, chat panel, and a form shell.

### main.qml

- ⬜ **[PENDING]** Port main.qml — window shell, form flow routing, layout skeleton

### FormShell.qml

- ⬜ **[PENDING]** Port FormShell.qml — outer form container with title, progress, and navigation

### QuestionCard.qml

- ⬜ **[PENDING]** Port QuestionCard.qml — individual question display card

### RadioSelector.qml

- ⬜ **[PENDING]** Port RadioSelector.qml — single-choice radio option selector

### FreeTextInput.qml

- ⬜ **[PENDING]** Port FreeTextInput.qml — multi-line free text input field

### ChatPanel.qml

- ⬜ **[PENDING]** Port ChatPanel.qml — conversational chat-style input/output panel

### ConfirmRejectCard.qml

- ⬜ **[PENDING]** Port ConfirmRejectCard.qml — confirm/reject decision card

### ActionButtons.qml

- ⬜ **[PENDING]** Port ActionButtons.qml — form action button row

### CountdownBar.qml

- ⬜ **[PENDING]** Port CountdownBar.qml — animated countdown bar

## pm-approval-gui — QML → iced

- **Plan ID:** `plan_mn62jv2s_c09ada9a`
- **Category:** refactor
- **Priority:** high
- **Status:** active
- **Current Phase:** main.qml
- **Description:** Port pm-approval-gui from QML/CxxQt to iced. The approval GUI is the human-in-the-loop gate for MCP command execution — shows pending command requests with approve/decline controls and a countdown bar.

### main.qml

- ⬜ **[PENDING]** Port main.qml — window shell, queue state binding, overall layout

### ConfirmRejectCard.qml

- ⬜ **[PENDING]** Port ConfirmRejectCard.qml — primary approve/decline card with command details

### ActionButtons.qml

- ⬜ **[PENDING]** Port ActionButtons.qml — approve/decline button row with keyboard shortcuts

### CountdownBar.qml

- ⬜ **[PENDING]** Port CountdownBar.qml — animated countdown progress bar for auto-timeout

## supervisor — QML → iced

- **Plan ID:** `plan_mn62jd5e_fe0133db`
- **Category:** refactor
- **Priority:** high
- **Status:** active
- **Current Phase:** main.qml
- **Description:** Port the supervisor crate UI from QML/CxxQt to iced. One phase per QML file. Supervisor is the main orchestration window: service cards, sessions, panels for plans/sprints/cartographer/chatbot/MCP proxy.

### main.qml

- ⬜ **[PENDING]** Port main.qml — top-level window shell, panel routing, layout skeleton

### ServiceCard.qml

- ⬜ **[PENDING]** Port ServiceCard.qml — individual service status card widget

### StatusRing.qml

- ⬜ **[PENDING]** Port StatusRing.qml — animated status ring indicator

### ActivityPanel.qml

- ⬜ **[PENDING]** Port ActivityPanel.qml — live activity/event feed panel

### SessionsPanel.qml

- ⬜ **[PENDING]** Port SessionsPanel.qml — active sessions list and controls

### PlansPanel.qml

- ⬜ **[PENDING]** Port PlansPanel.qml — plan list and status display

### SprintsPanel.qml

- ⬜ **[PENDING]** Port SprintsPanel.qml — sprint tracking panel

### CartographerPanel.qml

- ⬜ **[PENDING]** Port CartographerPanel.qml — cartographer output/status panel

### ChatbotPanel.qml

- ⬜ **[PENDING]** Port ChatbotPanel.qml — chatbot interaction panel

### McpProxyPanel.qml

- ⬜ **[PENDING]** Port McpProxyPanel.qml — MCP proxy status and controls panel

### EventBroadcastPanel.qml

- ⬜ **[PENDING]** Port EventBroadcastPanel.qml — event broadcast/listener panel

### SettingsPanel.qml

- ⬜ **[PENDING]** Port SettingsPanel.qml — settings panel

### PairingDialog.qml

- ⬜ **[PENDING]** Port PairingDialog.qml — device/session pairing dialog

### AboutPanel.qml

- ⬜ **[PENDING]** Port AboutPanel.qml — about/version info panel

## VS Code Extension Dashboard Tab Refresh and Safe .github Context Culling

- **Plan ID:** `plan_mn3in2rh_9c1e00ee`
- **Category:** bugfix
- **Priority:** high
- **Status:** active
- **Current Phase:** Validation
- **Description:** Refresh the Project Memory VS Code extension side panel dashboard tab so outdated control-centre, configuration, context, and status sections are brought in line with current functionality, and fix the extension's .github context-file culling behavior so only files confirmed to exist in the DB are culled while preserving workspace-specific instructions and skills.

### Validation

- ⬜ **[PENDING]** Extend dashboard-focused extension tests to cover the refreshed section layout, removed legacy session affordances, and corrected message routing/launcher behavior. Files expected to change: vscode-extension/src/test/ui/DashboardPanel.test.ts; vscode-extension/src/test/suite/dashboard-client-helpers.test.ts; vscode-extension/src/test/suite/dashboard-plan-selection-routing.test.ts.
  - Notes: Done when automated tests fail if the dashboard reintroduces dead sections, wires controls to unsupported handlers, or points at stale launcher commands.
- ⬜ **[PENDING]** Extend deployer and sync regression tests to enforce DB-confirmed-only culling, import_candidate onboarding, protected/local preservation buckets, and workspace-local skill retention across extension and server boundaries. Files expected to change: vscode-extension/src/test/suite/DefaultDeployer.test.ts; vscode-extension/src/test/suite/WorkspaceConfigWatcherService.test.ts; vscode-extension/src/test/suite/skillsSourceRoot.test.ts; server/src/__tests__/tools/workspace-db-sync.test.ts; server/src/__tests__/tools/memory-workspace-actions.test.ts; server/src/__tests__/tools/skill-registry.test.ts.
  - Notes: Done when tests cover positive deletion cases, negative preservation cases, and the classification payload consumed by the extension.
- ⬜ **[PENDING]** Run focused verification for the refreshed dashboard and safe-culling workflow, then address any harness/config gaps required to keep those checks stable in CI. Files expected to change: none unless targeted harness fixes are needed in vscode-extension/package.json, server/package.json, or related test configuration files.
  - Notes: Verify targeted extension and server test suites plus a manual dashboard-tab smoke pass that confirms only live controls remain and no preserved .github files are deleted without DB-backed evidence.

### Safe Context Culling Pivot

- ⬜ **[PENDING]** Patch the extension cleanup path so server-confirmed cullable files are deleted using the original on-disk relative_path casing rather than a lowercased reconstruction, preserving correct behavior on case-sensitive filesystems. Files expected to change: vscode-extension/src/deployer/DefaultDeployer.ts. *(Executor)*
  - Notes: Done when cleanup still matches case-insensitively for lookup but uses the original server-provided or manifest-preserved relative path when building the deletion target, with no expansion of cull eligibility.
- ⬜ **[PENDING]** Add direct server-side tests for memory_workspace(import_context_file) covering preview mode, confirm mode, and representative rejection paths so import_candidate onboarding behavior is validated independently of broader classification assertions. Files expected to change: server/src/__tests__/tools/memory-workspace-actions.test.ts. *(Executor)*
  - Notes: Done when the import_context_file action has explicit assertions for preview responses, successful confirmed import behavior, and at least the key rejection classes surfaced by the reviewer path without relying only on higher-level classification tests.

## Sprint Feature Infrastructure

- **Plan ID:** `plan_mn3hd3zl_57590359`
- **Category:** feature
- **Priority:** medium
- **Status:** active
- **Current Phase:** Phase 2: MCP Tool
- **Description:** Add "sprints" - a lightweight, goal-oriented task tracking system distinct from plans. Sprints can optionally attach to plans, have full lifecycle states (active/completed/archived), and require integration across MCP server, Dashboard, VS Code Extension, Supervisor GUI, and agent instructions.

### Phase 2: MCP Tool

- ⬜ **[PENDING]** Verify Phase 2: Run server build. Test memory_sprint tool manually via MCP inspector or test harness confirming list/create/get/update actions work. *(Executor)*
  - Notes: [STALE_RECOVERY 2026-03-23T19:43:26.140Z] Reset stale active run/session state before continuing orchestration.

### Phase 7: Agent Instruction Integration

- ⬜ **[PENDING]** Add `sprint_task` as 8th category to the 7-category routing table in `c:\Users\User\Project_Memory_MCP\.github\agents\prompt-analyst.agent.md`. The category triggers when user requests 'run a sprint,' 'start a sprint,' or explicitly mentions creating/managing a sprint. Route: hub_mode: sprint, scope_classification: quick_task, dispatch: memory_sprint(action: create) via Hub directly (no Researcher/Architect needed for sprint creation). *(Executor)*
- ⬜ **[PENDING]** Add a Sprint Workflow section to `c:\Users\User\Project_Memory_MCP\.github\agents\hub.agent.md`: new `sprint` mode in Workflow Loops section; category routing table row: `sprint_task → memory_sprint(action: create) → Sprint Loop`; Sprint Loop: (1) Hub calls memory_sprint(action: create) directly, (2) Executor works while sprint is active, (3) Hub calls memory_sprint(action: complete_goal) as goals are done, (4) Hub calls memory_sprint(action: update, status: 'completed') when done. *(Executor)*
- ⬜ **[PENDING]** Add 0-step plan guard to hub.agent.md Post-spoke validation gate section. After Architect returns, Hub MUST call memory_plan(action: get) and verify steps.length > 0. If 0 steps: block progression and either re-dispatch Architect or alert user with: 'Plan created but Architect returned no steps.' Do NOT proceed to Executor dispatch with an empty plan. *(Executor)*
- ⬜ **[PENDING]** Add active sprint surfacing to the deploy_and_prep and prep action responses in `c:\Users\User\Project_Memory_MCP\Project-Memory-MCP\server\src\tools\consolidated\memory_session.ts`. The init/deploy_and_prep workspace_status object should include `active_sprints: Sprint[]` by calling getActiveSprints(workspaceId) from sprint-db. This gives Hub visibility into running sprints at session start so it can surface them in the Startup Protocol. *(Executor)*
- ⬜ **[PENDING]** Create `mcp-tool-sprint.instructions.md` instruction file via memory_agent(action: create_instruction). Content must cover: (1) what sprints are vs plans (time-boxed goals, not step-by-step plans), (2) when to use sprints, (3) all 12 memory_sprint actions with key params (list, get, create, update, archive, delete, set_goals, add_goal, complete_goal, remove_goal, attach_plan, detach_plan), (4) sprint lifecycle states, (5) how goals work and goal completion tracking, (6) attach_plan/detach_plan for linking existing plans to a sprint. *(Executor)*
- ⬜ **[PENDING]** Update hub.agent.md Startup Protocol (section 4 context check) to surface active sprints: 'If active_sprints is non-empty in workspace_status, display active sprint count and titles. If a sprint is active, Hub should ask whether to log incoming work against it before creating a new plan.' This leverages the active_sprints data added to the init response in Step 30. *(Executor)*

## Cross-Platform & Version Compatibility for Install Script

- **Plan ID:** `plan_mn14xo8m_dcbbdeb4`
- **Category:** refactor
- **Priority:** high
- **Status:** active
- **Current Phase:** Phase 2: Environment Robustness
- **Description:** Update `install.ps1` and associated setup scripts to ensure full compatibility with older PowerShell versions (specifically Windows PowerShell 5.1) and remove any machine-specific hardcoding that prevents the system from being installed on different environments.

### Phase 2: Environment Robustness

- ⬜ **[PENDING]** Scan for any other machine-specific strings (usernames, local paths) and replace them with generic or environment-relative paths.

### Phase 3: Validation

- ⬜ **[PENDING]** Verify the script syntax using both PowerShell 5.1 and PowerShell 7 environments. Ensure the parser no longer throws 'Unexpected token' errors.

## MCP Chat Session Audit Feature

- **Plan ID:** `plan_mn111lwm_a0885281`
- **Category:** feature
- **Priority:** medium
- **Status:** active
- **Current Phase:** Research
- **Description:** New feature: MCP records tool calls → correlates with VS Code chat session UUID → reads workspaceStorage JSONL → parses turns → generates classified audit report (CONTINUE-NOW / CONTINUE-LATER / DOC-ONLY). Enables post-crash recovery, session forensics, and agent behaviour auditing.

### Research

- 🔄 **[ACTIVE]** Map existing session tracking: audit what memory_agent(action: init) currently stores, confirm whether chat session UUID is available in the VS Code extension context at agent init time, and identify the call site where it would need to be captured and forwarded to the MCP server.
  - Notes: CLI agent started work.
- ⬜ **[PENDING]** Audit the workspaceStorage JSONL layout on this machine: confirm %APPDATA%\Code\User\workspaceStorage paths, verify workspace.json hash-to-path mapping for both folder and .code-workspace hashes, and document the kind-0/1/2 schema with real examples from recent sessions.

### Design

- ⬜ **[PENDING]** Design the ChatAuditor component interface: define where it lives in the server codebase (new crate, existing module, or standalone script), its input contract (workspace_id, optional vscode_session_uuid, date range), and its output schema (session metadata, parsed turns array, classification, keyword hits).
- ⬜ **[PENDING]** Design the MCP tool surface: decide whether to extend memory_session with action: audit / action: list_sessions_with_audit, or add a dedicated memory_chat_audit tool. Define the trigger points: on-demand call, automatic post-handoff hook, and Hub-initiated forensic mode.
- ⬜ **[PENDING]** Design workspace hash discovery logic: enumerate workspaceStorage directories, read workspace.json in each, match against the workspace path registered in the MCP workspace record. Handle multi-root .code-workspace vs folder hash ambiguity. Design must be Windows-first, extensible to Linux/macOS.

### Implement

- ⬜ **[PENDING]** Implement workspace hash discovery: write the function that resolves a workspace_id to canonical workspaceStorage hash to chatSessions directory path. Unit test with real paths from this machine.
- ⬜ **[PENDING]** Implement JSONL parser: read .jsonl files, reconstruct state from kind-0 snapshot + kind-1 key replacements + kind-2 array appends, extract user turn text and timestamps, return structured session objects.
- ⬜ **[PENDING]** Implement session classifier: score sessions against keyword lists, apply CONTINUE-NOW / CONTINUE-LATER / DOC-ONLY classification rules from the vscode-chat-audit skill. Store classification result in session metadata.
- ⬜ **[PENDING]** Implement report generator: produce both machine-readable JSON and human-readable markdown report (INDEX.md format from the skill). Store report via memory_context and optionally write to .projectmemory/chat-audit/<timestamp>-report.md.
- ⬜ **[PENDING]** Wire up VS Code extension: at memory_agent(action: init) call time in the extension, capture the active chat session UUID from the VS Code chat API (if available) and pass it as an optional field. Update the MCP agent session record to store vscode_chat_session_uuid.

### Integrate

- ⬜ **[PENDING]** Add post-handoff audit hook: after memory_agent(action: handoff) completes, automatically trigger a lightweight audit of the closing session and store the summary in memory_context. Hub can reference this on next init.

### Test

- ⬜ **[PENDING]** Integration test: run audit against 3+ known sessions in this workspace, verify title extraction, turn count, timestamp accuracy, and classification correctness. Fix any edge cases from corrupt or truncated JSONL files.

## VS Code Chat Session Audit Component

- **Plan ID:** `plan_mn10uknl_07998945`
- **Category:** feature
- **Priority:** medium
- **Status:** active
- **Current Phase:** Research
- **Description:** New component that correlates MCP tool-call records with VS Code chat session JSONL files to produce per-session audit reports.

### Research

- ⬜ **[PENDING]** Map MCP event log format and JSONL tool-call record structure. Identify where memory_agent stores session records (DB tables, event log) and document the correlation key between memory_agent session_id (embedded in spawn prompts) and the VS Code chat session UUID in workspaceStorage/chatSessions/*.jsonl. Document the JSONL kind=0/1/2 schema for tool-call serialisation. *(Researcher)*

### Design

- ⬜ **[PENDING]** Define AuditRecord data model: { session_uuid, vs_code_workspace_hash, plan_id, agent_role, user_turns[], tool_calls[{name, args, result, timestamp}], files_touched[{path, operation}], scope_declared[], scope_violations[] }. Design correlation algorithm: match memory_agent session to JSONL file by session_id embedded in first user turn; join tool-call events by timestamp window. Produce architecture doc. *(Architect)*

### Implementation

- ⬜ **[PENDING]** Implement workspaceStorage JSONL locator: scan %APPDATA%/Code/User/workspaceStorage/*/workspace.json to find workspace hash, then enumerate chatSessions/*.jsonl. Implement parser: reconstruct full session state from kind=0/1/2 records, extract user turns with timestamps, and extract any tool-call records embedded in assistant response objects. *(Executor)*
- ⬜ **[PENDING]** Implement MCP event correlation layer: query memory_agent session records for a given session_id or timestamp window, extract tool call names and parameters. Join to JSONL turns. Compare file paths in memory_filesystem and other write operations against scope_boundaries declared in the spoke spawn prompt. Flag scope_violations where agent touched paths outside allowed scope. *(Executor)*
- ⬜ **[PENDING]** Implement report renderer: emit AuditRecord as (1) machine-readable JSON to .projectmemory/audit-reports/<session-uuid>.json; (2) human-readable Markdown with sections: Session Summary, User Turns table, Tool Calls table (name/args/outcome/timestamp), Files Changed table (path/operation), Scope Violations section highlighted in red callouts. *(Executor)*
- ⬜ **[PENDING]** Expose auditor as: (a) new memory_cartographer action `audit_session` accepting session_id or date range; (b) standalone CLI entry point `pm-audit`. Wire into Hub post-spoke validation gate: after memory_agent(action: complete, hub_force_close: true), Hub optionally calls audit_session with the closed session_id if scope_violations mode is enabled. *(Executor)*

### Testing

- ⬜ **[PENDING]** Write tests using real JSONL fixture files (anonymised). Verify: turn count, timestamp accuracy, tool-call ordering, correct scope-violation detection. Include a regression fixture modelling an out-of-scope deletion pattern (agent deletes files outside declared scope). Test both CLI and memory_cartographer action entry points. *(Tester)*

### Review

- ⬜ **[PENDING]** Run full build, verify clean audit report output for a known session, confirm Hub post-spoke gate invocation works end-to-end. Check no regressions in cartographer or existing MCP tooling. Verify scope-violation flag is stable (no false positives on standard Executor sessions). *(Reviewer)*

## Fix Interactive Terminal Visual Bugs (CLI Session Rendering)

- **Plan ID:** `plan_mmzr95zu_dba253e8`
- **Category:** feature
- **Priority:** medium
- **Status:** active
- **Current Phase:** Investigation
- **Description:** Fix three distinct visual bugs that appear when hosting Claude, Gemini, or Copilot CLI sessions inside the interactive terminal's xterm.js view:

1. Extended thinking/reasoning content from the CLI leaks into the terminal display (model chain-of-thought rendered raw, repeated multiple times)
2. Duplicate input bars at bottom of screen (ghost UI elements from misaligned TUI re-renders after resize)
3. ~ empty-line markers and ghost status rows bleeding through the PTY alternate-screen buffer

Root causes confirmed by code investigation:
- PTY hardcoded at 24x80 (ws_server.rs) or 40x160 (conpty_backend.rs), but xterm.js view is larger. When xterm.js sends actual size 80ms after connect, the CLI receives resize mid-render and re-draws without clearing previous content.
- No thinking-content suppression anywhere in pipeline. Raw PTY bytes including all thinking text flow straight to xterm.js.
- No QML window-resize handler — PTY never learns about Qt window resizes after initial connect.
- Scrollback replay on reconnect re-sends raw VT bytes including partial TUI cursor-state, causing visual corruption after term.clear().

### Investigation

- 🔄 **[ACTIVE]** Research Copilot CLI and Claude CLI command-line flags that suppress extended-thinking output (e.g. --no-thinking, env variables). Document what each of the three providers supports.
  - Notes: CLI agent started work.

### Fix - PTY Dimensions

- ⬜ **[PENDING]** Fix ws_server.rs create_pty_session(): change hardcoded PtySize rows:24 cols:80 to rows:40 cols:220 so initial CLI render is not at wrong dimensions before first resize from xterm.js.
  - Notes: File: interactive-terminal/src/terminal_core/ws_server.rs lines 76-81
- ⬜ **[PENDING]** Fix conpty_backend.rs spawn_conpty_shell(): change hardcoded PtySize cols:160 to cols:220. Audit spawn_conpty_raw_session() caller sites for other hardcoded dimensions.
  - Notes: File: interactive-terminal/src/terminal_core/conpty_backend.rs lines 30-35

### Fix - Resize Race

- ⬜ **[PENDING]** Fix terminal.html: replace sendResizeDebounced() in ws.onopen with immediate synchronous sendResize(). Keep 80ms debounce only for ResizeObserver and window resize events. Ensures CLI starts at correct xterm.js dimensions from its very first render.
  - Notes: File: interactive-terminal/resources/terminal.html ws.onopen handler
- ⬜ **[PENDING]** Add QML window-resize handlers in main.qml ApplicationWindow: connect onWidthChanged and onHeightChanged to call a Rust invokable that propagates resize to the active PTY session. Without this, Qt window resizes are never forwarded to the terminal after initial connect.
  - Notes: File: interactive-terminal/qml/main.qml ApplicationWindow
- ⬜ **[PENDING]** Add Rust invokable resizeCurrentSessionPty(cols: u32, rows: u32) in invokables.rs that sends a resize JSON message through the active WS server session, exposed to QML via CxxQt bridge.
  - Notes: File: interactive-terminal/src/cxxqt_bridge/invokables.rs

### Fix - Thinking Content

- ⬜ **[PENDING]** Change ThinkingTagFilter in the Rust PTY output pipeline from a drop filter into a route-and-intercept filter. Implement a streaming byte-level state machine (Outside | InsideOpenTag | InsideContent | InsideCloseTag) that extracts thinking content and sends it on a separate broadcast channel, while stripping it from the main output stream. Must handle tags split across 4096-byte read boundaries.
  - Notes: File: interactive-terminal/src/terminal_core/conpty_backend.rs. Add new thinking_tx: broadcast::Sender<Vec<u8>> field to ConptyRawSession.
- ⬜ **[PENDING]** Extend the Rust WS server to forward thinking content as a distinct JSON message type {type:'thinking', payload:'<base64>'} to connected WebSocket clients. Add thinking_output_rx alongside output_rx in the output task.
  - Notes: File: interactive-terminal/src/terminal_core/ws_server.rs. Add new WsMessage::Thinking variant in framing.rs.
- ⬜ **[PENDING]** Investigate and add CLI-level thinking suppression flags in launch_builder.rs as a fallback for providers where the PTY filter alone may not be sufficient. Claude: check for --no-thinking or equivalent. Copilot: check for reasoning suppression option. Gemini: verify --screen-reader suppresses thinking.
  - Notes: File: interactive-terminal/src/launch_builder.rs build_claude_launch(), build_copilot_launch(), build_gemini_launch(). Add suppress_thinking: bool to LaunchOptions.

### Fix - Side Panel

- ⬜ **[PENDING]** Add the thinking side panel to terminal.html: a collapsible right-side drawer (HTML/CSS, no QML changes needed). Panel shows thinking content as it streams in, formatted with light monospace styling. Include a toggle button anchored to the top-right of the terminal view. Panel state (open/closed) persists in localStorage per-session.
  - Notes: File: interactive-terminal/resources/terminal.html. Panel should be ~35% width, dark background (#252526), scrolls independently. Toggle button shows a brain/lightbulb icon or similar indicator. When no thinking content has arrived, button is dimmed.
- ⬜ **[PENDING]** Wire up the ws.onmessage handler in terminal.html to detect {type:'thinking'} frames and append their base64-decoded content to the side panel display. Handle streaming incrementally (thinking content arrives in chunks). Resize the xterm.js terminal to fit the remaining width when panel opens/closes.
  - Notes: File: interactive-terminal/resources/terminal.html. When panel opens, call fitAddon.fit() on the terminal after CSS transition completes so xterm.js reflows to the narrower width.

### Fix - Duplicate Input Bar

- ⬜ **[PENDING]** Replace term.clear() with full VT100 terminal reset (term.write('\x1bc')) in terminal.html ws.onopen. This clears alternate screen buffer, all cursor state, and scroll regions so TUI apps always start on a completely clean canvas, preventing ghost input bars.
  - Notes: File: interactive-terminal/resources/terminal.html ws.onopen
- ⬜ **[PENDING]** Add resize coalescing in Rust WS server: store last_resize: Option<(u16,u16)> per ActiveSession and skip ConPTY resize calls when incoming dimensions are identical to last applied resize. Prevents rapid-fire simultaneous resize events from triggering multiple TUI re-renders.
  - Notes: File: interactive-terminal/src/terminal_core/ws_server.rs ActiveSession struct

### Fix - Scrollback

- ⬜ **[PENDING]** Add provider-aware scrollback bypass: add is_tui_session: bool to ActiveSession. For TUI provider sessions (claude, copilot, gemini) skip scrollback replay on WebSocket reconnect. TUI VT state corrupts when replayed on a freshly reset canvas.
  - Notes: File: interactive-terminal/src/terminal_core/ws_server.rs

### Testing

- ⬜ **[PENDING]** Build and test Copilot CLI session: verify no thinking in main terminal, side panel receives and displays thinking content when toggled, no duplicate input bars, no ~ markers, TUI renders at correct size immediately on open.
- ⬜ **[PENDING]** Test Claude CLI session and Gemini CLI session to verify each provider renders cleanly. Confirm side panel shows thinking content for providers that emit it and stays empty/dimmed for those that do not.
- ⬜ **[PENDING]** Test window resize: drag Qt window to different sizes and verify TUI reflows cleanly. Also verify xterm.js resizes correctly when the side panel is opened and closed.

## Supervisor: Manage Mobile App Server Process

- **Plan ID:** `plan_mmwfdb1c_2e95e22a`
- **Category:** feature
- **Priority:** high
- **Status:** active
- **Current Phase:** Phase 5: Test Coverage
- **Description:** Plan the work required for the Supervisor app to manage the mobile app server alongside the other existing managed server processes, using existing supervisor server-process patterns as the reference design.

### Phase 5: Test Coverage

- 🔄 **[ACTIVE]** Add focused Supervisor tests for config parsing, runtime instantiation, control dispatch, and registry or status propagation around supervisor/src/config.rs, supervisor/src/control/handler.rs, and supervisor/src/registry.rs. *(Tester)*
  - Notes: Prefer focused tests that validate custom-server behavior without regressing existing built-in services.

### Phase 6: Documentation

- ⬜ **[PENDING]** Update operator and developer documentation for the chosen target, including [[servers]] usage, Supervisor control and UI behavior, and any port or firewall prerequisites linked to scripts/setup-firewall-mobile.ps1. *(Executor)*
  - Notes: Document the final meaning of the mobile-related target so future work does not reintroduce the ambiguity.

### Phase 7: Validation

- ⬜ **[PENDING]** Ensure wrapper-script coverage exists for repeatable validation by preferring install.ps1 and run-tests.ps1; if no focused Supervisor preset exists yet, register one before using direct fallback commands. *(Reviewer)*
  - Notes: Explicitly reflects the workspace convention to prefer wrapper scripts over ad-hoc raw commands.
- ⬜ **[PENDING]** Run wrapper-based Supervisor build and test validation and verify the chosen mobile-related service can be launched, stopped, and observed without regressing existing built-in services. *(Reviewer)*
  - Notes: Should validate the clarified target and the dynamic custom-server path end to end.
- ⬜ **[PENDING]** Perform final review against the plan goals and success criteria and confirm the solution keeps custom-server support coherent with existing Supervisor patterns. *(Reviewer)*
  - Notes: Final quality gate before any archival or follow-on execution decisions.

## Add Claude AI Provider Support

- **Plan ID:** `plan_mmw1qxdl_2cc3b020`
- **Category:** feature
- **Priority:** medium
- **Status:** active
- **Current Phase:** Testing & Validation
- **Description:** Add Anthropic Claude as a supported AI provider across the supervisor chatbot, interactive terminal CLI sessions, and launch methods from the supervisor plans panel and dashboard. Currently the system supports Gemini and GitHub Copilot (OpenAI-compatible). Claude requires Anthropic's Messages API with its own request/response protocol, tool-use format, and streaming model.

### Testing & Validation

- ⬜ **[PENDING]** Test terminal credential auto-detection: launch Claude CLI session with no API key — verify claude CLI account auth. Repeat for Copilot (gh) and Gemini (gcloud).
- ⬜ **[PENDING]** Test chatbot provider fallback: configure Claude with no API key — verify it falls back to Gemini then Copilot.
- ⬜ **[PENDING]** Test chatbot with explicit Claude API key: verify direct Anthropic API path works end-to-end with tool calls and multi-turn history.

## PM Mobile — Plan 1: Backend Auth & Network Hardening

- **Plan ID:** `plan_mmvquvtp_2d676d20`
- **Category:** feature
- **Priority:** high
- **Status:** active
- **Current Phase:** Phase 6: Firewall Script
- **Description:** Add API key authentication middleware to Supervisor HTTP server, change Interactive Terminal WS bind address from 127.0.0.1 to 0.0.0.0, add [auth] config section, implement mDNS broadcaster for _projectmemory._tcp in Supervisor, and add Windows Firewall rules for ports 3464 and 9101. This plan is a hard prerequisite for all other PM Mobile plans.

### Phase 6: Firewall Script

- ⬜ **[PENDING]** Create `scripts/setup-firewall-mobile.ps1` with `netsh advfirewall firewall add rule` commands opening inbound TCP port 3464 (Supervisor HTTP) and TCP port 3458 (Interactive Terminal WS); add rule-name labels `PM-Supervisor-HTTP` and `PM-Terminal-WS`; include a comment block at top documenting usage *(Executor)*
- ⬜ **[PENDING]** Update `README.md` (or `docs/lan-setup.md` if it exists) to document LAN access prerequisites: run `setup-firewall-mobile.ps1` as Administrator, note that Supervisor binds `0.0.0.0:3464` and Terminal WS binds `0.0.0.0:3458` after this plan's changes *(Executor)*

## Supervisor: Plans Panel

- **Plan ID:** `plan_mmqwj895_22a95956`
- **Category:** feature
- **Priority:** medium
- **Status:** active
- **Current Phase:** Phase 2: PlansPanel QML
- **Description:** Add a VS Code-style active-plans list panel to the supervisor GUI. Shows plans grouped by workspace with step progress bars and an Open button per plan that opens the dashboard to that plan URL. Requires a new /admin/plans MCP server endpoint, a new PlansPanel.qml component, and wiring in build.rs + main.qml.

### Phase 2: PlansPanel QML

- 🔄 **[ACTIVE]** Run qmllint on supervisor/qml/PlansPanel.qml. Fix all warnings: check pragma ComponentBehavior: Bound on line 1, confirm all delegate properties use `required property`, confirm no unqualified property lookups in delegates, no surrogate-pair emoji in string literals, no missing type annotations. Re-run until zero warnings remain. Done when `qmllint qml/PlansPanel.qml` exits with zero warnings. *(Reviewer)*
  - Notes: Starting qmllint validation on PlansPanel.qml

### Phase 3: Wiring

- ⬜ **[PENDING]** supervisor/build.rs line 43: after `"qml/ChatbotPanel.qml"`, insert a new line ` "qml/PlansPanel.qml",` to register the new QML file in the QmlModule. Done when build.rs qml_files array contains PlansPanel.qml after ChatbotPanel.qml. *(Executor)*
- ⬜ **[PENDING]** supervisor/qml/main.qml after line 413 (end of the SessionsPanel+ActivityPanel RowLayout): insert a new RowLayout row containing PlansPanel: `RowLayout { Layout.fillWidth: true; PlansPanel { mcpBaseUrl: root.mcpBaseUrl; dashBaseUrl: root.dashBaseUrl; mcpPort: supervisorGuiBridge.mcpPort } }`. Done when main.qml contains the PlansPanel instance wired with all three properties. *(Executor)*

### Phase 4: Build & Verify

- ⬜ **[PENDING]** Build MCP server: in directory server/, run `npm run build`. Confirm zero TypeScript errors. If errors, fix them before marking done. Typical errors: missing getPlansByWorkspace import, wrong queryAll call signature, missing null safety on recommended_next_agent. Done when `npm run build` exits with code 0. *(Reviewer)*
- ⬜ **[PENDING]** Build supervisor: run `.\install.ps1 -Component Supervisor -Force` from Project-Memory-MCP/. This also rebuilds the MCP server if needed. Confirm Rust compilation succeeds and the supervisor window opens showing PlansPanel below the Sessions+Activity row. Done when install.ps1 exits with code 0 and the panel is visible. *(Reviewer)*
- ⬜ **[PENDING]** Smoke test: open supervisor, select a workspace from the PlansPanel ComboBox, confirm the plan list populates with titles and progress bars within 15 seconds. Click Open on a plan and confirm the browser opens to the correct URL (http://127.0.0.1:{dashboardPort}/workspace/{wsId}/plan/{planId}). Done when all three behaviors are confirmed visually. *(Reviewer)*

## Dashboard Launch Agent Session Button

- **Plan ID:** `plan_mmpjvoj6_9d6f75a7`
- **Category:** feature
- **Priority:** high
- **Status:** active
- **Current Phase:** Phase 1: Rust Fix & Rebuild
- **Description:** Add a "Launch Agent Session" button to the dashboard that: (1) ensures the interactive terminal is running (auto-launches via supervisor if not), (2) sends a StartAgentSessionRequest over TCP to the interactive terminal with the correct working directory (workspace root), plan context, and MCP server URL injected into env, (3) presents a dialog to choose AI CLI (Gemini/Copilot) and optionally configure the session. Button appears on PlanDetailPage header and per phase/step in StepList. Requires: new POST /api/agent-session/launch endpoint on the dashboard server, TypeScript types for StartAgentSessionRequest mirroring the Rust protocol, a React dialog component, and a useLaunchAgentSession hook. Also ensures inject_project_memory_mcp_env_defaults in launch_builder.rs correctly injects PM_MCP_SERVER_URL and PM_MCP_TRANSPORT so the CLI can connect to Project Memory.

### Phase 1: Rust Fix & Rebuild

- ⬜ **[PENDING]** Fix port bug in `interactive-terminal/src/launch_builder.rs`: change `DEFAULT_PM_MCP_SERVER_URL` from `http://127.0.0.1:3467/mcp` → `http://127.0.0.1:3457/mcp`; rebuild with `.\install.ps1 -Component InteractiveTerminal` *(Executor)*
- ⬜ **[PENDING]** Add `StartAgentSessionRequest` and `StartAgentSessionResponse` interfaces + `isStartAgentSessionResponse()` type guard to `server/src/tools/terminal-ipc-protocol.ts`; add both to `TerminalIpcMessage` union and `KNOWN_TYPES` set *(Executor)*
- ⬜ **[PENDING]** Add `sendStartAgentSession(req: StartAgentSessionRequest): Promise<StartAgentSessionResponse>` method to `server/src/tools/terminal-tcp-adapter.ts` following the `sendReadOutput()` pattern using `sendAndAwaitTyped` *(Executor)*
- ⬜ **[PENDING]** Build and verify MCP server compiles: `npm run build` in `server/` *(Executor)*

### Phase 2: Dashboard Server Route

- ⬜ **[PENDING]** Create `dashboard/server/src/routes/agentSession.ts` — Express router with `POST /launch` handler: reads workspace path from DB, builds `StartAgentSessionRequest`, sends TCP NDJSON to port 3458 using Node `net` module (with supervisor auto-launch on ECONNREFUSED via supervisor TCP port 45470), returns `{ session_id, accepted, state }` *(Executor)*
- ⬜ **[PENDING]** Register route in `dashboard/server/src/index.ts`: add `import { agentSessionRouter } from './routes/agentSession'` and `app.use('/api/agent-session', agentSessionRouter)` *(Executor)*
- ⬜ **[PENDING]** Build and verify dashboard server compiles: `npm run build` in `dashboard/server/` *(Executor)*

### Phase 3: Dashboard Frontend

- ⬜ **[PENDING]** Create `dashboard/src/hooks/useLaunchAgentSession.ts` — `useMutation` hook using `fetch()` to POST `/api/agent-session/launch` with `{ workspaceId, planId, provider, phase?, stepIndex?, stepTask? }` *(Executor)*
- ⬜ **[PENDING]** Create `dashboard/src/components/plan/LaunchAgentSessionDialog.tsx` — modal dialog with provider selector (Gemini / Copilot), plan/phase/step context display, Launch button wired to `useLaunchAgentSession` hook with loading/success/error states *(Executor)*
- ⬜ **[PENDING]** Add `<LaunchAgentSessionButton>` to `dashboard/src/pages/PlanDetailPage.tsx` header flex div (`flex items-center gap-2 justify-end mb-2`) — triggers `LaunchAgentSessionDialog` with plan-level context (`workspaceId`, `planId`) *(Executor)*
- ⬜ **[PENDING]** Add `workspaceId?: string` and `planId?: string` props to `PhaseListView` and `PhaseCard` in `dashboard/src/components/plan/PhaseListView.tsx`; add per-phase Launch button opening `LaunchAgentSessionDialog` with phase context *(Executor)*
- ⬜ **[PENDING]** Add per-step Launch button to `dashboard/src/components/plan/StepList.tsx` action area div (`flex items-center gap-1 flex-shrink-0`); guard with `workspaceId && planId`; pass `step.index` and `step.task` as context to dialog *(Executor)*
- ⬜ **[PENDING]** Build dashboard frontend: `npx vite build` in `dashboard/` *(Executor)*

### Phase 4: Smoke Test

- ⬜ **[PENDING]** Smoke test: launch supervisor + interactive terminal, open dashboard, navigate to a plan, click Launch Agent Session button in header; verify dialog opens, provider selector works, launch sends request to port 3458, terminal opens with correct working directory and MCP context *(Executor)*
- ⬜ **[PENDING]** Verify port fix: in the launched agent session, confirm `PM_MCP_SERVER_URL` env var is `http://127.0.0.1:3457/mcp` *(Executor)*

## Debug GUI Forms Runtime and Launch Flow

- **Plan ID:** `plan_mmfz7e9m_d6a3631b`
- **Category:** bugfix
- **Priority:** high
- **Status:** active
- **Current Phase:** Phase 1: Audit & Diagnose
- **Description:** Investigate and fix approval/brainstorm GUI form launch or runtime failures in supervisor-managed flow.

### Phase 1: Audit & Diagnose

- ⬜ **[PENDING]** Verify GUI binaries exist and are on PATH. Run `where pm-approval-gui` and `where pm-brainstorm-gui` from a shell, and confirm `C:\Users\User\Project_Memory_MCP\Project-Memory-MCP\target\release\pm-approval-gui.exe` and `pm-brainstorm-gui.exe` both exist. Supervisor default config resolves these by name, so PATH must include the release directory or supervisor.toml must set an explicit absolute path under `[approval_gui] command` and `[brainstorm_gui] command`.
- ⬜ **[PENDING]** Read the active supervisor.toml config file (typically `%APPDATA%\ProjectMemory\supervisor.toml`). Verify the `[approval_gui]` and `[brainstorm_gui]` sections: check `enabled`, `command`, `working_dir`, `timeout_seconds`, and any `env` overrides. The default `command` values are `"pm-approval-gui"` and `"pm-brainstorm-gui"` — confirm these resolve correctly. Also verify `[gui_server] enabled = true` and `port = 3464` with a matching bind_address.
- ⬜ **[PENDING]** Check supervisor startup logs for summonability diagnostics. The supervisor logs one of four messages at startup for approval_gui: `approval_gui summonability: enabled (resolved_command=...)`, `disabled in config`, `disabled at runtime-map boundary (missing command)`, or `disabled at runtime-map boundary (unresolved executable path)`. Find these lines in supervisor stderr or the runtime output. The brainstorm_gui skips the diagnostic check — verify it was registered with `form_apps.insert("brainstorm_gui", ...)` at line 949 of `supervisor/src/main.rs`.
- ⬜ **[PENDING]** Probe the GUI server endpoint manually. Run `curl -s -H "X-PM-API-Key: <key>" http://localhost:3464/gui/ping` and confirm `available: true` and both `approval_gui` and `brainstorm_gui` appear in the `apps` array. If the port does not respond, the gui_server is disabled or bound to a conflicting address. If one app is missing, summonability gating silently disabled it. The API key comes from `supervisor.toml [auth] api_key`.
- ⬜ **[PENDING]** Test a manual launch of each GUI binary from the command line to isolate runtime vs. launch failures. In a terminal set `$env:QT_FORCE_STDERR_LOGGING=1` and run `echo '{"type":"form_request","version":1,...}' | pm-approval-gui.exe`. If the process exits immediately with no stdout output, this is the GUI crash / panic scenario described in the comment at line 37-48 of `pm-approval-gui/src/main.rs` — release builds with `windows_subsystem = "windows"` swallow panics silently. Reproduce the same for `pm-brainstorm-gui.exe`.
- ⬜ **[PENDING]** Capture runtime output from the GUI processes via the supervisor's `/runtime/recent` endpoint. Send `GET http://localhost:3464/runtime/recent?component=approval_gui&limit=200` and `?component=brainstorm_gui&limit=200` after a failed launch attempt. This endpoint returns stderr lines captured by `spawn_pipe_reader` in `supervisor/src/runner/form_app.rs` (lines 211-213). Error messages from Qt plugin loading, QML import failures, or panics will appear here if `[runtime_output] enabled = true`.
- ⬜ **[PENDING]** Check whether the `windows_subsystem = "windows"` attribute causes silent panic suppression in release builds. Both `pm-approval-gui/src/main.rs:1` and `pm-brainstorm-gui/src/main.rs:1` have `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`. In release mode, any panic before the Qt event loop starts (e.g. tokio runtime failure, QML load failure) is swallowed, causing the child to exit with code 0 and no stdout output — which `read_ndjson_line` in `form_app.rs` interprets as `"child closed stdout without sending a response"`. Build a debug binary to see panics: `cargo build -p pm-approval-gui` (without `--release`).
- ⬜ **[PENDING]** Verify Qt deployment is intact for the release binaries. The install script (`install.ps1` lines 1221, 1229) runs `windeployqt` to copy Qt DLLs and QML imports alongside the exe. Check that `C:\Users\User\Project_Memory_MCP\Project-Memory-MCP\target\release\` contains Qt6Gui.dll (already confirmed), Qt6Qml.dll, Qt6Quick.dll, QtQuick\, and the `com\projectmemory\approval` and `com\projectmemory\brainstorm` QML plugin directories. A missing QML import causes silent exit in windowed mode.

### Phase 2: Fix

- ⬜ **[PENDING]** If the summonability diagnostic disabled brainstorm_gui at runtime, add the same path-resolution hardening block for brainstorm_gui in `supervisor/src/main.rs` around line 948-949. Currently only `approval_gui` gets the `diagnose_form_app_summonability` gate (lines 954-988); `brainstorm_gui` is inserted directly with no diagnostic. Replicate the same `match` block for `brainstorm_gui` so unresolved-path failures are caught and logged instead of silently producing a misconfigured enabled entry.
- ⬜ **[PENDING]** If the root cause is `windows_subsystem = "windows"` swallowing panics in release mode: add a panic hook before the Qt application setup in both `pm-approval-gui/src/main.rs` and `pm-brainstorm-gui/src/main.rs`. After the `let _rt_guard = rt.enter();` line, insert `std::panic::set_hook(Box::new(|info| { eprintln!("[pm-approval-gui PANIC] {info}"); std::process::exit(1); }));` so that panics write to stderr (captured by `spawn_pipe_reader`) and exit with non-zero status rather than silently disappearing.
- ⬜ **[PENDING]** If the root cause is a missing or malformed FormRequest JSON from the caller causing `serde_json::from_str` to return an error that gets surfaced as `std::process::exit(1)` in the `initialize.rs` error handler — the response never reaches stdout so the supervisor sees EOF and returns `child closed stdout without sending a response`. Ensure the MCP server's `memory_brainstorm` and `memory_plan/summon_approval` tools build a valid `FormRequest` with all required fields: `type`, `version`, `request_id`, `form_type`, `metadata` (plan_id, workspace_id, session_id, agent, title), `timeout`, `window`, and `questions`. Test the exact payload sent via POST to `/gui/launch` against the `FormRequest` schema in `pm-gui-forms/src/protocol/envelope.rs`.
- ⬜ **[PENDING]** If the root cause is a stderr pipe buffer deadlock: verify that `cmd.stderr(Stdio::piped())` is set and `spawn_pipe_reader` is called immediately after spawn in `supervisor/src/runner/form_app.rs` (lines 151-213). The comment at line 205-210 describes this known failure: `QT_FORCE_STDERR_LOGGING=1` is inherited by child processes because the supervisor sets it in `configure_qt_logging()` (`main.rs` line 65). If `spawn_pipe_reader` is not draining stderr fast enough, add a larger buffer or confirm the tokio task is spawned before the stdin write. Verify this ordering is correct in the current code.
- ⬜ **[PENDING]** If Qt deployment is missing QML modules: re-run `install.ps1` with the GUI build steps to regenerate the windeployqt output. Specifically check for `qrc:/qt/qml/com/projectmemory/approval/qml/main.qml` (loaded from embedded QRC in the binary) vs. filesystem QML imports. The main.qml is loaded via QRC path in both apps (approval: `qrc:/qt/qml/com/projectmemory/approval/qml/main.qml`, brainstorm: `qrc:/qt/qml/com/projectmemory/brainstorm/qml/main.qml`), but QtQuick Controls Material style DLLs must be deployed. Verify `Qt6QuickControls2Material.dll` or equivalent is present.

### Phase 3: Validate

- ⬜ **[PENDING]** Build debug binaries for both GUI apps and do a manual round-trip test. Run `cargo build -p pm-approval-gui -p pm-brainstorm-gui` (debug mode so panics are visible). Pipe a minimal valid FormRequest JSON on stdin and verify the process writes a valid FormResponse JSON on stdout. Example: `echo '{"type":"form_request","version":1,"request_id":"00000000-0000-0000-0000-000000000001","form_type":"approval","metadata":{"plan_id":"test","workspace_id":"test","session_id":"test","agent":"test","title":"Test"},"timeout":{"duration_seconds":10,"on_timeout":"approve"},"window":{"width":480,"height":360,"always_on_top":false},"questions":[{"type":"confirm_reject","id":"q1","label":"Approve?","approve_label":"Yes","reject_label":"No","allow_notes":false}]}' | target\debug\pm-approval-gui.exe`.
- ⬜ **[PENDING]** Test the full supervisor-managed launch flow via the `/gui/launch` HTTP endpoint. With the supervisor running, POST to `http://localhost:3464/gui/launch` with `{"app_name": "approval_gui", "payload": {<valid FormRequest>}}` and an `X-PM-API-Key` header. Verify the response has `ok: true` and `data.success: true` with a `response_payload` containing a valid FormResponse JSON. Repeat for `brainstorm_gui`. Both must complete without a 500 error and without timing out under the default 300-second timeout.

## Supervisor proxy observability — trends, counters, diagnostics

- **Plan ID:** `plan_mm3k6xv9_8c42f7d0`
- **Category:** feature
- **Priority:** medium
- **Status:** active
- **Current Phase:** Phase 1: Runtime metrics model
- **Description:** Add deeper MCP proxy observability to the Supervisor GUI and runtime: per-instance health trend history, reconnect/error counters, and lightweight in-window diagnostics for multi-VSCode session behavior.

### Phase 1: Runtime metrics model

- ⬜ **[PENDING]** Add/extend protocol and bridge properties needed to expose diagnostics fields to QML while preserving existing property naming/style conventions. *(Executor)*

### Phase 2: Poll-loop integration

- ⬜ **[PENDING]** Integrate diagnostics updates into MCP sync/poll path: detect reconnect churn, increment counters, update per-instance trend history and derive hotspot indicators. *(Executor)*
- ⬜ **[PENDING]** Ensure trend/counter updates are pushed via existing UI refresh path with bounded memory behavior and no additional background loops. *(Executor)*

### Phase 3: GUI diagnostics section

- ⬜ **[PENDING]** Add compact diagnostics UI block to supervisor main window (same page) showing trend summary, reconnect/error counters, and per-instance health hints. *(Executor)*
- ⬜ **[PENDING]** Add clear empty/healthy/degraded states for diagnostics without introducing new pages, popups, or complex UX. *(Executor)*

### Phase 4: Validation and handoff

- ⬜ **[PENDING]** Run targeted checks and verify existing controls still work conceptually with new diagnostics wiring; record findings and any follow-up gaps. *(Reviewer)*

## Supervisor as Native MCP Runtime (Remove MCP Instance Spawning)

- **Plan ID:** `plan_mm2i95jz_de84e7bb`
- **Category:** orchestration
- **Priority:** high
- **Status:** active
- **Current Phase:** Phase 4: Capability Waves
- **Description:** Plan and execute migration so Supervisor acts as MCP runtime directly using async subprocess architecture, replacing MCP instance spawning/management while preserving tool contracts, safety controls, and observability.

### Phase 3: Validation

- 🚫 **[BLOCKED]** Run build-check and architecture conformance review against no-fallback policy and wave gate definitions *(Reviewer)*
  - Notes: No-build directive held previously; reviewer identified remaining fallback paths in orchestration routing and fallback-oriented launch-routing test assertions.

### Phase 4: Capability Waves

- 🚫 **[BLOCKED]** Execute Wave 1 cohort (read-only/low-risk capabilities) and verify G1/G4 gate compliance *(Reviewer)*
  - Notes: sess_mm3itn13_4f4242ab rerun complete under constraints: isolated launcher path only, shared default untouched, no build/compile. G1 routing evidence remains specialized_host/no-fallback from orchestration context. G4 remains blocked: start-supervisor-wave-validation exits early (exitCode=1) and direct isolated run reports another instance already running; alternate pipe absent while default pipe remains present.
- ⬜ **[PENDING]** Execute Wave 2 cohort (mutating but bounded capabilities) and verify G1/G2/G4 gates *(Reviewer)*
- ⬜ **[PENDING]** Execute Wave 3 cohort (long-running/interactive operations) and verify G1-G5 gates *(Reviewer)*
- ⬜ **[PENDING]** Execute Wave 4 cohort (full default traffic) with shadow verification and no-fallback enforcement *(Reviewer)*

### Phase 5: Cutover Governance

- ⬜ **[PENDING]** Coordinator user confirmation checkpoint for final cutover acceptance under no-fallback posture *(Coordinator)*
- ⬜ **[PENDING]** Archive migration decision record with risk register, compensating controls, and operational runbooks *(Reviewer)*

## Supervisor Tray Runtime Regression: Menu + QML GUI + Startup State

- **Plan ID:** `plan_mlvy56on_7e87ab98`
- **Category:** bugfix
- **Priority:** high
- **Status:** active
- **Current Phase:** Phase 2: Supervisor GUI Scaffold
- **Description:** Investigate and fix runtime issues after restart where tray remains in starting state, right-click tray menu shows no options, and expected QML GUI is not visible.

### Phase 2: Supervisor GUI Scaffold

- ⬜ **[PENDING]** Create minimal supervisor GUI assets and bridge files: supervisor/qml/main.qml, supervisor/src/cxxqt_bridge/mod.rs, supervisor/src/cxxqt_bridge/ffi.rs; expose invokables needed for show/hide and status text only. *(Executor)*

### Phase 3: Tray Status Fix

- ⬜ **[PENDING]** Implement tooltip refresh beyond Starting by extending supervisor/src/tray_tooltip.rs with tooltip-update API (NIF_TIP + NIM_MODIFY) and invoking it from state transitions in supervisor/src/main.rs. *(Executor)*

### Phase 3: Tray Menu + GUI Control

- ⬜ **[PENDING]** Implement right-click tray menu plumbing in supervisor/src/tray_tooltip.rs (callback message + popup menu) with exactly these actions: Show Supervisor GUI, Hide Supervisor GUI, Quit Supervisor. *(Executor)*
- 🔄 **[ACTIVE]** Wire tray menu actions to supervisor GUI lifecycle in supervisor/src/main.rs so Show/Hide toggles supervisor window visibility and Quit triggers existing supervisor shutdown path. *(Executor)*
  - Notes: Wiring Show/Hide/Quit menu actions to supervisor runtime control path.
- 🔄 **[ACTIVE]** Add per-component tray submenu actions for Launch, Restart, and Shutdown using existing supervisor control lifecycle handlers. *(Executor)*
  - Notes: Implementing per-component tray actions using existing lifecycle handlers.

### Phase 4: Verification (Build + Runtime)

- ⬜ **[PENDING]** Run build verification via registered script 'Supervisor Cargo Build' (cargo build -p supervisor in Project-Memory-MCP root), then perform runtime checks: tooltip transitions beyond Starting, right-click menu options render, Show/Hide supervisor GUI works, Quit exits cleanly. *(Reviewer)*

### Phase 4: Verification (Targeted Tests)

- ⬜ **[PENDING]** Run targeted tests: cargo test -p supervisor tray_tooltip and cargo test -p supervisor; record any manual-only gaps (tray interaction) and confirm no regressions. *(Tester)*

## Dedicated Copilot CLI Terminal GUI

- **Plan ID:** `plan_mlvkbo9r_0bb169ac`
- **Category:** orchestration
- **Priority:** high
- **Status:** active
- **Current Phase:** Phase 1: Re-Baseline Current Architecture
- **Description:** Create a separate minimal GUI for spawned Copilot CLI terminal sessions with tabbed multi-session support, while preserving separation from the main interactive terminal and producing explicit decoupling evidence.

### Phase 1: Re-Baseline Current Architecture

- ⬜ **[PENDING]** Produce an updated ownership map for specialized_host launch flow (prep/deploy context creation, routing decision, supervisor launch trigger, interactive-terminal runtime execution) with explicit boundaries between server, supervisor, and interactive-terminal. *(Architect)*

### Phase 2: Gemini Provider & Credential Contract

- ⬜ **[PENDING]** Implement/adjust runtime credential intake in interactive-terminal launch path so coding-subagent shell sessions can resolve Gemini credentials at execution time while preserving existing PM_* environment propagation. *(Executor)*

### Phase 3: Coding Subagent Launch Integration

- ⬜ **[PENDING]** Update spawn/routing orchestration so Gemini can be selected as the coding subagent provider for specialized_host sessions while retaining memory_session prep/deploy context delivery and native runSubagent execution semantics. *(Executor)*
- ⬜ **[PENDING]** Add/refresh user-facing configuration notes for selecting Gemini provider and supplying key material via local env/config (no secret values committed). Include explicit examples for Windows paths and supervisor startup sequence. *(Executor)*

### Phase 4: Validation & Safety

- ⬜ **[PENDING]** Add or update targeted tests for launch routing + provider selection + env mapping, including negative cases (missing key, malformed key entry, unavailable specialized_host). *(Tester)*
- ⬜ **[PENDING]** Run build/compile validation matrix across touched components (server, supervisor, interactive-terminal, extension if touched) and verify no regressions to non-Gemini or fallback flows. *(Reviewer)*
- ⬜ **[PENDING]** Perform security/log review to confirm secret redaction and absence of plaintext Gemini key in logs, diagnostics, plan artifacts, and UI strings; then close plan with go/no-go recommendation. *(Reviewer)*

## MCP Terminal Tool & GUI Approval Flow

- **Plan ID:** `plan_mlp8qxtq_ad821ebf`
- **Category:** feature
- **Priority:** high
- **Status:** active
- **Current Phase:** Phase 4: GUI Tray-Resident Mode
- **Description:** Complete redesign of the MCP terminal tool interaction with the custom GUI terminal application (interactive-terminal). The MCP tool (memory_terminal_interactive) sends commands to the GUI app via TCP/JSON IPC. Non-allowlisted commands trigger an approval dialog in the GUI. The GUI launches minimized (system tray/taskbar, user-configurable) when invoked by MCP. Output is saved as structured JSON to .projectmemory/terminal-output/ with a rolling last-10 retention policy. Timeout handling (~50s) returns partial output + state if the user hasn't responded. Container mode supported: server reaches host GUI via host.containers.internal. Full clean slate — all old approval artifacts and headless policy from the previous plan are removed first.

### Phase 4: GUI Tray-Resident Mode

- ⬜ **[PENDING]** Verify Phase 4 GUI tray mode: 'cargo build' succeeds. Manual test: launch the app, verify it minimizes to tray. Click tray icon to show. Send a test command via TCP (use a simple script or netcat) and verify approval dialog appears. Approve and verify command executes. Check performance metrics are displayed. *(Reviewer)*
  - Notes: Started step 26 for interactive-terminal duplicate TerminalApp associated functions build error; loading required skill and inspecting cxxqt_bridge files.
[STALE_RECOVERY 2026-03-02T19:14:02.351Z] Reset stale active run/session state before continuing orchestration.
- ⬜ **[PENDING]** LIVE PROOF GATE: Prove the GUI app can be launched, connected to via MCP memory_terminal tool, and that the approval dialog flow works end-to-end. Call memory_terminal(action: run) with a non-allowlisted command and verify the GUI surfaces the approval dialog and the result (approve or deny) reaches the tool response. Do NOT proceed to Phase 5 until this is demonstrated. *(Reviewer)*
  - Notes: Confirmed by user (ready). Reviewer executing LIVE PROOF gate now with run-app-first order.
[STALE_RECOVERY 2026-02-16T20:39:41.125Z] Reset stale active run/session state before continuing orchestration.

### Phase 5: Output Persistence

- ⬜ **[PENDING]** Verify Phase 5 output persistence: run a command through the full flow, verify JSON output file is created in the correct location with correct structure. Run 12+ commands and verify only the latest 10 output files remain. *(Reviewer)*
  - Notes: Test both file creation and rolling retention.

### Phase 6: Container Support

- ⬜ **[PENDING]** Verify Phase 6 container support: build the container image, run the MCP server in container mode, send a command via MCP tool call from the container. Verify the GUI on the host receives the request, shows approval dialog, and the response flows back to the container. *(Reviewer)*
  - Notes: End-to-end container-to-host verification. Requires both container and host GUI running.

### Phase 7: Testing & Integration

- ⬜ **[PENDING]** Write comprehensive unit tests for the memory_terminal tool surface: test all 5 actions (run, read_output, kill, get_allowlist, update_allowlist). Test error handling for missing params, invalid actions, connection failures. Test allowlist authorization flow (allowed, blocked, needs-approval). *(Tester)*
  - Notes: Server-side unit tests. Mock the TCP adapter for isolation.
- ⬜ **[PENDING]** Write integration tests for TCP adapter + Rust GUI: start the GUI app in test mode, send commands from the TS test suite via TCP, verify round-trip message flow. Test scenarios: auto-approved (allowlisted), approval dialog (simulated), declined, connection lost, timeout with heartbeat. *(Tester)*
  - Notes: Integration test requiring both TS and Rust processes. May need a test harness.
- ⬜ **[PENDING]** Write Rust-side tests for the GUI: test output file writing and rolling retention. Test system tray lifecycle. Test approval dialog flow (approveCommand, declineCommand). Test performance monitor metrics collection. *(Tester)*
  - Notes: Rust unit tests for the new GUI functionality.
- ⬜ **[PENDING]** Update project documentation: update README.md with the new architecture. Update .github/instructions/ files to reflect the new memory_terminal tool (remove references to memory_terminal_interactive and the old approval flow). Update mcp-usage.instructions.md terminal sections. *(Executor)*
  - Notes: Documentation must match the new single-tool architecture.
- 🚫 **[BLOCKED]** Final end-to-end validation: run the full flow — MCP server (local mode) → memory_terminal run → GUI approval → command execution → output file written → tool returns summary + file path. Verify heartbeat progress notifications. Verify allowlisted commands auto-execute. Run full test suites: 'npx vitest run' in server/, 'cargo test' in interactive-terminal/. *(Reviewer)*
  - Notes: Implemented focused bugfix in interactive-terminal: (1) top action controls split into two clear rows in qml/main.qml, (2) saved commands overlay now suppresses TerminalView WebView and drawer z raised, (3) clipboard copy for current/last outputs now sanitizes ANSI/control sequences in src/cxxqt_bridge/invokables.rs and OutputView copy button routes through TerminalApp copy path. File diagnostics show no errors. Validation build command .\\install.ps1 -Component InteractiveTerminal could not be executed in this session because VS Code terminal execution was skipped twice and memory_terminal fallback returned socket-closed.
