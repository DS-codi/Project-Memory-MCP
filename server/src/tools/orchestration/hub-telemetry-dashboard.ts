import { getRecentEvents, type MCPEvent } from '../../events/event-emitter.js';
import { getAllWorkspaceSessions } from '../../db/workspace-session-registry-db.js';

export interface HubTelemetrySnapshot {
  generated_at: string;
  window_since: string;
  window_hours: number;
  mode_selection_accuracy: {
    total_decisions: number;
    blocked_decisions: number;
    accuracy_percent: number;
  };
  transition_frequency: {
    transitions: number;
    per_100_decisions: number;
  };
  alias_usage_decay: {
    legacy_alias_count: number;
    canonical_mode_count: number;
    alias_usage_percent: number;
    by_label: Record<string, number>;
  };
  blocked_step_rate: {
    blocked_steps: number;
    total_step_updates: number;
    rate_percent: number;
  };
  handoff_churn: {
    handoff_events: number;
    distinct_plans: number;
    average_handoffs_per_plan: number;
  };
  prompt_analyst: {
    applied_count: number;
    expected_count: number;
    enrichment_hit_rate_percent: number;
    avg_latency_ms: number | null;
    p95_latency_ms: number | null;
    outcomes: {
      rerun: number;
      reuse: number;
      fallback: number;
    };
  };
  cross_session_conflict_detection: {
    conflict_events: number;
    total_routes: number;
    rate_percent: number;
  };
  session_registry_accuracy: {
    active_count: number;
    completed_count: number;
    stale_active_count: number;
    stale_active_rate_percent: number;
    stale_threshold_minutes: number;
  };
}

export interface HubPromotionGateBaseline {
  blocked_step_rate_percent: number;
  average_handoffs_per_plan: number;
}

export interface HubPromotionGateThresholds {
  min_prompt_analyst_hit_rate_percent: number;
  max_cross_session_conflict_rate_percent: number;
}

export interface HubPromotionGateResult {
  passed: boolean;
  actual: number | boolean | null;
  expected: number | boolean | null;
  comparator: '>=' | '<=' | '<' | '==';
  detail: string;
}

export interface HubPromotionGatesReport {
  passed: boolean;
  evaluated_at: string;
  thresholds: HubPromotionGateThresholds;
  baseline_used: HubPromotionGateBaseline | null;
  scenario_parity_passed: boolean;
  gates: {
    scenario_parity: HubPromotionGateResult;
    blocker_rate_non_regression: HubPromotionGateResult;
    handoff_churn_reduction: HubPromotionGateResult;
    prompt_analyst_hit_rate: HubPromotionGateResult;
    cross_session_conflict_rate: HubPromotionGateResult;
  };
  blockers: string[];
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(2));
}

function eventData(event: MCPEvent): Record<string, unknown> {
  if (event.data && typeof event.data === 'object') {
    return event.data;
  }
  return {};
}

