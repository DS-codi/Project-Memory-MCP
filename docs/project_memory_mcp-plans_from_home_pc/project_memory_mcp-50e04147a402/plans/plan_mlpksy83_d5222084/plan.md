# Subagent Session Interruption & Injection System

**Plan ID:** plan_mlpksy83_d5222084
**Status:** active
**Priority:** high
**Current Phase:** Phase 1: Session Types & Registry (Extension-Side)
**Current Agent:** Coordinator

## Description

Add real-time interrupt and inject capabilities for running subagent sessions. The system intercepts MCP tool responses at the extension layer to deliver stop directives and user-provided refinements to active subagents. Sessions are identified by workspace_id + plan_id + session_id triple, with an is_subagent flag on tool calls. The extension panel displays active sessions with stop/inject controls. Hub agents detect orphaned sessions on re-init for recovery.

## Progress

- [ ] **Phase 1: Session Types & Registry (Extension-Side):** [code] Create session-types.ts in vscode-extension/src/chat/orchestration/session-types.ts — Define all session-related types: SessionStatus ('active'|'stopping'|'stopped'|'completed'), SessionTripleKey {workspaceId, planId, sessionId}, StopEscalationLevel (1|2|3), InterruptDirective {requestedAt, escalationLevel, reason?}, InjectPayload {text, queuedAt}, LastToolCallInfo {toolName, timestamp, callCount}, SessionEntry {sessionId, workspaceId, planId, agentType, parentSessionId?, startedAt, status, lastToolCall?, interruptDirective?, injectQueue, stopEscalationCount}, SerializedRegistry {version: 1, sessions: Record<string, SessionEntry>}.
  - _TYPES ONLY — no runtime code. Follow naming conventions from active-run-registry.ts (ActiveRunRecord, LaneState). The parentSessionId field enables hub propagation (Phase 3 Step 9). SerializedRegistry is the persistence format for workspaceState. File should be <80 lines.

Acceptance: All types exported. No runtime code. Compiles cleanly. Naming consistent with existing orchestration types._
- [ ] **Phase 1: Session Types & Registry (Extension-Side):** [code] Create SessionInterceptRegistry class in vscode-extension/src/chat/orchestration/session-intercept-registry.ts — Map<string, SessionEntry> keyed by tripleKey '${workspaceId}::${planId}::${sessionId}' (same pattern as active-run-registry lanes Map keyed by '${workspace_id}::${plan_id}'). Persistence via vscode.Memento (context.workspaceState) — persist() on every mutation, restore() on activation. API: register(), get(), getBySessionId(), getByPlan(), markStopping(), markCompleted(), listActive(), queueInterrupt(), dequeueInterrupt(), incrementEscalation(), queueInject(), dequeueAllInjects(), recordToolCall(), pruneCompleted(). Expose onDidChange event via vscode.EventEmitter<void> for dashboard subscriptions.
  - _CRITICAL: active-run-registry.ts has NO persistence (in-memory only). This registry MUST persist to context.workspaceState to survive extension reloads. Use storage.get<SerializedRegistry>(STORAGE_KEY) and storage.update(STORAGE_KEY, serialized) pattern.

Key implementation details:
- Constructor takes vscode.Memento (context.workspaceState)
- static STORAGE_KEY = 'sessionInterceptRegistry'
- tripleKey() helper: `${workspaceId}::${planId}::${sessionId}`
- getBySessionId(sessionId): scans all entries (for ToolProvider which only has sessionId from _session_id meta-field)
- restore(): deserialize from storage, prune entries older than 24h
- persist(): serialize Map to JSON, write to storage — call after EVERY mutation
- onDidChange fires after every mutation (DashboardViewProvider subscribes for refresh)
- register() initializes status='active', injectQueue=[], stopEscalationCount=0
- incrementEscalation() returns min(current+1, 3) as StopEscalationLevel

Keep under 280 lines. Follow class pattern (unlike active-run-registry which uses module-level functions) because constructor needs Memento reference.

Acceptance: All methods implemented. Persistence round-trips correctly (register → persist → restore = same data). onDidChange fires on every mutation. getBySessionId lookup works. File ≤280 lines._
- [ ] **Phase 1: Session Types & Registry (Extension-Side):** [code] Wire SessionInterceptRegistry into extension activation in vscode-extension/src/extension.ts — Add module-level singleton 'let sessionInterceptRegistry: SessionInterceptRegistry | null = null' alongside existing singletons (toolProvider, dashboardProvider, etc. at lines ~10-20). In initializeChatIntegration() (line ~355), after McpBridge creation and before ToolProvider creation: instantiate registry with context.workspaceState, call restore(). Pass registry to ToolProvider constructor (modifies signature). Set registry on DashboardViewProvider via setter. Push registry disposal to context.subscriptions.
  - _From Gap 11 findings: extension.ts uses module-level 'let' singletons (not DI container). initializeChatIntegration(context, config, dataRoot, options?) is the function that creates ToolProvider at line ~366: 'toolProvider = new ToolProvider(mcpBridge)'.

