---
plan_id: plan_mlpksy83_d5222084
created_at: 2026-02-16T19:50:22.928Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Codebase Investigation — Subagent Session Interruption & Injection System

## Gap 1: ToolProvider Dispatch Pattern

**File:** `vscode-extension/src/chat/ToolProvider.ts` (130 lines total)

### Registration
Tools are registered in `registerTools()` (line 56) using `vscode.lm.registerTool(name, { invoke })`.  
Six tools are registered: `memory_workspace`, `memory_agent`, `memory_plan`, `memory_steps`, `memory_context`, `memory_spawn_agent`.

Each registration:
```typescript
this.disposables.push(
    vscode.lm.registerTool('memory_agent', {
        invoke: (options, token) => handleAgentTool(options as never, token, this.ctx)
    })
);
```

### Invocation Flow
1. VS Code LM calls `invoke(options, token)` on the registered tool
2. The `invoke` callback delegates to the appropriate handler from `./tools/` (e.g., `handleAgentTool`)
3. Each handler receives `(options, token, ctx)` where:
   - `options: vscode.LanguageModelToolInvocationOptions<T>` — contains `options.input` (parsed params)
   - `token: vscode.CancellationToken`
   - `ctx: ToolContext` — shared context with `mcpBridge`, `ensureWorkspace()`, `setWorkspaceId()`
4. Handler calls `ctx.mcpBridge.callTool(toolName, params)` to reach the MCP server
5. Handler wraps the MCP response into `vscode.LanguageModelToolResult`

### Response Creation
Handlers create responses via:
```typescript
return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
]);
```

### ToolContext Interface (from types.ts)
```typescript
export interface ToolContext {
    mcpBridge: McpBridge;
    ensureWorkspace: () => Promise<string>;
    setWorkspaceId: (id: string) => void;
}
```
Built in constructor (line 42-46):
```typescript
this.ctx = {
    mcpBridge: this.mcpBridge,
    ensureWorkspace: () => this.ensureWorkspace(),
    setWorkspaceId: (id: string) => { this.workspaceId = id; }
};
```

### Interception Point
**The `invoke` callback is the natural interception point.** Currently, the flow is:
```
LM → invoke → handler → mcpBridge → server → response → LanguageModelToolResult → back to LM
```
To intercept, we can wrap the handler result BEFORE returning it:
```
LM → invoke → handler → mcpBridge → server → response → [INTERCEPT HERE] → LanguageModelToolResult → back to LM
```

**Key finding:** There's a single `ctx` object shared across all tool registrations. A `SessionInterceptRegistry` reference can be added to `ToolContext` to make it available to all handlers. Alternatively, interception can happen in the `invoke` lambda itself in `registerTools()`.

### Disposable Pattern
All registrations push disposables to `this.disposables: vscode.Disposable[]`. `dispose()` iterates and disposes all (line ~128).

---

## Gap 2: Active Run Registry API

**File:** `vscode-extension/src/chat/orchestration/active-run-registry.ts` (213 lines)

### Data Structures
```typescript
export interface ActiveRunRecord {
    run_id: string;
    workspace_id: string;
    plan_id: string;
    agent_name: string;
    request_fingerprint: string;
    status: 'active' | 'cancelled' | 'released';
    acquired_at: string;
    last_seen_at: string;
    release_reason_code?: SpawnReasonCode;
}

interface QueuedRunRecord {
    queued_at: string;
    agent_name: string;
    request_fingerprint: string;
}

interface LaneState {
    active?: ActiveRunRecord;
    queued?: QueuedRunRecord;
}
```

### Map Structure
```typescript
const lanes = new Map<string, LaneState>();
```
Key: `${workspace_id}::${plan_id}` (via `laneKey()` function)

