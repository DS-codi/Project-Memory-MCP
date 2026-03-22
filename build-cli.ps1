#!/usr/bin/env pwsh
# Build pm-cli in release mode and copy the binary to the project root.
# Run from the Project-Memory-MCP directory.

cargo build --release --bin pm-cli 2>&1
if ($LASTEXITCODE -eq 0) {
    Copy-Item "target\release\pm-cli.exe" ".\pm-cli.exe" -Force
    Write-Host "pm-cli.exe copied to project root." -ForegroundColor Green
    Write-Host "Run: .\pm-cli.exe" -ForegroundColor Cyan
} else {
    Write-Host "Build failed." -ForegroundColor Red
    exit 1
}
