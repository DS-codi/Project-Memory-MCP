import { useMemo } from 'react';
import { groupStepsByPhase } from '@/utils/phase-helpers';
import type { PlanState } from '@/types';
import type { PhaseGroup } from '@/types/schema-v2';

// =============================================================================
// Return type
// =============================================================================

interface UsePlanPhasesResult {
  /** Steps grouped by phase, enriched with v2 metadata when available */
  phaseGroups: PhaseGroup[];
  /** True when the plan has v2 PlanPhase metadata */
  hasV2Phases: boolean;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Derives phase groups from a PlanState.
 *
 * Groups plan steps by their `phase` string and, when the plan
 * includes v2 `phases` metadata, attaches criteria, required agents,
 * and approval gate info to each group.
 */
export function usePlanPhases(plan: PlanState | null | undefined): UsePlanPhasesResult {
  return useMemo(() => {
    if (!plan || !plan.steps || plan.steps.length === 0) {
      return { phaseGroups: [], hasV2Phases: false };
    }

    const hasV2 = Array.isArray(plan.phases) && plan.phases.length > 0;
    const groups = groupStepsByPhase(plan.steps, hasV2 ? plan.phases : undefined);

    return {
      phaseGroups: groups,
      hasV2Phases: hasV2,
    };
  }, [plan]);
}
