#!/usr/bin/env pwsh
#Requires -Version 7
<#!
.SYNOPSIS
    Run Supervisor native-runtime wave validation on the existing single Supervisor instance.

.DESCRIPTION
    Uses the Supervisor control pipe to:
      1) Set in-process MCP runtime policy (enabled + cohort + hard-stop gate)
      2) Execute a lightweight runtime lifecycle probe (init -> execute -> complete)
      3) Optionally restore runtime policy to disabled at the end

    This script is restart-free and does not spawn secondary Supervisor instances.

.PARAMETER PipeName
    Supervisor control pipe name (without \\.\pipe\ prefix).

.PARAMETER WaveCohort
    Cohort to enable for this validation pass (e.g. wave1, wave2, wave3, wave4).

.PARAMETER SessionId
    Runtime session id to use for lifecycle probe.

.PARAMETER TimeoutMs
    Runtime exec timeout.

.PARAMETER KeepEnabled
    If provided, leaves runtime policy enabled after probe.

.EXAMPLE
    .\run-wave-cohort-validation.ps1 -WaveCohort wave1

.EXAMPLE
    .\run-wave-cohort-validation.ps1 -WaveCohort wave2 -KeepEnabled
#>
[CmdletBinding()]
param(
    [string]$PipeName = 'project-memory-supervisor',
    [string]$WaveCohort = 'wave1',
    [string]$SessionId = 'wave-validation-session',
    [int]$TimeoutMs = 10000,
    [switch]$KeepEnabled
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$pipePath = "\\.\pipe\$PipeName"

function Send-ControlRequest {
    param(
        [Parameter(Mandatory)][hashtable]$Request,
        [int]$ConnectTimeoutMs = 3000
    )

    $client = $null
    try {
        $client = [System.IO.Pipes.NamedPipeClientStream]::new(
            '.',
            $PipeName,
            [System.IO.Pipes.PipeDirection]::InOut,
            [System.IO.Pipes.PipeOptions]::None
        )

        $client.Connect($ConnectTimeoutMs)

        $writer = [System.IO.StreamWriter]::new($client)
        $writer.AutoFlush = $true
        $reader = [System.IO.StreamReader]::new($client)

        $json = ($Request | ConvertTo-Json -Depth 20 -Compress)
        $writer.WriteLine($json)

        $line = $reader.ReadLine()
        if ([string]::IsNullOrWhiteSpace($line)) {
            throw 'Empty response from supervisor control pipe.'
        }

        return ($line | ConvertFrom-Json -Depth 30)
    }
    finally {
        if ($null -ne $client) {
            $client.Dispose()
        }
    }
}

if (-not (Test-Path $pipePath)) {
    throw "Supervisor control pipe not found: $pipePath"
}

Write-Host 'Running single-instance wave cohort validation...' -ForegroundColor Cyan
Write-Host "  pipe:    $pipePath" -ForegroundColor DarkGray
Write-Host "  cohort:  $WaveCohort" -ForegroundColor DarkGray
Write-Host "  session: $SessionId" -ForegroundColor DarkGray

$policyOn = Send-ControlRequest -Request @{
    type = 'SetMcpRuntimePolicy'
    enabled = $true
    wave_cohorts = @($WaveCohort)
    hard_stop_gate = $true
}

if (-not $policyOn.ok) {
    throw "SetMcpRuntimePolicy(enable) failed: $($policyOn.error)"
}

Write-Host '  ✓ Runtime policy enabled for selected cohort' -ForegroundColor Green

$initResp = Send-ControlRequest -Request @{
    type = 'McpRuntimeExec'
    payload = @{
        runtime = @{
            op = 'init'
            session_id = $SessionId
            wave_cohort = $WaveCohort
        }
    }
    timeout_ms = $TimeoutMs
}

$execResp = Send-ControlRequest -Request @{
    type = 'McpRuntimeExec'
    payload = @{
        runtime = @{
            op = 'execute'
            session_id = $SessionId
            wave_cohort = $WaveCohort
        }
        probe = @{
            kind = 'wave_validation'
            cohort = $WaveCohort
            timestamp = (Get-Date).ToString('o')
        }
    }
    timeout_ms = $TimeoutMs
}

$completeResp = Send-ControlRequest -Request @{
    type = 'McpRuntimeExec'
    payload = @{
        runtime = @{
            op = 'complete'
            session_id = $SessionId
            wave_cohort = $WaveCohort
        }
    }
    timeout_ms = $TimeoutMs
}

Write-Host ''
Write-Host 'Probe responses:' -ForegroundColor Cyan
Write-Host ("  init.ok:     {0}" -f $initResp.ok) -ForegroundColor DarkGray
Write-Host ("  execute.ok:  {0}" -f $execResp.ok) -ForegroundColor DarkGray
Write-Host ("  complete.ok: {0}" -f $completeResp.ok) -ForegroundColor DarkGray

if (-not $KeepEnabled) {
    $policyOff = Send-ControlRequest -Request @{
        type = 'SetMcpRuntimePolicy'
        enabled = $false
        wave_cohorts = @($WaveCohort)
        hard_stop_gate = $true
    }

    if (-not $policyOff.ok) {
        Write-Host "  ⚠ Failed to restore runtime policy: $($policyOff.error)" -ForegroundColor Yellow
    }
    else {
        Write-Host '  ✓ Runtime policy restored to disabled' -ForegroundColor Green
    }
}

Write-Host ''
Write-Host 'Wave cohort validation run complete.' -ForegroundColor Green

# Emit machine-readable summary on stdout for evidence capture.
[pscustomobject]@{
    pipe = $pipePath
    wave_cohort = $WaveCohort
    session_id = $SessionId
    policy_enabled_ok = $policyOn.ok
    init_ok = $initResp.ok
    execute_ok = $execResp.ok
    complete_ok = $completeResp.ok
    init_response = $initResp
    execute_response = $execResp
    complete_response = $completeResp
} | ConvertTo-Json -Depth 30
