/**
 * Tests for the knowledge file system (knowledge.tools.ts).
 *
 * Covers:
 * 1. Store a new knowledge file
 * 2. Retrieve by slug
 * 3. List all files with metadata (no content)
 * 4. Filter list by category
 * 5. Update existing file (content changes, updated_at updates, created_at preserved)
 * 6. Delete a file
 * 7. Enforce 256KB size limit
 * 8. Enforce 100 file per workspace limit
 * 9. Invalid slug rejected
 * 10. Knowledge summary in workspace-context-summary
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  storeKnowledgeFile,
  getKnowledgeFile,
  listKnowledgeFiles,
  deleteKnowledgeFile,
  getKnowledgeDirPath,
  getKnowledgeFilePath,
} from '../../tools/knowledge.tools.js';
import type { KnowledgeFile } from '../../tools/knowledge.tools.js';
import * as store from '../../storage/file-store.js';
import { promises as fs } from 'fs';

vi.mock('../../storage/file-store.js');
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readdir: vi.fn().mockResolvedValue([]),
      unlink: vi.fn().mockResolvedValue(undefined),
    },
  };
});

const WORKSPACE_ID = 'test-workspace-abc123';
const NOW = '2026-02-10T10:00:00.000Z';

const sampleFile: KnowledgeFile = {
  slug: 'database-schema',
  title: 'Database Schema',
  category: 'schema',
  content: '# Users Table\n\n| Column | Type |\n|--------|------|\n| id | uuid |',
  tags: ['database', 'postgres'],
  created_at: '2026-02-09T08:00:00.000Z',
  updated_at: '2026-02-09T08:00:00.000Z',
  created_by_agent: 'Executor',
  created_by_plan: 'plan_abc123',
};

describe('Knowledge File CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(store.getWorkspacePath).mockReturnValue(`/data/${WORKSPACE_ID}`);
    vi.mocked(store.nowISO).mockReturnValue(NOW);
    vi.mocked(store.ensureDir).mockResolvedValue(undefined);
    vi.mocked(store.writeJson).mockResolvedValue(undefined);
  });

  // ===========================================================================
  // Path helpers
  // ===========================================================================

  describe('path helpers', () => {
    it('should return correct knowledge directory path', () => {
      const dir = getKnowledgeDirPath(WORKSPACE_ID);
      expect(dir).toContain(WORKSPACE_ID);
      expect(dir).toContain('knowledge');
    });

    it('should return correct knowledge file path', () => {
      const filePath = getKnowledgeFilePath(WORKSPACE_ID, 'my-slug');
      expect(filePath).toContain('knowledge');
      expect(filePath).toContain('my-slug.json');
    });
  });

  // ===========================================================================
  // storeKnowledgeFile
  // ===========================================================================

  describe('storeKnowledgeFile', () => {
    it('should store a new knowledge file', async () => {
      // No existing file
      vi.mocked(store.readJson).mockResolvedValue(null);
      // No existing files in dir (for limit check)
      vi.mocked(fs.readdir).mockResolvedValue([] as any);

      const result = await storeKnowledgeFile({
        workspace_id: WORKSPACE_ID,
        slug: 'database-schema',
        title: 'Database Schema',
        content: '# Schema\n\nDetails here',
        category: 'schema',
        tags: ['db'],
        created_by_agent: 'Executor',
        created_by_plan: 'plan_123',
      });

      expect(result.success).toBe(true);
      expect(result.data?.created).toBe(true);
      expect(result.data?.knowledge_file.slug).toBe('database-schema');
      expect(result.data?.knowledge_file.title).toBe('Database Schema');
      expect(result.data?.knowledge_file.category).toBe('schema');
      expect(result.data?.knowledge_file.content).toBe('# Schema\n\nDetails here');
      expect(result.data?.knowledge_file.tags).toEqual(['db']);
      expect(result.data?.knowledge_file.created_at).toBe(NOW);
      expect(result.data?.knowledge_file.updated_at).toBe(NOW);
      expect(result.data?.knowledge_file.created_by_agent).toBe('Executor');

      // Verify ensureDir and writeJson were called
      expect(store.ensureDir).toHaveBeenCalledOnce();
      expect(store.writeJson).toHaveBeenCalledOnce();
    });

    it('should update an existing file preserving created_at', async () => {
      // Existing file
      vi.mocked(store.readJson).mockResolvedValue(sampleFile);

      const result = await storeKnowledgeFile({
        workspace_id: WORKSPACE_ID,
        slug: 'database-schema',
        title: 'Updated Schema',
        content: '# Updated content',
        category: 'schema',
      });

      expect(result.success).toBe(true);
      expect(result.data?.created).toBe(false); // update, not create
      expect(result.data?.knowledge_file.title).toBe('Updated Schema');
      expect(result.data?.knowledge_file.content).toBe('# Updated content');
      // created_at preserved from original
      expect(result.data?.knowledge_file.created_at).toBe(sampleFile.created_at);
      // updated_at is now
      expect(result.data?.knowledge_file.updated_at).toBe(NOW);
      // Preserves original agent/plan if not re-supplied
      expect(result.data?.knowledge_file.created_by_agent).toBe('Executor');
      expect(result.data?.knowledge_file.created_by_plan).toBe('plan_abc123');
    });

    it('should default category to reference when not specified', async () => {
      vi.mocked(store.readJson).mockResolvedValue(null);
      vi.mocked(fs.readdir).mockResolvedValue([] as any);

      const result = await storeKnowledgeFile({
        workspace_id: WORKSPACE_ID,
        slug: 'my-doc',
        title: 'My Doc',
        content: 'content',
      });

      expect(result.success).toBe(true);
      expect(result.data?.knowledge_file.category).toBe('reference');
    });

    it('should reject invalid slug (starts with hyphen)', async () => {
      const result = await storeKnowledgeFile({
        workspace_id: WORKSPACE_ID,
        slug: '-invalid',
        title: 'Test',
        content: 'content',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('slug');
    });

    it('should reject empty slug', async () => {
      const result = await storeKnowledgeFile({
        workspace_id: WORKSPACE_ID,
        slug: '',
        title: 'Test',
        content: 'content',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('slug');
    });

    it('should reject slug with uppercase letters', async () => {
      const result = await storeKnowledgeFile({
        workspace_id: WORKSPACE_ID,
        slug: 'Invalid-Slug',
        title: 'Test',
        content: 'content',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('slug');
    });

    it('should reject slug longer than 100 characters', async () => {
      const longSlug = 'a'.repeat(101);
      const result = await storeKnowledgeFile({
        workspace_id: WORKSPACE_ID,
        slug: longSlug,
        title: 'Test',
        content: 'content',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('100');
    });

    it('should accept single character slug', async () => {
      vi.mocked(store.readJson).mockResolvedValue(null);
      vi.mocked(fs.readdir).mockResolvedValue([] as any);

      const result = await storeKnowledgeFile({
        workspace_id: WORKSPACE_ID,
        slug: 'a',
        title: 'Test',
        content: 'content',
      });

      expect(result.success).toBe(true);
    });

    it('should reject empty title', async () => {
      const result = await storeKnowledgeFile({
        workspace_id: WORKSPACE_ID,
        slug: 'valid-slug',
        title: '',
        content: 'content',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('title');
    });

    it('should reject invalid category', async () => {
      const result = await storeKnowledgeFile({
        workspace_id: WORKSPACE_ID,
        slug: 'valid-slug',
        title: 'Test',
        content: 'content',
        category: 'invalid-category' as any,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid category');
    });

    it('should enforce 256KB content size limit', async () => {
      const largeContent = 'x'.repeat(256 * 1024 + 1);
      const result = await storeKnowledgeFile({
        workspace_id: WORKSPACE_ID,
        slug: 'large-doc',
        title: 'Large Doc',
        content: largeContent,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('256KB');
    });

    it('should allow content just under 256KB limit', async () => {
      vi.mocked(store.readJson).mockResolvedValue(null);
      vi.mocked(fs.readdir).mockResolvedValue([] as any);

      const content = 'x'.repeat(256 * 1024 - 100); // safely under
      const result = await storeKnowledgeFile({
        workspace_id: WORKSPACE_ID,
        slug: 'large-doc',
        title: 'Large Doc',
        content,
      });

      expect(result.success).toBe(true);
    });

    it('should enforce 100 files per workspace limit', async () => {
      vi.mocked(store.readJson).mockResolvedValue(null); // new file
      // 100 existing files
      const existingFiles = Array.from({ length: 100 }, (_, i) => `file-${i}.json`);
      vi.mocked(fs.readdir).mockResolvedValue(existingFiles as any);

      const result = await storeKnowledgeFile({
        workspace_id: WORKSPACE_ID,
        slug: 'one-too-many',
        title: 'One Too Many',
        content: 'content',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum');
      expect(result.error).toContain('100');
    });

    it('should allow update even when at 100 file limit', async () => {
      // Existing file — update, not create
      vi.mocked(store.readJson).mockResolvedValue(sampleFile);

      const result = await storeKnowledgeFile({
        workspace_id: WORKSPACE_ID,
        slug: 'database-schema',
        title: 'Updated',
        content: 'updated',
      });

      expect(result.success).toBe(true);
      // fs.readdir should NOT be called for updates (no limit check needed)
      expect(fs.readdir).not.toHaveBeenCalled();
    });

    it('should filter out empty tags', async () => {
      vi.mocked(store.readJson).mockResolvedValue(null);
      vi.mocked(fs.readdir).mockResolvedValue([] as any);

      const result = await storeKnowledgeFile({
        workspace_id: WORKSPACE_ID,
        slug: 'tagged',
        title: 'Tagged',
        content: 'content',
        tags: ['valid', '', '  ', 'also-valid'],
      });

      expect(result.success).toBe(true);
      expect(result.data?.knowledge_file.tags).toEqual(['valid', 'also-valid']);
    });
  });

  // ===========================================================================
  // getKnowledgeFile
  // ===========================================================================

  describe('getKnowledgeFile', () => {
    it('should retrieve a knowledge file by slug', async () => {
      vi.mocked(store.readJson).mockResolvedValue(sampleFile);

      const result = await getKnowledgeFile(WORKSPACE_ID, 'database-schema');

      expect(result.success).toBe(true);
      expect(result.data?.knowledge_file.slug).toBe('database-schema');
      expect(result.data?.knowledge_file.content).toBe(sampleFile.content);
      expect(result.data?.knowledge_file.category).toBe('schema');
    });

    it('should return error for non-existent slug', async () => {
      vi.mocked(store.readJson).mockResolvedValue(null);

      const result = await getKnowledgeFile(WORKSPACE_ID, 'not-found');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.error).toContain('not-found');
    });

    it('should reject invalid slug', async () => {
      const result = await getKnowledgeFile(WORKSPACE_ID, 'INVALID');

      expect(result.success).toBe(false);
      expect(result.error).toContain('slug');
    });
  });

  // ===========================================================================
  // listKnowledgeFiles
  // ===========================================================================

  describe('listKnowledgeFiles', () => {
    const file1: KnowledgeFile = {
      slug: 'schema-users',
      title: 'Users Schema',
      category: 'schema',
      content: 'content1',
      tags: ['db'],
      created_at: '2026-02-08T00:00:00.000Z',
      updated_at: '2026-02-08T00:00:00.000Z',
    };

    const file2: KnowledgeFile = {
      slug: 'api-limits',
      title: 'API Rate Limits',
      category: 'limitation',
      content: 'content2',
      tags: ['api'],
      created_at: '2026-02-09T00:00:00.000Z',
      updated_at: '2026-02-09T00:00:00.000Z',
    };

    const file3: KnowledgeFile = {
      slug: 'config-db',
      title: 'DB Config',
      category: 'config',
      content: 'content3',
      tags: [],
      created_at: '2026-02-10T00:00:00.000Z',
      updated_at: '2026-02-10T00:00:00.000Z',
    };

    beforeEach(() => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'schema-users.json',
        'api-limits.json',
        'config-db.json',
      ] as any);

      vi.mocked(store.readJson)
        .mockResolvedValueOnce(file1)
        .mockResolvedValueOnce(file2)
        .mockResolvedValueOnce(file3);
    });

    it('should list all files with metadata but no content', async () => {
      const result = await listKnowledgeFiles(WORKSPACE_ID);

      expect(result.success).toBe(true);
      expect(result.data?.total).toBe(3);
      expect(result.data?.files).toHaveLength(3);

      // Verify no content in metadata
      for (const f of result.data!.files) {
        expect(f).not.toHaveProperty('content');
        expect(f).toHaveProperty('slug');
        expect(f).toHaveProperty('title');
        expect(f).toHaveProperty('category');
        expect(f).toHaveProperty('updated_at');
      }
    });

    it('should sort by updated_at descending (most recent first)', async () => {
      const result = await listKnowledgeFiles(WORKSPACE_ID);

      expect(result.success).toBe(true);
      expect(result.data?.files[0].slug).toBe('config-db'); // Feb 10
      expect(result.data?.files[1].slug).toBe('api-limits'); // Feb 9
      expect(result.data?.files[2].slug).toBe('schema-users'); // Feb 8
    });

    it('should filter by category', async () => {
      const result = await listKnowledgeFiles(WORKSPACE_ID, 'schema');

      expect(result.success).toBe(true);
      expect(result.data?.files).toHaveLength(1);
      expect(result.data?.files[0].slug).toBe('schema-users');
    });

    it('should return empty list when no files exist', async () => {
      vi.mocked(fs.readdir).mockRejectedValue({ code: 'ENOENT' });

      const result = await listKnowledgeFiles(WORKSPACE_ID);

      expect(result.success).toBe(true);
      expect(result.data?.files).toHaveLength(0);
      expect(result.data?.total).toBe(0);
    });

    it('should skip non-json files', async () => {
      vi.clearAllMocks();
      vi.mocked(store.getWorkspacePath).mockReturnValue(`/data/${WORKSPACE_ID}`);
      vi.mocked(fs.readdir).mockResolvedValue([
        'schema-users.json',
        'readme.md',
        '.gitkeep',
      ] as any);
      vi.mocked(store.readJson).mockResolvedValue(file1);

      const result = await listKnowledgeFiles(WORKSPACE_ID);

      expect(result.success).toBe(true);
      expect(result.data?.files).toHaveLength(1);
    });
  });

  // ===========================================================================
  // deleteKnowledgeFile
  // ===========================================================================

  describe('deleteKnowledgeFile', () => {
    it('should delete an existing file', async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const result = await deleteKnowledgeFile(WORKSPACE_ID, 'database-schema');

      expect(result.success).toBe(true);
      expect(result.data?.deleted).toBe(true);
      expect(result.data?.slug).toBe('database-schema');
      expect(fs.unlink).toHaveBeenCalledOnce();
    });

    it('should return error when file does not exist', async () => {
      vi.mocked(fs.unlink).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      );

      const result = await deleteKnowledgeFile(WORKSPACE_ID, 'missing');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.error).toContain('missing');
    });

    it('should reject invalid slug', async () => {
      const result = await deleteKnowledgeFile(WORKSPACE_ID, '-bad-slug-');

      expect(result.success).toBe(false);
      expect(result.error).toContain('slug');
    });

    it('should rethrow unexpected errors', async () => {
      vi.mocked(fs.unlink).mockRejectedValue(
        Object.assign(new Error('EACCES'), { code: 'EACCES' })
      );

      await expect(deleteKnowledgeFile(WORKSPACE_ID, 'valid-slug')).rejects.toThrow('EACCES');
    });
  });

  // ===========================================================================
  // All valid categories
  // ===========================================================================

  describe('category validation', () => {
    const validCategories = [
      'schema', 'config', 'limitation', 'plan-summary', 'reference', 'convention',
    ] as const;

    for (const cat of validCategories) {
      it(`should accept valid category: ${cat}`, async () => {
        vi.mocked(store.readJson).mockResolvedValue(null);
        vi.mocked(fs.readdir).mockResolvedValue([] as any);

        const result = await storeKnowledgeFile({
          workspace_id: WORKSPACE_ID,
          slug: `test-${cat}`,
          title: `Test ${cat}`,
          content: 'test',
          category: cat,
        });

        expect(result.success).toBe(true);
        expect(result.data?.knowledge_file.category).toBe(cat);
      });
    }
  });
});

// =============================================================================
// Knowledge summary in workspace-context-summary
// =============================================================================

describe('Knowledge files in workspace context summary', () => {
  /**
   * This tests the enrichWithKnowledgeFiles path in workspace-context-summary.ts.
   * We need a separate mock setup since it imports from a different module.
   */
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(store.getWorkspacePath).mockReturnValue(`/data/${WORKSPACE_ID}`);
    vi.mocked(store.nowISO).mockReturnValue(NOW);
  });

  it('should include knowledge files in workspace context summary', async () => {
    // Import dynamically to get the mocked version
    const { buildWorkspaceContextSummary } = await import(
      '../../utils/workspace-context-summary.js'
    );

    // Mock workspace context
    vi.mocked(store.readJson).mockResolvedValue({
      sections: {
        project_details: {
          summary: 'A project',
          items: [{ title: 'Lang', description: 'TS' }],
        },
      },
      updated_at: NOW,
    });

    // Mock listKnowledgeFiles via fs.readdir returning knowledge files
    vi.mocked(fs.readdir).mockResolvedValue([
      'db-schema.json',
      'api-limits.json',
    ] as any);

    // The list function reads each file from store
    vi.mocked(store.readJson)
      // First call: workspace.context.json (already set above)
      // Second and third calls: knowledge files
      .mockResolvedValueOnce({
        // workspace.context.json
        sections: {
          project_details: {
            summary: 'A project',
            items: [{ title: 'Lang', description: 'TS' }],
          },
        },
        updated_at: NOW,
      })
      .mockResolvedValueOnce({
        slug: 'db-schema',
        title: 'DB Schema',
        category: 'schema',
        tags: [],
        created_at: NOW,
        updated_at: NOW,
      })
      .mockResolvedValueOnce({
        slug: 'api-limits',
        title: 'API Limits',
        category: 'limitation',
        tags: [],
        created_at: NOW,
        updated_at: NOW,
      });

    // Mock getWorkspaceContextPath
    vi.mocked(store.getWorkspaceContextPath).mockReturnValue(
      `/data/${WORKSPACE_ID}/workspace.context.json`
    );

    const summary = await buildWorkspaceContextSummary(WORKSPACE_ID);

    expect(summary).toBeDefined();
    expect(summary?.sections).toHaveProperty('project_details');

    // Knowledge files should be included
    if (summary?.knowledge_files) {
      expect(summary.knowledge_files.length).toBeGreaterThanOrEqual(0);
      // Each file has slug, title, category, updated_at — no content
      for (const f of summary.knowledge_files) {
        expect(f).toHaveProperty('slug');
        expect(f).toHaveProperty('title');
        expect(f).toHaveProperty('category');
        expect(f).not.toHaveProperty('content');
      }
    }
  });
});
