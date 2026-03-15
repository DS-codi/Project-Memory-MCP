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
import re
import time
from collections import Counter
from dataclasses import asdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from typing import Optional
from urllib.parse import unquote

from memory_cartographer.guardrails.safety import should_skip_file, is_path_safe
from memory_cartographer.guardrails.perf_budget import PerfTracker, PerfConfig
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

        # Compute a shared deadline (90 % of the budget) so each phase can
        # bail out early and Python can write a partial response before the
        # TypeScript subprocess timeout kills the process.
        deadline: Optional[float] = None
        if timeout_ms is not None and timeout_ms > 0:
            deadline = started_at + (timeout_ms / 1000.0) * 0.90

        normalized_scope = scope if isinstance(scope, dict) else {}
        normalized_languages = self._normalize_language_filters(languages)
        files = self._discover_files(
            workspace_path=workspace_path,
            scope=normalized_scope,
            languages=normalized_languages,
            deadline=deadline,
        )
        workspace_root = Path(workspace_path)
        symbols = self._extract_symbols(files, workspace_root, deadline=deadline)
        references = self._resolve_references(files, symbols, workspace_root)
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
        and reference data filtered to that file.
        """
        workspace_root = Path(workspace_path)
        files = self._discover_files(workspace_path=workspace_path, scope={})
        matched = [f for f in files if f.path == file_id]
        file_meta = matched[0] if matched else None

        result: dict[str, Any] = {"file_id": file_id}
        if file_meta:
            result["language"] = file_meta.language
            result["size_bytes"] = file_meta.size_bytes
        if include_symbols or include_references:
            all_symbols = self._extract_symbols(files, workspace_root)
        if include_symbols:
            symbols = [s for s in all_symbols if s.file == file_id]
            result["symbols"] = [asdict(s) for s in symbols]
        if include_references:
            all_refs = self._resolve_references(files, all_symbols, workspace_root)
            references = [r for r in all_refs if r.from_file == file_id]
            result["references"] = [asdict(r) for r in references]
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
        workspace_root = Path(workspace_path)
        references = self._resolve_references(files, self._extract_symbols(files, workspace_root), workspace_root)
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
        """Return architecture layer view based on top-level directory grouping."""
        workspace_root = Path(workspace_path)
        files = self._discover_files(workspace_path=workspace_path, scope={})

        # Group files by top-level directory
        groups: dict[str, list] = {}
        for f in files:
            parts = f.path.split('/')
            group_name = parts[0] if len(parts) > 1 else '(root)'
            groups.setdefault(group_name, []).append(f)

        layer_objects = [
            {
                'id': group_name,
                'name': group_name,
                'node_count': len(group_files),
                'file_types': sorted(set(
                    os.path.splitext(f.path)[1]
                    for f in group_files
                    if os.path.splitext(f.path)[1]
                )),
            }
            for group_name, group_files in sorted(groups.items())
        ]

        # Build inter-layer edges from import references
        all_refs = self._resolve_references(files, [], workspace_root)
        seen_edges: set = set()
        edges = []
        for ref in all_refs:
            if ref.to_file is None:
                continue
            from_parts = ref.from_file.split('/')
            to_parts = ref.to_file.split('/')
            from_layer = from_parts[0] if len(from_parts) > 1 else '(root)'
            to_layer = to_parts[0] if len(to_parts) > 1 else '(root)'
            if from_layer == to_layer:
                continue
            edge_key = (from_layer, to_layer)
            if edge_key in seen_edges:
                continue
            seen_edges.add(edge_key)
            edges.append({'from': from_layer, 'to': to_layer})

        return {
            'layers': layer_objects,
            'nodes': [f.path for f in files],
            'edges': edges,
        }

    def get_search(
        self,
        workspace_path: str,
        search_query: str,
        search_scope: str = "all",
        limit: int = 50,
    ) -> dict[str, Any]:
        """Return keyword search results across files and symbols.

        Performs case-insensitive substring match against file paths and
        symbol names.
        """
        if not search_query:
            return {"search_query": search_query, "scope": search_scope, "results": [], "total": 0}

        workspace_root = Path(workspace_path)
        files = self._discover_files(workspace_path=workspace_path, scope={})
        query_lower = search_query.lower()

        file_results = [
            {"type": "file", "path": f.path, "language": f.language}
            for f in files
            if query_lower in f.path.lower()
        ]

        all_symbols = self._extract_symbols(files, workspace_root)
        symbol_results = [
            {"type": "symbol", "name": s.name, "file": s.file, "kind": s.kind, "line": s.start_line}
            for s in all_symbols
            if query_lower in s.name.lower()
        ]

        # Combine: file results first, then symbol results; deduplicate file entries
        seen_file_paths = {r["path"] for r in file_results}
        combined = file_results[:]
        for sr in symbol_results:
            combined.append(sr)

        combined = combined[:limit]
        return {
            "search_query": search_query,
            "scope": search_scope,
            "results": combined,
            "total": len(combined),
        }

    def get_slice_detail(
        self,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """Return detail for a specific architecture slice.

        Computes scope-filtered nodes and dependency edges from discovered
        files/symbols/references (when provided) and slice metadata.
        Falls back to workspace discovery when ``workspace_path`` is present.
        """
        normalized_params = params if isinstance(params, dict) else {}
        metadata = self._extract_slice_metadata(normalized_params)

        slice_id = self._coerce_text(normalized_params.get("slice_id"))
        workspace_id = self._coerce_text(
            normalized_params.get("workspace_id") or metadata.get("workspace_id")
        )

        scope = self._normalize_slice_scope(
            normalized_params.get("slice_scope")
            or normalized_params.get("scope")
            or metadata.get("scope")
            or {
                "scope_type": normalized_params.get("scope_type"),
                "patterns": normalized_params.get("patterns"),
                "include_transitive": normalized_params.get("include_transitive"),
                "depth": normalized_params.get("depth"),
            }
        )
        filters = self._normalize_slice_filters(
            normalized_params.get("filters")
            or metadata.get("filters")
        )

        files, symbols, references = self._extract_slice_graph_inputs(normalized_params)

        # Fallback: materialize discovered graph inputs from workspace path.
        if not files:
            workspace_path = self._coerce_text(normalized_params.get("workspace_path"))
            if workspace_path:
                discovered_files = self._discover_files(workspace_path=workspace_path, scope={})
                files = self._normalize_slice_files([asdict(entry) for entry in discovered_files])

                workspace_root = Path(workspace_path)
                if not symbols:
                    symbols = self._normalize_slice_symbols(
                        [asdict(entry) for entry in self._extract_symbols(discovered_files, workspace_root)]
                    )
                if not references:
                    extracted_symbols = self._extract_symbols(discovered_files, workspace_root)
                    references = self._normalize_slice_references(
                        [
                            asdict(entry)
                            for entry in self._resolve_references(
                                discovered_files,
                                extracted_symbols,
                                workspace_root,
                            )
                        ]
                    )

        scoped_paths = self._select_slice_scope_paths(files, references, scope)

        nodes = [node for node in files if node["path"] in scoped_paths]
        nodes.sort(key=lambda node: node["path"])

        edges = self._build_slice_edges(scoped_paths, references)

        symbol_count = self._count_symbols_in_scope(symbols, scoped_paths, nodes)

        truncated = False
        node_hard_max = 2000
        edge_hard_max = 5000
        if len(nodes) > node_hard_max:
            nodes = nodes[:node_hard_max]
            truncated = True
        if len(edges) > edge_hard_max:
            edges = edges[:edge_hard_max]
            truncated = True

        projection_summary = {
            "file_count": len(nodes),
            "symbol_count": symbol_count,
            "edge_count": len(edges),
        }

        name = self._coerce_text(metadata.get("name"), default=slice_id)
        description = metadata.get("description")
        if not isinstance(description, str):
            description = None

        detail: dict[str, Any] = {
            "slice_id": slice_id,
            "name": name,
            "workspace_id": workspace_id,
            "scope": scope,
            "filters": filters,
            "projection_summary": projection_summary,
            "truncated": truncated,
        }
        if description:
            detail["description"] = description

        result: dict[str, Any] = {
            "slice_id": slice_id,
            "detail": detail,
            "nodes": nodes,
            "edges": edges,
            "name": name,
            "workspace_id": workspace_id,
            "scope": scope,
            "filters": filters,
            "projection_summary": projection_summary,
            "truncated": truncated,
            "diagnostics": [],
        }
        if description:
            result["description"] = description
        if workspace_id and slice_id:
            result["result_uri"] = f"architecture://ws_{workspace_id}/slices/{slice_id}"

        return result

    def _extract_slice_metadata(self, params: dict[str, Any]) -> dict[str, Any]:
        for key in ("slice_metadata", "slice", "metadata", "detail"):
            value = params.get(key)
            if isinstance(value, dict):
                return dict(value)
        return {}

    def _extract_slice_graph_inputs(
        self,
        params: dict[str, Any],
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
        discovered = params.get("discovered") if isinstance(params.get("discovered"), dict) else {}
        cartography = params.get("code_cartography") if isinstance(params.get("code_cartography"), dict) else {}

        raw_files = self._first_list_value(
            params.get("discovered_files"),
            params.get("files"),
            discovered.get("files"),
            cartography.get("files"),
        )
        raw_symbols = self._first_list_value(
            params.get("discovered_symbols"),
            params.get("symbols"),
            discovered.get("symbols"),
            cartography.get("symbols"),
        )
        raw_references = self._first_list_value(
            params.get("discovered_references"),
            params.get("references"),
            params.get("edges"),
            discovered.get("references"),
            cartography.get("references"),
        )

        files = self._normalize_slice_files(raw_files)
        symbols = self._normalize_slice_symbols(raw_symbols)
        references = self._normalize_slice_references(raw_references)

        return files, symbols, references

    @staticmethod
    def _first_list_value(*values: Any) -> list[Any]:
        for value in values:
            if isinstance(value, list):
                return value
        return []

    @staticmethod
    def _coerce_text(value: Any, default: str = "") -> str:
        if isinstance(value, str):
            candidate = value.strip()
            if candidate:
                return candidate
        return default

    @staticmethod
    def _normalize_path_value(value: Any) -> str:
        if not isinstance(value, str):
            return ""

        candidate = unquote(value.strip())
        if not candidate:
            return ""

        candidate = candidate.replace("\\", "/")
        while "//" in candidate:
            candidate = candidate.replace("//", "/")
        if candidate.startswith("./"):
            candidate = candidate[2:]
        return candidate.lstrip("/")

    @staticmethod
    def _layer_tag_from_path(path: str) -> Optional[str]:
        parts = path.split("/")
        if len(parts) > 1 and parts[0]:
            return parts[0]
        return None

    def _module_id_from_path(self, path: str) -> str:
        normalized = self._normalize_path_value(path)
        if not normalized:
            return ""

        stem, _ = os.path.splitext(normalized)
        if stem.endswith("/__init__"):
            stem = stem[: -len("/__init__")]
        return stem.replace("/", ".")

    def _normalize_slice_scope(self, raw_scope: Any) -> dict[str, Any]:
        scope = raw_scope if isinstance(raw_scope, dict) else {}

        scope_type = self._coerce_text(scope.get("scope_type"), default="explicit_files").lower()
        allowed_scope_types = {"path_glob", "layer_tag", "module_prefix", "explicit_files"}
        if scope_type not in allowed_scope_types:
            scope_type = "explicit_files"

        raw_patterns = scope.get("patterns") if isinstance(scope.get("patterns"), list) else []
        patterns: list[str] = []
        for raw_pattern in raw_patterns:
            if not isinstance(raw_pattern, str):
                continue

            if scope_type == "path_glob":
                pattern = raw_pattern.strip().replace("\\", "/")
            elif scope_type == "module_prefix":
                pattern = raw_pattern.strip().replace("/", ".")
            elif scope_type == "layer_tag":
                pattern = raw_pattern.strip()
            else:
                pattern = self._normalize_path_value(raw_pattern)

            if pattern:
                patterns.append(pattern)

        normalized_scope: dict[str, Any] = {
            "scope_type": scope_type,
            "patterns": sorted(set(patterns)),
            "include_transitive": bool(scope.get("include_transitive", False)),
        }

        depth_value = scope.get("depth")
        if isinstance(depth_value, int) and not isinstance(depth_value, bool) and depth_value >= 0:
            normalized_scope["depth"] = depth_value

        return normalized_scope

    def _normalize_slice_filters(self, raw_filters: Any) -> list[dict[str, Any]]:
        if not isinstance(raw_filters, list):
            return []

        normalized_filters: list[dict[str, Any]] = []
        for filter_value in raw_filters:
            if not isinstance(filter_value, dict):
                continue

            filter_type = self._coerce_text(
                filter_value.get("filter_type") or filter_value.get("type")
            ).lower()
            if not filter_type:
                continue

            values = filter_value.get("values")
            if not isinstance(values, list):
                continue

            normalized_values = sorted({self._coerce_text(value) for value in values if self._coerce_text(value)})
            if not normalized_values:
                continue

            item: dict[str, Any] = {
                "filter_type": filter_type,
                "values": normalized_values,
            }
            if bool(filter_value.get("exclude", False)):
                item["exclude"] = True
            normalized_filters.append(item)

        normalized_filters.sort(
            key=lambda item: (
                item.get("filter_type", ""),
                "|".join(item.get("values", [])),
                1 if item.get("exclude") else 0,
            )
        )
        return normalized_filters

    def _normalize_slice_files(self, raw_files: Any) -> list[dict[str, Any]]:
        if not isinstance(raw_files, list):
            return []

        deduped: dict[str, dict[str, Any]] = {}

        for raw_file in raw_files:
            if isinstance(raw_file, dict):
                file_map = raw_file
            else:
                file_map = asdict(raw_file) if hasattr(raw_file, "__dataclass_fields__") else {}

            path = self._normalize_path_value(
                file_map.get("path") or file_map.get("file_id") or file_map.get("file")
            )
            if not path:
                continue

            language = self._coerce_text(file_map.get("language"), default="unknown")
            module_id = self._coerce_text(file_map.get("module_id"), default=self._module_id_from_path(path))
            layer_tag = self._coerce_text(file_map.get("layer_tag")) or self._layer_tag_from_path(path)
            loc = self._coerce_non_negative_int(
                file_map.get("loc") if isinstance(file_map.get("loc"), int) else file_map.get("symbol_count"),
                default=0,
            )

            entry: dict[str, Any] = {
                "file_id": path,
                "path": path,
                "language": language,
                "module_id": module_id,
                "loc": loc,
            }
            if layer_tag:
                entry["layer_tag"] = layer_tag

            deduped[path] = entry

        return [deduped[path] for path in sorted(deduped)]

    def _normalize_slice_symbols(self, raw_symbols: Any) -> list[dict[str, Any]]:
        if not isinstance(raw_symbols, list):
            return []

        normalized: list[dict[str, Any]] = []
        for raw_symbol in raw_symbols:
            if isinstance(raw_symbol, dict):
                symbol_map = raw_symbol
            else:
                symbol_map = asdict(raw_symbol) if hasattr(raw_symbol, "__dataclass_fields__") else {}

            file_path = self._normalize_path_value(
                symbol_map.get("file") or symbol_map.get("file_id") or symbol_map.get("path")
            )
            if not file_path:
                continue

            name = self._coerce_text(symbol_map.get("name"))
            start_line = self._coerce_non_negative_int(symbol_map.get("start_line"), default=0)
            symbol_id = self._coerce_text(symbol_map.get("symbol_id") or symbol_map.get("id"))
            if not symbol_id:
                symbol_id = f"{file_path}::{name}" if name else f"{file_path}::__symbol__:{start_line}"

            entry: dict[str, Any] = {
                "symbol_id": symbol_id,
                "file": file_path,
                "name": name,
                "kind": self._coerce_text(symbol_map.get("kind")),
                "start_line": start_line,
            }

            end_line = symbol_map.get("end_line")
            if isinstance(end_line, int) and not isinstance(end_line, bool):
                entry["end_line"] = max(start_line, end_line)

            visibility = self._coerce_text(symbol_map.get("visibility")).lower()
            if not visibility:
                exported = symbol_map.get("exported")
                if isinstance(exported, bool):
                    visibility = "exported" if exported else "internal"
            if visibility:
                entry["visibility"] = visibility

            normalized.append(entry)

        normalized.sort(
            key=lambda symbol: (
                symbol["file"],
                symbol["start_line"],
                symbol["name"],
                symbol["symbol_id"],
            )
        )
        return normalized

    def _normalize_slice_references(self, raw_references: Any) -> list[dict[str, Any]]:
        if not isinstance(raw_references, list):
            return []

        normalized: list[dict[str, Any]] = []
        for raw_reference in raw_references:
            if isinstance(raw_reference, dict):
                reference_map = raw_reference
            else:
                reference_map = asdict(raw_reference) if hasattr(raw_reference, "__dataclass_fields__") else {}

            from_file = self._normalize_path_value(
                reference_map.get("from_file") or reference_map.get("from")
            )
            to_file = self._normalize_path_value(
                reference_map.get("to_file") or reference_map.get("to")
            )
            if not from_file and not to_file:
                continue

            normalized.append(
                {
                    "from_file": from_file,
                    "to_file": to_file,
                    "reference_kind": self._coerce_text(
                        reference_map.get("reference_kind")
                        or reference_map.get("kind")
                        or reference_map.get("edge_kind"),
                        default="import",
                    ),
                    "from_line": self._coerce_non_negative_int(reference_map.get("from_line"), default=0),
                }
            )

        normalized.sort(
            key=lambda reference: (
                reference["from_file"],
                reference["to_file"],
                reference["reference_kind"],
                reference["from_line"],
            )
        )
        return normalized

    def _select_slice_scope_paths(
        self,
        files: list[dict[str, Any]],
        references: list[dict[str, Any]],
        scope: dict[str, Any],
    ) -> set[str]:
        all_paths = {self._coerce_text(file_entry.get("path")) for file_entry in files if self._coerce_text(file_entry.get("path"))}
        if not all_paths:
            return set()

        scope_type = self._coerce_text(scope.get("scope_type"), default="explicit_files")
        patterns = scope.get("patterns") if isinstance(scope.get("patterns"), list) else []

        roots: set[str] = set()
        if not patterns:
            roots = set(all_paths)
        elif scope_type == "path_glob":
            roots = {
                path
                for path in all_paths
                if any(self._matches_pattern(path, pattern) for pattern in patterns)
            }
        elif scope_type == "module_prefix":
            normalized_prefixes = [
                prefix.strip().replace("/", ".").rstrip(".")
                for prefix in patterns
                if isinstance(prefix, str) and prefix.strip()
            ]
            for path in all_paths:
                module_id = self._module_id_from_path(path)
                if any(
                    module_id == prefix or module_id.startswith(f"{prefix}.")
                    for prefix in normalized_prefixes
                ):
                    roots.add(path)
        elif scope_type == "layer_tag":
            layer_filters = {pattern for pattern in patterns if isinstance(pattern, str) and pattern}
            for path in all_paths:
                layer_tag = self._layer_tag_from_path(path)
                if layer_tag in layer_filters:
                    roots.add(path)
        else:
            explicit_paths = {self._normalize_path_value(pattern) for pattern in patterns if isinstance(pattern, str)}
            roots = {path for path in all_paths if path in explicit_paths}

        if not roots:
            return set()

        include_transitive = bool(scope.get("include_transitive", False))
        if not include_transitive:
            return roots

        depth_value = scope.get("depth")
        max_depth = depth_value if isinstance(depth_value, int) and not isinstance(depth_value, bool) and depth_value >= 0 else None

        adjacency: dict[str, set[str]] = {}
        for reference in references:
            src = self._coerce_text(reference.get("from_file"))
            dst = self._coerce_text(reference.get("to_file"))
            if src in all_paths and dst in all_paths:
                adjacency.setdefault(src, set()).add(dst)

        visited = set(roots)
        frontier = sorted(roots)
        current_depth = 0

        while frontier:
            if max_depth is not None and current_depth >= max_depth:
                break

            next_frontier: list[str] = []
            for path in frontier:
                for neighbor in sorted(adjacency.get(path, set())):
                    if neighbor not in visited:
                        visited.add(neighbor)
                        next_frontier.append(neighbor)

            frontier = next_frontier
            current_depth += 1

        return visited

    def _build_slice_edges(
        self,
        scoped_paths: set[str],
        references: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        weights: dict[tuple[str, str, str], int] = {}

        for reference in references:
            src = self._coerce_text(reference.get("from_file"))
            dst = self._coerce_text(reference.get("to_file"))
            if src not in scoped_paths or dst not in scoped_paths:
                continue

            from_module = self._module_id_from_path(src)
            to_module = self._module_id_from_path(dst)
            if not from_module or not to_module:
                continue

            edge_kind = self._coerce_text(reference.get("reference_kind"), default="import")
            edge_key = (from_module, to_module, edge_kind)
            weights[edge_key] = weights.get(edge_key, 0) + 1

        edges: list[dict[str, Any]] = []
        for (from_module, to_module, edge_kind), weight in sorted(weights.items()):
            edge: dict[str, Any] = {
                "from_module": from_module,
                "to_module": to_module,
                "edge_kind": edge_kind,
            }
            if weight > 1:
                edge["weight"] = weight
            edges.append(edge)

        return edges

    def _count_symbols_in_scope(
        self,
        symbols: list[dict[str, Any]],
        scoped_paths: set[str],
        nodes: list[dict[str, Any]],
    ) -> int:
        if symbols:
            return sum(1 for symbol in symbols if self._coerce_text(symbol.get("file")) in scoped_paths)

        total = 0
        for node in nodes:
            value = node.get("loc")
            if isinstance(value, int) and value > 0:
                total += value
        return total
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

        Computes deterministic file/module/symbol projections with stable
        ordering and bounded item counts.
        """
        normalized_params = params if isinstance(params, dict) else {}
        metadata = self._extract_slice_metadata(normalized_params)

        slice_id = self._coerce_text(normalized_params.get("slice_id"))
        workspace_id = self._coerce_text(
            normalized_params.get("workspace_id") or metadata.get("workspace_id")
        )

        requested_projection_type = self._coerce_text(
            normalized_params.get("projection_type") or metadata.get("projection_type"),
            default="file_level",
        ).lower()
        allowed_projection_types = {"file_level", "module_level", "symbol_level"}
        projection_type = (
            requested_projection_type
            if requested_projection_type in allowed_projection_types
            else "file_level"
        )

        scope = self._normalize_slice_scope(
            normalized_params.get("slice_scope")
            or normalized_params.get("scope")
            or metadata.get("scope")
            or {
                "scope_type": normalized_params.get("scope_type"),
                "patterns": normalized_params.get("patterns"),
                "include_transitive": normalized_params.get("include_transitive"),
                "depth": normalized_params.get("depth"),
            }
        )
        filters = self._normalize_slice_filters(
            normalized_params.get("filters")
            or metadata.get("filters")
        )

        files, symbols, references = self._extract_slice_graph_inputs(normalized_params)

        # Fallback: discover graph inputs from workspace path when explicit
        # projection inputs were not provided by the caller.
        if not files:
            workspace_path = self._coerce_text(normalized_params.get("workspace_path"))
            if workspace_path:
                discovered_files = self._discover_files(workspace_path=workspace_path, scope={})
                files = self._normalize_slice_files([asdict(entry) for entry in discovered_files])

                workspace_root = Path(workspace_path)
                if not symbols:
                    symbols = self._normalize_slice_symbols(
                        [asdict(entry) for entry in self._extract_symbols(discovered_files, workspace_root)]
                    )
                if not references:
                    extracted_symbols = self._extract_symbols(discovered_files, workspace_root)
                    references = self._normalize_slice_references(
                        [
                            asdict(entry)
                            for entry in self._resolve_references(
                                discovered_files,
                                extracted_symbols,
                                workspace_root,
                            )
                        ]
                    )

        scoped_paths = self._select_slice_scope_paths(files, references, scope)

        scoped_files = [entry for entry in files if entry["path"] in scoped_paths]
        scoped_files.sort(key=lambda entry: entry["path"])
        scoped_file_map = {entry["path"]: entry for entry in scoped_files}

        def _matches_file_filters(file_entry: dict[str, Any]) -> bool:
            path = self._coerce_text(file_entry.get("path"))
            language = self._coerce_text(file_entry.get("language")).lower()
            layer_tag = self._coerce_text(file_entry.get("layer_tag")).lower()

            for filter_entry in filters:
                filter_type = self._coerce_text(filter_entry.get("filter_type")).lower()
                values = filter_entry.get("values") if isinstance(filter_entry.get("values"), list) else []
                if not values:
                    continue

                exclude = bool(filter_entry.get("exclude", False))
                if filter_type == "path_glob":
                    matched = any(self._matches_pattern(path, self._coerce_text(value)) for value in values)
                elif filter_type == "language_tag":
                    normalized_values = {self._coerce_text(value).lower() for value in values if self._coerce_text(value)}
                    matched = language in normalized_values
                elif filter_type == "layer_tag":
                    normalized_values = {self._coerce_text(value).lower() for value in values if self._coerce_text(value)}
                    matched = layer_tag in normalized_values
                else:
                    continue

                if exclude and matched:
                    return False
                if not exclude and not matched:
                    return False

            return True

        filtered_files = [entry for entry in scoped_files if _matches_file_filters(entry)]
        filtered_file_paths = {entry["path"] for entry in filtered_files}

        scoped_symbols = [
            entry
            for entry in symbols
            if self._coerce_text(entry.get("file")) in filtered_file_paths
        ]
        scoped_symbols.sort(
            key=lambda symbol: (
                self._coerce_text(symbol.get("file")),
                self._coerce_non_negative_int(symbol.get("start_line"), default=0),
                self._coerce_text(symbol.get("name")),
                self._coerce_text(symbol.get("symbol_id")),
            )
        )

        def _matches_symbol_filters(symbol_entry: dict[str, Any]) -> bool:
            file_path = self._coerce_text(symbol_entry.get("file"))
            file_entry = scoped_file_map.get(file_path, {})
            language = self._coerce_text(file_entry.get("language")).lower()
            layer_tag = self._coerce_text(file_entry.get("layer_tag")).lower()
            symbol_kind = self._coerce_text(symbol_entry.get("kind")).lower()
            visibility = self._coerce_text(symbol_entry.get("visibility")).lower()

            for filter_entry in filters:
                filter_type = self._coerce_text(filter_entry.get("filter_type")).lower()
                values = filter_entry.get("values") if isinstance(filter_entry.get("values"), list) else []
                if not values:
                    continue

                exclude = bool(filter_entry.get("exclude", False))
                normalized_values = {self._coerce_text(value).lower() for value in values if self._coerce_text(value)}

                if filter_type == "path_glob":
                    matched = any(self._matches_pattern(file_path, self._coerce_text(value)) for value in values)
                elif filter_type == "language_tag":
                    matched = language in normalized_values
                elif filter_type == "layer_tag":
                    matched = layer_tag in normalized_values
                elif filter_type == "symbol_kind":
                    matched = symbol_kind in normalized_values
                elif filter_type == "visibility":
                    matched = visibility in normalized_values
                else:
                    continue

                if exclude and matched:
                    return False
                if not exclude and not matched:
                    return False

            return True

        filtered_symbols = [entry for entry in scoped_symbols if _matches_symbol_filters(entry)]
        projected_edges = self._build_slice_edges(filtered_file_paths, references)

        items: list[dict[str, Any]] = []

        if projection_type == "module_level":
            module_file_counts: Counter[str] = Counter()
            module_outbound_counts: Counter[str] = Counter()
            module_inbound_counts: Counter[str] = Counter()

            for file_entry in filtered_files:
                module_id = self._coerce_text(
                    file_entry.get("module_id"),
                    default=self._module_id_from_path(self._coerce_text(file_entry.get("path"))),
                )
                if module_id:
                    module_file_counts[module_id] += 1

            for edge in projected_edges:
                from_module = self._coerce_text(edge.get("from_module"))
                to_module = self._coerce_text(edge.get("to_module"))
                if from_module not in module_file_counts or to_module not in module_file_counts:
                    continue

                edge_weight = edge.get("weight")
                weight = edge_weight if isinstance(edge_weight, int) and not isinstance(edge_weight, bool) and edge_weight > 0 else 1

                module_outbound_counts[from_module] += weight
                module_inbound_counts[to_module] += weight

            for module_id in sorted(module_file_counts):
                module_entry = {
                    "module_id": module_id,
                    "module_name": module_id,
                    "files_in_scope": int(module_file_counts[module_id]),
                    "outbound_edge_count": int(module_outbound_counts.get(module_id, 0)),
                    "inbound_edge_count": int(module_inbound_counts.get(module_id, 0)),
                }
                items.append({"kind": "module", "item": module_entry})

            items.sort(
                key=lambda entry: (
                    self._coerce_text(entry["item"].get("module_name")),
                    self._coerce_text(entry["item"].get("module_id")),
                )
            )

        elif projection_type == "symbol_level":
            for symbol_entry in filtered_symbols:
                file_id = self._coerce_text(symbol_entry.get("file"))
                name = self._coerce_text(symbol_entry.get("name"))
                start_line = self._coerce_non_negative_int(symbol_entry.get("start_line"), default=0)
                end_line = self._coerce_non_negative_int(symbol_entry.get("end_line"), default=start_line)

                symbol_id = self._coerce_text(symbol_entry.get("symbol_id"))
                if not symbol_id:
                    symbol_id = f"{file_id}::{name}" if name else f"{file_id}::__symbol__:{start_line}"

                visibility = self._coerce_text(symbol_entry.get("visibility")).lower()
                if not visibility:
                    visibility = "internal"

                items.append(
                    {
                        "kind": "symbol",
                        "item": {
                            "symbol_id": symbol_id,
                            "name": name,
                            "kind": self._coerce_text(symbol_entry.get("kind")),
                            "file_id": file_id,
                            "start_line": start_line,
                            "end_line": max(start_line, end_line),
                            "visibility": visibility,
                        },
                    }
                )

            items.sort(
                key=lambda entry: (
                    self._coerce_text(entry["item"].get("file_id")),
                    self._coerce_non_negative_int(entry["item"].get("start_line"), default=0),
                    self._coerce_text(entry["item"].get("name")),
                    self._coerce_text(entry["item"].get("symbol_id")),
                )
            )

            # Symbol-level projections return symbol items only.
            projected_edges = []

        else:
            for file_entry in filtered_files:
                items.append({"kind": "file", "item": dict(file_entry)})

            items.sort(
                key=lambda entry: (
                    self._coerce_text(entry["item"].get("path")),
                    self._coerce_text(entry["item"].get("file_id")),
                )
            )

        default_limits = {
            "file_level": 100,
            "module_level": 50,
            "symbol_level": 100,
        }
        hard_limits = {
            "file_level": 1000,
            "module_level": 500,
            "symbol_level": 1000,
        }

        requested_limit = normalized_params.get("limit")
        if isinstance(requested_limit, int) and not isinstance(requested_limit, bool):
            effective_limit = requested_limit
        else:
            effective_limit = default_limits[projection_type]

        effective_limit = max(1, min(effective_limit, hard_limits[projection_type]))

        total_in_slice = len(items)
        returned_items = items[:effective_limit]
        returned = len(returned_items)
        truncated = returned < total_in_slice

        result: dict[str, Any] = {
            "slice_id": slice_id,
            "projection_type": projection_type,
            "items": returned_items,
            "total_in_slice": total_in_slice,
            "returned": returned,
            "truncated": truncated,
            "projected_nodes": [entry["item"] for entry in returned_items],
            "projected_edges": projected_edges,
            "diagnostics": [],
        }
        if workspace_id and slice_id:
            result["result_uri"] = (
                f"architecture://ws_{workspace_id}/slices/{slice_id}/projection/{projection_type}"
            )

        return result

    def get_slice_filters(
        self,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """Return available filters for architecture slices.

        Computes deterministic layer/language/path options from either
        caller-provided graph inputs or a discovered workspace scan.
        Returns both legacy keys (``filters``, ``available_types``) and
        explicit slice contract keys.
        """
        normalized_params = params if isinstance(params, dict) else {}
        metadata = self._extract_slice_metadata(normalized_params)

        workspace_id = self._coerce_text(
            normalized_params.get("workspace_id") or metadata.get("workspace_id")
        )
        slice_id = self._coerce_text(
            normalized_params.get("slice_id") or metadata.get("slice_id")
        )

        scope = self._normalize_slice_scope(
            normalized_params.get("slice_scope")
            or normalized_params.get("scope")
            or metadata.get("scope")
            or {
                "scope_type": normalized_params.get("scope_type"),
                "patterns": normalized_params.get("patterns"),
                "include_transitive": normalized_params.get("include_transitive"),
                "depth": normalized_params.get("depth"),
            }
        )

        active_filters = self._normalize_slice_filters(
            normalized_params.get("filters")
            or metadata.get("filters")
        )

        files, symbols, references = self._extract_slice_graph_inputs(normalized_params)

        # Fallback to workspace discovery when explicit graph inputs are absent.
        if not files:
            workspace_path = self._coerce_text(normalized_params.get("workspace_path"))
            if workspace_path:
                discovered_files = self._discover_files(workspace_path=workspace_path, scope={})
                files = self._normalize_slice_files([asdict(entry) for entry in discovered_files])

                workspace_root = Path(workspace_path)
                if not symbols:
                    symbols = self._normalize_slice_symbols(
                        [asdict(entry) for entry in self._extract_symbols(discovered_files, workspace_root)]
                    )
                if not references:
                    extracted_symbols = self._extract_symbols(discovered_files, workspace_root)
                    references = self._normalize_slice_references(
                        [
                            asdict(entry)
                            for entry in self._resolve_references(
                                discovered_files,
                                extracted_symbols,
                                workspace_root,
                            )
                        ]
                    )

        if slice_id:
            scoped_paths = self._select_slice_scope_paths(files, references, scope)
        else:
            scoped_paths = {
                self._coerce_text(file_entry.get("path"))
                for file_entry in files
                if self._coerce_text(file_entry.get("path"))
            }

        scoped_files = [file_entry for file_entry in files if file_entry.get("path") in scoped_paths]
        scoped_files.sort(key=lambda file_entry: self._coerce_text(file_entry.get("path")))

        layer_tags: set[str] = set()
        language_tags: set[str] = set()
        path_prefixes: set[str] = set()

        for file_entry in scoped_files:
            path = self._coerce_text(file_entry.get("path"))
            if not path:
                continue

            layer_tag = self._coerce_text(file_entry.get("layer_tag")) or self._layer_tag_from_path(path)
            if layer_tag:
                layer_tags.add(layer_tag)

            language = self._coerce_text(file_entry.get("language"))
            if language:
                language_tags.add(language)

            path_parts = path.split("/")
            prefix = ""
            for part in path_parts[:-1]:
                if not part:
                    continue
                prefix = part if not prefix else f"{prefix}/{part}"
                path_prefixes.add(prefix)

        scoped_file_paths = {
            self._coerce_text(file_entry.get("path"))
            for file_entry in scoped_files
            if self._coerce_text(file_entry.get("path"))
        }

        symbol_kinds: set[str] = set()
        visibility_values: set[str] = set()
        for symbol_entry in symbols:
            file_path = self._coerce_text(symbol_entry.get("file"))
            if file_path not in scoped_file_paths:
                continue

            symbol_kind = self._coerce_text(symbol_entry.get("kind"))
            if symbol_kind:
                symbol_kinds.add(symbol_kind)

            visibility = self._coerce_text(symbol_entry.get("visibility"))
            if not visibility and isinstance(symbol_entry.get("exported"), bool):
                visibility = "exported" if symbol_entry.get("exported") else "internal"
            if visibility:
                visibility_values.add(visibility)

        available_layer_tags = sorted(layer_tags)
        available_language_tags = sorted(language_tags)
        available_path_prefixes = sorted(path_prefixes)

        available_types_set: set[str] = set()
        if available_path_prefixes:
            available_types_set.add("path_glob")
        if available_language_tags:
            available_types_set.add("language_tag")
        if available_layer_tags:
            available_types_set.add("layer_tag")
        if symbol_kinds:
            available_types_set.add("symbol_kind")
        if visibility_values:
            available_types_set.add("visibility")

        for filter_entry in active_filters:
            filter_type = self._coerce_text(filter_entry.get("filter_type")).lower()
            if filter_type:
                available_types_set.add(filter_type)

        available_types = sorted(available_types_set)

        result: dict[str, Any] = {
            "workspace_id": workspace_id,
            "filters": active_filters if slice_id else [],
            "available_types": available_types,
            "available_layer_tags": available_layer_tags,
            "available_language_tags": available_language_tags,
            "available_path_prefixes": available_path_prefixes,
            "diagnostics": [],
        }

        if slice_id:
            result["slice_id"] = slice_id
            result["active_filters"] = active_filters

        if workspace_id:
            if slice_id:
                result["result_uri"] = f"architecture://ws_{workspace_id}/slices/{slice_id}/filters"
            else:
                result["result_uri"] = f"architecture://ws_{workspace_id}/filters"

        return result

    # ------------------------------------------------------------------
    # Private sub-steps (stubs — to be implemented in later phases)
    # ------------------------------------------------------------------

    _DISCOVER_DEADLINE_CHECK_INTERVAL = 200
    # Hard cap on files returned by a single _discover_files call.  This
    # prevents runaway scans on very large or slow (e.g. network-mounted)
    # workspaces from consuming the full timeout budget.  Callers receive a
    # partial result rather than a timeout-kill with no result at all.
    # Override via PM_CARTOGRAPHER_FILE_COUNT_CAP env var (integer).
    _DISCOVER_FILE_COUNT_CAP: int = int(
        os.environ.get('PM_CARTOGRAPHER_FILE_COUNT_CAP', '10000') or '10000'
    )

    def _discover_files(
        self,
        workspace_path: str,
        scope: dict,
        languages: Optional[list[str]] = None,
        deadline: Optional[float] = None,
    ) -> list[CodeFile]:
        """Discover and inventory source files within scope.

        Returns a list sorted by workspace-relative path ascending.
        When *deadline* is provided (``time.monotonic()`` epoch) file
        discovery stops early and returns a partial list rather than
        running past the budget and letting the TypeScript host kill the
        process.
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
        _files_since_check: int = 0
        _deadline_hit = False
        for current_root, dirs, files in os.walk(root, topdown=True):
            # Check deadline at each directory level (cheap, avoids stat overhead).
            if deadline is not None and time.monotonic() >= deadline:
                _deadline_hit = True
                dirs[:] = []
                break

            # Do NOT call resolve() here — os.walk(root) already yields
            # current_root paths with the same prefix as root. Re-resolving
            # can expand network/subst/junction drives to UNC or real paths
            # inconsistently, causing relative_to() to throw ValueError and
            # silently dropping every file found during the walk.
            try:
                relative_dir = Path(current_root).relative_to(root).as_posix()
            except ValueError:
                relative_dir = "."
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
                    # Use the path as os.walk gave it (consistent with root) —
                    # do NOT call resolve() which can expand to a different
                    # drive form (e.g. UNC) and break relative_to().
                    relative_path = file_path.relative_to(root).as_posix()
                except ValueError:
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

                # Hard file-count cap — stop immediately once reached so that
                # very large / slow workspaces always return a partial result
                # instead of timing out with nothing.
                if len(discovered) >= self._DISCOVER_FILE_COUNT_CAP:
                    _deadline_hit = True
                    dirs[:] = []
                    break

                # Periodic deadline check inside the file loop so a directory
                # with thousands of files doesn't overrun the budget.
                _files_since_check += 1
                if (
                    deadline is not None
                    and _files_since_check >= self._DISCOVER_DEADLINE_CHECK_INTERVAL
                ):
                    _files_since_check = 0
                    if time.monotonic() >= deadline:
                        _deadline_hit = True
                        dirs[:] = []  # prevent os.walk from descending further
                        break

            if _deadline_hit:
                break

        discovered.sort(key=lambda entry: entry.path)
        return discovered

    _SYMBOL_DEADLINE_CHECK_INTERVAL = 200

    def _extract_symbols(self, files, workspace_root: Path, deadline: Optional[float] = None) -> list:
        """Extract symbols from all files using language-specific extractors.

        When *deadline* is provided the extraction loop exits early rather than
        overrunning the scan budget.
        """
        dispatch = {
            '.ts': self._extract_ts_symbols,
            '.tsx': self._extract_ts_symbols,
            '.js': self._extract_ts_symbols,
            '.jsx': self._extract_ts_symbols,
            '.mjs': self._extract_ts_symbols,
            '.cjs': self._extract_ts_symbols,
            '.py': self._extract_python_symbols,
            '.rs': self._extract_rust_symbols,
            '.go': self._extract_go_symbols,
            '.cs': self._extract_csharp_symbols,
            '.cpp': self._extract_cpp_symbols,
            '.cc': self._extract_cpp_symbols,
            '.h': self._extract_cpp_symbols,
            '.hpp': self._extract_cpp_symbols,
            '.java': self._extract_java_symbols,
            '.sh': self._extract_shell_symbols,
            '.bash': self._extract_shell_symbols,
            '.ps1': self._extract_shell_symbols,
            '.ahk': self._extract_ahk_symbols,
            '.ah2': self._extract_ahk_symbols,
        }
        symbols = []
        seen_ids: dict = {}
        _files_since_check: int = 0
        for f in files:
            _files_since_check += 1
            if (
                deadline is not None
                and _files_since_check >= self._SYMBOL_DEADLINE_CHECK_INTERVAL
            ):
                _files_since_check = 0
                if time.monotonic() >= deadline:
                    break
            # Always generate the module sentinel for every file
            sentinel = Symbol(
                id=f'{f.path}::__module__',
                file=f.path,
                name='__module__',
                kind='module',
                start_line=1,
            )
            symbols.append(sentinel)
            seen_ids[sentinel.id] = sentinel

            ext = os.path.splitext(f.path)[1].lower()
            extractor = dispatch.get(ext)
            if extractor is None:
                continue
            abs_path = str(workspace_root / f.path)
            if should_skip_file(abs_path, str(workspace_root)) is not None:
                continue
            try:
                content = (workspace_root / f.path).read_text(encoding='utf-8', errors='replace')
            except OSError:
                continue
            for sym in extractor(f.path, content):
                if sym.id in seen_ids:
                    # Disambiguate collision
                    sym = Symbol(
                        id=f'{sym.id}_{sym.kind}_{sym.start_line}',
                        file=sym.file, name=sym.name, kind=sym.kind,
                        start_line=sym.start_line, qualified_name=sym.qualified_name,
                        end_line=sym.end_line, exported=sym.exported,
                    )
                seen_ids[sym.id] = sym
                symbols.append(sym)

        symbols.sort(key=lambda s: (s.file, s.start_line, s.name))
        return symbols

    def _extract_ts_symbols(self, file_path: str, content: str) -> list:
        """Extract symbols from TypeScript/JavaScript files."""
        symbols = []
        for lineno, line in enumerate(content.splitlines(), start=1):
            s = line.strip()
            exported = 'export' in s
            # function declaration
            m = re.match(r'^(?:export\s+)?(?:async\s+)?function\s+(\w+)', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='function', start_line=lineno, exported=exported))
                continue
            # class declaration
            m = re.match(r'^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='class', start_line=lineno, exported=exported))
                continue
            # interface declaration
            m = re.match(r'^(?:export\s+)?interface\s+(\w+)', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='interface', start_line=lineno, exported=exported))
                continue
            # type alias
            m = re.match(r'^(?:export\s+)?type\s+(\w+)\s*=', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='type', start_line=lineno, exported=exported))
                continue
            # arrow function / const declaration
            m = re.match(r'^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[:=]', s)
            if m:
                kind = 'function' if '=>' in s or 'function' in s else 'variable'
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind=kind, start_line=lineno, exported=exported))
                continue
            # enum
            m = re.match(r'^(?:export\s+)?(?:const\s+)?enum\s+(\w+)', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='enum', start_line=lineno, exported=exported))
        return symbols

    def _extract_python_symbols(self, file_path: str, content: str) -> list:
        """Extract symbols from Python files."""
        symbols = []
        class_indent = None
        for lineno, line in enumerate(content.splitlines(), start=1):
            stripped = line.lstrip()
            indent = len(line) - len(stripped)
            s = stripped.rstrip()
            if not s or s.startswith('#'):
                continue
            # class definition
            m = re.match(r'^class\s+(\w+)', s)
            if m:
                class_indent = indent
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='class', start_line=lineno))
                continue
            # function/method definition
            m = re.match(r'^(?:async\s+)?def\s+(\w+)', s)
            if m:
                kind = 'method' if (class_indent is not None and indent > class_indent) else 'function'
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind=kind, start_line=lineno))
                continue
            # reset class context if dedented past class level
            if class_indent is not None and indent <= class_indent and s and not s.startswith(' '):
                class_indent = None
        return symbols

    def _extract_rust_symbols(self, file_path: str, content: str) -> list:
        """Extract symbols from Rust files."""
        symbols = []
        for lineno, line in enumerate(content.splitlines(), start=1):
            s = line.strip()
            if s.startswith('//'):
                continue
            # function
            m = re.match(r'^(?:pub(?:\s*\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)', s)
            if m:
                exported = s.startswith('pub')
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='function', start_line=lineno, exported=exported))
                continue
            # struct
            m = re.match(r'^(?:pub(?:\s*\([^)]*\))?\s+)?struct\s+(\w+)', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='class', start_line=lineno, exported=s.startswith('pub')))
                continue
            # enum
            m = re.match(r'^(?:pub(?:\s*\([^)]*\))?\s+)?enum\s+(\w+)', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='enum', start_line=lineno, exported=s.startswith('pub')))
                continue
            # trait
            m = re.match(r'^(?:pub(?:\s*\([^)]*\))?\s+)?trait\s+(\w+)', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='interface', start_line=lineno, exported=s.startswith('pub')))
        return symbols

    def _extract_go_symbols(self, file_path: str, content: str) -> list:
        """Extract symbols from Go files."""
        symbols = []
        for lineno, line in enumerate(content.splitlines(), start=1):
            s = line.strip()
            m = re.match(r'^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='function', start_line=lineno))
                continue
            m = re.match(r'^type\s+(\w+)\s+struct', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='class', start_line=lineno))
                continue
            m = re.match(r'^type\s+(\w+)\s+interface', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='interface', start_line=lineno))
        return symbols

    def _extract_csharp_symbols(self, file_path: str, content: str) -> list:
        """Extract symbols from C# files."""
        symbols = []
        for lineno, line in enumerate(content.splitlines(), start=1):
            s = line.strip()
            m = re.match(r'^(?:public|private|protected|internal|static|abstract|sealed|partial|\s)*class\s+(\w+)', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='class', start_line=lineno))
                continue
            m = re.match(r'^(?:public|private|protected|internal|\s)*interface\s+(\w+)', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='interface', start_line=lineno))
                continue
            m = re.match(r'^(?:public|private|protected|static|async|override|virtual|\s)+\w+\s+(\w+)\s*\(', s)
            if m and not re.match(r'^(?:if|for|while|switch|catch)', s):
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='function', start_line=lineno))
        return symbols

    def _extract_cpp_symbols(self, file_path: str, content: str) -> list:
        """Extract symbols from C/C++ files."""
        symbols = []
        for lineno, line in enumerate(content.splitlines(), start=1):
            s = line.strip()
            if s.startswith('#') or s.startswith('//'):
                continue
            m = re.match(r'^(?:class|struct)\s+(\w+)', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='class', start_line=lineno))
                continue
            m = re.match(r'^(?:\w[\w\s*&:<>]*)\s+(\w+)\s*\([^;]*\)\s*(?:const\s*)?(?:\{|$)', s)
            if m and not re.match(r'^(?:if|for|while|switch|return)', s):
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='function', start_line=lineno))
        return symbols

    def _extract_java_symbols(self, file_path: str, content: str) -> list:
        """Extract symbols from Java files."""
        symbols = []
        for lineno, line in enumerate(content.splitlines(), start=1):
            s = line.strip()
            m = re.match(r'^(?:public|private|protected|abstract|final|\s)*class\s+(\w+)', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='class', start_line=lineno))
                continue
            m = re.match(r'^(?:public|private|protected|\s)*interface\s+(\w+)', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='interface', start_line=lineno))
                continue
            m = re.match(r'^(?:public|private|protected|static|final|abstract|\s)+\w+\s+(\w+)\s*\(', s)
            if m and not re.match(r'^(?:if|for|while)', s):
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='function', start_line=lineno))
        return symbols

    def _extract_shell_symbols(self, file_path: str, content: str) -> list:
        """Extract symbols from shell/PowerShell files."""
        symbols = []
        for lineno, line in enumerate(content.splitlines(), start=1):
            s = line.strip()
            if s.startswith('#'):
                continue
            # function name() { or function name {
            m = re.match(r'^function\s+(\w+)', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='function', start_line=lineno))
                continue
            # name() {
            m = re.match(r'^(\w+)\s*\(\s*\)\s*\{', s)
            if m:
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='function', start_line=lineno))
        return symbols

    def _extract_ahk_symbols(self, file_path: str, content: str) -> list:
        """Extract symbols from AutoHotkey files."""
        symbols = []
        for lineno, line in enumerate(content.splitlines(), start=1):
            s = line.strip()
            if s.startswith(';') or s.startswith('//'):
                continue
            # Label: LabelName:
            m = re.match(r'^(\w+):(?!:)', s)
            if m and not s.startswith('#'):
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='variable', start_line=lineno))
                continue
            # Function: name(
            m = re.match(r'^(\w+)\s*\(', s)
            if m and not re.match(r'^(?:if|while|for|loop|switch|return)', s, re.IGNORECASE):
                symbols.append(Symbol(id=f'{file_path}::{m.group(1)}', file=file_path,
                    name=m.group(1), kind='function', start_line=lineno))
        return symbols

    def _resolve_references(
        self, files: list[CodeFile], symbols: list[Symbol], workspace_root: Path
    ) -> list[Reference]:
        """Resolve imports for all files using language-specific parsers."""
        dispatch = {
            '.ts': self._parse_ts_imports,
            '.tsx': self._parse_ts_imports,
            '.js': self._parse_ts_imports,
            '.jsx': self._parse_ts_imports,
            '.mjs': self._parse_ts_imports,
            '.cjs': self._parse_ts_imports,
            '.py': self._parse_python_imports,
            '.rs': self._parse_rust_imports,
            '.go': self._parse_go_imports,
            '.cs': self._parse_csharp_imports,
            '.cpp': self._parse_cpp_includes,
            '.cc': self._parse_cpp_includes,
            '.h': self._parse_cpp_includes,
            '.hpp': self._parse_cpp_includes,
            '.java': self._parse_java_imports,
            '.sh': self._parse_shell_imports,
            '.bash': self._parse_shell_imports,
            '.ps1': self._parse_shell_imports,
            '.ahk': self._parse_ahk_imports,
            '.ah2': self._parse_ahk_imports,
            # SQL files have no import syntax to parse
        }
        references = []
        tracker = PerfTracker()
        tracker.start()
        batch_size = PerfConfig().batch_size
        file_list = list(files)
        for batch_start in range(0, len(file_list), batch_size):
            if tracker.should_cancel():
                break
            batch = file_list[batch_start:batch_start + batch_size]
            for f in batch:
                abs_path = str(workspace_root / f.path)
                if should_skip_file(abs_path, str(workspace_root)) is not None:
                    continue
                ext = os.path.splitext(f.path)[1].lower()
                parser = dispatch.get(ext)
                if parser is None:
                    continue
                try:
                    content = (workspace_root / f.path).read_text(encoding='utf-8', errors='replace')
                    references.extend(parser(f.path, content, workspace_root))
                except OSError:
                    pass
            tracker.on_batch_complete(batch_file_count=len(batch))
        return sorted(references, key=lambda r: (r.from_file, r.from_line))

    def _parse_rust_imports(self, file_path: str, content: str, workspace_root: Path) -> list:
        """Parse Rust mod/use declarations."""
        refs = []
        source_dir = str(workspace_root / os.path.dirname(file_path))
        source_dir_path = Path(source_dir)

        for lineno, line in enumerate(content.splitlines(), start=1):
            s = line.strip()
            if s.startswith('//'):
                continue

            # mod name;
            m = re.match(r'^(?:pub\s+)?mod\s+(\w+)\s*;', s)
            if m:
                name = m.group(1)
                for candidate in [
                    source_dir_path / f'{name}.rs',
                    source_dir_path / name / 'mod.rs',
                ]:
                    if candidate.exists() and is_path_safe(str(candidate.resolve()), str(workspace_root)):
                        resolved = candidate.resolve().relative_to(workspace_root).as_posix()
                        refs.append(Reference(from_file=file_path, from_line=lineno,
                            to_file=resolved, to_symbol_id=f'{resolved}::__module__', reference_kind='import'))
                        break
                else:
                    refs.append(Reference(from_file=file_path, from_line=lineno,
                        to_file=None, to_symbol_id=f'{name}::__unresolved__', reference_kind='import'))
                continue

            # Skip stdlib/core
            if re.match(r'^use\s+(?:std|core|alloc)::', s) or re.match(r'^extern\s+crate', s):
                continue

            # use crate::a::b
            m2 = re.match(r'^use\s+crate::([\w:]+)', s)
            if m2:
                path_str = m2.group(1).replace('::', '/')
                for ext in ['.rs', '/mod.rs']:
                    candidate = workspace_root / (path_str + ext)
                    if candidate.exists() and is_path_safe(str(candidate.resolve()), str(workspace_root)):
                        resolved = candidate.resolve().relative_to(workspace_root).as_posix()
                        refs.append(Reference(from_file=file_path, from_line=lineno,
                            to_file=resolved, to_symbol_id=f'{resolved}::__module__', reference_kind='import'))
                        break
                else:
                    refs.append(Reference(from_file=file_path, from_line=lineno,
                        to_file=None, to_symbol_id=f'{path_str}::__unresolved__', reference_kind='import'))
                continue

            # use super:: or use self::
            m3 = re.match(r'^use\s+(super|self)::([\w:]+)', s)
            if m3:
                anchor = m3.group(1)
                mod_path = m3.group(2).replace('::', '/')
                base = source_dir_path.parent if anchor == 'super' else source_dir_path
                for ext in ['.rs', '/mod.rs']:
                    candidate = base / (mod_path + ext)
                    if candidate.exists() and is_path_safe(str(candidate.resolve()), str(workspace_root)):
                        resolved = candidate.resolve().relative_to(workspace_root).as_posix()
                        refs.append(Reference(from_file=file_path, from_line=lineno,
                            to_file=resolved, to_symbol_id=f'{resolved}::__module__', reference_kind='import'))
                        break
                else:
                    refs.append(Reference(from_file=file_path, from_line=lineno,
                        to_file=None, to_symbol_id=f'{mod_path}::__unresolved__', reference_kind='import'))
        return refs

    def _parse_python_imports(self, file_path: str, content: str, workspace_root: Path) -> list:
        """Parse Python import statements."""
        refs = []
        source_parts = file_path.replace('\\', '/').split('/')
        source_dir_parts = source_parts[:-1]

        for lineno, line in enumerate(content.splitlines(), start=1):
            line_stripped = line.strip()
            if not line_stripped or line_stripped.startswith('#'):
                continue

            # Relative: from .X import Y or from ..X import Y
            m = re.match(r'^from\s+(\.+)([\w.]*)\s+import', line_stripped)
            if m:
                dots = len(m.group(1))
                module_path = m.group(2)
                # Navigate up (dots-1) levels from source dir
                up = dots - 1
                base_parts = source_dir_parts[:]
                for _ in range(up):
                    if base_parts:
                        base_parts.pop()
                if module_path:
                    rel_path = '/'.join(base_parts + module_path.replace('.', '/').split('/')) + '.py'
                else:
                    rel_path = '/'.join(base_parts) + '/__init__.py'
                candidate = workspace_root / rel_path
                if candidate.exists() and is_path_safe(str(candidate.resolve()), str(workspace_root)):
                    resolved = candidate.resolve().relative_to(workspace_root).as_posix()
                    refs.append(Reference(from_file=file_path, from_line=lineno,
                        to_file=resolved, to_symbol_id=f'{resolved}::__module__', reference_kind='import'))
                else:
                    refs.append(Reference(from_file=file_path, from_line=lineno,
                        to_file=None, to_symbol_id=f'{module_path or "(package)"}::__unresolved__', reference_kind='import'))
                continue

            # Absolute: import X or from X import Y
            m2 = re.match(r'^(?:import|from)\s+([\w.]+)', line_stripped)
            if m2:
                mod = m2.group(1)
                rel = mod.replace('.', os.sep) + '.py'
                candidate = workspace_root / rel
                if candidate.exists() and is_path_safe(str(candidate.resolve()), str(workspace_root)):
                    resolved = candidate.resolve().relative_to(workspace_root).as_posix()
                    refs.append(Reference(from_file=file_path, from_line=lineno,
                        to_file=resolved, to_symbol_id=f'{resolved}::__module__', reference_kind='import'))
                else:
                    refs.append(Reference(from_file=file_path, from_line=lineno,
                        to_file=None, to_symbol_id=f'{mod}::__unresolved__', reference_kind='import'))
        return refs

    def _parse_ts_imports(self, file_path: str, content: str, workspace_root: Path) -> list:
        """Parse TypeScript/JavaScript import statements."""
        refs = []
        patterns = [
            # import ... from 'path' or "path"
            re.compile(r'''(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]'''),
            # dynamic import('path')
            re.compile(r'''import\s*\(\s*['"]([^'"]+)['"]\s*\)'''),
            # require('path')
            re.compile(r'''require\s*\(\s*['"]([^'"]+)['"]\s*\)'''),
        ]
        for lineno, line in enumerate(content.splitlines(), start=1):
            line_stripped = line.strip()
            if line_stripped.startswith('//') or line_stripped.startswith('*'):
                continue
            for pat in patterns:
                for m in pat.finditer(line):
                    specifier = m.group(1)
                    if specifier.startswith('.'):
                        resolved = self._resolve_import_path(specifier, file_path, workspace_root)
                        if resolved:
                            refs.append(Reference(
                                from_file=file_path, from_line=lineno,
                                to_file=resolved,
                                to_symbol_id=f'{resolved}::__module__',
                                reference_kind='import'
                            ))
                        else:
                            refs.append(Reference(
                                from_file=file_path, from_line=lineno,
                                to_file=None,
                                to_symbol_id=f'{specifier}::__unresolved__',
                                reference_kind='import'
                            ))
                    else:
                        refs.append(Reference(
                            from_file=file_path, from_line=lineno,
                            to_file=None,
                            to_symbol_id=f'{specifier}::__unresolved__',
                            reference_kind='import'
                        ))
        return refs

    def _resolve_import_path(self, specifier: str, source_file: str, workspace_root: Path) -> Optional[str]:
        """Resolve a relative import specifier to a workspace-relative path."""
        if not specifier.startswith('.'):
            return None  # bare package name, unresolvable
        base_dir = workspace_root / os.path.dirname(source_file)
        candidate = (base_dir / specifier).resolve()
        if not is_path_safe(str(candidate), str(workspace_root)):
            return None
        # Extension probe order
        probes = [
            candidate,
            candidate.with_suffix('.ts'),
            candidate.with_suffix('.tsx'),
            candidate.with_suffix('.js'),
            candidate.with_suffix('.jsx'),
            candidate.with_suffix('.py'),
            candidate.with_suffix('.rs'),
            candidate / 'index.ts',
            candidate / 'index.js',
            candidate / 'index.tsx',
            candidate / 'index.jsx',
        ]
        for probe in probes:
            if probe.exists():
                return probe.relative_to(workspace_root).as_posix()
        return None

    def _parse_go_imports(self, file_path: str, content: str, workspace_root: Path) -> list:
        """Parse Go import declarations."""
        refs = []
        STDLIB = {'fmt','os','io','errors','strings','strconv','bytes','bufio','log',
                   'math','sort','sync','time','context','net','http','path','filepath',
                   'encoding','json','reflect','regexp','testing','runtime'}
        lines = content.splitlines()
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            lineno = i + 1
            # Single import
            m = re.match(r'^import\s+"([^"]+)"', line)
            if m:
                path_str = m.group(1)
                short = path_str.split('/')[-1]
                if short not in STDLIB:
                    candidate = workspace_root / path_str.replace('/', os.sep)
                    # try as directory with .go extension or direct
                    found = None
                    for probe in [candidate.with_suffix('.go'), candidate / (short + '.go')]:
                        if probe.exists() and is_path_safe(str(probe.resolve()), str(workspace_root)):
                            found = probe.resolve().relative_to(workspace_root).as_posix()
                            break
                    if found:
                        refs.append(Reference(from_file=file_path, from_line=lineno,
                            to_file=found, to_symbol_id=f'{found}::__module__', reference_kind='import'))
                    else:
                        refs.append(Reference(from_file=file_path, from_line=lineno,
                            to_file=None, to_symbol_id=f'{path_str}::__unresolved__', reference_kind='import'))
                i += 1
                continue
            # Multi-line import block
            m2 = re.match(r'^import\s*\(', line)
            if m2:
                i += 1
                while i < len(lines):
                    inner = lines[i].strip()
                    lineno_inner = i + 1
                    if inner == ')':
                        break
                    m3 = re.match(r'(?:\w+\s+)?"([^"]+)"', inner)
                    if m3:
                        path_str = m3.group(1)
                        short = path_str.split('/')[-1]
                        if short not in STDLIB:
                            candidate = workspace_root / path_str.replace('/', os.sep)
                            found = None
                            for probe in [candidate.with_suffix('.go'), candidate / (short + '.go')]:
                                if probe.exists() and is_path_safe(str(probe.resolve()), str(workspace_root)):
                                    found = probe.resolve().relative_to(workspace_root).as_posix()
                                    break
                            if found:
                                refs.append(Reference(from_file=file_path, from_line=lineno_inner,
                                    to_file=found, to_symbol_id=f'{found}::__module__', reference_kind='import'))
                            else:
                                refs.append(Reference(from_file=file_path, from_line=lineno_inner,
                                    to_file=None, to_symbol_id=f'{path_str}::__unresolved__', reference_kind='import'))
                    i += 1
                i += 1
                continue
            i += 1
        return refs

    def _parse_csharp_imports(self, file_path: str, content: str, workspace_root: Path) -> list:
        """Parse C# using directives — all treated as unresolvable."""
        refs = []
        for lineno, line in enumerate(content.splitlines(), start=1):
            s = line.strip()
            m = re.match(r'^using\s+([\w.]+)\s*;', s)
            if m:
                ns = m.group(1)
                refs.append(Reference(from_file=file_path, from_line=lineno,
                    to_file=None, to_symbol_id=f'{ns}::__unresolved__', reference_kind='import'))
        return refs

    def _parse_cpp_includes(self, file_path: str, content: str, workspace_root: Path) -> list:
        """Parse C/C++ #include directives."""
        refs = []
        source_dir = workspace_root / os.path.dirname(file_path)
        for lineno, line in enumerate(content.splitlines(), start=1):
            s = line.strip()
            # Local include: #include "file.h"
            m = re.match(r'^#include\s+"([^"]+)"', s)
            if m:
                inc = m.group(1)
                base = source_dir / inc
                probes = [base, base.with_suffix('.h'), base.with_suffix('.hpp'),
                          base.with_suffix('.c'), base.with_suffix('.cpp')]
                found = None
                for probe in probes:
                    try:
                        r = probe.resolve()
                        if probe.exists() and is_path_safe(str(r), str(workspace_root)):
                            found = r.relative_to(workspace_root).as_posix()
                            break
                    except (ValueError, OSError):
                        pass
                if found:
                    refs.append(Reference(from_file=file_path, from_line=lineno,
                        to_file=found, to_symbol_id=f'{found}::__module__', reference_kind='import'))
                else:
                    refs.append(Reference(from_file=file_path, from_line=lineno,
                        to_file=None, to_symbol_id=f'{inc}::__unresolved__', reference_kind='import'))
                continue
            # System include: #include <header> — unresolvable
            m2 = re.match(r'^#include\s+<([^>]+)>', s)
            if m2:
                refs.append(Reference(from_file=file_path, from_line=lineno,
                    to_file=None, to_symbol_id=f'{m2.group(1)}::__unresolved__', reference_kind='import'))
        return refs

    def _parse_java_imports(self, file_path: str, content: str, workspace_root: Path) -> list:
        """Parse Java import statements."""
        refs = []
        for lineno, line in enumerate(content.splitlines(), start=1):
            s = line.strip()
            m = re.match(r'^import\s+(?:static\s+)?([\w.]+)(?:\.\*)?\s*;', s)
            if m:
                cls_path = m.group(1).replace('.', '/') + '.java'
                candidate = workspace_root / cls_path
                if candidate.exists() and is_path_safe(str(candidate.resolve()), str(workspace_root)):
                    resolved = candidate.resolve().relative_to(workspace_root).as_posix()
                    refs.append(Reference(from_file=file_path, from_line=lineno,
                        to_file=resolved, to_symbol_id=f'{resolved}::__module__', reference_kind='import'))
                else:
                    refs.append(Reference(from_file=file_path, from_line=lineno,
                        to_file=None, to_symbol_id=f'{m.group(1)}::__unresolved__', reference_kind='import'))
        return refs

    def _parse_shell_imports(self, file_path: str, content: str, workspace_root: Path) -> list:
        """Parse shell source/import directives."""
        refs = []
        for lineno, line in enumerate(content.splitlines(), start=1):
            s = line.strip()
            if s.startswith('#'):
                continue
            # bash/sh: source ./path or . ./path
            m = re.match(r'^(?:source|\.)\s+([^\s;#]+)', s)
            if m:
                spec = m.group(1)
                resolved = self._resolve_import_path(spec, file_path, workspace_root)
                if not resolved and not spec.startswith('.'):
                    # try as relative anyway for bare names
                    pass
                if resolved:
                    refs.append(Reference(from_file=file_path, from_line=lineno,
                        to_file=resolved, to_symbol_id=f'{resolved}::__module__', reference_kind='import'))
                else:
                    refs.append(Reference(from_file=file_path, from_line=lineno,
                        to_file=None, to_symbol_id=f'{spec}::__unresolved__', reference_kind='import'))
                continue
            # PowerShell: Import-Module .\path or . .\path
            m2 = re.match(r'^(?:Import-Module|\.)\s+([^\s;#]+)', s, re.IGNORECASE)
            if m2:
                spec = m2.group(1).replace('\\', '/')
                if not spec.startswith('.'):
                    spec = './' + spec
                resolved = self._resolve_import_path(spec, file_path, workspace_root)
                if resolved:
                    refs.append(Reference(from_file=file_path, from_line=lineno,
                        to_file=resolved, to_symbol_id=f'{resolved}::__module__', reference_kind='import'))
                else:
                    refs.append(Reference(from_file=file_path, from_line=lineno,
                        to_file=None, to_symbol_id=f'{m2.group(1)}::__unresolved__', reference_kind='import'))
        return refs

    def _parse_ahk_imports(self, file_path: str, content: str, workspace_root: Path) -> list:
        """Parse AutoHotkey #Include directives."""
        refs = []
        for lineno, line in enumerate(content.splitlines(), start=1):
            s = line.strip()
            # #Include <Lib> — unresolvable
            m_sys = re.match(r'^#Include\s+<([^>]+)>', s, re.IGNORECASE)
            if m_sys:
                refs.append(Reference(from_file=file_path, from_line=lineno,
                    to_file=None, to_symbol_id=f'{m_sys.group(1)}::__unresolved__', reference_kind='import'))
                continue
            # #Include file.ahk
            m = re.match(r'^#Include\s+(\S+)', s, re.IGNORECASE)
            if m:
                spec = m.group(1).replace('\\', '/')
                if not spec.startswith('.'):
                    spec = './' + spec
                resolved = self._resolve_import_path(spec, file_path, workspace_root)
                if resolved:
                    refs.append(Reference(from_file=file_path, from_line=lineno,
                        to_file=resolved, to_symbol_id=f'{resolved}::__module__', reference_kind='import'))
                else:
                    refs.append(Reference(from_file=file_path, from_line=lineno,
                        to_file=None, to_symbol_id=f'{m.group(1)}::__unresolved__', reference_kind='import'))
        return refs

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
        """Compute dependency tiers using Kahn's BFS topological sort."""
        from collections import deque, defaultdict

        edges = module_graph.get('edges', [])
        # Build adjacency and in-degree maps
        all_nodes = set()
        out_edges = defaultdict(list)  # node -> list of targets
        in_degree = defaultdict(int)
        target_set = set()  # nodes that appear as edge targets

        for edge in edges:
            src = edge.get('from_file') or edge.get('from')
            tgt = edge.get('to_file') or edge.get('to')
            if src and tgt:
                all_nodes.add(src)
                all_nodes.add(tgt)
                out_edges[src].append(tgt)
                in_degree[tgt] += 1
                target_set.add(tgt)
                # Ensure src is in in_degree map
                if src not in in_degree:
                    in_degree[src] = in_degree[src]  # default 0

        # Add isolated nodes (files with no edges)
        for node in module_graph.get('nodes', []):
            nid = node if isinstance(node, str) else node.get('id', '')
            if nid:
                all_nodes.add(nid)

        # Entry points = nodes that no one imports
        entry_points = [n for n in all_nodes if n not in target_set]

        # Kahn's BFS
        current_in = {n: in_degree.get(n, 0) for n in all_nodes}
        queue = deque([n for n in all_nodes if current_in[n] == 0])
        tiers = []
        visited = set()

        while queue:
            tier_size = len(queue)
            tier = []
            for _ in range(tier_size):
                node = queue.popleft()
                if node in visited:
                    continue
                visited.add(node)
                tier.append(node)
                for neighbor in out_edges.get(node, []):
                    current_in[neighbor] -= 1
                    if current_in[neighbor] == 0:
                        queue.append(neighbor)
            if tier:
                tiers.append(sorted(tier))

        # Cycle detection — nodes not visited have cyclic dependencies
        cycle_nodes = [n for n in all_nodes if n not in visited]
        cycles = []
        if cycle_nodes:
            # Simple connected-component grouping via DFS
            remaining = set(cycle_nodes)
            rev_edges = defaultdict(list)
            for src, targets in out_edges.items():
                for tgt in targets:
                    rev_edges[tgt].append(src)

            def dfs_component(start):
                stack = [start]
                component = []
                while stack:
                    n = stack.pop()
                    if n in remaining:
                        remaining.discard(n)
                        component.append(n)
                        stack.extend(out_edges.get(n, []))
                        stack.extend(rev_edges.get(n, []))
                return component

            while remaining:
                node = next(iter(remaining))
                comp = dfs_component(node)
                if comp:
                    cycles.append(sorted(comp))

        return {
            'tiers': tiers,
            'entry_points': sorted(entry_points),
            'cycles': cycles,
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
