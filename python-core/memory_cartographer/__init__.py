"""
memory_cartographer
===================

Python core package for the memory_cartographer system.

This package is the **canonical cartography engine and schema producer** for the
Project Memory MCP system. It owns:

- File-system scanning (include/exclude filters, depth caps, symlink containment)
- Symbol extraction (AST parsing, regex fallback)
- Dependency graph resolution (topological sort, tier classification, entry-point detection)
- Database cartography (schema introspection, relation mapping, query touchpoint detection)
- Canonical JSON output schema production (versioned envelope with full provenance)

TypeScript server ownership
---------------------------
The TypeScript MCP server is the orchestration and compatibility adapter layer.
It invokes this package as a subprocess over stdin/stdout using NDJSON envelopes.
It never mutates schema structures emitted by this package.

See: docs/architecture/memory-cartographer/implementation-boundary.md

Runtime entry point
-------------------
The subprocess entry point is::

    python -m memory_cartographer.runtime.entrypoint

The entry point reads a JSON request envelope from stdin, dispatches the requested
action, and writes a JSON response envelope to stdout before exiting.

See: docs/architecture/memory-cartographer/runtime-boundary.md

Schema versioning
-----------------
This package declares and owns the canonical ``schema_version`` field embedded in
every response envelope. The TypeScript adapter reads this version and applies
compatibility negotiation. Version bumps follow semantic versioning:

- **MAJOR** — breaking structural changes to the output envelope.
- **MINOR** — additive changes (new optional fields); TypeScript adapts gracefully.
- **PATCH** — bug fixes with no structural change.

See: docs/architecture/memory-cartographer/compatibility-matrix.md
"""

# Package version — matches the schema_version emitted in output envelopes.
__version__ = "0.1.0"
