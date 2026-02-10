import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import React from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/mocks/server';

import { WorkspaceContextPanel } from '../../components/workspace/WorkspaceContextPanel';

// ─── Test utilities ──────────────────────────────────────────────────────────

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
};

// ─── Mock data factories ─────────────────────────────────────────────────────

const WORKSPACE_ID = 'ws_test_ctx_panel';

/** Context with only canonical sections */
const makeCanonicalContext = () => ({
  exists: true,
  context: {
    schema_version: '1.0',
    workspace_id: WORKSPACE_ID,
    workspace_path: '/test/path',
    name: 'Test Workspace',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    sections: {
      project_details: {
        summary: 'A TypeScript MCP project',
        items: [{ title: 'Language', description: 'TypeScript' }],
      },
      purpose: {
        summary: 'Provide memory to AI agents',
      },
      dependencies: {
        summary: 'Node 20, Vitest',
        items: [
          { title: 'vitest', description: 'Testing framework' },
          { title: 'express', description: 'HTTP server' },
        ],
      },
      modules: { summary: '' },
      test_confirmations: { summary: '' },
      dev_patterns: { summary: '' },
      resources: { summary: '' },
    },
  },
});

/** Context with canonical + agent-created (extra) sections */
const makeContextWithExtras = () => {
  const base = makeCanonicalContext();
  (base.context.sections as Record<string, unknown>) = {
    ...base.context.sections,
    architecture: {
      summary: 'Modular MCP architecture',
      items: [{ title: 'Hub-Spoke', description: 'Agent pattern' }],
    },
    conventions: {
      summary: 'Small files, no monoliths',
    },
  };
  return base;
};

/** Context with ONLY agent-created sections (no canonical) */
const makeContextOnlyExtras = () => ({
  exists: true,
  context: {
    schema_version: '1.0',
    workspace_id: WORKSPACE_ID,
    workspace_path: '/test/path',
    name: 'Test Workspace',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    sections: {
      overview: {
        summary: 'Custom agent-created overview',
      },
      api_design: {
        summary: 'REST + MCP tools',
        items: [{ title: 'memory_agent', description: 'Agent lifecycle' }],
      },
    },
  },
});

/** Empty context */
const makeEmptyContext = () => ({
  exists: true,
  context: {
    schema_version: '1.0',
    workspace_id: WORKSPACE_ID,
    workspace_path: '/test/path',
    name: 'Test Workspace',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    sections: {},
  },
});

/** No context at all */
const makeNoContext = () => ({
  exists: false,
});

// ─── Helper: set up MSW handler ──────────────────────────────────────────────

