/**
 * Tests for workflow mode selector on PlanDetailPage.
 *
 * Covers:
 * 1. Renders selector with current mode pre-selected
 * 2. Renders 'standard' when workflow_mode is undefined
 * 3. Changing selector triggers useSetWorkflowMode with correct plan_id and mode
 * 4. Selector shows all four options
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { server } from '@/test/mocks/server';
import { PlanDetailPage } from '@/pages/PlanDetailPage';
import type { PlanState } from '@/types';

// ---------------------------------------------------------------------------
// Stub all heavy child components
// ---------------------------------------------------------------------------
vi.mock('@/components/common/CopyButton', () => ({ CopyButton: () => null }));
vi.mock('@/components/common/Badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/components/common/ProgressBar', () => ({ ProgressBar: () => null }));
vi.mock('@/components/plan/StepList', () => ({ StepList: () => <div data-testid="step-list" /> }));
vi.mock('@/components/plan/StepProgress', () => ({ StepProgress: () => null }));
vi.mock('@/components/plan/ResearchNotesViewer', () => ({ ResearchNotesViewer: () => null }));
vi.mock('@/components/plan/PlanContextViewer', () => ({ PlanContextViewer: () => null }));
vi.mock('@/components/plan/AuditLogViewer', () => ({ AuditLogViewer: () => null }));
vi.mock('@/components/plan/ExportReport', () => ({ ExportReport: () => null }));
vi.mock('@/components/plan/PlanActions', () => ({ PlanActions: () => null }));
vi.mock('@/components/plan/AddNoteForm', () => ({ AddNoteForm: () => null }));
vi.mock('@/components/plan/GoalsTab', () => ({ GoalsTab: () => null }));
vi.mock('@/components/plan/BuildScriptsTab', () => ({ BuildScriptsTab: () => null }));
vi.mock('@/components/plan/PhaseListView', () => ({ PhaseListView: () => null }));
vi.mock('@/components/plan/RiskRegisterPanel', () => ({ RiskRegisterPanel: () => null }));
vi.mock('@/components/plan/DifficultyProfileCard', () => ({ DifficultyProfileCard: () => null }));
vi.mock('@/components/plan/SessionStatsCard', () => ({ SessionStatsCard: () => null }));
vi.mock('@/components/plan/HandoffStatsPanel', () => ({ HandoffStatsPanel: () => null }));
vi.mock('@/components/plan/SkillMatchPanel', () => ({ SkillMatchPanel: () => null }));
vi.mock('@/components/plan/CategorizationBadge', () => ({ CategorizationBadge: () => null }));
vi.mock('@/components/plan/PausedPlanBanner', () => ({ PausedPlanBanner: () => null }));
vi.mock('@/components/timeline/HandoffTimeline', () => ({ HandoffTimeline: () => null }));
vi.mock('@/components/timeline/BallInCourt', () => ({ BallInCourt: () => null }));

// ---------------------------------------------------------------------------
// Stub hooks that aren't the focus of this test
// ---------------------------------------------------------------------------
const { mockMutate, mockSetWorkflowMode } = vi.hoisted(() => {
  const mockMutate = vi.fn();
  const mockSetWorkflowMode = vi.fn(() => ({ mutate: mockMutate, isPending: false }));
  return { mockMutate, mockSetWorkflowMode };
});

vi.mock('@/hooks/usePlans', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/usePlans')>();
  return {
    ...original,
    useResumePlan: () => ({ mutate: vi.fn(), isPending: false }),
    useSetWorkflowMode: mockSetWorkflowMode,
  };
});

vi.mock('@/hooks/useBuildScripts', () => ({
  useBuildScripts: () => ({ data: [] }),
  useAddBuildScript: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteBuildScript: () => ({ mutate: vi.fn(), isPending: false }),
  useRunBuildScript: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/usePrograms', () => ({
  useProgram: () => ({ data: null }),
}));

vi.mock('@/utils/formatters', () => ({
  formatDate: () => '2026-01-01',
  formatRelative: () => 'just now',
}));

vi.mock('@/utils/vscode-bridge', () => ({
  postToVsCode: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
const BASE_PLAN: PlanState = {
  id: 'plan_test_001',
  workspace_id: 'ws_test_001',
  title: 'Test Plan',
  description: 'A test plan',
  priority: 'medium',
  status: 'active',
  category: 'feature',
  current_phase: 'Implementation',
  current_agent: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  agent_sessions: [],
  lineage: [],
  steps: [],
  goals: [],
  success_criteria: [],
};

function makePlan(overrides?: Partial<PlanState>): PlanState {
  return { ...BASE_PLAN, ...overrides };
}

function renderPage(plan: PlanState) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  server.use(
    http.get('/api/plans/ws_test_001/plan_test_001', () =>
      HttpResponse.json(plan)
    )
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/workspace/ws_test_001/plan/plan_test_001']}>
        <Routes>
          <Route
            path="/workspace/:workspaceId/plan/:planId"
            element={<PlanDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PlanDetailPage – workflow mode selector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock to return non-pending state
    mockSetWorkflowMode.mockReturnValue({ mutate: mockMutate, isPending: false });
  });

  it('renders the selector with all four options', async () => {
    renderPage(makePlan({ workflow_mode: 'standard' }));

    const selector = await screen.findByTestId('workflow-mode-selector');
    expect(selector).toBeInTheDocument();

    const options = Array.from((selector as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toEqual(['standard', 'tdd', 'enrichment', 'overnight']);
  });

  it('pre-selects the current workflow_mode when set to tdd', async () => {
    renderPage(makePlan({ workflow_mode: 'tdd' }));

    const selector = await screen.findByTestId<HTMLSelectElement>('workflow-mode-selector');
    expect(selector.value).toBe('tdd');
  });

  it('defaults to standard when workflow_mode is undefined', async () => {
    renderPage(makePlan({ workflow_mode: undefined }));

    const selector = await screen.findByTestId<HTMLSelectElement>('workflow-mode-selector');
    expect(selector.value).toBe('standard');
  });

  it('calls useSetWorkflowMode mutate with correct workspaceId, planId context on change', async () => {
    renderPage(makePlan({ workflow_mode: 'standard' }));

    const selector = await screen.findByTestId('workflow-mode-selector');

    // Verify useSetWorkflowMode was called with correct ids
    expect(mockSetWorkflowMode).toHaveBeenCalledWith('ws_test_001', 'plan_test_001');

    const user = userEvent.setup();
    await user.selectOptions(selector, 'overnight');

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith('overnight');
    });
  });

  it('selector is disabled when mutation is pending', async () => {
    mockSetWorkflowMode.mockReturnValue({ mutate: mockMutate, isPending: true });

    renderPage(makePlan({ workflow_mode: 'standard' }));

    const selector = await screen.findByTestId('workflow-mode-selector');
    expect(selector).toBeDisabled();
  });
});
