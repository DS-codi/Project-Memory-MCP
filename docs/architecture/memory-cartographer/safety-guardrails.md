# Safety Guardrails — memory_cartographer

## Purpose
Safety guardrails protect the workspace and downstream consumers from unsafe paths,
secret leakage, and resource exhaustion from oversized or binary files.

## Path Traversal Prevention
- All file paths are validated against the workspace root before access
- Paths containing `../` sequences are rejected outright
- Resolved absolute paths must be descendants of the workspace root
- Diagnostic: `DiagnosticCode.PATH_VIOLATION`

## Symlink Containment
- Symbolic links are resolved before access
- If the resolved target escapes the workspace root, the path is rejected
- Circular symlinks are detected and skipped with a warning
- Diagnostic: `DiagnosticCode.PATH_VIOLATION`

## Secrets & Credential Masking
The following key patterns trigger value masking in output artefacts:

| Pattern | Matches |
|---------|---------|
| `password` | Any field with "password" in the key name |
| `secret` | API secrets, client secrets |
| `token` | Auth tokens, bearer tokens |
| `api_key` / `apikey` | API credentials |
| `private_key` / `privatekey` | Private keys |
| `credential` | Generic credential fields |
| `access_key` | AWS/cloud access keys |

Masking replaces the value with `"[REDACTED]"`. Keys themselves are preserved.

## Binary File Handling
- A file is classified as binary if any of the first 512 bytes is a null byte (`\x00`)
- Binary files are skipped entirely
- Diagnostic: `DiagnosticCode.BINARY_FILE_SKIPPED` (if defined; else silent skip)

## Large File Bypass
| Threshold | Behaviour |
|-----------|-----------|
| > 10 MB | Skip file; log `DiagnosticCode.SIZE_LIMIT_EXCEEDED` |

## Failure Containment
- Errors on individual files are logged as diagnostic entries and **do not halt the scan**
- Each per-file error is attached to the enclosing `diagnostics[]` array in the envelope
- Only systemic failures (e.g. workspace root inaccessible) propagate as exceptions

## Reference Implementation
See `server/src/cartography/safety/policies.ts` (TypeScript) and
`python-core/memory_cartographer/guardrails/safety.py` (Python).
