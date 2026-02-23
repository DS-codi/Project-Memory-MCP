---
plan_id: plan_mlkl9sli_56a1957b
created_at: 2026-02-13T20:01:41.537Z
sanitized: false
injection_attempts: 0
warnings: 2
---

# VS Code Terminal API & Extension Tool Registration Research

## 1. VS Code Terminal API

### Creating Terminals
```typescript
// Simple overload
vscode.window.createTerminal(name?: string, shellPath?: string, shellArgs?: string | readonly string[]): Terminal

// Full options overload
vscode.window.createTerminal(options: TerminalOptions): Terminal

// Extension-controlled pseudo-terminal
vscode.window.createTerminal(options: ExtensionTerminalOptions): Terminal
```

### TerminalOptions Properties
| Property | Type | Description |
|----------|------|-------------|
| `name` | `string?` | Display name in terminal tab |
| `shellPath` | `string?` | Path to shell executable |
| `shellArgs` | `string \| string[]?` | Arguments for shell |
| `cwd` | `string \| Uri?` | Working directory |
| `env` | `Record<string, string>?` | Environment variables |
| `strictEnv` | `boolean?` | If true, uses only provided env (no inheritance) |
| `hideFromUser` | `boolean?` | If true, terminal won't be shown in panel |
| `isTransient` | `boolean?` | If true, not persisted across window reloads |
| `color` | `ThemeColor?` | Terminal tab color |
| `iconPath` | `IconPath?` | Terminal tab icon |
| `location` | `TerminalLocation \| TerminalEditorLocationOptions \| TerminalSplitLocationOptions?` | Panel/editor/split |
| `message` | `string?` | Initial message shown in terminal |

### Terminal Instance Methods & Properties
| Member | Type | Description |
|--------|------|-------------|
| `name` | `string` | Terminal display name |
| `processId` | `Thenable<number>` | PID of the shell process |
| `creationOptions` | `Readonly<TerminalOptions \| ExtensionTerminalOptions>` | Options used to create |
| `exitStatus` | `TerminalExitStatus` | Exit code and reason (after close) |
| `state` | `TerminalState` | `{ isInteractedWith: boolean, shell: string }` |
| `shellIntegration` | `TerminalShellIntegration` | Shell integration if available |
| `sendText(text, shouldExecute?)` | `void` | Send text to terminal, optionally execute |
| `show(preserveFocus?)` | `void` | Make terminal visible |
| `hide()` | `void` | Hide terminal from UI |
| `dispose()` | `void` | Close and destroy terminal |

### Terminal Events
| Event | Description |
|-------|-------------|
| `window.onDidOpenTerminal` | Fires when any terminal is created |
| `window.onDidCloseTerminal` | Fires when any terminal is closed |
| `window.onDidChangeActiveTerminal` | Fires when active terminal changes |
| `window.onDidChangeTerminalState` | Fires when terminal state changes |
| `window.onDidChangeTerminalShellIntegration` | Fires when shell integration becomes available |
| `window.onDidStartTerminalShellExecution` | Fires when a command starts executing |
| `window.onDidEndTerminalShellExecution` | Fires when a command finishes executing |

### Shell Integration (Key for Output Capture)
The `TerminalShellIntegration` interface is the **critical API** for programmatic output reading:

```typescript
interface TerminalShellIntegration {
  cwd: Uri;
  executeCommand(commandLine: string): TerminalShellExecution;
  executeCommand(executable: string, args: string[]): TerminalShellExecution;
}

interface TerminalShellExecution {
  commandLine: TerminalShellExecutionCommandLine;
  cwd: Uri;
  read(): AsyncIterable<string>;  // ← OUTPUT READING
}

interface TerminalShellExecutionEndEvent {
  execution: TerminalShellExecution;
  exitCode: number;
  shellIntegration: TerminalShellIntegration;
  terminal: Terminal;
}
```

**Output capture flow:**
1. Check if `terminal.shellIntegration` is available
2. Use `shellIntegration.executeCommand(cmd)` to run commands
3. Use `execution.read()` to get an async iterable of output chunks
4. Listen to `onDidEndTerminalShellExecution` for exit code

**Important:** Shell integration requires the terminal to have shell integration enabled (automatic in most modern shells). If not available, `sendText()` can still execute commands but **output cannot be captured programmatically**.

