---
name: vscode-custom-tool-cloning
description: Use this skill when creating custom versions of default VS Code agent tools (terminal, filesystem, subagent spawning, etc.) as Language Model Tools in the Project Memory extension. Covers the full lifecycle — package.json declaration, ToolProvider registration, handler implementation, McpBridge proxy integration, native VS Code API usage, and container-mode compatibility.
category: vscode-extension
tags:
  - vscode
  - language-model-tools
  - extension-development
  - mcp-bridge
  - tool-cloning
language_targets:
  - typescript
framework_targets:
  - vscode
  - project-memory-mcp
---

# Creating Custom Versions of Default VS Code Agent Tools

When VS Code's built-in agent tools (terminal, filesystem, subagent spawning) don't meet the needs of this system — e.g. the default terminal lacks an allowlist, or subagent spawning needs MCP plan-aware orchestration — we create **custom clones** registered as Language Model Tools that integrate with the Project Memory MCP server.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│              VS Code Extension (runs locally, always)            │
│                                                                  │
│  package.json                                                    │
│    └─ languageModelTools[]  ← tool declaration + inputSchema     │
│                                                                  │
│  src/chat/ToolProvider.ts                                        │
│    └─ vscode.lm.registerTool(name, { invoke })                   │
│         └─ delegates to src/chat/tools/<tool-name>.ts            │
│                                                                  │
│  src/chat/tools/<tool-name>.ts                                   │
│    ├─ TypeScript interface for input                             │
│    ├─ Handler function with action-based switch                  │
│    ├─ Native VS Code API calls (createTerminal, etc.)            │
│    └─ McpBridge HTTP proxy calls (allowlist, auth, data)         │
│                                                                  │
│  src/chat/McpBridge.ts                                           │
│    └─ HTTP client → localhost:3001 (dashboard API server)        │
│         └─ Works in bundled, podman, or external mode            │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│              MCP Server (bundled locally OR in container)         │
│                                                                  │
│  server/src/index.ts                                             │
│    └─ server.tool(name, zodSchema, handler)                      │
│                                                                  │
│  server/src/tools/consolidated/<tool>.ts                         │
│    └─ Zod schema + action router                                 │
│                                                                  │
│  server/src/tools/<tool>.tools.ts                                │
│    └─ Handler implementations (server-side execution)            │
└──────────────────────────────────────────────────────────────────┘
```

## When to Clone vs Proxy

| Approach | When to Use | Example |
|----------|-------------|---------|
| **Clone (native)** | Tool needs direct VS Code API access (terminals, editors, UI) | Extension terminal tool — uses `vscode.window.createTerminal()` |
| **Proxy (HTTP)** | Tool operates on server-side data or needs container-scoped execution | `memory_workspace`, `memory_plan` — pure data through McpBridge |
| **Hybrid** | Tool needs both local VS Code APIs AND server-side data/auth | Extension terminal + server allowlist check; filesystem with server path validation |

Most custom tools in this system are **hybrid** — they use native VS Code APIs for user-facing interactions but call the MCP server for authorization, data, or persistence.

## Step-by-Step: Creating a Custom Tool

### Step 1: Declare in package.json

Add to the `languageModelTools` array in `vscode-extension/package.json`:

```jsonc
{
  "name": "memory_terminal_interactive",           // unique name, no conflicts
  "displayName": "Project Memory Interactive Terminal",
  "description": "Creates real VS Code terminals with allowlist safety",
  "modelDescription": "Creates and manages real VS Code integrated terminals...",
  "parametersSchema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["create", "send", "close", "list"],
        "description": "The action to perform"
      },
      // ... action-specific params
    },
    "required": ["action"]
  },
  "canBeInvokedManually": true
}
```

**Key rules:**
- `name` must be globally unique across all extensions — prefix with `memory_` or `project_memory_`
- `modelDescription` is what the LLM sees — make it detailed with action descriptions and parameter requirements
- `parametersSchema` must use JSON Schema (not Zod) — must match server-side Zod schema exactly if a server counterpart exists
- `canBeInvokedManually: true` allows users to invoke from the chat tools panel

### Step 2: Create the Tool Handler

Create `vscode-extension/src/chat/tools/<tool-name>.ts`:

```typescript
/**
 * <Tool Name> Tool Handler — <tool_name> language model tool
 *
 * Actions: <action1>, <action2>, ...
 */

import * as vscode from 'vscode';
import type { ToolContext } from './types';

