"""
test_code_cartography.py
------------------------
Unit tests for CodeCartographyEngine sub-methods.

Covers:
  - TestResolveImportPath   (_resolve_import_path)
  - TestImportParsers       (_parse_ts_imports, _parse_python_imports, _parse_rust_imports)
  - TestSymbolExtraction    (_extract_symbols and sentinel generation)
  - TestTopologicalSort     (_compute_dependency_flow)
"""

from __future__ import annotations

import pytest
from pathlib import Path

from memory_cartographer.engines.code_cartography import (
    CodeCartographyEngine,
    Symbol,
    Reference,
)


# ---------------------------------------------------------------------------
# Step 17: _resolve_import_path
# ---------------------------------------------------------------------------


class TestResolveImportPath:
    def test_bare_package_returns_none(self, tmp_path):
        """Non-relative specifiers (no leading dot) return None."""
        engine = CodeCartographyEngine()
        assert engine._resolve_import_path("react", "src/App.tsx", tmp_path) is None

    def test_resolves_ts_extension(self, tmp_path):
        """Relative specifier with no extension resolves to .ts file."""
        (tmp_path / "src").mkdir()
        (tmp_path / "src" / "utils.ts").write_text("export {}")
        engine = CodeCartographyEngine()
        result = engine._resolve_import_path("./utils", "src/App.tsx", tmp_path)
        assert result == "src/utils.ts"

    def test_path_traversal_blocked(self, tmp_path):
        """Specifier that resolves outside workspace root returns None."""
        engine = CodeCartographyEngine()
        result = engine._resolve_import_path("../../etc/passwd", "src/App.tsx", tmp_path)
        assert result is None

    def test_tsx_extension_fallback(self, tmp_path):
        """When only a .tsx file exists, resolves to .tsx extension."""
        (tmp_path / "src").mkdir()
        (tmp_path / "src" / "Widget.tsx").write_text("export {}")
        engine = CodeCartographyEngine()
        result = engine._resolve_import_path("./Widget", "src/App.tsx", tmp_path)
        assert result == "src/Widget.tsx"


# ---------------------------------------------------------------------------
# Step 18: language-specific import parsers
# ---------------------------------------------------------------------------


class TestImportParsers:
    def test_ts_static_import_relative(self, tmp_path):
        (tmp_path / "src").mkdir()
        (tmp_path / "src" / "utils.ts").write_text("export {}")
        engine = CodeCartographyEngine()
        content = "import { foo } from './utils';"
        refs = engine._parse_ts_imports("src/App.tsx", content, tmp_path)
        assert len(refs) == 1
        assert refs[0].to_file == "src/utils.ts"
        assert refs[0].to_symbol_id == "src/utils.ts::__module__"
        assert refs[0].reference_kind == "import"

    def test_ts_bare_package_unresolved(self, tmp_path):
        engine = CodeCartographyEngine()
        content = "import React from 'react';"
        refs = engine._parse_ts_imports("src/App.tsx", content, tmp_path)
        assert len(refs) == 1
        assert refs[0].to_file is None
        assert "::__unresolved__" in refs[0].to_symbol_id

    def test_python_relative_import(self, tmp_path):
        (tmp_path / "pkg").mkdir()
        (tmp_path / "pkg" / "utils.py").write_text("x = 1")
        engine = CodeCartographyEngine()
        content = "from .utils import x"
        refs = engine._parse_python_imports("pkg/main.py", content, tmp_path)
        assert any(r.to_file == "pkg/utils.py" for r in refs)

    def test_rust_mod_declaration(self, tmp_path):
        (tmp_path / "src").mkdir()
        (tmp_path / "src" / "utils.rs").write_text("pub fn helper() {}")
        engine = CodeCartographyEngine()
        content = "mod utils;"
        refs = engine._parse_rust_imports("src/main.rs", content, tmp_path)
        assert any(r.to_file == "src/utils.rs" for r in refs)

    def test_rust_stdlib_unresolved(self, tmp_path):
        engine = CodeCartographyEngine()
        content = "use std::collections::HashMap;"
        refs = engine._parse_rust_imports("src/main.rs", content, tmp_path)
        assert len(refs) == 0  # stdlib is skipped


# ---------------------------------------------------------------------------
# Step 19: symbol extraction and sentinel generation
# ---------------------------------------------------------------------------


