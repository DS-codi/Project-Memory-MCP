"""
memory_cartographer.runtime.entrypoint
========================================

Subprocess entry point for the memory_cartographer Python core.

Invocation
----------
::

    python -m memory_cartographer.runtime.entrypoint

The TypeScript adapter spawns this module as a subprocess. It reads exactly
one NDJSON line from stdin (the request envelope), dispatches the requested
action, writes exactly one NDJSON line to stdout (the response envelope), and
exits.

Wire protocol
-------------
- **stdin**  : One UTF-8 NDJSON line containing the request envelope.
- **stdout** : One UTF-8 NDJSON line containing the response envelope.
- **stderr** : Fatal startup / parse errors only; diagnostics go in the envelope.
- **exit 0** : Success or partial result (response written to stdout).
- **exit 1** : Fatal error before a response could be written.

Request envelope fields (see runtime-boundary.md for full spec)
---------------------------------------------------------------
- ``schema_version``     : str — version adapter was built against
- ``request_id``         : str — unique correlation ID
- ``action``             : str — 'cartograph' | 'probe_capabilities' | 'health_check'
- ``args``               : dict — action-specific parameters
- ``timeout_ms``         : int — budget for this invocation
- ``cancellation_token`` : str (optional) — ignored in v1

Response envelope fields
------------------------
- ``schema_version``  : str — version this core produced
- ``request_id``      : str — echoed from request
- ``status``          : 'ok' | 'partial' | 'error'
- ``result``          : dict | None
- ``diagnostics``     : dict with warnings, errors, markers, skipped_paths
- ``elapsed_ms``      : int

See: docs/architecture/memory-cartographer/runtime-boundary.md
"""

from __future__ import annotations

import json
import sys
import time
from typing import Any, Dict, Optional

from memory_cartographer.contracts.version import (
    SCHEMA_VERSION,
    CapabilityAdvertisement,
)


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------

def _build_response(
    request_id: str,
    status: str,
    result: Optional[Any],
    diagnostics: Dict[str, Any],
    elapsed_ms: int,
) -> Dict[str, Any]:
    """Build a canonical response envelope."""
    return {
        "schema_version": SCHEMA_VERSION,
        "request_id": request_id,
        "status": status,
        "result": result,
        "diagnostics": diagnostics,
        "elapsed_ms": elapsed_ms,
    }


def _empty_diagnostics() -> Dict[str, Any]:
    return {"warnings": [], "errors": [], "markers": [], "skipped_paths": []}


def _normalize_query_kind(value: Any) -> Optional[str]:
    """Normalize a query selector to a lowercase query kind, when present."""
    if isinstance(value, str):
        normalized = value.strip().lower()
        return normalized or None

    if isinstance(value, dict):
        for key in ("kind", "type", "name", "action", "intent", "query"):
            candidate = value.get(key)
            if isinstance(candidate, str):
                normalized = candidate.strip().lower()
                if normalized:
                    return normalized

    return None


def _resolve_cartograph_query_kind(args: Dict[str, Any]) -> tuple[str, bool]:
    """
    Resolve the cartograph query kind.

    Returns (query_kind, used_default).
    """
    for key in ("query", "query_type", "intent", "operation", "mode"):
        kind = _normalize_query_kind(args.get(key))
        if kind:
            return kind, False

    # For this runtime slice, an unspecified cartograph query defaults to summary.
    return "summary", True


def _build_minimal_summary_result(args: Dict[str, Any], timeout_ms: int) -> Dict[str, Any]:
    """Build a deterministic minimal summary result payload."""
    workspace_path = args.get("workspace_path")
    scope = args.get("scope") if isinstance(args.get("scope"), dict) else {}
    languages = args.get("languages") if isinstance(args.get("languages"), list) else []
    normalized_languages = [lang for lang in languages if isinstance(lang, str)]

    return {
        "query": "summary",
        "engine": "code_cartography",
        "runtime_slice": "minimal_summary_v1",
        "workspace": {
            "path": workspace_path if isinstance(workspace_path, str) else None,
            "scope": scope,
            "languages": normalized_languages,
        },
        "summary": {
            "file_count": 0,
            "module_count": 0,
            "symbol_count": 0,
            "dependency_edge_count": 0,
            "entry_point_count": 0,
            "architecture_layers": [],
            "has_cycles": False,
        },
        "budget": {
            "timeout_ms": timeout_ms,
        },
    }


