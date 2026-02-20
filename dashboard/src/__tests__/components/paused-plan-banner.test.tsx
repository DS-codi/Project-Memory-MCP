/**
 * Tests for PausedPlanBanner — Phase 4 Hub Integration
 *
 * Covers: render states for all 3 reasons, reason icons, expandable details,
 *         resume button click, isResuming disabled state, user_notes display.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import { PausedPlanBanner } from '../../components/plan/PausedPlanBanner';
import type { PausedAtSnapshot } from '@/types';

// ── Mock formatters ────────────────────────────────────────────

vi.mock('@/utils/formatters', () => ({
  formatRelative: (d: string) => `relative(${d})`,
  formatDateTime: (d: string) => `datetime(${d})`,
}));

// ── Test data factories ────────────────────────────────────────

function makeSnapshot(overrides: Partial<PausedAtSnapshot> = {}): PausedAtSnapshot {
  return {
    paused_at: '2026-02-20T10:00:00Z',
    step_index: 2,
    phase: 'Phase 2: Implementation',
    step_task: 'Build auth module',
    reason: 'rejected',
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// =========================================================================
// Basic rendering
// =========================================================================

describe('PausedPlanBanner — basic rendering', () => {
  it('renders "Plan Paused" heading', () => {
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot()}
        onResume={() => {}}
      />,
    );

    expect(screen.getByText('Plan Paused')).toBeInTheDocument();
  });

  it('renders relative paused time', () => {
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot({ paused_at: '2026-02-19T08:00:00Z' })}
        onResume={() => {}}
      />,
    );

    expect(screen.getByText(/relative\(2026-02-19T08:00:00Z\)/)).toBeInTheDocument();
  });

  it('renders the step task', () => {
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot({ step_task: 'Deploy to staging' })}
        onResume={() => {}}
      />,
    );

    expect(screen.getByText('Deploy to staging')).toBeInTheDocument();
  });

  it('renders 1-based step number badge', () => {
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot({ step_index: 4 })}
        onResume={() => {}}
      />,
    );

    // step_index 4 → display #5
    expect(screen.getByText('#5')).toBeInTheDocument();
  });

  it('renders phase badge', () => {
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot({ phase: 'Phase 3: Testing' })}
        onResume={() => {}}
      />,
    );

    expect(screen.getByText('Phase 3: Testing')).toBeInTheDocument();
  });
});

// =========================================================================
// Reason icons and labels
// =========================================================================

describe('PausedPlanBanner — reason rendering', () => {
  it('shows "Rejected by user" for rejected reason', () => {
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot({ reason: 'rejected' })}
        onResume={() => {}}
      />,
    );

    expect(screen.getByText('Rejected by user')).toBeInTheDocument();
  });

  it('shows "Approval timed out" for timeout reason', () => {
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot({ reason: 'timeout' })}
        onResume={() => {}}
      />,
    );

    expect(screen.getByText('Approval timed out')).toBeInTheDocument();
  });

  it('shows "Deferred for later" for deferred reason', () => {
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot({ reason: 'deferred' })}
        onResume={() => {}}
      />,
    );

    expect(screen.getByText('Deferred for later')).toBeInTheDocument();
  });
});

// =========================================================================
// User notes
// =========================================================================

describe('PausedPlanBanner — user notes', () => {
  it('displays user_notes when present', () => {
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot({ user_notes: 'Needs security review first' })}
        onResume={() => {}}
      />,
    );

    expect(screen.getByText('Needs security review first')).toBeInTheDocument();
    expect(screen.getByText('User notes:')).toBeInTheDocument();
  });

  it('does not render user notes section when user_notes is absent', () => {
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot({ user_notes: undefined })}
        onResume={() => {}}
      />,
    );

    expect(screen.queryByText('User notes:')).not.toBeInTheDocument();
  });
});

// =========================================================================
// Expand / collapse details
// =========================================================================

describe('PausedPlanBanner — expandable details', () => {
  it('starts collapsed (details hidden)', () => {
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot({ session_id: 'sess_abc123' })}
        onResume={() => {}}
      />,
    );

    // Detail shows session_id — should not be visible initially
    expect(screen.queryByText(/sess_abc123/)).not.toBeInTheDocument();
    expect(screen.getByText(/Show details/)).toBeInTheDocument();
  });

  it('expands details on click', async () => {
    const user = userEvent.setup();
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot({ session_id: 'sess_detail_test' })}
        onResume={() => {}}
      />,
    );

    await user.click(screen.getByText(/Show details/));

    expect(screen.getByText(/sess_detail_test/)).toBeInTheDocument();
    expect(screen.getByText(/Hide details/)).toBeInTheDocument();
  });

  it('shows formatted datetime in expanded details', async () => {
    const user = userEvent.setup();
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot({ paused_at: '2026-02-20T14:30:00Z' })}
        onResume={() => {}}
      />,
    );

    await user.click(screen.getByText(/Show details/));

    expect(screen.getByText(/datetime\(2026-02-20T14:30:00Z\)/)).toBeInTheDocument();
  });

  it('collapses back on second click', async () => {
    const user = userEvent.setup();
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot({ session_id: 'sess_toggle' })}
        onResume={() => {}}
      />,
    );

    const toggle = screen.getByText(/Show details/);
    await user.click(toggle);
    expect(screen.getByText(/sess_toggle/)).toBeInTheDocument();

    await user.click(screen.getByText(/Hide details/));
    expect(screen.queryByText(/sess_toggle/)).not.toBeInTheDocument();
  });

  it('does not render session_id line when session_id is absent', async () => {
    const user = userEvent.setup();
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot({ session_id: undefined })}
        onResume={() => {}}
      />,
    );

    await user.click(screen.getByText(/Show details/));

    expect(screen.queryByText('Session:')).not.toBeInTheDocument();
  });
});

// =========================================================================
// Resume button
// =========================================================================

describe('PausedPlanBanner — resume button', () => {
  it('renders "Resume Plan" button', () => {
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot()}
        onResume={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: /Resume Plan/i })).toBeInTheDocument();
  });

  it('calls onResume when clicked', async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot()}
        onResume={onResume}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Resume Plan/i }));

    expect(onResume).toHaveBeenCalledOnce();
  });

  it('shows "Resuming..." and is disabled when isResuming is true', () => {
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot()}
        onResume={() => {}}
        isResuming={true}
      />,
    );

    const button = screen.getByRole('button', { name: /Resuming/i });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Resuming...');
  });

  it('is enabled when isResuming is false', () => {
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot()}
        onResume={() => {}}
        isResuming={false}
      />,
    );

    const button = screen.getByRole('button', { name: /Resume Plan/i });
    expect(button).not.toBeDisabled();
  });

  it('does not call onResume when disabled', async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    render(
      <PausedPlanBanner
        snapshot={makeSnapshot()}
        onResume={onResume}
        isResuming={true}
      />,
    );

    const button = screen.getByRole('button', { name: /Resuming/i });
    await user.click(button);

    expect(onResume).not.toHaveBeenCalled();
  });
});
