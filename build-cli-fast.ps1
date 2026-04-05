#!/usr/bin/env pwsh
# Build pm-cli-fast in release mode and copy the binary to the project root.
# No tachyonfx — significantly faster cold compile than build-cli.ps1.
# Run from the Project-Memory-MCP directory.
#
# Flags:
#   -Clean    Run `cargo clean` before building to remove any partial/corrupted cache.

param(
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

cargo build --release --bin pm-cli-fast 2>&1
if ($LASTEXITCODE -eq 0) {
    Copy-Item "target\release\pm-cli-fast.exe" ".\pm-cli-fast.exe" -Force
    Write-Host "pm-cli-fast.exe copied to project root." -ForegroundColor Green
    Write-Host "Run: .\pm-cli-fast.exe" -ForegroundColor Cyan
} else {
    Write-Host "Build failed." -ForegroundColor Red
    exit 1
}