class TestSymbolExtraction:
    def _make_file(self, tmp_path, rel_path, content):
        """Write a temp file and return a minimal object with a .path attribute."""
        full = tmp_path / rel_path
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_text(content)

        class _F:
            def __init__(self, p):
                self.path = p

        return _F(rel_path.replace("\\", "/"))

    def test_module_sentinel_always_present(self, tmp_path):
        engine = CodeCartographyEngine()
        f = self._make_file(tmp_path, "src/foo.py", "x = 1")
        symbols = engine._extract_symbols([f], tmp_path)
        sentinel = next(
            (s for s in symbols if s.name == "__module__" and s.file == "src/foo.py"),
            None,
        )
        assert sentinel is not None
        assert sentinel.kind == "module"
        assert sentinel.id == "src/foo.py::__module__"

    def test_python_function_extracted(self, tmp_path):
        engine = CodeCartographyEngine()
        f = self._make_file(
            tmp_path, "src/foo.py", 'def greet(name):\n    return f"hello {name}"'
        )
        symbols = engine._extract_symbols([f], tmp_path)
        assert any(s.name == "greet" and s.kind == "function" for s in symbols)

    def test_ts_class_extracted(self, tmp_path):
        engine = CodeCartographyEngine()
        f = self._make_file(tmp_path, "src/App.tsx", "export class App {}")
        symbols = engine._extract_symbols([f], tmp_path)
        assert any(
            s.name == "App" and s.kind == "class" and s.exported for s in symbols
        )

    def test_id_collision_disambiguated(self, tmp_path):
        """Two symbols with the same name must produce distinct ids."""
        engine = CodeCartographyEngine()
        content = "def foo():\n    pass\ndef foo():\n    pass\n"
        f = self._make_file(tmp_path, "src/dup.py", content)
        symbols = engine._extract_symbols([f], tmp_path)
        ids = [s.id for s in symbols if s.name == "foo"]
        assert len(ids) == len(set(ids)), "Symbol IDs must be unique"


# ---------------------------------------------------------------------------
# Step 20: topological sort / dependency flow
# ---------------------------------------------------------------------------


class TestTopologicalSort:
    def test_empty_graph(self):
        engine = CodeCartographyEngine()
        result = engine._compute_dependency_flow({"edges": [], "nodes": []})
        assert result["tiers"] == []
        assert result["entry_points"] == []
        assert result["cycles"] == []

    def test_simple_chain(self):
        engine = CodeCartographyEngine()
        edges = [
            {"from_file": "a.py", "to_file": "b.py"},
            {"from_file": "b.py", "to_file": "c.py"},
        ]
        result = engine._compute_dependency_flow(
            {"edges": edges, "nodes": ["a.py", "b.py", "c.py"]}
        )
        # a.py has no incoming edges → first tier
        assert "a.py" in result["tiers"][0]
        # a.py imports others but nothing imports it → entry point
        assert "a.py" in result["entry_points"]
        # c.py is imported by b.py → not an entry point
        assert "c.py" not in result["entry_points"]

    def test_cycle_detected(self):
        engine = CodeCartographyEngine()
        edges = [
            {"from_file": "a.py", "to_file": "b.py"},
            {"from_file": "b.py", "to_file": "a.py"},
        ]
        result = engine._compute_dependency_flow(
            {"edges": edges, "nodes": ["a.py", "b.py"]}
        )
        cycle_nodes = [n for cycle in result["cycles"] for n in cycle]
        assert "a.py" in cycle_nodes
        assert "b.py" in cycle_nodes


# ---------------------------------------------------------------------------
# Step 9: slice detail/projection/filter behavior
# ---------------------------------------------------------------------------


