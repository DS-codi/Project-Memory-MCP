#Requires -Version 5.1
<#
.SYNOPSIS
    CLI build helper: GuiForms (pm-approval-gui + pm-brainstorm-gui, Rust + CxxQt).
    Finds Qt, sets QMAKE/PATH, builds both GUI binaries, then windeployqt each.
    No prompts, no interaction.
#>
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

. "$PSScriptRoot\cli-qt-resolve.ps1"

$QtBin = Find-QtBin
if (-not $QtBin) {
    Write-Host "error: guiforms build: Qt not found. Set QT_DIR or QMAKE."
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
$windeployqt = Join-Path $QtBin 'windeployqt.exe'

# ── pm-approval-gui ───────────────────────────────────────────────────────────
Write-Host "Building pm-approval-gui..."
cargo build --release -p pm-approval-gui
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$approvalExe    = Join-Path $Root 'target\release\pm-approval-gui.exe'
$approvalQmlDir = Join-Path $Root 'pm-approval-gui'
if ((Test-Path $windeployqt) -and (Test-Path $approvalExe)) {
    Write-Host "Running windeployqt for pm-approval-gui..."
    $wdqOut = & $windeployqt --release --qmldir $approvalQmlDir $approvalExe 2>&1
    foreach ($ln in $wdqOut) { if ("$ln".Trim()) { Write-Host "$ln" } }
}

Write-Host "pm-approval-gui built OK -> target\release\pm-approval-gui.exe"

# ── pm-brainstorm-gui ─────────────────────────────────────────────────────────
Write-Host "Building pm-brainstorm-gui..."
cargo build --release -p pm-brainstorm-gui
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$brainstormExe    = Join-Path $Root 'target\release\pm-brainstorm-gui.exe'
$brainstormQmlDir = Join-Path $Root 'pm-brainstorm-gui'
if ((Test-Path $windeployqt) -and (Test-Path $brainstormExe)) {
    Write-Host "Running windeployqt for pm-brainstorm-gui..."
    $wdqOut = & $windeployqt --release --qmldir $brainstormQmlDir $brainstormExe 2>&1
    foreach ($ln in $wdqOut) { if ("$ln".Trim()) { Write-Host "$ln" } }
}

Write-Host "pm-brainstorm-gui built OK -> target\release\pm-brainstorm-gui.exe"
