---
plan_id: plan_mlmqj8ns_338b580a
created_at: 2026-02-14T19:58:53.279Z
sanitized: false
injection_attempts: 0
warnings: 1
---

# Replay Input Inventory and Baseline Scenario Suite

Date: 2026-02-15
Plan: plan_mlmqj8ns_338b580a
Scope scanned: `server/`, `vscode-extension/`, `docs/`, `data/logs/`, `agent_use-logDumps.txt`, `prompts/`, `instructions/`

## 1) High-value replay sources discovered

### A. Real runtime traces (highest replay value)
- `data/logs/2026-02-14.log`
  - Dense sequence of real MCP tool calls and outcomes.
  - Includes success/error transitions for `memory_steps`, `memory_plan(confirm)`, `memory_agent(handoff/complete)`, spawn payload errors, context schema errors.
  - Strong source for temporal replay + expected error signatures.
- `data/logs/process-audit.log`
  - Structured infra lifecycle events (`server_connected_container`, `container_disconnected`, health booleans).
  - Good for adapter availability/recovery scenarios.
- `data/logs/server-manager.log`
  - Detailed server/container fallback behavior; includes local spawn fallback and event transitions.
- `data/logs/dashboard-errors.log`
  - Captures UI runtime failures (e.g., `TypeError: r.find is not a function`) to seed negative regression checks.

### B. Workflow / transcript-like intent sources
- `agent_use-logDumps.txt`
  - Explicit examples of handoff + complete payloads, including validation mismatch notes.
- `docs/promptfrom12-02-2026.txt`
  - Real high-level user request converted into a plan mission; useful for “large-scope planning request” replay intent.

### C. Deterministic tool-behavior specifications via tests
- `server/src/__tests__/tools/terminal-filesystem-e2e.test.ts`
  - End-to-end assertions for terminal authorization + filesystem guardrails.
- `server/src/__tests__/tools/terminal-auth.test.ts`
  - Allowlist/destructive/shell-operator decision matrix.
- `server/src/__tests__/tools/filesystem-safety.test.ts`
  - Path traversal, sensitive path blocks, limits (`MAX_READ_BYTES`, etc.).
- `server/src/__tests__/tools/interactive-terminal.test.ts`
  - Distinguishes `memory_terminal_interactive` behavior from strict `memory_terminal`; canonical alias mapping checks.
- `vscode-extension/src/test/chat/ChatPlanCommands.test.ts`
  - Chat command parsing and expected MCP tool call shape for plan/script flows.
- `vscode-extension/src/test/chat/McpBridge.test.ts`
  - Bridge preconditions, endpoint routing (`/api/plans/{workspace}/template`), connection errors.

### D. Contract and operational expectations
- `vscode-extension/src/chat/HEADLESS_TERMINAL_CONTRACT.md`
- `docs/interactive-terminal-contract-unification-design.md`
- `docs/interactive-terminal-operator-troubleshooting.md`
- `instructions/mcp-workflow-examples.instructions.md`
- `docs/manual-testing-checklist.md`

These define expected payload structure, alias mapping, deterministic error taxonomy, and handoff lifecycle patterns.

---

## 2) Baseline replay scenario suite (10 scenarios)