class TestSliceEngineBehavior:
    @staticmethod
    def _graph_inputs():
        # Intentionally unsorted inputs to verify deterministic ordering.
        files = [
            {
                "path": "src/ui/view.ts",
                "language": "typescript",
                "layer_tag": "ui",
                "loc": 5,
            },
            {
                "path": "src/domain/service.py",
                "language": "python",
                "layer_tag": "domain",
                "loc": 11,
            },
            {
                "path": "src/api/controller.py",
                "language": "python",
                "layer_tag": "api",
                "loc": 7,
            },
            {
                "path": "src/domain/model.py",
                "language": "python",
                "layer_tag": "domain",
                "loc": 9,
            },
        ]

        symbols = [
            {
                "file": "src/domain/service.py",
                "name": "Service",
                "kind": "class",
                "start_line": 10,
                "visibility": "internal",
            },
            {
                "file": "src/domain/model.py",
                "name": "User",
                "kind": "class",
                "start_line": 1,
                "visibility": "exported",
            },
            {
                "file": "src/api/controller.py",
                "name": "handle",
                "kind": "function",
                "start_line": 12,
                "visibility": "exported",
            },
            {
                "file": "src/domain/service.py",
                "name": "run",
                "kind": "function",
                "start_line": 4,
                "visibility": "exported",
            },
            {
                "file": "src/ui/view.ts",
                "name": "View",
                "kind": "class",
                "start_line": 2,
                "visibility": "exported",
            },
        ]

        references = [
            {
                "from_file": "src/domain/service.py",
                "to_file": "src/domain/model.py",
                "reference_kind": "import",
                "from_line": 40,
            },
            {
                "from_file": "src/api/controller.py",
                "to_file": "src/domain/service.py",
                "reference_kind": "import",
                "from_line": 20,
            },
            {
                "from_file": "src/api/controller.py",
                "to_file": "src/domain/service.py",
                "reference_kind": "import",
                "from_line": 5,
            },
            {
                "from_file": "src/ui/view.ts",
                "to_file": "src/api/controller.py",
                "reference_kind": "import",
                "from_line": 3,
            },
        ]

        return files, symbols, references

    @staticmethod
    def _domain_scope():
        return {
            "scope_type": "explicit_files",
            "patterns": ["src/api/controller.py"],
            "include_transitive": True,
            "depth": 2,
        }

    def test_slice_detail_returns_scoped_graph_with_deterministic_ordering(self):
        engine = CodeCartographyEngine()
        files, symbols, references = self._graph_inputs()

        result = engine.get_slice_detail(
            {
                "workspace_id": "workspace-demo",
                "slice_id": "slice-core",
                "slice_scope": self._domain_scope(),
                "filters": [
                    {"filter_type": "layer_tag", "values": ["domain", "api", "api"]},
                    {"type": "language_tag", "values": ["python", "python"]},
                ],
                "files": files,
                "symbols": symbols,
                "references": references,
            }
        )

        assert result["slice_id"] == "slice-core"
        assert result["workspace_id"] == "workspace-demo"
        assert result["result_uri"] == "architecture://ws_workspace-demo/slices/slice-core"

        assert result["scope"] == {
            "scope_type": "explicit_files",
            "patterns": ["src/api/controller.py"],
            "include_transitive": True,
            "depth": 2,
        }
        assert result["filters"] == [
            {"filter_type": "language_tag", "values": ["python"]},
            {"filter_type": "layer_tag", "values": ["api", "domain"]},
        ]

        assert [node["path"] for node in result["nodes"]] == [
            "src/api/controller.py",
            "src/domain/model.py",
            "src/domain/service.py",
        ]
        assert result["edges"] == [
            {
                "from_module": "src.api.controller",
                "to_module": "src.domain.service",
                "edge_kind": "import",
                "weight": 2,
            },
            {
                "from_module": "src.domain.service",
                "to_module": "src.domain.model",
                "edge_kind": "import",
            },
        ]

        assert result["projection_summary"] == {
            "file_count": 3,
            "symbol_count": 4,
            "edge_count": 2,
        }
        assert result["detail"]["projection_summary"] == result["projection_summary"]
        assert result["truncated"] is False
        assert result["diagnostics"] == []

    def test_slice_detail_is_stable_when_input_order_changes(self):
        engine = CodeCartographyEngine()
        files, symbols, references = self._graph_inputs()

        forward = engine.get_slice_detail(
            {
                "slice_id": "slice-core",
                "slice_scope": self._domain_scope(),
                "files": files,
                "symbols": symbols,
                "references": references,
            }
        )
        reverse = engine.get_slice_detail(
            {
                "slice_id": "slice-core",
                "slice_scope": self._domain_scope(),
                "files": list(reversed(files)),
                "symbols": list(reversed(symbols)),
                "references": list(reversed(references)),
            }
        )

        assert forward["nodes"] == reverse["nodes"]
        assert forward["edges"] == reverse["edges"]
        assert forward["projection_summary"] == reverse["projection_summary"]

    def test_slice_projection_module_level_enforces_stable_limit_and_counts(self):
        engine = CodeCartographyEngine()
        files, symbols, references = self._graph_inputs()

        result = engine.get_slice_projection(
            {
                "workspace_id": "workspace-demo",
                "slice_id": "slice-core",
                "projection_type": "module_level",
                "limit": 2,
                "slice_scope": self._domain_scope(),
                "filters": [{"filter_type": "language_tag", "values": ["python"]}],
                "files": files,
                "symbols": symbols,
                "references": references,
            }
        )

        assert result["projection_type"] == "module_level"
        assert result["result_uri"] == (
            "architecture://ws_workspace-demo/slices/slice-core/projection/module_level"
        )
        assert result["total_in_slice"] == 3
        assert result["returned"] == 2
        assert result["truncated"] is True
        assert [entry["item"]["module_id"] for entry in result["items"]] == [
            "src.api.controller",
            "src.domain.model",
        ]
        assert result["projected_edges"] == [
            {
                "from_module": "src.api.controller",
                "to_module": "src.domain.service",
                "edge_kind": "import",
                "weight": 2,
            },
            {
                "from_module": "src.domain.service",
                "to_module": "src.domain.model",
                "edge_kind": "import",
            },
        ]
        assert result["diagnostics"] == []

    def test_slice_projection_symbol_level_applies_visibility_and_kind_filters(self):
        engine = CodeCartographyEngine()
        files, symbols, references = self._graph_inputs()

        result = engine.get_slice_projection(
            {
                "slice_id": "slice-symbols",
                "projection_type": "symbol_level",
                "slice_scope": {"scope_type": "explicit_files", "patterns": []},
                "filters": [
                    {"filter_type": "visibility", "values": ["exported"]},
                    {"filter_type": "symbol_kind", "values": ["function"]},
                ],
                "files": files,
                "symbols": symbols,
                "references": references,
            }
        )

        assert result["projection_type"] == "symbol_level"
        assert result["total_in_slice"] == 2
        assert result["returned"] == 2
        assert result["truncated"] is False
        assert result["projected_edges"] == []
        assert [entry["item"]["symbol_id"] for entry in result["items"]] == [
            "src/api/controller.py::handle",
            "src/domain/service.py::run",
        ]

    def test_slice_filters_returns_sorted_available_dimensions_and_types(self):
        engine = CodeCartographyEngine()
        files, symbols, references = self._graph_inputs()

        result = engine.get_slice_filters(
            {
                "workspace_id": "workspace-demo",
                "slice_id": "slice-core",
                "slice_scope": self._domain_scope(),
                "filters": [
                    {"type": "visibility", "values": ["internal", "exported", "exported"]},
                    {"filter_type": "language_tag", "values": ["python", "python"]},
                ],
                "files": files,
                "symbols": symbols,
                "references": references,
            }
        )

        expected_filters = [
            {"filter_type": "language_tag", "values": ["python"]},
            {"filter_type": "visibility", "values": ["exported", "internal"]},
        ]

        assert result["workspace_id"] == "workspace-demo"
        assert result["slice_id"] == "slice-core"
        assert result["result_uri"] == "architecture://ws_workspace-demo/slices/slice-core/filters"
        assert result["filters"] == expected_filters
        assert result["active_filters"] == expected_filters
        assert result["available_layer_tags"] == ["api", "domain"]
        assert result["available_language_tags"] == ["python"]
        assert result["available_path_prefixes"] == ["src", "src/api", "src/domain"]
        assert result["available_types"] == [
            "language_tag",
            "layer_tag",
            "path_glob",
            "symbol_kind",
            "visibility",
        ]
        assert result["diagnostics"] == []

    def test_slice_detail_with_empty_scope_returns_empty_graph(self):
        engine = CodeCartographyEngine()
        files, symbols, references = self._graph_inputs()

        result = engine.get_slice_detail(
            {
                "slice_id": "slice-empty",
                "slice_scope": {
                    "scope_type": "explicit_files",
                    "patterns": ["src/does/not/exist.py"],
                    "include_transitive": True,
                },
                "files": files,
                "symbols": symbols,
                "references": references,
            }
        )

        assert result["nodes"] == []
        assert result["edges"] == []
        assert result["projection_summary"] == {
            "file_count": 0,
            "symbol_count": 0,
            "edge_count": 0,
        }
        assert result["truncated"] is False

    def test_slice_projection_with_empty_scope_returns_empty_projection(self):
        engine = CodeCartographyEngine()
        files, symbols, references = self._graph_inputs()

        result = engine.get_slice_projection(
            {
                "slice_id": "slice-empty",
                "projection_type": "file_level",
                "slice_scope": {
                    "scope_type": "explicit_files",
                    "patterns": ["src/does/not/exist.py"],
                },
                "files": files,
                "symbols": symbols,
                "references": references,
            }
        )

        assert result["items"] == []
        assert result["projected_nodes"] == []
        assert result["projected_edges"] == []
        assert result["total_in_slice"] == 0
        assert result["returned"] == 0
        assert result["truncated"] is False

    def test_slice_filters_with_empty_scope_returns_empty_dimensions(self):
        engine = CodeCartographyEngine()
        files, symbols, references = self._graph_inputs()

        result = engine.get_slice_filters(
            {
                "slice_id": "slice-empty",
                "slice_scope": {
                    "scope_type": "explicit_files",
                    "patterns": ["src/does/not/exist.py"],
                },
                "filters": [{"filter_type": "layer_tag", "values": ["api"]}],
                "files": files,
                "symbols": symbols,
                "references": references,
            }
        )

        assert result["filters"] == [{"filter_type": "layer_tag", "values": ["api"]}]
        assert result["active_filters"] == [{"filter_type": "layer_tag", "values": ["api"]}]
        assert result["available_layer_tags"] == []
        assert result["available_language_tags"] == []
        assert result["available_path_prefixes"] == []
        assert result["available_types"] == ["layer_tag"]
