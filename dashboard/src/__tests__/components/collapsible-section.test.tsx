/**
 * Tests for CollapsibleSection — onToggle callback.
 * Covers: onToggle fires on open/close, value matches isOpen state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import { CollapsibleSection } from '../../components/common/CollapsibleSection';

describe('CollapsibleSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('basic rendering', () => {
    it('renders title', () => {
      render(
        <CollapsibleSection title="Test Section">
          <div>Content</div>
        </CollapsibleSection>
      );

      expect(screen.getByText('Test Section')).toBeInTheDocument();
    });

    it('renders subtitle', () => {
      render(
        <CollapsibleSection title="Section" subtitle="Sub text">
          <div>Content</div>
        </CollapsibleSection>
      );

      expect(screen.getByText('Sub text')).toBeInTheDocument();
    });

    it('renders badge', () => {
      render(
        <CollapsibleSection title="Section" badge={<span>5</span>}>
          <div>Content</div>
        </CollapsibleSection>
      );

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('renders actions', () => {
      render(
        <CollapsibleSection title="Section" actions={<button>Action</button>}>
          <div>Content</div>
        </CollapsibleSection>
      );

      expect(screen.getByText('Action')).toBeInTheDocument();
    });

    it('children are hidden by default', () => {
      render(
        <CollapsibleSection title="Section">
          <div>Hidden content</div>
        </CollapsibleSection>
      );

      expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
    });

    it('children are visible when defaultOpen is true', () => {
      render(
        <CollapsibleSection title="Section" defaultOpen>
          <div>Visible content</div>
        </CollapsibleSection>
      );

      expect(screen.getByText('Visible content')).toBeInTheDocument();
    });
  });

  describe('expand/collapse', () => {
    it('shows children when header is clicked', async () => {
      const user = userEvent.setup();
      render(
        <CollapsibleSection title="Toggle Section">
          <div>Inner content</div>
        </CollapsibleSection>
      );

      expect(screen.queryByText('Inner content')).not.toBeInTheDocument();

      await user.click(screen.getByText('Toggle Section'));

      expect(screen.getByText('Inner content')).toBeInTheDocument();
    });

    it('hides children when header is clicked again', async () => {
      const user = userEvent.setup();
      render(
        <CollapsibleSection title="Toggle Section" defaultOpen>
          <div>Inner content</div>
        </CollapsibleSection>
      );

      expect(screen.getByText('Inner content')).toBeInTheDocument();

      await user.click(screen.getByText('Toggle Section'));

      expect(screen.queryByText('Inner content')).not.toBeInTheDocument();
    });
  });

  describe('onToggle callback', () => {
    it('calls onToggle with true when section is opened', async () => {
      const onToggle = vi.fn();
      const user = userEvent.setup();

      render(
        <CollapsibleSection title="Section" onToggle={onToggle}>
          <div>Content</div>
        </CollapsibleSection>
      );

      await user.click(screen.getByText('Section'));

      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onToggle).toHaveBeenCalledWith(true);
    });

    it('calls onToggle with false when section is closed', async () => {
      const onToggle = vi.fn();
      const user = userEvent.setup();

      render(
        <CollapsibleSection title="Section" defaultOpen onToggle={onToggle}>
          <div>Content</div>
        </CollapsibleSection>
      );

      await user.click(screen.getByText('Section'));

      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onToggle).toHaveBeenCalledWith(false);
    });

    it('calls onToggle on each toggle (open → close → open)', async () => {
      const onToggle = vi.fn();
      const user = userEvent.setup();

      render(
        <CollapsibleSection title="Section" onToggle={onToggle}>
          <div>Content</div>
        </CollapsibleSection>
      );

      // Open
      await user.click(screen.getByText('Section'));
      expect(onToggle).toHaveBeenLastCalledWith(true);

      // Close
      await user.click(screen.getByText('Section'));
      expect(onToggle).toHaveBeenLastCalledWith(false);

      // Open again
      await user.click(screen.getByText('Section'));
      expect(onToggle).toHaveBeenLastCalledWith(true);

      expect(onToggle).toHaveBeenCalledTimes(3);
    });

    it('works correctly without onToggle callback (no crash)', async () => {
      const user = userEvent.setup();

      render(
        <CollapsibleSection title="Section">
          <div>Content</div>
        </CollapsibleSection>
      );

      // Should not throw
      await user.click(screen.getByText('Section'));
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });
});
