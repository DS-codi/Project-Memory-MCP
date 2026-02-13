/**
 * Tests for DependencyGraph component and its computeWaves algorithm.
 * Covers: wave computation, flat grid for no-deps, wave rendering,
 * plan cards, and connector arrows.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

import { DependencyGraph } from '../../components/program/DependencyGraph';
import type { ProgramPlanRef } from '../../types';

// ─── Test helpers ────────────────────────────────────────────────────────────

const WS = 'ws_dep_test';

function renderInRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

function makePlan(overrides: Partial<ProgramPlanRef> = {}): ProgramPlanRef {
  return {
    plan_id: 'plan_default',
    title: 'Default Plan',
    status: 'active',
    priority: 'medium',
    current_phase: '',
    progress: { done: 0, total: 5 },
    depends_on_plans: [],
    ...overrides,
  };
}

// ─── computeWaves (tested indirectly via rendered output) ────────────────────

describe('DependencyGraph', () => {
  describe('empty state', () => {
    it('renders nothing when plans list is empty', () => {
      const { container } = renderInRouter(
        <DependencyGraph plans={[]} workspaceId={WS} />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('flat grid (no dependencies)', () => {
    it('shows "No inter-plan dependencies" message', () => {
      const plans = [
        makePlan({ plan_id: 'p1', title: 'Plan One' }),
        makePlan({ plan_id: 'p2', title: 'Plan Two' }),
      ];
      renderInRouter(<DependencyGraph plans={plans} workspaceId={WS} />);

      expect(
        screen.getByText(/No inter-plan dependencies/),
      ).toBeInTheDocument();
    });

    it('renders all plan titles in flat grid', () => {
      const plans = [
        makePlan({ plan_id: 'p1', title: 'Alpha Plan' }),
        makePlan({ plan_id: 'p2', title: 'Beta Plan' }),
        makePlan({ plan_id: 'p3', title: 'Gamma Plan' }),
      ];
      renderInRouter(<DependencyGraph plans={plans} workspaceId={WS} />);

      expect(screen.getByText('Alpha Plan')).toBeInTheDocument();
      expect(screen.getByText('Beta Plan')).toBeInTheDocument();
      expect(screen.getByText('Gamma Plan')).toBeInTheDocument();
    });

    it('displays plan progress in flat grid', () => {
      const plans = [
        makePlan({ plan_id: 'p1', title: 'Counted', progress: { done: 3, total: 7 } }),
      ];
      renderInRouter(<DependencyGraph plans={plans} workspaceId={WS} />);

      expect(screen.getByText('3/7 steps')).toBeInTheDocument();
    });

    it('shows plan status badges in flat grid', () => {
      const plans = [
        makePlan({ plan_id: 'p1', title: 'Active One', status: 'active' }),
        makePlan({ plan_id: 'p2', title: 'Done One', status: 'completed' }),
      ];
      renderInRouter(<DependencyGraph plans={plans} workspaceId={WS} />);

      expect(screen.getByText('active')).toBeInTheDocument();
      expect(screen.getByText('completed')).toBeInTheDocument();
    });
  });

  describe('wave-based rendering (with dependencies)', () => {
    it('renders wave headers when dependencies exist', () => {
      const plans = [
        makePlan({ plan_id: 'p1', title: 'Foundation', depends_on_plans: [] }),
        makePlan({ plan_id: 'p2', title: 'Feature', depends_on_plans: ['p1'] }),
      ];
      renderInRouter(<DependencyGraph plans={plans} workspaceId={WS} />);

      expect(screen.getByText('Wave 1')).toBeInTheDocument();
      expect(screen.getByText('Wave 2')).toBeInTheDocument();
    });

    it('renders "Plan Dependencies & Execution Waves" heading', () => {
      const plans = [
        makePlan({ plan_id: 'p1', title: 'A', depends_on_plans: [] }),
        makePlan({ plan_id: 'p2', title: 'B', depends_on_plans: ['p1'] }),
      ];
      renderInRouter(<DependencyGraph plans={plans} workspaceId={WS} />);

      expect(
        screen.getByText('Plan Dependencies & Execution Waves'),
      ).toBeInTheDocument();
    });

    it('places independent plans in wave 1', () => {
      const plans = [
        makePlan({ plan_id: 'p1', title: 'Standalone A', depends_on_plans: [] }),
        makePlan({ plan_id: 'p2', title: 'Standalone B', depends_on_plans: [] }),
        makePlan({ plan_id: 'p3', title: 'Depends On A', depends_on_plans: ['p1'] }),
      ];
      renderInRouter(<DependencyGraph plans={plans} workspaceId={WS} />);

      // Wave 1 label with "2 plans"
      expect(screen.getByText(/2 plans/)).toBeInTheDocument();
      expect(screen.getByText('Standalone A')).toBeInTheDocument();
      expect(screen.getByText('Standalone B')).toBeInTheDocument();
    });

    it('groups dependent plans into later waves', () => {
      const plans = [
        makePlan({ plan_id: 'p1', title: 'Base', depends_on_plans: [] }),
        makePlan({ plan_id: 'p2', title: 'Layer 1', depends_on_plans: ['p1'] }),
        makePlan({ plan_id: 'p3', title: 'Layer 2', depends_on_plans: ['p2'] }),
      ];
      renderInRouter(<DependencyGraph plans={plans} workspaceId={WS} />);

      expect(screen.getByText('Wave 1')).toBeInTheDocument();
      expect(screen.getByText('Wave 2')).toBeInTheDocument();
      expect(screen.getByText('Wave 3')).toBeInTheDocument();
      expect(screen.getByText('Base')).toBeInTheDocument();
      expect(screen.getByText('Layer 1')).toBeInTheDocument();
      expect(screen.getByText('Layer 2')).toBeInTheDocument();
    });

    it('shows dependency count on plan cards', () => {
      const plans = [
        makePlan({ plan_id: 'p1', title: 'Root' }),
        makePlan({ plan_id: 'p2', title: 'Child', depends_on_plans: ['p1'] }),
      ];
      renderInRouter(<DependencyGraph plans={plans} workspaceId={WS} />);

      expect(screen.getByText(/1 dep$/)).toBeInTheDocument();
    });

    it('pluralises dependency count correctly', () => {
      const plans = [
        makePlan({ plan_id: 'p1', title: 'Root A' }),
        makePlan({ plan_id: 'p2', title: 'Root B' }),
        makePlan({ plan_id: 'p3', title: 'Multi', depends_on_plans: ['p1', 'p2'] }),
      ];
      renderInRouter(<DependencyGraph plans={plans} workspaceId={WS} />);

      expect(screen.getByText(/2 deps$/)).toBeInTheDocument();
    });
  });

  describe('plan card links', () => {
    it('links plan cards to the plan detail page', () => {
      const plans = [
        makePlan({ plan_id: 'plan_link_dep', title: 'Linked Dep' }),
      ];
      renderInRouter(<DependencyGraph plans={plans} workspaceId={WS} />);

      const link = screen.getByText('Linked Dep').closest('a');
      expect(link).toHaveAttribute(
        'href',
        `/workspace/${WS}/plan/plan_link_dep`,
      );
    });
  });

  describe('percentage display', () => {
    it('calculates and displays percentage correctly', () => {
      const plans = [
        makePlan({ plan_id: 'p1', title: 'Half Done', progress: { done: 5, total: 10 } }),
      ];
      renderInRouter(<DependencyGraph plans={plans} workspaceId={WS} />);

      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('shows 0% when no steps exist', () => {
      const plans = [
        makePlan({ plan_id: 'p1', title: 'Empty', progress: { done: 0, total: 0 } }),
      ];
      renderInRouter(<DependencyGraph plans={plans} workspaceId={WS} />);

      expect(screen.getByText('0%')).toBeInTheDocument();
    });
  });
});
