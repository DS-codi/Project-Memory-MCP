"""
code_cartography.py
-------------------
Engine stub for code cartography: file inventory, symbol extraction,
cross-file reference resolution, module graph construction, architecture
edge detection, and dependency flow analysis.

Ownership: Python core — this module is the canonical producer of the
code_cartography section of the memory_cartographer output envelope.

See:
    docs/contracts/sections/code-cartography.schema.json
    docs/contracts/memory-cartographer-contract.md
    docs/contracts/normalization-rules.md
    docs/architecture/memory-cartographer/implementation-boundary.md

Ordering guarantees (this module is responsible for enforcing):
    files           : sorted by workspace-relative path ascending
    symbols         : sorted by (file, start_line, name) ascending
    references      : sorted by (from_file, from_line, to_file) ascending
    architecture_edges : sorted by (from_module, to_module) ascending
    module_graph.nodes : sorted ascending
    module_graph.edges : sorted by (from, to) ascending
    dependency_flow.tiers[n] : each tier sorted ascending
    dependency_flow.entry_points : sorted ascending
"""

from __future__ import annotations

import fnmatch
import os
import time
from collections import Counter
from dataclasses import asdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from typing import Optional

from memory_cartographer.guardrails.scope_limits import LANGUAGE_EXTENSION_MAP, is_path_allowed


# ---------------------------------------------------------------------------
# Data classes — structural stubs matching code-cartography.schema.json
# ---------------------------------------------------------------------------


@dataclass
class CodeFile:
    """A single source file within the scan scope.

    Identity key: workspace_relative path (the ``path`` field).
    Sort key for the ``files`` array: ``path`` ascending.
    """

    path: str
    """Workspace-relative path (forward-slash, no leading slash)."""

    language: str
    """Detected language identifier (e.g., 'python', 'typescript', 'rust')."""

    size_bytes: int
    """File size in bytes at scan time."""

    mtime_unix_ns: int
    """Last-modification time as Unix nanoseconds."""

    symbol_count: int = 0
    """Number of symbols extracted from this file."""

    parse_error: bool = False
    """True if the file could not be fully parsed."""


@dataclass
class Symbol:
    """An extracted symbol definition.

    Identity key: ``{workspace_relative_file_path}::{symbol_name}``
    See normalization-rules.md for full identity key rules.
    Sort key for the ``symbols`` array: (file, start_line, name) ascending.
    """

    id: str
    """Stable identity key: '{file}::{name}'."""

    file: str
    """Workspace-relative path of the file containing this symbol."""

    name: str
    """Symbol name as it appears in source code."""

    kind: str
    """Symbol kind: function | class | method | variable | constant |
    interface | type | module | enum | unknown."""

    start_line: int
    """1-based line number where the symbol definition starts."""

    qualified_name: Optional[str] = None
    """Fully qualified name (namespace/module prefix), when determinable."""

    end_line: Optional[int] = None
    """1-based line number where the symbol definition ends."""

    exported: Optional[bool] = None
    """True if the symbol is exported/public from its module."""


@dataclass
class Reference:
    """A cross-file symbol reference (call site, import, usage).

    Sort key for the ``references`` array: (from_file, from_line, to_file) ascending.
    """

    from_file: str
    """Workspace-relative path of the file containing the reference."""

    from_line: int
    """1-based line number of the reference site."""

    to_symbol_id: str
    """Stable identity key of the referenced symbol (matches Symbol.id)."""

    to_file: Optional[str] = None
    """Workspace-relative path of the file defining the referenced symbol."""

    reference_kind: Optional[str] = None
    """Reference kind: import | call | inherit | instanceof | type_reference | unknown."""


# ---------------------------------------------------------------------------
# CodeCartographyEngine
# ---------------------------------------------------------------------------


_DEFAULT_SCOPE_EXCLUDES = {
    ".git",
    "__pycache__",
    "node_modules",
    ".venv",
    "dist",
    "build",
    "target",
}

_EXTENSION_TO_LANGUAGE = {
    extension.lower(): language
    for language, extensions in LANGUAGE_EXTENSION_MAP.items()
    for extension in extensions
}


