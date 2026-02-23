---
plan_id: plan_mlp8qxtq_ad821ebf
created_at: 2026-02-16T14:17:38.866Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# MCP SDK Tool Call Timeout Behavior

## SDK Version
`@modelcontextprotocol/sdk` v1.26.0

## Core Findings

### 1. Timeout is CLIENT-SIDE, Not Server-Side

The MCP protocol timeout is enforced by the **client** (VS Code, Claude Desktop, etc.), not the server. The server's tool handler can run indefinitely — it's the client that decides when to give up.

**Source**: `node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.js`

```javascript
const DEFAULT_REQUEST_TIMEOUT_MSEC = 60000; // 60 seconds
```

The timeout is set per-request via `options.timeout`:
```javascript
const timeout = (_b = options === null || ... ) !== null ... ? _b : DEFAULT_REQUEST_TIMEOUT_MSEC;
```

### 2. Error Code and Behavior

When a timeout fires:
- Error code: `ErrorCode.RequestTimeout = -32001`
- Client sends a `notifications/cancelled` notification to the server with `{ requestId, reason: "Timeout" }`
- Server receives an `AbortSignal` abort event in the tool handler via `extra.signal`
- Client raises `McpError` with code `-32001`

### 3. Progress Notifications Reset the Timeout

**This is the key insight for the interactive terminal flow.**

The SDK supports `resetTimeoutOnProgress`:
```javascript
_setupTimeout(messageId, timeout, maxTotalTimeout, onTimeout, resetTimeoutOnProgress) {
    this._timeouts.set(messageId, { timer, maxTotalTimeout, ... });
}

_onProgress(notification) {
    const entry = this._timeouts.get(notification.params.progressToken);
    if (entry?.resetTimeoutOnProgress) {
        this._resetTimeout(messageId); // Resets the 60s timer
    }
}
```

When the server sends a progress notification matching the request's `progressToken`, the client resets its timeout timer back to the configured duration (e.g., 60s). This means a tool call can run for **arbitrarily long** as long as the server periodically sends progress updates.

### 4. maxTotalTimeout Cap

There's also a `maxTotalTimeout` that provides a hard upper bound:
```javascript
_resetTimeout(messageId) {
    const entry = this._timeouts.get(messageId);
    if (entry?.maxTotalTimeout) {
        const elapsed = Date.now() - entry.startTime;
        if (elapsed >= entry.maxTotalTimeout) {
            // Fire timeout immediately
        }
    }
}
```

Whether `maxTotalTimeout` is set depends on the client implementation. Some clients may not set it, allowing truly unbounded tool execution with progress resets.

### 5. Server-Side Tool Handler Capabilities

When the MCP server registers a tool handler, the handler receives an `extra` object:

```typescript
interface RequestHandlerExtra {
    signal: AbortSignal;           // Cancelled when client gives up
    sendNotification: Function;     // Send notifications back to client
    sendRequest: Function;          // Send requests back to client (sampling)
    closeSSEStream?: Function;      // For StreamableHTTP: close to trigger reconnection
}
```

The tool handler can:
- **Send progress**: `extra.sendNotification({ method: "notifications/progress", params: { progressToken, progress, total, message } })`
- **Check cancellation**: `extra.signal.aborted` or listen to `extra.signal.addEventListener('abort', ...)`
- **Trigger polling**: `extra.closeSSEStream()` for StreamableHTTP transport (forces client to reconnect and poll for pending results)

### 6. Server-Side `DEFAULT_TIMEOUT_MS`

The codebase has its own `DEFAULT_TIMEOUT_MS = 30_000` in `interactive-terminal-contract.ts`. This is **NOT** the MCP protocol timeout — it's the server's internal timeout for awaiting the GUI user's approval response. This is separate from the client-server protocol timeout.

### 7. Experimental Task Support

