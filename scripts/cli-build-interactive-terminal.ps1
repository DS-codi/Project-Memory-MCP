#Requires -Version 5.1
<#
.SYNOPSIS
    CLI build helper: InteractiveTerminal.
    Delegates to the component's own build-interactive-terminal.ps1 script.
    No prompts, no interaction.
#>
param(
    [switch]$Force,
    [switch]$NoWebEnginePlugin
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

. "$PSScriptRoot\cli-qt-resolve.ps1"

$QtBin = Find-QtBin
if (-not $QtBin) {
    Write-Host "error: interactive-terminal: Qt not found. Set QT_DIR or QMAKE."
    exit 1
}

$QtDir = Split-Path -Parent $QtBin

$BuildScript = Join-Path $Root 'interactive-terminal\build-interactive-terminal.ps1'
if (-not (Test-Path $BuildScript)) {
    Write-Host "error: build-interactive-terminal.ps1 not found at $BuildScript"
    exit 1
}

Write-Host "Qt dir: $QtDir"
Write-Host "Delegating to build-interactive-terminal.ps1 ..."

if ($NoWebEnginePlugin) {
    & $BuildScript -Profile release -QtDir $QtDir -NoWebEnginePlugin
} else {
    & $BuildScript -Profile release -QtDir $QtDir
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "error: build-interactive-terminal.ps1 failed (exit $LASTEXITCODE)"
    exit $LASTEXITCODE
}

Write-Host "interactive-terminal built OK"