Exact insertion order in initializeChatIntegration:
1. sessionInterceptRegistry = new SessionInterceptRegistry(context.workspaceState);
2. sessionInterceptRegistry.restore();
3. toolProvider = new ToolProvider(mcpBridge, sessionInterceptRegistry);  // modified signature
4. dashboardProvider.setSessionRegistry(sessionInterceptRegistry);  // new setter method

Also update ToolContext in vscode-extension/src/chat/tools/types.ts:
- Add: sessionRegistry?: SessionInterceptRegistry
- ToolProvider constructor sets this on the shared ctx object

Acceptance: Registry instantiated before ToolProvider. restore() called at activation. ToolProvider and DashboardViewProvider both have registry reference. Extension compiles. Non-chat activation paths unaffected._
- [ ] **Phase 2: Session Token Protocol (Spawn & ToolProvider):** [code] Modify spawn-agent-tool.ts to mint session_id and register session — In handleSpawnAgentTool (vscode-extension/src/chat/tools/spawn-agent-tool.ts, 376 lines), after resolving workspace_id and plan_id (line ~215), mint session_id: 'sess_' + Date.now().toString(36) + '_' + crypto.randomUUID().slice(0,8). Register session in ctx.sessionRegistry if available. Inject session_id into enriched_prompt: (a) add 'Session: ${sessionId}' line in the '--- CONTEXT ---' block after Plan line (line ~255), (b) add SESSION TRACKING meta-instruction block telling subagent to include '_session_id' in every tool call, (c) add session_id to returned prep_config output.
  - _From Gap 3 findings: enrichment order is CONTEXT block → scope_boundaries → anti_spawning → git_stability_guard → original_prompt. session_id injection goes in the CONTEXT block and as a new block before scope_boundaries.

Session registration call:
ctx.sessionRegistry?.register({
  sessionId,
  workspaceId: input.workspace_id,
  planId: input.plan_id,
  agentType: input.agent_name,
  parentSessionId: undefined, // TODO: detect hub session
  startedAt: new Date().toISOString()
});

SESSION TRACKING block to inject into prompt:
```
SESSION TRACKING (REQUIRED):
Include "_session_id": "${sessionId}" in every tool call input.
This enables the session management system to track your activity.
Do not omit this field from any tool call.
```

Update prep_config return to include session_id field.

Acceptance: Every spawn prep mints unique session_id. Session registered in registry. session_id in enriched_prompt CONTEXT block + meta-instruction. prep_config output includes session_id. Non-spawn tool calls unaffected._
- [ ] **Phase 2: Session Token Protocol (Spawn & ToolProvider):** [code] Update ToolProvider to accept SessionInterceptRegistry and add transparent session detection in invoke lambdas — In vscode-extension/src/chat/ToolProvider.ts (~130 lines), update constructor to accept optional SessionInterceptRegistry. Store as instance field. Update ctx object construction to include sessionRegistry. In registerTools() (line ~56), wrap each of the 6 invoke lambdas with session detection: read '_session_id' from options.input, strip it before forwarding to handler, store for post-handler interception routing. After handler returns result, if _session_id was present and session exists in registry, route through interceptToolResponse() (imported from tool-response-interceptor.ts, created in Phase 3). If no _session_id, return handler result unchanged.
  - _CRITICAL DESIGN DECISION: Do NOT add session_id/is_subagent to tool schemas in package.json (Gap 12 finding). Session detection is transparent via _session_id meta-field included by subagents per their enriched prompt instruction.

From Gap 1 findings: Each invoke lambda currently:
```typescript
invoke: (options, token) => handleAgentTool(options as never, token, this.ctx)
```

Refactored pattern (DRY — extract helper):
```typescript
private async wrapInvoke<T>(
  handler: (options: any, token: any, ctx: ToolContext) => Promise<vscode.LanguageModelToolResult>,
  options: vscode.LanguageModelToolInvocationOptions<T>,
  token: vscode.CancellationToken,
  toolName: string
): Promise<vscode.LanguageModelToolResult> {
  const input = options.input as Record<string, unknown>;
  const sessionId = typeof input._session_id === 'string' ? input._session_id : undefined;
  if (sessionId) delete input._session_id; // strip meta-field
  
  const result = await handler(options as never, token, this.ctx);
  
  if (sessionId && this.sessionRegistry) {
    return interceptToolResponse(this.sessionRegistry, sessionId, toolName, result);
  }
  return result;
}
```

Then each registration becomes:
```typescript
vscode.lm.registerTool('memory_agent', {
  invoke: (options, token) => this.wrapInvoke(handleAgentTool, options, token, 'memory_agent')
})
```

Note: interceptToolResponse import will fail until Phase 3 Step 6 creates the module. Executor should add a TODO comment or create a stub that passes through. Complete wiring in Step 8.

