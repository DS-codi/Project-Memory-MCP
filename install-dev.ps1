#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Install script for the Project Memory MCP **Dev** build.

.DESCRIPTION
    Builds all components of the Project Memory MCP system for dev/testing
    purposes. The key difference from install.ps1:

      - The VS Code extension is NEVER installed globally.
      - Extension is compiled for use via F5 Extension Development Host only.
      - All extension identifiers are namespaced to "Dev" variants so they
        cannot collide with the stable production extension.

    Workflow after running this script:
      1. Boot the Supervisor (loads MCP server, dashboard, interactive terminal)
      2. Open the vscode-extension/ folder in VS Code
      3. Press F5 → "Run Dev Extension (Project Root)"
      4. A second VS Code window opens with the dev extension loaded
      5. The stable extension in your main VS Code is unaffected

.PARAMETER Component
    Which component(s) to build. Accepts an array.
    Valid values: Server, Extension, Dashboard, Supervisor, InteractiveTerminal, GuiForms, All
    Default: All

.PARAMETER SkipRust
    Skip all Rust-based components (Supervisor, InteractiveTerminal, GuiForms).
    Useful when iterating on JS/TS changes only.

.PARAMETER Force
    Force rebuild even if outputs are up to date.

.PARAMETER LaunchDev
    After building, automatically launch a VS Code dev instance with the
    extension loaded via --extensionDevelopmentPath.

.PARAMETER WorkspacePath
    When -LaunchDev is set, open this path in the dev VS Code instance.
    Defaults to the project root.

.EXAMPLE
    # Build everything for dev
    .\install-dev.ps1

.EXAMPLE
    # Build only server + extension, then launch dev VS Code
    .\install-dev.ps1 -Component Server, Extension -LaunchDev

.EXAMPLE
    # Skip Rust builds (server + dashboard + extension only)
    .\install-dev.ps1 -SkipRust

.EXAMPLE
    # Extension only, then launch dev instance against a specific workspace
    .\install-dev.ps1 -Component Extension -LaunchDev -WorkspacePath "C:\MyProject"
#>

