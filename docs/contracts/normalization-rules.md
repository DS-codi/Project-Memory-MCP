# Normalization and Stability Guarantees

**Status:** Decided  
**Version:** 1.0.0  
**Date:** 2026-03-04  
**Plan:** `plan_mm9b56wp_c11823dd` — Program Foundation: memory_cartographer contract, scope, and compatibility rules

---

## Overview

This document specifies the normalization rules that the Python core **must** apply when producing the memory_cartographer output envelope, and the stability guarantees that consumers (the TypeScript server adapter and downstream callers) may rely on. These rules are part of the versioned contract — changing them in a breaking way requires a `schema_version` MAJOR bump.

---

## 1. Identity Key Rules

Identity keys provide stable, deterministic identifiers for entities in the output. They are used for:
- Cache invalidation and delta detection by the TypeScript server.
- Cross-referencing between sections (e.g., `SymbolEntry.id` referenced by `ReferenceEntry.to_symbol_id`).
- Stable presentation in MCP tools.

### 1.1 Stability Guarantee

An entity's identity key **must not change** for the same logical entity unless the entity itself changes in a structurally meaningful way (e.g., file renamed, symbol moved to another file, table renamed). The key is stable across re-scans of an unchanged workspace.

### 1.2 Identity Key Formats

| Entity | Format | Example |
|---|---|---|
| **File** (code) | `{workspace_relative_path}` | `src/server/main.ts` |
| **Symbol** | `{workspace_relative_file_path}::{symbol_name}` | `src/utils/helper.ts::formatDate` |
| **Symbol** (qualified, when available) | `{workspace_relative_file_path}::{qualified_name}` | `src/utils/helper.ts::Utils.formatDate` |
| **Module** (code) | `{workspace_relative_path}` | `src/utils/helper.ts` |
| **DataSource** | `{kind}::{name}` | `postgresql::myapp_db` |
| **Table** | `{datasource_id}::{schema_name}::{table_name}` | `postgresql::myapp_db::public::users` |
| **Table** (no schema) | `{datasource_id}::::{table_name}` (empty schema) | `sqlite::app.db::::sessions` |
| **Column** | `{table_id}::{column_name}` | `postgresql::myapp_db::public::users::id` |
| **Constraint** | `{table_id}::{constraint_name}` | `postgresql::myapp_db::public::users::users_pkey` |
| **Relation** | `{from_table_id}::{to_table_id}::{constraint_name}` | `...::orders:::::...::users::::orders_user_id_fkey` |

### 1.3 Path Normalization Rules for Keys

- Paths in identity keys must be **workspace-relative** (no leading `/` or `./`).
- Path separators in keys must be **forward-slash** (`/`) regardless of host OS.
- Paths must be **case-preserved** exactly as the filesystem reports them.
- No trailing slashes.

### 1.4 Collision Policy

If two entities would produce the same identity key (e.g., two symbols with the same name in the same file), the Python core appends a disambiguator: `{base_key}::{kind}_{start_line}`.

---

## 2. Nullability Semantics

### 2.1 Required vs Optional Fields

The output contract distinguishes three categories:

| Category | Meaning | Example fields |
|---|---|---|
| **Always present, never null** | Field is always included in the output object; never omitted, never `null`. | `schema_version`, `workspace_identity`, `diagnostics`, `files`, `tables` |
| **Conditionally present** | Field is included when meaningful; omitted (absent from the JSON object) when not applicable. Never serialized as `null`. | `code_cartography`, `database_cartography`, `qualified_name`, `end_line` |
| **Nullable** | Field is always included but may be `null` when the value is unknown or unavailable. Used only where distinguishing "not set" from "set to empty" is contract-important. | *(none in v1.0 — prefer "absent" over null)* |

### 2.2 Empty Array Rule

**Array fields that are always-present must serialize as an empty array `[]`, never as `null` or absent.** This applies to:

