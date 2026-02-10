/**
 * Tests for KnowledgeFilesPanel — main panel for managing workspace knowledge files.
 * Covers: list rendering, create/edit/delete flows, category badges, empty/loading/error states.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import React from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/mocks/server';

import { KnowledgeFilesPanel } from '../../components/workspace/KnowledgeFilesPanel';

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

const WORKSPACE_ID = 'ws_test_knowledge';

// ─── Mock data factories ─────────────────────────────────────────────────────

function makeMeta(overrides: Partial<{
  slug: string; title: string; category: string; tags: string[];
  created_at: string; updated_at: string;
}> = {}) {
  return {
    slug: overrides.slug ?? 'test-file',
    title: overrides.title ?? 'Test File',
    category: overrides.category ?? 'reference',
    tags: overrides.tags ?? ['tag1'],
    created_at: overrides.created_at ?? '2026-01-15T10:00:00Z',
    updated_at: overrides.updated_at ?? '2026-02-01T12:00:00Z',
    ...overrides,
  };
}

const makeFilesList = () => [
  makeMeta({ slug: 'db-schema', title: 'Database Schema', category: 'schema', tags: ['db', 'postgres'] }),
  makeMeta({ slug: 'api-limits', title: 'API Limits', category: 'limitation', tags: ['api'] }),
  makeMeta({ slug: 'coding-style', title: 'Coding Style', category: 'convention', tags: [] }),
];

const makeFullFile = (slug: string) => ({
  ...makeMeta({ slug, title: `File: ${slug}` }),
  content: `# Content for ${slug}\n\nSome markdown here.`,
});

// ─── MSW handler helpers ─────────────────────────────────────────────────────

function mockListEndpoint(files: ReturnType<typeof makeMeta>[] = [], status = 200) {
  server.use(
    http.get(`/api/workspaces/${WORKSPACE_ID}/knowledge`, () => {
      return HttpResponse.json({ files, total: files.length }, { status });
    })
  );
}

function mockGetEndpoint(slugToFile: Record<string, ReturnType<typeof makeFullFile>>) {
  server.use(
    http.get(`/api/workspaces/${WORKSPACE_ID}/knowledge/:slug`, ({ params }) => {
      const slug = params.slug as string;
      const file = slugToFile[slug];
      if (!file) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      return HttpResponse.json({ file });
    })
  );
}

function mockSaveEndpoint(shouldFail = false) {
  server.use(
    http.put(`/api/workspaces/${WORKSPACE_ID}/knowledge/:slug`, async ({ request, params }) => {
      if (shouldFail) {
        return HttpResponse.json({ error: 'Validation failed' }, { status: 400 });
      }
      const body = await request.json() as Record<string, unknown>;
      return HttpResponse.json({
        success: true,
        file: {
          slug: params.slug,
          ...body,
          created_at: '2026-02-10T00:00:00Z',
          updated_at: '2026-02-10T00:00:00Z',
        },
      });
    })
  );
}

function mockDeleteEndpoint(shouldFail = false) {
  server.use(
    http.delete(`/api/workspaces/${WORKSPACE_ID}/knowledge/:slug`, () => {
      if (shouldFail) {
        return HttpResponse.json({ error: 'Delete failed' }, { status: 500 });
      }
      return HttpResponse.json({ success: true });
    })
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('KnowledgeFilesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list rendering', () => {
    it('renders the "Knowledge Files" section title', async () => {
      mockListEndpoint([]);

      renderWithProviders(<KnowledgeFilesPanel workspaceId={WORKSPACE_ID} />);

      expect(screen.getByText('Knowledge Files')).toBeInTheDocument();
    });

    it('renders subtitle "Persistent knowledge base"', async () => {
      mockListEndpoint([]);

      renderWithProviders(<KnowledgeFilesPanel workspaceId={WORKSPACE_ID} />);

      expect(screen.getByText('Persistent knowledge base')).toBeInTheDocument();
    });

    it('renders all files in the list with titles', async () => {
      const files = makeFilesList();
      mockListEndpoint(files);

      renderWithProviders(<KnowledgeFilesPanel workspaceId={WORKSPACE_ID} />);
      fireEvent.click(screen.getByText('Knowledge Files'));

      await waitFor(() => {
        expect(screen.getByText('Database Schema')).toBeInTheDocument();
      });
      expect(screen.getByText('API Limits')).toBeInTheDocument();
      expect(screen.getByText('Coding Style')).toBeInTheDocument();
    });

    it('shows category badges on each file', async () => {
      const files = makeFilesList();
      mockListEndpoint(files);

      renderWithProviders(<KnowledgeFilesPanel workspaceId={WORKSPACE_ID} />);
      fireEvent.click(screen.getByText('Knowledge Files'));

      await waitFor(() => {
        expect(screen.getByText('schema')).toBeInTheDocument();
      });
      expect(screen.getByText('limitation')).toBeInTheDocument();
      expect(screen.getByText('convention')).toBeInTheDocument();
    });

    it('shows file count badge in header when files exist', async () => {
      const files = makeFilesList();
      mockListEndpoint(files);

      renderWithProviders(<KnowledgeFilesPanel workspaceId={WORKSPACE_ID} />);

      await waitFor(() => {
        expect(screen.getByText('3')).toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('shows empty state message when no files exist', async () => {
      mockListEndpoint([]);

      renderWithProviders(<KnowledgeFilesPanel workspaceId={WORKSPACE_ID} />);
      fireEvent.click(screen.getByText('Knowledge Files'));

      await waitFor(() => {
        expect(screen.getByText('No knowledge files yet')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Knowledge files store persistent context/)
      ).toBeInTheDocument();
    });

    it('does NOT show empty state when form is visible', async () => {
      mockListEndpoint([]);

      const user = userEvent.setup();
      renderWithProviders(<KnowledgeFilesPanel workspaceId={WORKSPACE_ID} />);
      fireEvent.click(screen.getByText('Knowledge Files'));

      await waitFor(() => {
        expect(screen.getByText('No knowledge files yet')).toBeInTheDocument();
      });

      // Click "New" button
      const newBtn = screen.getByText('New');
      await user.click(newBtn);

      expect(screen.queryByText('No knowledge files yet')).not.toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows loading spinner while fetching', () => {
      mockListEndpoint(makeFilesList());

      renderWithProviders(<KnowledgeFilesPanel workspaceId={WORKSPACE_ID} />);
      fireEvent.click(screen.getByText('Knowledge Files'));

      expect(screen.getByText('Loading knowledge files...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error message on fetch failure', async () => {
      server.use(
        http.get(`/api/workspaces/${WORKSPACE_ID}/knowledge`, () => {
          return HttpResponse.json({ error: 'Server error' }, { status: 500 });
        })
      );

      renderWithProviders(<KnowledgeFilesPanel workspaceId={WORKSPACE_ID} />);
      fireEvent.click(screen.getByText('Knowledge Files'));

      await waitFor(() => {
        expect(screen.getByText('Failed to load knowledge files')).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      server.use(
        http.get(`/api/workspaces/${WORKSPACE_ID}/knowledge`, () => {
          return HttpResponse.json({ error: 'Server error' }, { status: 500 });
        })
      );

      renderWithProviders(<KnowledgeFilesPanel workspaceId={WORKSPACE_ID} />);
      fireEvent.click(screen.getByText('Knowledge Files'));

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });
  });

  describe('create flow', () => {
    it('shows create form when "New" button is clicked', async () => {
      mockListEndpoint([]);

      const user = userEvent.setup();
      renderWithProviders(<KnowledgeFilesPanel workspaceId={WORKSPACE_ID} />);
      fireEvent.click(screen.getByText('Knowledge Files'));

      await waitFor(() => {
        expect(screen.getByText('No knowledge files yet')).toBeInTheDocument();
      });

      await user.click(screen.getByText('New'));

      expect(screen.getByText('New Knowledge File')).toBeInTheDocument();
    });

    it('hides form when cancel is clicked', async () => {
      mockListEndpoint([]);

      const user = userEvent.setup();
      renderWithProviders(<KnowledgeFilesPanel workspaceId={WORKSPACE_ID} />);
      fireEvent.click(screen.getByText('Knowledge Files'));

      await waitFor(() => {
        expect(screen.getByText('No knowledge files yet')).toBeInTheDocument();
      });

      await user.click(screen.getByText('New'));
      expect(screen.getByText('New Knowledge File')).toBeInTheDocument();

      // Click "Cancel" in the form
      const cancelButtons = screen.getAllByText('Cancel');
      await user.click(cancelButtons[cancelButtons.length - 1]);

      expect(screen.queryByText('New Knowledge File')).not.toBeInTheDocument();
    });
  });

  describe('save mutation error', () => {
    it('shows error banner when save fails', async () => {
      mockListEndpoint([]);
      mockSaveEndpoint(true);

      const user = userEvent.setup();
      renderWithProviders(<KnowledgeFilesPanel workspaceId={WORKSPACE_ID} />);
      fireEvent.click(screen.getByText('Knowledge Files'));

      await waitFor(() => {
        expect(screen.getByText('No knowledge files yet')).toBeInTheDocument();
      });

      await user.click(screen.getByText('New'));

      // Fill in required fields
      const titleInput = screen.getByLabelText('Title');
      await user.type(titleInput, 'Test Title');

      const contentInput = screen.getByLabelText('Content (Markdown)');
      await user.type(contentInput, 'Test content');

      // Submit
      await user.click(screen.getByText('Create'));

      await waitFor(() => {
        expect(screen.getByText('Validation failed')).toBeInTheDocument();
      });
    });

    it('dismisses error banner on Dismiss click', async () => {
      mockListEndpoint([]);
      mockSaveEndpoint(true);

      const user = userEvent.setup();
      renderWithProviders(<KnowledgeFilesPanel workspaceId={WORKSPACE_ID} />);
      fireEvent.click(screen.getByText('Knowledge Files'));

      await waitFor(() => {
        expect(screen.getByText('No knowledge files yet')).toBeInTheDocument();
      });

      await user.click(screen.getByText('New'));

      const titleInput = screen.getByLabelText('Title');
      await user.type(titleInput, 'Test Title');

      const contentInput = screen.getByLabelText('Content (Markdown)');
      await user.type(contentInput, 'Test content');

      await user.click(screen.getByText('Create'));

      await waitFor(() => {
        expect(screen.getByText('Validation failed')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Dismiss'));

      expect(screen.queryByText('Validation failed')).not.toBeInTheDocument();
    });
  });

  describe('delete mutation error', () => {
    it('shows error banner when delete fails', async () => {
      const files = [makeMeta({ slug: 'del-test', title: 'Delete Test' })];
      mockListEndpoint(files);
      mockGetEndpoint({ 'del-test': makeFullFile('del-test') });
      mockDeleteEndpoint(true);

      const user = userEvent.setup();
      renderWithProviders(<KnowledgeFilesPanel workspaceId={WORKSPACE_ID} />);
      fireEvent.click(screen.getByText('Knowledge Files'));

      await waitFor(() => {
        expect(screen.getByText('Delete Test')).toBeInTheDocument();
      });

      // Click trash icon (find the delete trigger via the Trash2 icon area)
      const trashIcons = document.querySelectorAll('[class*="hover:text-red-400"]');
      expect(trashIcons.length).toBeGreaterThan(0);
      await user.click(trashIcons[0] as HTMLElement);

      // Confirm
      await waitFor(() => {
        expect(screen.getByText(/Delete "Delete Test"\?/)).toBeInTheDocument();
      });

      const confirmDeleteBtn = screen.getAllByText('Delete').find(
        el => el.closest('button')?.className.includes('bg-red-600')
      );
      expect(confirmDeleteBtn).toBeTruthy();
      await user.click(confirmDeleteBtn!);

      await waitFor(() => {
        expect(screen.getByText('Failed to delete knowledge file')).toBeInTheDocument();
      });
    });
  });

  describe('refresh', () => {
    it('has a refresh button in the header', () => {
      mockListEndpoint([]);

      renderWithProviders(<KnowledgeFilesPanel workspaceId={WORKSPACE_ID} />);

      const refreshBtn = document.querySelector('[title="Refresh"]');
      expect(refreshBtn).toBeInTheDocument();
    });
  });
});
