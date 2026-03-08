"""
Runtime entrypoint contract tests for NDJSON request/response envelopes.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Tuple

import pytest

from memory_cartographer.contracts.version import SCHEMA_VERSION


PYTHON_CORE_ROOT = Path(__file__).resolve().parents[1]
RUNTIME_MODULE = "memory_cartographer.runtime.entrypoint"
MISSING_WORKSPACE_PATH = "C:/__pmcp_runtime_entrypoint_missing_workspace__"


def _run_ndjson_request(
    *,
    request_id: str,
    action: str,
    args: Dict[str, Any] | None = None,
    timeout_ms: int = 30_000,
) -> Tuple[subprocess.CompletedProcess[str], Dict[str, Any]]:
    request_envelope = {
        "schema_version": SCHEMA_VERSION,
        "request_id": request_id,
        "action": action,
        "args": args or {},
        "timeout_ms": timeout_ms,
    }

    env = os.environ.copy()
    existing_pythonpath = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = (
        f"{PYTHON_CORE_ROOT}{os.pathsep}{existing_pythonpath}"
        if existing_pythonpath
        else str(PYTHON_CORE_ROOT)
    )

    completed = subprocess.run(
        [sys.executable, "-m", RUNTIME_MODULE],
        input=json.dumps(request_envelope) + "\n",
        text=True,
        capture_output=True,
        cwd=str(PYTHON_CORE_ROOT),
        env=env,
        check=False,
    )

    non_empty_lines = [line for line in completed.stdout.splitlines() if line.strip()]
    assert len(non_empty_lines) == 1, (
        f"Expected exactly one NDJSON response line, got {len(non_empty_lines)}. "
        f"stdout={completed.stdout!r} stderr={completed.stderr!r}"
    )

    response_envelope = json.loads(non_empty_lines[0])
    return completed, response_envelope


def _assert_common_response_envelope(
    response_envelope: Dict[str, Any],
    *,
    request_id: str,
    status: str,
) -> None:
    assert response_envelope["schema_version"] == SCHEMA_VERSION
    assert response_envelope["request_id"] == request_id
    assert response_envelope["status"] == status
    assert "result" in response_envelope
    assert "diagnostics" in response_envelope
    assert isinstance(response_envelope["elapsed_ms"], int)

    diagnostics = response_envelope["diagnostics"]
    assert isinstance(diagnostics, dict)
    for key in ("warnings", "errors", "markers", "skipped_paths"):
        assert key in diagnostics
        assert isinstance(diagnostics[key], list)


def test_probe_capabilities_ndjson_request_handling() -> None:
    request_id = "req-probe-capabilities"

    completed, response_envelope = _run_ndjson_request(
        request_id=request_id,
        action="probe_capabilities",
    )

    assert completed.returncode == 0
    assert completed.stdout.endswith("\n")
    _assert_common_response_envelope(response_envelope, request_id=request_id, status="ok")

    result = response_envelope["result"]
    assert isinstance(result, dict)
    assert result["schema_version"] == SCHEMA_VERSION
    assert "probe_capabilities" in result["supported_actions"]
    assert "health_check" in result["supported_actions"]


def test_health_check_ndjson_request_handling() -> None:
    request_id = "req-health-check"

    completed, response_envelope = _run_ndjson_request(
        request_id=request_id,
        action="health_check",
    )

    assert completed.returncode == 0
    assert completed.stdout.endswith("\n")
    _assert_common_response_envelope(response_envelope, request_id=request_id, status="ok")

    assert response_envelope["result"] == {
        "status": "healthy",
        "schema_version": SCHEMA_VERSION,
    }


def test_cartograph_summary_response_envelope() -> None:
    request_id = "req-cartograph-summary"
    request_args = {
        "query": "summary",
        "workspace_path": "C:/workspace/example",
        "scope": {"max_files": 25},
        "languages": ["python", "typescript"],
    }

    completed, response_envelope = _run_ndjson_request(
        request_id=request_id,
        action="cartograph",
        args=request_args,
        timeout_ms=5_000,
    )

    assert completed.returncode == 0
    _assert_common_response_envelope(response_envelope, request_id=request_id, status="ok")

    result = response_envelope["result"]
    assert isinstance(result, dict)
    assert result["query"] == "summary"
    assert result["engine"] == "code_cartography"
    assert result["runtime_slice"] == "minimal_summary_v1"

    diagnostics = response_envelope["diagnostics"]
    assert diagnostics["errors"] == []
    assert "summary_minimal_slice" in diagnostics["markers"]


@pytest.mark.parametrize(
    ("query", "request_args", "expected_keys"),
    [
        (
            "file_context",
            {
                "workspace_path": MISSING_WORKSPACE_PATH,
                "file_id": "src/example.py",
                "include_symbols": True,
                "include_references": True,
            },
            ("file_id", "symbols", "references"),
        ),
        (
            "flow_entry_points",
            {
                "workspace_path": MISSING_WORKSPACE_PATH,
                "layer_filter": ["api", "domain"],
                "language_filter": ["python"],
            },
            ("entry_points", "tiers", "cycles"),
        ),
        (
            "layer_view",
            {
                "workspace_path": MISSING_WORKSPACE_PATH,
                "layers": ["api", "domain"],
                "depth_limit": 2,
                "include_cross_layer_edges": True,
            },
            ("layers", "nodes", "edges"),
        ),
        (
            "search",
            {
                "workspace_path": MISSING_WORKSPACE_PATH,
                "search_query": "auth",
                "search_scope": "all",
                "limit": 10,
            },
            ("search_query", "scope", "results", "total"),
        ),
        (
            "slice_detail",
            {
                "workspace_id": "workspace-demo",
                "slice_id": "slice-core",
            },
            ("slice_id", "detail", "nodes", "edges"),
        ),
        (
            "slice_projection",
            {
                "workspace_id": "workspace-demo",
                "slice_id": "slice-core",
                "projection_type": "file_level",
            },
            ("slice_id", "projection_type", "projected_nodes", "projected_edges"),
        ),
        (
            "slice_filters",
            {
                "workspace_id": "workspace-demo",
                "slice_id": "slice-core",
            },
            ("workspace_id", "filters", "available_types"),
        ),
    ],
)
def test_cartograph_non_summary_query_response_envelopes(
    query: str,
    request_args: Dict[str, Any],
    expected_keys: Tuple[str, ...],
) -> None:
    request_id = f"req-cartograph-{query}"

    completed, response_envelope = _run_ndjson_request(
        request_id=request_id,
        action="cartograph",
        args={"query": query, **request_args},
        timeout_ms=5_000,
    )

    assert completed.returncode == 0
    _assert_common_response_envelope(response_envelope, request_id=request_id, status="ok")

    result = response_envelope["result"]
    assert isinstance(result, dict)
    assert result["query"] == query
    assert result.get("partial") is not True
    for key in expected_keys:
        assert key in result

    diagnostics = response_envelope["diagnostics"]
    assert diagnostics["errors"] == []


def test_cartograph_unknown_query_returns_error_envelope() -> None:
    request_id = "req-cartograph-unknown-query"

    completed, response_envelope = _run_ndjson_request(
        request_id=request_id,
        action="cartograph",
        args={
            "query": "not_a_supported_query",
            "workspace_path": MISSING_WORKSPACE_PATH,
        },
    )

    assert completed.returncode == 1
    _assert_common_response_envelope(response_envelope, request_id=request_id, status="error")
    assert response_envelope["result"] is None

    diagnostics = response_envelope["diagnostics"]
    assert any("not implemented" in err for err in diagnostics["errors"])
    assert any("supported queries" in err for err in diagnostics["errors"])


def test_cartograph_file_context_handler_failure_returns_partial_with_diagnostics() -> None:
    request_id = "req-cartograph-file-context-partial"

    completed, response_envelope = _run_ndjson_request(
        request_id=request_id,
        action="cartograph",
        args={
            "query": "file_context",
            "workspace_path": {"unexpected": "object"},
            "file_id": "src/example.py",
        },
        timeout_ms=5_000,
    )

    assert completed.returncode == 0
    _assert_common_response_envelope(response_envelope, request_id=request_id, status="partial")

    result = response_envelope["result"]
    assert isinstance(result, dict)
    assert result["query"] == "file_context"
    assert result["file_id"] == "src/example.py"
    assert result["symbols"] == []
    assert result["references"] == []
    assert result["partial"] is True

    diagnostics = response_envelope["diagnostics"]
    assert any("cartograph query 'file_context' failed" in err for err in diagnostics["errors"])
    assert any("partial fallback envelope after handler failure" in warning for warning in diagnostics["warnings"])
    assert "file_context_query_failed" in diagnostics["markers"]
    assert "cartograph_query_partial_fallback" in diagnostics["markers"]


def test_unknown_action_returns_error_envelope() -> None:
    request_id = "req-unknown-action"

    completed, response_envelope = _run_ndjson_request(
        request_id=request_id,
        action="does_not_exist",
    )

    assert completed.returncode == 1
    _assert_common_response_envelope(response_envelope, request_id=request_id, status="error")

    assert response_envelope["result"] is None
    diagnostics = response_envelope["diagnostics"]
    assert diagnostics["warnings"] == []
    assert any("Unknown action" in err for err in diagnostics["errors"])
