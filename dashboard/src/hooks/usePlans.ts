import { useQuery } from '@tanstack/react-query';
import type { PlanSummary, PlanState } from '@/types';

const API_BASE = '/api';

function toOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function comparePlansByUpdatedAt(a: PlanSummary, b: PlanSummary): number {
  const aTime = Number.isNaN(Date.parse(a.updated_at)) ? 0 : Date.parse(a.updated_at);
  const bTime = Number.isNaN(Date.parse(b.updated_at)) ? 0 : Date.parse(b.updated_at);
  if (aTime !== bTime) return bTime - aTime;
  return a.id.localeCompare(b.id);
}

export function partitionPlanSummaries(plans: PlanSummary[]): { activePlans: PlanSummary[]; archivedPlans: PlanSummary[] } {
  const sortedPlans = [...plans].sort(comparePlansByUpdatedAt);
  const activePlans: PlanSummary[] = [];
  const archivedPlans: PlanSummary[] = [];

  for (const plan of sortedPlans) {
    if (plan.status === 'archived') {
      archivedPlans.push(plan);
    } else {
      activePlans.push(plan);
    }
  }

  return { activePlans, archivedPlans };
}

export function normalizePlanSummaries(plans: PlanSummary[]): PlanSummary[] {
  const allPlanIds = new Set(plans.map((plan) => plan.id));
  const dependentsByPlanId = new Map<string, string[]>();

  for (const plan of plans) {
    const linkedIds =
      toOptionalStringArray(plan.linked_plan_ids)
      ?? toOptionalStringArray(plan.depends_on_plans)
      ?? toOptionalStringArray(plan.relationships?.linked_plan_ids)
      ?? [];
    for (const linkedId of linkedIds) {
      const dependents = dependentsByPlanId.get(linkedId) ?? [];
      dependents.push(plan.id);
      dependentsByPlanId.set(linkedId, dependents);
    }
  }

  return plans.map((plan) => {
    const childPlanIds =
      toOptionalStringArray(plan.child_plan_ids)
      ?? toOptionalStringArray(plan.relationships?.child_plan_ids)
      ?? [];
    const linkedPlanIds =
      toOptionalStringArray(plan.linked_plan_ids)
      ?? toOptionalStringArray(plan.depends_on_plans)
      ?? toOptionalStringArray(plan.relationships?.linked_plan_ids)
      ?? [];
    const dependentPlanIds = dependentsByPlanId.get(plan.id) ?? [];
    const unresolvedLinkedPlanIds = linkedPlanIds.filter((linkedId) => !allPlanIds.has(linkedId));
    const parentProgramId = plan.program_id ?? plan.relationships?.parent_program_id;

    const hasRelationships = Boolean(parentProgramId) || childPlanIds.length > 0 || linkedPlanIds.length > 0 || dependentPlanIds.length > 0;
    const relationshipState = !hasRelationships
      ? 'none'
      : unresolvedLinkedPlanIds.length > 0
        ? 'partial'
        : 'ready';

    return {
      ...plan,
      program_id: parentProgramId,
      child_plan_ids: childPlanIds,
      depends_on_plans: linkedPlanIds,
      linked_plan_ids: linkedPlanIds,
      relationships: {
        kind: plan.is_program ? 'program' : parentProgramId ? 'child' : 'standalone',
        parent_program_id: parentProgramId,
        child_plan_ids: childPlanIds,
        linked_plan_ids: linkedPlanIds,
        dependent_plan_ids: dependentPlanIds,
        unresolved_linked_plan_ids: unresolvedLinkedPlanIds,
        state: relationshipState,
      },
    };
  });
}

export async function fetchPlans(workspaceId: string): Promise<{ plans: PlanSummary[]; total: number }> {
  const res = await fetch(`${API_BASE}/plans/workspace/${workspaceId}`);
  if (!res.ok) throw new Error('Failed to fetch plans');
  const data = await res.json() as { plans?: PlanSummary[]; total?: number };
  const plans = normalizePlanSummaries(Array.isArray(data.plans) ? data.plans : []);
  return {
    plans,
    total: typeof data.total === 'number' ? data.total : plans.length,
  };
}

export async function fetchPlan(workspaceId: string, planId: string): Promise<PlanState> {
  const res = await fetch(`${API_BASE}/plans/${workspaceId}/${planId}`);
  if (!res.ok) throw new Error('Failed to fetch plan');
  return res.json();
}

export async function fetchLineage(workspaceId: string, planId: string) {
  const res = await fetch(`${API_BASE}/plans/${workspaceId}/${planId}/lineage`);
  if (!res.ok) throw new Error('Failed to fetch lineage');
  return res.json();
}

export function usePlans(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['plans', workspaceId],
    queryFn: () => fetchPlans(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function usePlan(workspaceId: string | undefined, planId: string | undefined) {
  return useQuery({
    queryKey: ['plan', workspaceId, planId],
    queryFn: () => fetchPlan(workspaceId!, planId!),
    enabled: !!workspaceId && !!planId,
  });
}
