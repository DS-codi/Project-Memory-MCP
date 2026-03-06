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

from memory_cartographer.contracts.version import SCHEMA_VERSION


PYTHON_CORE_ROOT = Path(__file__).resolve().parents[1]
RUNTIME_MODULE = "memory_cartographer.runtime.entrypoint"


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