// Typed input matching parametersSchema
export interface MyToolInput {
    action: 'create' | 'send' | 'close' | 'list';
    name?: string;
    command?: string;
    cwd?: string;
    terminal_id?: string;
    workspace_id?: string;
}

export async function handleMyTool(
    options: vscode.LanguageModelToolInvocationOptions<MyToolInput>,
    _token: vscode.CancellationToken,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult> {
    try {
        const { action } = options.input;
        let result: unknown;

        switch (action) {
            case 'create':
                result = await handleCreate(options.input, ctx);
                break;
            case 'send':
                result = await handleSend(options.input, ctx);
                break;
            // ... other actions
            default:
                return errorResult(`Unknown action: ${action}`);
        }

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
        ]);
    } catch (error) {
        return errorResult(error);
    }
}

function errorResult(error: unknown): vscode.LanguageModelToolResult {
    const message = error instanceof Error ? error.message : String(error);
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({ success: false, error: message }))
    ]);
}
```

**Pattern notes:**
- Always wrap the entire handler in try/catch returning `errorResult()`
- Always return `vscode.LanguageModelToolResult` with `LanguageModelTextPart` containing JSON
- Use action-based switch for routing (consistent with all 5 existing tools)
- Type the input interface to match parametersSchema exactly

#### Module-Level State for Resource Tracking

Tools that manage resources across invocations (terminals, file handles, sessions) need module-level state:

```typescript
const trackedTerminals = new Map<string, TrackedTerminal>();
let nextId = 1;

function generateTerminalId(name: string): string {
    return `term_${nextId++}_${name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30)}`;
}
```

Use a `Map` keyed by generated IDs so agents can reference resources across separate tool invocations. The counter-based ID prefix (`term_1_`, `term_2_`) keeps IDs short and human-readable.

#### Lazy Event Listener Initialization

Register VS Code event listeners on first invocation, not at import time. This avoids side effects if the tool is never used:

```typescript
let disposalListener: vscode.Disposable | undefined;

function ensureDisposalListener(): void {
    if (disposalListener) { return; }
    disposalListener = vscode.window.onDidCloseTerminal((closed) => {
        for (const [id, entry] of trackedTerminals.entries()) {
            if (entry.terminal === closed) {
                trackedTerminals.delete(id);
                break;
            }
        }
    });
}

// Call at the top of the main handler:
export async function handleInteractiveTerminalTool(...) {
    ensureDisposalListener();  // lazy init
    // ...
}
```

This pattern keeps module imports side-effect-free while ensuring cleanup happens automatically when a user closes a terminal.

### Step 3: Register in ToolProvider

Update `vscode-extension/src/chat/tools/index.ts`:

```typescript
export { handleMyTool } from './my-tool';
```

Update `vscode-extension/src/chat/ToolProvider.ts`:

```typescript
import { handleMyTool } from './tools';

// In registerTools():
this.disposables.push(
    vscode.lm.registerTool('memory_tool_name', {
        invoke: (options, token) => handleMyTool(options as never, token, this.ctx)
    })
);
```

**Important:** Cast `options` as `never` to avoid generic type mismatch — the `LanguageModelToolInvocationOptions<T>` generic doesn't match the runtime untyped options.

#### Cleanup Export for Extension Deactivation

Tools with module-level state must export a cleanup function so the extension's `deactivate()` can tear down resources:

```typescript
// In terminal-tool.ts:
export function disposeTerminalTracking(): void {
    disposalListener?.dispose();
    disposalListener = undefined;
    for (const entry of trackedTerminals.values()) {
        entry.terminal.dispose();
    }
    trackedTerminals.clear();
}

