#!/usr/bin/env pwsh
#Requires -Version 7
<#
.SYNOPSIS
    Launches Project Memory Supervisor after writing a fresh config file.

.DESCRIPTION
    Writes `supervisor.toml` to %APPDATA%\ProjectMemory\ with the correct ports
    expected by the VS Code extension, then starts the supervisor binary.

    Default ports written:
      - MCP proxy      : 3457
      - Interactive Terminal : 3458
      - Dashboard      : 3459

    Default launch behaviour:
      - MCP server             : enabled
      - Dashboard              : enabled
      - Brainstorm GUI         : enabled
      - Approval GUI           : enabled
      - Interactive Terminal   : disabled

.PARAMETER NoMcp
    Disable MCP startup.

.PARAMETER NoDashboard
    Disable Dashboard startup.

.PARAMETER NoBrainstormGui
    Disable Brainstorm GUI startup.

.PARAMETER NoApprovalGui
    Disable Approval GUI startup.

.PARAMETER IncludeInteractiveTerminal
    Enable Interactive Terminal startup (disabled by default).

.PARAMETER AutoKillExisting
    Automatically kill detected running component processes (no prompt).

.PARAMETER SkipKillPrompt
    Do not prompt and do not kill detected running component processes.

.PARAMETER WriteConfigOnly
    Write supervisor.toml and exit without launching the supervisor.

.EXAMPLE
    .\launch-supervisor.ps1

.EXAMPLE
    .\launch-supervisor.ps1 -NoDashboard

.EXAMPLE
    .\launch-supervisor.ps1 -WriteConfigOnly

.EXAMPLE
    .\launch-supervisor.ps1 -IncludeInteractiveTerminal -AutoKillExisting
#>

[CmdletBinding()]
param(
    [switch]$NoMcp,
    [switch]$NoDashboard,
    [switch]$NoBrainstormGui,
    [switch]$NoApprovalGui,
    [switch]$IncludeInteractiveTerminal,
    [switch]$AutoKillExisting,
    [switch]$SkipKillPrompt,
    [switch]$WriteConfigOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
    Write-Host "`n── $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "   ✓ $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "   ⚠ $Message" -ForegroundColor Yellow
}