### API Surface (all exported functions)
| Function | Signature | Description |
|----------|-----------|-------------|
| `acquire` | `(params: AcquireLaneParams) => AcquireLaneResult` | Acquire a lane; handles stale eviction, duplicate debounce, queue policy |
| `peek` | `(workspace_id, plan_id) => LaneState \| undefined` | Read-only lookup of lane state |
| `release` | `(workspace_id, plan_id, run_id?, release_reason_code?) => { released, reason_code }` | Release an active run from the lane |
| `markCancelled` | `(workspace_id, plan_id, run_id?, reason_code?) => { cancelled, reason_code }` | Mark a run as cancelled without removing from map |
| `isStale` | `(workspace_id, plan_id, stale_ms?) => boolean` | Check if a lane's active run is stale |

### Persistence
**No persistence.** The `lanes` Map is module-level (in-memory only). If the extension reloads, all lane state is lost. This is a gap the SessionInterceptRegistry must address.

### SpawnLanePolicy
```typescript
export type SpawnLanePolicy = 'reject' | 'queue1';
```
- `reject`: Reject new runs when lane is active
- `queue1`: Queue at most 1 waiting run

### Stale Detection
Default stale threshold: `10 * 60 * 1000` (10 minutes). Uses `last_seen_at` to compute age.

### Pattern for SessionInterceptRegistry
The registry should follow this **same module-level singleton pattern** with:
- A `Map<string, SessionState>` keyed similarly (triple-ID key: `${workspace_id}::${plan_id}::${session_id}`)
- Exported functions (not class methods) for acquire/release/query
- Added **workspace storage persistence** (unlike active-run-registry which is memory-only)

---

## Gap 3: Spawn Agent Tool Enrichment Flow

**File:** `vscode-extension/src/chat/tools/spawn-agent-tool.ts` (376 lines)

### Handler Signature
```typescript
export async function handleSpawnAgentTool(
    options: vscode.LanguageModelToolInvocationOptions<SpawnAgentInput>,
    token: vscode.CancellationToken,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult>
```

### Input Shape (SpawnAgentInput)
```typescript
export interface SpawnAgentInput {
    agent_name: string;
    prompt: string;
    workspace_id?: string;
    plan_id?: string;
    compat_mode?: 'legacy' | 'strict';
    prep_config?: { scope_boundaries?: { ... } };
    spawn_config?: { scope_boundaries?: { ... } };  // deprecated
    scope_boundaries?: { ... };  // deprecated
    execution?: unknown;  // deprecated
    orchestration?: unknown;  // deprecated
    lane_policy?: unknown;  // deprecated
    run_id?: unknown;  // deprecated
}
```

### prep_config Build Process
1. Resolve compat mode (line 177)
2. Resolve scope boundaries from `prep_config.scope_boundaries`, `spawn_config.scope_boundaries`, or top-level `scope_boundaries` (with deprecation warnings)
3. If `workspace_id` provided, fetch workspace info via `ctx.mcpBridge.callTool('memory_workspace', ...)` (line 215)
4. If `workspace_id` + `plan_id` provided, fetch plan info via `ctx.mcpBridge.callTool('memory_plan', ...)` (line 234)
5. Build `enriched_prompt` by concatenating (in order):
   - `--- CONTEXT ---` block with workspace/plan metadata
   - Scope boundaries block (if provided)
   - Anti-spawning template (for non-hub agents)
   - Git stability guard template
   - Original user prompt
6. Return `AgentPrepResult` object

### Where to Inject session_id
**Best injection points:**
1. **In the `--- CONTEXT ---` block** (line ~255): Add `Session: ${session_id}` after the Plan line
2. **In the output `prep_config` object**: Add `session_id` field to `AgentPrepResult`
3. **Before calling `handleSpawnAgentTool`**: Mint session_id in `ToolProvider.registerTools()` invoke lambda and add it to `options.input`

**Recommended approach:** Mint `session_id` in the spawn tool handler itself (it already has `workspace_id` and `plan_id`), inject it into both the enriched prompt AND the returned `prep_config` metadata. The extension's `SessionInterceptRegistry` is registered as a new session at this point.

### Interaction with active-run-registry
**Currently: NONE.** The spawn tool handler does NOT import or reference `active-run-registry.ts`. Lane acquisition happens on the server side during `initialiseAgent()`. The spawn-agent-tool is purely prep; it does not track runs.

