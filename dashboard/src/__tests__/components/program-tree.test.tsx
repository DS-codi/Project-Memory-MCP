/**
 * Tests for ProgramTreeView — expandable program tree with progress bars.
 * Covers: rendering program names, aggregate progress, expand/collapse, empty state.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

import { ProgramTreeView } from '../../components/program/ProgramTreeView';
import type { ProgramSummary, ProgramPlanRef } from '../../types';

// ─── Test utilities ──────────────────────────────────────────────────────────

const WORKSPACE_ID = 'ws_test_programs';

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// ─── Mock data factories ─────────────────────────────────────────────────────

function makePlanRef(overrides: Partial<ProgramPlanRef> = {}): ProgramPlanRef {
  return {
    plan_id: 'plan_default',
    title: 'Default Plan',
    status: 'active',
    progress: { done: 2, total: 5 },
    ...overrides,
  };
}

function makeProgram(overrides: Partial<ProgramSummary> = {}): ProgramSummary {
  return {
    program_id: 'prog_001',
    name: 'Test Program',
    description: 'A test program',
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-02-01T12:00:00Z',
    workspace_id: WORKSPACE_ID,
    plans: [
      makePlanRef({ plan_id: 'plan_1', title: 'Plan Alpha', status: 'active', progress: { done: 3, total: 5 } }),
      makePlanRef({ plan_id: 'plan_2', title: 'Plan Beta', status: 'completed', progress: { done: 4, total: 4 } }),
    ],
    aggregate_progress: { done: 7, total: 9 },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ProgramTreeView', () => {
  describe('rendering program names', () => {
    it('renders a single program name', () => {
      const programs = [makeProgram({ name: 'Auth System' })];
      renderWithRouter(
        <ProgramTreeView programs={programs} workspaceId={WORKSPACE_ID} />,
      );

      expect(screen.getByText('Auth System')).toBeInTheDocument();
    });

    it('renders multiple program names', () => {
      const programs = [
        makeProgram({ program_id: 'p1', name: 'Auth System' }),
        makeProgram({ program_id: 'p2', name: 'Payment Gateway' }),
        makeProgram({ program_id: 'p3', name: 'Notification Engine' }),
      ];
      renderWithRouter(
        <ProgramTreeView programs={programs} workspaceId={WORKSPACE_ID} />,
      );

      expect(screen.getByText('Auth System')).toBeInTheDocument();
      expect(screen.getByText('Payment Gateway')).toBeInTheDocument();
      expect(screen.getByText('Notification Engine')).toBeInTheDocument();
    });

    it('renders program description text', () => {
      const programs = [makeProgram({ description: 'Handles all auth flows' })];
      renderWithRouter(
        <ProgramTreeView programs={programs} workspaceId={WORKSPACE_ID} />,
      );

      expect(screen.getByText('Handles all auth flows')).toBeInTheDocument();
    });

    it('displays plan count badge', () => {
      const programs = [makeProgram({ plans: [makePlanRef(), makePlanRef({ plan_id: 'p2' })] })];
      renderWithRouter(
        <ProgramTreeView programs={programs} workspaceId={WORKSPACE_ID} />,
      );

      expect(screen.getByText('2 plans')).toBeInTheDocument();
    });

    it('displays singular "plan" for single-plan programs', () => {
      const programs = [makeProgram({ plans: [makePlanRef()] })];
      renderWithRouter(
        <ProgramTreeView programs={programs} workspaceId={WORKSPACE_ID} />,
      );

      expect(screen.getByText('1 plan')).toBeInTheDocument();
    });
  });

  describe('aggregate progress', () => {
    it('displays aggregate done/total counts', () => {
      const programs = [makeProgram({ aggregate_progress: { done: 7, total: 9 } })];
      renderWithRouter(
        <ProgramTreeView programs={programs} workspaceId={WORKSPACE_ID} />,
      );

      expect(screen.getByText('7/9')).toBeInTheDocument();
    });

    it('shows zero progress when no steps exist', () => {
      const programs = [makeProgram({ aggregate_progress: { done: 0, total: 0 } })];
      renderWithRouter(
        <ProgramTreeView programs={programs} workspaceId={WORKSPACE_ID} />,
      );

      expect(screen.getByText('0/0')).toBeInTheDocument();
    });

    it('shows 100% when all steps are done', () => {
      const programs = [makeProgram({ aggregate_progress: { done: 12, total: 12 } })];
      renderWithRouter(
        <ProgramTreeView programs={programs} workspaceId={WORKSPACE_ID} />,
      );

      expect(screen.getByText('12/12')).toBeInTheDocument();
    });
  });

  describe('expandable nodes', () => {
    it('does not show child plans initially', () => {
      const programs = [
        makeProgram({
          plans: [makePlanRef({ title: 'Hidden Plan' })],
        }),
      ];
      renderWithRouter(
        <ProgramTreeView programs={programs} workspaceId={WORKSPACE_ID} />,
      );

      // Child plan names should not be visible before expanding
      expect(screen.queryByText('Hidden Plan')).not.toBeInTheDocument();
    });

    it('reveals child plans when program header is clicked', async () => {
      const user = userEvent.setup();
      const programs = [
        makeProgram({
          plans: [
            makePlanRef({ plan_id: 'plan_a', title: 'Plan Alpha' }),
            makePlanRef({ plan_id: 'plan_b', title: 'Plan Beta' }),
          ],
        }),
      ];
      renderWithRouter(
        <ProgramTreeView programs={programs} workspaceId={WORKSPACE_ID} />,
      );

      // Click the expand button (the <button> wrapping the header)
      const expandButton = screen.getByRole('button');
      await user.click(expandButton);

      expect(screen.getByText('Plan Alpha')).toBeInTheDocument();
      expect(screen.getByText('Plan Beta')).toBeInTheDocument();
    });

    it('hides child plans when clicked again (toggle)', async () => {
      const user = userEvent.setup();
      const programs = [
        makeProgram({
          plans: [makePlanRef({ title: 'Toggle Plan' })],
        }),
      ];
      renderWithRouter(
        <ProgramTreeView programs={programs} workspaceId={WORKSPACE_ID} />,
      );

      const expandButton = screen.getByRole('button');

      // Expand
      await user.click(expandButton);
      expect(screen.getByText('Toggle Plan')).toBeInTheDocument();

      // Collapse
      await user.click(expandButton);
      expect(screen.queryByText('Toggle Plan')).not.toBeInTheDocument();
    });

    it('shows "No plans in this program" when expanded with no plans', async () => {
      const user = userEvent.setup();
      const programs = [makeProgram({ plans: [] })];
      renderWithRouter(
        <ProgramTreeView programs={programs} workspaceId={WORKSPACE_ID} />,
      );

      const expandButton = screen.getByRole('button');
      await user.click(expandButton);

      expect(screen.getByText('No plans in this program')).toBeInTheDocument();
    });

    it('shows plan status badges when expanded', async () => {
      const user = userEvent.setup();
      const programs = [
        makeProgram({
          plans: [
            makePlanRef({ plan_id: 'pa', title: 'Active Plan', status: 'active' }),
            makePlanRef({ plan_id: 'pc', title: 'Done Plan', status: 'completed' }),
          ],
        }),
      ];
      renderWithRouter(
        <ProgramTreeView programs={programs} workspaceId={WORKSPACE_ID} />,
      );

      await user.click(screen.getByRole('button'));

      expect(screen.getByText('active')).toBeInTheDocument();
      expect(screen.getByText('completed')).toBeInTheDocument();
    });

    it('shows plan progress counts when expanded', async () => {
      const user = userEvent.setup();
      const programs = [
        makeProgram({
          plans: [
            makePlanRef({ plan_id: 'px', title: 'My Plan', progress: { done: 3, total: 8 } }),
          ],
        }),
      ];
      renderWithRouter(
        <ProgramTreeView programs={programs} workspaceId={WORKSPACE_ID} />,
      );

      await user.click(screen.getByRole('button'));

      expect(screen.getByText('3/8')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows "No programs" empty state when programs list is empty', () => {
      renderWithRouter(
        <ProgramTreeView programs={[]} workspaceId={WORKSPACE_ID} />,
      );

      expect(screen.getByText('No programs')).toBeInTheDocument();
    });

    it('shows descriptive text in empty state', () => {
      renderWithRouter(
        <ProgramTreeView programs={[]} workspaceId={WORKSPACE_ID} />,
      );

      expect(
        screen.getByText(/Programs group related plans/),
      ).toBeInTheDocument();
    });
  });

  describe('navigation links', () => {
    it('program name links to program detail page', () => {
      const programs = [makeProgram({ program_id: 'prog_nav_test', name: 'Nav Test Prog' })];
      renderWithRouter(
        <ProgramTreeView programs={programs} workspaceId={WORKSPACE_ID} />,
      );

      const link = screen.getByText('Nav Test Prog').closest('a');
      expect(link).toHaveAttribute(
        'href',
        `/workspace/${WORKSPACE_ID}/program/prog_nav_test`,
      );
    });

    it('child plan links to plan detail page when expanded', async () => {
      const user = userEvent.setup();
      const programs = [
        makeProgram({
          plans: [makePlanRef({ plan_id: 'plan_link_test', title: 'Linked Plan' })],
        }),
      ];
      renderWithRouter(
        <ProgramTreeView programs={programs} workspaceId={WORKSPACE_ID} />,
      );

      await user.click(screen.getByRole('button'));

      const planLink = screen.getByText('Linked Plan').closest('a');
      expect(planLink).toHaveAttribute(
        'href',
        `/workspace/${WORKSPACE_ID}/plan/plan_link_test`,
      );
    });
  });
});
