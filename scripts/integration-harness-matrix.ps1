#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$RunId,
    [ValidateSet("smoke", "fault", "resilience", "all")]
    [string]$Tier = "all",
    [ValidateSet("podman-compose-default", "podman-compose-network-chaos", "supervisor-diagnostics")]
    [string]$RunProfile = "podman-compose-default",
    [string]$FaultContractPath = "docs/integration-harness/contracts/fault-recovery.contract.json",
    [switch]$ExposeHostPorts,
    [switch]$RequireSupervisorProxy,
    [switch]$ValidateOnly,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Ensure-ParentDirectory {
    param([Parameter(Mandatory)] [string]$Path)

    $parent = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        $null = New-Item -ItemType Directory -Path $parent -Force
    }
}

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

$root = Split-Path -Parent $PSScriptRoot
$artifactsRoot = Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts"
$assertionsRoot = Join-Path $artifactsRoot "assertions"
$matrixPath = Join-Path $assertionsRoot "matrix-gates.json"

$runProfiles = [ordered]@{
    "podman-compose-default" = [ordered]@{
        runtime_mode = "container-mode"
        compose_file = "docs/integration-harness/podman-compose.integration.yml"
        repeatable_by = "run_id"
        description = "Canonical Podman Compose validation lane for release gating."
    }
    "podman-compose-network-chaos" = [ordered]@{
        runtime_mode = "container-mode"
        compose_file = "docs/integration-harness/podman-compose.integration.yml"
        repeatable_by = "run_id"
        description = "Podman Compose lane focused on network-churn diagnostics."
    }
    "supervisor-diagnostics" = [ordered]@{
        runtime_mode = "supervisor-mode"
        compose_file = "docs/integration-harness/podman-compose.integration.yml"
        repeatable_by = "run_id"
        description = "Host-process supervisor diagnostics; not a release gate lane."
    }
}

$selectedProfile = $runProfiles[$RunProfile]
if (-not $selectedProfile) {
    throw "Unsupported run profile: $RunProfile"
}

$skipSupervisorProxy = ([string]$selectedProfile.runtime_mode -eq "container-mode" -and -not $RequireSupervisorProxy)

$resolvedFaultContractPath = Resolve-PathFromRoot -Root $root -PathValue $FaultContractPath
if (-not (Test-Path $resolvedFaultContractPath)) {
    throw "Fault contract not found: $resolvedFaultContractPath"
}

$faultContractPathForRun = $resolvedFaultContractPath
$removedSupervisorScenarios = @()
if ($skipSupervisorProxy) {
    $faultContract = Get-Content -Path $resolvedFaultContractPath -Raw | ConvertFrom-Json
    $allScenarios = @($faultContract.scenarios)
    $removedSupervisorScenarios = @(
        $allScenarios |
            Where-Object { [string]$_.component_id -eq "supervisor-proxy" } |
            ForEach-Object { [string]$_.scenario_id }
    )

    $faultContract.scenarios = @(
        $allScenarios |
            Where-Object { [string]$_.component_id -ne "supervisor-proxy" }
    )

    if (@($faultContract.scenarios).Count -eq 0) {
        throw "Isolated mode filtered all fault scenarios; no scenarios remain in $resolvedFaultContractPath"
    }

    $faultContractPathForRun = Join-Path $assertionsRoot "fault-recovery.contract.isolated.json"
    Ensure-ParentDirectory -Path $faultContractPathForRun
    $faultContract | ConvertTo-Json -Depth 24 | Set-Content -Path $faultContractPathForRun

    if ($removedSupervisorScenarios.Count -gt 0) {
        Write-Host "INFO: Isolated mode removed supervisor scenarios: $($removedSupervisorScenarios -join ', ')"
    }
}

$targetMinutes = [ordered]@{
    smoke = 15
    fault = 25
    resilience = 35
}

