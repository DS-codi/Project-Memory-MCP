# Memory Cartographer: Canonical Output Contract

**Status:** Decided  
**Version:** 1.0.0  
**Date:** 2026-03-04  
**Plan:** `plan_mm9b56wp_c11823dd` — Program Foundation: memory_cartographer contract, scope, and compatibility rules

---

## Purpose

The canonical output contract defines the unified envelope that wraps all cartography output produced by the Python core (`memory_cartographer`).  Every response from the Python core — whether a full code scan, a database scan, or both — is delivered inside this envelope, ensuring a single consistent shape for the TypeScript server adapter to validate and consume.

This document is the human-readable counterpart to `memory-cartographer.schema.json`. The JSON schema is the machine-authoritative source; this document is the narrative specification.

---

## Relationship to Other Documents

| Document | Role |
|---|---|
| `implementation-boundary.md` | Defines who owns what (Python core vs. TypeScript server); this contract is produced by Python core |
| `runtime-boundary.md` | Defines how the envelope is transmitted (NDJSON over subprocess stdio) |
| `compatibility-matrix.md` | Defines how `schema_version` is negotiated and validated by the TypeScript adapter |
| `memory-cartographer.schema.json` | Machine-readable JSON Schema for this envelope |
| `sections/code-cartography.schema.json` | JSON Schema for the `code_cartography` section |
| `sections/database-cartography.schema.json` | JSON Schema for the `database_cartography` section |
| `normalization-rules.md` | Stability guarantees, identity keys, nullability semantics |

---

## Top-Level Envelope Fields

The envelope is the root JSON object emitted by the Python core on stdout.