---

## Gap 4: Tool Handler Structure

**File:** `vscode-extension/src/chat/tools/agent-tool.ts` (143 lines, representative)

### Handler Signature
```typescript
export async function handleAgentTool(
    options: vscode.LanguageModelToolInvocationOptions<AgentToolInput>,
    _token: vscode.CancellationToken,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult>
```

### Input Shape
```typescript
export interface AgentToolInput {
    action: 'init' | 'complete' | 'handoff' | 'validate' | 'list' | 'get_instructions';
    planId?: string;
    agentType?: string;
    fromAgent?: string;
    toAgent?: string;
    reason?: string;
    summary?: string;
    artifacts?: Record<string, unknown>;
    taskDescription?: string;
}
```

### Pattern
1. Check `ctx.mcpBridge.isConnected()`
2. `const workspaceId = await ctx.ensureWorkspace()`
3. Destructure `options.input`
4. Switch on `action`, build params, call `ctx.mcpBridge.callTool('memory_agent', params)`
5. Return `new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))])`

### Where to Add is_subagent/session_id
Each tool handler interface would need optional `session_id?: string` and `is_subagent?: boolean` fields added:
```typescript
export interface AgentToolInput {
    // ... existing fields ...
    session_id?: string;
    is_subagent?: boolean;
}
```
However, these params DON'T need to be passed to the server — they're consumed by the **extension-side interception layer** (ToolProvider or a wrapper). The tool handlers themselves remain unaware of interception.

**Better approach:** The interception should happen **in ToolProvider's `invoke` callback**, not in individual handlers. The handlers stay clean; ToolProvider reads `is_subagent` and `session_id` from the input, runs the handler normally, then wraps/modifies the result before returning it.

---

## Gap 5: DashboardViewProvider Section Pattern

**File:** `vscode-extension/src/providers/DashboardViewProvider.ts` (423 lines)

### Section Composition
Sections are NOT composed in DashboardViewProvider directly. Instead:
1. `DashboardViewProvider._getHtmlForWebview(webview)` (line 407) calls `getWebviewHtml(options)` from `./dashboard-webview/index.ts`
2. `getWebviewHtml` calls `getClientScript(params)` from `./dashboard-webview/client-script.ts`
3. `getClientScript` calls `getConnectedDashboardHtml(iconSvgs, apiPort, workspaceName)` from `./dashboard-webview/sections.ts`
4. `getConnectedDashboardHtml` embeds individual section functions: `getSkillsSectionHtml(iconSvgs)` and `getInstructionsSectionHtml(iconSvgs)`

### Assembly Chain
```
DashboardViewProvider._getHtmlForWebview()
  → getWebviewHtml(options)                     [dashboard-webview/index.ts]
    → getClientScript(params)                    [client-script.ts]
      → getConnectedDashboardHtml(...)           [sections.ts]  — builds main dashboard HTML
        → getSkillsSectionHtml(iconSvgs)         [skills-section.ts]
        → getInstructionsSectionHtml(iconSvgs)   [instructions-section.ts]
      → getSkillsClientHelpers()                 [skills-section.ts]  — JS for skills
      → getInstructionsClientHelpers()           [instructions-section.ts] — JS for instructions
    → buildHtmlDocument(params)                  [template.ts]
```

### postMessage / onDidReceiveMessage Pattern
**Extension → Webview:**
```typescript
public postMessage(message: Message) {
    if (this._view) {
        this._view.webview.postMessage(message);
    }
}
```

**Webview → Extension:**
In `resolveWebviewView` (line 154), messages are handled via `switch(message.type)`:
- `'getSkills'` → `handleGetSkills(this)`
- `'deploySkill'` → `handleDeploySkill(this, message.data)`
- `'getInstructions'` → `handleGetInstructions(this)`
- etc.

