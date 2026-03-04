# Launch Intent Schema — Provider-Agnostic Specification

> **Authoritative spec** for Executor implementing steps 27–31.
>
> **Companion to:** `provider-capability-matrix-detail.md`
>
> Every field in this schema has a deterministic mapping to provider-specific
> flags or env vars.  No agent may pass raw CLI flags.  All field values are
> validated **before** `build_launch_command()` is called.

---

## 1. LaunchIntent Schema

### 1.1 Rust Struct Representation

```rust
/// Provider-agnostic description of a CLI session to start or resume.
///
/// All fields are validated by `validate_launch_intent()` before
/// `build_launch_command()` is called.  See §3 for validation rules.
#[derive(Debug, Clone)]
pub struct LaunchIntent {
    // ── Identity ────────────────────────────────────────────────────────
    /// Normalised provider token.  Must be `"gemini"` or `"copilot"`.
    pub provider: String,

    // ── Session lifecycle ────────────────────────────────────────────────
    /// Whether to start a new session or resume an existing one.
    /// Valid values: `"new"` | `"resume"`.
    pub session_mode: String,

    /// Session ID to resume.  Required when `session_mode == "resume"`.
    /// For Copilot: always `None` — resume is not supported.
    pub session_id: Option<String>,

    // ── Behaviour ───────────────────────────────────────────────────────
    /// Autonomy level requested by the hub agent.
    /// Valid values: `"guided"` | `"autonomous"`.
    /// Empty string is normalised to `"guided"`.
    pub autonomy_mode: String,

    /// Output format requested.
    /// Valid values: `"text"` | `"json"` | `"stream-json"`.
    /// Defaults to `"text"` when not specified.
    pub output_format: String,

    /// Model variant to use at launch time (provider-specific ID string).
    /// Optional.  When `None`, provider CLI default is used.
    /// For Copilot: always ignored (not user-selectable).
    pub model: Option<String>,

    // ── Context ──────────────────────────────────────────────────────────
    /// Filesystem path to the serialised ContextPack JSON temp file.
    /// Written by `write_context_pack_to_tempfile()` before this struct is
    /// constructed.  `None` if no context was provided.
    pub context_pack_path: Option<String>,

    /// Initial prompt / task description passed to the AI session.
    /// For Copilot: truncated to 512 chars and passed as positional arg.
    /// For Gemini: available inside the ContextPack JSON; not a CLI arg.
    pub step_notes: Option<String>,

    // ── Labelling ────────────────────────────────────────────────────────
    /// Hub plan ID, used for session label and ContextPack JSON.
    pub plan_id: Option<String>,

    /// Hub agent type making the request (e.g. `"Executor"`).
    pub requesting_agent: Option<String>,

    // ── Risk and security ────────────────────────────────────────────────
    /// Risk tier assigned by the approval system.
    /// Valid values: `"1"` | `"2"` | `"3"`.
    pub risk_tier: String,

    /// User has explicitly confirmed trusted-scope access.
    /// Required to be `true` when `risk_tier` is `"2"` or `"3"`.
    pub trusted_scope_confirmed: bool,

    // ── Budget ───────────────────────────────────────────────────────────
    /// Optional autonomy budget limits.  Enforced in step 31.
    pub autonomy_budget: Option<AutonomyBudget>,
}

/// Autonomy budget limits for an autonomous session.
#[derive(Debug, Clone)]
pub struct AutonomyBudget {
    /// Maximum number of shell commands the session may execute.
    pub max_commands: Option<u32>,
    /// Maximum wall-clock seconds before session is flagged for review.
    pub max_duration_secs: Option<u64>,
    /// Maximum number of unique files the session may write.
    pub max_files: Option<u32>,
}
```

### 1.2 JSON Pseudo-Schema (for MCP / protocol callers)

