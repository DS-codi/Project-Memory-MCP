/**
 * Tests for ProgramStatsWidget — dashboard-level stats widget.
 * Covers: null rendering when no programs, stat display, program list,
 * progress bars, and link generation.
 *
 * We mock @tanstack/react-query's useQueries to return controlled data,
 * and mock the fetchPrograms function.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

import type { WorkspaceSummary, ProgramSummary, AggregateProgress } from '../../types';

// ─── Mock setup ──────────────────────────────────────────────────────────────

// Track what useQueries returns
let mockQueryResults: Array<{ data: { programs: ProgramSummary[] } | undefined }> = [];

vi.mock('@tanstack/react-query', () => ({
  useQueries: () => mockQueryResults,
}));

vi.mock('../../hooks/usePrograms', () => ({
  fetchPrograms: vi.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAgg(overrides: Partial<AggregateProgress> = {}): AggregateProgress {
  return {
    total_plans: 2,
    active_plans: 1,
    completed_plans: 1,
    archived_plans: 0,
    failed_plans: 0,
    total_steps: 10,
    done_steps: 7,
    active_steps: 2,
    pending_steps: 1,
    blocked_steps: 0,
    completion_percentage: 70,
    ...overrides,
  };
}

function makeProgram(overrides: Partial<ProgramSummary> = {}): ProgramSummary {
  return {
    program_id: 'prog_stat_1',
    name: 'Stats Program',
    description: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    workspace_id: 'ws_stat',
    plans: [],
    aggregate_progress: makeAgg(),
    ...overrides,
  };
}

function makeWorkspace(overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
  return {
    workspace_id: 'ws_stat',
    name: 'Test Workspace',
    path: '/test/ws',
    health: 'active',
    active_plan_count: 5,
    archived_plan_count: 1,
    last_activity: '2026-02-01T00:00:00Z',
    languages: [],
    ...overrides,
  };
}

async function renderWidget(workspaces: WorkspaceSummary[]) {
  const mod = await import('../../components/program/ProgramStatsWidget');
  return render(
    <MemoryRouter>
      <mod.ProgramStatsWidget workspaces={workspaces} />
    </MemoryRouter>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ProgramStatsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryResults = [];
  });

  describe('empty state', () => {
    it('renders nothing when there are no programs', async () => {
      mockQueryResults = [{ data: { programs: [] } }];
      const { container } = await renderWidget([makeWorkspace()]);

      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when all workspaces have 0 plans', async () => {
      mockQueryResults = [];
      const { container } = await renderWidget([
        makeWorkspace({ active_plan_count: 0 }),
      ]);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('header display', () => {
    it('renders "Programs" heading', async () => {
      mockQueryResults = [
        { data: { programs: [makeProgram()] } },
      ];
      await renderWidget([makeWorkspace()]);

      expect(screen.getByText('Programs')).toBeInTheDocument();
    });

    it('shows program count and plan count', async () => {
      const prog = makeProgram({
        aggregate_progress: makeAgg({ total_plans: 4 }),
      });
      mockQueryResults = [{ data: { programs: [prog] } }];
      await renderWidget([makeWorkspace()]);

      // Header subtitle contains both program and plan count
      const subtitle = screen.getByText(/1 program/);
      expect(subtitle).toBeInTheDocument();
      expect(subtitle).toHaveTextContent(/4 plans/);
    });

    it('pluralises program count correctly', async () => {
      mockQueryResults = [
        {
          data: {
            programs: [
              makeProgram({ program_id: 'p1' }),
              makeProgram({ program_id: 'p2', name: 'Second Program' }),
            ],
          },
        },
      ];
      await renderWidget([makeWorkspace()]);

      expect(screen.getByText(/2 programs/)).toBeInTheDocument();
    });
  });

  describe('average completion', () => {
    it('displays average completion percentage', async () => {
      mockQueryResults = [
        {
          data: {
            programs: [
              makeProgram({
                aggregate_progress: makeAgg({ completion_percentage: 80 }),
              }),
            ],
          },
        },
      ];
      await renderWidget([makeWorkspace()]);

      // Percentage appears in both header and list item
      expect(screen.getAllByText('80%').length).toBeGreaterThanOrEqual(1);
    });

    it('averages across multiple programs', async () => {
      mockQueryResults = [
        {
          data: {
            programs: [
              makeProgram({
                program_id: 'p1',
                aggregate_progress: makeAgg({ completion_percentage: 60 }),
              }),
              makeProgram({
                program_id: 'p2',
                name: 'Prog 2',
                aggregate_progress: makeAgg({ completion_percentage: 40 }),
              }),
            ],
          },
        },
      ];
      await renderWidget([makeWorkspace()]);

      // avg(60, 40) = 50
      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });

  describe('program list items', () => {
    it('renders program names', async () => {
      mockQueryResults = [
        {
          data: {
            programs: [makeProgram({ name: 'Dashboard Viz' })],
          },
        },
      ];
      await renderWidget([makeWorkspace()]);

      expect(screen.getByText('Dashboard Viz')).toBeInTheDocument();
    });

    it('shows plan count per program', async () => {
      mockQueryResults = [
        {
          data: {
            programs: [
              makeProgram({
                aggregate_progress: makeAgg({ total_plans: 3 }),
              }),
            ],
          },
        },
      ];
      await renderWidget([makeWorkspace()]);

      expect(screen.getByText('3 plans')).toBeInTheDocument();
    });

    it('shows active plan count when > 0', async () => {
      mockQueryResults = [
        {
          data: {
            programs: [
              makeProgram({
                aggregate_progress: makeAgg({ active_plans: 2 }),
              }),
            ],
          },
        },
      ];
      await renderWidget([makeWorkspace()]);

      expect(screen.getByText('2 active')).toBeInTheDocument();
    });

    it('shows failed plan count when > 0', async () => {
      mockQueryResults = [
        {
          data: {
            programs: [
              makeProgram({
                aggregate_progress: makeAgg({ failed_plans: 1 }),
              }),
            ],
          },
        },
      ];
      await renderWidget([makeWorkspace()]);

      expect(screen.getByText('1 failed')).toBeInTheDocument();
    });

    it('links each program to its detail page', async () => {
      mockQueryResults = [
        {
          data: {
            programs: [
              makeProgram({
                program_id: 'prog_linked',
                name: 'Linked Prog',
                workspace_id: 'ws_stat',
              }),
            ],
          },
        },
      ];
      await renderWidget([makeWorkspace()]);

      const link = screen.getByText('Linked Prog').closest('a');
      expect(link).toHaveAttribute(
        'href',
        '/workspace/ws_stat/program/prog_linked',
      );
    });

    it('shows at most 5 programs', async () => {
      const programs = Array.from({ length: 7 }, (_, i) =>
        makeProgram({
          program_id: `prog_${i}`,
          name: `Program ${i}`,
        }),
      );
      mockQueryResults = [{ data: { programs } }];
      await renderWidget([makeWorkspace()]);

      // Only 5 should be rendered
      for (let i = 0; i < 5; i++) {
        expect(screen.getByText(`Program ${i}`)).toBeInTheDocument();
      }
      expect(screen.queryByText('Program 5')).not.toBeInTheDocument();
      expect(screen.queryByText('Program 6')).not.toBeInTheDocument();
    });
  });
});
