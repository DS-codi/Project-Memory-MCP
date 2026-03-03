#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$RunId,
    [string]$FaultContractPath = "docs/integration-harness/contracts/fault-recovery.contract.json",
    [string]$EventsPath,
    [string]$OutputPath,
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

function Assert-TransitionSequence {
    param(
        [Parameter(Mandatory)] [string[]]$Expected,
        [Parameter(Mandatory)] [string[]]$Actual,
        [Parameter(Mandatory)] [string]$ScenarioId
    )

    if ($Expected.Count -eq 0) {
        throw "Scenario '$ScenarioId' has empty expected transition sequence."
    }

    $cursor = 0
    foreach ($actual in $Actual) {
        if ($actual -eq $Expected[$cursor]) {
            $cursor++
            if ($cursor -ge $Expected.Count) {
                return
            }
        }
    }

    throw "restart_sequence_mismatch: scenario '$ScenarioId' expected [$($Expected -join ' -> ')] but saw [$($Actual -join ' -> ')]"
}

function Get-ElapsedMilliseconds {
    param(
        [Parameter(Mandatory)] [pscustomobject]$StartEvent,
        [Parameter(Mandatory)] [pscustomobject]$EndEvent
    )

    $start = [DateTimeOffset]::Parse([string]$StartEvent.timestamp)
    $end = [DateTimeOffset]::Parse([string]$EndEvent.timestamp)
    return [int]($end - $start).TotalMilliseconds
}

