#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Interactive Installation Wizard for Project Memory MCP.

.DESCRIPTION
    Guides the user through installing Project Memory MCP components to a
    permanent location in their user directories, sets up environment
    variables, and adds the bin directory to the system PATH.
#>

[CmdletBinding()]
param(
    [switch]$NonInteractive,
    [string]$InstallPath,
    [string]$DataPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
$InstallScript = Join-Path $RepoRoot 'install.ps1'

# ──────────────────────────────────────────────────────────────
# UI Helpers
# ──────────────────────────────────────────────────────────────

function Show-Header {
    Clear-Host
    Write-Host "    ____             _           __     __  ___                              " -ForegroundColor DarkCyan
    Write-Host "   / __ \_________  (_)__  _____/ /_   /  |/  /___  ____ ___  ____  _______  __" -ForegroundColor DarkCyan
    Write-Host "  / /_/ / ___/ __ \/ / _ \/ ___/ __/  / /|_/ / _ \/ __ \`__ \/ __ \/ ___/ / / /" -ForegroundColor DarkCyan
    Write-Host " / ____/ /  / /_/ / /  __/ /__/ /_   / /  / /  __/ / / / / / /_/ / /  / /_/ / " -ForegroundColor DarkCyan
    Write-Host "/_/   /_/   \____/ /\___/\___/\__/  /_/  /_/\___/_/ /_/ /_/\____/_/   \__, /  " -ForegroundColor DarkCyan
    Write-Host "              /___/                                                  /____/   " -ForegroundColor DarkCyan
    Write-Host "=========================================================================" -ForegroundColor DarkGray
    Write-Host " INSTALLATION WIZARD" -ForegroundColor White -BackgroundColor DarkCyan
    Write-Host "=========================================================================" -ForegroundColor DarkGray
    Write-Host ""
}

function Write-Step([string]$msg) {
    Write-Host "`n── $msg" -ForegroundColor Cyan
}

function Write-Ok([string]$msg) {
    Write-Host "   ✓ $msg" -ForegroundColor Green
}

function Write-Fail([string]$msg) {
    Write-Host "   ✗ $msg" -ForegroundColor Red
}

function Write-Info([string]$msg) {
    Write-Host "   ℹ $msg" -ForegroundColor Gray
}

# ──────────────────────────────────────────────────────────────
# Logic
# ──────────────────────────────────────────────────────────────

try {
    Show-Header

    # 1. Resolve Install Paths
    if ([string]::IsNullOrWhiteSpace($InstallPath)) {
        $defaultInstall = Join-Path $env:LOCALAPPDATA "ProjectMemory"
        if ($NonInteractive) {
            $InstallPath = $defaultInstall
        } else {
            $input = Read-Host "Installation directory [default: $defaultInstall]"
            $InstallPath = if ([string]::IsNullOrWhiteSpace($input)) { $defaultInstall } else { $input }
        }
    }
    $InstallPath = [System.IO.Path]::GetFullPath($InstallPath)

    if ([string]::IsNullOrWhiteSpace($DataPath)) {
        $defaultData = if ($env:PM_DATA_ROOT) { $env:PM_DATA_ROOT } else { Join-Path $env:APPDATA "ProjectMemory" }
        if ($NonInteractive) {
            $DataPath = $defaultData
        } else {
            $input = Read-Host "Data root directory (PM_DATA_ROOT) [default: $defaultData]"
            $DataPath = if ([string]::IsNullOrWhiteSpace($input)) { $defaultData } else { $input }
        }
    }
    $DataPath = [System.IO.Path]::GetFullPath($DataPath)

    $BinDir = Join-Path $InstallPath "bin"
    $LibDir = Join-Path $InstallPath "lib"

    Write-Info "Install Path: $InstallPath"
    Write-Info "Bin Path    : $BinDir"
    Write-Info "Data Path   : $DataPath"

    # 2. Component Selection
    $Components = @("Supervisor", "InteractiveTerminal", "GuiForms", "Server", "Dashboard", "Extension")
    if (-not $NonInteractive) {
        Write-Host "`nSelect components to install (comma separated, or 'All'):" -ForegroundColor White
        Write-Host "  1. Supervisor (Tray App)"
        Write-Host "  2. Interactive Terminal"
        Write-Host "  3. PM GUI Forms (Approval/Brainstorm)"
        Write-Host "  4. MCP Server"
        Write-Host "  5. Dashboard (Observer)"
        Write-Host "  6. VS Code Extension"
        $input = Read-Host "Selection [default: All]"
        if (-not [string]::IsNullOrWhiteSpace($input) -and $input -ne "All") {
            $selectedIndices = $input -split "," | ForEach-Object { $_.Trim() }
            $newComponents = @()
            foreach ($idx in $selectedIndices) {
                switch ($idx) {
                    "1" { $newComponents += "Supervisor" }
                    "2" { $newComponents += "InteractiveTerminal" }
                    "3" { $newComponents += "GuiForms" }
                    "4" { $newComponents += "Server" }
                    "5" { $newComponents += "Dashboard" }
                    "6" { $newComponents += "Extension" }
                }
            }
            if ($newComponents.Count -gt 0) { $Components = $newComponents }
        }
    }

    # 3. Path & Environment Options
    $AddToPath = $true
    $SetDataRoot = $true
    if (-not $NonInteractive) {
        $input = Read-Host "Add bin directory to PATH? (Y/n)"
        if ($input -match '^(?i)n(?:o)?$') { $AddToPath = $false }

        $input = Read-Host "Set PM_DATA_ROOT environment variable? (Y/n)"
        if ($input -match '^(?i)n(?:o)?$') { $SetDataRoot = $false }
    }

    Write-Step "Preparing build..."
    # Build all selected components using the canonical installer
    # We use -SkipInstall because we will handle the "install" (copying) ourselves
    # except for the VS Code extension which we might want to install via `code` still.
    $InstallFlags = @("-Component", ($Components -join ","), "-SkipInstall")
    if ($Components -contains "Server" -and (Test-Path $DataPath)) {
        # If data path exists, maybe don't force a new database, but initialize it
    }

    Write-Info "Building components from source..."
    & $InstallScript @InstallFlags
    if ($LASTEXITCODE -ne 0) { throw "Build failed." }

    Write-Step "Deploying files to $InstallPath..."
    New-Item -Path $BinDir -ItemType Directory -Force | Out-Null
    New-Item -Path $LibDir -ItemType Directory -Force | Out-Null

    # Helper to copy with Qt dependencies
    function Copy-Binary {
        param([string]$ExeName)
        $sourceExe = Join-Path $RepoRoot "target\release\$ExeName.exe"
        if (Test-Path $sourceExe) {
            Write-Info "Copying $ExeName..."
            Copy-Item $sourceExe $BinDir -Force
            Write-Ok "$ExeName deployed."
            return $true
        } else {
            Write-Fail "$ExeName not found in build output."
            return $false
        }
    }

    if ($Components -contains "Supervisor") { Copy-Binary "supervisor" }
    if ($Components -contains "InteractiveTerminal") { Copy-Binary "interactive-terminal" }
    if ($Components -contains "GuiForms") {
        Copy-Binary "pm-approval-gui"
        Copy-Binary "pm-brainstorm-gui"
    }

    Write-Step "Deploying runtime dependencies..."
    # Copy DLLs and subfolders from target/release to bin (Qt, plugins, etc.)
    Get-ChildItem -Path (Join-Path $RepoRoot "target\release") | Where-Object {
        $_.Extension -eq ".dll" -or $_.PSIsContainer -or $_.Extension -eq ".ico"
    } | ForEach-Object {
        if ($_.PSIsContainer) {
            if ($_.Name -notin @("build", "deps", "incremental", "examples", "native")) {
                Copy-Item $_.FullName $BinDir -Recurse -Force
            }
        } else {
            Copy-Item $_.FullName $BinDir -Force
        }
    }
    Write-Ok "Runtime dependencies deployed."

    if ($Components -contains "Server") {
        Write-Info "Deploying Server..."
        $serverLib = Join-Path $LibDir "server"
        New-Item -Path $serverLib -ItemType Directory -Force | Out-Null
        Copy-Item (Join-Path $RepoRoot "server\dist") $serverLib -Recurse -Force
        Copy-Item (Join-Path $RepoRoot "server\package.json") $serverLib -Force
        # Note: node_modules are huge, usually we'd expect them to be there or run npm install
        # For a "portable" install, we might want to copy node_modules too, but it's risky
        # We'll assume the user has node and we'll copy node_modules for now to make it "runtime ready"
        if (Test-Path (Join-Path $RepoRoot "server\node_modules")) {
            Write-Info "Copying server dependencies (this may take a while)..."
            Copy-Item (Join-Path $RepoRoot "server\node_modules") $serverLib -Recurse -Force
        }
        Write-Ok "Server deployed to $serverLib."
    }

    if ($Components -contains "Dashboard") {
        Write-Info "Deploying Dashboard..."
        $dashLib = Join-Path $LibDir "dashboard"
        New-Item -Path $dashLib -ItemType Directory -Force | Out-Null
        Copy-Item (Join-Path $RepoRoot "dashboard\dist") $dashLib -Recurse -Force

        $dashServerLib = Join-Path $dashLib "server"
        New-Item -Path $dashServerLib -ItemType Directory -Force | Out-Null
        Copy-Item (Join-Path $RepoRoot "dashboard\server\dist") $dashServerLib -Recurse -Force
        Copy-Item (Join-Path $RepoRoot "dashboard\server\package.json") $dashServerLib -Force
        if (Test-Path (Join-Path $RepoRoot "dashboard\server\node_modules")) {
            Copy-Item (Join-Path $RepoRoot "dashboard\server\node_modules") $dashServerLib -Recurse -Force
        }
        Write-Ok "Dashboard deployed to $dashLib."
    }

    if ($Components -contains "Extension") {
        Write-Info "Locating extension package..."
        $extDir = Join-Path $RepoRoot "vscode-extension"
        $Vsix = Get-ChildItem -Path $extDir -Filter "*.vsix" |
                Sort-Object LastWriteTime -Descending |
                Select-Object -First 1
        if ($Vsix) {
            $extLib = Join-Path $LibDir "extension"
            New-Item -Path $extLib -ItemType Directory -Force | Out-Null
            Copy-Item $Vsix.FullName $extLib -Force
            Write-Ok "Extension package saved to $extLib."

            if (-not $NonInteractive) {
                $ans = Read-Host "Install extension to VS Code now? (Y/n)"
                if ($ans -notmatch '^(?i)n(?:o)?$') {
                    & {
                        $ErrorActionPreference = 'Continue'
                        code --install-extension $Vsix.FullName
                    }
                    Write-Ok "Extension installed to VS Code."
                }
            }
        }
    }

    Write-Step "Environment Setup..."

    if ($SetDataRoot) {
        Write-Info "Setting PM_DATA_ROOT to $DataPath..."
        [Environment]::SetEnvironmentVariable("PM_DATA_ROOT", $DataPath, "User")
        $env:PM_DATA_ROOT = $DataPath
        Write-Ok "PM_DATA_ROOT set."
    }

    if ($AddToPath) {
        Write-Info "Adding $BinDir to PATH..."
        $oldPath = [Environment]::GetEnvironmentVariable("PATH", "User")
        if ($oldPath -notlike "*$BinDir*") {
            $newPath = "$oldPath;$BinDir"
            [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
            Write-Ok "PATH updated."
        } else {
            Write-Ok "Bin directory already in PATH."
        }
    }

    Write-Step "Verification..."
    if (Test-Path (Join-Path $BinDir "supervisor.exe")) {
        Write-Ok "Supervisor executable verified at $BinDir\supervisor.exe"
    }

    Write-Host "`n=========================================================================" -ForegroundColor DarkGray
    Write-Host " INSTALLATION COMPLETE" -ForegroundColor Green
    Write-Host "=========================================================================" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host " Project Memory MCP has been installed to:" -ForegroundColor White
    Write-Host "   $InstallPath" -ForegroundColor Cyan
    Write-Host ""
    Write-Host " To start the system:" -ForegroundColor White
    Write-Host "   1. Open a NEW terminal to refresh environment variables." -ForegroundColor Gray
    Write-Host "   2. Run 'supervisor' to start the tray application." -ForegroundColor Gray
    Write-Host "   3. Or run the server manually from:" -ForegroundColor Gray
    Write-Host "      node $LibDir\server\dist\index.js" -ForegroundColor Gray
    Write-Host ""
    Write-Host " Data and logs are located at:" -ForegroundColor White
    Write-Host "   $DataPath" -ForegroundColor Cyan
    Write-Host ""

} catch {
    Write-Fail "Installation failed: $($_.Exception.Message)"
    exit 1
}