// In extension.ts deactivate():
import { disposeTerminalTracking } from './chat/tools';
export function deactivate() {
    disposeTerminalTracking();
}
```

Export cleanup functions from the tool barrel (`index.ts`) alongside the handler, and call them during extension shutdown.

### Step 4: Hybrid Pattern — Native API + Server Auth

For tools that need both local VS Code APIs and server-side authorization:

```typescript
async function handleCreate(
    input: MyToolInput,
    ctx: ToolContext
): Promise<{ success: boolean; terminal_id: string }> {
    // 1. Check server-side authorization via McpBridge
    const wsId = input.workspace_id ?? (await ctx.ensureWorkspace());
    const allowlist = await ctx.mcpBridge.callTool<{ patterns: string[] }>(
        'memory_terminal',
        { action: 'get_allowlist', workspace_id: wsId }
    );

    // 2. Validate command against allowlist locally
    if (input.command && !isAllowed(input.command, allowlist.patterns)) {
        return { success: false, error: 'Command not on allowlist' };
    }

    // 3. Use native VS Code API (runs locally, always works)
    const terminal = vscode.window.createTerminal({
        name: input.name || 'Project Memory',
        cwd: input.cwd ? vscode.Uri.file(input.cwd) : undefined,
    });
    terminal.show();

    // 4. Optionally send command
    if (input.command) {
        terminal.sendText(input.command);
    }

    return { success: true, terminal_id: terminal.name };
}
```

### Key Design Decision: Warn vs Block in Interactive Tools

Server-side tools (e.g. `memory_terminal`) **block** all commands not on the allowlist — they execute headlessly and the user cannot intervene. Extension-side interactive tools take a different approach:

| Check | Server-side (`memory_terminal`) | Extension-side (`memory_terminal_interactive`) |
|-------|--------------------------------|------------------------------------------------|
| Destructive keywords | **Block** | **Block** (always blocked everywhere) |
| Not on allowlist | **Block** | **Warn** (proceed with warning) |
| Shell operators | **Block** | No check (visible to user) |
| MCP server unreachable | N/A | **Warn** and proceed |

The rationale: interactive terminals are visible to the user, who can observe and cancel commands. Blocking non-allowlisted commands would make the tool unusable for ad-hoc tasks. Destructive keywords are always blocked regardless because they are irreversible.

## Container Mode Compatibility

**Critical architectural rule:** The VS Code extension always runs locally on the host machine. Only the MCP server runs inside the container. This means:

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│     VS Code Extension       │     │      Podman Container       │
│     (always local)          │     │      (when containerized)   │
│                             │     │                             │
│  ✅ vscode.window.*         │     │  ✅ MCP server              │
│  ✅ vscode.workspace.*      │     │  ✅ Dashboard API :3001     │
│  ✅ createTerminal()        │ ──► │  ✅ Data persistence        │
│  ✅ Tool handlers           │HTTP │  ✅ child_process.spawn()   │
│  ✅ McpBridge HTTP client   │     │  ❌ No VS Code APIs         │
│                             │     │                             │
│  Terminals created HERE     │     │  Server-side commands HERE  │
│  run on the HOST machine    │     │  run INSIDE the container   │
└─────────────────────────────┘     └─────────────────────────────┘
```

### Implications for Custom Tools

1. **Native VS Code API calls always work** regardless of server mode (bundled/podman/external). `vscode.window.createTerminal()` creates a terminal on the host — never inside the container.

2. **McpBridge HTTP calls must be routable.** The bridge connects to `localhost:3001`. In container mode, port 3001 is mapped from the container to the host. Ensure `run-container.ps1` exposes it:
   ```powershell
   podman run -p 3001:3001 ...
   ```

3. **Server-side tools (e.g. `memory_terminal` run action) execute inside the container.** This is by design for safety — commands run in a sandboxed environment. The allowlist controls what commands the server can run.

4. **Extension-side tools create local resources.** An extension terminal tool creates real VS Code terminals on the host. The user can see and interact with them. This is the "clone of default vscode tool" pattern.

5. **Hybrid tools are the most common pattern.** The extension-side terminal tool:
   - Fetches the allowlist from the server (HTTP call through McpBridge)
   - Creates a real VS Code terminal locally (native API)
   - Allows user interaction (visible, interactive terminal)
   - Optionally logs execution back to the server (HTTP call)

### Container Mode Checklist

When creating a custom tool, verify:

- [ ] Native VS Code API calls (createTerminal, showTextDocument, etc.) do NOT depend on the server being local
- [ ] McpBridge calls use relative HTTP paths (not absolute URLs with hardcoded hosts)
- [ ] Port 3001 is exposed in container configuration
- [ ] Tool works when MCP server is unavailable (graceful degradation for native-only operations)
- [ ] If the tool needs to read/write files, ensure the workspace path is on the HOST filesystem, not the container's

## Naming Conventions

| Pattern | When | Example |
|---------|------|---------|
| `memory_<noun>` | Server-side MCP tool | `memory_terminal`, `memory_filesystem` |
| `memory_<noun>_interactive` | Extension-side clone of a server tool | `memory_terminal_interactive` |
| `memory_<verb>_<noun>` | Extension-only tool with no server counterpart | `memory_spawn_agent` |

Avoid name collisions with existing tools. The server-side `memory_terminal` and extension-side `memory_terminal_interactive` can coexist — agents choose which to use based on whether they need headless execution or visible terminals.

## ToolContext Interface

All tool handlers receive a shared `ToolContext`:

