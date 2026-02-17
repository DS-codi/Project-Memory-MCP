---
plan_id: plan_mlov60n5_21207af6
created_at: 2026-02-16T07:48:01.500Z
sanitized: false
injection_attempts: 0
warnings: 1
---

## MCP Terminal Tool Consolidation — Research Findings (2026-02-16)

### 1) Current split contracts: overlap and gaps

- `memory_terminal` (server) is strict/headless with actions: `run`, `read_output`, `kill`, `get_allowlist`, `update_allowlist`.
  - Source: `server/src/tools/consolidated/memory_terminal.ts`, `server/src/tools/terminal-auth.ts`, `server/src/index.ts`.
- `memory_terminal_interactive` is canonical contract with actions: `execute`, `read_output`, `terminate`, `list` (+ legacy aliases).
  - Source: `server/src/tools/consolidated/memory_terminal_interactive.ts`, `server/src/tools/interactive-terminal-contract.ts`, `server/src/index.ts`.
- Overlap today:
  - Both can execute commands and share session/read/kill semantics through shared session store (`terminal.tools.ts`).
  - `memory_terminal_interactive` also supports headless mode (`invocation.mode=headless`) routed to strict authorization path.
- Primary gap:
  - Allowlist management (`get_allowlist` / `update_allowlist`) exists only on `memory_terminal`.
  - Extension visible-terminal workflow still fetches allowlist via `memory_terminal` (`vscode-extension/src/chat/tools/terminal-tool.ts`).
- Contract drift / mismatch observed:
  - `server/src/tools/consolidated/index.ts` comments still describe interactive actions as `run/read_output/kill/list`, while canonical server contract uses `execute/read_output/terminate/list` + legacy aliases.
  - Some policy docs describe `memory_terminal_interactive` as visible-host terminal in places, while canonical docs now position it as MCP orchestration contract.

### 2) Migration risks for deprecating `memory_terminal`

- **High risk — allowlist API loss:** deprecating/removing `memory_terminal` without relocating allowlist actions breaks:
  - MCP callers that administer workspace allowlists,
  - extension allowlist lookup path (`fetchAllowlist` uses `memory_terminal`),
  - automation that depends on strict `run` semantics.
- **High risk — registration/schema breakage:** both server and extension still register `memory_terminal` tool schema (`server/src/index.ts`, `vscode-extension/package.json`).
- **High risk — test/replay ecosystem coupling:** replay matrix and baseline scenarios explicitly include `memory_terminal` as an execution surface (`vscode-extension/src/test/replay/**`, `replay-harness-core.test.ts`).
- **Medium risk — instruction/prompt behavior drift:** many instruction files still present split-surface guidance; deprecating one tool without synchronized docs causes agent/tool-selection confusion.
- **Medium risk — legacy action compatibility expectations:** callers may still emit `run/kill` semantics; migration must preserve compatibility mapping and deterministic error payloads.

### 3) Headless-mode allowlist/security constraints

- Strict headless authorization path uses `authorizeCommand()` from `terminal-auth.ts`:
  - blocks destructive keywords,
  - blocks shell operators,
  - blocks commands not matching allowlist prefixes.
- Allowlist data model:
  - per-workspace persisted file: `data/{workspace_id}/terminal-allowlist.json`,
  - default baked-in allowlist patterns in `terminal-auth.ts`.
- Canonical interactive tool still supports strict headless execution:
  - in `executeCanonicalInteractiveRequest()`, `invocation.mode=headless` routes to `handleHeadlessTerminalRun()`.
- Payload/contract constraints:
  - default mode becomes `headless` when omitted in parser,
  - headless execute rejects `target.terminal_id` (`interactive-terminal-contract.ts`).

### 4) GUI settings/preferences touchpoints for configurable headless subset

- Existing Rust+QML UI touchpoints that can host headless-policy preferences:
  - Session runtime controls in `interactive-terminal/qml/main.qml` (`currentTerminalProfile`, `currentWorkspacePath`, `currentVenvPath`, `currentActivateVenv`).
  - Saved Commands drawer is already workspace-scoped (`workspace_id`) and persisted via repository.
  - CxxQt invokables/properties in `interactive-terminal/src/cxxqt_bridge/ffi.rs` and `invokables.rs` expose session/workspace command UX.
- Current gap:
  - No explicit GUI property/invokable for headless allowlist subset or policy profile.
  - Allowlist persistence currently lives server-side (`terminal-auth.ts`) only.
- Design implication:
  - If GUI must configure headless subset, add a workspace-scoped settings model in Rust+QML and bridge to server allowlist CRUD (or shared config file with clear ownership/locking).

### 5) Documentation/instruction files that should be updated

Priority docs/instructions to align during consolidation:

1. `instructions/mcp-usage.instructions.md` (tool table, authorization model, surface matrix, gateway routing notes).
2. `instructions/coordinator-operations.instructions.md` (terminal policy cross-link wording).
3. `instructions/analyst-operations.instructions.md` (currently labels interactive as visible host terminal).
4. `instructions/runner-operations.instructions.md` (same terminal-surface wording drift).
5. `interactive-terminal/README.md` (currently describes split including `memory_terminal`; needs unified-tool language).
6. `interactive-terminal/docs/runtime-ports-and-mcp-modes.md` (surface section and adapter-mode wording).
7. `vscode-extension/src/chat/HEADLESS_TERMINAL_CONTRACT.md` (headless contract source should reference unified tool contract).
8. `vscode-extension/package.json` tool declarations (`memory_terminal`, `memory_terminal_interactive`) for migration/deprecation messaging.

Secondary technical-comment cleanup:

- `server/src/tools/consolidated/index.ts` comments (interactive action names outdated).
- Any comments/tests in `server/src/tools/**` and `vscode-extension/src/test/replay/**` that still codify split-surface assumptions.

### Suggested migration guardrails (for Architect)

- Introduce unified tool with explicit `runtime.mode=headless|interactive` while preserving legacy aliases/tool name compatibility for at least one transition phase.
- Move/alias allowlist actions into unified tool before hard-deprecating `memory_terminal`.
- Keep deterministic error/fallback codes (`PM_TERM_*`) stable to avoid replay/test regressions.
- Update replay harness axis model from dual-surface assumptions to unified-mode assumptions with compatibility layer tests.
