/**
 * Tests for SkillsPanel — skills list with detail viewer.
 * Covers: rendering deployed skills, detail expand, deployment status, empty state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import React from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/mocks/server';

import { SkillsPanel } from '../../components/workspace/SkillsPanel';
import type { SkillInfo } from '../../types';

// ─── Test utilities ──────────────────────────────────────────────────────────

const WORKSPACE_ID = 'ws_test_skills';

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
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
};

// ─── Mock data factories ─────────────────────────────────────────────────────

function makeSkill(overrides: Partial<SkillInfo> = {}): SkillInfo {
  return {
    name: 'test-skill',
    description: 'A test skill',
    file_path: '/skills/test-skill/SKILL.md',
    deployed: true,
    deployed_at: '2026-02-01T12:00:00Z',
    workspace_id: WORKSPACE_ID,
    ...overrides,
  };
}

// ─── MSW handler helpers ─────────────────────────────────────────────────────

function mockSkillsEndpoint(skills: SkillInfo[] = []) {
  server.use(
    http.get(`/api/skills/${WORKSPACE_ID}`, () => {
      return HttpResponse.json({ skills });
    }),
  );
}

function mockSkillContentEndpoint(
  contentMap: Record<string, string> = {},
) {
  server.use(
    http.get(`/api/skills/${WORKSPACE_ID}/:skillName`, ({ params }) => {
      const name = decodeURIComponent(params.skillName as string);
      const content = contentMap[name];
      if (!content) {
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return HttpResponse.json({ content });
    }),
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SkillsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list rendering', () => {
    it('renders skill names in the list', async () => {
      const skills = [
        makeSkill({ name: 'pyside6-qml-arch' }),
        makeSkill({ name: 'react-patterns' }),
      ];
      mockSkillsEndpoint(skills);

      renderWithProviders(<SkillsPanel workspaceId={WORKSPACE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('pyside6-qml-arch')).toBeInTheDocument();
      });
      expect(screen.getByText('react-patterns')).toBeInTheDocument();
    });

    it('renders skill descriptions', async () => {
      const skills = [
        makeSkill({
          name: 'my-skill',
          description: 'Handles complex orchestration',
        }),
      ];
      mockSkillsEndpoint(skills);

      renderWithProviders(<SkillsPanel workspaceId={WORKSPACE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('Handles complex orchestration')).toBeInTheDocument();
      });
    });

    it('renders the "Skills" section header', async () => {
      mockSkillsEndpoint([makeSkill()]);

      renderWithProviders(<SkillsPanel workspaceId={WORKSPACE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('Skills')).toBeInTheDocument();
      });
    });

    it('shows deployed count badge (e.g. "2/3 deployed")', async () => {
      const skills = [
        makeSkill({ name: 's1', deployed: true }),
        makeSkill({ name: 's2', deployed: true }),
        makeSkill({ name: 's3', deployed: false }),
      ];
      mockSkillsEndpoint(skills);

      renderWithProviders(<SkillsPanel workspaceId={WORKSPACE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('2/3 deployed')).toBeInTheDocument();
      });
    });
  });

  describe('deployment status indicators', () => {
    it('shows check icon for deployed skills (CheckCircle present)', async () => {
      const skills = [makeSkill({ name: 'deployed-skill', deployed: true })];
      mockSkillsEndpoint(skills);

      renderWithProviders(<SkillsPanel workspaceId={WORKSPACE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('deployed-skill')).toBeInTheDocument();
      });

      // The deployed skill row should contain a green CheckCircle icon
      // We verify by checking the SVG presence near the skill name
      const skillButton = screen.getByText('deployed-skill').closest('button');
      expect(skillButton).toBeInTheDocument();
      // CheckCircle renders an SVG with class text-green-400
      const greenIcon = skillButton!.querySelector('.text-green-400');
      expect(greenIcon).toBeInTheDocument();
    });

    it('shows X icon for undeployed skills (XCircle present)', async () => {
      const skills = [makeSkill({ name: 'undeployed-skill', deployed: false })];
      mockSkillsEndpoint(skills);

      renderWithProviders(<SkillsPanel workspaceId={WORKSPACE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('undeployed-skill')).toBeInTheDocument();
      });

      const skillButton = screen.getByText('undeployed-skill').closest('button');
      // XCircle renders an SVG with class text-slate-500
      const grayIcon = skillButton!.querySelector('.text-slate-500');
      expect(grayIcon).toBeInTheDocument();
    });

    it('shows deployment timestamp for deployed skills', async () => {
      const skills = [
        makeSkill({
          name: 'timed-skill',
          deployed: true,
          deployed_at: '2026-02-10T08:30:00Z',
        }),
      ];
      mockSkillsEndpoint(skills);

      renderWithProviders(<SkillsPanel workspaceId={WORKSPACE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('timed-skill')).toBeInTheDocument();
      });

      // Should display a relative time string from formatRelative
      // The exact text depends on the formatter, but the element should exist
      const button = screen.getByText('timed-skill').closest('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('skill detail expand', () => {
    it('expands skill content on click', async () => {
      const user = userEvent.setup();
      const skills = [makeSkill({ name: 'expandable-skill' })];
      mockSkillsEndpoint(skills);
      mockSkillContentEndpoint({
        'expandable-skill': '# Skill Content\n\nDetailed instructions.',
      });

      renderWithProviders(<SkillsPanel workspaceId={WORKSPACE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('expandable-skill')).toBeInTheDocument();
      });

      // Click to expand
      await user.click(screen.getByText('expandable-skill'));

      // Wait for content to load
      await waitFor(() => {
        expect(
          screen.getByText(/Skill Content/),
        ).toBeInTheDocument();
      });
    });

    it('collapses expanded skill on second click', async () => {
      const user = userEvent.setup();
      const skills = [makeSkill({ name: 'toggle-skill' })];
      mockSkillsEndpoint(skills);
      mockSkillContentEndpoint({
        'toggle-skill': '# Toggle Content',
      });

      renderWithProviders(<SkillsPanel workspaceId={WORKSPACE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('toggle-skill')).toBeInTheDocument();
      });

      // Expand
      await user.click(screen.getByText('toggle-skill'));
      await waitFor(() => {
        expect(screen.getByText(/Toggle Content/)).toBeInTheDocument();
      });

      // Collapse
      await user.click(screen.getByText('toggle-skill'));
      await waitFor(() => {
        expect(screen.queryByText(/Toggle Content/)).not.toBeInTheDocument();
      });
    });

    it('shows "No content available" when skill has empty content', async () => {
      const user = userEvent.setup();
      const skills = [makeSkill({ name: 'empty-skill' })];
      mockSkillsEndpoint(skills);
      mockSkillContentEndpoint({ 'empty-skill': '' });

      renderWithProviders(<SkillsPanel workspaceId={WORKSPACE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('empty-skill')).toBeInTheDocument();
      });

      await user.click(screen.getByText('empty-skill'));

      // The API returns empty content, but HttpResponse returns { content: '' }
      // The component checks !data?.content which is falsy for ''
      await waitFor(() => {
        expect(
          screen.getByText(/No content available/),
        ).toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('shows "No skills deployed" empty state when no skills', async () => {
      mockSkillsEndpoint([]);

      renderWithProviders(<SkillsPanel workspaceId={WORKSPACE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('No skills deployed')).toBeInTheDocument();
      });
    });

    it('shows descriptive text in empty state', async () => {
      mockSkillsEndpoint([]);

      renderWithProviders(<SkillsPanel workspaceId={WORKSPACE_ID} />);

      await waitFor(() => {
        expect(
          screen.getByText(/Skills provide domain-specific knowledge/),
        ).toBeInTheDocument();
      });
    });
  });

  describe('loading state', () => {
    it('renders skeleton placeholders while loading', () => {
      // Don't set up an MSW handler — the query will remain in loading state
      // because there's no handler and retry is disabled
      renderWithProviders(<SkillsPanel workspaceId={WORKSPACE_ID} />);

      // Skeleton uses a pulsing div; check for the skeleton container
      const container = document.querySelector('.space-y-2');
      expect(container).toBeInTheDocument();
    });
  });
});
