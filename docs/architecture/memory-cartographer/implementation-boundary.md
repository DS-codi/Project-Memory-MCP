# Implementation Boundary: Python Core vs TypeScript Server

**Status:** Decided  
**Version:** 1.0.0  
**Date:** 2026-03-04  
**Plan:** `plan_mm9b56wp_c11823dd` — Program Foundation: memory_cartographer contract, scope, and compatibility rules

---

## Decision Summary

The memory_cartographer system uses a **split-ownership model**:

- **Python core** is the canonical cartography engine and schema producer.
- **TypeScript server** is the orchestration, transport, and compatibility adapter layer.

This boundary is fixed for all downstream implementation phases. Do not re-derive it.

---

## Ownership Table

| Concern | Owner | Rationale |
|---|---|---|
| File system scanning (include/exclude, depth caps, symlink containment) | **Python core** | Engine-level concern; zero-dependency Python stdlib handles path traversal safely |
| Symbol extraction (AST parsing, regex fallback) | **Python core** | Python AST is native; avoids cross-language parsing bridges |
| Graph resolution (topological sort, dependency tiers, entry-point detection) | **Python core** | In-process graph is simpler and faster in Python |
| Database cartography (schema introspection, relation mapping, query touchpoints) | **Python core** | Engine-level concern; Python drivers are portable and dependency-free for metadata queries |
| Canonical JSON output schema production | **Python core** | Python core emits the versioned canonical envelope; TypeScript never mutates schema structure |
| `schema_version` bump authority | **Python core** | Schema version is owned by the producer of the schema |
| Process invocation (spawn Python subprocess, stdin/stdout pipe management) | **TypeScript server** | Orchestration concern; TS manages process lifecycle and timeouts |
| Transport serialization (JSON envelope encoding/decoding over stdio) | **TypeScript server** | TS owns the transport framing; Python core reads/writes plain JSON |
| Compatibility negotiation (adapter_capabilities, version matrix checks) | **TypeScript server** | Adapter concern; TS decides whether to accept, downgrade, or reject a schema version |
| MCP tool exposure (serving cartography data as MCP resources/tools) | **TypeScript server** | MCP server is TypeScript; Python core has no MCP dependency |
| Result caching and incremental refresh policy | **TypeScript server** | Orchestration concern; TS decides when to re-invoke Python core |
| Error taxonomy translation (Python error → MCP/API error shape) | **TypeScript server** | Adapter concern; TS normalizes errors for callers |
| Workspace identity resolution (workspace_id injection into envelope) | **TypeScript server** | Context is available server-side before invocation |

---

## Integration Surface

TypeScript invokes the Python core as a **subprocess**, communicating via **stdin/stdout with JSON envelopes**.

### Invocation flow

```
TypeScript Server (orchestrator)
  │
  ├─ spawns: python -m memory_cartographer.runtime.entrypoint
  │
  ├─ stdin  ──►  Python Core  (JSON request envelope)
  │
  └─ stdout ◄──  Python Core  (JSON response envelope)
```

- The Python subprocess is short-lived per cartography request (no persistent daemon in v1).
- Timeouts are enforced by the TypeScript adapter (see `runtime-boundary.md` for timeout model).
- Python core writes its structured response to stdout and exits `0` on success, non-zero on fatal error.
- Diagnostic messages (warnings, partial-result markers) are embedded in the response envelope, not stderr.
- Fatal startup exceptions may appear on stderr and are captured by the TypeScript adapter.

### Wire format

All messages over stdin/stdout are **newline-delimited JSON** (NDJSON) — one complete JSON object per line.

Request and response envelope schemas are defined in `runtime-boundary.md`.

---

## Versioning Implication

| Actor | Responsibility |
|---|---|
| Python core | Declares `schema_version` in every response envelope |
| TypeScript server adapter | Reads `schema_version`, evaluates against supported range, applies fallback or rejects |
| Python core | Must never write a schema that violates a previously declared version's structural contract |
| TypeScript server | Must never modify the `schema_version` field in a response or produce synthetic schema structures |

See `compatibility-matrix.md` for the full version negotiation policy.

---

## Rationale

The split follows the principle of **engine concerns vs orchestration concerns**:

- Cartography engines (scanning, parsing, graph resolution, schema production) are compute-intensive, path-sensitive operations best owned by a single language with strong stdlib support for file I/O and AST analysis. Python stdlib provides `ast`, `pathlib`, `json`, `os.walk`, and `dataclasses` — all zero-dependency tools for cartography.
- Orchestration (process lifecycle, transport, MCP protocol, caching, compatibility negotiation) is TypeScript's domain because the MCP server is TypeScript, and process management is naturally owned by the parent process.

Separating these concerns allows:
- Python core to evolve its schema independently, with clear semver semantics.
- TypeScript adapters to add new compatibility layers without requiring Python core changes.
- Tests for each layer to be written independently with clear mocking surfaces at the subprocess boundary.

---

## Open Constraints

1. Python core must produce deterministic output (stable ordering, stable identity keys) so TypeScript can diff outputs across runs. See `runtime-boundary.md` and downstream contract docs.
2. TypeScript must never assume schema fields are present without validating `schema_version` first.
3. The Python subprocess must complete within the timeout declared in the request envelope or return a partial result with a `timeout` diagnostic marker.

---

*See also: [compatibility-matrix.md](./compatibility-matrix.md) | [runtime-boundary.md](./runtime-boundary.md)*
