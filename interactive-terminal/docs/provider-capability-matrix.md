# Provider Capability Matrix

Operator reference for supported AI CLI providers, flag mapping policy, risk tiers, trusted-scope rules, and autonomy budget behavior.

---

## 1. Provider Capability Matrix

| Capability | Gemini CLI | Copilot CLI (`gh copilot`) |
|---|---|---|
| Interactive terminal session | ✅ `gemini` interactive mode | ✅ `gh copilot suggest --target shell` |
| Programmatic / non-interactive | ✅ via `--prompt` flag | ✅ suggest/explain flow |
| Resume existing session | 🔲 Not yet implemented (step 27) | 🔲 Not yet implemented (step 27) |
| List sessions | 🔲 Not yet implemented | 🔲 Not yet implemented |
| Model selection | ✅ via `--model` flag | ⚠️ Limited (`gh copilot` model not user-selectable via flag) |
| Structured output (JSON) | ✅ `--output_format json` | ⚠️ Partial (step 28) |
| Context injection | ✅ `GEMINI_CONTEXT_FILE` env var | ✅ `PM_COPILOT_CONTEXT_FILE` env var |
| API key / auth | ✅ `GEMINI_API_KEY` env var (stored in Interactive Terminal settings) | ✅ via `gh auth login` (user-managed; no key stored by this system) |
| Autonomy mode env | ✅ `PM_AGENT_AUTONOMY_MODE` | ✅ `PM_AGENT_AUTONOMY_MODE` |

### Legend

| Symbol | Meaning |
|---|---|
| ✅ | Implemented and available in current release |
| ⚠️ | Partially implemented or provider-limited |
| 🔲 | Not yet implemented; tracked in a future plan step |

---

## 2. Flag Mapping Policy

### How Agents Request Launches

Hub agents request CLI launches by calling `memory_terminal run` with an `agent_launch_meta` field in the request params. The meta includes:

| Field | Description |
|---|---|
| `provider` | Preferred CLI provider (`"gemini"` or `"copilot"`) |
| `step_notes` | Task description / prompt to pre-seed the session |
| `relevant_files` | List of file paths providing context |
| `custom_instructions` | Operator-supplied directives for the AI session |
| `autonomy_mode` | `"autonomous"` or `"guided"` |

### Translation Gate: `build_launch_command()`

Agents do **not** control raw CLI flags. All translation from `agent_launch_meta` to provider CLI invocations goes through the `build_launch_command()` function in `launch_builder.rs`.

**No raw flag or argument passthrough is permitted from agents to the CLI process.** The function maps each field to safe, provider-approved parameters:

| Agent field | Gemini translation | Copilot translation |
|---|---|---|
| `step_notes` | (not passed as arg; available in context pack file) | Passed as positional arg to `gh copilot suggest` (truncated to 512 chars) |
| `relevant_files` + `custom_instructions` + `step_notes` | Serialised to temp JSON → `GEMINI_CONTEXT_FILE` env var | Serialised to temp JSON → `PM_COPILOT_CONTEXT_FILE` env var |
| `autonomy_mode` | `PM_AGENT_AUTONOMY_MODE` env var | `PM_AGENT_AUTONOMY_MODE` env var |
| `provider` | Selects builder; normalised (stripped path/suffix, lowercased) | Same |

### Provider Normalisation

Provider tokens are normalised before dispatch:
- Stripped of path components (`gemini.cmd` → `gemini`)
- Stripped of known suffixes (`.cmd`, `.exe`)
- Lowercased

Unrecognised tokens after normalisation result in a hard error: `"Unknown provider: \"{token}\""`.

---

## 3. Risk Tiers

All agent-requested launches go through the GUI approval gate regardless of tier. Risk tiers describe the additional controls that apply — current and planned.

### Tier 1 — Standard (Current Implementation)

