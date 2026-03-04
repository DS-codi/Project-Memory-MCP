#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [string]$RunId = "local",
    [string]$ScenarioId,
    [ValidateSet("container-mode", "supervisor-mode")]
    [string]$RuntimeMode,
    [string]$FaultContractPath = "docs/integration-harness/contracts/fault-recovery.contract.json",
    [string]$HealthContractPath = "docs/integration-harness/contracts/health-readiness.contract.json",
    [string]$ComposeFile = "docs/integration-harness/podman-compose.integration.yml",
    [switch]$ExposeHostPorts,
    [string]$EventsPath,
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

function Get-UtcTimestamp {
    return ([DateTimeOffset]::UtcNow.ToString("o"))
}

function Ensure-ParentDirectory {
    param([Parameter(Mandatory)] [string]$Path)

    $parent = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        $null = New-Item -ItemType Directory -Path $parent -Force
    }
}

function Get-OptionalProperty {
    param(
        [Parameter(Mandatory)] [object]$Object,
        [Parameter(Mandatory)] [string]$Name,
        $DefaultValue = $null
    )

    if ($null -eq $Object) {
        return $DefaultValue
    }

    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $DefaultValue
    }

    return $property.Value
}

function New-DeterministicTag {
    param(
        [Parameter(Mandatory)] [string]$RunId,
        [Parameter(Mandatory)] [string]$ScenarioId,
        [Parameter(Mandatory)] [string]$ActionId,
        [Parameter(Mandatory)] [int]$Sequence
    )

    return ("fi:{0}:{1}:{2}:{3:d4}" -f $RunId, $ScenarioId, $ActionId, $Sequence)
}

function Write-TaggedEvent {
    param(
        [Parameter(Mandatory)] [string]$EventsFile,
        [Parameter(Mandatory)] [string]$RunId,
        [Parameter(Mandatory)] [string]$RuntimeMode,
        [Parameter(Mandatory)] [string]$ScenarioId,
        [Parameter(Mandatory)] [string]$ComponentId,
        [Parameter(Mandatory)] [string]$EventType,
        [Parameter(Mandatory)] [string]$ReasonCode,
        [Parameter(Mandatory)] [string]$ActionId,
        [Parameter(Mandatory)] [int]$Sequence,
        [string]$Cause,
        [int]$Attempt = 0,
        [string]$Outcome = "observed",
        [hashtable]$Details
    )

    $eventTag = New-DeterministicTag -RunId $RunId -ScenarioId $ScenarioId -ActionId $ActionId -Sequence $Sequence
    $payload = [ordered]@{
        run_id = $RunId
        runtime_mode = $RuntimeMode
        scenario_id = $ScenarioId
        action_id = $ActionId
        event_tag = $eventTag
        component_id = $ComponentId
        event_type = $EventType
        timestamp = Get-UtcTimestamp
        cause = if ([string]::IsNullOrWhiteSpace($Cause)) { $ReasonCode } else { $Cause }
        attempt = $Attempt
        outcome = if ([string]::IsNullOrWhiteSpace($Outcome)) { "observed" } else { $Outcome }
        reason_code = $ReasonCode
        details = if ($Details) { $Details } else { @{} }
    }

    Ensure-ParentDirectory -Path $EventsFile
    Add-Content -Path $EventsFile -Value ($payload | ConvertTo-Json -Compress -Depth 12)
}

function Get-CooldownForDomain {
    param(
        [Parameter(Mandatory)] [pscustomobject]$Policy,
        [Parameter(Mandatory)] [string]$FailureDomain
    )

    $cooldownByDomain = Get-OptionalProperty -Object $Policy -Name "cooldown_by_failure_domain"
    if (-not $cooldownByDomain) {
        return 0
    }

    switch ($FailureDomain) {
        "dependency-group" { return [int](Get-OptionalProperty -Object $cooldownByDomain -Name "dependency_group_ms" -DefaultValue 0) }
        "global" { return [int](Get-OptionalProperty -Object $cooldownByDomain -Name "global_ms" -DefaultValue 0) }
        default { return [int](Get-OptionalProperty -Object $cooldownByDomain -Name "child_local_ms" -DefaultValue 0) }
    }
}

function Get-NextBackoffMs {
    param(
        [Parameter(Mandatory)] [int]$CurrentBackoffMs,
        [Parameter(Mandatory)] [pscustomobject]$Policy,
        [Parameter(Mandatory)] [int]$Attempt,
        [Parameter(Mandatory)] [string]$FailureDomain
    )

    $multiplier = [double](Get-OptionalProperty -Object $Policy -Name "multiplier" -DefaultValue 2.0)
    $jitterRatio = [double](Get-OptionalProperty -Object $Policy -Name "jitter_ratio" -DefaultValue 0.0)
    $maxBackoffMs = [int](Get-OptionalProperty -Object $Policy -Name "max_backoff_ms" -DefaultValue $CurrentBackoffMs)
    $cooldownAfter = [int](Get-OptionalProperty -Object $Policy -Name "cooldown_after_attempts" -DefaultValue 0)

    $baseNext = [int][Math]::Min($maxBackoffMs, [Math]::Round($CurrentBackoffMs * $multiplier))
    $jitterMax = [int][Math]::Max(0, [Math]::Round($baseNext * $jitterRatio))
    $jitter = if ($jitterMax -gt 0) { Get-Random -Minimum 0 -Maximum ($jitterMax + 1) } else { 0 }
    $candidate = [int][Math]::Min($maxBackoffMs, $baseNext + $jitter)

    if ($cooldownAfter -gt 0 -and $Attempt -ge $cooldownAfter) {
        $cooldownFloor = Get-CooldownForDomain -Policy $Policy -FailureDomain $FailureDomain
        if ($cooldownFloor -gt $candidate) {
            return $cooldownFloor
        }
    }

    return $candidate
}

function Test-HttpProbe {
    param(
        [Parameter(Mandatory)] [pscustomobject]$Probe
    )

    $probeMethod = Get-OptionalProperty -Object $Probe -Name "method" -DefaultValue "GET"
    $method = [string]$probeMethod
    $timeoutSec = [math]::Max(1, [math]::Ceiling(([int]$Probe.timeout_ms) / 1000.0))
    $response = Invoke-WebRequest -Uri $Probe.url -Method $method -TimeoutSec $timeoutSec -UseBasicParsing
    $okCodes = @((Get-OptionalProperty -Object $Probe -Name "success_status_codes" -DefaultValue @()))
    if ($okCodes.Count -eq 0) {
        $okCodes = @(200)
    }

    return [pscustomobject]@{
        Success = ($okCodes -contains [int]$response.StatusCode)
        StatusCode = [int]$response.StatusCode
        Detail = "HTTP $($response.StatusCode) $($Probe.url)"
    }
}

