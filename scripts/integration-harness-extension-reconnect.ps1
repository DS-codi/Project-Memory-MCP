#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$RunId,
    [string]$FaultContractPath = "docs/integration-harness/contracts/fault-recovery.contract.json",
    [switch]$ExposeHostPorts,
    [switch]$ValidateOnly,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-PathFromRoot {
    param(
        [Parameter(Mandatory)] [string]$Root,
        [Parameter(Mandatory)] [string]$PathValue
    )

    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return $PathValue
    }

    return Join-Path $Root $PathValue
}

function Ensure-ParentDirectory {
    param([Parameter(Mandatory)] [string]$Path)

    $parent = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        $null = New-Item -ItemType Directory -Path $parent -Force
    }
}

$root = Split-Path -Parent $PSScriptRoot
$faultContractResolved = Resolve-PathFromRoot -Root $root -PathValue $FaultContractPath
$eventsPath = Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/events/extension-reconnect-events.jsonl"
$outputPath = Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/assertions/extension-reconnect-assertions.json"
$tempContractPath = Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/assertions/extension-reconnect.contract.json"

if (-not (Test-Path $faultContractResolved)) {
    throw "fault recovery contract not found: $faultContractResolved"
}

$faultContract = Get-Content -Path $faultContractResolved -Raw | ConvertFrom-Json
$extensionScenarios = @($faultContract.scenarios | Where-Object { [string]$_.scenario_id -like "extension_*" })

if ($extensionScenarios.Count -eq 0) {
    throw "No extension reconnect scenarios found in fault contract (expected scenario_id like 'extension_*')."
}

if ($ValidateOnly) {
    Write-Host "OK: extension reconnect scenario contract validation passed. scenarios=$($extensionScenarios.Count) contract=$faultContractResolved"
    exit 0
}

Ensure-ParentDirectory -Path $tempContractPath
$tempContract = [ordered]@{
    contract_version = [string]$faultContract.contract_version
    runtime_default = "container-mode"
    scenarios = $extensionScenarios
}
$tempContract | ConvertTo-Json -Depth 16 | Set-Content -Path $tempContractPath

& (Join-Path $PSScriptRoot "integration-harness-fault-runner.ps1") -RunId $RunId -FaultContractPath $tempContractPath -ExposeHostPorts:$ExposeHostPorts -EventsPath $eventsPath -DryRun:$DryRun
if ($LASTEXITCODE -ne 0) {
    throw "Extension reconnect fault runner failed (exit $LASTEXITCODE)."
}

& (Join-Path $PSScriptRoot "integration-harness-recovery-assertions.ps1") -RunId $RunId -FaultContractPath $tempContractPath -EventsPath $eventsPath -OutputPath $outputPath
if ($LASTEXITCODE -ne 0) {
    throw "Extension reconnect recovery assertions failed (exit $LASTEXITCODE)."
}

Write-Host "OK: extension reconnect scenarios passed. events_path=$eventsPath output_path=$outputPath"
exit 0