- **Applies to**: All agent-requested CLI launches.
- **Gate**: GUI approval dialog required (hard gate in `requires_gui_approval_hard_gate()`).
- **Bypass**: None. Requests that match the allowlist criteria **and** carry agent launch context are still routed to GUI approval — the allowlist does not bypass this gate.
- **Deny/cancel behavior**: Always fails closed. `ResponseStatus::Declined` is returned; no session is spawned.
- **Audit**: All decisions logged (`launch_requested`, `launch_approved`/`launch_denied`, `launch_started`).

### Tier 2 — High Risk (Planned — Step 29)

- **Applies to**: Requests combining large context scope (many relevant files) **and** `autonomy_mode = autonomous`.
- **Gate**: Additional trusted-scope confirmation dialog (secondary acknowledgement from user).
- **Status**: Not yet implemented. Tracked in step 29 (Phase 4.2).

### Tier 3 — Critical (Planned — Step 30)

- **Applies to**: Sessions requesting working directory full-write access scope.
- **Gate**: Explicit working directory scope acknowledgement gate with write-permission warning.
- **Status**: Not yet implemented. Tracked in step 30 (Phase 4.2).

> **operator note**: Until steps 29–30 are implemented, all agent launches are evaluated at Tier 1 regardless of scope or autonomy mode. No elevated risks are silently accepted.

---

## 4. Autonomy Budget (Pending — Step 31)

Autonomous mode currently runs without budget enforcement.

### Planned Behavior (Step 31)

Autonomous sessions will support configurable budget limits:

| Budget dimension | Description |
|---|---|
| Max commands | Maximum number of commands the session may execute |
| Max duration | Maximum wall-clock time before the session is terminated |
| Max files touched | Maximum number of unique files the session may write |

Once the budget is exhausted, the session will be flagged and the user notified. The session will not be forcibly killed (to preserve AI output), but further commands will be blocked pending user acknowledgement.

**Current status**: No budget is enforced. Autonomous sessions run until the user terminates them manually or the CLI process exits on its own.

---

## 5. Trusted-Scope Rules (Current)

These rules define the invariants that must hold for all agent launch requests in the current implementation. They cannot be overridden by agent configuration, allowlist entries, or settings.

| Rule | Enforcement |
|---|---|
| **All agent launches require GUI approval** | Hard gate in `runtime_tasks.rs → requires_gui_approval_hard_gate()`. Triggered when: request is allowlisted AND command is a provider binary AND context signals agent launch intent. |
| **Deny and cancel always fail closed** | `ResponseStatus::Declined` returned on deny or cancel. No partial state is created. |
| **No raw flag passthrough from agents** | `build_launch_command()` controls all flag/env construction. Agent `agent_launch_meta` fields are mapped to safe translations only. |
| **Provider normalisation enforced** | Unknown/unsupported provider tokens are rejected before the dialog opens. |
| **Audit log captures all decisions** | `launch_requested`, `launch_approved`/`launch_denied`/`launch_cancelled`, `launch_started` events are always written to `{workspace_path}/logs/agent_launch_audit.jsonl`. |
| **API key never passed as CLI flag** | Gemini API key is injected via environment variable only (`GEMINI_API_KEY`, `GOOGLE_API_KEY`). It is never printed to the terminal or included in the visible CLI invocation. |

### Agent Launch Context Detection

The hard gate triggers on requests where the `context` field contains any of the following markers (case-insensitive):

- `agent_cli_launch`
- `super_subagent`
- `launch_kind`
- `launch_type`
- `"intent":"agent` or `"intent": "agent`

Requests that match a provider binary but do not carry these context markers are treated as normal user-initiated terminal commands and are not routed to the agent launch approval flow.

---

## 6. Capability Gaps and Roadmap Summary

| Gap | Tracking | Phase |
|---|---|---|
| Session resume (both providers) | Step 27 | Phase 4.2 |
| Structured JSON output for Copilot | Step 28 | Phase 4.2 |
| Tier 2 high-risk additional confirmation | Step 29 | Phase 4.2 |
| Tier 3 critical scope acknowledgement gate | Step 30 | Phase 4.2 |
| Autonomy budget enforcement | Step 31 | Phase 4.2 |
| Copilot model selection | External (GitHub CLI limitation) | N/A |
