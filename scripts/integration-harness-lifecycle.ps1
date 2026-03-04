#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [ValidateSet("up", "down", "restart", "reset")]
    [string]$Action,
    [string]$Component = "project-memory",
    [string]$RunId = "local",
    [string]$ComposeFile = "docs/integration-harness/podman-compose.integration.yml",
    [string]$ContractPath = "docs/integration-harness/contracts/health-readiness.contract.json",
    [switch]$ExposeHostPorts
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$composePath = if ([System.IO.Path]::IsPathRooted($ComposeFile)) { $ComposeFile } else { Join-Path $root $ComposeFile }
$contractResolved = if ([System.IO.Path]::IsPathRooted($ContractPath)) { $ContractPath } else { Join-Path $root $ContractPath }
$hostPortsOverridePath = Join-Path $root "docs/integration-harness/podman-compose.integration.hostports.yml"

if (-not (Test-Path $composePath)) {
    throw "Compose file not found: $composePath"
}

$composeFileArgs = @("-f", $composePath)
if ($ExposeHostPorts) {
    if (-not (Test-Path $hostPortsOverridePath)) {
        throw "Host ports override compose file not found: $hostPortsOverridePath"
    }

    $composeFileArgs += @("-f", $hostPortsOverridePath)
}

$runRoot = Join-Path $root ".tmp/integration-harness/runs/$RunId"
$dataDir = Join-Path $runRoot "data"
$secretsDir = Join-Path $runRoot "secrets"
$artifactsDir = Join-Path $runRoot "artifacts"

function Initialize-ArtifactBundle {
    param(
        [Parameter(Mandatory)] [string]$Root,
        [Parameter(Mandatory)] [string]$RunId,
        [Parameter(Mandatory)] [string]$ArtifactsDir
    )

    $logsDir = Join-Path $ArtifactsDir "logs"
    $healthDir = Join-Path $ArtifactsDir "health"
    $eventsDir = Join-Path $ArtifactsDir "events"
    $assertionsDir = Join-Path $ArtifactsDir "assertions"

    $null = New-Item -ItemType Directory -Path $ArtifactsDir -Force
    $null = New-Item -ItemType Directory -Path $logsDir -Force
    $null = New-Item -ItemType Directory -Path $healthDir -Force
    $null = New-Item -ItemType Directory -Path $eventsDir -Force
    $null = New-Item -ItemType Directory -Path $assertionsDir -Force

    $summaryPath = Join-Path $ArtifactsDir "summary.json"
    if (-not (Test-Path $summaryPath)) {
        $summaryStub = [ordered]@{
            run_id = $RunId
            status = "initialized"
            generated_at = [DateTimeOffset]::UtcNow.ToString("o")
            artifacts = [ordered]@{
                logs = (Join-Path $Root ".tmp/integration-harness/runs/$RunId/artifacts/logs")
                health = (Join-Path $Root ".tmp/integration-harness/runs/$RunId/artifacts/health")
                events = (Join-Path $Root ".tmp/integration-harness/runs/$RunId/artifacts/events")
                assertions = (Join-Path $Root ".tmp/integration-harness/runs/$RunId/artifacts/assertions")
            }
        }
        $summaryStub | ConvertTo-Json -Depth 8 | Set-Content -Path $summaryPath
    }

    $manifestPath = Join-Path $ArtifactsDir "bundle-manifest.json"
    $manifest = [ordered]@{
        run_id = $RunId
        generated_at = [DateTimeOffset]::UtcNow.ToString("o")
        bundle_root = (Join-Path $Root ".tmp/integration-harness/runs/$RunId/artifacts")
        required_paths = [ordered]@{
            logs = (Join-Path $Root ".tmp/integration-harness/runs/$RunId/artifacts/logs")
            health = (Join-Path $Root ".tmp/integration-harness/runs/$RunId/artifacts/health")
            events = (Join-Path $Root ".tmp/integration-harness/runs/$RunId/artifacts/events")
            assertions = (Join-Path $Root ".tmp/integration-harness/runs/$RunId/artifacts/assertions")
            summary_json = (Join-Path $Root ".tmp/integration-harness/runs/$RunId/artifacts/summary.json")
        }
    }
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -Path $manifestPath
}

$null = New-Item -ItemType Directory -Path $dataDir -Force
$null = New-Item -ItemType Directory -Path $secretsDir -Force
Initialize-ArtifactBundle -Root $root -RunId $RunId -ArtifactsDir $artifactsDir

$env:PM_HARNESS_DATA_DIR = $dataDir
$env:PM_HARNESS_SECRETS_DIR = $secretsDir
$env:PM_HARNESS_ARTIFACTS_DIR = $artifactsDir
$env:COMPOSE_PROJECT_NAME = "pmh_$RunId"

function Invoke-Compose {
    param([string[]]$Arguments)

    & podman compose @composeFileArgs @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "podman compose failed (exit $LASTEXITCODE) for arguments: $($Arguments -join ' ')"
    }
}

function Invoke-IdempotentStopStart {
    param(
        [Parameter(Mandatory)] [string]$ServiceName,
        [Parameter(Mandatory)] [int]$StopWaitMs
    )

    Invoke-Compose -Arguments @("stop", $ServiceName)
    if ($StopWaitMs -gt 0) {
        Start-Sleep -Milliseconds $StopWaitMs
    }
    Invoke-Compose -Arguments @("up", "-d", "--remove-orphans", $ServiceName)
}

switch ($Action) {
    "up" {
        Invoke-Compose -Arguments @("up", "-d", "--build")
        & (Join-Path $PSScriptRoot "integration-harness-readiness.ps1") -ContractPath $contractResolved
        if ($LASTEXITCODE -ne 0) {
            throw "Readiness gate failed after stack startup."
        }
    }
    "down" {
        Invoke-Compose -Arguments @("down", "--remove-orphans")
    }
    "restart" {
        Invoke-IdempotentStopStart -ServiceName $Component -StopWaitMs 1000
        & (Join-Path $PSScriptRoot "integration-harness-readiness.ps1") -ContractPath $contractResolved
        if ($LASTEXITCODE -ne 0) {
            throw "Readiness gate failed after component restart."
        }
    }
    "reset" {
        Invoke-Compose -Arguments @("down", "-v", "--remove-orphans")
        if (Test-Path $runRoot) {
            Remove-Item -Path $runRoot -Recurse -Force
        }
        $null = New-Item -ItemType Directory -Path $dataDir -Force
        $null = New-Item -ItemType Directory -Path $secretsDir -Force
        Initialize-ArtifactBundle -Root $root -RunId $RunId -ArtifactsDir $artifactsDir
    }
}

Write-Host "OK: integration harness lifecycle action '$Action' completed (run_id=$RunId, expose_host_ports=$([bool]$ExposeHostPorts))."
