# Build script for ds-viewer-gui and ds-converter-gui
# Usage: .\build-gui.ps1 [-Clean] [-Run] [-Converter] [-Viewer] [-All]

param(
    [switch]$Clean,
    [switch]$Run,
    [switch]$Converter,
    [switch]$Viewer,
    [switch]$All
)

# Default to building both if neither specified
if (-not $Converter -and -not $Viewer) {
    $All = $true
}

$ErrorActionPreference = "Stop"

# Set Qt environment
$env:QT_DIR = "C:\Qt\6.10.2\msvc2022_64"
$env:PATH = "C:\Qt\6.10.2\msvc2022_64\bin;$env:PATH"

# Navigate to ds-render directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "Qt Environment:" -ForegroundColor Cyan
Write-Host "  QT_DIR = $env:QT_DIR" -ForegroundColor Gray

# Determine which packages to build
$packages = @()
if ($All -or $Viewer) { $packages += "ds-viewer-gui" }
if ($All -or $Converter) { $packages += "ds-converter-gui" }

Write-Host "Building: $($packages -join ', ')" -ForegroundColor Cyan

if ($Clean) {
    Write-Host "Cleaning previous builds..." -ForegroundColor Yellow
    foreach ($pkg in $packages) {
        cargo clean -p $pkg
    }
}

# Build each package
$buildSuccess = $true
foreach ($pkg in $packages) {
    Write-Host "`nBuilding $pkg..." -ForegroundColor Cyan
    cargo build --release -p $pkg
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed for $pkg" -ForegroundColor Red
        $buildSuccess = $false
        break
    }
    Write-Host "$pkg built successfully" -ForegroundColor Green
}

if ($buildSuccess) {
    Write-Host "`nAll builds succeeded!" -ForegroundColor Green
    
    # Deploy Qt dependencies for each built exe
    Write-Host "`nDeploying Qt dependencies..." -ForegroundColor Cyan
    $targetDir = Join-Path $scriptDir "target\release"
    
    foreach ($pkg in $packages) {
        $exePath = Join-Path $targetDir "$pkg.exe"
        $qmlDir = Join-Path $scriptDir "$pkg\qml"
        
        if (Test-Path $exePath) {
            Write-Host "  Deploying for $pkg..." -ForegroundColor Gray
            & windeployqt --qmldir $qmlDir --release --no-translations $exePath 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  $pkg dependencies deployed" -ForegroundColor Green
            } else {
                Write-Host "  Warning: windeployqt failed for $pkg" -ForegroundColor Yellow
            }
        }
    }
    
    # Summary
    Write-Host "`n=== Build Summary ===" -ForegroundColor Cyan
    foreach ($pkg in $packages) {
        $exePath = Join-Path $targetDir "$pkg.exe"
        if (Test-Path $exePath) {
            Write-Host "  $pkg.exe" -ForegroundColor Green
        }
    }
    Write-Host "Location: $targetDir" -ForegroundColor Gray
    
    # Run if requested
    if ($Run) {
        $runPkg = if ($Converter) { "ds-converter-gui" } else { "ds-viewer-gui" }
        $exePath = Join-Path $targetDir "$runPkg.exe"
        Write-Host "`nLaunching $runPkg..." -ForegroundColor Cyan
        & $exePath
    }
} else {
    Write-Host "`nBuild failed!" -ForegroundColor Red
    exit 1
}