Acceptance: ToolProvider accepts optional registry. wrapInvoke helper extracts _session_id, strips it, runs handler, routes through interceptor if session tracked. Non-subagent calls (no _session_id) unchanged. File stays under 180 lines._
- [ ] **Phase 2: Session Token Protocol (Spawn & ToolProvider):** [code] Add session_id awareness to server-side memory_agent init — In server/src/tools/consolidated/memory_agent.ts (389 lines), in the init case handler (line ~104), after initialiseAgent() returns, if params.context?.session_id exists, include it in the emitted agent_session_started event data. No structural changes — the session_id is already stored in AgentSession.context (initialiseAgent stores arbitrary context). This step ensures the server-side audit trail includes session_id for subagent sessions.
  - _From Gap 8 findings: init delegates to handoffTools.initialiseAgent(). Session is created with store.generateSessionId() → AgentSession { session_id, agent_type, started_at, context }. The context object already stores arbitrary data from params.context.

The extension passes session_id in context when calling memory_agent init:
params.context = { ...originalContext, session_id: mintedSessionId }

Server change: In the init handler, after initialiseAgent() returns:
```typescript
if (result.data?.session?.context?.session_id) {
  // Include extension-minted session_id in event for audit trail
  await events.agentSessionStarted(
    workspace_id, plan_id, agent_type,
    result.data.session.session_id,
    { extension_session_id: result.data.session.context.session_id }
  );
}
```

Purely additive — no changes to init response shape or agent session creation. Server compiles without new dependencies.

Acceptance: session_id from extension context appears in agent_session_started event data. No breaking changes. Server builds clean._
- [ ] **Phase 3: Tool Response Interception (Stop & Inject):** [code] Create tool-response-interceptor.ts in vscode-extension/src/chat/orchestration/tool-response-interceptor.ts — Implement interceptToolResponse(registry, sessionId, toolName, originalResult) function: (1) Look up session via registry.getBySessionId(), (2) Record tool call via registry.recordToolCall(), (3) Check for stop directive (takes precedence over inject), (4) If stopping: generate directive text based on escalation level (L1 = directive + original response, L2 = directive text only, L3 = error response), increment escalation, (5) If no stop: check inject queue, dequeue all, prepend concatenated inject text to response, (6) Return modified LanguageModelToolResult. Also implement validateInjectText(text): enforce 500 char limit, strip tool-call-like JSON patterns, block system-prompt-like patterns.
  - _Stop directive text templates:

LEVEL 1: '⚠️ SESSION STOP REQUESTED\nThe user has requested that you stop your current work.\nPlease call memory_agent(action: handoff) to Coordinator with reason "User requested stop", then call memory_agent(action: complete).\nComplete your current tool call normally, then stop.\n\n--- ORIGINAL RESPONSE ---\n' + originalText

LEVEL 2: '🛑 SESSION STOP — IMMEDIATE\nYou MUST stop immediately. Do NOT continue with any more work.\nCall memory_agent(action: handoff) to Coordinator with reason "User forced stop", then memory_agent(action: complete).\nDo not process any more steps.'

LEVEL 3: Return error-like response: '❌ SESSION TERMINATED\nThis session has been terminated by the user. All further tool calls will return this error. Session ID: ${sessionId}'
Also mark session as 'stopped' in registry.

Inject prepend format:
'📝 USER GUIDANCE (injected by user):\n${injectTexts.join("\n")}\n\n--- TOOL RESPONSE ---\n' + originalText

validateInjectText rules:
- Max 500 chars (truncate with warning)
- Strip patterns matching JSON tool-call syntax: /{"action":|{"tool":/
- Strip patterns matching system prompt manipulation: /you are now|ignore previous|system:/i
- Return { valid: boolean, sanitized: string, warnings: string[] }

Response creation (from Gap 1 findings):
new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(modifiedText)])

Keep under 180 lines total.

Acceptance: interceptToolResponse handles all three paths (stop/inject/pass-through). Stop escalation works (L1→L2→L3 on consecutive calls). Inject prepends correctly. validateInjectText blocks dangerous patterns. File ≤180 lines._
- [ ] **Phase 3: Tool Response Interception (Stop & Inject):** [code] Complete ToolProvider interception wiring — If Step 4 used a stub/TODO for interceptToolResponse import, replace with real import from tool-response-interceptor.ts. Verify all 6 invoke lambdas (memory_workspace, memory_agent, memory_plan, memory_steps, memory_context, memory_spawn_agent) go through wrapInvoke. Add special handling for memory_spawn_agent: after spawn prep returns, if session was just registered, the _session_id in the spawn response should NOT trigger interception (spawn prep itself is from the hub, not the subagent). Verify lastToolCall tracking works end-to-end.
  - _This step connects Phase 2's ToolProvider skeleton with Phase 3's interceptor module.

