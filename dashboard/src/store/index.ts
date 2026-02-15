import { create } from 'zustand';
import type { PlanFilter } from '@/types';

interface AppState {
  // Selected items
  selectedWorkspaceId: string | null;
  selectedPlanId: string | null;
  
  // Filters
  planFilter: PlanFilter;
  
  // Actions
  setSelectedWorkspace: (id: string | null) => void;
  setSelectedPlan: (id: string | null) => void;
  setPlanFilter: (filter: Partial<PlanFilter>) => void;
  resetPlanFilter: () => void;
}

const defaultFilter: PlanFilter = {
  status: [],
  category: [],
  priority: [],
  search: '',
  programId: undefined,
};

export const useAppStore = create<AppState>((set) => ({
  selectedWorkspaceId: null,
  selectedPlanId: null,
  planFilter: defaultFilter,

  setSelectedWorkspace: (id) => set({ selectedWorkspaceId: id }),
  setSelectedPlan: (id) => set({ selectedPlanId: id }),
  
  setPlanFilter: (filter) =>
    set((state) => ({
      planFilter: { ...state.planFilter, ...filter },
    })),
    
  resetPlanFilter: () => set({ planFilter: defaultFilter }),
}));