```jsonc
{
  "provider": "gemini" | "copilot",              // required
  "session_mode": "new" | "resume",              // required
  "session_id": "<string> | null",               // required when session_mode = "resume"

  "autonomy_mode": "guided" | "autonomous",      // required, default: "guided"
  "output_format": "text" | "json" | "stream-json", // required, default: "text"
  "model": "<string> | null",                    // optional

  "context_pack_path": "<path> | null",          // optional
  "step_notes": "<string> | null",               // optional
  "plan_id": "<string> | null",                  // optional
  "requesting_agent": "<string> | null",         // optional

  "risk_tier": "1" | "2" | "3",                  // required
  "trusted_scope_confirmed": true | false,       // required

  "autonomy_budget": {
    "max_commands": <u32> | null,
    "max_duration_secs": <u64> | null,
    "max_files": <u32> | null
  } | null
}
```

---

## 2. Deterministic Field-to-Flag Mapping

### 2.1 Full Mapping Table

| `LaunchIntent` field | Gemini CLI translation | Copilot CLI translation | Notes |
|---|---|---|---|
| `provider` | Selects `build_gemini_launch()` | Selects `build_copilot_launch()` | Normalised via `normalize_provider_token()` before dispatch |
| `session_mode = "new"` | No flag — default behaviour | No flag — default behaviour | |
| `session_mode = "resume"` | Embed `session_id` in ContextPack JSON under `session_resume.session_id`; no native CLI flag | **Error:** Copilot does not support resume.  Must return `Err("Copilot does not support session resume")` | |
| `session_id` | Passed via ContextPack `session_resume.session_id` key | N/A (always `None`) | |
| `autonomy_mode` | `PM_AGENT_AUTONOMY_MODE` env var = `"autonomous"` or `"guided"` | Same env var | Signal only; does not affect CLI natively |
| `output_format = "text"` | No flag (default) | No flag (default) | |
| `output_format = "json"` | Add `--output_format` `json` to `args` | **Fallback to `"text"`** with warning logged | Gemini supports natively; Copilot does not |
| `output_format = "stream-json"` | Add `--output_format` `stream-json` to `args` | **Fallback to `"text"`** with warning logged | |
| `model` | Add `--model` `<value>` to `args` | **Ignored** with warning logged | Copilot model is not user-selectable |
| `context_pack_path` | `GEMINI_CONTEXT_FILE` env var = path | `PM_COPILOT_CONTEXT_FILE` env var = path | Written before `LaunchIntent` is constructed |
| `step_notes` | Available inside ContextPack JSON only; not a CLI arg | Also passed as positional arg (truncated to 512 chars) | Positional arg position: after `--target shell` |
| `plan_id` | Used in `session_label` + ContextPack | Used in `session_label` + ContextPack | Format: `"Gemini — {agent} — {plan_id}"` |
| `requesting_agent` | Used in `session_label` + ContextPack | Used in `session_label` + ContextPack | |
| `risk_tier` | Consumed by validation gate before builder is called; not passed to CLI | Same | |
| `trusted_scope_confirmed` | Consumed by validation gate; not passed to CLI | Same | |
| `autonomy_budget` | Not yet consumed (step 31) | Not yet consumed (step 31) | Budget will be passed via env vars or ContextPack in step 31 |

### 2.2 Env Var Reference Summary

| Env var | Provider | Value source | Notes |
|---|---|---|---|
| `GEMINI_API_KEY` | Gemini | Tray settings (loaded by `load_gemini_api_key()`) | Never printed to terminal |
| `GOOGLE_API_KEY` | Gemini | Same value as `GEMINI_API_KEY` | Alias required by some Gemini CLI versions |
| `NPM_CONFIG_UPDATE_NOTIFIER` | Gemini | Hardcoded `"false"` | Suppresses npm update noise |
| `PM_AGENT_AUTONOMY_MODE` | Both | `"autonomous"` or `"guided"` | Signal only; not a CLI-enforced flag |
| `GEMINI_CONTEXT_FILE` | Gemini | Path to ContextPack temp JSON | Cleaned up by caller after process starts |
| `PM_COPILOT_CONTEXT_FILE` | Copilot | Path to ContextPack temp JSON | Cleaned up by caller after process starts |

