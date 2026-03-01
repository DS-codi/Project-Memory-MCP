#!/usr/bin/env pwsh
#Requires -Version 7
<#
.SYNOPSIS
    Launches Project Memory Supervisor with startup component controls.

.DESCRIPTION
    Starts `target\release\supervisor.exe` using a generated config file.

    Default launch behaviour:
      - MCP server: enabled
      - Dashboard: enabled
      - Brainstorm GUI: enabled
      - Approval GUI: enabled
      - Interactive Terminal: disabled

    Before launch, the script scans for already-running related processes and
    asks whether to kill them.

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

.EXAMPLE
    .\launch-supervisor.ps1

.EXAMPLE
    .\launch-supervisor.ps1 -NoDashboard

.EXAMPLE
    .\launch-supervisor.ps1 -NoMcp -NoDashboard -NoApprovalGui

.EXAMPLE
    .\launch-supervisor.ps1 -IncludeInteractiveTerminal
#>

[CmdletBinding()]
param(
    [switch]$NoMcp,
    [switch]$NoDashboard,
    [switch]$NoBrainstormGui,
    [switch]$NoApprovalGui,
    [switch]$IncludeInteractiveTerminal,
    [switch]$AutoKillExisting,
    [switch]$SkipKillPrompt
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

function To-ConfigPathString([string]$PathValue) {
    return ($PathValue -replace '\\', '\\\\')
}

function Resolve-NodeCommandPath {
    try {
        $nodeCmd = Get-Command node -CommandType Application -ErrorAction Stop
        if ($nodeCmd -and $nodeCmd.Source) {
            return [string]$nodeCmd.Source
        }
    } catch {
        # Fall back to PATH lookup by process creation if explicit resolution fails.
    }

    return 'node'
}

function Get-RunningComponentProcesses {
    param([string]$WorkspaceRoot)

    $matches = [System.Collections.Generic.List[object]]::new()

    $workspaceNorm = ($WorkspaceRoot.ToLowerInvariant() -replace '/', '\\')
    $serverNeedle = (Join-Path $WorkspaceRoot 'server\dist\server.js').ToLowerInvariant()
    $dashboardNeedle = (Join-Path $WorkspaceRoot 'dashboard\server\dist\index.js').ToLowerInvariant()

    $cimProcs = @(Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue)

    foreach ($proc in $cimProcs) {
        $name = [string]$proc.Name
        $processId = [int]$proc.ProcessId
        $cmd = [string]$proc.CommandLine
        $exe = [string]$proc.ExecutablePath

        if (-not $name) { continue }

        $nameLower = $name.ToLowerInvariant()
        $cmdLower = if ($cmd) { $cmd.ToLowerInvariant() -replace '/', '\\' } else { '' }
        $exeLower = if ($exe) { $exe.ToLowerInvariant() -replace '/', '\\' } else { '' }

        if ($nameLower -eq 'supervisor.exe' -or $nameLower -eq 'supervisor') {
            $matches.Add([pscustomobject]@{ Component = 'Supervisor'; ProcessName = $name; PID = $processId; Detail = $exe })
            continue
        }

        if ($nameLower -eq 'pm-brainstorm-gui.exe' -or $nameLower -eq 'pm-brainstorm-gui') {
            $matches.Add([pscustomobject]@{ Component = 'Brainstorm GUI'; ProcessName = $name; PID = $processId; Detail = $exe })
            continue
        }

        if ($nameLower -eq 'pm-approval-gui.exe' -or $nameLower -eq 'pm-approval-gui') {
            $matches.Add([pscustomobject]@{ Component = 'Approval GUI'; ProcessName = $name; PID = $processId; Detail = $exe })
            continue
        }

        if ($nameLower -eq 'interactive-terminal.exe' -or $nameLower -eq 'interactive-terminal') {
            $matches.Add([pscustomobject]@{ Component = 'Interactive Terminal'; ProcessName = $name; PID = $processId; Detail = $exe })
            continue
        }

        if ($nameLower -eq 'node.exe' -or $nameLower -eq 'node') {
            if ($cmdLower -and (($cmdLower.Contains($serverNeedle)) -or ($cmdLower.Contains($dashboardNeedle)))) {
                $componentName = if ($cmdLower.Contains($serverNeedle)) { 'MCP Server (node)' } else { 'Dashboard Server (node)' }
                $matches.Add([pscustomobject]@{ Component = $componentName; ProcessName = $name; PID = $processId; Detail = $cmd })
                continue
            }

            if ($cmdLower -and $cmdLower.Contains($workspaceNorm)) {
                $matches.Add([pscustomobject]@{ Component = 'Node (workspace-related)'; ProcessName = $name; PID = $processId; Detail = $cmd })
                continue
            }
        }
    }

    return @($matches | Sort-Object PID -Unique)
}

function New-LaunchConfig {
    param(
        [string]$WorkspaceRoot,
        [bool]$EnableMcp,
        [bool]$EnableDashboard,
        [bool]$EnableBrainstorm,
        [bool]$EnableApproval,
        [bool]$EnableInteractiveTerminal
    )

    $appDataDir = Join-Path $env:APPDATA 'ProjectMemory'
    New-Item -ItemType Directory -Path $appDataDir -Force | Out-Null

    $configPath = Join-Path $appDataDir 'supervisor.launch.toml'

    $serverDir = To-ConfigPathString (Join-Path $WorkspaceRoot 'server')
    $dashboardServerDir = To-ConfigPathString (Join-Path $WorkspaceRoot 'dashboard\server')
    $terminalExe = To-ConfigPathString (Join-Path $WorkspaceRoot 'interactive-terminal\target\release\interactive-terminal.exe')
    $brainstormExe = To-ConfigPathString (Join-Path $WorkspaceRoot 'target\release\pm-brainstorm-gui.exe')
    $approvalExe = To-ConfigPathString (Join-Path $WorkspaceRoot 'target\release\pm-approval-gui.exe')
    $nodeCommand = To-ConfigPathString (Resolve-NodeCommandPath)

    $toml = @"
[supervisor]
log_level = "info"
control_transport = "named_pipe"
control_pipe = "\\\\.\\pipe\\project-memory-supervisor"
control_tcp_port = 45470

[mcp]
enabled = $($EnableMcp.ToString().ToLowerInvariant())
port = 3457
backend = "node"

[mcp.node]
command = "$nodeCommand"
args = ["dist/server.js"]
working_dir = "$serverDir"

[interactive_terminal]
enabled = $($EnableInteractiveTerminal.ToString().ToLowerInvariant())
port = 3458
command = "$terminalExe"

[dashboard]
enabled = $($EnableDashboard.ToString().ToLowerInvariant())
port = 3459
requires_mcp = true
command = "$nodeCommand"
args = ["dist/index.js"]
working_dir = "$dashboardServerDir"

[brainstorm_gui]
enabled = $($EnableBrainstorm.ToString().ToLowerInvariant())
command = "$brainstormExe"
timeout_seconds = 300
window_width = 720
window_height = 640
always_on_top = false

[approval_gui]
enabled = $($EnableApproval.ToString().ToLowerInvariant())
command = "$approvalExe"
timeout_seconds = 60
window_width = 480
window_height = 320
always_on_top = true
"@

    Set-Content -Path $configPath -Value $toml -Encoding UTF8
    return $configPath
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$supervisorExe = Join-Path $root 'target\release\supervisor.exe'

if (-not (Test-Path $supervisorExe)) {
    throw "supervisor.exe not found at $supervisorExe. Build Supervisor first via .\install.ps1 -Component Supervisor"
}

$enableMcp = -not $NoMcp
$enableDashboard = -not $NoDashboard
$enableBrainstorm = -not $NoBrainstormGui
$enableApproval = -not $NoApprovalGui
$enableInteractive = [bool]$IncludeInteractiveTerminal

Write-Host 'Project Memory MCP — Launch Supervisor' -ForegroundColor Magenta
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
    } elseif (-not $SkipKillPrompt) {
        $response = Read-Host 'Kill these processes before launching supervisor? (Y/N)'
        $killExisting = $response -match '^(?i)y(?:es)?$'
    }

    if ($killExisting) {
        Write-Step 'Stopping detected processes'
        foreach ($proc in $running) {
            try {
                Stop-Process -Id $proc.PID -Force -ErrorAction Stop
                Write-Ok "Stopped $($proc.ProcessName) (PID $($proc.PID))"
            } catch {
                Write-Warn "Could not stop $($proc.ProcessName) (PID $($proc.PID)): $($_.Exception.Message)"
            }
        }
        Start-Sleep -Milliseconds 600
    } else {
        Write-Warn 'Leaving existing processes running.'
    }
}

$configPath = New-LaunchConfig -WorkspaceRoot $root `
    -EnableMcp $enableMcp `
    -EnableDashboard $enableDashboard `
    -EnableBrainstorm $enableBrainstorm `
    -EnableApproval $enableApproval `
    -EnableInteractiveTerminal $enableInteractive

Write-Step 'Launching supervisor'
Write-Host "   Config: $configPath" -ForegroundColor DarkGray

$process = Start-Process -FilePath $supervisorExe -ArgumentList @('--config', $configPath) -WorkingDirectory (Split-Path $supervisorExe) -PassThru
Start-Sleep -Seconds 1

if ($process.HasExited) {
    throw "Supervisor exited early (exitCode=$($process.ExitCode))."
}

Write-Ok "Supervisor launched (PID $($process.Id))"
