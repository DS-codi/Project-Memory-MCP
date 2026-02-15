# Headless Terminal Execution Contract (Phase 7 Step 20)

## Purpose

Defines the VS Code chat-side contract for programmatic, headless command execution used by build-script buttons and future chat callbacks.

This contract is intended for implementation by the Interactive Terminal plan:

- Plan ID: `plan_mllgocd5_95a81ffe`

## TypeScript Source

- `src/chat/HeadlessTerminalExecutionContract.ts`

## Contract Summary

### `HeadlessTerminalExecutionPort`

```ts
interface HeadlessTerminalExecutionPort {
  run(request: HeadlessTerminalRunRequest): Promise<HeadlessTerminalRunResult>;
  readOutput(request: HeadlessTerminalReadRequest): Promise<HeadlessTerminalReadResult>;
  kill(request: HeadlessTerminalReadRequest): Promise<HeadlessTerminalRunResult>;
}
```

### Core request shape

- `workspaceId`: canonical MCP workspace id used for authorization context
- `command`: executable or shell entry command
- `args`: optional argument array
- `cwd`: optional command working directory
- `timeoutMs`: optional execution timeout

### Session shape

- `sessionId`: runtime session identifier
- `authorization`: `allowed` or `blocked`
- `startedAt`: ISO timestamp when session starts
- `exitedAt`: optional ISO timestamp when process exits
- `exitCode`: optional exit code when available

### Result shape

- `ok`: operation success
- `message`: optional diagnostic/user-facing explanation
- `session`: optional normalized session metadata

## Integration expectations

1. Chat command handlers should call `run()` first.
2. For background/long commands, handlers should poll `readOutput()` by `sessionId`.
3. Handlers may call `kill()` for cancellation paths.
4. Implementations must preserve terminal authorization semantics from MCP tools.

## Non-goals for this step

- No concrete executor implementation.
- No transport binding changes.
- No dependency additions.
