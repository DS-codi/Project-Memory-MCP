#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Install script for Project Memory MCP components.

.DESCRIPTION
    Builds and installs one or more components of the Project Memory MCP system.
    Components: Server, Extension, Container.

.PARAMETER Component
    Which component(s) to build and install. Accepts an array.
    Valid values: Server, Extension, Container, All
    Default: All

.PARAMETER InstallOnly
    For the Extension component: skip the build/package step and install the
    most recently generated .vsix file directly.

.PARAMETER SkipInstall
    Build and package only — do not call `code --install-extension`.

.PARAMETER Force
    Pass --force to `code --install-extension` (reinstall even if version matches).

.PARAMETER NoBuild
    Alias for -InstallOnly (kept for back-compat with build-and-install.ps1 usage).

.EXAMPLE
    # Build and install everything
    .\install.ps1

.EXAMPLE
    # Build and install only the VS Code extension
    .\install.ps1 -Component Extension

.EXAMPLE
    # Build only the server (no extension or container)
    .\install.ps1 -Component Server

.EXAMPLE
    # Install the already-packaged extension without rebuilding
    .\install.ps1 -Component Extension -InstallOnly

.EXAMPLE
    # Build server + extension, skip container
    .\install.ps1 -Component Server, Extension

.EXAMPLE
    # Full build but do not install extension (package only)
    .\install.ps1 -Component Extension -SkipInstall
#>

[CmdletBinding()]
param(
    [ValidateSet("Server", "Extension", "Container", "Supervisor", "InteractiveTerminal", "Dashboard", "All")]
    [string[]]$Component = @("All"),

    [switch]$InstallOnly,
    [switch]$SkipInstall,
    [switch]$Force,
    [switch]$NoBuild  # alias for InstallOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Resolve root relative to this script's location
$Root = $PSScriptRoot

# Normalise component list
if ($Component -contains "All") {
    $Components = @("Supervisor", "InteractiveTerminal", "Server", "Dashboard", "Extension")
} else {
    $Components = $Component
}

$EffectiveInstallOnly = $InstallOnly -or $NoBuild

# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

function Write-Step([string]$msg) {
    Write-Host "`n── $msg" -ForegroundColor Cyan
}

function Write-Ok([string]$msg) {
    Write-Host "   ✓ $msg" -ForegroundColor Green
}

function Write-Fail([string]$msg) {
    Write-Host "   ✗ $msg" -ForegroundColor Red
}

function Invoke-Checked([string]$description, [scriptblock]$block) {
    Write-Host "   › $description" -ForegroundColor Gray
    & $block
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "$description failed (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }
}

# ──────────────────────────────────────────────────────────────
# Rust crates
# ──────────────────────────────────────────────────────────────

function Install-Supervisor {
    Write-Step "Supervisor (Rust)"
    Push-Location $Root
    try {
        Invoke-Checked "cargo build --release -p supervisor" { cargo build --release -p supervisor 2>&1 | Write-Host }
        Write-Ok "supervisor built → target/release/supervisor"
    } finally {
        Pop-Location
    }
}

function Install-InteractiveTerminal {
    Write-Step "Interactive Terminal (Rust + Qt)"

    $BuildScript = Join-Path $Root "interactive-terminal\build-interactive-terminal.ps1"
    if (-not (Test-Path $BuildScript)) {
        Write-Fail "build-interactive-terminal.ps1 not found at $BuildScript"
        exit 1
    }

    # Resolve Qt directory: honour $env:QT_DIR, fall back to the same default
    # as build-interactive-terminal.ps1 itself uses.
    $QtDir = if ($env:QT_DIR) { $env:QT_DIR } else { 'C:\Qt\6.10.2\msvc2022_64' }

    Write-Host "   › Delegating to build-interactive-terminal.ps1 (QtDir=$QtDir)" -ForegroundColor Gray
    & $BuildScript -Profile release -QtDir $QtDir
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "build-interactive-terminal.ps1 failed (exit $LASTEXITCODE)"
        exit $LASTEXITCODE
    }

    Write-Ok "interactive-terminal built + Qt runtime deployed → interactive-terminal\target\release\"
}

# ──────────────────────────────────────────────────────────────
# Server
# ──────────────────────────────────────────────────────────────

