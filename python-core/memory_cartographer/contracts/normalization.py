"""
normalization.py
----------------
Normalization utilities and stability contract for the memory_cartographer
Python core output.

Responsibilities:
- Define the canonical diagnostic code taxonomy (DiagnosticCode enum).
- Define the NormalizationConfig dataclass controlling normalization passes.
- Provide the normalize() entry point that applies normalization rules to
  the output dict before it is serialised and written to stdout.

Normalization rules (authoritative source):
    docs/contracts/normalization-rules.md

These rules are part of the versioned contract. Changes that alter the
observable structure of the output require a schema_version bump per the
policy in normalization-rules.md §6.

See also:
    docs/contracts/memory-cartographer-contract.md
    docs/architecture/memory-cartographer/implementation-boundary.md
"""

from __future__ import annotations

import enum
import json
from dataclasses import dataclass
from typing import Any, Optional


# ---------------------------------------------------------------------------
# DiagnosticCode — canonical taxonomy
# ---------------------------------------------------------------------------


class DiagnosticCode(str, enum.Enum):
    """Canonical diagnostic code taxonomy for memory_cartographer output.

    These codes appear in DiagnosticEntry ``code`` fields in the output envelope.
    See normalization-rules.md §5 for severity and retryability classification.

    Using ``str`` as a mixin ensures the enum serialises as its string value
    when passed to json.dumps().
    """

    # --- Errors ---

    SCAN_TIMEOUT = "SCAN_TIMEOUT"
    """Scan did not complete within the allocated timeout_ms. Partial result.
    Severity: error. Retryable: no (increase timeout_ms to resolve)."""

    DB_CONNECTION_FAILED = "DB_CONNECTION_FAILED"
    """Database introspection failed due to connection error.
    Severity: error. Retryable: no (fix credentials/connectivity)."""

    PATH_OUTSIDE_ROOT = "PATH_OUTSIDE_ROOT"
    """A path traversal or symlink escape was detected and rejected.
    Severity: error. Retryable: no (safety guardrail — do not retry)."""

    # --- Warnings ---

    FILE_READ_ERROR = "FILE_READ_ERROR"
    """A specific file could not be read (permission error, transient I/O).
    Severity: warning. Retryable: yes."""

    SYMBOL_PARSE_ERROR = "SYMBOL_PARSE_ERROR"
    """A file was read but its AST could not be fully parsed.
    Severity: warning. Retryable: yes."""

    FILE_COUNT_CAP_REACHED = "FILE_COUNT_CAP_REACHED"
    """The scan reached the configured maximum file count. Result is partial.
    Severity: warning. Retryable: no (adjust scope to resolve)."""

    DEPTH_CAP_REACHED = "DEPTH_CAP_REACHED"
    """The scan reached the configured maximum directory depth. Result is partial.
    Severity: warning. Retryable: no (adjust max_depth to resolve)."""

    # --- Info ---

    SECRETS_REDACTED = "SECRETS_REDACTED"
    """A file or value containing secrets was redacted. Intentional.
    Severity: info. Retryable: n/a."""

    BINARY_SKIPPED = "BINARY_SKIPPED"
    """A binary or oversized file was skipped during content analysis.
    Severity: info. Retryable: n/a."""

    # --- Adapter-only (set by TypeScript adapter, not by Python core) ---
    # These are listed here for documentation completeness.
    # The Python core must not use these codes in its output.

    SCHEMA_VERSION_DRIFT = "SCHEMA_VERSION_DRIFT"
    """Schema_version MINOR drift (TypeScript adapter only — do not use here)."""

    UNKNOWN_FIELD = "UNKNOWN_FIELD"
    """Unrecognised field in response (TypeScript adapter only — do not use here)."""


# ---------------------------------------------------------------------------
# NormalizationConfig
# ---------------------------------------------------------------------------


