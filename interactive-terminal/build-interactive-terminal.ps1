param(
    [switch]$Clean,
    [switch]$Test,
    [switch]$Run,
    [switch]$Deploy,
    [int]$Port = 9100,
    [ValidateSet('debug', 'release')]
    [string]$Profile = 'release',
    [string]$QtDir = $(if ($env:QT_DIR) { $env:QT_DIR } else { 'C:\Qt\6.10.2\msvc2022_64' })
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not (Test-Path $QtDir)) {
    throw "Qt directory not found at: $QtDir. Set `$env:QT_DIR` to your Qt installation path (e.g. 'C:\Qt\6.10.2\msvc2022_64')."
}

$qtBin = Join-Path $QtDir 'bin'
$qmakePath = Join-Path $qtBin 'qmake6.exe'

if (-not (Test-Path $qmakePath)) {
    throw "qmake6.exe not found at: $qmakePath"
}

$env:QMAKE = $qmakePath
$env:PATH = "$qtBin;$env:PATH"

# Cargo network stability defaults for Windows environments where certificate
# revocation checks are blocked by corporate/firewall policy.
if (-not $env:CARGO_HTTP_CHECK_REVOKE) {
    $env:CARGO_HTTP_CHECK_REVOKE = 'false'
}
if (-not $env:CARGO_REGISTRIES_CRATES_IO_PROTOCOL) {
    $env:CARGO_REGISTRIES_CRATES_IO_PROTOCOL = 'sparse'
}
if (-not $env:CARGO_NET_GIT_FETCH_WITH_CLI) {
    $env:CARGO_NET_GIT_FETCH_WITH_CLI = 'true'
}

Write-Host '=== Interactive Terminal Build ===' -ForegroundColor Cyan
Write-Host "QtDir:   $QtDir" -ForegroundColor Gray
Write-Host "QMAKE:   $env:QMAKE" -ForegroundColor Gray
Write-Host "Profile: $Profile" -ForegroundColor Gray
Write-Host "Cargo SSL revoke check: $env:CARGO_HTTP_CHECK_REVOKE" -ForegroundColor Gray
Write-Host "Cargo registry protocol: $env:CARGO_REGISTRIES_CRATES_IO_PROTOCOL" -ForegroundColor Gray
Write-Host "Cargo git fetch via CLI: $env:CARGO_NET_GIT_FETCH_WITH_CLI" -ForegroundColor Gray

$doDeploy = ($Profile -eq 'release') -or $Deploy.IsPresent
Write-Host "Deploy:  $doDeploy" -ForegroundColor Gray

& $env:QMAKE --version
if ($LASTEXITCODE -ne 0) {
    throw 'qmake version check failed.'
}

if ($Clean) {
    Write-Host 'Cleaning build artifacts...' -ForegroundColor Yellow
    cargo clean
    if ($LASTEXITCODE -ne 0) {
        throw 'cargo clean failed.'
    }
}

if ($Test) {
    Write-Host 'Running tests...' -ForegroundColor Cyan
    cargo test
    if ($LASTEXITCODE -ne 0) {
        throw 'cargo test failed.'
    }

    # Qt deployment validation: verify required DLLs are present in the build
    # output directory.  This runs after cargo test and only when -Test is
    # specified, ensuring the deployment artifacts are present for release
    # builds.
    $testTargetDir = if ($Profile -eq 'release') { 'release' } else { 'debug' }
    $testExePath   = Join-Path $scriptDir "target\$testTargetDir\interactive-terminal.exe"
    $testOutputDir = Split-Path -Parent $testExePath

    if (Test-Path $testExePath) {
        Write-Host 'Validating Qt deployment artifacts...' -ForegroundColor Cyan

        $deployRequiredDlls = @('Qt6Core.dll', 'Qt6Gui.dll', 'Qt6Qml.dll', 'Qt6Quick.dll')
        $deployMissingDlls  = @()

        foreach ($dll in $deployRequiredDlls) {
            $dllPath = Join-Path $testOutputDir $dll
            if (-not (Test-Path $dllPath)) {
                $deployMissingDlls += $dll
            }
        }

        # Check for the platform plugin
        $platformPlugin = Join-Path $testOutputDir 'platforms\qwindows.dll'
        if (-not (Test-Path $platformPlugin)) {
            $deployMissingDlls += 'platforms\qwindows.dll'
        }

        if ($deployMissingDlls.Count -gt 0) {
            Write-Host "Qt deployment validation WARNING: Missing DLLs: $($deployMissingDlls -join ', ')" -ForegroundColor Yellow
            Write-Host 'Run with -Deploy or build in release mode to deploy Qt runtime.' -ForegroundColor Yellow
        } else {
            Write-Host 'Qt deployment validation PASSED — all required DLLs present.' -ForegroundColor Green
        }
    } else {
        Write-Host 'Skipping Qt deployment validation (executable not found; build first).' -ForegroundColor Yellow
    }
}

$buildArgs = @('build')
if ($Profile -eq 'release') {
    $buildArgs += '--release'
}

