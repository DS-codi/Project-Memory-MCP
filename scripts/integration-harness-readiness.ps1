#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [string]$ContractPath = "docs/integration-harness/contracts/health-readiness.contract.json",
    [int]$MaxAttempts = 5,
    [int]$ProbeIntervalMs = 3000,
    [switch]$ValidateOnly,
    [switch]$SkipSupervisorProxy
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$resolvedContractPath = if ([System.IO.Path]::IsPathRooted($ContractPath)) { $ContractPath } else { Join-Path $root $ContractPath }

if (-not (Test-Path $resolvedContractPath)) {
    throw "Health/readiness contract not found: $resolvedContractPath"
}

$contract = Get-Content -Path $resolvedContractPath -Raw | ConvertFrom-Json
if (-not $contract.components -or $contract.components.Count -eq 0) {
    throw "Contract has no components: $resolvedContractPath"
}

if ($ValidateOnly) {
    Write-Host "OK: Parsed contract with $($contract.components.Count) component definitions from $resolvedContractPath"
    exit 0
}

function Invoke-HttpProbe {
    param(
        [Parameter(Mandatory)]$Probe
    )

    $method = if ($Probe.method) { [string]$Probe.method } else { "GET" }
    $response = Invoke-WebRequest -Uri $Probe.url -Method $method -TimeoutSec ([math]::Max(1, [math]::Ceiling($Probe.timeout_ms / 1000.0))) -UseBasicParsing
    $statusCodes = @($Probe.success_status_codes)
    if ($statusCodes.Count -eq 0) { $statusCodes = @(200) }

    if ($statusCodes -notcontains [int]$response.StatusCode) {
        return [pscustomobject]@{ Success = $false; Detail = "HTTP status $($response.StatusCode) not in [$($statusCodes -join ',')] for $($Probe.url)" }
    }

    return [pscustomobject]@{ Success = $true; Detail = "HTTP $($response.StatusCode) $($Probe.url)" }
}

function Invoke-TcpProbe {
    param(
        [Parameter(Mandatory)]$Probe
    )

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect([string]$Probe.host, [int]$Probe.port, $null, $null)
        $completed = $async.AsyncWaitHandle.WaitOne([math]::Max(1, [int]$Probe.timeout_ms))
        if (-not $completed) {
            return [pscustomobject]@{ Success = $false; Detail = "TCP timeout $($Probe.host):$($Probe.port)" }
        }

        $client.EndConnect($async)
        return [pscustomobject]@{ Success = $true; Detail = "TCP connected $($Probe.host):$($Probe.port)" }
    }
    finally {
        $client.Dispose()
    }
}

function Test-Probe {
    param(
        [Parameter(Mandatory)]$Probe
    )

    $kind = [string]$Probe.kind
    switch ($kind) {
        "http" { return Invoke-HttpProbe -Probe $Probe }
        "tcp" { return Invoke-TcpProbe -Probe $Probe }
        default { return [pscustomobject]@{ Success = $false; Detail = "Unsupported probe kind: $kind" } }
    }
}

$requiredComponents = @($contract.components | Where-Object { $_.required -eq $true -and $_.readiness_gate -eq "required" } | Sort-Object startup_order)
if ($SkipSupervisorProxy) {
    $requiredComponents = @($requiredComponents | Where-Object { [string]$_.component_id -ne "supervisor-proxy" })
    Write-Host "INFO: Readiness gate skipping component 'supervisor-proxy' (isolated mode)."
}

if ($requiredComponents.Count -eq 0) {
    Write-Host "No required readiness-gated components found; startup gate passes by default."
    exit 0
}

$violations = New-Object System.Collections.Generic.List[object]

foreach ($component in $requiredComponents) {
    $componentId = [string]$component.component_id
    $probes = @()
    if ($component.liveness_probe) { $probes += ,$component.liveness_probe }
    if ($component.readiness_probe) { $probes += ,$component.readiness_probe }

    foreach ($probe in $probes) {
        $failureThreshold = if ($probe.failure_threshold) { [int]$probe.failure_threshold } else { 1 }
        $attemptLimit = [math]::Max(1, [math]::Min($MaxAttempts, $failureThreshold))
        $ok = $false
        $lastDetail = ""

        for ($attempt = 1; $attempt -le $attemptLimit; $attempt++) {
            try {
                $result = Test-Probe -Probe $probe
                if ($result.Success) {
                    $ok = $true
                    break
                }

                $lastDetail = $result.Detail
            }
            catch {
                $lastDetail = $_.Exception.Message
            }

            if ($attempt -lt $attemptLimit) {
                Start-Sleep -Milliseconds $ProbeIntervalMs
            }
        }

        if (-not $ok) {
            $violations.Add([pscustomobject]@{
                component_id = $componentId
                probe_kind = [string]$probe.kind
                detail = $lastDetail
                attempts = $attemptLimit
            })
        }
    }
}

if ($violations.Count -gt 0) {
    Write-Host "Readiness gate failed for required services:" -ForegroundColor Red
    $violations | ForEach-Object {
        Write-Host " - component=$($_.component_id) probe=$($_.probe_kind) attempts=$($_.attempts) detail=$($_.detail)" -ForegroundColor Red
    }
    exit 2
}

Write-Host "OK: Readiness gate passed for required services."
exit 0