@dataclass
class NormalizationConfig:
    """Configuration for the normalization passes applied to the output dict.

    All options default to True (strict normalization enabled). The Python
    core applies normalization before serialising output to stdout.

    TODO: These options will be wired to the cartography request args
          in a later implementation phase.
    """

    enforce_empty_arrays: bool = True
    """When True, ensure all required array fields are present in the output
    dict. Missing required arrays are replaced with empty lists ``[]``.
    Required arrays must never be None or absent."""

    enforce_ordering: bool = True
    """When True, sort all ordered arrays per the ordering rules defined in
    normalization-rules.md before serialisation. This is the primary
    mechanism for the ordering guarantee."""

    enforce_identity_key_format: bool = True
    """When True, validate identity key formats (path::name patterns) for
    all entities. Malformed keys cause a SYMBOL_PARSE_ERROR or similar
    diagnostic; the entity is included with the original key."""

    propagate_partial_flag: bool = True
    """When True, set ``partial: True`` on any section whose parent envelope
    has ``generation_metadata.partial == True``, ensuring consistency."""

    redact_secrets: bool = True
    """When True, apply secrets masking to values before output.
    See safety-guardrails.md for the redaction policy.
    TODO: wire to safety guardrail implementation."""


# Default config for production use
DEFAULT_NORMALIZATION_CONFIG = NormalizationConfig()


_GENERIC_REQUIRED_ARRAY_PATHS: tuple[tuple[str, ...], ...] = (
    ("files",),
    ("symbols",),
    ("references",),
    ("architecture_edges",),
    ("module_graph", "nodes"),
    ("module_graph", "edges"),
    ("dependency_flow", "tiers"),
    ("dependency_flow", "entry_points"),
    ("datasources",),
    ("tables",),
    ("columns",),
    ("constraints",),
    ("relations",),
    ("query_touchpoints",),
    ("migration_lineage", "migration_files"),
)

_QUERY_REQUIRED_ARRAY_PATHS: dict[str, tuple[tuple[str, ...], ...]] = {
    "summary": (
        ("workspace", "languages"),
        ("summary", "architecture_layers"),
        ("summary", "language_breakdown"),
    ),
    "file_context": (
        ("symbols",),
        ("references",),
    ),
    "flow_entry_points": (
        ("entry_points",),
        ("tiers",),
        ("cycles",),
    ),
    "layer_view": (
        ("layers",),
        ("nodes",),
        ("edges",),
    ),
    "search": (
        ("results",),
    ),
    "slice_detail": (
        ("nodes",),
        ("edges",),
    ),
    "slice_projection": (
        ("projected_nodes",),
        ("projected_edges",),
    ),
    "slice_filters": (
        ("filters",),
        ("available_types",),
    ),
}

_SECTION_PARTIAL_KEYS: tuple[str, ...] = (
    "code_cartography",
    "database_cartography",
    "detail",
    "projection_summary",
)


def _normalize_query_kind(output: dict[str, Any]) -> str:
    value = output.get("query")
    if isinstance(value, str):
        return value.strip().lower()
    return ""


def _coerce_sort_value(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, (str, int, float, bool)):
        return value
    return json.dumps(value, sort_keys=True, ensure_ascii=True, default=str)


def _get_path(container: dict[str, Any], path: tuple[str, ...]) -> Any:
    current: Any = container
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _ensure_array_path(
    container: dict[str, Any],
    path: tuple[str, ...],
    *,
    create_missing_containers: bool,
) -> None:
    current: Any = container
    for key in path[:-1]:
        if not isinstance(current, dict):
            return

        next_value = current.get(key)
        if next_value is None:
            if not create_missing_containers:
                return
            next_value = {}
            current[key] = next_value
        elif not isinstance(next_value, dict):
            if not create_missing_containers:
                return
            next_value = {}
            current[key] = next_value

        current = next_value

    if not isinstance(current, dict):
        return

    leaf_key = path[-1]
    leaf_value = current.get(leaf_key)
    if not isinstance(leaf_value, list):
        current[leaf_key] = []


def _sort_array_path(
    container: dict[str, Any],
    path: tuple[str, ...],
    *,
    object_keys: Optional[tuple[str, ...]] = None,
) -> None:
    values = _get_path(container, path)
    if not isinstance(values, list) or len(values) < 2:
        return

    if all(not isinstance(item, dict) for item in values):
        values.sort(key=_coerce_sort_value)
        return

    if object_keys is None:
        values.sort(key=lambda item: _coerce_sort_value(item))
        return

    values.sort(
        key=lambda item: (
            tuple(_coerce_sort_value(item.get(key)) for key in object_keys)
            if isinstance(item, dict)
            else (_coerce_sort_value(item),)
        )
    )


