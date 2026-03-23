---
name: embedded-python-launcher
description: Use this skill when creating fast-launching Python GUI applications, implementing splash screens with immediate display, setting up embedded Python for portable deployment, or building self-contained Python executables. Covers the tkinter splash + subprocess pattern, embedded Python setup, Nuitka build process, and deployment packaging.
---

# Embedded Python Launcher

A pattern for creating fast-launching Python GUI applications with immediate splash screen display (<200ms) and portable deployment. Located in `Arc_Segment_Calculator/launcher/`.

## Overview

```
┌────────────────────────────────────────────────────────────────┐
│                    User Double-Clicks EXE                       │
└───────────────────────────┬────────────────────────────────────┘
                            │ ~50ms
┌───────────────────────────▼────────────────────────────────────┐
│              Launcher (tkinter, compiled with Nuitka)           │
│              - Shows splash instantly                           │
│              - Spawns main app via subprocess                   │
└───────────────────────────┬────────────────────────────────────┘
                            │ ~500-2000ms (background)
┌───────────────────────────▼────────────────────────────────────┐
│              Main Application (PySide6/Qt)                      │
│              - Full GUI loads                                   │
│              - Window becomes visible                           │
└───────────────────────────┬────────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────────┐
│              Launcher detects main window                       │
│              - Closes splash                                    │
│              - Exits                                            │
└────────────────────────────────────────────────────────────────┘
```

## When to Use This Skill

- Building Python GUI apps that need fast perceived startup (<200ms)
- Creating portable Python applications without system Python
- Deploying PySide6/Qt applications to users without Python
- Implementing professional splash screens

## Architecture

### The Problem

- PySide6/Qt takes 500-2000ms to import
- Users perceive this as slow/unresponsive
- Direct compilation includes heavy Qt libraries

### The Solution

1. **Two-stage startup**: Fast tkinter splash → Heavy PySide6 app
2. **Embedded Python**: Self-contained Python interpreter bundled with app
3. **Subprocess isolation**: Launcher and app are separate processes

### Components

```
Arc_Segment_Calculator/
├── launcher/
│   ├── splash_launcher.py    # Fast tkinter launcher
│   └── splash.png            # Splash image
├── embedded_python/          # Self-contained Python
│   ├── python.exe
│   ├── python313.dll
│   ├── Lib/site-packages/    # PySide6, ezdxf, etc.
│   └── ...
├── src/
│   └── main.py               # Main PySide6 application
├── setup_embedded_python.ps1 # Creates embedded_python/
├── build_launcher.ps1        # Compiles launcher
└── package_deployment.ps1    # Creates deploy package
```

## Setup: Embedded Python

### Running the Setup Script

```powershell
cd Arc_Segment_Calculator
.\setup_embedded_python.ps1
```

### What It Does

1. Downloads Python embeddable package (python-3.13.x-embed-amd64.zip)
2. Extracts to `embedded_python/`
3. Modifies `python313._pth` to enable site-packages
4. Installs pip
5. Installs required packages (PySide6, ezdxf)
6. Cleans up cache files

### Options

```powershell
# Force reinstall even if exists
.\setup_embedded_python.ps1 -Force

# Specific Python version
.\setup_embedded_python.ps1 -PythonVersion "3.13.1"

# Keep pip cache (faster subsequent installs)
.\setup_embedded_python.ps1 -SkipCleanup
```

### Result Structure

```
embedded_python/
├── python.exe                 # Executable
├── python313.dll              # Runtime
├── python313.zip              # Standard library (compressed)
├── python313._pth             # Import path configuration
├── Lib/
│   └── site-packages/
│       ├── PySide6/           # Qt bindings
│       ├── ezdxf/             # DXF library
│       └── ...
└── Scripts/
    └── pip.exe
```

## Build: Launcher Executable

### Running the Build Script

```powershell
cd Arc_Segment_Calculator
.\build_launcher.ps1
```

### Build Modes

```powershell
# Standalone (default) - faster startup, multiple files
.\build_launcher.ps1 -Mode standalone

# Onefile - single executable, slower startup
.\build_launcher.ps1 -Mode onefile

# With debug console
.\build_launcher.ps1 -Debug

# Clean build
.\build_launcher.ps1 -Clean
```

### Output

```
dist_launcher/
├── splash_launcher.exe    # ~5-10MB executable
├── splash.png             # Splash image
└── ... (support files)
```

## Path Resolution Logic

The launcher finds resources using this search order:

### Embedded Python

```
1. ../embedded_python/python.exe   (relative to launcher)
2. ./embedded_python/python.exe    (sibling to launcher)
3. ./python.exe                    (same directory)
4. System Python (fallback)
```

### Main Script

```
1. ../src/main.py    (development structure)
2. ./src/main.py     (deployed with launcher)
3. ./main.py         (flat deployment)
```

### Splash Image

