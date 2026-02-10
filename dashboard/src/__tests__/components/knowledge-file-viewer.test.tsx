/**
 * Tests for KnowledgeFileViewer — expandable viewer with lazy content loading.
 * Covers: expand/collapse, lazy loading, category badges, delete confirmation, metadata display.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import React from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/mocks/server';

import { KnowledgeFileViewer } from '../../components/workspace/KnowledgeFileViewer';
import type { KnowledgeFileMeta, KnowledgeFile } from '../../components/workspace/KnowledgeFileForm';

// ─── Test utilities ──────────────────────────────────────────────────────────

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
};

const WORKSPACE_ID = 'ws_test_viewer';

// ─── Mock data ───────────────────────────────────────────────────────────────

const schemaMeta: KnowledgeFileMeta = {
  slug: 'db-schema',
  title: 'Database Schema',
  category: 'schema',
  tags: ['db', 'postgres'],
  created_at: '2026-01-10T00:00:00Z',
  updated_at: '2026-02-01T12:00:00Z',
};

const schemaFull: KnowledgeFile = {
  ...schemaMeta,
  content: '# Users Table\n\n| Column | Type |\n|--------|------|\n| id | uuid |',
};

const limitationMeta: KnowledgeFileMeta = {
  slug: 'api-limits',
  title: 'API Limits',
  category: 'limitation',
  tags: [],
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-02-05T08:00:00Z',
};

const limitationFull: KnowledgeFile = {
  ...limitationMeta,
  content: 'Rate limit: 100 req/min',
  created_by_agent: 'Researcher',
  created_by_plan: 'plan_abc123',
};

// ─── MSW handlers ────────────────────────────────────────────────────────────

function mockGetFile(slug: string, file: KnowledgeFile) {
  server.use(
    http.get(`/api/workspaces/${WORKSPACE_ID}/knowledge/${slug}`, () => {
      return HttpResponse.json({ file });
    })
  );
}

function mockGetFileError(slug: string) {
  server.use(
    http.get(`/api/workspaces/${WORKSPACE_ID}/knowledge/${slug}`, () => {
      return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    })
  );
}

const defaultProps = {
  workspaceId: WORKSPACE_ID,
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('KnowledgeFileViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('collapsed state', () => {
    it('renders file title', () => {
      mockGetFile('db-schema', schemaFull);

      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={schemaMeta} />
      );

      expect(screen.getByText('Database Schema')).toBeInTheDocument();
    });

    it('renders category badge', () => {
      mockGetFile('db-schema', schemaFull);

      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={schemaMeta} />
      );

      expect(screen.getByText('schema')).toBeInTheDocument();
    });

    it('does NOT fetch content when collapsed', () => {
      const fetchSpy = vi.fn();
      server.use(
        http.get(`/api/workspaces/${WORKSPACE_ID}/knowledge/db-schema`, () => {
          fetchSpy();
          return HttpResponse.json({ file: schemaFull });
        })
      );

      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={schemaMeta} />
      );

      // Content should NOT be fetched because the viewer starts collapsed
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does NOT show content area when collapsed', () => {
      mockGetFile('db-schema', schemaFull);

      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={schemaMeta} />
      );

      expect(screen.queryByText('# Users Table')).not.toBeInTheDocument();
    });
  });

  describe('expand/collapse', () => {
    it('expands to show content when clicked', async () => {
      mockGetFile('db-schema', schemaFull);

      const user = userEvent.setup();
      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={schemaMeta} />
      );

      // Click the header to expand
      await user.click(screen.getByText('Database Schema'));

      await waitFor(() => {
        expect(screen.getByText(/Users Table/)).toBeInTheDocument();
      });
    });

    it('shows loading spinner while fetching content', async () => {
      // Use a delayed handler
      server.use(
        http.get(`/api/workspaces/${WORKSPACE_ID}/knowledge/db-schema`, async () => {
          await new Promise(r => setTimeout(r, 100));
          return HttpResponse.json({ file: schemaFull });
        })
      );

      const user = userEvent.setup();
      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={schemaMeta} />
      );

      await user.click(screen.getByText('Database Schema'));

      // Should show loading
      expect(screen.getByText('Loading content...')).toBeInTheDocument();
    });

    it('collapses content when clicked again', async () => {
      mockGetFile('db-schema', schemaFull);

      const user = userEvent.setup();
      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={schemaMeta} />
      );

      // Expand
      await user.click(screen.getByText('Database Schema'));
      await waitFor(() => {
        expect(screen.getByText(/Users Table/)).toBeInTheDocument();
      });

      // Collapse
      await user.click(screen.getByText('Database Schema'));

      expect(screen.queryByText(/Users Table/)).not.toBeInTheDocument();
    });
  });

  describe('content display', () => {
    it('renders markdown content in <pre> block', async () => {
      mockGetFile('db-schema', schemaFull);

      const user = userEvent.setup();
      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={schemaMeta} />
      );

      await user.click(screen.getByText('Database Schema'));

      await waitFor(() => {
        const pre = document.querySelector('pre');
        expect(pre).toBeInTheDocument();
        expect(pre?.textContent).toContain('# Users Table');
      });
    });

    it('renders tags when file has tags', async () => {
      mockGetFile('db-schema', schemaFull);

      const user = userEvent.setup();
      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={schemaMeta} />
      );

      await user.click(screen.getByText('Database Schema'));

      await waitFor(() => {
        expect(screen.getByText('db')).toBeInTheDocument();
        expect(screen.getByText('postgres')).toBeInTheDocument();
      });
    });

    it('does NOT render tags section when file has empty tags', async () => {
      mockGetFile('api-limits', limitationFull);

      const user = userEvent.setup();
      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={limitationMeta} />
      );

      await user.click(screen.getByText('API Limits'));

      await waitFor(() => {
        expect(screen.getByText('Rate limit: 100 req/min')).toBeInTheDocument();
      });

      // No tags container should be rendered
      const tagElements = document.querySelectorAll('[class*="text-\\[10px\\]"]');
      // Only metadata items, not tags
      const tagTexts = Array.from(tagElements).map(el => el.textContent);
      expect(tagTexts).not.toContain('db');
    });

    it('shows metadata footer with created date', async () => {
      mockGetFile('db-schema', schemaFull);

      const user = userEvent.setup();
      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={schemaMeta} />
      );

      await user.click(screen.getByText('Database Schema'));

      await waitFor(() => {
        expect(screen.getByText(/Created:/)).toBeInTheDocument();
      });
    });

    it('shows created_by_agent when present', async () => {
      mockGetFile('api-limits', limitationFull);

      const user = userEvent.setup();
      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={limitationMeta} />
      );

      await user.click(screen.getByText('API Limits'));

      await waitFor(() => {
        expect(screen.getByText('By: Researcher')).toBeInTheDocument();
      });
    });

    it('shows created_by_plan when present', async () => {
      mockGetFile('api-limits', limitationFull);

      const user = userEvent.setup();
      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={limitationMeta} />
      );

      await user.click(screen.getByText('API Limits'));

      await waitFor(() => {
        expect(screen.getByText('Plan: plan_abc123')).toBeInTheDocument();
      });
    });
  });

  describe('category badge colors', () => {
    const categories: Array<{ category: string; colorClass: string }> = [
      { category: 'schema', colorClass: 'bg-blue-500/20' },
      { category: 'limitation', colorClass: 'bg-red-500/20' },
      { category: 'convention', colorClass: 'bg-emerald-500/20' },
      { category: 'config', colorClass: 'bg-amber-500/20' },
      { category: 'plan-summary', colorClass: 'bg-violet-500/20' },
      { category: 'reference', colorClass: 'bg-cyan-500/20' },
    ];

    categories.forEach(({ category }) => {
      it(`renders badge for "${category}" category`, () => {
        const meta: KnowledgeFileMeta = {
          ...schemaMeta,
          slug: `test-${category}`,
          category: category as KnowledgeFileMeta['category'],
        };

        renderWithProviders(
          <KnowledgeFileViewer {...defaultProps} file={meta} />
        );

        expect(screen.getByText(category)).toBeInTheDocument();
      });
    });
  });

  describe('delete confirmation', () => {
    it('shows confirmation prompt when trash icon is clicked', async () => {
      mockGetFile('db-schema', schemaFull);

      const user = userEvent.setup();
      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={schemaMeta} />
      );

      // Click trash icon
      const trashBtn = document.querySelector('[class*="hover:text-red-400"]');
      expect(trashBtn).toBeTruthy();
      await user.click(trashBtn!);

      expect(screen.getByText(/Delete "Database Schema"\?/)).toBeInTheDocument();
    });

    it('calls onDelete when delete is confirmed', async () => {
      const onDelete = vi.fn();
      mockGetFile('db-schema', schemaFull);

      const user = userEvent.setup();
      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={schemaMeta} onDelete={onDelete} />
      );

      // Click trash
      const trashBtn = document.querySelector('[class*="hover:text-red-400"]');
      await user.click(trashBtn!);

      // Confirm
      const confirmBtn = screen.getAllByText('Delete').find(
        el => el.closest('button')?.className.includes('bg-red-600')
      );
      await user.click(confirmBtn!);

      expect(onDelete).toHaveBeenCalledWith('db-schema');
    });

    it('hides confirmation prompt when Cancel is clicked', async () => {
      mockGetFile('db-schema', schemaFull);

      const user = userEvent.setup();
      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={schemaMeta} />
      );

      // Click trash
      const trashBtn = document.querySelector('[class*="hover:text-red-400"]');
      await user.click(trashBtn!);

      expect(screen.getByText(/Delete "Database Schema"\?/)).toBeInTheDocument();

      // Cancel
      await user.click(screen.getByText('Cancel'));

      expect(screen.queryByText(/Delete "Database Schema"\?/)).not.toBeInTheDocument();
    });
  });

  describe('edit action', () => {
    it('calls onEdit with full file when pencil icon is clicked and file is loaded', async () => {
      const onEdit = vi.fn();
      mockGetFile('db-schema', schemaFull);

      const user = userEvent.setup();
      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={schemaMeta} onEdit={onEdit} />
      );

      // Expand first to load content
      await user.click(screen.getByText('Database Schema'));
      await waitFor(() => {
        expect(screen.getByText(/Users Table/)).toBeInTheDocument();
      });

      // Click pencil icon
      const editBtn = document.querySelector('[class*="hover:text-violet-400"]');
      expect(editBtn).toBeTruthy();
      await user.click(editBtn!);

      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'db-schema',
          title: 'Database Schema',
          content: expect.stringContaining('Users Table'),
        })
      );
    });
  });

  describe('error handling', () => {
    it('shows error message when content fetch fails', async () => {
      mockGetFileError('db-schema');

      const user = userEvent.setup();
      renderWithProviders(
        <KnowledgeFileViewer {...defaultProps} file={schemaMeta} />
      );

      await user.click(screen.getByText('Database Schema'));

      await waitFor(() => {
        expect(screen.getByText('Failed to load content')).toBeInTheDocument();
      });
    });
  });
});
