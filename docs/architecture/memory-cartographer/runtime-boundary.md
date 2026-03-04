# Runtime Boundary Contract: TypeScript Orchestrator ↔ Python Core

**Status:** Decided  
**Version:** 1.0.0  
**Date:** 2026-03-04  
**Plan:** `plan_mm9b56wp_c11823dd` — Program Foundation: memory_cartographer contract, scope, and compatibility rules

---

## Overview

This document defines the runtime boundary between the TypeScript MCP server (orchestrator) and the Python core (cartography engine). It is the authoritative reference for subprocess invocation, wire format, timeout behavior, error taxonomy, and retry semantics.

---

## Invocation Mode

The Python core is invoked as a **short-lived subprocess** per cartography request.

```
TypeScript server
  │
  └── spawn: python -m memory_cartographer.runtime.entrypoint
        stdin  ← JSON request envelope (single NDJSON line)
        stdout → JSON response envelope (single NDJSON line)
        stderr → captured by adapter for fatal startup diagnostics
        exit 0 = success or partial result
        exit != 0 = fatal error (see stderr for detail)
```

- **Subprocess lifetime**: one process per request; no persistent daemon in v1.
- **Wire format**: newline-delimited JSON (NDJSON) — one complete JSON object per line on each channel.
- **Encoding**: UTF-8 throughout.
- **Process arguments**: none beyond the module entry (`-m memory_cartographer.runtime.entrypoint`). All request parameters are in the stdin envelope.

---

## Request Envelope

The TypeScript adapter writes exactly one NDJSON line to the subprocess stdin before closing the write channel.

| Field | Type | Required | Description |
|---|---|---|---|
| `schema_version` | string | ✓ | Schema version the adapter was built against (e.g., `"1.0.0"`) |
| `request_id` | string | ✓ | Unique UUID for correlation in diagnostics and logs |
| `action` | string | ✓ | The requested operation: `"cartograph"` \| `"probe_capabilities"` \| `"health_check"` |
| `args` | object | ✓ (may be `{}`) | Action-specific parameters (workspace path, scope config, etc.) |
| `timeout_ms` | number | ✓ | Maximum milliseconds the Python process may take; Python core enforces this internally via checkpoints |
| `cancellation_token` | string | ✗ | Opaque token for future cooperative cancellation support |

### Example request

```json
{
  "schema_version": "1.0.0",
  "request_id": "req_01j9abc123",
  "action": "cartograph",
  "args": {
    "workspace_path": "/workspace/my-project",
    "scope": {
      "include": ["src/**"],
      "exclude": ["node_modules/**", ".git/**"],
      "max_depth": 10
    },
    "languages": ["python", "typescript"]
  },
  "timeout_ms": 30000
}
```

---

## Response Envelope

The Python core writes exactly one NDJSON line to stdout before exiting.

