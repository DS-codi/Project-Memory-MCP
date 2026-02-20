/**
 * Phase Helpers
 *
 * Utility functions to derive phase-level views from plan steps.
 * Used by PhaseListView and PhaseCard components.
 */

import type { PlanStep } from '@/types';
import type {
  PlanPhase,
  PhaseGroup,
  PhaseProgress,
  PhaseStatus,
  RiskSeverity,
  DifficultyLevel,
} from '@/types/schema-v2';

// =============================================================================
// Step Grouping
// =============================================================================

/**
 * Group plan steps by their phase string.
 * Optionally enriches each group with PlanPhase metadata when available.
 */
export function groupStepsByPhase(
  steps: PlanStep[],
  phaseMeta?: PlanPhase[],
): PhaseGroup[] {
  const phaseMap = new Map<string, PhaseGroup>();

  for (const step of steps) {
    const key = step.phase || 'Unphased';
    if (!phaseMap.has(key)) {
      phaseMap.set(key, { phase: key, steps: [], meta: undefined });
    }
    phaseMap.get(key)!.steps.push({
      index: step.index,
      task: step.task,
      status: step.status,
      type: step.type,
      assignee: step.assignee,
      notes: step.notes,
    });
  }

  // Attach v2 phase metadata when available
  if (phaseMeta) {
    const metaByName = new Map(phaseMeta.map((p) => [p.name, p]));
    for (const group of phaseMap.values()) {
      group.meta = metaByName.get(group.phase);
    }
  }

  return Array.from(phaseMap.values());
}

// =============================================================================
// Phase Status Computation
// =============================================================================

/**
 * Compute an aggregate status for a group of steps.
 */
export function computePhaseStatus(
  steps: Pick<PlanStep, 'status'>[],
): PhaseStatus {
  if (steps.length === 0) return 'pending';
  if (steps.every((s) => s.status === 'done')) return 'complete';
  if (steps.some((s) => s.status === 'blocked')) return 'blocked';
  if (steps.some((s) => s.status === 'active')) return 'active';
  return 'pending';
}

// =============================================================================
// Phase Progress
// =============================================================================

/**
 * Compute progress metrics for each phase group.
 */
export function getPhaseProgress(steps: PlanStep[]): PhaseProgress[] {
  const groups = groupStepsByPhase(steps);
  return groups.map((g) => {
    const done = g.steps.filter((s) => s.status === 'done').length;
    const total = g.steps.length;
    return {
      phase: g.phase,
      done,
      total,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  });
}

// =============================================================================
// Color Maps
// =============================================================================

/** Tailwind classes for risk severity badges. */
export const riskSeverityColors: Record<RiskSeverity, string> = {
  low: 'bg-green-500/20 text-green-300 border-green-500/50',
  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
  critical: 'bg-red-500/20 text-red-300 border-red-500/50',
};

/** Tailwind classes for difficulty level badges. */
export const difficultyColors: Record<DifficultyLevel, string> = {
  trivial: 'bg-gray-500/20 text-gray-300 border-gray-500/50',
  easy: 'bg-green-500/20 text-green-300 border-green-500/50',
  moderate: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
  hard: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
  extreme: 'bg-red-500/20 text-red-300 border-red-500/50',
};