| scenario_id | source artifact(s) | user intent summary | expected tool behavior focus | expected success signature |
|---|---|---|---|---|
| SCN_TERM_ALLOWLIST_ALLOWED | `server/src/__tests__/tools/terminal-filesystem-e2e.test.ts`, `server/src/__tests__/tools/terminal-auth.test.ts` | Run safe command (`echo`/`git status`) | `memory_terminal` allowlist authorization | Result success with `authorization=allowed`, non-empty `session_id`, output contains expected token |
| SCN_TERM_DESTRUCTIVE_BLOCK | same as above | Run destructive command (`rm -rf /`, `Remove-Item`) | destructive-command hard block | Result failure, error/reason contains `blocked` + `destructive`; no execution session created |
| SCN_TERM_UNLISTED_BLOCKED | `server/src/__tests__/tools/terminal-filesystem-e2e.test.ts` | Run non-allowlisted command (`curl ...`) | strict allowlist block semantics | Result failure with `authorization=blocked`, empty `session_id`, `allowlist_suggestion` present |
| SCN_ITERM_WARN_NOT_BLOCK_NONALLOWLIST | `server/src/__tests__/tools/interactive-terminal.test.ts` | Run non-allowlisted command interactively | `memory_terminal_interactive` relaxed semantics | Result success with `authorization=allowed_with_warning`; warning mentions allowlist |
| SCN_ITERM_BLOCK_DESTRUCTIVE | `server/src/__tests__/tools/interactive-terminal.test.ts` | Run destructive interactive command | interactive destructive block parity | Result failure with `authorization=blocked`; reason includes destructive keyword |
| SCN_FS_TRAVERSAL_REJECT | `server/src/__tests__/tools/terminal-filesystem-e2e.test.ts`, `server/src/__tests__/tools/filesystem-safety.test.ts` | Read/write outside workspace (`../../../etc/passwd`) | filesystem boundary enforcement | Result failure with message matching `escapes workspace` or `traversal` |
| SCN_FS_SENSITIVE_PATH_REJECT | same as above | Access `.env` / key material | sensitive path protections | Result failure containing `sensitive`; no read/write performed |
| SCN_CONFIRMATION_GATE_FLOW | `data/logs/2026-02-14.log` | Progress blocked by confirmation-gated step/phase | step/phase confirmation sequencing | Replay shows initial `memory_steps` update error requiring confirm, then `memory_plan(confirm)` success, then subsequent `memory_steps` success |
| SCN_HANDOFF_THEN_COMPLETE_ORDER | `data/logs/2026-02-14.log`, `agent_use-logDumps.txt`, `instructions/mcp-workflow-examples.instructions.md` | Complete agent phase and hand back control | lifecycle contract: handoff precedes complete, coordinator-centric routing | Trace contains `memory_agent(handoff)` before `memory_agent(complete)` and handoff target/recommendation is coordinator-centric |
| SCN_SCHEMA_VALIDATION_ERRORS | `data/logs/2026-02-14.log` | Call tools with malformed payloads (missing required fields) | deterministic validation failures | Expected explicit errors like `agent_name is required` and `type and data are required`; corrected follow-up call succeeds |

---

## 3) Minimal seed dataset recommendation for future harness

### Suggested folder structure
- `harness/seeds/replay/`
  - `raw/` (small copied snippets)
  - `scenarios/` (scenario metadata)

### Minimal files to commit (seed set)
1. `harness/seeds/replay/raw/log-2026-02-14-confirmation-and-handoff.ndjson`  
   - Curated subset from `data/logs/2026-02-14.log` covering:
   - confirmation gate errors + confirm + retry success
   - handoff then complete ordering
   - payload validation errors (`agent_name`, `type+data` required)
2. `harness/seeds/replay/raw/log-process-audit-connection-cycles.ndjson`  
   - Curated subset from `data/logs/process-audit.log` (connect/disconnect flaps + healthy reconnect)
3. `harness/seeds/replay/raw/log-server-manager-fallback.ndjson`  
   - Curated subset from `data/logs/server-manager.log` showing container unavailable -> local server fallback.
4. `harness/seeds/replay/raw/log-dashboard-errors-sample.jsonl`  
   - entries from `data/logs/dashboard-errors.log` for negative UI-regression signatures.
5. `harness/seeds/replay/raw/agent-handoff-sample.jsonl`  
   - excerpt from `agent_use-logDumps.txt` showing handoff/complete payloads.
6. `harness/seeds/replay/scenarios/baseline-scenarios.v1.json`  
   - 10 scenario definitions above (stable IDs + expected signatures).
7. `harness/seeds/replay/scenarios/source-map.md`  
   - maps each scenario to canonical repo artifact and extraction line ranges.

Rationale: these 7 files are enough to exercise safety, lifecycle sequencing, schema validation, and infra availability without committing large/full logs.

---

## 4) Recommendations for Architect constraints (for next phase)

1. **Canonical scenario schema first**
   - Require fields: `scenario_id`, `intent`, `source_refs[]`, `driver`, `steps[]`, `expected_signatures[]`, `severity`, `determinism_level`.
2. **Deterministic assertions over verbose text**
   - Assertions should prioritize machine-checkable keys (`authorization`, `error.code`, presence/order of tool actions) over full freeform output text.
3. **Order-sensitive trace checks**
   - Include sequence assertions for critical flows (e.g., `handoff` before `complete`; `confirm` before gated `steps.update`).
4. **Dual terminal-surface coverage**
   - Separate scenario classes for strict `memory_terminal` and relaxed `memory_terminal_interactive` to avoid false positives.
5. **Replay adapters must support partial-log fixtures**
   - Design parser for line-level slices/ndjson subsets; do not require full historical logs.
6. **Negative-path parity gates**
   - Treat expected validation failures as pass conditions when error signatures match known contract messages/codes.
7. **Contract-version tagging**
   - Each scenario should record expected contract version (e.g., alias mapping era) to prevent brittle failures during intentional contract evolution.

## 5) Risk notes for harness design
- Raw logs include high variability across plans; scenario extraction should normalize IDs/timestamps before diff.
- Some assertions in tests are semantic, while logs are operational; harness should support both “spec fixtures” and “historical traces”.
- Keep seed artifacts curated and small; large uncontrolled logs increase nondeterministic drift noise.
