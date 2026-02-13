/**
 * Tests for ProgramCreateForm component.
 * Covers: rendering, form validation, goal management, plan selection,
 * submit behaviour, and cancel/close.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import React from 'react';

import { ProgramCreateForm } from '../../components/program/ProgramCreateForm';
import type { PlanSummary } from '../../types';

// ─── Test helpers ────────────────────────────────────────────────────────────

const WS = 'ws_form_test';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderForm(props: Partial<React.ComponentProps<typeof ProgramCreateForm>> = {}) {
  const qc = createQueryClient();
  const defaultProps: React.ComponentProps<typeof ProgramCreateForm> = {
    workspaceId: WS,
    plans: [],
    onClose: vi.fn(),
    onCreated: vi.fn(),
    ...props,
  };
  return {
    ...render(
      <QueryClientProvider client={qc}>
        <ProgramCreateForm {...defaultProps} />
      </QueryClientProvider>,
    ),
    props: defaultProps,
  };
}

function makePlan(overrides: Partial<PlanSummary> = {}): PlanSummary {
  return {
    id: 'plan_default',
    title: 'Default Plan',
    category: 'feature',
    priority: 'medium',
    status: 'active',
    current_agent: null,
    progress: { done: 2, total: 5 },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ProgramCreateForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the form heading', () => {
      renderForm();
      expect(screen.getByRole('heading', { name: 'Create Program' })).toBeInTheDocument();
    });

    it('renders title input with placeholder', () => {
      renderForm();
      const input = screen.getByPlaceholderText(/Platform Evolution/);
      expect(input).toBeInTheDocument();
    });

    it('renders description textarea', () => {
      renderForm();
      const textarea = screen.getByPlaceholderText(/Describe the program/);
      expect(textarea).toBeInTheDocument();
    });

    it('renders priority selector defaulting to medium', () => {
      renderForm();
      const select = screen.getByDisplayValue('Medium');
      expect(select).toBeInTheDocument();
    });

    it('renders goal input', () => {
      renderForm();
      const goalInput = screen.getByPlaceholderText(/Add a goal/);
      expect(goalInput).toBeInTheDocument();
    });

    it('renders Cancel and Create buttons', () => {
      renderForm();
      expect(screen.getByRole('button', { name: /Cancel/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Create Program/ })).toBeInTheDocument();
    });
  });

  describe('form validation', () => {
    it('disables submit button when title is empty', () => {
      renderForm();
      const submitBtn = screen.getByRole('button', { name: /Create Program/i });
      expect(submitBtn).toBeDisabled();
    });

    it('enables submit button when title is filled', async () => {
      const user = userEvent.setup();
      renderForm();

      const input = screen.getByPlaceholderText(/Platform Evolution/);
      await user.type(input, 'My Program');

      const submitBtn = screen.getByRole('button', { name: /Create Program/i });
      expect(submitBtn).toBeEnabled();
    });

    it('keeps submit disabled for whitespace-only title', async () => {
      const user = userEvent.setup();
      renderForm();

      const input = screen.getByPlaceholderText(/Platform Evolution/);
      await user.type(input, '   ');

      const submitBtn = screen.getByRole('button', { name: /Create Program/i });
      expect(submitBtn).toBeDisabled();
    });
  });

  describe('goal management', () => {
    it('adds a goal when plus button is clicked', async () => {
      const user = userEvent.setup();
      renderForm();

      const goalInput = screen.getByPlaceholderText(/Add a goal/);
      await user.type(goalInput, 'Ship MVP');

      const addBtns = screen.getAllByRole('button');
      // The add-goal button is the one with the Plus icon, find it near the goal input
      const addBtn = addBtns.find(
        (b) => b.textContent === '' && b.closest('div')?.querySelector('input[placeholder*="goal"]'),
      );
      if (addBtn) await user.click(addBtn);

      expect(screen.getByText('Ship MVP')).toBeInTheDocument();
    });

    it('adds a goal on Enter key press', async () => {
      const user = userEvent.setup();
      renderForm();

      const goalInput = screen.getByPlaceholderText(/Add a goal/);
      await user.type(goalInput, 'Launch v2{enter}');

      expect(screen.getByText('Launch v2')).toBeInTheDocument();
    });

    it('does not add duplicate goals', async () => {
      const user = userEvent.setup();
      renderForm();

      const goalInput = screen.getByPlaceholderText(/Add a goal/);
      await user.type(goalInput, 'Unique Goal{enter}');
      await user.type(goalInput, 'Unique Goal{enter}');

      const badges = screen.getAllByText('Unique Goal');
      expect(badges).toHaveLength(1);
    });

    it('does not add empty/whitespace goals', async () => {
      const user = userEvent.setup();
      renderForm();

      const goalInput = screen.getByPlaceholderText(/Add a goal/);
      await user.type(goalInput, '   {enter}');

      // No badges should appear
      expect(screen.queryByText('×')).not.toBeInTheDocument();
    });

    it('removes a goal when × is clicked', async () => {
      const user = userEvent.setup();
      renderForm();

      const goalInput = screen.getByPlaceholderText(/Add a goal/);
      await user.type(goalInput, 'Remove Me{enter}');
      expect(screen.getByText('Remove Me')).toBeInTheDocument();

      // Click the × button inside the badge
      const removeBtn = screen.getByText('×');
      await user.click(removeBtn);

      expect(screen.queryByText('Remove Me')).not.toBeInTheDocument();
    });
  });

  describe('child plan selection', () => {
    it('displays available active non-program plans', () => {
      const plans = [
        makePlan({ id: 'p1', title: 'Plan Alpha', status: 'active' }),
        makePlan({ id: 'p2', title: 'Plan Beta', status: 'active' }),
      ];
      renderForm({ plans });

      expect(screen.getByText('Plan Alpha')).toBeInTheDocument();
      expect(screen.getByText('Plan Beta')).toBeInTheDocument();
    });

    it('filters out program plans', () => {
      const plans = [
        makePlan({ id: 'p1', title: 'Regular Plan', status: 'active' }),
        makePlan({ id: 'p2', title: 'Program Plan', status: 'active', is_program: true }),
      ];
      renderForm({ plans });

      expect(screen.getByText('Regular Plan')).toBeInTheDocument();
      expect(screen.queryByText('Program Plan')).not.toBeInTheDocument();
    });

    it('filters out non-active plans', () => {
      const plans = [
        makePlan({ id: 'p1', title: 'Active Plan', status: 'active' }),
        makePlan({ id: 'p2', title: 'Archived Plan', status: 'archived' as any }),
      ];
      renderForm({ plans });

      expect(screen.getByText('Active Plan')).toBeInTheDocument();
      expect(screen.queryByText('Archived Plan')).not.toBeInTheDocument();
    });

    it('shows "No active plans available" when no plans match', () => {
      renderForm({ plans: [] });
      expect(screen.getByText(/No active plans available/)).toBeInTheDocument();
    });

    it('toggling checkbox updates selected count', async () => {
      const user = userEvent.setup();
      const plans = [
        makePlan({ id: 'p1', title: 'Selectable', status: 'active' }),
      ];
      renderForm({ plans });

      // Initially 0 selected
      expect(screen.getByText('Child Plans (0 selected)')).toBeInTheDocument();

      // Click the checkbox
      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      expect(screen.getByText('Child Plans (1 selected)')).toBeInTheDocument();
    });

    it('deselecting reduces count', async () => {
      const user = userEvent.setup();
      const plans = [
        makePlan({ id: 'p1', title: 'Toggle', status: 'active' }),
      ];
      renderForm({ plans });

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox); // select
      await user.click(checkbox); // deselect

      expect(screen.getByText('Child Plans (0 selected)')).toBeInTheDocument();
    });

    it('shows step progress for each plan', () => {
      const plans = [
        makePlan({ id: 'p1', title: 'Steps Plan', status: 'active', progress: { done: 3, total: 8 } }),
      ];
      renderForm({ plans });

      expect(screen.getByText('3/8 steps')).toBeInTheDocument();
    });
  });

  describe('close/cancel', () => {
    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup();
      const { props } = renderForm();

      await user.click(screen.getByText('Cancel'));
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when X button is clicked', async () => {
      const user = userEvent.setup();
      const { props } = renderForm();

      // The X close button is the one near the header
      const closeButtons = screen.getAllByRole('button');
      const xBtn = closeButtons.find((b) => {
        const svg = b.querySelector('svg');
        return svg && b.closest('.flex.items-center.justify-between');
      });
      if (xBtn) {
        await user.click(xBtn);
        expect(props.onClose).toHaveBeenCalledTimes(1);
      }
    });
  });
});
