#Requires -Version 5.1
<#
.SYNOPSIS
    CLI build helper: MCP Server (TypeScript/Node.js).
    Runs npm install + npm run build in server/, then seeds the database.
    No prompts, no interaction.
#>
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$Root      = Split-Path -Parent $PSScriptRoot
$ServerDir = Join-Path $Root 'server'

if (-not (Test-Path $ServerDir)) {
    Write-Host "error: server/ directory not found at $ServerDir"
    exit 1
}

# Clear NODE_OPTIONS -- win-ca and similar VS Code preloads crash Node when the
# modules aren't installed globally on this machine.
$env:NODE_OPTIONS = $null

Push-Location $ServerDir
try {
    Write-Host "npm install (server)..."
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "npm run build (server)..."
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $fallbackEntry = Join-Path $ServerDir 'dist\fallback-rest-main.js'
    if (-not (Test-Path $fallbackEntry)) {
        Write-Host "error: fallback-rest-main.js not found after build: $fallbackEntry"
        exit 1
    }

    # Seed / initialise the database (idempotent)
    $seedJs = Join-Path $ServerDir 'dist\db\seed.js'
    if (Test-Path $seedJs) {
        Write-Host "node seed.js (DB init)..."
        node $seedJs
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

    Write-Host "server built OK -> $ServerDir\dist"
} finally {
    Pop-Location
}