### TerminalShellExecutionCommandLine
```typescript
interface TerminalShellExecutionCommandLine {
  confidence: TerminalShellExecutionCommandLineConfidence; // Low=0, Medium=1, High=2
  isTrusted: boolean;
  value: string;
}
```

### Extension Terminal (Pseudoterminal) — Virtual Terminal
For fully controlled I/O, extensions can create virtual terminals:
```typescript
interface Pseudoterminal {
  onDidWrite: Event<string>;       // Extension writes output TO the terminal
  onDidClose?: Event<number | void>;
  onDidChangeName?: Event<string>;
  onDidOverrideDimensions?: Event<TerminalDimensions>;
  open(initialDimensions: TerminalDimensions): void;
  close(): void;
  handleInput(data: string): void; // User types INTO the terminal
  setDimensions(dimensions: TerminalDimensions): void;
}
```

### TerminalLocation
```typescript
enum TerminalLocation {
  Panel = 1,  // Default terminal panel
  Editor = 2  // Terminal as editor tab
}
```

### Key Variables
- `window.activeTerminal: Terminal | undefined` — currently focused terminal
- `window.terminals: readonly Terminal[]` — all open terminals

---

## 2. Existing Extension Tool Registration Pattern

### Architecture Overview
```
package.json (declarations) → ToolProvider.ts (registration) → tools/*.ts (handlers)
                                        ↓
                              McpBridge (HTTP) → Express Server:3001
```

### package.json Declaration
Tools are declaratively defined in `contributes.languageModelTools`:
```json
{
  "name": "memory_workspace",
  "displayName": "Project Memory - Workspace",
  "modelDescription": "...",
  "canBeInvokedManually": true,
  "inputSchema": { ... },  // JSON Schema for parameters
  "tags": ["project-memory", "mcp-tool"]
}
```

**Status:** `memory_terminal` and `memory_filesystem` are ALREADY declared with full schemas.

### ToolProvider.ts Registration
```typescript
// Pattern for each tool:
const toolDisposable = vscode.lm.registerTool('memory_xxx', {
  invoke: async (options: vscode.LanguageModelToolInvocationOptions<InputType>, token) => {
    return handleXxxTool(options, token, ctx);
  }
});
context.subscriptions.push(toolDisposable);
```

Currently registers: `memory_workspace`, `memory_agent`, `memory_plan`, `memory_steps`, `memory_context`

**MISSING:** `memory_terminal`, `memory_filesystem` — NO registration code exists.

### ToolContext Interface (types.ts)
```typescript
export interface ToolContext {
  mcpBridge: McpBridge;
  ensureWorkspace: () => Promise<string>;
  setWorkspaceId: (id: string) => void;
}
```

### Handler Pattern (tools/*.ts)
```typescript
export async function handleXxxTool(
  options: vscode.LanguageModelToolInvocationOptions<InputType>,
  _token: vscode.CancellationToken,
  ctx: ToolContext
): Promise<vscode.LanguageModelToolResult> {
  const input = options.input;
  if (!ctx.mcpBridge.isConnected()) {
    return errorResult('Not connected to Project Memory server...');
  }
  const workspaceId = await ctx.ensureWorkspace();
  // Switch on input.action, call ctx.mcpBridge.callTool(toolName, args)
  const result = await ctx.mcpBridge.callTool('memory_xxx', { action: input.action, ... });
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
  ]);
}
```

### McpToolRouter.ts
Routes tool names to HTTP handler functions. Currently does NOT route `memory_terminal` or `memory_filesystem`.

---

## 3. Implementation Gap Analysis

### Already Done (No Work Needed)
- ✅ `memory_terminal` declared in package.json with full parametersSchema
- ✅ `memory_filesystem` declared in package.json with full parametersSchema
- ✅ Server-side terminal handler exists: `server/src/tools/terminal.tools.ts`
- ✅ Server-side terminal auth exists: `server/src/tools/terminal-auth.ts`