### Where to Add Sessions Section
1. Create `sessions-section.ts` with `getSessionsSectionHtml(iconSvgs)` and `getSessionsClientHelpers()`
2. Import in `sections.ts` and embed after skills/instructions sections
3. Import `getSessionsClientHelpers` in `client-script.ts`
4. Add message handling cases in `DashboardViewProvider.resolveWebviewView` switch block
5. Add handler functions in `dashboard-message-handlers.ts`

### Refresh Mechanism
- Polling-based: client JS polls the API every few seconds to update plans/activity
- Sections are updated by posting `skillsList`/`instructionsList` messages from extension to webview
- Webview has `requestSkillsList()` and `requestInstructionsList()` functions called on demand

---

## Gap 6: Dashboard Webview Section Pattern

**Files:** `instructions-section.ts` and `skills-section.ts`

### HTML Generation Pattern
Each section exports two functions:
1. **`get{Section}SectionHtml(iconSvgs: IconSvgs): string`** — Returns raw HTML for the collapsible section
2. **`get{Section}ClientHelpers(): string`** — Returns client-side JavaScript (browser-side)

### Collapsible Section Structure
```html
<section class="collapsible collapsed" id="widget-{name}">
    <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-{name}">
        <span class="chevron">></span>
        <h3>{Title}</h3>
    </button>
    <div class="collapsible-content">
        <div class="widget-body">
            <!-- Header with refresh/action buttons -->
            <div class="{name}-header">
                <button class="btn btn-small" data-action="refresh-{name}" title="...">
                    ${iconSvgs.syncHistory} Refresh
                </button>
            </div>
            <!-- Dynamic list container -->
            <div class="{name}-list" id="{name}List">
                <div class="empty-state">Loading {name}...</div>
            </div>
        </div>
    </div>
</section>
```

### CSS Class Convention
- Section: `class="collapsible collapsed"` with `id="widget-{name}"`
- Header button: `class="collapsible-header"` with `data-action="toggle-collapse"` and `data-target="widget-{name}"`
- Body: `class="widget-body"`
- Buttons: `class="btn btn-small"` (primary) or `class="btn btn-small btn-secondary"` (secondary)
- Items: `class="{name}-item"` containing `{name}-info` and `{name}-actions` divs
- Badges: `class="badge badge-ok"` for deployed status
- Empty state: `class="empty-state"`

### Action Buttons
Use `data-action` attributes for event delegation:
- `data-action="refresh-{name}"` — postMessage to extension to refetch data
- `data-action="deploy-{name}"` — postMessage with item name
- `data-action="run-command"` with `data-command="{vscode.command}"` — VS Code command execution

### Client Helpers Pattern
```javascript
function render{Name}List(items) { /* returns HTML string */ }
function update{Name}List(items) { /* updates DOM innerHTML */ }
function request{Name}List() { vscode.postMessage({ type: 'get{Name}' }); }
```

---

## Gap 7: Dashboard Message Handlers

**File:** `vscode-extension/src/providers/dashboard-webview/dashboard-message-handlers.ts` (206 lines)

### Handler Interface
```typescript
export interface MessagePoster {
    postMessage(message: { type: string; data?: unknown }): void;
}
```
Handlers receive a `MessagePoster` (subset of DashboardViewProvider) + optional typed data.

### Handler Signatures
```typescript
export function handleGetSkills(poster: MessagePoster): void
export function handleDeploySkill(poster: MessagePoster, data: { skillName: string }): void
export function handleGetInstructions(poster: MessagePoster): void
export function handleDeployInstruction(poster: MessagePoster, data: { instructionName: string }): void
export function handleUndeployInstruction(poster: MessagePoster, data: { instructionName: string }): void
```

### Handler Pattern
1. Read config from `vscode.workspace.getConfiguration('projectMemory')`
2. Access workspace path from `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath`
3. Do filesystem/API work
4. Post results back: `poster.postMessage({ type: 'skillsList', data: { skills } })`

### How to Add Session Handlers
Add new functions following the same pattern:
```typescript
export function handleGetSessions(poster: MessagePoster, registry: SessionInterceptRegistry): void
export function handleStopSession(poster: MessagePoster, registry: SessionInterceptRegistry, data: { sessionKey: string }): void
export function handleInjectSession(poster: MessagePoster, registry: SessionInterceptRegistry, data: { sessionKey: string; text: string }): void
```