export async function buildHubTelemetrySnapshot(
  workspaceId: string,
  options?: { window_hours?: number; stale_threshold_minutes?: number; event_limit?: number }
): Promise<HubTelemetrySnapshot> {
  const windowHours = Math.max(1, Math.floor(options?.window_hours ?? 24));
  const staleThresholdMinutes = Math.max(5, Math.floor(options?.stale_threshold_minutes ?? 30));
  const eventLimit = Math.max(200, Math.floor(options?.event_limit ?? 5000));
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const allEvents = await getRecentEvents(eventLimit, since);
  const events = allEvents.filter((event) => event.workspace_id === workspaceId);

  const routingEvents = events.filter((event) => event.type === 'hub_routing_decision');
  const policyBlockedEvents = events.filter((event) => event.type === 'hub_policy_blocked');
  const stepUpdates = events.filter((event) => event.type === 'step_updated');
  const handoffs = events.filter((event) => event.type === 'handoff');
  const conflicts = events.filter((event) => event.type === 'session_scope_conflict');
  const promptAnalystEvents = events.filter((event) => event.type === 'prompt_analyst_enrichment');

  let transitionCount = 0;
  let legacyAliasCount = 0;
  const aliasByLabel: Record<string, number> = {};
  let promptAppliedCount = 0;
  let promptExpectedCount = 0;
  const promptOutcomeCounts = {
    rerun: 0,
    reuse: 0,
    fallback: 0,
  };
  const latencies: number[] = [];

  for (const event of routingEvents) {
    const data = eventData(event);
    const transitionEvent = data.transition_event;
    if (typeof transitionEvent === 'string' && transitionEvent.trim().length > 0) {
      transitionCount += 1;
    }

    if (data.alias_resolution_applied === true) {
      legacyAliasCount += 1;
      const label = typeof data.requested_hub_label === 'string' ? data.requested_hub_label : 'unknown';
      aliasByLabel[label] = (aliasByLabel[label] ?? 0) + 1;
    }

    const targetAgentType = typeof data.target_agent_type === 'string' ? data.target_agent_type : null;
    if (targetAgentType && targetAgentType !== 'Analyst') {
      promptExpectedCount += 1;
      if (data.prompt_analyst_enrichment_applied === true) {
        promptAppliedCount += 1;
      }
    }

    const latency = safeNumber(data.prompt_analyst_latency_ms);
    if (latency !== null && latency >= 0) {
      latencies.push(latency);
    }

    const outcome = typeof data.prompt_analyst_outcome === 'string'
      ? data.prompt_analyst_outcome
      : undefined;
    if (outcome === 'rerun' || outcome === 'reuse' || outcome === 'fallback') {
      promptOutcomeCounts[outcome] += 1;
    }
  }

  for (const event of promptAnalystEvents) {
    const data = eventData(event);
    const latency = safeNumber(data.latency_ms);
    if (latency !== null && latency >= 0) {
      latencies.push(latency);
    }

    const outcome = typeof data.outcome_label === 'string'
      ? data.outcome_label
      : typeof data.prompt_analyst_outcome === 'string'
        ? data.prompt_analyst_outcome
        : undefined;
    if (outcome === 'rerun' || outcome === 'reuse' || outcome === 'fallback') {
      promptOutcomeCounts[outcome] += 1;
    }
  }

  const blockedSteps = stepUpdates.filter((event) => {
    const data = eventData(event);
    return data.newStatus === 'blocked';
  }).length;

  const handoffPlanIds = new Set(
    handoffs
      .map((event) => event.plan_id)
      .filter((planId): planId is string => typeof planId === 'string' && planId.length > 0)
  );

  const registryRows = getAllWorkspaceSessions(workspaceId);
  const now = Date.now();
  const staleCutoff = staleThresholdMinutes * 60 * 1000;
  const activeRows = registryRows.filter((row) => row.status === 'active');
  const completedRows = registryRows.filter((row) => row.status === 'completed');
  const staleActiveRows = activeRows.filter((row) => {
    const updatedAt = Date.parse(row.updated_at);
    if (!Number.isFinite(updatedAt)) return true;
    return now - updatedAt > staleCutoff;
  });

  const blockedDecisions = policyBlockedEvents.length;
  const totalDecisions = routingEvents.length;

  return {
    generated_at: new Date().toISOString(),
    window_since: since,
    window_hours: windowHours,
    mode_selection_accuracy: {
      total_decisions: totalDecisions,
      blocked_decisions: blockedDecisions,
      accuracy_percent: pct(Math.max(0, totalDecisions - blockedDecisions), totalDecisions),
    },
    transition_frequency: {
      transitions: transitionCount,
      per_100_decisions: Number(((transitionCount / Math.max(1, totalDecisions)) * 100).toFixed(2)),
    },
    alias_usage_decay: {
      legacy_alias_count: legacyAliasCount,
      canonical_mode_count: Math.max(0, totalDecisions - legacyAliasCount),
      alias_usage_percent: pct(legacyAliasCount, totalDecisions),
      by_label: aliasByLabel,
    },
    blocked_step_rate: {
      blocked_steps: blockedSteps,
      total_step_updates: stepUpdates.length,
      rate_percent: pct(blockedSteps, stepUpdates.length),
    },
    handoff_churn: {
      handoff_events: handoffs.length,
      distinct_plans: handoffPlanIds.size,
      average_handoffs_per_plan:
        handoffPlanIds.size > 0 ? Number((handoffs.length / handoffPlanIds.size).toFixed(2)) : 0,
    },
    prompt_analyst: {
      applied_count: promptAppliedCount,
      expected_count: promptExpectedCount,
      enrichment_hit_rate_percent: pct(promptAppliedCount, promptExpectedCount),
      avg_latency_ms: average(latencies),
      p95_latency_ms: percentile(latencies, 95),
      outcomes: promptOutcomeCounts,
    },
    cross_session_conflict_detection: {
      conflict_events: conflicts.length,
      total_routes: totalDecisions,
      rate_percent: pct(conflicts.length, totalDecisions),
    },
    session_registry_accuracy: {
      active_count: activeRows.length,
      completed_count: completedRows.length,
      stale_active_count: staleActiveRows.length,
      stale_active_rate_percent: pct(staleActiveRows.length, activeRows.length),
      stale_threshold_minutes: staleThresholdMinutes,
    },
  };
}