function Get-RunningComponentProcesses {
    param([string]$WorkspaceRoot)

    $result        = [System.Collections.Generic.List[object]]::new()
    $serverNeedle  = (Join-Path $WorkspaceRoot 'server\dist\index.js').ToLowerInvariant()
    $dashNeedle    = (Join-Path $WorkspaceRoot 'dashboard\server\dist\index.js').ToLowerInvariant()
    $wsNorm        = $WorkspaceRoot.ToLowerInvariant() -replace '/', '\'

    foreach ($proc in @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
        $name = [string]$proc.Name
        if (-not $name) { continue }

        $nl  = $name.ToLowerInvariant()
        $cmd = [string]$proc.CommandLine
        $cl  = if ($cmd) { $cmd.ToLowerInvariant() -replace '/', '\' } else { '' }
        $exe = [string]$proc.ExecutablePath
        $pid = [int]$proc.ProcessId

        if ($nl -in 'supervisor.exe', 'supervisor') {
            $result.Add([pscustomobject]@{ Component = 'Supervisor';           ProcessName = $name; PID = $pid; Detail = $exe })
        }
        elseif ($nl -in 'pm-brainstorm-gui.exe', 'pm-brainstorm-gui') {
            $result.Add([pscustomobject]@{ Component = 'Brainstorm GUI';       ProcessName = $name; PID = $pid; Detail = $exe })
        }
        elseif ($nl -in 'pm-approval-gui.exe', 'pm-approval-gui') {
            $result.Add([pscustomobject]@{ Component = 'Approval GUI';         ProcessName = $name; PID = $pid; Detail = $exe })
        }
        elseif ($nl -in 'interactive-terminal.exe', 'interactive-terminal') {
            $result.Add([pscustomobject]@{ Component = 'Interactive Terminal'; ProcessName = $name; PID = $pid; Detail = $exe })
        }
        elseif ($nl -in 'node.exe', 'node') {
            if ($cl -and ($cl.Contains($serverNeedle) -or $cl.Contains($dashNeedle))) {
                $component = if ($cl.Contains($serverNeedle)) { 'MCP Server (node)' } else { 'Dashboard Server (node)' }
                $result.Add([pscustomobject]@{ Component = $component;         ProcessName = $name; PID = $pid; Detail = $cmd })
            }
            elseif ($cl -and $cl.Contains($wsNorm)) {
                $result.Add([pscustomobject]@{ Component = 'Node (workspace)'; ProcessName = $name; PID = $pid; Detail = $cmd })
            }
        }
    }

    return @($result | Sort-Object PID -Unique)
}

function Sync-VscodeProjectMemoryConfig {
    <#
    .SYNOPSIS
        Syncs VS Code user-level config files so they match the supervisor port.
        Updates %APPDATA%\Code\User\mcp.json (VS Code built-in MCP client)
        and %APPDATA%\Code\User\settings.json (extension settings).
    #>
    param(
        [Parameter(Mandatory)][int]$McpPort,
        [Parameter(Mandatory)][int]$DashboardPort
    )

    # --- mcp.json: VS Code built-in MCP client ---
    $mcpJsonPath = Join-Path $env:APPDATA 'Code\User\mcp.json'
    if (Test-Path $mcpJsonPath) {
        $raw = Get-Content $mcpJsonPath -Raw
        $urlPattern = '("project-memory"\s*:\s*\{[^}]*"url"\s*:\s*"http://localhost:)(\d+)(/mcp")'
        if ($raw -match $urlPattern) {
            $currentPort = [int]$Matches[2]
            if ($currentPort -ne $McpPort) {
                $updated = [regex]::Replace($raw, $urlPattern, "`${1}${McpPort}`${3}")
                Set-Content -Path $mcpJsonPath -Value $updated -NoNewline -Encoding UTF8
                Write-Host "   Updated mcp.json: project-memory port $currentPort → $McpPort" -ForegroundColor Green
            }
        }
    }

    # --- settings.json: extension settings ---
    $settingsPath = Join-Path $env:APPDATA 'Code\User\settings.json'
    if (Test-Path $settingsPath) {
        $raw = Get-Content $settingsPath -Raw
        $changed = $false

        $mcpPattern  = '"projectMemory\.mcpPort"\s*:\s*(?!{0}\b)\d+' -f $McpPort
        $dashPattern = '"projectMemory\.serverPort"\s*:\s*(?!{0}\b)\d+' -f $DashboardPort

        if ($raw -match $mcpPattern) {
            $raw     = [regex]::Replace($raw, $mcpPattern, "`"projectMemory.mcpPort`": $McpPort")
            $changed = $true
        }
        if ($raw -match $dashPattern) {
            $raw     = [regex]::Replace($raw, $dashPattern, "`"projectMemory.serverPort`": $DashboardPort")
            $changed = $true
        }

        if ($changed) {
            Set-Content -Path $settingsPath -Value $raw -NoNewline -Encoding UTF8
            Write-Host "   Updated settings.json: projectMemory ports synced to MCP=$McpPort dashboard=$DashboardPort" -ForegroundColor Green
        }
    }
}

function New-SupervisorToml {
    param(
        [string]$WorkspaceRoot,
        [bool]$EnableMcp                = $true,
        [bool]$EnableDashboard          = $true,
        [bool]$EnableBrainstorm         = $true,
        [bool]$EnableApproval           = $true,
        [bool]$EnableInteractiveTerminal = $false
    )

    $appDataDir = Join-Path $env:APPDATA 'ProjectMemory'
    New-Item -ItemType Directory -Path $appDataDir -Force | Out-Null

    $mcpPort       = 3457
    $dashboardPort = 3459
    $configPath    = Join-Path $appDataDir 'supervisor.toml'
    $serverDir     = Join-Path $WorkspaceRoot 'server'
    $dashboardDir  = Join-Path $WorkspaceRoot 'dashboard\server'
    $dataDir       = Join-Path $WorkspaceRoot 'data'
    $agentsDir     = Join-Path $WorkspaceRoot 'agents'
    $terminalExe   = Join-Path $WorkspaceRoot 'interactive-terminal\target\release\interactive-terminal.exe'
    $brainstormExe = Join-Path $WorkspaceRoot 'target\release\pm-brainstorm-gui.exe'
    $approvalExe   = Join-Path $WorkspaceRoot 'target\release\pm-approval-gui.exe'
    $timestamp     = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

    # Boolean values as TOML literals (unquoted `true` / `false`)
    $mcpEnabled   = ($EnableMcp).ToString().ToLower()
    $dashEnabled  = ($EnableDashboard).ToString().ToLower()
    $bsEnabled    = ($EnableBrainstorm).ToString().ToLower()
    $apprEnabled  = ($EnableApproval).ToString().ToLower()
    $termEnabled  = ($EnableInteractiveTerminal).ToString().ToLower()

    # Paths use TOML single-quoted strings (no backslash escaping needed).
    # PowerShell expands $variables inside the @"..."@ heredoc, so $serverDir etc.
    # are substituted before the single quotes become TOML literal-string delimiters.
    $content = @"
# Project Memory MCP — Supervisor Configuration
# Auto-generated by launch-supervisor.ps1 on $timestamp
# Full reference: supervisor/supervisor.example.toml

[supervisor]
log_level          = "info"
control_transport  = "named_pipe"
control_pipe       = "\\\\.\\pipe\\project-memory-supervisor"

[mcp]
enabled            = $mcpEnabled
port               = $mcpPort
backend            = "node"

[mcp.node]
command            = "node"
args               = ["dist/index.js", "--transport", "streamable-http", "--port", "$mcpPort"]
working_dir        = '$serverDir'

[mcp.node.env]
MBS_DATA_ROOT   = '$dataDir'
MBS_AGENTS_ROOT = '$agentsDir'

[interactive_terminal]
enabled            = $termEnabled
port               = 3458
command            = '$terminalExe'

[brainstorm_gui]
enabled            = $bsEnabled
command            = '$brainstormExe'
timeout_seconds    = 300
window_width       = 720
window_height      = 640

[approval_gui]
enabled            = $apprEnabled
command            = '$approvalExe'
timeout_seconds    = 60
window_width       = 480
window_height      = 320
always_on_top      = true

[dashboard]
enabled            = $dashEnabled
port               = $dashboardPort
requires_mcp       = true
command            = "node"
args               = ["dist/index.js"]
working_dir        = '$dashboardDir'

[dashboard.env]
PORT               = "$dashboardPort"

[approval]
default_countdown_seconds = 60
default_on_timeout        = "approve"
"@

    Set-Content -Path $configPath -Value $content -Encoding UTF8

    # Keep VS Code config files in sync with the ports just written
    try {
        Sync-VscodeProjectMemoryConfig -McpPort $mcpPort -DashboardPort $dashboardPort
    } catch {
        Write-Host "   [warn] Could not sync VS Code config files: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    return $configPath
}

# ── Main ───────────────────────────────────────────────────────────────────────

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$enableMcp        = -not $NoMcp
$enableDashboard  = -not $NoDashboard
$enableBrainstorm = -not $NoBrainstormGui
$enableApproval   = -not $NoApprovalGui
$enableInteractive = [bool]$IncludeInteractiveTerminal

Write-Host 'Project Memory MCP — Launch Supervisor' -ForegroundColor Magenta

Write-Step 'Writing supervisor configuration'
$configPath = New-SupervisorToml `
    -WorkspaceRoot $root `
    -EnableMcp $enableMcp `
    -EnableDashboard $enableDashboard `
    -EnableBrainstorm $enableBrainstorm `
    -EnableApproval $enableApproval `
    -EnableInteractiveTerminal $enableInteractive
Write-Ok "Config written: $configPath"

if ($WriteConfigOnly) {
    Write-Host "   (-WriteConfigOnly) Config updated; skipping launch." -ForegroundColor DarkGray
    return
}

$supervisorExe = Join-Path $root 'target\release\supervisor.exe'
if (-not (Test-Path $supervisorExe)) {
    throw "supervisor.exe not found at $supervisorExe`nBuild Supervisor first: .\install.ps1 -Component Supervisor"
}

Write-Host "  Supervisor         : $supervisorExe" -ForegroundColor DarkGray
Write-Host "  MCP                : $enableMcp" -ForegroundColor DarkGray
Write-Host "  Dashboard          : $enableDashboard" -ForegroundColor DarkGray
Write-Host "  Brainstorm GUI     : $enableBrainstorm" -ForegroundColor DarkGray
Write-Host "  Approval GUI       : $enableApproval" -ForegroundColor DarkGray
Write-Host "  InteractiveTerminal: $enableInteractive" -ForegroundColor DarkGray

$running = @(Get-RunningComponentProcesses -WorkspaceRoot $root)
if ($running.Count -gt 0) {
    Write-Step 'Detected running component processes'
    $running | Select-Object Component, ProcessName, PID, Detail | Format-Table -AutoSize

    $killExisting = $false
    if ($AutoKillExisting) {
        $killExisting = $true
    }
    elseif (-not $SkipKillPrompt) {
        $response = Read-Host 'Kill these processes before launching supervisor? (Y/N)'
        $killExisting = $response -match '^(?i)y(?:es)?$'
    }

    if ($killExisting) {
        Write-Step 'Stopping detected processes'
        foreach ($proc in $running) {
            try {
                Stop-Process -Id $proc.PID -Force -ErrorAction Stop
                Write-Ok "Stopped $($proc.ProcessName) (PID $($proc.PID))"
            }
            catch {
                Write-Warn "Could not stop $($proc.ProcessName) (PID $($proc.PID)): $($_.Exception.Message)"
            }
        }
        Start-Sleep -Milliseconds 600
    }
    else {
        Write-Warn 'Leaving existing processes running.'
    }
}

Write-Step 'Launching supervisor'
Write-Host "   Config: $configPath" -ForegroundColor DarkGray

$process = Start-Process `
    -FilePath $supervisorExe `
    -ArgumentList @('--config', $configPath) `
    -WorkingDirectory (Split-Path -Parent $supervisorExe) `
    -PassThru

Start-Sleep -Seconds 1

if ($process.HasExited) {
    throw "Supervisor exited early (exitCode=$($process.ExitCode))."
}

Write-Ok "Supervisor launched (PID $($process.Id))"

# ── Wait for ports manifest and sync VS Code config ────────────────────────
Write-Step 'Waiting for supervisor ports manifest'
$portsJsonPath = Join-Path $env:APPDATA 'ProjectMemory\ports.json'
$manifestTimeout = 15  # seconds
$manifestFound   = $false
$elapsed         = 0
while ($elapsed -lt $manifestTimeout) {
    if (Test-Path $portsJsonPath) {
        $manifestFound = $true
        break
    }
    Start-Sleep -Milliseconds 500
    $elapsed += 0.5
}

if ($manifestFound) {
    try {
        $manifest = Get-Content -Raw -Path $portsJsonPath | ConvertFrom-Json
        $liveMcpPort       = [int]$manifest.services.mcp_proxy
        $liveDashboardPort = [int]$manifest.services.dashboard
        Write-Ok "Ports manifest read: MCP=$liveMcpPort  Dashboard=$liveDashboardPort"
        Sync-VscodeProjectMemoryConfig -McpPort $liveMcpPort -DashboardPort $liveDashboardPort
    } catch {
        Write-Warn "Could not parse ports manifest: $($_.Exception.Message)"
    }
} else {
    Write-Warn "Ports manifest not found within ${manifestTimeout}s — VS Code config not updated."
}
