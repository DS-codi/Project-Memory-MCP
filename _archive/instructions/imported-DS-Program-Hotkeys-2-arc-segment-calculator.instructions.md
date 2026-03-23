---
applyTo: "**/Arc_Segment_Calculator/**"
---

# Arc Segment Calculator Instructions

Project-specific guidance for working with the Arc Segment Calculator application.

## Project Overview

A standalone PySide6 desktop application for calculating arc segment approximations and generating DXF files. Features a fast-launching embedded Python distribution with immediate splash screen display.

## Directory Structure

```
Arc_Segment_Calculator/
├── src/                          # Main application source
│   ├── main.py                   # Application entry point
│   ├── arc_calculator.py         # Arc calculation logic
│   ├── dxf_generator.py          # DXF file generation
│   ├── resources/
│   │   ├── splash.png            # Splash screen image
│   │   └── ...
│   └── services/
│       └── job_search/           # Reusable job search module
│           ├── __init__.py       # Public API
│           ├── __main__.py       # CLI tool
│           ├── job_index.py      # Index management
│           └── job_search_parallel.py
├── launcher/                     # Fast splash launcher
│   ├── splash_launcher.py        # tkinter splash + subprocess
│   └── splash.png                # Splash image (for bundling)
├── embedded_python/              # Self-contained Python (generated)
├── dist_launcher/                # Compiled launcher (generated)
├── dist_nuitka/                  # Compiled main app (generated)
├── setup_embedded_python.ps1     # Embedded Python setup script
├── build_launcher.ps1            # Launcher build script
├── build_nuitka.ps1              # Main app build script
├── package_deployment.ps1        # Deployment packaging script
├── requirements.txt              # Python dependencies
└── README.md                     # User documentation
```

## Build Commands

### Main Application (PySide6)

```powershell
cd Arc_Segment_Calculator

# Quick build (PyInstaller)
.\build_executable.bat

# Nuitka build (faster runtime, larger output)
.\build_nuitka.ps1
```

### Embedded Python Environment

```powershell
cd Arc_Segment_Calculator

# Set up embedded Python (first time or update)
.\setup_embedded_python.ps1

# Force rebuild
.\setup_embedded_python.ps1 -Force
```

### Fast Splash Launcher

```powershell
cd Arc_Segment_Calculator

# Build launcher
.\build_launcher.ps1

# Debug build (with console)
.\build_launcher.ps1 -Debug

# Single-file build
.\build_launcher.ps1 -Mode onefile
```

### Full Deployment Package

```powershell
cd Arc_Segment_Calculator

# Create deploy/ folder with everything
.\package_deployment.ps1
```

## Development Workflow

### Running from Source

```powershell
# From workspace root
python Arc_Segment_Calculator\src\main.py

# From project directory
cd Arc_Segment_Calculator
python src\main.py
```

### Testing Job Search Module

```powershell
cd Arc_Segment_Calculator

# Check index status
python -m src.services.job_search status

# Build index
python -m src.services.job_search build

# Search for a job
python -m src.services.job_search search --job 24-1234
```

### Testing Launcher

```powershell
cd Arc_Segment_Calculator

# Run launcher in debug mode
python launcher\splash_launcher.py --debug

# Or after building
.\dist_launcher\splash_launcher.exe --debug
```

## Key Modules

### Arc Calculator (`src/arc_calculator.py`)

Core calculation engine for arc segmentation.

```python
from arc_calculator import calculate_segments

result = calculate_segments(
    radius=100.0,
    angle=90.0,
    min_offset=0.1,
    max_offset=0.5,
    inside_chord=True
)
```

### DXF Generator (`src/dxf_generator.py`)

Creates DXF files with segmented polylines and reference arcs.

```python
from dxf_generator import generate_dxf

generate_dxf(
    output_path=Path("output.dxf"),
    segments=result.segments,
    radius=100.0,
    angle=90.0
)
```

### Job Search (`src/services/job_search/`)

Reusable module for job folder lookup with index caching.

```python
from services.job_search import find_job_folder, ensure_index_exists

# At startup
ensure_index_exists()

# When needed
path = find_job_folder("24-1234")
```

### Splash Launcher (`launcher/splash_launcher.py`)

Fast-launching entry point using tkinter splash.

## Common Tasks

### Adding a New Dependency

1. Add to `requirements.txt`
2. Install in dev environment: `pip install -r requirements.txt`
3. Rebuild embedded Python: `.\setup_embedded_python.ps1 -Force`

### Updating the Splash Image

1. Create/edit `src/resources/splash.png` (600x400 recommended)
2. Copy to `launcher/splash.png`
3. Rebuild launcher: `.\build_launcher.ps1 -Clean`

### Changing Job Search Index Location

Edit `src/services/job_search/job_index.py`:

```python
# Change these constants
INDEX_DIR = Path.home() / ".my_app_name"
INDEX_FILE = INDEX_DIR / "job_index.json"
```

### Adding CLI Commands to Job Search

Edit `src/services/job_search/__main__.py` to add new commands.

## Troubleshooting

### "Module not found" errors in compiled app

- Ensure all imports are in `requirements.txt`
- Rebuild embedded Python: `.\setup_embedded_python.ps1 -Force`
- Check PyInstaller/Nuitka hidden imports

### Splash appears but main app doesn't start

- Check `launcher/splash_launcher.py` path resolution
- Run with `--debug` flag to see errors
- Verify `embedded_python/python.exe` exists

### Job search returns nothing

- Check index status: `python -m src.services.job_search status`
- Verify network drive is accessible
- Rebuild index: `python -m src.services.job_search build`

### Build fails with "Nuitka not found"

```powershell
pip install nuitka ordered-set zstandard
```

### Large file sizes in dist/

- Use Nuitka standalone mode (not onefile)
- Clean caches: `.\setup_embedded_python.ps1` (without `-SkipCleanup`)
- Exclude unused PySide6 modules in spec file

## Testing

### Unit Tests

```powershell
cd Arc_Segment_Calculator
pytest tests/
```

### Integration Test (Job Search)

```powershell
python -c "from src.services.job_search import find_job_folder; print(find_job_folder('24-1234'))"
```

### Launcher Test

```powershell
python -c "from launcher.splash_launcher import main; print('Import OK')"
```

## Deployment Checklist

1. [ ] Update `version_info.py` with new version
2. [ ] Build embedded Python: `.\setup_embedded_python.ps1`
3. [ ] Build main app: `.\build_nuitka.ps1`
4. [ ] Build launcher: `.\build_launcher.ps1`
5. [ ] Create package: `.\package_deployment.ps1`
6. [ ] Test `deploy/` folder on clean machine
7. [ ] Zip and distribute

## Performance Targets

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Splash display | <200ms | `--debug` flag shows timing |
| Job search (indexed) | <100ms | Status command shows lookup time |
| Job search (parallel) | <5s | Status command shows search time |
| App startup (total) | <3s | Time from click to usable UI |