export function evaluateHubPromotionGates(
  snapshot: HubTelemetrySnapshot,
  options?: {
    baseline?: HubPromotionGateBaseline;
    thresholds?: Partial<HubPromotionGateThresholds>;
    scenario_parity_passed?: boolean;
  }
): HubPromotionGatesReport {
  const thresholds: HubPromotionGateThresholds = {
    min_prompt_analyst_hit_rate_percent:
      options?.thresholds?.min_prompt_analyst_hit_rate_percent ?? 80,
    max_cross_session_conflict_rate_percent:
      options?.thresholds?.max_cross_session_conflict_rate_percent ?? 2,
  };

  const baseline = options?.baseline ?? null;
  const scenarioParityPassed = options?.scenario_parity_passed === true;

  const scenarioParityGate: HubPromotionGateResult = {
    passed: scenarioParityPassed,
    actual: scenarioParityPassed,
    expected: true,
    comparator: '==',
    detail: scenarioParityPassed
      ? 'Scenario parity suite is marked as passed.'
      : 'Scenario parity suite must pass before promotion.',
  };

  const blockerRateGate: HubPromotionGateResult = baseline
    ? {
      passed: snapshot.blocked_step_rate.rate_percent <= baseline.blocked_step_rate_percent,
      actual: snapshot.blocked_step_rate.rate_percent,
      expected: baseline.blocked_step_rate_percent,
      comparator: '<=',
      detail: 'Blocked-step rate must not regress above baseline.',
    }
    : {
      passed: false,
      actual: snapshot.blocked_step_rate.rate_percent,
      expected: null,
      comparator: '<=',
      detail: 'Baseline required for blocker-rate non-regression gate.',
    };

  const handoffChurnGate: HubPromotionGateResult = baseline
    ? {
      passed: snapshot.handoff_churn.average_handoffs_per_plan < baseline.average_handoffs_per_plan,
      actual: snapshot.handoff_churn.average_handoffs_per_plan,
      expected: baseline.average_handoffs_per_plan,
      comparator: '<',
      detail: 'Handoff churn must be lower than baseline (strict reduction).',
    }
    : {
      passed: false,
      actual: snapshot.handoff_churn.average_handoffs_per_plan,
      expected: null,
      comparator: '<',
      detail: 'Baseline required for handoff-churn reduction gate.',
    };

  const promptAnalystGate: HubPromotionGateResult = {
    passed:
      snapshot.prompt_analyst.enrichment_hit_rate_percent
      >= thresholds.min_prompt_analyst_hit_rate_percent,
    actual: snapshot.prompt_analyst.enrichment_hit_rate_percent,
    expected: thresholds.min_prompt_analyst_hit_rate_percent,
    comparator: '>=',
    detail: 'Prompt Analyst enrichment hit rate must meet the minimum threshold.',
  };

  const conflictRateGate: HubPromotionGateResult = {
    passed:
      snapshot.cross_session_conflict_detection.rate_percent
      <= thresholds.max_cross_session_conflict_rate_percent,
    actual: snapshot.cross_session_conflict_detection.rate_percent,
    expected: thresholds.max_cross_session_conflict_rate_percent,
    comparator: '<=',
    detail: 'Cross-session conflict detection rate must stay at or below threshold.',
  };

  const blockers: string[] = [];
  if (!scenarioParityGate.passed) blockers.push('scenario_parity_failed');
  if (!blockerRateGate.passed) blockers.push('blocker_rate_non_regression_failed');
  if (!handoffChurnGate.passed) blockers.push('handoff_churn_reduction_failed');
  if (!promptAnalystGate.passed) blockers.push('prompt_analyst_hit_rate_failed');
  if (!conflictRateGate.passed) blockers.push('cross_session_conflict_rate_failed');

  return {
    passed: blockers.length === 0,
    evaluated_at: new Date().toISOString(),
    thresholds,
    baseline_used: baseline,
    scenario_parity_passed: scenarioParityPassed,
    gates: {
      scenario_parity: scenarioParityGate,
      blocker_rate_non_regression: blockerRateGate,
      handoff_churn_reduction: handoffChurnGate,
      prompt_analyst_hit_rate: promptAnalystGate,
      cross_session_conflict_rate: conflictRateGate,
    },
    blockers,
  };
}