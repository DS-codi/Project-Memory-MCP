"""
scope_limits.py
---------------
Scope guardrails for the memory_cartographer.
See docs/architecture/memory-cartographer/scope-guardrails.md
"""

from __future__ import annotations

import fnmatch
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

LANGUAGE_EXTENSION_MAP: Dict[str, List[str]] = {
    "typescript":  [".ts", ".tsx"],
    "javascript":  [".js", ".jsx", ".mjs", ".cjs"],
    "python":      [".py", ".pyi"],
    "rust":        [".rs"],
    "go":          [".go"],
    "csharp":      [".cs"],
    "cpp":         [".cpp", ".cc", ".cxx", ".h", ".hpp"],
    "java":        [".java"],
    "sql":         [".sql"],
    "shell":       [".sh", ".ps1", ".bash"],
    "ahk":         [".ahk", ".ah2"],
}


@dataclass
class ScopeConfig:
    """Scope guardrail configuration."""

    deny_patterns: List[str] = field(default_factory=lambda: [
        "**/node_modules/**",
        "**/.git/**",
        "**/__pycache__/**",
        "**/dist/**",
        "**/build/**",
        "**/.venv/**",
        "**/vendor/**",
        "**/.next/**",
        "**/target/**",
    ])
    allow_patterns: List[str] = field(default_factory=lambda: [
        "**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx",
        "**/*.py", "**/*.rs",  "**/*.go", "**/*.cs",
        "**/*.md", "**/*.json","**/*.yaml","**/*.toml",
        "**/*.sql","**/*.sh",  "**/*.ps1", "**/*.ahk", "**/*.ah2",
    ])
    allow_overrides: List[str] = field(default_factory=list)
    max_depth: int = 15
    max_depth_hard: int = 30
    file_count_warn_threshold: int = 10_000
    file_count_hard_cap: int = 50_000
    exclude_languages: List[str] = field(default_factory=list)


DEFAULT_SCOPE_CONFIG = ScopeConfig()


def _match_glob(path: str, pattern: str) -> bool:
    """Match a POSIX-style path against a glob pattern (/** prefix supported)."""
    p = path.replace("\\", "/")
    # Handle **/prefix by checking if pattern suffix matches any sub-path
    if pattern.startswith("**/"):
        suffix = pattern[3:]
        parts = p.split("/")
        return any(
            fnmatch.fnmatch("/".join(parts[i:]), suffix)
            for i in range(len(parts))
        )
    return fnmatch.fnmatch(p, pattern)


def is_path_allowed(
    file_path: str,
    config: Optional[ScopeConfig] = None,
) -> bool:
    """Return True if *file_path* should be included in the cartography scan.

    Evaluation order:
      1. allow_overrides (highest priority — overrides deny)
      2. deny_patterns
      3. exclude_languages
      4. allow_patterns
    """
    cfg = config or DEFAULT_SCOPE_CONFIG
    p = file_path.replace("\\", "/")
    ext = Path(file_path).suffix.lower()

    # 1. Explicit opt-in overrides
    if any(_match_glob(p, pat) for pat in cfg.allow_overrides):
        return True

    # 2. Deny-list
    if any(_match_glob(p, pat) for pat in cfg.deny_patterns):
        return False

    # 3. Excluded languages
    for lang in cfg.exclude_languages:
        exts = LANGUAGE_EXTENSION_MAP.get(lang.lower(), [])
        if ext in exts:
            return False

    # 4. Allow-list
    return any(_match_glob(p, pat) for pat in cfg.allow_patterns)