- `diagnostics` (top-level envelope)
- `code_cartography.files`, `.symbols`, `.references`, `.architecture_edges`
- `code_cartography.module_graph.nodes`, `.edges`
- `code_cartography.dependency_flow.tiers`, `.entry_points`
- `database_cartography.datasources`, `.tables`, `.columns`, `.constraints`, `.relations`, `.query_touchpoints`
- `database_cartography.migration_lineage.migration_files`

### 2.3 Boolean Field Rule

Boolean fields that describe a property of an entity (e.g., `Column.nullable`, `CodeFile.parse_error`) must be explicitly serialized as `true` or `false`. They must not be omitted or null-serialized.

Exception: optional boolean fields such as `CodeFile.parse_error` may be omitted when `false` (default). Consumers must treat an absent optional boolean as `false`.

### 2.4 Nested Object Rule

Nested required objects (e.g., `workspace_identity`, `generation_metadata`, `module_graph`, `migration_lineage`) are always present and fully populated. They are never `null` or replaced with a stub object.

---

## 3. Partial-Result Markers

### 3.1 Top-Level Partial Flag

`generation_metadata.partial: true` signals that the envelope does not represent a complete scan. Consumers **must**:

1. Treat the result as a best-effort snapshot, not a definitive map.
2. Surface the partial condition to downstream callers — partial results must not be silently treated as complete.
3. Not cache partial results with the same lifetime as complete results.

### 3.2 When `partial: true` Is Set

| Trigger | Diagnostic code set | Notes |
|---|---|---|
| Scan timeout | `SCAN_TIMEOUT` | Top-level `partial: true` |
| File-count cap reached | `FILE_COUNT_CAP_REACHED` | Top-level `partial: true` |
| Depth cap reached | `DEPTH_CAP_REACHED` | Top-level `partial: true` |
| Non-fatal file read error | `FILE_READ_ERROR` | Top-level `partial: true` only when errors affect coverage materially |
| DB connection failure after partial introspection | `DB_CONNECTION_FAILED` | Top-level `partial: true`; section-level `partial: true` on database_cartography |

### 3.3 Per-Section Partial Flag

Individual sections (`code_cartography`, `database_cartography`) may include their own `partial: true` flag when only that section is incomplete. When a section carries `partial: true`, the top-level `generation_metadata.partial` must also be `true`.

### 3.4 TypeScript Adapter Responsibility

When the Python core response has `status: "partial"` or `generation_metadata.partial: true`, the TypeScript adapter:
- Sets `diagnostics.markers: ["partial_scan"]` in the runtime response envelope.
- Does not downgrade the diagnostic — partial status is preserved, not hidden.

---

## 4. Ordering Guarantees

All arrays in the output are **deterministically ordered**. The same workspace scanned twice under the same scope will produce the same ordering. This enables stable diffs and reproducible caches.

Ordering rules are co-located with each array field in the section schemas:
- `docs/contracts/sections/code-cartography.schema.json`
- `docs/contracts/sections/database-cartography.schema.json`

Summary:

| Array | Primary sort | Secondary sort | Tertiary sort |
|---|---|---|---|
| `code_cartography.files` | `path` asc | — | — |
| `code_cartography.symbols` | `file` asc | `start_line` asc | `name` asc |
| `code_cartography.references` | `from_file` asc | `from_line` asc | `to_file` asc |
| `code_cartography.architecture_edges` | `from_module` asc | `to_module` asc | — |
| `code_cartography.module_graph.nodes` | `node` asc | — | — |
| `code_cartography.module_graph.edges` | `from` asc | `to` asc | — |
| `code_cartography.dependency_flow.tiers[n]` | module path asc within tier | — | — |
| `code_cartography.dependency_flow.entry_points` | path asc | — | — |
| `database_cartography.datasources` | `id` asc | — | — |
| `database_cartography.tables` | `datasource_id` asc | `schema_name` asc | `table_name` asc |
| `database_cartography.columns` | `table_id` asc | `ordinal_position` asc | — |
| `database_cartography.constraints` | `table_id` asc | `constraint_kind` asc | `constraint_name` asc |
| `database_cartography.relations` | `from_table_id` asc | `to_table_id` asc | `constraint_name` asc |
| `database_cartography.query_touchpoints` | `file` asc | `line` asc | — |
| `database_cartography.migration_lineage.migration_files` | `datasource_id` asc | `version` asc | — |