class CodeCartographyEngine:
    """Engine that produces the ``code_cartography`` section of the output envelope.

    The engine is responsible for:
    - Discovering and inventorying source files within scope.
    - Extracting symbol definitions via AST parsing (with regex fallback).
    - Resolving cross-file references.
    - Constructing the module dependency graph.
    - Detecting architectural edges (layer boundaries, cross-concern calls).
    - Computing topological dependency tiers and entry points.

    All output arrays must be sorted per the ordering guarantees defined in
    ``docs/contracts/sections/code-cartography.schema.json`` before the
    result dict is returned.

    TODO: Implement each sub-engine (file scanner, symbol extractor,
          reference resolver, graph builder, architecture detector).
    """

    def scan(
        self,
        workspace_path: str,
        scope: dict,
        languages: Optional[list[str]] = None,
        timeout_ms: Optional[int] = None,
    ) -> dict:
        """Run the code cartography scan and return the section dict.

        Args:
            workspace_path: Absolute path to the workspace root.
            scope: Scope configuration dict (include/exclude patterns,
                   max_depth, etc.). See scope_limits.py for the full schema.
            languages: Optional list of language identifiers to scan.
                       When None, all supported languages are scanned.
            timeout_ms: Optional time budget in milliseconds. The engine
                        should checkpoint against this budget and set
                        ``partial: True`` if the budget is exhausted.

        Returns:
            A dict matching the ``CodeCartographySection`` schema in
            ``docs/contracts/sections/code-cartography.schema.json``.
            All array fields are always present (may be empty lists).
            ``partial`` is only included when True.
        """
        started_at = time.monotonic()

        normalized_scope = scope if isinstance(scope, dict) else {}
        normalized_languages = self._normalize_language_filters(languages)
        files = self._discover_files(
            workspace_path=workspace_path,
            scope=normalized_scope,
            languages=normalized_languages,
        )
        symbols = self._extract_symbols(files)
        references = self._resolve_references(files, symbols)
        module_graph = self._build_module_graph(references)
        if not module_graph.get("nodes"):
            module_graph["nodes"] = [entry.path for entry in files]
        architecture_edges = self._detect_architecture_edges(module_graph)
        dependency_flow = self._compute_dependency_flow(module_graph)

        payload: dict[str, Any] = {
            "files": [asdict(entry) for entry in files],
            "symbols": [asdict(entry) for entry in symbols],
            "references": [asdict(entry) for entry in references],
            "module_graph": module_graph,
            "architecture_edges": architecture_edges,
            "dependency_flow": dependency_flow,
        }

        if timeout_ms is not None and timeout_ms > 0:
            elapsed_ms = int((time.monotonic() - started_at) * 1000)
            if elapsed_ms > timeout_ms:
                payload["partial"] = True

        return payload

    def build_summary(
        self,
        workspace_path: str,
        scope: Optional[dict] = None,
        languages: Optional[list[str]] = None,
        timeout_ms: Optional[int] = None,
    ) -> dict[str, Any]:
        """Build a deterministic high-level summary for runtime ``summary`` queries.

        This is intentionally minimal for the runtime summary slice. It exposes
        stable aggregate counts while deeper symbol/reference graph features are
        implemented in later phases.
        """
        section = self.scan(
            workspace_path=workspace_path,
            scope=scope or {},
            languages=languages,
            timeout_ms=timeout_ms,
        )

        files = section["files"]
        module_graph = section["module_graph"]
        dependency_flow = section["dependency_flow"]

        language_counts = Counter(
            file_entry["language"]
            for file_entry in files
            if isinstance(file_entry.get("language"), str)
        )
        language_breakdown = [
            {"language": language, "file_count": language_counts[language]}
            for language in sorted(language_counts)
        ]

        summary: dict[str, Any] = {
            "file_count": len(files),
            "module_count": len(module_graph.get("nodes", [])),
            "symbol_count": len(section["symbols"]),
            "dependency_edge_count": len(module_graph.get("edges", [])),
            "entry_point_count": len(dependency_flow.get("entry_points", [])),
            "architecture_layers": [],
            "has_cycles": bool(dependency_flow.get("cycles")),
            "language_count": len(language_breakdown),
            "language_breakdown": language_breakdown,
        }
        if section.get("partial"):
            summary["partial"] = True

        return summary

    def build_runtime_summary_result(
        self,
        workspace_path: Optional[str],
        scope: Optional[dict] = None,
        languages: Optional[list[str]] = None,
        timeout_ms: Optional[int] = None,
    ) -> dict[str, Any]:
        """Build the minimal runtime summary envelope payload.

        The runtime entrypoint summary path can consume this payload directly.
        """
        normalized_scope = scope if isinstance(scope, dict) else {}
        normalized_languages = self._normalize_language_filters(languages)
        safe_workspace_path = workspace_path if isinstance(workspace_path, str) else None

        return {
            "query": "summary",
            "engine": "code_cartography",
            "runtime_slice": "minimal_summary_v1",
            "workspace": {
                "path": safe_workspace_path,
                "scope": normalized_scope,
                "languages": normalized_languages,
            },
            "summary": self.build_summary(
                workspace_path=workspace_path or "",
                scope=normalized_scope,
                languages=normalized_languages,
                timeout_ms=timeout_ms,
            ),
            "budget": {
                "timeout_ms": timeout_ms,
            },
        }

    # ------------------------------------------------------------------
    # Public query methods — wired from entrypoint.py dispatch branches
    # ------------------------------------------------------------------

    def get_file_context(
        self,
        workspace_path: str,
        file_id: str,
        include_symbols: bool = True,
        include_references: bool = True,
    ) -> dict[str, Any]:
        """Return file-level context for a specific file.

        Scans the workspace to confirm the file exists, then returns symbol
        and reference data filtered to that file.  Symbol extraction is not
        yet implemented, so ``symbols`` and ``references`` are always empty.
        """
        files = self._discover_files(workspace_path=workspace_path, scope={})
        matched = [f for f in files if f.path == file_id]
        file_meta = matched[0] if matched else None

        result: dict[str, Any] = {"file_id": file_id}
        if file_meta:
            result["language"] = file_meta.language
            result["size_bytes"] = file_meta.size_bytes
        if include_symbols:
            result["symbols"] = []
        if include_references:
            result["references"] = []
        return result

    def get_flow_entry_points(
        self,
        workspace_path: str,
        layer_filter: Optional[list[str]] = None,
        language_filter: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """Return dependency-flow entry points.

        Delegates to ``_compute_dependency_flow`` over the module graph
        built from the scan.  Reference resolution is not yet implemented,
        so the module graph is derived from file paths only.
        """
        files = self._discover_files(
            workspace_path=workspace_path,
            scope={},
            languages=language_filter,
        )
        references = self._resolve_references(files, self._extract_symbols(files))
        module_graph = self._build_module_graph(references)
        if not module_graph.get("nodes"):
            module_graph["nodes"] = [f.path for f in files]
        flow = self._compute_dependency_flow(module_graph)
        return {
            "entry_points": flow.get("entry_points", []),
            "tiers": flow.get("tiers", []),
            "cycles": flow.get("cycles", []),
        }

    def get_layer_view(
        self,
        workspace_path: str,
        layers: list[str],
        depth: int = 1,
        include_cross_layer_edges: bool = False,
    ) -> dict[str, Any]:
        """Return architecture layer view filtered by layer labels.

        Architecture-edge detection is not yet implemented; nodes and edges
        are always empty at this stage.
        """
        return {
            "layers": layers or [],
            "nodes": [],
            "edges": [],
        }

    def get_search(
        self,
        workspace_path: str,
        search_query: str,
        search_scope: str = "all",
        limit: int = 50,
    ) -> dict[str, Any]:
        """Return keyword search results across files and symbols.

        Basic implementation: performs case-insensitive substring match
        against discovered file paths.  Symbol-level search is not yet
        implemented.
        """
        if not search_query:
            return {"search_query": search_query, "scope": search_scope, "results": [], "total": 0}

        files = self._discover_files(workspace_path=workspace_path, scope={})
        query_lower = search_query.lower()
        matched = [
            {"type": "file", "path": f.path, "language": f.language}
            for f in files
            if query_lower in f.path.lower()
        ][:limit]
        return {
            "search_query": search_query,
            "scope": search_scope,
            "results": matched,
            "total": len(matched),
        }

    def get_slice_detail(
        self,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """Return detail for a specific architecture slice.

        Stub implementation — returns a valid empty-detail envelope.
        """
        return {
            "slice_id": params.get("slice_id"),
            "detail": {},
            "nodes": [],
            "edges": [],
        }

    def get_slice_projection(
        self,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """Return projection of an architecture slice.

        Stub implementation — returns a valid empty-projection envelope.
        """
        return {
            "slice_id": params.get("slice_id"),
            "projection_type": params.get("projection_type"),
            "projected_nodes": [],
            "projected_edges": [],
        }

    def get_slice_filters(
        self,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """Return available filters for architecture slices.

        Stub implementation — returns a valid empty-filters envelope.
        """
        return {
            "filters": [],
            "available_types": [],
            "workspace_id": params.get("workspace_id"),
        }

    # ------------------------------------------------------------------
    # Private sub-steps (stubs — to be implemented in later phases)
    # ------------------------------------------------------------------

    def _discover_files(
        self,
        workspace_path: str,
        scope: dict,
        languages: Optional[list[str]] = None,
    ) -> list[CodeFile]:
        """Discover and inventory source files within scope.

        Returns a list sorted by workspace-relative path ascending.
        """
        if not isinstance(workspace_path, str) or not workspace_path.strip():
            return []

        root = Path(workspace_path).resolve()
        if not root.is_dir():
            return []

        include_patterns = self._normalize_patterns(scope.get("include"))
        if not include_patterns:
            include_patterns = self._normalize_patterns(scope.get("include_patterns"))
        exclude_patterns = self._normalize_patterns(scope.get("exclude"))
        if not exclude_patterns:
            exclude_patterns = self._normalize_patterns(scope.get("exclude_patterns"))

        max_depth = self._coerce_non_negative_int(scope.get("max_depth"), default=15)
        language_filter = set(self._normalize_language_filters(languages))

        discovered: list[CodeFile] = []
        for current_root, dirs, files in os.walk(root, topdown=True):
            relative_dir = Path(current_root).resolve().relative_to(root).as_posix()
            current_depth = 0 if relative_dir == "." else relative_dir.count("/") + 1

            # Keep directory traversal deterministic and bounded.
            filtered_dirs = []
            for directory_name in sorted(dirs):
                if directory_name in _DEFAULT_SCOPE_EXCLUDES:
                    continue
                next_depth = current_depth + 1
                if next_depth > max_depth:
                    continue
                filtered_dirs.append(directory_name)
            dirs[:] = filtered_dirs

            for file_name in sorted(files):
                file_path = Path(current_root) / file_name
                try:
                    relative_path = file_path.resolve().relative_to(root).as_posix()
                except (OSError, ValueError):
                    continue

                if relative_path.count("/") > max_depth:
                    continue

                if not self._is_path_in_scope(
                    relative_path=relative_path,
                    include_patterns=include_patterns,
                    exclude_patterns=exclude_patterns,
                ):
                    continue

                language = self._detect_language(file_path)
                if language is None:
                    continue
                if language_filter and language not in language_filter:
                    continue

                try:
                    stat = file_path.stat()
                except OSError:
                    continue

                discovered.append(
                    CodeFile(
                        path=relative_path,
                        language=language,
                        size_bytes=int(stat.st_size),
                        mtime_unix_ns=int(getattr(stat, "st_mtime_ns", int(stat.st_mtime * 1_000_000_000))),
                        symbol_count=0,
                        parse_error=False,
                    )
                )

        discovered.sort(key=lambda entry: entry.path)
        return discovered

    def _extract_symbols(self, files: list[CodeFile]) -> list[Symbol]:
        """Extract symbol definitions from the discovered files.

        Returns a list sorted by (file, start_line, name) ascending.
        """
        # Minimal runtime slice: no symbol extraction yet.
        return []

    def _resolve_references(
        self, files: list[CodeFile], symbols: list[Symbol]
    ) -> list[Reference]:
        """Resolve cross-file symbol references.

        Returns a list sorted by (from_file, from_line, to_file) ascending.
        """
        # Minimal runtime slice: no reference resolution yet.
        return []

    def _build_module_graph(self, references: list[Reference]) -> dict:
        """Build the adjacency module graph from the reference list.

        Returns a dict matching ModuleGraph in code-cartography.schema.json.
        """
        if not references:
            return {"nodes": [], "edges": []}

        nodes = sorted(
            {
                module
                for reference in references
                for module in (reference.from_file, reference.to_file)
                if isinstance(module, str) and module
            }
        )
        edges = [
            {"from": reference.from_file, "to": reference.to_file, "kind": reference.reference_kind or "unknown"}
            for reference in references
            if isinstance(reference.to_file, str) and reference.to_file
        ]
        edges.sort(key=lambda edge: (edge["from"], edge["to"], edge["kind"]))

        return {"nodes": nodes, "edges": edges}

    def _detect_architecture_edges(self, module_graph: dict) -> list[dict]:
        """Detect higher-level architectural edges from the module graph.

        Returns a list sorted by (from_module, to_module) ascending.
        """
        # Minimal runtime slice: no architecture-edge inference yet.
        return []

    def _compute_dependency_flow(self, module_graph: dict) -> dict:
        """Compute topological tiers, entry points, and cycles.

        Returns a dict matching DependencyFlow in code-cartography.schema.json.
        """
        nodes = sorted(
            node
            for node in module_graph.get("nodes", [])
            if isinstance(node, str) and node
        )
        return {
            "tiers": [nodes] if nodes else [],
            "entry_points": nodes,
            "cycles": [],
        }

    @staticmethod
    def _coerce_non_negative_int(value: Any, default: int) -> int:
        if isinstance(value, bool):
            return default
        if isinstance(value, int):
            return max(0, value)
        return default

    @staticmethod
    def _normalize_patterns(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        patterns = []
        for item in value:
            if isinstance(item, str):
                normalized = item.strip().replace("\\", "/")
                if normalized:
                    patterns.append(normalized)
        return patterns

    @staticmethod
    def _normalize_language_filters(languages: Optional[list[str]]) -> list[str]:
        if not languages:
            return []

        deduped: set[str] = set()
        normalized: list[str] = []
        for language in languages:
            if not isinstance(language, str):
                continue
            candidate = language.strip().lower()
            if not candidate or candidate in deduped:
                continue
            deduped.add(candidate)
            normalized.append(candidate)
        normalized.sort()
        return normalized

    @staticmethod
    def _matches_pattern(path: str, pattern: str) -> bool:
        normalized_path = path.replace("\\", "/")
        normalized_pattern = pattern.replace("\\", "/")

        if normalized_pattern.startswith("**/"):
            suffix = normalized_pattern[3:]
            parts = normalized_path.split("/")
            return any(
                fnmatch.fnmatch("/".join(parts[index:]), suffix)
                for index in range(len(parts))
            )

        return fnmatch.fnmatch(normalized_path, normalized_pattern)

    def _is_path_in_scope(
        self,
        relative_path: str,
        include_patterns: list[str],
        exclude_patterns: list[str],
    ) -> bool:
        if not is_path_allowed(relative_path):
            return False

        if exclude_patterns and any(
            self._matches_pattern(relative_path, pattern)
            for pattern in exclude_patterns
        ):
            return False

        if include_patterns:
            return any(
                self._matches_pattern(relative_path, pattern)
                for pattern in include_patterns
            )

        return True

    @staticmethod
    def _detect_language(file_path: Path) -> Optional[str]:
        return _EXTENSION_TO_LANGUAGE.get(file_path.suffix.lower())