function Test-TcpProbe {
    param(
        [Parameter(Mandatory)] [pscustomobject]$Probe
    )

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect([string]$Probe.host, [int]$Probe.port, $null, $null)
        $completed = $async.AsyncWaitHandle.WaitOne([math]::Max(1, [int]$Probe.timeout_ms))
        if (-not $completed) {
            return [pscustomobject]@{ Success = $false; StatusCode = 0; Detail = "TCP timeout $($Probe.host):$($Probe.port)" }
        }

        $client.EndConnect($async)
        return [pscustomobject]@{ Success = $true; StatusCode = 0; Detail = "TCP connected $($Probe.host):$($Probe.port)" }
    }
    finally {
        $client.Dispose()
    }
}

function Test-Probe {
    param(
        [Parameter(Mandatory)] [pscustomobject]$Probe
    )

    if (-not $Probe.kind) {
        throw "Probe is missing kind."
    }

    switch ([string]$Probe.kind) {
        "http" { return Test-HttpProbe -Probe $Probe }
        "tcp" { return Test-TcpProbe -Probe $Probe }
        default { throw "Unsupported probe kind: $($Probe.kind)" }
    }
}

function Invoke-Compose {
    param(
        [Parameter(Mandatory)] [string[]]$ComposeFiles,
        [Parameter(Mandatory)] [string[]]$Arguments
    )

    $composeArgs = @()
    foreach ($composeFile in $ComposeFiles) {
        $composeArgs += @("-f", $composeFile)
    }

    & podman compose @composeArgs @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "podman compose failed (exit $LASTEXITCODE) for arguments: $($Arguments -join ' ')"
    }
}

function Stop-ProcessTree {
    param([Parameter(Mandatory)] [int]$RootProcessId)

    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $RootProcessId" -ErrorAction SilentlyContinue)
    foreach ($child in $children) {
        Stop-ProcessTree -RootProcessId ([int]$child.ProcessId)
    }

    $proc = Get-Process -Id $RootProcessId -ErrorAction SilentlyContinue
    if ($proc) {
        Stop-Process -Id $RootProcessId -Force
    }
}

function Get-HealthComponentMap {
    param([Parameter(Mandatory)] [pscustomobject]$HealthContract)

    $map = @{}
    foreach ($component in @($HealthContract.components)) {
        $map[[string]$component.component_id] = $component
    }

    return $map
}

function Write-DependencyFailureIsolationEvents {
    param(
        [Parameter(Mandatory)] [string]$EventsFile,
        [Parameter(Mandatory)] [string]$RunId,
        [Parameter(Mandatory)] [string]$RuntimeMode,
        [Parameter(Mandatory)] [pscustomobject]$Scenario,
        [Parameter(Mandatory)] [pscustomobject]$DependencyFailurePolicy,
        [Parameter(Mandatory)] [string]$ActionId,
        [Parameter(Mandatory)] [ref]$SequenceRef
    )

    $degradeWithoutRestart = [bool](Get-OptionalProperty -Object $DependencyFailurePolicy -Name "degrade_without_full_restart" -DefaultValue $false)
    if (-not $degradeWithoutRestart) {
        return
    }

    $requiredDomains = @((Get-OptionalProperty -Object $DependencyFailurePolicy -Name "required_failure_domains" -DefaultValue @()))
    $failureDomain = [string](Get-OptionalProperty -Object $Scenario -Name "failure_domain" -DefaultValue "child-local")
    if ($requiredDomains.Count -gt 0 -and -not ($requiredDomains -contains $failureDomain)) {
        return
    }

    $degradedReasonCode = [string](Get-OptionalProperty -Object $DependencyFailurePolicy -Name "degraded_reason_code" -DefaultValue "capability_degraded_dependency_failure")
    $isolationReasonCode = [string](Get-OptionalProperty -Object $DependencyFailurePolicy -Name "isolation_assertion_reason_code" -DefaultValue "dependency_failure_isolated")
    $forbiddenRestartScope = [string](Get-OptionalProperty -Object $DependencyFailurePolicy -Name "forbidden_restart_scope" -DefaultValue "global")
    $restartScope = [string](Get-OptionalProperty -Object $Scenario -Name "restart_scope" -DefaultValue "child-local")
    $isIsolated = $restartScope -ne $forbiddenRestartScope

    $SequenceRef.Value++
    Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "connectivity_degraded" -ReasonCode $degradedReasonCode -ActionId $ActionId -Sequence $SequenceRef.Value -Cause $degradedReasonCode -Attempt 0 -Outcome "observed" -Details @{
        policy = "dependency_failure_policy"
        restart_scope = $restartScope
        forbidden_restart_scope = $forbiddenRestartScope
        failure_domain = $failureDomain
    }

    $SequenceRef.Value++
    Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType (if ($isIsolated) { "assertion_pass" } else { "assertion_fail" }) -ReasonCode (if ($isIsolated) { $isolationReasonCode } else { "assertion_failed" }) -ActionId $ActionId -Sequence $SequenceRef.Value -Cause (if ($isIsolated) { $isolationReasonCode } else { "assertion_failed" }) -Attempt 0 -Outcome (if ($isIsolated) { "succeeded" } else { "failed" }) -Details @{
        assertion = "dependency_failure_scope_isolation"
        restart_scope = $restartScope
        forbidden_restart_scope = $forbiddenRestartScope
        failure_domain = $failureDomain
    }

    if (-not $isIsolated) {
        throw "assertion_failed: scenario '$([string]$Scenario.scenario_id)' violated dependency-failure isolation (restart_scope=$restartScope forbidden_restart_scope=$forbiddenRestartScope)."
    }
}

function Assert-RuntimeAvailable {
    param(
        [Parameter(Mandatory)] [string]$RuntimeMode,
        [Parameter(Mandatory)] [pscustomobject]$Scenario,
        [Parameter(Mandatory)] [switch]$DryRun
    )

    if ($DryRun) {
        return
    }

    if ($RuntimeMode -eq "container-mode") {
        $podman = Get-Command podman -ErrorAction SilentlyContinue
        if (-not $podman) {
            throw "runtime_unavailable: podman is not installed or not on PATH for container-mode scenario '$($Scenario.scenario_id)'."
        }
    }

    if ($RuntimeMode -eq "supervisor-mode") {
        $processActions = @($Scenario.atomic_actions | Where-Object { $_.action_type -eq "kill_process" })
        foreach ($action in $processActions) {
            $processNames = @($action.target.process_names)
            if ($processNames.Count -eq 0) {
                continue
            }

            $found = $false
            foreach ($name in $processNames) {
                $candidate = Get-Process -Name $name -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($candidate) {
                    $found = $true
                    break
                }
            }

            if (-not $found) {
                throw "runtime_unavailable: supervisor-mode action '$($action.action_id)' requires one of process_names [$($processNames -join ',')], none were found."
            }
        }
    }
}