---

## 3. Validation Rules

All rules are enforced by `validate_launch_intent()` **before** `build_launch_command()` is called.  Violations return `Err(String)` describing the violated constraint.  No partial state is written on validation failure.

### 3.1 Required Field Rules

| Rule | Error message |
|---|---|
| `provider` must be `"gemini"` or `"copilot"` | `"Unknown provider: \"{token}\""` |
| `session_mode` must be `"new"` or `"resume"` | `"Invalid session_mode: \"{value}\". Must be \"new\" or \"resume\""` |
| `autonomy_mode` must be `"guided"` or `"autonomous"` (empty → `"guided"` after normalisation) | `"Invalid autonomy_mode: \"{value}\". Must be \"guided\" or \"autonomous\""` |
| `output_format` must be `"text"`, `"json"`, or `"stream-json"` | `"Invalid output_format: \"{value}\". Must be \"text\", \"json\", or \"stream-json\""` |
| `risk_tier` must be `"1"`, `"2"`, or `"3"` | `"Invalid risk_tier: \"{value}\". Must be \"1\", \"2\", or \"3\""` |

### 3.2 Cross-Field Rules

| Rule | Condition | Error / Action |
|---|---|---|
| `session_id` required for resume | `session_mode == "resume"` AND `session_id.is_none()` | `Err("session_id is required when session_mode is \"resume\"")`  — unless safe fallback: downgrade to `"new"` with warning |
| Copilot resume not supported | `provider == "copilot"` AND `session_mode == "resume"` | `Err("Copilot does not support session resume. Use session_mode \"new\" instead")` |
| Trusted scope required for elevated tiers | `risk_tier != "1"` AND `trusted_scope_confirmed == false` | `Err("trusted_scope_confirmed must be true for risk_tier \"2\" or \"3\"")` — REJECT, do not launch |
| Output format downgrade for Copilot JSON | `provider == "copilot"` AND `output_format == "json"` | Downgrade to `"text"`, log warning: `"Copilot does not support JSON output format. Falling back to text."`.  Do NOT error — warn and continue. |
| Output format downgrade for Copilot stream-JSON | `provider == "copilot"` AND `output_format == "stream-json"` | Same as above: downgrade to `"text"`, log warning. |
| Model ignored for Copilot | `provider == "copilot"` AND `model.is_some()` | Log warning: `"model selection is not supported for Copilot; ignoring model field."`.  Do NOT error — warn and continue. |
| Autonomy budget ignored before step 31 | `autonomy_budget.is_some()` | Log info: `"autonomy_budget provided but enforcement is not yet implemented (step 31)."`.  Parse and store; do not error. |
| Autonomy mode conflicts | `autonomy_mode == "autonomous"` AND any guidance-blocking flag exists | Defined case-by-case in step 31 spec.  For now: no conflicts exist at step 25/26. |

### 3.3 Safe Fallback Policy

| Scenario | Strict mode | Lenient mode (default) |
|---|---|---|
| `session_mode = "resume"` with no `session_id` | `Err(...)` | Downgrade to `"new"` + warn |
| `output_format = "json"` for Copilot | `Err(...)` | Downgrade to `"text"` + warn |
| `model` field set for Copilot | `Err(...)` | Ignore + warn |

> **Default mode is lenient for output_format and model.**
> `session_mode = "resume"` with no `session_id` is **always an error** in both modes.

---

## 4. `build_launch_command()` Extension Contract

### 4.1 Current Signature (as implemented)

```rust
pub fn build_launch_command(
    provider: &str,
    context_pack: Option<&ContextPack>,
    autonomy_mode: &str,
    requesting_agent: Option<&str>,
    plan_short_id: Option<&str>,
) -> Result<LaunchCommand, String>
```

### 4.2 Target Signature (post steps 27–28)

The function should be extended to accept a full `LaunchIntent`:

