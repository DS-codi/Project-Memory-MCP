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

    TODO: implement dispatcher — route each action to its engine module:
    - 'cartograph'         -> engines.code_cartography + engines.database_cartography
    - 'probe_capabilities' -> contracts.version.CapabilityAdvertisement
    - 'health_check'       -> simple liveness check
    """

    diag = _empty_diagnostics()

    if action == "probe_capabilities":
        cap = CapabilityAdvertisement()
        return "ok", cap.to_dict(), diag

    if action == "health_check":
        return "ok", {"status": "healthy", "schema_version": SCHEMA_VERSION}, diag

    if action == "cartograph":
        # TODO: implement cartograph action — invoke scan, parse, graph resolution,
        #       and export pipeline from engines sub-package.
        diag["errors"].append(f"Action '{action}' not yet implemented")
        return "error", None, diag

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
