#Requires -Version 5.1
<#
.SYNOPSIS
    CLI build helper: Dashboard (React frontend + Node.js server).
    No prompts, no interaction.
#>
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$Root     = Split-Path -Parent $PSScriptRoot
$DashDir  = Join-Path $Root 'dashboard'

if (-not (Test-Path $DashDir)) {
    Write-Host "error: dashboard/ directory not found at $DashDir"
    exit 1
}

$env:NODE_OPTIONS = $null

# ── React frontend ────────────────────────────────────────────────────────────
Push-Location $DashDir
try {
    Write-Host "npm install (dashboard frontend)..."
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "npx vite build (dashboard frontend)..."
    npx vite build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "Dashboard frontend built OK -> $DashDir\dist"
} finally {
    Pop-Location
}

# ── Node.js server ────────────────────────────────────────────────────────────
$DashServerDir = Join-Path $DashDir 'server'
if (Test-Path $DashServerDir) {
    Push-Location $DashServerDir
    try {
        Write-Host "npm install (dashboard server)..."
        npm install
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

        Write-Host "npm run build (dashboard server)..."
        npm run build
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

        Write-Host "Dashboard server built OK -> $DashServerDir\dist"
    } finally {
        Pop-Location
    }
}