function Get-CooldownFloorForDomain {
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

$root = Split-Path -Parent $PSScriptRoot
$contractResolved = Resolve-PathFromRoot -Root $root -PathValue $FaultContractPath

if (-not (Test-Path $contractResolved)) {
    throw "fault recovery contract not found: $contractResolved"
}

$eventsResolved = if ($EventsPath) {
    Resolve-PathFromRoot -Root $root -PathValue $EventsPath
}
else {
    Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/events/fault-events.jsonl"
}

if (-not (Test-Path $eventsResolved)) {
    throw "events file not found: $eventsResolved"
}

$outputResolved = if ($OutputPath) {
    Resolve-PathFromRoot -Root $root -PathValue $OutputPath
}
else {
    Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/assertions/recovery-assertions.json"
}

$contract = Get-Content -Path $contractResolved -Raw | ConvertFrom-Json
if (-not $contract.scenarios -or @($contract.scenarios).Count -eq 0) {
    throw "fault recovery contract has no scenarios."
}

$dependencyFailurePolicy = Get-OptionalProperty -Object $contract -Name "dependency_failure_policy"
$reconnectStormPolicy = Get-OptionalProperty -Object $contract -Name "reconnect_storm_policy"
$replayAckGuarantees = Get-OptionalProperty -Object $contract -Name "replay_ack_guarantees"
$circuitBreakerPolicy = Get-OptionalProperty -Object $contract -Name "circuit_breaker_policy"

if ($ValidateOnly) {
    Write-Host "OK: Parsed fault contract and found events path: $eventsResolved"
    exit 0
}

$events = @(
    Get-Content -Path $eventsResolved |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { $_ | ConvertFrom-Json }
)

if ($events.Count -eq 0) {
    throw "No events found in $eventsResolved"
}

$results = New-Object System.Collections.Generic.List[object]
$failed = $false

foreach ($scenario in @($contract.scenarios)) {
    $scenarioId = [string]$scenario.scenario_id
    $runtimeMode = [string]$scenario.runtime_mode
    $scenarioEvents = @($events | Where-Object { [string]$_.scenario_id -eq $scenarioId })

    if ($scenarioEvents.Count -eq 0) {
        $failed = $true
        $results.Add([pscustomobject]@{
            scenario_id = $scenarioId
            runtime_mode = $runtimeMode
            passed = $false
            reason = "assertion_failed"
            message = "No events produced for scenario."
        })
        continue
    }

    try {
        $transitionEvents = @(
            $scenarioEvents |
                Where-Object { [string]$_.event_type -in @("connectivity_connected", "connectivity_degraded", "connectivity_disconnected", "connectivity_reconnected") } |
                Sort-Object { [DateTimeOffset]::Parse([string]$_.timestamp) }
        )

        $actualTransitions = @($transitionEvents | ForEach-Object { [string]$_.event_type })
        $expectedTransitions = @($scenario.expected_transition_sequence)
        Assert-TransitionSequence -Expected $expectedTransitions -Actual $actualTransitions -ScenarioId $scenarioId

        $faultStart = $scenarioEvents | Where-Object { [string]$_.event_type -eq "fault_injected" } | Sort-Object { [DateTimeOffset]::Parse([string]$_.timestamp) } | Select-Object -First 1
        $reconnected = $scenarioEvents | Where-Object { [string]$_.event_type -eq "connectivity_reconnected" } | Sort-Object { [DateTimeOffset]::Parse([string]$_.timestamp) } | Select-Object -First 1
        if (-not $faultStart -or -not $reconnected) {
            throw "reconnect_missing_events: scenario '$scenarioId' missing fault_injected or connectivity_reconnected events."
        }

        $elapsedMs = Get-ElapsedMilliseconds -StartEvent $faultStart -EndEvent $reconnected
        $policy = $scenario.reconnect_policy
        if ($policy) {
            if ($elapsedMs -gt [int]$policy.timeout_ms) {
                throw "timeout_exceeded: scenario '$scenarioId' reconnect elapsed_ms=$elapsedMs timeout_ms=$($policy.timeout_ms)"
            }

            $attempts = @($scenarioEvents | Where-Object { [string]$_.event_type -eq "reconnect_attempt" }).Count
            if ($attempts -gt [int]$policy.max_attempts) {
                throw "backoff_attempt_limit_exceeded: scenario '$scenarioId' attempts=$attempts max_attempts=$($policy.max_attempts)"
            }

            $attemptEvents = @(
                $scenarioEvents |
                    Where-Object { [string]$_.event_type -eq "reconnect_attempt" } |
                    Sort-Object { [DateTimeOffset]::Parse([string]$_.timestamp) }
            )
            $lastBackoff = 0
            $cooldownAfterAttempts = [int](Get-OptionalProperty -Object $policy -Name "cooldown_after_attempts" -DefaultValue 0)
            $maxBackoffMs = [int](Get-OptionalProperty -Object $policy -Name "max_backoff_ms" -DefaultValue 120000)
            $failureDomain = [string](Get-OptionalProperty -Object $scenario -Name "failure_domain" -DefaultValue "child-local")
            $cooldownFloor = Get-CooldownFloorForDomain -Policy $policy -FailureDomain $failureDomain
            foreach ($attemptEvent in $attemptEvents) {
                $backoff = [int]$attemptEvent.details.backoff_ms
                if ($backoff -lt $lastBackoff) {
                    throw "backoff_not_monotonic: scenario '$scenarioId' backoff sequence decreased."
                }
                if ($backoff -gt $maxBackoffMs) {
                    throw "backoff_max_exceeded: scenario '$scenarioId' backoff_ms=$backoff max_backoff_ms=$maxBackoffMs"
                }
                if ($cooldownAfterAttempts -gt 0) {
                    $attemptNumber = [int](Get-OptionalProperty -Object $attemptEvent.details -Name "attempt" -DefaultValue 0)
                    if ($attemptNumber -ge $cooldownAfterAttempts -and $backoff -lt $cooldownFloor) {
                        throw "cooldown_floor_not_enforced: scenario '$scenarioId' backoff_ms=$backoff cooldown_floor_ms=$cooldownFloor failure_domain=$failureDomain"
                    }
                }
                $lastBackoff = $backoff
            }
        }

        if ($reconnectStormPolicy) {
            $stormWindowMs = [int](Get-OptionalProperty -Object $reconnectStormPolicy -Name "window_ms" -DefaultValue 0)
            $stormMaxAttempts = [int](Get-OptionalProperty -Object $reconnectStormPolicy -Name "max_attempts_in_window" -DefaultValue 0)
            $stormRejectReasonCode = [string](Get-OptionalProperty -Object $reconnectStormPolicy -Name "rejection_reason_code" -DefaultValue "reconnect_admission_limited")

            $attemptEvents = @(
                $scenarioEvents |
                    Where-Object { [string]$_.event_type -eq "reconnect_attempt" } |
                    Sort-Object { [DateTimeOffset]::Parse([string]$_.timestamp) }
            )

            if ($stormWindowMs -gt 0 -and $stormMaxAttempts -gt 0) {
                for ($i = 0; $i -lt $attemptEvents.Count; $i++) {
                    $windowStart = [DateTimeOffset]::Parse([string]$attemptEvents[$i].timestamp)
                    $windowCount = 1
                    for ($j = $i + 1; $j -lt $attemptEvents.Count; $j++) {
                        $nextTs = [DateTimeOffset]::Parse([string]$attemptEvents[$j].timestamp)
                        if (([int]($nextTs - $windowStart).TotalMilliseconds) -le $stormWindowMs) {
                            $windowCount++
                        }
                    }

                    if ($windowCount -gt $stormMaxAttempts) {
                        $rejectionEvent = $scenarioEvents |
                            Where-Object {
                                [string]$_.event_type -eq "reconnect_failed" -and
                                [string]$_.reason_code -eq $stormRejectReasonCode
                            } |
                            Select-Object -First 1
                        if (-not $rejectionEvent) {
                            throw "assertion_failed: scenario '$scenarioId' exceeded reconnect_storm_policy max_attempts_in_window=$stormMaxAttempts without '$stormRejectReasonCode' event."
                        }
                    }
                }
            }
        }

        if ($replayAckGuarantees -and [bool](Get-OptionalProperty -Object $replayAckGuarantees -Name "enabled" -DefaultValue $false)) {
            $replayPassReasonCode = [string](Get-OptionalProperty -Object $replayAckGuarantees -Name "pass_reason_code" -DefaultValue "replay_ack_guarantee_satisfied")

            $reconnected = $scenarioEvents |
                Where-Object { [string]$_.event_type -eq "connectivity_reconnected" } |
                Select-Object -First 1
            if ($reconnected) {
                $replayAssertion = $scenarioEvents |
                    Where-Object {
                        $details = Get-OptionalProperty -Object $_ -Name "details"
                        $assertionName = Get-OptionalProperty -Object $details -Name "assertion"
                        [string]$_.event_type -eq "assertion_pass" -and
                        [string]$_.reason_code -eq $replayPassReasonCode -and
                        [string]$assertionName -eq "replay_ack_guarantee"
                    } |
                    Select-Object -First 1
                if (-not $replayAssertion) {
                    throw "assertion_failed: scenario '$scenarioId' reconnected without replay/ack guarantee assertion '$replayPassReasonCode'."
                }
            }
        }

        if ($circuitBreakerPolicy -and [bool](Get-OptionalProperty -Object $circuitBreakerPolicy -Name "enabled" -DefaultValue $false)) {
            $circuitOpenReasonCode = [string](Get-OptionalProperty -Object $circuitBreakerPolicy -Name "open_reason_code" -DefaultValue "circuit_breaker_open")
            $failureThreshold = [int](Get-OptionalProperty -Object $circuitBreakerPolicy -Name "failure_threshold" -DefaultValue 3)

            $attemptEvents = @(
                $scenarioEvents |
                    Where-Object { [string]$_.event_type -eq "reconnect_attempt" } |
                    Sort-Object { [DateTimeOffset]::Parse([string]$_.timestamp) }
            )

            $openEvents = @(
                $scenarioEvents |
                    Where-Object {
                        [string]$_.event_type -eq "connectivity_degraded" -and
                        [string]$_.reason_code -eq $circuitOpenReasonCode
                    }
            )

            if ($attemptEvents.Count -ge $failureThreshold -and $openEvents.Count -eq 0) {
                throw "assertion_failed: scenario '$scenarioId' reached failure threshold $failureThreshold without circuit-breaker open event '$circuitOpenReasonCode'."
            }
        }

        $choreography = Get-OptionalProperty -Object $scenario -Name "reconnect_choreography"
        if ($choreography) {
            $orderedEvents = @($choreography.ordered_events)
            if ($orderedEvents.Count -gt 0) {
                $choreographyEvents = @(
                    $scenarioEvents |
                        Where-Object { [string]$_.event_type -in $orderedEvents } |
                        Sort-Object { [DateTimeOffset]::Parse([string]$_.timestamp) }
                )
                $actualChoreography = @($choreographyEvents | ForEach-Object { [string]$_.event_type })
                Assert-TransitionSequence -Expected $orderedEvents -Actual $actualChoreography -ScenarioId $scenarioId
            }

            if ([bool](Get-OptionalProperty -Object $choreography -Name "invalidate_stale_session_first" -DefaultValue $false)) {
                $invalidateEvent = $scenarioEvents | Where-Object { [string]$_.event_type -eq "session_invalidated" } | Sort-Object { [DateTimeOffset]::Parse([string]$_.timestamp) } | Select-Object -First 1
                if (-not $invalidateEvent) {
                    throw "assertion_failed: scenario '$scenarioId' missing session_invalidated event for stale-session invalidation choreography."
                }

                $firstReconnectAttempt = $scenarioEvents | Where-Object { [string]$_.event_type -eq "reconnect_attempt" } | Sort-Object { [DateTimeOffset]::Parse([string]$_.timestamp) } | Select-Object -First 1
                if ($firstReconnectAttempt) {
                    $invalidateTs = [DateTimeOffset]::Parse([string]$invalidateEvent.timestamp)
                    $reconnectTs = [DateTimeOffset]::Parse([string]$firstReconnectAttempt.timestamp)
                    if ($invalidateTs -gt $reconnectTs) {
                        throw "assertion_failed: scenario '$scenarioId' stale-session invalidation occurred after reconnect attempt."
                    }
                }
            }
        }

        $stopStartPolicy = Get-OptionalProperty -Object $scenario -Name "stop_start_policy"
        if ($stopStartPolicy -and [bool](Get-OptionalProperty -Object $stopStartPolicy -Name "idempotent_stop_start" -DefaultValue $false)) {
            $stopEvent = $scenarioEvents | Where-Object { [string]$_.event_type -eq "stop_sequence_started" } | Select-Object -First 1
            $startEvent = $scenarioEvents | Where-Object { [string]$_.event_type -eq "start_sequence_completed" } | Select-Object -First 1
            if (-not $stopEvent -or -not $startEvent) {
                throw "assertion_failed: scenario '$scenarioId' missing idempotent stop/start sequence evidence events."
            }

            $requireOrphanReap = [bool](Get-OptionalProperty -Object $stopStartPolicy -Name "orphan_child_reap_required" -DefaultValue $false)
            if ($requireOrphanReap) {
                $orphanReapEvent = $scenarioEvents | Where-Object { [string]$_.event_type -eq "orphan_reap_completed" } | Select-Object -First 1
                if (-not $orphanReapEvent) {
                    throw "assertion_failed: scenario '$scenarioId' requires orphan reaping but no orphan_reap_completed event was emitted."
                }
            }
        }

        if ($dependencyFailurePolicy) {
            $degradeWithoutRestart = [bool](Get-OptionalProperty -Object $dependencyFailurePolicy -Name "degrade_without_full_restart" -DefaultValue $false)
            $requiredDomains = @((Get-OptionalProperty -Object $dependencyFailurePolicy -Name "required_failure_domains" -DefaultValue @()))
            $failureDomain = [string](Get-OptionalProperty -Object $scenario -Name "failure_domain" -DefaultValue "child-local")
            $domainCovered = ($requiredDomains.Count -eq 0 -or ($requiredDomains -contains $failureDomain))

            if ($degradeWithoutRestart -and $domainCovered) {
                $degradedReasonCode = [string](Get-OptionalProperty -Object $dependencyFailurePolicy -Name "degraded_reason_code" -DefaultValue "capability_degraded_dependency_failure")
                $isolationReasonCode = [string](Get-OptionalProperty -Object $dependencyFailurePolicy -Name "isolation_assertion_reason_code" -DefaultValue "dependency_failure_isolated")
                $forbiddenRestartScope = [string](Get-OptionalProperty -Object $dependencyFailurePolicy -Name "forbidden_restart_scope" -DefaultValue "global")

                $degradeEvent = $scenarioEvents |
                    Where-Object {
                        [string]$_.event_type -eq "connectivity_degraded" -and
                        [string]$_.reason_code -eq $degradedReasonCode
                    } |
                    Select-Object -First 1
                if (-not $degradeEvent) {
                    throw "assertion_failed: scenario '$scenarioId' missing dependency-failure degraded event '$degradedReasonCode'."
                }

                $isolationEvent = $scenarioEvents |
                    Where-Object {
                        $details = Get-OptionalProperty -Object $_ -Name "details"
                        $assertionName = Get-OptionalProperty -Object $details -Name "assertion"
                        [string]$_.event_type -eq "assertion_pass" -and
                        [string]$_.reason_code -eq $isolationReasonCode -and
                        [string]$assertionName -eq "dependency_failure_scope_isolation"
                    } |
                    Select-Object -First 1
                if (-not $isolationEvent) {
                    throw "assertion_failed: scenario '$scenarioId' missing dependency-failure isolation assertion pass '$isolationReasonCode'."
                }

                $restartScope = [string](Get-OptionalProperty -Object $scenario -Name "restart_scope" -DefaultValue "child-local")
                if ($restartScope -eq $forbiddenRestartScope) {
                    throw "assertion_failed: scenario '$scenarioId' restart_scope '$restartScope' violates dependency_failure_policy forbidden_restart_scope '$forbiddenRestartScope'."
                }
            }
        }

        $isolationExpectations = Get-OptionalProperty -Object $scenario -Name "isolation_expectations"
        $isolationMatrix = $null
        if ($isolationExpectations) {
            $matrixRows = New-Object System.Collections.Generic.List[object]
            foreach ($componentId in @($isolationExpectations.unaffected_components)) {
                $componentEvents = @(
                    $scenarioEvents |
                        Where-Object {
                            $details = Get-OptionalProperty -Object $_ -Name "details"
                            $probe = Get-OptionalProperty -Object $details -Name "probe"
                            [string]$_.component_id -eq [string]$componentId -and
                            [string]$_.event_type -in @("health_check_pass", "health_check_fail") -and
                            [string]$probe -eq "unaffected_component"
                        } |
                        Sort-Object { [DateTimeOffset]::Parse([string]$_.timestamp) }
                )

                $latestComponentEvent = $componentEvents | Select-Object -Last 1
                $componentHealthy = $false
                if ($latestComponentEvent -and [string]$latestComponentEvent.event_type -eq "health_check_pass") {
                    $componentHealthy = $true
                }

                $matrixRows.Add([pscustomobject]@{
                    component_id = [string]$componentId
                    healthy = $componentHealthy
                    event_count = $componentEvents.Count
                    last_event_type = if ($latestComponentEvent) { [string]$latestComponentEvent.event_type } else { "missing" }
                })
            }

            $isolationMatrix = [pscustomobject]@{
                degraded_component = [string]$isolationExpectations.degraded_component
                unaffected_components = $matrixRows
            }

            $unhealthyComponents = @($matrixRows | Where-Object { $_.healthy -ne $true })
            if ($unhealthyComponents.Count -gt 0) {
                $unhealthyList = @($unhealthyComponents | ForEach-Object { [string]$_.component_id }) -join ", "
                throw "assertion_failed: scenario '$scenarioId' isolation matrix unhealthy components: $unhealthyList"
            }
        }

        $decouplingResult = $scenarioEvents | Where-Object {
            $details = Get-OptionalProperty -Object $_ -Name "details"
            $assertionName = Get-OptionalProperty -Object $details -Name "assertion"
            [string]$_.event_type -in @("assertion_pass", "assertion_fail") -and [string]$assertionName -eq "proxy_heartbeat_decoupling"
        } | Sort-Object { [DateTimeOffset]::Parse([string]$_.timestamp) } | Select-Object -Last 1
        if ($isolationExpectations -and -not $decouplingResult) {
            throw "assertion_failed: scenario '$scenarioId' missing proxy_heartbeat_decoupling assertion event."
        }

        if ($isolationExpectations -and [string]$decouplingResult.event_type -ne "assertion_pass") {
            throw "assertion_failed: scenario '$scenarioId' proxy-heartbeat decoupling assertion did not pass."
        }

        $safetyEscalation = Get-OptionalProperty -Object $scenario -Name "safety_escalation"
        if ($safetyEscalation) {
            $degradedEvent = $scenarioEvents | Where-Object {
                [string]$_.event_type -eq "connectivity_degraded" -and [string]$_.reason_code -eq "degraded_mode_entered"
            } | Sort-Object { [DateTimeOffset]::Parse([string]$_.timestamp) } | Select-Object -Last 1

            $recoveryExhausted = @(
                $scenarioEvents |
                    Where-Object {
                        [string]$_.event_type -eq "assertion_fail" -and
                        [string]$_.reason_code -in @("timeout_exceeded", "backoff_attempt_limit_exceeded")
                    }
            )

            if ($recoveryExhausted.Count -gt 0 -and -not $degradedEvent) {
                throw "assertion_failed: scenario '$scenarioId' exhausted automated recovery without degraded_mode_entered event."
            }

            if (-not [bool](Get-OptionalProperty -Object $safetyEscalation -Name "operator_alert_required" -DefaultValue $false)) {
                continue
            }

            $expectedAlertReason = [string](Get-OptionalProperty -Object $safetyEscalation -Name "operator_alert_reason_code" -DefaultValue "operator_alert_visible")
            $alertEvents = @(
                $scenarioEvents |
                    Where-Object {
                        [string]$_.event_type -eq "operator_alert_emitted" -and
                        [string]$_.reason_code -eq $expectedAlertReason
                    }
            )

            if ($recoveryExhausted.Count -gt 0 -and $alertEvents.Count -eq 0) {
                throw "assertion_failed: scenario '$scenarioId' required operator alert '$expectedAlertReason' after recovery escalation but none was emitted."
            }
        }

        $results.Add([pscustomobject]@{
            scenario_id = $scenarioId
            runtime_mode = $runtimeMode
            passed = $true
            reason = "reconnect_observed"
            elapsed_ms = $elapsedMs
            expected_transition_sequence = $expectedTransitions
            actual_transition_sequence = $actualTransitions
            reconnect_attempts = @($scenarioEvents | Where-Object { [string]$_.event_type -eq "reconnect_attempt" }).Count
            isolation_assertion = if ($decouplingResult) { [string]$decouplingResult.event_type } else { "n/a" }
            isolation_matrix = $isolationMatrix
        })
    }
    catch {
        $failed = $true
        $results.Add([pscustomobject]@{
            scenario_id = $scenarioId
            runtime_mode = $runtimeMode
            passed = $false
            reason = "assertion_failed"
            message = $_.Exception.Message
        })
    }
}

$summary = [ordered]@{
    run_id = $RunId
    generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    source_events = $eventsResolved
    scenario_count = @($contract.scenarios).Count
    pass_count = @($results | Where-Object { $_.passed -eq $true }).Count
    fail_count = @($results | Where-Object { $_.passed -eq $false }).Count
    results = $results
}

Ensure-ParentDirectory -Path $outputResolved
$summary | ConvertTo-Json -Depth 16 | Set-Content -Path $outputResolved

if ($failed) {
    Write-Host "FAIL: recovery assertions failed. output_path=$outputResolved" -ForegroundColor Red
    exit 5
}

Write-Host "OK: recovery assertions passed. output_path=$outputResolved" -ForegroundColor Green
exit 0
