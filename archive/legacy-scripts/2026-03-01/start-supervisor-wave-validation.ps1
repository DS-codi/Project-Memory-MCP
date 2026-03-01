#!/usr/bin/env pwsh
#Requires -Version 7
<#!
.SYNOPSIS
    Launch an isolated Supervisor instance for Wave validation on an alternate control pipe.

.DESCRIPTION
    Starts a second Supervisor process using:
      - A dedicated instance mutex name (PM_SUPERVISOR_INSTANCE_NAME)
      - A dedicated control pipe and TCP control port
      - MCP subprocess runtime feature flags for validation

    This avoids stopping/restarting the default shared Supervisor instance.

.EXAMPLE
    .\start-supervisor-wave-validation.ps1

.EXAMPLE
    .\start-supervisor-wave-validation.ps1 -PipeName 'project-memory-supervisor-wave2'

.NOTES
    Reviewer usage path (same shell session):
      $env:PM_ORCHESTRATION_SUPERVISOR_PIPE_PATH = '\\.\pipe\project-memory-supervisor-wave-validation'
      # run reviewer validation commands that call orchestration supervisor client

    Stop isolated instance:
      .\stop-supervisor.ps1 -PipeName 'project-memory-supervisor-wave-validation'
#>
[CmdletBinding()]
param(
    [string]$PipeName = 'project-memory-supervisor-wave-validation',
    [int]$ControlTcpPort = 46470,
    [int]$McpPort = 4457,
    [string]$InstanceName = 'wave-validation',
    [string]$WaveCohorts = 'wave1'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$supervisorExe = Join-Path $root 'target\release\supervisor.exe'
if (-not (Test-Path $supervisorExe)) {
    throw "supervisor.exe not found at $supervisorExe"
}

$appDataDir = Join-Path $env:APPDATA 'ProjectMemory'
New-Item -ItemType Directory -Force -Path $appDataDir | Out-Null
$configPath = Join-Path $appDataDir 'supervisor.wave-validation.toml'

$pipePath = "\\.\pipe\$PipeName"
$serverDir = Join-Path $root 'server'

$config = @"
[supervisor]
control_transport = "named_pipe"
control_pipe = '$pipePath'
control_tcp_port = $ControlTcpPort

[mcp]
enabled = true
port = $McpPort

[mcp.node]
command     = "node"
args        = ["dist/server.js"]
working_dir = '$serverDir'

[interactive_terminal]
enabled = false

[dashboard]
enabled = false

[brainstorm_gui]
enabled = false

[approval_gui]
enabled = false
"@

$config | Set-Content -Path $configPath -Encoding UTF8

$childEnvOverrides = @{
    PM_SUPERVISOR_INSTANCE_NAME = $InstanceName
    PM_SUPERVISOR_MCP_SUBPROCESS_RUNTIME = '1'
    PM_SUPERVISOR_MCP_SUBPROCESS_WAVE_COHORTS = $WaveCohorts
    PM_SUPERVISOR_MCP_SUBPROCESS_HARD_STOP_GATE = '1'
}

Write-Host "Launching isolated Supervisor validation instance..." -ForegroundColor Cyan
Write-Host "  instance:  $InstanceName" -ForegroundColor DarkGray
Write-Host "  pipe:      $pipePath" -ForegroundColor DarkGray
Write-Host "  config:    $configPath" -ForegroundColor DarkGray
Write-Host "  cohorts:   $WaveCohorts" -ForegroundColor DarkGray
Write-Host "  tcp port:  $ControlTcpPort" -ForegroundColor DarkGray

$process = Start-Process -FilePath $supervisorExe -ArgumentList @('--config', $configPath) -WorkingDirectory (Split-Path $supervisorExe) -Environment $childEnvOverrides -PassThru
Start-Sleep -Seconds 2

if ($process.HasExited) {
    throw "Isolated Supervisor exited early (exitCode=$($process.ExitCode)). Check config at $configPath and rerun with --debug for diagnostics."
}

if (-not (Test-Path $pipePath)) {
    throw "Isolated Supervisor is running (PID=$($process.Id)) but control pipe is not available yet: $pipePath"
}

Write-Host "  pid:       $($process.Id)" -ForegroundColor DarkGray
Write-Host "  status:    alive + control pipe ready" -ForegroundColor Green

Write-Host ''
Write-Host 'Reviewer validation shell setup:' -ForegroundColor Cyan
Write-Host "  `$env:PM_ORCHESTRATION_SUPERVISOR_PIPE_PATH = '$pipePath'" -ForegroundColor DarkGray
Write-Host "  # Optional explicit client: new SupervisorClient({ pipePath: '$pipePath' })" -ForegroundColor DarkGray
Write-Host "  .\stop-supervisor.ps1 -PipeName '$PipeName'" -ForegroundColor DarkGray
