/**
 * Tests for ProgramDetailPage — the enhanced program detail page.
 * Covers: loading skeleton, error state, header rendering, aggregate stats grid,
 * overall progress bar, step breakdown, goals/criteria sections, dependency graph
 * embedding, and child plan list.
 *
 * We mock react-router-dom for useParams and Link, and mock the useProgram hook
 * to control the data returned.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

import type { ProgramDetail, AggregateProgress } from '../../types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('react-router-dom', () => ({
  useParams: () => ({ workspaceId: 'ws_detail', programId: 'prog_detail' }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const mockUseProgramReturn = {
  data: undefined as ProgramDetail | undefined,
  isLoading: false,
  error: null as Error | null,
};

vi.mock('../../hooks/usePrograms', () => ({
  useProgram: () => mockUseProgramReturn,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAgg(overrides: Partial<AggregateProgress> = {}): AggregateProgress {
  return {
    total_plans: 3,
    active_plans: 2,
    completed_plans: 1,
    archived_plans: 0,
    failed_plans: 0,
    total_steps: 20,
    done_steps: 12,
    active_steps: 4,
    pending_steps: 3,
    blocked_steps: 1,
    completion_percentage: 60,
    ...overrides,
  };
}

function makeProgram(overrides: Partial<ProgramDetail> = {}): ProgramDetail {
  return {
    program_id: 'prog_detail',
    name: 'My Program',
    description: 'A detailed program',
    created_at: '2026-01-10T00:00:00Z',
    updated_at: '2026-02-05T00:00:00Z',
    workspace_id: 'ws_detail',
    plans: [
      {
        plan_id: 'plan_c1',
        title: 'Child Plan 1',
        status: 'active',
        priority: 'high',
        current_phase: 'Implement',
        progress: { done: 4, total: 8 },
        depends_on_plans: [],
      },
      {
        plan_id: 'plan_c2',
        title: 'Child Plan 2',
        status: 'completed',
        priority: 'medium',
        current_phase: 'Done',
        progress: { done: 6, total: 6 },
        depends_on_plans: ['plan_c1'],
      },
    ],
    aggregate_progress: makeAgg(),
    goals: ['Deliver MVP', 'Achieve 90% coverage'],
    success_criteria: ['All tests pass', 'No critical bugs'],
    ...overrides,
  };
}

// ─── Dynamic import (after mocks are set up) ────────────────────────────────

async function loadAndRender() {
  const mod = await import('../../pages/ProgramDetailPage');
  return render(<mod.ProgramDetailPage />);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ProgramDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProgramReturn.data = undefined;
    mockUseProgramReturn.isLoading = false;
    mockUseProgramReturn.error = null;
  });

  describe('loading state', () => {
    it('renders skeletons while loading', async () => {
      mockUseProgramReturn.isLoading = true;
      const { container } = await loadAndRender();

      // Skeleton elements should be in the DOM
      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('error state', () => {
    it('shows "Program not found" when there is an error', async () => {
      mockUseProgramReturn.error = new Error('Network failure');
      await loadAndRender();

      expect(screen.getByText('Program not found')).toBeInTheDocument();
      expect(screen.getByText('Network failure')).toBeInTheDocument();
    });

    it('shows generic message when no error message available', async () => {
      mockUseProgramReturn.data = undefined;
      mockUseProgramReturn.error = null;
      await loadAndRender();

      expect(screen.getByText('Program not found')).toBeInTheDocument();
    });
  });

  describe('header', () => {
    it('renders program name', async () => {
      mockUseProgramReturn.data = makeProgram({ name: 'Dashboard Rework' });
      await loadAndRender();

      expect(screen.getByText('Dashboard Rework')).toBeInTheDocument();
    });

    it('renders program description', async () => {
      mockUseProgramReturn.data = makeProgram({
        description: 'Reworking the entire dashboard',
      });
      await loadAndRender();

      expect(
        screen.getByText('Reworking the entire dashboard'),
      ).toBeInTheDocument();
    });

    it('renders plan count badge', async () => {
      mockUseProgramReturn.data = makeProgram();
      await loadAndRender();

      expect(screen.getByText('3 plans')).toBeInTheDocument();
    });

    it('renders singular "plan" for single-plan program', async () => {
      mockUseProgramReturn.data = makeProgram({
        plans: [makeProgram().plans[0]],
        aggregate_progress: makeAgg({ total_plans: 1 }),
      });
      await loadAndRender();

      expect(screen.getByText('1 plan')).toBeInTheDocument();
    });

    it('renders "Back to workspace" link', async () => {
      mockUseProgramReturn.data = makeProgram();
      await loadAndRender();

      const backLink = screen.getByText('Back to workspace').closest('a');
      expect(backLink).toHaveAttribute('href', '/workspace/ws_detail');
    });
  });

  describe('aggregate stats grid', () => {
    it('renders all stat cards', async () => {
      mockUseProgramReturn.data = makeProgram();
      await loadAndRender();

      expect(screen.getByText('Total Plans')).toBeInTheDocument();
      expect(screen.getByText('Active Plans')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('displays correct values in stat cards', async () => {
      mockUseProgramReturn.data = makeProgram({
        aggregate_progress: makeAgg({
          total_plans: 5,
          active_plans: 3,
          completed_plans: 2,
          failed_plans: 0,
          total_steps: 0,
          done_steps: 0,
          active_steps: 0,
          pending_steps: 0,
          blocked_steps: 0,
        }),
      });
      await loadAndRender();

      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  describe('overall progress', () => {
    it('renders completion percentage', async () => {
      mockUseProgramReturn.data = makeProgram({
        aggregate_progress: makeAgg({ completion_percentage: 60 }),
      });
      await loadAndRender();

      expect(screen.getByText('60%')).toBeInTheDocument();
    });

    it('renders step count in progress section', async () => {
      mockUseProgramReturn.data = makeProgram({
        aggregate_progress: makeAgg({ done_steps: 12, total_steps: 20 }),
      });
      await loadAndRender();

      expect(screen.getByText('12/20 steps')).toBeInTheDocument();
    });

    it('renders "Overall Progress" heading', async () => {
      mockUseProgramReturn.data = makeProgram();
      await loadAndRender();

      expect(screen.getByText('Overall Progress')).toBeInTheDocument();
    });
  });

  describe('step breakdown', () => {
    it('renders step breakdown labels', async () => {
      mockUseProgramReturn.data = makeProgram({
        aggregate_progress: makeAgg({
          done_steps: 10,
          active_steps: 3,
          pending_steps: 5,
          blocked_steps: 2,
          total_steps: 20,
        }),
      });
      await loadAndRender();

      expect(screen.getByText('Step Breakdown')).toBeInTheDocument();
      // Labels may appear in both step breakdown and plan current_phase, so use getAllByText
      expect(screen.getAllByText('Done').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('Blocked')).toBeInTheDocument();
    });

    it('renders step counts in breakdown', async () => {
      mockUseProgramReturn.data = makeProgram({
        aggregate_progress: makeAgg({
          done_steps: 10,
          active_steps: 3,
          pending_steps: 5,
          blocked_steps: 2,
          total_steps: 20,
        }),
      });
      await loadAndRender();

      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('does not render step breakdown when total_steps is 0', async () => {
      mockUseProgramReturn.data = makeProgram({
        aggregate_progress: makeAgg({ total_steps: 0 }),
      });
      await loadAndRender();

      expect(screen.queryByText('Step Breakdown')).not.toBeInTheDocument();
    });
  });

  describe('goals section', () => {
    it('renders goals when present', async () => {
      mockUseProgramReturn.data = makeProgram({
        goals: ['Ship fast', 'Ship right'],
      });
      await loadAndRender();

      expect(screen.getByText('Goals')).toBeInTheDocument();
      expect(screen.getByText('Ship fast')).toBeInTheDocument();
      expect(screen.getByText('Ship right')).toBeInTheDocument();
    });

    it('does not render goals section when goals is empty', async () => {
      mockUseProgramReturn.data = makeProgram({ goals: [] });
      await loadAndRender();

      expect(screen.queryByText('Goals')).not.toBeInTheDocument();
    });

    it('does not render goals section when goals is undefined', async () => {
      mockUseProgramReturn.data = makeProgram({ goals: undefined });
      await loadAndRender();

      expect(screen.queryByText('Goals')).not.toBeInTheDocument();
    });
  });

  describe('success criteria section', () => {
    it('renders success criteria when present', async () => {
      mockUseProgramReturn.data = makeProgram({
        success_criteria: ['Coverage > 90%', 'No regressions'],
      });
      await loadAndRender();

      expect(screen.getByText('Success Criteria')).toBeInTheDocument();
      expect(screen.getByText('Coverage > 90%')).toBeInTheDocument();
      expect(screen.getByText('No regressions')).toBeInTheDocument();
    });

    it('does not render section when success_criteria is empty', async () => {
      mockUseProgramReturn.data = makeProgram({ success_criteria: [] });
      await loadAndRender();

      expect(screen.queryByText('Success Criteria')).not.toBeInTheDocument();
    });
  });

  describe('dependency graph embedding', () => {
    it('renders DependencyGraph when more than 1 plan', async () => {
      mockUseProgramReturn.data = makeProgram(); // has 2 plans with deps
      await loadAndRender();

      // DependencyGraph renders "Plan Dependencies" heading
      expect(
        screen.getByText('Plan Dependencies & Execution Waves'),
      ).toBeInTheDocument();
    });

    it('does not render DependencyGraph for single-plan program', async () => {
      mockUseProgramReturn.data = makeProgram({
        plans: [
          {
            plan_id: 'p1',
            title: 'Solo',
            status: 'active',
            priority: 'medium',
            current_phase: '',
            progress: { done: 0, total: 3 },
            depends_on_plans: [],
          },
        ],
      });
      await loadAndRender();

      expect(
        screen.queryByText('Plan Dependencies & Execution Waves'),
      ).not.toBeInTheDocument();
    });
  });

  describe('child plan list', () => {
    it('renders "Plans" heading', async () => {
      mockUseProgramReturn.data = makeProgram();
      await loadAndRender();

      expect(screen.getByText('Plans')).toBeInTheDocument();
    });

    it('renders each child plan title', async () => {
      mockUseProgramReturn.data = makeProgram();
      await loadAndRender();

      // Titles appear in both the plan list and the dependency graph
      expect(screen.getAllByText('Child Plan 1').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Child Plan 2').length).toBeGreaterThanOrEqual(1);
    });

    it('shows "No plans yet" empty state when plans is empty', async () => {
      mockUseProgramReturn.data = makeProgram({
        plans: [],
        aggregate_progress: makeAgg({ total_plans: 0 }),
      });
      await loadAndRender();

      expect(screen.getByText('No plans yet')).toBeInTheDocument();
    });

    it('renders plan status badges', async () => {
      mockUseProgramReturn.data = makeProgram();
      await loadAndRender();

      // The two child plans have status 'active' and 'completed'
      expect(screen.getAllByText('active').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('completed').length).toBeGreaterThanOrEqual(1);
    });

    it('links child plans to their detail pages', async () => {
      mockUseProgramReturn.data = makeProgram();
      await loadAndRender();

      // Title appears in both plan list and dependency graph; use first match
      const link = screen.getAllByText('Child Plan 1')[0].closest('a');
      expect(link).toHaveAttribute(
        'href',
        '/workspace/ws_detail/plan/plan_c1',
      );
    });

    it('shows dependency info on child plans', async () => {
      mockUseProgramReturn.data = makeProgram();
      await loadAndRender();

      // Child Plan 2 depends on plan_c1 — shows truncated ID
      expect(screen.getByText(/Depends on/)).toBeInTheDocument();
    });

    it('shows plan progress percentage', async () => {
      mockUseProgramReturn.data = makeProgram();
      await loadAndRender();

      // Progress text appears in both plan list and dependency graph
      expect(screen.getAllByText(/4\/8/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/6\/6/).length).toBeGreaterThanOrEqual(1);
    });
  });
});
