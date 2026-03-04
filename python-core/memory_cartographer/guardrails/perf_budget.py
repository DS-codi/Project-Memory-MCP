"""
perf_budget.py
--------------
Performance guardrails for the memory_cartographer.
See docs/architecture/memory-cartographer/performance-guardrails.md
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class PerfConfig:
    """Performance guardrail configuration."""

    soft_time_limit_s: float = 30.0
    """Soft time limit in seconds — emit warning diagnostic."""

    hard_time_limit_s: float = 120.0
    """Hard time limit in seconds — cancel scan, return partial result."""

    soft_memory_limit_bytes: int = 512 * 1024 * 1024
    """RSS warning threshold (512 MB)."""

    hard_memory_limit_bytes: int = 1024 * 1024 * 1024
    """RSS hard stop threshold (1 GB)."""

    batch_size: int = 500
    """Number of files per processing batch."""

    progressive_sampling_threshold: int = 5_000
    """Enable progressive sampling above this file count."""

    progressive_sampling_fraction: float = 0.2
    """Fraction of files retained when progressive sampling is active."""


DEFAULT_PERF_CONFIG = PerfConfig()


class PerfTracker:
    """Tracks elapsed time and memory usage; provides cancellation checks.

    Usage::

        tracker = PerfTracker()
        tracker.start()
        for batch in batches:
            if tracker.should_cancel():
                break
            process(batch)
            tracker.on_batch_complete()
    """

    def __init__(self, config: Optional[PerfConfig] = None) -> None:
        self._config = config or DEFAULT_PERF_CONFIG
        self._start_time: float = 0.0
        self.batches_completed: int = 0
        self.files_processed: int = 0
        self.partial: bool = False
        self.partial_reason: Optional[str] = None

    def start(self) -> None:
        """Record the scan start time."""
        self._start_time = time.monotonic()

    @property
    def elapsed_s(self) -> float:
        """Seconds since start()."""
        return time.monotonic() - self._start_time

    def check_time(self) -> Optional[str]:
        """Returns 'soft', 'hard', or None based on elapsed time."""
        elapsed = self.elapsed_s
        if elapsed >= self._config.hard_time_limit_s:
            return "hard"
        if elapsed >= self._config.soft_time_limit_s:
            return "soft"
        return None

    def check_memory(self) -> Optional[str]:
        """Returns 'soft', 'hard', or None based on current RSS.
        Returns None if psutil is unavailable."""
        try:
            import psutil  # type: ignore
            rss = psutil.Process().memory_info().rss
            if rss >= self._config.hard_memory_limit_bytes:
                return "hard"
            if rss >= self._config.soft_memory_limit_bytes:
                return "soft"
        except ImportError:
            pass
        return None

    def should_cancel(self) -> bool:
        """Return True if the hard time or memory budget has been exceeded.
        Sets self.partial and self.partial_reason as a side-effect."""
        time_status = self.check_time()
        mem_status  = self.check_memory()

        if time_status == "hard":
            self.partial = True
            self.partial_reason = "timeout"
            return True
        if mem_status == "hard":
            self.partial = True
            self.partial_reason = "memory"
            return True
        return False

    def on_batch_complete(self, batch_file_count: int = 0) -> None:
        """Call after each batch to update counters."""
        self.batches_completed += 1
        self.files_processed   += batch_file_count
