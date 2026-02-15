#!/usr/bin/env pwsh
# Build and Install Script for Project Memory MCP
# This script builds the server, vscode extension, and installs the extension

Write-Host "🔨 Building Project Memory MCP..." -ForegroundColor Cyan

# Build Server
Write-Host "`n📦 Building server..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\server"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Server build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Server built successfully" -ForegroundColor Green

# Build VS Code Extension
Write-Host "`n📦 Building VS Code extension..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\vscode-extension"
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Extension dependencies installation failed!" -ForegroundColor Red
    exit 1
}

npm run compile
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Extension build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Extension built successfully" -ForegroundColor Green

# Package Extension
Write-Host "`n📦 Packaging extension..." -ForegroundColor Yellow
npx @vscode/vsce package
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Extension packaging failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Extension packaged successfully" -ForegroundColor Green

# Install Extension
Write-Host "`n🔧 Installing extension in VS Code..." -ForegroundColor Yellow
$vsixFile = Get-ChildItem -Path . -Filter "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($null -eq $vsixFile) {
    Write-Host "❌ No .vsix file found!" -ForegroundColor Red
    exit 1
}

code --install-extension $vsixFile.FullName
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Extension installation failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Extension installed successfully" -ForegroundColor Green

Write-Host "`n🎉 All done! Please reload VS Code to use the updated extension." -ForegroundColor Cyan
Write-Host "   Run: Developer: Reload Window (Ctrl+Shift+P)" -ForegroundColor Gray