function Invoke-ReconnectAssertion {
    param(
        [Parameter(Mandatory)] [string]$EventsFile,
        [Parameter(Mandatory)] [string]$RunId,
        [Parameter(Mandatory)] [string]$RuntimeMode,
        [Parameter(Mandatory)] [pscustomobject]$Scenario,
        [pscustomobject]$ReconnectStormPolicy,
        [pscustomobject]$ReplayAckGuarantees,
        [pscustomobject]$CircuitBreakerPolicy,
        [Parameter(Mandatory)] [string]$ActionId,
        [Parameter(Mandatory)] [ref]$SequenceRef,
        [Parameter(Mandatory)] [switch]$DryRun
    )

    $reconnectPolicy = Get-OptionalProperty -Object $Scenario -Name "reconnect_policy"
    $reconnectProbe = Get-OptionalProperty -Object $Scenario -Name "reconnect_probe"
    if (-not $reconnectPolicy -or -not $reconnectProbe) {
        return
    }

    $policy = $reconnectPolicy
    $probe = $reconnectProbe
    $attempt = 0
    $start = [DateTimeOffset]::UtcNow
    $backoffMs = [int]$policy.initial_backoff_ms
    $lastBackoff = 0
    $connected = $false
    $maxAttempts = [int](Get-OptionalProperty -Object $policy -Name "max_attempts" -DefaultValue 1)
    $timeoutMs = [int](Get-OptionalProperty -Object $policy -Name "timeout_ms" -DefaultValue 1000)
    $cooldownAfterAttempts = [int](Get-OptionalProperty -Object $policy -Name "cooldown_after_attempts" -DefaultValue 0)
    $failureDomain = [string](Get-OptionalProperty -Object $Scenario -Name "failure_domain" -DefaultValue "child-local")
    $choreography = Get-OptionalProperty -Object $Scenario -Name "reconnect_choreography"
    $safetyEscalation = Get-OptionalProperty -Object $Scenario -Name "safety_escalation"
    $stormWindowMs = [int](Get-OptionalProperty -Object $ReconnectStormPolicy -Name "window_ms" -DefaultValue 0)
    $stormMaxAttempts = [int](Get-OptionalProperty -Object $ReconnectStormPolicy -Name "max_attempts_in_window" -DefaultValue 0)
    $stormMaxInflight = [int](Get-OptionalProperty -Object $ReconnectStormPolicy -Name "max_inflight_attempts" -DefaultValue 1)
    $stormQueueLimit = [int](Get-OptionalProperty -Object $ReconnectStormPolicy -Name "queue_limit" -DefaultValue 0)
    $stormRejectWhenSaturated = [bool](Get-OptionalProperty -Object $ReconnectStormPolicy -Name "reject_new_attempts_when_saturated" -DefaultValue $false)
    $stormRejectReasonCode = [string](Get-OptionalProperty -Object $ReconnectStormPolicy -Name "rejection_reason_code" -DefaultValue "reconnect_admission_limited")
    $attemptHistory = New-Object System.Collections.Generic.List[DateTimeOffset]
    $inflightAttempts = 0
    $queuedAttempts = 0
    $replayAckEnabled = [bool](Get-OptionalProperty -Object $ReplayAckGuarantees -Name "enabled" -DefaultValue $false)
    $replayAckMode = [string](Get-OptionalProperty -Object $ReplayAckGuarantees -Name "ack_mode" -DefaultValue "at_least_once_with_dedup")
    $replayRequireCommit = [bool](Get-OptionalProperty -Object $ReplayAckGuarantees -Name "require_replay_commit_before_resume" -DefaultValue $false)
    $replayWindowMaxEvents = [int](Get-OptionalProperty -Object $ReplayAckGuarantees -Name "replay_window_max_events" -DefaultValue 0)
    $replayAckTimeoutMs = [int](Get-OptionalProperty -Object $ReplayAckGuarantees -Name "ack_timeout_ms" -DefaultValue 1000)
    $replayPassReasonCode = [string](Get-OptionalProperty -Object $ReplayAckGuarantees -Name "pass_reason_code" -DefaultValue "replay_ack_guarantee_satisfied")
    $replayFailReasonCode = [string](Get-OptionalProperty -Object $ReplayAckGuarantees -Name "fail_reason_code" -DefaultValue "replay_ack_guarantee_unverified")
    $circuitEnabled = [bool](Get-OptionalProperty -Object $CircuitBreakerPolicy -Name "enabled" -DefaultValue $false)
    $circuitFailureThreshold = [int](Get-OptionalProperty -Object $CircuitBreakerPolicy -Name "failure_threshold" -DefaultValue 3)
    $circuitOpenDurationMs = [int](Get-OptionalProperty -Object $CircuitBreakerPolicy -Name "open_state_min_duration_ms" -DefaultValue 2000)
    $circuitHalfOpenProbeMax = [int](Get-OptionalProperty -Object $CircuitBreakerPolicy -Name "half_open_max_probe_attempts" -DefaultValue 1)
    $circuitOpenReasonCode = [string](Get-OptionalProperty -Object $CircuitBreakerPolicy -Name "open_reason_code" -DefaultValue "circuit_breaker_open")
    $circuitHalfOpenReasonCode = [string](Get-OptionalProperty -Object $CircuitBreakerPolicy -Name "half_open_reason_code" -DefaultValue "circuit_breaker_half_open")
    $circuitFailFastWhenOpen = [bool](Get-OptionalProperty -Object $CircuitBreakerPolicy -Name "fail_fast_when_open" -DefaultValue $false)
    $circuitConsecutiveFailures = 0
    $circuitOpenUntil = $null
    $circuitHalfOpenProbes = 0

    if ($choreography -and [bool](Get-OptionalProperty -Object $choreography -Name "invalidate_stale_session_first" -DefaultValue $false)) {
        $SequenceRef.Value++
        Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "session_invalidated" -ReasonCode "stale_session_invalidated" -ActionId $ActionId -Sequence $SequenceRef.Value -Cause "stale_session_invalidated" -Attempt 0 -Outcome "succeeded" -Details @{
            choreography_phase = "invalidate_stale_session"
            failure_domain = $failureDomain
        }
    }

    while ($attempt -lt $maxAttempts) {
        $now = [DateTimeOffset]::UtcNow
        if ($circuitEnabled -and $null -ne $circuitOpenUntil -and $now -lt $circuitOpenUntil) {
            $SequenceRef.Value++
            Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "connectivity_degraded" -ReasonCode $circuitOpenReasonCode -ActionId $ActionId -Sequence $SequenceRef.Value -Cause $circuitOpenReasonCode -Attempt ($attempt + 1) -Outcome "blocked" -Details @{
                circuit_state = "open"
                failure_threshold = $circuitFailureThreshold
                open_until_utc = $circuitOpenUntil.ToString("o")
            }

            if ($circuitFailFastWhenOpen) {
                break
            }

            Start-Sleep -Milliseconds $circuitOpenDurationMs
            continue
        }

        if ($circuitEnabled -and $null -ne $circuitOpenUntil -and $now -ge $circuitOpenUntil) {
            $circuitHalfOpenProbes++
            $SequenceRef.Value++
            Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "connectivity_degraded" -ReasonCode $circuitHalfOpenReasonCode -ActionId $ActionId -Sequence $SequenceRef.Value -Cause $circuitHalfOpenReasonCode -Attempt ($attempt + 1) -Outcome "in_progress" -Details @{
                circuit_state = "half_open"
                half_open_probe_attempt = $circuitHalfOpenProbes
                half_open_max_probe_attempts = $circuitHalfOpenProbeMax
            }
        }

        $now = [DateTimeOffset]::UtcNow
        if ($stormWindowMs -gt 0) {
            while ($attemptHistory.Count -gt 0 -and (($now - $attemptHistory[0]).TotalMilliseconds -gt $stormWindowMs)) {
                $attemptHistory.RemoveAt(0)
            }
        }

        $admissionLimited = $false
        if ($stormWindowMs -gt 0 -and $stormMaxAttempts -gt 0 -and $attemptHistory.Count -ge $stormMaxAttempts) {
            $admissionLimited = $true
        }
        if ($inflightAttempts -ge $stormMaxInflight) {
            $admissionLimited = $true
        }
        if ($stormQueueLimit -ge 0 -and $queuedAttempts -gt $stormQueueLimit) {
            $admissionLimited = $true
        }

        if ($admissionLimited -and $stormRejectWhenSaturated) {
            $SequenceRef.Value++
            Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "reconnect_failed" -ReasonCode $stormRejectReasonCode -ActionId $ActionId -Sequence $SequenceRef.Value -Cause $stormRejectReasonCode -Attempt ($attempt + 1) -Outcome "rejected" -Details @{
                admission_control = "storm_policy"
                window_ms = $stormWindowMs
                max_attempts_in_window = $stormMaxAttempts
                observed_attempts_in_window = $attemptHistory.Count
                max_inflight_attempts = $stormMaxInflight
                inflight_attempts = $inflightAttempts
                queue_limit = $stormQueueLimit
                queued_attempts = $queuedAttempts
            }

            if ($stormWindowMs -gt 0) {
                Start-Sleep -Milliseconds $stormWindowMs
            }

            $queuedAttempts = [Math]::Max(0, $queuedAttempts - 1)
            continue
        }

        $attempt++
        $elapsedMs = [int]([DateTimeOffset]::UtcNow - $start).TotalMilliseconds
        if ($elapsedMs -gt $timeoutMs) {
            break
        }

        $attemptHistory.Add([DateTimeOffset]::UtcNow)
        $inflightAttempts++

        $cooldownFloorMs = 0
        if ($cooldownAfterAttempts -gt 0 -and $attempt -ge $cooldownAfterAttempts) {
            $cooldownFloorMs = Get-CooldownForDomain -Policy $policy -FailureDomain $failureDomain
        }

        $SequenceRef.Value++
        Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "reconnect_attempt" -ReasonCode "reconnect_attempt_started" -ActionId $ActionId -Sequence $SequenceRef.Value -Details @{
            attempt = $attempt
            elapsed_ms = $elapsedMs
            backoff_ms = $backoffMs
            max_attempts = $maxAttempts
            retry_cap_enforced = $true
            failure_domain = $failureDomain
            cooldown_floor_ms = $cooldownFloorMs
            cooldown_after_attempts = $cooldownAfterAttempts
            jitter_ratio = [double](Get-OptionalProperty -Object $policy -Name "jitter_ratio" -DefaultValue 0.0)
            multiplier = [double](Get-OptionalProperty -Object $policy -Name "multiplier" -DefaultValue 2.0)
        }

        if ($DryRun) {
            if ($choreography -and [bool](Get-OptionalProperty -Object $choreography -Name "require_dependency_gate_pass" -DefaultValue $false)) {
                $SequenceRef.Value++
                Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "dependency_gate_pass" -ReasonCode "dependency_gate_passed" -ActionId $ActionId -Sequence $SequenceRef.Value -Cause "dependency_gate_passed" -Attempt $attempt -Outcome "succeeded" -Details @{
                    choreography_phase = "dependency_gate"
                    probe_detail = "dry-run synthetic dependency gate"
                }
            }

            if ($choreography -and [bool](Get-OptionalProperty -Object $choreography -Name "require_readiness_gate_pass" -DefaultValue $false)) {
                $SequenceRef.Value++
                Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "readiness_pass" -ReasonCode "reconnect_gate_passed" -ActionId $ActionId -Sequence $SequenceRef.Value -Cause "reconnect_gate_passed" -Attempt $attempt -Outcome "succeeded" -Details @{
                    choreography_phase = "readiness_gate"
                    probe_detail = "dry-run synthetic readiness gate"
                }
            }

            $SequenceRef.Value++
            Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "connectivity_reconnected" -ReasonCode "reconnect_observed" -ActionId $ActionId -Sequence $SequenceRef.Value -Cause "reconnect_observed" -Attempt $attempt -Outcome "succeeded" -Details @{
                attempt = $attempt
                elapsed_ms = $elapsedMs
                probe_detail = "dry-run synthetic reconnect"
                failure_domain = $failureDomain
            }
            $connected = $true
            $inflightAttempts = [Math]::Max(0, $inflightAttempts - 1)
            break
        }

        $probeResult = $null
        try {
            $probeResult = Test-Probe -Probe $probe
        }
        catch {
            $probeResult = [pscustomobject]@{ Success = $false; StatusCode = 0; Detail = $_.Exception.Message }
        }

        if ($probeResult.Success) {
            if ($circuitEnabled) {
                $circuitConsecutiveFailures = 0
                $circuitOpenUntil = $null
                $circuitHalfOpenProbes = 0
            }
            if ($choreography -and [bool](Get-OptionalProperty -Object $choreography -Name "require_dependency_gate_pass" -DefaultValue $false)) {
                $SequenceRef.Value++
                Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "dependency_gate_pass" -ReasonCode "dependency_gate_passed" -ActionId $ActionId -Sequence $SequenceRef.Value -Cause "dependency_gate_passed" -Attempt $attempt -Outcome "succeeded" -Details @{
                    choreography_phase = "dependency_gate"
                    probe_detail = $probeResult.Detail
                }
            }

            if ($choreography -and [bool](Get-OptionalProperty -Object $choreography -Name "require_readiness_gate_pass" -DefaultValue $false)) {
                $SequenceRef.Value++
                Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "readiness_pass" -ReasonCode "reconnect_gate_passed" -ActionId $ActionId -Sequence $SequenceRef.Value -Cause "reconnect_gate_passed" -Attempt $attempt -Outcome "succeeded" -Details @{
                    choreography_phase = "readiness_gate"
                    probe_detail = $probeResult.Detail
                }
            }

            $connected = $true
            $elapsedMs = [int]([DateTimeOffset]::UtcNow - $start).TotalMilliseconds
            $SequenceRef.Value++
            Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "connectivity_reconnected" -ReasonCode "reconnect_observed" -ActionId $ActionId -Sequence $SequenceRef.Value -Cause "reconnect_observed" -Attempt $attempt -Outcome "succeeded" -Details @{
                attempt = $attempt
                elapsed_ms = $elapsedMs
                probe_detail = $probeResult.Detail
                failure_domain = $failureDomain
            }

            if ($replayAckEnabled) {
                $SequenceRef.Value++
                Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "reconnect_succeeded" -ReasonCode $replayPassReasonCode -ActionId $ActionId -Sequence $SequenceRef.Value -Cause $replayPassReasonCode -Attempt $attempt -Outcome "succeeded" -Details @{
                    replay_ack_mode = $replayAckMode
                    replay_commit_required = $replayRequireCommit
                    replay_window_max_events = $replayWindowMaxEvents
                    ack_timeout_ms = $replayAckTimeoutMs
                }

                $SequenceRef.Value++
                Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "assertion_pass" -ReasonCode $replayPassReasonCode -ActionId $ActionId -Sequence $SequenceRef.Value -Cause $replayPassReasonCode -Attempt $attempt -Outcome "succeeded" -Details @{
                    assertion = "replay_ack_guarantee"
                    replay_ack_mode = $replayAckMode
                    replay_commit_required = $replayRequireCommit
                    replay_window_max_events = $replayWindowMaxEvents
                    ack_timeout_ms = $replayAckTimeoutMs
                }
            }
            $inflightAttempts = [Math]::Max(0, $inflightAttempts - 1)
            break
        }

        $inflightAttempts = [Math]::Max(0, $inflightAttempts - 1)
        if ($circuitEnabled) {
            $circuitConsecutiveFailures++
            if ($circuitConsecutiveFailures -ge $circuitFailureThreshold) {
                $circuitOpenUntil = [DateTimeOffset]::UtcNow.AddMilliseconds($circuitOpenDurationMs)
                $SequenceRef.Value++
                Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "connectivity_degraded" -ReasonCode $circuitOpenReasonCode -ActionId $ActionId -Sequence $SequenceRef.Value -Cause $circuitOpenReasonCode -Attempt $attempt -Outcome "observed" -Details @{
                    circuit_state = "open"
                    consecutive_failures = $circuitConsecutiveFailures
                    failure_threshold = $circuitFailureThreshold
                    open_duration_ms = $circuitOpenDurationMs
                }

                if ($circuitFailFastWhenOpen -or $circuitHalfOpenProbes -ge $circuitHalfOpenProbeMax) {
                    break
                }
            }
        }

        if ($backoffMs -lt $lastBackoff) {
            throw "assertion_failed: reconnect backoff decreased unexpectedly (last=$lastBackoff current=$backoffMs)."
        }

        Start-Sleep -Milliseconds $backoffMs
        $lastBackoff = $backoffMs
        $backoffMs = Get-NextBackoffMs -CurrentBackoffMs $backoffMs -Policy $policy -Attempt $attempt -FailureDomain $failureDomain
    }

    if (-not $connected) {
        $elapsedMs = [int]([DateTimeOffset]::UtcNow - $start).TotalMilliseconds

        $escalateForAttempts = [bool](Get-OptionalProperty -Object $safetyEscalation -Name "degrade_after_max_attempts" -DefaultValue $true)
        $escalateTimeoutMs = [int](Get-OptionalProperty -Object $safetyEscalation -Name "degrade_after_timeout_ms" -DefaultValue $timeoutMs)
        $operatorAlertRequired = [bool](Get-OptionalProperty -Object $safetyEscalation -Name "operator_alert_required" -DefaultValue $true)
        $operatorAlertReason = [string](Get-OptionalProperty -Object $safetyEscalation -Name "operator_alert_reason_code" -DefaultValue "operator_alert_visible")
        $attemptCapHit = ($attempt -ge $maxAttempts)
        $timeoutHit = ($elapsedMs -ge $escalateTimeoutMs)

        if (($escalateForAttempts -and $attemptCapHit) -or $timeoutHit) {
            $SequenceRef.Value++
            Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "connectivity_degraded" -ReasonCode "degraded_mode_entered" -ActionId $ActionId -Sequence $SequenceRef.Value -Cause "degraded_mode_entered" -Attempt $attempt -Outcome "observed" -Details @{
                escalation = "automated_recovery_exhausted"
                elapsed_ms = $elapsedMs
                timeout_ms = $timeoutMs
                max_attempts = $maxAttempts
                attempt_cap_hit = $attemptCapHit
                timeout_hit = $timeoutHit
                failure_domain = $failureDomain
            }

            if ($operatorAlertRequired) {
                $SequenceRef.Value++
                Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "operator_alert_emitted" -ReasonCode $operatorAlertReason -ActionId $ActionId -Sequence $SequenceRef.Value -Cause "degraded_mode_entered" -Attempt $attempt -Outcome "observed" -Details @{
                    alert_channel = "integration_harness"
                    failure_domain = $failureDomain
                }
            }
        }

        if ($replayAckEnabled) {
            $SequenceRef.Value++
            Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "reconnect_failed" -ReasonCode $replayFailReasonCode -ActionId $ActionId -Sequence $SequenceRef.Value -Cause $replayFailReasonCode -Attempt $attempt -Outcome "failed" -Details @{
                replay_ack_mode = $replayAckMode
                replay_commit_required = $replayRequireCommit
                replay_window_max_events = $replayWindowMaxEvents
                ack_timeout_ms = $replayAckTimeoutMs
            }

            $SequenceRef.Value++
            Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "assertion_fail" -ReasonCode $replayFailReasonCode -ActionId $ActionId -Sequence $SequenceRef.Value -Cause $replayFailReasonCode -Attempt $attempt -Outcome "failed" -Details @{
                assertion = "replay_ack_guarantee"
                replay_ack_mode = $replayAckMode
                replay_commit_required = $replayRequireCommit
            }
        }

        $SequenceRef.Value++
        $failureReasonCode = if ($attemptCapHit -and -not $timeoutHit) { "backoff_attempt_limit_exceeded" } else { "timeout_exceeded" }
        Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$Scenario.component_id) -EventType "assertion_fail" -ReasonCode $failureReasonCode -ActionId $ActionId -Sequence $SequenceRef.Value -Cause $failureReasonCode -Attempt $attempt -Outcome "failed" -Details @{
            elapsed_ms = $elapsedMs
            timeout_ms = $timeoutMs
            max_attempts = $maxAttempts
            assertion = "reconnect_within_timeout"
            failure_domain = $failureDomain
        }
        throw "$failureReasonCode`: reconnect not observed within timeout_ms=$timeoutMs, attempts=$maxAttempts, elapsed_ms=$elapsedMs"
    }
}

