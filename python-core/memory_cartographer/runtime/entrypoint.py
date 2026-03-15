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
from typing import Any, Callable, Dict, Optional

from memory_cartographer.contracts.normalization import normalize
from memory_cartographer.contracts.version import (
    SCHEMA_VERSION,
    CapabilityAdvertisement,
)
from memory_cartographer.engines.code_cartography import CodeCartographyEngine


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


def _attach_query_to_result(query_kind: str, payload: Any) -> Dict[str, Any]:
    """Attach query metadata to cartograph payloads in a predictable shape."""
    if isinstance(payload, dict):
        result = dict(payload)
        result["query"] = query_kind
        return result

    return {"query": query_kind, "payload": payload}


def _coerce_int(value: Any, default: int) -> int:
    """Coerce a numeric-ish input to int while preserving deterministic defaults."""
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return default


def _append_unique(target: list[str], message: str) -> None:
    if message and message not in target:
        target.append(message)


def _marker_token(value: str) -> str:
    token = "".join(char if char.isalnum() else "_" for char in value.lower())
    while "__" in token:
        token = token.replace("__", "_")
    token = token.strip("_")
    return token or "unknown"


def _build_partial_query_result(query_kind: str, args: Dict[str, Any], timeout_ms: int) -> Dict[str, Any]:
    if query_kind == "summary":
        payload = _build_minimal_summary_result(args, timeout_ms)
        payload["partial"] = True
        return _attach_query_to_result("summary", payload)

    if query_kind == "file_context":
        return {
            "query": "file_context",
            "file_id": str(args.get("file_id") or ""),
            "symbols": [],
            "references": [],
            "partial": True,
        }

    if query_kind == "flow_entry_points":
        return {
            "query": "flow_entry_points",
            "entry_points": [],
            "tiers": [],
            "cycles": [],
            "partial": True,
        }

    if query_kind == "layer_view":
        return {
            "query": "layer_view",
            "layers": [],
            "nodes": [],
            "edges": [],
            "partial": True,
        }

    if query_kind == "search":
        return {
            "query": "search",
            "search_query": str(args.get("search_query") or args.get("search_term") or ""),
            "scope": str(args.get("search_scope") or "all"),
            "results": [],
            "total": 0,
            "partial": True,
        }

    if query_kind == "slice_detail":
        return {
            "query": "slice_detail",
            "slice_id": args.get("slice_id"),
            "detail": {},
            "nodes": [],
            "edges": [],
            "partial": True,
        }

    if query_kind == "slice_projection":
        return {
            "query": "slice_projection",
            "slice_id": args.get("slice_id"),
            "projection_type": args.get("projection_type"),
            "projected_nodes": [],
            "projected_edges": [],
            "partial": True,
        }

    if query_kind == "slice_filters":
        return {
            "query": "slice_filters",
            "workspace_id": args.get("workspace_id"),
            "filters": [],
            "available_types": [],
            "partial": True,
        }

    if query_kind == "full_scan":
        return {
            "query": "full_scan",
            "engine": "code_cartography",
            "runtime_slice": "full_scan_v1",
            "workspace": {"path": args.get("workspace_path"), "scope": {}, "languages": []},
            "summary": {"file_count": 0, "symbol_count": 0, "reference_count": 0,
                        "module_count": 0, "dependency_edge_count": 0,
                        "entry_point_count": 0, "has_cycles": False},
            "files": [],
            "symbols": [],
            "references": [],
            "module_graph": {"nodes": [], "edges": []},
            "dependency_flow": {"tiers": [], "entry_points": [], "cycles": []},
            "budget": {"timeout_ms": timeout_ms, "elapsed_ms": 0},
            "partial": True,
        }

    return {"query": query_kind, "payload": {}, "partial": True}