function Install-Server {
    Write-Step "Server"
    $ServerDir = Join-Path $Root "server"

    Push-Location $ServerDir
    try {
        Invoke-Checked "npm run build" { npm run build 2>&1 | Write-Host }
        Write-Ok "Server built → $ServerDir\dist"
    } finally {
        Pop-Location
    }
}

# ──────────────────────────────────────────────────────────────
# VS Code Extension
# ──────────────────────────────────────────────────────────────

function Install-Extension {
    Write-Step "VS Code Extension"
    $ExtDir = Join-Path $Root "vscode-extension"

    Push-Location $ExtDir
    try {
        if (-not $EffectiveInstallOnly) {
            Invoke-Checked "npm install" { npm install 2>&1 | Write-Host }
            Invoke-Checked "npm run compile" { npm run compile 2>&1 | Write-Host }
            Invoke-Checked "npm run package (vsce)" { npx @vscode/vsce package 2>&1 | Write-Host }
            Write-Ok "Extension compiled and packaged"
        } else {
            Write-Host "   (skipping build — InstallOnly mode)" -ForegroundColor DarkGray
        }

        if (-not $SkipInstall) {
            $Vsix = Get-ChildItem -Path $ExtDir -Filter "*.vsix" |
                    Sort-Object LastWriteTime -Descending |
                    Select-Object -First 1

            if ($null -eq $Vsix) {
                Write-Fail "No .vsix file found in $ExtDir"
                exit 1
            }

            Write-Host "   › Installing $($Vsix.Name)" -ForegroundColor Gray

            $InstallArgs = @("--install-extension", $Vsix.FullName)
            if ($Force) { $InstallArgs += "--force" }
            code @InstallArgs
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "code --install-extension failed (exit $LASTEXITCODE)"
                exit $LASTEXITCODE
            }

            Write-Ok "Extension installed: $($Vsix.Name)"
            Write-Host ""
            Write-Host "   Reload VS Code to activate the updated extension:" -ForegroundColor Yellow
            Write-Host "   Ctrl+Shift+P → Developer: Reload Window" -ForegroundColor DarkGray
        } else {
            Write-Ok "Extension packaged (install skipped)"
        }
    } finally {
        Pop-Location
    }
}

# ──────────────────────────────────────────────────────────────
# Dashboard
# ──────────────────────────────────────────────────────────────

function Install-Dashboard {
    Write-Step "Dashboard"
    $DashDir = Join-Path $Root "dashboard"

    Push-Location $DashDir
    try {
        Invoke-Checked "npx vite build" { npx vite build 2>&1 | Write-Host }
        Write-Ok "Dashboard built → $DashDir\dist"
    } finally {
        Pop-Location
    }
}

# ──────────────────────────────────────────────────────────────
# Container
# ──────────────────────────────────────────────────────────────

function Install-Container {
    Write-Step "Container (podman)"

    $NoCache = if ($Force) { "--no-cache" } else { "" }
    $Tag = "project-memory-mcp-project-memory:latest"

    Push-Location $Root
    try {
        $BuildArgs = @("build", "-t", $Tag, ".")
        if ($Force) { $BuildArgs = @("build", "--no-cache", "-t", $Tag, ".") }

        Write-Host "   › podman build $($Force ? '--no-cache ' : '')-t $Tag ." -ForegroundColor Gray
        podman @BuildArgs
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Container build failed (exit $LASTEXITCODE)"
            exit $LASTEXITCODE
        }
        Write-Ok "Container image built: $Tag"
    } finally {
        Pop-Location
    }
}

# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────

$StartTime = Get-Date
Write-Host "Project Memory MCP — Install" -ForegroundColor Magenta
Write-Host "  Components : $($Components -join ', ')" -ForegroundColor DarkGray
Write-Host "  InstallOnly: $EffectiveInstallOnly" -ForegroundColor DarkGray
Write-Host "  SkipInstall: $SkipInstall" -ForegroundColor DarkGray
Write-Host "  Force      : $Force" -ForegroundColor DarkGray

foreach ($comp in $Components) {
    switch ($comp) {
        "Supervisor"         { Install-Supervisor }
        "InteractiveTerminal" { Install-InteractiveTerminal }
        "Server"             { Install-Server }
        "Dashboard"          { Install-Dashboard }
        "Extension"          { Install-Extension }
        "Container"          { Install-Container }
    }
}

$Elapsed = (Get-Date) - $StartTime
Write-Host ""
Write-Host "Done in $([math]::Round($Elapsed.TotalSeconds, 1))s" -ForegroundColor Magenta