```rust
pub fn build_launch_command(
    intent: &LaunchIntent,
) -> Result<LaunchCommand, String>
```

**Migration path:**
1. Keep the old 5-parameter overload (or a temporary shim) to avoid breaking callers until step 28 is complete.
2. Add `build_launch_command_from_intent(intent: &LaunchIntent)` as the new entry point.
3. Existing callers in `cxxqt_bridge/invokables.rs` (the `approve_command` handler) migrate to pass `LaunchIntent` in step 28.
4. Old overload is removed once all callers are migrated.

### 4.3 Fields Added to `build_gemini_launch()` (step 27–28 scope)

| New parameter / source | Added in step | CLI effect |
|---|---|---|
| `session_mode: &str` | Step 27 | `"resume"`: injects `session_id` into ContextPack JSON under `session_resume` key |
| `session_id: Option<&str>` | Step 27 | Passed via ContextPack only; no CLI flag |
| `output_format: &str` | Step 28 | `"json"` → `--output_format json`; `"stream-json"` → `--output_format stream-json`; `"text"` → no flag |
| `model: Option<&str>` | Step 28 | `Some(m)` → `--model {m}`; `None` → no flag |

### 4.4 Fields Added to `build_copilot_launch()` (step 27–28 scope)

| New parameter / source | Added in step | CLI effect |
|---|---|---|
| `session_mode: &str` | Step 27 | `"resume"` → `Err(...)` immediately (Copilot does not support resume) |
| `output_format: &str` | Step 28 | Logged warning only; no CLI flag added (unsupported) |
| `model: Option<&str>` | Step 28 | Logged warning only; field ignored (unsupported) |

---

## 5. `validate_launch_intent()` Contract

To be added to `launch_builder.rs` (step 27):

```rust
/// Validate all fields of a `LaunchIntent` before passing to `build_launch_command_from_intent`.
///
/// Returns the (potentially mutated/normalised) intent on success,
/// or a descriptive error string on failure.
///
/// Lenient downgrades (output_format, model) are applied in-place and
/// warnings are written to the audit log.
pub fn validate_launch_intent(
    intent: LaunchIntent,
) -> Result<LaunchIntent, String>
```

**Entry point chain:**

```
caller (invokables.rs: approve_command)
  └─ validate_launch_intent(intent)
       └─ build_launch_command_from_intent(&validated_intent)
            └─ build_gemini_launch(&intent) | build_copilot_launch(&intent)
```

---

## 6. AutonomyBudget Env Var Mapping (Planned — Step 31)

These mappings are speculative until step 31 is implemented.  Recorded here for
Executor reference.

| Budget field | Env var | Type | Notes |
|---|---|---|---|
| `max_commands` | `PM_BUDGET_MAX_COMMANDS` | `u32` as decimal string | `"0"` = unlimited |
| `max_duration_secs` | `PM_BUDGET_MAX_DURATION_SECS` | `u64` as decimal string | `"0"` = unlimited |
| `max_files` | `PM_BUDGET_MAX_FILES` | `u32` as decimal string | `"0"` = unlimited |

Enforcement will be in the PTY session monitor, not in the launch builder.
The launch builder only injects the env vars; the session monitor reads them.

---

## 7. ContextPack Extensions for Session Resume (Step 27)

The existing `ContextPack` struct (in `protocol.rs`) may need a new optional field:

```rust
// Proposed addition to ContextPack (step 27):
pub session_resume: Option<SessionResumeHint>,

pub struct SessionResumeHint {
    pub session_id: String,
    pub provider: String,
    pub requested_at: String, // ISO 8601
}
```

Gemini CLI reads the context file.  If `session_resume` is present, the model
can attempt to continue from the referenced session (subject to its own context
retention limits).

**Copilot:** `session_resume` is omitted from the ContextPack for Copilot
launches — the field has no meaning for a stateless CLI.

---

*Last updated: 2026-03-04 by Architect (plan_mm8vq9cg_21e27a6a, step 26)*
