---
name: qml-build-deploy
description: >
  Use this skill when creating build scripts for applications that use QML files
  and require Qt DLL deployment. Covers windeployqt usage, comprehensive DLL
  verification, fallback copy strategies, QML module directory checks, platform
  plugin deployment, QRC resource path conventions, and PowerShell build script
  patterns for Rust+CxxQt and PySide6+QML projects on Windows.
category: devops
tags:
  - qt
  - qml
  - dll
  - deployment
  - build-script
  - windeployqt
  - powershell
  - windows
language_targets:
  - rust
  - python
  - powershell
framework_targets:
  - qt6
  - cxxqt
  - pyside6
---

# QML Application Build & DLL Deployment

Build scripts for QML applications must handle three concerns beyond compilation: deploying Qt runtime DLLs next to the executable, verifying QML plugin directories exist, and ensuring platform plugins are present. Missing any of these causes silent failures — the app compiles and runs but shows no window.

## When to Use This Skill

- Writing a build/deploy script for any application that loads `.qml` files at runtime
- Debugging a Qt/QML app that compiles but shows no visible window
- Setting up CI/CD for a CxxQt (Rust) or PySide6 (Python) QML project on Windows
- Expanding an existing build script to handle Qt DLL deployment robustly

## Qt Installation Discovery

Always resolve the Qt installation path early and fail fast if it's missing.

### PowerShell Pattern

```powershell
param(
    [string]$QtDir = $(if ($env:QT_DIR) { $env:QT_DIR } else { 'C:\Qt\6.10.2\msvc2022_64' })
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $QtDir)) {
    throw "Qt directory not found at: $QtDir. Set `$env:QT_DIR` to your Qt installation."
}

$qtBin = Join-Path $QtDir 'bin'
$qmakePath = Join-Path $qtBin 'qmake6.exe'

if (-not (Test-Path $qmakePath)) {
    throw "qmake6.exe not found at: $qmakePath"
}

# Add Qt bin to PATH for runtime discovery
$env:PATH = "$qtBin;$env:PATH"
```

### Key Directories

| Variable | Path | Purpose |
|----------|------|---------|
| `$QtDir` | `C:\Qt\6.x.x\msvc2022_64` | Qt installation root |
| `$qtBin` | `$QtDir\bin` | DLLs and tools (windeployqt, qmake6) |
| `$QtDir\plugins\platforms` | Platform plugins source | `qwindows.dll` |
| `$QtDir\qml` | QML modules source | QtQuick, QtQml, etc. |

## windeployqt: The Primary Deployment Tool

`windeployqt` scans an executable for Qt dependencies and copies them alongside it. **Always run it first**, then verify its output — it frequently misses DLLs.

### Running windeployqt

```powershell
$deployTool = Join-Path $qtBin 'windeployqt.exe'
if (-not (Test-Path $deployTool)) {
    throw "windeployqt.exe not found at: $deployTool"
}

$deployArgs = @()
if ($Profile -eq 'release') {
    $deployArgs += '--release'
} else {
    $deployArgs += '--debug'
}

# --qmldir tells windeployqt where to scan for QML imports
$deployArgs += @('--qmldir', $qmlSourceDir, $exePath)

& $deployTool @deployArgs
if ($LASTEXITCODE -ne 0) {
    throw 'windeployqt deployment failed.'
}
```

### Critical: The `--qmldir` Flag

Without `--qmldir`, windeployqt cannot detect which QML modules your app uses and will skip deploying them. Always point it at the directory containing your `.qml` source files.

```powershell
# For CxxQt projects — QML files are in the project root or qml/ subfolder
$deployArgs += @('--qmldir', $projectDir, $exePath)

# For PySide6 projects — QML files are typically in resources/qml/
$deployArgs += @('--qmldir', (Join-Path $projectDir 'resources\qml'), $exePath)
```

## Comprehensive DLL Verification

windeployqt misses DLLs regularly, especially style plugins and less common modules. Always verify after deployment and copy missing files from the Qt installation.

### Required DLL Manifest

Maintain an explicit list of every DLL your app needs. This list varies by what QML imports you use.