def _merge_normalization_diagnostics(
    query_kind: str,
    normalized_result: Dict[str, Any],
    diagnostics: Dict[str, Any],
) -> None:
    normalization_items = normalized_result.pop("_normalization_diagnostics", None)
    if not isinstance(normalization_items, list):
        return

    for item in normalization_items:
        if not isinstance(item, dict):
            continue

        severity = str(item.get("severity") or "warning").lower()
        code = str(item.get("code") or "NORMALIZATION").strip() or "NORMALIZATION"
        message = str(item.get("message") or "normalization diagnostic").strip()
        path = item.get("path")
        path_suffix = f" (path={path})" if isinstance(path, str) and path else ""
        rendered = f"[{code}] {message}{path_suffix}"

        if severity == "error":
            _append_unique(diagnostics["errors"], rendered)
        else:
            _append_unique(diagnostics["warnings"], rendered)

        marker = f"{query_kind}_normalization_{_marker_token(code)}"
        _append_unique(diagnostics["markers"], marker)


def _normalize_cartograph_result(
    query_kind: str,
    args: Dict[str, Any],
    timeout_ms: int,
    result: Any,
    diagnostics: Dict[str, Any],
) -> tuple[str, Dict[str, Any]]:
    payload = _attach_query_to_result(query_kind, result)
    errors_before = len(diagnostics["errors"])

    try:
        normalized = normalize(payload)
    except Exception as exc:  # noqa: BLE001
        _append_unique(
            diagnostics["errors"],
            f"cartograph query '{query_kind}' normalization failed: {type(exc).__name__}: {exc}",
        )
        _append_unique(diagnostics["markers"], f"{query_kind}_normalization_failed")
        _append_unique(diagnostics["markers"], "cartograph_normalization_failed")
        fallback = _build_partial_query_result(query_kind, args, timeout_ms)
        return "partial", fallback

    if not isinstance(normalized, dict):
        normalized = _attach_query_to_result(query_kind, normalized)

    _merge_normalization_diagnostics(query_kind, normalized, diagnostics)

    if normalized.get("partial") is True:
        return "partial", normalized

    if len(diagnostics["errors"]) > errors_before:
        normalized["partial"] = True
        return "partial", normalized

    return "ok", normalized


def _handle_summary_query(args: Dict[str, Any], timeout_ms: int) -> Dict[str, Any]:
    engine = CodeCartographyEngine()
    workspace_path = args.get("workspace_path")
    scope = args.get("scope") if isinstance(args.get("scope"), dict) else {}
    languages = args.get("languages") if isinstance(args.get("languages"), list) else []

    try:
        payload = engine.build_runtime_summary_result(
            workspace_path=workspace_path,
            scope=scope,
            languages=languages,
            timeout_ms=timeout_ms,
        )
    except Exception:  # noqa: BLE001
        payload = _build_minimal_summary_result(args, timeout_ms)

    return _attach_query_to_result("summary", payload)


def _handle_file_context_query(args: Dict[str, Any], _timeout_ms: int) -> Dict[str, Any]:
    engine = CodeCartographyEngine()
    workspace_path = args.get("workspace_path") or ""
    file_id = args.get("file_id") or ""
    include_symbols = bool(args.get("include_symbols", True))
    include_references = bool(args.get("include_references", True))

    payload = engine.get_file_context(
        workspace_path=workspace_path,
        file_id=file_id,
        include_symbols=include_symbols,
        include_references=include_references,
    )
    return _attach_query_to_result("file_context", payload)


def _handle_flow_entry_points_query(args: Dict[str, Any], _timeout_ms: int) -> Dict[str, Any]:
    engine = CodeCartographyEngine()
    workspace_path = args.get("workspace_path") or ""
    layer_filter = args.get("layer_filter") if isinstance(args.get("layer_filter"), list) else None
    language_filter = args.get("language_filter") if isinstance(args.get("language_filter"), list) else None

    payload = engine.get_flow_entry_points(
        workspace_path=workspace_path,
        layer_filter=layer_filter,
        language_filter=language_filter,
    )
    return _attach_query_to_result("flow_entry_points", payload)