$tierPassCriteria = [ordered]@{
    smoke = @(
        "extension-headless assertions status=pass",
        "health readiness contract parse succeeds"
    )
    fault = @(
        "fault-runner emits events and exits success",
        "recovery assertions status=pass",
        "event aggregation, health timeline, and run summary generation succeed"
    )
    resilience = @(
        "extension reconnect events/assertions generated",
        "extension reconnect assertions status=pass"
    )
}

$promotionGates = [ordered]@{
    pr = @("smoke")
    nightly = @("smoke", "fault")
    prerelease = @("smoke", "fault", "resilience")
}

$promotionGateRequirements = [ordered]@{
    pr = @(
        "smoke tier passes",
        "smoke elapsed_seconds <= smoke runtime_target_minutes * 60"
    )
    nightly = @(
        "smoke and fault tiers pass",
        "each elapsed_seconds <= tier runtime_target_minutes * 60"
    )
    prerelease = @(
        "smoke, fault, and resilience tiers pass",
        "each elapsed_seconds <= tier runtime_target_minutes * 60"
    )
}

$tiersToRun = switch ($Tier) {
    "smoke" { @("smoke") }
    "fault" { @("smoke", "fault") }
    "resilience" { @("smoke", "fault", "resilience") }
    default { @("smoke", "fault", "resilience") }
}

$results = New-Object System.Collections.Generic.List[object]
$stackIsUp = $false

if (-not $ValidateOnly -and -not $DryRun) {
    & (Join-Path $PSScriptRoot "integration-harness-lifecycle.ps1") -Action up -RunId $RunId -ExposeHostPorts:$ExposeHostPorts -SkipSupervisorProxy:$skipSupervisorProxy
    if ($LASTEXITCODE -ne 0) {
        throw "Lifecycle up failed before matrix execution."
    }
    $stackIsUp = $true
}

