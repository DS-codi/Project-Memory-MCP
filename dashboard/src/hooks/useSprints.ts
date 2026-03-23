import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = '/api';

// =============================================================================
// Types
// =============================================================================

export type SprintStatus = 'active' | 'completed' | 'archived';

export interface Goal {
  goal_id: string;
  sprint_id: string;
  description: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface Sprint {
  sprint_id: string;
  workspace_id: string;
  attached_plan_id: string | null;
  title: string;
  status: SprintStatus;
  goals: Goal[];
  created_at: string;
  updated_at: string;
}

export interface SprintSummary extends Sprint {
  goal_count: number;
  completed_goal_count: number;
  completion_percentage: number;
}

// =============================================================================
// Fetch Functions
// =============================================================================

export async function fetchSprints(
  workspaceId: string,
  includeArchived = false
): Promise<{ sprints: SprintSummary[]; count: number }> {
  const params = new URLSearchParams();
  if (includeArchived) params.set('includeArchived', 'true');
  const url = `${API_BASE}/sprints/workspace/${workspaceId}${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch sprints');
  return res.json();
}

export async function fetchSprint(sprintId: string): Promise<Sprint> {
  const res = await fetch(`${API_BASE}/sprints/${sprintId}`);
  if (!res.ok) throw new Error('Failed to fetch sprint');
  return res.json();
}

export async function createSprint(params: {
  workspace_id: string;
  title: string;
  goals?: string[];
  status?: SprintStatus;
}): Promise<Sprint> {
  const res = await fetch(`${API_BASE}/sprints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to create sprint');
  return res.json();
}

export async function updateSprint(
  sprintId: string,
  updates: { title?: string; status?: SprintStatus; goals?: string[] }
): Promise<Sprint> {
  const res = await fetch(`${API_BASE}/sprints/${sprintId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update sprint');
  return res.json();
}

export async function deleteSprint(sprintId: string, confirm = false): Promise<void> {
  const url = confirm
    ? `${API_BASE}/sprints/${sprintId}?confirm=true`
    : `${API_BASE}/sprints/${sprintId}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete sprint');
}

export async function addGoal(
  sprintId: string,
  description: string
): Promise<{ sprint: Sprint; goal: Goal }> {
  const res = await fetch(`${API_BASE}/sprints/${sprintId}/goals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) throw new Error('Failed to add goal');
  return res.json();
}

export async function completeGoal(
  sprintId: string,
  goalId: string
): Promise<{ sprint: Sprint; goal: Goal }> {
  const res = await fetch(`${API_BASE}/sprints/${sprintId}/goals/${goalId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed: true }),
  });
  if (!res.ok) throw new Error('Failed to complete goal');
  return res.json();
}

export async function removeGoal(sprintId: string, goalId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/sprints/${sprintId}/goals/${goalId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to remove goal');
}

// =============================================================================
// Query Hooks
// =============================================================================

export function useSprints(workspaceId: string | undefined, includeArchived = false) {
  return useQuery({
    queryKey: ['sprints', workspaceId, includeArchived],
    queryFn: () => fetchSprints(workspaceId!, includeArchived),
    enabled: !!workspaceId,
  });
}

export function useSprint(sprintId: string | undefined) {
  return useQuery({
    queryKey: ['sprint', sprintId],
    queryFn: () => fetchSprint(sprintId!),
    enabled: !!sprintId,
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

export function useCreateSprint(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { title: string; goals?: string[]; status?: SprintStatus }) =>
      createSprint({ workspace_id: workspaceId!, ...params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints', workspaceId] });
    },
  });
}

export function useUpdateSprint(workspaceId: string | undefined, sprintId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: { title?: string; status?: SprintStatus; goals?: string[] }) =>
      updateSprint(sprintId!, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprint', sprintId] });
      queryClient.invalidateQueries({ queryKey: ['sprints', workspaceId] });
    },
  });
}

export function useDeleteSprint(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { sprintId: string; confirm?: boolean }) =>
      deleteSprint(params.sprintId, params.confirm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints', workspaceId] });
    },
  });
}

export function useAddGoal(workspaceId: string | undefined, sprintId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (description: string) => addGoal(sprintId!, description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprint', sprintId] });
      queryClient.invalidateQueries({ queryKey: ['sprints', workspaceId] });
    },
  });
}

export function useCompleteGoal(workspaceId: string | undefined, sprintId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) => completeGoal(sprintId!, goalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprint', sprintId] });
      queryClient.invalidateQueries({ queryKey: ['sprints', workspaceId] });
    },
  });
}

export function useRemoveGoal(workspaceId: string | undefined, sprintId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) => removeGoal(sprintId!, goalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprint', sprintId] });
      queryClient.invalidateQueries({ queryKey: ['sprints', workspaceId] });
    },
  });
}