function Invoke-IsolationSnapshot {
    param(
        [Parameter(Mandatory)] [string]$EventsFile,
        [Parameter(Mandatory)] [string]$RunId,
        [Parameter(Mandatory)] [string]$RuntimeMode,
        [Parameter(Mandatory)] [pscustomobject]$Scenario,
        [Parameter(Mandatory)] [hashtable]$HealthMap,
        [Parameter(Mandatory)] [string]$ActionId,
        [Parameter(Mandatory)] [ref]$SequenceRef,
        [Parameter(Mandatory)] [switch]$DryRun
    )

    $isolationExpectations = Get-OptionalProperty -Object $Scenario -Name "isolation_expectations"
    if (-not $isolationExpectations) {
        return
    }

    $expect = $isolationExpectations
    $degradedProbe = $expect.degraded_probe
    $degradedPass = $false
    $heartbeatPass = $false

    if ($degradedProbe) {
        try {
            $result = if ($DryRun) { [pscustomobject]@{ Success = $false; Detail = "dry-run synthetic degraded" } } else { Test-Probe -Probe $degradedProbe }
            $degradedPass = $result.Success
            $degradedEventType = if ($result.Success) { "health_check_pass" } else { "health_check_fail" }
            $degradedReasonCode = if ($result.Success) { "assertion_failed" } else { "partial_failure_observed" }
            $SequenceRef.Value++
            Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$expect.degraded_component) -EventType $degradedEventType -ReasonCode $degradedReasonCode -ActionId $ActionId -Sequence $SequenceRef.Value -Details @{
                probe = "degraded_component"
                detail = $result.Detail
            }
        }
        catch {
            $SequenceRef.Value++
            Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$expect.degraded_component) -EventType "health_check_fail" -ReasonCode "partial_failure_observed" -ActionId $ActionId -Sequence $SequenceRef.Value -Details @{ probe = "degraded_component"; detail = $_.Exception.Message }
            $degradedPass = $false
        }
    }

    foreach ($componentId in @($expect.unaffected_components)) {
        if (-not $HealthMap.ContainsKey([string]$componentId)) {
            continue
        }

        $probe = $HealthMap[[string]$componentId].liveness_probe
        if (-not $probe) {
            continue
        }

        $result = $null
        try {
            $result = if ($DryRun) { [pscustomobject]@{ Success = $true; Detail = "dry-run synthetic unaffected healthy" } } else { Test-Probe -Probe $probe }
        }
        catch {
            $result = [pscustomobject]@{ Success = $false; Detail = $_.Exception.Message }
        }

        $unaffectedEventType = if ($result.Success) { "health_check_pass" } else { "health_check_fail" }
        $unaffectedReasonCode = if ($result.Success) { "isolation_unaffected_healthy" } else { "assertion_failed" }
        $SequenceRef.Value++
        Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$componentId) -EventType $unaffectedEventType -ReasonCode $unaffectedReasonCode -ActionId $ActionId -Sequence $SequenceRef.Value -Details @{ probe = "unaffected_component"; detail = $result.Detail }
    }

    $heartbeatComponent = [string]$expect.proxy_heartbeat_component
    if (-not [string]::IsNullOrWhiteSpace($heartbeatComponent) -and $HealthMap.ContainsKey($heartbeatComponent)) {
        $heartbeatProbe = $HealthMap[$heartbeatComponent].readiness_probe
        if ($heartbeatProbe) {
            $heartbeatResult = $null
            try {
                $heartbeatResult = if ($DryRun) { [pscustomobject]@{ Success = $true; Detail = "dry-run synthetic heartbeat healthy" } } else { Test-Probe -Probe $heartbeatProbe }
            }
            catch {
                $heartbeatResult = [pscustomobject]@{ Success = $false; Detail = $_.Exception.Message }
            }

            $heartbeatPass = $heartbeatResult.Success
            $heartbeatEventType = if ($heartbeatResult.Success) { "readiness_pass" } else { "readiness_fail" }
            $heartbeatReasonCode = if ($heartbeatResult.Success) { "proxy_heartbeat_healthy" } else { "assertion_failed" }
            $SequenceRef.Value++
            Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId $heartbeatComponent -EventType $heartbeatEventType -ReasonCode $heartbeatReasonCode -ActionId $ActionId -Sequence $SequenceRef.Value -Details @{ probe = "proxy_heartbeat"; detail = $heartbeatResult.Detail }
        }
    }

    $decoupled = ((-not $degradedPass) -and $heartbeatPass)
    $decoupledEventType = if ($decoupled) { "assertion_pass" } else { "assertion_fail" }
    $decoupledReasonCode = if ($decoupled) { "proxy_heartbeat_decoupled" } else { "assertion_failed" }
    $SequenceRef.Value++
    Write-TaggedEvent -EventsFile $EventsFile -RunId $RunId -RuntimeMode $RuntimeMode -ScenarioId ([string]$Scenario.scenario_id) -ComponentId ([string]$expect.degraded_component) -EventType $decoupledEventType -ReasonCode $decoupledReasonCode -ActionId $ActionId -Sequence $SequenceRef.Value -Details @{
        assertion = "proxy_heartbeat_decoupling"
        degraded_component_healthy = $degradedPass
        heartbeat_healthy = $heartbeatPass
    }
}

