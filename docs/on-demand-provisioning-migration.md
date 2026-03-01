# On-Demand Provisioning Migration Guide

This runbook documents how to move from always-on instruction/skill provisioning to on-demand provisioning with strict bundle resolution.

## Ownership Model

- PromptAnalyst owns Hub skill-bundle selection based on request categorization.
- Hub agents own spoke bundle composition from the selected Hub bundle.
- Spokes consume only the scoped bundle provided by the Hub and do not perform ambient bundle expansion.

## Toggle Matrix

Use these exact fields when configuring migration posture:

| Field | Default (target) | Purpose |
|---|---|---|
| `provisioning_mode` | `on_demand` | Selects on-demand provisioning as runtime model. |
| `strict_bundle_resolution` | `true` | Enforces explicit bundle resolution, no implicit broad loading. |
| `allow_legacy_always_on` | `false` | Blocks old always-on provisioning behavior. |
| `allow_ambient_instruction_scan` | `false` | Disables ambient instruction scanning outside resolved bundles. |
| `allow_include_skills_all` | `false` | Disables broad include-all skills behavior. |
| `fallback_policy.fallback_allowed` | `false` | Disables fallback by default in strict mode. |
| `fallback_policy.fallback_mode` | `none` | No fallback mode during default strict operation. |
| `fallback_policy.fallback_reason_code` | `""` | Empty unless fallback is explicitly enabled. |

## Rollout Profiles

### 1) Default (on_demand strict)

Use for normal operations and as the steady-state posture:

```json
{
  "provisioning_mode": "on_demand",
  "strict_bundle_resolution": true,
  "allow_legacy_always_on": false,
  "allow_ambient_instruction_scan": false,
  "allow_include_skills_all": false,
  "fallback_policy": {
    "fallback_allowed": false,
    "fallback_mode": "none",
    "fallback_reason_code": ""
  }
}
```

### 2) Temporary compatibility profile

Use only for controlled transition windows when a dependency still expects older behavior:

```json
{
  "provisioning_mode": "on_demand",
  "strict_bundle_resolution": false,
  "allow_legacy_always_on": true,
  "allow_ambient_instruction_scan": true,
  "allow_include_skills_all": true,
  "fallback_policy": {
    "fallback_allowed": true,
    "fallback_mode": "compat",
    "fallback_reason_code": "temporary_compat_window"
  }
}
```

### 3) Emergency static_restore guidance

Use only for incident response, shortest possible duration, then return to default strict:

```json
{
  "provisioning_mode": "always_on",
  "strict_bundle_resolution": false,
  "allow_legacy_always_on": true,
  "allow_ambient_instruction_scan": true,
  "allow_include_skills_all": true,
  "fallback_policy": {
    "fallback_allowed": true,
    "fallback_mode": "static_restore",
    "fallback_reason_code": "incident_restore"
  }
}
```

Operational guardrails for emergency use:
- Record incident start/end timestamps and operator owner.
- Keep `fallback_policy.fallback_reason_code` populated while fallback is active.
- Revert to default profile immediately after service stabilization and verification.

## Developer Request-Shape Notes

### `deploy_and_prep`

- Provide explicit `workspace_id`, `plan_id`, and `agent_name`.
- Provide a task-scoped `prompt` that reflects the selected workflow.
- Use `phase_name` and `step_indices` for deterministic plan alignment.
- Keep bundle context scoped via `include_skills`, `include_research`, and `include_architecture` only as needed.
- Preserve scope controls in `prep_config.scope_boundaries` (`files_allowed`, `directories_allowed`).

### `deploy_for_task`

- Use when preparing task-scoped deployment artifacts for a specific phase/step set.
- Provide `workspace_id`, `plan_id`, `phase_name`, and `step_indices`.
- Keep `include_research` / `include_architecture` minimal and request-driven.
- Do not use this path to reintroduce ambient loading behavior.

## Verification Checklist (Completed Gate)

Run:

```powershell
.\run-tests.ps1 -Component Server -TestArg 'Server=src/__tests__/tools/memory-session-routing.test.ts src/__tests__/tools/memory-agent-deploy-context-validation.test.ts src/__tests__/tools/hub-parity-scenarios.test.ts'
```

Expected:
- `3/3` files pass
- `32/32` tests pass

## Rollback and Exit Criteria

If rollback is required:
1. Move to temporary compatibility profile first when possible.
2. Escalate to emergency `static_restore` only for active incidents.
3. Record `fallback_policy.fallback_reason_code` and owning operator.

Exit criteria to return to default on-demand posture:
- Incident or compatibility dependency is resolved.
- Verification checklist passes (`3/3` files, `32/32` tests).
- Runtime toggles are restored to the default strict profile.
- No active need remains for `allow_legacy_always_on`, ambient scan, or include-all skills.
