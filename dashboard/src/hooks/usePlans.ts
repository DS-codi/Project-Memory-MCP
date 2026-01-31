import { useQuery } from '@tanstack/react-query';
import type { PlanSummary, PlanState } from '@/types';

const API_BASE = '/api';

export async function fetchPlans(workspaceId: string): Promise<{ plans: PlanSummary[]; total: number }> {
  const res = await fetch(`${API_BASE}/plans/workspace/${workspaceId}`);
  if (!res.ok) throw new Error('Failed to fetch plans');
  return res.json();
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
