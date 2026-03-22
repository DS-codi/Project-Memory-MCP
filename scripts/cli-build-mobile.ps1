#Requires -Version 5.1
<#
.SYNOPSIS
    CLI build helper: Mobile (Capacitor / npm).
    Gracefully skips if mobile/ directory does not exist.
    No prompts, no interaction.
#>
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$Root      = Split-Path -Parent $PSScriptRoot
$MobileDir = Join-Path $Root 'mobile'

if (-not (Test-Path $MobileDir)) {
    Write-Host "Mobile directory not found at $MobileDir -- skipping"
    exit 0
}

$env:NODE_OPTIONS = $null

Push-Location $MobileDir
try {
    Write-Host "npm install (mobile)..."
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "npm run build (mobile)..."
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "Mobile built OK"
} finally {
    Pop-Location
}