```powershell
$requiredDlls = @(
    # ── Core Qt runtime ──
    'Qt6Core.dll',
    'Qt6Gui.dll',
    'Qt6Network.dll',
    'Qt6OpenGL.dll',

    # ── QML engine ──
    'Qt6Qml.dll',
    'Qt6QmlMeta.dll',
    'Qt6QmlModels.dll',
    'Qt6QmlWorkerScript.dll',

    # ── QtQuick rendering ──
    'Qt6Quick.dll',
    'Qt6QuickControls2.dll',
    'Qt6QuickControls2Impl.dll',
    'Qt6QuickTemplates2.dll',
    'Qt6QuickLayouts.dll',
    'Qt6QuickShapes.dll',
    'Qt6QuickEffects.dll',

    # ── Controls style plugins (windeployqt often misses these) ──
    'Qt6QuickControls2Basic.dll',
    'Qt6QuickControls2BasicStyleImpl.dll',
    'Qt6QuickControls2Fusion.dll',
    'Qt6QuickControls2FusionStyleImpl.dll',
    'Qt6QuickControls2Material.dll',
    'Qt6QuickControls2MaterialStyleImpl.dll',
    'Qt6QuickControls2Universal.dll',
    'Qt6QuickControls2UniversalStyleImpl.dll',
    'Qt6QuickControls2WindowsStyleImpl.dll',
    'Qt6QuickControls2Imagine.dll',
    'Qt6QuickControls2ImagineStyleImpl.dll',
    'Qt6QuickControls2FluentWinUI3StyleImpl.dll',

    # ── Optional modules (add based on your QML imports) ──
    'Qt6Svg.dll',                  # If using SVG images
    'Qt6LabsQmlModels.dll',        # If using Qt.labs.qmlmodels

    # ── Rendering support ──
    'D3Dcompiler_47.dll',
    'opengl32sw.dll'
)
```

### DLL Categories Quick Reference

| Category | DLLs | When Needed |
|----------|------|-------------|
| Core | `Qt6Core`, `Qt6Gui`, `Qt6Network` | Always |
| QML Engine | `Qt6Qml`, `Qt6QmlMeta`, `Qt6QmlModels` | Any QML app |
| Quick Rendering | `Qt6Quick`, `Qt6QuickLayouts`, `Qt6QuickShapes` | Any QtQuick UI |
| Controls | `Qt6QuickControls2*` | Using `import QtQuick.Controls` |
| Style Plugins | `Qt6QuickControls2Material*`, `*Fusion*`, etc. | Using styled controls |
| Graphics | `D3Dcompiler_47`, `opengl32sw` | Windows GPU rendering |
| SVG | `Qt6Svg` | `Image { source: "*.svg" }` |
| Network/SSL | `Qt6Network` + OpenSSL DLLs | TCP/HTTP/WebSocket usage |

### Verify-and-Copy Pattern

After windeployqt runs, iterate the manifest and copy anything it missed:

```powershell
$outputDir = Split-Path -Parent $exePath
$missingDlls = @()
$copiedDlls  = @()

foreach ($dll in $requiredDlls) {
    $dllDest = Join-Path $outputDir $dll
    if (-not (Test-Path $dllDest)) {
        # Fallback: copy from Qt bin directory
        $dllSrc = Join-Path $qtBin $dll
        if (Test-Path $dllSrc) {
            Copy-Item $dllSrc $dllDest -Force
            $copiedDlls += $dll
        } else {
            $missingDlls += $dll
        }
    }
}

if ($copiedDlls.Count -gt 0) {
    Write-Host "Copied $($copiedDlls.Count) missing DLL(s) from Qt:" -ForegroundColor Yellow
    $copiedDlls | ForEach-Object { Write-Host "  + $_" -ForegroundColor Yellow }
}

if ($missingDlls.Count -gt 0) {
    throw "Qt deployment incomplete. Missing: $($missingDlls -join ', ')"
}

Write-Host 'Qt runtime deployment verified.' -ForegroundColor Green
```

## Platform Plugin Verification

The **platform plugin** (`qwindows.dll`) is the single most critical deployment artifact. Without it, Qt cannot create any windows and exits silently.

```powershell
$platformDir = Join-Path $outputDir 'platforms'
if (-not (Test-Path (Join-Path $platformDir 'qwindows.dll'))) {
    $srcPlatform = Join-Path $QtDir 'plugins\platforms\qwindows.dll'
    if (Test-Path $srcPlatform) {
        New-Item -ItemType Directory -Force -Path $platformDir | Out-Null
        Copy-Item $srcPlatform (Join-Path $platformDir 'qwindows.dll') -Force
        Write-Host 'Copied platform plugin: platforms\qwindows.dll' -ForegroundColor Yellow
    } else {
        throw 'FATAL: platforms\qwindows.dll not found in Qt installation.'
    }
}
```

## QML Module Directory Verification

QML imports (`import QtQuick`, `import QtQuick.Controls`, etc.) resolve to directories under `qml/` next to the executable. windeployqt creates these, but verify they exist.

