# Interactive Terminal Operator Troubleshooting

Date: 2026-02-15  
Plan: `plan_mllgocd5_95a81ffe`

This guide is for operators validating `memory_terminal_interactive` behavior under the canonical contract.

## Scope

Covers expected outputs for:

- GUI missing / unavailable
- Container bridge unavailable
- Protocol timeout
- Interactive decline flow

## Canonical Failure Shape

All failures should return a deterministic payload with this shape:

```json
{
  "success": false,
  "action": "execute | read_output | terminate | list",
  "status": "failed",
  "correlation": {
    "request_id": "req_...",
    "trace_id": "trace_..."
  },
  "resolved": {
    "canonical_action": "execute",
    "alias_applied": false,
    "legacy_action": null,
    "mode": "interactive"
  },
  "error": {
    "code": "PM_TERM_*",
    "category": "...",
    "message": "...",
    "retriable": true
  },
  "fallback": {
    "strategy": "...",
    "next_action": "execute",
    "recommended_mode": "headless",
    "user_message": "...",
    "can_auto_retry": false
  }
}
```

## 1) GUI Missing / Unavailable

### Typical Causes

- Interactive GUI binary is not discoverable in local/bundled mode.
- Interactive runtime is not running or cannot be reached for interactive execution.

### Expected Output

- `error.code`: `PM_TERM_GUI_UNAVAILABLE`
- `error.category`: `runtime_unavailable`
- `fallback.strategy`: `fallback_to_headless_if_allowed`
- `fallback.recommended_mode`: `headless`

Example excerpt:

```json
{
  "success": false,
  "error": {
    "code": "PM_TERM_GUI_UNAVAILABLE",
    "category": "runtime_unavailable",
    "message": "Interactive GUI is unavailable for this request.",
    "retriable": true
  },
  "fallback": {
    "strategy": "fallback_to_headless_if_allowed",
    "next_action": "execute",
    "recommended_mode": "headless",
    "can_auto_retry": false
  }
}
```

## 2) Container Bridge Unavailable

### Typical Causes

- `container_bridge` mode is active and host alias/port is unreachable.
- Host bridge listener is not running.

### Expected Output

- `error.code`: `PM_TERM_GUI_UNAVAILABLE`
- `error.category`: `runtime_unavailable`
- `error.message`: `Container bridge preflight failed: host interactive-terminal endpoint is unreachable.`
- `error.details`: includes bridge aliases/port, timeout, and probe attempts
- `fallback.strategy`: `fallback_to_headless_if_allowed`

Example excerpt:

```json
{
  "success": false,
  "error": {
    "code": "PM_TERM_GUI_UNAVAILABLE",
    "category": "runtime_unavailable",
    "message": "Container bridge preflight failed: host interactive-terminal endpoint is unreachable.",
    "retriable": true,
    "details": {
      "adapter_mode": "container_bridge",
      "bridge_host_alias": "host.containers.internal",
      "bridge_fallback_alias": "host.docker.internal",
      "bridge_port": 45459,
      "connect_timeout_ms": 3000,
      "attempts": []
    }
  },
  "fallback": {
    "strategy": "fallback_to_headless_if_allowed",
    "recommended_mode": "headless"
  }
}
```

## 3) Protocol Timeout

### Typical Causes

- Interactive request exceeded `runtime.timeout_ms`.
- Bridge request/response cycle did not complete within timeout.

### Expected Output

- `error.code`: `PM_TERM_TIMEOUT`
- `error.category`: `runtime_timeout`
- `error.retriable`: `true`
- `fallback.strategy`: `suggest_retry_headless_or_interactive`
- `fallback.recommended_mode`: `headless`

Example excerpt:

```json
{
  "success": false,
  "error": {
    "code": "PM_TERM_TIMEOUT",
    "category": "runtime_timeout",
    "message": "Interactive terminal request timed out while waiting for response.",
    "retriable": true,
    "details": { "timeout_ms": 30000 }
  },
  "fallback": {
    "strategy": "suggest_retry_headless_or_interactive",
    "next_action": "execute",
    "recommended_mode": "headless",
    "can_auto_retry": false
  }
}
```

## 4) Decline Flow

### Typical Causes

- User explicitly declined the command in the interactive approval UI.
- Policy override forces an auto-decline path.

### Expected Output

- `error.code`: `PM_TERM_DECLINED`
- `error.category`: `user_decision`
- `error.retriable`: `false`
- `fallback.strategy`: `report_decline`
- `fallback.recommended_mode`: `interactive`

Example excerpt:

```json
{
  "success": false,
  "error": {
    "code": "PM_TERM_DECLINED",
    "category": "user_decision",
    "message": "Interactive command was declined by user decision.",
    "retriable": false
  },
  "fallback": {
    "strategy": "report_decline",
    "next_action": "execute",
    "recommended_mode": "interactive",
    "can_auto_retry": false
  }
}
```

## Quick Triage Sequence

1. Verify `resolved.mode` and `error.code` first.
2. If `PM_TERM_GUI_UNAVAILABLE` in container mode, inspect preflight `error.details.attempts`.
3. If `PM_TERM_TIMEOUT`, compare runtime timeout settings and bridge responsiveness.
4. If `PM_TERM_DECLINED`, treat as terminal user decision (no auto-retry).
5. Use `correlation.trace_id` to correlate logs across extension/server/bridge.