**Key difference:** Session handlers need access to the `SessionInterceptRegistry` (in-memory extension state), unlike skill/instruction handlers which read from the filesystem. The registry reference must be passed in, either through the `MessagePoster` interface extension or a separate context parameter.

---

## Gap 8: Server memory_agent Handler

**File:** `server/src/tools/consolidated/memory_agent.ts` (389 lines)

### Init Action Flow
```typescript
case 'init': {
    const result = await handoffTools.initialiseAgent({
        workspace_id, plan_id, agent_type,
        context: params.context || {},
        compact: params.compact,
        context_budget: params.context_budget,
        include_workspace_context: params.include_workspace_context,
        deployment_context: params.deployment_context
    });
    // ... validation logic ...
    return { success: result.success, data: { action: 'init', data: initData } };
}
```
Delegates to `handoff.tools.ts → initialiseAgent()`.

### Session Metadata Storage (from handoff.tools.ts)
1. `store.generateSessionId()` → generates `sess_{random}_{random}` format
2. Creates `AgentSession` object with `{ session_id, agent_type, started_at, context }`
3. Pushes session to `state.agent_sessions` array
4. Run ID assigned: `run_${sessionId}` (or from context if provided)
5. Calls `store.savePlanState(state)` → persists to `state.json`
6. Non-Coordinator agents also call `acquireActiveRun()` → persists to `active_run_lane.json`

### Response Shape (InitialiseAgentResult)
```typescript
interface InitialiseAgentResult {
    session: AgentSession;
    plan_state: PlanState | CompactPlanState;
    workspace_status: {
        registered: boolean;
        workspace_id?: string;
        workspace_path?: string;
        active_plans: string[];
        message: string;
    };
    role_boundaries: AgentRoleBoundaries;
    instruction_files?: AgentInstructionFile[];
    matched_skills?: MatchedSkillEntry[];
    validation?: { success: boolean; result?: unknown; error?: string };
    workspace_context_summary?: WorkspaceContextSummary;
    context_size_bytes?: number;
}
```

### Where to Add session_id Validation
In `memoryAgent()` switch case 'init' (line 104), after `initialiseAgent()` returns, we can:
1. Read `session_id` from the init result's session object
2. Validate triple-ID (workspace_id + plan_id + session_id) against the extension's SessionInterceptRegistry
3. But note: **the server doesn't own the registry** — validation happens on extension side

**Better approach:** Server adds `session_id` to the init response (already does via `session.session_id`). Extension-side ToolProvider reads it and registers with SessionInterceptRegistry when `is_subagent=true`.

---

## Gap 9: Server Event Emitter

**File:** `server/src/events/event-emitter.ts` (218 lines)

### Event Types
```typescript
export type EventType = 
    'tool_call' | 'plan_created' | 'plan_updated' | 'plan_archived'
  | 'step_updated' | 'note_added' | 'handoff'
  | 'agent_session_started' | 'agent_session_completed'
  | 'workspace_registered' | 'context_stored';
```

### Event Structure
```typescript
export interface MCPEvent {
    id: string;        // evt_{base36timestamp}_{random}
    type: EventType;
    timestamp: string; // ISO 8601
    workspace_id?: string;
    plan_id?: string;
    agent_type?: string;
    tool_name?: string;
    data: Record<string, unknown>;
}
```

### Emission
```typescript
export async function emitEvent(event: Omit<MCPEvent, 'id' | 'timestamp'>): Promise<void>
```
Writes to:
1. Individual JSON file: `data/events/evt_{id}.json`
2. Append to log: `data/events/events.log` (newline-delimited JSON)
3. Prunes to keep last 1000 events

### Convenience Emitters
```typescript
events.agentSessionStarted(workspaceId, planId, agentType, sessionId)
events.agentSessionCompleted(workspaceId, planId, agentType, summary, artifacts)
events.handoff(workspaceId, planId, fromAgent, toAgent, reason)
// etc.
```