```powershell
$requiredQmlDirs = @(
    'qml\QtQuick',
    'qml\QtQuick\Controls',
    'qml\QtQuick\Layouts',
    'qml\QtQml'
)

foreach ($qmlDir in $requiredQmlDirs) {
    $qmlPath = Join-Path $outputDir $qmlDir
    if (-not (Test-Path $qmlPath)) {
        Write-Host "WARNING: QML module directory missing: $qmlDir" -ForegroundColor Yellow
        # Fallback: copy from Qt installation
        $srcQmlPath = Join-Path $QtDir $qmlDir
        if (Test-Path $srcQmlPath) {
            Copy-Item $srcQmlPath $qmlPath -Recurse -Force
            Write-Host "  Copied from Qt installation" -ForegroundColor Yellow
        } else {
            $missingDlls += "qml-dir:$qmlDir"
        }
    }
}
```

### Common QML Import → Directory Mapping

| QML Import | Required Directory |
|------------|-------------------|
| `import QtQuick` | `qml\QtQuick` |
| `import QtQuick.Controls` | `qml\QtQuick\Controls` |
| `import QtQuick.Layouts` | `qml\QtQuick\Layouts` |
| `import QtQml` | `qml\QtQml` |
| `import QtQuick.Shapes` | `qml\QtQuick\Shapes` |
| `import Qt.labs.qmlmodels` | `qml\Qt\labs\qmlmodels` |

## QRC Resource Path Convention (CxxQt)

CxxQt compiles QML files into the binary via the Qt Resource System (QRC). The `QmlModule` in `build.rs` creates QRC entries with a **`qml/` alias prefix**, so the load URL must include that prefix.

### build.rs Configuration

```rust
CxxQtBuilder::new_qml_module(
    QmlModule::new("com.mycompany.myapp")
        .qml_files(["qml/main.qml", "qml/MyComponent.qml"]),
)
.file("src/cxxqt_bridge/ffi.rs")
.build();
```

### Correct Load URL

The QRC URL pattern is: `qrc:/qt/qml/{uri-as-path}/qml/{filename}`

```rust
// ✅ CORRECT — includes qml/ prefix matching the QRC alias
engine.load(&QUrl::from("qrc:/qt/qml/com/mycompany/myapp/qml/main.qml"));

// ❌ WRONG — missing qml/ prefix, file not found at runtime
engine.load(&QUrl::from("qrc:/qt/qml/com/mycompany/myapp/main.qml"));
```

### Diagnosing QRC Failures

If QML fails to load from QRC, the engine silently produces no window. Add a post-load check:

```rust
if let Some(engine) = engine.as_mut() {
    engine.load(&QUrl::from("qrc:/qt/qml/com/mycompany/myapp/qml/main.qml"));
}

// Check if any root objects were created
// If the list is empty, QML failed to load
eprintln!("QML engine loaded — checking for root objects...");
```

## Debugging Qt Runtime Failures

When a QML app compiles but shows no window, use these environment variables to get diagnostics.

### Debug Environment Variables

```powershell
$env:QT_DEBUG_PLUGINS = '1'          # Verbose plugin loading (qwindows.dll, etc.)
$env:QML_IMPORT_TRACE = '1'          # Trace every QML import resolution
$env:QT_LOGGING_RULES = '*.debug=true'  # Full Qt debug logging (very verbose)
```

### Diagnostic Launch Pattern

```powershell
# Capture stderr (where Qt writes diagnostics) to a log file
$proc = Start-Process -FilePath $exePath -ArgumentList '--debug' `
    -RedirectStandardError 'qt_debug.log' `
    -PassThru -NoNewWindow

Start-Sleep -Seconds 5
$proc | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Content 'qt_debug.log'
```

### Common Error Messages and Fixes