```typescript
export interface ToolContext {
    mcpBridge: McpBridge;                    // HTTP proxy to server
    ensureWorkspace: () => Promise<string>;  // Get/register workspace ID
    setWorkspaceId: (id: string) => void;    // Cache workspace ID
}
```

- `ensureWorkspace()` auto-registers if needed and caches the ID
- `mcpBridge.callTool<T>(name, args)` calls the server's tool endpoint
- `mcpBridge.isConnected()` checks server availability

## Error Handling Pattern

Every tool handler must follow this error contract:

```typescript
// Success:
{ "success": true, "data": { ... } }

// Failure:
{ "success": false, "error": "Human-readable error message" }
```

The `errorResult()` helper function is duplicated in each tool file (not shared) for self-containment. This is intentional — each tool file is a leaf module with no cross-tool dependencies.

This leaf-module principle extends to safety constants. The `DESTRUCTIVE_KEYWORDS` array in the extension's `terminal-tool.ts` is intentionally duplicated from the server's `terminal-auth.ts` rather than shared via an import. Each tool file should be independently deployable with no cross-tool imports. If the lists diverge, that's acceptable — each environment has different safety requirements (server blocks more aggressively than interactive tools).

## Cloning a Default VS Code Tool — Decision Framework

When cloning a default VS Code tool (terminal, filesystem, subagent spawning):

### 1. Identify what the default tool does

| Default Tool | VS Code API | What It Does |
|-------------|-------------|-------------|
| Terminal (`run_in_terminal`) | `vscode.window.createTerminal()`, `sendText()` | Creates visible terminals, runs commands |
| Filesystem (`create_file`, `read_file`) | `vscode.workspace.fs.*` | Read/write workspace files |
| Subagent (`runSubagent`) | Chat participant API | Spawns a new agent session |

### 2. Identify what the clone adds

| Clone | Server Integration | Additional Features |
|-------|-------------------|---------------------|
| `memory_terminal_interactive` | Allowlist from MCP server | Safety guardrails, session tracking, allowlist enforcement |
| `memory_filesystem` | Path validation from MCP server | Workspace scoping, sensitive file blocking, traversal prevention |
| `memory_spawn_agent` | Plan-aware orchestration from MCP server | Anti-spawning rules, handoff protocol, scope boundaries |

### 3. Determine architecture split

- **What runs locally (extension)?** — UI interactions, terminal creation, file editing, user-facing operations
- **What runs on server?** — Authorization, validation, persistence, session tracking, data storage
- **What needs both?** — Most operations: local action + server validation/logging

### 4. Implement following the patterns above

## File Size Discipline

Each tool handler file should stay under **300 lines**. If it grows beyond that:

- Extract authorization/validation logic to a separate module
- Extract types to the shared `types.ts`
- Keep the handler file focused on action routing and VS Code API calls

Reference: `terminal-auth.ts` (249 lines) was extracted from `terminal.tools.ts` (now 354 lines) to stay under limits.

## Testing Custom Tools

Server-side components of custom tools are tested with Vitest in `server/src/__tests__/tools/`:

```
terminal-auth.test.ts       — 50 tests (authorization model)
filesystem-safety.test.ts   — 39 tests (path validation)
terminal-filesystem-e2e.test.ts — 20 tests (integration)
```

Extension-side components currently lack unit tests (VS Code extension testing requires `@vscode/test-electron`). Verify extension tools via:

1. **Compile check:** `npm run compile` in `vscode-extension/`
2. **Package:** `npx @vscode/vsce package`
3. **Install + manual smoke test:** Invoke the tool from Copilot Chat
4. **Schema cross-check:** Verify package.json parametersSchema matches server Zod schema

## Summary Checklist for New Custom Tools

- [ ] package.json: Add to `languageModelTools[]` with full `parametersSchema`
- [ ] Handler: Create `src/chat/tools/<name>.ts` with typed input + action switch
- [ ] Index: Export handler from `src/chat/tools/index.ts`
- [ ] ToolProvider: Register with `vscode.lm.registerTool()`
- [ ] Server counterpart (if hybrid): Zod schema in `server/src/tools/consolidated/`, handler in `server/src/tools/`
- [ ] Server registration (if hybrid): `server.tool()` call in `server/src/index.ts`
- [ ] Container: Verify port mapping and host/container boundary
- [ ] Tests: Server-side unit tests, extension compile check
- [ ] Docs: Update agent files and `mcp-usage.instructions.md`
- [ ] Schema sync: Verify package.json inputSchema matches server Zod schema