### Adding New Session Lifecycle Events
Add new entries to `EventType`:
```typescript
| 'session_interrupted'
| 'session_injected'
| 'session_stop_escalated'
```
Add convenience emitters:
```typescript
events.sessionInterrupted(workspaceId, planId, sessionId, escalationLevel)
events.sessionInjected(workspaceId, planId, sessionId, injectText)
```

---

## Gap 10: Stale Run Recovery

**File:** `server/src/tools/orchestration/stale-run-recovery.ts` (203 lines)

### ActiveRunLifecycleRecord
```typescript
export interface ActiveRunLifecycleRecord {
    run_id: string;
    workspace_id: string;
    plan_id: string;
    status: 'active' | 'released' | 'cancelled';
    started_at: string;
    last_updated_at: string;
    owner_agent?: string;
    release_reason_code?: string;
}
```

### Disk Persistence
Uses `store.getContextPath(workspace_id, plan_id, 'active_run_lane')` → writes to plan context directory.
Reads/writes via `store.readJson<T>()` and `store.writeJsonLocked()`.

### Stale Detection
Default: `STALE_SESSION_MS = 20 * 60 * 1000` (20 minutes).
`isActiveRunStale(run)`: compares `last_updated_at` against threshold.
`isSessionStale(session)`: checks `AgentSession.started_at` against threshold (only if not completed).

### Recovery Process (`recoverStaleRuns`)
1. Find stale sessions in `state.agent_sessions`
2. Find steps with `status === 'active'`
3. Check if lane has an active run
4. Reset stale steps to `pending`
5. Complete stale sessions with recovery note
6. Release active run lane
7. Write recovery context to `stale_run_recovery.json`

### Orphaned Session Detection Integration
For the new system, orphaned subagent detection would:
1. During hub re-init, read the SessionInterceptRegistry (extension-side) for sessions matching `workspace_id + plan_id`
2. Cross-reference with `state.agent_sessions` to find sessions that started but never completed
3. Return structured warnings in the init response
4. The stale-run-recovery module already handles server-side stale runs; extension-side registry handles session-specific state

---

## Gap 11: Extension Activation Pattern

**File:** `vscode-extension/src/extension.ts` (1237 lines)

### Module-Level Singletons
```typescript
let dashboardProvider: DashboardViewProvider;
let agentWatcher: AgentWatcher;
let copilotFileWatcher: CopilotFileWatcher;
let statusBarManager: StatusBarManager;
let serverManager: ServerManager;
let defaultDeployer: DefaultDeployer;
let diagnosticsService: DiagnosticsService;
let mcpBridge: McpBridge | null = null;
let chatParticipant: ChatParticipant | null = null;
let toolProvider: ToolProvider | null = null;
```
All instantiated in `activate()` function.

### Service Instantiation Pattern
1. Read config from `vscode.workspace.getConfiguration('projectMemory')`
2. Instantiate services with config values
3. Push to `context.subscriptions` for disposal
4. Some services deferred: watchers after 2s timeout, server start lazy

### Chat Integration Init
```typescript
function initializeChatIntegration(context, config, dataRoot, options?): void {
    // Dispose existing instances
    // Create McpBridge
    // Create ChatParticipant (if registerChatParticipant)
    // Create ToolProvider (if registerTools)
    // Register reconnect command
}
```
`ToolProvider` is created at line 366:
```typescript
toolProvider = new ToolProvider(mcpBridge);
```

### Where to Wire SessionInterceptRegistry
Add as a module-level singleton alongside `toolProvider`:
```typescript
let sessionInterceptRegistry: SessionInterceptRegistry | null = null;
```
Instantiate in `initializeChatIntegration`:
```typescript
sessionInterceptRegistry = new SessionInterceptRegistry(context.workspaceState);
toolProvider = new ToolProvider(mcpBridge, { sessionRegistry: sessionInterceptRegistry });
```
Pass it to `DashboardViewProvider` for the sessions panel:
```typescript
dashboardProvider.setSessionRegistry(sessionInterceptRegistry);
```