| Error in Log | Root Cause | Fix |
|-------------|------------|-----|
| `No such file or directory` for `.qml` | Wrong QRC URL path | Add `qml/` prefix to match QRC alias |
| `module "QtQuick" is not installed` | QML module directory missing | Run windeployqt with `--qmldir` or copy `qml\QtQuick` |
| `Could not find the Qt platform plugin "windows"` | `platforms\qwindows.dll` missing | Copy from `$QtDir\plugins\platforms\` |
| `Invalid property assignment: "X" is a read-only property` | QML syntax error crashing engine | Fix the QML property assignment |
| `QQmlApplicationEngine failed to load component` | QML file not found or has errors | Check QRC path + run with `QML_IMPORT_TRACE=1` |
| `Plugin uses incompatible Qt library` | Mixing debug/release DLLs | Ensure `--release` or `--debug` flag matches build profile |

## Complete Build Script Template

This template covers build, deploy, test, and run for a CxxQt Rust+QML project. Adapt for PySide6 by replacing `cargo build` with your Python packaging tool.

```powershell
param(
    [switch]$Clean,
    [switch]$Test,
    [switch]$Run,
    [switch]$Deploy,
    [ValidateSet('debug', 'release')]
    [string]$Profile = 'release',
    [string]$QtDir = $(if ($env:QT_DIR) { $env:QT_DIR } else { 'C:\Qt\6.10.2\msvc2022_64' })
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# ── Qt discovery ──
if (-not (Test-Path $QtDir)) {
    throw "Qt not found at: $QtDir. Set `$env:QT_DIR`."
}
$qtBin = Join-Path $QtDir 'bin'
$env:QMAKE = Join-Path $qtBin 'qmake6.exe'
$env:PATH = "$qtBin;$env:PATH"

Write-Host "=== QML App Build ===" -ForegroundColor Cyan
Write-Host "Qt:      $QtDir" -ForegroundColor Gray
Write-Host "Profile: $Profile" -ForegroundColor Gray

# ── Clean ──
if ($Clean) {
    cargo clean
    if ($LASTEXITCODE -ne 0) { throw 'cargo clean failed.' }
}

# ── Build ──
$buildArgs = @('build')
if ($Profile -eq 'release') { $buildArgs += '--release' }

Write-Host "Running: cargo $($buildArgs -join ' ')" -ForegroundColor Cyan
cargo @buildArgs
if ($LASTEXITCODE -ne 0) { throw 'cargo build failed.' }

$exeName = 'my-app.exe'  # ← Replace with your binary name
$exePath = Join-Path $scriptDir "target\$Profile\$exeName"

# ── Deploy Qt runtime ──
$doDeploy = ($Profile -eq 'release') -or $Deploy.IsPresent
if ($doDeploy -and (Test-Path $exePath)) {
    $deployTool = Join-Path $qtBin 'windeployqt.exe'

    # Step 1: Run windeployqt
    $deployArgs = @($(if ($Profile -eq 'release') { '--release' } else { '--debug' }))
    $deployArgs += @('--qmldir', $scriptDir, $exePath)
    & $deployTool @deployArgs
    if ($LASTEXITCODE -ne 0) { throw 'windeployqt failed.' }

    # Step 2: Verify and copy missing DLLs
    $outputDir = Split-Path -Parent $exePath
    $requiredDlls = @(
        'Qt6Core.dll', 'Qt6Gui.dll', 'Qt6Network.dll', 'Qt6OpenGL.dll',
        'Qt6Qml.dll', 'Qt6QmlMeta.dll', 'Qt6QmlModels.dll', 'Qt6QmlWorkerScript.dll',
        'Qt6Quick.dll', 'Qt6QuickControls2.dll', 'Qt6QuickControls2Impl.dll',
        'Qt6QuickTemplates2.dll', 'Qt6QuickLayouts.dll',
        'Qt6QuickControls2Basic.dll', 'Qt6QuickControls2BasicStyleImpl.dll',
        'Qt6QuickControls2Material.dll', 'Qt6QuickControls2MaterialStyleImpl.dll',
        'D3Dcompiler_47.dll', 'opengl32sw.dll'
    )

    $missing = @(); $copied = @()
    foreach ($dll in $requiredDlls) {
        $dest = Join-Path $outputDir $dll
        if (-not (Test-Path $dest)) {
            $src = Join-Path $qtBin $dll
            if (Test-Path $src) {
                Copy-Item $src $dest -Force; $copied += $dll
            } else { $missing += $dll }
        }
    }

    # Step 3: Platform plugin
    $platformDir = Join-Path $outputDir 'platforms'
    if (-not (Test-Path (Join-Path $platformDir 'qwindows.dll'))) {
        $src = Join-Path $QtDir 'plugins\platforms\qwindows.dll'
        if (Test-Path $src) {
            New-Item -ItemType Directory -Force -Path $platformDir | Out-Null
            Copy-Item $src (Join-Path $platformDir 'qwindows.dll') -Force
            $copied += 'platforms\qwindows.dll'
        } else { $missing += 'platforms\qwindows.dll' }
    }

    # Step 4: QML module directories
    foreach ($qmlDir in @('qml\QtQuick', 'qml\QtQuick\Controls', 'qml\QtQuick\Layouts', 'qml\QtQml')) {
        if (-not (Test-Path (Join-Path $outputDir $qmlDir))) {
            $missing += "qml-dir:$qmlDir"
        }
    }

    if ($copied.Count -gt 0) {
        Write-Host "Copied $($copied.Count) missing file(s):" -ForegroundColor Yellow
        $copied | ForEach-Object { Write-Host "  + $_" -ForegroundColor Yellow }
    }
    if ($missing.Count -gt 0) {
        throw "Deployment incomplete. Missing: $($missing -join ', ')"
    }
    Write-Host 'Qt deployment verified.' -ForegroundColor Green
}

# ── Test ──
if ($Test) {
    cargo test
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
}

# ── Run ──
if ($Run) {
    if (-not (Test-Path $exePath)) { throw "Executable not found: $exePath" }
    Write-Host "Launching..." -ForegroundColor Cyan
    & $exePath
}

Write-Host 'Done.' -ForegroundColor Green
```

## PySide6 Deployment Differences

PySide6 bundles its own Qt DLLs inside the Python package, but standalone deployment (via `pyinstaller` or `cx_freeze`) still needs explicit handling.

### PySide6 DLL Location

```powershell
# Find where PySide6 installed Qt DLLs
$pyside6Dir = python -c "import PySide6; print(PySide6.__path__[0])"
# Typically: C:\Python3x\Lib\site-packages\PySide6

# Key subdirectories:
# $pyside6Dir\            → Qt6Core.dll, Qt6Gui.dll, etc.
# $pyside6Dir\plugins\    → platforms\qwindows.dll
# $pyside6Dir\qml\        → QtQuick\, QtQml\, etc.
```

### PyInstaller with QML

```powershell
pyinstaller --name MyApp `
    --add-data "resources/qml;resources/qml" `
    --add-binary "$pyside6Dir\plugins\platforms\qwindows.dll;platforms" `
    --hidden-import PySide6.QtQuick `
    --hidden-import PySide6.QtQml `
    main.py
```

## Common Pitfalls

1. **Missing `--qmldir` in windeployqt** — Causes no QML modules to be deployed. App runs but shows blank window or crashes on first QML import.

2. **Wrong QRC URL path** — CxxQt's `QmlModule` aliases QML files with a `qml/` prefix. The load URL must be `qrc:/qt/qml/{uri-path}/qml/main.qml`, not `qrc:/qt/qml/{uri-path}/main.qml`.

3. **windeployqt misses style plugins** — Qt6QuickControls2 styles (`Material`, `Fusion`, `Universal`, etc.) are frequently not deployed. Symptoms: controls appear but with wrong/default styling, or style-dependent layouts break.

4. **Missing `platforms\qwindows.dll`** — Complete silent failure. No error message, the process exits immediately. Always verify this file explicitly.

5. **Debug/Release mismatch** — Using `--release` with windeployqt on a debug build (or vice versa) deploys incompatible DLLs. Error: `Plugin uses incompatible Qt library`.

6. **Hardcoded Qt path** — Always use `$env:QT_DIR` with a fallback. Different machines have different Qt versions and installation paths.

7. **Forgetting `opengl32sw.dll`** — VMs, RDP sessions, and some CI runners lack GPU acceleration. Without the software OpenGL fallback, the app crashes in headless environments.

8. **QML syntax errors crash silently** — A read-only property assignment (e.g., `verticalCenter: parent.verticalCenter` on a Row) prevents the entire QML component tree from loading. The engine reports the error to stderr but shows no window.

## File Structure

```
my-qml-app/
├── build-my-app.ps1          # Build script (this skill's focus)
├── Cargo.toml                # Rust project config
├── build.rs                  # CxxQt build config with QmlModule
├── qml/
│   ├── main.qml              # Root QML file
│   └── components/           # Reusable QML components
├── src/
│   ├── main.rs               # Entry point
│   └── cxxqt_bridge/         # CxxQt bridge module
└── target/
    └── release/
        ├── my-app.exe         # Built executable
        ├── Qt6Core.dll        # ← Deployed by windeployqt + verify script
        ├── Qt6Quick.dll
        ├── ...
        ├── platforms/
        │   └── qwindows.dll   # ← Critical platform plugin
        └── qml/
            ├── QtQuick/       # ← QML module directories
            ├── QtQml/
            └── ...
```

## References

- [windeployqt documentation](https://doc.qt.io/qt-6/windows-deployment.html)
- [Qt for Windows - Deployment](https://doc.qt.io/qt-6/windows-deployment.html)
- [CxxQt Build Configuration](https://kdab.github.io/cxx-qt/book/)
- [PySide6 Deployment](https://doc.qt.io/qtforpython-6/deployment/index.html)
- [Qt Resource System](https://doc.qt.io/qt-6/resources.html)
