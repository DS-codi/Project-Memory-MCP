import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../../test/test-utils';
import { PlanTemplatesPanel } from '../../components/plan/PlanTemplatesPanel';
import { CreatePlanForm } from '../../components/plan/CreatePlanForm';

describe('Plan template UI', () => {
  it('renders templates and calls onSelectTemplate', async () => {
    const onSelectTemplate = vi.fn();
    const user = userEvent.setup();

    render(<PlanTemplatesPanel onSelectTemplate={onSelectTemplate} />);

    await waitFor(() => {
      expect(screen.getByText('Feature')).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole('button', { name: /use template/i });
    await user.click(buttons[0]);

    expect(onSelectTemplate).toHaveBeenCalledWith('feature');
  });

  it('loads template options in the create plan form', async () => {
    const onSuccess = vi.fn();
    const onCancel = vi.fn();

    render(
      <CreatePlanForm
        workspaceId="ws_test_123"
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    );

    await waitFor(() => {
      const featureOptions = screen.getAllByRole('option', { name: /Feature/i });
      expect(featureOptions.length).toBeGreaterThanOrEqual(1);
    });
  });
});