| Field | Type | Required | Description |
|---|---|---|---|
| `schema_version` | `string` | **required** | Semantic version of the output schema produced (e.g., `"1.0.0"`). Declared by Python core; validated by TypeScript adapter. MAJOR increment = breaking change; MINOR = additive; PATCH = non-structural fix. |
| `workspace_identity` | `object` | **required** | Provenance descriptor for the workspace that was scanned. See [Workspace Identity](#workspace-identity). |
| `generation_metadata` | `object` | **required** | Provenance and performance data for this specific scan run. See [Generation Metadata](#generation-metadata). |
| `diagnostics` | `array` | **required** | Structured diagnostic entries (errors, warnings, informational notices). Always present; may be empty array. See [Diagnostics](#diagnostics). |
| `code_cartography` | `object` | **optional** | Code scanning output. Present only when a code cartography scan was requested and at least partially completed. Absent (not null) when not requested. |
| `database_cartography` | `object` | **optional** | Database scanning output. Present only when a database cartography scan was requested and at least partially completed. Absent (not null) when not requested. |

---

## Workspace Identity

The `workspace_identity` object describes the workspace that was scanned. It provides sufficient information for the TypeScript server to verify that a cached result is still applicable.

| Field | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | **required** | Absolute path to the workspace root as seen by the Python core process. |
| `name` | `string` | **required** | Display name for the workspace. Derived from the directory name when no explicit name is configured. |
| `fingerprint` | `string` | **required** | Stability fingerprint of the scanned file tree. Used by the TypeScript server to detect workspace staleness and invalidate caches. |

### Fingerprint Computation

The `fingerprint` is a deterministic SHA-256 hash computed from the **sorted list of scanned file paths** paired with their **last-modification timestamps**, computed after scope filtering and before any content analysis.

```
fingerprint = sha256(
  sorted([
    f"{relative_path}:{mtime_unix_ns}"
    for (relative_path, mtime_unix_ns) in sorted_scanned_files
  ]).join("\n")
)
```

- Paths are **workspace-relative** (not absolute) to ensure portability.
- Paths are sorted lexicographically (ascending) before hashing.
- The fingerprint captures only the files actually within scope (post-filter). Files excluded by scope rules are not included.
- If the scan is partial (see `generation_metadata.partial`), the fingerprint reflects only the files that were processed, not the full workspace.

---

## Generation Metadata

The `generation_metadata` object captures provenance and performance data for the scan that produced this envelope.

| Field | Type | Required | Description |
|---|---|---|---|
| `timestamp` | `string` | **required** | ISO 8601 UTC timestamp when this scan started (e.g., `"2026-03-04T11:00:00.000Z"`). |
| `duration_ms` | `number` | **required** | Wall-clock duration of the scan in milliseconds, as measured by the Python core. |
| `cartographer_version` | `string` | **required** | Version string of the Python core (`memory_cartographer`) that produced this output (semver). |
| `partial` | `boolean` | **required** | `true` if the result is a partial scan; `false` for a complete scan. When `true`, diagnostics will contain at least one entry explaining which parts were skipped or truncated. |
| `request_id` | `string` | **required** | Echoed from the runtime request envelope for correlation. |

---

## Diagnostics

The `diagnostics` array contains zero or more `DiagnosticEntry` objects. This field is always present; an empty array indicates a clean scan with no warnings or errors.

### DiagnosticEntry Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `code` | `string` | **required** | Machine-readable diagnostic code from the taxonomy defined in `normalization-rules.md` (e.g., `"FILE_READ_ERROR"`). |
| `severity` | `string` | **required** | `"error"` \| `"warning"` \| `"info"`. Errors may indicate scan failure or hard constraint violations; warnings indicate degraded coverage; info is informational only. |
| `message` | `string` | **required** | Human-readable explanation of the diagnostic. |
| `path` | `string` | **optional** | Workspace-relative file or directory path associated with this diagnostic, when applicable. |

See `normalization-rules.md` for the complete diagnostic code taxonomy and retryability classification.

---

## Partial Result Semantics

When `generation_metadata.partial` is `true`:

1. The envelope is still structurally valid — all required fields are present.
2. The `diagnostics` array contains at least one entry with `severity: "warning"` or `"error"` explaining what was not completed.
3. Individual sections (`code_cartography`, `database_cartography`) may also carry a `partial: true` flag indicating per-section incompleteness.
4. Consumers (typically the TypeScript adapter) **must** surface the partial condition to callers — partial results must not be silently treated as complete.
5. The TypeScript adapter sets a `"partial_scan"` marker in the response diagnostics when forwarding a partial result (see `runtime-boundary.md`).

### When partial is set

- A timeout fires before the scan completes (`SCAN_TIMEOUT` diagnostic code).
- A non-fatal file read error occurs (`FILE_READ_ERROR`) and the scan continues with remaining files.
- A per-section cap (file count, depth) is reached and the section notes its own partial flag.

---

## Optional Section Presence Rules

- `code_cartography` is **absent** (field not present) when no code scan was requested.
- `database_cartography` is **absent** (field not present) when no database scan was requested.
- Neither field is set to `null` — absence is the correct representation of "not requested".
- If a scan was requested but **failed fatally**, the section is absent, and `diagnostics` contains an `"error"`-severity entry explaining the failure.
- If a scan was requested and partially completed, the section is present with `partial: true`.

---

## Example Envelope (Structural)

```json
{
  "schema_version": "1.0.0",
  "workspace_identity": {
    "path": "/workspace/my-project",
    "name": "my-project",
    "fingerprint": "a3f1c2d4e5b6..."
  },
  "generation_metadata": {
    "timestamp": "2026-03-04T11:00:00.000Z",
    "duration_ms": 1234,
    "cartographer_version": "0.1.0",
    "partial": false,
    "request_id": "req_01j9abc123"
  },
  "diagnostics": [],
  "code_cartography": { "...": "see code-cartography.schema.json" },
  "database_cartography": { "...": "see database-cartography.schema.json" }
}
```

---

## Schema Reference

Machine-readable validation: `docs/contracts/memory-cartographer.schema.json`

Sub-section schemas:
- `docs/contracts/sections/code-cartography.schema.json`
- `docs/contracts/sections/database-cartography.schema.json`

TypeScript types: `server/src/cartography/contracts/types.ts`
