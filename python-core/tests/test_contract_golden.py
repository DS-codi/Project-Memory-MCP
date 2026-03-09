"""
test_contract_golden.py
-----------------------
Golden fixture and adversarial acceptance tests for memory_cartographer
guardrails. See docs/qa/memory-cartographer-acceptance.md.
"""

from __future__ import annotations

import time
import pytest
from pathlib import Path

from memory_cartographer.guardrails.scope_limits import (
    ScopeConfig,
    DEFAULT_SCOPE_CONFIG,
    is_path_allowed,
)
from memory_cartographer.guardrails.safety import (
    SafetyPolicy,
    DEFAULT_SAFETY_POLICY,
    is_path_safe,
    mask_secrets,
    is_binary,
    should_skip_file,
)
from memory_cartographer.guardrails.perf_budget import PerfConfig, PerfTracker
from memory_cartographer.contracts.normalization import (
    DiagnosticCode,
    normalize,
)


# ---------------------------------------------------------------------------
# Scope guardrail tests
# ---------------------------------------------------------------------------

class TestScopeGuardrails:
    def test_includes_typescript(self):
        assert is_path_allowed("src/index.ts") is True

    def test_includes_python(self):
        assert is_path_allowed("core/main.py") is True

    def test_excludes_node_modules(self):
        assert is_path_allowed("src/node_modules/lodash/index.js") is False

    def test_excludes_git(self):
        assert is_path_allowed(".git/config") is False

    def test_excludes_pycache(self):
        assert is_path_allowed("src/__pycache__/module.cpython-311.pyc") is False

    def test_excludes_dist(self):
        assert is_path_allowed("dist/bundle.js") is False

    def test_allow_override_beats_deny(self):
        cfg = ScopeConfig(allow_overrides=["**/vendor/my-lib/**"])
        assert is_path_allowed("vendor/my-lib/helpers.ts", cfg) is True

    def test_exclude_language_rust(self):
        cfg = ScopeConfig(exclude_languages=["rust"])
        assert is_path_allowed("engine/core.rs", cfg) is False

    def test_unknown_extension_excluded(self):
        assert is_path_allowed("assets/image.png") is False


# ---------------------------------------------------------------------------
# Safety guardrail tests
# ---------------------------------------------------------------------------

class TestSafetyGuardrails:
    def test_rejects_path_traversal(self, tmp_path: Path):
        assert is_path_safe("../../etc/passwd", str(tmp_path)) is False

    def test_rejects_relative_traversal(self, tmp_path: Path):
        assert is_path_safe(str(tmp_path / ".." / "outside.txt"), str(tmp_path)) is False

    def test_accepts_safe_child_path(self, tmp_path: Path):
        child = tmp_path / "subdir" / "file.py"
        child.parent.mkdir(parents=True)
        child.write_text("print('hello')")
        assert is_path_safe(str(child), str(tmp_path)) is True

    def test_mask_password(self):
        result = mask_secrets({"password": "s3cr3t", "username": "alice"})
        assert result["password"] == "[REDACTED]"
        assert result["username"] == "alice"

    def test_mask_token(self):
        result = mask_secrets({"token": "bearer_xyz"})
        assert result["token"] == "[REDACTED]"

    def test_mask_api_key(self):
        result = mask_secrets({"api_key": "abc123"})
        assert result["api_key"] == "[REDACTED]"

    def test_mask_nested_secret(self):
        result = mask_secrets({"db": {"password": "secret123"}})
        assert result["db"]["password"] == "[REDACTED]"  # type: ignore[index]

    def test_preserves_non_sensitive(self):
        result = mask_secrets({"host": "localhost", "port": 5432})
        assert result["host"] == "localhost"
        assert result["port"] == 5432

    def test_is_binary_detects_null_bytes(self, tmp_path: Path):
        f = tmp_path / "file.bin"
        f.write_bytes(b"hello\x00world")
        assert is_binary(str(f)) is True

    def test_is_binary_text_file(self, tmp_path: Path):
        f = tmp_path / "file.py"
        f.write_text("print('hello')")
        assert is_binary(str(f)) is False

    def test_is_binary_empty_file(self, tmp_path: Path):
        f = tmp_path / "empty.txt"
        f.write_bytes(b"")
        assert is_binary(str(f)) is False

    def test_should_skip_binary(self, tmp_path: Path):
        f = tmp_path / "lib.so"
        f.write_bytes(b"\x7fELF\x00" + b"\x00" * 50)
        reason = should_skip_file(str(f), str(tmp_path))
        assert reason == "binary"

    def test_should_skip_large_file(self, tmp_path: Path):
        f = tmp_path / "large.sql"
        # Write 11 MB of text
        f.write_bytes(b"x" * (11 * 1024 * 1024))
        reason = should_skip_file(str(f), str(tmp_path))
        assert reason == "size_exceeded"

    def test_should_skip_traversal(self, tmp_path: Path):
        reason = should_skip_file("../../etc/passwd", str(tmp_path))
        assert reason == "path_violation"

    def test_no_skip_for_normal_file(self, tmp_path: Path):
        f = tmp_path / "src" / "main.py"
        f.parent.mkdir()
        f.write_text("x = 1")
        reason = should_skip_file(str(f), str(tmp_path))
        assert reason is None