function mockContextEndpoint(responseBody: Record<string, unknown>, status = 200) {
  server.use(
    http.get(`/api/workspaces/${WORKSPACE_ID}/context`, () => {
      return HttpResponse.json(responseBody, { status });
    })
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WorkspaceContextPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('canonical sections rendering', () => {
    it('renders all 7 canonical section labels', async () => {
      mockContextEndpoint(makeCanonicalContext());

      renderWithProviders(
        <WorkspaceContextPanel workspaceId={WORKSPACE_ID} />
      );

      await waitFor(() => {
        expect(screen.getByText('Project Details')).toBeInTheDocument();
      });

      expect(screen.getByText('Purpose')).toBeInTheDocument();
      expect(screen.getByText('Dependencies')).toBeInTheDocument();
      expect(screen.getByText('Modules')).toBeInTheDocument();
      expect(screen.getByText('Test Confirmations')).toBeInTheDocument();
      expect(screen.getByText('Dev Patterns')).toBeInTheDocument();
      expect(screen.getByText('Resources')).toBeInTheDocument();
    });

    it('shows item count badges for sections with items', async () => {
      mockContextEndpoint(makeCanonicalContext());

      renderWithProviders(
        <WorkspaceContextPanel workspaceId={WORKSPACE_ID} />
      );

      await waitFor(() => {
        expect(screen.getByText('Project Details')).toBeInTheDocument();
      });

      // project_details has 1 item, dependencies has 2
      expect(screen.getByText('1 item')).toBeInTheDocument();
      expect(screen.getByText('2 items')).toBeInTheDocument();
    });

    it('shows "has summary" badge for sections with only a summary', async () => {
      mockContextEndpoint(makeCanonicalContext());

      renderWithProviders(
        <WorkspaceContextPanel workspaceId={WORKSPACE_ID} />
      );

      await waitFor(() => {
        expect(screen.getByText('Purpose')).toBeInTheDocument();
      });

      // Purpose has a summary but no items
      const summaryBadges = screen.getAllByText('has summary');
      expect(summaryBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('agent-created (extra) sections', () => {
    it('renders agent-created sections after canonical sections', async () => {
      mockContextEndpoint(makeContextWithExtras());

      renderWithProviders(
        <WorkspaceContextPanel workspaceId={WORKSPACE_ID} />
      );

      await waitFor(() => {
        expect(screen.getByText('Architecture')).toBeInTheDocument();
      });

      expect(screen.getByText('Conventions')).toBeInTheDocument();
    });

    it('shows "Agent-Created Sections" divider when extra sections exist', async () => {
      mockContextEndpoint(makeContextWithExtras());

      renderWithProviders(
        <WorkspaceContextPanel workspaceId={WORKSPACE_ID} />
      );

      await waitFor(() => {
        expect(
          screen.getByText('Agent-Created Sections')
        ).toBeInTheDocument();
      });
    });

    it('does NOT show divider when there are no extra sections', async () => {
      mockContextEndpoint(makeCanonicalContext());

      renderWithProviders(
        <WorkspaceContextPanel workspaceId={WORKSPACE_ID} />
      );

      await waitFor(() => {
        expect(screen.getByText('Project Details')).toBeInTheDocument();
      });

      expect(screen.queryByText('Agent-Created Sections')).not.toBeInTheDocument();
    });

    it('renders extra sections even when no canonical sections have content', async () => {
      mockContextEndpoint(makeContextOnlyExtras());

      renderWithProviders(
        <WorkspaceContextPanel workspaceId={WORKSPACE_ID} />
      );

      await waitFor(() => {
        expect(screen.getByText('Agent-Created Sections')).toBeInTheDocument();
      });

      expect(screen.getByText('Overview')).toBeInTheDocument();
      expect(screen.getByText('Api Design')).toBeInTheDocument();
    });
  });

  describe('formatSectionLabel', () => {
    it('converts snake_case agent keys to Title Case labels', async () => {
      mockContextEndpoint(makeContextOnlyExtras());

      renderWithProviders(
        <WorkspaceContextPanel workspaceId={WORKSPACE_ID} />
      );

      // 'overview' → 'Overview', 'api_design' → 'Api Design'
      await waitFor(() => {
        expect(screen.getByText('Overview')).toBeInTheDocument();
      });
      expect(screen.getByText('Api Design')).toBeInTheDocument();
    });

    it('shows "Custom section: {key}" as subtitle for extra sections', async () => {
      mockContextEndpoint(makeContextOnlyExtras());

      renderWithProviders(
        <WorkspaceContextPanel workspaceId={WORKSPACE_ID} />
      );

      await waitFor(() => {
        expect(screen.getByText('Custom section: overview')).toBeInTheDocument();
      });
      expect(screen.getByText('Custom section: api_design')).toBeInTheDocument();
    });
  });

  describe('empty and missing context', () => {
    it('renders canonical sections even when context has empty sections', async () => {
      mockContextEndpoint(makeEmptyContext());

      renderWithProviders(
        <WorkspaceContextPanel workspaceId={WORKSPACE_ID} />
      );

      await waitFor(() => {
        expect(screen.getByText('Project Details')).toBeInTheDocument();
      });

      // All 7 canonical sections should still render
      expect(screen.getByText('Modules')).toBeInTheDocument();
      expect(screen.getByText('Resources')).toBeInTheDocument();
    });

    it('renders correctly when context does not exist', async () => {
      mockContextEndpoint(makeNoContext());

      renderWithProviders(
        <WorkspaceContextPanel workspaceId={WORKSPACE_ID} />
      );

      await waitFor(() => {
        expect(screen.getByText('Project Details')).toBeInTheDocument();
      });

      // No agent-created divider
      expect(screen.queryByText('Agent-Created Sections')).not.toBeInTheDocument();
    });
  });

  describe('header metadata', () => {
    it('shows "Last updated" date when context has updated_at', async () => {
      mockContextEndpoint(makeCanonicalContext());

      renderWithProviders(
        <WorkspaceContextPanel workspaceId={WORKSPACE_ID} />
      );

      await waitFor(() => {
        expect(screen.getByText(/Last updated/)).toBeInTheDocument();
      });
    });

    it('shows "No saved context yet." when no updated_at', async () => {
      mockContextEndpoint(makeNoContext());

      renderWithProviders(
        <WorkspaceContextPanel workspaceId={WORKSPACE_ID} />
      );

      await waitFor(() => {
        expect(screen.getByText('No saved context yet.')).toBeInTheDocument();
      });
    });
  });

  describe('loading and error states', () => {
    it('shows loading spinner initially', () => {
      // Don't set up a handler — query will be pending
      mockContextEndpoint(makeCanonicalContext());

      renderWithProviders(
        <WorkspaceContextPanel workspaceId={WORKSPACE_ID} />
      );

      expect(screen.getByText('Loading workspace context...')).toBeInTheDocument();
    });

    it('shows error message on fetch failure', async () => {
      server.use(
        http.get(`/api/workspaces/${WORKSPACE_ID}/context`, () => {
          return HttpResponse.json(
            { error: 'Context not found' },
            { status: 404 }
          );
        })
      );

      renderWithProviders(
        <WorkspaceContextPanel workspaceId={WORKSPACE_ID} />
      );

      await waitFor(() => {
        expect(screen.getByText('Context not found')).toBeInTheDocument();
      });
    });
  });
});
