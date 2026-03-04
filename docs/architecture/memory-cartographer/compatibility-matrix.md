# Compatibility Matrix: Schema Version Strategy

**Status:** Decided  
**Version:** 1.0.0  
**Date:** 2026-03-04  
**Plan:** `plan_mm9b56wp_c11823dd` — Program Foundation: memory_cartographer contract, scope, and compatibility rules

---

## Overview

This document defines the versioning scheme, capability negotiation protocol, and fallback behavior for the memory_cartographer schema contract. It is the authoritative reference for how Python core and TypeScript server negotiate compatibility at runtime.

---

## Schema Versioning Scheme

The canonical output envelope includes a `schema_version` field using **semantic versioning** (`MAJOR.MINOR.PATCH`).

```
schema_version: "MAJOR.MINOR.PATCH"
```

| Segment | Increment when... | TypeScript adapter behavior |
|---|---|---|
| **MAJOR** | Structural breaking change to the output envelope (field removed, type changed, section renamed, ordering guarantee removed) | **Hard fail** — adapter rejects the response and returns a structured error to the caller |
| **MINOR** | Additive change (new optional field in envelope or section, new supported action, new language toggle) | **Graceful accept** — adapter processes result, marks unknown fields as ignored in diagnostics |
| **PATCH** | Bug fix with no structural change (corrected ordering, fixed identity key format, improved diagnostics text) | **Transparent accept** — adapter processes result normally |

### Version authority

- Python core **declares** `schema_version` in every response envelope.
- TypeScript adapter **reads and validates** `schema_version` against its supported range.
- Python core **must not** emit a `schema_version` lower than `1.0.0` in production.
- TypeScript adapter **must not** modify or suppress the `schema_version` field in transit.

---

## Adapter Capability Negotiation

Before normal operation, the TypeScript adapter may invoke a `probe_capabilities` action to discover the Python core's capabilities. This happens:
- At server startup (optional, non-blocking).
- When a compatibility error occurs and the adapter needs to diagnose the mismatch.

### Capability advertisement shape

```json
{
  "schema_version": "1.0.0",
  "supported_actions": ["cartograph", "probe_capabilities", "health_check"],
  "supported_languages": ["python", "typescript", "javascript", "rust"],
  "feature_flags": {
    "database_cartography": true,
    "incremental_scan": false,
    "partial_results": true
  }
}
```

### Negotiation flow

```
TypeScript adapter         Python core
      │                         │
      ├──── probe_capabilities ─►│
      │                         │
      │◄─── capabilities ────────┤
      │                         │
      ├── evaluate schema_version│
      │   against supported range│
      │                         │
      ├── check feature_flags ──►│  (for optional features)
      │                         │
      └── proceed / reject/degrade
```

---

## Fallback Mode Table

| Condition | Adapter action | Caller-visible result |
|---|---|---|
| `MAJOR` version mismatch (Python > adapter max) | Hard reject — return `CartographyVersionError` | Error with `error_code: "SCHEMA_VERSION_TOO_NEW"` |
| `MAJOR` version mismatch (Python < adapter min) | Hard reject — return `CartographyVersionError` | Error with `error_code: "SCHEMA_VERSION_TOO_OLD"` |
| `MINOR` version drift (Python `MINOR` > adapter's known `MINOR`) | Accept with warning — log unknown fields; include `schema_version_drift` diagnostic marker | Result returned; `diagnostics.markers` includes `"schema_version_drift"` |
| `MINOR` version drift (Python `MINOR` < adapter's known `MINOR`) | Accept with graceful downgrade — adapter must not require fields added in newer MINOR | Result returned normally |
| `PATCH` version difference | Transparent accept | Result returned normally; no diagnostic marker |
| `probe_capabilities` fails (Python not installed / startup error) | Log degraded-mode warning; raise `CartographyUnavailableError` | Error with `error_code: "PYTHON_CORE_UNAVAILABLE"` |
| Capability flag required by adapter is absent | Adapter disables dependent feature or raises `CartographyCapabilityError` | Error or degraded result depending on feature criticality |

---

## Change Policy

### Breaking changes (require MAJOR bump)

- Removing a required field from the top-level envelope.
- Renaming a required field.
- Changing the type of an existing field (e.g., string → array).
- Changing ordering guarantees (e.g., removing stable sort on `files` array).
- Removing a previously supported `action` from `supported_actions`.
- Changing the `status` values permitted in the response envelope.

### Non-breaking changes (MINOR bump)

- Adding a new optional field to the envelope or any section.
- Adding a new action to `supported_actions`.
- Adding a new language to `supported_languages`.
- Adding a new feature flag (absent = `false` by default).
- Adding new `diagnostics.markers` values.

### Patch-level changes (PATCH bump)

- Correcting a bug in a field value (e.g., fixing a broken identity key format) without structural change.
- Improving diagnostic message text.
- Performance improvements with no output change.

---

## Current Supported Version Range

| Component | Min supported | Max supported | Notes |
|---|---|---|---|
| Python core (producer) | `1.0.0` | — | Declares version; no min/max concept |
| TypeScript adapter (consumer) | `1.0.0` | `1.x.x` | Hard fails on `2.x.x` or `0.x.x` |

> **Note:** The version range is a stub. Update this table when the Python core releases its first stable version.

---

*See also: [implementation-boundary.md](./implementation-boundary.md) | [runtime-boundary.md](./runtime-boundary.md)*
