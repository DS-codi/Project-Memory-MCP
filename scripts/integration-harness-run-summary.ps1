#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$RunId,
    [string]$AssertionsPath,
    [string]$TimelinePath,
    [string]$OutputJsonPath,
    [string]$OutputMarkdownPath,
    [switch]$ValidateOnly
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

function Get-RetryAdvice {
    param([Parameter(Mandatory)] [string]$Message)

    $msg = $Message.ToLowerInvariant()
    if ($msg.Contains("runtime_unavailable")) {
        return "Podman-first precheck failed. Ensure Podman service/socket is available, then rerun lifecycle up and fault runner."
    }

    if ($msg.Contains("timeout_exceeded")) {
        return "Reconnect exceeded timeout. Verify target service startup latency and reconnect_policy timeout/backoff settings."
    }

    if ($msg.Contains("restart_sequence_mismatch")) {
        return "Observed transition sequence diverged. Inspect normalized events and fault timeline around failed scenario action_id."
    }

    if ($msg.Contains("assertion_failed")) {
        return "Assertion failed. Inspect traceability index and raw fault event copy for scenario-specific failure attribution."
    }

    return "Review timeline and normalized events for scenario-level attribution, then rerun the affected scenario in dry-run first."
}

$root = Split-Path -Parent $PSScriptRoot
$assertionsResolved = if ($AssertionsPath) {
    Resolve-PathFromRoot -Root $root -PathValue $AssertionsPath
}
else {
    Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/assertions/recovery-assertions.json"
}

$timelineResolved = if ($TimelinePath) {
    Resolve-PathFromRoot -Root $root -PathValue $TimelinePath
}
else {
    Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/health/fault-timeline.json"
}

$jsonResolved = if ($OutputJsonPath) {
    Resolve-PathFromRoot -Root $root -PathValue $OutputJsonPath
}
else {
    Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/summary.json"
}

$markdownResolved = if ($OutputMarkdownPath) {
    Resolve-PathFromRoot -Root $root -PathValue $OutputMarkdownPath
}
else {
    Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/summary.md"
}

if (-not (Test-Path $assertionsResolved)) {
    throw "assertions file not found: $assertionsResolved"
}

if (-not (Test-Path $timelineResolved)) {
    throw "timeline file not found: $timelineResolved"
}

if ($ValidateOnly) {
    Get-Content -Path $assertionsResolved -Raw | ConvertFrom-Json | Out-Null
    Get-Content -Path $timelineResolved -Raw | ConvertFrom-Json | Out-Null
    Write-Host "OK: run summary validation passed. assertions=$assertionsResolved timeline=$timelineResolved"
    exit 0
}

$assertions = Get-Content -Path $assertionsResolved -Raw | ConvertFrom-Json
$timeline = Get-Content -Path $timelineResolved -Raw | ConvertFrom-Json

if ([string]$assertions.run_id -ne $RunId) {
    throw "Run id mismatch for assertions. expected='$RunId' actual='$([string]$assertions.run_id)'"
}

if ([string]$timeline.run_id -ne $RunId) {
    throw "Run id mismatch for timeline. expected='$RunId' actual='$([string]$timeline.run_id)'"
}

$results = @($assertions.results)
$failedRows = @($results | Where-Object { $_.passed -ne $true })
$passRows = @($results | Where-Object { $_.passed -eq $true })

$scenarioSummary = New-Object System.Collections.Generic.List[object]
foreach ($row in $results) {
    $failureMessage = if ($row.passed -eq $true) { "" } else { [string]$row.message }
    $scenarioSummary.Add([pscustomobject]@{
        scenario_id = [string]$row.scenario_id
        runtime_mode = [string]$row.runtime_mode
        status = if ($row.passed -eq $true) { "pass" } else { "fail" }
        reason = [string]$row.reason
        elapsed_ms = if ($row.PSObject.Properties["elapsed_ms"]) { [int]$row.elapsed_ms } else { $null }
        failure_attribution = $failureMessage
        retry_advice = if ([string]::IsNullOrWhiteSpace($failureMessage)) { "none" } else { Get-RetryAdvice -Message $failureMessage }
    })
}

$summary = [ordered]@{
    run_id = $RunId
    generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    status = if ($failedRows.Count -eq 0) { "pass" } else { "fail" }
    ci = [ordered]@{
        exit_code = if ($failedRows.Count -eq 0) { 0 } else { 1 }
        scenario_total = $results.Count
        scenario_pass = $passRows.Count
        scenario_fail = $failedRows.Count
    }
    inputs = [ordered]@{
        assertions = $assertionsResolved
        timeline = $timelineResolved
    }
    timeline_window = $timeline.window
    scenario_results = $scenarioSummary
}

Ensure-ParentDirectory -Path $jsonResolved
Ensure-ParentDirectory -Path $markdownResolved

$summary | ConvertTo-Json -Depth 16 | Set-Content -Path $jsonResolved

$markdown = New-Object System.Collections.Generic.List[string]
$markdown.Add("# Integration Harness Run Summary")
$markdown.Add("")
$markdown.Add("- Run ID: $RunId")
$markdown.Add("- Overall Status: $($summary.status)")
$markdown.Add("- Scenario Pass/Fail: $($summary.ci.scenario_pass)/$($summary.ci.scenario_fail) of $($summary.ci.scenario_total)")
$markdown.Add("- CI Exit Code: $($summary.ci.exit_code)")
$markdown.Add("- Timeline Window: $($timeline.window.start) -> $($timeline.window.end)")
$markdown.Add("")
$markdown.Add("| Scenario | Mode | Status | Failure Attribution | Retry Advice |")
$markdown.Add("|---|---|---|---|---|")

foreach ($row in $scenarioSummary) {
    $failure = if ([string]::IsNullOrWhiteSpace([string]$row.failure_attribution)) { "-" } else { [string]$row.failure_attribution }
    $advice = if ([string]::IsNullOrWhiteSpace([string]$row.retry_advice)) { "-" } else { [string]$row.retry_advice }
    $markdown.Add("| $([string]$row.scenario_id) | $([string]$row.runtime_mode) | $([string]$row.status) | $failure | $advice |")
}

$markdown -join [Environment]::NewLine | Set-Content -Path $markdownResolved
Write-Host "OK: run summary generated. json=$jsonResolved markdown=$markdownResolved"
exit 0