Write-Host "Running: cargo $($buildArgs -join ' ')" -ForegroundColor Cyan
$cargoOutput = & cargo @buildArgs 2>&1
$cargoOutput | ForEach-Object { $_ }
if ($LASTEXITCODE -ne 0) {
    $cargoText = ($cargoOutput | Out-String)
    if ($cargoText -match 'CRYPT_E_NO_REVOCATION_CHECK|SSL connect error') {
        Write-Host '' -ForegroundColor Yellow
        Write-Host 'Detected Windows certificate revocation check failure (schannel).' -ForegroundColor Yellow
        Write-Host 'The script sets CARGO_HTTP_CHECK_REVOKE=false for this session.' -ForegroundColor Yellow
        Write-Host 'To persist system-wide for your user profile:' -ForegroundColor Yellow
        Write-Host '  setx CARGO_HTTP_CHECK_REVOKE false' -ForegroundColor Yellow
    }
    throw 'cargo build failed.'
}

$exeName = 'interactive-terminal.exe'
$targetDir = if ($Profile -eq 'release') { 'release' } else { 'debug' }
$exePath = Join-Path $scriptDir "target\$targetDir\$exeName"

if (Test-Path $exePath) {
    Write-Host "Build output: $exePath" -ForegroundColor Green
} else {
    Write-Host "Warning: expected output not found at $exePath" -ForegroundColor Yellow
}

if ($doDeploy) {
    if (-not (Test-Path $exePath)) {
        throw "Cannot deploy Qt runtime; executable not found at $exePath"
    }

    if ($env:OS -eq 'Windows_NT') {
        $deployTool = Join-Path $qtBin 'windeployqt.exe'
        if (-not (Test-Path $deployTool)) {
            throw "windeployqt.exe not found at: $deployTool"
        }

        Write-Host "Deploying Qt runtime with: $deployTool" -ForegroundColor Cyan
        $deployArgs = @()
        if ($Profile -eq 'release') {
            $deployArgs += '--release'
        } else {
            $deployArgs += '--debug'
        }
        $deployArgs += @('--qmldir', $scriptDir, $exePath)

        & $deployTool @deployArgs
        if ($LASTEXITCODE -ne 0) {
            throw 'windeployqt deployment failed.'
        }

        # ---------------------------------------------------------------
        # Comprehensive DLL verification + fallback copy from Qt bin
        # ---------------------------------------------------------------
        $outputDir = Split-Path -Parent $exePath

        $requiredDlls = @(
            # Core Qt runtime
            'Qt6Core.dll',
            'Qt6Gui.dll',
            'Qt6Network.dll',
            'Qt6OpenGL.dll',
            'Qt6Qml.dll',
            'Qt6QmlMeta.dll',
            'Qt6QmlModels.dll',
            'Qt6QmlWorkerScript.dll',
            'Qt6Quick.dll',
            'Qt6QuickControls2.dll',
            'Qt6QuickControls2Impl.dll',
            'Qt6QuickTemplates2.dll',
            'Qt6QuickLayouts.dll',
            'Qt6QuickShapes.dll',
            'Qt6QuickEffects.dll',
            'Qt6Svg.dll',
            # Controls style plugins
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
            # Labs
            'Qt6LabsQmlModels.dll',
            # Rendering support
            'D3Dcompiler_47.dll',
            'opengl32sw.dll'
        )

        $missingDlls  = @()
        $copiedDlls   = @()

        foreach ($dll in $requiredDlls) {
            $dllDest = Join-Path $outputDir $dll
            if (-not (Test-Path $dllDest)) {
                # Try to copy from Qt bin directory
                $dllSrc = Join-Path $qtBin $dll
                if (Test-Path $dllSrc) {
                    Copy-Item $dllSrc $dllDest -Force
                    $copiedDlls += $dll
                } else {
                    $missingDlls += $dll
                }
            }
        }

        # Verify platform plugin
        $platformDir = Join-Path $outputDir 'platforms'
        if (-not (Test-Path (Join-Path $platformDir 'qwindows.dll'))) {
            $srcPlatform = Join-Path $QtDir 'plugins\platforms\qwindows.dll'
            if (Test-Path $srcPlatform) {
                New-Item -ItemType Directory -Force -Path $platformDir | Out-Null
                Copy-Item $srcPlatform (Join-Path $platformDir 'qwindows.dll') -Force
                $copiedDlls += 'platforms\qwindows.dll'
            } else {
                $missingDlls += 'platforms\qwindows.dll'
            }
        }

        # Verify QML module directories exist (windeployqt should have created these)
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
                $missingDlls += "qml-dir:$qmlDir"
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
    } else {
        Write-Host 'Deploy requested, but non-Windows OS detected; skipping windeployqt.' -ForegroundColor Yellow
    }
}

if ($Run) {
    if (-not (Test-Path $exePath)) {
        throw "Cannot run app; executable not found at $exePath"
    }

    Write-Host "Launching interactive-terminal on port $Port..." -ForegroundColor Cyan
    & $exePath --port $Port
}

Write-Host 'Done.' -ForegroundColor Green
