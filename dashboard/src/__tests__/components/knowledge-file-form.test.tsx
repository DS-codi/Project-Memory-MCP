/**
 * Tests for KnowledgeFileForm — create/edit form for knowledge files.
 * Covers: slug auto-generation, validation, category selection, tags parsing, edit mode.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';

import { KnowledgeFileForm, type KnowledgeFile } from '../../components/workspace/KnowledgeFileForm';

// ─── Test utilities ──────────────────────────────────────────────────────────

const defaultProps = {
  onSave: vi.fn(),
  onCancel: vi.fn(),
  isSaving: false,
};

function renderForm(overrides: Partial<React.ComponentProps<typeof KnowledgeFileForm>> = {}) {
  return render(
    <KnowledgeFileForm {...defaultProps} {...overrides} />
  );
}

const makeExistingFile = (overrides: Partial<KnowledgeFile> = {}): KnowledgeFile => ({
  slug: 'existing-file',
  title: 'Existing File',
  category: 'schema',
  content: '# Existing Content',
  tags: ['db', 'api'],
  created_at: '2026-01-10T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('KnowledgeFileForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create mode (new file)', () => {
    it('renders "New Knowledge File" title', () => {
      renderForm();
      expect(screen.getByText('New Knowledge File')).toBeInTheDocument();
    });

    it('renders all form fields', () => {
      renderForm();
      expect(screen.getByLabelText('Title')).toBeInTheDocument();
      expect(screen.getByLabelText('Slug')).toBeInTheDocument();
      expect(screen.getByLabelText('Category')).toBeInTheDocument();
      expect(screen.getByLabelText('Content (Markdown)')).toBeInTheDocument();
      expect(screen.getByLabelText('Tags (comma-separated)')).toBeInTheDocument();
    });

    it('starts with empty fields', () => {
      renderForm();
      expect(screen.getByLabelText('Title')).toHaveValue('');
      expect(screen.getByLabelText('Slug')).toHaveValue('');
      expect(screen.getByLabelText('Content (Markdown)')).toHaveValue('');
      expect(screen.getByLabelText('Tags (comma-separated)')).toHaveValue('');
    });

    it('defaults category to "reference"', () => {
      renderForm();
      expect(screen.getByLabelText('Category')).toHaveValue('reference');
    });

    it('shows "Create" button text', () => {
      renderForm();
      expect(screen.getByText('Create')).toBeInTheDocument();
    });

    it('slug field is enabled in create mode', () => {
      renderForm();
      expect(screen.getByLabelText('Slug')).not.toBeDisabled();
    });
  });

  describe('slug auto-generation', () => {
    it('auto-generates slug from title in create mode', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText('Title'), 'My Database Schema');

      await waitFor(() => {
        expect(screen.getByLabelText('Slug')).toHaveValue('my-database-schema');
      });
    });

    it('converts special characters to hyphens', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText('Title'), 'API v2.0 (Beta)');

      await waitFor(() => {
        const slugInput = screen.getByLabelText('Slug') as HTMLInputElement;
        // Special chars become hyphens, leading/trailing hyphens stripped
        expect(slugInput.value).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/);
      });
    });

    it('lowercases the slug', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText('Title'), 'UPPERCASE TITLE');

      await waitFor(() => {
        expect(screen.getByLabelText('Slug')).toHaveValue('uppercase-title');
      });
    });

    it('truncates slug to 100 characters', async () => {
      const user = userEvent.setup();
      renderForm();

      const longTitle = 'a'.repeat(120);
      await user.type(screen.getByLabelText('Title'), longTitle);

      await waitFor(() => {
        const slugInput = screen.getByLabelText('Slug') as HTMLInputElement;
        expect(slugInput.value.length).toBeLessThanOrEqual(100);
      });
    });

    it('does NOT auto-generate slug in edit mode', async () => {
      const existing = makeExistingFile();
      const user = userEvent.setup();
      renderForm({ existingFile: existing });

      const titleInput = screen.getByLabelText('Title');
      await user.clear(titleInput);
      await user.type(titleInput, 'Completely Different Title');

      // Slug should remain the original
      expect(screen.getByLabelText('Slug')).toHaveValue('existing-file');
    });
  });

  describe('edit mode (existing file)', () => {
    it('renders "Edit Knowledge File" title', () => {
      renderForm({ existingFile: makeExistingFile() });
      expect(screen.getByText('Edit Knowledge File')).toBeInTheDocument();
    });

    it('pre-fills all fields from existing file', () => {
      const existing = makeExistingFile();
      renderForm({ existingFile: existing });

      expect(screen.getByLabelText('Title')).toHaveValue('Existing File');
      expect(screen.getByLabelText('Slug')).toHaveValue('existing-file');
      expect(screen.getByLabelText('Category')).toHaveValue('schema');
      expect(screen.getByLabelText('Content (Markdown)')).toHaveValue('# Existing Content');
      expect(screen.getByLabelText('Tags (comma-separated)')).toHaveValue('db, api');
    });

    it('disables slug field in edit mode', () => {
      renderForm({ existingFile: makeExistingFile() });
      expect(screen.getByLabelText('Slug')).toBeDisabled();
    });

    it('shows "Update" button text', () => {
      renderForm({ existingFile: makeExistingFile() });
      expect(screen.getByText('Update')).toBeInTheDocument();
    });
  });

  describe('category selection', () => {
    it('renders all 6 category options', () => {
      renderForm();
      const select = screen.getByLabelText('Category');
      const options = select.querySelectorAll('option');
      expect(options).toHaveLength(6);
    });

    it('includes correct category values', () => {
      renderForm();
      const select = screen.getByLabelText('Category');
      const values = Array.from(select.querySelectorAll('option')).map(o => o.value);
      expect(values).toContain('schema');
      expect(values).toContain('config');
      expect(values).toContain('convention');
      expect(values).toContain('limitation');
      expect(values).toContain('plan-summary');
      expect(values).toContain('reference');
    });

    it('allows changing category', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.selectOptions(screen.getByLabelText('Category'), 'schema');

      expect(screen.getByLabelText('Category')).toHaveValue('schema');
    });
  });

  describe('tags parsing', () => {
    it('parses comma-separated tags on submit', async () => {
      const onSave = vi.fn();
      const user = userEvent.setup();
      renderForm({ onSave });

      await user.type(screen.getByLabelText('Title'), 'Test');
      await user.type(screen.getByLabelText('Content (Markdown)'), 'content');
      await user.type(screen.getByLabelText('Tags (comma-separated)'), 'tag1, tag2, tag3');

      await user.click(screen.getByText('Create'));

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['tag1', 'tag2', 'tag3'],
        })
      );
    });

    it('trims whitespace from tags', async () => {
      const onSave = vi.fn();
      const user = userEvent.setup();
      renderForm({ onSave });

      await user.type(screen.getByLabelText('Title'), 'Test');
      await user.type(screen.getByLabelText('Content (Markdown)'), 'content');
      await user.type(screen.getByLabelText('Tags (comma-separated)'), '  spaced ,  also spaced  ');

      await user.click(screen.getByText('Create'));

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['spaced', 'also spaced'],
        })
      );
    });

    it('filters empty tags from comma-separated input', async () => {
      const onSave = vi.fn();
      const user = userEvent.setup();
      renderForm({ onSave });

      await user.type(screen.getByLabelText('Title'), 'Test');
      await user.type(screen.getByLabelText('Content (Markdown)'), 'content');
      await user.type(screen.getByLabelText('Tags (comma-separated)'), 'a,,b,,,c');

      await user.click(screen.getByText('Create'));

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['a', 'b', 'c'],
        })
      );
    });
  });

  describe('form submission', () => {
    it('calls onSave with correct payload on submit', async () => {
      const onSave = vi.fn();
      const user = userEvent.setup();
      renderForm({ onSave });

      await user.type(screen.getByLabelText('Title'), 'My Schema');
      await user.selectOptions(screen.getByLabelText('Category'), 'schema');
      await user.type(screen.getByLabelText('Content (Markdown)'), '# Schema doc');
      await user.type(screen.getByLabelText('Tags (comma-separated)'), 'db');

      await user.click(screen.getByText('Create'));

      expect(onSave).toHaveBeenCalledTimes(1);
      const payload = onSave.mock.calls[0][0];
      expect(payload.title).toBe('My Schema');
      expect(payload.category).toBe('schema');
      expect(payload.content).toBe('# Schema doc');
      expect(payload.tags).toEqual(['db']);
      // Slug is auto-generated from title
      expect(payload.slug).toBe('my-schema');
    });

    it('calls onCancel when Cancel button is clicked', async () => {
      const onCancel = vi.fn();
      const user = userEvent.setup();
      renderForm({ onCancel });

      const cancelButtons = screen.getAllByText('Cancel');
      await user.click(cancelButtons[cancelButtons.length - 1]);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when X button is clicked', async () => {
      const onCancel = vi.fn();
      const user = userEvent.setup();
      renderForm({ onCancel });

      // X button is in the form header
      const closeButtons = document.querySelectorAll('button[type="button"]');
      // First button[type=button] in the form is the X close button
      const xButton = Array.from(closeButtons).find(btn =>
        btn.querySelector('svg') && !btn.textContent?.includes('Cancel')
      );
      expect(xButton).toBeTruthy();
      await user.click(xButton!);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('submit button state', () => {
    it('disables submit when title is empty', () => {
      renderForm();
      const submitBtn = screen.getByText('Create').closest('button');
      expect(submitBtn).toBeDisabled();
    });

    it('disables submit when isSaving is true', async () => {
      const user = userEvent.setup();
      renderForm({ isSaving: true });

      await user.type(screen.getByLabelText('Title'), 'Test');
      await user.type(screen.getByLabelText('Content (Markdown)'), 'content');

      const submitBtn = screen.getByText('Saving...').closest('button');
      expect(submitBtn).toBeDisabled();
    });

    it('shows "Saving..." text when isSaving', () => {
      renderForm({ isSaving: true });
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });
  });
});