The SDK has experimental "elicitation" and "task" support. Tasks allow a tool to return a "pending" result that the client can poll for later. However:
- This is experimental/draft in the SDK
- Not widely supported by clients yet
- Not suitable for production use in the near term

## Implications for Interactive Terminal Flow

### The Problem
Interactive terminal approval flow:
1. User invokes a tool call (e.g., `memory_terminal_interactive execute`)
2. MCP server sends command to GUI app for user approval
3. User reviews and approves/declines in the GUI
4. MCP server returns the result

The user decision step can take **5 seconds to several minutes**. The default 60-second client timeout would kill the request.

### The Solution: Progress Notification Keep-Alive

**Strategy**: While waiting for user approval, the MCP server sends periodic progress notifications to the client. Each notification resets the 60-second timeout.

```
Timeline:
0s  - Client sends tool call request (timeout = 60s)
5s  - Server sends progress: "Awaiting user approval..." (timeout resets to 60s)
15s - Server sends progress: "User reviewing command..." (timeout resets to 60s)  
25s - Server sends progress: "Still awaiting approval..." (timeout resets to 60s)
35s - Server sends progress: "User is reviewing..." (timeout resets to 60s)
42s - User approves in GUI
43s - Server returns tool result
```

**Recommended interval**: Send progress notifications every **10-15 seconds**. This provides a comfortable margin against the 60-second default timeout (4-6 resets per timeout period).

### Implementation Requirements

1. **Capture `extra` in tool handler**: The tool registration must accept the `extra` parameter
   ```typescript
   server.tool("memory_terminal_interactive", schema, async (params, extra) => {
       // extra.sendNotification, extra.signal available
   });
   ```

2. **Progress notification loop**: While awaiting GUI response, run a timer that sends progress notifications
   ```typescript
   const interval = setInterval(() => {
       extra.sendNotification({
           method: "notifications/progress",
           params: { progressToken: requestId, progress: elapsed, total: 0 }
       });
   }, 10_000);
   ```

3. **Cancellation handling**: If `extra.signal` fires, cancel the GUI request and clean up
   ```typescript
   extra.signal.addEventListener('abort', () => {
       clearInterval(interval);
       adapter.recover('timeout');
   });
   ```

4. **Server's internal timeout**: Keep the `DEFAULT_TIMEOUT_MS = 30_000` for the maximum time the orchestration layer waits for a GUI response. If exceeded, return a timeout error to the client. This can be extended to a configurable value (e.g., 120s) for interactive approval flows.

### Safe Operating Window

| Scenario | Timeout | Safe? |
|----------|---------|-------|
| Default 60s, no progress | ~50s | ⚠️ Tight — must respond in under 60s |
| Default 60s, progress every 10s | Unlimited* | ✅ Safe — resets keep extending |
| maxTotalTimeout = 300s, progress every 10s | 300s | ✅ Safe — 5 minutes for user decision |
| maxTotalTimeout = 120s, progress every 10s | 120s | ✅ Safe — 2 minutes for user decision |

*Unless client sets `maxTotalTimeout`

### Key Risk: Client Implementation Variance

Different MCP clients may:
- Set different `maxTotalTimeout` values
- Not support `resetTimeoutOnProgress`
- Have their own timeout mechanisms outside the MCP SDK

**Mitigation**: Design the system to work within 60s without progress (quick timeout with helpful error message) AND indefinitely with progress (for supporting clients). The error response should include clear guidance: "Command timed out waiting for approval. Consider approving faster or configuring a longer timeout."

## Relevant Source File Paths

| File | Purpose |
|------|---------|
| `node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.js` | Timeout setup, progress handling, cancellation |
| `node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.d.ts` | `RequestHandlerExtra` type definition |
| `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js` | Tool execution path, handler registration |
| `server/src/tools/interactive-terminal-contract.ts` | Server's internal `DEFAULT_TIMEOUT_MS` |
| `server/src/index.ts` | Tool registration (where `extra` would be captured) |
