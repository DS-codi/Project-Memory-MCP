"""
memory_cartographer.contracts.version
======================================

Schema version constants and capability registry types for the
memory_cartographer Python core.

Ownership: Python core declares and owns the schema_version field. TypeScript
server adapter reads this version and applies compatibility negotiation.

See: docs/architecture/memory-cartographer/compatibility-matrix.md
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


# ---------------------------------------------------------------------------
# Schema version constant
# ---------------------------------------------------------------------------

#: The canonical schema_version string this package embeds in every output
#: envelope. Format: "MAJOR.MINOR.PATCH" (semver).
SCHEMA_VERSION: str = "1.0.0"

#: Parsed components for internal use.
SCHEMA_VERSION_MAJOR: int = 1
SCHEMA_VERSION_MINOR: int = 0
SCHEMA_VERSION_PATCH: int = 0


# ---------------------------------------------------------------------------
# Capability advertisement (produced by probe_capabilities action)
# ---------------------------------------------------------------------------

@dataclass
class FeatureFlags:
    """
    Feature flags advertised by the Python core during capability negotiation.

    All flags default to False; set to True only when the feature is
    implemented and stable.
    """
    database_cartography: bool = False
    incremental_scan: bool = False
    partial_results: bool = True  # partial results are supported from v1

    def to_dict(self) -> Dict[str, bool]:
        return {
            "database_cartography": self.database_cartography,
            "incremental_scan": self.incremental_scan,
            "partial_results": self.partial_results,
        }


@dataclass
class CapabilityAdvertisement:
    """
    Full capability advertisement returned by the Python core in response to
    a ``probe_capabilities`` action.

    This is the authoritative declaration of what this package version supports.
    The TypeScript adapter reads this to decide whether to proceed, degrade, or
    reject a cartography session.
    """
    schema_version: str = SCHEMA_VERSION
    supported_actions: List[str] = field(default_factory=lambda: [
        "cartograph",
        "probe_capabilities",
        "health_check",
    ])
    supported_languages: List[str] = field(default_factory=lambda: [
        "python",
        "typescript",
        "javascript",
        "rust",
    ])
    feature_flags: FeatureFlags = field(default_factory=FeatureFlags)

    def to_dict(self) -> dict:
        return {
            "schema_version": self.schema_version,
            "supported_actions": self.supported_actions,
            "supported_languages": self.supported_languages,
            "feature_flags": self.feature_flags.to_dict(),
        }


# ---------------------------------------------------------------------------
# Version validation helpers (used by entrypoint to self-validate)
# ---------------------------------------------------------------------------

def parse_semver(version_str: str) -> Optional[tuple[int, int, int]]:
    """
    Parse a semver string into (major, minor, patch) tuple.

    Returns None if the string does not conform to "MAJOR.MINOR.PATCH" format.
    """
    parts = version_str.split(".")
    if len(parts) != 3:
        return None
    try:
        return (int(parts[0]), int(parts[1]), int(parts[2]))
    except ValueError:
        return None


def current_version_tuple() -> tuple[int, int, int]:
    """Return the current schema version as a (major, minor, patch) tuple."""
    return (SCHEMA_VERSION_MAJOR, SCHEMA_VERSION_MINOR, SCHEMA_VERSION_PATCH)
