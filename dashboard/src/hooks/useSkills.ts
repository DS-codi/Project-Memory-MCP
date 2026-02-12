import { useQuery } from '@tanstack/react-query';
import type { SkillInfo } from '@/types';

const API_BASE = '/api';

export async function fetchSkills(workspaceId: string): Promise<{ skills: SkillInfo[] }> {
  const res = await fetch(`${API_BASE}/skills/${workspaceId}`);
  if (!res.ok) throw new Error('Failed to fetch skills');
  return res.json();
}

export async function fetchSkillContent(
  workspaceId: string,
  skillName: string,
): Promise<{ content: string }> {
  const res = await fetch(`${API_BASE}/skills/${workspaceId}/${encodeURIComponent(skillName)}`);
  if (!res.ok) throw new Error('Failed to fetch skill content');
  return res.json();
}

export function useSkills(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['skills', workspaceId],
    queryFn: () => fetchSkills(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useSkillContent(workspaceId: string | undefined, skillName: string | undefined) {
  return useQuery({
    queryKey: ['skillContent', workspaceId, skillName],
    queryFn: () => fetchSkillContent(workspaceId!, skillName!),
    enabled: !!workspaceId && !!skillName,
  });
}