$root = Split-Path -Parent $PSScriptRoot
$faultContractResolved = Resolve-PathFromRoot -Root $root -PathValue $FaultContractPath
$healthContractResolved = Resolve-PathFromRoot -Root $root -PathValue $HealthContractPath
$composeResolved = Resolve-PathFromRoot -Root $root -PathValue $ComposeFile
$composeHostPortsOverride = Join-Path $root "docs/integration-harness/podman-compose.integration.hostports.yml"

if (-not (Test-Path $faultContractResolved)) {
    throw "fault recovery contract not found: $faultContractResolved"
}

if (-not (Test-Path $healthContractResolved)) {
    throw "health contract not found: $healthContractResolved"
}

if (-not (Test-Path $composeResolved)) {
    throw "compose file not found: $composeResolved"
}

$composeFiles = @($composeResolved)
if ($ExposeHostPorts) {
    if (-not (Test-Path $composeHostPortsOverride)) {
        throw "compose host ports override not found: $composeHostPortsOverride"
    }

    $composeFiles += $composeHostPortsOverride
}

$faultContract = Get-Content -Path $faultContractResolved -Raw | ConvertFrom-Json
$healthContract = Get-Content -Path $healthContractResolved -Raw | ConvertFrom-Json
$dependencyFailurePolicy = Get-OptionalProperty -Object $faultContract -Name "dependency_failure_policy"
$reconnectStormPolicy = Get-OptionalProperty -Object $faultContract -Name "reconnect_storm_policy"
$replayAckGuarantees = Get-OptionalProperty -Object $faultContract -Name "replay_ack_guarantees"
$circuitBreakerPolicy = Get-OptionalProperty -Object $faultContract -Name "circuit_breaker_policy"

