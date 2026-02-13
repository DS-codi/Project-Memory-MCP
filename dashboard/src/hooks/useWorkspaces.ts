import { useQuery } from '@tanstack/react-query';
import type { WorkspaceSummary, WorkspaceMeta } from '@/types';

const API_BASE = '/api';

export async function fetchWorkspaces(): Promise<{ workspaces: WorkspaceSummary[]; total: number }> {
  const res = await fetch(`${API_BASE}/workspaces?hierarchical=true`);
  if (!res.ok) throw new Error('Failed to fetch workspaces');
  return res.json();
}

export async function fetchWorkspace(id: string): Promise<WorkspaceMeta> {
  const res = await fetch(`${API_BASE}/workspaces/${id}`);
  if (!res.ok) throw new Error('Failed to fetch workspace');
  return res.json();
}

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: fetchWorkspaces,
  });
}

export function useWorkspace(id: string | undefined) {
  return useQuery({
    queryKey: ['workspace', id],
    queryFn: () => fetchWorkspace(id!),
    enabled: !!id,
  });
}
