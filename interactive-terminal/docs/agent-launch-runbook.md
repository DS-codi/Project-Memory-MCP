# Agent Launch Runbook

Operator and developer reference for the super-subagent CLI launch system in Project Memory Interactive Terminal.

---

## 1. Overview

The Interactive Terminal acts as a **GUI approval gate** for AI agent–requested CLI launches.

When a hub agent (e.g. Coordinator, Runner) calls `memory_terminal run` with `agent_launch_meta` in its params, the server detects the launch intent and routes it to the Interactive Terminal as a **hard-gated** approval request — it is never auto-executed, regardless of the allowlist.

The user sees an approval dialog that shows:
- Which agent is requesting the launch
- Step notes / task description from the context pack
- Relevant files listed in the context pack
- Custom instructions (if provided)
- Provider selection (Gemini / Copilot)
- Autonomy mode selection (if enabled)

On **Approve**, the session is launched in a dedicated tagged terminal tab and the launch lifecycle is written to the audit log. On **Deny**, the request is declined with a reason returned to the requesting agent.

**Context-pack injection** passes task context (step notes, relevant files, custom instructions) to the launched CLI process via environment variables, ensuring the AI session starts with full plan context.

**Audit logging** records every lifecycle event (requested → approved/denied → started) to a JSONL file for operator review.

---

## 2. Settings

Settings are configured via the Interactive Terminal tray icon → **Settings**, or the settings panel within the app.

### `preferred_cli` (a.k.a. `preferredCliProvider`)

- **Type**: string  
- **Default**: `""` (empty — manual selection required)  
- **Description**: Sets the default CLI provider to pre-select when an approval dialog opens. If empty, the user must choose a provider in every dialog.
- **Accepted values**: `"gemini"`, `"copilot"`, or empty string for no default.
- **How to configure**: Open Settings → "Preferred CLI Provider" → enter `gemini` or `copilot`.

### `show_provider_chooser` (a.k.a. `approvalProviderChooserEnabled`)

- **Type**: bool  
- **Default**: `true`  
- **Description**: Controls whether the approval dialog shows the provider dropdown. When `false`, the provider dropdown is hidden and only the `preferred_cli` value is used. If no `preferred_cli` is set and this is `false`, launches will fail.
- **How to configure**: Open Settings → "Show Provider Chooser in Approval Dialog" toggle.

### `show_autonomy_mode_selector` (a.k.a. `autonomyModeSelectorVisible`)

- **Type**: bool  
- **Default**: `true`  
- **Description**: Controls whether the autonomy mode selector (autonomous vs guided) appears in the approval dialog. When `false`, launches proceed without an explicit autonomy mode selection.
- **How to configure**: Open Settings → "Show Autonomy Mode Selector" toggle.

### `gemini_api_key`

- **Type**: string (stored securely in tray settings)  
- **Default**: none  
- **Description**: Stored Gemini API key injected as `GEMINI_API_KEY` and `GOOGLE_API_KEY` environment variables at launch time. Never passed as a CLI flag.
- **How to configure**: Open Settings → "Gemini API Key" field.

---

## 3. Approval Behavior

### Request Flow

```
Hub agent calls memory_terminal run with agent_launch_meta
         ↓
MCP server assembles context pack and issues command request
         ↓
Interactive Terminal detects agent launch context (hard gate)
         ↓
Enqueues as pending approval (NOT auto-executed, even if allowlisted)
         ↓
Emits audit event: launch_requested
         ↓
Approval dialog appears for the user
```

### Approval Dialog Contents

| Field | Source |
|---|---|
| Requesting agent | `context_pack.requesting_agent` |
| Step notes / task | `context_pack.step_notes` |
| Relevant files | `context_pack.relevant_files[]` |
| Custom instructions | `context_pack.custom_instructions` |
| Provider dropdown | Settings `preferred_cli` (pre-selected if set) |
| Autonomy mode selector | Visible if `show_autonomy_mode_selector = true` |

### Provider Selection

- If `preferred_cli` is set and `show_provider_chooser` is `true`: dropdown is pre-selected with the preferred value; user may override.
- If `preferred_cli` is set and `show_provider_chooser` is `false`: no dropdown shown; preferred value used automatically.
- If `preferred_cli` is empty: user must select a provider. Approval without a selection is prevented.

### Autonomy Mode

When the autonomy mode selector is visible:
- **Autonomous** — the launched CLI session is expected to run with minimal user interruption; `PM_AGENT_AUTONOMY_MODE=autonomous` is injected into the process environment.
- **Guided** — the user expects to guide the session interactively; `PM_AGENT_AUTONOMY_MODE=guided` is injected.

### Approve Path

1. User selects provider (if required) and autonomy mode (if shown), then clicks Approve.
2. `approve_command(id, autonomy_mode)` is called on the bridge.
3. Launch builder constructs the provider command with context-pack env vars injected (`build_launch_command()`).
4. Session is started in a dedicated tagged tab; `agentSessionLaunched` signal is emitted.
5. Audit events written: `launch_approved` → `launch_started`.

### Deny Path

1. User clicks Deny (optionally providing a reason).
2. `decline_command(id, reason)` is called on the bridge.
3. `ResponseStatus::Declined` is returned to the requesting agent.
4. Audit event written: `launch_denied` with reason.

---

## 4. Provider Flags

Context is injected via environment variables — no raw flag passthrough from agents. All translation goes through `build_launch_command()`.

### Gemini CLI