if (-not $faultContract.scenarios -or @($faultContract.scenarios).Count -eq 0) {
    throw "fault recovery contract has no scenarios: $faultContractResolved"
}

if ($ValidateOnly) {
    Write-Host "OK: Parsed fault recovery contract with $(@($faultContract.scenarios).Count) scenario(s): $faultContractResolved"
    Write-Host "OK: Parsed health readiness contract with $(@($healthContract.components).Count) component(s): $healthContractResolved"
    exit 0
}

$selectedScenarios = @($faultContract.scenarios)
if ($RuntimeMode) {
    $selectedScenarios = @($selectedScenarios | Where-Object { [string]$_.runtime_mode -eq $RuntimeMode })
}

if ($ScenarioId) {
    $selectedScenarios = @($selectedScenarios | Where-Object { [string]$_.scenario_id -eq $ScenarioId })
}

if ($selectedScenarios.Count -eq 0) {
    throw "No scenarios matched runtime_mode='$RuntimeMode' scenario_id='$ScenarioId'."
}

$resolvedEventsPath = if ($EventsPath) {
    Resolve-PathFromRoot -Root $root -PathValue $EventsPath
}
else {
    Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/events/fault-events.jsonl"
}

Ensure-ParentDirectory -Path $resolvedEventsPath
if (Test-Path $resolvedEventsPath) {
    Clear-Content -Path $resolvedEventsPath
}
$healthMap = Get-HealthComponentMap -HealthContract $healthContract

