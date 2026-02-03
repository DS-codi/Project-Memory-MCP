import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BuildScript } from '@/types';

const API_BASE = '/api';

// ========================================
// Hook: useBuildScripts (Step 25)
// ========================================

interface UseBuildScriptsParams {
  workspaceId: string;
  planId: string;
}

export function useBuildScripts({ workspaceId, planId }: UseBuildScriptsParams) {
  return useQuery({
    queryKey: ['buildScripts', workspaceId, planId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/plans/${planId}/build-scripts`);
      if (!res.ok) throw new Error('Failed to fetch build scripts');
      const data = await res.json();
      return data.scripts as BuildScript[];
    },
    enabled: !!workspaceId && !!planId,
  });
}

// ========================================
// Hook: useAddBuildScript (Step 26)
// ========================================

interface AddBuildScriptParams {
  workspaceId: string;
  planId: string;
  script: {
    name: string;
    description: string;
    command: string;
    directory: string;
    mcp_handle?: string;
  };
}

export function useAddBuildScript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workspaceId, planId, script }: AddBuildScriptParams) => {
      const res = await fetch(`${API_BASE}/plans/${planId}/build-scripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(script),
      });
      if (!res.ok) throw new Error('Failed to add build script');
      return res.json();
    },
    onMutate: async ({ workspaceId, planId, script }) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: ['buildScripts', workspaceId, planId] });

      // Snapshot previous value
      const previousScripts = queryClient.getQueryData<BuildScript[]>(['buildScripts', workspaceId, planId]);

      // Optimistically update
      if (previousScripts) {
        const optimisticScript: BuildScript = {
          id: `temp-${Date.now()}`,
          ...script,
          workspace_id: workspaceId,
          plan_id: planId,
          created_at: new Date().toISOString(),
        };
        queryClient.setQueryData<BuildScript[]>(
          ['buildScripts', workspaceId, planId],
          [...previousScripts, optimisticScript]
        );
      }

      return { previousScripts };
    },
    onError: (err, { workspaceId, planId }, context) => {
      // Rollback on error
      if (context?.previousScripts) {
        queryClient.setQueryData(['buildScripts', workspaceId, planId], context.previousScripts);
      }
    },
    onSettled: (_, __, { workspaceId, planId }) => {
      queryClient.invalidateQueries({ queryKey: ['buildScripts', workspaceId, planId] });
      queryClient.invalidateQueries({ queryKey: ['plan', workspaceId, planId] });
    },
  });
}

// ========================================
// Hook: useDeleteBuildScript (Step 27)
// ========================================

interface DeleteBuildScriptParams {
  workspaceId: string;
  planId: string;
  scriptId: string;
}

export function useDeleteBuildScript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workspaceId, planId, scriptId }: DeleteBuildScriptParams) => {
      const res = await fetch(`${API_BASE}/plans/${planId}/build-scripts/${scriptId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete build script');
      return res.json();
    },
    onMutate: async ({ workspaceId, planId, scriptId }) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: ['buildScripts', workspaceId, planId] });

      // Snapshot previous value
      const previousScripts = queryClient.getQueryData<BuildScript[]>(['buildScripts', workspaceId, planId]);

      // Optimistically update
      if (previousScripts) {
        queryClient.setQueryData<BuildScript[]>(
          ['buildScripts', workspaceId, planId],
          previousScripts.filter((s) => s.id !== scriptId)
        );
      }

      return { previousScripts };
    },
    onError: (err, { workspaceId, planId }, context) => {
      // Rollback on error
      if (context?.previousScripts) {
        queryClient.setQueryData(['buildScripts', workspaceId, planId], context.previousScripts);
      }
    },
    onSettled: (_, __, { workspaceId, planId }) => {
      queryClient.invalidateQueries({ queryKey: ['buildScripts', workspaceId, planId] });
      queryClient.invalidateQueries({ queryKey: ['plan', workspaceId, planId] });
    },
  });
}

// ========================================
// Hook: useRunBuildScript (Step 28)
// ========================================

interface RunBuildScriptParams {
  workspaceId: string;
  planId: string;
  scriptId: string;
}

export function useRunBuildScript() {
  return useMutation({
    mutationFn: async ({ workspaceId, planId, scriptId }: RunBuildScriptParams) => {
      const res = await fetch(`${API_BASE}/plans/${planId}/build-scripts/${scriptId}/run`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to run build script');
      return res.json();
    },
  });
}