def _is_valid_symbol_identity(value: Any) -> bool:
    if not isinstance(value, str) or "::" not in value:
        return False

    file_part, symbol_part = value.split("::", 1)
    if not file_part or not symbol_part:
        return False
    if file_part.startswith("/") or file_part.startswith("./"):
        return False
    if "\\" in file_part:
        return False
    return True


def _new_identity_warning(path: str, field_name: str, value: Any) -> dict[str, Any]:
    return {
        "code": DiagnosticCode.SYMBOL_PARSE_ERROR.value,
        "severity": "warning",
        "path": path,
        "field": field_name,
        "message": f"Malformed identity key in '{field_name}': {value!r}",
    }


# ---------------------------------------------------------------------------
# normalize() — main normalization entry point
# ---------------------------------------------------------------------------


def normalize(output: dict, config: Optional[NormalizationConfig] = None) -> dict:
    """Apply normalization passes to the output dict before serialisation.

    This function is called by the Python core's runtime entrypoint after
    all engines have completed and before the result is written to stdout.

    Normalization steps (applied in order):
    1. Empty-array enforcement — ensure required arrays are present.
    2. Partial flag propagation — coerce per-section partial flags.
    3. Array ordering — sort all ordered arrays per normalization-rules.md.
    4. Identity key validation — verify and log key format issues.
    5. Secrets redaction — apply masking policy.

    Args:
        output: The raw output dict assembled by the cartography engines.
                Modified and returned (not a deep-copy — caller may pass
                the assembled dict directly).
        config: Normalization options. Defaults to DEFAULT_NORMALIZATION_CONFIG.

    Returns:
        The normalized output dict.

    Normalization is intentionally non-throwing. Failures are represented as
    diagnostics on the output so callers can emit structured warnings/errors
    without dropping otherwise usable payload data.
    """
    if config is None:
        config = DEFAULT_NORMALIZATION_CONFIG

    if not isinstance(output, dict):
        return output

    normalization_diagnostics: list[dict[str, Any]] = []

    # Step 1: enforce empty arrays
    if config.enforce_empty_arrays:
        _enforce_empty_arrays(output)

    # Step 2: propagate partial flag
    if config.propagate_partial_flag:
        _propagate_partial_flag(output)

    # Step 3: enforce ordering
    if config.enforce_ordering:
        _enforce_ordering(output)

    # Step 4: validate identity keys
    if config.enforce_identity_key_format:
        normalization_diagnostics.extend(_validate_identity_keys(output))

    # Step 5: redact secrets (wired separately; currently no-op)

    if normalization_diagnostics:
        existing = output.get("_normalization_diagnostics")
        if isinstance(existing, list):
            existing.extend(normalization_diagnostics)
        else:
            output["_normalization_diagnostics"] = normalization_diagnostics

    return output


# ---------------------------------------------------------------------------
# Helper stubs (to be implemented)
# ---------------------------------------------------------------------------


def _enforce_empty_arrays(output: dict) -> None:
    """Ensure all required array fields are present and not None.

    Mutates output in place.
    TODO: implement
    """
    query_kind = _normalize_query_kind(output)

    for path in _GENERIC_REQUIRED_ARRAY_PATHS:
        _ensure_array_path(output, path, create_missing_containers=False)

    query_paths = _QUERY_REQUIRED_ARRAY_PATHS.get(query_kind, ())
    for path in query_paths:
        _ensure_array_path(output, path, create_missing_containers=True)


def _propagate_partial_flag(output: dict) -> None:
    """Coerce per-section partial flags when the envelope is partial.

    Mutates output in place.
    TODO: implement
    """
    generation_metadata = output.get("generation_metadata")
    is_partial = bool(output.get("partial"))
    if isinstance(generation_metadata, dict) and bool(generation_metadata.get("partial")):
        is_partial = True

    if not is_partial:
        return

    output["partial"] = True
    if isinstance(generation_metadata, dict):
        generation_metadata["partial"] = True

    for section_key in _SECTION_PARTIAL_KEYS:
        section = output.get(section_key)
        if isinstance(section, dict):
            section.setdefault("partial", True)


