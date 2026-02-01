import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { PlanStep } from '@/types';

interface UpdateStepsParams {
  workspaceId: string;
  planId: string;
  steps: PlanStep[];
}

export function useStepMutations() {
  const queryClient = useQueryClient();

  const updateSteps = useMutation({
    mutationFn: async ({ workspaceId, planId, steps }: UpdateStepsParams) => {
      const res = await axios.put(`/api/plans/${workspaceId}/${planId}/steps`, { steps });
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['plan', variables.workspaceId, variables.planId] });
      queryClient.invalidateQueries({ queryKey: ['plans', variables.workspaceId] });
    },
  });

  return {
    updateSteps,
  };
}
