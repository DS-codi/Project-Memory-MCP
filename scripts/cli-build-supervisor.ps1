#Requires -Version 5.1
<#
.SYNOPSIS
    CLI build helper: supervisor (Rust + CxxQt).
    Finds Qt, sets QMAKE/PATH, runs cargo build, then windeployqt.
    No prompts, no restarts, no interaction.
#>
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

. "$PSScriptRoot\cli-qt-resolve.ps1"

$QtBin = Find-QtBin
if (-not $QtBin) {
    Write-Host "error: supervisor build: Qt not found. Set QT_DIR or QMAKE."
    exit 1
}

$QtDir     = Split-Path -Parent $QtBin
$qmakePath = Find-QmakePath -QtBin $QtBin
if (-not $qmakePath) {
    Write-Host "error: qmake not found in $QtBin"
    exit 1
}

Write-Host "Qt bin: $QtBin"
Write-Host "QMAKE:  $qmakePath"

$env:QMAKE = $qmakePath
Initialize-WinDeployQtEnvironment -QtBin $QtBin

Set-Location $Root

foreach ($proc in @(Get-Process -Name 'supervisor' -ErrorAction SilentlyContinue)) {
    try {
        Stop-Process -Id $proc.Id -Force -ErrorAction Stop
        Write-Host "Stopped running supervisor (PID $($proc.Id))"
    } catch {
        Write-Host "note: could not stop supervisor (PID $($proc.Id)): $($_.Exception.Message)"
    }
}

Write-Host "Building supervisor..."
cargo build --release -p supervisor
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# WinDeployQt -- deploys Qt runtime DLLs next to the binary
$windeployqt  = Join-Path $QtBin 'windeployqt.exe'
$supervisorExe = Join-Path $Root 'target\release\supervisor.exe'

if ((Test-Path $windeployqt) -and (Test-Path $supervisorExe)) {
    Write-Host "Running windeployqt for supervisor..."
    $wdqOut = & $windeployqt --release --qmldir (Join-Path $Root 'supervisor') $supervisorExe 2>&1
    foreach ($ln in $wdqOut) { if ("$ln".Trim()) { Write-Host "$ln" } }
}

# Copy tray icon assets so QML SystemTrayIcon can resolve them
$iconsSource = Join-Path $Root 'supervisor\assets\icons'
$iconsTarget = Join-Path $Root 'target\release'
if (Test-Path $iconsSource) {
    Copy-Item -Path "$iconsSource\*.ico" -Destination $iconsTarget -Force -ErrorAction SilentlyContinue
    Write-Host "Tray icons copied to target\release"
}

Write-Host "supervisor built OK -> target\release\supervisor.exe"
