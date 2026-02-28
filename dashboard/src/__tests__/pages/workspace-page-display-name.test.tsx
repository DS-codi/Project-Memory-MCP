import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

import { server } from '@/test/mocks/server';
import { WorkspacePage } from '@/pages/WorkspacePage';

vi.mock('@/components/plan/PlanList', () => ({ PlanList: () => <div data-testid="plan-list" /> }));
vi.mock('@/components/plan/CreatePlanForm', () => ({ CreatePlanForm: () => <div data-testid="create-plan-form" /> }));
vi.mock('@/components/plan/PlanTemplatesPanel', () => ({ PlanTemplatesPanel: () => <div data-testid="plan-templates" /> }));
vi.mock('@/components/program/ProgramTreeView', () => ({ ProgramTreeView: () => <div data-testid="program-tree" /> }));
vi.mock('@/components/program/ProgramCreateForm', () => ({ ProgramCreateForm: () => <div data-testid="program-create" /> }));
vi.mock('@/components/workspace/HealthIndicator', () => ({ HealthIndicator: () => <div data-testid="health-indicator" /> }));
vi.mock('@/components/workspace/CopilotStatusPanel', () => ({ CopilotStatusPanel: () => <div data-testid="copilot-status" /> }));
vi.mock('@/components/workspace/DeployModal', () => ({ DeployModal: () => null }));
vi.mock('@/components/workspace/DeployDefaultsCard', () => ({ DeployDefaultsCard: () => <div data-testid="deploy-defaults" /> }));
vi.mock('@/components/workspace/WorkspaceContextPanel', () => ({ WorkspaceContextPanel: () => <div data-testid="workspace-context" /> }));
vi.mock('@/components/workspace/KnowledgeFilesPanel', () => ({ KnowledgeFilesPanel: () => <div data-testid="knowledge-files" /> }));

vi.mock('@/hooks/useCopilotStatus', () => ({
  useCopilotStatus: () => ({ data: { status: null }, isLoading: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/usePrograms', () => ({
  usePrograms: () => ({ data: { programs: [] } }),
}));

vi.mock('@/hooks/usePlans', () => ({
  usePlans: () => ({ data: { plans: [] }, isLoading: false }),
}));

vi.mock('@/utils/formatters', () => ({
  formatDate: () => '2026-02-15',
  formatRelative: () => 'just now',
}));

vi.mock('@/utils/deployDefaults', () => ({
  getDeployDefaults: () => null,
}));

function renderWorkspacePage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/workspace/ws_1']}>
        <Routes>
          <Route path="/workspace/:workspaceId" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('WorkspacePage display-name editing', () => {
  it('saves updated display name through workspace display-name endpoint', async () => {
    let currentName = 'Original Workspace Name';
    let submittedDisplayName: string | undefined;

    server.use(
      http.get('/api/workspaces/ws_1', () => {
        return HttpResponse.json({
          workspace_id: 'ws_1',
          path: '/tmp/ws_1',
          name: currentName,
          registered_at: '2026-02-01T00:00:00.000Z',
          last_activity: '2026-02-15T00:00:00.000Z',
          active_plans: [],
          archived_plans: [],
          indexed: true,
        });
      }),
      http.post('/api/workspaces/ws_1/display-name', async ({ request }) => {
        const body = await request.json() as { display_name?: string };
        submittedDisplayName = body.display_name;
        currentName = body.display_name ?? currentName;

        return HttpResponse.json({
          workspace: {
            workspace_id: 'ws_1',
            path: '/tmp/ws_1',
            name: currentName,
            registered_at: '2026-02-01T00:00:00.000Z',
            last_activity: '2026-02-15T00:00:00.000Z',
            active_plans: [],
            archived_plans: [],
            indexed: true,
          },
        });
      })
    );

    renderWorkspacePage();

    await screen.findByRole('heading', { name: 'Original Workspace Name' });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit name' }));

    const input = screen.getByLabelText('Workspace display name');
    const saveButton = screen.getByRole('button', { name: 'Save' });

    expect(saveButton).toBeDisabled();

    await user.clear(input);
    await user.type(input, 'Renamed Workspace');
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    await waitFor(() => {
      expect(submittedDisplayName).toBe('Renamed Workspace');
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Renamed Workspace' })).toBeInTheDocument();
    });
  });
});