```
1. ./splash.png                    (same directory as launcher)
2. ../src/resources/splash.png     (development structure)
```

## SplashWindow Class

The core tkinter splash window implementation:

```python
from launcher.splash_launcher import SplashWindow

# Create and show splash
splash = SplashWindow(
    image_path=Path("splash.png"),
    debug=False
)
splash.show()

# Close when done
splash.close()
```

### Features

- Borderless window (no title bar/decorations)
- Centered on screen
- Always on top (topmost=True)
- PNG image display via tkinter PhotoImage
- Auto-closes after timeout (30s default)
- Detects main app window via Win32 EnumWindows

## Main App Detection

The launcher monitors for the main application window:

```python
# Win32 window detection (simplified)
import ctypes

def find_window_by_title(title_substring: str) -> int | None:
    """Find window handle by partial title match."""
    result = []
    
    def enum_callback(hwnd, _):
        if ctypes.windll.user32.IsWindowVisible(hwnd):
            length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buffer = ctypes.create_unicode_buffer(length + 1)
                ctypes.windll.user32.GetWindowTextW(hwnd, buffer, length + 1)
                if title_substring.lower() in buffer.value.lower():
                    result.append(hwnd)
                    return False  # Stop enumeration
        return True
    
    ctypes.windll.user32.EnumWindows(EnumWindowsProc(enum_callback), 0)
    return result[0] if result else None
```

## Command-Line Arguments

The launcher supports these arguments:

```bash
# Normal launch
splash_launcher.exe

# Debug mode (shows console, verbose output)
splash_launcher.exe --debug

# Skip splash (direct app launch)
splash_launcher.exe --no-splash
```

## Deployment Package

### Creating the Package

```powershell
cd Arc_Segment_Calculator
.\package_deployment.ps1
```

### Package Structure

```
deploy/
├── Arc_Segment_Calculator.exe    # Launcher executable
├── embedded_python/              # Self-contained Python
│   └── ...
├── src/                          # Application source
│   ├── main.py
│   └── ...
├── splash.png                    # Splash image
└── version.txt                   # Build info
```

### Distribution

Zip the `deploy/` folder and distribute to users. No Python installation required.

## Performance Targets

| Metric | Target | Actual |
|--------|--------|--------|
| Splash display | <200ms | ~50-100ms |
| Main app visible | <3s | ~1-2s |
| Launcher size | <15MB | ~8MB |
| Total package size | <200MB | ~150MB |

## Creating a New Launcher

### Step 1: Copy Template

```bash
# Copy launcher template
cp Arc_Segment_Calculator/launcher/ MyApp/launcher/
cp Arc_Segment_Calculator/build_launcher.ps1 MyApp/
cp Arc_Segment_Calculator/setup_embedded_python.ps1 MyApp/
```

### Step 2: Customize Splash

Replace `launcher/splash.png` with your app's splash image.

### Step 3: Modify Path Resolution

Edit `splash_launcher.py` to find your main script:

```python
def find_main_script() -> Optional[Path]:
    """Find the main application script."""
    launcher_dir = get_launcher_dir()
    
    search_paths = [
        launcher_dir.parent / "src" / "main.py",  # Adjust paths
        launcher_dir / "app.py",
        # Add more search paths as needed
    ]
    
    for path in search_paths:
        if path.exists():
            return path
    return None
```

### Step 4: Customize Window Detection

Modify the window title pattern to match your app:

```python
# In splash_launcher.py
TARGET_WINDOW_TITLE = "My App Name"  # Partial match
```

### Step 5: Build and Test

```powershell
# Set up embedded Python
.\setup_embedded_python.ps1

# Build launcher
.\build_launcher.ps1

# Test
.\dist_launcher\splash_launcher.exe --debug
```

## Troubleshooting

### Splash doesn't appear

- Check if `splash.png` exists in expected location
- Run with `--debug` to see error messages
- Verify tkinter is available in Python

### Main app doesn't start

- Check if embedded Python has all dependencies
- Verify `main.py` path resolution
- Run `embedded_python\python.exe src\main.py` manually

### Window detection fails

- Verify main app window title matches expected pattern
- Increase detection timeout if app loads slowly
- Run with `--debug` to see detection attempts

### Large package size

- Run `setup_embedded_python.ps1` without `-SkipCleanup`
- Remove unused packages from embedded_python
- Consider using PyInstaller for single-file if size critical

## Alternatives Considered

### Why Not PyInstaller Onefile?

- Slow startup (extracts to temp each time)
- No immediate splash capability
- Larger executable size for complex apps

### Why Not Rust/C Launcher?

- Evaluated in `launcher/RUST_LAUNCHER_EVALUATION.md`
- tkinter approach sufficient for <200ms target
- Python tooling more accessible for maintenance
- Rust would add build complexity

### Why Not cx_Freeze?

- Similar startup characteristics to PyInstaller
- Less active community support
- Nuitka produces faster executables