# ---------------------------------------------------------------------------
# Performance guardrail tests
# ---------------------------------------------------------------------------

class TestPerfGuardrails:
    def test_should_cancel_hard_timeout(self):
        cfg = PerfConfig(hard_time_limit_s=0.001)
        tracker = PerfTracker(cfg)
        tracker.start()
        time.sleep(0.01)
        assert tracker.should_cancel() is True
        assert tracker.partial is True
        assert tracker.partial_reason == "timeout"

    def test_no_cancel_within_budget(self):
        cfg = PerfConfig(hard_time_limit_s=9999.0, hard_memory_limit_bytes=10 * 1024 ** 3)
        tracker = PerfTracker(cfg)
        tracker.start()
        assert tracker.should_cancel() is False

    def test_batch_counter_increments(self):
        tracker = PerfTracker()
        tracker.start()
        tracker.on_batch_complete(batch_file_count=100)
        tracker.on_batch_complete(batch_file_count=200)
        assert tracker.batches_completed == 2
        assert tracker.files_processed == 300


# ---------------------------------------------------------------------------
# Normalization contract golden tests
# ---------------------------------------------------------------------------

class TestNormalizationContractGolden:
    def test_required_arrays_are_materialized_for_summary_and_sections(self):
        raw_output = {
            "query": "summary",
            "workspace": {},
            "summary": {
                "architecture_layers": None,
                "language_breakdown": None,
            },
            "symbols": None,
            "references": None,
            "code_cartography": {
                "files": None,
                "module_graph": {
                    "nodes": None,
                    "edges": None,
                },
                "dependency_flow": {
                    "tiers": None,
                    "entry_points": None,
                },
            },
        }

        normalized = normalize(raw_output)

        # These assertions guard against regression to no-op normalization.
        assert normalized["workspace"]["languages"] == []
        assert normalized["summary"]["architecture_layers"] == []
        assert normalized["summary"]["language_breakdown"] == []
        assert normalized["symbols"] == []
        assert normalized["references"] == []
        assert normalized["files"] == []
        assert normalized["code_cartography"]["files"] == []
        assert normalized["code_cartography"]["symbols"] == []
        assert normalized["code_cartography"]["references"] == []
        assert normalized["code_cartography"]["module_graph"]["nodes"] == []
        assert normalized["code_cartography"]["module_graph"]["edges"] == []
        assert normalized["code_cartography"]["dependency_flow"]["tiers"] == []
        assert normalized["code_cartography"]["dependency_flow"]["entry_points"] == []

    def test_slice_projection_ordering_is_deterministic_across_input_permutations(self):
        payload_a = {
            "query": "slice_projection",
            "projected_nodes": [
                {
                    "path": "src/z.py",
                    "file_id": "src/z.py",
                    "module_id": "m.z",
                    "symbol_id": "src/z.py::zeta",
                    "name": "zeta",
                    "start_line": 20,
                },
                {
                    "path": "src/a.py",
                    "file_id": "src/a.py",
                    "module_id": "m.a",
                    "symbol_id": "src/a.py::alpha",
                    "name": "alpha",
                    "start_line": 5,
                },
            ],
            "projected_edges": [
                {
                    "from_module": "m.z",
                    "from": "src/z.py::zeta",
                    "to_module": "m.a",
                    "to": "src/a.py::alpha",
                    "edge_kind": "calls",
                },
                {
                    "from_module": "m.a",
                    "from": "src/a.py::alpha",
                    "to_module": "m.z",
                    "to": "src/z.py::zeta",
                    "edge_kind": "imports",
                },
            ],
        }

        payload_b = {
            "query": "slice_projection",
            "projected_nodes": list(reversed(payload_a["projected_nodes"])),
            "projected_edges": list(reversed(payload_a["projected_edges"])),
        }

        normalized_a = normalize(payload_a)
        normalized_b = normalize(payload_b)

        expected_nodes = [
            {
                "path": "src/a.py",
                "file_id": "src/a.py",
                "module_id": "m.a",
                "symbol_id": "src/a.py::alpha",
                "name": "alpha",
                "start_line": 5,
            },
            {
                "path": "src/z.py",
                "file_id": "src/z.py",
                "module_id": "m.z",
                "symbol_id": "src/z.py::zeta",
                "name": "zeta",
                "start_line": 20,
            },
        ]
        expected_edges = [
            {
                "from_module": "m.a",
                "from": "src/a.py::alpha",
                "to_module": "m.z",
                "to": "src/z.py::zeta",
                "edge_kind": "imports",
            },
            {
                "from_module": "m.z",
                "from": "src/z.py::zeta",
                "to_module": "m.a",
                "to": "src/a.py::alpha",
                "edge_kind": "calls",
            },
        ]

        assert normalized_a["projected_nodes"] == expected_nodes
        assert normalized_a["projected_edges"] == expected_edges
        assert normalized_b["projected_nodes"] == expected_nodes
        assert normalized_b["projected_edges"] == expected_edges

    def test_partial_flag_propagates_from_generation_metadata_to_sections(self):
        raw_output = {
            "query": "slice_detail",
            "partial": False,
            "generation_metadata": {"partial": True},
            "detail": {"partial": False},
            "projection_summary": {},
        }

        normalized = normalize(raw_output)

        assert normalized["partial"] is True
        assert normalized["generation_metadata"]["partial"] is True
        assert normalized["detail"]["partial"] is True
        assert normalized["projection_summary"]["partial"] is True

    def test_identity_key_diagnostics_are_emitted_and_deduplicated(self):
        raw_output = {
            "query": "file_context",
            "symbols": [
                {"file": "src/main.py", "id": "invalid-symbol-id"},
                {"file": "src/main.py", "id": "invalid-symbol-id"},
            ],
            "references": [
                {
                    "from_file": "src/main.py",
                    "to_symbol_id": "broken-target-id",
                }
            ],
            "projected_nodes": [
                {
                    "file_id": "src/projection.py",
                    "id": "invalid-projected-node-id",
                }
            ],
        }

        normalized = normalize(raw_output)
        diagnostics = normalized.get("_normalization_diagnostics")

        assert isinstance(diagnostics, list)
        assert any(
            item.get("code") == DiagnosticCode.SYMBOL_PARSE_ERROR.value
            for item in diagnostics
            if isinstance(item, dict)
        )

        fields = {
            item.get("field")
            for item in diagnostics
            if isinstance(item, dict)
        }
        assert "symbols[].id" in fields
        assert "references[].to_symbol_id" in fields
        assert "projected_nodes[].id" in fields

        symbol_id_warnings = [
            item
            for item in diagnostics
            if isinstance(item, dict) and item.get("field") == "symbols[].id"
        ]
        assert len(symbol_id_warnings) == 1
