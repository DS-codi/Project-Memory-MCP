# Scope Guardrails — memory_cartographer

## Purpose
Scope guardrails prevent the cartographer from scanning irrelevant or excessively large subtrees.
They define default inclusion/exclusion rules and hard limits that apply before any cartography work begins.

## Default Deny-List (always excluded unless explicitly overridden)
| Pattern | Reason |
|---------|--------|
| `**/node_modules/**` | Package trees — not workspace code |
| `**/.git/**` | VCS internals |
| `**/__pycache__/**` | Python bytecode |
| `**/dist/**` | Build output |
| `**/build/**` | Build output |
| `**/.venv/**` | Python virtual environment |
| `**/vendor/**` | Vendored third-party code |
| `**/.next/**` | Next.js output |
| `**/target/**` | Rust/Maven build output |

## Default Allow-List (glob patterns included by default)
```
**/*.ts  **/*.tsx  **/*.js  **/*.jsx
**/*.py  **/*.rs   **/*.go  **/*.cs
**/*.md  **/*.json **/*.yaml **/*.toml
**/*.sql **/*.sh   **/*.ps1
```

## File-Count Caps
| Threshold | Behaviour |
|-----------|-----------|
| 10,000 files | Emit `DiagnosticCode.SCOPE_LIMIT_WARN` |
| 50,000 files | Hard stop; set `partial: true` in envelope |

## Depth Cap
| Setting | Value |
|---------|-------|
| Default depth | 15 levels |
| Maximum depth | 30 levels |
| Behaviour on exceed | Stop traversal at cap; log `DiagnosticCode.SCOPE_LIMIT_WARN` |

## Per-Language Toggles
Users may exclude specific language groups entirely:
```json
{ "exclude_languages": ["rust", "cpp", "java"] }
```
Language-to-extension mappings are defined in `scopeConfig.ts` / `scope_limits.py`.

## Explicit Scope Expansion (Opt-In)
`allow_patterns` entries **override** the deny-list for their matched paths:
```json
{ "allow_patterns": ["**/vendor/my-lib/**"] }
```

## Evaluation Order
1. Apply `allow_patterns` overrides first (highest priority)
2. Apply deny-list
3. Apply allow-list (include if matched)
4. Apply depth cap
5. Apply file-count cap (running total; halt at hard cap)

## Reference Implementation
See `server/src/cartography/config/scopeConfig.ts` (TypeScript) and
`python-core/memory_cartographer/guardrails/scope_limits.py` (Python).