| Variable | Value |
|---|---|
| `GEMINI_API_KEY` | Stored API key from settings |
| `GOOGLE_API_KEY` | Same as `GEMINI_API_KEY` |
| `GEMINI_CONTEXT_FILE` | Path to temp JSON file containing the serialised context pack |
| `PM_AGENT_AUTONOMY_MODE` | `autonomous` or `guided` (when set) |
| `NPM_CONFIG_UPDATE_NOTIFIER` | `false` (suppresses npm update noise) |

**Binary**: `gemini.cmd` (Windows) / `gemini` (other platforms)  
**Session label pattern**: `Gemini — {agent} — {plan_short_id}`

### Copilot CLI (`gh copilot suggest`)

| Variable or Arg | Value |
|---|---|
| CLI args | `gh copilot suggest --target shell [{step_notes, truncated to 512 chars}]` |
| `PM_COPILOT_CONTEXT_FILE` | Path to temp JSON file containing the serialised context pack |
| `PM_AGENT_AUTONOMY_MODE` | `autonomous` or `guided` (when set) |

**Binary**: `gh` (from PATH — requires `gh auth login` pre-authentication)  
**Session label pattern**: `Copilot — {agent} — {plan_short_id}`

### Temp File Lifecycle

Context pack temp files are written before launch and scheduled for deletion after the process has started. They are stored in the system temp directory. If the launch fails, deletion may not occur — operators can clean up `%TEMP%\pm_context_*.json` files manually if needed.

---

## 5. Audit Log

### Location

```
{workspace_path}/logs/agent_launch_audit.jsonl
```

The `logs/` directory is created automatically if it does not exist.

### Format

One JSON object per line (JSONL). Each entry contains:

| Field | Type | Description |
|---|---|---|
| `timestamp` | string | ISO-8601 UTC timestamp (e.g. `2026-03-04T12:00:00Z`) |
| `event` | string | Lifecycle event (see below) |
| `provider` | string? | Normalised provider token (`gemini` or `copilot`) |
| `autonomy_mode` | string? | Autonomy mode selected by the user |
| `requesting_agent` | string? | Agent type that requested the launch (e.g. `Executor`) |
| `plan_id` | string? | Plan ID from the context pack |
| `session_id` | string? | Session ID from the context pack |
| `context_pack_summary.has_step_notes` | bool? | Whether step notes were present |
| `context_pack_summary.file_count` | number? | Number of relevant files in the context pack |
| `context_pack_summary.has_custom_instructions` | bool? | Whether custom instructions were present |
| `terminal_session_id` | string? | Terminal session ID (available after `launch_started`) |
| `risk_tier` | string? | Risk tier inferred from the request |
| `reason` | string? | Human-readable denial/cancellation reason |

### Lifecycle Events

| Event | When emitted |
|---|---|
| `launch_requested` | Agent request arrives and is queued for GUI approval |
| `launch_approved` | User clicks Approve in the dialog |
| `launch_started` | CLI process has been successfully started in a terminal tab |
| `launch_denied` | User clicks Deny in the dialog |
| `launch_cancelled` | Request is cancelled (e.g. dialog was dismissed, terminal closed) |

### Example Entry

```json
{"timestamp":"2026-03-04T12:00:00Z","event":"launch_approved","provider":"gemini","autonomy_mode":"autonomous","requesting_agent":"Executor","plan_id":"plan_abc123","session_id":"sess_xyz","context_pack_summary":{"has_step_notes":true,"file_count":3,"has_custom_instructions":false}}
```

---

## 6. Troubleshooting

### "Approval dialog never appears"

- **Check**: Is the Interactive Terminal running? It must be connected (status indicator green) to receive requests from the MCP server.
- **Check**: Is the terminal connected to the correct workspace? The workspace path shown in the header must match the workspace the MCP server is serving.
- **Check**: Inspect `logs/agent_launch_audit.jsonl` — if `launch_requested` entries exist, the request reached the terminal but the dialog may have been dismissed or is hidden behind another window.

### "Launch fails after approval"

- **Check Gemini**: Run `gemini --version` in a terminal. If not found, install the Gemini CLI (`npm install -g @google/gemini-cli` or similar).
- **Check Copilot**: Run `gh copilot --version` in a terminal. If not found, install the GitHub CLI (`winget install GitHub.cli`) and authenticate with `gh auth login`.
- **Check API key**: For Gemini, verify the API key is set in Settings and that `gemini_key_present` shows `true` in the status bar.
- **Check audit log**: A `launch_approved` entry without a subsequent `launch_started` entry indicates the launch builder or process spawn failed. Check stderr output in the terminal.

### "Always shows manual provider selection even after setting a default"

- Verify `preferred_cli` is set to exactly `gemini` or `copilot` (lowercase, no path, no `.cmd` suffix) in Settings.
- If `show_provider_chooser` is `false` and `preferred_cli` is empty, launches will always fail — set a preferred CLI to resolve this.

### "Audit log not found"

- Confirm the workspace path is correctly configured in the Interactive Terminal settings.
- Check that the `logs/` directory exists at `{workspace_path}/logs/` and that the process has write permission.
- The audit log is created on the first launch event — if no launches have been attempted, the file does not yet exist.

### "Context pack file not cleaned up"

- Temp files (`pm_context_*.json`) in the system temp directory (`%TEMP%` on Windows) are normally deleted a few seconds after the process starts. If the process failed to start, clean up manually.