def _enforce_ordering(output: dict) -> None:
    """Sort all ordered arrays per the rules in normalization-rules.md.

    Mutates output in place.
    TODO: implement — apply sort key tuples per array field
    """
    # Generic paths used by full section payloads.
    _sort_array_path(output, ("files",), object_keys=("path",))
    _sort_array_path(output, ("symbols",), object_keys=("file", "start_line", "name"))
    _sort_array_path(output, ("references",), object_keys=("from_file", "from_line", "to_file"))
    _sort_array_path(output, ("architecture_edges",), object_keys=("from_module", "to_module"))
    _sort_array_path(output, ("module_graph", "nodes"))
    _sort_array_path(output, ("module_graph", "edges"), object_keys=("from", "to"))
    _sort_array_path(output, ("dependency_flow", "entry_points"))

    tiers = _get_path(output, ("dependency_flow", "tiers"))
    if isinstance(tiers, list):
        for tier in tiers:
            if isinstance(tier, list):
                tier.sort(key=_coerce_sort_value)

    query_kind = _normalize_query_kind(output)
    if query_kind == "summary":
        _sort_array_path(output, ("workspace", "languages"))
        _sort_array_path(output, ("summary", "architecture_layers"))
        _sort_array_path(output, ("summary", "language_breakdown"), object_keys=("language",))
    elif query_kind == "flow_entry_points":
        _sort_array_path(output, ("entry_points",))
        _sort_array_path(output, ("tiers",))
        _sort_array_path(output, ("cycles",))
        tiers_value = output.get("tiers")
        if isinstance(tiers_value, list):
            for tier in tiers_value:
                if isinstance(tier, list):
                    tier.sort(key=_coerce_sort_value)
        cycles_value = output.get("cycles")
        if isinstance(cycles_value, list):
            for cycle in cycles_value:
                if isinstance(cycle, list):
                    cycle.sort(key=_coerce_sort_value)
    elif query_kind == "layer_view":
        _sort_array_path(output, ("layers",), object_keys=("id", "name"))
        _sort_array_path(output, ("nodes",))
        _sort_array_path(output, ("edges",), object_keys=("from", "to"))
    elif query_kind == "search":
        _sort_array_path(output, ("results",), object_keys=("type", "path", "file", "name", "line"))
    elif query_kind == "slice_detail":
        _sort_array_path(output, ("nodes",))
        _sort_array_path(output, ("edges",), object_keys=("from", "to"))
    elif query_kind == "slice_projection":
        _sort_array_path(output, ("projected_nodes",))
        _sort_array_path(output, ("projected_edges",), object_keys=("from", "to"))
    elif query_kind == "slice_filters":
        _sort_array_path(output, ("filters",), object_keys=("id", "name", "value"))
        _sort_array_path(output, ("available_types",))


def _validate_identity_keys(output: dict) -> list[dict]:
    """Validate identity key formats; return any diagnostic entries generated.

    Does not mutate output.
    TODO: implement
    """
    diagnostics: list[dict[str, Any]] = []

    symbols = output.get("symbols")
    if isinstance(symbols, list):
        for symbol in symbols:
            if not isinstance(symbol, dict):
                continue
            symbol_id = symbol.get("id")
            if _is_valid_symbol_identity(symbol_id):
                continue
            diagnostics.append(
                _new_identity_warning(
                    path=str(symbol.get("file") or ""),
                    field_name="symbols[].id",
                    value=symbol_id,
                )
            )

    references = output.get("references")
    if isinstance(references, list):
        for reference in references:
            if not isinstance(reference, dict):
                continue
            to_symbol_id = reference.get("to_symbol_id")
            if _is_valid_symbol_identity(to_symbol_id):
                continue
            diagnostics.append(
                _new_identity_warning(
                    path=str(reference.get("from_file") or ""),
                    field_name="references[].to_symbol_id",
                    value=to_symbol_id,
                )
            )

    return diagnostics
