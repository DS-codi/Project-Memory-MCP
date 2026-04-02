#Requires -Version 5.1
<#
.SYNOPSIS
    CLI build helper: supervisor-iced (pure Rust — no Qt dependency).
    Builds the iced-based supervisor and copies assets to the output directory.
#>
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

Set-Location $Root

foreach ($proc in @(Get-Process -Name 'supervisor-iced' -ErrorAction SilentlyContinue)) {
    try {
        Stop-Process -Id $proc.Id -Force -ErrorAction Stop
        Write-Host "Stopped running supervisor-iced (PID $($proc.Id))"
    } catch {
        Write-Host "note: could not stop supervisor-iced (PID $($proc.Id)): $($_.Exception.Message)"
    }
}

Write-Host "Building supervisor-iced..."
cargo build --release -p supervisor-iced
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Copy tray icon assets (if any exist from the QML supervisor or shared assets)
$iconsSource = Join-Path $Root 'supervisor\assets\icons'
$iconsTarget = Join-Path $Root 'target\release'
if (Test-Path $iconsSource) {
    Copy-Item -Path "$iconsSource\*.ico" -Destination $iconsTarget -Force -ErrorAction SilentlyContinue
    Write-Host "Tray icons copied to target\release"
}

Write-Host "supervisor-iced built OK -> target\release\supervisor-iced.exe"
