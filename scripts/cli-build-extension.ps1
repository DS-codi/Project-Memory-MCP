#Requires -Version 5.1
<#
.SYNOPSIS
    CLI build helper: VS Code extension (compile + vsce package + install).
    No prompts, no interaction.
#>
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$Root   = Split-Path -Parent $PSScriptRoot
$ExtDir = Join-Path $Root 'vscode-extension'

if (-not (Test-Path $ExtDir)) {
    Write-Host "error: vscode-extension/ directory not found at $ExtDir"
    exit 1
}

$env:NODE_OPTIONS = $null

Push-Location $ExtDir
try {
    Write-Host "npm install (vscode-extension)..."
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "npm run compile (vscode-extension)..."
    npm run compile
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "npx vsce package (vscode-extension)..."
    npx '@vscode/vsce' package
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    # Find the freshly packaged .vsix
    $vsix = Get-ChildItem -Path $ExtDir -Filter '*.vsix' |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if ($vsix) {
        Write-Host "Installing extension: $($vsix.Name)"
        $env:NODE_OPTIONS = $null
        code --install-extension $vsix.FullName
        if ($LASTEXITCODE -ne 0) {
            Write-Host "warning: code --install-extension returned $LASTEXITCODE (extension may be installed but VS Code is closed)"
        } else {
            Write-Host "Extension installed. Reload VS Code: Ctrl+Shift+P -> Developer: Reload Window"
        }
    } else {
        Write-Host "error: no .vsix file found after vsce package step"
        exit 1
    }
} finally {
    Pop-Location
}
