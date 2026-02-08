import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../../test/test-utils';
import { SettingsModal } from '../../components/common/SettingsModal';

describe('SettingsModal', () => {
  it('loads instruction defaults from the API and filters path-specific entries', async () => {
    const user = userEvent.setup();

    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /defaults/i }));

    await waitFor(() => {
      expect(screen.getByText('General Guide')).toBeInTheDocument();
    });

    expect(screen.queryByText('Path Specific Guide')).not.toBeInTheDocument();
  });
});