### Workspace Storage Access
`context.workspaceState` provides `vscode.Memento` for persistent key-value storage scoped to the workspace. `context.globalState` provides global storage. The registry should use `context.workspaceState` for persistence across extension reloads.

---

## Gap 12: Tool Parameter Schema Format

**File:** `vscode-extension/package.json` (in `contributes.languageModelTools`)

### Schema Format
Tool parameter schemas use **JSON Schema** format in the `parametersSchema` field:
```json
{
    "name": "memory_agent",
    "displayName": "Project Memory Agent",
    "description": "...",
    "modelDescription": "...",
    "parametersSchema": {
        "type": "object",
        "properties": {
            "action": { "type": "string", "enum": [...], "description": "..." },
            "planId": { "type": "string", "description": "..." },
            ...
        },
        "required": ["action"]
    },
    "canBeInvokedManually": true
}
```

### Key Fields
- `name`: Tool identifier used in `vscode.lm.registerTool(name, ...)`
- `parametersSchema`: Standard JSON Schema with `type`, `properties`, `required`, `enum`, `items`, etc.
- `modelDescription`: Longer description for the LM context (tells the model how to use it)
- `canBeInvokedManually`: Whether users can invoke via command palette

### Where to Declare New Parameters
To add `session_id` and `is_subagent` to all tools, add to each tool's `parametersSchema.properties`:
```json
"session_id": {
    "type": "string",
    "description": "Session ID for subagent session tracking (set by extension, do not set manually)"
},
"is_subagent": {
    "type": "boolean",
    "description": "Whether this call is from a subagent session (enables interception)"
}
```

**Important consideration:** These params should NOT be in `required`. They should be optional and only populated when a subagent session is active. The LM should NOT set them manually — they should be injected by the extension infrastructure. This means they may be better handled at the ToolProvider invoke level (implicit injection) rather than declared in the schema (which would prompt the LM to include them).

**Recommended approach:** Do NOT add them to `parametersSchema` (this would leak implementation details to the LM). Instead, have ToolProvider's `invoke` wrapper check for an active session and inject session metadata into context WITHOUT modifying the tool input schema. The interception happens transparently.

---

## Unexpected Findings / Plan Impacts

1. **active-run-registry has NO persistence** — purely in-memory. SessionInterceptRegistry MUST use `context.workspaceState` to survive extension reloads. This is a critical design requirement.

2. **spawn-agent-tool does NOT interact with active-run-registry** — Lane acquisition happens server-side during `initialiseAgent()`, not during spawn prep. Session minting during spawn prep is new behavior.

3. **ToolProvider already has a shared `ctx` object** — Adding `sessionRegistry` to `ToolContext` is trivial.

4. **No orchestration index file exists** — `vscode-extension/src/chat/orchestration/` only has `active-run-registry.ts` and `spawn-reason-codes.ts` (no `index.ts`). New files need explicit imports.

5. **Tool parameter schemas are in package.json** — Adding `is_subagent`/`session_id` to the JSON Schema would expose them to the LM model, which is undesirable. Transparent interception at the ToolProvider level is strongly preferred.

6. **Dashboard sections are string-concatenated HTML** — Not a component framework. Adding a sessions section follows the exact same pattern as skills/instructions: export HTML function + client helpers function, import in sections.ts and client-script.ts.

7. **Message handlers take a `MessagePoster` abstraction** — Clean interface. Session handlers will need additional context (registry reference) beyond what `MessagePoster` provides.

8. **Server-side init already returns session_id** — In `handoff.tools.ts`, `initialiseAgent()` creates a session with `store.generateSessionId()` and returns it. The extension can read this from the tool response to correlate sessions.

9. **Event emitter already has session events** — `agent_session_started` and `agent_session_completed` exist. New events for interrupt/inject are additive, not structural changes.

10. **Extension uses `let` module singletons, not a DI container** — Services are simple module-level variables. SessionInterceptRegistry follows this pattern.