try {
    foreach ($currentTier in $tiersToRun) {
        $tierStart = [DateTimeOffset]::UtcNow
        if ($ValidateOnly) {
            switch ($currentTier) {
                "smoke" {
                    & (Join-Path $PSScriptRoot "integration-harness-extension-headless.ps1") -RunId $RunId -SkipSupervisorProxy:$skipSupervisorProxy -ValidateOnly
                }
                "fault" {
                    & (Join-Path $PSScriptRoot "integration-harness-fault-runner.ps1") -RunId $RunId -FaultContractPath $faultContractPathForRun -ValidateOnly
                }
                "resilience" {
                    & (Join-Path $PSScriptRoot "integration-harness-extension-reconnect.ps1") -RunId $RunId -ValidateOnly
                }
            }
            if ($LASTEXITCODE -ne 0) {
                throw "Validation-only checks failed for tier '$currentTier'."
            }
        }
        else {
            switch ($currentTier) {
                "smoke" {
                    & (Join-Path $PSScriptRoot "integration-harness-extension-headless.ps1") -RunId $RunId -SkipSupervisorProxy:$skipSupervisorProxy -DryRun:$DryRun
                }
                "fault" {
                    & (Join-Path $PSScriptRoot "integration-harness-fault-runner.ps1") -RunId $RunId -FaultContractPath $faultContractPathForRun -RuntimeMode ([string]$selectedProfile.runtime_mode) -ComposeFile ([string]$selectedProfile.compose_file) -ExposeHostPorts:$ExposeHostPorts -DryRun:$DryRun
                    if ($LASTEXITCODE -ne 0) { throw "Fault runner failed for fault tier." }

                    & (Join-Path $PSScriptRoot "integration-harness-recovery-assertions.ps1") -RunId $RunId -FaultContractPath $faultContractPathForRun
                    if ($LASTEXITCODE -ne 0) { throw "Recovery assertions failed for fault tier." }

                    & (Join-Path $PSScriptRoot "integration-harness-event-aggregate.ps1") -RunId $RunId
                    if ($LASTEXITCODE -ne 0) { throw "Event aggregation failed for fault tier." }

                    & (Join-Path $PSScriptRoot "integration-harness-health-timeline.ps1") -RunId $RunId
                    if ($LASTEXITCODE -ne 0) { throw "Health timeline failed for fault tier." }

                    & (Join-Path $PSScriptRoot "integration-harness-run-summary.ps1") -RunId $RunId
                    if ($LASTEXITCODE -ne 0) { throw "Run summary failed for fault tier." }
                }
                "resilience" {
                    & (Join-Path $PSScriptRoot "integration-harness-extension-reconnect.ps1") -RunId $RunId -ExposeHostPorts:$ExposeHostPorts -DryRun:$DryRun
                    if ($LASTEXITCODE -ne 0) { throw "Extension reconnect resilience tier failed." }
                }
            }

            if ($LASTEXITCODE -ne 0) {
                throw "Tier '$currentTier' failed with exit $LASTEXITCODE."
            }
        }

        $elapsedSeconds = [int]([DateTimeOffset]::UtcNow - $tierStart).TotalSeconds
        $results.Add([pscustomobject]@{
            tier = $currentTier
            status = "pass"
            elapsed_seconds = $elapsedSeconds
            runtime_target_minutes = [int]$targetMinutes[$currentTier]
            required_pass_criteria = $tierPassCriteria[$currentTier]
            runtime_target_met = ($elapsedSeconds -le ([int]$targetMinutes[$currentTier] * 60))
            promotion_gate_membership = @($promotionGates.GetEnumerator() | Where-Object { $_.Value -contains $currentTier } | ForEach-Object { $_.Key })
        })
    }
}
catch {
    $results.Add([pscustomobject]@{
        tier = if ($currentTier) { $currentTier } else { "unknown" }
        status = "fail"
        elapsed_seconds = if ($tierStart) { [int]([DateTimeOffset]::UtcNow - $tierStart).TotalSeconds } else { 0 }
        runtime_target_minutes = if ($currentTier -and $targetMinutes.Contains($currentTier)) { [int]$targetMinutes[$currentTier] } else { 0 }
        required_pass_criteria = if ($currentTier -and $tierPassCriteria.Contains($currentTier)) { $tierPassCriteria[$currentTier] } else { @() }
        runtime_target_met = $false
        error = $_.Exception.Message
    })

    throw
}
finally {
    if ($stackIsUp) {
        & (Join-Path $PSScriptRoot "integration-harness-lifecycle.ps1") -Action down -RunId $RunId -ExposeHostPorts:$ExposeHostPorts
    }

    Ensure-ParentDirectory -Path $matrixPath
    $matrix = [ordered]@{
        run_id = $RunId
        tier_requested = $Tier
        tiers_executed = $tiersToRun
        run_profile = [ordered]@{
            profile_id = $RunProfile
            runtime_mode = [string]$selectedProfile.runtime_mode
            compose_file = [string]$selectedProfile.compose_file
            repeatable_by = [string]$selectedProfile.repeatable_by
            description = [string]$selectedProfile.description
            podman_compose_default_lane = ($RunProfile -eq "podman-compose-default")
            expose_host_ports = [bool]$ExposeHostPorts
            require_supervisor_proxy = [bool]$RequireSupervisorProxy
            skip_supervisor_proxy = [bool]$skipSupervisorProxy
            removed_supervisor_scenarios = @($removedSupervisorScenarios)
            fault_contract_path = [string]$faultContractPathForRun
        }
        dry_run = [bool]$DryRun
        validate_only = [bool]$ValidateOnly
        runtime_targets_minutes = $targetMinutes
        required_pass_criteria = $tierPassCriteria
        promotion_gates = $promotionGates
        promotion_gate_requirements = $promotionGateRequirements
        results = $results
        generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    }
    $matrix | ConvertTo-Json -Depth 16 | Set-Content -Path $matrixPath
}

Write-Host "OK: integration harness matrix execution complete. matrix_path=$matrixPath"
exit 0
