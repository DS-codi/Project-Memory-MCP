import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { DeployModal } from './DeployModal';

vi.mock('@/utils/deployDefaults', () => ({
  getDeployDefaults: () => null,
  setDeployDefaults: vi.fn(),
}));

describe('DeployModal archive metadata', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          agents: [{ id: 'executor', name: 'Executor', filename: 'executor.agent.md' }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prompts: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ instructions: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          agents: 1,
          prompts: 0,
          instructions: 0,
          archive: {
            archive_path: '/workspace/.archived_github/agents/2026-02-28T10-00-00-000Z',
            moved_files_count: 2,
            moved_files: ['executor.agent.md', 'sessions/reviewer.agent.md'],
            warnings: ['No existing .github/agents directory found; archive step skipped.'],
            conflicts: ['Archive folder already existed; used /workspace/.archived_github/agents/2026-02-28T10-00-00-000Z-1 instead.'],
          },
        }),
      } as Response);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows archive metadata in deploy success message', async () => {
    const user = userEvent.setup();

    render(
      <DeployModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceId="ws_test"
        workspacePath="/workspace"
      />,
    );

    const deployButton = await screen.findByRole('button', { name: 'Deploy Selected' });
    await user.click(deployButton);

    await waitFor(() => {
      expect(screen.getByText(/Deployed 1 agents, 0 prompts, 0 instructions/i)).toBeInTheDocument();
      expect(screen.getByText(/archived 2 existing agent file\(s\)/i)).toBeInTheDocument();
      expect(screen.getByText(/archive warnings:/i)).toBeInTheDocument();
      expect(screen.getByText(/archive conflicts:/i)).toBeInTheDocument();
    });
  });
});