**Sort stability**: All sorts are stable (ties resolved by insertion order for fields not listed in the sort key).

---

## 5. Warning / Error Diagnostic Taxonomy

All diagnostic entries use codes from this table. The code appears in `DiagnosticEntry.code`. The TypeScript adapter translates these codes when building MCP error responses.

| Code | Severity | Retryable | Description |
|---|---|---|---|
| `SCAN_TIMEOUT` | `error` | no | The scan did not complete within the allocated `timeout_ms`. The result is partial. Increasing `timeout_ms` in a future request may produce a complete result. |
| `FILE_READ_ERROR` | `warning` | yes | A specific file could not be read (permission error, transient I/O failure). The file is recorded in the inventory with `parse_error: true`; the scan continues. Set `path` to the affected file. |
| `SYMBOL_PARSE_ERROR` | `warning` | yes | A file was read but its AST could not be fully parsed. Symbol extraction may be incomplete for this file. The file is still included with `symbol_count: 0` or a partial count. Set `path` to the affected file. |
| `DB_CONNECTION_FAILED` | `error` | no | A database introspection attempt failed because the connection could not be established. Schema introspection results for this data source are absent. Set `path` to the datasource config path when available. |
| `PATH_OUTSIDE_ROOT` | `error` | no | A path traversal or symlink escape was detected. The path was not scanned. This is a safety guardrail event (see safety-guardrails.md). Set `path` to the rejected path. |
| `FILE_COUNT_CAP_REACHED` | `warning` | no | The scan reached the configured maximum file count. Files beyond the cap are not included. Result is partial. |
| `DEPTH_CAP_REACHED` | `warning` | no | The scan reached the configured maximum directory depth. Subdirectories beyond the cap are not entered. Result is partial. |
| `SECRETS_REDACTED` | `info` | no | A file or value was identified as containing secrets/credentials and was redacted from the output. No retry needed — the redaction is intentional. Set `path` when file-level. |
| `BINARY_SKIPPED` | `info` | no | A binary or oversized file was skipped during content analysis. The file is recorded in the inventory (if in scope) but has no symbols or content analysis. Set `path` to the skipped file. |
| `SCHEMA_VERSION_DRIFT` | `warning` | no | The Python core schema_version MINOR differs from the version the TypeScript adapter was built against. This is set by the TypeScript adapter, not by the Python core. Result is still returned. |
| `UNKNOWN_FIELD` | `info` | no | The TypeScript adapter encountered a field in the response that it does not recognise (from a newer MINOR version). The field is ignored. Set by the TypeScript adapter only. |

### Retryability

- **Retryable (yes)**: The condition may resolve on a subsequent scan without any configuration change (e.g., a transient I/O error). Callers may retry automatically.
- **Not retryable (no)**: The condition will not resolve without a configuration change or external action (e.g., increasing `timeout_ms`, fixing DB credentials, adjusting scope to exclude a problematic path).

---

## 6. Schema Version Change Policy for Normalization Rules

Any change to this document that affects the observable structure of the output envelope — including adding a new taxonomy code, changing a sort key, changing nullability semantics, or changing an identity key format — must be reflected in a `schema_version` bump:

| Change type | Bump required |
|---|---|
| New required field, removed field, changed nullability, changed sort key | MAJOR |
| New optional field, new diagnostic code (additive) | MINOR |
| Corrected documentation text, no observable structural change | PATCH |
