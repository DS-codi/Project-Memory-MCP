#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$RunId,
    [ValidateSet("smoke", "fault", "resilience", "all")]
    [string]$Tier = "all",
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

$root = Split-Path -Parent $PSScriptRoot
$artifactsRoot = Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts"
$assertionsRoot = Join-Path $artifactsRoot "assertions"
$matrixPath = Join-Path $assertionsRoot "matrix-gates.json"

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
    & (Join-Path $PSScriptRoot "integration-harness-lifecycle.ps1") -Action up -RunId $RunId
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
                    & (Join-Path $PSScriptRoot "integration-harness-extension-headless.ps1") -RunId $RunId -ValidateOnly
                }
                "fault" {
                    & (Join-Path $PSScriptRoot "integration-harness-fault-runner.ps1") -RunId $RunId -ValidateOnly
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
                    & (Join-Path $PSScriptRoot "integration-harness-extension-headless.ps1") -RunId $RunId -DryRun:$DryRun
                }
                "fault" {
                    & (Join-Path $PSScriptRoot "integration-harness-fault-runner.ps1") -RunId $RunId -RuntimeMode container-mode -DryRun:$DryRun
                    if ($LASTEXITCODE -ne 0) { throw "Fault runner failed for fault tier." }

                    & (Join-Path $PSScriptRoot "integration-harness-recovery-assertions.ps1") -RunId $RunId
                    if ($LASTEXITCODE -ne 0) { throw "Recovery assertions failed for fault tier." }

                    & (Join-Path $PSScriptRoot "integration-harness-event-aggregate.ps1") -RunId $RunId
                    if ($LASTEXITCODE -ne 0) { throw "Event aggregation failed for fault tier." }

                    & (Join-Path $PSScriptRoot "integration-harness-health-timeline.ps1") -RunId $RunId
                    if ($LASTEXITCODE -ne 0) { throw "Health timeline failed for fault tier." }

                    & (Join-Path $PSScriptRoot "integration-harness-run-summary.ps1") -RunId $RunId
                    if ($LASTEXITCODE -ne 0) { throw "Run summary failed for fault tier." }
                }
                "resilience" {
                    & (Join-Path $PSScriptRoot "integration-harness-extension-reconnect.ps1") -RunId $RunId -DryRun:$DryRun
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
        & (Join-Path $PSScriptRoot "integration-harness-lifecycle.ps1") -Action down -RunId $RunId
    }

    Ensure-ParentDirectory -Path $matrixPath
    $matrix = [ordered]@{
        run_id = $RunId
        tier_requested = $Tier
        tiers_executed = $tiersToRun
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
