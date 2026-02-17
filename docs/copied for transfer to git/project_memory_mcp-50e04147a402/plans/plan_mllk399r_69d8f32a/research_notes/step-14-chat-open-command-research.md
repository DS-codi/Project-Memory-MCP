---
plan_id: plan_mllk399r_69d8f32a
created_at: 2026-02-14T18:53:10.936Z
sanitized: false
injection_attempts: 0
warnings: 0
---

## Step 14 Research — VS Code chat launch APIs (2026-02-15)

### Scope investigated
- `workbench.action.chat.open`
- `workbench.action.chat.newChat`
- `workbench.action.chat.sendToNewChat`
- Practical command args and portability limits
- Fallback behavior for Project Memory command `projectMemory.launchAgentChat`

### Evidence summary
1. **Project code already relies on `workbench.action.chat.open` with `{ query }`**
   - Existing usage in extension code executes:
     - `executeCommand('workbench.action.chat.open', { query: '@memory /plan show ...' })`
     - `executeCommand('workbench.action.chat.open', { query: '@brainstorm ...' })`
2. **Bundled VS Code workbench source (1.108.x/1.109.x test runtime in repo) shows `workbench.action.chat.open` accepts object args** with observed fields:
   - `query?: string`
   - `isPartialQuery?: boolean`
   - `mode?: 'ask' | 'agent'` (observed internal usage)
   - `toolIds?: string[]`
   - `blockOnResponse?: boolean`
3. **`workbench.action.chat.newChat` supports limited optional args** in workbench internals:
   - `agentMode?: boolean`
   - `inputValue?: string`
   - `isPartialQuery?: boolean`
   - Important: `agentMode` is boolean (not arbitrary mode string).
4. **`workbench.action.chat.sendToNewChat` is primarily a UI action on current chat widget**
   - It copies currently typed input into a new chat session.
   - It depends on active/focused chat widget state and is not a stable way to programmatically set fresh agent+prompt context from extension command handlers.
5. **Public VS Code command docs list built-in commands as a subset and do not provide stable argument contracts for these chat workbench commands.**
   - Therefore, these command argument shapes should be treated as *best-effort/observed* and version-sensitive.

### Recommendation for Step 15 implementation
Use `workbench.action.chat.open` as the **primary** API because it is:
- Already used in this extension
- Works directly from command handlers
- Supports prefilled prompt text via `query`
- Supports `isPartialQuery` to keep text unsent (preferred for review/edit before send)
- Supports explicit mode hint (observed) via `mode`

#### Suggested primary invocation pattern
```ts
await vscode.commands.executeCommand('workbench.action.chat.open', {
  mode: 'agent',              // fallback: omit if unsupported
  query: `@${agentName} ${promptContext}`,
  isPartialQuery: true        // prefill only, do not auto-submit
});
```

### Fallback hierarchy (reliable across environments)
1. **Primary:** `workbench.action.chat.open({ mode, query, isPartialQuery: true })`
2. **Fallback A:** `workbench.action.chat.newChat({ agentMode, inputValue, isPartialQuery: true })` then optionally `chat.open({ query, isPartialQuery: true })` if needed
3. **Fallback B:** `workbench.action.chat.open({ query, isPartialQuery: true })` (omit `mode`)
4. **Fallback C:** `workbench.action.chat.open({ query })` (no partial support assumptions)
5. **Last-resort UX fallback:** copy prepared prompt to clipboard + show actionable info message instructing user to open Chat and paste.

### Edge cases / limitations
- Command arg contracts are not strongly documented publicly and may vary by VS Code release/channel.
- `mode: 'agent'` is observed in internal usage; future versions may rename/limit accepted modes.
- `workbench.action.chat.newChat` takes boolean `agentMode`; it cannot directly target custom participant names.
- Selecting a specific custom participant/agent from API is not guaranteed by command args alone; safest pattern is prefixing prompt with explicit mention (`@memory`, `@researcher`, etc.) in `query`/`inputValue`.
- `sendToNewChat` depends on UI focus and existing input; avoid as primary automation entrypoint.
- Some environments may not have chat/Copilot active; command may reject. Keep catch-path fallback.

### Practical guidance for Project Memory
- Build prompt with explicit agent mention plus plan context:
  - `@researcher Workspace ID: ... Plan ID: ... Mission: ...`
- Prefer `isPartialQuery: true` for launch-from-button flows so user can inspect context before send.
- Wrap command execution in try/catch and progressively degrade according to fallback hierarchy above.
- Keep telemetry/log note on which fallback path was used to monitor environment compatibility.
