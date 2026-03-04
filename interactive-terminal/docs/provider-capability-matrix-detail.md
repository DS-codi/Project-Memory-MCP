# Provider Capability Matrix — Detail Reference

> **Companion to:** `provider-capability-matrix.md` (high-level operator reference)
>
> **Purpose:** Machine-readable, implementation-grade specification of every
> provider entrypoint, flag, env-var, and behaviour gap.  Used by Executor when
> implementing steps 27–31.

---

## 1. Entrypoint Matrix

### 1.1 Gemini CLI

| Entrypoint | Command / Invocation | Notes |
|---|---|---|
| **Interactive session (new)** | `gemini` *(no args)* | Opens a full REPL.  Windows: `gemini.cmd`. |
| **Programmatic / piped** | `gemini --prompt "<text>"` | Non-interactive single-turn.  Exits after response. |
| **Session start with initial prompt** | `gemini` — context injected via `GEMINI_CONTEXT_FILE` env var | The Gemini CLI reads the context file path from the env var at startup; the file contains a serialised `ContextPack` JSON. |
| **Session resume / attach** | ❌ Not supported by Gemini CLI in current release | `gemini` has no `--session-id` or `--resume` flag.  Planned workaround: embed session metadata in the context pack and resume semantically.  See §5. |
| **Session list / inspect** | ❌ Not supported | No `gemini sessions list` or similar sub-command exists. |

**Auth:** `GEMINI_API_KEY` and `GOOGLE_API_KEY` env vars.  Never passed as CLI flags.

**Model selection:**

| Mechanism | Details |
|---|---|
| CLI flag | `--model <model-id>` (e.g. `--model gemini-2.5-pro`) |
| Default | Gemini CLI default when `--model` is omitted (currently `gemini-2.0-flash`) |
| Env override | None officially documented; `--model` flag is the canonical path |

---

### 1.2 Copilot CLI (`gh copilot`)

| Entrypoint | Command / Invocation | Notes |
|---|---|---|
| **Interactive session (new)** | `gh copilot suggest --target shell` | Most interactive entrypoint.  Prompts user conversationally. |
| **Programmatic / piped** | `gh copilot suggest --target shell "<question>"` | Positional arg pre-seeds the initial prompt.  Still interactive (asks for confirmation). |
| **Explain mode** | `gh copilot explain "<command>"` | Explains a shell command; separate non-interactive flow. |
| **Session resume / attach** | ❌ Not supported | `gh copilot` has no session concept.  Each invocation is independent. |
| **Session list / inspect** | ❌ Not supported | No session registry. |

**Auth:** `gh auth login` (user-managed OAuth/PAT).  No API key stored by this system.

**Model selection:**

| Mechanism | Details |
|---|---|
| CLI flag | ❌ Not user-selectable.  `gh copilot` uses the model assigned to the user's Copilot subscription. |
| Env override | None documented. |
| Default | Subscription-determined (GitHub-managed). |

---

## 2. Output Format Matrix

### 2.1 Gemini CLI

| Format | Flag / Mechanism | Status |
|---|---|---|
| **Text (default)** | No flag required; REPL outputs formatted text | ✅ Implemented |
| **JSON** | `--output_format json` | ✅ Supported.  Outputs structured JSON response objects. |
| **Stream-JSON** | `--output_format stream-json` | ✅ Supported.  NDJSON stream of response chunks. |
| **Requesting structured output** | Pass `--output_format json` or `--output_format stream-json` at launch | These are launch-time flags added to `args` in `build_gemini_launch()`. |

> **Current state (as of step 25):** `build_gemini_launch()` does not yet add
> `--output_format` to `args`.  Step 28 will add this based on the
> `output_format` field in `LaunchIntent`.

---

### 2.2 Copilot CLI

| Format | Flag / Mechanism | Status |
|---|---|---|
| **Text (default)** | Natural language output in interactive mode | ✅ Available |
| **JSON** | ❌ No `--format json` flag exists on `gh copilot suggest` | ⚠️ Not natively supported |
| **Stream-JSON** | ❌ Not supported | ❌ Not supported |
| **Requesting structured output** | Only workaround: instruct the model via context pack to respond in JSON.  Not guaranteed. | ⚠️ Approximate |

> **Gap:** `output_format = "json"` or `"stream-json"` for Copilot must fall back
> to `"text"` with a warning.  See §5 Gap Analysis.

---

## 3. Approval / Security Controls

### 3.1 Gemini CLI

| Control | Mechanism | Notes |
|---|---|---|
| **GUI approval gate** | Hard gate in `runtime_tasks.rs → requires_gui_approval_hard_gate()` | Cannot be bypassed. Always required for agent launches. |
| **Autonomy mode** | `PM_AGENT_AUTONOMY_MODE` env var set to `"autonomous"` or `"guided"` | Read by the CLI wrapper / logged; does not affect CLI behaviour natively. |
| **Auto-approve flag** | No native `--yes` / `--auto-approve` flag in Gemini CLI | Autonomy is communicated via env var; the CLI itself is always interactive. |
| **Confirmation prompts** | Gemini CLI may ask for confirmation before executing file-system operations | Behaviour is model-dependent; not controllable by launch flags. |
| **Context / instructions injection** | Via `GEMINI_CONTEXT_FILE` (path to `ContextPack` JSON) | System prompt / custom instructions embedded in ContextPack. |
| **API key injection** | `GEMINI_API_KEY` + `GOOGLE_API_KEY` env vars | Loaded from tray settings.  Never printed to terminal or passed as a CLI flag. |

