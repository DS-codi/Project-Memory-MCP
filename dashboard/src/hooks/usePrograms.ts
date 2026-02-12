import { useQuery } from '@tanstack/react-query';
import type { ProgramSummary, ProgramDetail } from '@/types';

const API_BASE = '/api';

export async function fetchPrograms(workspaceId: string): Promise<{ programs: ProgramSummary[] }> {
  const res = await fetch(`${API_BASE}/programs/${workspaceId}`);
  if (!res.ok) throw new Error('Failed to fetch programs');
  return res.json();
}

export async function fetchProgramDetail(
  workspaceId: string,
  programId: string,
): Promise<ProgramDetail> {
  const res = await fetch(`${API_BASE}/programs/${workspaceId}/${programId}`);
  if (!res.ok) throw new Error('Failed to fetch program detail');
  return res.json();
}

export function usePrograms(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['programs', workspaceId],
    queryFn: () => fetchPrograms(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useProgram(workspaceId: string | undefined, programId: string | undefined) {
  return useQuery({
    queryKey: ['program', workspaceId, programId],
    queryFn: () => fetchProgramDetail(workspaceId!, programId!),
    enabled: !!workspaceId && !!programId,
  });
}