Special case for memory_spawn_agent: The hub agent calling spawn_agent does NOT include _session_id (it's not a subagent). The _session_id is only included by the subagent in its subsequent tool calls. So no special handling is needed — the hub's spawn call won't have _session_id and will pass through normally.

Verify that the wrapInvoke pattern correctly:
1. Extracts _session_id from input
2. Strips it before handler sees it (mutation-safe: Object.assign or spread if needed)
3. Passes original result to interceptor
4. Returns interceptor result to LM

Acceptance: All 6 tools route through wrapInvoke. Import of interceptToolResponse resolves. Memory_spawn_agent calls from hub agents pass through unchanged. Extension compiles cleanly._
- [ ] **Phase 3: Tool Response Interception (Stop & Inject):** [code] Implement hub-agent stop propagation — When a child session is marked stopped/completed via stop directive (Level 3 or agent compliance), queue a notification for the parent session so the hub agent learns the subagent was interrupted on its next tool call. In SessionInterceptRegistry: when markCompleted() is called with a stopReason, look up parentSessionId; if parent session exists and is active, queue a special inject-like notification. In tool-response-interceptor.ts: handle 'notification' type payload (not a full stop, just informational text prepended to response).
  - _Propagation flow:
1. Child session receives Level 3 stop → interceptor calls registry.markCompleted(childKey, 'user_stopped')
2. markCompleted checks parentSessionId on the child entry
3. If parent session exists and status='active', queue a notification:
   registry.queueInject(parentWsId, parentPlanId, parentSessionId, 
     '⚠️ SUBAGENT INTERRUPTED: Agent "${childAgentType}" (session ${childSessionId}) was stopped by the user. Check plan state and decide whether to re-attempt or proceed differently.')
4. Hub agent's next tool call picks up this inject text via normal inject delivery path

For parentSessionId tracking: The spawn-agent-tool needs to know the hub's session. Options:
- Hub agent includes its own session_id when calling memory_spawn_agent
- The spawn tool checks if the current call has _session_id (hub's session)

Minimal approach for v1: parentSessionId is tracked if available, propagation is best-effort. If parentSessionId is null, skip propagation.

Acceptance: When a child stops, parent receives notification inject on next tool call. If no parentSessionId, gracefully skips. No errors on missing parent session._
- [ ] **Phase 4: Extension Panel UI (Sessions Section):** [code] Create sessions-section.ts in vscode-extension/src/providers/dashboard-webview/sessions-section.ts — Export getSessionsSectionHtml(iconSvgs): string and getSessionsClientHelpers(): string. HTML: collapsible section (id='widget-sessions') with session list container, stop button, inject text input + inject button. Follow exact pattern from instructions-section.ts and skills-section.ts.
  - _From Gap 6 findings — exact pattern to follow:

HTML structure:
```html
<section class="collapsible collapsed" id="widget-sessions">
  <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-sessions">
    <span class="chevron">></span>
    <h3>Active Sessions</h3>
  </button>
  <div class="collapsible-content">
    <div class="widget-body">
      <div class="sessions-header">
        <button class="btn btn-small" data-action="refresh-sessions" title="Refresh session list">
          ${iconSvgs.syncHistory} Refresh
        </button>
      </div>
      <div class="sessions-list" id="sessionsList">
        <div class="empty-state">No active sessions</div>
      </div>
      <div class="sessions-controls" id="sessionsControls" style="display:none">
        <button class="btn btn-small" data-action="stop-session" id="stopSessionBtn" disabled>Stop</button>
        <div class="inject-row">
          <input type="text" id="injectText" placeholder="Inject guidance..." maxlength="500" />
          <button class="btn btn-small" data-action="inject-session" id="injectSessionBtn" disabled>Inject</button>
        </div>
      </div>
    </div>
  </div>
</section>
```

Client helpers (getSessionsClientHelpers()):
- renderSessionsList(sessions): HTML for session items (agentType, planId, elapsed time, lastToolCall, status badge)
- updateSessionsList(sessions): Update DOM innerHTML of #sessionsList
- requestSessionsList(): vscode.postMessage({ type: 'getSessions' })
- handleSessionSelect(sessionKey): Single-select highlighting, enable/disable controls
- handleStopSession(): Post { type: 'stopSession', data: { sessionKey } }
- handleInjectSession(): Post { type: 'injectSession', data: { sessionKey, text } }

CSS classes: Use existing conventions — badge-ok for active, badge badge-warn for stopping, empty-state for no sessions. data-action for event delegation.

Keep under 200 lines.

Acceptance: Exports two functions matching section pattern. HTML renders correctly. Client helpers handle select/stop/inject. File ≤200 lines._
- [ ] **Phase 4: Extension Panel UI (Sessions Section):** [code] Wire sessions section into dashboard assembly chain — Import getSessionsSectionHtml in vscode-extension/src/providers/dashboard-webview/sections.ts and embed after skills/instructions sections in getConnectedDashboardHtml(). Import getSessionsClientHelpers in vscode-extension/src/providers/dashboard-webview/client-script.ts and embed in getClientScript(). Add message handling cases in vscode-extension/src/providers/DashboardViewProvider.ts resolveWebviewView switch block for 'getSessions', 'stopSession', 'injectSession'.
  - _From Gap 5 findings — assembly chain:
1. DashboardViewProvider._getHtmlForWebview() → getWebviewHtml(options) [dashboard-webview/index.ts]
2. getWebviewHtml → getClientScript(params) [client-script.ts]
3. getClientScript → getConnectedDashboardHtml(iconSvgs, apiPort, workspaceName) [sections.ts]
4. getConnectedDashboardHtml embeds getSessionsSectionHtml(iconSvgs)
5. getClientScript embeds getSessionsClientHelpers()

In sections.ts: Add import and call getSessionsSectionHtml(iconSvgs) after existing sections.
In client-script.ts: Add import and embed getSessionsClientHelpers() in the client JS.
In DashboardViewProvider.resolveWebviewView (line ~154), add cases:
- case 'getSessions': handleGetSessions(this, this.sessionRegistry); break;
- case 'stopSession': handleStopSession(this, this.sessionRegistry, message.data); break;
- case 'injectSession': handleInjectSession(this, this.sessionRegistry, message.data); break;

Also add to DashboardViewProvider:
- private sessionRegistry?: SessionInterceptRegistry
- setSessionRegistry(registry: SessionInterceptRegistry): void { this.sessionRegistry = registry; }
- In resolveWebviewView, subscribe to registry.onDidChange → post updated session list

Acceptance: Sessions section visible in dashboard. Message handlers connected. Selecting a session, clicking stop, and injecting text all send correct messages. Compiles cleanly._
- [ ] **Phase 4: Extension Panel UI (Sessions Section):** [code] Add session message handlers in vscode-extension/src/providers/dashboard-webview/dashboard-message-handlers.ts — Add handleGetSessions(poster, registry), handleStopSession(poster, registry, data), handleInjectSession(poster, registry, data). Follow existing handler pattern (handleGetSkills, handleDeploySkill) but with SessionInterceptRegistry parameter.
  - _From Gap 7 findings: MessagePoster interface { postMessage(msg) }. Handlers receive poster + optional typed data.

New handlers:
```typescript
export function handleGetSessions(
  poster: MessagePoster,
  registry: SessionInterceptRegistry | undefined
): void {
  if (!registry) {
    poster.postMessage({ type: 'sessionsList', data: { sessions: [] } });
    return;
  }
  const sessions = registry.listActive();
  poster.postMessage({ type: 'sessionsList', data: { sessions } });
}

export function handleStopSession(
  poster: MessagePoster,
  registry: SessionInterceptRegistry | undefined,
  data: { sessionKey: string }
): void {
  if (!registry) return;
  // Parse tripleKey: 'workspaceId::planId::sessionId'
  const [workspaceId, planId, sessionId] = data.sessionKey.split('::');
  const queued = registry.queueInterrupt(workspaceId, planId, sessionId);
  poster.postMessage({ type: 'sessionStopResult', data: { success: queued, sessionKey: data.sessionKey } });
}

export function handleInjectSession(
  poster: MessagePoster,
  registry: SessionInterceptRegistry | undefined,
  data: { sessionKey: string; text: string }
): void {
  if (!registry) return;
  const [workspaceId, planId, sessionId] = data.sessionKey.split('::');
  const queued = registry.queueInject(workspaceId, planId, sessionId, data.text);
  poster.postMessage({ type: 'sessionInjectResult', data: { success: queued, sessionKey: data.sessionKey } });
}
```

Acceptance: Three handlers implemented. Each posts result back to webview. Graceful fallback if registry undefined. Handler file stays under 300 lines total._
- [ ] **Phase 4: Extension Panel UI (Sessions Section):** [code] Implement real-time session list refresh — In DashboardViewProvider, subscribe to sessionInterceptRegistry.onDidChange in resolveWebviewView. On change, post updated session list to webview via poster.postMessage({ type: 'sessionsList', data: { sessions } }). Also add client-side requestSessionsList() call on panel mount (initial load) and data-action='refresh-sessions' click handler.
  - _Two refresh mechanisms:
1. Event-driven: DashboardViewProvider subscribes to registry.onDidChange → pushes updated list. This fires on every registry mutation (register, stop, inject, tool call record).
2. Manual: User clicks Refresh button → data-action='refresh-sessions' → requestSessionsList() → getSessions message → handler → response.

In DashboardViewProvider.resolveWebviewView():
```typescript
if (this.sessionRegistry) {
  const changeDisposable = this.sessionRegistry.onDidChange(() => {
    handleGetSessions(this, this.sessionRegistry);
  });
  // Push to webview disposables for cleanup
}
```

Follow same polling pattern as existing skills/instructions sections for initial load.

Acceptance: Session list updates in real-time when registry changes. Manual refresh button works. No memory leaks (disposable cleaned up on webview dispose)._
- [ ] **Phase 5: Server-Side Audit & Recovery:** [code] Add 3 new session lifecycle event types to server/src/events/event-emitter.ts — Add 'session_interrupted', 'session_injected', 'session_stop_escalated' to EventType union. Add convenience emitter functions: events.sessionInterrupted(workspaceId, planId, sessionId, escalationLevel), events.sessionInjected(workspaceId, planId, sessionId, injectTextPreview), events.sessionStopEscalated(workspaceId, planId, sessionId, fromLevel, toLevel).
  - _From Gap 9 findings: 11 event types exist. EventType is a string union type. Events stored as individual JSON files in data/events/ + appended to events.log.

Existing convenience emitters pattern:
```typescript
events.agentSessionStarted(workspaceId, planId, agentType, sessionId)
events.agentSessionCompleted(workspaceId, planId, agentType, summary, artifacts)
```

New convenience emitters:
```typescript
export async function sessionInterrupted(
  workspaceId: string, planId: string, sessionId: string, 
  escalationLevel: number, reason?: string
): Promise<void> {
  await emitEvent({ type: 'session_interrupted', workspace_id: workspaceId,
    plan_id: planId, data: { session_id: sessionId, escalation_level: escalationLevel, reason } });
}

export async function sessionInjected(
  workspaceId: string, planId: string, sessionId: string,
  textPreview: string
): Promise<void> {
  await emitEvent({ type: 'session_injected', workspace_id: workspaceId,
    plan_id: planId, data: { session_id: sessionId, text_preview: textPreview.slice(0, 100) } });
}
```

Extension calls these via McpBridge when interceptor applies stop/inject. Could also emit directly from tool-response-interceptor if McpBridge is available in context.

Acceptance: 3 new event types compile. Convenience emitters follow existing pattern. Server builds clean._
- [ ] **Phase 5: Server-Side Audit & Recovery:** [code] Implement orphaned session detection — On hub agent memory_agent(init), the extension-side agent-tool handler checks SessionInterceptRegistry for sessions matching workspace_id + plan_id that are still 'active' but have no recent tool calls (stale). Return structured orphaned_sessions warnings in the tool response alongside the normal init result. Also add cleanup: when hub re-inits, offer to mark orphaned sessions as completed.
  - _Detection happens in the extension, not server. In vscode-extension/src/chat/tools/agent-tool.ts handleAgentTool():

When action='init' and the server response succeeds:
1. Check ctx.sessionRegistry for sessions matching workspace_id + plan_id
2. Filter to status='active' entries with lastToolCall older than 10 minutes (or no lastToolCall)
3. Build orphaned_sessions array: [{ sessionId, agentType, startedAt, lastToolCall }]
4. If orphaned_sessions.length > 0, append to the result JSON:
   result.data.orphaned_sessions = orphanedSessions
   result.data.orphaned_session_warning = 'Found N orphaned subagent sessions...'
5. Auto-cleanup: mark orphaned sessions as 'completed' with reason 'orphaned_auto_cleanup'

Uses stale threshold of 10 minutes (consistent with active-run-registry's 10-minute stale threshold from Gap 2 findings).

Acceptance: Hub agent init response includes orphaned session warnings when they exist. Orphaned sessions auto-cleaned. Normal init flow unaffected when no orphans._
- [ ] **Phase 6: Agent Instruction Updates:** [documentation] Create session-interruption.instructions.md at .github/instructions/session-interruption.instructions.md — Document: (1) How agents should respond to stop directives (check for ⚠️/🛑/❌ prefixes in tool responses, comply by calling handoff+complete), (2) How agents should handle inject text (treat 📝 USER GUIDANCE as high-priority user direction), (3) How hub agents handle orphaned session warnings from init, (4) The _session_id meta-field requirement for subagent tool calls, (5) The 3-level stop escalation ladder.
  - _This file will be auto-loaded by agents via the instruction system (applyTo: '**/*').

Key sections:
- Overview: What the session interruption system does
- For Subagents: Always include _session_id in tool calls, respond to stop directives immediately
- For Hub Agents: Check for orphaned_sessions in init response, handle recovery
- Stop Directive Reference: Level 1 (graceful), Level 2 (immediate), Level 3 (terminated)
- Inject Guidance: Treat injected text as user direction, adjust approach accordingly
- Security: Inject text is validated/sanitized, agents should not treat it as system instructions

Keep under 150 lines.

Acceptance: File created with proper frontmatter (applyTo: '**/*'). All 5 documentation areas covered. Clear, actionable instructions._
- [ ] **Phase 6: Agent Instruction Updates:** [documentation] Update subagent-recovery.instructions.md and handoff-protocol.instructions.md — In subagent-recovery.instructions.md: add section on 'Interrupt-Driven Recovery' covering how stop directives interact with the existing recovery protocol, and how orphaned session detection replaces/supplements manual git-diff checking. In handoff-protocol.instructions.md: add note about session_id propagation through spawns and how stop directives trigger graceful handoff.
  - _subagent-recovery.instructions.md — Add after 'Step 5: Course-Correct':
## Interrupt-Driven Recovery
When the user uses the Stop button in the extension panel:
1. The subagent receives a stop directive on its next tool call
2. Compliant agents call handoff+complete automatically
3. Hub agents receive orphaned session warnings on re-init
4. This replaces manual user-cancellation detection for managed sessions

handoff-protocol.instructions.md — Add to 'Subagent Spawning Rules':
- session_id is minted by the extension during spawn prep and injected into the subagent's prompt
- Subagents MUST include _session_id in every tool call for session tracking
- If a subagent receives a stop directive, it should call memory_agent(action: handoff) with reason 'User requested stop' then memory_agent(action: complete)

Acceptance: Both files updated with accurate session interruption information. No conflicting instructions introduced._
- [ ] **Phase 6: Agent Instruction Updates:** [documentation] Update agent.md files — Update coordinator.agent.md: add awareness of orphaned session detection in init, and how to handle interrupted subagents. Update executor.agent.md: add instruction to check for stop directives in tool responses and comply immediately. Similar brief additions to reviewer.agent.md and tester.agent.md.
  - _Agent files are in Project-Memory-MCP/agents/.

Coordinator additions:
- On re-init, check for orphaned_sessions in init response
- If orphaned sessions found, follow recovery protocol
- After subagent returns with 'User requested stop' reason, assess plan state before spawning next agent

Executor/Reviewer/Tester additions:
- 'If you receive a stop directive (⚠️ SESSION STOP or 🛑 SESSION STOP — IMMEDIATE) in any tool response, immediately call memory_agent(action: handoff) with reason "User requested stop" and then memory_agent(action: complete). Do not continue work.'
- 'If you receive injected user guidance (📝 USER GUIDANCE), treat it as a high-priority direction and adjust your approach accordingly.'

Keep additions brief — 5-10 lines per file.

Acceptance: All 4 agent files updated. Instructions are consistent with the stop/inject protocol. No contradictions with existing agent instructions._
- [ ] **Phase 7: Testing & Integration:** [test] Write unit tests for SessionInterceptRegistry — Test file: vscode-extension/src/chat/orchestration/__tests__/session-intercept-registry.test.ts. Test cases: register/get/list lifecycle, triple-ID isolation (two sessions on same plan don't collide), persistence round-trip (register → persist → restore = same data), interrupt queue (queue/dequeue/escalation), inject queue (queue/dequeue-all), markStopping/markCompleted status transitions, onDidChange fires on every mutation, pruneCompleted removes old entries, getBySessionId lookup.
  - _Mock vscode.Memento for persistence testing:
```typescript
class MockMemento implements vscode.Memento {
  private store = new Map<string, any>();
  get<T>(key: string): T | undefined { return this.store.get(key); }
  async update(key: string, value: any): Promise<void> { this.store.set(key, value); }
  keys(): readonly string[] { return [...this.store.keys()]; }
}
```

Key test scenarios:
1. Register session → get returns it → listActive includes it
2. Two sessions with same workspace+plan but different sessionId → both accessible
3. Register → serialize → new registry → restore → get returns same data
4. queueInterrupt → dequeueInterrupt returns directive → second dequeue returns undefined
5. incrementEscalation returns 1, then 2, then 3, then stays at 3
6. queueInject × 3 → dequeueAllInjects returns all 3 in FIFO order
7. markCompleted → listActive excludes it
8. pruneCompleted with maxAge removes only old completed sessions

Acceptance: All test cases pass. Tests run via npx vitest run. No flaky tests._
- [ ] **Phase 7: Testing & Integration:** [test] Write unit tests for tool-response-interceptor — Test file: vscode-extension/src/chat/orchestration/__tests__/tool-response-interceptor.test.ts. Test cases: pass-through for unknown session, stop directive at each level (L1 includes original, L2 directive only, L3 error response), inject prepend (single and multiple), stop+inject precedence (stop wins), escalation increment on consecutive calls, validateInjectText (valid text, too long, dangerous patterns blocked).
  - _Mock LanguageModelToolResult for testing:
```typescript
function mockResult(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(text)
  ]);
}
```

Key test scenarios:
1. interceptToolResponse with unknown sessionId → returns original result unchanged
2. Session active, no stop/inject → returns original (but records tool call)
3. Session stopping, L1 → result text starts with '⚠️ SESSION STOP' and includes original
4. Same session, next call → L2 text, no original response
5. Same session, next call → L3 error text, session marked stopped
6. Session with inject queued → result text starts with '📝 USER GUIDANCE' and includes original
7. Session with stop AND inject → stop directive returned (inject ignored)
8. validateInjectText('hello') → valid
9. validateInjectText('a'.repeat(600)) → truncated to 500
10. validateInjectText('{"action": "delete"}') → sanitized

Acceptance: All test cases pass. Stop escalation verified across 3 calls. Inject validation covers edge cases._
- [ ] **Phase 7: Testing & Integration:** [test] Write integration test for full stop flow — Test file: vscode-extension/src/chat/orchestration/__tests__/session-stop-integration.test.ts. Scenario: Create registry → register session → queue interrupt → call interceptToolResponse (simulating tool call from subagent) → verify L1 directive in response → call again → verify L2 → call again → verify L3 + session marked stopped. Also test: hub propagation (child stop → parent gets notification inject).
  - _Integration test uses real SessionInterceptRegistry (with MockMemento) and real interceptToolResponse. No mocking of the interception logic.

Flow:
1. const registry = new SessionInterceptRegistry(new MockMemento());
2. registry.register({ sessionId: 'sess_child', workspaceId: 'ws1', planId: 'plan1', agentType: 'Executor', parentSessionId: 'sess_hub', startedAt: ... });
3. registry.register({ sessionId: 'sess_hub', workspaceId: 'ws1', planId: 'plan1', agentType: 'Coordinator', startedAt: ... });
4. registry.queueInterrupt('ws1', 'plan1', 'sess_child');
5. result1 = interceptToolResponse(registry, 'sess_child', 'memory_plan', mockResult('{...}'));
6. Verify result1 contains L1 stop directive + original text
7. result2 = interceptToolResponse(registry, 'sess_child', 'memory_steps', mockResult('{...}'));
8. Verify result2 contains L2 stop directive, no original text
9. result3 = interceptToolResponse(registry, 'sess_child', 'memory_agent', mockResult('{...}'));
10. Verify result3 contains L3 error, session status='stopped'
11. Verify parent 'sess_hub' has notification in inject queue

Acceptance: Full escalation ladder works end-to-end. Hub propagation delivers notification. Persistence survives through the flow._
- [ ] **Phase 7: Testing & Integration:** [test] Write integration test for full inject flow — Test file: vscode-extension/src/chat/orchestration/__tests__/session-inject-integration.test.ts. Scenario: Create registry → register session → queue 3 inject payloads → call interceptToolResponse → verify all 3 texts prepended in FIFO order → call again → verify no inject (queue drained). Also test: inject after validation (long text truncated, dangerous text sanitized).
  - _Flow:
1. Register session, queue 3 injects with different text
2. First interceptToolResponse → response contains all 3 inject texts concatenated + original
3. Second interceptToolResponse → response is just original (queue empty)
4. Queue inject with 600-char text → verify truncated to 500 in delivery
5. Queue inject with '{"action": "delete"}' → verify sanitized

Acceptance: Multi-inject delivery works. Queue drains correctly. Validation applies before delivery._
- [ ] **Phase 7: Testing & Integration:** [build] Build verification — Compile extension (npm run compile in vscode-extension/), compile server (npm run build in server/), run all extension tests (npx vitest run in vscode-extension/ if configured), run all server tests (npx vitest run in server/). Verify no regressions in existing functionality.
  - _Build commands from workspace build scripts:
- Extension: cd vscode-extension && npm run compile
- Server: cd server && npm run build
- Server tests: cd server && npx vitest run
- Extension tests: cd vscode-extension && npx vitest run (or npm test if configured)

Key regression checks:
- All 6 existing tools still register and invoke correctly
- Dashboard loads without errors
- Extension activates without errors
- Server starts and responds to tool calls
- Non-subagent tool calls are completely unchanged (no _session_id = pass-through)

Acceptance: All builds succeed. All existing tests pass. No TypeScript compilation errors._
- [ ] **Phase 7: Testing & Integration:** [validation] Code review — Review all new and modified files for: consistent patterns with existing code, no monolithic files >300 lines, proper TypeScript types (no 'any' leaks), security boundaries (inject sanitization covers prompt injection), backward compatibility (_session_id gating ensures non-subagent calls pass through), dashboard section follows exact conventions (CSS classes, data-action attributes, collapsible pattern), persistence correctness (workspaceState serialization), disposable cleanup (no memory leaks).
  - _New files to review (7):
1. session-types.ts (<80 lines)
2. session-intercept-registry.ts (≤280 lines)
3. tool-response-interceptor.ts (≤180 lines)
4. sessions-section.ts (≤200 lines)
5. session-interruption.instructions.md
6. session-intercept-registry.test.ts
7. tool-response-interceptor.test.ts

Modified files to review (~13):
- spawn-agent-tool.ts, ToolProvider.ts, types.ts, extension.ts
- DashboardViewProvider.ts, sections.ts, client-script.ts, dashboard-message-handlers.ts
- event-emitter.ts (server), memory_agent.ts (server)
- subagent-recovery.instructions.md, handoff-protocol.instructions.md
- agent.md files (coordinator, executor, reviewer, tester)

Key review areas:
1. SessionInterceptRegistry persistence: Does persist() cover all mutations? Does restore() handle corrupt data?
2. ToolProvider wrapInvoke: Is _session_id stripping safe (doesn't mutate shared objects)?
3. Inject sanitization: Does it catch common prompt injection patterns?
4. Dashboard section: Follows exact CSS/HTML conventions from existing sections?
5. No file exceeds 300 lines?

Acceptance: All review items addressed. No blocking issues. Approved for archival._

## Agent Lineage

- **2026-02-16T19:41:41.655Z**: Architect → Coordinator — _First-pass plan complete with 35 steps across 9 phases. 10 research gaps identified for Researcher to investigate before second-pass refinement. Key files: ToolProvider.ts dispatch pattern, active-run-registry API, spawn-agent-tool enrichment flow, DashboardViewProvider section pattern, server memory_agent handler._
- **2026-02-16T19:51:17.558Z**: Researcher → Coordinator — _All 12 research gaps resolved with exact interfaces, function signatures, patterns, and design recommendations. Research stored in codebase-investigation.md and research.json. Recommend Architect for second-pass plan refinement using these findings._
- **2026-02-16T20:04:03.844Z**: Architect → Coordinator — _Second-pass plan refinement complete. 26 concrete steps across 7 phases with full implementation detail from Researcher findings. Key architectural change: transparent session detection via _session_id meta-field eliminates tool schema changes (removed 7 file modifications). Ready for Executor implementation._
- **2026-02-16T20:04:56.716Z**: Coordinator → Coordinator — _Planning complete (Architect→Researcher→Architect loop finished). Plan refined to 24 steps across 7 phases. Ready for Executor implementation._