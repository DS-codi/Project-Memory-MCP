import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { PlanList } from '../../components/plan/PlanList';
import type { PlanSummary } from '../../types';

function makePlan(overrides: Partial<PlanSummary> = {}): PlanSummary {
  return {
    id: 'plan_default',
    title: 'Default Plan',
    category: 'feature',
    priority: 'medium',
    status: 'active',
    current_agent: null,
    progress: { done: 0, total: 1 },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('PlanList sectioning and relationship rendering', () => {
  it('renders distinct Active Plans and Archived Plans sections', () => {
    const plans: PlanSummary[] = [
      makePlan({ id: 'archived_plan', title: 'Archived Plan', status: 'archived', updated_at: '2026-01-03T00:00:00.000Z' }),
      makePlan({ id: 'active_plan', title: 'Active Plan', status: 'active', updated_at: '2026-01-02T00:00:00.000Z' }),
    ];

    render(
      <MemoryRouter>
        <PlanList plans={plans} workspaceId="ws_1" />
      </MemoryRouter>,
    );

    const activeSection = screen.getByRole('region', { name: 'Active Plans' });
    const archivedSection = screen.getByRole('region', { name: 'Archived Plans' });

    expect(within(activeSection).getByText('Active Plan')).toBeInTheDocument();
    expect(within(archivedSection).getByText('Archived Plan')).toBeInTheDocument();
  });

  it('shows relationship labels and fallback text on plan cards', () => {
    const plans: PlanSummary[] = [
      makePlan({
        id: 'child_plan',
        title: 'Child Plan',
        program_id: 'program_12345678',
        relationships: {
          kind: 'child',
          parent_program_id: 'program_12345678',
          child_plan_ids: [],
          linked_plan_ids: ['linked_1'],
          dependent_plan_ids: ['dependent_1'],
          unresolved_linked_plan_ids: [],
          state: 'ready',
        },
      }),
      makePlan({
        id: 'standalone_plan',
        title: 'Standalone Plan',
        relationships: {
          kind: 'standalone',
          child_plan_ids: [],
          linked_plan_ids: [],
          dependent_plan_ids: [],
          unresolved_linked_plan_ids: [],
          state: 'none',
        },
      }),
    ];

    render(
      <MemoryRouter>
        <PlanList plans={plans} workspaceId="ws_1" />
      </MemoryRouter>,
    );

    expect(screen.getByText('Child of program')).toBeInTheDocument();
    expect(screen.getByText('Linked: 1')).toBeInTheDocument();
    expect(screen.getByText('Linked by: 1')).toBeInTheDocument();
    expect(screen.getByText('No relationships')).toBeInTheDocument();
  });
});