def _handle_layer_view_query(args: Dict[str, Any], _timeout_ms: int) -> Dict[str, Any]:
    engine = CodeCartographyEngine()
    workspace_path = args.get("workspace_path") or ""
    layers = args.get("layers") if isinstance(args.get("layers"), list) else []
    depth_limit = _coerce_int(args.get("depth_limit", 1), 1)
    include_cross_layer_edges = bool(args.get("include_cross_layer_edges", False))

    payload = engine.get_layer_view(
        workspace_path=workspace_path,
        layers=layers,
        depth=depth_limit,
        include_cross_layer_edges=include_cross_layer_edges,
    )
    return _attach_query_to_result("layer_view", payload)


def _handle_search_query(args: Dict[str, Any], _timeout_ms: int) -> Dict[str, Any]:
    engine = CodeCartographyEngine()
    workspace_path = args.get("workspace_path") or ""
    search_query = args.get("search_query") or args.get("search_term") or ""
    search_scope = str(args.get("search_scope") or "all")
    limit = _coerce_int(args.get("limit", 50), 50)

    payload = engine.get_search(
        workspace_path=workspace_path,
        search_query=search_query,
        search_scope=search_scope,
        limit=limit,
    )
    return _attach_query_to_result("search", payload)


def _handle_slice_detail_query(args: Dict[str, Any], _timeout_ms: int) -> Dict[str, Any]:
    engine = CodeCartographyEngine()
    params_for_engine = {
        "workspace_id": args.get("workspace_id") or "",
        "slice_id": args.get("slice_id") or "",
    }

    payload = engine.get_slice_detail(params_for_engine)
    return _attach_query_to_result("slice_detail", payload)


def _handle_slice_projection_query(args: Dict[str, Any], _timeout_ms: int) -> Dict[str, Any]:
    engine = CodeCartographyEngine()
    params_for_engine = {
        "workspace_id": args.get("workspace_id") or "",
        "slice_id": args.get("slice_id") or "",
        "projection_type": args.get("projection_type") or "",
    }

    payload = engine.get_slice_projection(params_for_engine)
    return _attach_query_to_result("slice_projection", payload)


def _handle_slice_filters_query(args: Dict[str, Any], _timeout_ms: int) -> Dict[str, Any]:
    engine = CodeCartographyEngine()
    params_for_engine = {
        "workspace_id": args.get("workspace_id") or "",
        "slice_id": args.get("slice_id"),
    }

    payload = engine.get_slice_filters(params_for_engine)
    return _attach_query_to_result("slice_filters", payload)


def _handle_full_scan_query(args: Dict[str, Any], timeout_ms: int) -> Dict[str, Any]:
    """Return the full scan result including files, symbols, references, and module graph.

    This is intended for background cache population — not for interactive use.
    The response can be large (all symbols and references in the workspace).
    """
    engine = CodeCartographyEngine()
    workspace_path = args.get("workspace_path") or ""
    scope = args.get("scope") if isinstance(args.get("scope"), dict) else {}
    languages = args.get("languages") if isinstance(args.get("languages"), list) else []
    include_symbols = bool(args.get("include_symbols", True))
    include_references = bool(args.get("include_references", True))

    started_at = time.monotonic()
    deadline: Optional[float] = None
    if timeout_ms and timeout_ms > 0:
        deadline = started_at + (timeout_ms / 1000.0) * 0.90

    normalized_scope = scope if isinstance(scope, dict) else {}
    normalized_languages = engine._normalize_language_filters(languages)  # noqa: SLF001

    files = engine._discover_files(  # noqa: SLF001
        workspace_path=workspace_path,
        scope=normalized_scope,
        languages=normalized_languages,
        deadline=deadline,
    )

    symbols = []
    if include_symbols and files:
        symbols = engine._extract_symbols(  # noqa: SLF001
            files=files,
            workspace_root=__import__('pathlib').Path(workspace_path),
            deadline=deadline,
        )

    references = []
    if include_references and files and symbols:
        references = engine._resolve_references(files, symbols, __import__('pathlib').Path(workspace_path))  # noqa: SLF001

    module_graph = engine._build_module_graph(references)  # noqa: SLF001
    if not module_graph.get("nodes"):
        module_graph["nodes"] = [f.path for f in files]

    dependency_flow = engine._compute_dependency_flow(module_graph)  # noqa: SLF001

    from dataclasses import asdict
    elapsed_ms = int((time.monotonic() - started_at) * 1000)
    partial = bool(elapsed_ms > timeout_ms) if timeout_ms else False

    payload: Dict[str, Any] = {
        "query": "full_scan",
        "engine": "code_cartography",
        "runtime_slice": "full_scan_v1",
        "workspace": {
            "path": workspace_path,
            "scope": normalized_scope,
            "languages": normalized_languages,
        },
        "summary": {
            "file_count": len(files),
            "symbol_count": len(symbols),
            "reference_count": len(references),
            "module_count": len(module_graph.get("nodes", [])),
            "dependency_edge_count": len(module_graph.get("edges", [])),
            "entry_point_count": len(dependency_flow.get("entry_points", [])),
            "has_cycles": bool(dependency_flow.get("cycles")),
        },
        "files": [asdict(f) for f in files],
        "symbols": [asdict(s) for s in symbols],
        "references": [asdict(r) for r in references],
        "module_graph": module_graph,
        "dependency_flow": dependency_flow,
        "budget": {"timeout_ms": timeout_ms, "elapsed_ms": elapsed_ms},
    }
    if partial:
        payload["partial"] = True

    return payload