---

### 3.2 Copilot CLI

| Control | Mechanism | Notes |
|---|---|---|
| **GUI approval gate** | Same hard gate as Gemini | Required for all agent launches. |
| **Autonomy mode** | `PM_AGENT_AUTONOMY_MODE` env var | Same env var convention; signal only. |
| **Auto-approve flag** | No native flag | `gh copilot suggest` always prompts for whether to run / copy the suggested command. |
| **Confirmation prompts** | After suggestion, CLI always asks: run / copy / exit? | Cannot be suppressed by launch flags. |
| **Context / instructions injection** | `PM_COPILOT_CONTEXT_FILE` env var + initial prompt positional arg (step notes, truncated to 512 chars) | ContextPack JSON path in env; brief seed in positional arg. |
| **API key / auth** | Via `gh auth login` | System does not store or inject Copilot auth tokens. |

---

## 4. Session Lifecycle Controls

### 4.1 New vs. Resume (Planned — Step 27)

Currently all launches create a new session.  Step 27 will add:

| Field | Gemini | Copilot |
|---|---|---|
| `session_mode = "new"` | Current behaviour (no flag needed) | Current behaviour |
| `session_mode = "resume"` | Embed `session_id` in ContextPack JSON under `session_resume.session_id`; Gemini CLI reads context file.  No native `--resume` CLI flag exists — session continuity depends on the underlying AI model context. | ❌ Not supported.  Copilot has no session concept.  `session_mode = "resume"` for Copilot MUST return an error or downgrade to `"new"` with a warning. |
| `session_id` (resume) | Required when `session_mode = "resume"`.  Passed via ContextPack only. | N/A |

**Session ID entry at approval time:** The approval dialog will accept an optional session ID when `session_mode = "resume"` is requested.  Safe fallback: if no session ID is provided, launch as `"new"`.

---

### 4.2 Current Implementation State of Each Entrypoint Field

| `LaunchIntent` field | Gemini — current code | Copilot — current code |
|---|---|---|
| `provider` | ✅ `build_gemini_launch()` | ✅ `build_copilot_launch()` |
| `autonomy_mode` | ✅ `PM_AGENT_AUTONOMY_MODE` env var | ✅ Same |
| `context_pack_path` | ✅ `GEMINI_CONTEXT_FILE` env var | ✅ `PM_COPILOT_CONTEXT_FILE` env var |
| `step_notes` | Via ContextPack JSON | ✅ Also positional arg (truncated to 512 chars) |
| `requesting_agent` | Via ContextPack JSON + session label | Via ContextPack JSON + session label |
| `plan_id` | Via session label + ContextPack | Via session label + ContextPack |
| `session_mode` | 🔲 Step 27 | 🔲 Step 27 |
| `session_id` | 🔲 Step 27 | ❌ Not applicable |
| `output_format` | 🔲 Step 28 (`--output_format` flag) | 🔲 Step 28 (fallback-only) |
| `model` | 🔲 Step 28 (`--model` flag) | ❌ Not user-selectable |
| `risk_tier` | 🔲 Step 29 | 🔲 Step 29 |
| `trusted_scope_confirmed` | 🔲 Step 29 | 🔲 Step 29 |
| `autonomy_budget` | 🔲 Step 31 | 🔲 Step 31 |

---

## 5. Gap Analysis

| Feature | Gemini | Copilot | Gap Classification | Tracking |
|---|---|---|---|---|
| Session resume (native CLI flag) | Not supported | Not supported | **Planned workaround:** Gemini: embed in ContextPack.  Copilot: error/downgrade. | Step 27 |
| Session list / inspect | Not supported | Not supported | **Not supported** — no CLI sub-command exists for either provider | — |
| Output format: JSON | ✅ `--output_format json` | ❌ No flag | **Copilot: not-supported**, fall back to text with warning | Step 28 |
| Output format: stream-JSON | ✅ `--output_format stream-json` | ❌ No flag | **Copilot: not-supported**, fall back to text with warning | Step 28 |
| Model selection | ✅ `--model` flag | ❌ Not user-selectable | **Copilot: not-supported** — log and ignore `model` field | Step 28 |
| Autonomy auto-approve (native) | ❌ No CLI flag | ❌ No CLI flag | **Both: not-supported** — env var signalling only | — |
| Tier 2 high-risk gate | Planned | Planned | **Planned** | Step 29 |
| Tier 3 critical scope gate | Planned | Planned | **Planned** | Step 30 |
| Autonomy budget enforcement | Planned | Planned | **Planned** | Step 31 |
| Copilot session ID on resume | N/A | Not supported | **Error / downgrade required** | Step 27 |

---

*Last updated: 2026-03-04 by Architect (plan_mm8vq9cg_21e27a6a, step 25)*
