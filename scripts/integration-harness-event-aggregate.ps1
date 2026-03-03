#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$RunId,
    [string]$EventsPath,
    [string]$OutputPath,
    [string]$TraceabilityPath,
    [string]$RawLogCopyPath,
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

$root = Split-Path -Parent $PSScriptRoot
$eventsResolved = if ($EventsPath) {
    Resolve-PathFromRoot -Root $root -PathValue $EventsPath
}
else {
    Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/events/fault-events.jsonl"
}

if (-not (Test-Path $eventsResolved)) {
    throw "events source file not found: $eventsResolved"
}

$outputResolved = if ($OutputPath) {
    Resolve-PathFromRoot -Root $root -PathValue $OutputPath
}
else {
    Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/events/normalized-events.jsonl"
}

$traceabilityResolved = if ($TraceabilityPath) {
    Resolve-PathFromRoot -Root $root -PathValue $TraceabilityPath
}
else {
    Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/events/traceability-index.json"
}

$rawLogCopyResolved = if ($RawLogCopyPath) {
    Resolve-PathFromRoot -Root $root -PathValue $RawLogCopyPath
}
else {
    Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/logs/raw-fault-events.jsonl"
}

if ($ValidateOnly) {
    Get-Content -Path $eventsResolved -First 1 | ForEach-Object { $_ | ConvertFrom-Json | Out-Null }
    Write-Host "OK: Event aggregation validation passed. source=$eventsResolved"
    exit 0
}

Ensure-ParentDirectory -Path $outputResolved
Ensure-ParentDirectory -Path $traceabilityResolved
Ensure-ParentDirectory -Path $rawLogCopyResolved

Copy-Item -Path $eventsResolved -Destination $rawLogCopyResolved -Force
if (Test-Path $outputResolved) {
    Clear-Content -Path $outputResolved
}

$rawLines = @(Get-Content -Path $eventsResolved | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
if ($rawLines.Count -eq 0) {
    throw "No events found in source file: $eventsResolved"
}

$traceRecords = New-Object System.Collections.Generic.List[object]
$lineNumber = 0
foreach ($rawLine in $rawLines) {
    $lineNumber++
    $event = $rawLine | ConvertFrom-Json

    if ([string]$event.run_id -ne $RunId) {
        throw "Run id mismatch in source events at line $lineNumber. expected='$RunId' actual='$([string]$event.run_id)'"
    }

    $normalized = [ordered]@{
        run_id = [string]$event.run_id
        event_id = [string]$event.event_tag
        timestamp = [string]$event.timestamp
        runtime_mode = [string]$event.runtime_mode
        scenario_id = [string]$event.scenario_id
        component_id = [string]$event.component_id
        action_id = [string]$event.action_id
        event_type = [string]$event.event_type
        cause = if ($event.PSObject.Properties.Match("cause").Count -gt 0 -and -not [string]::IsNullOrWhiteSpace([string]$event.cause)) { [string]$event.cause } else { [string]$event.reason_code }
        attempt = if ($event.PSObject.Properties.Match("attempt").Count -gt 0) { [int]$event.attempt } else { 0 }
        outcome = if ($event.PSObject.Properties.Match("outcome").Count -gt 0 -and -not [string]::IsNullOrWhiteSpace([string]$event.outcome)) { [string]$event.outcome } else { "observed" }
        reason_code = [string]$event.reason_code
        details = if ($event.details) { $event.details } else { @{} }
        traceability = [ordered]@{
            source_file = $eventsResolved
            source_line = $lineNumber
            raw_log_copy = $rawLogCopyResolved
            raw_log_line = $lineNumber
        }
    }

    Add-Content -Path $outputResolved -Value ($normalized | ConvertTo-Json -Compress -Depth 16)
    $traceRecords.Add([pscustomobject]@{
        run_id = [string]$event.run_id
        event_id = [string]$event.event_tag
        scenario_id = [string]$event.scenario_id
        component_id = [string]$event.component_id
        event_type = [string]$event.event_type
        source_file = $eventsResolved
        source_line = $lineNumber
        raw_log_copy = $rawLogCopyResolved
        raw_log_line = $lineNumber
    })
}

$traceability = [ordered]@{
    run_id = $RunId
    generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    source_events_file = $eventsResolved
    source_raw_log_copy = $rawLogCopyResolved
    normalized_events_file = $outputResolved
    event_count = $traceRecords.Count
    records = $traceRecords
}

$traceability | ConvertTo-Json -Depth 16 | Set-Content -Path $traceabilityResolved
Write-Host "OK: normalized event aggregation complete. output=$outputResolved traceability=$traceabilityResolved raw_copy=$rawLogCopyResolved"
exit 0
