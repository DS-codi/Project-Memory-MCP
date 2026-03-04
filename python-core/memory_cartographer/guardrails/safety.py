"""
safety.py
---------
Safety guardrails for the memory_cartographer.
See docs/architecture/memory-cartographer/safety-guardrails.md
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


# Patterns applied to key names to detect sensitive values
_SECRET_KEY_PATTERNS: List[re.Pattern] = [
    re.compile(r"password",        re.IGNORECASE),
    re.compile(r"secret",          re.IGNORECASE),
    re.compile(r"\btoken\b",       re.IGNORECASE),
    re.compile(r"api[_-]?key",     re.IGNORECASE),
    re.compile(r"private[_-]?key", re.IGNORECASE),
    re.compile(r"credential",      re.IGNORECASE),
    re.compile(r"access[_-]?key",  re.IGNORECASE),
]

_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
_BINARY_PROBE_BYTES  = 512


@dataclass
class SafetyPolicy:
    """Safety guardrail configuration."""

    max_file_size_bytes: int = _MAX_FILE_SIZE_BYTES
    binary_probe_bytes: int  = _BINARY_PROBE_BYTES
    secret_mask_value: str   = "[REDACTED]"
    secret_key_patterns: List[re.Pattern] = field(
        default_factory=lambda: list(_SECRET_KEY_PATTERNS)
    )


DEFAULT_SAFETY_POLICY = SafetyPolicy()


def is_path_safe(file_path: str, workspace_root: str) -> bool:
    """Return True if *file_path* is safely contained within *workspace_root*.

    Rejects:
    - Paths containing ``../`` (raw traversal)
    - Symlinks whose resolved target escapes the workspace root
    """
    raw = Path(file_path)
    root = Path(workspace_root)

    # Reject raw traversal sequences
    if ".." in raw.parts:
        return False

    try:
        resolved = raw.resolve()
        root_resolved = root.resolve()
        resolved.relative_to(root_resolved)  # raises ValueError if not a descendant
        return True
    except (ValueError, OSError):
        return False


def mask_secrets(
    obj: Dict[str, Any],
    policy: Optional[SafetyPolicy] = None,
) -> Dict[str, Any]:
    """Recursively mask values whose key name matches a secret pattern."""
    cfg = policy or DEFAULT_SAFETY_POLICY
    result: Dict[str, Any] = {}
    for key, value in obj.items():
        if any(p.search(key) for p in cfg.secret_key_patterns):
            result[key] = cfg.secret_mask_value
        elif isinstance(value, dict):
            result[key] = mask_secrets(value, cfg)
        else:
            result[key] = value
    return result


def is_binary(file_path: str, policy: Optional[SafetyPolicy] = None) -> bool:
    """Return True if the file appears to be binary (contains a null byte in probe window)."""
    cfg = policy or DEFAULT_SAFETY_POLICY
    try:
        with open(file_path, "rb") as fh:
            probe = fh.read(cfg.binary_probe_bytes)
        return b"\x00" in probe
    except OSError:
        return False


def should_skip_file(
    file_path: str,
    workspace_root: str,
    policy: Optional[SafetyPolicy] = None,
) -> Optional[str]:
    """Return a skip reason string if the file should be skipped, else None.

    Skip reasons:
    - ``"path_violation"``  — path traversal or symlink escape
    - ``"binary"``          — file is binary
    - ``"size_exceeded"``   — file exceeds max_file_size_bytes
    """
    cfg = policy or DEFAULT_SAFETY_POLICY

    if not is_path_safe(file_path, workspace_root):
        return "path_violation"

    try:
        size = Path(file_path).stat().st_size
        if size > cfg.max_file_size_bytes:
            return "size_exceeded"
    except OSError:
        return "path_violation"

    if is_binary(file_path, cfg):
        return "binary"

    return None