[CmdletBinding()]
param(
    [ValidateSet("Server", "Extension", "Dashboard", "Supervisor", "InteractiveTerminal", "GuiForms", "All")]
    [string[]]$Component = @("All"),

    [switch]$SkipRust,
    [switch]$Force,
    [switch]$LaunchDev,
    [string]$WorkspacePath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
# Initialize $LASTEXITCODE so strict-mode doesn't throw before any native
# process has run. PowerShell strict mode treats unset automatic variables
# as errors even though $LASTEXITCODE is normally auto-initialized to 0.
$LASTEXITCODE = 0

$Root = $PSScriptRoot

# Normalise component list
if ($Component -contains "All") {
    if ($SkipRust) {
        $Components = @("Server", "Dashboard", "Extension")
    } else {
        $Components = @("Supervisor", "GuiForms", "InteractiveTerminal", "Server", "Dashboard", "Extension")
    }
} else {
    $Components = $Component
    if ($SkipRust) {
        $Components = $Components | Where-Object { $_ -notin @("Supervisor", "InteractiveTerminal", "GuiForms") }
    }
}

# ──────────────────────────────────────────────────────────────
# Helpers (subset from install.ps1)
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
# Delegate Rust builds to install.ps1
# ──────────────────────────────────────────────────────────────

$MainInstall = Join-Path $Root "install.ps1"

function Install-RustComponent([string]$Name) {
    if (-not (Test-Path $MainInstall)) {
        Write-Fail "install.ps1 not found at $MainInstall — cannot build $Name"
        exit 1
    }
    if ($Force) {
        & $MainInstall -Component $Name -SkipInstall -Force
    } else {
        & $MainInstall -Component $Name -SkipInstall
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "$Name build failed"
        exit $LASTEXITCODE
    }
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
# Dashboard
# ──────────────────────────────────────────────────────────────

function Install-Dashboard {
    Write-Step "Dashboard (Dev — ports 3011/3012)"
    $DashDir = Join-Path $Root "dashboard"

    # Bake dev-specific VITE env vars into the build so the frontend connects to
    # the dev dashboard server (3011/3012) instead of the stable one (3001/3002).
    $env:VITE_API_URL = "http://localhost:3011"
    $env:VITE_WS_URL  = "ws://localhost:3012"

    Push-Location $DashDir
    try {
        Invoke-Checked "npx vite build" { npx vite build 2>&1 | Write-Host }
        Write-Ok "Dashboard built → $DashDir\dist (dev ports: HTTP 3011, WS 3012)"
    } finally {
        Pop-Location
        # Always clear so env vars don't bleed into subsequent steps.
        Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
        Remove-Item Env:VITE_WS_URL  -ErrorAction SilentlyContinue
    }
}

# ──────────────────────────────────────────────────────────────
# VS Code Extension (DEV — compile only, never install globally)
# ──────────────────────────────────────────────────────────────

function Install-Extension {
    Write-Step "VS Code Extension (Dev — compile only)"
    $ExtDir = Join-Path $Root "vscode-extension"

    Push-Location $ExtDir
    try {
        Invoke-Checked "npm install" { npm install 2>&1 | Write-Host }
        Invoke-Checked "npm run compile" { npm run compile 2>&1 | Write-Host }

        $outFile = Join-Path $ExtDir "out\extension.js"
        if (Test-Path $outFile) {
            $size = [math]::Round((Get-Item $outFile).Length / 1024)
            Write-Ok "Extension compiled → out/extension.js (${size}KB)"
        } else {
            Write-Fail "Compiled output not found at $outFile"
            exit 1
        }

        Write-Host ""
        Write-Host "   Extension is ready for F5 dev host launch." -ForegroundColor Yellow
        Write-Host "   It will NOT be installed globally." -ForegroundColor DarkGray
        Write-Host "   Open vscode-extension/ in VS Code → F5 → 'Run Dev Extension'" -ForegroundColor DarkGray
    } finally {
        Pop-Location
    }
}

# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────

$StartTime = Get-Date
Write-Host ""
Write-Host "Project Memory MCP — Dev Install" -ForegroundColor Magenta
Write-Host "  Components: $($Components -join ', ')" -ForegroundColor DarkGray
Write-Host "  SkipRust  : $SkipRust" -ForegroundColor DarkGray
Write-Host "  Force     : $Force" -ForegroundColor DarkGray
Write-Host "  LaunchDev : $LaunchDev" -ForegroundColor DarkGray

foreach ($comp in $Components) {
    switch ($comp) {
        "Supervisor"          { Install-RustComponent "Supervisor" }
        "GuiForms"            { Install-RustComponent "GuiForms" }
        "InteractiveTerminal" { Install-RustComponent "InteractiveTerminal" }
        "Server"              { Install-Server }
        "Dashboard"           { Install-Dashboard }
        "Extension"           { Install-Extension }
    }
}

$Elapsed = (Get-Date) - $StartTime
Write-Host ""
Write-Host "Done in $([math]::Round($Elapsed.TotalSeconds, 1))s" -ForegroundColor Magenta

# ──────────────────────────────────────────────────────────────
# Optional: Launch dev VS Code instance
# ──────────────────────────────────────────────────────────────

if ($LaunchDev) {
    Write-Host ""

    # Kill any existing Extension Development Host windows for this extension path.
    # VS Code source (windowsMainService.ts) reuses an existing dev host window when
    # --extensionDevelopmentPath matches, ignoring --folder-uri entirely. We must close
    # the old window first so the new launch creates a fresh one with our target folder.
    Write-Host ""
    Write-Step "Closing any existing Extension Development Host window"
    $ExtDirNorm = (Join-Path $Root "vscode-extension").ToLower().TrimEnd('\')
    $devHostProcs = @(Get-CimInstance Win32_Process -Filter "Name='Code.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine.ToLower() -like "*extensiondevelopmentpath*" })
    if ($devHostProcs.Count -gt 0) {
        foreach ($proc in $devHostProcs) {
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 1000
        Write-Ok "Closed $($devHostProcs.Count) existing dev host window(s)"
    } else {
        Write-Host "   No existing dev host window found" -ForegroundColor DarkGray
    }

    Write-Host ""
    Write-Step "Starting Supervisor"

    $SupervisorExe = Join-Path $Root "target\release\supervisor.exe"
    if (-not (Test-Path $SupervisorExe)) {
        Write-Fail "supervisor.exe not found at $SupervisorExe"
        Write-Host "   Run .\install-dev.ps1 -Component Supervisor first." -ForegroundColor Yellow
        exit 1
    }

    $alreadyRunning = @(Get-Process -Name 'supervisor' -ErrorAction SilentlyContinue)
    if ($alreadyRunning.Count -gt 0) {
        Write-Ok "Supervisor already running (PID $($alreadyRunning[0].Id)) — skipping start"
        Write-Host "   NOTE: To apply --dev port offsets (3011/3012), stop the" -ForegroundColor Yellow
        Write-Host "   running supervisor first: Stop-Process -Name supervisor -Force" -ForegroundColor Yellow
        Write-Host "   Then re-run this script." -ForegroundColor Yellow
    } else {
        # Launch supervisor detached so it doesn't die when this script exits.
        # --dev offsets the dashboard ports by +10 (3001→3011, 3002→3012) so the
        # dev instance does not conflict with the stable Podman container.
        # If another instance just started between this check and the launch, the
        # new process will detect the Win32 mutex and self-exit cleanly (exit 1).
        Start-Process -FilePath $SupervisorExe -ArgumentList @("--dev") -WorkingDirectory $Root -WindowStyle Hidden
        Start-Sleep -Milliseconds 800   # give it a moment to acquire the mutex + port

        $started = @(Get-Process -Name 'supervisor' -ErrorAction SilentlyContinue)
        if ($started.Count -gt 0) {
            Write-Ok "Supervisor started (PID $($started[0].Id))"
        } else {
            Write-Fail "Supervisor did not appear to start — check target\release\supervisor.exe manually"
        }
    }

    Write-Host ""
    Write-Step "Launching VS Code Dev Instance"

    $ExtDir = Join-Path $Root "vscode-extension"

    if ($WorkspacePath) {
        $resolved = Resolve-Path $WorkspacePath -ErrorAction Stop
        $folderToOpen = $resolved.Path
    } else {
        $folderToOpen = $Root
    }

    # Pass the .code-workspace file as a positional argument.
    # Using --folder-uri risks cmd.exe mangling the URI through the code.cmd wrapper.
    # A positional path arg (cli._) is simpler, avoids URI encoding, and is not
    # subject to the lastPluginDevelopmentHostWindow fallback in windowsMainService.ts
    # because cliArgs.length > 0 suppresses that code path.
    $WorkspaceFile = Join-Path $Root "project-memory-dev.code-workspace"
    $codeArgs = @(
        $WorkspaceFile,
        "--extensionDevelopmentPath=$ExtDir",
        "--profile=ProjectMemoryDev"
    )

    Write-Host "   Workspace: $WorkspaceFile" -ForegroundColor DarkGray
    Write-Host "   Profile  : ProjectMemoryDev" -ForegroundColor DarkGray
    Write-Host "   Extension: $ExtDir" -ForegroundColor DarkGray
    Write-Host ""

    code @codeArgs
    Write-Ok "VS Code dev instance launched"
}