def _write_response(envelope: Dict[str, Any]) -> None:
    """Write a single NDJSON line to stdout and flush."""
    sys.stdout.write(json.dumps(envelope, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _write_error(request_id: str, error_msg: str, elapsed_ms: int) -> None:
    diag = _empty_diagnostics()
    diag["errors"].append(error_msg)
    _write_response(_build_response(request_id, "error", None, diag, elapsed_ms))


# ---------------------------------------------------------------------------
# Action dispatcher
# ---------------------------------------------------------------------------

def _dispatch(action: str, args: Dict[str, Any], timeout_ms: int) -> tuple[str, Optional[Any], Dict[str, Any]]:
    """
    Dispatch a request action and return (status, result, diagnostics).

    Current implementation supports:
    - 'probe_capabilities' -> contracts.version.CapabilityAdvertisement
    - 'health_check'       -> simple liveness check
    - 'cartograph'         -> minimal 'summary' query for runtime slice

    Non-summary cartograph queries are intentionally returned as explicit
    not-implemented errors in this slice.
    """

    diag = _empty_diagnostics()

    if action == "probe_capabilities":
        cap = CapabilityAdvertisement()
        return "ok", cap.to_dict(), diag

    if action == "health_check":
        return "ok", {"status": "healthy", "schema_version": SCHEMA_VERSION}, diag

    if action == "cartograph":
        query_kind, used_default = _resolve_cartograph_query_kind(args)
        if query_kind != "summary":
            diag["errors"].append(
                f"cartograph query '{query_kind}' is not implemented in this runtime slice; only 'summary' is supported"
            )
            return "error", None, diag

        if used_default:
            diag["warnings"].append(
                "No cartograph query selector provided; defaulted to 'summary' for this minimal runtime slice"
            )
            diag["markers"].append("summary_selector_defaulted")

        diag["markers"].append("summary_minimal_slice")
        return "ok", _build_minimal_summary_result(args, timeout_ms), diag

    diag["errors"].append(f"Unknown action: '{action}'")
    return "error", None, diag


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main() -> None:
    """
    Read one NDJSON request from stdin, dispatch, write one NDJSON response
    to stdout, then exit.
    """
    start_time = time.monotonic()

    # Read the request envelope from stdin
    try:
        raw_request = sys.stdin.readline()
        if not raw_request.strip():
            print(
                json.dumps({"schema_version": SCHEMA_VERSION, "request_id": "",
                            "status": "error", "result": None,
                            "diagnostics": {"warnings": [], "errors": ["Empty request envelope"],
                                            "markers": [], "skipped_paths": []},
                            "elapsed_ms": 0}),
                file=sys.stdout
            )
            sys.exit(1)

        request = json.loads(raw_request)
    except json.JSONDecodeError as exc:
        print(
            json.dumps({"schema_version": SCHEMA_VERSION, "request_id": "",
                        "status": "error", "result": None,
                        "diagnostics": {"warnings": [], "errors": [f"Invalid JSON in request: {exc}"],
                                        "markers": [], "skipped_paths": []},
                        "elapsed_ms": 0}),
            file=sys.stdout,
            flush=True,
        )
        sys.exit(1)
    except Exception as exc:  # noqa: BLE001
        print(f"Fatal: could not read request: {exc}", file=sys.stderr, flush=True)
        sys.exit(1)

    request_id: str = request.get("request_id", "")
    action: str = request.get("action", "")
    args: Dict[str, Any] = request.get("args", {})
    timeout_ms: int = request.get("timeout_ms", 30_000)

    # Dispatch the action
    try:
        status, result, diagnostics = _dispatch(action, args, timeout_ms)
    except Exception as exc:  # noqa: BLE001
        elapsed = int((time.monotonic() - start_time) * 1000)
        _write_error(request_id, f"Unhandled exception in dispatcher: {exc}", elapsed)
        sys.exit(1)

    elapsed_ms = int((time.monotonic() - start_time) * 1000)
    _write_response(_build_response(request_id, status, result, diagnostics, elapsed_ms))
    sys.exit(0 if status in ("ok", "partial") else 1)


if __name__ == "__main__":
    main()
