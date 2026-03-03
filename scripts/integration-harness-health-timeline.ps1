#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$RunId,
    [string]$NormalizedEventsPath,
    [string]$SnapshotsPath,
    [string]$TimelinePath,
    [int]$SnapshotIntervalMs = 1000,
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

function Get-EventState {
    param([Parameter(Mandatory)] [string]$EventType)

    switch ($EventType) {
        "connectivity_connected" { return "connected" }
        "connectivity_reconnected" { return "connected" }
        "connectivity_degraded" { return "degraded" }
        "connectivity_disconnected" { return "disconnected" }
        "session_invalidated" { return "recovering" }
        "operator_alert_emitted" { return "alerting" }
        "health_check_pass" { return "healthy" }
        "health_check_fail" { return "unhealthy" }
        "readiness_pass" { return "ready" }
        "readiness_fail" { return "not_ready" }
        default { return "observed" }
    }
}

$root = Split-Path -Parent $PSScriptRoot
$normalizedResolved = if ($NormalizedEventsPath) {
    Resolve-PathFromRoot -Root $root -PathValue $NormalizedEventsPath
}
else {
    Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/events/normalized-events.jsonl"
}

if (-not (Test-Path $normalizedResolved)) {
    throw "normalized events file not found: $normalizedResolved"
}

$snapshotsResolved = if ($SnapshotsPath) {
    Resolve-PathFromRoot -Root $root -PathValue $SnapshotsPath
}
else {
    Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/health/health-snapshots.jsonl"
}

$timelineResolved = if ($TimelinePath) {
    Resolve-PathFromRoot -Root $root -PathValue $TimelinePath
}
else {
    Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/health/fault-timeline.json"
}

if ($ValidateOnly) {
    Get-Content -Path $normalizedResolved -First 1 | ForEach-Object { $_ | ConvertFrom-Json | Out-Null }
    Write-Host "OK: Health timeline validation passed. source=$normalizedResolved"
    exit 0
}

Ensure-ParentDirectory -Path $snapshotsResolved
Ensure-ParentDirectory -Path $timelineResolved

if (Test-Path $snapshotsResolved) {
    Clear-Content -Path $snapshotsResolved
}

$events = @(
    Get-Content -Path $normalizedResolved |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { $_ | ConvertFrom-Json }
)

if ($events.Count -eq 0) {
    throw "No normalized events found: $normalizedResolved"
}

$events = @($events | Sort-Object { [DateTimeOffset]::Parse([string]$_.timestamp) })
$start = [DateTimeOffset]::Parse([string]$events[0].timestamp)
$end = [DateTimeOffset]::Parse([string]$events[-1].timestamp)
$nextSnapshot = $start

$stateByComponent = @{}
$timelineRows = New-Object System.Collections.Generic.List[object]

foreach ($event in $events) {
    if ([string]$event.run_id -ne $RunId) {
        throw "Run id mismatch in normalized events. expected='$RunId' actual='$([string]$event.run_id)'"
    }

    $eventTs = [DateTimeOffset]::Parse([string]$event.timestamp)
    while ($nextSnapshot -le $eventTs) {
        $snapshotComponents = @{}
        foreach ($key in $stateByComponent.Keys) {
            $snapshotComponents[$key] = $stateByComponent[$key]
        }

        $snapshot = [ordered]@{
            run_id = $RunId
            snapshot_timestamp = $nextSnapshot.ToString("o")
            snapshot_interval_ms = $SnapshotIntervalMs
            component_states = $snapshotComponents
        }
        Add-Content -Path $snapshotsResolved -Value ($snapshot | ConvertTo-Json -Compress -Depth 16)
        $nextSnapshot = $nextSnapshot.AddMilliseconds($SnapshotIntervalMs)
    }

    $component = [string]$event.component_id
    $eventCause = if ($event.PSObject.Properties.Match("cause").Count -gt 0 -and -not [string]::IsNullOrWhiteSpace([string]$event.cause)) {
        [string]$event.cause
    }
    elseif ($event.PSObject.Properties.Match("reason_code").Count -gt 0 -and -not [string]::IsNullOrWhiteSpace([string]$event.reason_code)) {
        [string]$event.reason_code
    }
    else {
        "unspecified"
    }

    $attemptValue = if ($event.PSObject.Properties.Match("attempt").Count -gt 0) {
        [int]$event.attempt
    }
    else {
        0
    }

    $outcomeValue = if ($event.PSObject.Properties.Match("outcome").Count -gt 0 -and -not [string]::IsNullOrWhiteSpace([string]$event.outcome)) {
        [string]$event.outcome
    }
    else {
        "observed"
    }

    $stateByComponent[$component] = [ordered]@{
        state = Get-EventState -EventType ([string]$event.event_type)
        event_type = [string]$event.event_type
        cause = $eventCause
        attempt = $attemptValue
        outcome = $outcomeValue
        observed_at = [string]$event.timestamp
        scenario_id = [string]$event.scenario_id
        event_id = [string]$event.event_id
    }

    $timelineRows.Add([pscustomobject]@{
        timestamp = [string]$event.timestamp
        scenario_id = [string]$event.scenario_id
        component_id = [string]$event.component_id
        event_type = [string]$event.event_type
        state = Get-EventState -EventType ([string]$event.event_type)
        cause = $eventCause
        attempt = $attemptValue
        outcome = $outcomeValue
        event_id = [string]$event.event_id
    })
}

while ($nextSnapshot -le $end.AddMilliseconds($SnapshotIntervalMs)) {
    $snapshotComponents = @{}
    foreach ($key in $stateByComponent.Keys) {
        $snapshotComponents[$key] = $stateByComponent[$key]
    }

    $snapshot = [ordered]@{
        run_id = $RunId
        snapshot_timestamp = $nextSnapshot.ToString("o")
        snapshot_interval_ms = $SnapshotIntervalMs
        component_states = $snapshotComponents
    }
    Add-Content -Path $snapshotsResolved -Value ($snapshot | ConvertTo-Json -Compress -Depth 16)
    $nextSnapshot = $nextSnapshot.AddMilliseconds($SnapshotIntervalMs)
}

$timelineSummary = [ordered]@{
    run_id = $RunId
    generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    source_normalized_events = $normalizedResolved
    source_snapshots = $snapshotsResolved
    window = [ordered]@{
        start = $start.ToString("o")
        end = $end.ToString("o")
        duration_ms = [int]($end - $start).TotalMilliseconds
    }
    timeline_count = $timelineRows.Count
    snapshots_interval_ms = $SnapshotIntervalMs
    timeline = $timelineRows
}

$timelineSummary | ConvertTo-Json -Depth 16 | Set-Content -Path $timelineResolved
Write-Host "OK: Health snapshots and fault timeline generated. snapshots=$snapshotsResolved timeline=$timelineResolved"
exit 0