### Needs Implementation
| Component | File | Work Required |
|-----------|------|---------------|
| Terminal tool handler | `vscode-extension/src/chat/tools/terminal-tool.ts` | NEW FILE — implement `handleTerminalTool()` |
| Filesystem tool handler | `vscode-extension/src/chat/tools/filesystem-tool.ts` | NEW FILE — implement `handleFilesystemTool()` |
| ToolProvider registration | `vscode-extension/src/chat/ToolProvider.ts` | ADD 2 registrations for terminal/filesystem |
| McpToolRouter routing | `vscode-extension/src/chat/McpToolRouter.ts` | ADD 2 routing cases |
| Barrel exports | `vscode-extension/src/chat/tools/index.ts` | ADD 2 exports |

### Design Decision: HTTP Proxy vs Native VS Code Terminal

The server-side `memory_terminal` uses `child_process.spawn()` for headless execution with ring buffer output capture (100KB max, 30-min TTL). This is suitable for CI/build contexts.

For the VS Code extension, there are two approaches:

**Option A: HTTP Proxy (Recommended for consistency)**
- Route `memory_terminal` calls through `McpBridge.callTool()` to the server
- Server handles execution with child_process
- Extension handler is thin: validate input → proxy to HTTP → return result
- Matches pattern of all 5 existing tools
- Advantage: Same terminal auth, session management, output buffering
- Disadvantage: No visible terminal in VS Code, headless only

**Option B: Native VS Code Terminal API**
- Create VISIBLE terminals via `vscode.window.createTerminal()`
- Use `TerminalShellIntegration.executeCommand()` for command execution
- Use `execution.read()` for output capture
- Manage terminal sessions in extension memory
- Advantage: User can SEE terminal activity, full VS Code integration
- Disadvantage: Shell integration not always available, different behavior from server-side

**Option C: Hybrid**
- Terminal tool handlers proxy to server via HTTP (like Option A)
- Add OPTIONAL VS Code terminal integration for "show" action
- Best of both: consistent API, optional visibility

**Recommendation:** Start with Option A (HTTP proxy pattern) for consistency with existing tools. This gets both tools functional quickly. Add native terminal features later as enhancements.

---

## 4. Server-Side Terminal Architecture (for reference)

### Session Management
- Sessions stored in `Map<string, TerminalSession>`
- Auto-generated session IDs
- 30-minute TTL with automatic cleanup
- Ring buffer for output: MAX_OUTPUT_BYTES = 100KB

### Authorization Model
- Default allowlist: safe commands (git status, npm test, ls, cat, etc.)
- Dangerous operators blocked: `| & ; > < \` $`
- Destructive keywords blocked: rm, del, format, shutdown, etc.
- Per-workspace allowlist persisted to `terminal-allowlist.json`

### Actions
| Action | Description |
|--------|-------------|
| `run` | Spawn process with command, args, cwd, timeout |
| `read_output` | Read buffered output from session |
| `kill` | Terminate session |
| `get_allowlist` | Get current allowlist for workspace |
| `update_allowlist` | Modify allowlist patterns |

---

## 5. workspace.fs API (for filesystem tool)

The `vscode.workspace.fs` API provides cross-platform file operations:
```typescript
workspace.fs.readFile(uri: Uri): Thenable<Uint8Array>
workspace.fs.writeFile(uri: Uri, content: Uint8Array): Thenable<void>
workspace.fs.readDirectory(uri: Uri): Thenable<Array<[string, FileType]>>
workspace.fs.stat(uri: Uri): Thenable<FileStat>
workspace.fs.createDirectory(uri: Uri): Thenable<void>
workspace.fs.delete(uri: Uri, options?: { recursive, useTrash }): Thenable<void>
workspace.fs.rename(source, target, options?): Thenable<void>
workspace.fs.copy(source, target, options?): Thenable<void>
```

Also relevant:
- `workspace.findFiles(include, exclude?, maxResults?)` — glob-based file search
- `workspace.createFileSystemWatcher(glob)` — watch for changes

---

## 6. Summary of Key Findings

1. **VS Code Terminal API** is rich but output capture requires Shell Integration (`TerminalShellIntegration`), which is not always available.
2. **All 5 existing tools** follow identical pattern: package.json → ToolProvider → tools/*.ts → McpBridge HTTP
3. **memory_terminal and memory_filesystem** schemas already exist in package.json
4. **Zero implementation** exists in the extension for either tool (no handler files, no ToolProvider registration, no router entries)
5. **Server-side terminal** already works with child_process spawn, auth model, and session management
6. **Recommended approach:** Start with HTTP proxy pattern for both tools (consistency), add native VS Code terminal features later
