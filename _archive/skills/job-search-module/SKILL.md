---
name: job-search-module
description: Use this skill when working with job folder lookups on network drives, implementing index-based caching for fast searches, or adding job search functionality to applications. Covers the reusable job_search module API, CLI tool usage, configuration options, and integration patterns.
---

# Job Search Module

A reusable module for fast job folder lookups on network drives with index caching and parallel search fallback. Located in `S:\ahk-ds-program\DS-HOTKEYS\DS-Program-Hotkeys-2\Arc_Segment_Calculator\src\services\job_search`.

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      find_job_folder()                       │
│                     (Primary Entry Point)                    │
└───────────────────────────┬─────────────────────────────────┘
                            │
                ┌───────────▼───────────┐
                │   Index-First Lookup   │ <1ms (cached)
                │   find_job_indexed()   │
                └───────────┬───────────┘
                            │ Miss?
                ┌───────────▼───────────┐
                │   Parallel Search      │ 3-5s (uncached)
                │   ThreadPoolExecutor   │
                └───────────┬───────────┘
                            │ Found?
                ┌───────────▼───────────┐
                │   Add to Index Cache   │
                │   Background Update    │
                └───────────────────────┘
```

## When to Use This Skill

- Searching for job folders on network drives (O:\, Z:\, etc.)
- Implementing job folder lookup in desktop applications
- Adding command-line job search tools
- Integrating job path resolution into file dialogs

## Primary API

### find_job_folder()

The main entry point - handles index lookup with parallel search fallback.

```python
from services.job_search import find_job_folder

# Search for a job folder
path = find_job_folder("24-1234")
if path:
    print(f"Found: {path}")
else:
    print("Job not found")

# With custom base path
path = find_job_folder("24-1234", base_path=r"Z:\Jobs")
```

### ensure_index_exists()

Call at application startup to trigger background index build if needed.

```python
from services.job_search import ensure_index_exists

# In your main.py startup sequence
def main():
    ensure_index_exists()  # Non-blocking, starts background thread
    # ... rest of app initialization
```

### get_dxf_output_path()

Utility for determining where to save DXF files for a job.

```python
from services.job_search import get_dxf_output_path

# Get output path - searches job folder, falls back to provided directory
output_path = get_dxf_output_path(
    job_number="24-1234",
    filename="arc_segments.dxf",
    fallback_dir=Path.home() / "Documents"
)
```

### Status Functions

```python
from services.job_search import is_indexing, get_status

# Check if background index build is running
if is_indexing():
    print("Index rebuild in progress...")

# Get detailed status
status = get_status()
# Returns: {
#     "index_exists": True,
#     "job_count": 15000,
#     "age_hours": 2.5,
#     "is_stale": False,
#     "rebuild_in_progress": False
# }
```

## CLI Tool

The module includes a command-line interface for index management.

```bash
cd Arc_Segment_Calculator
python -m src.services.job_search <command> [options]
```

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `build` | Build/rebuild the job index | `python -m src.services.job_search build` |
| `status` | Show index status | `python -m src.services.job_search status` |
| `search` | Search for a job | `python -m src.services.job_search search --job 24-1234` |
| `clear` | Clear the index | `python -m src.services.job_search clear` |

### Examples

```bash
# Build index from default O: drive
python -m src.services.job_search build

# Build from custom path
python -m src.services.job_search build --base "D:\Jobs"

# Check index health
python -m src.services.job_search status

# Search for a job
python -m src.services.job_search search --job 24-1234
```

## Configuration

### Index Settings

```python
from services.job_search import configure_index

configure_index(
    index_dir=Path.home() / ".my_app",  # Where to store index.json
    max_age_hours=24,                    # Rebuild if older than this
    scan_depth=5                         # How deep to scan directories
)
```

### Parallel Search Settings

```python
from services.job_search import configure_parallel_search

configure_parallel_search(
    max_workers=8,      # ThreadPoolExecutor workers
    max_depth=5,        # Directory search depth
    timeout=30.0        # Search timeout in seconds
)
```

## Index File Location

```
~/.arc_segment_calculator/
└── job_index.json
```

Index JSON structure:
```json
{
    "version": 1,
    "last_scan": "2026-02-13T10:30:00.000000",
    "scan_duration_seconds": 45.2,
    "total_folders_scanned": 125000,
    "base_path": "O:\\",
    "jobs": {
        "24-1234": "O:\\2024\\24-1234 Customer Name",
        "24-1235": "O:\\2024\\24-1235 Another Job",
        ...
    }
}
```

## JobIndex Class

For advanced index manipulation:

```python
from services.job_search import JobIndex, build_index, save_index, load_index

# Build fresh index
index = build_index(base_path=r"O:\")
save_index(index)

# Load existing index
index = load_index()
if index:
    print(f"Jobs indexed: {len(index.jobs)}")

# Access job entries
if "24-1234" in index.jobs:
    path = index.jobs["24-1234"]
```

## Job Number Patterns

The module recognizes these job number formats:

| Pattern | Example | Normalized |
|---------|---------|------------|
| YY-NNNN | 24-1234 | 24-1234 |
| YYNNNN | 241234 | 24-1234 |
| NNNNNNN | 1308501 | 1308501 |
| XX-NNNN | DS-1234 | DS-1234 |

## Integration Example

Full integration into a PySide6 application:

```python
# main.py
import sys
from pathlib import Path
from PySide6.QtWidgets import QApplication

# Import job search
from services.job_search import ensure_index_exists, find_job_folder

def main():
    # Start index build early (non-blocking)
    ensure_index_exists()
    
    app = QApplication(sys.argv)
    
    # ... create main window ...
    
    sys.exit(app.exec())

# In your job file dialog handler
def on_select_job_folder(job_number: str) -> Path | None:
    path = find_job_folder(job_number)
    if path:
        return Path(path)
    return None
```

## Performance Characteristics

| Operation | Time | Notes |
|-----------|------|-------|
| Index lookup (hit) | <1ms | Instant |
| Index lookup (miss) + parallel search | 3-5s | Scans network drive |
| Full index build | 30-60s | Background thread |
| Index load from disk | <100ms | JSON parse |

## Error Handling

```python
from services.job_search import find_job_folder

try:
    path = find_job_folder("24-1234")
except PermissionError:
    print("Cannot access network drive")
except Exception as e:
    print(f"Search failed: {e}")
```

## Module Structure

```
services/job_search/
├── __init__.py              # Public API exports
├── __main__.py              # CLI tool entry point
├── job_index.py             # Index building, caching, schema
├── job_lookup_combined.py   # Combined index + parallel search
└── job_search_parallel.py   # ThreadPoolExecutor parallel search
```
