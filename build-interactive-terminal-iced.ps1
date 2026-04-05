#!/usr/bin/env pwsh
# Build interactive-terminal-iced and copy the binary to the project root.
# Pure Rust / iced 0.13 build — no Qt dependency.
# Run from the Project-Memory-MCP directory.
#
# Flags:
#   -Release  Build in release mode (optimised). Default is debug.
#   -Clean    Run `cargo clean` before building to remove any partial/corrupted cache.

param(
    [switch]$Release,
    [switch]$Clean
)

if ($Clean) {
    Write-Host "Stopping any running cargo/rustc processes..." -ForegroundColor Yellow
    Get-Process -Name "cargo","rustc","rust-analyzer" -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 1

    Write-Host "Cleaning build cache..." -ForegroundColor Yellow
    cargo clean
    if ($LASTEXITCODE -ne 0) {
        Write-Host "cargo clean failed." -ForegroundColor Red
        exit 1
    }
}

if ($Release) {
    Write-Host "Building interactive-terminal-iced (release)..." -ForegroundColor Cyan
    cargo build --release -p interactive-terminal-iced 2>&1
    $srcBin = "target\release\interactive-terminal-iced.exe"
} else {
    Write-Host "Building interactive-terminal-iced (debug)..." -ForegroundColor Cyan
    cargo build -p interactive-terminal-iced 2>&1
    $srcBin = "target\debug\interactive-terminal-iced.exe"
}

if ($LASTEXITCODE -eq 0) {
    Copy-Item $srcBin ".\interactive-terminal-iced.exe" -Force
    Write-Host "interactive-terminal-iced.exe copied to project root." -ForegroundColor Green
    Write-Host "Run: .\interactive-terminal-iced.exe" -ForegroundColor Cyan
} else {
    Write-Host "Build failed." -ForegroundColor Red
    exit 1
}
