#!/usr/bin/env pwsh
#Requires -Version 5.1
<#
.SYNOPSIS
    Build/install individual components.
    Dispatches to scripts/cli-build-<component>.ps1.
    Does NOT touch install.ps1.

.PARAMETER Include
    Component to build.  Valid values:
    All | Supervisor | GuiForms | InteractiveTerminal | Server | FallbackServer |
    Dashboard | Extension | Mobile | Container
    Default: All
#>
[CmdletBinding()]
param(
    [string]$Include = "All"
)

$ErrorActionPreference = "Stop"

# Resolve project root from this script's location (scripts/ sub-dir)
$Root = Split-Path -Parent $PSScriptRoot

$scriptMap = @{
    'Supervisor'          = 'cli-build-supervisor.ps1'
    'GuiForms'            = 'cli-build-guiforms.ps1'
    'InteractiveTerminal' = 'cli-build-interactive-terminal.ps1'
    'Server'              = 'cli-build-server.ps1'
    'FallbackServer'      = 'cli-build-server.ps1'
    'Dashboard'           = 'cli-build-dashboard.ps1'
    'Extension'           = 'cli-build-extension.ps1'
    'Mobile'              = 'cli-build-mobile.ps1'
    'Container'           = 'cli-build-container.ps1'
}

if ($Include -eq 'All') {
    $toRun = @('Supervisor', 'GuiForms', 'InteractiveTerminal', 'Server', 'Dashboard', 'Extension')
} else {
    $toRun = @($Include)
}

foreach ($comp in $toRun) {
    $script = $scriptMap[$comp]
    if (-not $script) {
        Write-Host "No build script configured for component '$comp'" -ForegroundColor Yellow
        continue
    }
    $scriptPath = Join-Path $PSScriptRoot $script
    if (-not (Test-Path $scriptPath)) {
        Write-Host "Script not found: $scriptPath" -ForegroundColor Yellow
        continue
    }
    Write-Host "=== Building: $comp ===" -ForegroundColor Cyan
    & $scriptPath
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed for $comp (exit $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}
