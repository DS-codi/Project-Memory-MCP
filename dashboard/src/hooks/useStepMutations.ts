import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { PlanStep, StepStatus, StepType } from '@/types';

interface UpdateStepsParams {
  workspaceId: string;
  planId: string;
  steps: PlanStep[];
}

interface UpdateStepParams {
  workspaceId: string;
  planId: string;
  stepIndex: number;
  status?: StepStatus;
  notes?: string;
  task?: string;
  phase?: string;
  type?: StepType;
  assignee?: string;
}

interface ConfirmStepParams {
  workspaceId: string;
  planId: string;
  confirmation_scope: 'step' | 'phase';
  confirm_step_index?: number;
  confirm_phase?: string;
  confirmed_by?: string;
}

export function useStepMutations() {
  const queryClient = useQueryClient();

  const invalidatePlan = (workspaceId: string, planId: string) => {
    queryClient.invalidateQueries({ queryKey: ['plan', workspaceId, planId] });
    queryClient.invalidateQueries({ queryKey: ['plans', workspaceId] });
  };

  const updateSteps = useMutation({
    mutationFn: async ({ workspaceId, planId, steps }: UpdateStepsParams) => {
      const res = await axios.put(`/api/plans/${workspaceId}/${planId}/steps`, { steps });
      return res.data;
    },
    onSuccess: (_, variables) => {
      invalidatePlan(variables.workspaceId, variables.planId);
    },
  });

  const updateStep = useMutation({
    mutationFn: async ({ workspaceId, planId, stepIndex, ...fields }: UpdateStepParams) => {
      const res = await axios.patch(`/api/plans/${workspaceId}/${planId}/steps/${stepIndex}`, fields);
      return res.data;
    },
    onSuccess: (_, variables) => {
      invalidatePlan(variables.workspaceId, variables.planId);
    },
  });

  const confirmStep = useMutation({
    mutationFn: async ({ workspaceId, planId, ...body }: ConfirmStepParams) => {
      const res = await axios.post(`/api/plans/${workspaceId}/${planId}/confirm`, body);
      return res.data;
    },
    onSuccess: (_, variables) => {
      invalidatePlan(variables.workspaceId, variables.planId);
    },
  });

  return {
    updateSteps,
    updateStep,
    confirmStep,
  };
}
