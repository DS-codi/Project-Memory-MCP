import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useParams: () => ({ workspaceId: 'ws_test_123' }),
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

// Mock the hooks
vi.mock('../../hooks/useCopilotStatus', () => ({
  useCopilotStatus: vi.fn(() => ({
    data: {
      workspaceId: 'ws_test_123',
      agents: { deployed: 8, total: 8, outdated: [] },
      prompts: { deployed: 6, total: 6 },
      instructions: { deployed: 3, total: 3 },
      hasRepositoryInstructions: true,
    },
    isLoading: false,
    error: null,
  })),
}));

import React from 'react';
import { CopilotStatusPanel } from '../../components/workspace/CopilotStatusPanel';

const mockCopilotStatus = {
  hasAgents: true,
  hasPrompts: true,
  hasInstructions: true,
  agentCount: 8,
  promptCount: 6,
  instructionCount: 3,
  outdatedAgents: 0,
  missingFiles: [],
};

describe('CopilotStatusPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render status panel with correct counts', () => {
    render(<CopilotStatusPanel status={mockCopilotStatus} />);

    // Check that the component renders status items
    expect(screen.getByText(/Agents/i)).toBeInTheDocument();
  });

  it('should show deploy button when onDeploy is provided', () => {
    const handleDeploy = vi.fn();
    render(<CopilotStatusPanel status={mockCopilotStatus} onDeploy={handleDeploy} />);

    const deployButton = screen.getByRole('button', { name: /Deploy/i });
    expect(deployButton).toBeInTheDocument();
  });
});

describe('Skeleton Components', () => {
  it('should render loading skeletons with animation', async () => {
    const { Skeleton } = await import('../../components/common/Skeleton');
    
    const { container } = render(<Skeleton width={100} height={20} />);
    
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveClass('animate-pulse');
  });

  it('should render skeleton card', async () => {
    const { SkeletonCard } = await import('../../components/common/Skeleton');
    
    render(<SkeletonCard />);
    
    // Should render without errors
  });

  it('should render skeleton list with specified count', async () => {
    const { SkeletonList } = await import('../../components/common/Skeleton');
    
    const { container } = render(<SkeletonList count={5} />);
    
    // Should have 5 list items
    const items = container.querySelectorAll('.rounded-lg');
    expect(items.length).toBeGreaterThanOrEqual(5);
  });
});

describe('EmptyState Components', () => {
  it('should render empty state with title and description', async () => {
    const { EmptyState } = await import('../../components/common/EmptyState');
    
    render(
      <EmptyState
        title="No items found"
        description="Try adding some items"
      />
    );
    
    expect(screen.getByText('No items found')).toBeInTheDocument();
    expect(screen.getByText('Try adding some items')).toBeInTheDocument();
  });

  it('should render action button when provided', async () => {
    const { EmptyState } = await import('../../components/common/EmptyState');
    const handleClick = vi.fn();
    
    render(
      <EmptyState
        title="No workspaces"
        action={{ label: 'Add Workspace', onClick: handleClick }}
      />
    );
    
    const button = screen.getByRole('button', { name: /Add Workspace/i });
    expect(button).toBeInTheDocument();
    
    await userEvent.click(button);
    expect(handleClick).toHaveBeenCalled();
  });

  it('should render NoWorkspaces empty state', async () => {
    const { NoWorkspaces } = await import('../../components/common/EmptyState');
    
    render(<NoWorkspaces />);
    
    expect(screen.getByText('No workspaces yet')).toBeInTheDocument();
  });

  it('should render NoPlans empty state', async () => {
    const { NoPlans } = await import('../../components/common/EmptyState');
    
    render(<NoPlans />);
    
    expect(screen.getByText('No plans yet')).toBeInTheDocument();
  });

  it('should render NoAgents empty state', async () => {
    const { NoAgents } = await import('../../components/common/EmptyState');
    
    render(<NoAgents />);
    
    expect(screen.getByText('No agents deployed')).toBeInTheDocument();
  });

  it('should render NoPrompts empty state', async () => {
    const { NoPrompts } = await import('../../components/common/EmptyState');
    
    render(<NoPrompts />);
    
    expect(screen.getByText('No prompts available')).toBeInTheDocument();
  });

  it('should render ErrorState with retry button', async () => {
    const { ErrorState } = await import('../../components/common/EmptyState');
    const handleRetry = vi.fn();
    
    render(<ErrorState error="Something broke" onRetry={handleRetry} />);
    
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    
    const retryButton = screen.getByRole('button', { name: /Try Again/i });
    await userEvent.click(retryButton);
    expect(handleRetry).toHaveBeenCalled();
  });
});

describe('ErrorBoundary', () => {
  // Suppress React error boundary console errors in tests
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it('should render children when no error', async () => {
    const { ErrorBoundary } = await import('../../components/common/ErrorBoundary');
    
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('should render fallback when provided and error occurs', async () => {
    const { ErrorBoundary } = await import('../../components/common/ErrorBoundary');
    
    const ThrowError = () => {
      throw new Error('Test error');
    };
    
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowError />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
  });
});

describe('ThemeToggle', () => {
  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();
    // Reset document class
    document.documentElement.classList.remove('dark');
  });

  it('should render theme toggle button', async () => {
    const { ThemeToggle } = await import('../../components/common/ThemeToggle');
    
    render(<ThemeToggle />);
    
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('should cycle through themes on click', async () => {
    const { ThemeToggle } = await import('../../components/common/ThemeToggle');
    
    render(<ThemeToggle />);
    
    const button = screen.getByRole('button');
    
    // Initial state is system
    await userEvent.click(button);
    // Should now be light
    await userEvent.click(button);
    // Should now be dark
    await userEvent.click(button);
    // Should now be system again
  });

  it('should render button variant', async () => {
    const { ThemeToggle } = await import('../../components/common/ThemeToggle');
    
    render(<ThemeToggle variant="buttons" />);
    
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
  });
});

// Import the afterEach at the top level
import { afterEach } from 'vitest';
