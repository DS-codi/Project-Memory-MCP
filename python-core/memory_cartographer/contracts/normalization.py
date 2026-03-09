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


_CODE_REQUIRED_ARRAY_PATHS: tuple[tuple[str, ...], ...] = (
    ("files",),
    ("symbols",),
    ("references",),
    ("architecture_edges",),
    ("module_graph", "nodes"),
    ("module_graph", "edges"),
    ("dependency_flow", "tiers"),
    ("dependency_flow", "entry_points"),
)

_DATABASE_REQUIRED_ARRAY_PATHS: tuple[tuple[str, ...], ...] = (
    ("datasources",),
    ("tables",),
    ("columns",),
    ("constraints",),
    ("relations",),
    ("query_touchpoints",),
    ("migration_lineage", "migration_files"),
)

_GENERIC_REQUIRED_ARRAY_PATHS: tuple[tuple[str, ...], ...] = (
    *_CODE_REQUIRED_ARRAY_PATHS,
    *_DATABASE_REQUIRED_ARRAY_PATHS,
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


def _coerce_sort_value(value: Any) -> tuple[int, Any]:
    """Normalize arbitrary values into a cross-type comparable sort key."""
    if value is None:
        return (0, "")
    if isinstance(value, bool):
        return (1, int(value))
    if isinstance(value, (int, float)):
        return (2, value)
    if isinstance(value, str):
        return (3, value)
    return (4, json.dumps(value, sort_keys=True, ensure_ascii=True, default=str))


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


def _ensure_section_array_paths(
    output: dict[str, Any],
    section_key: str,
    relative_paths: tuple[tuple[str, ...], ...],
) -> None:
    section = output.get(section_key)
    if not isinstance(section, dict):
        return

    for path in relative_paths:
        _ensure_array_path(section, path, create_missing_containers=True)


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


def _sort_nested_array_members(container: dict[str, Any], path: tuple[str, ...]) -> None:
    values = _get_path(container, path)
    if not isinstance(values, list):
        return

    for item in values:
        if isinstance(item, list) and len(item) > 1:
            item.sort(key=_coerce_sort_value)


def _enforce_code_ordering(container: dict[str, Any]) -> None:
    _sort_array_path(container, ("files",), object_keys=("path",))
    _sort_array_path(container, ("symbols",), object_keys=("file", "start_line", "name", "id", "symbol_id"))
    _sort_array_path(container, ("references",), object_keys=("from_file", "from_line", "to_file", "to_symbol_id"))
    _sort_array_path(container, ("architecture_edges",), object_keys=("from_module", "to_module"))
    _sort_array_path(container, ("module_graph", "nodes"))
    _sort_array_path(container, ("module_graph", "edges"), object_keys=("from", "to"))
    _sort_array_path(container, ("dependency_flow", "entry_points"))
    _sort_nested_array_members(container, ("dependency_flow", "tiers"))
    _sort_nested_array_members(container, ("dependency_flow", "cycles"))


def _enforce_database_ordering(container: dict[str, Any]) -> None:
    _sort_array_path(container, ("datasources",), object_keys=("id", "kind", "name"))
    _sort_array_path(container, ("tables",), object_keys=("datasource_id", "schema_name", "table_name", "id"))
    _sort_array_path(container, ("columns",), object_keys=("table_id", "ordinal_position", "name", "id"))
    _sort_array_path(container, ("constraints",), object_keys=("table_id", "constraint_kind", "constraint_name", "id"))
    _sort_array_path(container, ("relations",), object_keys=("from_table_id", "to_table_id", "constraint_name", "id"))
    _sort_array_path(container, ("query_touchpoints",), object_keys=("file", "line", "query_kind"))
    _sort_array_path(container, ("migration_lineage", "migration_files"), object_keys=("datasource_id", "version", "path"))


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


def _collect_symbol_identity_warnings(
    values: Any,
    diagnostics: list[dict[str, Any]],
    seen: set[tuple[str, str, str]],
    field_prefix: str,
) -> None:
    if not isinstance(values, list):
        return

    for symbol in values:
        if not isinstance(symbol, dict):
            continue

        for field_name in ("id", "symbol_id"):
            symbol_id = symbol.get(field_name)
            if symbol_id is None or _is_valid_symbol_identity(symbol_id):
                continue

            rendered_value = repr(symbol_id)
            path = str(symbol.get("file") or symbol.get("file_id") or "")
            key = (field_prefix, path, rendered_value)
            if key in seen:
                continue
            seen.add(key)

            diagnostics.append(
                _new_identity_warning(
                    path=path,
                    field_name=f"{field_prefix}.{field_name}",
                    value=symbol_id,
                )
            )


def _collect_reference_identity_warnings(
    values: Any,
    diagnostics: list[dict[str, Any]],
    seen: set[tuple[str, str, str]],
    field_name: str,
) -> None:
    if not isinstance(values, list):
        return

    for reference in values:
        if not isinstance(reference, dict):
            continue

        to_symbol_id = reference.get("to_symbol_id")
        if to_symbol_id is None or _is_valid_symbol_identity(to_symbol_id):
            continue

        rendered_value = repr(to_symbol_id)
        path = str(reference.get("from_file") or "")
        key = (field_name, path, rendered_value)
        if key in seen:
            continue
        seen.add(key)

        diagnostics.append(
            _new_identity_warning(
                path=path,
                field_name=field_name,
                value=to_symbol_id,
            )
        )


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
# Normalization helper implementations
# ---------------------------------------------------------------------------


def _enforce_empty_arrays(output: dict) -> None:
    """Ensure all required array fields are present and not None.

    Mutates output in place.
    """
    query_kind = _normalize_query_kind(output)

    for path in _GENERIC_REQUIRED_ARRAY_PATHS:
        _ensure_array_path(output, path, create_missing_containers=False)

    # Full-envelope payloads may include nested section objects.
    _ensure_section_array_paths(output, "code_cartography", _CODE_REQUIRED_ARRAY_PATHS)
    _ensure_section_array_paths(output, "database_cartography", _DATABASE_REQUIRED_ARRAY_PATHS)

    query_paths = _QUERY_REQUIRED_ARRAY_PATHS.get(query_kind, ())
    for path in query_paths:
        _ensure_array_path(output, path, create_missing_containers=True)


def _propagate_partial_flag(output: dict) -> None:
    """Coerce per-section partial flags when the envelope is partial.

    Mutates output in place.
    """
    generation_metadata = output.get("generation_metadata")
    is_partial = bool(output.get("partial"))

    if isinstance(generation_metadata, dict) and bool(generation_metadata.get("partial")):
        is_partial = True

    for section_key in _SECTION_PARTIAL_KEYS:
        section = output.get(section_key)
        if isinstance(section, dict) and bool(section.get("partial")):
            is_partial = True
            break

    if not is_partial:
        return

    output["partial"] = True
    if isinstance(generation_metadata, dict):
        generation_metadata["partial"] = True

    for section_key in _SECTION_PARTIAL_KEYS:
        section = output.get(section_key)
        if isinstance(section, dict):
            section["partial"] = True


def _enforce_ordering(output: dict) -> None:
    """Sort all ordered arrays per the rules in normalization-rules.md.

    Mutates output in place.
    """
    # Full section payloads may be provided directly at the root.
    _enforce_code_ordering(output)
    _enforce_database_ordering(output)

    # Envelope payloads may wrap section payloads under section keys.
    code_section = output.get("code_cartography")
    if isinstance(code_section, dict):
        _enforce_code_ordering(code_section)

    database_section = output.get("database_cartography")
    if isinstance(database_section, dict):
        _enforce_database_ordering(database_section)

    query_kind = _normalize_query_kind(output)
    if query_kind == "summary":
        _sort_array_path(output, ("workspace", "languages"))
        _sort_array_path(output, ("summary", "architecture_layers"))
        _sort_array_path(output, ("summary", "language_breakdown"), object_keys=("language",))
    elif query_kind == "flow_entry_points":
        _sort_array_path(output, ("entry_points",))
        _sort_nested_array_members(output, ("tiers",))
        _sort_nested_array_members(output, ("cycles",))
        _sort_array_path(output, ("cycles",))
    elif query_kind == "layer_view":
        _sort_array_path(output, ("layers",), object_keys=("id", "name"))
        _sort_array_path(output, ("nodes",))
        _sort_array_path(output, ("edges",), object_keys=("from", "to"))
    elif query_kind == "search":
        _sort_array_path(output, ("results",), object_keys=("type", "path", "file", "name", "line"))
    elif query_kind == "slice_detail":
        _sort_array_path(output, ("nodes",), object_keys=("path", "module_id", "file_id", "id"))
        _sort_array_path(output, ("edges",), object_keys=("from_module", "from", "to_module", "to", "edge_kind"))
    elif query_kind == "slice_projection":
        _sort_array_path(output, ("projected_nodes",), object_keys=("path", "file_id", "module_id", "symbol_id", "name", "start_line"))
        _sort_array_path(output, ("projected_edges",), object_keys=("from_module", "from", "to_module", "to", "edge_kind"))
    elif query_kind == "slice_filters":
        _sort_array_path(output, ("filters",), object_keys=("filter_type", "values", "exclude"))
        _sort_array_path(output, ("active_filters",), object_keys=("filter_type", "values", "exclude"))
        _sort_array_path(output, ("available_types",))
        _sort_array_path(output, ("available_layer_tags",))
        _sort_array_path(output, ("available_language_tags",))
        _sort_array_path(output, ("available_path_prefixes",))


def _validate_identity_keys(output: dict) -> list[dict]:
    """Validate identity key formats; return any diagnostic entries generated.

    Does not mutate output.
    """
    diagnostics: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()

    _collect_symbol_identity_warnings(
        output.get("symbols"),
        diagnostics,
        seen,
        "symbols[]",
    )
    _collect_reference_identity_warnings(
        output.get("references"),
        diagnostics,
        seen,
        "references[].to_symbol_id",
    )

    code_section = output.get("code_cartography")
    if isinstance(code_section, dict):
        _collect_symbol_identity_warnings(
            code_section.get("symbols"),
            diagnostics,
            seen,
            "code_cartography.symbols[]",
        )
        _collect_reference_identity_warnings(
            code_section.get("references"),
            diagnostics,
            seen,
            "code_cartography.references[].to_symbol_id",
        )

    _collect_symbol_identity_warnings(
        output.get("projected_nodes"),
        diagnostics,
        seen,
        "projected_nodes[]",
    )

    items = output.get("items")
    if isinstance(items, list):
        symbol_items = []
        for item in items:
            if not isinstance(item, dict):
                continue
            if str(item.get("kind") or "").lower() != "symbol":
                continue

            symbol_item = item.get("item")
            if isinstance(symbol_item, dict):
                symbol_items.append(symbol_item)

        _collect_symbol_identity_warnings(
            symbol_items,
            diagnostics,
            seen,
            "items[].item",
        )

    return diagnostics
