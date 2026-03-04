# Acceptance Criteria — memory_cartographer

## Overview
This document defines the acceptance matrix for the memory_cartographer system.
All criteria must be met before the cartographer is considered production-ready.

---

## 1. Contract Compliance Matrix

| Schema Field | Criterion | Pass Condition |
|---|---|---|
| `schema_version` | Semver string present | `"1.0.0"` or higher |
| `workspace_identity.workspace_id` | Non-empty string | Matches workspace registration ID |
| `generation_metadata.generated_at` | ISO 8601 timestamp | Valid datetime, within 60s of scan start |
| `diagnostics` | Array (may be empty) | Each entry has `code`, `severity`, `message` |
| `code_cartography.files` | Array | Each entry has `id`, `path`, `language` |
| `database_cartography.datasources` | Array | Each has `id`, `kind`, `name` |
| `partial` | Boolean or absent | Present and `true` only on timeout/OOM |

---

## 2. Compatibility Boundary Tests

| Scenario | Expected Outcome |
|---|---|
| Python version = TS version (e.g. `1.0.0`) | Full compatibility, no warning |
| Python minor ahead (e.g. `1.1.0` vs `1.0.0`) | `DiagnosticCode.VERSION_MISMATCH_MINOR`, continue |
| Python major ahead (e.g. `2.0.0` vs `1.0.0`) | `CartographyBridgeError`, scan aborted |
| Python major behind (e.g. `0.9.0` vs `1.0.0`) | `CartographyBridgeError`, scan aborted |
| Capabilities advertised: `["extended_schema"]` unknown | Ignored, no error |

---

## 3. Scope Guardrail Enforcement

| Test Case | Expected Outcome |
|---|---|
| Workspace with 60,000 files | Hard cap triggered at 50,000; `partial: true` |
| Workspace with 12,000 files | Warning diagnostic emitted; scan completes |
| Path in `node_modules/` | Excluded by default deny-list |
| Path explicitly in `allowOverrides` | Included despite deny-list match |
| `exclude_languages: ["rust"]` | All `.rs` files excluded |
| Depth > 15 levels | Traversal stops at depth 15; `partial: true` |

---

## 4. Performance Guardrail Enforcement

| Test Case | Expected Outcome |
|---|---|
| Scan takes > 120s (hard timeout) | Scan stops; `partial: true`; `DiagnosticCode.TIMEOUT_PARTIAL` |
| Scan takes 30–120s (soft timeout) | Warning diagnostic emitted; scan continues |
| RSS exceeds 1 GB (hard OOM) | Scan stops; `partial: true`; memory diagnostic |
| File count > 5,000 | Progressive sampling engaged; most-recent 20% retained |

---

## 5. Safety Guardrail Enforcement

| Test Case | Expected Outcome |
|---|---|
| Path containing `../../etc/passwd` | Rejected; `DiagnosticCode.PATH_VIOLATION` |
| Symlink pointing outside workspace root | Rejected; `DiagnosticCode.PATH_VIOLATION` |
| File with `password = "s3cr3t"` in JSON | Value replaced with `"[REDACTED]"` |
| Binary file (contains null bytes) | Skipped; diagnostic logged |
| File > 10 MB | Skipped; `DiagnosticCode.SIZE_LIMIT_EXCEEDED` |
| Per-file read error | Logged as diagnostic; scan continues |

---

## 6. Golden Fixture Definitions

### Small Workspace (< 100 files)
- Expected: full scan completes in < 5s, no `partial` flag, all files in allow-list included
- Adversarial: one binary file, one file with `api_key = "test"`, one file in `node_modules/`

### Medium Workspace (1,000–5,000 files)
- Expected: completes in < 30s, no `partial` flag, no progressive sampling
- Adversarial: one symlink pointing to `../outside`, one 15 MB file

### Large Workspace (50,000+ files)
- Expected: `partial: true` after hard cap, `DiagnosticCode.SCOPE_LIMIT_WARN` present

---

## 7. Adversarial Test Cases

| Case | Input | Expected Behaviour |
|---|---|---|
| Cyclic symlink | `a -> b`, `b -> a` | Detected, skipped with warning |
| Path traversal | `../../secret.txt` | Rejected by `is_path_safe` |
| Credential file | `{"token": "abc123"}` | Token value masked in output |
| Binary blob | ELF/PE binary | `is_binary` returns `True`; file skipped |
| Zero-byte file | Empty file | Processed normally (not binary) |

---

## Reference
- `server/tests/cartography/contract.spec.ts` — vitest contract tests
- `python-core/tests/test_contract_golden.py` — pytest golden fixture + adversarial tests