CartographQueryHandler = Callable[[Dict[str, Any], int], Dict[str, Any]]

_CARTOGRAPH_QUERY_HANDLERS: Dict[str, CartographQueryHandler] = {
    "summary": _handle_summary_query,
    "file_context": _handle_file_context_query,
    "flow_entry_points": _handle_flow_entry_points_query,
    "layer_view": _handle_layer_view_query,
    "search": _handle_search_query,
    "slice_detail": _handle_slice_detail_query,
    "slice_projection": _handle_slice_projection_query,
    "slice_filters": _handle_slice_filters_query,
    "full_scan": _handle_full_scan_query,
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
    - 'cartograph'         -> deterministic per-query handlers for:
                              summary, file_context, flow_entry_points,
                              layer_view, search, slice_detail,
                              slice_projection, and slice_filters
    """

    diag = _empty_diagnostics()

    if action == "probe_capabilities":
        cap = CapabilityAdvertisement()
        return "ok", cap.to_dict(), diag

    if action == "health_check":
        return "ok", {"status": "healthy", "schema_version": SCHEMA_VERSION}, diag

    if action == "cartograph":
        query_kind, used_default = _resolve_cartograph_query_kind(args)

        if query_kind == "summary":
            if used_default:
                diag["warnings"].append("No cartograph query selector provided; defaulted to 'summary'")
                diag["markers"].append("summary_selector_defaulted")
            diag["markers"].append("summary_minimal_slice")

        handler = _CARTOGRAPH_QUERY_HANDLERS.get(query_kind)
        if handler is None:
            diag["errors"].append(
                f"cartograph query '{query_kind}' is not implemented; "
                f"supported queries: summary, file_context, flow_entry_points, layer_view, search, "
                f"slice_detail, slice_projection, slice_filters, full_scan"
            )
            return "error", None, diag

        try:
            result = handler(args, timeout_ms)
        except Exception as exc:  # noqa: BLE001
            _append_unique(
                diag["errors"],
                f"cartograph query '{query_kind}' failed: {type(exc).__name__}: {exc}",
            )
            _append_unique(
                diag["warnings"],
                f"cartograph query '{query_kind}' returned a partial fallback envelope after handler failure",
            )
            _append_unique(diag["markers"], f"{query_kind}_query_failed")
            _append_unique(diag["markers"], "cartograph_query_partial_fallback")

            fallback_result = _build_partial_query_result(query_kind, args, timeout_ms)
            normalized_status, normalized_result = _normalize_cartograph_result(
                query_kind=query_kind,
                args=args,
                timeout_ms=timeout_ms,
                result=fallback_result,
                diagnostics=diag,
            )
            return ("partial" if normalized_status == "ok" else normalized_status), normalized_result, diag

        normalized_status, normalized_result = _normalize_cartograph_result(
            query_kind=query_kind,
            args=args,
            timeout_ms=timeout_ms,
            result=result,
            diagnostics=diag,
        )
        return normalized_status, normalized_result, diag

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