| Field | Type | Always present | Description |
|---|---|---|---|
| `schema_version` | string | ✓ | Schema version the Python core produced (may differ from request's `schema_version`) |
| `request_id` | string | ✓ | Echoed from the request for correlation |
| `status` | string | ✓ | `"ok"` \| `"partial"` \| `"error"` |
| `result` | object \| null | ✓ | Full or partial cartography output; `null` on fatal error |
| `diagnostics` | object | ✓ | Structured diagnostics (see below) |
| `elapsed_ms` | number | ✓ | Wall-clock milliseconds reported by the Python core |

### Diagnostics sub-object

| Field | Type | Description |
|---|---|---|
| `warnings` | string[] | Non-fatal warnings (e.g., file parse errors on individual files) |
| `errors` | string[] | Error details when `status = "error"` |
| `markers` | string[] | Semantic markers: `"timeout"` \| `"partial_scan"` \| `"schema_version_drift"` \| ... |
| `skipped_paths` | string[] | Paths skipped due to binary content, oversized files, or scope exclusion |

### Status semantics

| Status | Meaning |
|---|---|
| `"ok"` | Complete result; no data loss |
| `"partial"` | Best-effort result; `diagnostics.markers` explains what was skipped or truncated |
| `"error"` | Fatal error; `result` is `null`; `diagnostics.errors` contains error detail |

### Example response

```json
{
  "schema_version": "1.0.0",
  "request_id": "req_01j9abc123",
  "status": "ok",
  "result": { "...": "cartography output node" },
  "diagnostics": {
    "warnings": [],
    "errors": [],
    "markers": [],
    "skipped_paths": []
  },
  "elapsed_ms": 4231
}
```

---

## Timeout Model

Timeouts are **cooperatively enforced by both sides**.

### TypeScript adapter side

1. Before spawning the subprocess, the adapter records a `deadline = now + timeout_ms`.
2. After writing the request envelope, the adapter waits for the subprocess to write its response or for the deadline to elapse (whichever comes first).
3. If the deadline elapses before a response is received:
   - The adapter **kills the subprocess** (SIGKILL / process.kill on Windows).
   - The adapter returns an error with `error_code: "INVOCATION_TIMEOUT"`.
4. The adapter never waits indefinitely; every invocation must have a `timeout_ms > 0`.

### Python core side

1. The Python core reads `timeout_ms` from the request envelope.
2. The Python core inserts **cancellation checkpoints** at phase boundaries (after scan, after parse, after graph resolution, before export).
3. At each checkpoint, if elapsed time exceeds `timeout_ms * 0.9`, the Python core:
   - Finalizes whatever partial result has been built so far.
   - Writes a `"partial"` response with marker `"timeout"`.
   - Exits `0`.
4. The Python core must **never** block on I/O without a timeout. All file system operations use bounded loops.

### Timeout precedence rule

The TypeScript adapter's hard kill takes precedence. The Python core's soft timeout is a best-effort mechanism to return a partial result before the hard kill.

---

## Error Taxonomy

| Category | `status` | `error_code` (in diagnostics or adapter error) | Retry? | Description |
|---|---|---|---|---|
| **Transient** | `"error"` | `"INVOCATION_TIMEOUT"` | ✓ (up to max) | Subprocess timed out |
| **Transient** | `"error"` | `"PYTHON_SPAWN_FAILED"` | ✓ (up to max) | OS-level process spawn failure |
| **Permanent** | `"error"` | `"SCHEMA_VERSION_TOO_NEW"` | ✗ | Python schema version exceeds adapter max |
| **Permanent** | `"error"` | `"SCHEMA_VERSION_TOO_OLD"` | ✗ | Python schema version below adapter min |
| **Permanent** | `"error"` | `"SCHEMA_VERSION_MALFORMED"` | ✗ | `schema_version` field is not a valid semver |
| **Permanent** | `"error"` | `"PYTHON_CORE_UNAVAILABLE"` | ✗ | Python not installed or module not found |
| **Permanent** | `"error"` | `"INVALID_REQUEST_ENVELOPE"` | ✗ | Python core could not parse the request |
| **Partial** | `"partial"` | *(marker in diagnostics)* | ✗ | Timeout reached; partial result returned |
| **Transient** | `"error"` | `"UNEXPECTED_EXIT"` | ✓ (once) | Subprocess exited non-zero with no response |

---

## Retry Policy

| Condition | Max retries | Backoff | Notes |
|---|---|---|---|
| `INVOCATION_TIMEOUT` | 2 | Exponential, base 1 s, cap 10 s | Only if caller has remaining time budget |
| `PYTHON_SPAWN_FAILED` | 3 | Linear, 500 ms | Likely transient OS resource exhaustion |
| `UNEXPECTED_EXIT` | 1 | No backoff | One immediate retry; if same exit code, surface as permanent |
| All `"Permanent"` errors | **0** | — | Hard fail immediately; do not retry |
| `"partial"` result | **0** | — | Partial results are valid; surface to caller as-is |

### No-retry cases (absolute)

- Version mismatch errors (`TOO_NEW`, `TOO_OLD`, `MALFORMED`) — retrying will not change the version.
- `PYTHON_CORE_UNAVAILABLE` — retrying will not fix a missing Python installation.
- `INVALID_REQUEST_ENVELOPE` — retrying will not fix a malformed request from the adapter (this is an adapter bug).

---

## Cancellation Support (Future)

Cooperative cancellation via `cancellation_token` is reserved for a future minor version. In `1.0.0`:

- The `cancellation_token` field is accepted and ignored by the Python core.
- The TypeScript adapter may set the field; it has no effect in v1.
- When implemented, cancellation will use the same partial-result mechanism as timeout.

---

*See also: [implementation-boundary.md](./implementation-boundary.md) | [compatibility-matrix.md](./compatibility-matrix.md)*