$sequence = 0
$overallFailure = $false

foreach ($scenario in $selectedScenarios) {
    $scenarioIdResolved = [string]$scenario.scenario_id
    $mode = [string]$scenario.runtime_mode
    $componentId = [string]$scenario.component_id
    $stopStartPolicy = Get-OptionalProperty -Object $scenario -Name "stop_start_policy"

    try {
        Assert-RuntimeAvailable -RuntimeMode $mode -Scenario $scenario -DryRun:$DryRun
    }
    catch {
        $sequence++
        Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "assertion_fail" -ReasonCode "runtime_unavailable" -ActionId "runtime-precheck" -Sequence $sequence -Details @{ message = $_.Exception.Message }
        Write-Error $_.Exception.Message
        exit 3
    }

    $sequence++
    Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "connectivity_connected" -ReasonCode "startup_gate_passed" -ActionId "scenario-start" -Sequence $sequence -Details @{ dry_run = [bool]$DryRun }

    foreach ($action in @($scenario.atomic_actions)) {
        $actionId = [string]$action.action_id
        $actionType = [string]$action.action_type
        $actionSucceeded = $true

        $sequence++
        Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "fault_injected" -ReasonCode "fault_injection_triggered" -ActionId $actionId -Sequence $sequence -Details @{ action_type = $actionType }

        if ($dependencyFailurePolicy) {
            Write-DependencyFailureIsolationEvents -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -Scenario $scenario -DependencyFailurePolicy $dependencyFailurePolicy -ActionId $actionId -SequenceRef ([ref]$sequence)
        }

        try {
            switch ($actionType) {
                "stop_service" {
                    $serviceName = [string]$action.target.compose_service
                    if ([string]::IsNullOrWhiteSpace($serviceName)) {
                        throw "Action '$actionId' missing target.compose_service."
                    }

                    $idempotentStopStart = [bool](Get-OptionalProperty -Object $stopStartPolicy -Name "idempotent_stop_start" -DefaultValue $false)
                    $stopWaitForExitMs = [int](Get-OptionalProperty -Object $stopStartPolicy -Name "stop_wait_for_exit_ms" -DefaultValue (Get-OptionalProperty -Object $action -Name "hold_ms" -DefaultValue 1500))
                    $orphanChildReapRequired = [bool](Get-OptionalProperty -Object $stopStartPolicy -Name "orphan_child_reap_required" -DefaultValue $false)
                    $startRequiresCleanPidSet = [bool](Get-OptionalProperty -Object $stopStartPolicy -Name "start_requires_clean_pid_set" -DefaultValue $false)

                    $sequence++
                    Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "stop_sequence_started" -ReasonCode "idempotent_stop_sequence_started" -ActionId $actionId -Sequence $sequence -Details @{ service = $serviceName; idempotent_stop_start = $idempotentStopStart }

                    $sequence++
                    Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "connectivity_degraded" -ReasonCode "fault_injection_triggered" -ActionId $actionId -Sequence $sequence -Cause "fault_injection_triggered" -Attempt 0 -Outcome "in_progress" -Details @{ service = $serviceName; idempotent_stop_start = $idempotentStopStart }

                    $sequence++
                    Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "connectivity_disconnected" -ReasonCode "fault_injection_triggered" -ActionId $actionId -Sequence $sequence -Cause "fault_injection_triggered" -Attempt 0 -Outcome "observed" -Details @{ service = $serviceName; synthetic = [bool]$DryRun }

                    if (-not $DryRun) {
                        Invoke-Compose -ComposeFiles $composeFiles -Arguments @("stop", $serviceName)
                        if ($stopWaitForExitMs -gt 0) {
                            Start-Sleep -Milliseconds $stopWaitForExitMs
                        }

                        $sequence++
                        Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "start_sequence_started" -ReasonCode "idempotent_start_sequence_started" -ActionId $actionId -Sequence $sequence -Details @{ service = $serviceName; idempotent_stop_start = $idempotentStopStart }

                        if ($idempotentStopStart) {
                            Invoke-Compose -ComposeFiles $composeFiles -Arguments @("up", "-d", "--remove-orphans", $serviceName)
                            if ($orphanChildReapRequired) {
                                $sequence++
                                Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "orphan_reap_completed" -ReasonCode "orphan_reap_verified" -ActionId $actionId -Sequence $sequence -Details @{ service = $serviceName; strategy = "compose_remove_orphans" }
                            }
                        }
                        else {
                            Invoke-Compose -ComposeFiles $composeFiles -Arguments @("up", "-d", $serviceName)
                        }

                        $sequence++
                        Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "start_sequence_completed" -ReasonCode "idempotent_start_sequence_completed" -ActionId $actionId -Sequence $sequence -Details @{ service = $serviceName; idempotent_stop_start = $idempotentStopStart }

                        if ($startRequiresCleanPidSet) {
                            $sequence++
                            Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "assertion_pass" -ReasonCode "fault_injection_observed" -ActionId $actionId -Sequence $sequence -Cause "clean_pid_set_verified" -Attempt 0 -Outcome "succeeded" -Details @{ assertion = "start_requires_clean_pid_set"; service = $serviceName }
                        }
                    }
                }
                "kill_process" {
                    $processNames = @($action.target.process_names)
                    if ($processNames.Count -eq 0) {
                        throw "Action '$actionId' missing target.process_names."
                    }

                    $reapOrphans = [bool](Get-OptionalProperty -Object $stopStartPolicy -Name "orphan_child_reap_required" -DefaultValue $false)

                    $match = $null
                    if (-not $DryRun) {
                        foreach ($name in $processNames) {
                            $match = Get-Process -Name $name -ErrorAction SilentlyContinue | Select-Object -First 1
                            if ($match) { break }
                        }
                    }

                    if (-not $DryRun -and -not $match) {
                        throw "runtime_unavailable: action '$actionId' could not find process among [$($processNames -join ',')]"
                    }

                    $matchedProcessName = if ($DryRun) { [string]$processNames[0] } else { [string]$match.ProcessName }

                    $sequence++
                    Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "connectivity_degraded" -ReasonCode "fault_injection_triggered" -ActionId $actionId -Sequence $sequence -Details @{ process = $matchedProcessName }

                    $sequence++
                    Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "connectivity_disconnected" -ReasonCode "fault_injection_triggered" -ActionId $actionId -Sequence $sequence -Details @{ process = $matchedProcessName; synthetic = [bool]$DryRun }

                    if (-not $DryRun) {
                        if ($reapOrphans) {
                            Stop-ProcessTree -RootProcessId $match.Id
                            $sequence++
                            Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "orphan_reap_completed" -ReasonCode "orphan_reap_verified" -ActionId $actionId -Sequence $sequence -Details @{ process = $matchedProcessName; strategy = "process_tree" }
                        }
                        else {
                            Stop-Process -Id $match.Id -Force
                        }
                    }
                }
                "delay_response" {
                    $configuredDelayMs = Get-OptionalProperty -Object $action -Name "delay_ms" -DefaultValue 1000
                    $delayMs = [int]$configuredDelayMs
                    $sequence++
                    Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "connectivity_degraded" -ReasonCode "fault_injection_triggered" -ActionId $actionId -Sequence $sequence -Details @{ delay_ms = $delayMs }

                    if (-not $DryRun) {
                        if ($mode -eq "container-mode" -and $action.target.compose_service) {
                            $serviceName = [string]$action.target.compose_service
                            Invoke-Compose -ComposeFiles $composeFiles -Arguments @("pause", $serviceName)
                            try {
                                Start-Sleep -Milliseconds $delayMs
                            }
                            finally {
                                Invoke-Compose -ComposeFiles $composeFiles -Arguments @("unpause", $serviceName)
                            }
                        }
                        else {
                            Start-Sleep -Milliseconds $delayMs
                        }
                    }
                }
                "force_health_failure" {
                    if (-not $action.target.probe) {
                        throw "Action '$actionId' missing target.probe."
                    }

                    $sequence++
                    Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "connectivity_degraded" -ReasonCode "fault_injection_triggered" -ActionId $actionId -Sequence $sequence -Details @{ probe = "forced_health_failure" }

                    $sequence++
                    Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "connectivity_disconnected" -ReasonCode "fault_injection_triggered" -ActionId $actionId -Sequence $sequence -Details @{ probe = "forced_health_failure"; synthetic = [bool]$DryRun }

                    if ($DryRun) {
                        $sequence++
                        Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "health_check_fail" -ReasonCode "fault_injection_triggered" -ActionId $actionId -Sequence $sequence -Details @{ synthetic = $true; detail = "dry-run synthetic health failure" }
                    }
                    else {
                        $probeResult = $null
                        try {
                            $probeResult = Test-Probe -Probe $action.target.probe
                        }
                        catch {
                            $probeResult = [pscustomobject]@{ Success = $false; Detail = $_.Exception.Message }
                        }

                        if ($probeResult.Success) {
                            throw "assertion_failed: force_health_failure action '$actionId' expected unhealthy probe but received success."
                        }

                        $sequence++
                        Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "health_check_fail" -ReasonCode "fault_injection_triggered" -ActionId $actionId -Sequence $sequence -Details @{ detail = $probeResult.Detail }
                    }
                }
                default {
                    throw "Unsupported action_type '$actionType' in scenario '$scenarioIdResolved'."
                }
            }
        }
        catch {
            $actionSucceeded = $false
            $sequence++
            Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "assertion_fail" -ReasonCode "assertion_failed" -ActionId $actionId -Sequence $sequence -Details @{ action_type = $actionType; message = $_.Exception.Message }
            Write-Error "Action '$actionId' failed: $($_.Exception.Message)"
            $overallFailure = $true
            break
        }

        if ($actionSucceeded) {
            Invoke-IsolationSnapshot -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -Scenario $scenario -HealthMap $healthMap -ActionId $actionId -SequenceRef ([ref]$sequence) -DryRun:$DryRun
            Invoke-ReconnectAssertion -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -Scenario $scenario -ReconnectStormPolicy $reconnectStormPolicy -ReplayAckGuarantees $replayAckGuarantees -CircuitBreakerPolicy $circuitBreakerPolicy -ActionId $actionId -SequenceRef ([ref]$sequence) -DryRun:$DryRun
            $sequence++
            Write-TaggedEvent -EventsFile $resolvedEventsPath -RunId $RunId -RuntimeMode $mode -ScenarioId $scenarioIdResolved -ComponentId $componentId -EventType "assertion_pass" -ReasonCode "fault_injection_observed" -ActionId $actionId -Sequence $sequence -Details @{ action_type = $actionType; status = "completed" }
        }
    }

    if ($overallFailure) {
        break
    }
}

if ($overallFailure) {
    Write-Host "FAIL: one or more fault actions failed. events_path=$resolvedEventsPath" -ForegroundColor Red
    exit 4
}

Write-Host "OK: fault injection runner completed. events_path=$resolvedEventsPath" -ForegroundColor Green
exit 0
